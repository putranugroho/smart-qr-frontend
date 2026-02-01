// components/ComboDetail.js
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import styles from '../styles/ComboDetail.module.css'
import { addToCart, getCart, updateCart, replaceCartAtIndex } from '../lib/cart'
import StickyCartBar from './StickyCartBar'
import { getUser } from '../lib/auth'

const NONE_OPTION_ID = '__NONE__'
const NO_ADDON_CODE = '__NO_ADDON__'

function formatRp(n) {
  if (n == null) return '-'
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(n || 0))
}

function resolveOrderType({ isEdit, router, editingIndex }) {
  const user = getUser?.() || null
  if (!isEdit) return user?.orderType || 'DI'

  if (router.query?.orderType) return String(router.query.orderType)

  try {
    const raw = sessionStorage.getItem('yoshi_edit')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.orderType) return parsed.orderType
    }
  } catch (e) {}

  try {
    const cart = getCart() || []
    const entry = cart[editingIndex]
    const ot = entry?.orderType || entry?.combos?.[0]?.orderType || entry?.detailCombo?.orderType
    if (ot) return ot
  } catch (e) {}

  return user?.orderType || 'DI'
}

/**
 * Derive orderCategoryCode from comboCode.
 * Example: "KIOSK-DI-L-PB BEEF" => "KIOSK-DI"
 */
function deriveOrderCategoryCode({ resolvedOrderType, comboCode }) {
  const cc = String(comboCode || '').trim()
  if (!cc) return resolvedOrderType || 'DI'

  const head = cc.split(' ')[0] // "KIOSK-DI-L-PB"
  const parts = head.split('-')

  if (parts.length >= 2 && String(parts[0] || '').toUpperCase() === 'KIOSK') {
    return `${parts[1]}` // "DI"
  }

  return resolvedOrderType || 'DI'
}

/**
 * ===========================
 * SLOT HELPERS
 * ===========================
 * API master data bisa punya 2 comboGroups yang sama (code sama) untuk 2 slot berbeda.
 * UI pakai slotKey = `${base}::${idx}` supaya unik.
 * Payload ke cart tetap kirim base comboGroup (tanpa ::idx).
 */
function getBaseGroupKey(g) {
  return g?.code ?? g?.name ?? String(g?.id)
}
function getGroupKey(g, idx) {
  return `${getBaseGroupKey(g)}::${idx}`
}

/**
 * Normalisasi raw comboGroup dari cart supaya match ke master groups.
 * - Cart kadang simpan code, kadang name, kadang baseKey.
 * - handle legacy slot format: "BASE::0"
 */
function normalizeCartGroupBase(raw, masterGroups) {
  const r0 = String(raw || '').trim()
  if (!r0) return ''

  const r = r0.includes('::') ? r0.split('::')[0] : r0
  const groups = Array.isArray(masterGroups) ? masterGroups : []

  const found = groups.find(g => {
    const base = String(getBaseGroupKey(g))
    const code = g?.code != null ? String(g.code) : ''
    const name = g?.name != null ? String(g.name) : ''
    return (
      r === base ||
      r === code ||
      r === name ||
      r.toLowerCase() === base.toLowerCase() ||
      r.toLowerCase() === code.toLowerCase() ||
      r.toLowerCase() === name.toLowerCase()
    )
  })

  return found ? String(getBaseGroupKey(found)) : r
}

/**
 * Strict check: is this combo object a REAL master?
 * - Must have human-readable group names
 * - Must have rich products (name + price/image)
 * - Must have combo header info (name + desc/image)
 */
function looksLikeRealMasterCombo(c) {
  if (!c || !Array.isArray(c.comboGroups) || c.comboGroups.length === 0) return false

  const hasHumanGroupName = c.comboGroups.some(g => {
    const nm = String(g?.name || '')
    const cd = String(g?.code || '')
    return nm && (nm.toLowerCase().includes('pilih') || (nm !== cd && nm.includes(' ')))
  })

  const hasRichProducts = c.comboGroups.some(g =>
    Array.isArray(g.products) &&
    g.products.length > 1 &&
    g.products.some(p => p?.name && (p?.price != null || p?.maskingprice != null || p?.imagePath))
  )

  const hasComboHeader =
    Boolean(c?.name) && (Boolean(c?.description) || Boolean(c?.imagePath) || Boolean(c?.image))

  return hasHumanGroupName && hasRichProducts && hasComboHeader
}

function pickComboCodeFromListItem(x) {
  return (
    x?.code ||
    x?.comboCode ||
    x?.detailComboCode ||
    x?.detailCombo?.code ||
    x?.detail?.code ||
    x?.id ||
    null
  )
}

