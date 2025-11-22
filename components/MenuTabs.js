// components/MenuTabs.js
import React, { useEffect, useRef, useState } from "react";
import styles from "../styles/MenuTabs.module.css";

export default function MenuTabs({ selected, onSelect, isHidden }) {
  const [items, setItems] = useState([]);
  const tabsRef = useRef(null);
  const itemRefs = useRef({});
  const [topOffset, setTopOffset] = useState(0);

  // Fetch API categories for tabs and filter totalItems
  useEffect(() => {
    const API_URL = "/api/proxy/menu-category?storeCode=SMS&orderCategoryCode=DI";

    fetch(API_URL)
      .then((r) => r.json())
      .then((json) => {
        const cleaned =
          json?.data
            ?.filter((c) => Number(c.totalItems) > 0)
            ?.map((c) => c.name)
            ?.filter(Boolean) || [];
        setItems(cleaned);
      })
      .catch((err) => console.error("MenuTabs API Error:", err));
  }, []);

  // Calculate sticky offset under header
  useEffect(() => {
    const headerEl = document.querySelector("header");
    const updateOffset = () => {
      const h = headerEl?.getBoundingClientRect().height || 0;
      setTopOffset(h);
    };
    updateOffset();
    window.addEventListener("resize", updateOffset);
    return () => window.removeEventListener("resize", updateOffset);
  }, []);

  // Scroll tab into view when selected changes
  useEffect(() => {
    const el = itemRefs.current[selected];
    const container = tabsRef.current;
    if (!el || !container) return;

    const elRect = el.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();

    const offset = elRect.left - contRect.left - contRect.width / 2 + elRect.width / 2;
    container.scrollBy({ left: offset, behavior: "smooth" });
  }, [selected]);

  function openFullMenu() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div
      className={`${styles.root} ${isHidden ? styles.hidden : ""}`}
      style={{ position:"sticky", top: topOffset, zIndex:300 }}
    >
      <button
        className={styles.menuButton}
        aria-label="Open menu"
        onClick={openFullMenu}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="6" width="16" height="2.7" rx="1.35" fill="#fff" />
          <rect x="4" y="11" width="16" height="2.7" rx="1.35" fill="#fff" />
          <rect x="4" y="16" width="16" height="2.7" rx="1.35" fill="#fff" />
        </svg>
      </button>

      <div ref={tabsRef} className={styles.tabs} role="tablist" aria-label="Menu categories">
        {items.map((m) => (
          <div
            key={m}
            role="tab"
            tabIndex={0}
            aria-selected={m === selected}
            ref={(el) => (itemRefs.current[m] = el)}
            className={`${styles.tabItem} ${m === selected ? styles.tabItemSelected : ''}`}
            onClick={() => onSelect?.(m)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(m) } }}
          >
            <span>{m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
