// lib/cart.js
const CART_KEY = 'yoshi_cart_v1'
const PAYMENT_KEY = 'yoshi_payment_v1'

// cart item shape:
// {
//   id: string|number, productCode?:string,
//   title, price(number), qty(number), note?, addons: [...]
// }

export function _readRaw() {
  try {
    const txt = typeof window !== 'undefined' ? localStorage.getItem(CART_KEY) : null
    return txt ? JSON.parse(txt) : []
  } catch (e) {
    console.error('cart: read error', e)
    return []
  }
}

export function _writeRaw(arr) {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(CART_KEY, JSON.stringify(arr))
  } catch (e) {
    console.error('cart: write error', e)
  }
}

export function getCart() {
  return _readRaw()
}

export function clearCart() {
  _writeRaw([])
}

export function _readPayment() {
  try {
    const txt = typeof window !== 'undefined' ? localStorage.getItem(PAYMENT_KEY) : null
    return txt ? JSON.parse(txt) : []
  } catch (e) {
    console.error('payment: read error', e)
    return []
  }
}

export function _writePayment(arr) {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(PAYMENT_KEY, JSON.stringify(arr))
  } catch (e) {
    console.error('payment: write error', e)
  }
}

export function getPayment() {
  return _readPayment()
}

export function clearPayment() {
  _writePayment([])
}

export function addToCart(item) {
  // item should include price:number and qty:number
  const cart = _readRaw()
  // basic merge logic: if same productCode and same addons and same note -> increment qty
  // define a simple signature for equality
  function signature(it) {
    return [
      String(it.productCode ?? it.id ?? ''),
      JSON.stringify(it.addons ?? []),
      String(it.note ?? '')
    ].join('|')
  }
  const sig = signature(item)
  const idx = cart.findIndex(c => signature(c) === sig)
  if (idx === -1) {
    cart.push({ ...item })
  } else {
    // merge qty
    cart[idx].qty = (Number(cart[idx].qty || 0) + Number(item.qty || 1))
  }
  _writeRaw(cart)
  return cart
}

export function removeFromCartByIndex(i) {
  const cart = _readRaw()
  if (i >= 0 && i < cart.length) {
    cart.splice(i, 1)
    _writeRaw(cart)
  }
  return cart
}

export function updateCart(indexOrId, newItemOrPatch) {
  const cart = _readRaw()
  let idx = -1

  // helper signature (same idea as addToCart)
  function signature(it) {
    return [
      String(it.productCode ?? it.id ?? ''),
      JSON.stringify(it.addons ?? []),
      String(it.note ?? '')
    ].join('|')
  }

  if (typeof indexOrId === 'number') {
    idx = indexOrId
  } else if (indexOrId != null) {
    const idStr = String(indexOrId)

    // find all items with matching productCode/id
    const matches = cart
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => String(c.productCode ?? c.id ?? '') === idStr)

    if (matches.length === 1) {
      idx = matches[0].i
    } else if (matches.length > 1) {
      // if patch contains addons or note, try match by signature
      if (newItemOrPatch && (newItemOrPatch.addons || newItemOrPatch.note)) {
        const targetSig = signature({ productCode: idStr, addons: newItemOrPatch.addons ?? [], note: newItemOrPatch.note ?? '' })
        const found = cart.findIndex(c => signature(c) === targetSig)
        if (found !== -1) idx = found
      }

      // fallback: pick first match (preserve old behavior)
      if (idx === -1) idx = matches[0].i
    } else {
      // no direct productCode match; if newItemOrPatch is a full item try to match by signature
      if (newItemOrPatch && newItemOrPatch.productCode) {
        const targetSig = signature(newItemOrPatch)
        const found = cart.findIndex(c => signature(c) === targetSig)
        if (found !== -1) idx = found
      }
    }
  }

  if (idx >= 0 && idx < cart.length) {
    const existing = cart[idx] || {}
    const merged = { ...existing, ...newItemOrPatch }

    // normalize numeric fields if provided
    if (merged.qty != null) merged.qty = Number(merged.qty)
    if (merged.price != null) merged.price = Number(merged.price)

    cart[idx] = merged
    _writeRaw(cart)
  } else {
    console.warn('updateCart: index/id not found', indexOrId)
  }

  return Array.from(cart)
}

export function cartCount() {
  const cart = _readRaw()
  return cart.reduce((s, it) => s + (Number(it.qty) || 0), 0)
}

export function cartSubtotal() {
  const cart = _readRaw()
  return cart.reduce((s, it) => s + (Number(it.price || 0) * (Number(it.qty) || 1)), 0)
}

export function cartPaymentTotal(total) {
  const cart = _readRaw()
  _writePayment({ items: cart, paymentTotal: total })
}

export function userSignIn(arr) {
  _writeUser({ storeLocation, orderType, tableNumber })
}

export function _writeUser(arr) {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(arr))
  } catch (e) {
    console.error('cart: write error', e)
  }
}
