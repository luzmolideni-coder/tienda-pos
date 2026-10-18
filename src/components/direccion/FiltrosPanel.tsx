"use client";

import { CalendarRange, Store } from "lucide-react";
import type { FiltroTienda, Periodo, Tienda } from "@/lib/panel";

interface FiltrosPanelProps {
  tiendas: Tienda[];
  tienda: FiltroTienda;
  onTienda: (t: FiltroTienda) => void;
  periodo: Periodo;
  onPeriodo: (p: Periodo) => void;
  desde: string;
  hasta: string;
  onDesde: (iso: string) => void;
  onHasta: (iso: string) => void;
}

const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Esta semana" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "personalizado", etiqueta: "Personalizado" },
];

function chip(activo: boolean) {
  return `touch-target pressable flex items-center rounded-2xl px-4 font-medium ring-2 ${
    activo
      ? "bg-emerald-50 text-emerald-800 ring-emerald-600 dark:bg-emerald-950 dark:text-emerald-200"
      : "bg-slate-100 text-slate-700 ring-transparent dark:bg-slate-800 dark:text-slate-200"
  }`;
}

export function FiltrosPanel(props: FiltrosPanelProps) {
  const { tiendas, tienda, onTienda, periodo, onPeriodo, desde, hasta, onDesde, onHasta } = props;
  const campoFecha =
    "touch-target rounded-2xl border border-slate-200 bg-white px-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800";

  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Sucursal">
        <Store className="mr-1 size-5 text-slate-400" aria-hidden />
        <button type="button" role="radio" aria-checked={tienda === null} onClick={() => onTienda(null)} className={chip(tienda === null)}>
          Todas las tiendas
        </button>
        {tiendas.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tienda === String(t.id)}
            onClick={() => onTienda(String(t.id))}
            className={chip(tienda === String(t.id))}
          >
            {t.nombre}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Periodo">
        <CalendarRange className="mr-1 size-5 text-slate-400" aria-hidden />
        {PERIODOS.map(({ valor, etiqueta }) => (
          <button key={valor} type="button" role="radio" aria-checked={periodo === valor} onClick={() => onPeriodo(valor)} className={chip(periodo === valor)}>
            {etiqueta}
          </button>
        ))}
        {periodo === "personalizado" && (
          <span className="flex items-center gap-2">
            <label className="sr-only" htmlFor="panel-desde">
              Desde
            </label>
            <input id="panel-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => onDesde(e.target.value)} className={campoFecha} />
            <span className="text-slate-400">a</span>
            <label className="sr-only" htmlFor="panel-hasta">
              Hasta
            </label>
            <input id="panel-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => onHasta(e.target.value)} className={campoFecha} />
          </span>
        )}
      </div>
    </div>
  );
}
