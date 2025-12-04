// components/SearchBar.js (perbaikan z-index & penggunaan class sticky)
import React, { useState, useEffect  } from "react";
import styles from "../styles/SearchBar.module.css";

export default function SearchBar({ onSearch, onSearchChange, onToggleView, isSearching }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState("grid");

  function toggleView(next) {
    const v = next ?? (view === "grid" ? "list" : "grid");
    setView(v);
    onToggleView?.(v);
  }

  useEffect(() => {
    // real-time call (debounce optional)
    const id = setTimeout(() => {
      onSearch?.(query);
    }, 120);
    return () => clearTimeout(id);
  }, [query]);

  function handleSearch() {
    onSearch?.(query);
  }

  function resetSearch() {
    setQuery("");
    onSearch?.("");
  }

  // conditional zIndex: tinggi hanya saat sedang searching (sticky),
  // rendah saat normal biar tidak menutupi MenuTabs.
  const wrapperStyle = {
    position: isSearching ? "sticky" : "relative",
    top: isSearching ? "58px" : "auto",
    zIndex: isSearching ? 350 : 150, // <-- perbaikan utama: z-index rendah saat tidak searching
  };

  return (
      <div
        className={`${styles.wrapper} ${isSearching ? styles.stickySearch : ""}`}
        style={wrapperStyle}
      >
      <div className={styles.root}>
        {/* SEARCH BOX */}
        <div className={styles.search}>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              onSearchChange?.(e.target.value)
            }}
            placeholder="Cari menu..."
          />

          {/* SEARCH / CLEAR BUTTON */}
          <button
            type="button"
            className={styles.searchBtn}
            aria-label="Cari"
            onClick={() => (query ? resetSearch() : handleSearch())}
          >
            {query ? (
              // X icon (clear)
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              // Search icon (loop)
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 21l-4.35-4.35"
                  stroke="#9CA3AF"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="11"
                  cy="11"
                  r="6"
                  stroke="#9CA3AF"
                  strokeWidth="1.5"
                />
              </svg>
            )}
          </button>
        </div>

        {/* VIEW SWITCHER */}
        <div className={styles.switcher}>
          <div
            className={`${styles.switcherButton} ${
              view === "grid" ? styles.active : ""
            }`}
            onClick={() => toggleView("grid")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24">
              <rect
                x="3"
                y="3"
                width="7"
                height="7"
                rx="1"
                fill={view === "grid" ? "#fff" : "#101010"}
              />
              <rect
                x="14"
                y="3"
                width="7"
                height="7"
                rx="1"
                fill={view === "grid" ? "#fff" : "#101010"}
              />
              <rect
                x="3"
                y="14"
                width="7"
                height="7"
                rx="1"
                fill={view === "grid" ? "#fff" : "#101010"}
              />
              <rect
                x="14"
                y="14"
                width="7"
                height="7"
                rx="1"
                fill={view === "grid" ? "#fff" : "#101010"}
              />
            </svg>
          </div>

          <div
            className={`${styles.switcherButton} ${
              view === "list" ? styles.active : ""
            }`}
            onClick={() => toggleView("list")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24">
              <path
                d="M8 6h13M8 12h13M8 18h13"
                stroke={view === "list" ? "#fff" : "#101010"}
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle
                cx="4.5"
                cy="6"
                r="1"
                fill={view === "list" ? "#fff" : "#101010"}
              />
              <circle
                cx="4.5"
                cy="12"
                r="1"
                fill={view === "list" ? "#fff" : "#101010"}
              />
              <circle
                cx="4.5"
                cy="18"
                r="1"
                fill={view === "list" ? "#fff" : "#101010"}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* TEXT PENCARIAN */}
      {query.length > 0 && (
        <div className={styles.searchResultText}>
          Pencarian untuk menu “<b>{query}</b>”
        </div>
      )}
    </div>
  );
}
