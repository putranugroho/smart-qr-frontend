// components/Header.js — bagian logo
"use client";

import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

export default function Header() {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  // close popup if click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header
      className="w-full bg-white"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: "16px" }}
      >
        {/* Logo */}
        <Image
          src="/images/logo-yoshinoya.png"
          alt="Yoshinoya"
          width={132}
          height={35}
          priority
        />

        {/* Right Menu */}
        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Menu lainnya"
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ⋮
          </button>

          {showMenu && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "36px",
                background: "#fff",
                borderRadius: 8,
                minWidth: 180,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => {
                  setShowMenu(false);
                  router.push("/order-history");
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Riwayat Pesanan
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}