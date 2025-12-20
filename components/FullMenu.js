// components/FullMenu.js
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import styles from '../styles/FullMenu.module.css'

const STORAGE_KEY_PREFIX = 'yoshi_fullmenu_filters_' // followed by menuCategoryId

export default function FullMenu({
  open = false,
  categories = [],
  currentCategory = null,
  onClose = () => {},
  onSelect = () => {},
  onOpenFilter = () => {},
  filterForCategory = null, // now used as menuCategoryId (numeric/string)
  onApplyFilter = () => {},
}) {
  const [visible, setVisible] = useState(Boolean(open))
  const [localOpenFilter, setLocalOpenFilter] = useState(Boolean(filterForCategory && open))
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || categories[0] || null)
  const [filtersByGroup, setFiltersByGroup] = useState({}) // { groupId: [{id,name,filterGroupId}] }
  // selected map per group: { [groupId]: Set([id,...]) } but we keep only single active per group
  const [selectedByGroup, setSelectedByGroup] = useState({})
  const sheetRef = useRef(null)
  const [expanded, setExpanded] = useState(false)

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
    setSelectedCategory(currentCategory || categories[0] || null)
  }, [currentCategory, categories])

  // helper: storage key for menuCategoryId
  function storageKeyFor(menuCategoryId) {
    return STORAGE_KEY_PREFIX + String(menuCategoryId ?? 'null')
  }

  // when opening filter for a specific category (filterForCategory holds menuCategoryId)
  useEffect(() => {
    async function loadFilters(menuCategoryId) {
      if (!menuCategoryId) {
        setFiltersByGroup({})
        setSelectedByGroup({})
        return
      }

      try {
        const url = `/api/proxy/menu-filter?menuCategoryId=${encodeURIComponent(menuCategoryId)}`
        const r = await fetch(url)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = await r.json()
        const raw = Array.isArray(j?.data) ? j.data : []

        const grouped = {}
        raw.forEach(f => {
          const group = f.filterGroupId ?? 'default'
          if (!grouped[group]) grouped[group] = []
          grouped[group].push({
            id: f.id,
            name: f.name,
            filterGroupId: f.filterGroupId
          })
        })

        setFiltersByGroup(grouped)

        // restore previous selection from storage (if any)
        try {
          const stored = localStorage.getItem(storageKeyFor(menuCategoryId))
          if (stored) {
            const parsed = JSON.parse(stored) // expected { [groupId]: id | null }
            // convert to selectedByGroup structure (each value Set for internal consistency)
            const restored = {}
            Object.entries(parsed || {}).forEach(([g, v]) => {
              if (v == null || v === '') return
              restored[g] = new Set([v])
            })
            setSelectedByGroup(restored)
            return
          }
        } catch (e) {
          // ignore storage read errors
        }

        // ⭐ DEFAULT: if no stored selection -> mark group's 'ALL' as selected (if exists)
        const defaultSelected = {}
        Object.entries(grouped).forEach(([g, items]) => {
          const allItem = items.find(i => String(i.name).toUpperCase() === 'ALL')
          if (allItem) defaultSelected[g] = new Set([allItem.id])
        })
        setSelectedByGroup(defaultSelected)

      } catch (err) {
        console.error('loadFilters failed', err)
        setFiltersByGroup({})
        setSelectedByGroup({})
      }
    }

    if (localOpenFilter && filterForCategory) {
      loadFilters(filterForCategory)
    }
  }, [localOpenFilter, filterForCategory])

  // prevent body scroll while visible
  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [visible])

  // touch/drag handlers (unchanged)
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
      const translate = Math.max(0, dy)
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

  // toggle a single filter id but enforce "one active per group"
  function toggleFilterInGroup(groupId, id) {
    setSelectedByGroup(prev => {
      const next = { ...(prev || {}) }
      const currentSet = new Set(next[groupId] ? Array.from(next[groupId]) : [])
      // if clicked id already selected -> unselect it (result = no selection => interpret as ALL)
      if (currentSet.has(id)) {
        currentSet.delete(id)
        if (currentSet.size === 0) delete next[groupId]
        else next[groupId] = currentSet
        return next
      }
      // else select this id and remove any other ids in same group (single-select)
      next[groupId] = new Set([id])
      return next
    })
  }

  // clear selection for all groups OR a particular group (if groupId provided)
  // now: if group has an 'ALL' option -> set ALL as active; otherwise remove selection
  function clearSelection(groupId = null) {
    setSelectedByGroup(prev => {
      const next = { ...(prev || {}) }
      if (groupId == null) {
        // Reset all: for each group, set ALL if exists; otherwise delete
        Object.entries(filtersByGroup || {}).forEach(([g, items]) => {
          const allItem = (items || []).find(i => String(i.name).toUpperCase() === 'ALL')
          if (allItem) next[g] = new Set([allItem.id])
          else delete next[g]
        })
      } else {
        const items = filtersByGroup[groupId] || []
        const allItem = (items || []).find(i => String(i.name).toUpperCase() === 'ALL')
        if (allItem) next[groupId] = new Set([allItem.id])
        else delete next[groupId]
      }
      return next
    })
  }

  // apply filter: build menuFilterIds as comma separated ids (or empty => All)
  function applyFilterLocal() {
    const menuCategoryId = filterForCategory || null

    // flatten selected ids for sending (we send all active ids across groups)
    const idsArr = []
    Object.entries(selectedByGroup || {}).forEach(([g, s]) => {
      if (s && s.size) {
        for (const v of Array.from(s)) idsArr.push(String(v))
      }
    })
    const menuFilterIds = idsArr.length > 0 ? idsArr.join(',') : ''

    // persist selectedByGroup into localStorage so reopening retains state
    try {
      const persistObj = {}
      Object.entries(selectedByGroup || {}).forEach(([g, s]) => {
        const first = s && s.size ? Array.from(s)[0] : null
        persistObj[g] = first
      })
      localStorage.setItem(storageKeyFor(menuCategoryId), JSON.stringify(persistObj))
    } catch (e) {
      // ignore storage errors
    }

    onApplyFilter(menuCategoryId, { menuFilterIds, selectedIds: idsArr })
    setLocalOpenFilter(false)
    onClose()
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
            {/* CATEGORY view */}
            {!localOpenFilter && (
              <>
                <div className={styles.sheetHeader}>
                  <div className={styles.sheetTitle}>Category Item</div>
                  <button className={styles.closeBtn} onClick={() => { setLocalOpenFilter(false); onClose() }}>✕</button>
                </div>

                <div className={styles.categoryList}>
                  {categories.map((c) => {
                    const isActive = String(c) === String(selectedCategory)
                    return (
                      <button
                        key={c}
                        className={`${styles.categoryItem} ${isActive ? styles.categoryActive : ''}`}
                        onClick={() => {
                          setSelectedCategory(c)
                          onSelect?.(c)
                        }}
                      >
                        <span className={styles.categoryText}>{String(c).toUpperCase()}</span>
                        {isActive ? <img src="/images/checkmark.png" width={16} height={16} alt="selected" /> : null}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* FILTER view */}
            {localOpenFilter && (
              <div className={styles.filterPanel}>
                <div className={styles.sheetHeader}>
                  <div className={styles.sheetTitle}>Filter</div>
                  <button className={styles.closeBtn} onClick={() => { setLocalOpenFilter(false); onClose() }}>✕</button>
                </div>

                <div style={{ padding: 12 }}>
                  {/* iterate groups */}
                  {Object.keys(filtersByGroup).length === 0 ? (
                    <div style={{ color: '#6b7280' }}>Memuat filter...</div>
                  ) : (
                    Object.entries(filtersByGroup).map(([groupId, items]) => (
                      <div key={groupId} style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>{groupId}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {items.map(opt => {
                            const isAll = String(opt.name).toUpperCase() === 'ALL'
                            const currentSet = selectedByGroup[groupId] || new Set()
                            const isSelected = currentSet.has(opt.id)
                            return (
                              <button
                                key={opt.id}
                                className={`${styles.tag} ${isSelected ? styles.tagActive : ''}`}
                                onClick={() => {
                                  if (isAll) {
                                    // clicking ALL sets the group's selection to ALL (don't clear to empty)
                                    setSelectedByGroup(prev => {
                                      const next = { ...(prev || {}) }
                                      next[groupId] = new Set([opt.id])
                                      return next
                                    })
                                  } else {
                                    // single-select behavior within group
                                    toggleFilterInGroup(groupId, opt.id)
                                  }
                                }}
                              >
                                {opt.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className={styles.filterActions}>
                  <button className={styles.clearBtn} onClick={() => clearSelection()}>Reset</button>
                  <button className={styles.applyBtn} onClick={applyFilterLocal}>Terapkan Filter</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
