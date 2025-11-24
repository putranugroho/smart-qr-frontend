// lib/auth.js
const USER_KEY = 'yoshi_user_v1'

export function userSignIn(user) {
  _writeUser(user)
}

export function getUser() {
  return _readUser()
}

export function _readUser() {
  try {
    const txt = typeof window !== 'undefined' ? localStorage.getItem(USER_KEY) : null
    return txt ? JSON.parse(txt) : {}
  } catch (e) {
    console.error('cart: read error', e)
    return []
  }
}

export function _writeUser(arr) {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(arr))
  } catch (e) {
    console.error('cart: write error', e)
  }
}
