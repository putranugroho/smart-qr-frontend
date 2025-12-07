import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Image from 'next/image'
import styles from '../styles/Checkout.module.css'
import AddPopup from './AddPopup'
import { getCart, updateCart, removeFromCartByIndex, savePayment } from '../lib/cart'
import { getUser } from '../lib/auth'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

/**
 * Helpers to compute totals for mixed cart:
 * - menu items (legacy shape)
 * - combo items (type === 'combo') with combos[].products[].condiments[]
 */
function calcCartTotals(cart) {
  let subtotal = 0
  let taxPB1 = 0
  let taxPPN = 0

  if (!Array.isArray(cart)) return { subtotal: 0, taxPB1: 0, taxPPN: 0, total: 0 }

  cart.forEach(it => {
    // menu item (legacy)
    if (!it || it.type !== 'combo') {
      const price = Number(it.price || 0)
      const qty = Number(it.qty || 0) || 0
      const line = price * qty
      subtotal += line

      // if item has taxes array (preferred)
      if (Array.isArray(it.taxes) && it.taxes.length) {
        it.taxes.forEach(t => {
          const pct = Number(t.amount ?? t.taxPercentage ?? 0)
          const amount = Math.round((price * qty) * (pct / 100))
          if ((String(t.code || t.taxName || '').toUpperCase()).includes('PB') || String(t.name || t.taxName || '').toUpperCase().includes('PB1')) {
            taxPB1 += amount
          } else if ((String(t.code || t.taxName || '').toUpperCase()).includes('PPN') || String(t.name || t.taxName || '').toUpperCase().includes('PPN')) {
            taxPPN += amount
          }
        })
      } else {
        // fallback to legacy pb1Percent / ppnPercent
        const pb1Pct = Number(it.pb1Percent ?? it.taxPercent ?? 0)
        const ppnPct = Number(it.ppnPercent ?? 0)
        if (pb1Pct > 0) taxPB1 += Math.round((price * qty) * (pb1Pct / 100))
        if (ppnPct > 0) taxPPN += Math.round((price * qty) * (ppnPct / 100))
      }

      return
    }

    // combo item
    // The cart item might include multiple combos in item.combos
    const itemQty = Number(it.qty || 1) || 1

    if (!Array.isArray(it.combos) || it.combos.length === 0) return

    // For each combo block inside this cart item
    it.combos.forEach(comboBlock => {
      const comboQty = Number(comboBlock.qty || 1) || 1
      // sum all product lines inside comboBlock
      if (!Array.isArray(comboBlock.products)) return

      comboBlock.products.forEach(prod => {
        const prodQty = Number(prod.qty || 1) || 1
        const basePrice = Number(prod.price || 0)
        // condiments may exist
        let condTotal = 0
        if (Array.isArray(prod.condiments)) {
          prod.condiments.forEach(c => {
            const cQty = Number(c.qty || 1) || 1
            condTotal += Number(c.price || 0) * cQty
          })
        }

        const lineUnit = basePrice + condTotal
        const lineTotal = lineUnit * prodQty * comboQty * itemQty
        subtotal += lineTotal

        // taxes: prefer taxes[] on prod (which may already include taxAmount)
        if (Array.isArray(prod.taxes) && prod.taxes.length) {
          prod.taxes.forEach(t => {
            // t may already contain taxAmount (precomputed) or taxPercentage
            const taxAmtPerUnit = Number(t.taxAmount ?? 0)
            const taxPct = Number(t.taxPercentage ?? t.amount ?? 0)
            if (taxAmtPerUnit > 0) {
              // assume taxAmount is per (price * qty) or per unit? In sample it looked like per product unit.
              const amt = taxAmtPerUnit * prodQty * comboQty * itemQty
              if ((String(t.taxName || t.name || '').toUpperCase()).includes('PB1')) taxPB1 += amt
              else if ((String(t.taxName || t.name || '').toUpperCase()).includes('PPN')) taxPPN += amt
            } else if (taxPct > 0) {
              const amt = Math.round((basePrice * prodQty * comboQty * itemQty) * (taxPct / 100))
              if ((String(t.taxName || t.name || '').toUpperCase()).includes('PB1')) taxPB1 += amt
              else if ((String(t.taxName || t.name || '').toUpperCase()).includes('PPN')) taxPPN += amt
            }
          })
        } else {
          // If no prod.taxes, try to inspect condiment taxes too
          if (Array.isArray(prod.condiments) && prod.condiments.length) {
            prod.condiments.forEach(c => {
              if (Array.isArray(c.taxes) && c.taxes.length) {
                c.taxes.forEach(t => {
                  const taxAmtPerUnit = Number(t.taxAmount ?? 0)
                  const taxPct = Number(t.taxPercentage ?? t.amount ?? 0)
                  if (taxAmtPerUnit > 0) {
                    const amt = taxAmtPerUnit * (Number(c.qty || 1) || 1) * comboQty * itemQty
                    if ((String(t.taxName || t.name || '').toUpperCase()).includes('PB1')) taxPB1 += amt
                    else if ((String(t.taxName || t.name || '').toUpperCase()).includes('PPN')) taxPPN += amt
                  } else if (taxPct > 0) {
                    const amt = Math.round((Number(c.price || 0) * (Number(c.qty || 1) || 1) * comboQty * itemQty) * (taxPct / 100))
                    if ((String(t.taxName || t.name || '').toUpperCase()).includes('PB1')) taxPB1 += amt
                    else if ((String(t.taxName || t.name || '').toUpperCase()).includes('PPN')) taxPPN += amt
                  }
                })
              }
            })
          }
        }
      })
    })
  })

  const total = subtotal + taxPB1 + taxPPN
  return { subtotal, taxPB1, taxPPN, total }
}

