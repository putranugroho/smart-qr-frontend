// lib/order.js
// mapDoOrderPayload: build a do-order payload from a mixed cart (menus + combos)

export function mapDoOrderPayload(cart = [], grossAmount = null, selectedMethod = 'qris', opts = {}) {
  const {
    posId = 'MGI',
    orderType = 'DI',
    memberCode = null,
    tableNumber = '',
    roundingTolerance = 2000
  } = opts || {};

  // =========================
  // HELPERS
  // =========================
  const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // =========================
  // ACCUMULATORS (RAW / NO ROUND)
  // =========================
  const menus = [];
  const combos = [];

  let subTotal = 0;   // ⬅️ RAW
  let taxPB1 = 0;     // ⬅️ RAW
  let taxPPN = 0;     // ⬅️ RAW

  function accumulateTaxByName(name, amount) {
    if (!name || amount == null) return;
    const n = String(name).toUpperCase();
    if (n.includes('PB')) taxPB1 += toNumber(amount);
    else if (n.includes('PPN')) taxPPN += toNumber(amount);
    else taxPPN += toNumber(amount);
  }

  // =========================
  // ITERATE CART
  // =========================
  (Array.isArray(cart) ? cart : []).forEach((it) => {
    if (!it) return;

    const multiplyChildByParent = false;
    const hasMenusPayload = Array.isArray(it.menus) && it.menus.length > 0;

    // =====================================================
    // ✅ NEW MENU FORMAT
    // =====================================================
    if (hasMenusPayload) {
      it.menus.forEach((m) => {
        const basePrice = toNumber(m.detailMenu?.price);
        const qty = Math.max(1, toNumber(m.qty) || 1);

        const conds = Array.isArray(m.condiments) ? m.condiments : [];

        const condTotalPerMenu = conds.reduce((acc, c) => {
          const cQty = Math.max(1, toNumber(c.qty) || 1);
          return acc + (toNumber(c.price) * cQty);
        }, 0);

        const condTotal = multiplyChildByParent
          ? condTotalPerMenu * qty
          : condTotalPerMenu;

        // ✅ SUBTOTAL (NO ROUND)
        subTotal += (basePrice * qty) + condTotal;

        // =====================
        // TAXES (NO ROUND)
        // =====================
        const menuTaxes = Array.isArray(m.taxes)
          ? m.taxes.map(t => {
              const pct = toNumber(t.taxPercentage || 0);
              const taxValue =
                ((basePrice * qty) + condTotal) * pct / 100;

              accumulateTaxByName(t.taxName ?? t.name ?? '', taxValue);

              return {
                taxName: String(t.taxName ?? t.name ?? ''),
                taxPercentage: pct,
                taxAmount: taxValue // ⬅️ RAW
              };
            })
          : [];

        const condsForPayload = conds.map(c => {
          const cPrice = toNumber(c.price);
          const cQty = Math.max(1, toNumber(c.qty) || 1);

          const taxes = Array.isArray(c.taxes)
            ? c.taxes.map(t => {
                const pct = toNumber(t.taxPercentage || 0);
                const taxValue =
                  cPrice * cQty * pct / 100;

                accumulateTaxByName(t.taxName ?? t.name ?? '', taxValue);

                return {
                  taxName: String(t.taxName ?? t.name ?? ''),
                  taxPercentage: pct,
                  taxAmount: taxValue
                };
              })
            : [];

          return {
            code: c.code ?? c.id ?? '',
            name: c.name ?? '',
            itemName: c.itemName ?? '',
            price: cPrice,
            qty: cQty,
            taxes
          };
        });

        menus.push({
          condiments: condsForPayload,
          detailMenu: {
            code: m.detailMenu?.code ?? '',
            name: m.detailMenu?.name ?? '',
            itemName: m.detailMenu?.itemName ?? '',
            image: m.detailMenu?.image ?? '',
            price: basePrice
          },
          isFromMacro: !!m.isFromMacro,
          orderType: m.orderType || orderType,
          qty,
          taxes: menuTaxes
        });
      });

      return;
    }

    // =====================================================
    // COMBO
    // =====================================================
    if (it.type === 'combo' && Array.isArray(it.combos)) {
      const itemQty = Math.max(1, toNumber(it.qty) || 1);

      it.combos.forEach(cb => {
        const productsPayload = [];

        (cb.products || []).forEach(p => {
          const basePrice = toNumber(p.price);

          // ✅ SUBTOTAL
          subTotal += basePrice * itemQty;

          const productTaxes = Array.isArray(p.taxes)
            ? p.taxes.map(t => {
                const pct = toNumber(t.taxPercentage || 0);
                const taxValue =
                  basePrice * itemQty * pct / 100;

                accumulateTaxByName(t.taxName ?? t.name ?? '', taxValue);

                return {
                  taxName: String(t.taxName ?? t.name ?? ''),
                  taxPercentage: pct,
                  taxAmount: taxValue
                };
              })
            : [];

          productsPayload.push({
            code: p.code ?? '',
            comboGroup: p.comboGroup ?? '',
            name: p.name ?? '',
            itemName: p.itemName ?? '',
            image: p.image ?? '',
            price: basePrice,
            qty: 1,
            taxes: productTaxes,
            condiments: []
          });
        });

        combos.push({
          detailCombo: {
            code: cb.detailCombo?.code ?? it.detailCombo?.code ?? '',
            name: cb.detailCombo?.name ?? it.detailCombo?.name ?? '',
            itemName: cb.detailCombo?.itemName ?? it.detailCombo?.itemName ?? '',
            image: cb.detailCombo?.image ?? it.image ?? null
          },
          orderType: cb.orderType || orderType,
          isFromMacro: !!cb.isFromMacro,
          products: productsPayload,
          qty: itemQty,
          voucherCode: cb.voucherCode ?? null
        });
      });
    }
  });

  // =========================
  // FINAL ROUNDING (ONLY HERE)
  // =========================
  const taxes = [];

  if (taxPB1 > 0) {
    taxes.push({
      taxName: 'PB1',
      taxPercentage: 10,
      taxAmount: Math.round(taxPB1)
    });
  }

  if (taxPPN > 0) {
    taxes.push({
      taxName: 'PPN',
      taxPercentage: 11,
      taxAmount: Math.round(taxPPN)
    });
  }

  const totalTax = taxes.reduce((s, t) => s + t.taxAmount, 0);
  const computedTotal = Math.round(subTotal + totalTax);

  let rounding = 0;
  if (grossAmount != null) {
    rounding = Number(grossAmount) - computedTotal;
  } else {
    const rounded = Math.round(computedTotal / 100) * 100;
    rounding = rounded - computedTotal;
  }

  const grandTotal = computedTotal + rounding;

  // Map selectedMethod to selfPaymentCategory/code
  const method = String((selectedMethod || '').toLowerCase());
  let selfPaymentCategory = (method || 'QRIS').toUpperCase();
  let selfPaymentCode = 'MIDTRANS';

  if (method === 'qris') {
    selfPaymentCategory = 'QRIS';
    selfPaymentCode = 'MIDTRANS';
  } else if (method === 'gopay' || method === 'ovo' || method === 'dana' || method === 'shopee') {
    selfPaymentCategory = method.toUpperCase();
    selfPaymentCode = 'MIDTRANS';
  } else {
    selfPaymentCategory = method.toUpperCase() || 'QRIS';
    selfPaymentCode = 'MIDTRANS';
  }
  // =========================
  // FINAL PAYLOAD
  // =========================
  return {
    combos,
    menus,
    subTotal: Math.round(subTotal),
    grandTotal: Math.round(grandTotal),
    rounding: Math.round(rounding),
    posId: String(posId),
    tableNumber: String(tableNumber || ''),
    taxes: taxes.map(t => ({
      taxName: t.taxName,
      taxPercentage: t.taxPercentage,
      taxAmount: t.taxAmount
    })),
    customerName: '',
    customerPhoneNumber: '',
    paymentLink: ''
  };
}
