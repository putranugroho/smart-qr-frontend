// Menu.js (updated with unique id & dedupe handling)
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
import { parseComboToMenuItem } from "../lib/combos";

const fetcher = (url) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});

/* -------------------------
   Helpers: uniq + unique id
   ------------------------- */
function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of (arr || [])) {
    try {
      const k = keyFn(item);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(item);
      }
    } catch (e) {
      // fallback: add if can't compute key
      out.push(item);
    }
  }
  return out;
}

function ensureUniqueIdForMenu(it, categoryId, idx = 0) {
  // prefer code/id, else name+price fallback
  const code = it.code ?? it.id ?? it.productCode ?? null;
  if (code) {
    return `${String(code)}`;
  }
  if (it.name) {
    return `${it.name.replace(/\s+/g, '_')}_${String(it.price ?? '')}`;
  }
  return `menu_${String(categoryId)}_unknown_${idx}`;
}

function ensureUniqueIdForCombo(combo) {
  const code = combo.id ?? combo.code ?? combo.comboId ?? combo.name;
  if (code) {
    return `combo_${String(code)}`;
  }
  if (combo.name) {
    return `combo_${combo.name.replace(/\s+/g, '_')}`;
  }
  return `combo_unknown_${Math.random().toString(36).slice(2, 9)}`;
}

/* -------------------------
   Component
   ------------------------- */
