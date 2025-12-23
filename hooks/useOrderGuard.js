// hooks/useOrderGuard.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getUser } from "../lib/auth";

function isOperationalTimeWIB() {
  const now = new Date();
  const wibHour = (now.getUTCHours() + 7) % 24;
  return wibHour >= process.env.NEXT_PUBLIC_JAM_BUKA && wibHour < process.env.NEXT_PUBLIC_JAM_TUTUP;
}

export function useOrderGuard(options = {}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

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
        redirectTo && router.replace(redirectTo);
      }
      setChecking(false);
      return;
    }

    /**
     * =========================
     * 2. DI LUAR JAM OPERASIONAL
     * =========================
     */
    if (!inOperationalTime) {
      if (isX99) {
        setAllowed(true);
      } else {
        setAllowed(false);
        redirectTo && router.replace(redirectTo);
      }
      setChecking(false);
      return;
    }

    /**
     * =========================
     * 3. VALIDASI NORMAL
     * =========================
     */
    const hasStore =
      !requireStore || Boolean(user?.storeLocation);

    const hasTable =
      !requireTable ||
      user?.tableNumber !== "" ||
      user?.orderType === "TA";

    if (hasStore && hasTable) {
      setAllowed(true);
    } else {
      setAllowed(false);
      redirectTo && router.replace(redirectTo);
    }

    setChecking(false);
  }, [router, redirectTo, requireStore, requireTable]);

  return { allowed, checking };
}