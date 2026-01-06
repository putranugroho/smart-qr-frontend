"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function OrderHistory() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);

  function OrderCard({ order, onClick }) {
    return (
      <div
        onClick={onClick}
        style={{
          background: "#fff",
          borderRadius: 10,
          padding: 16,
          marginBottom: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          cursor: "pointer",
          transition: "transform 0.1s ease",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 8 }}>
          Order #{order.orderCode}
        </div>

        <Row label="Tanggal" value={formatDate(order.orderDate)} />
        <Row
          label="Total"
          value={`Rp ${order.totalPayment.toLocaleString("id-ID")}`}
          bold
        />

        <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>
          📍 {order.storeLocation}
        </div>
      </div>
    );
  }

  function Row({ label, value, bold }) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
          fontWeight: bold ? "bold" : "normal",
          color: bold ? "#2e7d32" : "#333",
        }}
      >
        <span>{label}</span>
        <span>{value}</span>
      </div>
    );
  }

  function EmptyState() {
    return (
      <div style={{ textAlign: "center", marginTop: 60, color: "#777" }}>
        <p style={{ fontSize: 16, marginBottom: 8 }}>
          Belum ada riwayat pesanan
        </p>
        <p style={{ fontSize: 14 }}>
          Pesanan kamu akan muncul di sini setelah checkout
        </p>
      </div>
    );
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const datePart = date.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });

    const time = date.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });

    return `${datePart}, ${time}`;
    }

  useEffect(() => {
    try {
      const stored = localStorage.getItem("orderHistory");
      if (!stored) return;

      const parsed = JSON.parse(stored);

      if (Array.isArray(parsed.dataHistory)) {
        const sortedOrders = [...parsed.dataHistory].sort(
          (a, b) => new Date(b.orderDate) - new Date(a.orderDate)
        );

        setOrders(sortedOrders);
      }
    } catch (err) {
      console.error("Failed to load order history", err);
    }
  }, []);

  return (
    <main
      style={{
        padding: 16,
        background: "#f5f7fb",
        minHeight: "100vh",
      }}
    >
      <h2 style={{ textAlign: "center", marginBottom: 16 }}>
        Riwayat Pesanan
      </h2>

      {orders.length === 0 ? (
        <EmptyState />
      ) : (
        orders.map((order) => (
          <OrderCard
            key={order.orderCode}
            order={order}
            onClick={() => router.push(`/order/${order.orderCode}`)}
          />
        ))
      )}
    </main>
  );
}