export default function Menu() {
  const router = useRouter();
  const { mode } = router.query;

  // categories: each { id, name, items: null|[] , totalItems, checked:boolean }
  const [categories, setCategories] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [queryText, setQueryText] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [showBackTop, setShowBackTop] = useState(false);
  const [showFullMenu, setShowFullMenu] = useState(false);
  const [filterForCategory, setFilterForCategory] = useState(null);
  const comboCacheRef = { current: null };
  const comboLoadingRef = { current: false };
  const [orderMode, setOrderMode] = useState({ type: "", location: "" });

  const sectionRefs = useRef({});
  const observerRef = useRef(null);
  const loadingItemsRef = useRef({});

  // SWR: fetch categories meta once and cache it
  const categoriesApi = `/api/proxy/menu-category?storeCode=${getUser().storeLocation}&orderCategoryCode=${getUser().orderType}`;
  const { data: catData, error: catError } = useSWR(categoriesApi, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60 * 1000
  });

  // map raw categories -> initial categories state
  useEffect(() => {
    if (!catData || !Array.isArray(catData.data)) {
      if (catError) console.error('Failed fetch categories', catError);
      return;
    }

    const raw = Array.isArray(catData?.data) ? catData.data : [];

    // Build initial categories: items set to null (meaning: belum dicek)
    const mapped = raw.map((c) => {
      const name = c.name || `Category ${String(c.id || '')}`;

      return {
        id: c.id,
        name,
        totalItems: Number(c.totalItems ?? 0),
        items: null,
        checked: false // indicate whether we've already checked this category via menu-list
      };
    });

    setCategories(mapped);
    setLoadingLocal(false);
    // per-category checks kicked off by separate effect below
  }, [catData, catError]);

  // ---- NEW: fetch combos and ensure unique ids ----
  useEffect(() => {
    async function loadCombos() {
      try {
        const url = `/api/proxy/combo-list?storeCode=${getUser().storeLocation}&orderCategoryCode=${getUser().orderType}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const raw = Array.isArray(j?.data) ? j.data : (Array.isArray(j?.items) ? j.items : []);
        if (!raw || raw.length === 0) {
          setComboItems([]);
          return;
        }

        // use parseComboToMenuItem if available, then guarantee id uniqueness
        const combos = raw.map((c, idx) => {
          let parsed;
          try {
            parsed = parseComboToMenuItem ? parseComboToMenuItem(c) : c;
          } catch (e) {
            parsed = c;
          }
          const id = ensureUniqueIdForCombo(parsed);
          return {
            ...parsed,
            id,
            code: parsed.code ?? parsed.id ?? parsed.comboId ?? parsed.code,
            image: parsed.image ?? parsed.imagePath ?? parsed.imageUrl ?? "/images/no-image-available.jpg",
            price: parsed.price ?? parsed.totalPrice ?? 0,
            outOfStock: Boolean(parsed.outOfStock)
          };
        });

        // dedupe combos by id just in case
        setComboItems(uniqBy(combos, x => x.id));
      } catch (e) {
        console.warn('loadCombos failed', e);
        setComboItems([]);
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
          type: user.orderType,
          location: user.storeLocation
        };
        setOrderMode(formatted);
      } else {
        setOrderMode({ type: "", location: "" });
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
      // Only show categories that were checked and have items, or synthetic categories with items
      return (cat.items == null) ? true : cat.items.length > 0;
    });

  // Restore scroll & highlight last item when returning from ItemDetail
  useEffect(() => {
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
      } catch (e) {}
    }, 260);

    return () => clearTimeout(t);
  }, [categories]);

  async function getCombosByCategory(menuCategoryId) {
  try {
    const qs = new URLSearchParams({
      storeCode: getUser().storeLocation,
      orderCategoryCode: getUser().orderType,
      menuCategoryId: String(menuCategoryId)
    }).toString();

    const r = await fetch(`/api/proxy/combo-list?${qs}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();

    const raw = Array.isArray(j?.data) ? j.data : [];

    return raw.map((c, idx) => {
      const parsed = parseComboToMenuItem ? parseComboToMenuItem(c) : c;
      return {
        ...parsed,
        id: ensureUniqueIdForCombo(parsed),
        code: parsed.code ?? parsed.id,
        image: parsed.image ?? parsed.imagePath ?? "/images/no-image-available.jpg",
        price: parsed.price ?? parsed.totalPrice ?? 0,
        outOfStock: Boolean(parsed.outOfStock)
      };
    });
  } catch (e) {
    console.warn('combo fetch failed', e);
    return [];
  }
}

  // ---------- NEW: per-category check using menu-list ----------
  useEffect(() => {
    if (!Array.isArray(categories) || categories.length === 0) return;

    categories.forEach(async cat => {
      if (cat.checked) return;
      if (loadingItemsRef.current[String(cat.id)]) return;

      loadingItemsRef.current[String(cat.id)] = true;

      try {
        const qs = new URLSearchParams({
          menuCategoryId: String(cat.id),
          storeCode: orderMode.location,
          orderCategoryCode: orderMode.type,
          pageSize: '200'
        }).toString();

        // ⬇️ PARALLEL fetch
        const [menuRes, combos] = await Promise.all([
          fetch(`/api/proxy/menu-list?${qs}`).then(r => r.json()),
          getCombosByCategory(cat.id)
        ]);

        const rawMenu = Array.isArray(menuRes?.data) ? menuRes.data : [];
        const menuItems = rawMenu.map((it, idx) => ({
          id: ensureUniqueIdForMenu(it, cat.id, idx),
          code: it.code ?? it.id,
          name: it.name,
          itemName: it.itemName,
          taxes: it.taxes,
          price: it.price,
          image: it.imagePath ?? it.imageUrl ?? "/images/no-image-available.jpg",
          category: cat.name,
          outOfStock: Boolean(it.outOfStock)
        }));

        // 🔑 FILTER combo PER CATEGORY (LOGIC DI SINI)
        const comboForCategory = combos.filter(c =>
          String(c.categoryId ?? c.menuCategoryId ?? '').toString() === String(cat.id)
        );        

        const finalItems = uniqBy(
          [...menuItems, ...combos],
          x => x.id
        );

        setCategories(prev =>
          prev.map(p =>
            p.id === cat.id
              ? {
                  ...p,
                  items: finalItems,
                  totalItems: finalItems.length,
                  checked: true
                }
              : p
          )
        );
      } catch (e) {
        console.warn('menu/combo fetch failed', e);
        setCategories(prev =>
          prev.map(p =>
            p.id === cat.id ? { ...p, items: [], checked: true } : p
          )
        );
      } finally {
        loadingItemsRef.current[String(cat.id)] = false;
      }
    });
  }, [categories, orderMode]);

  // Intersection observer to lazy-load items for categories when scrolled into view
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;

    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        const catName = entry.target.getAttribute('data-cat');
        const cat = categories.find(c => c.name === catName);
        if (!cat || cat.checked) return;

        // trigger effect fetch
        setCategories(prev =>
          prev.map(p => (p.id === cat.id ? { ...p } : p))
        );
      });
    }, {
      rootMargin: '0px 0px 260px 0px',
      threshold: 0.01
    });

    Object.values(sectionRefs.current).forEach(el => {
      if (el) observerRef.current.observe(el);
    });

    return () => observerRef.current.disconnect();
  }, [categories]);

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
    if (cObj && (cObj.items == null) && !loadingItemsRef.current[String(cObj.id)]) {
      loadingItemsRef.current[String(cObj.id)] = true;
      // trigger fetch by touching categories state (the per-category effect will pick it up)
      setCategories(prev => prev.map(p => p.name === cObj.name ? { ...p } : p));
      setTimeout(() => { loadingItemsRef.current[String(cObj.id)] = false; }, 300);
    }
  }

  // ---------- RENDER ----------
  const tabItems = categories.filter(c => Array.isArray(c.items) && c.items.length > 0).map(c => c.name);
  const shouldShowInitialSkeleton = (!catData && loadingLocal) || (Array.isArray(categories) && categories.length === 0 && !catError);

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

  return (
    <div>
      <Header />

      <MenuTabs
        selected={activeCategory}
        onSelect={(c) => { setActiveCategory(c); scrollToCategory(c); }}
        isHidden={false}
        onOpenFullMenu={() => {
          setFilterForCategory(null);
          setShowFullMenu(true);
        }}
        items={tabItems}
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

      { shouldShowInitialSkeleton ? (
        <div style={{ padding: 12 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ marginBottom: 18 }}>
              <div style={categoryHeaderContainerStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                    <span style={{ display: 'inline-block', width: 160, height: 18, borderRadius: 6, background: 'linear-gradient(90deg,#e9e9e9 25%, #f7f7f7 50%, #e9e9e9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite' }} />
                  </h2>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>
                    <span style={{ display: 'inline-block', width: 64, height: 12, borderRadius: 4, background: 'linear-gradient(90deg,#eee 25%, #fafafa 50%, #eee 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite' }} />
                  </div>
                </div>

                <div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    height: 32,
                    borderRadius: 6,
                    background: '#f3f4f6',
                    border: '0.5px solid rgba(0,0,0,0.06)',
                    color: '#9ca3af',
                    cursor: 'not-allowed',
                    fontWeight: 600,
                    fontSize: 12,
                    pointerEvents: 'none'
                  }}>
                    <span style={{ display: 'inline-block', width: 16, height: 16, background: '#e5e7eb', borderRadius: 4 }} />
                    Filter
                  </div>
                </div>
              </div>

            </div>
          ))}
        </div>
      ) : (
        (filteredCategories.length === 0 ? (
          <div style={{ padding: 16 }}>{renderCategorySkeleton()}</div>
        ) : (
          <div style={{ padding: 12 }}>
            {filteredCategories.map((cat) => {
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
                    // still checking this category -> show skeleton
                    renderCategorySkeleton()
                  ) : viewMode === "list" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {cat.items.map((it) => {
                        const safeItem = {
                          ...it,
                          outOfStock: it.outOfStock === true
                        }
                        return <CardItem key={it.id} item={safeItem} mode={viewMode} />
                      })}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                      {cat.items.map((it) => {
                        const safeItem = {
                          ...it,
                          outOfStock: it.outOfStock === true
                        }
                        console.log("safeItem",safeItem);
                        
                        return <CardItem key={it.id} item={safeItem} mode={viewMode} />
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))
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
        }}
        onSelect={(catName) => {
          setShowFullMenu(false)
          setTimeout(()=>scrollToCategory(catName), 120)
        }}
        onFilterChange={(menuCategoryId) => {
          setFilterForCategory(menuCategoryId)
        }}
        onApplyFilter={async (menuCategoryId, filters) => {
          try {
            setShowFullMenu(false)
            if (menuCategoryId) setFilterForCategory(menuCategoryId)
            if (!menuCategoryId) return

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
            const mappedItems = rawItems.map((it, idx) => {
              const code = it.code ?? it.id ?? `unknown_${idx}`
              return {
                id: ensureUniqueIdForMenu(it, menuCategoryId, idx),
                code,
                name: it.name,
                itemName: it.itemName,
                taxes: it.taxes,
                price: it.price,
                image: it.imagePath ?? it.imageUrl ?? "/images/no-image-available.jpg",
                category: categories.find(c => String(c.id) === String(menuCategoryId))?.name ?? '',
                outOfStock: Boolean(it.outOfStock)
              }
            })

            const combos = await getCombosByCategory(menuCategoryId);
            const finalItems = uniqBy(
              [...mappedItems, ...comboForCategory],
              x => x.id
            );

            setCategories(prev => prev.map(c => {
              if (String(c.id) === String(menuCategoryId)) {
                return { ...c, items: finalItems };
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