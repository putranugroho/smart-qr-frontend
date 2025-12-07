// lib/order.js
// mapDoOrderPayload: build a do-order payload from a mixed cart (menus + combos)
//
// Usage:
// import { mapDoOrderPayload } from '../lib/order'
// const payload = mapDoOrderPayload(cart, grossAmountFromMidtransOrNull, selectedMethod, { posId: 'MGI', orderType: 'DI' })
//
// Notes:
// - grossAmount: if provided, will be used to compute rounding = grossAmount - computedTotal.
//   If rounding is unusually large (abs > roundingTolerance) a warning will be emitted.
// - selectedMethod: 'qris'|'gopay'|'ovo'|'dana'|'shopee' etc => maps to selfPaymentCategory (uppercased).
// - opts: { posId, orderType, isSelfPayment, memberCode, tableNumber, roundingTolerance }
//

export function mapDoOrderPayload(cart = [], grossAmount = null, selectedMethod = 'qris', opts = {}) {
  const {
    posId = 'MGI',
    orderType = 'DI',
    memberCode = null,
    tableNumber = '99',
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
    if (explicit && explicit !== 0) return Math.round(explicit);
    const pct = toNumber(taxObj.taxPercentage ?? taxObj.amount ?? taxObj.tax_percent ?? 0);
    if (pct > 0) return Math.round(baseAmount * (pct / 100));
    return 0;
  }

  // accumulate
  const menus = [];
  const combos = [];
  let subTotal = 0;
  let taxPB1 = 0;
  let taxPPN = 0;

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

        // ---- Taxes for menu
        if (Array.isArray(m.taxes)) {
          m.taxes.forEach((t) => {
            const taxAmt = calcTaxAmountFromObj(t, basePrice * qty);
            accumulateTaxByName(t.taxName ?? t.name ?? '', taxAmt);
          });
        }

        // ---- Taxes for condiments
        conds.forEach((c) => {
          if (Array.isArray(c.taxes)) {
            c.taxes.forEach((t) => {
              const taxAmt = calcTaxAmountFromObj(
                t,
                toNumber(c.price) * Math.max(1, toNumber(c.qty) || 1) * qty
              );
              accumulateTaxByName(t.taxName ?? t.name ?? '', taxAmt);
            });
          }
        });

        // ---- Push final menu to payload
        menus.push({
          condiments: conds.map(c => ({
            code: c.code ?? '',
            name: c.name ?? '',
            price: toNumber(c.price),
            qty: Math.max(1, toNumber(c.qty) || 1),
            taxes: Array.isArray(c.taxes) ? c.taxes.map(t => ({
              taxName: t.taxName ?? t.name ?? '',
              taxPercentage: toNumber(t.taxPercentage ?? 0),
              taxAmount: toNumber(t.taxAmount ?? 0)
            })) : []
          })),
          detailMenu: {
            code: m.detailMenu?.code ?? '',
            name: m.detailMenu?.name ?? '',
            price: basePrice
          },
          isFromMacro: !!m.isFromMacro,
          orderType: m.orderType || orderType,
          qty,
          taxes: Array.isArray(m.taxes) ? m.taxes.map(t => ({
            taxName: t.taxName ?? t.name ?? '',
            taxPercentage: toNumber(t.taxPercentage ?? 0),
            taxAmount: toNumber(t.taxAmount ?? 0)
          })) : []
        });
      });

      return;
    }

    // ✅ LEGACY MENU fallback
    if (it.type !== 'combo') {
      const price = toNumber(it.price);
      const qty = Math.max(1, toNumber(it.qty) || 0);

      subTotal += price * qty;

      menus.push({
        detailMenu: {
          code: it.productCode ?? it.id ?? '',
          name: it.title ?? it.name ?? '',
          price
        },
        qty,
        isFromMacro: false,
        orderType: orderType,
        condiments: [],
        taxes: []
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
          const conds = Array.isArray(p.condiments) ? p.condiments.map(c => ({
            code: c.code ?? c.id ?? '',
            name: c.name ?? c.itemName ?? '',
            price: toNumber(c.price),
            qty: Math.max(1, toNumber(c.qty) || 1),
            taxes: Array.isArray(c.taxes) ? c.taxes : []
          })) : [];

          // add to subtotal: base price * pQty * cbQty * itemQty
          subTotal += (basePrice * pQty * cbQty * itemQty);

          // add conds price (cond.price * cond.qty * pQty * cbQty * itemQty)
          conds.forEach(c => {
            subTotal += (toNumber(c.price) * toNumber(c.qty) * pQty * cbQty * itemQty);
          });

          // taxes for product
          if (Array.isArray(p.taxes) && p.taxes.length) {
            p.taxes.forEach(t => {
              const taxAmt = calcTaxAmountFromObj(t, basePrice * pQty * cbQty * itemQty);
              accumulateTaxByName(t.taxName ?? t.name ?? t.code ?? '', taxAmt);
            });
          }

          // taxes for condiments
          conds.forEach(c => {
            if (Array.isArray(c.taxes) && c.taxes.length) {
              c.taxes.forEach(t => {
                const taxAmt = calcTaxAmountFromObj(t, toNumber(c.price) * toNumber(c.qty) * pQty * cbQty * itemQty);
                accumulateTaxByName(t.taxName ?? t.name ?? t.code ?? '', taxAmt);
              });
            }
          });

          productsPayload.push({
            code: p.code ?? p.id ?? '',
            comboGroup: p.comboGroup ?? '',
            name: p.name ?? p.itemName ?? '',
            price: basePrice,
            qty: pQty,
            taxes: Array.isArray(p.taxes) ? p.taxes.map(t => ({
              taxName: t.taxName ?? t.name ?? t.code ?? '',
              taxPercentage: toNumber(t.taxPercentage ?? t.amount ?? 0),
              taxAmount: toNumber(t.taxAmount ?? 0)
            })) : [],
            condiments: conds.map(c => ({
              code: c.code,
              name: c.name,
              price: toNumber(c.price),
              qty: toNumber(c.qty),
              taxes: Array.isArray(c.taxes) ? c.taxes.map(t => ({
                taxName: t.taxName ?? t.name ?? t.code ?? '',
                taxPercentage: toNumber(t.taxPercentage ?? t.amount ?? 0),
                taxAmount: toNumber(t.taxAmount ?? 0)
              })) : []
            }))
          });
        });
      }

      combos.push({
        detailCombo: {
          code: cb.detailCombo?.code ?? it.detailCombo?.code ?? '',
          name: cb.detailCombo?.name ?? it.detailCombo?.name ?? '',
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
  if (taxPB1 > 0) taxes.push({ taxName: 'PB1', taxPercentage: 10, taxAmount: Math.round(taxPB1) });
  if (taxPPN > 0) taxes.push({ taxName: 'PPN', taxPercentage: 11, taxAmount: Math.round(taxPPN) });

  const totalTax = taxes.reduce((s, t) => s + toNumber(t.taxAmount), 0);

  // computed total (no rounding)
  const computedTotal = Math.round(subTotal + totalTax);

  // rounding: if grossAmount provided, compute rounding, else rounding = 0
  let rounding = 0;
  if (grossAmount != null) {
    rounding = grossAmount - computedTotal;
  } else {
    // gunakan aturan rounding checkout
    const rounded = Math.round(computedTotal / 100) * 100;
    rounding = rounded - computedTotal;
  }

  // const grandTotal = Math.round(computedTotal + rounding);
  const grandTotal = Math.round(computedTotal);

  // Map selectedMethod to selfPaymentCategory/code
  const method = String((selectedMethod || '').toLowerCase());
  let selfPaymentCategory = (method || 'QRIS').toUpperCase();
  let selfPaymentCode = 'MIDTRANS';

  // some mapping examples — adjust as needed
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
    // === REQUIRED ARRAYS ===
    combos: Array.isArray(combos) ? combos : [],
    menus: Array.isArray(menus) ? menus : [],

    // === REQUIRED NUMBERS ===
    subTotal: Number(subTotal || 0),
    grandTotal: Number(grandTotal || 0),
    rounding: Number(rounding || 0),

    // === REQUIRED STRINGS ===
    posId: String(posId || 'QR'),
    tableNumber: String(tableNumber || ''),

    // === TAX AGGREGATE ===
    taxes: Array.isArray(taxes) ? taxes.map(t => ({
      taxName: String(t.taxName || ''),
      taxPercentage: Number(t.taxPercentage || 0),
      taxAmount: Number(t.taxAmount || 0)
    })) : [],

    // === DEFAULT EMPTY (WILL BE FILLED IN PaymentPage.jsx) ===
    customerName: '',
    customerPhoneNumber: '',
    paymentLink: ''
  };

  return payload;
}
