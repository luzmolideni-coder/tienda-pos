"use client";

import { Loader2, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { formatMXN } from "@/lib/format";

interface ModalAperturaTurnoProps {
  nombreUsuario: string;
  fondoSugerido: number;
  /** Debe lanzar un error si el turno no se pudo abrir. */
  onAbrir: (fondoInicial: number) => Promise<void>;
  onCambiarUsuario: () => void;
}

const AJUSTES = [-50, -10, 10, 50];

/** Bloquea el POS hasta abrir turno: sin turno no se pueden registrar ventas. */
export function ModalAperturaTurno({ nombreUsuario, fondoSugerido, onAbrir, onCambiarUsuario }: ModalAperturaTurnoProps) {
  const [texto, setTexto] = useState(String(fondoSugerido));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fondo = Number(texto.replace(",", "."));
  const fondoValido = texto.trim() !== "" && Number.isFinite(fondo) && fondo >= 0;

  const ajustar = (delta: number) => {
    const base = fondoValido ? fondo : 0;
    setTexto(String(Math.max(0, base + delta)));
  };

  const abrir = async () => {
    if (!fondoValido || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await onAbrir(fondo);
    } catch (e) {
      console.error(e);
      const detalle = e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setError(`No se pudo abrir el turno. ${detalle}`.trim());
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-turno"
        className="flex w-full max-w-lg flex-col gap-6 rounded-3xl bg-white p-8 shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Wallet className="size-8" aria-hidden />
          </span>
          <div>
            <h2 id="titulo-turno" className="text-2xl font-semibold">
              Apertura de turno
            </h2>
            <p className="text-slate-500">Hola, {nombreUsuario}. No hay un turno abierto.</p>
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className="font-medium text-slate-600 dark:text-slate-300">Fondo fijo inicial en caja</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-3xl font-semibold text-slate-400">
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={texto}
              onChange={(e) => setTexto(e.target.value.replace(/[^\d.,]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && abrir()}
              disabled={guardando}
              className="h-20 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-5 text-4xl font-bold tabular-nums outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </label>

        <div className="grid grid-cols-4 gap-2">
          {AJUSTES.map((delta) => (
            <button
              key={delta}
              type="button"
              disabled={guardando}
              onClick={() => ajustar(delta)}
              className="touch-target pressable rounded-2xl bg-slate-100 text-lg font-semibold tabular-nums dark:bg-slate-800"
            >
              {delta > 0 ? `+${delta}` : delta}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-4 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!fondoValido || guardando}
          onClick={abrir}
          className="pressable flex h-16 items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-2xl font-semibold text-white disabled:opacity-40"
        >
          {guardando && <Loader2 className="size-7 animate-spin" aria-hidden />}
          {guardando ? "Abriendo…" : `Abrir turno con ${fondoValido ? formatMXN(fondo) : "—"}`}
        </button>

        <button
          type="button"
          disabled={guardando}
          onClick={onCambiarUsuario}
          className="touch-target pressable flex items-center justify-center gap-2 rounded-2xl font-medium text-slate-500"
        >
          <LogOut className="size-5" aria-hidden />
          Cambiar usuario
        </button>
      </div>
    </div>
  );
}
