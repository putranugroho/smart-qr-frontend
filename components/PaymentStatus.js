// FILE: pages/paymentstatus.js  (updated - replace your existing file with this)
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import styles from '../styles/PaymentStatus.module.css'
import Image from 'next/image'
import { getPayment } from '../lib/cart'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

export default function PaymentStatus() {
  const router = useRouter()

  const [payment, setPayment] = useState({})
  const [isClient, setIsClient] = useState(false)
  const [timeLeft, setTimeLeft] = useState(15 * 60)
  const [qrReady, setQrReady] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  useEffect(() => {
    setPayment(getPayment())
    setIsClient(true)

    const qrTimer = setTimeout(() => setQrReady(true), 2000)
    return () => clearTimeout(qrTimer)
  }, [])

  // COUNTDOWN TIMER
  useEffect(() => {
    if (timeLeft <= 0) return
    const interval = setInterval(() => setTimeLeft(t => t - 1), 1000)
    return () => clearInterval(interval)
  }, [timeLeft])

  // when paymentSuccess => generate order id and redirect to /order/[id]
  useEffect(() => {
    if (paymentSuccess) {
      const orderId = 'DI' + Math.floor(100000 + Math.random() * 900000)
      // small delay to allow success UI to show
      const t = setTimeout(() => {
        router.push(`/order/${orderId}`)
      }, 900)

      return () => clearTimeout(t)
    }
  }, [paymentSuccess, router])

  // SUCCESS VIEW
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
            const orderId = 'DI' + Math.floor(100000 + Math.random() * 900000)
            router.push(`/order/${orderId}`)
          }}>Lihat Status Pesanan</button>
        </div>
      </div>
    )
  }

  const subtotal = payment.paymentTotal || 0
  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const seconds = String(timeLeft % 60).padStart(2, '0')

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
        <div className={styles.totalPrice}>{isClient ? formatRp(subtotal) : 'Rp0'}</div>
      </div>

      <div className={styles.qrWrap}>
        {!qrReady ? (
          <div className={styles.qrLoading}></div>
        ) : (
          <Image src="/images/qr-code.png" width={236} height={246} alt="qr" className={styles.qrImage} />
        )}
      </div>

      <button className={styles.saveBtn}>Simpan ke Galeri</button>

      <div className={styles.instruction}>Silahkan lakukan pembayaran menggunakan aplikasi pembayaran pilihan kamu</div>

      <div className={styles.sticky}>
        <button className={styles.checkBtn} onClick={() => setPaymentSuccess(true)}>Check Status Pembayaran</button>
      </div>
    </div>
  )
}
