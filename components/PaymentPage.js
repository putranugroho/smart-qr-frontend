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
  const router = useRouter();
  const [payment, setPayment] = useState([])
  const [selectedMethod, setSelectedMethod] = useState('QRIS'); // default
  const [customer, setCustomer] = useState({ first_name: '', email: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
    
    useEffect(() => {
      setPayment(getPayment())
      setIsMounted(true);
    }, [])

  // assume `initialData.total` is total order amount
  const subtotal = payment.paymentTotal
  const tax = Math.round(subtotal * 0.10)
  const total = subtotal + tax

  async function handlePayNow() {
    setIsLoading(true);
    console.log("selectedMethod");
    console.log(selectedMethod);
    
    try {
      const orderId = 'DI' + `${Math.floor(Math.random() * 9000) + 1000}` // or uuidv4();
      // call create-transaction API
      const resp = await fetch('/api/midtrans/create-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          grossAmount: total,
          customer,
          selectedMethod
        })
      });

      const data = await resp.json();
      console.log(data);
      
      if (!resp.ok) throw new Error(data.error || 'Gagal membuat transaksi');

      // store transaction response for paymentstatus page
      sessionStorage.setItem('midtrans_tx', JSON.stringify(data));
      // store order meta too if needed
      sessionStorage.setItem('order_meta', JSON.stringify({ orderId, total }));

      // navigate to paymentstatus page
      router.push('/paymentstatus');
    } catch (err) {
      console.error(err);
      alert('Gagal memproses pembayaran: ' + (err.message || err));
    } finally {
      setIsLoading(false);
    }
  }

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
        <div className={styles.orderInfoRight}>
          Table 24 • Dine In
          <Image
          src="/images/caret-down.png"
          alt="Bell"
          width={19}
          height={10}
          style={{ paddingRight: 5 }}
        />
        </div>
      </div>

      {/* INFORMASI PEMESAN */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Informasi Pemesan</div>
        <div className={styles.sectionDesc}>Masukkan informasi untuk menerima info pemesanan</div>

        <label className={styles.label}>Nama</label>
        <div className={styles.inputWrap}>
          {/* <span className={styles.iconUser}>👤</span> */}
          <input className={styles.input} placeholder="Masukan Nama" />
        </div>

        <label className={styles.label}>Nomor WhatsApp</label>
        <div className={styles.phoneRow}>
          <div className={styles.countryCode}>+62 ▼</div>
          <input className={styles.phoneInput} placeholder="ex: 81234567890" />
        </div>
      </div>

      {/* REGISTER BOX */}
      {/* <div className={styles.registerBox}>
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
      </div> */}

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
          <div className={styles.paymentItemLeft}>
          <Image src="/images/pay-qris.png" alt="gopay" width={55} height={14} className={styles.iconImg} />
            QRIS
            </div>
          <div className={styles.radio}>{selectedMethod === 'qris' ? '✔' : ''}</div>
        </div>

        {/* ShopeePay */}
        <div
          className={`${styles.paymentItem} ${selectedMethod === 'shopee' ? styles.selected : ''}`}
          onClick={() => setSelectedMethod('shopee')}
        >
          <div className={styles.paymentItemLeft}>
          <Image src="/images/pay-shopee.png" alt="gopay" width={55} height={14} className={styles.iconImg} />
            ShopeePay</div>
          <div className={styles.radio}>{selectedMethod === 'shopee' ? '✔' : ''}</div>
        </div>

        {/* GoPay */}
        <div
          className={`${styles.paymentItem} ${selectedMethod === 'gopay' ? styles.selected : ''}`}
          onClick={() => setSelectedMethod('gopay')}
        >
          <div className={styles.paymentItemLeft}>
          <Image src="/images/pay-gopay.png" alt="gopay" width={55} height={14} className={styles.iconImg} />
            GoPay</div>
          <div className={styles.radio}>{selectedMethod === 'gopay' ? '✔' : ''}</div>
        </div>

        {/* OVO */}
        <div
          className={`${styles.paymentItem} ${selectedMethod === 'ovo' ? styles.selected : ''}`}
          onClick={() => setSelectedMethod('ovo')}
        >
          <div className={styles.paymentItemLeft}>
          <Image src="/images/pay-ovo.png" alt="gopay" width={55} height={14} className={styles.iconImg} />
            OVO</div>
          <div className={styles.radio}>{selectedMethod === 'ovo' ? '✔' : ''}</div>
        </div>

        {/* Dana */}
        <div
          className={`${styles.paymentItem} ${selectedMethod === 'dana' ? styles.selected : ''}`}
          onClick={() => setSelectedMethod('dana')}
        >
          <div className={styles.paymentItemLeft}>
          <Image src="/images/pay-dana.png" alt="gopay" width={55} height={14} className={styles.iconImg} />
            Dana</div>
          <div className={styles.radio}>{selectedMethod === 'dana' ? '✔' : ''}</div>
        </div>
      </div>

      {/* STICKY BAR */}
      <div className={styles.sticky}>
        <div className={styles.stickyTop}>
          <div className={styles.totalLabel}>Total Pembayaran</div>
          <div className={styles.totalValue}>{isMounted ? formatRp(subtotal) : 'Rp0'}</div>
        </div>

        <button
          className={styles.payBtn}
          onClick={handlePayNow}
          disabled={isLoading}
        >
          {isLoading ? 'Memproses...' : 'Bayar Sekarang'}
        </button>
      </div>
    </div>
  )
}
