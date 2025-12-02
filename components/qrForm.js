// pages/qr.js
import dynamic from "next/dynamic";
import { useState } from "react";
const QRCode = dynamic(() => import("react-qr-code"), { ssr: false });
import { jwtSign } from "../lib/jwtClient";

export default function QrPage() {
  const [storeCode, setStoreCode] = useState("mgi");
  const [tableNumber, setTableNumber] = useState("A02");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (e) => {
  e?.preventDefault();
  setLoading(true);
  try {
    const secret = process.env.NEXT_PUBLIC_JWT_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_URL_UAT || process.env.NEXT_PUBLIC_URL_DEV; // atau nama env yang benar

    if (!secret) throw new Error("Missing NEXT_PUBLIC_JWT_SECRET in .env.local");
    if (!baseUrl) throw new Error("Missing URL env");

    const payload = { storeCode: storeCode.trim(), tableNumber: tableNumber.trim() };
    const tok = await jwtSign(payload, secret);

    const finalUrl = `${baseUrl}/order?token=${encodeURIComponent(tok)}`;
    setToken(tok);
    setUrl(finalUrl);
  } catch (err) {
    alert("Generate error: " + (err.message || err));
  } finally {
    setLoading(false);
  }
};

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, Arial" }}>
      <h2>QR JWT Generator</h2>
      <form onSubmit={handleGenerate} style={{ display: "grid", gap: 8, maxWidth: 520 }}>
        <label>
          Store Code
          <input value={storeCode} onChange={(e) => setStoreCode(e.target.value)} style={{ width: "100%", padding: 8 }} />
        </label>
        <label>
          Table Number
          <input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} style={{ width: "100%", padding: 8 }} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={loading}>{loading ? "Generating..." : "Generate QR"}</button>
          <button type="button" onClick={() => { setStoreCode(""); setTableNumber(""); setUrl(""); setToken(""); }}>Reset</button>
        </div>
      </form>

      <div style={{ marginTop: 20, display: "flex", gap: 16 }}>
        <div style={{ padding: 12, background: "#fff", border: "1px solid #eee" }}>
          {url ? <QRCode value={url} size={220} /> : <div style={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>QR will appear here</div>}
        </div>

        <div style={{ flex: 1 }}>
          <div>
            <label>Generated URL</label>
            <input readOnly value={url} style={{ width: "100%", padding: 8 }} />
          </div>

          <div style={{ marginTop: 8 }}>
            <label>Token</label>
            <textarea readOnly value={token} style={{ width: "100%", height: 120 }} />
          </div>

          <div style={{ marginTop: 8 }}>
            <button onClick={() => { if (!url) return alert("Generate first"); navigator.clipboard.writeText(url).then(() => alert("Copied URL")); }}>Copy URL</button>
            <button style={{ marginLeft: 8 }} onClick={() => { if (!token) return alert("Generate first"); navigator.clipboard.writeText(token).then(() => alert("Copied Token")); }}>Copy Token</button>
          </div>
        </div>
      </div>
    </div>
  );
}
