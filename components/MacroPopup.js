import Image from "next/image";
import styles from "../styles/MacroPopup.module.css";

export default function MacroPopup({ data, onSelect, onSkip }) {
  const macros = Array.isArray(data?.data) ? data.data : [];

  return (
    <>
      {/* OVERLAY */}
      <div className={styles.overlay} onClick={onSkip} />

      {/* POPUP */}
      <div className={styles.popup}>
        {/* ICON */}
        <div className={styles.icon}>
          <Image
            src="/images/promo-icon.png" // ganti jika perlu
            alt="Promo"
            width={64}
            height={64}
          />
        </div>

        {/* TITLE */}
        <h3 className={styles.title}>
          Sebelum pembayaran, cek penawaran ini!
        </h3>

        {/* SUBTITLE */}
        <p className={styles.subtitle}>
          Klaim promo jika ada atau tambah produk.
        </p>

        {/* LIST */}
        <div className={styles.list}>
          {macros.map((m, mi) =>
            (m.combosGet || []).map((combo, ci) => (
              <button
                key={`${mi}-${ci}`}
                className={styles.item}
                onClick={() => onSelect(combo)}
              >
                <div className={styles.itemImage}>
                  <Image
                    src={combo.imagePath || "/images/no-image-available.jpg"}
                    alt={combo.name}
                    fill
                  />
                </div>

                <div className={styles.itemText}>
                  <div className={styles.itemTitle}>
                    {combo.name}
                  </div>
                  <div className={styles.itemDesc}>
                    Promo Merchandise Opening
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* SKIP */}
        <button className={styles.skipBtn} onClick={onSkip}>
          Lewati
        </button>
      </div>
    </>
  );
}