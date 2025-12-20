import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { getOrderSession, clearOrderSession } from '../../../lib/orderSession'

const BLOCKED_PATHS = ['/menu', '/checkout', '/paymentpage']

export default function useAutoDetectOrder() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  function isSameCustomer(apiData, session) {
    if (!apiData || !session) return false
  
    const normalize = v =>
      String(v || '').trim().toLowerCase()

    console.log(normalize(apiData.customerName))
    console.log(normalize(session.customerName))
    console.log(normalize(apiData.customerName) === normalize(session.customerName));
    console.log(normalize(apiData.customerPhoneNumber));
    console.log(normalize(session.customerPhone));
    console.log(normalize(apiData.customerPhoneNumber) === normalize(session.customerPhone));
  
    return (
      normalize(apiData.customerName) === normalize(session.customerName) &&
      normalize(apiData.customerPhoneNumber) === normalize(session.customerPhone)
    )
  }

  useEffect(() => {
    // 🚫 Jangan jalan di halaman tertentu
    if (BLOCKED_PATHS.some(p => router.pathname.startsWith(p))) {
      setChecking(false)
      return
    }

    const session = getOrderSession()
        if (!session?.orderCode) {
        setChecking(false)
        return
    }

    // 🚫 Sudah di halaman order → stop
    if (router.asPath.startsWith(`/order/${session.orderCode}`)) {
      setChecking(false)
      return
    }

    let interval = null

    async function checkStatus() {
        try {      
          const res = await fetch(
            `/api/order/check-status?orderCode=${encodeURIComponent(session.orderCode)}`
          )
          if (!res.ok) throw new Error('Failed fetching order status')
      
          const { data } = await res.json()
          if (!data) return
      
          // 🔐 VALIDASI KEPEMILIKAN TRANSAKSI
          const validOwner = isSameCustomer(data, session)
      
          if (!validOwner) {
            console.log('Order session mismatch, clearing session')
            // clearOrderSession()
            return
          }
      
          // ✅ STATUS VALID
          if (data.status >= 0) {
            if (!router.asPath.startsWith(`/order/${session.orderCode}`)) {
              router.replace(`/order/${session.orderCode}`)
            }
          }
        } catch (err) {
          console.error('Auto detect order error', err)
        } finally {
          setChecking(false)
        }
      }      

    checkStatus()
    interval = setInterval(checkStatus, 5000)

    return () => clearInterval(interval)
  }, [router.pathname])

  return { checking }
}
