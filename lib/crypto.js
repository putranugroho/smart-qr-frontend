// utils/cryptoJSHelpers.js
import CryptoJS from "crypto-js";

/**
 * Derive secretHex = SHA256(passphrase) (hex string)
 */
export function deriveSecretHex(passphrase) {
  return CryptoJS.SHA256(passphrase).toString(CryptoJS.enc.Hex);
}

/**
 * Encrypt plaintext using AES-CBC with key = secretHex (hex)
 * Output token: Base64( IV(16 bytes) || ciphertext )
 */
export function encryptWithSecretHex(plainText, secretHex) {
  const key = CryptoJS.enc.Hex.parse(secretHex); // WordArray
  const iv = CryptoJS.lib.WordArray.random(16); // 16 bytes IV for AES-CBC

  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // Combine IV + ciphertext into one WordArray
  const combined = iv.clone().concat(encrypted.ciphertext);

  // Base64 string
  const token = CryptoJS.enc.Base64.stringify(combined);
  return token;
}

/**
 * Decrypt token produced by encryptWithSecretHex.
 * tokenBase64: Base64 string of IV || ciphertext
 * secretHex: SHA256(passphrase) hex string
 * Returns plaintext string (UTF-8)
 */
export function decryptWithSecretHex(tokenBase64, secretHex) {
  const combined = CryptoJS.enc.Base64.parse(tokenBase64); // WordArray

  // split first 16 bytes (IV) -> 16 bytes == 4 words (word = 4 bytes)
  const ivWords = 4;
  const iv = CryptoJS.lib.WordArray.create(combined.words.slice(0, ivWords), 16);

  const ciphertextWords = combined.words.slice(ivWords);
  const ciphertextSigBytes = combined.sigBytes - 16;
  const ciphertextWA = CryptoJS.lib.WordArray.create(ciphertextWords, ciphertextSigBytes);

  const key = CryptoJS.enc.Hex.parse(secretHex);

  const decrypted = CryptoJS.AES.decrypt({ ciphertext: ciphertextWA }, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const plain = decrypted.toString(CryptoJS.enc.Utf8);
  return plain;
}
