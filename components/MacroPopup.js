import Image from 'next/image'
import { useRouter } from 'next/router'
import styles from '../styles/MacroPopup.module.css'
import { normalizeMacroToComboDetail } from '../lib/macro'

export function MacroPopup({ data, onSkip }) {
  const router = useRouter()

  const macros = Array.isArray(data?.data) ? data.data : []

  const handleSelect = (macro, combo) => {
    const normalized = normalizeMacroToComboDetail(combo, macro)

    router.push({
      pathname: '/combo-detail',
      query: {
        combo: JSON.stringify(normalized),
        from: 'macro'
      }
    })
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.popup}>
        <h3 className={styles.title}>
          Sebelum pembayaran, cek penawaran ini!
        </h3>

        <p className={styles.subtitle}>
          Klaim promo jika ada atau tambah produk.
        </p>

        <div className={styles.list}>
          {macros.map((macro, midx) =>
            (macro?.combosGet || []).map((combo, cidx) => {
              const image =
                combo?.imagePath && typeof combo.imagePath === 'string'
                  ? combo.imagePath
                  : '/images/no-image-available.jpg'

              return (
                <button
                  key={`macro-${midx}-combo-${cidx}`}
                  className={styles.item}
                  onClick={() => handleSelect(macro, combo)}
                >
                  <div className={styles.imageWrap}>
                    <Image
                      src={image}
                      alt={combo?.name || 'Promo'}
                      fill
                      sizes="80px"
                      className={styles.image}
                    />
                  </div>

                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>
                      {combo?.name}
                    </div>
                    <div className={styles.itemDesc}>
                      {macro?.macroName}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <button className={styles.skipBtn} onClick={onSkip}>
          Lewati
        </button>
      </div>
    </div>
  )
}