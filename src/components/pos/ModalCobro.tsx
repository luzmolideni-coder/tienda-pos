"use client";

import { ArrowRightLeft, Banknote, CreditCard, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMXN, redondear } from "@/lib/format";
import type { MetodoPago } from "@/types/pos";

interface ModalCobroProps {
  total: number;
  onCerrar: () => void;
  /** Debe lanzar un error si la venta no se pudo guardar. */
  onConfirmar: (metodo: MetodoPago, pagaCon: number) => Promise<void>;
}

const METODOS: { valor: MetodoPago; etiqueta: string; Icono: typeof Banknote }[] = [
  { valor: "efectivo", etiqueta: "Efectivo", Icono: Banknote },
  { valor: "tarjeta", etiqueta: "Tarjeta", Icono: CreditCard },
  { valor: "transferencia", etiqueta: "Transferencia", Icono: ArrowRightLeft },
];

const BILLETES = [20, 50, 100, 200, 500, 1000];

export function ModalCobro({ total, onCerrar, onConfirmar }: ModalCobroProps) {
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [recibido, setRecibido] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esEfectivo = metodo === "efectivo";
  const cambio = redondear(recibido - total);
  const puedeConfirmar = !guardando && (!esEfectivo || recibido >= total);

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar();
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [guardando, onCerrar]);

  const confirmar = async () => {
    if (!puedeConfirmar) return;
    setGuardando(true);
    setError(null);
    try {
      await onConfirmar(metodo, esEfectivo ? recibido : total);
    } catch (e) {
      console.error(e);
      const detalle = e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setError(`No se pudo guardar la venta. ${detalle}`.trim());
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-6"
      onClick={() => !guardando && onCerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-cobro"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-2xl flex-col gap-6 overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="titulo-cobro" className="text-lg text-slate-500">
              Total a cobrar
            </h2>
            <p className="text-5xl font-bold tabular-nums">{formatMXN(total)}</p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            disabled={guardando}
            onClick={onCerrar}
            className="touch-target pressable grid place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800"
          >
            <X className="size-6" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Forma de pago">
          {METODOS.map(({ valor, etiqueta, Icono }) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={metodo === valor}
              disabled={guardando}
              onClick={() => setMetodo(valor)}
              className={`pressable flex h-20 flex-col items-center justify-center gap-1 rounded-2xl text-lg font-medium ring-2 ${
                metodo === valor
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-slate-50 text-slate-600 ring-transparent dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              <Icono className="size-7" aria-hidden />
              {etiqueta}
            </button>
          ))}
        </div>

        {esEfectivo && (
          <div className="space-y-4">
            <div className="grid grid-cols-6 gap-2">
              {BILLETES.map((billete) => (
                <button
                  key={billete}
                  type="button"
                  disabled={guardando}
                  onClick={() => setRecibido((r) => redondear(r + billete))}
                  className="pressable h-16 rounded-2xl bg-emerald-100 text-xl font-semibold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                >
                  ${billete}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={guardando}
                onClick={() => setRecibido(total)}
                className="touch-target pressable rounded-2xl bg-slate-100 text-lg font-medium dark:bg-slate-800"
              >
                Pago exacto
              </button>
              <button
                type="button"
                disabled={guardando || recibido === 0}
                onClick={() => setRecibido(0)}
                className="touch-target pressable rounded-2xl bg-slate-100 text-lg font-medium disabled:opacity-40 dark:bg-slate-800"
              >
                Borrar monto
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
              <div>
                <p className="text-slate-500">Recibido</p>
                <p className="text-3xl font-semibold tabular-nums">{formatMXN(recibido)}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-500">{cambio < 0 ? "Falta" : "Cambio"}</p>
                <p
                  className={`text-3xl font-bold tabular-nums ${
                    cambio < 0 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {formatMXN(Math.abs(cambio))}
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!puedeConfirmar}
          onClick={confirmar}
          className="pressable flex h-16 items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-2xl font-semibold text-white disabled:opacity-40"
        >
          {guardando && <Loader2 className="size-7 animate-spin" aria-hidden />}
          {guardando ? "Guardando…" : "Confirmar venta"}
        </button>
      </div>
    </div>
  );
}
