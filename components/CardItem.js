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
  const category = item.category || item.categoryName || null; // may be passed from Menu as cat.name

  function saveUIState() {
    try {
      sessionStorage.setItem('menu_scroll', String(window.scrollY || 0));
      sessionStorage.setItem('last_item', String(item.id));
      sessionStorage.setItem('menu_viewmode', String(mode));
      // also store last category viewed so FullMenu / restore logic can use it
      if (category) sessionStorage.setItem('last_category', String(category));
    } catch (e) {
      console.warn('sessionStorage save failed', e);
    }
  }

  function handleClick() {
    saveUIState();

    const productCode = item.id;
    const q = {};
    if (item.name) q.title = item.name;
    if (item.description) q.description = item.description;
    if (item.price != null) q.price = item.price;
    if (imgSrc) q.image = imgSrc;
    if (category) q.category = category; // include category in query so detail knows which category came from

    const search = new URLSearchParams(q).toString();
    router.push(`/item/${encodeURIComponent(productCode)}${search ? `?${search}` : ""}`);
  }

  if (mode === "list") {
    return (
      <div id={`menu-item-${item.id}`} className={styles.listCard} onClick={handleClick}>
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
              // prevent parent click from firing twice
              e.stopPropagation();
              // optionally call external onAdd handler if provided
              if (typeof onAdd === 'function') onAdd(item);
              // still navigate to detail so user chooses condiments (if you want Add inline, modify)
              handleClick();
            }}
          >
            Tambah
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id={`menu-item-${item.id}`} className={styles.card} onClick={handleClick}>
      <div className={styles.cardImage}>
        <Image
          src={imgSrc}
          alt={name}
          width={167}
          height={167}
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
          onClick={(e) => {
            e.stopPropagation();
            if (typeof onAdd === 'function') onAdd(item);
            // navigate to detail to enable options selection
            saveUIState();
            router.push(`/item/${encodeURIComponent(item.id)}?${new URLSearchParams({ title: item.name || '', price: item.price || '', image: imgSrc, category: category || '' }).toString()}`);
          }}
        >
          Tambah
        </button>
      </div>
    </div>
  );
}
