// FILE: pages/bill/[id].js
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

// helper same as order page
function calculateItemTaxes(it) {
  let base = 0
  let pb1 = 0
  let ppn = 0
  if (it.type === 'combo' && it.combos && it.combos[0] && it.combos[0].products) {
    const products = it.combos[0].products
    base = products.reduce((t, p) => t + (Number(p.price || 0) * Number(p.qty || 1)), 0) * Number(it.qty || 1)
    products.forEach((p) => {
      const lineBase = Number(p.price || 0) * Number(p.qty || 1) * Number(it.qty || 1)
      if (Array.isArray(p.taxes)) {
        p.taxes.forEach((tx) => {
          const pct = Number(tx.taxPercentage || 0)
          const amount = Math.round(lineBase * pct / 100)
          if ((tx.taxName || '').toUpperCase().includes('PB1')) pb1 += amount
          else if ((tx.taxName || '').toUpperCase().includes('PPN') || (tx.taxName || '').toUpperCase().includes('PNN')) ppn += amount
        })
      }
    })
  } else {
    const qty = Number(it.qty || 1)
    base = Number(it.price || 0) * qty
    if (Array.isArray(it.taxes)) {
      it.taxes.forEach((tx) => {
        const pct = Number(tx.taxPercentage || 0)
        const amount = Math.round(base * pct / 100)
        if ((tx.taxName || '').toUpperCase().includes('PB1')) pb1 += amount
        else if ((tx.taxName || '').toUpperCase().includes('PPN') || (tx.taxName || '').toUpperCase().includes('PNN')) ppn += amount
      })
    }
  }
  return { base, pb1, ppn }
}

export default function BillPage() {
  const router = useRouter();
  const { id } = router.query;
  const [dataOrder, setDataOrder] = useState("")
  const [urlLogo, setUrlLogo] = useState("/images/pay-gopay.png")
  const printRef = useRef();

  const [payment, setPayment] = useState({ items: [], paymentTotal: 0 });

  useEffect(() => {
    const gp = getPayment() || {};
    setPayment({
      items: gp.cart || [],
      paymentTotal: gp.paymentTotal || 0,
    });

    const s = sessionStorage.getItem("midtrans_tx");
    if (s) {
      try { setDataOrder(JSON.parse(s)); }
      catch (e) { console.warn("Invalid midtrans_tx", e); }
    }
  }, []);

  useEffect(() => {
    if (!dataOrder) return;

    switch (dataOrder.payment_type) {
      case "qris": setUrlLogo("/images/pay-qris.png"); break;
      case "shopee": setUrlLogo("/images/pay-shopee.png"); break;
      case "ovo": setUrlLogo("/images/pay-ovo.png"); break;
      case "dana": setUrlLogo("/images/pay-dana.png"); break;
      default: setUrlLogo("/images/pay-gopay.png"); break;
    }
  }, [dataOrder]);

  // compute totals
  const items = payment.items || []
  let subtotal = 0
  let pb1Total = 0
  let ppnTotal = 0

  items.forEach((it) => {
    const t = calculateItemTaxes(it)
    subtotal += t.base
    pb1Total += t.pb1
    ppnTotal += t.ppn
  })

  subtotal = Math.round(subtotal)
  pb1Total = Math.round(pb1Total)
  ppnTotal = Math.round(ppnTotal)

  const unroundedTotal = subtotal + pb1Total + ppnTotal
  const roundedTotal = Math.round(unroundedTotal / 100) * 100
  const roundingAmount = roundedTotal - unroundedTotal
  const total = roundedTotal

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
        {payment.items.map((it, i) => {
        // ============================
        // COMBO ITEM RENDERER
        // ============================
        if (it.type === "combo") {
          const comboTotal = it.combos?.[0]?.products?.reduce((t, p) => t + (p.price * (p.qty || 1)), 0) || 0
          return (
            <div key={i} className={styles.itemRow}>
              <div className={styles.itemLeft}>

                {/* NAMA COMBO */}
                <div className={styles.itemTitle}>
                  {it.detailCombo?.name || it.title} ({it.qty}x)
                </div>

                {/* LIST PRODUK DI DALAM COMBO */}
                <div className={styles.itemAddon}>
                  {it.combos?.[0]?.products?.map((p, idx) => (
                    <div key={idx}>
                      • {p.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* HARGA TOTAL COMBO */}
              <div className={styles.itemRight}>
                {formatRp(
                  it.combos?.[0]?.products?.reduce((t, p) => t + (p.price * (p.qty || 1)), 0)
                )}
              </div>
            </div>
          );
        }

        // ============================
        // NON-COMBO NORMAL ITEM
        // ============================
        return (
          <div key={i} className={styles.itemRow}>
            <div className={styles.itemLeft}>
              <div className={styles.itemTitle}>{it.title}</div>

              <div className={styles.itemAddon}>
                {it.qty}x No Add Ons
              </div>
            </div>

            <div className={styles.itemRight}>{formatRp(it.price)}</div>
          </div>
        );
      })}

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
            <div>{formatRp(pb1Total)}</div>
          </div>

          <div className={styles.detailRow}>
            <div>PNN (11%)</div>
            <div>{formatRp(ppnTotal)}</div>
          </div>

          {/* NEW: Rounding row */}
          <div className={styles.detailRow}>
            <div>Rounding</div>
            <div>{formatRp(roundingAmount)}</div>
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
