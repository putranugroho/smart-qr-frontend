// components/Menu.js
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import { getUser } from '../lib/auth'
import Header from "./Header";
import MenuTabs from "./MenuTabs";
import SearchBar from "./SearchBar";
import CardItem from "./CardItem";
import OrderBar from "./OrderBar";
import FullMenu from "./FullMenu";

const fetcher = (url) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});

/**
 * Lazy-loading Menu with SWR caching + scroll restore
 */
export default function Menu() {
  const router = useRouter();
  const { mode } = router.query;

  const [categories, setCategories] = useState([]); // each: { id, name, items: null|[] , totalItems }
  const [activeCategory, setActiveCategory] = useState(null);
  const [queryText, setQueryText] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [showBackTop, setShowBackTop] = useState(false);
  const [showFullMenu, setShowFullMenu] = useState(false);
  const [filterForCategory, setFilterForCategory] = useState(null);

  // New: order bar state (eat-in / takeaway).
  const [orderMode, setOrderMode] = useState({
    type: "",
    location: ""
  });

  const sectionRefs = useRef({});
  const observerRef = useRef(null);
  const loadingItemsRef = useRef({}); // guard per-category loading

  // SWR: fetch categories meta once and cache it
  const categoriesApi = "/api/proxy/menu-category?storeCode=MGI&orderCategoryCode=DI";
  const { data: catData, error: catError } = useSWR(categoriesApi, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60 * 1000
  });

  // setCategories when swr data ready
  useEffect(() => {
    if (!catData || !Array.isArray(catData.data)) {
      if (catError) console.error('Failed fetch categories', catError);
      return;
    }

    const raw = Array.isArray(catData?.data) ? catData.data : [];

    // Build initial categories meta; keep items if present in payload otherwise null
    const mapped = raw
      .filter((c) => Number(c.totalItems ?? (c.items?.length ?? 0)) > 0)
      .map((c) => {
        const name = c.name || `Category ${String(c.id || '')}`;
        const itemsFromPayload = Array.isArray(c.items) && c.items.length > 0
          ? c.items.map(it => ({
            id: it.code ?? it.id,
            name: it.name,
            price: it.price,
            image: it.imagePath ?? it.imageUrl ?? "/images/gambar-menu.jpg",
            category: name
          }))
          : null; // do not eagerly load items if not provided
        return {
          id: c.id,
          name,
          totalItems: Number(c.totalItems ?? (itemsFromPayload ? itemsFromPayload.length : 0)),
          items: itemsFromPayload // null -> will lazy load later
        };
      });

    setCategories(mapped);
    const target = mapped[0]?.name;
    setActiveCategory(target);
    setTimeout(() => setLoadingLocal(false), 180);
  }, [catData, catError]);

  // read user
  useEffect(() => {
    try {
      const user = getUser?.() || null;
      if (user) {
        const formatted = {
          type: user.orderType === "DI" ? (user.tableNumber || "Table 24") : "Takeaway",
          location: user.storeLocationName || user.location || "Yoshinoya - Mall Grand Indonesia"
        };
        setOrderMode(formatted);
      } else {
        setOrderMode({
          type: "",
          location: ""
        });
      }
    } catch (e) {
      console.warn('getUser failed', e);
    }
  }, []);

  // IntersectionObserver: when category section enters viewport -> fetch items for that category
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('IntersectionObserver' in window)) return;

    // cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const catName = entry.target.datasetCat || entry.target.getAttribute('data-cat');
          if (!catName) return;
          const catObj = categories.find(c => c.name === catName);
          if (!catObj) return;

          if (catObj.items == null && !loadingItemsRef.current[String(catObj.id)]) {
            loadingItemsRef.current[String(catObj.id)] = true;
            fetchItemsForCategory(catObj.id, catObj.name)
              .finally(() => {
                setTimeout(() => {
                  loadingItemsRef.current[String(catObj.id)] = false;
                }, 300);
              });
          }
        }
      });
    }, {
      root: null,
      rootMargin: '0px 0px 260px 0px',
      threshold: 0.01
    });

    Object.values(sectionRefs.current).forEach((el) => {
      if (el && observerRef.current) {
        if (!el.datasetCat && el.getAttribute('data-cat')) {
          el.datasetCat = el.getAttribute('data-cat');
        }
        observerRef.current.observe(el);
      }
    });

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [categories]);

  // fetch items for a single category (lazy)
  function fetchItemsForCategory(categoryId, categoryName) {
    const url = `/api/proxy/menu-items?categoryId=${encodeURIComponent(categoryId)}&storeCode=MGI&orderCategoryCode=DI`;

    return fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(json => {
        const rawItems = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.items) ? json.items : []);
        const mappedItems = rawItems.map(it => ({
          id: it.code ?? it.id,
          name: it.name,
          price: it.price,
          image: it.imagePath ?? it.imageUrl ?? "/images/gambar-menu.jpg",
          category: categoryName
        }));

        setCategories(prev => prev.map(c => {
          if (String(c.id) === String(categoryId) || c.name === categoryName) {
            return { ...c, items: mappedItems };
          }
          return c;
        }));
      })
      .catch(err => {
        console.warn('fetchItemsForCategory failed', err);
        // fallback try category endpoint
        const fallback = `/api/proxy/menu-category?storeCode=MGI&orderCategoryCode=DI&categoryId=${encodeURIComponent(categoryId)}`;
        return fetch(fallback)
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .then(json => {
            const product = Array.isArray(json?.data) && json.data.length > 0 ? json.data[0] : null;
            const rawItems = product?.items ?? [];
            const mappedItems = (Array.isArray(rawItems) ? rawItems : []).map(it => ({
              id: it.code ?? it.id,
              name: it.name,
              price: it.price,
              image: it.imagePath ?? it.imageUrl ?? "/images/gambar-menu.jpg",
              category: categoryName
            }));
            setCategories(prev => prev.map(c => {
              if (String(c.id) === String(categoryId) || c.name === categoryName) {
                return { ...c, items: mappedItems };
              }
              return c;
            }));
          })
          .catch(e => {
            setCategories(prev => prev.map(c => {
              if (String(c.id) === String(categoryId) || c.name === categoryName) {
                return { ...c, items: [] };
              }
              return c;
            }));
          });
      });
  }

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

    const cObj = categories.find(c => c.name === cat);
    if (cObj && cObj.items == null && !loadingItemsRef.current[String(cObj.id)]) {
      loadingItemsRef.current[String(cObj.id)] = true;
      fetchItemsForCategory(cObj.id, cObj.name).finally(() => {
        setTimeout(() => { loadingItemsRef.current[String(cObj.id)] = false; }, 300);
      });
    }
  }

  // Handle search
  function handleSearch(text) {
    setQueryText(text);
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

  // Scrollspy (only when not searching)
  useEffect(() => {
    if (queryText.length > 0) return;

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

  // Filter items for rendering (search-friendly)
  const filteredCategories = categories
    .map((cat) => ({
      ...cat,
      items: (cat.items ?? []).filter((it) =>
        it.name.toLowerCase().includes(queryText.toLowerCase())
      )
    }))
    .filter((cat) => {
      if (queryText.length > 0) {
        return cat.items && cat.items.length > 0;
      }
      return (cat.items == null) ? true : cat.items.length > 0;
    });

  // Restore scroll & highlight last item when returning from ItemDetail
  useEffect(() => {
    // run after small delay so DOM sections mount / observer runs and items may be loaded by intersection observer
    const t = setTimeout(() => {
      try {
        const last = sessionStorage.getItem('last_item');
        const scroll = sessionStorage.getItem('menu_scroll');
        if (last) {
          // try to find element by id
          const el = document.getElementById(`menu-item-${last}`);
          if (el) {
            // scroll so item is centered under header/tabs
            const headerH = document.querySelector("header")?.offsetHeight || 0;
            const tabsH = 56;
            const top = window.scrollY + el.getBoundingClientRect().top - (headerH + tabsH + 8);
            window.scrollTo({ top, behavior: "auto" });
            // also bring the element into view (fallback)
            try { el.scrollIntoView({ block: 'center' }); } catch(e) {}
            // clear last_item after restore
            sessionStorage.removeItem('last_item');
            sessionStorage.removeItem('menu_scroll');
            return;
          }
        }
        if (scroll) {
          window.scrollTo({ top: Number(scroll || 0), behavior: "auto" });
          sessionStorage.removeItem('menu_scroll');
        }
      } catch (e) {
        // ignore
      }
    }, 260);

    return () => clearTimeout(t);
  }, [categories]);

  const categoryHeaderContainerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  };

  function renderCategorySkeleton() {
    return (
      <div>
        {[1,2].map(i => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{
              width: viewMode === "grid" ? 140/2 : 72,
              height: viewMode === "grid" ? 120 : 72,
              borderRadius: 8,
              background: "linear-gradient(90deg,#eeeeee 25%, #f5f5f5 50%, #eeeeee 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.2s infinite"
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 16, width: "60%", borderRadius: 4, marginBottom: 8, background: "linear-gradient(90deg,#e9e9e9 25%, #f7f7f7 50%, #e9e9e9 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.2s infinite" }} />
              <div style={{ height: 12, width: "40%", borderRadius: 4, background: "linear-gradient(90deg,#e9e9e9 25%, #f7f7f7 50%, #e9e9e9 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.2s infinite" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          role="button"
          onClick={() => {}}
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
            {orderMode?.type !== "Takeaway" && (
              <img
                src="/images/chair-icon.png"
                alt="table"
                width={14}
                height={14}
                style={{ display: 'block' }}
              />
            )}

            <div style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'baseline', lineHeight: 1 }}>
              <div style={{ fontFamily: 'Inter, system-ui', fontWeight: 600, fontSize: 12 }}>
                {orderMode?.type || ''}
              </div>

              <div style={{ fontFamily: 'Inter, system-ui', fontWeight: 400, fontSize: 12, opacity: 0.95 }}>
                {orderMode?.location ? `• ${orderMode.location}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 8 }}>
            <img src="/images/caret-down-white.png" alt="" width={16} height={16} style={{ display: 'block' }} />
          </div>
        </div>
      </div>

      <Header />

      {/* pass category names into MenuTabs so MenuTabs doesn't fetch separately */}
      <MenuTabs
        selected={activeCategory}
        onSelect={scrollToCategory}
        isHidden={queryText.length > 0}
        onOpenFullMenu={() => {
          setFilterForCategory(null)
          setShowFullMenu(true)
        }}
        items={categories.map(c => c.name)}
      />

      <SearchBar
        onSearch={handleSearch}
        onSearchChange={handleSearch}
        onToggleView={(v) => setViewMode(v)}
        isSearching={queryText.length > 0}
      />

      {loadingLocal && (
        <div style={{ padding: "0 16px", marginTop: 20 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 72,
                height: 72,
                borderRadius: 8,
                background:
                  "linear-gradient(90deg,#eeeeee 25%, #f5f5f5 50%, #eeeeee 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.2s infinite",
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 16, width: "70%", borderRadius: 4, marginBottom: 8, background:
                    "linear-gradient(90deg,#e9e9e9 25%, #f7f7f7 50%, #e9e9e9 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.2s infinite" }} />
                <div style={{ height: 14, width: "40%", borderRadius: 4, background:
                    "linear-gradient(90deg,#e9e9e9 25%, #f7f7f7 50%, #e9e9e9 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.2s infinite" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loadingLocal && (
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 5px 24px" }}>
          {filteredCategories.map((cat) => (
            <div
              key={cat.id}
              data-cat={cat.name}
              ref={(el) => (sectionRefs.current[cat.name] = el)}
              style={{ marginTop: 18 }}
            >
              <div style={categoryHeaderContainerStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, textTransform: "none", ...(viewMode === "grid" ? { fontSize: 16 } : {}) }}>
                    {cat.name}
                  </h2>

                  {viewMode === "list" && (
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      ({cat.totalItems ?? (cat.items ? cat.items.length : 0)} items)
                    </div>
                  )}
                </div>

                <div>
                  <button
                    onClick={() => {
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

              {cat.items == null ? (
                renderCategorySkeleton()
              ) : cat.items.length === 0 ? (
                <div style={{ padding: 12, color: '#6b7280' }}>Tidak ada item</div>
              ) : viewMode === "list" ? (
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
      <FullMenu
        open={showFullMenu}
        categories={categories.map(c => c.name)}
        currentCategory={activeCategory}
        filterForCategory={filterForCategory}
        onClose={() => {
          setShowFullMenu(false)
          setFilterForCategory(null)
        }}
        onSelect={(catName) => {
          setShowFullMenu(false)
          setFilterForCategory(null)
          setTimeout(()=>scrollToCategory(catName), 120)
        }}
        onApplyFilter={(cat, filters) => {
          setShowFullMenu(false)
          setFilterForCategory(null)
        }}
      />

      <OrderBar />
    </div>
  );
}
