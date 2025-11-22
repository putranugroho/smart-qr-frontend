// components/Menu.js
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Header from "./Header";
import MenuTabs from "./MenuTabs";
import SearchBar from "./SearchBar";
import CardItem from "./CardItem";
import OrderBar from "./OrderBar";

export default function Menu() {
  const router = useRouter();
  const { mode } = router.query;

  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [queryText, setQueryText] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [loading, setLoading] = useState(true);
  const [showBackTop, setShowBackTop] = useState(false);

  const sectionRefs = useRef({});

  // Fetch categories
  useEffect(() => {
    const API_URL =
      "/api/proxy/menu-category?storeCode=SMS&orderCategoryCode=DI";

    setLoading(true);

    fetch(API_URL)
      .then((r) => r.json())
      .then((json) => {
        const raw = Array.isArray(json?.data) ? json.data : [];
        const available = raw.filter((c) => Number(c.totalItems) > 0);

        const mapped = available.map((c) => ({
          id: c.id,
          name: c.name,
          items:
            c.items?.map((it) => ({
              id: it.code,
              name: it.name,
              price: it.price,
              image: it.imageUrl ?? "/images/gambar-menu.jpg",
              category: c.name,
            })) ?? [],
        }));

        setCategories(mapped);
        const target = mapped[0]?.name;
        setActiveCategory(target);

        setTimeout(() => scrollToCategory(target), 200);
      })
      .finally(() => setTimeout(() => setLoading(false), 500));
  }, []);

  // Scroll to category
  function scrollToCategory(cat) {
    const el = sectionRefs.current[cat];
    if (!el) return;

    const headerH = document.querySelector("header")?.offsetHeight || 0;
    const tabsH = queryText.length === 0 ? 56 : 0;

    const top =
      window.scrollY +
      el.getBoundingClientRect().top -
      (headerH + tabsH + 8);

    window.scrollTo({ top, behavior: "smooth" });
    setActiveCategory(cat);
  }

  // Handle search
  function handleSearch(text) {
    setQueryText(text);
    // saat search aktif → pindahkan tampilan ke paling atas
    if (text.length > 0) {
      const headerH = document.querySelector("header")?.offsetHeight || 0;
      window.scrollTo({ top: headerH, behavior: "smooth" });
    }
  }

  // Back to top visibility
  useEffect(() => {
    const onScroll = () => {
      setShowBackTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scrollspy
  useEffect(() => {
    if (queryText.length > 0) return; // disable scrollspy saat searching

    let ticking = false;
    function handleScroll() {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const headerH = document.querySelector("header")?.offsetHeight || 0;
          const tabsH = 56;

          const scrollPos = window.scrollY + headerH + tabsH + 40;

          let closest = null;
          let closestOffset = Infinity;

          categories.forEach((c) => {
            const el = sectionRefs.current[c.name];
            if (!el) return;

            const offset = Math.abs(el.offsetTop - scrollPos);
            if (offset < closestOffset) {
              closestOffset = offset;
              closest = c.name;
            }
          });

          if (closest && closest !== activeCategory) {
            setActiveCategory(closest);
          }

          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [categories, activeCategory, queryText]);

  // Filter items
  const filteredCategories = categories
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((it) =>
        it.name.toLowerCase().includes(queryText.toLowerCase())
      ),
    }))
    .filter((cat) => cat.items.length > 0);

  return (
    <div className="bg-white min-h-screen">
      <Header />

      {/* MenuTabs tampil hanya jika query kosong */}
      <MenuTabs
        selected={activeCategory}
        onSelect={scrollToCategory}
        isHidden={queryText.length > 0}
      />

      <SearchBar
        onSearch={handleSearch}
        onSearchChange={handleSearch}
        onToggleView={setViewMode}
        isSearching={queryText.length > 0}
      />

      {/* Loading shimmer */}
      {loading && (
        <div style={{ padding: "0 16px", marginTop: 20 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 8,
                  background:
                    "linear-gradient(90deg,#eeeeee 25%, #f5f5f5 50%, #eeeeee 75%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.2s infinite",
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    height: 16,
                    width: "70%",
                    borderRadius: 4,
                    marginBottom: 8,
                    background:
                      "linear-gradient(90deg,#e9e9e9 25%, #f7f7f7 50%, #e9e9e9 75%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.2s infinite",
                  }}
                />
                <div
                  style={{
                    height: 14,
                    width: "40%",
                    borderRadius: 4,
                    background:
                      "linear-gradient(90deg,#e9e9e9 25%, #f7f7f7 50%, #e9e9e9 75%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.2s infinite",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Items */}
      {!loading && (
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 16px 24px" }}>
          {filteredCategories.map((cat) => (
            <div
              key={cat.id}
              data-cat={cat.name}
              ref={(el) => (sectionRefs.current[cat.name] = el)}
              style={{ marginTop: 32 }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
                {cat.name}
              </h2>

              {viewMode === "list" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {cat.items.map((it) => (
                    <CardItem key={it.id} item={it} mode="list" />
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  {cat.items.map((it) => (
                    <CardItem key={it.id} item={it} mode="grid" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Back to Top */}
      {showBackTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{
            position: "fixed",
            right: 20,
            bottom: 90,
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "#000",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.95,
            zIndex: 999,
            boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
            transition: "all 0.25s ease",
          }}
        >
          ↑
        </button>
      )}

      <div style={{ height: 60 }} />
      <OrderBar />
    </div>
  );
}
