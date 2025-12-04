// FILE: pages/order/[id].js
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import styles from '../styles/OrderStatus.module.css'
import { getPayment } from '../lib/cart'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

// helper: calculate taxes for a single item (handles combo and normal)
function calculateItemTaxes(it) {
  // returns { base: Number, pb1: Number, ppn: Number }
  let base = 0
  let pb1 = 0
  let ppn = 0

  if (it.type === 'combo' && it.combos && it.combos[0] && it.combos[0].products) {
    // sum each product price * qty
    const products = it.combos[0].products
    base = products.reduce((t, p) => t + (Number(p.price || 0) * Number(p.qty || 1)), 0) * Number(it.qty || 1)

    products.forEach((p) => {
      const lineBase = Number(p.price || 0) * Number(p.qty || 1) * Number(it.qty || 1) // include combo qty
      if (Array.isArray(p.taxes)) {
        p.taxes.forEach((tx) => {
          const pct = Number(tx.taxPercentage || 0)
          const amount = Math.round(lineBase * pct / 100)
          if ((tx.taxName || '').toUpperCase().includes('PB1')) pb1 += amount
          else if ((tx.taxName || '').toUpperCase().includes('PPN') || (tx.taxName || '').toUpperCase().includes('PNN')) ppn += amount
        })
      }
    })
  } else {
    // normal item
    const qty = Number(it.qty || 1)
    base = Number(it.price || 0) * qty
    if (Array.isArray(it.taxes)) {
      it.taxes.forEach((tx) => {
        const pct = Number(tx.taxPercentage || 0)
        const amount = Math.round(base * pct / 100)
        if ((tx.taxName || '').toUpperCase().includes('PB1')) pb1 += amount
        else if ((tx.taxName || '').toUpperCase().includes('PPN') || (tx.taxName || '').toUpperCase().includes('PNN')) ppn += amount
      })
    }
  }

  return { base, pb1, ppn }
}

