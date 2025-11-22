// components/PaymentPage.jsx
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import styles from '../styles/PaymentPage.module.css'
import Image from 'next/image'
import { getPayment } from '../lib/cart'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

export default function PaymentPage() {
  const router = useRouter()
    const [payment, setPayment] = useState([])
  
    useEffect(() => {
      setPayment(getPayment())
    }, [])

  const subtotal = payment.paymentTotal
  const tax = Math.round(subtotal * 0.11)
  const total = subtotal + tax

  const [selectedMethod, setSelectedMethod] = useState('qris')
  const [isClient, setIsClient] = useState(false)

    useEffect(() => {
    setIsClient(true)
    }, [])

  return (
    <div className={styles.page}>
      
      {/* HEADER */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/checkout')}>←</button>
        <div className={styles.headerTitle}>Pembayaran</div>
      </header>

      {/* ORDER INFO */}
      <div className={styles.orderInfo}>
        <div className={styles.orderInfoText}>Tipe Order</div>
        <div className={styles.orderInfoRight}>TBL 24 • Dine In ▼</div>
      </div>

      {/* INFORMASI PEMESAN */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Informasi Pemesan</div>
        <div className={styles.sectionDesc}>Masukkan informasi untuk menerima info pemesanan</div>

        <label className={styles.label}>Nama</label>
        <div className={styles.inputWrap}>
          {/* <span className={styles.iconUser}>👤</span> */}
          <input className={styles.input} placeholder="Michael Yoshinoya" />
        </div>

        <label className={styles.label}>Nomor WhatsApp</label>
        <div className={styles.phoneRow}>
          <div className={styles.countryCode}>+62 ▼</div>
          <input className={styles.phoneInput} placeholder="81212121212" />
        </div>
      </div>

      {/* REGISTER BOX */}
      <div className={styles.registerBox}>
        <div>
          <div className={styles.registerText}>
            Masuk atau daftarkan akun kamu<br />untuk mendapatkan point setiap transaksi
          </div>
        </div>
        <Image
          src="/images/gift-icon.png"
          width={156}
          height={117}
          alt="gift"
          className={styles.giftImage}
        />
      </div>

      {/* PEMBAYARAN */}
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


        {/* QRIS */}
        <div
          className={`${styles.paymentItem} ${selectedMethod === 'qris' ? styles.selected : ''}`}
          onClick={() => setSelectedMethod('qris')}
        >
          <div className={styles.paymentItemLeft}>📷 QRIS</div>
          <div className={styles.radio}>{selectedMethod === 'qris' ? '✔' : ''}</div>
        </div>

        {/* ShopeePay */}
        <div
          className={`${styles.paymentItem} ${selectedMethod === 'shopee' ? styles.selected : ''}`}
          onClick={() => setSelectedMethod('shopee')}
        >
          <div className={styles.paymentItemLeft}>🛒 ShopeePay</div>
          <div className={styles.radio}>{selectedMethod === 'shopee' ? '✔' : ''}</div>
        </div>

        {/* OVO */}
        <div
          className={`${styles.paymentItem} ${selectedMethod === 'ovo' ? styles.selected : ''}`}
          onClick={() => setSelectedMethod('ovo')}
        >
          <div className={styles.paymentItemLeft}>🟣 OVO</div>
          <div className={styles.radio}>{selectedMethod === 'ovo' ? '✔' : ''}</div>
        </div>
      </div>

      {/* STICKY BAR */}
      <div className={styles.sticky}>
        <div className={styles.stickyTop}>
          <div className={styles.totalLabel}>Total Pembayaran</div>
          <div className={styles.totalValue}>{isClient ? formatRp(subtotal) : 'Rp0'}</div>
        </div>

        <button
          className={styles.payBtn}
          onClick={() => router.push('/paymentstatus')}
        >
          Bayar Sekarang
        </button>
      </div>
    </div>
  )
}
