// pages/checkout.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Image from 'next/image'
import styles from '../styles/Checkout.module.css'
import { getCart, updateCart, removeFromCartByIndex, cartSubtotal, cartPaymentTotal } from '../lib/cart'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

export default function CheckoutPage() {
  const router = useRouter()
  const [cart, setCart] = useState([])

  useEffect(() => {
    // read cart once from storage and set state (avoid logging stale state variable)
    const c = getCart() || []
    setCart(c)
    console.log('checkout cart loaded', c)
  }, [])

  function handleQty(index, type) {
    const item = cart[index]
    if (!item) return

    let newQty = item.qty
    if (type === 'minus') newQty = Math.max(1, item.qty - 1)
    else if (type === 'plus') newQty = item.qty + 1

    const updated = updateCart(index, { qty: newQty })
    setCart([...updated])
  }

  function confirmPayment(total) {
    cartPaymentTotal(total)
    router.push('/payment')
  }

  function handleDelete(index) {
    const updated = removeFromCartByIndex(index)
    setCart([...updated])
  }

  // build signature helper — must match signature logic used elsewhere (lib/cart)
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

  // when user taps Edit, navigate to item detail with index+signature (and store to sessionStorage)
  function handleEdit(index) {
    const it = cart[index]
    if (!it) return
    const productCode = encodeURIComponent(String(it.productCode ?? it.id ?? ''))
    const sig = signatureForItem(it)
    // store a short editing reference in sessionStorage as fallback/fast-channel
    try {
      sessionStorage.setItem('yoshi_edit', JSON.stringify({ index, signature: sig }))
    } catch (e) {
      // ignore if sessionStorage not available
      console.warn('sessionStorage write failed', e)
    }
    // navigate to item detail; parent page (item page) can read sessionStorage or query params
    const qs = new URLSearchParams({
      index: String(index),
      sig: sig,
      from: 'checkout'
    }).toString()

    router.push(`/item/${productCode}?${qs}`)
  }

  const subtotal = cartSubtotal()
  const tax = Math.round(subtotal * 0.11)
  const total = subtotal + tax

  return (
    <div className={styles.page}>

      {/* HEADER */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/menu')}>
          ←
        </button>
        <div className={styles.headerTitle}>Order</div>
      </header>

      {/* TIPE ORDER / TABLE */}
      <div className={styles.orderInfo}>
        <div className={styles.orderInfoText}>Tipe Order</div>
        <div className={styles.orderInfoRight}>TBL 24 • Dine In</div>
      </div>

      {/* ORDERED ITEMS TITLE */}
      <div className={styles.sectionTitleWrap}>
        <div className={styles.sectionTitle}>Ordered items ({cart.length})</div>
        <button className={styles.addMoreBtn} onClick={() => router.push('/menu')}>
          Tambah
        </button>
      </div>

      {/* ITEMS LIST */}
      <div className={styles.itemsList}>
        {cart.length === 0 && (
          <div style={{ padding: 20 }}>Keranjang kosong</div>
        )}

        {cart.map((it, i) => (
          <div key={i} className={styles.cartItem}>
            <div className={styles.itemImageWrap}>
              <Image
                src="/images/gambar-menu.jpg"
                alt={it.title}
                width={64}
                height={64}
                className={styles.itemImage}
              />
              <button
                className={styles.editBtn}
                onClick={() => handleEdit(i)}
              >
                Edit
              </button>
            </div>

            <div className={styles.itemInfo}>
              <div className={styles.itemTitle}>{it.title}</div>

              <div className={styles.itemAddon}>
                {it.qty}x {it.note || 'No Note'}
              </div>
            </div>

            <div className={styles.itemRight}>
              <div className={styles.itemPrice}>{formatRp(it.price * it.qty)}</div>

              <div className={styles.qtyRow}>
                <button className={styles.trashBtn} onClick={() => handleDelete(i)}>🗑</button>

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
          <div className={styles.paymentValue}>{formatRp(subtotal)}</div>
        </div>

        <div className={styles.paymentRow}>
          <div>PPN (11%)</div>
          <div className={styles.paymentValue}>{formatRp(tax)}</div>
        </div>

        <div className={styles.paymentRow}>
          <div>Fees</div>
          <div className={styles.paymentValue}>Rp0</div>
        </div>

        <div className={styles.paymentTotalRow}>
          <div>Total</div>
          <div className={styles.paymentTotalValue}>{formatRp(total)}</div>
        </div>
      </div>

      {/* STICKY BOTTOM BAR */}
      <div className={styles.stickyBar}>
        <div className={styles.totalLabel}>Total Pembayaran</div>
        <div className={styles.totalAmount}>{formatRp(total)}</div>

        <button
          className={styles.payBtn}
          onClick={() => confirmPayment(total)}
        >
          Proses Pembayaran
        </button>
      </div>
    </div>
  )
}
