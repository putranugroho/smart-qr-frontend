// pages/paymentpage.js
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import styles from '../styles/PaymentPage.module.css'
import Image from 'next/image'
import { getPayment, clearCart } from '../lib/cart'
import { mapDoOrderPayload } from '../lib/order'
import { getUser, userSignIn } from '../lib/auth'

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
  const [user, setUser] = useState({})
  const [table, setTable] = useState('')
  const [tableNumber, setTableNumber] = useState('');

  // validation state
  const [errors, setErrors] = useState({
    first_name: '',
    phone: '',
    tableNumber: ''
  });

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

    const dataUser = getUser?.() || {};
    setUser(dataUser)

    if (dataUser.orderType == "DI") {
      setTable(`Table ${dataUser.tableNumber} • Dine In`)
    } else {
      setTable(`Table ${dataUser.tableNumber} • Take Away`)
    }

    // initialize tableNumber from user if available
    if (dataUser.tableNumber && String(dataUser.tableNumber).trim() !== '' && String(dataUser.tableNumber).trim() !== '000') {
      setTableNumber(String(dataUser.tableNumber).trim().toUpperCase());
    }

    setPayment(merged);
    setIsMounted(true);
  }, []);

  // helper untuk cek apakah order type adalah take away
  const isTakeAway = (() => {
    const t = String(user?.orderType || '').toUpperCase();
    return t === 'TA' || t.includes('TAKE');
  })();

  // treat empty / '000' as not having preset table
  const hasPresetTable =
    !!(user?.tableNumber && String(user.tableNumber).trim() !== '' && String(user.tableNumber).trim() !== '000');

  const mustFillTableNumber =
    !isTakeAway && !hasPresetTable;

  // compute payload from cart and use it as source of truth for totals
  function buildPayload(grossAmountForRounding = null, explicitTableNumber = null) {
    const cart = payment.cart || [];
    // pass grossAmount so mapDoOrderPayload can compute rounding if needed
    const payload = mapDoOrderPayload(cart, grossAmountForRounding, selectedMethod, {
      posId: 'QR',
      orderType: user.orderType || 'DI',
      tableNumber: isTakeAway ? '' : (explicitTableNumber !== null ? explicitTableNumber : tableNumber)
    });
    return payload;
  }

  // Validate fields, set errors state, return boolean
  function validateAll(showErrors = true) {
    const next = { first_name: '', phone: '', tableNumber: '' };
    let ok = true;

    const nameVal = (customer.first_name || '').trim().replace(/\s+/g, ' ');

    if (!nameVal) {
      next.first_name = 'Nama wajib diisi.';
      ok = false;
    } else {
      const namePattern = /^[\p{L}\s]+$/u;
      if (!namePattern.test(nameVal)) {
        next.first_name = 'Nama hanya boleh berisi huruf dan spasi.';
        ok = false;
      }
    }

    if (!customer.phone || String(customer.phone).trim() === '') {
      next.phone = 'Nomor WhatsApp wajib diisi.';
      ok = false;
    } else if ((customer.phone || '').length < 8) {
      next.phone = 'Nomor WhatsApp minimal 8 digit.';
      ok = false;
    } else if ((customer.phone || '').length > 12) {
      next.phone = 'Nomor WhatsApp maksimal 12 digit.';
      ok = false;
    }

    // Table number validation: require pattern 1 letter + 2-3 digits: /^[A-Za-z]\d{2,3}$/
    if (mustFillTableNumber) {
      // try auto-format first (handles A1 -> A01)
      const formatted = formatTableOnBlur(tableNumber || '');
      // if formatting changed, persist it so user sees it
      if (formatted && formatted !== tableNumber) {
        setTableNumber(formatted);
      }

      const pattern = /^[A-Za-z]\d{2,3}$/;
      if (!formatted || !pattern.test(formatted)) {
        next.tableNumber = 'Nomer meja harus format: 1 huruf di depan lalu 2–3 angka (contoh: A01 atau A123).';
        ok = false;
      }
    }

    if (showErrors) setErrors(next);
    return ok;
  }

  // Auto-format table number on blur:
  // - Accept 1 letter + 1-3 digits typed by user, then pad to at least 2 digits for payload/display
  function formatTableOnBlur(v) {
    if (!v) return v;
    let s = String(v).trim().toUpperCase();
    // Remove whitespace inside, e.g. "A 1" -> "A1"
    s = s.replace(/\s+/g, '');
    // jika mulai dengan letter + digits => pad angka minimal 2 digits (contoh A1 -> A01)
    const m = s.match(/^([A-Z])(\d{1,3})$/i);
    if (m) {
      const letter = m[1];
      let digits = m[2];
      // pad to at least 2 digits (A1 -> A01), allow up to 3 digits
      if (digits.length === 1) digits = digits.padStart(2, '0'); // A1 -> A01
      // if digits already 2 or 3, keep as is
      return `${letter}${digits}`;
    }

    return s;
  }

  async function handlePayNow() {
    // clear previous errors
    setErrors({ first_name: '', phone: '', tableNumber: '' });

    // validate inline, no popup
    const ok = validateAll(true);
    if (!ok) {
      // don't proceed
      return;
    }

    setIsLoading(true);

    try {
      const cart = payment.cart || [];
      if (!cart.length) throw new Error("Cart kosong – gagal membuat do-order");

      // Normalize tableNumber now (so payload gets formatted value like A01)
      const formattedTable = formatTableOnBlur(tableNumber || '');
      const finalTableForPayload = formattedTable || tableNumber || '';

      // ensure state shows formatted value
      if (formattedTable && formattedTable !== tableNumber) {
        setTableNumber(formattedTable);
      }

      // final validation just to be safe
      if (!validateAll(true)) {
        setIsLoading(false);
        return;
      }

      // Build payload (source of truth) explicitly passing finalTableForPayload to avoid setState race
      const payload = buildPayload(null, finalTableForPayload);
      console.log("payload", payload);

      // persist tableNumber in sessionStorage payload so downstream pages can read the same formatted value
      try {
        const existing = sessionStorage.getItem('do_order_payload');
        let p = existing ? JSON.parse(existing) : {};
        p.tableNumber = finalTableForPayload;
        p.table_number = finalTableForPayload;
        sessionStorage.setItem('do_order_payload', JSON.stringify(p));
      } catch (e) {
        console.warn('failed to persist do_order_payload tableNumber', e);
      }

      const grossAmount = payload.grandTotal || 1;

      // generate orderId that will be used as Midtrans order_id (displayOrderId)
      const orderId = (user.orderType === 'DI' ? 'DI' : (isTakeAway ? 'TA' : 'DI')) + (Math.floor(Math.random() * 9000) + 1000);

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

      // persist raw midtrans response for PaymentStatus usage
      sessionStorage.setItem("midtrans_tx", JSON.stringify(data));

      // try to extract paymentLink (deeplink/url) from midtrans response (actions, core_response, deeplink_url)
      let paymentLink = null;
      try {
        const actions = data.actions || data.core_response?.actions || [];
        const deeplinkAction = Array.isArray(actions) && actions.find(a => a.name && a.name.toString().toLowerCase().includes('deeplink'));
        const urlAction = Array.isArray(actions) && actions.find(a => ['mobile_web_checkout_url','mobile_deeplink_web','url','deeplink-redirect'].includes((a.name || '').toString().toLowerCase()));
        paymentLink = (deeplinkAction && deeplinkAction.url) || (urlAction && urlAction.url) || data.redirect_url || data.core_response?.redirect_url || data.deeplink_url || data.core_response?.deeplink_url || null;
      } catch (e) {
        console.warn('extract paymentLink failed', e);
        paymentLink = null;
      }

      // Optionally attach payment reference from Midtrans to payload.selfPaymentRefId
      if (data && data.transaction_id) {
        payload.selfPaymentRefId = String(data.transaction_id);
      } else if (data && data.transaction_details && data.transaction_details.order_id) {
        payload.selfPaymentRefId = String(data.transaction_details.order_id);
      }

      // CHANGED: attach displayOrderId (Midtrans order_id we generated)
      payload.displayOrderId = orderId;

      // CHANGED: attach paymentLink to payload if available
      if (paymentLink) {
        payload.paymentLink = paymentLink;
      }

      if (selectedMethod.includes("gopay")) {
        payload.payment = "GOPAY"
      } if (selectedMethod.includes("qris")) {
        payload.payment = "QRISOTHERS"
      } 

      payload.customerName = customer.first_name || "";
      payload.customerPhoneNumber = "0" + (customer.phone || "");
      // ensure payload.tableNumber is the formatted one
      payload.tableNumber = finalTableForPayload;
      payload.table_number = finalTableForPayload;

      console.log("payload (do-order) :", payload);

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

      // persist do-order result (orderCode and backend data)
      sessionStorage.setItem("do_order_result", JSON.stringify(doOrderData));
      // also persist payload so PaymentStatus can read formatted table number
      try {
        sessionStorage.setItem('do_order_payload', JSON.stringify(payload));
      } catch (e) { /* ignore */ }

      // clear client cart (calls clearCart -> localStorage)
      clearCart();

      router.push('/paymentstatus');

    } catch (err) {
      console.error(err);
      setIsLoading(false);
      alert('Error pembayaran: ' + (err.message || err));
      return;
    } finally {
      setIsLoading(false);
    }
  }

  // when phone/name change, we clear related errors
  function handleNameChange(v) {
    // izinkan huruf semua bahasa dan spasi
    let val = v.replace(/[^\p{L}\s]/gu, '');

    // jangan trim di sini — biarkan input alami
    // biarkan multiple spaces dulu (bisa diperbaiki saat submit)

    setCustomer(prev => ({ ...prev, first_name: val }));
    if (errors.first_name) setErrors(prev => ({ ...prev, first_name: '' }));
  }
  function handlePhoneChange(v) {
    // hanya angka
    let val = String(v || '').replace(/\D/g, "");
    // hapus leading zeros
    val = val.replace(/^0+/, "");
    // batasi maksimal 12 digit
    if (val.length > 12) {
      val = val.slice(0, 12);
    }
    setCustomer(prev => ({ ...prev, phone: val }));
    if (errors.phone) setErrors(prev => ({ ...prev, phone: '' }));
  }

  // table input change
  function handleTableChange(v) {
    // normalize to uppercase + remove spaces (live)
    const normalized = String(v || '').toUpperCase().replace(/\s+/g, '');
    setTableNumber(normalized);
    if (errors.tableNumber) setErrors(prev => ({ ...prev, tableNumber: '' }));
  }

  // onBlur for table input -> autoformat
  function handleTableBlur() {
    const formatted = formatTableOnBlur(tableNumber);
    if (formatted !== tableNumber) setTableNumber(formatted);
    if (mustFillTableNumber) validateAll(true);
  }

  const payloadPreview = buildPayload();
  const subtotal = payloadPreview.subTotal || 0;
  const taxes = (Array.isArray(payloadPreview.taxes) ? payloadPreview.taxes.reduce((s,t)=>s+(Number(t.taxAmount||0)),0) : 0);
  const total = payloadPreview.grandTotal || 0;

  // Payment method list and disabled set
  const methods = ['qris','shopee','gopay','ovo','dana'];
  const disabledMethods = new Set(['ovo','dana','shopee']); // these will be shown as under maintenance

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
        </div>
      </div>

      {/* INFORMASI PEMESAN */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Informasi Pemesan</div>
        <div className={styles.sectionDesc}>Masukkan informasi untuk menerima info pemesanan</div>

        <label className={styles.label}>Nama <span style={{color:'red'}}>*</span></label>
        <div className={styles.inputWrap}>
          <input
            className={styles.input}
            placeholder="Masukan Nama"
            value={customer.first_name || ''}
            onChange={(e)=>handleNameChange(e.target.value)}
            style={errors.first_name ? { borderColor: 'red' } : {}}
            aria-invalid={errors.first_name ? 'true' : 'false'}
            aria-describedby={errors.first_name ? 'err-first-name' : undefined}
          />
        </div>
        {errors.first_name && <div id="err-first-name" style={{ color: 'red', fontSize: 12, marginTop: 6 }}>{errors.first_name}</div>}

        <label className={styles.label}>Nomor WhatsApp <span style={{color:'red'}}>*</span></label>
        <div className={styles.phoneRow}>
          <div className={styles.countryCode}>+62 ▼</div>
          <input
            className={styles.phoneInput}
            placeholder="ex: 81234567890"
            value={customer.phone || ""}
            onChange={(e) => handlePhoneChange(e.target.value)}
            style={errors.phone ? { borderColor: 'red' } : {}}
            inputMode="numeric"
            maxLength={12}
          />
        </div>
        {errors.phone && <div style={{ color: 'red', fontSize: 12, marginTop: 6 }}>{errors.phone}</div>}

        {/* show table input only when not take away */}
        {mustFillTableNumber && (
          <>
            <label className={styles.label}>Nomer Meja *</label>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                placeholder="Masukan Nomer Meja (contoh: A01 / A123)"
                value={tableNumber}
                onChange={(e)=>handleTableChange(e.target.value)}
                onBlur={handleTableBlur}
                style={errors.tableNumber ? { borderColor: 'red' } : {}}
              />
            </div>
            {errors.tableNumber && <div style={{ color: 'red', fontSize: 12 }}>{errors.tableNumber}</div>}
          </>
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

        {methods.map(m => {
          const isDisabled = disabledMethods.has(m);
          return (
            <div
              key={m}
              className={`${styles.paymentItem} ${selectedMethod === m ? styles.selected : ''} ${isDisabled ? styles.disabledPaymentItem : ''}`}
              onClick={() => {
                if (isDisabled) return; // tidak bisa dipilih
                setSelectedMethod(m);
              }}
              role="button"
              aria-disabled={isDisabled ? 'true' : 'false'}
              style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              <div className={styles.paymentItemLeft} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Image src={`/images/pay-${m}.png`} alt={m} width={55} height={14} className={styles.iconImg} />
                <div>
                  <div style={{ fontWeight: 600 }}>{m.toUpperCase()}</div>
                  {isDisabled && <div style={{ fontSize: 12, color: '#b00' }}>UNDER MAINTENANCE</div>}
                </div>
              </div>
              <div className={styles.radio}>
                {isDisabled ? '' : (selectedMethod === m ? '✔' : '')}
              </div>
            </div>
          )
        })}
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