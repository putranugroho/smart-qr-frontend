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

export function updateCart(index, newItem) {
  const cart = _readRaw()
  if (index >= 0 && index < cart.length) {
    cart[index] = { ...cart[index], ...newItem }
    _writeRaw(cart)
  }
  return cart
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
