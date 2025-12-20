// pages/paymentstatus.js
import { useRouter } from 'next/router'
import { useEffect, useState, useRef } from 'react'
import styles from '../styles/PaymentStatus.module.css'
import { getPayment } from '../lib/cart'
import Image from 'next/image'
import QRCode from 'qrcode'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

export default function PaymentStatus() {
  const router = useRouter()
  // ===== PATCH: orderCode fallback from URL (GoPay / deeplink safe) =====
  const {
    orderCode: queryOrderCode,
    order_id: queryOrderId,
  } = router.query
  const [tx, setTx] = useState(null)
  const [orderMeta, setOrderMeta] = useState(null)
  const [timeLeft, setTimeLeft] = useState(15 * 60)
  const [checking, setChecking] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [redirecting, setRedirecting] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [orderCode, setOrderCode] = useState(null)
  const [qrDataUri, setQrDataUri] = useState(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState(null)
  const pollRef = useRef(null)

  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const leaveResolveRef = useRef(null)

  const [statusLogs, setStatusLogs] = useState([])

  useEffect(() => {
    const s = sessionStorage.getItem('midtrans_tx')
    const meta = sessionStorage.getItem('order_meta')
    const r = sessionStorage.getItem('do_order_result')

    if (r) {
      try {
        const parsed = JSON.parse(r)
        setOrderCode(parsed?.data?.orderCode || null)
      } catch (e) {
        console.warn("invalid do_order_result session", e)
      }
    }
    if (s) {
      try { setTx(JSON.parse(s)) } catch (e) { console.warn('Invalid midtrans_tx', e) }
    }
    if (meta) {
      try { setOrderMeta(JSON.parse(meta)) } catch (e) { console.warn('Invalid order_meta', e) }
    }

    setIsMounted(true)
  }, [])

  // ===== PATCH: restore orderCode from URL when sessionStorage is lost =====
  useEffect(() => {
    if (orderCode) return

    const fallback =
      queryOrderCode ||
      queryOrderId ||
      null

    if (fallback) {
      console.warn('[paymentstatus] orderCode restored from URL:', fallback)
      setOrderCode(String(fallback))
    }
  }, [queryOrderCode, queryOrderId, orderCode])

  useEffect(() => {
    const i = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000)
    return () => clearInterval(i)
  }, [])

  function getNormalizedMethod(txObj) {
    if (!txObj) return ''
    const raw = (txObj.method || txObj.payment_type || txObj.core_response?.payment_type || '').toString()
    return raw.toLowerCase()
  }

  function findAction(actions = [], names = []) {
    if (!actions || !Array.isArray(actions)) return null
    for (const n of names) {
      const found = actions.find(a => a.name && a.name.toString().toLowerCase() === n.toLowerCase())
      if (found) return found
    }
    for (const a of actions) {
      if (!a.name) continue
      const ln = a.name.toLowerCase()
      if (names.some(n => ln.includes(n.toLowerCase()))) return a
    }
    return null
  }

  async function downloadDataUri(uriOrUrl, filename = 'qris.png') {
    try {
      if (typeof uriOrUrl === 'string' && uriOrUrl.startsWith('data:')) {
        const a = document.createElement('a')
        a.href = uriOrUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        return true
      }

      if (typeof uriOrUrl === 'string' && /^[A-Za-z0-9+/=]+\s*$/.test(uriOrUrl) && uriOrUrl.length > 100) {
        const dataUri = `data:image/pngbase64,${uriOrUrl}`
        const a = document.createElement('a')
        a.href = dataUri
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        return true
      }

      const resp = await fetch(uriOrUrl, { mode: 'cors' })
      if (!resp.ok) throw new Error('Fetch failed: ' + resp.status)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 3000)
      return true
    } catch (err) {
      console.error('downloadDataUri error', err)
      return false
    }
  }

  function pushLog(entry) {
    const ts = new Date().toISOString()
    const full = { ts, ...entry }
    setStatusLogs(prev => {
      const next = [full, ...prev]
      if (next.length > 50) next.length = 50
      return next
    })
  }

  useEffect(() => {
    async function check() {
      const orderId = tx?.order_id || tx?.orderId || orderMeta?.orderId || tx?.raw?.order_id
      if (!orderId) return

      try {
        const r = await fetch(`/api/midtrans/status?orderId=${encodeURIComponent(orderId)}`)
        const j = await r.json()
        const txStatus = (j?.transaction_status || j?.status || '').toLowerCase()

        if (['capture', 'settlement', 'success'].includes(txStatus)) {
          if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
          setPaymentSuccess(true)
          setTimeout(() => {
            router.push(`/order/${orderCode || orderId}`)
          }, 600)
        }
      } catch (err) {
        console.warn('status check failed', err)
      }
    }

    if (tx || orderMeta) {
      check()
      pollRef.current = setInterval(check, 5000)
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [tx, orderMeta, orderCode, router])

  /* ===================== PATCH START =======================
     Backend order-status polling (after e-wallet / QR return)
     ======================================================== */
  const backendPollRef = useRef(null)

  async function checkBackendOrderStatus() {
     if (!orderCode) {
      console.warn('[paymentstatus] orderCode missing → backend polling skipped')
      return
    }
    try {
      const resp = await fetch(`/api/order/check-status?orderCode=${encodeURIComponent(orderCode)}`)
      const j = await resp.json()
      if (j?.success && j?.data?.status === 0) {
        if (backendPollRef.current) {
          clearInterval(backendPollRef.current)
          backendPollRef.current = null
        }
        setPaymentSuccess(true)
        setTimeout(() => {
          router.push(`/order/${orderCode}`)
        }, 500)
      }
    } catch (e) {
      console.warn('[paymentstatus] backend polling error', e)
    }
  }

  useEffect(() => {
    let mounted = true

    async function fetchQrDataUri(imgUrl) {
      if (!imgUrl) return null
      try {
        setQrError(null)
        setQrLoading(true)
        const api = `/api/convert-image-to-base64?imageUrl=${encodeURIComponent(imgUrl)}&mode=datauri`
        const r = await fetch(api)
        const txt = await r.text().catch(() => null)
        let j = null
        try { j = txt ? JSON.parse(txt) : null } catch (e) { j = null }
        if (!r.ok) {
          return null
        }
        const dataUri = (j && (j.dataUri || (j.data && j.data.Base64Image ? `data:image/pngbase64,${j.data.Base64Image}` : null))) || null
        if (!dataUri) {
          return null
        }
        if (!mounted) return null
        setQrDataUri(dataUri)
        return dataUri
      } catch (err) {
        console.warn('[QR] fetchQrDataUri error', err)
        if (mounted) setQrError(String(err))
        return null
      } finally {
        if (mounted) setQrLoading(false)
      }
    }

    async function generateFromQrString(qrString) {
      if (!qrString) return null
      try {
        setQrError(null)
        setQrLoading(true)
        const dataUrl = await QRCode.toDataURL(qrString, {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 800
        })
        if (!mounted) return null
        setQrDataUri(dataUrl)
        return dataUrl
      } catch (err) {
        console.warn('[QR] QR generate error', err)
        if (mounted) setQrError(String(err))
        return null
      } finally {
        if (mounted) setQrLoading(false)
      }
    }

    if (!tx) return () => { mounted = false }

    const method = getNormalizedMethod(tx)
    if (method !== 'qris') {
      return () => { mounted = false }
    }

    const actions = tx.actions || tx.core_response?.actions || []

    const qrString = tx.qr_string || tx.core_response?.qr_string || tx.raw?.qr_string || null
    if (qrString) {
      generateFromQrString(qrString)
      return () => { mounted = false }
    }

    const qrV1 = findAction(actions, ['generate-qr-code'])
    const qrV2 = findAction(actions, ['generate-qr-code-v2'])
    const qrUrlFromResp = tx.qr_url || tx.qrUrl || tx.qr_image || null
    const redirectUrl = tx.redirect_url || tx.raw?.redirect_url || null

    const imgUrl = (qrV1 && qrV1.url) || (qrV2 && qrV2.url) || qrUrlFromResp || redirectUrl || null


    setQrDataUri(null)
    setQrError(null)

    if (imgUrl) {
      (async () => {
        const dataUri = await fetchQrDataUri(imgUrl)
        if (!dataUri) {
          console.warn('[QR] converter returned no usable dataUri for', imgUrl)
        }
      })()
    } else {
      console.warn('[QR] no imgUrl found to convert')
      setQrError('No QR URL available to convert.')
    }

    return () => { mounted = false }
  }, [tx])

  function openDeeplinkManually() {
    if (!tx) return
    const actions = tx.actions || tx.core_response?.actions || []
    const deeplinkAction = findAction(actions, ['deeplink-redirect', 'deeplink'])
    const urlAction = findAction(actions, ['mobile_deeplink_web', 'mobile_web_checkout_url', 'url'])
    const deeplinkUrl = deeplinkAction?.url || urlAction?.url || tx.deeplink_url || tx.core_response?.deeplink_url || null
    if (!deeplinkUrl) return alert('Tautan deeplink tidak tersedia.')

    const orderId = orderMeta?.orderId || tx.order_id || tx.orderId || tx.raw?.order_id
    if (orderId) {
      try { sessionStorage.setItem(`midtrans_deeplink_attempted:${orderId}`, 'true') } catch (e) {}
    }

    window.location.href = deeplinkUrl
  }

  // NAV GUARD
  function askConfirmLeave() {
    return new Promise(resolve => {
      leaveResolveRef.current = resolve
      handleModalAnswer(true)
    })
  }

  function handleModalAnswer(answer) {
    const resolve = leaveResolveRef.current
    leaveResolveRef.current = null
    if (typeof resolve === 'function') resolve(Boolean(answer))
  }

  async function handleBackButtonClick() {
    const ok = await askConfirmLeave()
    if (ok) {
      router.push('/checkout')
    }
  }

  useEffect(() => {
    if (!orderCode) return

    checkBackendOrderStatus()

    if (!backendPollRef.current) {
      backendPollRef.current = setInterval(checkBackendOrderStatus, 3000)
    }

    return () => {
      if (backendPollRef.current) {
        clearInterval(backendPollRef.current)
        backendPollRef.current = null
      }
    }
  }, [orderCode])

  useEffect(() => {
    if (!tx) return

    const method = getNormalizedMethod(tx)
    if (!['gopay', 'ovo', 'shopeepay'].includes(method)) return

    const actions = tx.actions || tx.core_response?.actions || []
    const deeplinkAction = findAction(actions, ['deeplink-redirect', 'deeplink'])
    const urlAction = findAction(actions, ['mobile_deeplink_web', 'mobile_web_checkout_url', 'url'])
    const deeplinkUrl =
      deeplinkAction?.url ||
      urlAction?.url ||
      tx.deeplink_url ||
      tx.core_response?.deeplink_url ||
      null

    if (!deeplinkUrl) return

    const orderId =
      orderMeta?.orderId ||
      tx.order_id ||
      tx.orderId ||
      tx.raw?.order_id

    if (!orderId) return

    const flagKey = `midtrans_deeplink_attempted:${orderId}`
    const alreadyAttempted = sessionStorage.getItem(flagKey)

    if (alreadyAttempted) return

    try {
      sessionStorage.setItem(flagKey, 'true')
    } catch (e) {}

    console.warn('[paymentstatus] auto deeplink redirect →', method)

    setRedirecting(true)

    // slight delay to ensure UI render complete
    const t = setTimeout(() => {
      window.location.href = deeplinkUrl
    }, 300)

    return () => clearTimeout(t)
  }, [tx, orderMeta])
  /* ====================== PATCH END ======================= */

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const seconds = String(timeLeft % 60).padStart(2, '0')

  const payment = getPayment?.() || {}
  const subtotal = payment.paymentTotal || orderMeta?.total || 0

  if (paymentSuccess) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <button className={styles.backBtn} onClick={() => router.push('/checkout')}>←</button>
          <div className={styles.headerTitle}>Pembayaran</div>
        </header>

        <div className={styles.successWrap}>
          <Image src="/images/order-success.png" width={128} height={128} alt="success" className={styles.successImage} />
        </div>

        <div className={styles.successTitle}>Pembayaran berhasil!</div>
        <div className={styles.successDesc}>Sedang mengarahkan ke status pesanan</div>

        <div className={styles.sticky}>
          <button className={styles.checkBtn} onClick={() => {
            const code = orderCode || (JSON.parse(sessionStorage.getItem('do_order_result')||'{}')?.data?.orderCode)
            router.push(`/order/${code}`)
          }}>Lihat Status Pesanan</button>
        </div>
      </div>
    )
  }

  function renderPaymentArea() {
    if (!tx) return <div className={styles.qrLoading}></div>

    const method = getNormalizedMethod(tx)
    const actions = tx.actions || tx.core_response?.actions || []

    if (method === 'qris') {
      const qrV2 = findAction(actions, ['generate-qr-code-v2'])
      const qrV1 = findAction(actions, ['generate-qr-code'])
      const qrUrlFromResp = tx.qr_url || tx.qrUrl || tx.qr_image || null
      const redirectUrl = tx.redirect_url || tx.raw?.redirect_url || null

      const imgUrl = qrV2?.url || qrV1?.url || qrUrlFromResp || redirectUrl
      const isLikelyImage = imgUrl && imgUrl.match(/\.(png|jpg|jpeg|svg|webp)(\?|$)/i)

      if (imgUrl) {
        const displaySrc = qrDataUri || (isLikelyImage ? imgUrl : null)

        if (displaySrc) {
          const filenameBase = (orderCode || orderMeta?.orderCode || orderMeta?.orderId || tx.order_id || 'qris')
            .toString().replace(/[^a-z0-9\-_.]/gi, '_')
          const filename = `${filenameBase}_qr.png`

          return (
            <div className={styles.qrWrap} style={{ textAlign: 'center' }}>
              {qrLoading && <div className={styles.qrLoading}></div>}

              <div className={styles.qrLogo} style={{ marginBottom: 12 }}>
                <img
                  src={displaySrc}
                  alt="QRIS"
                  className={styles.qrImage}
                  style={{ maxWidth: 320, width: '70%', height: 'auto', imageRendering: 'pixelated' }}
                />
              </div>

              <button
                className={styles.checkBtn}
                onClick={async () => {
                  const ok = await downloadDataUri(displaySrc, filename)
                  if (!ok) alert('Gagal mengunduh QR. Coba buka di tab baru lalu simpan.')
                }}
              >
                Simpan ke Galeri / Sceenshot Barcode QRIS
              </button>

              {qrError && <div className={styles.qrError} style={{ marginTop: 8 }}>{qrError}</div>}
            </div>
          )
        }

        return (
          <div className={styles.qrWrap}>
            {qrLoading && <div className={styles.qrLoading}></div>}
            <div style={{ marginBottom: 12 }}>
              QR tersedia di URL eksternal yang tidak bisa di-embed pada halaman ini.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.checkBtn} onClick={() => window.open(imgUrl, '_blank', 'noopener')}>Buka QR di Tab Baru</button>
              <button className={styles.btnSecondary} onClick={async () => {
                const ok = await downloadDataUri(imgUrl, `${orderCode || 'qris'}_qr.png`)
                if (!ok) alert('Gagal mengunduh langsung. Pastikan API converter tersedia atau gunakan tombol buka di tab baru.')
              }}>Download via URL</button>
            </div>

            {qrError && <div className={styles.qrError} style={{ marginTop: 8 }}>{qrError}</div>}
          </div>
        )
      }

      return <div>QRIS: kode QR tidak tersedia (silakan coba kembali).</div>
    }

    if (method === 'gopay' || method === 'ovo' || method === 'shopeepay') {
      const deeplinkAction = findAction(actions, ['deeplink-redirect', 'deeplink'])
      const urlAction = findAction(actions, ['mobile_deeplink_web', 'mobile_web_checkout_url', 'url'])
      const deeplinkUrl = deeplinkAction?.url || urlAction?.url || tx.deeplink_url || tx.core_response?.deeplink_url

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
              {/* <div style={{ marginTop: 12, wordBreak: 'break-all' }}>{deeplinkUrl}</div> */}
            </>
          ) : (
            <div>Tautan pembayaran tidak tersedia. Silakan gunakan tombol Check Status.</div>
          )}
        </div>
      )
    }

    return <div>Instruksi pembayaran tidak tersedia.</div>
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={handleBackButtonClick}>←</button>
        <div className={styles.headerTitle}>Pembayaran</div>
      </header>

      <div className={styles.timerBar}>
        <div>Selesaikan pembayaran dalam</div>
        <div className={styles.timerText}>{minutes}:{seconds}</div>
      </div>

      <div className={styles.totalBox}>
        <div className={styles.totalLabel}>Total Pembayaran</div>
        <div className={styles.totalPrice}>{isMounted ? formatRp(subtotal) : 'Rp 0'}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        {renderPaymentArea()}
      </div>

      <div className={styles.instructionred}>Pastikan anda kembali ke layar ini setelah melakukan pembayaran untuk melihat status orderan kamu</div>
      <div className={styles.instruction}>Silahkan lakukan pembayaran menggunakan aplikasi pembayaran pilihan anda</div>

      {/* -----------------------
          LOGS PANEL (NEW)
         ----------------------- */}
      {/* <div style={{ padding: 12, marginTop: 16, borderTop: '1px solid #eee' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Logs pengecekan Midtrans</strong>
          <div style={{ fontSize: 12, color: '#666' }}>{statusLogs.length} entri</div>
        </div>

        <div style={{ marginTop: 8, maxHeight: 260, overflow: 'auto', background: '#fafafa', padding: 8, borderRadius: 6 }}>
          {statusLogs.length === 0 && <div style={{ color: '#666' }}>Belum ada log pengecekan.</div>}
          {statusLogs.map((l, idx) => (
            <div key={idx} style={{ marginBottom: 8, padding: 8, borderRadius: 6, background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.03) inset' }}>
              <div style={{ fontSize: 12, color: '#333', marginBottom: 4 }}>
                <strong>{l.type}</strong> — <span style={{ color: '#666' }}>{l.ts}</span>
              </div>
              <div style={{ fontSize: 13, color: '#444' }}>
                {l.orderId && <div>orderId: <code style={{ fontSize: 12 }}>{String(l.orderId)}</code></div>}
                {l.httpStatus && <div>HTTP: {l.httpStatus}</div>}
                {l.summary && <div>status: {l.summary.txStatus || '-'} — payment_type: {l.summary.payment_type || '-'}</div>}
                {l.error && <div style={{ color: 'crimson' }}>error: {l.error}</div>}
                {l.rawJson && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, marginTop: 6 }}>{l.rawJson}</pre>}
              </div>
            </div>
          ))}
        </div>
      </div> */}
    </div>
  )
}
