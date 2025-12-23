// pages/index.js
import Image from "next/image";
import Header from "../components/Header";
import HeroLocation from "../components/HeroLocation";
import PaymentBar from "../components/PaymentBar";
import InfoBox from "../components/InfoBox";
import { useOrderGuard } from "../hooks/useOrderGuard";
import useAutoDetectOrder from '../pages/api/order/webhook'

export default function Home() {
  const { checking_order } = useAutoDetectOrder()
  const { allowed, checking, blockReason } = useOrderGuard({
    requireStore: true,
    requireTable: true,
  });

  if (checking_order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {checking && <p>Checking order status...</p>}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />

      {allowed ? (
        <main>
          <HeroLocation />
          <div className="mt-2 mb-2">
            <InfoBox />
          </div>
          <PaymentBar />
        </main>
      ) : (
        // ===== MAINTENANCE VIEW =====
        <main className="flex items-center justify-center min-h-[calc(100vh-64px)] px-4">
          <div className="text-center max-w-md">
            <img
              src="/images/image-maintenance.jpg" // letakkan di /public/images
              alt="Maintenance"
              width={300} 
              priority
              className="mx-auto mb-6"
            />

            {blockReason === 'maintenance' && (
              <h2 className="text-lg font-semibold text-gray-800">
                <b>
                  Mohon maaf sistem sedang dalam maintenance
                  <br />
                  silakan order di kasir / kiosk
                </b>
              </h2>
            )}

            {blockReason === 'closed' && (
              <h2 className="text-lg font-semibold text-gray-800">
                <b>
                  Mohon maaf QR order sedang ditutup
                  <br />
                  Silakan melakukan pemesanan melalui Kasir (POS)
                </b>
              </h2>
            )}
          </div>
        </main>
      )}
    </div>
  );
}