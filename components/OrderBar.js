// components/OrderBar.js
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from '../styles/OrderBar.module.css'
import { cartCount, cartSubtotal, getCart } from '../lib/cart'
import Image from 'next/image'
import { useRouter } from 'next/router'

export default function OrderBar() {
  const [count, setCount] = useState(0)
  const [subtotal, setSubtotal] = useState(0)
  const router = useRouter()

  useEffect(() => {
    function refresh() {
      setCount(cartCount())
      setSubtotal(cartSubtotal())
    }
    refresh()
    // watch storage events from other tabs
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  if (count === 0) return null

  return (
    <div className={styles.container} role="region" aria-label="Lihat Pesanan">
      <div className={styles.inner}>
        <button className={styles.btn} onClick={() => router.push('/checkout')}>
          <div className={styles.iconWrap}>
            <Image src="/images/cart-icon.png" alt="cart" width={20} height={20} />
          </div>
            <div className={styles.priceText}>Rp{new Intl.NumberFormat('id-ID').format(subtotal)}</div>
            <div className={styles.countText}>({count} item)</div>

          <div className={styles.label}>Lihat Pesanan</div>
        </button>
      </div>
    </div>
  )
}
