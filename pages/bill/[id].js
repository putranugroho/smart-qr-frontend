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

// Helper: prefer explicit taxAmount when present, otherwise compute from percentage
function calcTaxAmountFromObj(taxObj, baseAmount) {
  const explicit = Number(taxObj.taxAmount ?? taxObj.TaxAmount ?? taxObj.amount ?? 0);
  if (explicit && explicit !== 0) return Math.round(explicit);
  const pct = Number(taxObj.taxPercentage ?? taxObj.TaxPercentage ?? taxObj.amount ?? 0);
  if (pct > 0) return Math.round(baseAmount * (pct / 100));
  return 0;
}

// Revised calculateItemTaxes: handle combos and menus, prefer taxAmount
function calculateItemTaxes(it) {
  let base = 0;
  let pb1 = 0;
  let ppn = 0;

  if (it && it.type === "combo" && Array.isArray(it.combos)) {
    const products = it.combos.flatMap(cb => (Array.isArray(cb.products) ? cb.products : []));
    products.forEach((p) => {
      const pQty = Number(p.qty || 1);
      const basePrice = Number(p.price || 0);
      // product may have combo multiplier saved as _comboQty or just treat per product qty
      const cbQty = Number(p._comboQty || 1);
      const itemQty = Number(it.qty || 1);
      const lineBase = basePrice * pQty * cbQty * itemQty;
      base += lineBase;

      if (Array.isArray(p.taxes)) {
        p.taxes.forEach(tx => {
          const taxAmt = calcTaxAmountFromObj(tx, lineBase);
          const name = (tx.taxName ?? tx.TaxName ?? tx.name ?? '').toString().toUpperCase();
          if (name.includes('PB')) pb1 += taxAmt;
          else if (name.includes('PPN')) ppn += taxAmt;
          else ppn += taxAmt; // unknown taxes -> treat as ppn fallback
        });
      }

      if (Array.isArray(p.condiments)) {
        p.condiments.forEach(c => {
          const cQty = Number(c.qty || 1);
          const cPrice = Number(c.price || 0);
          const cBase = cPrice * cQty * pQty * cbQty * itemQty;
          base += cBase;
          if (Array.isArray(c.taxes)) {
            c.taxes.forEach(tx => {
              const taxAmt = calcTaxAmountFromObj(tx, cBase);
              const name = (tx.taxName ?? tx.TaxName ?? tx.name ?? '').toString().toUpperCase();
              if (name.includes('PB')) pb1 += taxAmt;
              else if (name.includes('PPN')) ppn += taxAmt;
              else ppn += taxAmt;
            });
          }
        });
      }
    });
  } else {
    const qty = Number(it.qty || 1);
    const price = Number(it.price ?? it.detailMenu?.Price ?? it.detailMenu?.price ?? 0);
    base = price * qty;

    if (Array.isArray(it.taxes)) {
      it.taxes.forEach(tx => {
        const taxAmt = calcTaxAmountFromObj(tx, base);
        const name = (tx.taxName ?? tx.TaxName ?? tx.name ?? '').toString().toUpperCase();
        if (name.includes('PB')) pb1 += taxAmt;
        else if (name.includes('PPN')) ppn += taxAmt;
        else ppn += taxAmt;
      });
    }

    if (Array.isArray(it.condiments)) {
      it.condiments.forEach(c => {
        const cQty = Number(c.qty || 1);
        const cPrice = Number(c.price || 0);
        const cBase = cPrice * cQty * qty;
        base += cBase;
        if (Array.isArray(c.taxes)) {
          c.taxes.forEach(tx => {
            const taxAmt = calcTaxAmountFromObj(tx, cBase);
            const name = (tx.taxName ?? tx.TaxName ?? tx.name ?? '').toString().toUpperCase();
            if (name.includes('PB')) pb1 += taxAmt;
            else if (name.includes('PPN')) ppn += taxAmt;
            else ppn += taxAmt;
          });
        }
      });
    }
  }

  return { base: Math.round(base), pb1: Math.round(pb1), ppn: Math.round(ppn) };
}

