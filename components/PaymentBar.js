// components/PaymentBar.js
import Image from 'next/image'
import styles from '../styles/PaymentBar.module.css'

export default function PaymentBar() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.footerBox}>
        <p className={styles.text}>Hanya menerima Pembayaran Online</p>

        <div className={styles.iconRow} aria-hidden>
          <span className={styles.iconWrap}>
            <Image src="/images/pay-gopay.png" alt="gopay" width={55} height={14} className={styles.iconImg} />
          </span>

          <span className={styles.iconWrap}>
            <Image src="/images/pay-shopeepay.png" alt="shopee" width={55} height={14} className={styles.iconImg} />
          </span>

          <span className={styles.iconWrap}>
            <Image src="/images/pay-qris.png" alt="qris" width={55} height={14} className={styles.iconImg} />
          </span>

          <span className={styles.iconWrap}>
            <Image src="/images/pay-ovo.png" alt="ovo" width={55} height={14} className={styles.iconImg} />
          </span>

          <span className={styles.iconWrap}>
            <Image src="/images/pay-dana.png" alt="dana" width={55} height={14} className={styles.iconImg} />
          </span>
        </div>
      </div>
    </div>
  )
}
