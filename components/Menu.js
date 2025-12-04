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
import { parseComboToMenuItem } from "../lib/combos"; // <-- NEW: parser combos (buat file utils/combos.js)

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
  const [comboItems, setComboItems] = useState([]); 
  const [activeCategory, setActiveCategory] = useState(null);
  const [queryText, setQueryText] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [showBackTop, setShowBackTop] = useState(false);
  const [showFullMenu, setShowFullMenu] = useState(false);
  // filterForCategory now stores menuCategoryId (numeric) when opening filter from a category's Filter button
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
          items: itemsFromPayload
        };
      });
      
    let merged = [...mapped];

    // only merge when comboItems has data
    if (Array.isArray(comboItems) && comboItems.length > 0) {
      const lowerNames = merged.map(c => String(c.name || '').toLowerCase());
      const kidIdx = lowerNames.findIndex(n => n.includes('kids') || n.includes('kids meal') || n.includes('anak'));

      if (kidIdx >= 0) {
        // append combos to existing kids category items (preserve existing items)
        const existing = merged[kidIdx];
        const existingItems = Array.isArray(existing.items) ? existing.items : [];
        merged[kidIdx] = {
          ...existing,
          items: [...existingItems, ...comboItems],
          totalItems: (existing.totalItems || existingItems.length) + comboItems.length
        };
      } else {
        // append new category at end
        merged = [
          ...merged,
          { id: `combo-kids`, name: 'Kids Meal', items: comboItems, totalItems: comboItems.length }
        ];
      }
    }

    setCategories(merged);
  }, [catData, catError, comboItems]);

  // ---- NEW: fetch combos and merge under "Kids Meal" ----
  useEffect(() => {
    async function loadCombos() {
      try {
        const url = `/api/proxy/combo-list?orderCategoryCode=DI&storeCode=MGI`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const raw = Array.isArray(j?.data) ? j.data : (Array.isArray(j?.items) ? j.items : []);
        if (!raw || raw.length === 0) {
          setComboItems([]);
          return;
        }

        const combos = raw.map(parseComboToMenuItem);
        // simpan combos terpisah — jangan langsung overwrite categories
        setComboItems(combos);
      } catch (e) {
        console.warn('loadCombos failed', e);
        setComboItems([]); // safe fallback
      }
    }

    loadCombos();
  }, []);

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
        (it.name || '').toLowerCase().includes(queryText.toLowerCase())
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
        const savedView = sessionStorage.getItem('menu_viewmode');

        if (savedView && (savedView === 'list' || savedView === 'grid')) {
          setViewMode(savedView);
          sessionStorage.removeItem('menu_viewmode');
        }

        if (last) {
          const el = document.getElementById(`menu-item-${last}`);
          if (el) {
            const headerH = document.querySelector("header")?.offsetHeight || 0;
            const tabsH = 56;
            const top = window.scrollY + el.getBoundingClientRect().top - (headerH + tabsH + 8);
            window.scrollTo({ top, behavior: "auto" });
            try { el.scrollIntoView({ block: 'center' }); } catch(e) {}
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
              <div style={{ height: 12, width: "30%", borderRadius: 4, background: "linear-gradient(90deg,#eee 25%, #fafafa 50%, #eee 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.2s infinite" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Intersection observer to lazy-load items for categories
  useEffect(() => {
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

  return (
    <div>
      <Header />

      <MenuTabs
        selected={activeCategory}
        onSelect={(c) => { setActiveCategory(c); scrollToCategory(c); }}
        isHidden={false}
        // restore previous behavior: reset filterForCategory when opening full menu
        onOpenFullMenu={() => {
          setFilterForCategory(null);
          setShowFullMenu(true);
        }}
        items={categories.map(c => c.name)}
      />

      <div style={{ padding: 12 }}>
        <SearchBar
          onSearch={handleSearch}
          onSearchChange={setQueryText}
          onToggleView={(v) => {
            setViewMode(v);
            sessionStorage.setItem('menu_viewmode', v);
          }}
          isSearching={queryText.length > 0}
        />
      </div>

      {filteredCategories.length === 0 ? (
        <div style={{ padding: 16 }}>Tidak ada item.</div>
      ) : (
        <div style={{ padding: 12 }}>
          {filteredCategories.map((cat) => {
            // determine if filter button should be disabled:
            // disable when cat.id is falsy OR not numeric (we treat combo-kids string as non-numeric)
            const catIdStr = String(cat.id ?? "");
            const filterDisabled = !cat.id || catIdStr.startsWith('combo-') || isNaN(Number(cat.id));

            return (
              <div key={cat.name} data-cat={cat.name} ref={el => (sectionRefs.current[cat.name] = el)} style={{ marginBottom: 18 }}>
                <div style={categoryHeaderContainerStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{cat.name}</h2>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {(viewMode === "list") ? `(${cat.totalItems ?? (cat.items ? cat.items.length : 0)} items)` : null}
                    </div>
                  </div>

                  <div>
                    {/* RESTORED FILTER BUTTON (disabled for kids/combo categories without numeric id) */}
                    <button
                      onClick={() => {
                        if (filterDisabled) return;
                        setFilterForCategory(cat.id);
                        setShowFullMenu(true);
                      }}
                      disabled={filterDisabled}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        height: 32,
                        borderRadius: 6,
                        background: filterDisabled ? '#f3f4f6' : '#fff',
                        border: filterDisabled ? '0.5px solid rgba(0,0,0,0.06)' : '0.5px solid rgba(252,102,26,0.5)',
                        color: filterDisabled ? '#9ca3af' : '#FC661A',
                        cursor: filterDisabled ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: 12,
                        pointerEvents: filterDisabled ? 'none' : 'auto'
                      }}
                    >
                      Filter
                      <img src="/images/filter.png" width={12} height={12} alt="filter" />
                    </button>
                  </div>
                </div>

                {cat.items == null ? (
                  renderCategorySkeleton()
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
            )
          })}
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
          // jangan reset setFilterForCategory di onClose
        }}
        onSelect={(catName) => {
          setShowFullMenu(false)
          setTimeout(()=>scrollToCategory(catName), 120)
        }}
        // NEW: ketika user memilih opsi filter di FullMenu, update button aktif segera
        onFilterChange={(menuCategoryId) => {
          // menuCategoryId: numeric id of selected category in FullMenu
          setFilterForCategory(menuCategoryId)
        }}
        onApplyFilter={async (menuCategoryId, filters) => {
          try {
            setShowFullMenu(false)
            // Simpan pilihan sebagai aktif agar button tetap pada pilihan itu
            if (menuCategoryId) setFilterForCategory(menuCategoryId)

            if (!menuCategoryId) {
              console.warn('applyFilter: missing menuCategoryId', menuCategoryId)
              return
            }

            const menuFilterIds = (filters && filters.menuFilterIds) ? String(filters.menuFilterIds) : ''

            const qs = new URLSearchParams()
            qs.set('menuCategoryId', menuCategoryId)
            if (menuFilterIds) qs.set('menuFilterIds', menuFilterIds)
            qs.set('orderCategoryCode', 'DI')
            qs.set('storeCode', 'MGI')

            const url = `/api/proxy/menu-list?${qs.toString()}`
            const r = await fetch(url)
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            const j = await r.json()

            const rawItems = Array.isArray(j?.data) ? j.data : []
            const mappedItems = rawItems.map(it => ({
              id: it.code ?? it.id,
              name: it.name,
              price: it.price,
              image: it.imagePath ?? it.imageUrl ?? "/images/gambar-menu.jpg",
              category: categories.find(c => String(c.id) === String(menuCategoryId))?.name ?? ''
            }))

            setCategories(prev => prev.map(c => {
              if (String(c.id) === String(menuCategoryId)) {
                return { ...c, items: mappedItems };
              }
              return c;
            }));
          } catch (err) {
            console.error('apply filter failed', err)
          }
        }}
      />

      <OrderBar />
    </div>
  );
}
