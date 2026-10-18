"use client";

import { useState } from "react";
import type { FilaInventario, Semaforo } from "@/lib/panel";

const ESTILO: Record<Semaforo, { punto: string; pastilla: string; etiqueta: string }> = {
  rojo: { punto: "bg-red-500", pastilla: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200", etiqueta: "Agotado / bajo mínimo" },
  amarillo: { punto: "bg-amber-400", pastilla: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", etiqueta: "Próximo a agotarse" },
  verde: { punto: "bg-emerald-500", pastilla: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", etiqueta: "Óptimo" },
};

export function SemaforoInventario({ filas, variasTiendas }: { filas: FilaInventario[]; variasTiendas: boolean }) {
  const [filtro, setFiltro] = useState<Semaforo | null>(null);
  const conteo = { rojo: 0, amarillo: 0, verde: 0 };
  for (const f of filas) conteo[f.estado]++;
  const visibles = filtro ? filas.filter((f) => f.estado === filtro) : filas;
  const sinMinimo = filas.filter((f) => f.stockMinimo <= 0).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ESTILO) as Semaforo[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filtro === s}
            onClick={() => setFiltro((f) => (f === s ? null : s))}
            className={`touch-target pressable flex items-center gap-2 rounded-2xl px-4 font-medium ring-2 ${
              filtro === s ? "ring-slate-900 dark:ring-slate-100" : "ring-transparent"
            } ${ESTILO[s].pastilla}`}
          >
            <span className={`size-3 rounded-full ${ESTILO[s].punto}`} aria-hidden />
            {ESTILO[s].etiqueta}
            <span className="tabular-nums">{conteo[s]}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-sm text-slate-500">
            <tr>
              {variasTiendas && <th className="py-2 pr-4 font-medium">Tienda</th>}
              <th className="py-2 pr-4 font-medium">Producto</th>
              <th className="py-2 pr-4 text-right font-medium">Stock actual</th>
              <th className="py-2 pr-4 text-right font-medium">Stock mínimo</th>
              <th className="py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibles.map((f) => (
              <tr key={`${f.tiendaId}|${f.productoId}`}>
                {variasTiendas && <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{f.tiendaNombre}</td>}
                <td className="py-3 pr-4 font-medium">
                  {f.productoNombre}
                  {!f.registrado && <span className="ml-2 text-xs font-normal text-slate-400">sin registro de inventario</span>}
                </td>
                <td className="py-3 pr-4 text-right text-lg font-semibold tabular-nums">{f.stockActual}</td>
                <td className="py-3 pr-4 text-right tabular-nums text-slate-500">{f.stockMinimo > 0 ? f.stockMinimo : "—"}</td>
                <td className="py-3">
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${ESTILO[f.estado].pastilla}`}>
                    <span className={`size-2.5 rounded-full ${ESTILO[f.estado].punto}`} aria-hidden />
                    {ESTILO[f.estado].etiqueta}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && <p className="py-8 text-center text-slate-500">No hay productos en este estado.</p>}
      </div>

      {sinMinimo > 0 && (
        <p className="text-sm text-slate-500">
          {sinMinimo} producto{sinMinimo === 1 ? "" : "s"} sin stock mínimo definido: solo se marcan en rojo cuando se agotan.
        </p>
      )}
    </div>
  );
}
