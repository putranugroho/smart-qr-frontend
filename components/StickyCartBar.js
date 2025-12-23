// components/StickyCartBar.js
import Image from 'next/image'
import React from 'react'
import styles from '../styles/StickyCartBar.module.css'

function formatRp(n) {
  if (n == null) return 'Rp0'
  const v = Number(n) || 0
  return 'Rp' + new Intl.NumberFormat('id-ID').format(v)
}

/**
 * StickyCartBar
 * props:
 *  - qty
 *  - setQty
 *  - subtotal
 *  - onAdd
 *  - addAnimating (bool) -> apply visual pulse to the button
 *  - addLabel (string) -> label shown on the button (default: 'Tambah Pesanan')
 */
export default function StickyCartBar({
  qty = 1,
  setQty = () => {},
  subtotal = 0,
  onAdd = () => {},
  style = {},
  addAnimating = false,
  addLabel = 'Tambah Pesanan',
  disabled = false
}) {
  const hasItems = Number(subtotal) > 0

  return (
    <div className={styles.container}>
      <div className={styles.bar} style={style}>

        {/* ROW 1 — TOTAL + QTY */}
        <div className={styles.rowTop}>
          <div className={styles.leftTop}>
            <div className={styles.totalLabel}>Total</div>
          </div>

          <div className={styles.qtyRow}>
            <button
              aria-label="Kurangi jumlah"
              onClick={() => setQty(Math.max(1, qty - 1))}
              className={styles.qtyBtnMinus}
            >
              <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
                <rect width="10" height="2" rx="1" fill="#111827" />
              </svg>
            </button>

            <div className={styles.qtyDisplay}>{qty}</div>

            <button
              aria-label="Tambah jumlah"
              onClick={() => setQty(qty + 1)}
              className={styles.qtyBtnPlus}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="#fff"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* ROW 2 — BUTTON ADD */}
        <div className={styles.rowBottom}>
          <button
            onClick={disabled ? undefined : onAdd}
            aria-label={addLabel}
            disabled={disabled}
            className={`${styles.addBtn} ${
              hasItems && !disabled ? styles.addBtnActive : styles.addBtnInactive
            } ${addAnimating ? styles.addPulse : ''}`}
            type="button"
          >
            {/* Icon */}
            <div className={styles.cartIcon}>
              <Image src="/images/cart-icon.png" alt="cart" width={20} height={20} />
            </div>

            {/* Price + Label */}
            <div className={styles.addTextWrap}>
              <div className={styles.addPrice}>{formatRp(subtotal)}</div>
              <div className={styles.addLabel}>{addLabel}</div>
            </div>

            <div style={{ width: 8 }} /> {/* spacer kanan */}
          </button>
        </div>

      </div>
    </div>
  )
}
