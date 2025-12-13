// hooks/useOrderGuard.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getUser } from "../lib/auth";

export function useOrderGuard(options = {}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  const {
    redirectTo = null,      // contoh: "/scan"
    requireStore = true,    // butuh storeLocation
    requireTable = true,    // butuh tableNumber
  } = options;

  useEffect(() => {
    const user = getUser();

    const hasStore =
      !requireStore || Boolean(user?.storeLocation);

    const hasTable = user?.tableNumber == "X99" ? true : false;

    if (hasStore && hasTable) {
      setAllowed(true);
    } else {
      setAllowed(false);

      if (redirectTo) {
        router.replace(redirectTo);
      }
    }

    setChecking(false);
  }, [router, redirectTo, requireStore, requireTable]);

  return { allowed, checking };
}