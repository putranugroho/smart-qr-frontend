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
    const price = Number(it.price ?? it.detailMenu?.price ?? it.detailMenu?.Price ?? 0);
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
  const [doOrderRaw, setDoOrderRaw] = useState(null);
  const [dateString, setDateString] = useState("");
  const [dateNow, setDateNow] = useState("");
  const [paymentFromStorage, setPaymentFromStorage] = useState({
    items: [],
    paymentTotal: 0,
  });

  const urlLogo = useMemo(() => {
    return resolvePaymentLogo(doOrderRaw);
  }, [doOrderRaw]);
  
  const referenceCode = useMemo(() => {
    return resolveReferenceCode(doOrderRaw);
  }, [doOrderRaw]);

  useEffect(() => {
    try {
      const gp = getPayment() || {};
      setPaymentFromStorage({
        items: gp.cart || [],
        paymentTotal: gp.paymentTotal || 0,
      });
    } catch {}

    try {
      let raw = sessionStorage.getItem("do_order_result");
      if (!raw) raw = localStorage.getItem("do_order_result");

      if (raw) {
        const parsed = JSON.parse(raw);
        const data = parsed.data ?? parsed;

        const createdAtRaw = data.orderCreatedAt;
        
        if (createdAtRaw) {
          const date = new Date(createdAtRaw);
          
          const h = String(date.getHours()).padStart(2, "0");
          const m = String(date.getMinutes()).padStart(2, "0");
          const d = String(date.getDate()).padStart(2, "0");
          const mo = String(date.getMonth() + 1).padStart(2, "0");
          const y = date.getFullYear();
          
          setDateString(`${h}:${m} ${d}/${mo}/${y}`);
        }
        const now = new Date();
        const h = String(now.getHours()).padStart(2, "0");
        const m = String(now.getMinutes()).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        const mo = String(now.getMonth() + 1).padStart(2, "0");
        const y = now.getFullYear();

        setDateNow(`${h}:${m} ${d}/${mo}/${y}`)

        setDoOrderRaw(data);
      }
    } catch {}
  }, []);

  function resolvePaymentLogo(data) {
    if (!data) return "";

    const source =
      data.payment ||
      data.Payment ||
      data.referenceCode ||
      "";

    const s = String(source).toLowerCase();

    if (s.includes("gopay")) return "/images/pay-gopay.png";
    if (s.includes("shopeepay")) return "/images/pay-shopeepay.png";
    if (s.includes("qris")) return "/images/pay-qris.png";

    return "";
  }

  function resolveReferenceCode(data) {
    if (!data?.referenceCode) return "";

    // contoh: "Gopay,cb516e29-690c-4b85-9f93-89b6e642a652"
    const parts = String(data.referenceCode).split(",");

    return parts[1] ? parts[1].trim() : "";
  }

  function computeComboTotal(cb) {
    return (cb.products || []).reduce((sum, p) => {
      const base =
        Number(p.price || 0) * Number(p.qty || 1)

      const condimentTotal = (p.condiments || []).reduce(
        (cs, c) => cs + Number(c.price || 0) * Number(c.qty || 1),
        0
      )

      return sum + base + condimentTotal
    }, 0)
  }

  // Normalisasi item
  const itemsFromPayload = useMemo(() => {
    if (!doOrderRaw) return [];
    const arr = [];

    (doOrderRaw.combos ?? []).forEach((cb) => {
      arr.push({
        type: "combo",
        qty: cb.qty ?? 1,
        orderType: cb.orderType,
        detailCombo: cb.detailCombo,
        finalAmount: Number(
          cb.totalAmount ??
          cb.amount ??
          cb.grandTotal ??
          0
        ),
        combos: [
          {
            products: cb.products ?? [],
          },
        ],
      });
    });

    // ✅ MENUS 
    (doOrderRaw.menus ?? []).forEach((m) => {
      arr.push({
        type: "menu",
        qty: m.qty ?? 1,
        orderType: m.orderType,
        detailMenu: m.detailMenu,
        finalAmount: Number(
          m.totalAmount ??
          m.amount ??
          m.priceAmount ??
          0
        ),
        condiments: m.condiments ?? [],
      });
    });

    return arr;
  }, [doOrderRaw]);

  const hasPPN = useMemo(() => {
    if (!doOrderRaw) return false;

    // Cek tax di COMBOS
    for (const cb of (doOrderRaw.combos ?? doOrderRaw.Combos ?? [])) {
      for (const p of cb.products ?? []) {
        for (const tx of p.taxes ?? []) {
          const name = (tx.taxName ?? "").toUpperCase();
          const pct = Number(tx.taxPercentage ?? 0);
          if (name.includes("PPN") || pct === 11) return true;
        }
      }
    }

    // Cek tax di MENUS
    for (const m of (doOrderRaw.menus ?? doOrderRaw.Menus ?? [])) {
      for (const tx of (m.taxes ?? m.Taxes ?? [])) {
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

  const hasBackendTotals =
    doOrderRaw &&
    typeof doOrderRaw.subTotal === "number" &&
    typeof doOrderRaw.grandTotal === "number";

  const computedSubtotal = hasBackendTotals
    ? Number(doOrderRaw.subTotal)
    : 0;

    let computedPB1 = 0
    let computedPPN = 0
  
    if (hasBackendTotals && Array.isArray(doOrderRaw.taxes)) {
      doOrderRaw.taxes.forEach(tx => {
        const name = String(tx.taxName || '').toUpperCase()
        const amt = Number(tx.taxAmount || 0)
  
        if (name.includes('PB')) computedPB1 += amt
        if (name.includes('PPN')) computedPPN += amt
      })
    } else {
      items.forEach(it => {
        const t = calculateItemTaxes(it)
        computedPB1 += t.pb1
        computedPPN += t.ppn
      })
    }
  
    computedPB1 = Math.round(computedPB1)
    computedPPN = Math.round(computedPPN)

  const roundingAmount = hasBackendTotals
    ? Number(doOrderRaw.rounding || 0)
    : 0;

  const roundedTotal = hasBackendTotals
    ? Number(doOrderRaw.grandTotal)
    : 0;

  /* DOWNLOAD JPG */
  const downloadJPG = async () => {
    if (!printRef?.current) return;

    const canvas = await html2canvas(printRef.current, {
      scale: 2, // makin besar makin HD
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.92); // JPG HD

    const link = document.createElement("a");
    link.href = imgData;
    link.download = `bill-${id}.jpg`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          <div className={styles.orderDate}>{dateNow}</div>
        </div>

        {/* NOMOR BILL */}
        <div className={styles.billNumberRow}>
          <div className={styles.billLabel}>Nomor Bill</div>
          <div className={styles.billValue}>
            {id}
          </div>
        </div>

        <div className={styles.billDate}>
          {dateString}
        </div>

        {/* TABLE NUMBER */}
        <div className={styles.billNumberRow}>
          {hasPPN ? (
            <div className={styles.npwpLabel}>40.21.25.003511</div>
          ) : (
            <div className={styles.npwpLabel}></div>
          )}
          <div className={styles.npwpLabel}>
            {doOrderRaw?.tableNumber ?? doOrderRaw?.TableNumber ? `Table ${doOrderRaw.TableNumber ?? doOrderRaw.tableNumber}` : ""}
          </div>
        </div>

        {/* ============= DINE IN SECTION ============= */}
        {dineInItems.length > 0 && (
          <>
            <div className={styles.sectionHeader}>DINE IN</div>

            {dineInItems.map((it, i) => {
              if (it.type === "combo") {
                const products = it.combos[0].products ?? [];
                const comboQty = Number(it.qty || 1)
                const total = computeComboTotal(it.combos[0])

                return (
                  <div key={i} className={styles.itemRow}>
                    <div className={styles.itemLeft}>
                      <div className={styles.itemTitle}>
                        {it.detailCombo?.name ?? it.detailCombo?.itemName ?? "-"} ({it.qty}x)
                      </div>

                      {products.map((p, idx) => (
                        <div key={idx} className={styles.itemAddon}>
                          • {p.itemName}
                          {p.condiments?.length > 0 && (
                            <div style={{ marginLeft: 12, fontSize: 12 }}>
                              + {p.condiments.map(c => c.itemName || c.name).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className={styles.itemRight}>{formatRp(total)}</div>
                  </div>
                );
              }

              /* MENU */
              const base = Number(it.detailMenu?.price || 0) * Number(it.qty || 1);
              const qty = Number(it.qty || 1);
              const addonTotal = (it.condiments ?? []).reduce(
                (t, c) => t + Number(c.price || c.Price || 0) * Number(c.qty || 1),
                0
              )

              const taxTotal = (it.taxes || []).reduce(
                (t, tx) => t + Number(tx.taxAmount || 0),
                0
              );

              const menuTotal = base + taxTotal + addonTotal

              return (
                <div key={i} className={styles.itemRow}>
                  <div className={styles.itemLeft}>
                    <div className={styles.itemTitle}>
                      {it.detailMenu?.name ?? it.detailMenu?.Name} ({qty}x)
                    </div>

                    {it.condiments?.length > 0 ? (
                      it.condiments.map((c, idx) => (
                        <div key={idx} className={styles.itemAddon}>
                          • {c.Name || c.name}
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
                const comboQty = Number(it.qty || 1)
                const total = computeComboTotal(it.combos[0])

                return (
                  <div key={i} className={styles.itemRow}>
                    <div className={styles.itemLeft}>
                      <div className={styles.itemTitle}>
                        {it.detailCombo.name} ({it.qty}x)
                      </div>

                      {products.map((p, idx) => (
                        <div key={idx} className={styles.itemAddon}>
                          • {p.itemName}
                          {p.condiments?.length > 0 && (
                            <div style={{ marginLeft: 12, fontSize: 12 }}>
                              + {p.condiments.map(c => c.itemName || c.name).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className={styles.itemRight}>{formatRp(total)}</div>
                  </div>
                );
              }

              /* MENU */
              const base = Number(it.detailMenu?.price || 0) * Number(it.qty || 1);
              const qty = Number(it.qty || 1);
              const addonTotal = (it.condiments ?? []).reduce(
                (t, c) => t + Number(c.price || c.Price || 0) * Number(c.qty || 1),
                0
              )

              const taxTotal = (it.taxes || []).reduce(
                (t, tx) => t + Number(tx.taxAmount || 0),
                0
              );

              const menuTotal = base + taxTotal + addonTotal

              return (
                <div key={i} className={styles.itemRow}>
                  <div className={styles.itemLeft}>
                    <div className={styles.itemTitle}>
                      {it.detailMenu?.ItemName ?? it.detailMenu?.itemName} ({qty}x)
                    </div>

                    {it.condiments?.length > 0 ? (
                      it.condiments.map((c, idx) => (
                        <div key={idx} className={styles.itemAddon}>
                          • {c.Name || c.ItemName || c.itemName || c.name}
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
        {urlLogo && (
          <div className={styles.paymentBox}>
            <div className={styles.paymentBoxLeft}>Pembayaran Online</div>
            <div className={styles.paymentBoxLeft}>
              <img
                src={urlLogo}
                alt="payment logo"
                width={55}
                height={14}
                style={{ objectFit: "contain" }}
              />
            <div className={styles.paymentBoxRight}>
              {referenceCode && (
                <div className={styles.paymentRef}>
                  {referenceCode}
                </div>
              )}
            </div>
            </div>
          </div>
        )}

        {/* TOTAL BOX */}
        <div className={styles.detailBox}>
          <div className={styles.detailRow}>
            <div>Subtotal</div>
            <div>{formatRp(computedSubtotal)}</div>
          </div>

          <div className={styles.detailRow}>
            <div>PB1 (10%)</div>
            <div>{formatRp(computedPB1)}</div>
          </div>

          <div className={styles.detailRow}>
            <div>PPN (11%)</div>
            <div>{formatRp(computedPPN)}</div>
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
        <button className={styles.downloadBtn} onClick={downloadJPG}>
          Download Bill
        </button>
      </div>
    </div>
  );
}