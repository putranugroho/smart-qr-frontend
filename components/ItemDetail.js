// components/ItemDetail.js
import Image from 'next/image'
import { useEffect, useState, useMemo } from 'react'
import StickyCartBar from './StickyCartBar'
import { useRouter } from 'next/router'
import styles from '../styles/ItemDetail.module.css'
import { addToCart, getCart, updateCart } from '../lib/cart'

function formatRp(n) {
  if (n == null) return '-'
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

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

  // Editing context (if came from checkout)
  const fromCheckout = String(router.query?.from || '') === 'checkout'
  const editIndexQuery = router.query?.index != null ? Number(router.query.index) : null
  const [editingIndex, setEditingIndex] = useState(editIndexQuery != null ? editIndexQuery : null)

  // --- Prefill from cart (if editing) ASAP so UI uses cart values immediately ---
  useEffect(() => {
    // prefer explicit query index; else sessionStorage fallback 'yoshi_edit' (if parent set it)
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
          // Fill UI fields from cart item immediately
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
              // a.selected may be string or array — keep as-is
              sel[a.group] = a.selected ?? null
            })
            setSelected(prev => ({ ...prev, ...sel }))
          }
        }
      } catch (e) {
        console.warn('prefill from cart failed', e)
      }
    }
    // Only run once on mount / when query changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady])

  // Fetch condiment groups for product (to present addon options)
  useEffect(() => {
    if (!productCode) return
    setLoading(true)
    setErr(null)

    const orderCategoryCode = 'DI'
    const storeCode = 'SMS'
    const url = `/api/proxy/condiment?productCode=${encodeURIComponent(productCode)}&orderCategoryCode=${encodeURIComponent(orderCategoryCode)}&storeCode=${encodeURIComponent(storeCode)}`

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => {
        const product = Array.isArray(json.data) && json.data.length > 0 ? json.data[0] : null
        if (!product) {
          setErr('Tidak ada data product condiment')
          return
        }

        // Update base item if API supplies better values (but don't override cart-edit fields already set)
        setItem(prev => ({
          title: prev.title || product.name || '',
          price: Number(prev.price || product.price || 0),
          image: prev.image || product.imagePath || '',
          description: prev.description || product.description || ''
        }))

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

        // Initialize selected defaults for groups that are NOT already set (preserve cart values)
        setSelected(prevSelected => {
          const result = { ...prevSelected }
          groups.forEach(g => {
            if (result[g.group] == null) {
              // if allowSkip -> null default; else pick first option id if exists
              result[g.group] = g.allowSkip ? null : (g.options.length > 0 ? g.options[0].id : null)
            } else {
              // if stored value exists but it's an id not matching any option (rare), keep it but that's okay
            }
          })
          return result
        })
      })
      .catch(e => {
        console.error('fetch condiment error', e)
        setErr(e.message || 'Fetch error')
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

      if (Array.isArray(val)) {
        // multiple selections stored as array
        return acc + val.reduce((s, v) => {
          const opt = g.options.find(o => o.id === v)
          return s + (opt ? Number(opt.price || 0) : 0)
        }, 0)
      }

      // single selection
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
      if (allowSkip) {
        clone[groupKey] = current === optionId ? null : optionId
      } else {
        clone[groupKey] = optionId
      }
      return clone
    })
  }

  function validateSelection() {
    const missing = addons.filter(g => !g.allowSkip && (selected[g.group] == null))
    if (missing.length > 0) {
      const names = missing.map(m => m.name || m.group).join(', ')
      alert(`Silakan pilih: ${names}`)
      return false
    }
    return true
  }

  function buildOrderObject() {
    return {
      productCode,
      title: item.title || '',
      price: Number(item.price || 0),
      qty: Number(qty || 1),
      image: item.image || '/images/gambar-menu.jpg',
      note,
      addons: addons.map(g => {
        const val = selected[g.group]
        return { group: g.group, selected: Array.isArray(val) ? val.slice() : (val ?? null) }
      })
    }
  }

  // add or update cart item
  function handleAddToCart() {
    if (!validateSelection()) return
    const order = buildOrderObject()

    // determine editing index (prefer explicit editingIndex state)
    const idx = editingIndex != null ? editingIndex : null

    if (fromCheckout && idx != null) {
      try {
        updateCart(idx, order) // updateCart should write and return updated array (lib/cart)
        // cleanup session edit flag
        try { sessionStorage.removeItem('yoshi_edit') } catch (e) {}
        router.push('/checkout')
      } catch (e) {
        console.error('updateCart failed', e)
        alert('Gagal memperbarui pesanan. Coba lagi.')
      }
    } else {
      try {
        addToCart(order)
        router.push('/menu')
      } catch (e) {
        console.error('addToCart failed', e)
        alert('Gagal menambahkan ke keranjang. Coba lagi.')
      }
    }
  }

  // UI: unchanged. Ensure Image uses item.image, title uses item.title, price uses item.price,
  // qty/note reflect state, radio checked uses selected[...] (which we filled from cart earlier)
  return (
    <div className={styles.page}>
      <div className={styles.headerArea}>
        <div className={styles.btnLeft}>
          <button onClick={() => router.push(`/menu`)} aria-label="Cancel" className={styles.iconBtn}>
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
            src={item.image || '/images/placeholder-390x390.png'}
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

        {!loading && addons.map(g => (
          <section key={g.group} className={styles.addonGroup}>
            <div className={styles.groupHeader}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <div className={styles.groupTitle}>{g.name || g.group}</div>
                <div className={styles.groupSub}>Maks. {g.max ?? 1} item</div>
              </div>
            </div>

            <div>
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
          <StickyCartBar qty={qty} setQty={setQty} subtotal={subtotal} onAdd={handleAddToCart} />
        </div>
      </div>
    </div>
  )
}
