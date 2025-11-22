// pages/menu.js
import dynamic from 'next/dynamic'

const Menu = dynamic(() => import('../components/Menu'), { ssr: false })

export default function MenuPage() {
  return <Menu />
}
