import { useRouter } from 'next/router'
import { normalizeMacroToComboDetail } from '../lib/macro'

export function MacroPopup({ data, onSkip }) {
  const router = useRouter()

  const handleSelect = (macro, macroCombo) => {
    const normalized = normalizeMacroToComboDetail(macroCombo, macro)

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

        <div className={styles.list}>
          {data?.data?.map((macro, midx) =>
            macro?.combosGet?.map((combo, cidx) => {
              const image =
                combo.imagePath || '/images/no-image-available.jpg'

              return (
                <button
                  key={`${midx}-${cidx}`}
                  className={styles.item}
                  onClick={() => handleSelect(macro, combo)}
                >
                  <div className={styles.imageWrap}>
                    <Image
                      src={image}
                      alt={combo.name}
                      fill
                      className={styles.image}
                    />
                  </div>

                  <div className={styles.itemText}>
                    <div className={styles.itemTitle}>
                      {combo.name}
                    </div>
                    <div className={styles.itemDesc}>
                      {macro.macroName}
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
