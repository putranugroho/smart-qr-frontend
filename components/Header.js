// components/Header.js — bagian logo
import Image from "next/image";
export default function Header() {
  return (
    <header
      className="w-full bg-white"
      style={{ position: "sticky", top: 0, zIndex: 1000, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center" style={{ padding: "16px" }}>
        <Image src="/images/logo-yoshinoya.png" alt="Yoshinoya" width={131.25} height={28} priority />
      </div>
    </header>
  );
}