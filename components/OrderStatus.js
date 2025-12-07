// pages/order/[id].js
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import styles from '../styles/OrderStatus.module.css'
import { getPayment } from '../lib/cart'
import { getUser } from '../lib/auth'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

// helper: calculate taxes for a single item (handles combo and normal)
// NOTE: this supports both local cart shape and remote API shape (we normalize remote to similar)
function calculateItemTaxes(it) {
  // returns { base: Number, pb1: Number, ppn: Number }
  let base = 0
  let pb1 = 0
  let ppn = 0

  // remote combo shape: type === 'combo' && combos[] with products[]
  if (it && it.type === 'combo' && Array.isArray(it.combos)) {
    const products = it.combos.flatMap(cb => (Array.isArray(cb.products) ? cb.products : []))
    // base price: sum product.price * qty * comboQty * itemQty
    products.forEach((p) => {
      const pQty = Number(p.qty || 1)
      const basePrice = Number(p.price || 0)
      const cbQty = Number(p._comboQty || 1) // we may store combo-level qty as _comboQty on product mapping
      const itemQty = Number(it.qty || 1)
      const lineBase = basePrice * pQty * cbQty * itemQty
      base += lineBase

      // product taxes
      if (Array.isArray(p.taxes)) {
        p.taxes.forEach(tx => {
          const pct = Number(tx.taxPercentage ?? tx.TaxPercentage ?? tx.amount ?? 0)
          const taxAmt = Math.round(lineBase * (pct / 100))
          if ((tx.taxName ?? tx.TaxName ?? '').toString().toUpperCase().includes('PB')) pb1 += taxAmt
          else if ((tx.taxName ?? tx.TaxName ?? '').toString().toUpperCase().includes('PPN')) ppn += taxAmt
        })
      }

      // condiments under product
      if (Array.isArray(p.condiments)) {
        p.condiments.forEach(c => {
          const cQty = Number(c.qty || 1)
          const cPrice = Number(c.price || 0)
          const cBase = cPrice * cQty * pQty * cbQty * itemQty
          base += cBase
          if (Array.isArray(c.taxes)) {
            c.taxes.forEach(tx => {
              const pct = Number(tx.taxPercentage ?? tx.TaxPercentage ?? tx.amount ?? 0)
              const taxAmt = Math.round(cBase * (pct / 100))
              if ((tx.taxName ?? tx.TaxName ?? '').toString().toUpperCase().includes('PB')) pb1 += taxAmt
              else if ((tx.taxName ?? tx.TaxName ?? '').toString().toUpperCase().includes('PPN')) ppn += taxAmt
            })
          }
        })
      }
    })
  } else {
    // normal item shape (local menu or remote Menu)
    const qty = Number(it.qty || 1)
    const price = Number(it.price || it.detailMenu?.Price || it.detailMenu?.price || 0)
    base = price * qty

    // taxes on item
    if (Array.isArray(it.taxes)) {
      it.taxes.forEach(tx => {
        const pct = Number(tx.taxPercentage ?? tx.TaxPercentage ?? tx.amount ?? 0)
        const taxAmt = Math.round(base * (pct / 100))
        if ((tx.taxName ?? tx.TaxName ?? '').toString().toUpperCase().includes('PB')) pb1 += taxAmt
        else if ((tx.taxName ?? tx.TaxName ?? '').toString().toUpperCase().includes('PPN')) ppn += taxAmt
      })
    }

    // condiments
    if (Array.isArray(it.condiments)) {
      it.condiments.forEach(c => {
        const cQty = Number(c.qty || 1)
        const cPrice = Number(c.price || 0)
        const cBase = cPrice * cQty * qty
        base += cBase
        if (Array.isArray(c.taxes)) {
          c.taxes.forEach(tx => {
            const pct = Number(tx.taxPercentage ?? tx.TaxPercentage ?? tx.amount ?? 0)
            const taxAmt = Math.round(cBase * (pct / 100))
            if ((tx.taxName ?? tx.TaxName ?? '').toString().toUpperCase().includes('PB')) pb1 += taxAmt
            else if ((tx.taxName ?? tx.TaxName ?? '').toString().toUpperCase().includes('PPN')) ppn += taxAmt
          })
        }
      })
    }
  }

  return { base: Math.round(base), pb1: Math.round(pb1), ppn: Math.round(ppn) }
}

