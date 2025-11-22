// components/CardItem.js
import Image from 'next/image'
import styles from '../styles/CardItem.module.css'
import { useRouter } from 'next/router'

function formatRp(n) {
  if (n == null) return '-'
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

export default function CardItem({ item, onAdd }) {
  const router = useRouter()
  // const imgSrc = item.imagePath || item.image
  const imgSrc = '/images/gambar-menu.jpg'
  const name = item.name || item.itemName || item.title || ''

  function handleClick() {
    // redirect to item detail: pass some basic info as query for immediate display
    // Use product code if available, else id
    const productCode = item.id
    const q = {}
    // pass basic info as query string (optional)
    if (item.name) q.title = item.name
    if (item.description) q.description = item.description
    if (item.price != null) q.price = item.price
    if (imgSrc) q.image = imgSrc

    const search = new URLSearchParams(q).toString()
    router.push(`/item/${encodeURIComponent(productCode)}${search ? `?${search}` : ''}`)
  }

  return (
    <div className={styles.card} onClick={handleClick}>
      <div className={styles.cardImage}>
        <Image src={imgSrc} alt={name} width={167} height={167} className="object-cover" />
      </div>

      <div className={styles.cardBody}>
        <div className={styles.price}>{formatRp(item.price)}</div>
        <div className={styles.title}>{name}</div>
      </div>

      <div className={styles.cardFooter}>
        <button
          className={styles.addBtn}
          onClick={(e) => { e.stopPropagation(); onAdd?.(item) }}
        >
          Tambah
        </button>
      </div>
    </div>
  )
}
