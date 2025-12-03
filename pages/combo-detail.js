// pages/combo-detail.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'

// import ComboDetail dynamically (client-side). This avoids SSR issues because we read sessionStorage.
const ComboDetail = dynamic(() => import('../components/ComboDetail'), { ssr: false })

export default function ComboDetailPage() {
  const router = useRouter()
  const { comboId, combo: comboQuery, from, index } = router.query
  const [comboObj, setComboObj] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // only run on client and when router ready
    if (!router.isReady) return

    // If opened for editing from checkout, we intentionally pass no comboObj
    // so that components/ComboDetail can load the combo from cart using the index.
    if (String(from || '') === 'checkout' && (index != null && index !== '')) {
      setComboObj(null)
      setLoaded(true)
      return
    }

    let combo = null
    try {
      if (comboId) {
        const key = `combo_${String(comboId)}`
        const raw = sessionStorage.getItem(key)
        if (raw) {
          combo = JSON.parse(raw)
        }
      }
      if (!combo && comboQuery) {
        // fallback if full combo JSON passed in querystring
        try {
          combo = JSON.parse(String(comboQuery))
        } catch (e) {
          // try decodeURIComponent
          try { combo = JSON.parse(decodeURIComponent(String(comboQuery))) } catch (ee) {}
        }
      }
    } catch (e) {
      console.warn('combo-detail: read combo failed', e)
    }

    setComboObj(combo)
    setLoaded(true)
  }, [router.isReady, comboId, comboQuery, from, index])

  if (!loaded) return <div style={{ padding: 20 }}>Memuat...</div>

  // If opened for editing from checkout, allow ComboDetail to handle loading by index
  if (String(from || '') === 'checkout' && (index != null && index !== '')) {
    return <ComboDetail /> // ComboDetail will read router.query.index and load cart
  }

  if (!comboObj) {
    return (
      <div style={{ padding: 20 }}>
        <div>Data combo tidak ditemukan. Pastikan Anda membuka halaman ini dari menu/produk combo.</div>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => router.push('/menu')}>Kembali ke Menu</button>
        </div>
      </div>
    )
  }

  return <ComboDetail combo={comboObj} />
}
