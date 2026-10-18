"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

/** Mensaje flotante de confirmación que desaparece solo. */
export function Aviso({ mensaje, onOcultar }: { mensaje: string | null; onOcultar: () => void }) {
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(onOcultar, 4000);
    return () => clearTimeout(t);
  }, [mensaje, onOcultar]);

  if (!mensaje) return null;
  return (
    <div
      role="status"
      className="fixed bottom-8 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-900 px-6 py-4 text-lg font-medium text-white shadow-xl"
    >
      <CheckCircle2 className="size-6 text-emerald-400" aria-hidden />
      {mensaje}
    </div>
  );
}
