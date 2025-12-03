// Lightweight JWT sign/verify using Web Crypto HMAC-SHA256
// Universal: safe to import in both browser and Node (Node >= 18) — will attempt to polyfill.

const encoder = (s) => new TextEncoder().encode(s);

function base64UrlEncode(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  let str = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    str += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }

  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeToUint8Array(b64u) {
  let b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";

  const bin = atob(b64);
  const len = bin.length;
  const u8 = new Uint8Array(len);

  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function ensureCryptoAvailable() {
  // Return a crypto object that has subtle, or try to polyfill on Node.
  let c = globalThis.crypto;
  if (c && c.subtle) return c;

  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    globalThis.crypto = window.crypto;
    return globalThis.crypto;
  }

  // If running under Node.js, try to import node:crypto and use webcrypto
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    try {
      // dynamic import so bundlers/browser won't try to resolve this
      const mod = await import("crypto");
      if (mod && mod.webcrypto && mod.webcrypto.subtle) {
        globalThis.crypto = mod.webcrypto;
        return globalThis.crypto;
      }
    } catch (e) {
      // ignore and fall through to error below
    }
  }

  throw new Error(
    "Web Crypto API not available (crypto.subtle is undefined).\n" +
      "If you're running in Node ensure Node >= 18 and either:\n" +
      "  - set globalThis.crypto = require('crypto').webcrypto before using this module, OR\n" +
      "  - let this module auto-polyfill by running in Node >= 18 with ESM dynamic import support.\n" +
      "Alternatively, only import/execute this module on the browser (client) side."
  );
}

async function importHmacKeyFromSecret(secret) {
  const c = await ensureCryptoAvailable();
  return c.subtle.importKey(
    "raw",
    encoder(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// --------------------------------------------------------
// SIGN
// --------------------------------------------------------

export async function jwtSign(payloadObj, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(encoder(JSON.stringify(header)));

  const now = Math.floor(Date.now() / 1000);
  const payload = { ...payloadObj, iat: now };
  const payloadB64 = base64UrlEncode(encoder(JSON.stringify(payload)));

  const toSign = `${headerB64}.${payloadB64}`;
  const key = await importHmacKeyFromSecret(secret);

  const c = await ensureCryptoAvailable();
  const sigBuf = await c.subtle.sign("HMAC", key, encoder(toSign));

  const sigB64 = base64UrlEncode(new Uint8Array(sigBuf));
  return `${toSign}.${sigB64}`;
}

// --------------------------------------------------------
// VERIFY
// --------------------------------------------------------

export async function jwtVerify(token, secret) {
  try {
    if (!token || typeof token !== "string") {
      return { valid: false, reason: "missing token" };
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, reason: "invalid token format" };
    }

    const [headerB64, payloadB64, sigB64] = parts;
    const toSign = `${headerB64}.${payloadB64}`;

    const key = await importHmacKeyFromSecret(secret);

    const c = await ensureCryptoAvailable();
    const expectedSigBuf = await c.subtle.sign("HMAC", key, encoder(toSign));
    const expectedSig = base64UrlEncode(new Uint8Array(expectedSigBuf));

    if (expectedSig !== sigB64) {
      return { valid: false, reason: "signature mismatch" };
    }

    // decode payload
    const payloadJson = new TextDecoder().decode(base64UrlDecodeToUint8Array(payloadB64));
    const payload = JSON.parse(payloadJson);

    return { valid: true, payload };
  } catch (e) {
    return { valid: false, reason: e.message || String(e) };
  }
}

// --------------------------------------------------------
// DECODE (NO VERIFY)
// --------------------------------------------------------

export function jwtDecode(token) {
  try {
    const parts = token.split(".");
    const payloadB64 = parts[1];

    const payloadJson = new TextDecoder().decode(base64UrlDecodeToUint8Array(payloadB64));
    return JSON.parse(payloadJson);
  } catch (e) {
    return null;
  }
}
