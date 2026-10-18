"use client";

import { ArrowDownToLine, Loader2, ShoppingBag, Truck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { aplicarTecla, montoDeTexto, TecladoMonto, type Tecla } from "@/components/pos/TecladoMonto";
import { ETIQUETA_MOVIMIENTO } from "@/lib/corte";
import { formatMXN } from "@/lib/format";
import type { TipoMovimiento } from "@/types/pos";

interface ModalMovimientoProps {
  onCerrar: () => void;
  /** Debe lanzar un error si no se pudo guardar. */
  onRegistrar: (tipo: TipoMovimiento, monto: number, concepto: string) => Promise<void>;
}

const TIPOS: { tipo: TipoMovimiento; Icono: typeof Truck; placeholder: string; color: string }[] = [
  {
    tipo: "ENTRADA",
    Icono: ArrowDownToLine,
    placeholder: "Ej. cambio traído de caja fuerte",
    color: "ring-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
  {
    tipo: "PAGO_PROVEEDOR",
    Icono: Truck,
    placeholder: "Proveedor y concepto, ej. Coca-Cola – refrescos",
    color: "ring-amber-600 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  {
    tipo: "GASTO",
    Icono: ShoppingBag,
    placeholder: "Ej. bolsas, artículos de limpieza",
    color: "ring-rose-600 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  },
];

export function ModalMovimiento({ onCerrar, onRegistrar }: ModalMovimientoProps) {
  const [tipo, setTipo] = useState<TipoMovimiento>("ENTRADA");
  const [montoTexto, setMontoTexto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monto = montoDeTexto(montoTexto);
  const actual = TIPOS.find((t) => t.tipo === tipo)!;
  // La entrada puede ir sin concepto; un pago o gasto siempre debe decir a quién o en qué.
  const conceptoRequerido = tipo !== "ENTRADA";
  const valido = monto > 0 && (!conceptoRequerido || concepto.trim().length > 0);

  const alTecla = useCallback((tecla: Tecla) => setMontoTexto((prev) => aplicarTecla(prev, tecla)), []);

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardando) onCerrar();
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [guardando, onCerrar]);

  const registrar = async () => {
    if (!valido || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await onRegistrar(tipo, monto, concepto.trim() || ETIQUETA_MOVIMIENTO[tipo]);
    } catch (e) {
      console.error(e);
      const detalle = e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setError(`No se pudo registrar el movimiento. ${detalle}`.trim());
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-6" onClick={() => !guardando && onCerrar()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-movimiento"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <h2 id="titulo-movimiento" className="text-2xl font-semibold">
            Movimiento de caja
          </h2>
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

        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Tipo de movimiento">
          {TIPOS.map(({ tipo: valor, Icono, color }) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={tipo === valor}
              disabled={guardando}
              onClick={() => setTipo(valor)}
              className={`pressable flex h-20 flex-col items-center justify-center gap-1 rounded-2xl text-base font-medium ring-2 ${
                tipo === valor ? color : "bg-slate-50 text-slate-600 ring-transparent dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              <Icono className="size-7" aria-hidden />
              {ETIQUETA_MOVIMIENTO[valor]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
              <p className="text-slate-500">Monto</p>
              <p className="text-4xl font-bold tabular-nums">{formatMXN(monto)}</p>
            </div>
            <label className="flex flex-col gap-2">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {tipo === "PAGO_PROVEEDOR" ? "Proveedor / concepto" : "Concepto"}
                {!conceptoRequerido && <span className="font-normal text-slate-400"> (opcional)</span>}
              </span>
              <input
                type="text"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && registrar()}
                placeholder={actual.placeholder}
                maxLength={120}
                disabled={guardando}
                className="touch-target w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
            {error && (
              <p role="alert" className="rounded-xl bg-red-50 p-4 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}
          </div>
          <TecladoMonto onTecla={alTecla} deshabilitado={guardando} />
        </div>

        <button
          type="button"
          disabled={!valido || guardando}
          onClick={registrar}
          className="pressable flex h-16 items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-2xl font-semibold text-white disabled:opacity-40"
        >
          {guardando && <Loader2 className="size-7 animate-spin" aria-hidden />}
          {guardando ? "Guardando…" : `Registrar ${ETIQUETA_MOVIMIENTO[tipo].toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}
