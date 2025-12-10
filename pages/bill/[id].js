// FILE: pages/bill/[id].js
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import styles from "../../styles/BillPage.module.css";
import { getPayment } from "../../lib/cart";
import { getUser } from "../../lib/auth";

function formatRp(n) {
  return "Rp" + new Intl.NumberFormat("id-ID").format(Number(n || 0));
}

// Helper: tax calculator
function calcTaxAmountFromObj(taxObj, baseAmount) {
  const explicit = Number(taxObj.taxAmount ?? taxObj.TaxAmount ?? 0);
  if (explicit && explicit !== 0) return Math.round(explicit);

  const pct = Number(taxObj.taxPercentage ?? taxObj.TaxPercentage ?? 0);
  if (pct > 0) return Math.round(baseAmount * (pct / 100));

  return 0;
}

function calculateItemTaxes(it) {
  let base = 0;
  let pb1 = 0;
  let ppn = 0;

  if (it.type === "combo") {
    const products = it.combos[0].products ?? [];
    products.forEach((p) => {
      const lineBase = Number(p.price || 0) * Number(p.qty || 1);
      base += lineBase;

      if (Array.isArray(p.taxes)) {
        p.taxes.forEach((tx) => {
          const amt = calcTaxAmountFromObj(tx, lineBase);
          const name = (tx.taxName ?? "").toUpperCase();

          if (name.includes("PB")) pb1 += amt;
          else ppn += amt;
        });
      }
    });
  } else {
    const qty = Number(it.qty || 1);
    const price = Number(it.price ?? it.detailMenu?.Price ?? 0);
    base = price * qty;

    if (Array.isArray(it.taxes)) {
      it.taxes.forEach((tx) => {
        const amt = calcTaxAmountFromObj(tx, base);
        const name = (tx.taxName ?? "").toUpperCase();

        if (name.includes("PB")) pb1 += amt;
        else ppn += amt;
      });
    }
  }

  return { base, pb1, ppn };
}

