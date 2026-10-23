"use client";

import { CameraOff, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

interface EscanerCamaraProps {
  /** Se llama una sola vez con el primer código leído; después la cámara se apaga. */
  onDetectado: (codigo: string) => void;
  onCerrar: () => void;
}

/**
 * Lee códigos de barras de producto (EAN, UPC, Code 128) con la cámara trasera.
 * La cámara solo funciona en https o localhost: en http://192.168… el navegador la bloquea.
 */
export function EscanerCamara({ onDetectado, onCerrar }: EscanerCamaraProps) {
  const idContenedor = `escaner-${useId().replace(/:/g, "")}`;
  const [estado, setEstado] = useState<"iniciando" | "leyendo" | "error">("iniciando");
  const [error, setError] = useState<string | null>(null);
  // Refs: el callback de la librería se crea una vez y no debe ver valores viejos.
  const detectado = useRef(false);
  const alDetectar = useRef(onDetectado);
  alDetectar.current = onDetectado;

  useEffect(() => {
    if (!window.isSecureContext) {
      setEstado("error");
      setError("La cámara solo funciona con https. Abre la app desde su dirección de Vercel o usa el buscador.");
      return;
    }

    let lector: import("html5-qrcode").Html5Qrcode | null = null;
    let cancelado = false;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import("html5-qrcode");
        if (cancelado) return;
        lector = new Html5Qrcode(idContenedor, {
          verbose: false,
          formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39],
          useBarCodeDetectorIfSupported: true,
        });
        await lector.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(h, w) * 0.45) }) },
          (texto) => {
            if (detectado.current) return;
            detectado.current = true;
            alDetectar.current(texto.trim());
          },
          () => {},
        );
        if (cancelado) {
          await lector.stop().catch(() => {});
          return;
        }
        setEstado("leyendo");
      } catch (e) {
        console.error(e);
        if (cancelado) return;
        const mensaje = e instanceof Error ? e.message : String(e);
        setEstado("error");
        setError(
          /Permission|NotAllowed/i.test(mensaje)
            ? "No hay permiso para usar la cámara. Actívalo en la configuración del navegador."
            : /NotFound|Requested device/i.test(mensaje)
              ? "No se encontró una cámara en este dispositivo."
              : "No se pudo abrir la cámara.",
        );
      }
    })();

    return () => {
      cancelado = true;
      const l = lector;
      if (l) {
        l.stop()
          .catch(() => {})
          .finally(() => {
            try {
              l.clear();
            } catch {}
          });
      }
    };
  }, [idContenedor]);

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-slate-950/90 p-6" role="dialog" aria-modal="true" aria-label="Escanear código de barras">
      <div className="mb-4 flex items-center justify-between text-white">
        <p className="text-xl font-semibold">Apunta la cámara al código de barras</p>
        <button
          type="button"
          aria-label="Cerrar cámara"
          onClick={onCerrar}
          className="touch-target pressable grid place-items-center rounded-2xl bg-white/10"
        >
          <X className="size-6" aria-hidden />
        </button>
      </div>
      <div className="relative mx-auto w-full max-w-2xl flex-1 overflow-hidden rounded-3xl bg-black">
        <div id={idContenedor} className="size-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
        {estado === "iniciando" && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="size-10 animate-spin text-white" aria-label="Abriendo cámara" />
          </div>
        )}
        {estado === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <CameraOff className="size-12" aria-hidden />
            <p className="max-w-sm text-lg">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
