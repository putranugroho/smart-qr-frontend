"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { userSignIn } from "../lib/auth";

const USE_JWT = true;

export default function OrderPage() {
  const router = useRouter();
  const [status, setStatus] = useState({
    loading: true,
    message: "Processing token...",
  });

  useEffect(() => {
    (async () => {
      try {
        const token =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("token")
            : null;

        if (!token) {
          setStatus({ loading: false, message: "Token tidak ditemukan di URL" });
          return;
        }

        let paramsObj = null;

        // ===========================
        //     JWT CLIENT (WebCrypto)
        // ===========================

        if (USE_JWT) {
          let jwtSuccess = false;

          try {
            // 1. CEK DUKUNGAN WEBCRYPTO
            if (!window.crypto || !window.crypto.subtle) {
              throw new Error("WebCrypto tidak tersedia (Safari/Android lama).");
            }

            const { jwtVerify } = await import("../lib/jwtClient");
            const secret = process.env.NEXT_PUBLIC_JWT_SECRET;

            if (!secret) throw new Error("Missing NEXT_PUBLIC_JWT_SECRET");

            const res = await jwtVerify(token, secret);

            if (!res.valid) {
              throw new Error(res.reason || "JWT verification failed");
            }

            paramsObj = res.payload;
            jwtSuccess = true;
          } catch (err) {
            console.warn("JWT verify gagal / tidak didukung, fallback ke CryptoJS AES:", err.message);
          }

          // ===========================
          //       FALLBACK CRYPTOJS
          // ===========================

          if (!jwtSuccess) {
            const { deriveSecretHex, decryptWithSecretHex } = await import("../lib/crypto");
            const pass = process.env.NEXT_PUBLIC_ENCRYPTION_PASSPHRASE;

            if (!pass)
              throw new Error("Missing NEXT_PUBLIC_ENCRYPTION_PASSPHRASE (needed for fallback AES)");

            const secretHex = deriveSecretHex(pass);
            const plain = decryptWithSecretHex(token, secretHex);

            if (!plain) throw new Error("Fallback decrypt gagal: token rusak atau key salah");

            paramsObj = Object.fromEntries(new URLSearchParams(plain));
          }
        } else {
          // ===========================
          //  ONLY CRYPTOJS MODE (NO JWT)
          // ===========================

          const { deriveSecretHex, decryptWithSecretHex } = await import("../lib/crypto");
          const pass = process.env.NEXT_PUBLIC_ENCRYPTION_PASSPHRASE;
          if (!pass) throw new Error("Missing NEXT_PUBLIC_ENCRYPTION_PASSPHRASE");

          const secretHex = deriveSecretHex(pass);
          const plain = decryptWithSecretHex(token, secretHex);
          if (!plain) throw new Error("Decryption returned empty plaintext");

          paramsObj = Object.fromEntries(new URLSearchParams(plain));
        }

        // ===========================
        //   FINAL AUTH DATA
        // ===========================

        const storeCode = (paramsObj.storeCode || paramsObj.storeLocation || "").toString();
        const tableNumberRaw = paramsObj.tableNumber || "";
        const tableNumber = tableNumberRaw ? tableNumberRaw : "";

        const userAuth = {
          storeLocation: storeCode ? storeCode.toUpperCase() : "MGI",
          orderType: "DI",
          tableNumber,
        };

        userSignIn(userAuth);

        setStatus({ loading: false, message: "Success — redirecting..." });
        router.replace("/");
      } catch (err) {
        console.error("Order page error:", err);
        setStatus({
          loading: false,
          message: "Error: " + (err.message || String(err)),
        });
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