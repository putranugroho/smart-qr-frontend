// pages/checkout.js
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Image from 'next/image'
import styles from '../styles/Checkout.module.css'
import AddPopup from './AddPopup'
import { getCart, updateCart, removeFromCartByIndex, cartPaymentTotal } from '../lib/cart'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

export default function CheckoutPage() {
  const router = useRouter()

  // cart state (loaded from storage on client)
  const [cart, setCart] = useState([])
  const [cartLoaded, setCartLoaded] = useState(false)

  // totals state (initialize 0 so SSR and initial client render match)
  const [subtotal, setSubtotal] = useState(0)
  const [tax, setTax] = useState(0)
  const [total, setTotal] = useState(0)

  // popup state
  const [showAddPopup, setShowAddPopup] = useState(false)
  const addBtnRef = useRef(null)
  const popupTimerRef = useRef(null)

  // load cart from storage on client only
  useEffect(() => {
    const c = getCart() || []
    setCart(c)
    setCartLoaded(true)
  }, [])

  // compute totals whenever `cart` changes (client only)
  useEffect(() => {
    // safe compute from cart array -> avoids reading storage during render
    const s = (cart || []).reduce((acc, it) => {
      const price = Number(it.price || 0)
      const qty = Number(it.qty || 0) || 0
      return acc + (price * qty)
    }, 0)
    const t = Math.round(s * 0.10)
    const tot = s + t

    setSubtotal(s)
    setTax(t)
    setTotal(tot)
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
    cartPaymentTotal(totalAmt)
    router.push('/payment')
  }

  function handleDelete(index) {
    const updated = removeFromCartByIndex(index)
    setCart([...updated])
  }

  // build signature helper
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

  // Render addons: show only selected addon names; if none -> null
  function renderAddons(addons) {
    if (!addons || addons.length === 0) return null

    const lines = []
    addons.forEach(a => {
      const sel = a.selected
      if (!sel) return
      if (Array.isArray(sel)) {
        sel.forEach(it => {
          if (it && it.name) lines.push(it.name)
        })
      } else if (typeof sel === 'object' && sel.name) {
        lines.push(sel.name)
      } else if (typeof sel === 'string') {
        lines.push(sel)
      }
    })
    if (lines.length === 0) return null

    return (
      <div>
        <div className={styles.addonGroup}>Add on :</div>
        {lines.map((n, idx) => <div key={idx} className={styles.addonLine}>- {n}</div>)}
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
          Table 24 • Dine In
            <Image
              src="/images/caret-down.png"
              alt="Bell"
              width={19}
              height={19}
              style={{ paddingLeft: 5 }}
            />
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
          <Image
            src="/images/caret-down.png"
            alt=""
            width={12}
            height={12}
            style={{ paddingLeft: "3px" }}
          />
        </button>
      </div>

      {/* ITEMS LIST */}
      <div className={styles.itemsList}>
        {cart.length === 0 && <div style={{ padding: 20 }}>Keranjang kosong</div>}

        {cart.map((it, i) => (
          <div key={i} className={styles.cartItem}>
            <div className={styles.itemImageWrap}>
              <Image
                src={it.image || "/images/gambar-menu.jpg"}
                alt={it.title}
                fill
                className={styles.itemImage}
              />
            </div>

            <div className={styles.itemInfo}>
              <div className={styles.itemTitle}>{it.title}</div>

              <div className={styles.itemAddon}>
                {renderAddons(it.addons)}
                {it.note ? <div className={styles.addonNote}>Catatan: {String(it.note)}</div> : null}
              </div>
            </div>

            <div className={styles.itemRight} style={{display:"grid"}}>
                <button className={styles.editIconBtn} onClick={() => handleEdit(i)} title="Edit item" aria-label={`Edit item ${it.title}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="#111827"/>
                    <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#111827"/>
                  </svg>
                </button>

                <button className={styles.trashBtn} onClick={() => handleDelete(i)} title="Hapus item" aria-label={`Hapus item ${it.title}`}>🗑</button>
            </div>

            <div className={styles.itemRight}>
              {/* show formatted subtotal/price based on client-calculated totals */}
              <div className={styles.itemPrice}>{formatRp(it.price * it.qty)}</div>

              <div className={styles.qtyRow}>
                {/* <button className={styles.editIconBtn} onClick={() => handleEdit(i)} title="Edit item" aria-label={`Edit item ${it.title}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="#111827"/>
                    <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#111827"/>
                  </svg>
                </button>

                <button className={styles.trashBtn} onClick={() => handleDelete(i)} title="Hapus item" aria-label={`Hapus item ${it.title}`}>🗑</button> */}

                <button className={styles.minusBtn} onClick={() => handleQty(i, 'minus')}>-</button>
                <div className={styles.qtyText}>{it.qty}</div>
                <button className={styles.plusBtn} onClick={() => handleQty(i, 'plus')}>+</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* PAYMENT DETAIL */}
      <div className={styles.paymentSection}>
        <div className={styles.paymentTitle}>Detail Pembayaran</div>

        <div className={styles.paymentRow}>
          <div>Subtotal ({cart.length} menu)</div>
          {/* display subtotal (initially 0 on SSR/client before cart loads) */}
          <div className={styles.paymentValue}>{formatRp(subtotal)}</div>
        </div>

        <div className={styles.paymentRow}>
          <div>PB1 (10%)</div>
          <div className={styles.paymentValue}>{formatRp(tax)}</div>
        </div>

        {/* <div className={styles.paymentRow}>
          <div>Rounding</div>
          <div className={styles.paymentValue}>Rp0</div>
        </div> */}

        <div className={styles.paymentTotalRow}>
          <div>Total</div>
          <div className={styles.paymentTotalValue}>{formatRp(total)}</div>
        </div>
      </div>

      {/* STICKY BOTTOM BAR */}
      <div className={styles.stickyBar}>
        <div className={styles.rowTop}>
          <div className={styles.totalLabel}>Total Pembayaran</div>
          <div className={styles.totalAmount}>{formatRp(total)}</div>
        </div>

        <button className={styles.payBtn} onClick={() => confirmPayment(total)}>Proses Pembayaran</button>
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
    </div>
  )
}
