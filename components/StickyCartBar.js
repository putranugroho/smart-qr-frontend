// components/StickyCartBar.js
import Image from 'next/image'
import styles from '../styles/StickyCartBar.module.css'

function formatRp(n) {
  if (n == null) return 'Rp0'
  const v = Number(n) || 0
  return 'Rp' + new Intl.NumberFormat('id-ID').format(v)
}

export default function StickyCartBar({
  qty = 1,
  setQty = () => {},
  subtotal = 0,
  onAdd = () => {},
  style = {},
  addAnimating = false,
  addLabel = 'Tambah Pesanan',
  disabled = false,
  maxQuantityCanGet = 0 // 0 / null = unlimited
}) {
  const hasItems = Number(subtotal) > 0

  // ===============================
  // 🔐 MAX QTY LOGIC (MACRO SAFE)
  // ===============================
  const isLimited =
    Number(maxQuantityCanGet) > 0

  const maxQty = isLimited
    ? Number(maxQuantityCanGet)
    : Infinity

  const reachedMax = isLimited && qty >= maxQty

  function handleMinus() {
    setQty(Math.max(1, qty - 1))
  }

  function handlePlus() {
    if (isLimited && qty >= maxQty) return
    setQty(qty + 1)
  }

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
              onClick={handleMinus}
              className={styles.qtyBtnMinus}
            >
              <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
                <rect width="10" height="2" rx="1" fill="#111827" />
              </svg>
            </button>

            <div className={styles.qtyDisplay}>{qty}</div>

            <button
              aria-label="Tambah jumlah"
              onClick={handlePlus}
              disabled={reachedMax}
              className={styles.qtyBtnPlus}
              style={{
                opacity: reachedMax ? 0.4 : 1,
                cursor: reachedMax ? 'not-allowed' : 'pointer'
              }}
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

        {/* INFO MAX QTY */}
        {reachedMax && (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              color: '#dc2626',
              textAlign: 'right'
            }}
          >
            Maksimal {maxQty} item promo
          </div>
        )}

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
              <Image
                src="/images/cart-icon.png"
                alt="cart"
                width={20}
                height={20}
              />
            </div>

            {/* Price + Label */}
            <div className={styles.addTextWrap}>
              <div className={styles.addPrice}>
                {formatRp(subtotal)}
              </div>
              <div className={styles.addLabel}>
                {addLabel}
              </div>
            </div>

            <div style={{ width: 8 }} />
          </button>
        </div>

      </div>
    </div>
  )
}