// pages/checkout.js
import { useOrderGuard } from "../hooks/useOrderGuard";
import Checkout from "../components/Checkout";

export default function CheckoutPage() {
  const { allowed, checking } = useOrderGuard({
    requireStore: true,
    requireTable: true,
    redirectTo: "/", // atau "/menu"
  });

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading checkout...
      </div>
    );
  }

  if (!allowed) return null;

  return <Checkout />;
}