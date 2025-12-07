import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import StickyCartBar from './StickyCartBar'
import { useRouter } from 'next/router'
import styles from '../styles/ItemDetail.module.css'
import { addToCart, getCart, updateCart, replaceCartAtIndex } from '../lib/cart'

function formatRp(n) {
  if (n == null) return '-'
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

const NONE_OPTION_ID = '__NONE__'

export default function ItemDetail({ productCode: propProductCode, item: propItem = {} }) {
  const router = useRouter()
  const q = router.query

  const productCode = propProductCode || q.productCode || propItem.code || propItem.productCode || propItem.id

  const initialItem = {
    code: propItem.code || propItem.id || productCode || undefined,
    title: q.title || propItem.name || propItem.title || '',
    price: q.price ? Number(q.price) : (propItem.price ?? 0),
    image: q.image || propItem.imagePath || propItem.image || '',
    description: q.description || propItem.description || propItem.itemName || ''
  }

  const [item, setItem] = useState(initialItem)
  const [addons, setAddons] = useState([])
  const [selected, setSelected] = useState({})
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [noCondiments, setNoCondiments] = useState(false)
  const [missingAddons, setMissingAddons] = useState(null)

  const fromCheckout = String(router.query?.from || '') === 'checkout'
  const editIndexQuery = router.query?.index != null ? Number(router.query.index) : null
  const [editingIndex, setEditingIndex] = useState(editIndexQuery != null ? editIndexQuery : null)

  const [addAnimating, setAddAnimating] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const toastTimerRef = useRef(null)

  useEffect(() => {
    if (!fromCheckout || editingIndex == null) return
    const cart = getCart() || []
    const cartItem = cart[editingIndex]
    if (!cartItem || !Array.isArray(cartItem.addons)) return

    const sel = {}
    cartItem.addons.forEach(a => {
      const code = String(a.code || '')
      addons.forEach(g => {
        const found = g.options.find(o => String(o.id) === code)
        if (found) sel[g.group] = found.id
      })
    })

    if (Object.keys(sel).length > 0) {
      setSelected(prev => ({ ...prev, ...sel }))
    }
  }, [addons])

  // Save last_item on mount so Menu can restore to it when returning
  useEffect(() => {
    try {
      if (productCode) {
        sessionStorage.setItem('last_item', String(productCode));
      }
    } catch (e) {}
  }, [productCode])

  // Prefill from cart (editing)
  useEffect(() => {
    const idx = editIndexQuery != null ? editIndexQuery : (() => {
      try {
        const s = sessionStorage.getItem('yoshi_edit')
        if (!s) return null
        const parsed = JSON.parse(s)
        return typeof parsed.index === 'number' ? parsed.index : null
      } catch (e) {
        return null
      }
    })()

    if (fromCheckout && idx != null) {
      try {
        const cart = getCart() || []
        const cartItem = cart[idx]
        if (cartItem) {
          setEditingIndex(idx)
          if (cartItem.title) setItem(prev => ({ ...prev, title: cartItem.title }))
          const basePriceFromMenu = Number(cartItem?.menus?.[0]?.detailMenu?.price || 0)
          if (basePriceFromMenu > 0) {
            setItem(prev => ({ ...prev, price: basePriceFromMenu }))
          } else if (cartItem.price != null) {
            // fallback hanya kalau tidak ada detailMenu
            setItem(prev => ({ ...prev, price: Number(cartItem.price) }))
          }
          if (cartItem.image) setItem(prev => ({ ...prev, image: cartItem.image }))
          if (cartItem.description) setItem(prev => ({ ...prev, description: cartItem.description }))
          if (cartItem.qty != null) setQty(Number(cartItem.qty))
          if (cartItem.note != null) setNote(String(cartItem.note))

          if (Array.isArray(cartItem.addons)) {
            const sel = {}
            cartItem.addons.forEach(a => {
              const code = String(a.code || a.id || '')
              addons.forEach(g => {
                const found = (g.options || []).find(o => String(o.id) === code)
                if (found) {
                  sel[g.group] = found.id
                }
              })
            })
            setSelected(prev => ({ ...prev, ...sel }))
          }
        }
      } catch (e) {
        console.warn('prefill from cart failed', e)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady])

  // Helpers & fetch condiment groups (unchanged except minor)
  function extractIdFromValue(val, group) {
    if (val == null) return null
    if (val === NONE_OPTION_ID) return NONE_OPTION_ID
    if (typeof val === 'string' || typeof val === 'number') {
      const s = String(val)
      const found = (group.options || []).find(o => String(o.id) === s || String(o.rawId) === s)
      return found ? found.id : s
    }
    if (typeof val === 'object') {
      const cand = String(val.id ?? val.code ?? val.rawId ?? val.name ?? '')
      if (!cand) return null
      const found = (group.options || []).find(o => String(o.id) === cand || String(o.rawId) === cand)
      return found ? found.id : cand
    }
    return null
  }

  function normalizeSelectedForGroup(raw, group) {
    if (raw == null) return null
    if (raw === NONE_OPTION_ID) return NONE_OPTION_ID
    if (Array.isArray(raw)) {
      const mapped = raw.map(v => extractIdFromValue(v, group)).filter(v => v != null)
      return mapped
    }
    return extractIdFromValue(raw, group)
  }

  useEffect(() => {
    if (!productCode) return
    setLoading(true)
    setErr(null)
    setNoCondiments(false)

    const orderCategoryCode = 'DI'
    const storeCode = 'MGI'
    const url = `/api/proxy/condiment?productCode=${encodeURIComponent(productCode)}&orderCategoryCode=${encodeURIComponent(orderCategoryCode)}&storeCode=${encodeURIComponent(storeCode)}`

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => {
        const product = Array.isArray(json.data) && json.data.length > 0 ? json.data[0] : null
        if (!product) {
          setAddons([])
          setNoCondiments(true)
          setSelected(prev => ({ ...prev, ["__NO_ADDONS__"]: NONE_OPTION_ID }))
          return
        }

        const groups = Array.isArray(product.condimentGroups) ? product.condimentGroups.map(g => {
          const groupKey = g.code || g.name || String(g.id)
          const options = Array.isArray(g.products) ? g.products.map(p => ({
            id: p.code ?? String(p.id),
            rawId: p.id,
            name: p.name ?? p.itemName ?? '',
            price: Number(p.price || 0),
            image: p.imagePath || '',
            description: p.description || ''
          })) : []

          return {
            id: g.id,
            code: g.code,
            group: groupKey,
            name: g.name,
            max: g.max ?? 1,
            allowSkip: !!g.allowSkip,
            options
          }
        }) : []

        setAddons(groups)
        setNoCondiments(groups.length === 0)

        setItem(prev => (({
          code: prev.code || product.code || productCode,
          title: prev.title || product.name || '',
          price: Number(prev.price || product.price || 0),
          image: prev.image || product.imagePath || '',
          description: prev.description || product.description || ''
        })))

        setSelected(prevSelected => {
          const result = { ...prevSelected }
          groups.forEach(g => {
            const key = g.group
            const existing = result[key]
            if (existing == null) {
              result[key] = null
            } else {
              const norm = normalizeSelectedForGroup(existing, g)
              if (Array.isArray(norm) && norm.length === 0) {
                result[key] = null
              } else {
                result[key] = norm
              }
            }
          })
          return result
        })
      })
      .catch(e => {
        console.error('fetch condiment error', e)
        setErr(e.message || 'Fetch error')
        setAddons([])
        setNoCondiments(true)
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productCode])

  const subtotal = useMemo(() => {
    const base = Number(item.price || 0)
    const addonTotal = addons.reduce((acc, g) => {
      const key = g.group
      const val = selected[key]
      if (val == null) return acc
      if (val === NONE_OPTION_ID) return acc
      if (Array.isArray(val)) {
        return acc + val.reduce((s, v) => {
          const opt = g.options.find(o => String(o.id) === String(v))
          return s + (opt ? Number(opt.price || 0) : 0)
        }, 0)
      }
      const opt = g.options.find(o => String(o.id) === String(val))
      return acc + (opt ? Number(opt.price || 0) : 0)
    }, 0)
    return (base + addonTotal) * Math.max(1, Number(qty || 1))
  }, [addons, selected, item.price, qty])

  function onToggleOption(groupKey, optionId, allowSkip) {
    setSelected(prev => {
      const clone = { ...prev }
      const current = clone[groupKey]
      if (optionId === NONE_OPTION_ID) {
        clone[groupKey] = NONE_OPTION_ID
        return clone
      }
      if (allowSkip) {
        clone[groupKey] = current === optionId ? null : optionId
      } else {
        clone[groupKey] = optionId
      }
      return clone
    })
  }

  function validateSelection() {
    const missing = addons.filter(g => {
      const val = selected[g.group]
      if (val == null) return true
      if (Array.isArray(val) && val.length === 0) return true
      return false
    })
    if (missing.length > 0) {
      const names = missing.map(m => m.name || m.group).join(', ')
      setMissingAddons(names)
      setShowPopup(true)
      return false
    }
    return true
  }

  function findOption(group, optId) {
    if (!group || !Array.isArray(group.options)) return null
    return group.options.find(o => String(o.id) === String(optId)) || null
  }

  function buildOrderObject() {
    const apiItem = (propItem && Object.keys(propItem).length) ? propItem : item || {};
    const basePrice = Number(item.price || 0);
    const qtyNum = Number(qty || 1);

    // If editing an existing cart item, prefer it as source for legacy tax info
    let legacySourceForTaxes = apiItem;
    try {
      if (fromCheckout && editingIndex != null) {
        const currentCart = getCart() || [];
        const original = currentCart[editingIndex];
        if (original && typeof original === 'object') {
          legacySourceForTaxes = original;
        }
      }
    } catch (e) {
      // ignore - fallback to apiItem
    }

    // ======== Build Condiments (Addons) =========
    const condiments = addons.flatMap(g => {
      const val = selected[g.group];
      if (val == null || val === NONE_OPTION_ID) return [];

      const mapOne = (optId) => {
        const opt = findOption(g, optId);
        const price = Number(opt?.price || 0);

        // Prefer tax info from the option itself (opt.taxes), fallback to legacySourceForTaxes.taxes
        let taxes = [];
        // If options were fetched from API they may not include taxes in our `options` mapping.
        // Try to read original option object from addons source (g.products) if present:
        let rawOpt = null;
        if (g.rawProducts) {
          rawOpt = g.rawProducts.find(r => String(r.code ?? r.id) === String(optId));
        }

        // prefer rawOpt.taxes, else opt.taxes, else legacySourceForTaxes.taxes
        const optTaxSource = (rawOpt && Array.isArray(rawOpt.taxes) && rawOpt.taxes.length) ? rawOpt.taxes
                           : (Array.isArray(opt?.taxes) && opt.taxes.length ? opt.taxes : null);

        if (Array.isArray(optTaxSource) && optTaxSource.length) {
          taxes = optTaxSource.map(t => {
            const taxName = (t.name || t.taxName || t.name || '').toString();
            const taxPercentage = Number(t.amount ?? t.taxPercentage ?? 0);
            const taxAmount = Math.round((taxPercentage / 100) * price);
            return { taxName, taxPercentage, taxAmount };
          });
        } else if (Array.isArray(legacySourceForTaxes.taxes) && legacySourceForTaxes.taxes.length) {
          taxes = legacySourceForTaxes.taxes.map(t => {
            const taxName = (t.taxName || t.name || '').toString();
            const taxPercentage = Number(t.taxPercentage || t.amount || 0);
            const taxAmount = Math.round((taxPercentage / 100) * price);
            return { taxName, taxPercentage, taxAmount };
          });
        }

        return {
          code: opt?.id || String(optId),
          name: opt?.name || '',
          price,
          qty: 1,
          taxes
        };
      };

      return Array.isArray(val) ? val.map(mapOne) : [mapOne(val)];
    });

    // ======== Taxes for Menu only (use legacySourceForTaxes or apiItem) =========
    // Prefer explicit taxes from legacySourceForTaxes (e.g. editing existing cart) otherwise
    // fall back to apiItem.taxes if present. We compute taxAmount against the menu base price.
    const menuBasePrice = Number(basePrice || 0);
    let menuTaxes = [];
    const sourceTaxes = Array.isArray(legacySourceForTaxes.taxes) && legacySourceForTaxes.taxes.length
      ? legacySourceForTaxes.taxes
      : (Array.isArray(apiItem.taxes) ? apiItem.taxes : []);

    if (Array.isArray(sourceTaxes) && sourceTaxes.length) {
      menuTaxes = sourceTaxes.map(t => {
        const taxName = (t.taxName || t.name || '').toString();
        const taxPercentage = Number(t.taxPercentage ?? t.amount ?? 0);
        const taxAmount = Math.round((taxPercentage / 100) * menuBasePrice);
        return { taxName, taxPercentage, taxAmount };
      });
    } else {
      menuTaxes = [];
    }

    // ======== menus[] payload =========
    const menusPayload = [{
      condiments,
      detailMenu: {
        code: apiItem.code || item.code || productCode || '',
        name: item.title || apiItem.name || '',
        price: basePrice,
        image: item.ImagePath || apiItem.ImagePath || '',
      },
      isFromMacro: true,
      orderType: "DI",
      qty: qtyNum,
      taxes: menuTaxes
    }];

    // ======== CART COMPATIBILITY =========
    const addonsForCart = condiments.map(c => ({
      group: '',
      groupName: '',
      code: c.code,
      qty: c.qty,
      price: c.price
    }));

    const unitPrice = basePrice + condiments.reduce((s, c) => s + c.price, 0);

    // Aggregate top-level taxes: menuTaxes + all condiments taxes (flatten)
    const aggregatedTaxes = [
      ...menuTaxes,
      ...condiments.flatMap(c => Array.isArray(c.taxes) ? c.taxes : [])
    ];

    // Optionally, you might want to combine same taxName into single entries.
    // For simplicity we keep individual entries (server-side can also sum if needed).

    // ======== Final order object (cart compatible) =========
    const final_order = {
      id: menusPayload[0].detailMenu.code,
      productCode: menusPayload[0].detailMenu.code,
      title: menusPayload[0].detailMenu.name,
      price: unitPrice,
      qty: qtyNum,
      image: item.image || apiItem.imagePath || '',
      note: String(note || ''),

      // keep old cart support
      addons: addonsForCart,

      // NEW payload for backend
      menus: menusPayload,

      // Preserve legacy tax fields from legacySourceForTaxes when available,
      // otherwise fill with computed aggregated taxes so downstream UI can read it.
      taxes: (Array.isArray(legacySourceForTaxes.taxes) && legacySourceForTaxes.taxes.length)
        ? legacySourceForTaxes.taxes
        : aggregatedTaxes,

      pb1Percent: Number(legacySourceForTaxes.pb1Percent || legacySourceForTaxes.pb1 || 0),
      ppnPercent: Number(legacySourceForTaxes.ppnPercent || legacySourceForTaxes.ppn || 0),
      hasPB1: !!legacySourceForTaxes.hasPB1 || !!legacySourceForTaxes.hasPB1 === true,
      hasPPN: !!legacySourceForTaxes.hasPPN || !!legacySourceForTaxes.hasPPN === true
    };

    console.log('final_order (patched)', JSON.stringify(final_order, null, 2));
    return final_order;
  }

  function handleAddToCart() {
    if (addons.length > 0 && !validateSelection()) return

    const order = buildOrderObject()

    try {
      if (fromCheckout && editingIndex != null) {
        // === EDIT FLOW: replace item deterministically ===
        try {
          const currentCart = getCart() || [];
          const original = (typeof editingIndex === 'number' && currentCart[editingIndex]) ? currentCart[editingIndex] : null;

          // Merge order onto original to preserve shape (esp. combo structure)
          let newOrder = order;
          if (original) {
            // If original is combo, preserve its combo structure unless overwritten
            if (original.type === 'combo') {
              newOrder = { ...original, ...order };
              newOrder.type = 'combo';
              // ensure combos/detailCombo exist (preserve if original had)
              if (!newOrder.combos && original.combos) newOrder.combos = original.combos;
              if (!newOrder.detailCombo && original.detailCombo) newOrder.detailCombo = original.detailCombo;
            } else {
              // for non-combo, simple merge keeps any legacy fields
              newOrder = { ...original, ...order };
            }
          } else {
            // no original (edge-case): still attempt updateCart (fallback) or push as new
            newOrder = order;
          }

          // ensure qty and price types are numbers
          newOrder.qty = Number(newOrder.qty || 1);
          newOrder.price = Number(newOrder.price || 0);

          // perform deterministic replace
          const updated = replaceCartAtIndex(editingIndex, newOrder)
          // try updateCart for compatibility (non-critical)
          try { updateCart(editingIndex, newOrder) } catch (e) { /* ignore */ }

          // nothing else required here; Checkout will reload cart when navigated back
        } catch (e) {
          console.error('persist cart error (edit replace)', e)
          // fallback: attempt to call updateCart (patch) - may still work
          try { updateCart(editingIndex, order) } catch (ee) { console.error('fallback updateCart failed', ee) }
        }
      } else {
        addToCart(order)
      }
    } catch (e) {
      console.error('persist cart error', e)
    }

    setMissingAddons(null)

    // save scroll so menu can restore precisely where user was
    try { sessionStorage.setItem('menu_scroll', String(window.scrollY || 0)); } catch (e) {}

    setAddAnimating(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)

    toastTimerRef.current = setTimeout(() => {
      setAddAnimating(false)
      setShowPopup(true)
    }, 520)
  }

  // close popup: then navigate
  function handleClosePopup() {
    if (missingAddons) {
      setShowPopup(false)
      return
    }

    setShowPopup(false)
    try { sessionStorage.removeItem('yoshi_edit') } catch (e) {}

    // save last_item (again) and current scroll
    try {
      if (productCode) sessionStorage.setItem('last_item', String(productCode))
      sessionStorage.setItem('menu_scroll', String(window.scrollY || 0))
    } catch (e) {}

    if (fromCheckout && editingIndex != null) {
      router.push('/checkout')
    } else {
      // navigate back to menu; Menu will restore
      router.push('/menu')
    }
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // AUTO CLOSE POPUP + REDIRECT setelah 2s (kecuali missingAddons)
  useEffect(() => {
    if (!showPopup) return
    if (missingAddons) return

    const t = setTimeout(() => {
      handleClosePopup()
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPopup, missingAddons])

  const addBtnLabel = (fromCheckout && editingIndex != null) ? 'Ubah Pesanan' : 'Tambah Pesanan'

  // UI (unchanged)
  return (
    <div className={styles.page}>
      <div className={styles.headerArea}>
        <div className={styles.btnLeft}>
          <button
            onClick={() => {
              if (fromCheckout && editingIndex != null) {
                router.push('/checkout')
              } else {
                // save last_item and scroll then go back
                try {
                  if (productCode) sessionStorage.setItem('last_item', String(productCode))
                  sessionStorage.setItem('menu_scroll', String(window.scrollY || 0))
                } catch (e) {}
                router.push('/menu')
              }
            }}
            aria-label="Cancel"
            className={styles.iconBtn}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M6 18L18 6" stroke="#111827" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className={styles.btnRight}>
          <button title="Fullscreen" className={styles.iconBtn} onClick={() => window.open(item.image || '/images/gambar-menu.jpg')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" stroke="#111827" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className={styles.imageWrapper}>
          <Image
            src={item.image || '/images/gambar-menu.jpg'}
            alt={item.title || 'item'}
            fill
            className={styles.image}
            priority
          />
        </div>
      </div>

      <div className={styles.detailBox}>
        <div className={styles.detailRow}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>{item.title}</h1>
            <p className={styles.description}>{item.description}</p>
          </div>

          <div className={styles.priceWrap}>
            <div className={styles.priceText}>{formatRp(item.price)}</div>
          </div>
        </div>
      </div>

      <div className={styles.addonsWrap}>
        {loading && <div style={{ padding: 12 }}>Memuat addon...</div>}
        {err && <div style={{ padding: 12, color: 'crimson' }}>{err}</div>}

        {!loading && noCondiments && (
          <section className={styles.addonGroup}>
            <div className={styles.groupHeader}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <div className={styles.groupTitle}>Tanpa Add Ons</div>
                <div className={styles.groupSub}></div>
              </div>
            </div>

            <label className={styles.optionLabel} style={{ opacity: 0.95 }}>
              <div className={styles.optionName}>
                <div>Tanpa add ons</div>
              </div>

              <div className={styles.optionRight}>
                <div className={styles.optionPrice}>+Rp0</div>

                <input
                  type="radio"
                  name="__NO_ADDONS__"
                  checked={selected["__NO_ADDONS__"] === NONE_OPTION_ID}
                  onChange={() => setSelected(prev => ({ ...prev, ["__NO_ADDONS__"]: NONE_OPTION_ID }))}
                  className={styles.radio}
                />
              </div>
            </label>
          </section>
        )}

        {!loading && !noCondiments && addons.map(g => (
          <section key={g.group} className={styles.addonGroup}>
            <div className={styles.groupHeader}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <div className={styles.groupTitle}>{g.name || g.group}</div>
                <div className={styles.groupSub}>Maks. {g.max ?? 1} item</div>
              </div>
            </div>

            <div>
              {g.allowSkip && (
                <label className={styles.optionLabel} style={{ opacity: 0.95 }}>
                  <div className={styles.optionName}>
                    <div>Tanpa add ons</div>
                  </div>

                  <div className={styles.optionRight}>
                    <div className={styles.optionPrice}>+Rp0</div>
                    <input
                      type="radio"
                      name={g.group}
                      checked={selected[g.group] === NONE_OPTION_ID}
                      onChange={() => onToggleOption(g.group, NONE_OPTION_ID, true)}
                      className={styles.radio}
                    />
                  </div>
                </label>
              )}

              {g.options.length > 0 ? g.options.map(opt => {
                const groupKey = g.group
                const allowSkip = !!g.allowSkip
                const val = selected[groupKey]
                const isSelected = (() => {
                  if (Array.isArray(val)) return val.some(v => String(v) === String(opt.id))
                  return String(val) === String(opt.id)
                })()

                return (
                  <label key={opt.id} className={styles.optionLabel}>
                    <div className={styles.optionName}>
                      <div>{opt.name}</div>
                    </div>

                    <div className={styles.optionRight}>
                      <div className={styles.optionPrice}>{opt.price ? `+${formatRp(opt.price)}` : '+Rp0'}</div>

                      <input
                        type="radio"
                        name={groupKey}
                        checked={!!isSelected}
                        onChange={() => onToggleOption(groupKey, opt.id, allowSkip)}
                        className={styles.radio}
                      />
                    </div>
                  </label>
                )
              }) : (
                <div className={styles.noOptions}>Tidak ada opsi</div>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className={styles.spacer} />

      <div className={styles.stickyOuter}>
        <div className={styles.stickyInner}>
          <StickyCartBar
            qty={qty}
            setQty={setQty}
            subtotal={subtotal}
            onAdd={handleAddToCart}
            addAnimating={addAnimating}
            addLabel={addBtnLabel}
            isEditing={fromCheckout && editingIndex != null}
          />
        </div>
      </div>

      {showPopup && (
        <>
          <div className={styles.addModalOverlay} onClick={() => {
            setShowPopup(false)
            setMissingAddons(null)
          }} />

          <div className={styles.addModal} role="dialog" aria-modal="true">
            <div className={styles.addModalContent}>

              {missingAddons ? (
                <>
                  <div className={styles.addModalIcon}>
                    <Image src="/images/warning.png" alt='Warning' width={80} height={80} />
                  </div>
                  <div className={styles.addModalTitle}>
                    Pilih Add Ons Terlebih Dahulu
                  </div>
                  <div className={styles.addModalSubtitle}>
                    Anda belum memilih: <b>{missingAddons}</b>
                  </div>

                  <div className={styles.addModalActions}>
                    <button
                      className={styles.addModalCloseBtn}
                      onClick={() => {
                        setShowPopup(false)
                        setMissingAddons(null)
                      }}
                    >
                      Mengerti
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.addModalIcon}>
                    <Image src={"/images/order-success.png"} alt="success" width={96} height={96} />
                  </div>

                  <div className={styles.addModalTitle}>
                    {fromCheckout && editingIndex != null ? 'Pesanan Berhasil Diubah!' : 'Pesanan Berhasil Ditambahkan!'}
                  </div>

                  <div className={styles.addModalSubtitle} style={{ fontWeight: 600, fontSize: 16 }}>
                    Harga : {formatRp(subtotal)}
                  </div>
                </>
              )}

            </div>
          </div>
        </>
      )}
    </div>
  )
}