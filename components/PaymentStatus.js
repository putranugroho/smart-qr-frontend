// pages/paymentstatus.js
import { useRouter } from 'next/router'
import { useEffect, useState, useRef } from 'react'
import styles from '../styles/PaymentStatus.module.css'
import { getPayment } from '../lib/cart'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

export default function PaymentStatus() {
  const router = useRouter()
  const [tx, setTx] = useState(null)
  const [orderMeta, setOrderMeta] = useState(null)
  const [timeLeft, setTimeLeft] = useState(15 * 60) // contoh 15 menit
  const [checking, setChecking] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [redirecting, setRedirecting] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [qrDataUri, setQrDataUri] = useState(null) // holds data:image/...;base64,...
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState(null)
  const pollRef = useRef(null)

  // --- Load tx & meta from sessionStorage
  useEffect(() => {
    const s = sessionStorage.getItem('midtrans_tx')
    const meta = sessionStorage.getItem('order_meta')
    if (s) {
      try { setTx(JSON.parse(s)) } catch (e) { console.warn('Invalid midtrans_tx', e) }
    }
    if (meta) {
      try { setOrderMeta(JSON.parse(meta)) } catch (e) { console.warn('Invalid order_meta', e) }
    }
    setIsMounted(true)
  }, [])

  // --- Countdown
  useEffect(() => {
    const i = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000)
    return () => clearInterval(i)
  }, [])

  // helper: determine normalized payment method (lowercase)
  function getNormalizedMethod(txObj) {
    if (!txObj) return ''
    const raw = (txObj.method || txObj.payment_type || txObj.core_response?.payment_type || '').toString()
    return raw.toLowerCase()
  }

  // helper: find action by names (case-insensitive)
  function findAction(actions = [], names = []) {
    if (!actions || !Array.isArray(actions)) return null
    for (const n of names) {
      const found = actions.find(a => a.name && a.name.toString().toLowerCase() === n.toLowerCase())
      if (found) return found
    }
    // fallback: try includes for generate-qr-code-v2 like names
    for (const a of actions) {
      if (!a.name) continue
      const ln = a.name.toLowerCase()
      if (names.some(n => ln.includes(n.toLowerCase()))) return a
    }
    return null
  }

  // --- Polling: check status immediately and then every 5s
  useEffect(() => {
    async function check() {
      if (!orderMeta?.orderId) return
      try {
        const r = await fetch(`/api/midtrans/status?orderId=${encodeURIComponent(orderMeta.orderId)}`)
        const j = await r.json()
        setStatusMessage(JSON.stringify(j, null, 2))
        const txStatus = (j.transaction_status || j.status || '').toString().toLowerCase()
        if (['capture','settlement','success'].includes(txStatus)) {
          // stop poll and redirect to order page
          stopPolling()
          router.push(`/order/${orderMeta.orderId}`)
        }
      } catch (err) {
        console.warn('status check failed', err)
      }
    }

    function startPolling() {
      if (pollRef.current) return
      check()
      pollRef.current = setInterval(check, 5000)
    }

    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    // start if we have orderMeta
    if (orderMeta?.orderId) startPolling()

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [orderMeta, router])

  // --- Auto deeplink: only attempt ONCE per order (first visit)
  useEffect(() => {
    if (!tx) return
    const method = getNormalizedMethod(tx)
    // Only for e-wallets (not qris)
    if (!(method === 'gopay' || method === 'ovo' || method === 'shopeepay')) return

    // build actions array
    const actions = tx.actions || tx.core_response?.actions || []

    // find deeplink url (try several possible action names)
    const deeplinkAction = findAction(actions, ['deeplink-redirect', 'deeplink'])
    const urlAction = findAction(actions, ['mobile_deeplink_web', 'mobile_web_checkout_url', 'url'])
    const deeplinkUrl = deeplinkAction?.url || urlAction?.url || tx.deeplink_url || tx.core_response?.deeplink_url || null

    if (!deeplinkUrl) return

    // flag key per order to ensure only attempt once
    const orderId = orderMeta?.orderId || tx.order_id || tx.orderId || tx.raw?.order_id
    if (!orderId) return

    const flagKey = `midtrans_deeplink_attempted:${orderId}`

    // if already attempted before, do not auto-redirect
    const alreadyAttempted = sessionStorage.getItem(flagKey)
    if (alreadyAttempted) {
      // do nothing (user can press manual button)
      return
    }

    // Only attempt auto-redirect on mobile devices
    const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent || '')
    if (!isMobile) return

    // Mark attempted now so subsequent returns won't auto-redirect
    try { sessionStorage.setItem(flagKey, 'true') } catch (e) { /* ignore */ }

    // set redirecting state (UI can show spinner if needed)
    setRedirecting(true)
    // small delay to let UI render
    setTimeout(() => {
      try {
        // perform navigation to deeplink (opens app on device or simulator URL in sandbox)
        window.location.href = deeplinkUrl
      } catch (err) {
        console.warn('deeplink redirect failed', err)
      } finally {
        // leave redirecting true briefly; user will return or app will open
        setTimeout(() => setRedirecting(false), 1000)
      }
    }, 600)
  }, [tx, orderMeta])

  // --- Fetch QR as data URI via local convert API (only for QRIS)
  useEffect(() => {
    let mounted = true
    async function fetchQrDataUri(imgUrl) {
      if (!imgUrl) return
      try {
        setQrError(null)
        setQrLoading(true)
        // call local proxy that converts remote image -> base64/datauri
        const api = `/api/convert-image-to-base64?imageUrl=${encodeURIComponent(imgUrl)}&mode=datauri`
        const r = await fetch(api)
        if (!mounted) return
        if (!r.ok) {
          // try json response body for debugging
          const txt = await r.text().catch(() => null)
          setQrError('failed to convert (status ' + r.status + ')')
          console.warn('convert-api error', r.status, txt)
          return
        }
        const j = await r.json()
        if (!mounted) return
        // prefer dataUri field
        const dataUri = j?.dataUri || (j?.data?.Base64Image ? `data:image/png;base64,${j.data.Base64Image}` : null)
        if (dataUri) {
          setQrDataUri(dataUri)
        } else {
          setQrError('convert API returned no dataUri')
          console.warn('convert-api returned', j)
        }
      } catch (err) {
        console.warn('fetchQrDataUri error', err)
        if (mounted) setQrError(String(err))
      } finally {
        if (mounted) setQrLoading(false)
      }
    }

    if (!tx) return
    const method = getNormalizedMethod(tx)
    if (method !== 'qris') return

    const actions = tx.actions || tx.core_response?.actions || []
    const qrV2 = findAction(actions, ['generate-qr-code-v2'])
    const qrV1 = findAction(actions, ['generate-qr-code'])
    const qrUrlFromResp = tx.qr_url || tx.qrUrl || tx.qr_image || null
    const redirectUrl = tx.redirect_url || tx.raw?.redirect_url || null
    const imgUrl = qrV1?.url || qrV2?.url || qrUrlFromResp || redirectUrl

    // reset previous state if different url
    setQrDataUri(null)
    setQrError(null)

    if (imgUrl) {
      // fetchQrDataUri(imgUrl)
    }

    return () => { mounted = false }
  }, [tx])

  // --- Manual check triggered by button
  async function checkStatus() {
    const orderId = orderMeta?.orderId
    if (!orderId) return alert('Order ID tidak ditemukan')
    setChecking(true)
    try {
      const r = await fetch(`/api/midtrans/status?orderId=${encodeURIComponent(orderId)}`)
      const j = await r.json()
      setStatusMessage(JSON.stringify(j, null, 2))
      const txStatus = (j.transaction_status || j.status || '').toString().toLowerCase()
      if (['capture','settlement','success'].includes(txStatus)) {
        router.push(`/order/${orderId}`)
      } else {
        alert('Status: ' + (j.transaction_status || j.status || 'unknown'))
      }
    } catch (err) {
      console.error(err)
      alert('Gagal cek status: ' + (err.message || err))
    } finally {
      setChecking(false)
    }
  }

  // --- Manual deeplink open (user-initiated)
  function openDeeplinkManually() {
    if (!tx) return
    const actions = tx.actions || tx.core_response?.actions || []
    const deeplinkAction = findAction(actions, ['deeplink-redirect', 'deeplink'])
    const urlAction = findAction(actions, ['mobile_deeplink_web', 'mobile_web_checkout_url', 'url'])
    const deeplinkUrl = deeplinkAction?.url || urlAction?.url || tx.deeplink_url || tx.core_response?.deeplink_url || null
    if (!deeplinkUrl) return alert('Tautan deeplink tidak tersedia.')

    // set attempted flag too (to prevent future auto redirect)
    const orderId = orderMeta?.orderId || tx.order_id || tx.orderId || tx.raw?.order_id
    if (orderId) {
      try { sessionStorage.setItem(`midtrans_deeplink_attempted:${orderId}`, 'true') } catch (e) {}
    }

    // open deeplink (user-initiated)
    window.location.href = deeplinkUrl
  }

  // --- Render area
  function renderPaymentArea() {
    if (!tx) return <div className={styles.qrLoading}></div>

    const method = getNormalizedMethod(tx)
    const actions = tx.actions || tx.core_response?.actions || []

    // QRIS: show QR and make it fit inside the box (no scrolling, full visible)
    if (method === 'qris') {
      const qrV2 = findAction(actions, ['generate-qr-code-v2'])
      const qrV1 = findAction(actions, ['generate-qr-code'])
      const qrUrlFromResp = tx.qr_url || tx.qrUrl || tx.qr_image || null
      const redirectUrl = tx.redirect_url || tx.raw?.redirect_url || null

      // prefer v2 then v1 then other fallbacks
      const imgUrl = qrV2?.url || qrV1?.url || qrUrlFromResp || redirectUrl
      const isLikelyImage = imgUrl && imgUrl.match(/\.(png|jpg|jpeg|svg|webp)(\?|$)/i)

      if (imgUrl) {
        // if we have dataUri from converter, show it (preferred)
        if (qrDataUri && !qrError) {
          return (
            <div className={styles.qrWrap}>
              <img src={qrDataUri} alt="QRIS" className={styles.qrImage} />
            </div>
          )
        }

        // show direct image if converter pending or failed but URL seems image
        if (isLikelyImage) {
          return (
            <div className={styles.qrWrap}>
              {qrLoading && <div className={styles.qrLoading}></div>}
              <img src={imgUrl} alt="QRIS" className={styles.qrImage} />
            </div>
          )
        }

        // fallback: embed simulator HTML in iframe
        return (
          <div className={styles.qrWrap}>
            {qrLoading && <div className={styles.qrLoading}></div>}
            <iframe src={imgUrl} title="QRIS Payment" className={styles.qrIframe} />
            {qrError && <div className={styles.qrError}>Gagal memuat QR: {qrError}</div>}
          </div>
        )
      }

      return <div>QRIS: kode QR tidak tersedia (silakan coba kembali).</div>
    }

    // E-wallets: show deeplink button (desktop) or we already attempted auto-redirect on mobile
    if (method === 'gopay' || method === 'ovo' || method === 'shopeepay') {
      const deeplinkAction = findAction(actions, ['deeplink-redirect', 'deeplink'])
      const urlAction = findAction(actions, ['mobile_deeplink_web', 'mobile_web_checkout_url', 'url'])
      const deeplinkUrl = deeplinkAction?.url || urlAction?.url || tx.deeplink_url || tx.core_response?.deeplink_url

      // Determine if auto attempt already happened (so UI can reflect)
      const orderId = orderMeta?.orderId || tx.order_id || tx.orderId || tx.raw?.order_id
      const flagKey = orderId ? `midtrans_deeplink_attempted:${orderId}` : null
      const alreadyAttempted = flagKey ? sessionStorage.getItem(flagKey) : null

      return (
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 8 }}>Metode: {tx.method}</div>
          {deeplinkUrl ? (
            <>
              <div style={{ marginBottom: 12 }}>
                {alreadyAttempted ? 'Auto-redirect sudah dicoba. Tekan tombol di bawah untuk membuka kembali aplikasinya:' : 'Tekan tombol untuk membuka aplikasi pembayaran:'}
              </div>
              <button className={styles.checkBtn} onClick={openDeeplinkManually} disabled={redirecting}>
                {redirecting ? 'Mengarahkan...' : `Redirect Pembayaran`}
              </button>
              <div style={{ marginTop: 12, wordBreak: 'break-all' }}>{deeplinkUrl}</div>
            </>
          ) : (
            <div>Tautan pembayaran tidak tersedia. Silakan gunakan tombol Check Status.</div>
          )}
        </div>
      )
    }

    // fallback: show raw info
    return <div>Instruksi pembayaran tidak tersedia.</div>
  }

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const seconds = String(timeLeft % 60).padStart(2, '0')

  // show total if available in orderMeta or via getPayment
  const payment = getPayment?.() || {}
  const subtotal = orderMeta?.total || payment.paymentTotal || 0

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/checkout')}>←</button>
        <div className={styles.headerTitle}>Pembayaran</div>
      </header>

      <div className={styles.timerBar}>
        <div>Selesaikan pembayaran dalam</div>
        <div className={styles.timerText}>{minutes}:{seconds}</div>
      </div>

      <div className={styles.totalBox}>
        <div className={styles.totalLabel}>Total Pesanan</div>
        <div className={styles.totalPrice}>{isMounted ? formatRp(subtotal) : 'Rp 0'}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        {renderPaymentArea()}
      </div>

      <div className={styles.instruction}>Silahkan lakukan pembayaran menggunakan aplikasi pembayaran pilihan kamu</div>

      <div className={styles.sticky}>
        <button className={styles.checkBtn} onClick={checkStatus} disabled={checking}>
          {checking ? 'Memeriksa...' : 'Check Status Pembayaran'}
        </button>
      </div>

      {statusMessage && (
        <pre style={{ marginTop: 12, background: '#f5f5f5', padding: 12, maxHeight: 240, overflow: 'auto' }}>
          {statusMessage}
        </pre>
      )}
    </div>
  )
}
