// components/MacroPopup.jsx
import Image from 'next/image'
import styles from '../styles/MacroPopup.module.css'

export default function MacroPopup({ data, onSelect, onSkip }) {
  const macros = Array.isArray(data?.data) ? data.data : []

  return (
    <div className={styles.overlay} onClick={onSkip}>
      <div
        className={styles.popup}
        onClick={(e) => e.stopPropagation()} // ⛔ prevent close when click popup
      >
        {/* ICON */}
        <div className={styles.iconWrap}>
          <Image
            src="/images/promo-icon.png" // ganti jika perlu
            alt="Promo"
            width={64}
            height={64}
          />
        </div>

        {/* TITLE */}
        <h1 className={styles.title}>
          <b>
            Sebelum pembayaran, cek penawaran ini!
          </b>
        </h1>

        {/* SUBTITLE */}
        <p className={styles.subtitle}>
          Klaim promo jika ada atau tambah produk.
        </p>

        <p className={styles.subtitle}>
          Lewati untuk melanjutkan pembicaraan
        </p>

        {/* LIST MACRO */}
        <div className={styles.list}>
          {macros.map((m, mi) =>
            (m.combosGet || []).map((combo, ci) => {
              const image =
                combo.imagePath || '/images/no-image-available.jpg'

              return (
                <button
                  key={`${m.macroCode}-${combo.code}-${ci}`}
                  className={styles.item}
                  onClick={() =>
                    onSelect({
                      ...combo,
                      macroCode: m.macroCode,
                      macroName: m.macroName,
                      maxQuantityCanGet: m.maxQuantityCanGet,
                      isAllowGetAnother: m.isAllowGetAnother,
                    })
                  }
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
                      {m.macroName}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* SKIP */}
        <button className={styles.skipBtn} onClick={onSkip}>
          Lewati
        </button>
      </div>
    </div>
  )
}