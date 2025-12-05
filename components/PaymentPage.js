
// components/PaymentPage.jsx
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import styles from '../styles/PaymentPage.module.css'
import Image from 'next/image'
import { getPayment, clearCart } from '../lib/cart'
import { mapDoOrderPayload } from '../lib/order'

function formatRp(n) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

export default function PaymentPage() {
  const router = useRouter();
  const [payment, setPayment] = useState({});
  const [selectedMethod, setSelectedMethod] = useState('qris');
  const [customer, setCustomer] = useState({ first_name: '', email: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [user, setUser] = useState('')
  const [table, setTable] = useState('')
  const [tableNumber, setTableNumber] = useState('');

  useEffect(() => {
    const pay = getPayment() || {};

    // fallback jika getPayment() kosong
    const sessionCart  = JSON.parse(sessionStorage.getItem("yoshi_cart_payment") || "[]");
    const sessionTotal = Number(sessionStorage.getItem("yoshi_cart_total") || 0);
    const sessionStore = sessionStorage.getItem("yoshi_store_code") || "";

    const merged = {
      cart: pay.cart && pay.cart.length > 0 ? pay.cart : sessionCart,
      paymentTotal: pay.paymentTotal || sessionTotal,
      storeCode: pay.storeCode || sessionStore,
      tableNumber
    };
        
    const dataUser = getUser?.() || null;
    setUser(dataUser)

    if (dataUser.orderType == "DI") {
      setTable(`Table ${dataUser.tableNumber} • Dine In`)
    } else {
      setTable(`Table ${dataUser.tableNumber} • Take Away`)
    } 

    setPayment(merged);
    setIsMounted(true);
  }, []);

  // compute payload from cart and use it as source of truth for totals
  function buildPayload() {
    const cart = payment.cart || [];
    const payload = mapDoOrderPayload(cart, null, selectedMethod, {
      posId: 'QR',
      orderType: 'DI',
      tableNumber
    });
    return payload;
  }

  async function handlePayNow() {
    if (!customer.first_name || !customer.phone) {
      alert("Nama dan Nomor WhatsApp wajib diisi.");
      return;
    }

    if (customer.phone.length < 8) {
      alert("Nomor WhatsApp tidak valid.");
      return;
    }
    setIsLoading(true);

    try {
      const cart = payment.cart || [];
      if (!cart.length) throw new Error("Cart kosong – gagal membuat do-order");

      // Build payload (source of truth)
      const payload = buildPayload();
      console.log("payload",payload);
      
      const grossAmount = payload.grandTotal || 1;

      // Use payload.grandTotal as grossAmount for Midtrans
      const orderId = 'DI' + (Math.floor(Math.random() * 9000) + 1000);

      // === 1. Create Midtrans Transaction ===
      const resp = await fetch('/api/midtrans/create-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          grossAmount,
          customer,
          selectedMethod
        })
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Gagal membuat transaksi');

      sessionStorage.setItem("midtrans_tx", JSON.stringify(data));

      // Optionally attach payment reference from Midtrans to payload.selfPaymentRefId
      if (data && data.transaction_id) {
        payload.selfPaymentRefId = String(data.transaction_id);
      } else if (data && data.transaction_details && data.transaction_details.order_id) {
        payload.selfPaymentRefId = String(data.transaction_details.order_id);
      }

      payload.customerName = customer.first_name || "";
      payload.customerPhoneNumber = "0" + (customer.phone || "");
      console.log("payload :", payload);
      

      // === 2. DO-ORDER ===
      const doOrderResp = await fetch('/api/order/do-order', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeCode: "MGI",
          payload
        })
      });

      const doOrderData = await doOrderResp.json();
      if (!doOrderResp.ok) throw new Error(doOrderData.error || 'Gagal do-order');

      console.log("doOrderData", doOrderData);
      clearCart()

      sessionStorage.setItem("do_order_result", JSON.stringify(doOrderData));

      router.push('/paymentstatus');

    } catch (err) {
      console.error(err);
      alert('Error pembayaran: ' + (err.message || err));
    } finally {
      setIsLoading(false);
    }
  }

  const payloadPreview = buildPayload();
  const subtotal = payloadPreview.subTotal || 0;
  const taxes = (Array.isArray(payloadPreview.taxes) ? payloadPreview.taxes.reduce((s,t)=>s+(Number(t.taxAmount||0)),0) : 0);
  const total = payloadPreview.grandTotal || 0;

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
          {table}
          {/* <Image src="/images/caret-down.png" alt="Bell" width={19} height={10} style={{ paddingRight: 5 }} /> */}
        </div>
      </div>

      {/* INFORMASI PEMESAN */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Informasi Pemesan</div>
        <div className={styles.sectionDesc}>Masukkan informasi untuk menerima info pemesanan</div>

        <label className={styles.label}>Nama</label>
        <div className={styles.inputWrap}>
          <input className={styles.input} placeholder="Masukan Nama" onChange={(e)=>setCustomer({...customer, first_name: e.target.value})} />
        </div>

        <label className={styles.label}>Nomor WhatsApp</label>
        <div className={styles.phoneRow}>
          <div className={styles.countryCode}>+62 ▼</div>
          <input
            className={styles.phoneInput}
            placeholder="ex: 81234567890"
            value={customer.phone || ""}
            onChange={(e) => {
              // Hanya izinkan angka
              let v = e.target.value.replace(/\D/g, "");

              // Hilangkan zero di depan (leading zero)
              v = v.replace(/^0+/, "");

              setCustomer({ ...customer, phone: v });
            }}
          />
        </div>
        {(user === '' || user === '000' )&& (
        <label className={styles.label}>Nomer Meja</label>
        )}
        {(user === '' || user === '000' ) && (
        <div className={styles.inputWrap}>
          <input className={styles.input} placeholder="Masukan Nomer Meja" onChange={(e)=>setTableNumber(e.target.value)} />
        </div>
        )}
      </div>

      {/* METODE PEMBAYARAN */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Pilih Metode Pembayaran</div>

        <div className={styles.paymentBox}>
          <div className={styles.paymentBoxHeader}>
            <div className={styles.paymentBoxTitle}>Pembayaran Online</div>
            <Image src="/images/pembayaran-online.png" alt="pembayaran online" width={50} height={50} className={styles.paymentBoxIcon} />
          </div>
        </div>

        {['qris','shopee','gopay','ovo','dana'].map(m => (
          <div
            key={m}
            className={`${styles.paymentItem} ${selectedMethod === m ? styles.selected : ''}`}
            onClick={() => setSelectedMethod(m)}
          >
            <div className={styles.paymentItemLeft}>
              <Image src={`/images/pay-${m}.png`} alt={m} width={55} height={14} className={styles.iconImg} />
              {m.toUpperCase()}
            </div>
            <div className={styles.radio}>{selectedMethod === m ? '✔' : ''}</div>
          </div>
        ))}
      </div>

      {/* STICKY FOOTER */}
      <div className={styles.sticky}>
        <div className={styles.stickyTop}>
          <div className={styles.totalLabel}>Total Pembayaran</div>
          <div className={styles.totalValue}>
            {isMounted ? formatRp(total) : 'Rp0'}
          </div>
        </div>

        <button className={styles.payBtn} onClick={handlePayNow} disabled={isLoading}>
          {isLoading ? 'Memproses...' : 'Bayar Sekarang'}
        </button>
      </div>
    </div>
  );
}
