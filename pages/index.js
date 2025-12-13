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
          <>
            <HeroLocation />
            <PaymentBar />
          </>
        ) : (
          <InfoBox message="Silakan scan barcode terlebih dahulu" />
        )}
      </main>
    </div>
  );
}