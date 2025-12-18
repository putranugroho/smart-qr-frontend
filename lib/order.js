// lib/order.js
// mapDoOrderPayload: build a do-order payload from a mixed cart (menus + combos)

export function mapDoOrderPayload(cart = [], grossAmount = null, selectedMethod = 'qris', opts = {}) {
  const {
    posId = 'MGI',
    orderType = 'DI',
    memberCode = null,
    tableNumber = '',
    roundingTolerance = 2000 // max allowed abs rounding before warn (adjust as needed)
  } = opts || {};

  // helpers
  const toNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  function calcTaxAmountFromObj(taxObj, baseAmount) {
    // taxObj may have taxAmount or taxPercentage / amount
    const explicit = toNumber(taxObj.taxAmount ?? taxObj.amount ?? taxObj.tax_amount ?? taxObj.taxAmount);
    if (explicit != null) return Math.round(explicit);
    const pct = toNumber(taxObj.taxPercentage ?? taxObj.amount ?? taxObj.tax_percent ?? taxObj.amount ?? 0);
    if (pct > 0) return Math.round(baseAmount * (pct / 100));
    return 0;
  }

  // accumulate
  const menus = [];
  const combos = [];
  let subTotal = 0;
  let taxPB1 = 0;
  let taxPPN = 0;

  function safeMul(...nums) {
    return nums.reduce((a, b) => a * (Number(b) || 1), 1);
  }

  function accumulateTaxByName(name, amount) {
    if (!name || amount == null) return;
    const n = String(name || '').toUpperCase();
    if (n.includes('PB')) taxPB1 += toNumber(amount);
    else if (n.includes('PPN')) taxPPN += toNumber(amount);
    else {
      // unknown -> try to infer by percentage or put to PPN fallback
      taxPPN += toNumber(amount);
    }
  }

  // iterate cart entries
  (Array.isArray(cart) ? cart : []).forEach((it) => {
    if (!it) return;

    // ✅ NEW FORMAT: already contains menus payload
    if (Array.isArray(it.menus) && it.menus.length) {
      it.menus.forEach((m) => {
        
        const basePrice = toNumber(m.detailMenu?.price);
        const qty = Math.max(1, toNumber(m.qty) || 1);

        // ---- Condiments
        const conds = Array.isArray(m.condiments) ? m.condiments : [];

        const condTotal = conds.reduce((acc, c) => {
          return acc + (toNumber(c.price) * Math.max(1, toNumber(c.qty) || 1));
        }, 0);

        // ---- Subtotal
        subTotal += Math.round((basePrice + condTotal) * qty);

        // ---- Taxes for menu (normalize each tax entry and compute taxAmount if needed)
        const menuTaxes = Array.isArray(m.taxes) ? m.taxes.map(t => {
          const taxPercentage = toNumber(t.taxPercentage ?? t.amount ?? t.tax_percent ?? 0);
          const taxableBase = basePrice * qty;
          const taxAmount = calcTaxAmountFromObj(t, taxableBase);
          // accumulate
          accumulateTaxByName(t.taxName ?? t.name ?? '', taxAmount);
          return {
            taxName: String(t.taxName ?? t.name ?? ''),
            taxPercentage: taxPercentage,
            taxAmount: taxAmount
          };
        }) : [];

        // ---- Taxes for condiments
        const condsForPayload = conds.map(c => {
          const cQty = Math.max(1, toNumber(c.qty) || 1);
          const cPrice = toNumber(c.price);
          const taxes = Array.isArray(c.taxes) ? c.taxes.map(t => {
            const taxPercentage = toNumber(t.taxPercentage ?? t.amount ?? t.tax_percent ?? 0);
            const taxAmount = calcTaxAmountFromObj(
              t,
              cPrice * cQty
            );
            accumulateTaxByName(t.taxName ?? t.name ?? '', taxAmount);
            return {
              taxName: String(t.taxName ?? t.name ?? ''),
              taxPercentage,
              taxAmount
            };
          }) : [];

          return {
            code: c.code ?? c.id ?? '',
            name: c.name ?? '',
            itemName: c.itemName ?? '',
            price: cPrice,
            qty: cQty,
            taxes: taxes.length ? taxes : []
          };
        });

        // ---- Push final menu to payload
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

    // ✅ LEGACY MENU fallback
    if (it.type !== 'combo') {
      const price = toNumber(it.price);
      const qty = Math.max(1, toNumber(it.qty) || 0);

      subTotal += price * qty;

      // compute taxes for legacy item if present
      const legacyTaxes = Array.isArray(it.taxes) ? it.taxes.map(t => {
        const taxPercentage = toNumber(t.taxPercentage ?? t.amount ?? t.tax_percent ?? 0);
        const taxAmount = calcTaxAmountFromObj(t, price * qty);
        accumulateTaxByName(t.taxName ?? t.name ?? '', taxAmount);
        return {
          taxName: String(t.taxName ?? t.name ?? ''),
          taxPercentage,
          taxAmount
        };
      }) : [];

      menus.push({
        detailMenu: {
          code: it.productCode ?? it.id ?? '',
          name: it.title ?? it.name ?? '',
          itemName: it.title ?? it.itemName ?? '',
          image: it.title ?? it.image ?? '',
          price
        },
        qty,
        isFromMacro: false,
        orderType: orderType,
        condiments: Array.isArray(it.addons) ? it.addons.map(a => ({
          code: a.code ?? a.id ?? '',
          name: a.name ?? '',
          itemName: a.itemName ?? '',
          price: toNumber(a.price),
          qty: Math.max(1, toNumber(a.qty) || 1),
          taxes: Array.isArray(a.taxes) ? a.taxes.map(t => ({
            taxName: String(t.taxName ?? t.name ?? ''),
            taxPercentage: toNumber(t.taxPercentage ?? t.amount ?? 0),
            taxAmount: calcTaxAmountFromObj(t, toNumber(a.price) * Math.max(1, toNumber(a.qty) || 1))
          })) : []
        })) : [],
        taxes: legacyTaxes
      });

      return;
    }

    // COMBO item
    // shape: { type:'combo', combos: [...] , qty, detailCombo, note, image }
    const itemQty = Math.max(1, toNumber(it.qty) || 1);
    if (!Array.isArray(it.combos)) return;

    it.combos.forEach(cb => {
      const cbQty = Math.max(1, toNumber(cb.qty) || 1);
      const productsPayload = [];

      if (Array.isArray(cb.products)) {
        cb.products.forEach(p => {
          const pQty = Math.max(1, toNumber(p.qty) || 1);
          const basePrice = toNumber(p.price);

          // condiments for product (expect product.condiments array)
          const conds = Array.isArray(p.condiments) ? p.condiments.map(c => {
            const cQty = Math.max(1, toNumber(c.qty) || 1);
            const cPrice = toNumber(c.price);
            const cTaxes = Array.isArray(c.taxes) ? c.taxes.map(t => {
              const taxPercentage = toNumber(t.taxPercentage ?? t.amount ?? t.tax_percent ?? 0);
              const taxAmount = calcTaxAmountFromObj(
                t,
                cPrice * cQty * pQty * cbQty
              );
              accumulateTaxByName(t.taxName ?? t.name ?? t.code ?? '', taxAmount);
              return {
                taxName: String(t.taxName ?? t.name ?? t.code ?? ''),
                taxPercentage,
                taxAmount
              };
            }) : [];

            return {
              code: c.code ?? c.id ?? '',
              name: c.name ?? '',
              itemName: c.itemName ?? '',
              price: cPrice,
              qty: cQty,
              taxes: cTaxes
            };
          }) : [];

          // add to subtotal: base price * pQty * cbQty * itemQty
          subTotal += Math.round(basePrice * pQty * cbQty);

          // add conds price (cond.price * cond.qty * pQty * cbQty * itemQty)
          conds.forEach(c => {
            subTotal += Math.round(c.price * c.qty * pQty * cbQty);
          });

          // taxes for product
          const productTaxes = Array.isArray(p.taxes) ? p.taxes.map(t => {
            const taxPercentage = toNumber(t.taxPercentage ?? t.amount ?? t.tax_percent ?? 0);
            const taxAmount = calcTaxAmountFromObj(
              t,
              basePrice * pQty * cbQty
            );
            accumulateTaxByName(t.taxName ?? t.name ?? t.code ?? '', taxAmount);
            return {
              taxName: String(t.taxName ?? t.name ?? t.code ?? ''),
              taxPercentage,
              taxAmount
            };
          }) : [];

          // taxes for condiments already processed above inside conds (and accumulated)

          productsPayload.push({
            code: p.code ?? p.id ?? '',
            comboGroup: p.comboGroup ?? '',
            name: p.name ?? '',
            itemName: p.itemName ?? '',
            price: basePrice,
            qty: pQty,
            taxes: productTaxes,
            condiments: conds
          });
        });
      }

      combos.push({
        detailCombo: {
          code: cb.detailCombo?.code ?? it.detailCombo?.code ?? '',
          name: cb.detailCombo?.name ?? it.detailCombo?.name ?? '',
          itemName: cb.detailCombo?.itemName ?? it.detailCombo?.itemName ?? '',
          image: cb.detailCombo?.image ?? it.detailCombo?.image ?? it.image ?? null
        },
        isFromMacro: Boolean(cb.isFromMacro),
        orderType: (typeof cb.orderType === 'string' ? cb.orderType : orderType),
        products: productsPayload,
        qty: cbQty,
        voucherCode: cb.voucherCode ?? null
      });
    });
  });

  // build taxes aggregate
  const taxes = [];
  // If we have computed values for PB1/PPN from accumulation, use them; otherwise
  // fallback to zero but still include percentages if desired.
  if (taxPB1 > 0) taxes.push({ taxName: 'PB1', taxPercentage: 10, taxAmount: Math.round(taxPB1) });
  if (taxPPN > 0) taxes.push({ taxName: 'PPN', taxPercentage: 11, taxAmount: Math.round(taxPPN) });

  const totalTax = taxes.reduce((s, t) => s + toNumber(t.taxAmount), 0);

  // computed total (no rounding)
  const computedTotal = Math.round(subTotal + totalTax);

  // rounding logic:
  // - if grossAmount provided, use it (rounding = grossAmount - computedTotal)
  // - else if subTotal < 50 => rounding = 0 (user requested rule)
  // - else rounding -> round to nearest 100
  let rounding = 0;
  if (grossAmount != null) {
    rounding = Number(grossAmount) - computedTotal;
  } else {
    if (subTotal < 50) {
      rounding = 0;
    } else {
      const rounded = Math.round(computedTotal / 100) * 100;
      rounding = rounded - computedTotal;
    }
  }

  const grandTotal = Math.round(computedTotal + rounding);

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

  // ============================================
  // FINAL PAYLOAD (STRICT STRUCTURE FOR DO-ORDER)
  // ============================================

  const payload = {
    combos: Array.isArray(combos) ? combos : [],
    menus: Array.isArray(menus) ? menus : [],
    subTotal: Number(subTotal || 0),
    grandTotal: Number(grandTotal || 0),
    rounding: Number(rounding || 0),
    posId: String(posId || 'QR'),
    tableNumber: String(tableNumber || ''),
    taxes: Array.isArray(taxes) ? taxes.map(t => ({
      taxName: String(t.taxName || ''),
      taxPercentage: Number(t.taxPercentage || 0),
      taxAmount: Number(t.taxAmount || 0)
    })) : [],
    customerName: '',
    customerPhoneNumber: '',
    paymentLink: ''
  };

  return payload;
}
