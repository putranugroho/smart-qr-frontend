// pages/menu.js
import dynamic from "next/dynamic";
import { useOrderGuard } from "../hooks/useOrderGuard";

const Menu = dynamic(() => import("../components/Menu"), { ssr: false });

export default function MenuPage() {
  const { allowed, checking } = useOrderGuard({
    requireStore: true,
    requireTable: true,
    redirectTo: "/", // balik ke home jika belum scan QR
  });

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading menu...
      </div>
    );
  }

  if (!allowed) return null; // safety, karena sudah redirect

  return <Menu />;
}