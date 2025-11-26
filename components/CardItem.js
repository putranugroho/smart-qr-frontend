// components/CardItem.js
import Image from "next/image";
import styles from "../styles/CardItem.module.css";
import { useRouter } from "next/router";

function formatRp(n) {
  if (n == null) return "-";
  return "Rp" + new Intl.NumberFormat("id-ID").format(Number(n || 0));
}

export default function CardItem({ item, onAdd, mode = "grid" }) {
  const router = useRouter();
  const imgSrc = item.image ?? "/images/gambar-menu.jpg";
  const name = item.name || item.itemName || item.title || "";

  function handleClick() {
    const productCode = item.id;
    const q = {};
    if (item.name) q.title = item.name;
    if (item.description) q.description = item.description;
    if (item.price != null) q.price = item.price;
    if (imgSrc) q.image = imgSrc;

    const search = new URLSearchParams(q).toString();
    router.push(`/item/${encodeURIComponent(productCode)}${search ? `?${search}` : ""}`);
  }

  if (mode === "list") {
    return (
      <div className={styles.listCard} onClick={handleClick}>
        <Image src={imgSrc} alt={name} width={90} height={72} className={styles.listImage} />
        <div className={styles.listLeft}>
          <div className={styles.listTitle}>{name}</div>
          <div className={styles.listSpacer} />
          <div className={styles.listPrice}>{formatRp(item.price)}</div>
        </div>
        <div className={styles.listRight}>
          <div className={styles.listSpacer} />
          <button
            className={styles.listAddBtn}
            onClick={(e) => {
              e.stopPropagation();
              onAdd?.(item);
            }}
          >
            Tambah
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card} onClick={handleClick}>
      <div className={styles.cardImage}>
        <Image
          src={imgSrc}
          alt={name}
          width={167}
          height={167}
          // fill
          className={styles.cardImageTag}
        />
      </div>


      <div className={styles.cardBody}>
        <div className={styles.cardPrice}>{formatRp(item.price)}</div>
        <div className={styles.cardTitle}>{name}</div>
      </div>

      <div className={styles.cardFooter}>
        <button
          className={styles.cardAddBtn}
        >
          Tambah
        </button>
      </div>
    </div>
  );
}
