// components/ItemDetail.js
import Image from 'next/image'
import { useEffect, useState, useMemo } from 'react'
import StickyCartBar from './StickyCartBar'
import { useRouter } from 'next/router'
import styles from '../styles/ItemDetail.module.css'
import { addToCart } from '../lib/cart'

function formatRp(n) {
  if (n == null) return '-'
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

export default function ItemDetail({ productCode: propProductCode, item: propItem = {} }) {
  const router = useRouter()
  const q = router.query

  const productCode = propProductCode || q.productCode || propItem.code || propItem.productCode || propItem.id

  const initialItem = {
    title: q.title || propItem.name || propItem.title || '',
    price: q.price ? Number(q.price) : (propItem.price ?? 0),
    image: q.image || propItem.imagePath || propItem.image || '',
    description: q.description || propItem.description || propItem.itemName || ''
  }

  const [item, setItem] = useState(initialItem)
  const [addons, setAddons] = useState([])
  // selected: single value per group (null or optionId)
  const [selected, setSelected] = useState({})
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

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

        setItem(prev => ({
          title: prev.title || product.name || '',
          price: prev.price || product.price || 0,
          image: prev.image || product.imagePath || '',
          description: prev.description || product.description || ''
        }))

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

        // init selected:
        // -> if allowSkip: default null (not selected)
        // -> else: pick first option if exists, else null
        const sel = {}
        groups.forEach(g => {
          if (g.allowSkip) sel[g.group] = null
          else sel[g.group] = g.options.length > 0 ? g.options[0].id : null
        })
        setSelected(sel)
      })
      .catch(e => {
        console.error('fetch condiment error', e)
        setErr(e.message || 'Fetch error')
      })
      .finally(() => setLoading(false))
  }, [productCode])

  const subtotal = useMemo(() => {
    const addonTotal = addons.reduce((acc, g) => {
      const key = g.group
      const val = selected[key]
      const opt = g.options.find(o => o.id === val)
      return acc + (opt ? Number(opt.price || 0) : 0)
    }, 0)
    const base = Number(item.price || 0)
    return (base + addonTotal) * Math.max(1, Number(qty || 1))
  }, [addons, selected, item.price, qty])

  // radio behaviour: allowSkip groups clicking same radio toggles off (null)
  function onToggleOption(groupKey, optionId, allowSkip) {
    setSelected(prev => {
      const clone = { ...prev }
      const current = clone[groupKey]
      if (allowSkip) {
        // deselect when clicking same
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

// ganti handleAddToCart() dengan:
function handleAddToCart() {
  if (!validateSelection()) return

  const order = {
    productCode,
    title: item.title,
    price: Number(item.price || 0),
    qty: Number(qty || 1),
    note,
    addons: addons.map(g => {
      if (g.allowSkip) return { group: g.group, selected: (selected[g.group] || []).slice() }
      return { group: g.group, selected: selected[g.group] ?? null }
    })
  }

  // simpan ke localStorage melalui util
  const newCart = addToCart(order)

  // optional: show toast/feedback
  // redirect ke menu utama (sesuaikan route Anda, saya gunakan '/menu')
  router.push('/menu')
}

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
          {/* <button title="Fullscreen" className={styles.iconBtn} onClick={() => window.open(item.image || '/images/placeholder-390x390.png', '_blank')}> */}
          <button title="Fullscreen" className={styles.iconBtn} onClick={() => window.open('/images/gambar-menu.jpg')}>
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
                const isSelected = selected[groupKey] === opt.id

                return (
                  <label key={opt.id} className={styles.optionLabel}>
                    <div className={styles.optionName}>
                      <div>{opt.name}</div>
                      {/* {opt.description ? <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>{opt.description}</div> : null} */}
                    </div>

                    <div className={styles.optionRight}>
                      <div className={styles.optionPrice}>{opt.price ? `+${formatRp(opt.price)}` : '+Rp0'}</div>

                      {/* use radio for both types; allowSkip toggles to null when clicking same */}
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
