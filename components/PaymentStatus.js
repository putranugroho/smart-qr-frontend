// pages/paymentstatus.js
import { useRouter } from 'next/router'
import { useEffect, useState, useRef } from 'react'
import styles from '../styles/PaymentStatus.module.css'
import { getPayment } from '../lib/cart'
import Image from 'next/image'

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
  const [orderCode, setOrderCode] = useState(null)
  const [qrDataUri, setQrDataUri] = useState(null) // holds data:image/...;base64,...
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState(null)
  const pollRef = useRef(null)

  // success state
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [successOrderId, setSuccessOrderId] = useState(null)

  // --- NEW: confirmation modal state
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const leaveResolveRef = useRef(null) // to resolve Promise when modal answered

  // --- Load tx & meta from sessionStorage
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

  async function callDoPayment(orderCodeParam, paymentType, reference) {
    const resp = await fetch('/api/order/do-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderCode: orderCodeParam,
        payment: (paymentType || 'GOPAY').toString().toUpperCase(),
        reference
      })
    });

    const j = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('do-payment proxy failed', resp.status, j);
      throw new Error(j?.message || `Status ${resp.status}`);
    }
    return j;
  }

  // helper: find action by names (case-insensitive)
  function findAction(actions = [], names = []) {
    if (!actions || !Array.isArray(actions)) return null
    for (const n of names) {
      const found = actions.find(a => a.name && a.name.toString().toLowerCase() === n.toLowerCase())
      if (found) return found
    }
    // fallback: try includes
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
      const orderId = tx?.order_id || tx?.orderId || tx?.raw?.order_id;
      if (!orderId) return;
      try {
        const r = await fetch(`/api/midtrans/status?orderId=${encodeURIComponent(orderId)}`)
        const j = await r.json()
        setStatusMessage(JSON.stringify(j, null, 2))
        const txStatus = (j.transaction_status || j.status || '').toString().toLowerCase()
        if (['capture','settlement','success'].includes(txStatus)) {
          // stop poll and redirect to order page
          stopPolling()

          try {
            // call do-payment proxy (existing function)
            const result = await callDoPayment(orderCode, j.payment_type, j.order_id);
            console.log('do-payment result', result);
          } catch (e) {
            console.error('call failed', e);
          }

          // Decide redirect target: prefer orderCode from do_order_result -> fallback to midtrans order_id
          let targetOrderCode = null;
          try {
            const doOrderRaw = sessionStorage.getItem('do_order_result');
            if (doOrderRaw) {
              const parsed = JSON.parse(doOrderRaw);
              targetOrderCode = parsed?.data?.orderCode ?? parsed?.orderCode ?? null;
            }
          } catch (e) { /* ignore */ }

          // if we have orderCode, go to /order/{orderCode}; else fallback to using midtrans order_id
          const resolvedTarget = targetOrderCode || j.order_id || orderId;
          // short delay to show success UI
          setTimeout(() => {
            router.push(`/order/${resolvedTarget}`);
          }, 600);

        }
      } catch (err) {
        console.warn('status check failed', err)
      }
    }

    function startPolling() {
      if (pollRef.current) return
      // immediate check
      check()
      pollRef.current = setInterval(check, 5000)
    }

    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    // Start polling if we have a tx.order_id OR orderMeta.orderId
    if (orderMeta?.orderId) startPolling()

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [tx, orderMeta, orderCode, router])

  // --- Auto deeplink: only attempt ONCE per order (first visit)
  useEffect(() => {
    if (!tx) return
    const method = getNormalizedMethod(tx)
    // Only for e-wallets (not qris)
    if (!(method === 'gopay' || method === 'ovo' || method === 'shopeepay')) return

    const actions = tx.actions || tx.core_response?.actions || []

    const deeplinkAction = findAction(actions, ['deeplink-redirect', 'deeplink'])
    const urlAction = findAction(actions, ['mobile_deeplink_web', 'mobile_web_checkout_url', 'url'])
    const deeplinkUrl = deeplinkAction?.url || urlAction?.url || tx.deeplink_url || tx.core_response?.deeplink_url || null

    if (!deeplinkUrl) return

    const orderId = orderMeta?.orderId || tx.order_id || tx.orderId || tx.raw?.order_id
    if (!orderId) return

    const flagKey = `midtrans_deeplink_attempted:${orderId}`
    const alreadyAttempted = sessionStorage.getItem(flagKey)
    if (alreadyAttempted) return

    const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent || '')
    if (!isMobile) return

    try { sessionStorage.setItem(flagKey, 'true') } catch (e) { /* ignore */ }

    setRedirecting(true)
    setTimeout(() => {
      try {
        window.location.href = deeplinkUrl
      } catch (err) {
        console.warn('deeplink redirect failed', err)
      } finally {
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
        const api = `/api/convert-image-to-base64?imageUrl=${encodeURIComponent(imgUrl)}&mode=datauri`
        const r = await fetch(api)
        if (!mounted) return
        if (!r.ok) {
          const txt = await r.text().catch(() => null)
          setQrError('failed to convert (status ' + r.status + ')')
          console.warn('convert-api error', r.status, txt)
          return
        }
        const j = await r.json()
        if (!mounted) return
        const dataUri = j?.dataUri || (j?.data?.Base64Image ? `data:image/png;base64,${j.data.Base64Image}` : null)
        if (dataUri) setQrDataUri(dataUri)
        else {
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
    const imgUrl = qrV2?.url || qrV1?.url || qrUrlFromResp || redirectUrl

    setQrDataUri(null)
    setQrError(null)

    if (imgUrl) {
      // optionally fetch converted dataUri (commented out if convert-api not available)
      // fetchQrDataUri(imgUrl)
    }

    return () => { mounted = false }
  }, [tx])

  // --- Manual check triggered by button
  async function checkStatus() {
    const orderId = tx?.order_id
    if (!orderId) return alert('Order ID tidak ditemukan')
    setChecking(true)
    try {
      const r = await fetch(`/api/midtrans/status?orderId=${encodeURIComponent(orderId)}`)
      const j = await r.json()
      setStatusMessage(JSON.stringify(j, null, 2))
      const txStatus = (j.transaction_status || j.status || '').toString().toLowerCase()
      if (['capture','settlement','success'].includes(txStatus)) {
        const resolvedMidtransOrderId = j.order_id || j.orderId || tx.order_id;
        try {
          await callDoPayment(orderCode || (orderMeta?.orderId ?? null), j.payment_type || j.paymentType || 'UNKNOWN', resolvedMidtransOrderId);
        } catch (e) {
          console.error('call failed', e)
        }
        // show success view and navigate
        setPaymentSuccess(true)
        setSuccessOrderId(resolvedMidtransOrderId);
        
        // REDIRECT: prefer orderCode (from do-order result) — fallback to midtrans id
        const targetOrderCode = orderCode || (do_order_result_from_session?.data?.orderCode) || null;
        setTimeout(() => {
          try {
            router.push(`/order/${targetOrderCode}`);
          } catch (e) { /* ignore */ }
        }, 1200);
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

    const orderId = orderMeta?.orderId || tx.order_id || tx.orderId || tx.raw?.order_id
    if (orderId) {
      try { sessionStorage.setItem(`midtrans_deeplink_attempted:${orderId}`, 'true') } catch (e) {}
    }

    window.location.href = deeplinkUrl
  }

  // -----------------------
  // --- NAVIGATION GUARD
  // -----------------------

  // helper: show modal and return promise resolved with true/false
  function askConfirmLeave() {
    return new Promise(resolve => {
      leaveResolveRef.current = resolve
      setShowLeaveModal(true)
    })
  }

  // call this when user clicks "Ya" / "Tidak" on modal
  function handleModalAnswer(answer) {
    setShowLeaveModal(false)
    const resolve = leaveResolveRef.current
    leaveResolveRef.current = null
    if (typeof resolve === 'function') resolve(Boolean(answer))
  }

  // Intercept header back button (use this instead of router.push directly)
  async function handleBackButtonClick() {
    const ok = await askConfirmLeave()
    if (ok) {
      router.push('/checkout')
    }
    // else do nothing (stay)
  }

  // 1) Prevent SPA route changes (Next.js) unless confirmed
  useEffect(() => {
    try {
      router.beforePopState(() => true)
    } catch (e) {}
    return () => {
      try { router.beforePopState(() => true) } catch (e) {}
    }
  }, [router])

  // 2) Use history API + popstate to trap back / hardware back
  useEffect(() => {
    const pushDummy = () => {
      try { history.pushState({ paymentStatusGuard: true }, '') } catch (e) {}
    }
    pushDummy()

    let handling = false
    const onPopState = (e) => {
      if (handling) return
      handling = true

      askConfirmLeave().then(ok => {
        if (ok) {
          router.back()
        } else {
          pushDummy()
        }
        handling = false
      }).catch(() => {
        pushDummy()
        handling = false
      })
    }

    window.addEventListener('popstate', onPopState)

    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [router])

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const seconds = String(timeLeft % 60).padStart(2, '0')

  // show total if available in orderMeta or via getPayment
  const payment = getPayment?.() || {}
  const subtotal = payment.paymentTotal || orderMeta?.total || 0

  // If payment succeeded, show success page (your provided UI)
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
            const code = orderCode || (JSON.parse(sessionStorage.getItem('do_order_result')||'{}')?.data?.orderCode);
            router.push(`/order/${code}`)
          }}>Lihat Status Pesanan</button>
        </div>
      </div>
    )
  }

  // renderPaymentArea re-used from your version (kept behaviour)
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
        if (qrDataUri && !qrError) {
          return (
            <div className={styles.qrWrap}>
              <img src={qrDataUri} alt="QRIS" className={styles.qrImage} />
            </div>
          )
        }

        if (isLikelyImage) {
          return (
            <div className={styles.qrWrap}>
              {qrLoading && <div className={styles.qrLoading}></div>}
              <img src={imgUrl} alt="QRIS" className={styles.qrImage} />
            </div>
          )
        }

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
              <div style={{ marginTop: 12, wordBreak: 'break-all' }}>{deeplinkUrl}</div>
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

      {/* Confirmation Modal */}
      {showLeaveModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Konfirmasi</h3>
            <p>Apakah Anda yakin ingin meninggalkan halaman pembayaran? Pembayaran mungkin belum selesai.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className={styles.btnSecondary} onClick={() => handleModalAnswer(false)}>Batal</button>
              <button className={styles.btnPrimary} onClick={() => handleModalAnswer(true)}>Ya, tinggalkan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
