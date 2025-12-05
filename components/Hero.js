// components/HeroLocation.js
import Image from 'next/image'
import { getUser } from '../lib/auth'

export default function HeroLocation() {
  const user = getUser?.() || null;
  return (
    <section className="relative">
      {/* hero background */}
      <div className="h-40 md:h-48 w-full relative overflow-hidden">
        <Image
          src="/images/hero.jpg"
          alt="hero background"
          fill
          priority
          style={{ objectFit: 'cover', filter: 'brightness(0.6)' }}
        />
      </div>

      <div className="container mx-auto px-4">
        <div className="-mt-10">
          <div className="card-rounded p-4">
            <div className="bg-white rounded-xl p-4 shadow">
              <h3 className="text-center text-lg font-bold">
                Yoshinoya Mall Grand Indonesia
              </h3>
              <p className="text-center lead-muted mt-1">
                Jl. Sudirman No. 24, Jakarta Barat, Jakarta, Indonesia
              </p>

              {/* gradient button */}
              <div className="mt-4 flex justify-center">
                <button className="btn-gradient flex items-center gap-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M3 7h18M3 12h18M3 17h18" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span className="text-sm">Table {user.tableNumber}</span>
                </button>
              </div>
            </div>

            {/* menu options */}
            <div className="mt-4 grid grid-cols-2 gap-3">

              {/* makan di sini */}
              <div className="p-3 bg-white rounded-lg flex flex-col items-center text-center">
                <div className="w-full h-32 bg-orange-50 rounded-lg overflow-hidden">
                  <Image
                    src="/images/eat-here.png"
                    alt="eat here"
                    width={400}
                    height={300}
                    className="object-cover w-full h-full"
                  />
                </div>
                <div className="mt-3 font-semibold">Makan di sini</div>
              </div>

              {/* bawa pulang */}
              <div className="p-3 bg-white rounded-lg flex flex-col items-center text-center">
                <div className="w-full h-32 bg-orange-50 rounded-lg overflow-hidden">
                  <Image
                    src="/images/takeaway.png"
                    alt="takeaway"
                    width={400}
                    height={300}
                    className="object-cover w-full h-full"
                  />
                </div>
                <div className="mt-3 font-semibold">Bawa pulang</div>
              </div>

            </div>

            {/* warning box */}
            <div className="mt-4 border border-yellow-200 bg-yellow-50 text-sm text-gray-700 p-3 rounded-md flex items-start gap-2">
              <svg className="w-5 h-5 text-yellow-700" viewBox="0 0 24 24" fill="none">
                <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <div>
                Mohon <strong>tidak berpindah tempat</strong> ketika sedang melakukan pemesanan
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
