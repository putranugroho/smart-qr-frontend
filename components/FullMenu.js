// components/FullMenu.js
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import styles from '../styles/FullMenu.module.css'

export default function FullMenu({
  open = false,
  categories = [], // expects array of objects { id, name, ... }
  currentCategory = null,
  onClose = () => {},
  onSelect = () => {},
  onOpenFilter = () => {},
  filterForCategory = null,
  onApplyFilter = () => {},
}) {
  const [visible, setVisible] = useState(Boolean(open))
  const [localOpenFilter, setLocalOpenFilter] = useState(Boolean(filterForCategory && open))
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || (categories[0] && categories[0].name) || null)

  // filtersByGroup: selected values per groupId (arrays)
  const [filtersByGroup, setFiltersByGroup] = useState({})
  // tagsByGroup: available tag list per groupId (arrays) - used to render all tags
  const [tagsByGroup, setTagsByGroup] = useState({})
  // order of groups when rendering
  const [groupsOrder, setGroupsOrder] = useState([])

  const sheetRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [loadingFilters, setLoadingFilters] = useState(false)
  const [filtersLoadedForCategoryId, setFiltersLoadedForCategoryId] = useState(null)

  useEffect(() => {
    setVisible(Boolean(open))
    if (open) {
      setExpanded(false)
      setLocalOpenFilter(Boolean(filterForCategory))
    } else {
      setLocalOpenFilter(false)
    }
  }, [open, filterForCategory])

  useEffect(() => {
    setSelectedCategory(currentCategory || (categories[0] && categories[0].name) || null)
  }, [currentCategory, categories])

  useEffect(() => {
    if (filterForCategory) {
      setSelectedCategory(filterForCategory)
      setLocalOpenFilter(true)
      setVisible(true)
      setExpanded(false)
    } else {
      setLocalOpenFilter(false)
    }
  }, [filterForCategory, categories])

  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [visible])

  // Fetch filter tags for selectedCategory when localOpenFilter is true
  useEffect(() => {
    const catObj = categories.find(c => String(c.name) === String(selectedCategory));
    if (!catObj) return;

    // If already loaded for this category, restore from sessionStorage/tagsByGroup
    const cachedRawKey = `rawtags_for_${String(catObj.id)}`
    const cachedSelectedKey = `filters_for_${String(catObj.id)}`

    if (!localOpenFilter) return;

    // If we already loaded tags for this category, re-use
    if (filtersLoadedForCategoryId === String(catObj.id) && Object.keys(tagsByGroup).length > 0) {
      // ensure filtersByGroup has defaults
      setFiltersByGroup(prev => {
        const copy = { ...prev }
        Object.keys(tagsByGroup).forEach(gid => {
          if (!Array.isArray(copy[gid])) copy[gid] = ['ALL']
        })
        return copy
      })
      return
    }

    async function load() {
      setLoadingFilters(true)
      try {
        // try restore raw tags from sessionStorage to reduce requests
        const rawStored = (() => {
          try {
            const s = sessionStorage.getItem(cachedRawKey)
            if (!s) return null
            return JSON.parse(s)
          } catch (e) { return null }
        })()

        if (rawStored && rawStored._meta && rawStored._meta.categoryId === String(catObj.id)) {
          // restore tagsByGroup and groupsOrder from stored raw
          setTagsByGroup(rawStored.tagsByGroup || {})
          setGroupsOrder(rawStored.groupsOrder || [])
          // restore selected filters if present
          const prevSel = (() => {
            try {
              const s = sessionStorage.getItem(cachedSelectedKey)
              if (!s) return null
              return JSON.parse(s)
            } catch (e) { return null }
          })()
          if (prevSel) {
            setFiltersByGroup(prevSel)
          } else {
            // default every group to ['ALL']
            const defaults = {}
            (rawStored.groupsOrder || []).forEach(g => { defaults[g] = ['ALL'] })
            setFiltersByGroup(defaults)
          }
          setFiltersLoadedForCategoryId(String(catObj.id))
          return
        }

        // fetch from proxy
        const url = `/api/proxy/menu-filter?menuCategoryId=${encodeURIComponent(catObj.id)}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        const raw = Array.isArray(json?.data) ? json.data : []

        // group by filterGroupId preserving order of first-seen groups
        const grouped = {}
        const order = []
        raw.forEach(f => {
          const gid = f.filterGroupId ?? 'default'
          if (!grouped[gid]) {
            grouped[gid] = []
            order.push(gid)
          }
          // push name (original casing)
          grouped[gid].push(String(f.name))
        })

        // normalize tag lists: uppercase duplicates removed but keep original strings for display
        const normalizedTags = {}
        order.forEach(gid => {
          const arr = Array.from(new Set(grouped[gid].map(x => String(x))))
          // ensure 'ALL' exists and is first (use uppercase 'ALL' string if present in payload keep original if matches)
          const hasAllIndex = arr.findIndex(a => String(a).toUpperCase() === 'ALL')
          if (hasAllIndex === -1) arr.unshift('ALL'); else {
            // move the found ALL to front preserving original
            const allVal = arr.splice(hasAllIndex, 1)[0]
            arr.unshift(allVal)
          }
          normalizedTags[gid] = arr
        })

        // defaults: selected = ['ALL'] per group
        const defaults = {}
        order.forEach(gid => { defaults[gid] = ['ALL'] })

        // set states
        setTagsByGroup(normalizedTags)
        setGroupsOrder(order)
        setFiltersByGroup(defaults)
        setFiltersLoadedForCategoryId(String(catObj.id))

        // persist raw tags & groupsOrder to sessionStorage for quick restore
        try {
          const toStore = { _meta: { categoryId: String(catObj.id) }, tagsByGroup: normalizedTags, groupsOrder: order }
          sessionStorage.setItem(cachedRawKey, JSON.stringify(toStore))
        } catch (e) {
          // ignore storage errors
        }

        // try restore previously selected filters for this category if any
        try {
          const prev = sessionStorage.getItem(cachedSelectedKey)
          if (prev) {
            const parsed = JSON.parse(prev)
            if (parsed && typeof parsed === 'object') {
              setFiltersByGroup(parsed)
            }
          }
        } catch (e) {
          // ignore
        }
      } catch (e) {
        console.error('FullMenu load filters error', e)
        setTagsByGroup({})
        setGroupsOrder([])
        setFiltersByGroup({})
      } finally {
        setLoadingFilters(false)
      }
    }

    load()
  }, [localOpenFilter, selectedCategory, categories, filtersLoadedForCategoryId])

  // touch/drag handlers (same behavior as before)
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return

    let startY = 0
    let currentY = 0
    let dragging = false
    let startExpanded = expanded

    function sheetHeight() {
      return startExpanded ? Math.min(window.innerHeight * 0.92, 653) : Math.min(320, window.innerHeight * 0.6)
    }

    function onStart(e) {
      dragging = true
      startY = e.touches ? e.touches[0].clientY : e.clientY
      currentY = startY
      startExpanded = expanded
      el.style.transition = 'none'
    }

    function onMove(e) {
      if (!dragging) return
      currentY = e.touches ? e.touches[0].clientY : e.clientY
      const dy = currentY - startY
      const maxTranslate = window.innerHeight
      const translate = Math.max(-maxTranslate, Math.min(maxTranslate, dy))
      el.style.transform = `translateY(${translate}px)`
    }

    function onEnd() {
      if (!dragging) return
      dragging = false
      el.style.transition = 'transform 220ms ease'
      const dy = currentY - startY
      const h = sheetRef.current ? sheetRef.current.getBoundingClientRect().height : sheetHeight()

      if (dy > (h * 0.35)) {
        el.style.transform = `translateY(${h}px)`
        setTimeout(() => {
          el.style.transform = ''
          setLocalOpenFilter(false)
          setExpanded(false)
          onClose()
        }, 220)
        startY = 0
        currentY = 0
        return
      }

      if (dy < -80) {
        setExpanded(true)
        el.style.transform = ''
        startY = 0
        currentY = 0
        return
      }

      el.style.transform = ''
      startY = 0
      currentY = 0
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('mousedown', onStart)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)

    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('mousedown', onStart)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
    }
  }, [onClose, expanded, visible])

  function toggleTagForGroup(groupId, value) {
    setFiltersByGroup(prev => {
      const copy = { ...prev }
      const arr = Array.isArray(copy[groupId]) ? [...copy[groupId]] : []
      const upper = String(value).toUpperCase()

      if (upper === 'ALL') {
        copy[groupId] = ['ALL']
        return copy
      }

      // if 'ALL' exists, replace it with the clicked value
      const idxAll = arr.findIndex(x => String(x).toUpperCase() === 'ALL')
      if (idxAll !== -1) {
        // if user clicked the same value as the ONE item, toggle back to ALL
        if (arr.length === 1 && String(arr[0]).toUpperCase() === String(value).toUpperCase()) {
          copy[groupId] = ['ALL']
          return copy
        }
        copy[groupId] = [value]
        return copy
      }

      // otherwise toggle value in array (case-insensitive)
      const foundIdx = arr.findIndex(x => String(x).toUpperCase() === upper)
      if (foundIdx === -1) {
        arr.push(value)
      } else {
        arr.splice(foundIdx, 1)
      }

      if (arr.length === 0) copy[groupId] = ['ALL']
      else copy[groupId] = arr

      return copy
    })
  }

  function applyFilterLocal() {
    // persist selected filters for this category id so next open can restore
    const catObj = categories.find(c => String(c.name) === String(selectedCategory));
    if (catObj) {
      try {
        sessionStorage.setItem(`filters_for_${String(catObj.id)}`, JSON.stringify(filtersByGroup || {}))
      } catch (e) { /* ignore */ }
    }

    // pass back to parent, parent will call menu-list with search built from values
    onApplyFilter(selectedCategory, filtersByGroup)
    setLocalOpenFilter(false)
    onClose()
  }

  function clearFiltersLocal() {
    // reset to ALL for each group
    const reset = {}
    groupsOrder.forEach(g => { reset[g] = ['ALL'] })
    setFiltersByGroup(reset)
    // also remove persisted selected for this category
    const catObj = categories.find(c => String(c.name) === String(selectedCategory));
    if (catObj) {
      try { sessionStorage.removeItem(`filters_for_${String(catObj.id)}`) } catch (e) {}
    }
  }

  if (!visible) return null

  return (
    <>
      <div
        className={styles.overlay}
        onClick={() => {
          setLocalOpenFilter(false)
          onClose()
        }}
      />

      <div className={styles.sheetWrap} aria-hidden={!visible}>
        <div
          className={`${styles.sheet} ${expanded ? styles.expanded : styles.collapsed}`}
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={styles.handleArea}
            onClick={() => setExpanded(prev => !prev)}
          >
            <div className={styles.handleBar} />
          </div>

          <div className={styles.sheetContent}>
            {!localOpenFilter && (
              <>
                <div className={styles.sheetHeader}>
                  <div className={styles.sheetTitle}>Category Item</div>
                  <button className={styles.closeBtn} onClick={() => { setLocalOpenFilter(false); onClose() }}>✕</button>
                </div>

                <div className={styles.categoryList}>
                  {categories.map((c) => {
                    const cname = String(c.name);
                    const isActive = cname === String(selectedCategory)
                    return (
                      <button
                        key={c.id ?? cname}
                        className={`${styles.categoryItem} ${isActive ? styles.categoryActive : ''}`}
                        onClick={() => {
                          setSelectedCategory(cname)
                          onSelect?.(cname)
                        }}
                      >
                        <span className={styles.categoryText}>{cname.toUpperCase()}</span>
                        {isActive ? <img src="/images/checkmark.png" width={16} height={16} alt="selected" /> : null}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {localOpenFilter && (
              <div className={styles.filterPanel}>
                <div className={styles.sheetHeader}>
                  <div className={styles.sheetTitle}>Filter</div>
                  <button className={styles.closeBtn} onClick={() => {setLocalOpenFilter(false); onClose()} }>✕</button>
                </div>

                {loadingFilters ? (
                  <div style={{ padding: 16 }}>Memuat filter...</div>
                ) : (
                  <>
                    {groupsOrder.length === 0 ? (
                      <div style={{ padding: 16, color: '#6b7280' }}>Tidak ada filter untuk kategori ini</div>
                    ) : (
                      groupsOrder.map((gid) => (
                        <div className={styles.filterGroup} key={gid}>
                          <div className={styles.filterTitle}>{gid}</div>
                          <div className={styles.tagRow}>
                            {(tagsByGroup[gid] || ['ALL']).map(tag => (
                              <button
                                key={`${gid}::${String(tag)}`}
                                className={`${styles.tag} ${Array.isArray(filtersByGroup[gid]) && filtersByGroup[gid].some(x => String(x).toUpperCase() === String(tag).toUpperCase()) ? styles.tagActive : ''}`}
                                onClick={() => toggleTagForGroup(gid, tag)}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button className={styles.applyBtn} onClick={applyFilterLocal}>Terapkan Filter</button>
                      <button className={styles.clearBtn} onClick={clearFiltersLocal}>Reset</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
