// components/ItemDetail.js
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import StickyCartBar from './StickyCartBar'
import { useRouter } from 'next/router'
import styles from '../styles/ItemDetail.module.css'
import { addToCart, getCart, updateCart } from '../lib/cart'

function formatRp(n) {
  if (n == null) return '-'
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

const NONE_OPTION_ID = '__NONE__' // sentinel for "Tanpa add ons"

export default function ItemDetail({ productCode: propProductCode, item: propItem = {} }) {
  const router = useRouter()
  const q = router.query

  const productCode = propProductCode || q.productCode || propItem.code || propItem.productCode || propItem.id

  // initial item state (may be overridden by cart-edit prefill or API)
  const initialItem = {
    title: q.title || propItem.name || propItem.title || '',
    price: q.price ? Number(q.price) : (propItem.price ?? 0),
    image: q.image || propItem.imagePath || propItem.image || '',
    description: q.description || propItem.description || propItem.itemName || ''
  }

  const [item, setItem] = useState(initialItem)
  const [addons, setAddons] = useState([]) // groups from API
  const [selected, setSelected] = useState({}) // selected options per group
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [noCondiments, setNoCondiments] = useState(false)
  const [missingAddons, setMissingAddons] = useState(null)

  // Editing context (if came from checkout)
  const fromCheckout = String(router.query?.from || '') === 'checkout'
  const editIndexQuery = router.query?.index != null ? Number(router.query.index) : null
  const [editingIndex, setEditingIndex] = useState(editIndexQuery != null ? editIndexQuery : null)

  // Animation / feedback state
  const [addAnimating, setAddAnimating] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const toastTimerRef = useRef(null)

  // --- Prefill from cart (if editing) ASAP so UI uses cart values immediately ---
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
          if (cartItem.price != null) setItem(prev => ({ ...prev, price: Number(cartItem.price) }))
          if (cartItem.image) setItem(prev => ({ ...prev, image: cartItem.image }))
          if (cartItem.description) setItem(prev => ({ ...prev, description: cartItem.description }))
          if (cartItem.qty != null) setQty(Number(cartItem.qty))
          if (cartItem.note != null) setNote(String(cartItem.note))

          // Map cart addons into `selected` shape (don't rely on API groups yet)
          if (Array.isArray(cartItem.addons)) {
            const sel = {}
            cartItem.addons.forEach(a => {
              // a.selected may be string/array/object — adopt simple mapping
              sel[a.group] = a.selected ?? null
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

  // Fetch condiment groups for product (to present addon options)
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

          // initialize selection for no-condiment case
          setSelected(prev => ({ ...prev, ["__NO_ADDONS__"]: NONE_OPTION_ID }))
          return
        }

        // Build addon groups
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

        // Update base item if API supplies better values (but don't override cart-edit fields already set)
        setItem(prev => (({
          title: prev.title || product.name || '',
          price: Number(prev.price || product.price || 0),
          image: prev.image || product.imagePath || '',
          description: prev.description || product.description || ''
        })))

        // Initialize selected defaults for groups that are NOT already set (preserve cart values)
        setSelected(prevSelected => {
          const result = { ...prevSelected }
          groups.forEach(g => {
            if (result[g.group] == null) {
              // NOTE: keep null so user must actively choose.
              result[g.group] = null
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

  // Subtotal calculation (base price + addon price) * qty
  const subtotal = useMemo(() => {
    const base = Number(item.price || 0)
    const addonTotal = addons.reduce((acc, g) => {
      const key = g.group
      const val = selected[key]

      if (val == null) return acc
      if (val === NONE_OPTION_ID) return acc // explicit none chosen -> no addon price

      if (Array.isArray(val)) {
        return acc + val.reduce((s, v) => {
          const opt = g.options.find(o => o.id === v)
          return s + (opt ? Number(opt.price || 0) : 0)
        }, 0)
      }

      const opt = g.options.find(o => o.id === val)
      return acc + (opt ? Number(opt.price || 0) : 0)
    }, 0)

    return (base + addonTotal) * Math.max(1, Number(qty || 1))
  }, [addons, selected, item.price, qty])

  // toggle option (radio-like): if allowSkip clicking same toggles off
  function onToggleOption(groupKey, optionId, allowSkip) {
    setSelected(prev => {
      const clone = { ...prev }
      const current = clone[groupKey]

      // if user chose the explicit NONE option
      if (optionId === NONE_OPTION_ID) {
        clone[groupKey] = NONE_OPTION_ID
        return clone
      }

      // otherwise normal behavior:
      if (allowSkip) {
        clone[groupKey] = current === optionId ? null : optionId
      } else {
        clone[groupKey] = optionId
      }
      return clone
    })
  }

  function validateSelection() {
    // For each addon group, ensure there is a selection (either an option id or the NONE sentinel).
    const missing = addons.filter(g => selected[g.group] == null)

    if (missing.length > 0) {
      const names = missing.map(m => m.name || m.group).join(', ')
      setMissingAddons(names)   // <-- Tampilkan di popup
      setShowPopup(true)
      return false
    }

    return true
  }

  // helper: find option object by id in a group
  function findOption(group, optId) {
    if (!group || !Array.isArray(group.options)) return null
    return group.options.find(o => String(o.id) === String(optId)) || null
  }

  function buildOrderObject() {
    const addonsForCart = addons.map(g => {
      const val = selected[g.group]

      // user explicitly chose "none" for this group OR no selection (null)
      if (val === NONE_OPTION_ID || val == null) {
        return {
          group: g.group,
          groupName: g.name ?? g.group,
          selected: null
        }
      }

      // multiple selections (array)
      if (Array.isArray(val)) {
        const items = val.map(v => {
          const opt = findOption(g, v)
          if (opt) {
            return {
              id: opt.id ?? null,
              code: opt.id ?? String(opt.rawId ?? opt.id ?? ''),
              name: opt.name ?? '',
              price: Number(opt.price || 0),
              image: opt.image || ''
            }
          }
          return { id: v, code: String(v), name: String(v), price: 0, image: '' }
        })
        return {
          group: g.group,
          groupName: g.name ?? g.group,
          selected: items
        }
      }

      // single selection
      const opt = findOption(g, val)
      if (opt) {
        return {
          group: g.group,
          groupName: g.name ?? g.group,
          selected: {
            id: opt.id ?? null,
            code: opt.id ?? String(opt.rawId ?? opt.id ?? ''),
            name: opt.name ?? '',
            price: Number(opt.price || 0),
            image: opt.image || ''
          }
        }
      }

      // fallback: unknown id -> store as code only
      return {
        group: g.group,
        groupName: g.name ?? g.group,
        selected: { id: val, code: String(val), name: String(val), price: 0, image: '' }
      }
    })

    return {
      productCode,
      title: item.title || '',
      price: Number(item.price || 0),
      qty: Number(qty || 1),
      image: item.image || '/images/gambar-menu.jpg',
      note,
      addons: addonsForCart
    }
  }

  // add or update cart item — with animation then popup
  function handleAddToCart() {
    if (addons.length > 0 && !validateSelection()) return

    const order = buildOrderObject()

    try {
      if (fromCheckout && editingIndex != null) {
        updateCart(editingIndex, order)
      } else {
        addToCart(order)
      }
    } catch (e) {
      console.error('persist cart error', e)
    }

    setMissingAddons(null) // pastikan popup bukan “missing”
    
    setAddAnimating(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)

    toastTimerRef.current = setTimeout(() => {
      setAddAnimating(false)
      setShowPopup(true)
    }, 520)
  }

  // close popup: then navigate depending on edit/fromCheckout
  function handleClosePopup() {
    setShowPopup(false)
    // cleanup editing session key if any
    try { sessionStorage.removeItem('yoshi_edit') } catch (e) {}
    if (fromCheckout && editingIndex != null) {
      router.push('/checkout')
    } else {
      router.push('/menu')
    }
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // AUTO CLOSE POPUP + REDIRECT setelah 2 detik,
  // kecuali jika popup adalah warning missingAddons
  useEffect(() => {
    if (!showPopup) return
    if (missingAddons) return // do not auto-close warning modal

    const t = setTimeout(() => {
      handleClosePopup()
    }, 2000)

    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPopup, missingAddons])

  // computed label for sticky button (so StickyCartBar can update text)
  const addBtnLabel = (fromCheckout && editingIndex != null) ? 'Ubah Pesanan' : 'Tambah Pesanan'

  // UI
  return (
    <div className={styles.page}>
      <div className={styles.headerArea}>
        <div className={styles.btnLeft}>
          <button
            onClick={() => {
              // if user entered the page from checkout editing flow, back should go to checkout
              if (fromCheckout && editingIndex != null) {
                router.push('/checkout')
              } else {
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
            width={390}
            height={390}
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

        {/* CASE: no condiment groups from API -> show single "Tanpa add ons" block */}
        {!loading && noCondiments && (
          <section className={styles.addonGroup}>
            <div className={styles.groupHeader}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <div className={styles.groupTitle}>Tanpa Add Ons</div>
                <div className={styles.groupSub}></div>
              </div>
            </div>

            {/* Radio Button Tanpa Add Ons */}
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
                  onChange={() =>
                    setSelected(prev => ({
                      ...prev,
                      ["__NO_ADDONS__"]: NONE_OPTION_ID
                    }))
                  }
                  className={styles.radio}
                />
              </div>
            </label>
          </section>
        )}

        {/* Render groups when available */}
        {!loading && !noCondiments && addons.map(g => (
          <section key={g.group} className={styles.addonGroup}>
            <div className={styles.groupHeader}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <div className={styles.groupTitle}>{g.name || g.group}</div>
                <div className={styles.groupSub}>Maks. {g.max ?? 1} item</div>
              </div>
            </div>

            <div>
              {/* If allowSkip true: render explicit "Tanpa add ons" radio option */}
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
                const isSelected = (() => {
                  const val = selected[groupKey]
                  if (Array.isArray(val)) return val.includes(opt.id)
                  return val === opt.id
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

      <div className={styles.notesWrap}>
        <div className={styles.notesTitle}>Catatan</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tambahkan catatan pesanan (opsional)" className={styles.textarea} />
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
            // send label so StickyCartBar (if updated) can show different text when editing
            addLabel={addBtnLabel}
            isEditing={fromCheckout && editingIndex != null}
          />
        </div>
      </div>

      {/* Popup modal (instead of toast) */}
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
                    <Image src="/images/warning.png" alt="warning" width={80} height={80} />
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

                  {/* Title depends on whether user was editing from checkout */}
                  <div className={styles.addModalTitle}>
                    {fromCheckout && editingIndex != null ? 'Menu Diubah!' : 'Menu Ditambahkan!'}
                  </div>

                  {/* Show price under the title */}
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
