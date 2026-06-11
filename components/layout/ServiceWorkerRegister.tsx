"use client";

import { useEffect } from "react";

/**
 * Zaregistruje service worker (PWA instalovatelnost + offline shell).
 * Bez UI — jen side-effect po načtení.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // V dev SW neregistrovat (cache-first statika rozbíjí HMR) a případný
    // dříve zaregistrovaný SW odregistrovat.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((rs) => rs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registrace selhala — appka funguje i bez SW */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
