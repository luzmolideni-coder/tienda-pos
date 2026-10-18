"use client";

import { Loader2, RefreshCw } from "lucide-react";

interface SeccionProps {
  titulo: string;
  extra?: React.ReactNode;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  children: React.ReactNode;
}

/** Bloque del panel con su propio estado de carga y error, para que una consulta lenta no frene a las demás. */
export function Seccion({ titulo, extra, cargando, error, onReintentar, children }: SeccionProps) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{titulo}</h2>
        {extra}
      </div>
      {error ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center text-slate-500">
          <p>{error}</p>
          <button
            type="button"
            onClick={onReintentar}
            className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-900 px-5 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            <RefreshCw className="size-5" aria-hidden />
            Reintentar
          </button>
        </div>
      ) : cargando ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-8 animate-spin text-emerald-600" aria-label={`Cargando ${titulo}`} />
        </div>
      ) : (
        children
      )}
    </section>
  );
}
