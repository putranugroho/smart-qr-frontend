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
  const [localOpenFilter, setLocalOpenFilter] = useState(Boolean(filterForCategory && open))
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || categories[0] || null)
  const [filters, setFilters] = useState({})
  const sheetRef = useRef(null)
  const [expanded, setExpanded] = useState(false)

  const DEFAULT_FILTERS = {
    size: ['All'],
    side: ['All'],
    meat: ['All']
  }

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

  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [visible])

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