export default function BillPage() {
  const router = useRouter();
  const { id } = router.query;
  const printRef = useRef();

  const [user, setUser] = useState(null);
  const [urlLogo, setUrlLogo] = useState("/images/pay-gopay.png");

  // raw sources
  const [paymentFromStorage, setPaymentFromStorage] = useState({ items: [], paymentTotal: 0 });
  const [midtransRaw, setMidtransRaw] = useState(null);
  const [doOrderRaw, setDoOrderRaw] = useState(null); // normalised payload/data

  useEffect(() => {
    // load client payment (fallback)
    try {
      const gp = getPayment() || {};
      setPaymentFromStorage({
        items: gp.cart || [],
        paymentTotal: gp.paymentTotal || 0
      });
    } catch (e) { /* ignore */ }

    // load user
    try {
      const dUser = getUser?.() || null;
      setUser(dUser);
    } catch (e) {}

    // prefer do_order_result in sessionStorage
    try {
      const raw = sessionStorage.getItem('do_order_result');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // accept either { data: ... } or payload directly
          const payload = parsed?.data ?? parsed;
          setDoOrderRaw(payload || parsed);
        } catch (e) {
          console.warn("Invalid do_order_result", e);
        }
      }
    } catch (e) {}

    // also capture midtrans_tx if present (for payment type detection)
    try {
      const s = sessionStorage.getItem("midtrans_tx");
      if (s) {
        try { setMidtransRaw(JSON.parse(s)); } catch (e) { console.warn("Invalid midtrans_tx", e); }
      }
    } catch (e) {}
  }, []);

  // decide payment logo from midtransRaw or doOrderRaw
  useEffect(() => {
    const src = midtransRaw || doOrderRaw;
    if (!src) return;
    const ptype = (midtransRaw && (midtransRaw.payment_type || midtransRaw.paymentType)) || (doOrderRaw && doOrderRaw.selfPaymentCategory) || '';
    switch ((ptype || '').toString().toLowerCase()) {
      case "qris": setUrlLogo("/images/pay-qris.png"); break;
      case "shopee": setUrlLogo("/images/pay-shopee.png"); break;
      case "ovo": setUrlLogo("/images/pay-ovo.png"); break;
      case "dana": setUrlLogo("/images/pay-dana.png"); break;
      case "gopay": setUrlLogo("/images/pay-gopay.png"); break;
      default: setUrlLogo("/images/pay-gopay.png"); break;
    }
  }, [midtransRaw, doOrderRaw]);

  // Normalize items from doOrderRaw payload (combos + menus) -> same shape used by OrderStatus
  const itemsFromPayload = useMemo(() => {
    const d = doOrderRaw;
    if (!d) return [];

    const arr = [];

    const combos = d.combos ?? d.Combos ?? [];
    if (Array.isArray(combos) && combos.length > 0) {
      combos.forEach(cb => {
        const productsRaw = Array.isArray(cb.products ?? cb.Products) ? (cb.products ?? cb.Products) : [];
        const mappedProducts = productsRaw.map(p => ({
          code: p.code ?? p.Code ?? '',
          name: p.name ?? p.Name ?? '',
          price: Number(p.price ?? p.Price ?? 0),
          qty: Number(p.qty ?? p.Qty ?? 1),
          taxes: Array.isArray(p.taxes ?? p.Taxes) ? (p.taxes ?? p.Taxes).map(t => ({
            taxName: t.taxName ?? t.TaxName ?? t.name ?? '',
            taxPercentage: Number(t.taxPercentage ?? t.TaxPercentage ?? t.amount ?? 0),
            taxAmount: Number(t.taxAmount ?? t.TaxAmount ?? 0)
          })) : [],
          condiments: Array.isArray(p.condiments ?? p.Condiments) ? (p.condiments ?? p.Condiments) : []
        }));

        arr.push({
          type: 'combo',
          combos: [{
            detailCombo: {
              code: cb.detailCombo?.code ?? cb.DetailCombo?.Code ?? cb.code ?? cb.Code ?? '',
              name: cb.detailCombo?.name ?? cb.DetailCombo?.Name ?? cb.name ?? cb.Name ?? ''
            },
            isFromMacro: !!cb.isFromMacro,
            orderType: cb.orderType ?? cb.OrderType ?? '',
            products: mappedProducts,
            qty: cb.qty ?? cb.Qty ?? 1,
            voucherCode: cb.voucherCode ?? cb.VoucherCode ?? null
          }],
          qty: cb.qty ?? cb.Qty ?? 1,
          detailCombo: {
            code: cb.detailCombo?.code ?? cb.DetailCombo?.Code ?? '',
            name: cb.detailCombo?.name ?? cb.DetailCombo?.Name ?? '',
            image: cb.detailCombo?.image ?? cb.DetailCombo?.Image ?? cb.image ?? null
          },
          note: cb.note ?? cb.Note ?? '',
          image: cb.image ?? cb.Image ?? null,
          taxes: Array.isArray(cb.taxes ?? cb.Taxes) ? (cb.taxes ?? cb.Taxes) : []
        });
      });
    }

    const menus = d.menus ?? d.Menus ?? [];
    if (Array.isArray(menus) && menus.length > 0) {
      menus.forEach(m => {
        arr.push({
          type: 'menu',
          price: Number(m.detailMenu?.price ?? m.DetailMenu?.Price ?? m.price ?? 0),
          qty: m.qty ?? m.Qty ?? 1,
          title: m.detailMenu?.name ?? m.DetailMenu?.Name ?? m.name ?? m.title ?? '',
          name: m.detailMenu?.name ?? m.DetailMenu?.Name ?? m.name ?? m.title ?? '',
          image: m.detailMenu?.image ?? m.DetailMenu?.Image ?? m.image ?? null,
          condiments: Array.isArray(m.condiments ?? m.Condiments) ? (m.condiments ?? m.Condiments) : [],
          taxes: Array.isArray(m.taxes ?? m.Taxes) ? (m.taxes ?? m.Taxes) : []
        });
      });
    }

    return arr;
  }, [doOrderRaw]);

  // final items to render: payload if present else client payment items
  const items = itemsFromPayload.length > 0 ? itemsFromPayload : (paymentFromStorage.items || []);
  console.log("items", items);
  console.log("doOrderRaw", doOrderRaw);
  
  {/* ========= GROUPING by ORDERTYPE ========= */}
  const dineInItems = items.filter(it =>
    it.type === "combo"
      ? it.combos?.[0]?.orderType === "DI"
      : it.menus?.[0]?.orderType === "DI"
  );

  const takeAwayItems = items.filter(it =>
    it.type === "combo"
      ? it.combos?.[0]?.orderType === "TA"
      : it.menus?.[0]?.orderType === "TA"
  );

  // compute totals using calculateItemTaxes but if doOrderRaw contains top-level taxes, prefer those amounts
  let computedSubtotal = 0;
  let computedPB1 = 0;
  let computedPPN = 0;

  items.forEach(it => {
    const t = calculateItemTaxes(it);
    computedSubtotal += t.base;
    computedPB1 += t.pb1;
    computedPPN += t.ppn;
  });

  computedSubtotal = Math.round(computedSubtotal);
  computedPB1 = Math.round(computedPB1);
  computedPPN = Math.round(computedPPN);

  if (doOrderRaw && Array.isArray(doOrderRaw.taxes) && doOrderRaw.taxes.length > 0) {
    const top = doOrderRaw.taxes.reduce((acc, tx) => {
      const name = (tx.taxName ?? tx.TaxName ?? tx.name ?? '').toString().toUpperCase();
      const amt = Number(tx.taxAmount ?? tx.TaxAmount ?? 0);
      if (name.includes('PB')) acc.pb1 += amt;
      else if (name.includes('PPN')) acc.ppn += amt;
      return acc;
    }, { pb1: 0, ppn: 0 });
    if (top.pb1 || top.ppn) {
      computedPB1 = Math.round(top.pb1);
      computedPPN = Math.round(top.ppn);
    }
  }

  const unroundedTotal = computedSubtotal + computedPB1 + computedPPN;
  const roundedTotal = Math.round(unroundedTotal / 100) * 100;
  const roundingAmount = roundedTotal - unroundedTotal;
  const total = roundedTotal;

  // Download PDF
  const downloadPDF = async () => {
    const element = printRef.current;
    const canvas = await html2canvas(element, { scale: 2 });
    const img = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;

    pdf.addImage(img, "PNG", 0, 0, width, height);
    pdf.save(`bill-${id || (doOrderRaw?.displayOrderId ?? '')}.pdf`);
  };

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>←</button>
        <div className={styles.headerTitle}>Detail Bill</div>
        <div style={{ width: 20 }} />
      </header>

      {/* CONTENT */}
      <div ref={printRef} className={styles.billWrapper}>
        <div className={styles.outletHeader}>
          <div className={styles.outletName}>Yoshinoya Mall Grand Indonesia</div>
          <div className={styles.outletAddr}>
            Jl. M.H. Thamrin No.1, Kb. Melati, Kecamatan Tanah Abang, Kota Jakarta Pusat,  
            Daerah Khusus Ibukota Jakarta 10230
          </div>
        </div>
        {/* NOMOR BILL */}
        <div className={styles.billNumberRow}>
          <div className={styles.billLabel}>Nomor Bill</div>
          <div className={styles.billValue}>{String(doOrderRaw?.displayOrderId ?? id ?? '')}</div>
        </div>

        {/* NPWP & TABLE */}
        <div className={styles.billNumberRow}>
          <div className={styles.npwpLabel}>{computedPPN > 0 ? "NPWP : 02.906.343.5-006.000" : ""}</div>
          <div className={styles.npwpLabel}>{user?.tableNumber ?? (doOrderRaw?.tableNumber ?? "")}</div>
        </div>

        {/* ====== DINE IN SECTION ====== */}
        {dineInItems.length > 0 && (
          <>
            <div className={styles.sectionHeader}>DINE IN</div>

            {dineInItems.map((it, i) => {
              /* ---- Combo DI ---- */
              if (it.type === "combo") {
                const comboProducts = it.combos?.[0]?.products ?? [];
                const comboTotal = comboProducts.reduce(
                  (t, p) => t + (Number(p.price || 0) * Number(p.qty || 1)),
                  0
                );

                return (
                  <div key={`DI-${i}`} className={styles.itemRow}>
                    <div className={styles.itemLeft}>
                      <div className={styles.itemTitle}>
                        {it.detailCombo?.name} ({it.qty}x)
                      </div>
                      <div className={styles.itemAddon}>
                        {comboProducts.map((p, idx) => (
                          <div key={idx}>• {p.name}</div>
                        ))}
                      </div>
                    </div>

                    <div className={styles.itemRight}>{formatRp(comboTotal)}</div>
                  </div>
                );
              }

              /* ---- Normal Menu DI ---- */
              const menu = it.menus?.[0] ?? {};
              const detail = menu.detailMenu ?? {};
              const condText =
                menu.condiments?.length
                  ? menu.condiments.map(c => c.name || c.group || c.code).join(", ")
                  : (it.note || "No Add Ons");

              return (
                <div key={`DI-${i}`} className={styles.itemRow}>
                  <div className={styles.itemLeft}>
                    <div className={styles.itemTitle}>{detail.itemName}</div>
                    <div className={styles.itemAddon}>• {condText}</div>
                  </div>

                  <div className={styles.itemRight}>
                    {formatRp(
                      (Number(detail.price ?? it.price ?? 0)) * (Number(it.qty || 1))
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}



        {/* ====== TAKE AWAY SECTION ====== */}
        {takeAwayItems.length > 0 && (
          <>
            <div className={styles.sectionHeader}>TAKE AWAY</div>

            {takeAwayItems.map((it, i) => {
              /* ---- Combo TA ---- */
              if (it.type === "combo") {
                const comboProducts = it.combos?.[0]?.products ?? [];
                const comboTotal = comboProducts.reduce(
                  (t, p) => t + (Number(p.price || 0) * Number(p.qty || 1)),
                  0
                );

                return (
                  <div key={`TA-${i}`} className={styles.itemRow}>
                    <div className={styles.itemLeft}>
                      <div className={styles.itemTitle}>
                        {it.detailCombo?.name} ({it.qty}x)
                      </div>
                      <div className={styles.itemAddon}>
                        {comboProducts.map((p, idx) => (
                          <div key={idx}>• {p.name}</div>
                        ))}
                      </div>
                    </div>

                    <div className={styles.itemRight}>{formatRp(comboTotal)}</div>
                  </div>
                );
              }

              /* ---- Normal Menu TA ---- */
              const menu = it.menus?.[0] ?? {};
              const detail = menu.detailMenu ?? {};

              const condText =
                menu.condiments?.length
                  ? menu.condiments.map(c => c.name || c.group || c.code).join(", ")
                  : (it.note || "No Add Ons");

              return (
                <div key={`TA-${i}`} className={styles.itemRow}>
                  <div className={styles.itemLeft}>
                    <div className={styles.itemTitle}>{detail.itemName}</div>
                    <div className={styles.itemAddon}>• {condText}</div>
                  </div>

                  <div className={styles.itemRight}>
                    {formatRp(
                      (Number(detail.price ?? it.price ?? 0)) * (Number(it.qty || 1))
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}


        {/* PAYMENT BOX */}
        <div className={styles.paymentBox}>
          <div className={styles.paymentBoxLeft}>Pembayaran Online</div>
          <div className={styles.paymentBoxRight}>
            <img src={urlLogo} alt="logo" width={55} height={14} />
          </div>
        </div>

        {/* PAYMENT DETAIL */}
        <div className={styles.detailBox}>
          <div className={styles.detailRow}>
            <div>Subtotal ({items.length} menu)</div>
            <div>{formatRp(computedSubtotal)}</div>
          </div>

          <div className={styles.detailRow}>
            <div>PB1 (10%)</div>
            <div>{formatRp(computedPB1)}</div>
          </div>

          {computedPPN > 0 && (
            <div className={styles.detailRow}>
              <div>PPN (11%)</div>
              <div>{formatRp(computedPPN)}</div>
            </div>
          )}

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