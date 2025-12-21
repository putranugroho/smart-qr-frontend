// component/checkout.js
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Image from 'next/image'
import styles from '../styles/Checkout.module.css'
import AddPopup from './AddPopup'
import { getCart, updateCart, removeFromCartByIndex, savePayment } from '../lib/cart'
import { getUser } from '../lib/auth'
import { mapDoOrderPayload } from '../lib/order'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

function normalizeTaxFlags(taxes = []) {
  const names = taxes.map(t =>
    String(t.taxName || t.name || '').toUpperCase()
  )

  const hasPPN = names.some(n => n.includes('PPN'))
  const hasPB1 = !hasPPN && names.some(n => n.includes('PB1'))

  return { hasPB1, hasPPN }
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

  if (!Array.isArray(cart)) {
    return { subtotal: 0, taxPB1: 0, taxPPN: 0, total: 0 }
  }

  cart.forEach(it => {
    /* =========================
       MENU BIASA (LEGACY)
    ========================= */
    if (it.type !== 'combo') {
      const price = Number(it.price || 0)
      const qty = Number(it.qty || 1)
      const line = price * qty
      subtotal += line
    
      const { hasPB1, hasPPN } = normalizeTaxFlags(it.taxes)
    
      it.taxes?.forEach(t => {
        const pct = Number(t.taxPercentage || 0)
        if (!pct) return
    
        const name = String(t.taxName || '').toUpperCase()
        const amt = line * pct / 100
    
        if (name.includes('PPN') && hasPPN) {
          taxPPN += amt
        }
    
        if (name.includes('PB1') && hasPB1) {
          taxPB1 += amt
        }
      })
    
      return
    }

    /* =========================
       COMBO (FIXED)
    ========================= */
    const itemQty = Number(it.qty || 1)

    it.combos?.forEach(cb => {
      cb.products?.forEach(p => {
        const base = Number(p.price || 0)

        // condiments
        let condTotal = 0
        p.condiments?.forEach(c => {
          condTotal += Number(c.price || 0) * Number(c.qty || 1)
        })

        const unitPrice = base + condTotal
        const lineTotal = unitPrice * itemQty
        subtotal += lineTotal

        /* === TAX: ONLY % × item.qty === */
        p.taxes?.forEach(t => {
          const pct = Number(t.taxPercentage || 0)
          if (!pct) return

          const taxAmt = unitPrice * itemQty * pct / 100
          const name = String(t.taxName || t.name || '').toUpperCase()

          if (name.includes('PB1')) taxPB1 += taxAmt
          if (name.includes('PPN')) taxPPN += taxAmt
        })
      })
    })
  })

  const total = Math.ceil(subtotal + taxPB1 + taxPPN)
  return { subtotal, taxPB1, taxPPN, total }
}

