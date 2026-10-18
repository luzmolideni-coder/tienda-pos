"use client";

import { useEffect } from "react";

/** Registra /sw.js solo en producción para no interferir con el hot reload de desarrollo. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.error("No se pudo registrar el service worker", error);
    });
  }, []);

  return null;
}
