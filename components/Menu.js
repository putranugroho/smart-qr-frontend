// components/Menu.js
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Header from "./Header";
import MenuTabs from "./MenuTabs";
import SearchBar from "./SearchBar";
import CardItem from "./CardItem";

export default function Menu() {
  const router = useRouter();
  const { mode } = router.query;
  const [viewMode, setViewMode] = useState("grid");
  const [queryText, setQueryText] = useState("");
  const [activeCategory, setActiveCategory] = useState(null);

  const SAMPLE_ITEMS = [
    { id: 1, title: "Regular Paket Berbagi Beef Bowl", price: "144.545", image: "/images/gambar-menu.jpg", category: "Promo" },
    { id: 2, title: "Regular Paket Berbagi Beef + Garlic Chicken", price: "135.545", image: "/images/gambar-menu.jpg", category: "Promo" },
    { id: 3, title: "Ebi Fry + Japanese Curry Rice", price: "76.363", image: "/images/gambar-menu.jpg", category: "Japanese Curry" },
    { id: 4, title: "Premium Chicken Katsu + Japanese Curry Rice", price: "81.818", image: "/images/gambar-menu.jpg", category: "Japanese Curry" },
    { id: 5, title: "P. Puas Original Beef Bowl Reg", price: "76.181", image: "/images/gambar-menu.jpg", category: "Paket Puas" },
    { id: 6, title: "P. Puas Original Beef Bowl Large", price: "85.454", image: "/images/gambar-menu.jpg", category: "Paket Puas" },
    { id: 7, title: "Beef Bowl Special", price: "98.181", image: "/images/gambar-menu.jpg", category: "Beef Bowl" }
  ];

  const categories = [...new Set(SAMPLE_ITEMS.map((it) => it.category))];
  const sectionRefs = useRef({});

  useEffect(() => {
    const target = mode === "takeaway" ? "Paket Puas" : "Promo";
    setActiveCategory(target);
    setTimeout(() => scrollToCategory(target), 150);
  }, [mode]);

  function scrollToCategory(cat) {
    const el = sectionRefs.current[cat];
    if (!el) return;
    const headerH = document.querySelector("header")?.getBoundingClientRect().height || 0;
    const top = window.scrollY + el.getBoundingClientRect().top - headerH - 8;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveCategory(cat);
  }

  function handleSearch(q) {
    setQueryText(q);
    const headerH = document.querySelector("header")?.offsetHeight || 0;
    window.scrollTo({ top: headerH + 8, behavior: "smooth" });
  }

  useEffect(() => {
    const headerH = document.querySelector("header")?.getBoundingClientRect().height || 0;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) setActiveCategory(vis.target.getAttribute("data-cat"));
      },
      { root: null, rootMargin: `-${headerH + 8}px 0px -40% 0px`, threshold: 0.01 }
    );

    categories.forEach((cat) => sectionRefs.current[cat] && obs.observe(sectionRefs.current[cat]));
    return () => obs.disconnect();
  }, [categories]);

  const filteredItems = SAMPLE_ITEMS.filter((it) => it.title.toLowerCase().includes(queryText.toLowerCase()));

  return (
    <div className="bg-white">
      <Header />
      <MenuTabs selected={activeCategory} onSelect={scrollToCategory} />
      <SearchBar onSearch={handleSearch} onToggleView={setViewMode} />

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 16px 24px" }}>
        {categories.map((cat) => {
          const catItems = filteredItems.filter((it) => it.category === cat);
          if (!catItems.length) return null;

          return (
            <div key={cat} data-cat={cat} ref={(el) => (sectionRefs.current[cat] = el)} style={{ marginTop: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{cat}</h2>
              {viewMode === "grid" ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  {catItems.map((it) => (
                    <CardItem key={it.id} item={it} onAdd={() => alert(`Tambah ${it.title}`)} />
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {catItems.map((it) => (
                    <div key={it.id} style={{ display: "flex", gap: 12 }}>
                      <img src={it.image} style={{ width: 100, height: 100, borderRadius: 8, objectFit: "cover" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 300 }}>Rp{it.price}</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{it.title}</div>
                        <button style={{ marginTop: 8, padding: "8px 16px", borderRadius: 9999, background: "linear-gradient(90deg,#FF8040 0%,#FC661A 100%)", color: "#fff" }}>
                          Tambah
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ height: 60 }} />
    </div>
  );
}