export default function BillPage() {
  const router = useRouter();
  const { id } = router.query;
  const printRef = useRef();

  const [urlLogo, setUrlLogo] = useState("/images/pay-gopay.png");

  const [paymentFromStorage, setPaymentFromStorage] = useState({
    items: [],
    paymentTotal: 0,
  });

  const [doOrderRaw, setDoOrderRaw] = useState(null);

  // SIMPAN DATE SAAT HALAMAN DIBUKA
  const [dateString, setDateString] = useState("");

  useEffect(() => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const mo = String(now.getMonth() + 1).padStart(2, "0");
    const y = now.getFullYear();

    setDateString(`${h}:${m} ${d}/${mo}/${y}`)

    try {
      const gp = getPayment() || {};
      setPaymentFromStorage({
        items: gp.cart || [],
        paymentTotal: gp.paymentTotal || 0,
      });
    } catch {}

    try {
      const raw = sessionStorage.getItem("do_order_result");
      if (raw) {
        const parsed = JSON.parse(raw);
        setDoOrderRaw(parsed.data ?? parsed);
        if (parsed.Payment.toLowerCase().includes("gopay")) {
            setUrlLogo("/images/pay-gopay.png")
        } if (parsed.Payment.toLowerCase().includes("qris")) {
          setUrlLogo("/images/pay-qris.png")
        } 
      }
    } catch {}
  }, []);

  // Normalisasi item
  const itemsFromPayload = useMemo(() => {
    if (!doOrderRaw) return [];
    const arr = [];

    (doOrderRaw.Combos ?? []).forEach((cb) => {
      arr.push({
        type: "combo",
        qty: cb.qty,
        orderType: cb.orderType,
        detailCombo: cb.detailCombo,
        combos: [{ orderType: cb.orderType, products: cb.products }],
      });
    });

    (doOrderRaw.Menus ?? []).forEach((m) => {
      arr.push({
        type: "menu",
        qty: m.Qty,
        orderType: m.OrderType,
        detailMenu: m.DetailMenu,
        condiments: m.Condiments ?? [],
        taxes: m.Taxes ?? [],
      });
    });

    return arr;
  }, [doOrderRaw]);

  const hasPPN = useMemo(() => {
    if (!doOrderRaw) return false;

    // Cek tax di COMBOS
    for (const cb of doOrderRaw.Combos ?? []) {
      for (const p of cb.products ?? []) {
        for (const tx of p.taxes ?? []) {
          const name = (tx.taxName ?? "").toUpperCase();
          const pct = Number(tx.taxPercentage ?? 0);
          if (name.includes("PPN") || pct === 11) return true;
        }
      }
    }

    // Cek tax di MENUS
    for (const m of doOrderRaw.Menus ?? []) {
      for (const tx of m.Taxes ?? []) {
        const name = (tx.taxName ?? "").toUpperCase();
        const pct = Number(tx.taxPercentage ?? 0);
        if (name.includes("PPN") || pct === 11) return true;
      }
    }

    return false;
  }, [doOrderRaw]);

  const items =
    itemsFromPayload.length > 0 ? itemsFromPayload : paymentFromStorage.items;

  /* GROUP DI / TA */
  const dineInItems = items.filter((it) => it.orderType === "DI");
  const takeAwayItems = items.filter((it) => it.orderType === "TA");

  /* HITUNG TOTAL & TAX */
  let computedSubtotal = 0;
  let computedPB1 = 0;
  let computedPPN = 0;

  items.forEach((it) => {
    const t = calculateItemTaxes(it);
    computedSubtotal += t.base;
    computedPB1 += t.pb1;
    computedPPN += t.ppn;
  });

  const unroundedTotal = computedSubtotal + computedPB1 + computedPPN;
  let roundedTotal = Math.round(unroundedTotal / 100) * 100;

  if (Math.abs(unroundedTotal) < 20) roundedTotal = unroundedTotal;

  let roundingAmount = roundedTotal - unroundedTotal;
  if (Math.abs(unroundedTotal) < 20) roundingAmount = 0;

  /* DOWNLOAD PDF */
  const downloadPDF = async () => {
    const canvas = await html2canvas(printRef.current, { scale: 2 });
    const img = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;

    pdf.addImage(img, "PNG", 0, 0, width, height);
    pdf.save(`bill-${id}.pdf`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          ←
        </button>
        <div className={styles.headerTitle}>Detail Bill</div>
        <div style={{ width: 20 }} />
      </header>

      <div ref={printRef} className={styles.billWrapper}>
        {/* HEADER TOKO */}
        <div className={styles.outletHeader}>
          <div className={styles.outletName}>
            Yoshinoya Mall Grand Indonesia
          </div>

          <div className={styles.outletAddr}>
            Jl. M.H. Thamrin No.1, Jakarta Pusat
          </div>

          {/* DATETIME */}
          <div className={styles.orderDate}>{dateString}</div>
        </div>

        {/* NOMOR BILL */}
        <div className={styles.billNumberRow}>
          <div className={styles.billLabel}>Nomor Bill</div>
          <div className={styles.billValue}>
            {doOrderRaw?.DisplayOrderId ?? id}
          </div>
        </div>

        {/* TABLE NUMBER */}
        <div className={styles.billNumberRow}>
          {hasPPN ? (
            <div className={styles.npwpLabel}>40.21.25.003511</div>
          ) : (
            <div className={styles.npwpLabel}></div>
          )}
          <div className={styles.npwpLabel}>
            {doOrderRaw?.TableNumber ? `Table ${doOrderRaw.TableNumber}` : ""}
          </div>
        </div>

        {/* ============= DINE IN SECTION ============= */}
        {dineInItems.length > 0 && (
          <>
            <div className={styles.sectionHeader}>DINE IN</div>

            {dineInItems.map((it, i) => {
              if (it.type === "combo") {
                const products = it.combos[0].products ?? [];
                const total = products.reduce(
                  (t, p) => t + p.price * p.qty,
                  0
                );

                return (
                  <div key={i} className={styles.itemRow}>
                    <div className={styles.itemLeft}>
                      <div className={styles.itemTitle}>
                        {it.detailCombo.name} ({it.qty}x)
                      </div>

                      {products.map((p, idx) => (
                        <div key={idx} className={styles.itemAddon}>
                          • {p.itemName}
                        </div>
                      ))}
                    </div>

                    <div className={styles.itemRight}>{formatRp(total)}</div>
                  </div>
                );
              }

              /* MENU */
              const base = Number(it.detailMenu?.Price ?? 0);
              const qty = Number(it.qty || 1);
              const addonTotal = (it.condiments ?? []).reduce(
                (t, c) => t + Number(c.Price ?? 0),
                0
              );
              const menuTotal = (base + addonTotal) * qty;

              return (
                <div key={i} className={styles.itemRow}>
                  <div className={styles.itemLeft}>
                    <div className={styles.itemTitle}>
                      {it.detailMenu?.ItemName} ({qty}x)
                    </div>

                    {it.condiments?.length > 0 ? (
                      it.condiments.map((c, idx) => (
                        <div key={idx} className={styles.itemAddon}>
                          • {c.Name || c.ItemName || c.name}
                        </div>
                      ))
                    ) : (
                      <div className={styles.itemAddon}>• no addon</div>
                    )}
                  </div>

                  <div className={styles.itemRight}>{formatRp(menuTotal)}</div>
                </div>
              );
            })}
          </>
        )}

        {/* ============= TAKE AWAY SECTION ============= */}
        {takeAwayItems.length > 0 && (
          <>
            <div className={styles.sectionHeader}>TAKE AWAY</div>

            {takeAwayItems.map((it, i) => {
              if (it.type === "combo") {
                const products = it.combos[0].products ?? [];
                const total = products.reduce(
                  (t, p) => t + p.price * p.qty,
                  0
                );

                return (
                  <div key={i} className={styles.itemRow}>
                    <div className={styles.itemLeft}>
                      <div className={styles.itemTitle}>
                        {it.detailCombo.name} ({it.qty}x)
                      </div>

                      {products.map((p, idx) => (
                        <div key={idx} className={styles.itemAddon}>
                          • {p.itemName}
                        </div>
                      ))}
                    </div>

                    <div className={styles.itemRight}>{formatRp(total)}</div>
                  </div>
                );
              }

              /* MENU */
              const base = Number(it.detailMenu?.Price ?? 0);
              const qty = Number(it.qty || 1);
              const addonTotal = (it.condiments ?? []).reduce(
                (t, c) => t + Number(c.Price ?? 0),
                0
              );
              const menuTotal = (base + addonTotal) * qty;

              return (
                <div key={i} className={styles.itemRow}>
                  <div className={styles.itemLeft}>
                    <div className={styles.itemTitle}>
                      {it.detailMenu?.ItemName} ({qty}x)
                    </div>

                    {it.condiments?.length > 0 ? (
                      it.condiments.map((c, idx) => (
                        <div key={idx} className={styles.itemAddon}>
                          • {c.Name || c.ItemName || c.name}
                        </div>
                      ))
                    ) : (
                      <div className={styles.itemAddon}>• no addon</div>
                    )}
                  </div>

                  <div className={styles.itemRight}>{formatRp(menuTotal)}</div>
                </div>
              );
            })}
          </>
        )}

        {/* PAYMENT */}
        <div className={styles.paymentBox}>
          <div>Pembayaran Online</div>
          <img src={urlLogo} width={55} />
        </div>

        {/* TOTAL BOX */}
        <div className={styles.detailBox}>
          <div className={styles.detailRow}>
            <div>Subtotal</div>
            <div>{formatRp(computedSubtotal)}</div>
          </div>

          <div className={styles.detailRow}>
            <div>PB1</div>
            <div>{formatRp(computedPB1)}</div>
          </div>

          <div className={styles.detailRow}>
            <div>Rounding</div>
            <div>{formatRp(roundingAmount)}</div>
          </div>

          <div className={styles.totalRow}>
            <div>Total</div>
            <div className={styles.totalValue}>{formatRp(roundedTotal)}</div>
          </div>
        </div>
      </div>

      <div className={styles.downloadWrap}>
        <button className={styles.downloadBtn} onClick={downloadPDF}>
          Download Bill (PDF)
        </button>
      </div>
    </div>
  );
}