export default function CheckoutPage() {
  const router = useRouter()

  // cart state (loaded from storage on client)
  const [cart, setCart] = useState([])
  const [cartLoaded, setCartLoaded] = useState(false)

  // totals state (initialize 0 so SSR and initial client render match)
  const [subtotal, setSubtotal] = useState(0)
  const [taxPB1, setTaxPB1] = useState(0)
  const [taxPPN, setTaxPPN] = useState(0)
  const [total, setTotal] = useState(0)
  const [roundedTotal, setRoundedTotal] = useState(0)
  const [rounding, setRounding] = useState(0)
  const [user, setUser] = useState('')
  const [table, setTable] = useState('')

  // popup state
  const [showAddPopup, setShowAddPopup] = useState(false)
  const addBtnRef = useRef(null)
  const popupTimerRef = useRef(null)

  // delete confirmation modal state
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(null)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  // load cart from storage on client only
  useEffect(() => {
    const c = getCart() || []
    console.log("cart :", c);

    const dataUser = getUser?.() || null;
    setUser(dataUser)

    if (dataUser.orderType == "DI") {
      setTable(`Table ${dataUser.tableNumber} • Dine In`)
    } else {
      setTable(`Table ${dataUser.tableNumber} • Take Away`)
    } 
    
    setCart(c)
    setCartLoaded(true)
  }, [])

  // compute totals whenever `cart` changes (client only)
  useEffect(() => {
    const t = calcCartTotals(cart)
    setSubtotal(t.subtotal)
    setTaxPB1(t.taxPB1)
    setTaxPPN(t.taxPPN)
    setTotal(t.total)

    // === Rounding rule ===
    // Jika subtotal < 20 ATAU total < 20 → tidak ada rounding
    if (t.subtotal < 20 || t.total < 20) {
      setRoundedTotal(t.total)
      setRounding(0)
    } else {
      // normal rounding ke kelipatan 100
      const rTotal = Math.round(t.total / 100) * 100
      setRoundedTotal(rTotal)
      setRounding(rTotal - t.total)
    }
  }, [cart])

  // qty update
  function handleQty(index, type) {
    const item = cart[index]
    if (!item) return

    let newQty = item.qty
    if (type === 'minus') newQty = Math.max(1, item.qty - 1)
    else if (type === 'plus') newQty = item.qty + 1

    const updated = updateCart(index, { qty: newQty })
    setCart([...updated])
  }

  function confirmPayment(totalAmt) {
    try {
      // simpan versi sessionStorage (tetap boleh)
      sessionStorage.setItem("yoshi_cart_payment", JSON.stringify(cart));
      sessionStorage.setItem("yoshi_cart_total", totalAmt);

      // versi baru — simpan ke localStorage (payment session)

      savePayment(cart, totalAmt, {
        storeCode: user.storeCode || "",
        orderType: user.orderType || "",
        tableNumber: user.tableNumber || ""
      });

    } catch (e) {
      console.error("Gagal set session cart", e);
    }

    router.push("/payment");
  }

  // open delete confirmation modal (instead of immediate delete)
  function handleDeleteRequest(index) {
    setConfirmDeleteIndex(index)
    setShowConfirmDelete(true)
  }

  // actual delete after user confirms
  function handleConfirmDelete() {
    if (confirmDeleteIndex == null) {
      setShowConfirmDelete(false)
      setConfirmDeleteIndex(null)
      return
    }
    const updated = removeFromCartByIndex(confirmDeleteIndex)
    setCart([...updated])
    setShowConfirmDelete(false)
    setConfirmDeleteIndex(null)
  }

  function handleCancelDelete() {
    setShowConfirmDelete(false)
    setConfirmDeleteIndex(null)
  }

  // build signature helper (for menu items; combos can use product codes joined)
  function signatureForItem(it) {
    try {
      const product = String(it.productCode ?? it.id ?? '')
      const addons = JSON.stringify(it.addons ?? [])
      const note = String(it.note ?? '')
      return [product, addons, note].join('|')
    } catch (e) {
      return String(it.productCode ?? it.id ?? '')
    }
  }

  // navigate to edit
  function handleEdit(index) {
    const it = cart[index]
    if (!it) return
    // For combo items, open combo edit flow (we used 'from=checkout' convention earlier)
    if (it.type === 'combo') {
      // put edit indicator in session (index & signature)
      try {
        sessionStorage.setItem('yoshi_edit', JSON.stringify({ index, signature: `combo|${index}` }))
      } catch (e) { /* ignore */ }
      // route to combo-detail with from=checkout & index
      router.push(`/combo-detail?from=checkout&index=${index}`)
      return
    }

    const productCode = encodeURIComponent(String(it.productCode ?? it.id ?? ''))
    const sig = signatureForItem(it)
    try {
      sessionStorage.setItem('yoshi_edit', JSON.stringify({ index, signature: sig }))
    } catch (e) {
      console.warn('sessionStorage write failed', e)
    }
    const qs = new URLSearchParams({
      index: String(index),
      sig: sig,
      from: 'checkout'
    }).toString()
    router.push(`/item/${productCode}?${qs}`)
  }

  // Render addons: always show the addon area for menu items.
  // Accept various shapes: array of { name } or array of strings or array of { code, name }.
  function renderAddons(addons) {
    // If addons not an array or empty -> show explicit "Tidak ada add-on"
    if (!Array.isArray(addons) || addons.length === 0) {
      return (
        <div>
          <div className={styles.addonGroup}>Add on :</div>
          <div className={styles.addonLine} style={{ color: '#666', fontStyle: 'italic' }}>Tidak ada add-on</div>
        </div>
      )
    }

     // ambil map code -> name dari menus[].condiments
    const condimentMap = {}
    if (Array.isArray(item?.menus)) {
      item.menus.forEach(m => {
        if (Array.isArray(m.condiments)) {
          m.condiments.forEach(c => {
            if (c.code) condimentMap[c.code] = c.name || c.code
          })
        }
      })
    }

      const lines = []
    (addons || []).forEach(a => {
      if (!a) return
      if (typeof a === 'object') {
        if (a.code && condimentMap[a.code]) {
          lines.push(condimentMap[a.code])
        } else if (a.name) {
          lines.push(a.name)
        } else if (a.code) {
          lines.push(String(a.code))
        }
      } else if (typeof a === 'string' || typeof a === 'number') {
        lines.push(String(a))
      }
    })

    if (lines.length === 0) {
      return (
        <div>
          <div className={styles.addonGroup}>Add on :</div>
          <div className={styles.addonLine} style={{ color: '#666', fontStyle: 'italic' }}>Tidak ada add-on</div>
        </div>
      )
    }

    return (
      <div>
        <div className={styles.addonGroup}>Add on :</div>
        {lines.map((n, idx) => <div key={idx} className={styles.addonLine}>- {n}</div>)}
      </div>
    )
  }

  // render combo products inside one cart item
  function renderComboDetails(item) {
    return (
      <div style={{ marginTop: 8 }}>
        {item.combos.map((cb, cbIdx) => (
          <div key={cbIdx} style={{ marginBottom: 8 }}>
            {/* each product inside combo */}
            {Array.isArray(cb.products) && cb.products.length > 0 ? cb.products.map((p, pi) => (
              <div key={`${p.code}-${pi}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #eee' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ marginTop: 4 }}>
                      {p.condiments.map((c, ci) => (
                        <div key={ci} className={styles.addonLine}>- {c.name}{c.qty && c.qty > 1 ? ` x${c.qty}` : ''}</div>
                      ))}
                    </div>
                </div>

                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: 12, color: '#666' }}>x{p.qty ?? 1}</div>
                </div>
              </div>
            )) : (
              <div className={styles.addonLine} style={{ color: '#666', fontStyle: 'italic' }}>Tidak ada produk pada combo</div>
            )}
          </div>
        ))}
      </div>
    )
  }

  // Show "Tambah" popup anchored to button
  function handleShowTambahPopup() {
    setShowAddPopup(true)
  }

  function closeAddPopup() {
    setShowAddPopup(false)
  }

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/menu')}>←</button>
        <div className={styles.headerTitle}>Order</div>
      </header>

      {/* ORDER INFO BAR */}
      <div className={styles.orderInfo}>
        <div className={styles.orderInfoText}>Tipe Order</div>
        <div className={styles.orderInfoRight}>
          <Image
            src="/images/bell-icon.png"
            alt="Bell"
            width={19}
            height={19}
            style={{ paddingRight: 5 }}
          />
          {table}
        </div>
      </div>

      {/* ORDERED ITEMS TITLE */}
      <div className={styles.sectionTitleWrap}>
        <div className={styles.sectionTitle}>Ordered items ({cart.length})</div>
        <button
          ref={addBtnRef}
          className={styles.addMoreBtn}
          onClick={handleShowTambahPopup}
          aria-haspopup="true"
          aria-expanded={showAddPopup}
        >
          Tambah
        </button>
      </div>

      {/* ITEMS LIST */}
      <div className={styles.itemsList}>
        {cart.length === 0 && <div style={{ padding: 20 }}>Keranjang kosong</div>}

        {cart.map((it, i) => {
          // compute line price display
          let linePrice = 0
          if (it && it.type === 'combo') {
            // compute based on combos/products/condiments
            if (Array.isArray(it.combos)) {
              it.combos.forEach(cb => {
                const cbQty = Number(cb.qty || 1) || 1
                if (Array.isArray(cb.products)) {
                  cb.products.forEach(p => {
                    const pQty = Number(p.qty || 1) || 1
                    const base = Number(p.price || 0)
                    let condTotal = 0
                    if (Array.isArray(p.condiments)) {
                      p.condiments.forEach(c => {
                        condTotal += Number(c.price || 0) * (Number(c.qty || 1) || 1)
                      })
                    }
                    linePrice += (base + condTotal) * pQty * cbQty
                  })
                }
              })
            }
            linePrice = linePrice * (Number(it.qty || 1) || 1)
          } else {
            linePrice = Number(it.price || 0) * (Number(it.qty || 1) || 1)
          }

          // image: try item.image else for combos try first product image
          let img = "/images/gambar-menu.jpg"
          // Prefer detailCombo.image if available
          if (it && it.type === 'combo') {
            img = it.detailCombo?.image || it.image || img
            // final fallback: first product image if still not found
            if (!img || img === null || img === "/images/gambar-menu.jpg") {
              const firstCombo = Array.isArray(it.combos) && it.combos[0]
              const firstProd = firstCombo && Array.isArray(firstCombo.products) && firstCombo.products[0]
              if (firstProd && (firstProd.imagePath || firstProd.image)) {
                img = firstProd.imagePath || firstProd.image
              }
            }
          } else {
            // non-combo item
            img = it.image || img
          }

          const title = it.type === 'combo' ? (it.detailCombo?.name || it.detailCombo?.code || 'Combo') : (it.title || it.name || it.itemName || '')

          return (
            <div key={i} className={styles.cartItem}>
              <div className={styles.itemImageWrap}>
                <Image
                  src={img}
                  alt={title}
                  fill
                  className={styles.itemImage}
                />
              </div>

              <div className={styles.itemInfo}>
                <div className={styles.itemTitle}>{title}</div>

                <div className={styles.itemAddon}>
                  {/* menu item addons (always render area) */}
                  {it.type !== 'combo' ? renderAddons(it.addons, it) : null}

                  {/* for combo show breakdown of products + condiments */}
                  {it.type === 'combo' ? renderComboDetails(it) : null}

                  {it.note ? <div className={styles.addonNote}>Catatan: {String(it.note)}</div> : null}
                </div>
              </div>

              <div className={styles.itemRight} style={{ display: "grid" }}>
                <button className={styles.editIconBtn} onClick={() => handleEdit(i)} title="Edit item" aria-label={`Edit item ${title}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="#111827"/>
                    <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#111827"/>
                  </svg>
                </button>

                <button className={styles.trashBtn} onClick={() => handleDeleteRequest(i)} title="Hapus item" aria-label={`Hapus item ${title}`}>🗑</button>
              </div>

              <div className={styles.itemRight}>
                {/* show formatted subtotal/price based on client-calculated totals */}
                <div className={styles.itemPrice}>{formatRp(linePrice)}</div>

                <div className={styles.qtyRow}>
                  <button className={styles.minusBtn} onClick={() => handleQty(i, 'minus')}>-</button>
                  <div className={styles.qtyText}>{it.qty}</div>
                  <button className={styles.plusBtn} onClick={() => handleQty(i, 'plus')}>+</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* PAYMENT DETAIL */}
      <div className={styles.paymentSection}>
        <div className={styles.paymentTitle}>Detail Pembayaran</div>

        <div className={styles.paymentRow}>
          <div>Subtotal ({cart.length} menu)</div>
          <div className={styles.paymentValue}>{formatRp(subtotal)}</div>
        </div>

        <div className={styles.paymentRow}>
          <div>PB1 (10%)</div>
          <div className={styles.paymentValue}>{formatRp(taxPB1)}</div>
        </div>

        {taxPPN > 0 && (
          <div className={styles.paymentRow}>
            <div>PPN (11%)</div>
            <div className={styles.paymentValue}>{formatRp(taxPPN)}</div>
          </div>
        )}

        {rounding !== 0 && (
          <div className={styles.paymentRow}>
            <div>Rounding</div>
            <div className={styles.paymentValue}>{formatRp(rounding)}</div>
          </div>
        )}

        <div className={styles.paymentTotalRow}>
          <div>Total</div>
          <div className={styles.paymentTotalValue}>{formatRp(roundedTotal)}</div>
        </div>
      </div>

      {/* STICKY BOTTOM BAR */}
      <div className={styles.stickyBar}>
        <div className={styles.rowTop}>
          <div className={styles.totalLabel}>Total Pembayaran</div>
          <div className={styles.totalAmount}>{formatRp(roundedTotal)}</div>
        </div>

        <button className={styles.payBtn} onClick={() => confirmPayment(roundedTotal)}>Proses Pembayaran</button>
      </div>

      {/* AddPopup anchored to addBtnRef */}
      <AddPopup
        visible={showAddPopup}
        anchorRef={addBtnRef}
        onClose={closeAddPopup}
        width={150}
        height={84}
        autoHideMs={0}
      >
      </AddPopup>

      {/* Delete confirmation modal */}
      {showConfirmDelete && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 1200
            }}
            onClick={handleCancelDelete}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1300,
              background: '#fff',
              borderRadius: 12,
              width: 320,
              maxWidth: '90%',
              padding: 20,
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Konfirmasi Hapus</div>
            <div style={{ marginBottom: 18, color: '#333' }}>Apakah Anda yakin akan menghapus item ini dari keranjang?</div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancelDelete}
                style={{
                  background: '#fff',
                  border: '1px solid #e11d48',
                  color: '#e11d48',
                  padding: '8px 12px',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                Batal
              </button>

              <button
                onClick={handleConfirmDelete}
                style={{
                  background: '#10b981',
                  border: '1px solid #10b981',
                  color: '#fff',
                  padding: '8px 12px',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                Setuju
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}