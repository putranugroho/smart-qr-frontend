// FILE: pages/order/[id].js
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import styles from '../styles/OrderStatus.module.css'
import { getPayment } from '../lib/cart'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

export default function OrderStatus() {
  const router = useRouter()
  const { id } = router.query
  const [payment, setPayment] = useState({ items: [], paymentTotal: 0 })
  const [currentStep, setCurrentStep] = useState(2)
    const [displayOrderId, setDisplayOrderId] = useState("")

  useEffect(() => {
    if (!router.isReady) setDisplayOrderId(String(id))
    const p = getPayment() || {}
    // fallback: if there's an items array inside payment, use it
    if (p && p.items && p.items.length) {
      setPayment(p)
      // assume after completing payment user lands on order page -> move to "Makanan Sedang Disiapkan"
      setCurrentStep(3)
    } else {
      // fallback to empty
      setPayment({ items: [], paymentTotal: 0 })
    }
  }, [router.isReady, id])

  const steps = [
    { key: 1, title: 'Pesanan Dibuat', desc: 'Pesanan kamu sudah dibuat' },
    { key: 2, title: 'Pembayaran Berhasil', desc: 'Pembayaran kamu sudah diterima' },
    { key: 3, title: 'Makanan Sedang Disiapkan', desc: 'Pesanan kamu sedang disiapkan' },
    { key: 4, title: 'Pesanan Selesai', desc: 'Pesanan sudah selesai' }
  ]

  const subtotal = payment.paymentTotal || 0
  const tax = Math.round(subtotal * 0.11)
  const total = subtotal + tax

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/')}>←</button>
        <div className={styles.headerTitle}>Detail Pesanan</div>
      </header>

      {/* BLUE BOX */}
      <div className={styles.blueBox}>
        <div className={styles.blueLeft}>
          <div className={styles.orderType}>TBL 24 · Dine In</div>
          <div className={styles.storeName}>Yoshinoya - Mall Grand Indonesia</div>
        </div>

        <div className={styles.orderNumberBox}>
          <div className={styles.smallText}>Nomor Orderan</div>
          <div className={styles.orderNumber}>{String(displayOrderId)}</div>
        </div>
      </div>

      {/* TRACK ORDER */}
      <div className={styles.section}>
        <div className={styles.trackTitle}>Track Orderan</div>

        <div className={styles.trackLineWrap}>
          <div className={styles.trackLine}></div>

          <div className={styles.stepsWrap}>
            {steps.map((s) => {
              const status = s.key < currentStep ? 'done' : (s.key === currentStep ? 'ongoing' : 'upcoming')
              return (
                <div key={s.key} className={`${styles.stepItem} ${styles[status]}`}>
                  <div className={styles.iconCircle} aria-hidden>
                    {/* small inner icon placeholder */}
                    <div className={styles.iconInner}>{s.key}</div>
                  </div>

                  <div className={styles.stepTextWrap}>
                    <div className={styles.stepTitle}>{s.title}</div>
                    <div className={styles.stepDesc}>{s.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ORDERED ITEMS */}
      <div className={styles.section}>
        <div className={styles.itemsTitle}>Ordered Items ({(payment.items || []).length})</div>

        <div className={styles.itemsList}>
          {(payment.items || []).map((it, i) => (
            <div key={i} className={styles.itemRow}>
              <div className={styles.itemImageWrap}>
                {/* use a fallback local image if product image not provided */}
                <Image src={'/images/gambar-menu.jpg'} alt={it.title} width={64} height={64} className={styles.itemImage} />
              </div>

              <div className={styles.itemInfo}>
                <div className={styles.itemTitle}>{it.title}</div>
                <div className={styles.itemAddon}>{it.qty}x {it.note || 'No Note'}</div>
              </div>

              <div className={styles.itemPrice}>{formatRp(Number(it.price || 0) * (Number(it.qty || 1)))}</div>
            </div>
          ))}
        </div>

        <button className={styles.viewAllBtn} onClick={() => alert('implementasi: lihat semua item')}>Lihat Semua ▾</button>
      </div>

      {/* PAYMENT METHOD & DETAILS - reuse Checkout styles visually but we provide a compact layout */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Metode Pembayaran</div>

        <div className={styles.paymentMethodBox}>QRIS</div>

        <div className={styles.detailBox}>
          <div className={styles.paymentRow}><div>Subtotal ({(payment.items || []).length} menu)</div><div className={styles.paymentValue}>{formatRp(subtotal)}</div></div>
          <div className={styles.paymentRow}><div>PPN (11%)</div><div className={styles.paymentValue}>{formatRp(tax)}</div></div>
          <div className={styles.paymentRow}><div>Fees</div><div className={styles.paymentValue}>Rp0</div></div>
          <div className={styles.paymentTotalRow}><div>Total</div><div className={styles.paymentTotalValue}>{formatRp(total)}</div></div>
        </div>
      </div>

    </div>
  )
}