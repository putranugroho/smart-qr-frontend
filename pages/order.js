"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { userSignIn } from "../lib/auth";

/**
 * Pilih true jika kamu memakai JWT HMAC (jwtClient.js: jwtVerify)
 * Pilih false jika kamu memakai CryptoJS AES-CBC (cryptoJSHelpers: decryptWithSecretHex)
 */
const USE_JWT = true;

export default function OrderPage() {
  const router = useRouter();
  const [status, setStatus] = useState({ loading: true, message: "Processing token..." });

  useEffect(() => {
    (async () => {
      try {
        // ambil token named param
        const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;
        if (!token) {
          setStatus({ loading: false, message: "Token tidak ditemukan di URL" });
          return;
        }

        let paramsObj = null;

        if (USE_JWT) {
          // ====== JWT path (signed payload) ======
          // pastikan kamu punya utils/jwtClient.js yang mengekspor jwtVerify
          // import di atas jika kamu gunakan path lain
          const { jwtVerify } = await import("../lib/jwtClient"); // dynamic import ok in client
          const secret = process.env.NEXT_PUBLIC_JWT_SECRET;
          if (!secret) throw new Error("Missing NEXT_PUBLIC_JWT_SECRET in .env.local");

          const res = await jwtVerify(token, secret);
          if (!res.valid) throw new Error("Token tidak valid: " + (res.reason || "signature mismatch"));
          // payload = { storeCode, tableNumber, iat, ... }
          paramsObj = res.payload;
        } else {
          // ====== CryptoJS AES-CBC path (encrypted plaintext) ======
          // utils: decryptWithSecretHex + deriveSecretHex
          const { deriveSecretHex, decryptWithSecretHex } = await import("../lib/crypto");
          const pass = process.env.NEXT_PUBLIC_ENCRYPTION_PASSPHRASE;
          if (!pass) throw new Error("Missing NEXT_PUBLIC_ENCRYPTION_PASSPHRASE in .env.local");

          const secretHex = deriveSecretHex(pass);
          const plain = decryptWithSecretHex(token, secretHex); // returns "storeCode=mgi&tableNumber=A02"
          if (!plain) throw new Error("Decryption returned empty plaintext (wrong key or corrupted token)");
          paramsObj = Object.fromEntries(new URLSearchParams(plain));
        }

        // --- Build userAuth consistent with HeroLocation expectations ---
        // Normalize values as you prefer
        const storeCode = (paramsObj.storeCode || paramsObj.storeLocation || "").toString();
        const tableNumberRaw = paramsObj.tableNumber || "";
        const tableNumber = tableNumberRaw ? tableNumberRaw : "";

        const userAuth = {
          storeLocation: storeCode ? storeCode.toUpperCase() : "MGI",
          orderType: "DI", // assume dine-in flow — change logic if token encodes orderType
          tableNumber,
        };

        // save user and redirect home
        userSignIn(userAuth);
        // optionally set a small delay or show message
        setStatus({ loading: false, message: "Success — redirecting..." });
        // redirect
        sessionStorage.removeItem("yoshi_cart_v1");
        localStorage.removeItem("yoshi_cart_v1");
        router.replace("/"); // replace so /order not in history
      } catch (err) {
        console.error("Order page error:", err);
        setStatus({ loading: false, message: "Error: " + (err.message || String(err)) });
        // optionally redirect to home too
        // router.replace("/");
      }
    })();
  }, [router]);

  return (
    <div style={{ padding: 20 }}>
      <h3>Order processing</h3>
      <div>{status.message}</div>
    </div>
  );
}
