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
  // item may have `categoryId` or `category` name; we prefer numeric id if available
  const categoryId = item.categoryId ?? item.categoryIdRaw ?? item.menuCategoryId ?? null
  const categoryName = item.category ?? null

  function handleClick() {
    try {
      sessionStorage.setItem('menu_scroll', String(window.scrollY || 0));
      sessionStorage.setItem('last_item', String(item.id));
      sessionStorage.setItem('menu_viewmode', String(mode));
    } catch (e) {
      console.warn('sessionStorage save failed', e);
    }

    // If item is a combo (has comboGroups) -> open ComboDetail
    const isCombo = Array.isArray(item.comboGroups) && item.comboGroups.length > 0;
    if (isCombo) {
      try {
        // Save combo object to sessionStorage to avoid very long querystring
        const key = `combo_${item.id}`;
        sessionStorage.setItem(key, JSON.stringify(item));
        // navigate to combo-detail and pass comboId (ComboDetail page will read sessionStorage)
        router.push(`/combo-detail?comboId=${encodeURIComponent(String(item.id))}`);
        return;
      } catch (e) {
        console.warn('failed to navigate to combo detail via sessionStorage, falling back to query', e);
        // fallback: send full combo as query (may be long)
        const productCode = item.id;
        const q = {};
        if (item.name) q.title = item.name;
        if (item.description) q.description = item.description;
        if (item.price != null) q.price = item.price;
        if (imgSrc) q.image = imgSrc;
        if (categoryId) q.categoryId = categoryId;
        else if (categoryName) q.category = categoryName;
        q.combo = JSON.stringify(item);
        const search = new URLSearchParams(q).toString();
        router.push(`/combo-detail${search ? `?${search}` : ""}`);
        return;
      }
    }

    // Non-combo: existing item detail route
    const productCode = item.id;
    const q = {};
    if (item.name) q.title = item.name;
    if (item.description) q.description = item.description;
    if (item.price != null) q.price = item.price;
    if (imgSrc) q.image = imgSrc;
    if (categoryId) q.categoryId = categoryId;
    else if (categoryName) q.category = categoryName;

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
          width={110}
          height={73}
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
