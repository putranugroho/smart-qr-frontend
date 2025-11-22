// pages/item/[productCode].js
import { useRouter } from 'next/router'
import OrderStatus from '../../components/OrderStatus'

export default function OrderStatusPage() {
  const router = useRouter()
  const { id } = router.query

  // OrderStatus akan membaca router.query untuk data dasar (title/price/image/description)
  // dan melakukan fetch condiment sendiri berdasarkan productCode.
  return <OrderStatus id={id} />
}