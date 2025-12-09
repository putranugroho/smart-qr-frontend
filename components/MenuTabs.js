// components/MenuTabs.js
import React, { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { getUser } from '../lib/auth'
import styles from "../styles/MenuTabs.module.css";

const fetcher = (u) => fetch(u).then(r => r.json());

export default function MenuTabs({ selected, onSelect, isHidden, onOpenFullMenu, items: itemsProp = null }) {
  const [items, setItems] = useState([]);
  const tabsRef = useRef(null);
  const itemRefs = useRef({});
  const [topOffset, setTopOffset] = useState(0);

  // If parent provided items list, use it; otherwise fetch via SWR and cache
  const API_URL = `/api/proxy/menu-category?storeCode=${getUser().storeLocation}&orderCategoryCode=${getUser().orderType}`;
  const { data, error } = useSWR(itemsProp ? null : API_URL, fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 1000 });

  useEffect(() => {
    if (Array.isArray(itemsProp) && itemsProp.length > 0) {
      setItems(itemsProp);
      return;
    }
    if (!data) {
      if (error) console.error("MenuTabs fetch error", error);
      return;
    }
    const cleaned = (data?.data || [])
      .filter(c => Number(c.totalItems ?? (c.items?.length ?? 0)) > 0)
      .map(c => c.name)
      .filter(Boolean);
    setItems(cleaned);
  }, [itemsProp, data, error]);

  // persist/restore selected tab (sessionStorage)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('menu_selected_tab');
      if (saved && items.includes(saved)) {
        // if parent didn't override selection, notify parent
        if (!selected) {
          onSelect?.(saved);
        }
      }
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    // whenever selected changes, scroll tab into view and persist selection
    const el = itemRefs.current[selected];
    const container = tabsRef.current;
    if (el && container) {
      const elRect = el.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      const offset = elRect.left - contRect.left - contRect.width / 2 + elRect.width / 2;
      container.scrollBy({ left: offset, behavior: "smooth" });
    }

    try {
      if (selected) sessionStorage.setItem('menu_selected_tab', String(selected));
    } catch (e) { /* ignore */ }
  }, [selected]);

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

  function openFullMenu() {
    if (typeof onOpenFullMenu === 'function') {
      onOpenFullMenu();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <div className={`${styles.root} ${isHidden ? styles.hidden : ""}`} style={{ position: "sticky", top: topOffset, zIndex: 300 }}>
      <button className={styles.menuButton} aria-label="Open menu" onClick={openFullMenu}>
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
