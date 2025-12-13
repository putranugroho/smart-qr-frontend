// pages/index.js
import Header from "../components/Header";
import HeroLocation from "../components/HeroLocation";
import PaymentBar from "../components/PaymentBar";
import InfoBox from "../components/InfoBox";
import { useOrderGuard } from "../hooks/useOrderGuard";

export default function Home() {
  const { allowed, checking } = useOrderGuard({
    requireStore: true,
    requireTable: true,
  });

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main>
        {allowed ? (
            <main>
              <HeroLocation />
              {/* place InfoBox just after hero/options */}
              <div className="mt-2 mb-2">
                <InfoBox />
              </div>
              <PaymentBar />
            </main>
        ) : (
          <div className="max-w-md mx-auto mt-20 text-center bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-2">
              Mohon maaf sistem sedang dalam maintenance, silakan order di kasir / kiosk
            </h2>
          </div>
        )}
      </main>
    </div>
  );
}