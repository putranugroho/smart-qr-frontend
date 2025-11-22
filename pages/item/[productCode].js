// pages/item/[productCode].js
import { useRouter } from 'next/router'
import ItemDetail from '../../components/ItemDetail'

export default function ItemPage() {
  const router = useRouter()
  const { productCode } = router.query

  // ItemDetail akan membaca router.query untuk data dasar (title/price/image/description)
  // dan melakukan fetch condiment sendiri berdasarkan productCode.
  return <ItemDetail productCode={productCode} />
}
