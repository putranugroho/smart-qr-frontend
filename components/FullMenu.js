// components/FullMenu.js
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import styles from '../styles/FullMenu.module.css'

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
  const [selectedIds, setSelectedIds] = useState(new Set()) // selected filter ids
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

  // when opening filter for a specific category (filterForCategory holds menuCategoryId)
  useEffect(() => {
    async function loadFilters(menuCategoryId) {
      if (!menuCategoryId) {
        setFiltersByGroup({})
        setSelectedIds(new Set())
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
          const group = f.filterGroupId || 'default'
          if (!grouped[group]) grouped[group] = []
          grouped[group].push({
            id: f.id,
            name: f.name,
            filterGroupId: f.filterGroupId
          })
        })

        setFiltersByGroup(grouped)

        // ⭐ NEW: set ALL as default active
        const defaultSelected = new Set()
        Object.values(grouped).forEach(items => {
          const allItem = items.find(i => String(i.name).toUpperCase() === 'ALL')
          if (allItem) defaultSelected.add(allItem.id)
        })
        setSelectedIds(defaultSelected)

      } catch (err) {
        console.error('loadFilters failed', err)
        setFiltersByGroup({})
        setSelectedIds(new Set())
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

  // touch/drag handlers (kept same as before)...
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

  // toggle a single filter id (multi-select)
  function toggleFilterId(id) {
    setSelectedIds(prev => {
      const copy = new Set(prev)
      if (copy.has(id)) copy.delete(id)
      else copy.add(id)
      return copy
    })
  }

  // clear selection (reset -> interpret as ALL)
  function clearSelection() {
    setSelectedIds(new Set())
  }

  // apply filter: build menuFilterIds as comma separated ids (or empty => All)
  function applyFilterLocal() {
    // filterForCategory is the menuCategoryId we opened for
    const menuCategoryId = filterForCategory || null
    const idsArr = Array.from(selectedIds)
    const menuFilterIds = idsArr.length > 0 ? idsArr.join(',') : ''
    // pass minimal object to parent
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
                            const isSelected = selectedIds.has(opt.id)
                            return (
                              <button
                                key={opt.id}
                                className={`${styles.tag} ${isSelected ? styles.tagActive : ''}`}
                                onClick={() => {
                                  // If user taps 'ALL' in this group -> clear selections for that group only
                                  if (isAll) {
                                    // remove all ids that belong to this group
                                    const idsOfGroup = items.map(i => i.id)
                                    setSelectedIds(prev => {
                                      const copy = new Set(prev)
                                      idsOfGroup.forEach(id => copy.delete(id))
                                      return copy
                                    })
                                  } else {
                                    // normal toggle
                                    toggleFilterId(opt.id)
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
                  <button className={styles.clearBtn} onClick={clearSelection}>Reset</button>
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
