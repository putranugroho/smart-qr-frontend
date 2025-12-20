import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { getSavedOrderCode } from '../../../lib/session'

export default function useAutoDetectOrder() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const orderCode = getSavedOrderCode()
    if (!orderCode) {
      setChecking(false)
      return
    }

    let interval = null

    async function checkStatus() {
      try {
        const res = await fetch(`/api/proxy/order/${encodeURIComponent(orderCode)}`)
        if (!res.ok) throw new Error('Failed fetching order status')
        const { data } = await res.json()
        if (!data || typeof data.status === 'undefined') return

        // -1 → belum bayar
        // if (data.status === -1) {
        //   router.replace(`/order/waiting/${orderCode}`)
        // }
        // 0 → sudah bayar
        else if (data.status === 0) {
          router.replace(`/order/${orderCode}`)
        }
        // >0 → sudah diproses
        else if (data.status > 0) {
          router.replace(`/order/${orderCode}`)
        }
      } catch (err) {
        console.error('Auto detect order error', err)
      } finally {
        setChecking(false)
      }
    }

    // polling setiap 5 detik
    interval = setInterval(checkStatus, 5000)
    // langsung panggil sekali supaya tidak tunggu 5 detik
    checkStatus()

    return () => clearInterval(interval)
  }, [])

  return { checking }
}