export default function CheckoutPage() {
  const router = useRouter()

  // cart state (loaded from storage on client)
  const [cart, setCart] = useState([])
  const [cartLoaded, setCartLoaded] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)

  // totals state (initialize 0 so SSR and initial client render match)
  const [subtotal, setSubtotal] = useState(0)
  const [taxPB1, setTaxPB1] = useState(0)
  const [taxPPN, setTaxPPN] = useState(0)
  const [roundedTotal, setRoundedTotal] = useState(0)
  const [rounding, setRounding] = useState(0)
  const [user, setUser] = useState('')
  const [table, setTable] = useState('')

  // popup state
  const [showAddPopup, setShowAddPopup] = useState(false)
  const addBtnRef = useRef(null)
  const recalcTimerRef = useRef(null)

  // delete confirmation modal state
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState(null)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  
  // compute payload from cart and use it as source of truth for totals
  function buildPayload(grossAmountForRounding = null, explicitTableNumber = null) {
    const cart = getCart();
    // pass grossAmount so mapDoOrderPayload can compute rounding if needed
    const payload = mapDoOrderPayload(cart, grossAmountForRounding, 'qris', {
      posId: 'QR',
      orderType: user.orderType || 'DI',
      tableNumber: user.orderType === 'TA' ? '' : (user.tableNumber || '')
    });
    return payload;
  }

  async function recalculateFromAPI(latestCart) {
    setIsCalculating(true) // 🔒 LOCK
  
    try {
      const payload = mapDoOrderPayload(
        latestCart,
        null,
        'qris',
        {
          posId: 'QR',
          orderType: user.orderType || 'DI',
          tableNumber: user.orderType === 'TA' ? '' : (user.tableNumber || '')
        }
      )
  
      const resp = await fetch('/api/order/taxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
  
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Gagal hitung pajak')
  
      setSubtotal(data.subTotal)
  
      let pb1 = 0
      let ppn = 0
      data.taxes?.forEach(t => {
        const name = (t.TaxName || '').toUpperCase()
        if (name === 'PB1') pb1 = Number(t.TaxAmount)
        if (name === 'PPN') ppn = Number(t.TaxAmount)
      })
  
      setTaxPB1(pb1)
      setTaxPPN(ppn)
      setRoundedTotal(data.grandTotal)
      setRounding(data.rounding)
  
    } catch (err) {
      console.error('Recalculate error:', err)
    } finally {
      setIsCalculating(false) // 🔓 UNLOCK
    }
  }

  function debouncedRecalculate(latestCart, delay = 400) {
    setIsCalculating(true)
  
    if (recalcTimerRef.current) {
      clearTimeout(recalcTimerRef.current)
    }
  
    recalcTimerRef.current = setTimeout(() => {
      recalculateFromAPI(latestCart)
    }, delay)
  }
  
  useEffect(() => {
    if (!cartLoaded) return
    debouncedRecalculate(cart)
  }, [cart])

  useEffect(() => {
    return () => {
      if (recalcTimerRef.current) {
        clearTimeout(recalcTimerRef.current)
      }
    }
  }, [])

  // load cart from storage on client only
  useEffect(() => {
    const rawCart = getCart() || []

    const cleanedCart = rawCart.map(item => {
      const taxes =
        item.type === 'combo'
          ? item.taxes || []
          : item.taxes ||
            item.menus?.[0]?.taxes ||
            []

      const { hasPB1, hasPPN } = normalizeTaxFlags(taxes)

      return {
        ...item,
        hasPB1,
        hasPPN,
        pb1Percent: hasPB1 ? item.pb1Percent : 0,
        ppnPercent: hasPPN ? item.ppnPercent : 0
      }
    })

    const dataUser = getUser?.() || null;
    setUser(dataUser)

    if (dataUser?.orderType == "DI") {
      setTable(`Table ${dataUser.tableNumber} • Dine In`)
    } else {
      setTable(`Table ${dataUser.tableNumber} • Take Away`)
    } 
    
    setCart(cleanedCart)
    setCartLoaded(true)
  }, [])

  // qty update
  function handleQty(index, action) {
    setCart(prev => {
      const next = [...prev]
      const item = JSON.parse(JSON.stringify(next[index])) // deep clone aman

      const currentQty = Number(item.qty || 1)
      let newQty = currentQty

      if (action === 'minus') newQty = Math.max(1, currentQty - 1)
      if (action === 'plus') newQty = currentQty + 1

      // ===== SET QTY UTAMA =====
      item.qty = newQty

      // ===== NORMALIZE COMBO =====
      if (item.type === 'combo' && Array.isArray(item.combos)) {
        item.combos = item.combos.map(cb => {
          return {
            ...cb,
            qty: newQty, // qty combo ikut user
          }
        })
      }

      // ===== MENU BIASA (LEGACY) =====
      if (Array.isArray(item.menus)) {
        item.menus = item.menus.map(m => ({
          ...m,
          qty: newQty,
          condiments: Array.isArray(m.condiments)
            ? m.condiments.map(c => ({
                ...c,
                qty: newQty
              }))
            : []
        }))
      }

      // ===== ADDONS =====
      if (Array.isArray(item.addons)) {
        item.addons = item.addons.map(a => ({
          ...a,
          qty: newQty
        }))
      }

      next[index] = item
      localStorage.setItem("yoshi_cart_v1", JSON.stringify(next))
      return next
    })
  }

  function confirmPayment(totalAmt) {
    if (isCalculating) return // ⛔ masih hitung
  
    try {
      const latestCart = JSON.parse(localStorage.getItem("yoshi_cart_v1") || "[]")
  
      sessionStorage.setItem("yoshi_cart_payment", JSON.stringify(latestCart))
      sessionStorage.setItem("yoshi_cart_total", totalAmt)
  
      savePayment(latestCart, totalAmt, {
        storeCode: user.storeCode || "",
        orderType: user.orderType || "",
        tableNumber: user.tableNumber || ""
      })
  
    } catch (e) {
      console.error("Gagal set session cart", e)
    }
  
    router.push("/payment")
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
    if (it.type === 'combo') {
      try {
        sessionStorage.setItem('yoshi_edit', JSON.stringify({ index, signature: `combo|${index}` }))
      } catch (e) { /* ignore */ }
      // be defensive when accessing nested props
      const comboCode = it.combos?.[0]?.detailCombo?.code ?? ''
      router.push(`/combo-detail?comboCode=${comboCode}&from=checkout&index=${index}`)
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
  function renderAddons(addons, item) {
    if (!Array.isArray(addons) || addons.length === 0) {
      return (
        <div>
          <div className={styles.addonGroup}>Add on :</div>
          <div className={styles.addonLine} style={{ color: '#666', fontStyle: 'italic' }}>Tidak ada add-on</div>
        </div>
      )
    }

    const condimentMap = {}
    if (item && Array.isArray(item.menus)) {
      item.menus.forEach(m => {
        if (Array.isArray(m.condiments)) {
          m.condiments.forEach(c => {
            if (c.code) condimentMap[c.code] = c.name || c.code
          })
        }
      })
    }

    const lines = []
    if (Array.isArray(addons)) {
      for (let i = 0; i < addons.length; i++) {
        const a = addons[i]
        if (!a) continue
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
      }
    }

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
            {Array.isArray(cb.products) && cb.products.length > 0
              ? cb.products.map((p, pi) => (
                  <div
                    key={`${p.code ?? pi}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: '1px dashed #eee'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>

                      <div style={{ marginTop: 4 }}>
                        {Array.isArray(p.condiments) &&
                          p.condiments.map((c, ci) => (
                            <div key={ci} className={styles.addonLine}>
                              - {c.name}
                              {c.qty > 1 ? ` x${c.qty}` : ''}
                            </div>
                          ))}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', minWidth: 90 }}>
                      {/* 🔑 PAKAI item.qty */}
                      <div style={{ fontSize: 12, color: '#666' }}>
                        x{Number(p.qty * item.qty)}
                      </div>
                    </div>
                  </div>
                ))
              : (
                <div className={styles.addonLine} style={{ color: '#666', fontStyle: 'italic' }}>
                  Tidak ada produk pada combo
                </div>
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

  // ---------- GROUP cart into DINE IN / TAKEAWAY preserving original index ----------
  function groupCartByOrderType(cartArr) {
    function getOrderType(it) {
      if (it?.type === 'combo' && it?.combos?.[0]) return it.combos[0].orderType || null
      if (!it?.type && it?.menus?.[0]) return it.menus[0].orderType || null
      return null
    }

    const dineIn = []
    const takeAway = []

    if (!Array.isArray(cartArr)) return { dineIn, takeAway }

    cartArr.forEach((it, idx) => {
      const ot = getOrderType(it)
      const wrapped = { item: it, cartIndex: idx }
      if (ot === 'DI') dineIn.push(wrapped)
      else if (ot === 'TA') takeAway.push(wrapped)
      else {
        // unknown orderType: keep with dineIn by default or push nowhere.
        // We'll push to dineIn to avoid losing items (you can change rule if needed)
        dineIn.push(wrapped)
      }
    })

    return { dineIn, takeAway }
  }

  // render single item — now receives original cart index
  function renderItem(it, cartIndex) {
    // compute line price (same logic)
    let linePrice = 0

    if (it?.type === 'combo') {
      const itemQty = Number(it.qty || 1)

      it.combos?.forEach(cb => {
        cb.products?.forEach(p => {
          const base = Number(p.price * p.qty)
          let condTotal = 0

          p.condiments?.forEach(c => {
            condTotal += Number(c.price || 0) * (Number(c.qty || 1))
          })

          linePrice += (base + condTotal) * itemQty
        })
      })
    } else {
      linePrice = Number(it.price || 0) * Number(it.qty || 1)
    }

    // image logic
    let img = "/images/no-image-available.jpg";
    if (it && it.type === 'combo') {
      img = it.detailCombo?.image || it.image || img;
      if (!img || img === "/images/no-image-available.jpg") {
        const firstCombo = Array.isArray(it.combos) && it.combos[0];
        const firstProd = firstCombo && Array.isArray(firstCombo.products) && firstCombo.products[0];
        if (firstProd && (firstProd.imagePath || firstProd.image)) {
          img = firstProd.imagePath || firstProd.image;
        }
      }
    } else {
      img = it.image || img;
    }
    const title =
      it.type === 'combo'
        ? (it.detailCombo?.name || it.detailCombo?.code || 'Combo')
        : (it.title || it.name || '');

    return (
      <div key={cartIndex} className={styles.titleWrap}>
        <div className={styles.cartItem}>
          <div className={styles.itemImageWrap}>
            <Image src={img} alt={title} fill className={styles.itemImage} />
          </div>

          <div className={styles.itemInfo}>
            <div className={styles.itemTitle}>{title}</div>

            <div className={styles.itemAddon}>
              {it.type !== 'combo' ? renderAddons(it.addons, it) : null}
              {it.type === 'combo' ? renderComboDetails(it) : null}
            </div>
          </div>

          <div className={styles.itemRight} style={{ display: "grid" }}>
            <button
              className={styles.editIconBtn}
              onClick={() => handleEdit(cartIndex)}
              title="Edit item"
              aria-label={`Edit item ${title}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="#111827"/>
                <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#111827"/>
              </svg>
            </button>

            <button
              className={styles.trashBtn}
              onClick={() => handleDeleteRequest(cartIndex)}
              title="Hapus item"
              aria-label={`Hapus item ${title}`}
            >
              🗑
            </button>
          </div>

          <div className={styles.itemRight}>
            <div className={styles.itemPrice}>{formatRp(linePrice)}</div>
            <div className={styles.qtyRow}>
              <button className={styles.minusBtn} onClick={() => handleQty(cartIndex, 'minus')}>-</button>
              <div className={styles.qtyText}>{it.qty}</div>
              <button className={styles.plusBtn} onClick={() => handleQty(cartIndex, 'plus')}>+</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { dineIn, takeAway } = groupCartByOrderType(cart)

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

        {dineIn.length > 0 && (
          <>
            <h3 style={{ padding: "12px 0 4px", fontWeight: "bold" }}>DINE IN</h3>
            {dineIn.map(w => renderItem(w.item, w.cartIndex))}
          </>
        )}

        {takeAway.length > 0 && (
          <>
            <h3 style={{ padding: "12px 0 4px", fontWeight: "bold" }}>TAKEAWAY</h3>
            {takeAway.map(w => renderItem(w.item, w.cartIndex))}
          </>
        )}
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

        <button
          className={`${styles.payBtn} ${isCalculating ? styles.payBtnDisabled : ''}`}
          onClick={() => confirmPayment(roundedTotal)}
          disabled={isCalculating}
        >
          {isCalculating ? 'Menghitung total...' : 'Proses Pembayaran'}
        </button>
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