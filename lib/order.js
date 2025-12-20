export function mapDoOrderPayload(
  cart = [],
  grossAmount = null,
  selectedMethod = 'qris',
  opts = {}
) {
  const {
    posId = 'MGI',
    orderType = 'DI',
    tableNumber = ''
  } = opts || {};

  const toNumber = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

  const menus = [];
  const combos = [];

  let subTotal = 0;
  let taxPB1 = 0;
  let taxPPN = 0;

  /* =========================
     TAX ACCUMULATOR
  ========================= */
  const addTax = (name, amount) => {
    if (!name || !amount) return;
    const n = String(name).toUpperCase();
    if (n.includes('PB')) taxPB1 += amount;
    else if (n.includes('PPN')) taxPPN += amount;
  };

  (Array.isArray(cart) ? cart : []).forEach(it => {

    /* =========================
       MENU (NON-COMBO)
       qty berasal dari menu.qty
    ========================= */
    if (Array.isArray(it.menus)) {
      it.menus.forEach(m => {
        const qty = Math.max(1, toNumber(m.qty));
        const basePrice = toNumber(m.detailMenu?.price);

        const condimentTotal = (m.condiments || [])
          .reduce((s, c) => s + toNumber(c.price), 0);

        // ✅ SUBTOTAL (NO ROUNDING)
        subTotal += (basePrice + condimentTotal) * qty;

        // ✅ MENU TAX (PAKAI taxAmount × qty)
        (m.taxes || []).forEach(t => {
          addTax(t.taxName, toNumber(t.taxAmount) * qty);
        });

        // ✅ CONDIMENT TAX (PAKAI taxAmount × qty)
        (m.condiments || []).forEach(c => {
          (c.taxes || []).forEach(t => {
            addTax(t.taxName, toNumber(t.taxAmount) * qty);
          });
        });

        menus.push({
          detailMenu: {
            code: m.detailMenu?.code ?? '',
            name: m.detailMenu?.name ?? '',
            itemName: m.detailMenu?.itemName ?? '',
            image: m.detailMenu?.image ?? '',
            price: basePrice
          },
          qty,
          orderType: m.orderType || orderType,
          isFromMacro: !!m.isFromMacro,
          taxes: m.taxes || [],
          condiments: (m.condiments || []).map(c => ({
            code: c.code ?? '',
            name: c.name ?? '',
            itemName: c.itemName ?? '',
            price: toNumber(c.price),
            qty: 1, // 🔒 SELALU 1
            taxes: c.taxes || []
          }))
        });
      });
      return;
    }

    /* =========================
       COMBO
       🔒 FINAL RULE:
       - HANYA combo.qty
       - products.qty DIABAIKAN
    ========================= */
    if (it.type === 'combo') {
      const comboQty = Math.max(1, toNumber(it.qty));

      (it.combos || []).forEach(cb => {
        let comboBase = 0;

        const products = (cb.products || []).map(p => {
          const price = toNumber(p.price);
          comboBase += price;

          // ✅ TAX = price × combo.qty × %
          (p.taxes || []).forEach(t => {
            const pct = toNumber(t.taxPercentage);
            const unitTax = price * pct / 100;
            addTax(t.taxName, unitTax * comboQty);
          });

          return {
            code: p.code ?? '',
            comboGroup: p.comboGroup ?? '',
            name: p.name ?? '',
            itemName: p.itemName ?? '',
            image: p.image ?? '',
            price,
            qty: comboQty, // 🔥 SATU-SATUNYA QTY
            taxes: (p.taxes || []).map(t => ({
              taxName: t.taxName,
              taxPercentage: t.taxPercentage,
              taxAmount: price * comboQty * toNumber(t.taxPercentage) / 100
            })),
            condiments: []
          };
        });

        // ✅ SUBTOTAL COMBO (NO ROUNDING)
        subTotal += comboBase * comboQty;

        combos.push({
          detailCombo: cb.detailCombo,
          orderType: cb.orderType || orderType,
          isFromMacro: !!cb.isFromMacro,
          products,
          qty: comboQty,
          voucherCode: cb.voucherCode ?? null
        });
      });
    }
  });

  /* =========================
     TAX SUMMARY
  ========================= */
  const taxes = [];
  if (taxPB1 > 0) taxes.push({
    taxName: 'PB1',
    taxPercentage: 10,
    taxAmount: Math.round(taxPB1)
  });
  if (taxPPN > 0) taxes.push({
    taxName: 'PPN',
    taxPercentage: 11,
    taxAmount: Math.round(taxPPN)
  });

  const totalTax = taxes.reduce((s, t) => s + t.taxAmount, 0);
  const computedTotal = subTotal + totalTax;

  /* =========================
     ROUNDING (ONLY AT END)
  ========================= */
  const rounding = grossAmount != null
    ? Number(grossAmount) - Math.round(computedTotal)
    : Math.round(Math.round(computedTotal) / 100) * 100 - Math.round(computedTotal);

  /* =========================
     FINAL PAYLOAD
  ========================= */
  return {
    combos,
    menus,
    subTotal: Math.round(subTotal),
    grandTotal: Math.round(computedTotal + rounding),
    rounding,
    posId,
    tableNumber,
    taxes,
    customerName: '',
    customerPhoneNumber: '',
    paymentLink: ''
  };
}