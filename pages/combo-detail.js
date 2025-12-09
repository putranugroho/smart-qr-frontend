// pages/combo-detail.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { getCart } from '../lib/cart' // <-- gunakan helper cart untuk recover saat edit

const ComboDetail = dynamic(() => import('../components/ComboDetail'), { ssr: false })

export default function ComboDetailPage() {
  const router = useRouter()
  const { comboId, combo: comboQuery, from, index } = router.query
  const [comboObj, setComboObj] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!router.isReady) return

    // jika datang dari checkout (mode edit), kita coba ambil data combo dari cart/session
    if (String(from) === 'checkout' && index != null) {
      // prefer to get from cart entry (client-side)
      try {
        const cart = getCart() || []
        const idx = Number(index)
        const entry = cart[idx]
        if (entry && entry.type === 'combo' && Array.isArray(entry.combos) && entry.combos.length > 0) {
          // build a combo object similar to the API shape, but keep it simple
          const first = entry.combos[0]
          const detail = first.detailCombo || entry.detailCombo || {}
          const minimal = {
            id: detail.code || detail.id || detail.name || `combo_${idx}`,
            code: detail.code || detail.id || detail.name || `combo_${idx}`,
            name: detail.name || detail.title || 'Combo',
            description: detail.description || '',
            image: detail.image || entry.image || null,
            comboGroups: (first.products || []).reduce((acc, p) => {
              const gk = p.comboGroup || p.comboGroupCode || `group_${p.comboGroup || p.comboGroupCode || 'x'}`
              const found = acc.find(x => x.code === gk)
              if (!found) {
                acc.push({
                  id: gk,
                  code: gk,
                  name: gk,
                  allowSkip: true,
                  products: []
                })
              }
              const group = acc.find(x => x.code === gk)
              group.products.push({
                id: p.code ?? p.id,
                code: p.code ?? p.id,
                name: p.name || '',
                price: p.price ?? 0,
                imagePath: p.imagePath ?? p.image ?? null,
                condimentGroups: p.condimentGroups || []
              })
              return acc
            }, [])
          }
          // persist to session for component recovery under the same key `combo_{code}`
          try {
            if (minimal.code) sessionStorage.setItem(`combo_${String(minimal.code)}`, JSON.stringify(minimal))
          } catch (e) {}
          setComboObj(minimal)
          setLoaded(true)
          return
        }
      } catch (e) {
        console.warn('recover combo page failed', e)
      }

      // if not found -> still render ComboDetail (it will attempt fetch/recover)
      setComboObj(null)
      setLoaded(true)
      return
    }

    // normal flow (buka dari menu dengan comboId / query)
    let combo = null

    try {
      // ✅ gunakan key yang sama (combo_{code}) agar konsisten
      if (comboId) {
        const key = `combo_${comboId}`
        const raw = sessionStorage.getItem(key)
        if (raw) combo = JSON.parse(raw)
      }

      if (!combo && comboQuery) {
        try {
          combo = JSON.parse(decodeURIComponent(String(comboQuery)))
        } catch {}
      }
    } catch (e) {
      console.warn('combo-detail read failed', e)
    }

    setComboObj(combo)
    setLoaded(true)
  }, [router.isReady, comboId, comboQuery, from, index])

  if (!loaded) return <div style={{ padding: 20 }}>Memuat...</div>

  // selalu pass comboObj (bisa null)
  return <ComboDetail combo={comboObj} />
}
