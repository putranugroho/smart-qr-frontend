// components/ComboDetail.js
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import styles from '../styles/ItemDetail.module.css' // reuse styling
import { addToCart, getCart, updateCart, replaceCartAtIndex } from '../lib/cart'
import StickyCartBar from './StickyCartBar'
import { getUser } from '../lib/auth'

const NONE_OPTION_ID = '__NONE__'
const NO_ADDON_CODE = '__NO_ADDON__' // represent "Tanpa Add On" as a synthetic product

function formatRp(n) {
  if (n == null) return '-'
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

// normalize product object shape coming from different backends (fetched vs prev / cart-derived)
function normalizeProduct(p) {
  if (!p) return p
  const out = { ...p }
  out.code = String(p.code ?? p.id ?? '')
  out.name = p.name || p.itemName || p.itemName || ''
  out.imagePath = p.imagePath || p.image || null
  out.price = Number(p.price || 0)
  out.qty = Number(p.qty || p.quantity || 1)
  out.condimentGroups = Array.isArray(p.condimentGroups) ? p.condimentGroups : (Array.isArray(p.condiments) && p.condiments.length ? p.condimentGroups || [] : p.condimentGroups || [])
  out.taxes = Array.isArray(p.taxes) ? p.taxes : (p.taxes || [])
  return out
}

function mergeComboStates(prev, fetched) {
  if (!fetched) return prev || fetched || null;
  if (!prev) return fetched;

  // clone fetched as base
  const out = JSON.parse(JSON.stringify(fetched));

  // build map for prev groups by key to preserve their products/condiments
  const prevGroups = Array.isArray(prev.comboGroups) ? prev.comboGroups : [];
  const fetchedGroups = Array.isArray(fetched.comboGroups) ? fetched.comboGroups : [];

  const mapPrev = {}
  prevGroups.forEach(g => {
    const key = (g.code ?? g.name ?? String(g.id))
    mapPrev[key] = g
  })

  // for each fetched group, merge products with prev group's products (if any)
  const mergedGroups = fetchedGroups.map(fg => {
    const key = (fg.code ?? fg.name ?? String(fg.id))
    const prevG = mapPrev[key]

    // start with fetched group's copy
    const mergedGroup = JSON.parse(JSON.stringify(fg))

    // normalize fetched group's products first
    const fetchedProducts = Array.isArray(mergedGroup.products) ? mergedGroup.products.map(normalizeProduct) : []

    // if prev group existed, merge product lists so selected product (prev) remains visible
    if (prevG && Array.isArray(prevG.products)) {
      const prevProducts = prevG.products.map(normalizeProduct)

      // index products by code/id to merge uniquely
      const prodMap = {}
      fetchedProducts.forEach(p => {
        const pcode = String(p.code ?? p.id)
        prodMap[pcode] = p
      })
      prevProducts.forEach(p => {
        const pcode = String(p.code ?? p.id)
        if (!prodMap[pcode]) {
          // if prev product not in fetched, append it (so selection still resolvable)
          prodMap[pcode] = p
        } else {
          // merge condimentGroups carefully: prefer fetched, but add any extra conds from prev
          const fp = prodMap[pcode]
          if (!Array.isArray(fp.condimentGroups) || fp.condimentGroups.length === 0) {
            fp.condimentGroups = Array.isArray(p.condimentGroups) ? p.condimentGroups : fp.condimentGroups
          } else if (Array.isArray(p.condimentGroups) && p.condimentGroups.length) {
            // merge condimentGroups by code
            const cgMap = {}
            fp.condimentGroups.forEach(cg => {
              cgMap[cg.code ?? cg.id ?? cg.name] = cg
            })
            p.condimentGroups.forEach(cg => {
              const k = cg.code ?? cg.id ?? cg.name
              if (!cgMap[k]) cgMap[k] = cg
            })
            fp.condimentGroups = Object.keys(cgMap).map(k => cgMap[k])
          }

          // also ensure name fallback (in case fetched had null name but prev had itemName)
          if ((!fp.name || fp.name === '') && p.name) fp.name = p.name
          if ((!fp.imagePath || fp.imagePath === null) && p.imagePath) fp.imagePath = p.imagePath
          if ((!fp.price || fp.price === 0) && p.price) fp.price = p.price
        }
      })

      mergedGroup.products = Object.keys(prodMap).map(k => prodMap[k])
    } else {
      // no prev group -> keep fetched products as-is (already normalized)
      mergedGroup.products = fetchedProducts
    }

    // ensure condimentGroups are normalized for each product
    mergedGroup.products = (mergedGroup.products || []).map(pr => {
      const p = normalizeProduct(pr)
      // ensure condimentGroups items normalized
      if (Array.isArray(p.condimentGroups)) {
        p.condimentGroups = p.condimentGroups.map(cg => {
          const cgCopy = { ...cg }
          if (Array.isArray(cgCopy.products)) {
            cgCopy.products = cgCopy.products.map(cp => ({
              id: cp.code ?? cp.id ?? cp.name,
              code: cp.code ?? cp.id ?? cp.name,
              name: cp.name ?? cp.itemName ?? '',
              price: Number(cp.price || 0),
              taxes: Array.isArray(cp.taxes) ? cp.taxes : (cp.taxes || [])
            }))
          } else {
            cgCopy.products = cgCopy.products || []
          }
          return cgCopy
        })
      } else {
        p.condimentGroups = p.condimentGroups || []
      }
      return p
    })

    return mergedGroup
  })

  // If prev had groups that fetched doesn't (unlikely), append them so UI retains selections
  const fetchedKeys = new Set(mergedGroups.map(g => g.code ?? g.name ?? String(g.id)))
  prevGroups.forEach(pg => {
    const key = pg.code ?? pg.name ?? String(pg.id)
    if (!fetchedKeys.has(key)) {
      // normalize prev group's products before appending
      const clone = JSON.parse(JSON.stringify(pg))
      clone.products = Array.isArray(clone.products) ? clone.products.map(normalizeProduct) : []
      mergedGroups.push(clone)
    }
  })

  out.comboGroups = mergedGroups
  // preserve some helpful fields from prev (if fetched missing them)
  out.id = out.id || prev.id
  out.code = out.code || prev.code
  out.name = out.name || prev.name
  // ensure image fields prefer fetched imagePath but fallback to prev.image or prev.imagePath
  out.imagePath = out.imagePath || out.image || prev.imagePath || prev.image || null
  out.image = out.image || out.imagePath || prev.image || prev.imagePath || null
  out.description = out.description || prev.description || ''

  return out
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

  const [originalClientInstanceId, setOriginalClientInstanceId] = useState(null)

  const fromCheckout = String(router.query?.from || '') === 'checkout'
  const editIndexQuery = router.query?.index != null ? Number(router.query.index) : null
  const [editingIndex, setEditingIndex] = useState(editIndexQuery != null ? editIndexQuery : null)

  const comboGroups = useMemo(() => (comboState && Array.isArray(comboState.comboGroups) ? comboState.comboGroups : []), [comboState])

  // refs
  const productRefs = useRef({})
  const injectedCondimentsRef = useRef(false)    // ensure we inject condiments once per edit flow
  const fetchedFullRef = useRef(false)          // ensure we fetch full data once per edit flow
  const fallbackProductsRef = useRef({})        // store fallback products per groupKey from cart entry
  const prefilledRef = useRef(false)

  // reset guards when editingIndex changes (new edit flow)
  useEffect(() => {
    injectedCondimentsRef.current = false
    fetchedFullRef.current = false
    prefilledRef.current = false
    setOriginalClientInstanceId(null)
  }, [editingIndex])

  // Keep comboState in sync if provided as prop or query
  useEffect(() => {
    if (propCombo) setComboState(propCombo)
  }, [propCombo])

  useEffect(() => {
    if (comboFromQuery) setComboState(comboFromQuery)
  }, [comboFromQuery])

  useEffect(() => {
    if (editIndexQuery != null) {
      setEditingIndex(Number(editIndexQuery))
    }
  }, [editIndexQuery])

  // prune sessionStorage combo_* keys to avoid clutter
  useEffect(() => {
    try {
      const keys = Object.keys(sessionStorage || {}).filter(k => k.startsWith('combo_'))
      if (keys.length > 12) {
        keys.slice(0, keys.length - 10).forEach(k => sessionStorage.removeItem(k))
      }
    } catch (e) {}
  }, [])

  // Recover / prefill for edit
  useEffect(() => {
    async function recoverComboForEdit() {
      if (!fromCheckout || editingIndex == null) return
      try {
        setLoadingCombo(true)
        const cart = getCart() || []
        const entry = cart[editingIndex]
        if (!entry || entry.type !== 'combo') {
          setLoadingCombo(false)
          return
        }

        // store original clientInstanceId so payload uses same id when updating
        const existingClientId = entry.clientInstanceId || (entry.detailCombo && entry.detailCombo.clientInstanceId) || null
        if (existingClientId) setOriginalClientInstanceId(String(existingClientId))

        const firstComboBlock = Array.isArray(entry.combos) && entry.combos.length > 0 ? entry.combos[0] : null
        const comboCode = (entry.detailCombo && (entry.detailCombo.code || entry.detailCombo.name)) || (firstComboBlock && (firstComboBlock.detailCombo?.code || firstComboBlock.detailCombo?.name)) || null

        // build mapping sp/sc from cart entry early so we can apply them after fetch/merge
        const sp = {}
        const sc = {}
        if (firstComboBlock && Array.isArray(firstComboBlock.products)) {
          firstComboBlock.products.forEach(p => {
            const rawGroupMarker = p.comboGroup ?? p.comboGroupCode ?? null

            // try to match to current comboState groups if present
            let matchedKey = null
            if (rawGroupMarker && comboState && Array.isArray(comboState.comboGroups)) {
              const found = comboState.comboGroups.find(g => {
                const k = (g.code ?? g.name ?? String(g.id))
                return String(k) === String(rawGroupMarker) || String(g.code) === String(rawGroupMarker) || String(g.name) === String(rawGroupMarker)
              })
              if (found) matchedKey = (found.code ?? found.name ?? String(found.id))
            }

            const finalKey = matchedKey || rawGroupMarker || (`group_${p.comboGroup || p.comboGroupCode || 'x'}`)
            if (finalKey && p.code) sp[finalKey] = p.code

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

        // 1) try from sessionStorage (only accept if comboGroups exist)
        if (comboCode) {
          try {
            const key = `combo_${String(comboCode)}`
            const raw = sessionStorage.getItem(key)
            if (raw) {
              try {
                const parsed = JSON.parse(raw)
                if (Array.isArray(parsed.comboGroups) && parsed.comboGroups.length > 0) {
                  // apply parsed and selections
                  setComboState(parsed)
                  setSelectedProducts(sp)
                  setSelectedCondiments(sc)
                  // expanded group
                  try {
                    const firstUnpicked = (parsed.comboGroups || []).find(g => !sp[(g.code ?? g.name ?? String(g.id))])
                    const firstGroup = firstUnpicked ? (firstUnpicked.code ?? firstUnpicked.name ?? String(firstUnpicked.id)) : (parsed.comboGroups[0] ? (parsed.comboGroups[0].code ?? parsed.comboGroups[0].name ?? String(parsed.comboGroups[0].id)) : null)
                    const groupToOpen = firstGroup || (Object.keys(sp)[0] || null)
                    if (groupToOpen) {
                      setExpandedGroup(groupToOpen)
                      const selProd = sp[groupToOpen]
                      if (selProd) {
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => {
                            scrollToProduct(selProd, groupToOpen)
                          })
                        })
                      }
                    }
                  } catch (e) {}
                  setLoadingCombo(false)
                  prefilledRef.current = true
                  return
                }
                // otherwise fallthrough to fetch
              } catch (e) {}
            }
          } catch (e) {}
        }

        // 2) try fetch API (fetch list, then find matching combo by code)
        if (comboCode) {
          try {
            const url = `/api/proxy/combo-list?orderCategoryCode=DI&storeCode=MGI`
            const r = await fetch(url)
            if (r.ok) {
              const j = await r.json()
              const list = Array.isArray(j?.data) ? j.data : (Array.isArray(j?.combo) ? j.combo : [])
              if (Array.isArray(list) && list.length) {
                // prefer matching comboCode from query / cart
                const needle = String(comboCode)
                let found = list.find(x => String(x.code) === needle)
                if (!found) found = list.find(x => String(x.code).toLowerCase() === needle.toLowerCase())
                if (!found) found = list.find(x => String(x.name || '').toLowerCase() === needle.toLowerCase())

                if (found) {
                  try { if (found.code) sessionStorage.setItem(`combo_${String(found.code)}`, JSON.stringify(found)) } catch (e) {}
                  // merge into existing comboState so we don't lose title/image or injected condiments
                  setComboState(prev => {
                    try {
                      return mergeComboStates(prev || comboState || {}, found) || found
                    } catch (err) {
                      return found
                    }
                  })

                  // apply selections from cart entry (sp/sc)
                  setSelectedProducts(sp)
                  setSelectedCondiments(sc)

                  // set expanded group to a useful one (use found's groups)
                  try {
                    const groupList = Array.isArray(found.comboGroups) ? found.comboGroups : (comboState?.comboGroups || [])
                    const firstUnpicked = groupList.find(g => !sp[(g.code ?? g.name ?? String(g.id))])
                    const firstGroup = firstUnpicked ? (firstUnpicked.code ?? firstUnpicked.name ?? String(firstUnpicked.id)) : (groupList[0] ? (groupList[0].code ?? groupList[0].name ?? String(groupList[0].id)) : null)
                    const groupToOpen = firstGroup || (Object.keys(sp)[0] || null)
                    if (groupToOpen) {
                      setExpandedGroup(groupToOpen)
                      const selProd = sp[groupToOpen]
                      if (selProd) {
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => {
                            scrollToProduct(selProd, groupToOpen)
                          })
                        })
                      }
                    }
                  } catch (e) {}

                  prefilledRef.current = true
                  setLoadingCombo(false)
                  return
                } else {
                  console.debug('[ComboDetail] fetch: did not find combo matching code', comboCode)
                }
              }
            }
          } catch (e) {
            console.warn('[ComboDetail] recover fetch error', e)
          }
        }

        // 3) fallback: build minimal combo from cart entry but ensure condimentGroups are derived from product items (so UI shows addon options)
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

            // ensure condimentGroups exist if product has condiments info
            const condimentGroups = Array.isArray(p.condiments) && p.condiments.length
              ? // convert condiments array into simple condimentGroup structure if needed
                [{
                  id: `cond_${p.code || p.id}`,
                  code: `cond_${p.code || p.id}`,
                  name: 'Add On',
                  allowSkip: true,
                  products: (p.condiments || []).map(c => ({
                    id: c.code ?? c.id ?? c.name,
                    code: c.code ?? c.id ?? c.name,
                    name: c.name ?? '',
                    price: c.price ?? 0,
                    taxes: c.taxes || []
                  }))
                }]
              : (p.condimentGroups || [])

            groupsMap[gKey].products.push(normalizeProduct({
              id: p.code ?? p.id,
              code: p.code ?? p.id,
              name: p.name || p.itemName || '',
              price: p.price ?? 0,
              imagePath: p.imagePath ?? p.image ?? null,
              condimentGroups: condimentGroups
            }))
          })

          const groupsArr = Object.keys(groupsMap).map(k => groupsMap[k])

          // store fallback products keyed by groupKey for render fallback
          const fp = {}
          Object.keys(groupsMap).forEach(k => {
            const g = groupsMap[k]
            const key = g.code ?? g.name ?? String(g.id)
            fp[key] = g.products || []
          })
          fallbackProductsRef.current = fp

          const minimal = {
            id: comboCode || firstComboBlock.detailCombo?.code || null,
            code: comboCode || firstComboBlock.detailCombo?.code || null,
            name: (entry.detailCombo && entry.detailCombo.name) || (firstComboBlock.detailCombo && firstComboBlock.detailCombo.name) || 'Combo',
            description: entry.detailCombo?.description || firstComboBlock.detailCombo?.description || '',
            image: entry.detailCombo?.image || firstComboBlock.detailCombo?.image || null,
            comboGroups: groupsArr
          }
          setComboState(minimal)
          setSelectedProducts(sp)
          setSelectedCondiments(sc)

          // open useful group
          try {
            const firstUnpicked = groupsArr.find(g => !sp[(g.code ?? g.name ?? String(g.id))])
            const firstGroup = firstUnpicked ? (firstUnpicked.code ?? firstUnpicked.name ?? String(firstUnpicked.id)) : (groupsArr[0] ? (groupsArr[0].code ?? groupsArr[0].name ?? String(groupsArr[0].id)) : null)
            const groupToOpen = firstGroup || (Object.keys(sp)[0] || null)
            if (groupToOpen) {
              setExpandedGroup(groupToOpen)
              const selProd = sp[groupToOpen]
              if (selProd) {
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    scrollToProduct(selProd, groupToOpen)
                  })
                })
              }
            }
          } catch (e) {}

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

  // guarded fetch: only attempt once per edit if comboState incomplete
  useEffect(() => {
    if (!fromCheckout || editingIndex == null) return
    if (!comboState) return
    if (prefilledRef.current) return

    if (fetchedFullRef.current) return;

    try {
      // condition 1: no comboGroups at all -> need fetch
      const noGroups = !Array.isArray(comboState.comboGroups) || comboState.comboGroups.length === 0;

      // condition 2: some groups look truncated (only 0 or 1 product) -> likely fallback-from-cart with only selected item(s)
      const groupsTruncated = Array.isArray(comboState.comboGroups)
        && comboState.comboGroups.some(g => !Array.isArray(g.products) || g.products.length <= 1);

      const needsFetch = noGroups || groupsTruncated;

      if (!needsFetch) {
        fetchedFullRef.current = true; // nothing to fetch
        return;
      }

      // attempt fetch once
      (async () => {
        try {
          const code = comboState.code || comboState.id || (q.comboCode || '')
          if (!code) {
            fetchedFullRef.current = true;
            return;
          }
          console.debug('[ComboDetail] fetching full combo data for code:', code, 'because needsFetch=', needsFetch, 'groupsTruncated=', groupsTruncated);
          const url = `/api/proxy/combo-list?orderCategoryCode=DI&storeCode=MGI`
          const r = await fetch(url)
          if (r.ok) {
            const j = await r.json()
            const list = Array.isArray(j?.data) ? j.data : (Array.isArray(j?.combo) ? j.combo : [])
            if (Array.isArray(list) && list.length) {
              // find matching code from query first, then comboState.code
              const codeToFind = String(q.comboCode || comboState.code || comboState.id || '').trim()
              let found = null
              if (codeToFind) {
                found = list.find(x => String(x.code) === codeToFind) ||
                        list.find(x => String(x.code).toLowerCase() === codeToFind.toLowerCase()) ||
                        list.find(x => String(x.name || '').toLowerCase() === codeToFind.toLowerCase())
              }

              // fallback: if nothing matched and comboState is empty, take first
              const finalCombo = found || ( (!comboState || !Array.isArray(comboState.comboGroups) || comboState.comboGroups.length === 0) ? list[0] : null )

              if (finalCombo) {
                try { if (finalCombo.code) sessionStorage.setItem(`combo_${String(finalCombo.code)}`, JSON.stringify(finalCombo)) } catch (e) {}
                setComboState(prev => {
                  try {
                    return mergeComboStates(prev || comboState || {}, finalCombo) || finalCombo
                  } catch (err) {
                    return finalCombo
                  }
                })
              } else {
                console.debug('[ComboDetail] fetch returned list but no suitable combo found and comboState already present — skipping overwrite')
              }
            } else {
              console.debug('[ComboDetail] fetch returned empty list')
            }
          } else {
            console.warn('[ComboDetail] fetch failed status', r.status)
          }
        } catch (e) {
          console.warn('[ComboDetail] fetch error', e)
        } finally {
          fetchedFullRef.current = true;
        }
      })();
    } catch (e) {}
  }, [comboState, fromCheckout, editingIndex, q.comboCode])

  // prefill selectedProducts / selectedCondiments and inject condimentGroups (guarded)
  useEffect(() => {
    if (!fromCheckout || editingIndex == null) return
    if (!comboState) return
    try {
      const keys = Object.keys(sessionStorage).filter(k => k.startsWith('combo_'))
      if (keys.length > 10) {
        keys.slice(0, keys.length - 5).forEach(k => sessionStorage.removeItem(k))
      }
    } catch (e) {}
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
            // raw group marker from cart entry
            const rawGroupMarker = p.comboGroup ?? p.comboGroupCode ?? null

            // find a matching group key from comboState (try to match by code/name/id)
            let matchedKey = null
            if (rawGroupMarker && comboState && Array.isArray(comboState.comboGroups)) {
              const found = comboState.comboGroups.find(g => {
                const k = getGroupKey(g)
                return String(k) === String(rawGroupMarker) || String(g.code) === String(rawGroupMarker) || String(g.name) === String(rawGroupMarker)
              })
              if (found) matchedKey = getGroupKey(found)
            }
            // fallback: if no match, use rawGroupMarker or a synthetic group key
            const finalKey = matchedKey || rawGroupMarker || (`group_${p.comboGroup || p.comboGroupCode || 'x'}`)

            if (finalKey && p.code) sp[finalKey] = p.code

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

        // inject condimentGroups from entry into comboState so UI renders addon options (guarded by ref)
        try {
          if (!injectedCondimentsRef.current) {
            // build a map <productCode> => condiments array (raw) from cart entry
            const prodMapFromEntry = {};
            if (Array.isArray(firstCombo?.products)) {
              firstCombo.products.forEach(p => {
                const pCode = p.code ?? p.id;
                if (pCode) prodMapFromEntry[String(pCode)] = p.condiments || [];
              });
            }

            const hasAnyEntryCondiments = Object.values(prodMapFromEntry).some(arr => Array.isArray(arr) && arr.length > 0);

            if (hasAnyEntryCondiments && comboState && Array.isArray(comboState.comboGroups)) {
              // compute whether we actually need to modify comboState
              let changed = false;
              const cs = JSON.parse(JSON.stringify(comboState)); // clone to modify safely

              cs.comboGroups.forEach(g => {
                if (!Array.isArray(g.products)) return;
                g.products.forEach(prod => {
                  const pCode = prod.code ?? prod.id;
                  const entryConds = prodMapFromEntry[String(pCode)] || []
                  const prodHasConds = Array.isArray(prod.condimentGroups) && prod.condimentGroups.length > 0
                  if (!prodHasConds && entryConds.length) {
                    // inject generated condimentGroup
                    prod.condimentGroups = [{
                      id: `gen_cond_${pCode}`,
                      code: `gen_cond_${pCode}`,
                      name: 'Add On',
                      allowSkip: true,
                      products: entryConds.map(c => ({
                        id: c.code ?? c.id ?? c.name,
                        code: c.code ?? c.id ?? c.name,
                        name: c.name ?? '',
                        price: c.price ?? 0,
                        taxes: c.taxes || []
                      }))
                    }];
                    changed = true;
                  }
                });
              });

              if (changed) {
                setComboState(cs);
              }
            }

            injectedCondimentsRef.current = true; // mark done for this edit flow
          }
        } catch (e) {
          console.warn('inject condimentGroups failed', e)
        }

        setSelectedProducts(sp)
        setSelectedCondiments(sc)

        // determine expanded group to show
        try {
          const firstUnpicked = comboGroups.find(g => !sp[(g.code ?? g.name ?? String(g.id))])
          const firstGroup = firstUnpicked ? (firstUnpicked.code ?? firstUnpicked.name ?? String(firstUnpicked.id)) : (comboGroups[0] ? (comboGroups[0].code ?? comboGroups[0].name ?? String(comboGroups[0].id)) : null)
          const groupToOpen = firstGroup || (Object.keys(sp)[0] || null)
          if (groupToOpen) {
            setExpandedGroup(groupToOpen)
            const selProd = sp[groupToOpen]
            if (selProd) {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  scrollToProduct(selProd, groupToOpen)
                })
              })
            }
          }
        } catch (e) {}
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

  // compute subtotal
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
        name: prod.name ?? '',
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
              name: opt.name ?? '',
              price: Number(opt.price || 0),
              qty: Number(opt.qty || 1) || 1,
              taxes: (opt.taxes || []).map(t => ({ taxName: t.name || t.code || '', taxPercentage: Number(t.amount || 0), taxAmount: 0 }))
            })
          })
        } else {
          const opt = (g.products || []).find(p => String(p.code ?? p.id) === String(sel))
          if (opt) {
            productPayload.condiments.push({
              code: opt.code ?? opt.id,
              name: opt.name ?? '',
              price: Number(opt.price || 0),
              qty: Number(opt.qty || 1) || 1,
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

    // ensure clientInstanceId persisted so update/replace can identify the entry
    try {
      const cid = originalClientInstanceId || `cli_${(comboState.code || comboState.id || 'x')}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`
      cartEntry.clientInstanceId = cid
      if (cartEntry.detailCombo) cartEntry.detailCombo.clientInstanceId = cid
      if (Array.isArray(cartEntry.combos)) {
        cartEntry.combos = cartEntry.combos.map(c => ({ ...c, clientInstanceId: cid }))
      }
    } catch (e) {}

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

      if (fromCheckout && editingIndex != null) {
        // replace the cart entry at the editing index so we don't accidentally merge/accumulate qty
        try {
          replaceCartAtIndex(Number(editingIndex), payload)
        } catch (e) {
          // fallback: try updateCart if replace isn't available for some reason
          updateCart(Number(editingIndex), payload)
        }
      } else {
        addToCart(payload)
      }
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

  // debug helper (can remove later)
  useEffect(() => {
    try {
      if (fromCheckout && editingIndex != null) {
        console.debug('[DEBUG ComboDetail] comboState:', comboState)
        console.debug('[DEBUG ComboDetail] comboGroups keys:', (comboState?.comboGroups || []).map(g => getGroupKey(g)))
        console.debug('[DEBUG ComboDetail] selectedProducts:', selectedProducts)
        console.debug('[DEBUG ComboDetail] selectedCondiments:', selectedCondiments)
        console.debug('[DEBUG ComboDetail] fallbackProductsRef:', fallbackProductsRef.current)
      }
    } catch (e) {}
  }, [comboState, selectedProducts, selectedCondiments, fromCheckout, editingIndex])

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
                        {selProdObj ? (selProdObj.name || selProdObj.itemName) : (selectedProducts[key] === NO_ADDON_CODE ? 'Tanpa Add On' : (g.allowSkip ? 'Boleh dikosongkan' : 'Belum dipilih'))}
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

            // use fallback products if grp.products is empty
            const products = (Array.isArray(grp.products) && grp.products.length)
              ? grp.products
              : (fallbackProductsRef.current[getGroupKey(grp)] || [])

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
                            <div style={{ fontWeight: 600 }}>{p.name || p.itemName}</div>
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