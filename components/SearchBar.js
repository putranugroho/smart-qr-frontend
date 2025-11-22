// components/SearchBar.js
import React, { useState } from 'react'
import styles from '../styles/SearchBar.module.css'
import Image from 'next/image'

export default function SearchBar({ onSearch, onToggleView }) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState('grid') // grid or list

  function toggleView(next) {
    const v = next ?? (view === 'grid' ? 'list' : 'grid')
    setView(v)
    onToggleView?.(v)
  }

  return (
    <div className={styles.root}>
      <div className={styles.search}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSearch?.(query) }}
          placeholder="Cari menu..."
          aria-label="Cari menu"
        />

        {/* search icon di sebelah kanan */}
        <button
          type="button"
          className={styles.searchBtn}
          aria-label="Cari"
          onClick={() => onSearch?.(query)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M21 21l-4.35-4.35" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="11" cy="11" r="6" stroke="#9CA3AF" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      <div className={styles.switcher} role="tablist" aria-label="View switcher">
        <div
          className={`${styles.switcherButton} ${view === 'grid' ? styles.active : ''}`}
          onClick={() => toggleView('grid')}
          role="button"
          aria-pressed={view === 'grid'}
        >
          {/* grid icon */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="3" width="7" height="7" rx="1" fill={view === 'grid' ? '#fff' : '#101010'} />
            <rect x="14" y="3" width="7" height="7" rx="1" fill={view === 'grid' ? '#fff' : '#101010'} />
            <rect x="3" y="14" width="7" height="7" rx="1" fill={view === 'grid' ? '#fff' : '#101010'} />
            <rect x="14" y="14" width="7" height="7" rx="1" fill={view === 'grid' ? '#fff' : '#101010'} />
          </svg>
        </div>

        <div
          className={`${styles.switcherButton} ${view === 'list' ? styles.active : ''}`}
          onClick={() => toggleView('list')}
          role="button"
          aria-pressed={view === 'list'}
        >
          {/* list icon */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M8 6h13M8 12h13M8 18h13" stroke={view === 'list' ? '#fff' : '#101010'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="4.5" cy="6" r="1" fill={view === 'list' ? '#fff' : '#101010'} />
            <circle cx="4.5" cy="12" r="1" fill={view === 'list' ? '#fff' : '#101010'} />
            <circle cx="4.5" cy="18" r="1" fill={view === 'list' ? '#fff' : '#101010'} />
          </svg>
        </div>
      </div>
    </div>
  )
}
