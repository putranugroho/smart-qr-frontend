import { useRouter } from "next/router";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import styles from "../../styles/BillPage.module.css";
import { getPayment } from "../../lib/cart";

function formatRp(n) {
  return "Rp" + new Intl.NumberFormat("id-ID").format(Number(n || 0));
}

export default function BillPage() {
  const router = useRouter();
  const { id } = router.query;
  const [dataOrder, setDataOrder] = useState("")
  const [urlLogo, setUrlLogo] = useState("/images/pay-gopay.png")
  const printRef = useRef();

  const [payment, setPayment] = useState({ items: [], paymentTotal: 0 });
  const subtotal = payment.paymentTotal || 0;
  const tax = Math.round(subtotal * 0.10);
  const total = subtotal + tax;

  useEffect(() => {
    const p = getPayment() || {};
    if (p && p.items) setPayment(p);
    const s = sessionStorage.getItem('midtrans_tx')
    if (s) {
      try { setDataOrder(JSON.parse(s)) } catch (e) { console.warn('Invalid midtrans_tx', e) }
    }
    console.log(dataOrder);
    
    if (dataOrder) {
      switch (dataOrder.payment_type) {
        case 'qris':
          setUrlLogo("/images/pay-qris.png")
          break;
        case 'shopee': 
          setUrlLogo("/images/pay-shopee.png")
          break;
        case 'ovo': 
          setUrlLogo("/images/pay-ovo.png")
          break;
        case 'dana': 
          setUrlLogo("/images/pay-dana.png")
          break;
      
        default:
          setUrlLogo("/images/pay-gopay.png")
          break;
      }
    }
  }, []);

  // =================================
  // =========== DOWNLOAD PDF ==========
  // =================================
  const downloadPDF = async () => {
    const element = printRef.current;
    const canvas = await html2canvas(element, { scale: 2 });
    const img = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;

    pdf.addImage(img, "PNG", 0, 0, width, height);
    pdf.save(`bill-${id}.pdf`);
  };

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>←</button>

        <div className={styles.headerTitle}>Detail Bill</div>
        <div style={{ width: 20 }}></div>
      </header>

      {/* CONTENT */}
      <div ref={printRef} className={styles.billWrapper}>
        {/* NOMOR BILL */}
        <div className={styles.billNumberRow}>
          <div className={styles.billLabel}>Nomor Bill</div>
          <div className={styles.billValue}>{id}</div>
        </div>

        {/* ITEMS */}
        {payment.items.map((it, i) => (
          <div key={i} className={styles.itemRow}>
            <div className={styles.itemLeft}>
              <div className={styles.itemTitle}>{it.title}</div>

              <div className={styles.itemAddon}>
                {it.qty}x Air Mineral
                <br />
                1x No Add Ons
              </div>
            </div>

            <div className={styles.itemRight}>{formatRp(it.price)}</div>
          </div>
        ))}

        {/* PEMBAYARAN ONLINE BOX */}
        <div className={styles.paymentBox}>
          <div className={styles.paymentBoxLeft}>Pembayaran Online</div>
          <div className={styles.paymentBoxRight}>
            <img src={urlLogo} alt="logo" width={55} height={14} />
          </div>
        </div>

        {/* PAYMENT DETAIL BOX */}
        <div className={styles.detailBox}>
          <div className={styles.detailRow}>
            <div>Subtotal ({payment.items.length} menu)</div>
            <div>{formatRp(subtotal)}</div>
          </div>

          <div className={styles.detailRow}>
            <div>PB1 (10%)</div>
            <div>{formatRp(tax)}</div>
          </div>

          <div className={styles.detailRow}>
            <div>PNN (10%)</div>
            <div>Rp0</div>
          </div>

          <div className={styles.totalRow}>
            <div>Total</div>
            <div className={styles.totalValue}>{formatRp(total)}</div>
          </div>
        </div>
      </div>

      {/* DOWNLOAD BUTTON */}
      <div className={styles.downloadWrap}>
        <button className={styles.downloadBtn} onClick={downloadPDF}>
          Download Bill (PDF)
        </button>
      </div>
    </div>
  );
}
