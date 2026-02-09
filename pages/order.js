"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import { userSignIn } from "../lib/auth";

/**
 * Pilih true jika kamu memakai JWT HMAC (jwtClient.js: jwtVerify)
 * Pilih false jika kamu memakai CryptoJS AES-CBC (cryptoJSHelpers: decryptWithSecretHex)
 */
const USE_JWT = true;

export default function OrderPage() {
  const router = useRouter();

  const [status, setStatus] = useState({
    loading: true,
    message: "Memproses barcode meja…",
  });

  useEffect(() => {
    (async () => {
      try {
        const token =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("token")
            : null;

        if (!token) {
          setStatus({ loading: false, message: "Token tidak ditemukan di URL." });
          return;
        }

        let paramsObj = null;

        if (USE_JWT) {
          const { jwtVerify } = await import("../lib/jwtClient");
          const secret = process.env.NEXT_PUBLIC_JWT_SECRET;
          if (!secret) throw new Error("Missing NEXT_PUBLIC_JWT_SECRET in .env.local");

          const res = await jwtVerify(token, secret);
          if (!res.valid) throw new Error("Token tidak valid: " + (res.reason || "signature mismatch"));
          paramsObj = res.payload;
        } else {
          const { deriveSecretHex, decryptWithSecretHex } = await import("../lib/crypto");
          const pass = process.env.NEXT_PUBLIC_ENCRYPTION_PASSPHRASE;
          if (!pass) throw new Error("Missing NEXT_PUBLIC_ENCRYPTION_PASSPHRASE in .env.local");

          const secretHex = deriveSecretHex(pass);
          const plain = decryptWithSecretHex(token, secretHex);
          if (!plain) throw new Error("Decryption returned empty plaintext (wrong key or corrupted token)");
          paramsObj = Object.fromEntries(new URLSearchParams(plain));
        }

        // Normalize payload -> userAuth
        const storeCode = (paramsObj.storeCode || paramsObj.storeLocation || "").toString();
        const tableNumberRaw = paramsObj.tableNumber || "";
        const tableNumber = tableNumberRaw ? tableNumberRaw : "";

        const userAuth = {
          storeLocation: storeCode ? storeCode.toUpperCase() : "MGI",
          orderType: "DI",
          tableNumber,
        };

        userSignIn(userAuth);

        setStatus({ loading: true, message: "Berhasil! Mengarahkan ke menu…" });

        sessionStorage.removeItem("yoshi_cart_v1");
        localStorage.removeItem("yoshi_cart_v1");

        // router.replace("/");
      } catch (err) {
        console.error("Order page error:", err);
        setStatus({
          loading: false,
          message: "Terjadi kendala: " + (err?.message || String(err)),
        });
      }
    })();
  }, [router]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.illustrationWrap} aria-hidden="true">
          {/* GANTI src sesuai asset kamu */}
          <Image
            src="/images/promo-icon.png"
            alt="Mohon tunggu"
            width={260}
            height={260}
            priority
            style={styles.illustration}
          />
        </div>

        <h1 style={styles.title}>Mohon tunggu sebentar</h1>
        <p style={styles.subtitle}>
          Kami sedang menyiapkan meja dan mengarahkan kamu ke halaman menu.
          Jangan tutup halaman ini ya.
        </p>

        <div style={styles.statusRow}>
          {status.loading ? <Spinner /> : <ErrorIcon />}
          <span style={styles.statusText}>{status.message}</span>
        </div>

        {!status.loading && (
          <div style={styles.hint}>
            Coba scan ulang barcode meja, atau refresh halaman ini.
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <span style={styles.spinner} aria-label="Loading" />;
}

function ErrorIcon() {
  return (
    <span style={styles.errorDot} aria-hidden="true" />
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "#FFFFFF",
  },

  card: {
    width: "min(520px, 100%)",
    borderRadius: 20,
    padding: "28px 22px",
    background: "#FFFFFF",
    border: "1px solid #EDEDED",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    textAlign: "center",
  },

  illustrationWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 16,
  },

  illustration: {
    borderRadius: 16,
    objectFit: "contain",
  },

  title: {
    fontSize: 22,
    lineHeight: 1.3,
    margin: "8px 0 8px",
    fontWeight: 700,
    color: "#111827", // hampir hitam
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 1.6,
    margin: "0 0 20px",
    color: "#6B7280", // abu-abu lembut
  },

  statusRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 14,
    background: "#F9FAFB",
    border: "1px solid #E5E7EB",
  },

  statusText: {
    fontSize: 13,
    color: "#374151",
    wordBreak: "break-word",
  },

  hint: {
    marginTop: 14,
    fontSize: 12,
    color: "#9CA3AF",
  },

  spinner: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    border: "2px solid #E5E7EB",
    borderTopColor: "#F97316", // ORANGE (loading)
    display: "inline-block",
    animation: "spin 0.9s linear infinite",
  },

  errorDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#EF4444",
    boxShadow: "0 0 0 4px rgba(239,68,68,0.15)",
    display: "inline-block",
  },
};

// Inject keyframes (tanpa file CSS terpisah)
if (typeof document !== "undefined" && !document.getElementById("order-waiting-keyframes")) {
  const style = document.createElement("style");
  style.id = "order-waiting-keyframes";
  style.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}