function normalizeComboCode(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function findMasterFromList(list, comboCode) {
  const needle = String(comboCode || '').trim()
  const nNeedle = normalizeComboCode(needle)
  if (!Array.isArray(list) || !needle) return null

  let found =
    list.find(x => String(pickComboCodeFromListItem(x) || '') === needle) ||
    list.find(x => String(pickComboCodeFromListItem(x) || '').toLowerCase() === needle.toLowerCase()) ||
    null
  if (found) return found

  found = list.find(x => normalizeComboCode(pickComboCodeFromListItem(x)) === nNeedle) || null
  return found
}

/**
 * Build occurrence queue dari cart products:
 * queues[baseComboGroup] = [{ code, condimentsMap }, ...]
 */
function buildCartQueues(firstComboProducts, masterGroups) {
  const queues = {}

  ;(firstComboProducts || []).forEach(p => {
    const rawBase = p.comboGroup ?? p.comboGroupCode ?? ''
    const base = normalizeCartGroupBase(rawBase, masterGroups)
    if (!base) return

    const condimentsMap = {}
    if (Array.isArray(p.condiments)) {
      p.condiments.forEach(c => {
        let cgKey = c.comboGroupCode || c.group || c.comboGroup || String(c.id)
        if (typeof cgKey === 'string' && cgKey.includes('::')) cgKey = cgKey.split('::')[0]
        condimentsMap[cgKey] = c.code ?? c.id ?? c.name
      })
    }

    if (!queues[base]) queues[base] = []
    queues[base].push({ code: p.code, condimentsMap })
  })

  return queues
}

/**
 * Apply queues ke comboGroups master sesuai urutan:
 * slot 0 ambil item pertama queue, slot 1 ambil item kedua, dst.
 */
function applyQueuesToComboGroups({ comboGroups, queues }) {
  const sp = {}
  const sc = {}

  const groups = Array.isArray(comboGroups) ? comboGroups : []
  for (let idx = 0; idx < groups.length; idx++) {
    const g = groups[idx]
    const base = String(getBaseGroupKey(g))
    const slotKey = getGroupKey(g, idx)

    const q = queues?.[base]
    if (!Array.isArray(q) || q.length === 0) continue

    const picked = q.shift()
    if (!picked?.code) continue

    const prod = (g.products || []).find(x => String(x.code ?? x.id) === String(picked.code))
    if (prod?.outOfStock) continue

    sp[slotKey] = picked.code

    const hasCond = picked.condimentsMap && Object.keys(picked.condimentsMap).length > 0
    if (hasCond) {
      sc[slotKey] = { productCode: picked.code, condiments: { ...picked.condimentsMap } }
    }
  }

  return { sp, sc }
}

/**
 * ===========================
 * STRICT MERGE (NO GROUP APPEND)
 * ===========================
 * Tujuan: MASTER comboGroups harus 100% dari fetched master.
 * Yang boleh diwariskan dari prev/fallback: condimentGroups per product jika fetched kurang.
 */
function mergeComboStatesStrict(prev, fetched) {
  if (!fetched) return prev || null
  if (!prev) return fetched

  // kalau fetched bukan real master, jangan sentuh (hindari nyampur)
  if (!looksLikeRealMasterCombo(fetched)) return prev

  const out = JSON.parse(JSON.stringify(fetched))

  const prevGroups = Array.isArray(prev.comboGroups) ? prev.comboGroups : []
  const outGroups = Array.isArray(out.comboGroups) ? out.comboGroups : []

  // map prev products by code/id
  const prevProductMap = {}
  prevGroups.forEach(g => {
    ;(g.products || []).forEach(p => {
      const k = String(p.code ?? p.id)
      if (!k) return
      prevProductMap[k] = p
    })
  })

  // only merge condimentGroups if fetched missing
  outGroups.forEach(g => {
    ;(g.products || []).forEach(p => {
      const k = String(p.code ?? p.id)
      const pp = prevProductMap[k]
      if (!pp) return

      if (!Array.isArray(p.condimentGroups) || p.condimentGroups.length === 0) {
        if (Array.isArray(pp.condimentGroups) && pp.condimentGroups.length) {
          p.condimentGroups = pp.condimentGroups
        }
      }
    })
  })

  out.id = out.id || prev.id
  out.code = out.code || prev.code
  out.name = out.name || prev.name
  out.image = out.image || prev.image
  out.imagePath = out.imagePath || prev.imagePath
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
    } catch (e) {}
    return null
  }, [q.combo, q.item])

  const [comboState, setComboState] = useState(propCombo || comboFromQuery || null)

  const [selectedProducts, setSelectedProducts] = useState({})
  const [selectedCondiments, setSelectedCondiments] = useState({})
  const [openGroups, setOpenGroups] = useState({})
  const [fullscreenImg, setFullscreenImg] = useState(null)

  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [showPopup, setShowPopup] = useState(false)
  const [addAnimating, setAddAnimating] = useState(false)
  const [missingAddons, setMissingAddons] = useState(null)
  const toastTimerRef = useRef(null)
  const [loadingCombo, setLoadingCombo] = useState(false)

  const [originalClientInstanceId, setOriginalClientInstanceId] = useState(null)
  const originalCartEntryRef = useRef(null)

  const fromCheckout = String(router.query?.from || '') === 'checkout'
  const editIndexQuery = router.query?.index != null ? Number(router.query.index) : null
  const [editingIndex, setEditingIndex] = useState(editIndexQuery != null ? editIndexQuery : null)
  const isEdit = fromCheckout && editingIndex != null
  const isEditMacro = isEdit && (Boolean(comboState?.isMacro) || Boolean(originalCartEntryRef.current?.isMacro))

  const resolvedOrderType = useMemo(() => {
    return resolveOrderType({ isEdit, router, editingIndex })
  }, [isEdit, router.query, editingIndex])

  const user = getUser?.() || {}
  const storeCode = user.storeLocation

  const comboGroups = useMemo(
    () => (comboState && Array.isArray(comboState.comboGroups) ? comboState.comboGroups : []),
    [comboState]
  )

  const isMacroCombo = Boolean(comboState?.isMacro || comboState?.macroCode)
  const [macroContext, setMacroContext] = useState(null)

  // guards
  const fetchedFullRef = useRef(false)
  const prefilledRef = useRef(false)
  const fallbackAppliedRef = useRef(false)

  const editingCID =
    router.query?.cid ||
    (() => {
      try {
        const raw = sessionStorage.getItem('yoshi_edit')
        return raw ? JSON.parse(raw)?.clientInstanceId : null
      } catch {
        return null
      }
    })()

  // reset guards when editingIndex changes + reset selections biar tidak kebawa
  useEffect(() => {
    fetchedFullRef.current = false
    prefilledRef.current = false
    fallbackAppliedRef.current = false
    setOriginalClientInstanceId(null)
    originalCartEntryRef.current = null

    setSelectedProducts({})
    setSelectedCondiments({})
    setOpenGroups({})
  }, [editingIndex])

  useEffect(() => {
    if (propCombo && !(fromCheckout && editingIndex != null)) setComboState(propCombo)
  }, [propCombo])

  useEffect(() => {
    if (comboFromQuery && !(fromCheckout && editingIndex != null)) setComboState(comboFromQuery)
  }, [comboFromQuery])

  useEffect(() => {
    if (editIndexQuery != null) setEditingIndex(Number(editIndexQuery))
  }, [editIndexQuery])

  // prune session storage
  useEffect(() => {
    try {
      const keys = Object.keys(sessionStorage || {}).filter(k => k.startsWith('combo_'))
      if (keys.length > 12) keys.slice(0, keys.length - 10).forEach(k => sessionStorage.removeItem(k))
    } catch (e) {}
  }, [])

  /**
   * ===========================
   * EDIT MODE: ENSURE REAL MASTER
   * ===========================
   */
  useEffect(() => {
    async function recoverComboForEdit() {
      if (!fromCheckout || editingIndex == null) return
      if (!storeCode || !resolvedOrderType) return

      try {
        setLoadingCombo(true)

        const cart = getCart() || []

        // find by CID first
        let entry = null
        if (editingCID) {
          entry = cart.find(
            it =>
              it?.type === 'combo' &&
              (it.clientInstanceId === editingCID ||
                it.detailCombo?.clientInstanceId === editingCID ||
                it.combos?.[0]?.clientInstanceId === editingCID)
          )
        }
        if (!entry) entry = cart[editingIndex]

        if (!entry) {
          console.warn('[ComboDetail][EDIT] entry not found', { editingCID, editingIndex })
          setLoadingCombo(false)
          router.replace('/checkout')
          return
        }

        if (!originalCartEntryRef.current) originalCartEntryRef.current = JSON.parse(JSON.stringify(entry))

        // macro context
        const macroContextFromCart = entry.isMacro
          ? {
              isMacro: true,
              macroCode: entry.macroCode,
              macroName: entry.macroName,
              maxQuantityCanGet: Number(entry.maxQuantityCanGet || 0),
              isAllowGetAnother: Boolean(entry.isAllowGetAnother)
            }
          : null
        if (macroContextFromCart) setMacroContext(macroContextFromCart)

        // cid stable
        const existingClientId = entry.clientInstanceId || entry.detailCombo?.clientInstanceId || null
        if (existingClientId) setOriginalClientInstanceId(String(existingClientId))

        // qty & note
        const rawQty = Number(entry.qty || 1)
        const maxQty = Number(entry.maxQuantityCanGet || 0)
        const finalQty = entry.isMacro && maxQty > 0 ? Math.min(rawQty, maxQty) : rawQty
        setQty(finalQty)
        setNote(entry.note || '')

        const firstComboBlock = Array.isArray(entry.combos) && entry.combos.length > 0 ? entry.combos[0] : null

        const comboCode =
          entry?.detailCombo?.code ||
          firstComboBlock?.detailCombo?.code ||
          entry?.detailCombo?.id ||
          comboState?.code ||
          comboState?.id ||
          entry?.detailCombo?.name ||
          firstComboBlock?.detailCombo?.name ||
          null

        const orderCategoryCode = deriveOrderCategoryCode({ resolvedOrderType, comboCode })

        // macro shortcut
        if (entry.isMacro) {
          if (!comboState) {
            setComboState(prev => prev || {
              code: comboCode || entry.detailCombo?.code || null,
              name: entry.detailCombo?.name || 'Combo',
              description: entry.detailCombo?.description || '',
              imagePath: entry.detailCombo?.image || entry.image || null,
              comboGroups: prev?.comboGroups || []
            })
          }
          prefilledRef.current = true
          setLoadingCombo(false)
          return
        }

        // 1) sessionStorage master (only if REAL)
        let master = null

        if (comboCode) {
          try {
            const key = `combo_${String(comboCode)}`
            const raw = sessionStorage.getItem(key)
            if (raw) {
              const parsed = JSON.parse(raw)
              if (looksLikeRealMasterCombo(parsed)) master = parsed
            }
          } catch (e) {}
        }

        // 2) fetch list then pick master (only accept if REAL)
        if (!master && comboCode) {
          const url =
            `/api/proxy/combo-list?orderCategoryCode=${encodeURIComponent(orderCategoryCode)}` +
            `&storeCode=${encodeURIComponent(storeCode)}` +
            `&pageSize=1000`

          try {
            const r = await fetch(url)
            if (r.ok) {
              const j = await r.json()
              const fetchedList = Array.isArray(j?.data) ? j.data : Array.isArray(j?.combo) ? j.combo : []
              const candidate = findMasterFromList(fetchedList, comboCode)
              if (looksLikeRealMasterCombo(candidate)) master = candidate
            }
          } catch (e) {}
        }

        // 3) if got REAL master -> strict merge (NO group append) + slot mapping
        if (master && looksLikeRealMasterCombo(master)) {
          try {
            if (master.code) sessionStorage.setItem(`combo_${String(master.code)}`, JSON.stringify(master))
          } catch (e) {}

          const merged = mergeComboStatesStrict(comboState || {}, master) || master
          setComboState(merged)

          const queues = buildCartQueues(firstComboBlock?.products || [], merged.comboGroups || [])
          const mapped = applyQueuesToComboGroups({ comboGroups: merged.comboGroups || [], queues })

          setSelectedProducts(mapped.sp)
          setSelectedCondiments(mapped.sc)
          setOpenGroups({})

          prefilledRef.current = true
          fallbackAppliedRef.current = false
          setLoadingCombo(false)
          return
        }

        // 4) fallback minimal (only if total failure to get REAL master)
        if (firstComboBlock && Array.isArray(firstComboBlock.products)) {
          const groupsMap = {}
          firstComboBlock.products.forEach(p => {
            const base = String(p.comboGroup || p.comboGroupCode || `group_x`)
            if (!groupsMap[base]) {
              groupsMap[base] = { id: base, code: base, name: base, allowSkip: true, activeCondiment: true, products: [] }
            }
            groupsMap[base].products.push({
              id: p.code ?? p.id,
              code: p.code ?? p.id,
              name: p.name || p.itemName || '',
              price: p.price ?? 0,
              maskingprice: p.price ?? 0,
              qty: p.qty ?? 1,
              imagePath: p.imagePath ?? p.image ?? null,
              outOfStock: false,
              condimentGroups: p.condimentGroups || [],
              taxes: p.taxes || []
            })
          })

          const groupsArr = Object.keys(groupsMap).map(k => groupsMap[k])
          const minimal = {
            id: comboCode || null,
            code: comboCode || null,
            name: entry.detailCombo?.name || 'Combo',
            description: entry.detailCombo?.description || '',
            imagePath: entry.detailCombo?.image || entry.image || null,
            comboGroups: groupsArr,
            ...macroContextFromCart
          }

          setComboState(minimal)

          const queues = buildCartQueues(firstComboBlock?.products || [], minimal.comboGroups)
          const mapped = applyQueuesToComboGroups({ comboGroups: minimal.comboGroups, queues })
          setSelectedProducts(mapped.sp)
          setSelectedCondiments(mapped.sc)
          setOpenGroups({})

          fallbackAppliedRef.current = true
          prefilledRef.current = false
        }

        setLoadingCombo(false)
      } catch (e) {
        console.warn('[ComboDetail][EDIT] recover failed', e)
        setLoadingCombo(false)
      }
    }

    recoverComboForEdit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCheckout, editingIndex, editingCID, resolvedOrderType, storeCode])

  /**
   * Upgrade fallback -> master
   * (tetap strict: master harus REAL; jika real -> replace comboGroups (NO append))
   */
  useEffect(() => {
    async function upgradeFallbackToMaster() {
      if (!fromCheckout || editingIndex == null) return
      if (!fallbackAppliedRef.current) return
      if (!storeCode || !resolvedOrderType) return
      if (!originalCartEntryRef.current) return
      if (looksLikeRealMasterCombo(comboState)) {
        fallbackAppliedRef.current = false
        prefilledRef.current = true
        return
      }

      try {
        setLoadingCombo(true)

        const entry = originalCartEntryRef.current
        const firstComboBlock = Array.isArray(entry.combos) && entry.combos.length > 0 ? entry.combos[0] : null

        const comboCode =
          entry?.detailCombo?.code ||
          firstComboBlock?.detailCombo?.code ||
          entry?.detailCombo?.id ||
          comboState?.code ||
          comboState?.id ||
          entry?.detailCombo?.name ||
          firstComboBlock?.detailCombo?.name ||
          null

        if (!comboCode) {
          setLoadingCombo(false)
          return
        }

        const orderCategoryCode = deriveOrderCategoryCode({ resolvedOrderType, comboCode })

        const url =
          `/api/proxy/combo-list?orderCategoryCode=${encodeURIComponent(orderCategoryCode)}` +
          `&storeCode=${encodeURIComponent(storeCode)}` +
          `&pageSize=1000`

        const r = await fetch(url)
        if (!r.ok) {
          setLoadingCombo(false)
          return
        }

        const j = await r.json()
        const list = Array.isArray(j?.data) ? j.data : Array.isArray(j?.combo) ? j.combo : []

        const candidate = findMasterFromList(list, comboCode)
        if (!looksLikeRealMasterCombo(candidate)) {
          setLoadingCombo(false)
          return
        }

        const merged = mergeComboStatesStrict(comboState || {}, candidate) || candidate
        setComboState(merged)

        const queues = buildCartQueues(firstComboBlock?.products || [], merged.comboGroups || [])
        const mapped = applyQueuesToComboGroups({ comboGroups: merged.comboGroups || [], queues })

        setSelectedProducts(mapped.sp)
        setSelectedCondiments(mapped.sc)
        setOpenGroups({})

        fallbackAppliedRef.current = false
        prefilledRef.current = true
        setLoadingCombo(false)
      } catch (e) {
        console.warn('[ComboDetail][upgrade] failed', e)
        setLoadingCombo(false)
      }
    }

    upgradeFallbackToMaster()
  }, [fromCheckout, editingIndex, storeCode, resolvedOrderType, comboState])

  /**
   * Safety net fetch in edit:
   * Only if not yet prefilled with REAL master.
   * STRICT: kalau found real master -> replace groups strictly.
   */
  useEffect(() => {
    if (!fromCheckout || editingIndex == null) return
    if (!comboState) return
    if (prefilledRef.current) return
    if (fetchedFullRef.current) return
    if (isEditMacro) {
      fetchedFullRef.current = true
      return
    }

    try {
      const noGroups = !Array.isArray(comboState.comboGroups) || comboState.comboGroups.length === 0
      const groupsTruncated =
        Array.isArray(comboState.comboGroups) &&
        comboState.comboGroups.some(g => !Array.isArray(g.products) || g.products.length <= 1)

      const needsFetch = noGroups || groupsTruncated || !looksLikeRealMasterCombo(comboState)
      if (!needsFetch) {
        fetchedFullRef.current = true
        return
      }

      ;(async () => {
        try {
          const entry = originalCartEntryRef.current
          const firstComboBlock = Array.isArray(entry?.combos) && entry.combos.length > 0 ? entry.combos[0] : null
          const comboCode =
            entry?.detailCombo?.code ||
            firstComboBlock?.detailCombo?.code ||
            entry?.detailCombo?.id ||
            comboState?.code ||
            comboState?.id ||
            q.comboCode ||
            null

          if (!comboCode) {
            fetchedFullRef.current = true
            return
          }

          const orderCategoryCode = deriveOrderCategoryCode({ resolvedOrderType, comboCode })

          const url =
            `/api/proxy/combo-list?orderCategoryCode=${encodeURIComponent(orderCategoryCode)}` +
            `&storeCode=${encodeURIComponent(storeCode)}` +
            `&pageSize=1000`

          const r = await fetch(url)
          if (!r.ok) return

          const j = await r.json()
          const list = Array.isArray(j?.data) ? j.data : Array.isArray(j?.combo) ? j.combo : []

          const found = findMasterFromList(list, comboCode)
          if (!looksLikeRealMasterCombo(found)) return

          try {
            if (found.code) sessionStorage.setItem(`combo_${String(found.code)}`, JSON.stringify(found))
          } catch (e) {}

          setComboState(prev => mergeComboStatesStrict(prev || comboState || {}, found) || found)

          // IMPORTANT: selections harus di-map ulang ke master yang baru
          const entry2 = originalCartEntryRef.current
          const first2 = Array.isArray(entry2?.combos) && entry2.combos.length > 0 ? entry2.combos[0] : null
          const masterNow = mergeComboStatesStrict(comboState || {}, found) || found

          const queues = buildCartQueues(first2?.products || [], masterNow.comboGroups || [])
          const mapped = applyQueuesToComboGroups({ comboGroups: masterNow.comboGroups || [], queues })

          setSelectedProducts(mapped.sp)
          setSelectedCondiments(mapped.sc)
          setOpenGroups({})

          prefilledRef.current = true
        } catch (e) {
          console.warn('[ComboDetail][safety] fetch error', e)
        } finally {
          fetchedFullRef.current = true
        }
      })()
    } catch (e) {}
  }, [comboState, fromCheckout, editingIndex, q.comboCode, resolvedOrderType, storeCode, isEditMacro])

  // keep macroContext updated
  useEffect(() => {
    if (!comboState?.macroCode) return

    const latestMax = Number(comboState.maxQuantityCanGet || 0)

    setMacroContext(prev => ({
      ...(prev || {}),
      isMacro: true,
      macroCode: comboState.macroCode,
      macroName: comboState.macroName || comboState.name,
      maxQuantityCanGet: latestMax,
      isAllowGetAnother: Boolean(comboState.isAllowGetAnother)
    }))

    if (latestMax > 0 && qty > latestMax) setQty(latestMax)
  }, [comboState?.maxQuantityCanGet])

  /**
   * Auto close groups if addon complete
   */
  useEffect(() => {
    if (!comboState?.comboGroups) return

    comboState.comboGroups.forEach((group, idx) => {
      const gKey = getGroupKey(group, idx)
      const prodCode = selectedProducts[gKey]
      if (!prodCode) return

      if (group.activeCondiment === false) {
        setOpenGroups(prev => ({ ...prev, [gKey]: false }))
        return
      }

      const prod = (group.products || []).find(p => String(p.code) === String(prodCode))
      const cgs = prod?.condimentGroups || []

      if (!hasValidAddon(prod)) {
        setOpenGroups(prev => ({ ...prev, [gKey]: false }))
        return
      }

      const selected = selectedCondiments[gKey]?.condiments || {}
      const done = cgs.every(cg => {
        const cgKey = cg.code || cg.name || String(cg.id)
        return selected[cgKey] !== undefined
      })

      if (done) setOpenGroups(prev => ({ ...prev, [gKey]: false }))
    })
  }, [selectedProducts, selectedCondiments, comboState])

  // AUTO SELECT SINGLE PRODUCT (NEW ONLY)
  useEffect(() => {
    if (fromCheckout || editingIndex != null) return
    if (!comboState) return
    if (!Array.isArray(comboState.comboGroups)) return

    let changed = false
    const nextSelected = { ...selectedProducts }

    comboState.comboGroups.forEach((g, index) => {
      const groupKey = getGroupKey(g, index)
      if (nextSelected[groupKey]) return

      if (Array.isArray(g.products) && g.products.length === 1) {
        const p = g.products[0]
        if (!p?.outOfStock) {
          nextSelected[groupKey] = p.code ?? p.id
          changed = true

          if (Array.isArray(p.condimentGroups)) {
            setSelectedCondiments(prev => {
              const next = { ...prev }
              if (!next[groupKey]) next[groupKey] = { productCode: p.code, condiments: {} }
              p.condimentGroups.forEach(cg => {
                if (cg.allowSkip) {
                  const cgKey = cg.code || cg.name || String(cg.id)
                  next[groupKey].condiments[cgKey] = NONE_OPTION_ID
                }
              })
              return next
            })
          }
        }
      }
    })

    if (changed) setSelectedProducts(nextSelected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comboState])

  function hasValidAddon(product) {
    if (!product) return false
    if (!Array.isArray(product.condimentGroups)) return false
    return product.condimentGroups.some(cg => Array.isArray(cg.products) && cg.products.length > 0)
  }

  function findComboGroupByKey(slotKey) {
    if (!comboState?.comboGroups) return null
    return comboState.comboGroups.find((g, idx) => getGroupKey(g, idx) === slotKey)
  }

  function findProductInGroup(group, productCode) {
    if (!group) return null
    return (group.products || []).find(p => String(p.code ?? p.id) === String(productCode))
  }

  function handleSelectProduct(groupKey, productCode) {
    const grp = findComboGroupByKey(groupKey)
    const prod = findProductInGroup(grp, productCode)
    if (!prod || prod.outOfStock) return

    setSelectedProducts(prev => ({ ...prev, [groupKey]: productCode }))
    setSelectedCondiments(prev => ({
      ...prev,
      [groupKey]: prev[groupKey] ?? { productCode, condiments: {} }
    }))

    const noAddonNeeded = grp?.activeCondiment === false || !hasValidAddon(prod)
    if (noAddonNeeded) setTimeout(() => focusNextUnselectedGroup(groupKey), 0)
  }

  function handleSelectAddon(groupKey, product, cgKey, optCode) {
    const cg = (product.condimentGroups || []).find(g => (g.code || g.name || String(g.id)) === cgKey)
    const opt = cg?.products?.find(p => String(p.code ?? p.id) === String(optCode))

    if (opt?.isOutOfStock) {
      throw new Error(`Add On ${opt.name} sedang habis`)
    }

    setSelectedCondiments(prev => {
      const next = {
        ...prev,
        [groupKey]: {
          productCode: product.code,
          condiments: { ...prev[groupKey]?.condiments, [cgKey]: optCode }
        }
      }

      const allSelected = (product.condimentGroups || []).every(cg => {
        const key = cg.code || cg.name || String(cg.id)
        return next[groupKey].condiments[key] !== undefined
      })

      if (allSelected) setTimeout(() => focusNextUnselectedGroup(groupKey), 0)
      return next
    })
  }

  function focusNextUnselectedGroup(currentGroupKey) {
    if (!comboState?.comboGroups) return

    const groups = comboState.comboGroups
    const currentIdx = groups.findIndex((g, idx) => getGroupKey(g, idx) === currentGroupKey)

    for (let i = currentIdx + 1; i < groups.length; i++) {
      const nextKey = getGroupKey(groups[i], i)
      if (!selectedProducts[nextKey]) {
        setOpenGroups(prev => ({ ...prev, [nextKey]: true }))
        return
      }
    }

    setOpenGroups({})
  }

  // subtotal
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

      let line = Number(prod.price || 0) * Number(prod.qty || 1)

      const slotCond = selectedCondiments[groupKey]?.condiments || {}
      const condGroups = Array.isArray(prod.condimentGroups) ? prod.condimentGroups : []

      condGroups.forEach(cg => {
        const cgKey = cg.code || cg.name || String(cg.id)
        const sel = slotCond[cgKey]
        if (!sel || sel === NONE_OPTION_ID) return

        if (Array.isArray(sel)) {
          sel.forEach(selId => {
            const opt = (cg.products || []).find(p => String(p.code ?? p.id) === String(selId))
            if (opt) line += Number(opt.price || 0) * Number(opt.qty || 1)
          })
        } else {
          const opt = (cg.products || []).find(p => String(p.code ?? p.id) === String(sel))
          if (opt) line += Number(opt.price || 0) * Number(opt.qty || 1)
        }
      })

      total += line
    })

    return Math.round(total * Number(qty || 1))
  }, [selectedProducts, selectedCondiments, qty, comboState])

  // isReady
  const isReady = useMemo(() => {
    if (!comboState) return false
    if (!Array.isArray(comboState.comboGroups)) return false

    for (let idx = 0; idx < comboState.comboGroups.length; idx++) {
      const group = comboState.comboGroups[idx]
      const gKey = getGroupKey(group, idx)

      if (!group.allowSkip) {
        const prodCode = selectedProducts[gKey]
        if (!prodCode || String(prodCode) === NO_ADDON_CODE) return false
      }

      const prodCode = selectedProducts[gKey]
      if (!prodCode || String(prodCode) === NO_ADDON_CODE) continue

      const product = findProductInGroup(group, prodCode)
      if (!product) return false
      if (product.outOfStock === true) return false

      if (Array.isArray(product.condimentGroups)) {
        const condState = selectedCondiments[gKey]?.condiments || {}
        for (const cg of product.condimentGroups) {
          if (cg.allowSkip) continue
          const cgKey = cg.code || cg.name || String(cg.id)
          const sel = condState[cgKey]
          if (sel === undefined || sel === null || sel === NONE_OPTION_ID || (Array.isArray(sel) && sel.length === 0)) {
            return false
          }
        }
      }
    }

    return true
  }, [comboState, selectedProducts, selectedCondiments])

  // build payload
  function buildComboCartPayload() {
    if (!comboState) return null

    const productsPayload = []

    Object.keys(selectedProducts).forEach(groupKey => {
      const productCode = selectedProducts[groupKey]
      if (!productCode) return
      if (String(productCode) === NO_ADDON_CODE) return

      const grp = findComboGroupByKey(groupKey)
      const prod = findProductInGroup(grp, productCode)
      if (!prod) return

      const productPayload = {
        code: prod.code ?? prod.id,
        comboGroup: String(getBaseGroupKey(grp) || ''), // base (NO ::idx)
        name: prod.name ?? '',
        itemName: prod.itemName ?? '',
        price: Number(prod.price || 0),
        qty: Number(prod.qty || 1),
        taxes: (prod.taxes || []).map(t => ({
          taxName: t.name || t.code || '',
          taxPercentage: Number(t.amount || 0),
          taxAmount: 0
        })),
        condiments: []
      }

      const slotCond = selectedCondiments[groupKey]?.condiments || {}
      const condGroups = Array.isArray(prod.condimentGroups) ? prod.condimentGroups : []

      condGroups.forEach(cg => {
        const cgKey = cg.code || cg.name || String(cg.id)
        const sel = slotCond[cgKey]
        if (!sel || sel === NONE_OPTION_ID) return

        if (Array.isArray(sel)) {
          sel.forEach(selId => {
            const opt = (cg.products || []).find(p => String(p.code ?? p.id) === String(selId))
            if (!opt) return
            productPayload.condiments.push({
              code: opt.code ?? opt.id,
              name: opt.name ?? opt.itemName ?? '',
              price: Number(opt.price || 0),
              qty: Number(opt.qty || 1),
              taxes: (opt.taxes || []).map(t => ({
                taxName: t.name || t.code || '',
                taxPercentage: Number(t.amount || 0),
                taxAmount: 0
              }))
            })
          })
        } else {
          const opt = (cg.products || []).find(p => String(p.code ?? p.id) === String(sel))
          if (!opt) return
          productPayload.condiments.push({
            code: opt.code ?? opt.id,
            name: opt.name ?? opt.itemName ?? '',
            price: Number(opt.price || 0),
            qty: Number(opt.qty || 1),
            taxes: (opt.taxes || []).map(t => ({
              taxName: t.name || t.code || '',
              taxPercentage: Number(t.amount || 0),
              taxAmount: 0
            }))
          })
        }
      })

      const calcLineTaxes = (price, qty, taxesArr) =>
        (taxesArr || []).map(t => {
          const p = Number(t.taxPercentage || t.amount || 0)
          const amount = Math.round(price * qty * (p / 100))
          return { taxName: t.taxName || t.name || t.code || '', taxPercentage: p, taxAmount: amount }
        })

      productPayload.taxes = calcLineTaxes(productPayload.price, productPayload.qty, productPayload.taxes)
      productPayload.condiments = productPayload.condiments.map(c => ({ ...c, taxes: calcLineTaxes(c.price, c.qty || 1, c.taxes) }))

      productsPayload.push(productPayload)
    })

    if (productsPayload.length === 0) return null

    const combosForCart = [
      {
        detailCombo: {
          code: comboState.code || comboState.id,
          name: comboState.name || comboState.title || '',
          itemName: comboState.itemName || '',
          image: comboState.imagePath || comboState.image || null
        },
        isFromMacro: true,
        macroCode: comboState.macroCode || null,
        maxQuantityCanGet: Number(comboState?.maxQuantityCanGet) || Number(macroContext?.maxQuantityCanGet) || 0,
        isAllowGetAnother: Boolean(comboState.isAllowGetAnother),
        orderType: resolvedOrderType,
        products: productsPayload,
        qty: Number(qty || 1),
        voucherCode: null
      }
    ]

    const cartEntry = {
      type: 'combo',
      isMacro: Boolean(comboState.macroCode),
      macroCode: comboState.macroCode || null,
      macroName: comboState.macroName || comboState.name || null,
      maxQuantityCanGet: Number(comboState.maxQuantityCanGet || 0),
      isAllowGetAnother: Boolean(comboState.isAllowGetAnother),
      combos: combosForCart,
      qty: Number(qty || 1),
      detailCombo: combosForCart[0].detailCombo,
      note: note || '',
      image: comboState.imagePath || comboState.image || null
    }

    try {
      const cid =
        originalClientInstanceId ||
        `cli_${(comboState.code || comboState.id || 'x')}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      cartEntry.clientInstanceId = cid
      cartEntry.detailCombo.clientInstanceId = cid
      cartEntry.combos = cartEntry.combos.map(c => ({ ...c, clientInstanceId: cid }))
    } catch (e) {}

    if (isEdit && originalCartEntryRef.current?.isMacro) {
      const orig = originalCartEntryRef.current
      cartEntry.isMacro = true
      cartEntry.macroCode = orig.macroCode
      cartEntry.macroName = orig.macroName
      cartEntry.maxQuantityCanGet = orig.maxQuantityCanGet
      cartEntry.isAllowGetAnother = orig.isAllowGetAnother
    }

    return cartEntry
  }

  function validateSelectionBeforeAdd() {
    const missingGroups = []
    for (let i = 0; i < comboGroups.length; i++) {
      const g = comboGroups[i]
      const key = getGroupKey(g, i)
      if (!g.allowSkip) {
        const selProd = selectedProducts[key]
        if (!selProd || String(selProd) === NO_ADDON_CODE) missingGroups.push(g.name || key)
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
      if (prod?.outOfStock) throw new Error(`Produk ${prod.name} sedang habis`)

      const condGroups = Array.isArray(prod.condimentGroups) ? prod.condimentGroups : []
      const prodCondMap = selectedCondiments[groupKey]?.condiments || {}

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

  function handleSetQty(nextQty) {
    let finalQty = Number(nextQty || 1)
    if (finalQty < 1) finalQty = 1

    if (isEdit && (comboState?.macroCode || originalCartEntryRef.current?.isMacro)) {
      const latestMax = Number(comboState?.maxQuantityCanGet) || Number(originalCartEntryRef.current?.maxQuantityCanGet) || 0
      if (latestMax > 0) finalQty = Math.min(finalQty, latestMax)
    } else if (isMacroCombo && Number(comboState.maxQuantityCanGet) > 0) {
      finalQty = Math.min(finalQty, Number(comboState.maxQuantityCanGet))
    }

    setQty(finalQty)
  }

  function handleAddToCart() {
    const macroMax =
      Number(comboState?.maxQuantityCanGet) ||
      Number(macroContext?.maxQuantityCanGet) ||
      Number(originalCartEntryRef.current?.maxQuantityCanGet) ||
      0

    if (macroMax > 0 && qty > macroMax) {
      alert(`Maksimal ${macroMax} item untuk promo ini`)
      return false
    }

    try {
      const v = validateSelectionBeforeAdd()
      if (!v.ok) {
        setMissingAddons(v.msg)
        setShowPopup(true)
        return false // <— penting
      }

      const payload = buildComboCartPayload()
      if (!payload) {
        console.warn('Payload combo tidak valid.')
        return false
      }

      try {
        setAddAnimating(true)
        setTimeout(() => setAddAnimating(false), 500)

        if (fromCheckout && editingIndex != null) {
          try {
            replaceCartAtIndex(Number(editingIndex), payload)
          } catch (e) {
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

        return true
      } catch (e) {
        console.error('addToCart combo failed', e)
        alert('Gagal menambahkan ke keranjang')
        return false
      }
    } catch (e) {
      setMissingAddons(e.message || 'Produk habis')
      setShowPopup(true)
      return false
    }
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const addBtnLabel = fromCheckout && editingIndex != null ? 'Ubah Pesanan' : 'Tambah Paket'
  const subtotalForDisplay = subtotal

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
    return (
      <div className={styles.page}>
        <div style={{ padding: 16 }}>Memuat data paket...</div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {loadingCombo && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner}></div>
          <div className={styles.loadingText}>{fromCheckout && editingIndex != null ? 'Menyiapkan Data Pesanan...' : 'Memuat Paket...'}</div>
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
              const imgPath = comboState.imagePath || comboState.image || '/images/no-image-available.jpg'
              const proxyUrl = `/api/image?url=${encodeURIComponent(imgPath.replace(/^https?:\/\/[^/]+\//, ''))}`
              setFullscreenImg(proxyUrl)
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
              <img src={fullscreenImg} alt={comboState.name} style={{ maxWidth: '95%', maxHeight: '95%', borderRadius: 8 }} />
            </div>
          )}
        </div>

        <div className={styles.imageWrapper}>
          <Image
            src={comboState.imagePath || comboState.image || '/images/no-image-available.jpg'}
            alt={comboState.name || 'combo'}
            fill
            className={styles.image}
            priority
          />
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

      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Pilih Paket</div>

        {(comboState.comboGroups || []).map((group, idx) => {
          const groupKey = getGroupKey(group, idx)

          const selectedProductCode = selectedProducts[groupKey]
          const selectedProduct =
            selectedProductCode && selectedProductCode !== NO_ADDON_CODE
              ? findProductInGroup(group, selectedProductCode)
              : null

          const isOpen = openGroups[groupKey] === true
          const isSelected = Boolean(selectedProductCode && selectedProductCode !== NO_ADDON_CODE)
          const isCondimentActive = group.activeCondiment !== false

          return (
            <div
              key={groupKey}
              style={{
                borderRadius: 12,
                padding: 12,
                marginBottom: 16,
                overflow: 'hidden',
                border: isSelected ? '2px solid #f97316' : '1px solid #e5e7eb',
                background: isSelected ? '#fff7ed' : '#fff',
                boxShadow: isSelected ? '0 0 0 2px rgba(249, 115, 22, 0.25)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              {/* HEADER */}
              <div
                style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() =>
                  setOpenGroups(prev => {
                    const next = {}
                    Object.keys(prev).forEach(k => (next[k] = false))
                    next[groupKey] = !prev[groupKey]
                    return next
                  })
                }
              >
                <div>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {group.name}
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
                    {selectedProduct ? selectedProduct.name : group.allowSkip ? 'Boleh dikosongkan' : 'Belum dipilih'}
                  </div>
                </div>

                <div style={{ fontSize: 13, color: '#999' }}>{idx + 1}</div>
              </div>

              {/* PRODUCT */}
              {isOpen && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Pilih Product</div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(group.products || []).map(p => {
                      const pCode = p.code ?? String(p.id)
                      const checked = String(selectedProductCode) === String(pCode)
                      const isOOS = p.outOfStock === true

                      return (
                        <div
                          key={pCode}
                          className={`${styles.card} ${checked ? styles.cardSelected : ''}`}
                          style={{ opacity: isOOS ? 0.4 : 1, pointerEvents: isOOS ? 'none' : 'auto' }}
                          onClick={() => handleSelectProduct(groupKey, pCode)}
                        >
                          <div className={styles.cardImage}>
                            {p.imagePath && <Image src={p.imagePath} alt={p.name} fill style={{ objectFit: 'contain' }} />}
                          </div>

                          <div className={styles.cardText}>
                            <div className={styles.cardTitle}>{p.name}</div>
                            {p.description && <div className={styles.cardDesc}>{p.description}</div>}
                            {isOOS && (
                              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: '#dc2626' }}>
                                Out of Stock
                              </div>
                            )}
                          </div>

                          <div className={styles.cardRight}>
                            <div className={styles.cardPrice}>{formatRp((p.maskingprice ?? p.price ?? 0) * (p.qty ?? 1))}</div>
                            <input type="radio" checked={checked} readOnly />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ADD ON */}
              {isCondimentActive && isOpen && selectedProduct && hasValidAddon(selectedProduct) && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Pilih Add On</div>

                  {selectedProduct.condimentGroups.map(cg => {
                    const cgKey = cg.code || cg.name || String(cg.id)

                    // ✅ selection khusus untuk cg ini saja
                    const selForThisCg = selectedCondiments[groupKey]?.condiments?.[cgKey]
                    const isNoneSelected =
                      Array.isArray(selForThisCg)
                        ? selForThisCg.includes(NONE_OPTION_ID)
                        : String(selForThisCg || '') === String(NONE_OPTION_ID)

                    return (
                      <div key={cgKey} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                        {cg.allowSkip && (
                          <div
                            className={`${styles.card} ${isNoneSelected ? styles.cardSelected : ''}`}
                            onClick={() => handleSelectAddon(groupKey, selectedProduct, cgKey, NONE_OPTION_ID)}
                          >
                            <div style={{ width: 64, height: 64, borderRadius: 8, background: '#f3f4f6' }} />
                            <div className={styles.cardText}>
                              <div className={styles.cardTitle}>Tanpa Add On</div>
                            </div>
                            <div className={styles.cardRight}>
                              <div className={styles.cardPrice}>Rp 0</div>
                              <input type="radio" checked={isNoneSelected} readOnly />
                            </div>
                          </div>
                        )}

                        {(cg.products || []).map(opt => {
                          const optCode = opt.code ?? String(opt.id)
                          const checked = selectedAddonCodes.includes(optCode)
                          const isOOS = opt.isOutOfStock === true

                          return (
                            <div
                              key={optCode}
                              className={`${styles.card} ${checked ? styles.cardSelected : ''}`}
                              style={{
                                opacity: isOOS ? 0.4 : 1,
                                pointerEvents: isOOS ? 'none' : 'auto',
                                backgroundColor: isOOS ? '#f3f4f6' : undefined
                              }}
                              onClick={() => {
                                if (isOOS) return
                                handleSelectAddon(groupKey, selectedProduct, cgKey, optCode)
                              }}
                            >
                              <div className={styles.cardImage}>
                                {opt.imagePath && <Image src={opt.imagePath} alt={opt.name} fill style={{ objectFit: 'contain' }} />}
                              </div>

                              <div className={styles.cardText}>
                                <div className={styles.cardTitle}>{opt.name}</div>
                                {opt.description && <div className={styles.cardDesc}>{opt.description}</div>}
                                {isOOS && (
                                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: '#dc2626' }}>
                                    Out of Stock
                                  </div>
                                )}
                              </div>

                              <div className={styles.cardRight}>
                                <div className={styles.cardPrice}>{formatRp(opt.price)}</div>
                                <input type="radio" checked={checked} readOnly disabled={isOOS} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!fullscreenImg && (
        <div className={styles.stickyOuter}>
          <div className={styles.stickyInner}>
            <StickyCartBar
              qty={qty}
              setQty={handleSetQty}
              subtotal={subtotalForDisplay}
              onAdd={handleAddToCart}
              addAnimating={addAnimating}
              addLabel={addBtnLabel}
              isReady={isReady}
              maxQuantityCanGet={macroContext?.maxQuantityCanGet || 0}
              isEditing={fromCheckout && editingIndex != null}
            />
          </div>
        </div>
      )}

      {showPopup && (
        <>
          <div
            className={styles.addModalOverlay}
            onClick={() => {
              setShowPopup(false)
              setMissingAddons(null)
            }}
          />

          <div className={styles.addModal} role="dialog" aria-modal="true">
            <div className={styles.addModalContent}>
              {missingAddons ? (
                <>
                  <div className={styles.addModalIcon}>
                    <Image src="/images/warning.png" alt="Warning" width={80} height={80} />
                  </div>
                  <div className={styles.addModalTitle}>Pilih Add Ons Terlebih Dahulu</div>
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
                    <Image src="/images/order-success.png" alt="success" width={96} height={96} />
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