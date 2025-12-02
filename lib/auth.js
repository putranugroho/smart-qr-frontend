// lib/auth.js
const USER_KEY = 'yoshi_user_v1';

export function userSignIn(user) {
  _writeUser(user);
}

export function getUser() {
  return _readUser();
}

export function _readUser() {
  try {
    const txt = typeof window !== 'undefined' ? localStorage.getItem(USER_KEY) : null;
    return txt ? JSON.parse(txt) : null; // return null when no user
  } catch (e) {
    console.error('user: read error', e);
    return null;
  }
}

export function _writeUser(obj) {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(obj));
  } catch (e) {
    console.error('user: write error', e);
  }
}