export default function OrderStatus() {
  const router = useRouter()
  const { id } = router.query
  const [payment, setPayment] = useState({ items: [], paymentTotal: 0 })
  const [currentStep, setCurrentStep] = useState(3)
  const [displayOrderId, setDisplayOrderId] = useState("")
  const [dataOrder, setDataOrder] = useState("")
  const [urlLogo, setUrlLogo] = useState("")
  const [showAllItems, setShowAllItems] = useState(false) // new state

  /* 1) read sessionStorage once on mount -> setDataOrder */
  useEffect(() => {
    const s = sessionStorage.getItem('midtrans_tx');
    if (s) {
      try { setDataOrder(JSON.parse(s)); }
      catch (e) { console.warn('Invalid midtrans_tx', e); }
    }
    // only runs once on mount
  }, []);

  /* 2) when dataOrder changes, set urlLogo accordingly
    -> DOES NOT write dataOrder, so safe to include dataOrder in deps */
  useEffect(() => {
    if (!dataOrder) return;
    switch (dataOrder.payment_type) {
      case 'qris': setUrlLogo('/images/pay-qris.png'); break;
      case 'shopee': setUrlLogo('/images/pay-shopee.png'); break;
      case 'ovo': setUrlLogo('/images/pay-ovo.png'); break;
      case 'dana': setUrlLogo('/images/pay-dana.png'); break;
      default: setUrlLogo('/images/pay-gopay.png'); break;
    }
  }, [dataOrder]);

  /* 3) set displayOrderId when router is ready (depends on router.isReady & id) */
  useEffect(() => {
    if (router.isReady) setDisplayOrderId(String(id || ''));
  }, [router.isReady, id]);

  /* 4) initialize payment (getPayment) once (or when router ready)
    Put router.isReady in deps if you want to wait until router ready. */
  useEffect(() => {
    const item = getPayment() || {};
    const p = { items: item.cart || [], paymentTotal: item.paymentTotal || 0 };
    if (p && p.items && p.items.length) {
      setPayment(p);
      setCurrentStep(2);
    } else {
      setPayment({ items: [], paymentTotal: 0 });
    }
  }, []); // or [router.isReady] if needed

  const steps = [
    { key: 1, title: 'Pesanan Selesai', desc: 'Pesanan sudah selesai', img : '/images/check-icon.png'},
    { key: 2, title: 'Makanan Sedang Disiapkan', desc: 'Pesanan kamu sedang disiapkan', img : '/images/bowl-icon.png' },
    { key: 3, title: 'Pembayaran Berhasil', desc: 'Pembayaran kamu sudah diterima', img : '/images/wallet-icon.png' },
    { key: 4, title: 'Pesanan Dibuat', desc: 'Pesanan kamu sudah dibuat', img : '/images/mobile-icon.png' },
  ]

  // compute derived totals from items using tax definitions on each item
  const items = payment.items || []
  const itemsCount = items.length

  let computedSubtotal = 0
  let computedPB1 = 0
  let computedPPN = 0

  items.forEach((it) => {
    const t = calculateItemTaxes(it)
    computedSubtotal += t.base
    computedPB1 += t.pb1
    computedPPN += t.ppn
  })

  // rounding already done per-line; ensure integers
  computedSubtotal = Math.round(computedSubtotal)
  computedPB1 = Math.round(computedPB1)
  computedPPN = Math.round(computedPPN)

  // unrounded total (before rounding-to-100)
  const unroundedTotal = computedSubtotal + computedPB1 + computedPPN

  // rounding to nearest 100 (ubah ke Math.ceil untuk selalu naik)
  const roundedTotal = Math.round(unroundedTotal / 100) * 100
  const roundingAmount = roundedTotal - unroundedTotal // bisa negatif, zero, atau positive
  const total = roundedTotal

  // decide which items to render: if showAllItems true -> all, else just first (if >=1)
  const visibleItems = showAllItems ? items : (itemsCount > 0 ? [items[0]] : [])

  function handleToggleShowAll() {
    setShowAllItems(prev => !prev)
  }

  /* ========== HOVERBAR LOGIC ========== */

  // Replace this with merchant phone number you want to use
  const MERCHANT_PHONE = '+628123456789' // <-- ganti nomor ini sesuai kebutuhan (format internasional)

  async function contactMerchant() {
    try {
      // copy to clipboard (best-effort)
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(MERCHANT_PHONE)
      }
    } catch (e) {
      // ignore clipboard errors
    }

    // try to open WhatsApp chat in new tab (user may change number)
    const normalized = MERCHANT_PHONE.replace(/\D/g, '')
    if (normalized) {
      const waUrl = `https://wa.me/${normalized}`
      window.open(waUrl, '_blank', 'noopener')
      alert(`Nomor kontak disalin ke clipboard: ${MERCHANT_PHONE}\nMembuka WhatsApp...`)
    } else {
      // fallback: show phone in alert
      alert(`Hubungi merchant: ${MERCHANT_PHONE}`)
    }
  }

  /* ========== JSX ========== */
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
            Table 24 · Dine In
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
                src="/images/caret-down.png"
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
          <div className={styles.paymentItemLeft}>
            <img src={urlLogo} alt="logo" width={55} height={14} className={styles.iconImg} />
          </div>
        </div>
      </div>

      {/* PAYMENT DETAIL */}
      <div className={styles.paymentSection}>
        <div className={styles.paymentTitle}>Detail Pembayaran</div>

        <div className={styles.paymentRow}>
          <div>Subtotal ({itemsCount} menu)</div>
          <div className={styles.paymentValue}>{formatRp(computedSubtotal)}</div>
        </div>

        <div className={styles.paymentRow}>
          <div>PB1 (10%)</div>
          <div className={styles.paymentValue}>{formatRp(computedPB1)}</div>
        </div>

        <div className={styles.paymentRow}>
          <div>PNN (11%)</div>
          <div className={styles.paymentValue}>{formatRp(computedPPN)}</div>
        </div>

        {/* NEW: Rounding row */}
        <div className={styles.paymentRow}>
          <div>Rounding</div>
          <div className={styles.paymentValue}>{formatRp(roundingAmount)}</div>
        </div>

        <div className={styles.paymentTotalRow}>
          <div>Total</div>
          <div className={styles.paymentTotalValue}>{formatRp(total)}</div>
        </div>
      </div>

      {/* ========== Hoverbar (fixed bottom) ========== */}
      <div className={styles.hoverBarWrap} role="region" aria-label="Aksi pesanan">
        <div className={styles.hoverBar}>
          <button
            className={styles.btnDownload}
            onClick={() => router.push(`/bill/${displayOrderId}`)}
            aria-label="Download bill"
            type="button"
          >
            <span>Download Bill</span>
          </button>

          <button
            className={styles.btnContact}
            onClick={contactMerchant}
            aria-label="Kontak merchant"
            type="button"
          >
            <span>Kontak</span>
          </button>
        </div>
      </div>
    </div>
  )
}
