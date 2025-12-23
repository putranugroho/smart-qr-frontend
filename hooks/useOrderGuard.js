// hooks/useOrderGuard.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getUser } from "../lib/auth";

function isOperationalTimeWIB() {
  const now = new Date();

  const wibHour = (now.getUTCHours() + 7) % 24;
  const wibMinute = now.getUTCMinutes();

  const nowInMinutes = wibHour * 60 + wibMinute;

  const [openHour, openMinute = 0] =
    process.env.NEXT_PUBLIC_JAM_BUKA.split(':').map(Number);

  const [closeHour, closeMinute = 0] =
    process.env.NEXT_PUBLIC_JAM_TUTUP.split(':').map(Number);

  return (
    nowInMinutes >= openHour * 60 + openMinute &&
    nowInMinutes < closeHour * 60 + closeMinute
  );
}

export function useOrderGuard(options = {}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [blockReason, setBlockReason] = useState(null);

  const {
    redirectTo = null,
    requireStore = true,
    requireTable = true,
  } = options;

  useEffect(() => {
    const user = getUser();

    const tableNumber = user?.tableNumber;
    const isX99 = tableNumber === "X99";

    const maintenanceMode =
      process.env.NEXT_PUBLIC_SERVER_MAINTENANCE === "true";

    const inOperationalTime = isOperationalTimeWIB();

    /**
     * =========================
     * 1. MAINTENANCE MODE
     * =========================
     */
    if (maintenanceMode) {
      if (isX99) {
        setAllowed(true);
      } else {
        setAllowed(false);
        setBlockReason('maintenance');
        redirectTo && router.replace(redirectTo);
      }
      setChecking(false);
      return;
    }

    /**
     * =========================
     * 2. JAM TUTUP
     * =========================
     */
    if (!inOperationalTime) {
      if (!isX99) {
        setAllowed(false);
        setBlockReason('closed');
        redirectTo && router.replace(redirectTo);
      } else {
        setAllowed(true);
      }
      setChecking(false);
      return;
    }

    /**
     * =========================
     * 3. JAM BUKA (NORMAL FLOW)
     * =========================
     */
    const hasStore =
      !requireStore || Boolean(user?.storeLocation);

    const hasTable =
      !requireTable ||
      (user?.orderType === "TA") ||
      (user?.orderType === "DI" && Boolean(user?.tableNumber));

    if (!hasStore || !hasTable) {
      setAllowed(false);
      setBlockReason("need-scan");
      redirectTo && router.replace(redirectTo);
    } else {
      setAllowed(true);
    }

    setChecking(false);
  }, [router, redirectTo, requireStore, requireTable]);

  return { allowed, checking, blockReason };
}