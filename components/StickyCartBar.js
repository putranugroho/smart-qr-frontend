// components/StickyCartBar.js
import Image from 'next/image'
import { useRef, useState } from 'react'
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
  onAdd = async () => false,
  style = {},
  addAnimating = false,
  addLabel = 'Tambah Pesanan',
  disabled = false,
  isReady = false,
  maxQuantityCanGet = 0
}) {
  const [adding, setAdding] = useState(false)
  const addLockRef = useRef(false)

  const isLimited = Number(maxQuantityCanGet) > 0
  const maxQty = isLimited ? Number(maxQuantityCanGet) : Infinity
  const reachedMax = isLimited && qty >= maxQty

  function handleMinus() {
    if (adding) return
    setQty(Math.max(1, qty - 1))
  }

  function handlePlus() {
    if (adding) return
    if (isLimited && qty >= maxQty) return
    setQty(qty + 1)
  }

  // ✅ tombol aktif hanya kalau ready + tidak disabled + tidak adding
  const canPress = isReady && !disabled && !adding && !addLockRef.current
  const btnDisabled = disabled || adding || addLockRef.current

  async function handleAddClick() {
    if (btnDisabled) return
    if (addLockRef.current) return

    addLockRef.current = true
    setAdding(true)

    try {
      // IMPORTANT: onAdd() dari ComboDetail return boolean
      const ok = await onAdd()

      // kondisi 1 (belum lengkap): onAdd() return false → reset tombol
      if (!ok) {
        setAdding(false)
      } else {
        // kondisi 2 (sukses): biarkan adding sampai redirect
        // (redirect udah dilakukan di ComboDetail)
      }
    } catch (e) {
      // kalau ada error unexpected, tetap balikin tombol
      setAdding(false)
    } finally {
      // unlock cepat supaya user bisa klik lagi saat gagal
      setTimeout(() => {
        addLockRef.current = false
      }, 150)
    }
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
              disabled={adding}
              style={{
                opacity: adding ? 0.4 : 1,
                cursor: adding ? 'not-allowed' : 'pointer'
              }}
            >
              <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
                <rect width="10" height="2" rx="1" fill="#111827" />
              </svg>
            </button>

            <div className={styles.qtyDisplay}>{qty}</div>

            <button
              aria-label="Tambah jumlah"
              onClick={handlePlus}
              disabled={adding || reachedMax}
              className={styles.qtyBtnPlus}
              style={{
                opacity: adding || reachedMax ? 0.4 : 1,
                cursor: adding || reachedMax ? 'not-allowed' : 'pointer'
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

        {reachedMax && (
          <div style={{ marginTop: 4, fontSize: 11, color: '#dc2626', textAlign: 'right' }}>
            Maksimal {maxQty} item promo
          </div>
        )}

        {/* ROW 2 — BUTTON ADD */}
        <div className={styles.rowBottom}>
          <button
            onClick={handleAddClick}
            aria-label={addLabel}
            disabled={btnDisabled}
            className={`${styles.addBtn} ${
              canPress ? styles.addBtnActive : styles.addBtnInactive
            } ${addAnimating ? styles.addPulse : ''}`}
            type="button"
          >
            <div className={styles.cartIcon}>
              <Image src="/images/cart-icon.png" alt="cart" width={20} height={20} />
            </div>

            <div className={styles.addTextWrap}>
              <div className={styles.addPrice}>{formatRp(subtotal)}</div>
              <div className={styles.addLabel}>
                {adding ? 'Menambahkan ke keranjang...' : addLabel}
              </div>
            </div>

            <div style={{ width: 8 }} />
          </button>
        </div>
      </div>
    </div>
  )
}