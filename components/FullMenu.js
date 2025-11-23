// components/FullMenu.js
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import styles from '../styles/FullMenu.module.css'

export default function FullMenu({
  open = false,
  categories = [],           // array of category names
  currentCategory = null,    // currently active category (string)
  onClose = () => {},
  onSelect = () => {},
  onOpenFilter = () => {},   // callback when open filter requested
  filterForCategory = null,  // name of category for which filter should open automatically
  onApplyFilter = () => {},  // (categoryName, filters) => {}
}) {
  const [visible, setVisible] = useState(Boolean(open))
  // localOpenFilter determines whether the FILTER UI is shown.
  // It should be true only when filterForCategory is provided (open via filter button).
  const [localOpenFilter, setLocalOpenFilter] = useState(Boolean(filterForCategory && open))
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || categories[0] || null)

  // filters: store arrays (for multi-select controls)
  // default structure is: { size: ['All'], side: ['All'], meat: ['All'] }
  const [filters, setFilters] = useState({})
  const sheetRef = useRef(null)

  const DEFAULT_FILTERS = {
    size: ['All'],
    side: ['All'],
    meat: ['All']
  }

  // sync open -> visible
  useEffect(() => {
    setVisible(Boolean(open))
  }, [open])

  // when categories/currentCategory change, ensure selection valid
  useEffect(() => {
    setSelectedCategory(currentCategory || categories[0] || null)
  }, [currentCategory, categories])

  // when filterForCategory changes:
  // - if provided -> open filter panel and select that category
  // - if null/undefined -> ensure filter panel is closed (important to avoid showing both)
  useEffect(() => {
    if (filterForCategory) {
      setSelectedCategory(filterForCategory)
      setLocalOpenFilter(true)
      setVisible(true)
    } else {
      // explicit close filter UI if no target filter
      setLocalOpenFilter(false)
    }
  }, [filterForCategory, categories])

  // ensure that whenever filter panel opens we have the defaults for missing keys
  useEffect(() => {
    if (localOpenFilter) {
      // if filters empty or missing keys, set defaults (but preserve existing non-empty selections)
      setFilters(prev => {
        const merged = { ...DEFAULT_FILTERS, ...prev }
        // if prev had keys but empty arrays, keep DEFAULT
        Object.keys(DEFAULT_FILTERS).forEach(k => {
          if (!Array.isArray(merged[k]) || merged[k].length === 0) {
            merged[k] = [...DEFAULT_FILTERS[k]]
          }
        })
        return merged
      })
    }
  }, [localOpenFilter])

  // lock body scroll while visible
  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [visible])

  // touch/drag handlers for sheet (basic drag-to-close / expand)
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return

    let startY = 0
    let currentY = 0
    let dragging = false
    let sheetHeight = el.getBoundingClientRect().height

    function onStart(e) {
      dragging = true
      startY = e.touches ? e.touches[0].clientY : e.clientY
      sheetHeight = el.getBoundingClientRect().height
      el.style.transition = 'none'
    }

    function onMove(e) {
      if (!dragging) return
      currentY = e.touches ? e.touches[0].clientY : e.clientY
      const dy = Math.max(0, currentY - startY)
      // translate downward only
      el.style.transform = `translateY(${dy}px)`
    }

    function onEnd() {
      if (!dragging) return
      dragging = false
      el.style.transition = 'transform 220ms ease'
      const dy = Math.max(0, currentY - startY)
      // threshold to close: > 30% of sheet height
      if (dy > (sheetHeight * 0.35)) {
        // close
        el.style.transform = `translateY(${sheetHeight}px)`
        // wait for transition then close
        setTimeout(() => {
          el.style.transform = ''
          // also reset localOpenFilter to avoid stale state next open
          setLocalOpenFilter(false)
          onClose()
        }, 220)
      } else {
        // snap back
        el.style.transform = ''
      }
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
  }, [onClose, visible])

  // helper to toggle tag in array filter with special handling for 'All'
  function toggleTag(key, value) {
    setFilters(prev => {
      const copy = { ...prev }
      const arr = Array.isArray(copy[key]) ? [...copy[key]] : []

      // if toggling 'All' -> set only 'All'
      if (value === 'All') {
        copy[key] = ['All']
        return copy
      }

      // toggling a non-All tag -> remove 'All' first
      const idxAll = arr.indexOf('All')
      if (idxAll !== -1) {
        // replace with the new value
        copy[key] = [value]
        return copy
      }

      // otherwise toggle in/out normally
      const idx = arr.indexOf(value)
      if (idx === -1) {
        arr.push(value)
      } else {
        arr.splice(idx, 1)
      }

      // if after removal nothing remains -> fall back to All
      if (arr.length === 0) {
        copy[key] = ['All']
      } else {
        copy[key] = arr
      }
      return copy
    })
  }

  function applyFilter() {
    // pass filters to parent (consider converting single-value arrays to value if needed)
    onApplyFilter(selectedCategory, filters)
    setLocalOpenFilter(false)
    // close sheet after applying filter (parent may choose different behavior)
    onClose()
  }

  function clearFilters() {
    setFilters({ ...DEFAULT_FILTERS })
  }

  if (!visible) return null

  return (
    <>
      {/* overlay covers entire window incl sticky header/tabs and orderbar */}
      <div
        className={styles.overlay}
        onClick={() => {
          // clicking outside closes sheet and clear filterForCategory intent
          setLocalOpenFilter(false)
          onClose()
        }}
      />

      <div className={styles.sheetWrap} aria-hidden={!visible}>
        <div className={styles.sheet} ref={sheetRef} role="dialog" aria-modal="true">
          {/* drag handle */}
          <div className={styles.handleArea}>
            <div className={styles.handleBar} />
          </div>

          <div className={styles.sheetContent}>
            {/* CATEGORY view (only shown when not filtering) */}
            {!localOpenFilter && (
              <>
                {/* Header */}
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
                          // selecting category in fullmenu should also notify parent
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

            {/* FILTER view (only shown when localOpenFilter = true) */}
            {localOpenFilter && (
              <div className={styles.filterPanel}>
                <div className={styles.filterGroup}>
                  <div className={styles.filterTitle}>Filter Ukuran</div>
                  <div className={styles.tagRow}>
                    {['All','Large','Small','Double Regular','Double Large'].map(tag => (
                      <button
                        key={tag}
                        className={`${styles.tag} ${Array.isArray(filters.size) && filters.size.includes(tag) ? styles.tagActive : ''}`}
                        onClick={() => toggleTag('size', tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.filterGroup}>
                  <div className={styles.filterTitle}>Filter Side Dish</div>
                  <div className={styles.tagRow}>
                    {['All','Chicken Nanban','Gorengan Ayam','Gorengan Udang'].map(tag => (
                      <button
                        key={tag}
                        className={`${styles.tag} ${Array.isArray(filters.side) && filters.side.includes(tag) ? styles.tagActive : ''}`}
                        onClick={() => toggleTag('side', tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.filterGroup}>
                  <div className={styles.filterTitle}>Filter Jenis Daging</div>
                  <div className={styles.tagRow}>
                    {['All','Original','Yakiniku','Black Pepper'].map(tag => (
                      <button
                        key={tag}
                        className={`${styles.tag} ${Array.isArray(filters.meat) && filters.meat.includes(tag) ? styles.tagActive : ''}`}
                        onClick={() => toggleTag('meat', tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.filterActions}>
                  <button className={styles.applyBtn} onClick={applyFilter}>
                    <span>Terapkan Filter</span>
                    {/* optionally show a count or arrow at right; keep space-between */}
                    <span style={{ opacity: 0 }}></span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
