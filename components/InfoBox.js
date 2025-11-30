// components/InfoBox.js
import React from 'react'
import Image from 'next/image'
import styles from '../styles/InfoBox.module.css'

export default function InfoBox({ children }) {
  const text = children ?? 'Mohon tidak berpindah tempat atau meja saat melakukan pemesanan'

  return (
    <div className={styles.wrapper}>
      <div className={styles.box} role="status" aria-live="polite">
        <div className={styles.icon} aria-hidden>
        <Image
            src="/images/warning.png"   // atau .svg sesuai file kamu
            alt="Warning Icon"
            width={16}
            height={34}
            className={styles.iconImg}
        />
        </div>


        <div className={styles.textWrap}>
          <p className={styles.text}>
            Mohon <b>tidak berpindah tempat atau meja</b> saat melakukan pemesanan
          </p>
        </div>
      </div>
    </div>
  )
}
