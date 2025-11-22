// components/PaymentBar.js
import Image from 'next/image'

export default function PaymentBar() {
  return (
    <div className="container mx-auto px-4 py-4">
      <div className="card-rounded p-4 text-center">
        <div className="text-sm text-gray-600 mb-3">Hanya menerima Pembayaran Online</div>

        <div className="flex items-center justify-center gap-3 flex-wrap">

          <Image src="/images/gopay.png" width={60} height={28} alt="gopay"/>
          <Image src="/images/shopee.png" width={60} height={28} alt="shopee"/>
          <Image src="/images/qris.png" width={60} height={28} alt="qris"/>
          <Image src="/images/ovo.png" width={60} height={28} alt="ovo"/>
          <Image src="/images/dana.png" width={60} height={28} alt="dana"/>

        </div>
      </div>
    </div>
  )
}
