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

function resolveOrderType({ isEdit, router, editingIndex }) {
  const user = getUser?.() || null

  // NEW ITEM
  if (!isEdit) return user?.orderType || 'DI'

  // 1️⃣ dari query (Checkout.js versi baru)
  if (router.query?.orderType) {
    return String(router.query.orderType)
  }

  // 2️⃣ dari sessionStorage yoshi_edit
  try {
    const raw = sessionStorage.getItem('yoshi_edit')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.orderType) return parsed.orderType
    }
  } catch (e) {}

  // 3️⃣ dari cart entry
  try {
    const cart = getCart() || []
    const entry = cart[editingIndex]
    const ot =
      entry?.orderType ||
      entry?.combos?.[0]?.orderType ||
      entry?.detailCombo?.orderType
    if (ot) return ot
  } catch (e) {}

  // fallback terakhir
  return user?.orderType || 'DI'
}


function mergeComboStates(prev, fetched) {
  if (!fetched) return prev || fetched || null;
  if (!prev) {
    // console.log('[MERGE] Tidak ada data sebelumnya, menggunakan data fetched.');
    return fetched;
  }
  
  // console.log('[MERGE] Menggabungkan data. Produk yang dipilih sebelumnya akan diprioritaskan.');

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

    // if prev group existed, merge product lists so selected product (prev) remains visible
    if (prevG && Array.isArray(prevG.products)) {
      const prevProducts = prevG.products || []
      const fetchedProducts = Array.isArray(mergedGroup.products) ? mergedGroup.products : []

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
          // console.log(`[MERGE] Produk cart: ${pcode} (${p.name}) ditambahkan ke grup ${key} karena tidak ada di data API.`);
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
        }
      })

      mergedGroup.products = Object.keys(prodMap).map(k => prodMap[k])
    } else {
      // no prev group -> keep fetched products as-is
      mergedGroup.products = Array.isArray(mergedGroup.products) ? mergedGroup.products : []
    }

    return mergedGroup
  })

  // If prev had groups that fetched doesn't (unlikely), append them so UI retains selections
  const fetchedKeys = new Set(mergedGroups.map(g => g.code ?? g.name ?? String(g.id)))
  prevGroups.forEach(pg => {
    const key = pg.code ?? pg.name ?? String(pg.id)
    if (!fetchedKeys.has(key)) {
      mergedGroups.push(pg)
    }
  })

  out.comboGroups = mergedGroups
  // preserve some helpful fields from prev (if fetched missing them)
  out.id = out.id || prev.id
  out.code = out.code || prev.code
  out.name = out.name || prev.name
  out.image = out.image || prev.image
  out.description = out.description || prev.description

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
  const [fullscreenImg, setFullscreenImg] = useState(null)

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
  const isEdit = fromCheckout && editingIndex != null

  const resolvedOrderType = useMemo(() => {
    return resolveOrderType({ isEdit, router, editingIndex })
  }, [isEdit, router.query, editingIndex])

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

        // console.log('[RECOVER] Memulai Pemulihan Edit Index:', editingIndex);
        
        // store original clientInstanceId
        const existingClientId = entry.clientInstanceId || (entry.detailCombo && entry.detailCombo.clientInstanceId) || null
        if (existingClientId) setOriginalClientInstanceId(String(existingClientId))

        const firstComboBlock = Array.isArray(entry.combos) && entry.combos.length > 0 ? entry.combos[0] : null
        const comboCode = (entry.detailCombo && (entry.detailCombo.code || entry.detailCombo.name)) || (firstComboBlock && (firstComboBlock.detailCombo?.code || firstComboBlock.detailCombo?.name)) || null

        // console.log('[RECOVER] Combo Code terdeteksi:', comboCode);

        // build mapping sp/sc
        const sp = {}
        const sc = {}
        if (firstComboBlock && Array.isArray(firstComboBlock.products)) {
          firstComboBlock.products.forEach(p => {
            const rawGroupMarker = p.comboGroup ?? p.comboGroupCode ?? null
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
        
        // console.log('[RECOVER] Produk Terpilih (sp):', sp);

        // ============================================================
        // 1) try from sessionStorage (DENGAN VALIDASI KELENGKAPAN DATA)
        // ============================================================
        let sessionDataIncomplete = true; // Default asumsi tidak lengkap agar fetch jalan

        if (comboCode) {
          try {
            const key = `combo_${String(comboCode)}`
            const raw = sessionStorage.getItem(key)
            if (raw) {
              const parsed = JSON.parse(raw)
              
              // CEK APAKAH DATA INI LENGKAP?
              // Data lengkap setidaknya memiliki satu grup dengan lebih dari 1 produk.
              // Jika setiap grup hanya punya 1 produk, kemungkinan itu adalah data cart (minimal), bukan master data.
              const looksLikeMasterData = Array.isArray(parsed.comboGroups) && parsed.comboGroups.some(g => Array.isArray(g.products) && g.products.length > 1);

              if (looksLikeMasterData) {
                // console.log('[RECOVER] Data Session Storage LENGKAP ditemukan. Menggunakan cache.');
                sessionDataIncomplete = false; // Tandai lengkap, kita stop di sini

                setComboState(parsed)
                setSelectedProducts(sp)
                setSelectedCondiments(sc)
                
                // Logic expand group...
                try {
                  const firstUnpicked = (parsed.comboGroups || []).find(g => !sp[(g.code ?? g.name ?? String(g.id))])
                  const firstGroup = firstUnpicked ? (firstUnpicked.code ?? firstUnpicked.name ?? String(firstUnpicked.id)) : (parsed.comboGroups[0] ? (parsed.comboGroups[0].code ?? parsed.comboGroups[0].name ?? String(parsed.comboGroups[0].id)) : null)
                  const groupToOpen = firstGroup || (Object.keys(sp)[0] || null)
                  if (groupToOpen) setExpandedGroup(groupToOpen)
                } catch (e) {}
                
                setLoadingCombo(false)
                prefilledRef.current = true
                return; // STOP HERE only if data is complete
              } else {
                 // console.log('[RECOVER] Data Session Storage ditemukan tapi TIDAK LENGKAP (versi minimal). Melanjutkan ke Fetch API...');
                 // JANGAN RETURN, LANJUT KE STEP 2
              }
            }
          } catch (e) {}
        }

        // ============================================================
        // 2) try fetch API (JIKA session gagal atau data tidak lengkap)
        // ============================================================
        if (comboCode) {
          try {
            // console.log('[RECOVER] Memulai Fetch API untuk:', comboCode);
            const user = getUser?.() || {}
            const storeCode = user.storeLocation

            const url = `/api/proxy/combo-list?orderCategoryCode=${resolvedOrderType}&storeCode=${encodeURIComponent(storeCode)}`
            const r = await fetch(url)
            if (r.ok) {
              const j = await r.json()
              const list = Array.isArray(j?.data) ? j.data : (Array.isArray(j?.combo) ? j.combo : [])
              
              if (Array.isArray(list) && list.length) {
                const needle = String(comboCode)
                let found = list.find(x => String(x.code) === needle)
                if (!found) found = list.find(x => String(x.code).toLowerCase() === needle.toLowerCase())
                if (!found) found = list.find(x => String(x.name || '').toLowerCase() === needle.toLowerCase())

                if (found) {
                  // console.log('[RECOVER] Data LENGKAP ditemukan dari API:', found.name);
                  try { if (found.code) sessionStorage.setItem(`combo_${String(found.code)}`, JSON.stringify(found)) } catch (e) {}
                  
                  // PENTING: Gunakan mergeComboStates di sini
                  setComboState(prev => {
                    // prev mungkin null atau object minimal. 
                    // Kita gabungkan agar produk yang dipilih (sp) tetap aman
                    // Tapi base datanya adalah 'found' (yang lengkap)
                    try {
                        const merged = mergeComboStates(prev || {}, found);
                        // Pastikan selection diterapkan ulang jika perlu
                        return merged;
                    } catch (err) {
                        return found
                    }
                  })

                  setSelectedProducts(sp)
                  setSelectedCondiments(sc)

                  // Logic expand group...
                  try {
                    const groupList = Array.isArray(found.comboGroups) ? found.comboGroups : []
                    const firstUnpicked = groupList.find(g => !sp[(g.code ?? g.name ?? String(g.id))])
                    const firstGroup = firstUnpicked ? (firstUnpicked.code ?? firstUnpicked.name ?? String(firstUnpicked.id)) : (groupList[0] ? (groupList[0].code ?? groupList[0].name ?? String(groupList[0].id)) : null)
                    const groupToOpen = firstGroup || (Object.keys(sp)[0] || null)
                    if (groupToOpen) setExpandedGroup(groupToOpen)
                  } catch (e) {}

                  prefilledRef.current = true
                  setLoadingCombo(false)
                  return // SUCCESS Fetch
                } else {
                    // console.log('[RECOVER] Fetch berhasil tapi kode combo tidak ditemukan di list.');
                }
              }
            }
          } catch (e) {
            console.warn('[ComboDetail] recover fetch error', e)
          }
        }

        // ============================================================
        // 3) fallback (Hanya jika Fetch gagal total)
        // ============================================================
        // console.log('[RECOVER] Masuk ke Fallback (Data Minimal)');
        if (firstComboBlock && Array.isArray(firstComboBlock.products)) {
          // ... (Kode fallback lama Anda tetap disini) ...
          // Kode fallback Anda sudah benar untuk menampilkan apa adanya
          // ...
          const groupsMap = {}
          firstComboBlock.products.forEach(p => {
             // ... logika build fallback groups ...
             const gKey = p.comboGroup || p.comboGroupCode || `group_${p.comboGroup || p.comboGroupCode || 'x'}`
             if (!groupsMap[gKey]) {
                groupsMap[gKey] = {
                  id: gKey, code: gKey, name: gKey, allowSkip: true, products: []
                }
             }
             // ... push products ...
             groupsMap[gKey].products.push({
                 id: p.code ?? p.id,
                 code: p.code ?? p.id,
                 name: p.name || p.itemName || '',
                 price: p.price ?? 0,
                 imagePath: p.imagePath ?? p.image ?? null,
                 // Note: Tambahkan condimentGroups kosong atau dari p
                 condimentGroups: p.condimentGroups || [] 
             })
          })
          
          const groupsArr = Object.keys(groupsMap).map(k => groupsMap[k])
          // ... setComboState fallback ...
           const minimal = {
            id: comboCode || null,
            code: comboCode || null,
            name: (entry.detailCombo && entry.detailCombo.name) || 'Combo',
            // ...
            comboGroups: groupsArr
          }
          setComboState(minimal)
          setSelectedProducts(sp)
          setSelectedCondiments(sc)
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
          // console.log('[ComboDetail] fetching full combo data for code:', code, 'because needsFetch=', needsFetch, 'groupsTruncated=', groupsTruncated);
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
                // console.log('[ComboDetail] fetch returned list but no suitable combo found and comboState already present — skipping overwrite')
              }
            } else {
              // console.log('[ComboDetail] fetch returned empty list')
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
                        name: c.name ?? c.itemName ?? '',
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
      let line = Number(prod.price * prod.qty)
      const prodSel = selectedCondiments[prod.code] || {}
      const condGroups = Array.isArray(prod.condimentGroups) ? prod.condimentGroups : []
      condGroups.forEach(g => {
        const key = g.code || g.name || String(g.id)
        const sel = prodSel[key]
        if (!sel) return
        if (Array.isArray(sel)) {
          sel.forEach(selId => {
            const opt = (g.products || []).find(p => String(p.code ?? p.id) === String(selId))
            if (opt) line += Number(opt.price * opt.qty )
          })
        } else if (sel === NONE_OPTION_ID) {
        } else {
          const opt = (g.products || []).find(p => String(p.code ?? p.id) === String(sel))
          if (opt) line += Number(opt.price * opt.qty)
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
        itemName: prod.itemName ?? '',
        price: Number(prod.price),
        qty: Number(prod.qty),
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
              qty: Number(opt.qty),
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
              qty: Number(qty || 1) || 1,
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
          itemName: comboState.itemName || '',
          image: comboState.imagePath || comboState.image || null,
        },
        isFromMacro: true,
        orderType: resolvedOrderType,
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
    console.log("payload combo", payload);
    
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

  const loadingStyle = (
    <style>{`
      .loading-overlay {
        position: fixed;
        top: 0; 
        left: 0; 
        right: 0; 
        bottom: 0;
        background-color: rgba(255, 255, 255, 0.85); /* Putih transparan */
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(2px); /* Efek blur halus */
      }
      .spinner {
        width: 48px;
        height: 48px;
        border: 5px solid #e5e7eb;
        border-top: 5px solid #F97316; /* Ganti warna sesuai tema (misal: Orange) */
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 16px;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .loading-text {
        font-weight: 600;
        color: #374151;
        font-size: 16px;
        animation: pulse 1.5s infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    `}</style>
  )

  // debug helper (can remove later)
  useEffect(() => {
    try {
      if (fromCheckout && editingIndex != null) {
        // console.log('[DEBUG ComboDetail] comboState:', comboState)
        // console.log('[DEBUG ComboDetail] comboGroups keys:', (comboState?.comboGroups || []).map(g => getGroupKey(g)))
        // console.log('[DEBUG ComboDetail] selectedProducts:', selectedProducts)
        // console.log('[DEBUG ComboDetail] selectedCondiments:', selectedCondiments)
        // console.log('[DEBUG ComboDetail] fallbackProductsRef:', fallbackProductsRef.current)
      }
    } catch (e) {}
  }, [comboState, selectedProducts, selectedCondiments, fromCheckout, editingIndex])

  return (
    <div className={styles.page}>
      {/* Inject CSS Styles */}
      {highlightStyle}
      {loadingStyle} 

      {/* --- UI LOADING OVERLAY --- */}
      {loadingCombo && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <div className="loading-text">
             {fromCheckout && editingIndex != null ? 'Menyiapkan Data Pesanan...' : 'Memuat Paket...'}
          </div>
        </div>
      )}

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
          <button
            title="Fullscreen"
            className={styles.iconBtn}
            onClick={() => {
              // Ambil image asli
              const imgPath = comboState.imagePath || comboState.image || '/images/no-image-available.jpg';
              // Ubah jadi URL proxy
              const proxyUrl = `/api/image?url=${encodeURIComponent(imgPath.replace(/^https?:\/\/[^/]+\//, ''))}`;
              setFullscreenImg(proxyUrl);
            }}
          >
            ⤢
          </button>

          {fullscreenImg && (
            <div
              onClick={() => setFullscreenImg(null)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                cursor: 'zoom-out'
              }}
            >
              <img
                src={fullscreenImg}
                alt={comboState.name}
                style={{ maxWidth: '95%', maxHeight: '95%', borderRadius: 8 }}
              />
            </div>
          )}
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
              const isSelected = selProd && String(selProd) !== NO_ADDON_CODE

              // determine default product to scroll to (first product or NO_ADDON_CODE)
              const defaultProduct = (Array.isArray(g.products) && g.products.length) ? (g.products[0].code ?? g.products[0].id) : NO_ADDON_CODE

              return (
                <div key={key} style={{ 
                  borderRadius: 10,
                  overflow: 'hidden', 
                  // 🔥 BORDER ORANGE JIKA SUDAH DIPILIH
                  border: isSelected
                    ? '2px solid #f97316'
                    : expanded
                      ? '1px solid #e2e8f0'
                      : '1px solid transparent',
              
                  // 🔥 BACKGROUND ORANGE TERANG
                  background: isSelected
                    ? '#fff7ed'        // orange-50
                    : expanded
                      ? '#fff'
                      : 'transparent',
                  boxShadow: isSelected
                    ? '0 0 0 2px rgba(249, 115, 22, 0.25)'
                    : 'none',              
                  transition: 'all 0.2s ease'
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px' }}>
                    <div>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {g.name}
                        {isSelected && (
                          <span
                            style={{
                              fontSize: 11,
                              background: '#f97316',
                              color: '#fff',
                              padding: '2px 6px',
                              borderRadius: 999
                            }}
                          >
                            Dipilih
                          </span>
                        )}
                      </div>
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

            // use fallback products if grp.products is empty
            const products = (Array.isArray(grp.products) && grp.products.length)
              ? grp.products
              : (fallbackProductsRef.current[getGroupKey(grp)] || [])
            
            // console.log(`[UI RENDER] Group: ${grp.name}. Total Products: ${products.length}.`);
            // console.log(`[UI RENDER] Daftar Produk:`, products.map(p => p.name));

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
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '64px 1fr auto',
                          alignItems: 'center',
                          gap: 12,
                          padding: 10,
                          minHeight: 84,
                          borderRadius: 8,
                          background: '#fff',
                          border: checked ? '1.5px solid #f97316' : '1px solid #e5e7eb'
                        }}
                      >
                        {/* IMAGE COLUMN */}
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            position: 'relative',
                            borderRadius: 8,
                            overflow: 'hidden',
                            background: 'transparant'
                          }}
                        >
                          {p.imagePath && (
                            <Image
                              src={p.imagePath}
                              alt={p.name}
                              fill
                              style={{ objectFit: 'contain' }}
                            />
                          )}
                        </div>

                        {/* TEXT COLUMN */}
                        <div style={{ overflow: 'hidden' }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              lineHeight: '18px',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}
                          >
                            {p.name}
                          </div>

                          {p.description && (
                            <div
                              style={{
                                fontSize: 12,
                                color: '#6b7280',
                                lineHeight: '16px',
                                marginTop: 2,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              {p.description}
                            </div>
                          )}
                        </div>

                        {/* PRICE + RADIO COLUMN */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            minWidth: 110,
                            justifyContent: 'flex-end'
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {formatRp(p.maskingprice * p.qty)}
                          </div>

                          <input
                            type="radio"
                            name={`prod-${getGroupKey(grp)}`}
                            checked={checked}
                            onChange={() => handleSelectProduct(getGroupKey(grp), pCode)}
                          />
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
      {!fullscreenImg && (
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
      )}

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