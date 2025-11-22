// pages/checkout.js
import { useRouter } from 'next/router'
import Checkout from '../components/Checkout'

export default function CheckoutPage() {
  const router = useRouter()
  return <Checkout />
}
