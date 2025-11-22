// components/MenuTabs.js
import React, { useEffect, useRef, useState } from "react";
import styles from "../styles/MenuTabs.module.css";

const MENU_ITEMS = ["Promo", "Exclusive", "Japanese Curry", "Paket Puas", "Beef Bowl"];
export default function MenuTabs({ selected = null, onSelect }) {
  const tabsRef = useRef(null);
  const itemRefs = useRef({});
  const [topOffset, setTopOffset] = useState(0);

  useEffect(() => {
    const headerEl = document.querySelector("header");
    const update = () => setTopOffset(headerEl?.getBoundingClientRect().height || 0);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const el = itemRefs.current[selected];
    const cont = tabsRef.current;
    if (!el || !cont) return;
    const elR = el.getBoundingClientRect();
    const cR = cont.getBoundingClientRect();
    cont.scrollBy({ left: elR.left - cR.left - cR.width / 2 + elR.width / 2, behavior: "smooth" });
  }, [selected]);

  return (
    <div className={styles.root} style={{ position: "sticky", top: `${topOffset}px`, zIndex: 300, background: "#fff" }}>
      <button className={styles.menuButton} aria-label="menu" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" fill="#fff" /><rect x="14" y="3" width="7" height="7" rx="1" fill="#fff" /><rect x="3" y="14" width="7" height="7" rx="1" fill="#fff" /><rect x="14" y="14" width="7" height="7" rx="1" fill="#fff" /></svg>
      </button>

      <div ref={tabsRef} className={styles.tabs}>
        {MENU_ITEMS.map((m) => (
          <div
            key={m}
            ref={(el) => (itemRefs.current[m] = el)}
            className={`${styles.tabItem} ${selected === m ? styles.tabItemSelected : ""}`}
            onClick={() => onSelect?.(m)}
          >
            <span>{m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}