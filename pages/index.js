// pages/index.js
import Header from '../components/Header'
import HeroLocation from '../components/HeroLocation'
import PaymentBar from '../components/PaymentBar'
import InfoBox from '../components/InfoBox'

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <HeroLocation />
        {/* place InfoBox just after hero/options */}
        <div className="mt-2 mb-2">
          <InfoBox />
        </div>
        <PaymentBar />
      </main>
    </div>
  )
}