export default function OrderStatus() {
  const router = useRouter()
  const { id } = router.query

  // local/derived states
  const [displayOrderId, setDisplayOrderId] = useState('')
  const [dataOrder, setDataOrder] = useState(null) // raw remote `data` object from API
  const [remoteOrderRaw, setRemoteOrderRaw] = useState(null) // full API response
  const [user, setUser] = useState(null)
  const [table, setTable] = useState('')
  const [currentStep, setCurrentStep] = useState(3)
  const [showAllItems, setShowAllItems] = useState(false)
  const [showPaymentRedirectModal, setShowPaymentRedirectModal] = useState(false)
  const [paymentRedirectUrl, setPaymentRedirectUrl] = useState('')
  const popupShownRef = useRef(false)
  const pollOrderRef = useRef(null)
  const [paymentAccepted, setPaymentAccepted] = useState(false) // when backend says payment received

  // items derived either from getPayment() (client cart) or remote dataOrder
  const [clientPayment, setClientPayment] = useState({ items: [], paymentTotal: 0 })

  // load session midtrans/do_order_result + user
  useEffect(() => {
    const s = sessionStorage.getItem('midtrans_tx')
    if (s) {
      try { setRemoteOrderRaw(prev => prev || JSON.parse(s)) } catch (e) { /* ignore */ }
    }

    // load stored do_order_result (maybe saved earlier)
    try {
      const doOrderRaw = sessionStorage.getItem('do_order_result')
      if (doOrderRaw) {
        const parsed = JSON.parse(doOrderRaw)
        // if it's full api response like { data: {...} } then parsed.data; else parsed
        const d = parsed?.data ?? parsed
        if (d) setDataOrder(d)
        setRemoteOrderRaw(parsed)
        // store orderCode if available into local state
        const oc = parsed?.data?.orderCode ?? parsed?.orderCode ?? null
        if (oc) {
          // show orderCode in header
          setDisplayOrderId(String(oc))
        }
      }
    } catch (e) { /* ignore */ }

    const dataUser = getUser?.() || null;
    setUser(dataUser)
    if (dataUser && dataUser.orderType === "DI") {
      setTable(`Table ${dataUser.tableNumber} • Dine In`)
    } else if (dataUser) {
      setTable(`Table ${dataUser.tableNumber} • Take Away`)
    }

    // load local cart payment snapshot (if any)
    try {
      const p = getPayment?.() || {}
      setClientPayment({ items: p.cart || [], paymentTotal: p.paymentTotal || 0 })
    } catch (e) { /* ignore */ }
  }, [])

  // derive displayOrderId from session if any
  useEffect(() => {
    try {
      const d = sessionStorage.getItem('display_order_id') || sessionStorage.getItem('displayOrderId')
      if (d) setDisplayOrderId(String(d))
    } catch (e) {}
  }, [])

  // derive items to render: prefer remote API dataOrder if present, else client snapshot
  const itemsFromRemote = (function () {
    if (!dataOrder) return []
    const arr = []
    // remote Combos (PascalCase)
    const combos = dataOrder.Combos ?? dataOrder.combos ?? []
    if (Array.isArray(combos)) {
      combos.forEach(cb => {
        // normalize to shape expected by renderComboDetails (it.combos[...] structure)
        const products = Array.isArray(cb.Products ?? cb.products) ? (cb.Products ?? cb.products) : []
        const mappedProducts = products.map(p => ({
          code: p.Code ?? p.code,
          name: p.Name ?? p.name,
          price: p.Price ?? p.price ?? 0,
          qty: p.Qty ?? p.qty ?? 1,
          taxes: Array.isArray(p.Taxes ?? p.taxes) ? (p.Taxes ?? p.taxes).map(t => ({
            taxName: t.TaxName ?? t.taxName ?? t.name ?? '',
            taxPercentage: t.TaxPercentage ?? t.taxPercentage ?? t.TaxPercentage ?? t.taxPercentage ?? (t.amount ?? 0),
            taxAmount: t.TaxAmount ?? t.taxAmount ?? 0
          })) : [],
          condiments: Array.isArray(p.Condiments ?? p.condiments) ? (p.Condiments ?? p.condiments) : [],
        }))

        arr.push({
          type: 'combo',
          combos: [{
            detailCombo: {
              code: cb.DetailCombo?.Code ?? cb.detailCombo?.code ?? '',
              name: cb.DetailCombo?.Name ?? cb.detailCombo?.name ?? ''
            },
            isFromMacro: !!cb.IsFromMacro,
            orderType: cb.OrderType ?? cb.orderType ?? '',
            products: mappedProducts,
            qty: cb.Qty ?? cb.Qty ?? 1,
            voucherCode: cb.VoucherCode ?? cb.voucherCode ?? null
          }],
          qty: cb.Qty ?? 1,
          detailCombo: {
            code: cb.DetailCombo?.Code ?? cb.detailCombo?.code ?? '',
            name: cb.DetailCombo?.Name ?? cb.detailCombo?.name ?? '',
            image: cb.DetailCombo?.Image ?? cb.detailCombo?.image ?? null
          },
          note: cb.Note ?? cb.note ?? '',
          image: cb.Image ?? cb.image ?? null,
          taxes: Array.isArray(cb.Taxes ?? cb.taxes) ? (cb.Taxes ?? cb.taxes) : []
        })
      })
    }

    // remote Menus
    const menus = dataOrder.Menus ?? dataOrder.menus ?? []
    if (Array.isArray(menus)) {
      menus.forEach(m => {
        arr.push({
          type: 'menu',
          price: m.DetailMenu?.Price ?? m.DetailMenu?.price ?? m.price ?? 0,
          qty: m.Qty ?? m.qty ?? 1,
          title: m.DetailMenu?.Name ?? m.DetailMenu?.name ?? m.name ?? '',
          name: m.DetailMenu?.Name ?? m.DetailMenu?.name ?? m.name ?? '',
          image: m.DetailMenu?.Image ?? m.DetailMenu?.image ?? null,
          condiments: Array.isArray(m.Condiments ?? m.condiments) ? (m.Condiments ?? m.condiments) : [],
          taxes: Array.isArray(m.Taxes ?? m.taxes) ? (m.Taxes ?? m.taxes) : []
        })
      })
    }

    return arr
  })()

  // If remote items exist, use them; otherwise fallback to clientPayment items
  const items = itemsFromRemote.length > 0 ? itemsFromRemote : (clientPayment.items || [])
  const itemsCount = items.length

  // compute totals using calculateItemTaxes
  let computedSubtotal = 0
  let computedPB1 = 0
  let computedPPN = 0

  items.forEach((it) => {
    const t = calculateItemTaxes(it)
    computedSubtotal += t.base
    computedPB1 += t.pb1
    computedPPN += t.ppn
  })

  computedSubtotal = Math.round(computedSubtotal)
  computedPB1 = Math.round(computedPB1)
  computedPPN = Math.round(computedPPN)

  const unroundedTotal = computedSubtotal + computedPB1 + computedPPN
  const roundedTotal = Math.round(unroundedTotal / 100) * 100
  const roundingAmount = roundedTotal - unroundedTotal
  const total = roundedTotal

  function handleToggleShowAll() {
    setShowAllItems(prev => !prev)
  }

  // helper: parse order_id from paymentLink (try decode percent-encoding)
  function parseOrderIdFromPaymentLink(link) {
    if (!link) return null
    try {
      // decode and search for order_id= or orderId=
      const decoded = decodeURIComponent(link)
      const m = decoded.match(/[?&]order_id=([^&]+)/i) || decoded.match(/[?&]orderId=([^&]+)/i) || decoded.match(/order_id%3D([^&]+)/i)
      if (m && m[1]) return decodeURIComponent(m[1])
    } catch (e) { /* ignore */ }
    return null
  }

  // fetchRemoteOrder (uses proxy route)
  async function fetchRemoteOrder(orderCodeToFetch) {
    if (!orderCodeToFetch) return null
    try {
      // use proxy in nextjs to avoid CORS / reveal keys
      const url = `/api/proxy/order/check-status?orderCode=${encodeURIComponent(orderCodeToFetch)}`
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      return j
    } catch (e) {
      console.warn('fetchRemoteOrder failed', e)
      return null
    }
  }

  // Polling remote order API (start when id available or when do_order_result exists)
  useEffect(() => {
    if (!router.isReady) return

    // select orderCode: prefer route id else do_order_result value
    let orderCodeToPoll = String(id || '').trim()
    if (!orderCodeToPoll) {
      try {
        const stored = sessionStorage.getItem('do_order_result')
        if (stored) {
          const parsed = JSON.parse(stored)
          orderCodeToPoll = parsed?.data?.orderCode ?? parsed?.orderCode ?? ''
        }
      } catch (e) { /* ignore */ }
    }

    if (!orderCodeToPoll) {
      // nothing to poll
      return
    }

    // ensure we store the orderCode display somewhere
    try { sessionStorage.setItem('current_order_code', orderCodeToPoll) } catch (e) {}

    let mounted = true

    async function checkOrder() {
      try {
        const apiResp = await fetchRemoteOrder(orderCodeToPoll)
        if (!apiResp || !apiResp.data) return
        if (!mounted) return

        // save raw and data
        setRemoteOrderRaw(apiResp)
        setDataOrder(apiResp.data)
        try { sessionStorage.setItem('do_order_result', JSON.stringify(apiResp)) } catch (e) {}

        // set orderCode display if present
        const oc = apiResp?.data?.orderCode ?? apiResp?.orderCode ?? null
        if (oc) setDisplayOrderId(String(oc))

        const statusNum = Number(apiResp.data.Status ?? apiResp.data.status ?? 0)

        if (statusNum === -1) {
          // step 4 (Pesanan Dibuat) — waiting payment
          setCurrentStep(4)

          // try to find displayOrderId for midtrans check
          const paymentLinkFromApi = (apiResp.data.PaymentLink ?? apiResp.data.paymentLink ?? apiResp.data.PaymentUrl ?? '') || ''
          const displayOrderIdFromApi = apiResp.data.DisplayOrderId ?? apiResp.data.displayOrderId ?? null
          const foundDisplayOrderId = displayOrderIdFromApi || parseOrderIdFromPaymentLink(paymentLinkFromApi) || sessionStorage.getItem('display_order_id')

          // check midtrans status if displayOrderId available
          if (foundDisplayOrderId) {
            try {
              const stResp = await fetch(`/api/midtrans/status?orderId=${encodeURIComponent(foundDisplayOrderId)}`)
              if (stResp.ok) {
                const stj = await stResp.json()
                const txStatus = (stj.transaction_status || stj.status || '').toString().toLowerCase()
                if (!['capture','settlement','success'].includes(txStatus)) {
                  // not paid -> show redirect popup once
                  const popupKey = `payment_redirect_shown:${orderCodeToPoll}`
                  const already = sessionStorage.getItem(popupKey)
                  if (!already && !popupShownRef.current) {
                    popupShownRef.current = true
                    try { sessionStorage.setItem(popupKey, '1') } catch (e) {}
                    setPaymentRedirectUrl(paymentLinkFromApi || sessionStorage.getItem('payment_link_for_order') || '')
                    setShowPaymentRedirectModal(true)
                  }
                } else {
                  // midtrans already success -> mark payment accepted
                  setCurrentStep(2)
                  setPaymentAccepted(true)
                }
              }
            } catch (e) {
              console.warn('midtrans status check failed inside order polling', e)
            }
          } else {
            // fallback: show popup if paymentLink exists (no displayOrderId)
            const paymentLinkExists = paymentLinkFromApi || sessionStorage.getItem('payment_link_for_order') || ''
            if (paymentLinkExists) {
              const popupKey = `payment_redirect_shown:${orderCodeToPoll}`
              const already = sessionStorage.getItem(popupKey)
              if (!already && !popupShownRef.current) {
                popupShownRef.current = true
                try { sessionStorage.setItem(popupKey, '1') } catch (e) {}
                setPaymentRedirectUrl(paymentLinkExists)
                setShowPaymentRedirectModal(true)
              }
            }
          }
        } else if (statusNum === 0) {
          // backend says payment done -> move to step 2
          setCurrentStep(2)
          setPaymentAccepted(true)
        } else if (statusNum === 2 || statusNum === 1) {
          // finished
          setCurrentStep(1)
        } else {
          // other statuses: don't change automatically
        }
      } catch (err) {
        console.warn('checkOrder error', err)
      }
    }

    // initial check & interval
    checkOrder()
    pollOrderRef.current = setInterval(checkOrder, 5000)

    return () => {
      mounted = false
      if (pollOrderRef.current) {
        clearInterval(pollOrderRef.current)
        pollOrderRef.current = null
      }
    }
  }, [router.isReady, id])

  // Steps definitions — adapt title/desc for paymentAccepted flag
  const baseSteps = [
    { key: 1, title: 'Pesanan Selesai', desc: 'Pesanan sudah selesai', img : '/images/check-icon.png'},
    { key: 2, title: 'Makanan Sedang Disiapkan', desc: 'Pesanan kamu sedang disiapkan', img : '/images/bowl-icon.png' },
    { key: 3, title: 'Pembayaran Pending', desc: 'Silahkan selesesaikan pembayaran kamu', img : '/images/wallet-icon.png' },
    { key: 4, title: 'Pesanan Dibuat', desc: 'Pesanan kamu sudah masuk', img : '/images/mobile-icon.png' },
  ]

  const steps = baseSteps.map(s => {
    if (s.key === 3 && paymentAccepted) {
      return { ...s, title: 'Pembayaran Berhasil', desc: 'Pembayaran kamu sudah diterima' }
    }
    return s
  })

  // decide visibleItems for rendering: if showAllItems true -> all, else first item-only
  const visibleItems = showAllItems ? items : (itemsCount > 0 ? [items[0]] : [])

  // merchant contact helper (ke WhatsApp)
  const MERCHANT_PHONE = '+628123456789'
  async function contactMerchant() {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(MERCHANT_PHONE)
      }
    } catch (e) {}
    const normalized = MERCHANT_PHONE.replace(/\D/g, '')
    if (normalized) {
      const waUrl = `https://wa.me/${normalized}`
      window.open(waUrl, '_blank', 'noopener')
      alert(`Nomor kontak disalin ke clipboard: ${MERCHANT_PHONE}\nMembuka WhatsApp...`)
    } else {
      alert(`Hubungi merchant: ${MERCHANT_PHONE}`)
    }
  }

  // Modal actions for payment redirect
  function onModalCancel() {
    setShowPaymentRedirectModal(false)
  }
  function onModalProceed() {
    setShowPaymentRedirectModal(false)
    if (paymentRedirectUrl) {
      try { sessionStorage.setItem(`payment_redirect_attempted:${displayOrderId || id}`, '1') } catch (e) {}
      window.location.href = paymentRedirectUrl
    } else {
      alert('Tautan pembayaran tidak tersedia.')
    }
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
            <Image src="/images/bell-icon.png" alt="Bell" width={20} height={20} style={{ paddingRight: 5 }} />
            {table}
          </div>
          <div className={styles.storeName}>Yoshinoya - Mall Grand Indonesia</div>
        </div>

        <div className={styles.orderNumberBox}>
          <div className={styles.smallText}>Nomor Orderan</div>
          <div className={styles.orderNumber}>{String(displayOrderId || '-' )}</div>
        </div>
      </div>

      {/* TRACK ORDER */}
      <div className={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className={styles.trackTitle}>Track Orderan</div>
        </div>

        <div className={styles.trackLineWrap}>
          <div className={styles.trackLine}></div>

          <div className={styles.stepsWrap}>
            {steps.map((s) => {
              // mapping: s.key < currentStep => done, s.key === currentStep => ongoing, else upcoming
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
                <div className={styles.itemAddon}>
                  {(it.qty || 1)}x {it.note || (it.addons && it.addons.length ? it.addons.map(a => a.group || a.name).join(', ') : 'No Note')}
                </div>
              </div>

              <div className={styles.itemPrice}>{formatRp(Number(it.price || it.detailMenu?.Price || 0) * (Number(it.qty || 1)))}</div>
            </div>
          ))}
        </div>

        {itemsCount > 1 && (
          <button className={styles.viewAllBtn} onClick={handleToggleShowAll} type="button" aria-expanded={showAllItems}>
            <span className={styles.viewAllText}>{showAllItems ? 'Lebih Sedikit' : 'Lihat Semua'}</span>
          </button>
        )}
      </div>

      {/* PAYMENT METHOD & DETAILS */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Pilih Metode Pembayaran</div>

        <div className={styles.paymentBox}>
          <div className={styles.paymentBoxHeader}>
            <div className={styles.paymentBoxTitle}>Pembayaran Online</div>

            <Image src="/images/pembayaran-online.png" alt="pembayaran online" width={50} height={50} className={styles.paymentBoxIcon} />
          </div>
        </div>

        <div className={styles.paymentItem}>
          <div className={styles.paymentItemLeft}>
            <img src="/images/pay-gopay.png" alt="logo" width={55} height={14} className={styles.iconImg} />
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
          <div>PPN (11%)</div>
          <div className={styles.paymentValue}>{formatRp(computedPPN)}</div>
        </div>

        <div className={styles.paymentRow}>
          <div>Rounding</div>
          <div className={styles.paymentValue}>{formatRp(roundingAmount)}</div>
        </div>

        <div className={styles.paymentTotalRow}>
          <div>Total</div>
          <div className={styles.paymentTotalValue}>{formatRp(total)}</div>
        </div>
      </div>

      {/* Hoverbar */}
      <div className={styles.hoverBarWrap} role="region" aria-label="Aksi pesanan">
        <div className={styles.hoverBar}>
          <button className={styles.btnDownload} onClick={() => router.push(`/bill/${displayOrderId || id}`)} aria-label="Download bill" type="button">
            <span>Download Bill</span>
          </button>

          <button className={styles.btnContact} onClick={contactMerchant} aria-label="Kontak merchant" type="button">
            <span>Kontak</span>
          </button>
        </div>
      </div>

      {/* Payment redirect modal (appears 1x) */}
      {showPaymentRedirectModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Pembayaran belum selesai</h3>
            <p>Sepertinya pembayaran belum selesai. Lanjutkan pembayaran sekarang?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                className={styles.btnSecondary}
                onClick={onModalCancel}
                style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', color: '#b91c1c' }} // cancel red visual
              >
                Batal
              </button>
              <button
                className={styles.btnPrimary}
                onClick={onModalProceed}
                style={{ background: '#16a34a', color: '#fff' }} // green agree
              >
                Lanjutkan Pembayaran
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 72 }} />
    </div>
  )
}
