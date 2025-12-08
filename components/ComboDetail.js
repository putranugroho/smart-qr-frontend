// components/ComboDetail.js
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import styles from '../styles/ItemDetail.module.css' // reuse styling
import { addToCart, getCart } from '../lib/cart'
import StickyCartBar from './StickyCartBar'
import { getUser } from '../lib/auth'

const NONE_OPTION_ID = '__NONE__'
const NO_ADDON_CODE = '__NO_ADDON__' // represent "Tanpa Add On" as a synthetic product

function formatRp(n) {
  if (n == null) return '-'
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

export default function ComboDetail({ combo: propCombo = null }) {
  const router = useRouter()
  const q = router.query

  const comboFromQuery = useMemo(() => {
    try {
      if (q.combo) return JSON.parse(String(q.combo))
      if (q.item) return JSON.parse(String(q.item))
    } catch (e) { /* ignore parse errors */ }
    return null
  }, [q.combo, q.item])

  const [comboState, setComboState] = useState(propCombo || comboFromQuery || null)

  const [selectedProducts, setSelectedProducts] = useState({})
  const [selectedCondiments, setSelectedCondiments] = useState({})
  const [expandedGroup, setExpandedGroup] = useState(null)

  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [showPopup, setShowPopup] = useState(false)
  const [addAnimating, setAddAnimating] = useState(false)
  const [missingAddons, setMissingAddons] = useState(null)
  const toastTimerRef = useRef(null)
  const [loadingCombo, setLoadingCombo] = useState(false)

  const fromCheckout = String(router.query?.from || '') === 'checkout'
  const editIndexQuery = router.query?.index != null ? Number(router.query.index) : null
  const [editingIndex] = useState(editIndexQuery != null ? editIndexQuery : null)

  const comboGroups = useMemo(() => (comboState && Array.isArray(comboState.comboGroups) ? comboState.comboGroups : []), [comboState])

  useEffect(() => {
    if (propCombo) setComboState(propCombo)
  }, [propCombo])

  useEffect(() => {
    if (comboFromQuery) setComboState(comboFromQuery)
  }, [comboFromQuery])

  // Recover / prefill for edit (kept as original)
  useEffect(() => {
    async function recoverComboForEdit() {
      if (!fromCheckout || editingIndex == null) return
      if (comboState) return
      try {
        setLoadingCombo(true)
        const cart = getCart() || []
        const entry = cart[editingIndex]
        if (!entry || entry.type !== 'combo') {
          setLoadingCombo(false)
          return
        }
        const firstComboBlock = Array.isArray(entry.combos) && entry.combos.length > 0 ? entry.combos[0] : null
        const comboCode = (entry.detailCombo && (entry.detailCombo.code || entry.detailCombo.name)) || (firstComboBlock && (firstComboBlock.detailCombo?.code || firstComboBlock.detailCombo?.name)) || null

        if (comboCode) {
          try {
            const key = `combo_${String(comboCode)}`
            const raw = sessionStorage.getItem(key)
            if (raw) {
              try {
                const parsed = JSON.parse(raw)
                setComboState(parsed)
                setLoadingCombo(false)
                return
              } catch (e) {}
            }
          } catch (e) {}
        }

        if (comboCode) {
          try {
            const url = `/api/proxy/combo-detail?comboCode=${encodeURIComponent(comboCode)}&orderCategoryCode=DI&storeCode=MGI`
            const r = await fetch(url)
            if (r.ok) {
              const j = await r.json()
              const maybe = Array.isArray(j?.data) && j.data.length ? j.data[0] : (j?.data ?? j?.combo ?? null)
              if (maybe) {
                setComboState(maybe)
                setLoadingCombo(false)
                return
              }
            }
          } catch (e) {}
        }

        if (firstComboBlock && Array.isArray(firstComboBlock.products)) {
          const groupsMap = {}
          firstComboBlock.products.forEach(p => {
            const gKey = p.comboGroup || p.comboGroupCode || `group_${p.comboGroup || p.comboGroupCode || 'x'}`
            if (!groupsMap[gKey]) {
              groupsMap[gKey] = {
                id: gKey,
                code: gKey,
                name: gKey,
                allowSkip: true,
                products: []
              }
            }
            groupsMap[gKey].products.push({
              id: p.code ?? p.id,
              code: p.code ?? p.id,
              name: p.name || p.itemName || '',
              price: p.price ?? 0,
              imagePath: p.imagePath ?? p.image ?? null,
              condimentGroups: []
            })
          })

          const groupsArr = Object.keys(groupsMap).map(k => groupsMap[k])
          const minimal = {
            id: comboCode || firstComboBlock.detailCombo?.code || null,
            code: comboCode || firstComboBlock.detailCombo?.code || null,
            name: (entry.detailCombo && entry.detailCombo.name) || (firstComboBlock.detailCombo && firstComboBlock.detailCombo.name) || 'Combo',
            description: entry.detailCombo?.description || firstComboBlock.detailCombo?.description || '',
            image: entry.detailCombo?.image || firstComboBlock.detailCombo?.image || null,
            comboGroups: groupsArr
          }
          setComboState(minimal)
          setLoadingCombo(false)
          return
        }

        setLoadingCombo(false)
      } catch (e) {
        console.warn('recoverComboForEdit failed', e)
        setLoadingCombo(false)
      }
    }
    recoverComboForEdit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCheckout, editingIndex])

  useEffect(() => {
    if (!fromCheckout || editingIndex == null) return
    if (!comboState) return
    try {
      const cart = getCart() || []
      const item = cart[editingIndex]
      if (!item) return
      if (item.type === 'combo' && Array.isArray(item.combos) && item.combos.length > 0) {
        const firstCombo = item.combos[0]
        setQty(Number(item.qty || 1))
        setNote(item.note || '')

        const sp = {}
        const sc = {}
        if (Array.isArray(firstCombo.products)) {
          firstCombo.products.forEach(p => {
            const groupKey = p.comboGroup ?? p.comboGroupCode ?? null
            if (groupKey && p.code) sp[groupKey] = p.code
            if (Array.isArray(p.condiments) && p.condiments.length > 0) {
              sc[p.code] = {}
              p.condiments.forEach(c => {
                const cg = c.comboGroupCode || c.group || c.comboGroup || null
                if (cg) sc[p.code][cg] = c.code ?? c.name ?? null
                else {
                  sc[p.code][String(c.code ?? c.name ?? c.id ?? '')] = c.code ?? c.name ?? null
                }
              })
            }
          })
        }
        setSelectedProducts(sp)
        setSelectedCondiments(sc)

        const firstUnpicked = comboGroups.find(g => !sp[(g.code ?? g.name ?? String(g.id))])
        const firstGroup = firstUnpicked ? (firstUnpicked.code ?? firstUnpicked.name ?? String(firstUnpicked.id)) : (comboGroups[0] ? (comboGroups[0].code ?? comboGroups[0].name ?? String(comboGroups[0].id)) : null)
        setExpandedGroup(firstGroup)
      }
    } catch (e) {
      console.warn('prefill combo edit failed', e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCheckout, editingIndex, comboState])

  function getGroupKey(g) {
    return g.code ?? g.name ?? String(g.id)
  }

  function findComboGroupByKey(key) {
    if (!comboState) return null
    return (comboState.comboGroups || []).find(g => getGroupKey(g) === String(key))
  }

  function findProductInGroup(group, productCode) {
    if (!group) return null
    return (group.products || []).find(p => (p.code ?? String(p.id)) === String(productCode))
  }

  function toggleExpandGroup(key) {
    setExpandedGroup(prev => (prev === key ? null : key))
    setMissingAddons(null)
  }

  function handleSelectProduct(groupKey, productCode) {
    setSelectedProducts(prev => {
      const next = { ...prev }
      const prevProduct = next[groupKey]
      if (prevProduct && prevProduct === productCode) {
        // no change
      } else {
        if (prevProduct) {
          setSelectedCondiments(scPrev => {
            const scNext = { ...scPrev }
            if (scNext[prevProduct]) delete scNext[prevProduct]
            return scNext
          })
        }
        next[groupKey] = productCode
      }
      return next
    })

    const idx = (comboState?.comboGroups || []).findIndex(g => getGroupKey(g) === String(groupKey))
    if (idx >= 0 && idx < (comboState?.comboGroups?.length || 0) - 1) {
      const nextGroup = comboState.comboGroups[idx + 1]
      const nextKey = getGroupKey(nextGroup)
      setExpandedGroup(nextKey)
    } else {
      setExpandedGroup(groupKey)
    }
    setMissingAddons(null)
  }

  function handleSelectCondiment(productCode, condGroupCode, value, groupMax = 1) {
    setSelectedCondiments(prev => {
      const next = { ...(prev || {}) }
      const prodMap = next[productCode] ? { ...next[productCode] } : {}

      if (groupMax > 1) {
        const arr = Array.isArray(prodMap[condGroupCode]) ? [...prodMap[condGroupCode]] : []
        const idx = arr.indexOf(value)
        if (idx >= 0) arr.splice(idx, 1)
        else {
          arr.push(value)
          if (arr.length > groupMax) arr.splice(0, arr.length - groupMax)
        }
        prodMap[condGroupCode] = arr
      } else {
        prodMap[condGroupCode] = value
      }
      next[productCode] = prodMap
      return next
    })
    setMissingAddons(null)
  }

  // product element refs map
  const productRefs = useRef({})

  // scroll/drag function: expand group (if needed), then scroll to product element smoothly and highlight
  function scrollToProduct(productCode, groupKey = null) {
    // ensure expandedGroup is set to the product's group
    if (groupKey) {
      setExpandedGroup(groupKey)
    }

    // wait next paint to ensure DOM updated
    requestAnimationFrame(() => {
      // small delay to allow expandedGroup render
      requestAnimationFrame(() => {
        const el = productRefs.current[String(productCode)]
        if (el && el.scrollIntoView) {
          try {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            // highlight effect
            el.classList.add('combo-highlight')
            // remove highlight after 900ms
            setTimeout(() => {
              el.classList.remove('combo-highlight')
            }, 900)
          } catch (e) {
            // fallback silent
            el.scrollIntoView()
          }
        }
      })
    })
  }

  // compute subtotal (kept same)
  const subtotal = useMemo(() => {
    if (!comboState) return 0
    let total = 0
    Object.keys(selectedProducts).forEach(groupKey => {
      const productCode = selectedProducts[groupKey]
      if (!productCode) return
      if (String(productCode) === NO_ADDON_CODE) return
      const grp = findComboGroupByKey(groupKey)
      const prod = findProductInGroup(grp, productCode)
      if (!prod) return
      let line = Number(prod.price || 0)
      const prodSel = selectedCondiments[prod.code] || {}
      const condGroups = Array.isArray(prod.condimentGroups) ? prod.condimentGroups : []
      condGroups.forEach(g => {
        const key = g.code || g.name || String(g.id)
        const sel = prodSel[key]
        if (!sel) return
        if (Array.isArray(sel)) {
          sel.forEach(selId => {
            const opt = (g.products || []).find(p => String(p.code ?? p.id) === String(selId))
            if (opt) line += Number(opt.price || 0)
          })
        } else if (sel === NONE_OPTION_ID) {
        } else {
          const opt = (g.products || []).find(p => String(p.code ?? p.id) === String(sel))
          if (opt) line += Number(opt.price || 0)
        }
      })
      total += line
    })
    return Math.round(total * Number(qty || 1))
  }, [selectedProducts, selectedCondiments, qty, comboState])

  function buildComboCartPayload() {
    if (!comboState) return null

    const productsPayload = []

    Object.keys(selectedProducts).forEach(groupKey => {
      const prodCode = selectedProducts[groupKey]
      if (!prodCode) return
      if (String(prodCode) === NO_ADDON_CODE) return
      const grp = findComboGroupByKey(groupKey)
      const prod = findProductInGroup(grp, prodCode)
      if (!prod) return

      const productPayload = {
        code: prod.code ?? prod.id,
        comboGroup: grp.code ?? grp.name ?? groupKey,
        name: prod.name ?? prod.itemName ?? '',
        price: Number(prod.price || 0),
        qty: Number(prod.qty || 1),
        taxes: (prod.taxes || []).map(t => ({
          taxName: t.name || t.code || '',
          taxPercentage: Number(t.amount || 0),
          taxAmount: 0
        })),
        condiments: []
      }

      const prodCondMap = selectedCondiments[prod.code] || {}
      const condGroups = Array.isArray(prod.condimentGroups) ? prod.condimentGroups : []
      condGroups.forEach(g => {
        const gKey = g.code || g.name || String(g.id)
        const sel = prodCondMap[gKey]
        if (!sel) return
        if (Array.isArray(sel)) {
          sel.forEach(selId => {
            const opt = (g.products || []).find(p => String(p.code ?? p.id) === String(selId))
            if (!opt) return
            productPayload.condiments.push({
              code: opt.code ?? opt.id,
              name: opt.name ?? opt.itemName ?? '',
              price: Number(opt.price || 0),
              qty: Number(opt.qty || 1),
              taxes: (opt.taxes || []).map(t => ({ taxName: t.name || t.code || '', taxPercentage: Number(t.amount || 0), taxAmount: 0 }))
            })
          })
        } else {
          const opt = (g.products || []).find(p => String(p.code ?? p.id) === String(sel))
          if (opt) {
            productPayload.condiments.push({
              code: opt.code ?? opt.id,
              name: opt.name ?? opt.itemName ?? '',
              price: Number(opt.price || 0),
              qty: Number(opt.qty || 1),
              taxes: (opt.taxes || []).map(t => ({ taxName: t.name || t.code || '', taxPercentage: Number(t.amount || 0), taxAmount: 0 }))
            })
          }
        }
      })

      const calcLineTaxes = (price, qty, taxesArr) => {
        return (taxesArr || []).map(t => {
          const p = Number(t.taxPercentage || t.amount || 0)
          const amount = Math.round((price * qty) * (p / 100))
          return { taxName: t.taxName || t.name || t.code || '', taxPercentage: p, taxAmount: amount }
        })
      }

      productPayload.taxes = calcLineTaxes(productPayload.price, productPayload.qty, productPayload.taxes)
      productPayload.condiments = (productPayload.condiments || []).map(c => ({ ...c, taxes: calcLineTaxes(c.price, c.qty || 1, c.taxes) }))

      productsPayload.push(productPayload)
    })

    if (productsPayload.length === 0) return null

    const user = getUser?.() || null;
    const combosForCart = [
      {
        detailCombo: {
          code: comboState.code || comboState.id,
          name: comboState.name || comboState.title || '',
          image: comboState.imagePath || comboState.image || null,
        },
        isFromMacro: true,
        orderType: user?.orderType || 'DI',
        products: productsPayload,
        qty: Number(qty || 1),
        voucherCode: null,
      },
    ];

    const cartEntry = {
      type: "combo",
      combos: combosForCart,
      qty: Number(qty || 1),
      detailCombo: combosForCart[0].detailCombo,
      note: note || "",
      image: comboState.imagePath || comboState.image || null,
    };

    return cartEntry
  }

  function validateSelectionBeforeAdd() {
    const missingGroups = []
    for (let g of comboGroups) {
      const key = getGroupKey(g)
      if (!g.allowSkip) {
        const selProd = selectedProducts[key]
        if (!selProd || String(selProd) === NO_ADDON_CODE) {
          missingGroups.push(g.name || key)
        }
      }
    }
    if (missingGroups.length > 0) return { ok: false, msg: `Pilih produk untuk: ${missingGroups.join(', ')}` }

    const missingCond = []
    Object.keys(selectedProducts).forEach(groupKey => {
      const prodCode = selectedProducts[groupKey]
      if (!prodCode || String(prodCode) === NO_ADDON_CODE) return
      const grp = findComboGroupByKey(groupKey)
      const prod = findProductInGroup(grp, prodCode)
      if (!prod) return
      const condGroups = Array.isArray(prod.condimentGroups) ? prod.condimentGroups : []
      const prodCondMap = selectedCondiments[prod.code] || {}
      condGroups.forEach(g => {
        if (!g.allowSkip) {
          const k = g.code || g.name || String(g.id)
          const sel = prodCondMap[k]
          if (sel == null || (Array.isArray(sel) && sel.length === 0) || sel === NONE_OPTION_ID) {
            missingCond.push(`${prod.name ?? ''}: ${g.name ?? k}`)
          }
        }
      })
    })

    if (missingCond.length > 0) return { ok: false, msg: missingCond.join(', ') }
    return { ok: true }
  }

  function handleAddToCart() {
    const v = validateSelectionBeforeAdd()
    if (!v.ok) {
      setMissingAddons(v.msg)
      setShowPopup(true)
      return
    }

    const payload = buildComboCartPayload()
    if (!payload) {
      alert('Payload combo tidak valid.')
      return
    }

    try {
      setAddAnimating(true)
      setTimeout(() => setAddAnimating(false), 500)

      addToCart(payload)
      setShowPopup(true)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => {
        setShowPopup(false)
        setMissingAddons(null)
        router.push('/menu')
      }, 900)
    } catch (e) {
      console.error('addToCart combo failed', e)
      alert('Gagal menambahkan ke keranjang')
    }
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const addBtnLabel = (fromCheckout && editingIndex != null) ? 'Ubah Pesanan' : 'Tambah Paket'
  const subtotalForDisplay = subtotal

  // If no combo data
  if (!comboState && !loadingCombo) {
    return (
      <div className={styles.page}>
        <div style={{ padding: 16 }}>
          <div>Data combo tidak ditemukan. Pastikan Anda mem-passing object combo ke component ini.</div>
        </div>
      </div>
    )
  }

  if (loadingCombo && !comboState) {
    return <div className={styles.page}><div style={{ padding: 16 }}>Memuat data paket...</div></div>
  }

  // inline CSS for highlight effect (minimal, won't disturb existing styling)
  const highlightStyle = (
    <style>{`
      .combo-highlight {
        box-shadow: 0 0 0 3px rgba(99,102,241,0.18);
        transition: box-shadow 220ms ease;
      }
    `}</style>
  )

  return (
    <div className={styles.page}>
      {highlightStyle}

      <div className={styles.headerArea}>
        <div className={styles.btnLeft}>
          <button
            onClick={() => {
              if (fromCheckout && editingIndex != null) router.push('/checkout')
              else router.push('/menu')
            }}
            aria-label="Back"
            className={styles.iconBtn}
          >
            ←
          </button>
        </div>

        <div className={styles.btnRight}>
          <button title="Fullscreen" className={styles.iconBtn} onClick={() => window.open(comboState.imagePath || comboState.image || '/images/no-image-available.jpg')}>⤢</button>
        </div>

        <div className={styles.imageWrapper}>
          <Image src={comboState.imagePath || comboState.image || '/images/no-image-available.jpg'} alt={comboState.name || 'combo'} fill className={styles.image} priority />
        </div>
      </div>

      <div className={styles.detailBox}>
        <div className={styles.detailRow}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>{comboState.name}</h1>
            <p className={styles.description}>{comboState.description}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'block', gap: 12, padding: 12 }}>
        {/* Left: groups summary */}
        <div style={{ flex: '0 0 320px', borderRight: '1px solid #eee', paddingRight: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Pilih Paket</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(comboState.comboGroups || []).map((g, idx) => {
              const key = getGroupKey(g)
              const selProd = selectedProducts[key]
              const selProdObj = selProd && String(selProd) !== NO_ADDON_CODE ? findProductInGroup(g, selProd) : null
              const expanded = expandedGroup === key

              // determine default product to scroll to (first product or NO_ADDON_CODE)
              const defaultProduct = (Array.isArray(g.products) && g.products.length) ? (g.products[0].code ?? g.products[0].id) : NO_ADDON_CODE

              return (
                <div key={key} style={{ borderRadius: 10, overflow: 'hidden', border: expanded ? '1px solid #e2e8f0' : '1px solid transparent', background: expanded ? '#fff' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{g.name}</div>
                      <div style={{ fontSize: 13, color: '#666' }}>
                        {selProdObj ? selProdObj.name : (selectedProducts[key] === NO_ADDON_CODE ? 'Tanpa Add On' : (g.allowSkip ? 'Boleh dikosongkan' : 'Belum dipilih'))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        onClick={() => {
                          // open group and scroll to its first product
                          setExpandedGroup(key)
                          const prodToScroll = defaultProduct
                          scrollToProduct(prodToScroll, key)
                        }}
                        type="button"
                        style={{
                          background: '#efefef',
                          border: 'none',
                          padding: '6px 10px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontSize: 13
                        }}
                        aria-label={`Pilih paket ${g.name}`}
                      >
                        Pilih Paket
                      </button>

                      <div style={{ marginLeft: 8, color: '#666' }}>{idx + 1}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: expanded group */}
        <div style={{ flex: 1 }}>
          {!expandedGroup && <div style={{ padding: 12, color: '#666' }}>Klik sebuah paket di sebelah kiri lalu pilih produk untuk setiap paket.</div>}

          {expandedGroup && (() => {
            const grp = findComboGroupByKey(expandedGroup)
            if (!grp) return <div style={{ padding: 12 }}>Paket tidak ditemukan.</div>

            const products = Array.isArray(grp.products) ? grp.products : []
            const isToppingGroup = String((grp.code || '').toUpperCase()) === 'KIDS-TOPPING-ALL' ||
                                   String((grp.name || '').toLowerCase()).includes('add on topping')

            const noAddonOption = {
              code: NO_ADDON_CODE,
              name: 'Tanpa Add On',
              description: '',
              imagePath: null,
              price: 0,
              isNoAddon: true
            }

            const productsToShow = isToppingGroup ? [noAddonOption, ...products] : products

            return (
              <div>
                <div style={{ marginBottom: 12, marginTop: 12, fontWeight: 700 }}>{grp.name}</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {productsToShow.map(p => {
                    const pCode = p.code ?? String(p.id)
                    const checked = selectedProducts[getGroupKey(grp)] === pCode
                    return (
                      <div
                        key={pCode}
                        ref={el => { if (el) productRefs.current[String(pCode)] = el }}
                        data-product-code={pCode}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 8, background: checked ? '#fff' : '#fff', border: '1px solid #f0f0f0' }}
                      >
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ width: 64, height: 64, position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#f7f7f7' }}>
                            {p.imagePath ? (<Image src={p.imagePath} alt={p.name} fill style={{ objectFit: 'cover' }} />) : null}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            <div style={{ fontSize: 13, color: '#666' }}>{p.description ?? ''}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <div style={{ minWidth: 96, textAlign: 'right', color: '#111' }}>{formatRp(p.price)}</div>
                          <input type="radio" name={`prod-${getGroupKey(grp)}`} checked={checked} onChange={() => handleSelectProduct(getGroupKey(grp), pCode)} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Sticky Cart Bar */}
      <div className={styles.stickyOuter}>
        <div className={styles.stickyInner}>
          <StickyCartBar
            qty={qty}
            setQty={setQty}
            subtotal={subtotalForDisplay}
            onAdd={handleAddToCart}
            addAnimating={addAnimating}
            addLabel={addBtnLabel}
            isEditing={fromCheckout && editingIndex != null}
          />
        </div>
      </div>

      {/* Popup modal */}
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
                    Harga : {formatRp(subtotalForDisplay)}
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
