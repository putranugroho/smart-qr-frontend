// components/Menu.js
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { getUser } from '../lib/auth'
import Header from "./Header";
import MenuTabs from "./MenuTabs";
import SearchBar from "./SearchBar";
import CardItem from "./CardItem";
import OrderBar from "./OrderBar";
import FullMenu from "./FullMenu";

export default function Menu() {
  const router = useRouter();
  const { mode } = router.query;

  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [queryText, setQueryText] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'
  const [loading, setLoading] = useState(true);
  const [showBackTop, setShowBackTop] = useState(false);
  const [showFullMenu, setShowFullMenu] = useState(false);
  const [filterForCategory, setFilterForCategory] = useState(null);

  // New: order bar state (eat-in / takeaway).
  // default safe shape so render never fails
  const [orderMode, setOrderMode] = useState({
    type: "",
    location: ""
  });

  const sectionRefs = useRef({});

  // Fetch categories and init orderMode from user
  useEffect(() => {
    // safely read user
    try {
      const user = getUser?.() || null;
      if (user) {
        const formatted = {
          // if orderType DI (dine-in) prefer tableNumber if present
          type: user.orderType === "DI" ? (user.tableNumber || "TBL 24") : "Takeaway",
          // you can derive/store location in user; fallback to default string
          location: user.storeLocationName || user.location || "Yoshinoya - Mall Grand Indonesia"
        };
        setOrderMode(formatted);
      } else {
        // keep defaults or set a placeholder if you prefer
        setOrderMode({
          type: "",
          location: ""
        });
      }
    } catch (e) {
      console.warn('getUser failed', e);
    }

    // fetch categories
    const API_URL = "/api/proxy/menu-category?storeCode=SMS&orderCategoryCode=DI";

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
              image: it.imagePath ?? it.imageUrl ?? "/images/gambar-menu.jpg",
              category: c.name,
            })) ?? [],
        }));

        setCategories(mapped);
        const target = mapped[0]?.name;
        setActiveCategory(target);

        // small delay to allow DOM measuring
        setTimeout(() => scrollToCategory(target), 200);
      })
      .catch((e) => {
        console.error('Failed fetch categories', e);
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

  // Styles for category header (ke-2 mode)
  const categoryHeaderContainerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  };

  return (
    <div className="bg-white min-h-screen">
      {/* Top status bar (eat-in / takeaway indicator) */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          role="button"
          onClick={() => {
            // optional future action
          }}
          style={{
            width: '100%',
            maxWidth: 390,
            height: 32,
            padding: '4px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            boxSizing: 'border-box',
            background:
              orderMode?.type === "Takeaway"
                ? 'linear-gradient(90.35deg, #EB4646 17.45%, #FF8686 116.56%)'
                : 'linear-gradient(90.35deg, #0061FF 17.45%, #5193FF 116.56%)',
            color: '#ffffff',
            borderBottom: '1px solid rgba(0,0,0,0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            
            {/* Icon chair hanya muncul jika dine-in */}
            {orderMode?.type !== "Takeaway" && (
              <img
                src="/images/chair-icon.png"
                alt="table"
                width={14}
                height={14}
                style={{ display: 'block' }}
              />
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 8,
                alignItems: 'baseline',
                lineHeight: 1
              }}
            >
              <div
                style={{
                  fontFamily: 'Inter, system-ui',
                  fontWeight: 600,
                  fontSize: 12
                }}
              >
                {orderMode?.type || ''}
              </div>

              <div
                style={{
                  fontFamily: 'Inter, system-ui',
                  fontWeight: 400,
                  fontSize: 12,
                  opacity: 0.95
                }}
              >
                {orderMode?.location ? `• ${orderMode.location}` : ''}
              </div>
            </div>
          </div>

          {/* right arrow icon */}
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 8 }}>
            <img
              src="/images/caret-down-white.png"
              alt=""
              width={16}
              height={16}
              style={{ display: 'block' }}
            />
          </div>
        </div>
      </div>


      <Header />

      {/* MenuTabs tampil hanya jika query kosong */}
      <MenuTabs
        selected={activeCategory}
        onSelect={scrollToCategory}
        isHidden={queryText.length > 0}
        // when opening full menu from MenuTabs, ensure filterForCategory is cleared
        onOpenFullMenu={() => {
          setFilterForCategory(null)
          setShowFullMenu(true)
        }}
      />

      <SearchBar
        onSearch={handleSearch}
        onSearchChange={handleSearch}
        onToggleView={(v) => setViewMode(v)}
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
              {/* Header: title + filter button (responsive for grid/list) */}
              <div style={categoryHeaderContainerStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <h2
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      margin: 0,
                      textTransform: "none",
                      ...(viewMode === "grid" ? { fontSize: 16 } : {}),
                    }}
                  >
                    {cat.name}
                  </h2>

                  {viewMode === "list" && (
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      ({cat.items.length} items)
                    </div>
                  )}
                </div>

                {/* Filter button */}
                <div>
                  <button
                    onClick={() => {
                      // set target filter category first, then open sheet
                      setFilterForCategory(cat.name)
                      setShowFullMenu(true)
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      height: 32,
                      borderRadius: 6,
                      background: '#fff',
                      border: '0.5px solid rgba(252,102,26,0.5)',
                      color: '#FC661A',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 12
                    }}
                  >
                    Filter
                    <img src="/images/filter.png" width={12} height={12} alt="filter" />
                  </button>
                </div>
              </div>

              {/* Items list/grid */}
              {viewMode === "list" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {cat.items.map((it) => (
                    <CardItem key={it.id} item={it} mode="list" />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 12,
                  }}
                >
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
      {/* Full Menu bottom sheet */}
      <FullMenu
        open={showFullMenu}
        categories={categories.map(c => c.name)}
        currentCategory={activeCategory}
        filterForCategory={filterForCategory} // optional; FullMenu will decide which view to show
        onClose={() => {
          setShowFullMenu(false)
          // clear intent for filtering so next open is pure category view
          setFilterForCategory(null)
        }}
        onSelect={(catName) => {
          // when user selects a category inside fullmenu, close and scroll to it
          setShowFullMenu(false)
          setFilterForCategory(null)
          setTimeout(()=>scrollToCategory(catName), 120)
        }}
        onApplyFilter={(cat, filters) => {
          console.log('applied filter for', cat, filters)
          setShowFullMenu(false)
          setFilterForCategory(null)
          // you can persist filters into state here for actual filtering logic later
        }}
      />

      <OrderBar />
    </div>
  );
}
