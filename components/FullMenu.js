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
  filterForCategory = null,
  onApplyFilter = () => {},
}) {
  const [visible, setVisible] = useState(Boolean(open))
  // show filter UI (only when opening via filter or user opened it)
  const [localOpenFilter, setLocalOpenFilter] = useState(Boolean(filterForCategory && open))
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || categories[0] || null)

  // filters default (arrays) - handled when filter panel opens
  const [filters, setFilters] = useState({})
  const sheetRef = useRef(null)

  // collapsed = initial short sheet; expanded = tall (92vh)
  const [expanded, setExpanded] = useState(false)

  const DEFAULT_FILTERS = {
    size: ['All'],
    side: ['All'],
    meat: ['All']
  }

  // sync open -> visible; whenever visible becomes true, default to collapsed
  useEffect(() => {
    setVisible(Boolean(open))
    if (open) {
      // always start collapsed when sheet opens (user can expand)
      setExpanded(false)
      // only auto-open filter panel if filterForCategory truthy (but keep collapsed)
      setLocalOpenFilter(Boolean(filterForCategory))
    } else {
      setLocalOpenFilter(false)
    }
  }, [open, filterForCategory])

  useEffect(() => {
    setSelectedCategory(currentCategory || categories[0] || null)
  }, [currentCategory, categories])

  // when filterForCategory changes: select category, show filter panel (but do NOT auto-expand)
  useEffect(() => {
    if (filterForCategory) {
      setSelectedCategory(filterForCategory)
      setLocalOpenFilter(true)
      setVisible(true)
      // intentionally keep collapsed: setExpanded(false)
      setExpanded(false)
    } else {
      setLocalOpenFilter(false)
    }
  }, [filterForCategory, categories])

  // ensure defaults when opening filter
  useEffect(() => {
    if (localOpenFilter) {
      setFilters(prev => {
        const merged = { ...DEFAULT_FILTERS, ...prev }
        Object.keys(DEFAULT_FILTERS).forEach(k => {
          if (!Array.isArray(merged[k]) || merged[k].length === 0) {
            merged[k] = [...DEFAULT_FILTERS[k]]
          }
        })
        return merged
      })
    }
  }, [localOpenFilter])

  // prevent body scroll while visible
  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [visible])

  // Touch/drag handler supporting:
  // - drag down to close (like before)
  // - drag up to expand (new)
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return

    let startY = 0
    let currentY = 0
    let dragging = false
    let startExpanded = expanded
    // we use element height to compute thresholds
    function sheetHeight() {
      // use viewport height when expanded, otherwise collapsed height from CSS (approx)
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

      // If sheet is collapsed and user drags UP (dy < 0) we allow upward movement to indicate expand
      // If sheet is expanded and user drags DOWN (dy > 0) allow downward movement to indicate collapse/close
      // We'll translate on Y (positive = move down)
      // Limit translation so UI remains bound
      const maxTranslate = window.innerHeight // large safe value
      const translate = Math.max(-maxTranslate, Math.min(maxTranslate, dy))
      el.style.transform = `translateY(${translate}px)`
    }

    function onEnd() {
      if (!dragging) return
      dragging = false
      el.style.transition = 'transform 220ms ease'
      const dy = currentY - startY
      const h = sheetRef.current ? sheetRef.current.getBoundingClientRect().height : sheetHeight()

      // if user dragged down enough -> close
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

      // if user dragged up enough (negative dy) -> expand
      if (dy < -80) {
        // expand sheet
        setExpanded(true)
        // snap back transform to 0 (sheet will animate to expanded CSS height)
        el.style.transform = ''
        startY = 0
        currentY = 0
        return
      }

      // otherwise snap back to original (either collapsed or expanded)
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

  // helper toggle tag with 'All' special handling
  function toggleTag(key, value) {
    setFilters(prev => {
      const copy = { ...prev }
      const arr = Array.isArray(copy[key]) ? [...copy[key]] : []

      if (value === 'All') {
        copy[key] = ['All']
        return copy
      }

      const idxAll = arr.indexOf('All')
      if (idxAll !== -1) {
        copy[key] = [value]
        return copy
      }

      const idx = arr.indexOf(value)
      if (idx === -1) arr.push(value); else arr.splice(idx, 1)

      if (arr.length === 0) copy[key] = ['All']
      else copy[key] = arr

      return copy
    })
  }

  function applyFilter() {
    onApplyFilter(selectedCategory, filters)
    setLocalOpenFilter(false)
    onClose()
  }

  function clearFilters() {
    setFilters({ ...DEFAULT_FILTERS })
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
        {/* apply collapsed/expanded class for CSS height control */}
        <div
          className={`${styles.sheet} ${expanded ? styles.expanded : styles.collapsed}`}
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
        >
          {/* drag handle */}
          <div
            className={styles.handleArea}
            onClick={() => setExpanded(prev => !prev)} // click to toggle expand/collapse
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
