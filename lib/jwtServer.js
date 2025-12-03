// /lib/jwtServer.js
import crypto from "crypto";

export function jwtVerifyServer(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false, reason: "invalid format" };

    const [headerB64, payloadB64, sigB64] = parts;
    const toSign = `${headerB64}.${payloadB64}`;

    const signature = crypto
      .createHmac("sha256", secret)
      .update(toSign)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    if (signature !== sigB64) {
      return { valid: false, reason: "signature mismatch" };
    }

    const payloadJson = Buffer.from(payloadB64, "base64").toString("utf8");
    return { valid: true, payload: JSON.parse(payloadJson) };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}
