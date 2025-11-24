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
  const [currentStep, setCurrentStep] = useState(3)
  const [displayOrderId, setDisplayOrderId] = useState("")
  const [showAllItems, setShowAllItems] = useState(false) // new state

  useEffect(() => {
    if (router.isReady) setDisplayOrderId(String(id))
    const p = getPayment() || {}
    if (p && p.items && p.items.length) {
      setPayment(p)
      setCurrentStep(2)
    } else {
      setPayment({ items: [], paymentTotal: 0 })
    }
  }, [router.isReady, id])

  const steps = [
    { key: 1, title: 'Pesanan Selesai', desc: 'Pesanan sudah selesai', img : '/images/check-icon.png'},
    { key: 2, title: 'Makanan Sedang Disiapkan', desc: 'Pesanan kamu sedang disiapkan', img : '/images/bowl-icon.png' },
    { key: 3, title: 'Pembayaran Berhasil', desc: 'Pembayaran kamu sudah diterima', img : '/images/wallet-icon.png' },
    { key: 4, title: 'Pesanan Dibuat', desc: 'Pesanan kamu sudah dibuat', img : '/images/mobile-icon.png' },
  ]

  const subtotal = payment.paymentTotal || 0
  const tax = Math.round(subtotal * 0.11)
  const total = subtotal + tax

  const items = payment.items || []
  const itemsCount = items.length

  // decide which items to render: if showAllItems true -> all, else just first (if >=1)
  const visibleItems = showAllItems ? items : (itemsCount > 0 ? [items[0]] : [])

  function handleToggleShowAll() {
    setShowAllItems(prev => !prev)
  }

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
          <div className={styles.orderType}>
            <Image
              src="/images/bell-icon.png"
              alt="Bell"
              width={20}
              height={20}
              style={{ paddingRight: 5 }}
            />
            TBL 24 · Dine In
          </div>
          <div className={styles.storeName}>Yoshinoya - Mall Grand Indonesia</div>
        </div>

        <div className={styles.orderNumberBox}>
          <div className={styles.smallText}>Nomor Orderan</div>
          <div className={styles.orderNumber}>{String(displayOrderId || '-')}</div>
        </div>
      </div>

      {/* TRACK ORDER */}
      <div className={styles.section}>
        <div className={styles.trackTitle}>Track Orderan</div>

        <div className={styles.trackLineWrap}>
          <div className={styles.trackLine}></div>

          <div className={styles.stepsWrap}>
            {steps.map((s) => {
              // mapping sesuai keinginan: s.key < currentStep => done, s.key === currentStep => ongoing, else upcoming
              const status = s.key > currentStep ? 'done' : (s.key === currentStep ? 'ongoing' : 'upcoming')
              return (
                <div key={s.key} className={`${styles.stepItem} ${styles[status]}`}>
                  <div className={styles.iconCircle} aria-hidden>
                    <Image src={s.img} alt={s.title} width={24} height={24} />
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
      <div className={styles.sectionPayment}>
        <div className={styles.itemsTitle}>Ordered Items ({itemsCount})</div>
        <div className={styles.trackLine}></div>

        <div className={styles.itemsList}>
          {visibleItems.length === 0 && (
            <div className={styles.noItems}>Belum ada item dipesan.</div>
          )}

          {visibleItems.map((it, i) => (
            <div key={i} className={styles.itemRow}>
              <div className={styles.itemImageWrap}>
                <Image
                  src={it.image || '/images/gambar-menu.jpg'}
                  alt={it.title || it.name || 'item'}
                  width={64}
                  height={64}
                  className={styles.itemImage}
                />
              </div>

              <div className={styles.itemInfo}>
                <div className={styles.itemTitle}>{it.title || it.name || it.itemName}</div>
                <div className={styles.itemAddon}>{(it.qty || 1)}x {it.note || (it.addons && it.addons.length ? it.addons.map(a => a.group).join(', ') : 'No Note')}</div>
              </div>

              <div className={styles.itemPrice}>{formatRp(Number(it.price || 0) * (Number(it.qty || 1)))}</div>
            </div>
          ))}
        </div>

        {/* Show toggle button only if more than 1 item */}
        {itemsCount > 1 && (
          <button
            className={styles.viewAllBtn}
            onClick={handleToggleShowAll}
            type="button"
            aria-expanded={showAllItems}
          >
            <span className={styles.viewAllText}>
              {showAllItems ? 'Lebih Sedikit' : 'Lihat Semua'}
            </span>

            <span className={styles.chevronWrap} aria-hidden>
              <Image
                src="/images/caret-down.png"       // ganti nama file sesuai file kamu
                alt=""
                width={12}
                height={12}
                style={{
                  transform: showAllItems ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 180ms ease'
                }}
              />
            </span>
          </button>
        )}
      </div>

      {/* PAYMENT METHOD & DETAILS */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Pilih Metode Pembayaran</div>

        <div className={styles.paymentBox}>
          <div className={styles.paymentBoxHeader}>
            <div className={styles.paymentBoxTitle}>Pembayaran Online</div>

            <Image
              src="/images/pembayaran-online.png"
              alt="pembayaran online"
              width={50}
              height={50}
              className={styles.paymentBoxIcon}
            />
          </div>
        </div>

        <div className={styles.paymentItem}>
          <div className={styles.paymentItemLeft}>📷 QRIS</div>
        </div>
      </div>

      {/* PAYMENT DETAIL */}
      <div className={styles.paymentSection}>
        <div className={styles.paymentTitle}>Detail Pembayaran</div>

        <div className={styles.paymentRow}>
          <div>Subtotal ({itemsCount} menu)</div>
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
    </div>
  )
}
