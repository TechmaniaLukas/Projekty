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
