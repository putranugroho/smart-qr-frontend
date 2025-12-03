"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { userSignIn } from "../lib/auth";

/**
 * Pilih true jika kamu memakai JWT HMAC
 * Pilih false jika kamu memakai CryptoJS AES-CBC
 */
const USE_JWT = true;

export default function OrderPage() {
  const router = useRouter();
  const [status, setStatus] = useState({ loading: true, message: "Processing token..." });

  useEffect(() => {
    (async () => {
      try {
        // ambil token from ?token=...
        const token = typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("token")
          : null;

        if (!token) {
          setStatus({ loading: false, message: "Token tidak ditemukan di URL" });
          return;
        }

        let paramsObj = null;

        if (USE_JWT) {
          // ====== JWT decode path ======
          const { jwtDecode } = await import("../lib/jwtClient");
          const decoded = jwtDecode(token);
          if (!decoded) throw new Error("Token tidak valid atau corrupt");
          paramsObj = decoded;

        } else {
          // ====== AES decrypt path ======
          const { deriveSecretHex, decryptWithSecretHex } = await import("../lib/crypto");
          const pass = process.env.NEXT_PUBLIC_ENCRYPTION_PASSPHRASE;
          if (!pass) throw new Error("Missing NEXT_PUBLIC_ENCRYPTION_PASSPHRASE in .env.local");

          const secretHex = deriveSecretHex(pass);
          const plain = decryptWithSecretHex(token, secretHex);
          if (!plain) throw new Error("Decryption returned empty plaintext");
          paramsObj = Object.fromEntries(new URLSearchParams(plain));
        }

        // normalize field
        const storeCode = (paramsObj.storeCode || paramsObj.storeLocation || "").toString();
        const tableNumberRaw = paramsObj.tableNumber || "";
        const tableNumber = tableNumberRaw
          ? (tableNumberRaw.toString().startsWith("Table") ? tableNumberRaw : `Table ${tableNumberRaw}`)
          : "";

        const userAuth = {
          storeLocation: storeCode.toUpperCase(),
          orderType: "DI",
          tableNumber,
        };

        userSignIn(userAuth);
        setStatus({ loading: false, message: "Success — redirecting..." });

        router.replace("/");
      } catch (err) {
        console.error("Order page error:", err);
        setStatus({ loading: false, message: "Error: " + (err.message || String(err)) });
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
