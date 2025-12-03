// lib/cart.js
import { mapDoOrderPayload } from './order';

const CART_KEY = "yoshi_cart_v1";
const PAYMENT_KEY = "yoshi_payment_v1";
const USER_KEY = "yoshi_user_v1";

/* =========================
   CART STORAGE
========================= */

export function _readRaw() {
  try {
    const txt =
      typeof window !== "undefined" ? localStorage.getItem(CART_KEY) : null;
    return txt ? JSON.parse(txt) : [];
  } catch (e) {
    console.error("cart: read error", e);
    return [];
  }
}

export function _writeRaw(arr) {
  try {
    if (typeof window !== "undefined")
      localStorage.setItem(CART_KEY, JSON.stringify(arr));
  } catch (e) {
    console.error("cart: write error", e);
  }
}

export function getCart() {
  return _readRaw();
}

export function clearCart() {
  _writeRaw([]);
}

/* =========================
   PAYMENT STORAGE
========================= */

export function _readPayment() {
  try {
    const txt =
      typeof window !== "undefined" ? localStorage.getItem(PAYMENT_KEY) : null;
    return txt ? JSON.parse(txt) : {};
  } catch (e) {
    console.error("payment: read error", e);
    return {};
  }
}

export function _writePayment(obj) {
  try {
    if (typeof window !== "undefined")
      localStorage.setItem(PAYMENT_KEY, JSON.stringify(obj));
  } catch (e) {
    console.error("payment: write error", e);
  }
}

export function getPayment() {
  return _readPayment();
}

export function clearPayment() {
  _writePayment({});
}

/* =========================
   NEW: savePayment (enhanced)
   - stores cartRaw (original)
   - stores cartDoOrder (payload ready for do-order)
   - meta can include storeCode, orderType, tableNumber, selectedMethod, pagerNumber
========================= */

export function savePayment(cart, total, meta = {}) {
  try {
    const storeCode = meta.storeCode || "";
    const orderType = meta.orderType || "DI";
    const pagerNumber = meta.pagerNumber || null;
    const selectedMethod = meta.selectedMethod || 'qris';

    // Build a do-order style payload from cart so PaymentPage / backend can use it directly
    let cartDoOrder = {};
    try {
      cartDoOrder = mapDoOrderPayload(cart || [], null, selectedMethod, {
        posId: storeCode || 'MGI',
        orderType,
        pagerNumber
      });
    } catch (e) {
      console.warn('savePayment: mapDoOrderPayload failed', e);
      cartDoOrder = {};
    }

    _writePayment({
      // keep original cart for UI/editing
      cartRaw: cart,
      // keep legacy field 'cart' for backward compatibility (some code expects array)
      cart: cart,
      // do-order ready payload (menus/combos/subTotal/taxes/grandTotal)
      cartDoOrder,
      paymentTotal: total,
      storeCode,
      orderType,
      tableNumber: meta.tableNumber || "",
      savedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error("savePayment failed", e);
  }
}

/* =========================
   ADD & MODIFY CART
========================= */

export function addToCart(item) {
  const cart = _readRaw();

  function signature(it) {
    return [
      String(it.productCode ?? it.id ?? ""),
      JSON.stringify(it.addons ?? []),
      String(it.note ?? "")
    ].join("|");
  }

  const sig = signature(item);
  const idx = cart.findIndex((c) => signature(c) === sig);

  if (idx === -1) {
    cart.push({ ...item });
  } else {
    cart[idx].qty =
      Number(cart[idx].qty || 0) + Number(item.qty || 1);
  }

  _writeRaw(cart);
  return cart;
}

export function removeFromCartByIndex(i) {
  const cart = _readRaw();
  if (i >= 0 && i < cart.length) {
    cart.splice(i, 1);
    _writeRaw(cart);
  }
  return cart;
}

export function updateCart(indexOrId, newItemOrPatch) {
  const cart = _readRaw();

  function signature(it) {
    return [
      String(it.productCode ?? it.id ?? ""),
      JSON.stringify(it.addons ?? []),
      String(it.note ?? "")
    ].join("|");
  }

  let idx = -1;

  if (typeof indexOrId === "number") {
    idx = indexOrId;
  } else if (indexOrId != null) {
    const idStr = String(indexOrId);

    const matches = cart
      .map((c, i) => ({ c, i }))
      .filter(
        ({ c }) => String(c.productCode ?? c.id ?? "") === idStr
      );

    if (matches.length === 1) {
      idx = matches[0].i;
    } else if (matches.length > 1) {
      if (newItemOrPatch?.addons || newItemOrPatch?.note) {
        const targetSig = signature({
          productCode: idStr,
          addons: newItemOrPatch.addons ?? [],
          note: newItemOrPatch.note ?? ""
        });

        const found = cart.findIndex(
          (c) => signature(c) === targetSig
        );
        if (found !== -1) idx = found;
      }

      if (idx === -1) idx = matches[0].i;
    } else {
      if (newItemOrPatch?.productCode) {
        const targetSig = signature(newItemOrPatch);
        const found = cart.findIndex(
          (c) => signature(c) === targetSig
        );

        if (found !== -1) idx = found;
      }
    }
  }

  if (idx >= 0) {
    const existing = cart[idx] || {};
    const merged = { ...existing, ...newItemOrPatch };

    if (merged.qty != null) merged.qty = Number(merged.qty);
    if (merged.price != null) merged.price = Number(merged.price);

    cart[idx] = merged;
    _writeRaw(cart);
  }

  return [...cart];
}

/* =========================
   SUMMARY
========================= */

export function cartCount() {
  return _readRaw().reduce(
    (s, it) => s + (Number(it.qty) || 0),
    0
  );
}

export function cartSubtotal() {
  return _readRaw().reduce(
    (s, it) => s + (Number(it.price || 0) * (Number(it.qty) || 1)),
    0
  );
}

export function computeCartTotals(cart = []) {
  // returns totals in integer currency (assumes item.price is per-unit INCLUDING addons)
  let subtotal = 0;
  let totalPB1 = 0;
  let totalPPN = 0;

  cart.forEach(it => {
    const unitPrice = Number(it.price || 0);
    const qty = Number(it.qty || 1);
    const lineNet = Math.round(unitPrice * qty);
    subtotal += lineNet;

    const pb1 = Number(it.pb1Percent || 0);
    const ppn = Number(it.ppnPercent || 0);

    if (pb1 > 0) totalPB1 += Math.round((pb1 / 100) * lineNet);
    if (ppn > 0) totalPPN += Math.round((ppn / 100) * lineNet);
  });

  const grandTotal = subtotal + totalPB1 + totalPPN;
  return { subtotal, totalPB1, totalPPN, grandTotal };
}
