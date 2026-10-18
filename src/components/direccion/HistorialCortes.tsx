"use client";

import { formatMXN } from "@/lib/format";
import type { Corte } from "@/lib/panel";

const fechaHora = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" });

interface HistorialCortesProps {
  cortes: Corte[];
  variasTiendas: boolean;
  /** Nombre a mostrar por usuario_id; los que falten se muestran abreviados. */
  nombres: Map<string, string>;
}

export function HistorialCortes({ cortes, variasTiendas, nombres }: HistorialCortesProps) {
  if (cortes.length === 0) return <p className="py-8 text-center text-slate-500">No hay turnos cerrados en este periodo.</p>;

  const faltantes = cortes.filter((c) => c.diferencia < 0);
  const totalFaltante = faltantes.reduce((s, c) => s + c.diferencia, 0);
  const sinNombre = cortes.some((c) => !nombres.has(c.usuarioId));
  const celda = "py-3 pr-4 text-right tabular-nums";

  return (
    <div className="flex flex-col gap-3">
      {faltantes.length > 0 && (
        <p className="rounded-xl bg-red-50 p-3 font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
          {faltantes.length} corte{faltantes.length === 1 ? "" : "s"} con faltante · {formatMXN(Math.abs(totalFaltante))} en total
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-2 pr-4 font-medium">Cierre</th>
              {variasTiendas && <th className="py-2 pr-4 font-medium">Tienda</th>}
              <th className="py-2 pr-4 font-medium">Usuario</th>
              <th className="py-2 pr-4 text-right font-medium">Fondo</th>
              <th className="py-2 pr-4 text-right font-medium">Efectivo</th>
              <th className="py-2 pr-4 text-right font-medium">Tarjeta</th>
              <th className="py-2 pr-4 text-right font-medium">Transf.</th>
              <th className="py-2 pr-4 text-right font-medium">Esperado</th>
              <th className="py-2 pr-4 text-right font-medium">Contado</th>
              <th className="py-2 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {cortes.map((c) => (
              <tr key={c.id} className={c.diferencia < 0 ? "bg-red-50/60 dark:bg-red-950/40" : ""}>
                <td className="py-3 pr-4 whitespace-nowrap">{fechaHora.format(new Date(c.cierre))}</td>
                {variasTiendas && <td className="py-3 pr-4">{c.tiendaNombre}</td>}
                <td className="py-3 pr-4">{nombres.get(c.usuarioId) ?? `Usuario ${c.usuarioId.slice(0, 8)}`}</td>
                <td className={celda}>{formatMXN(c.fondoInicial)}</td>
                <td className={celda}>{formatMXN(c.ventasEfectivo)}</td>
                <td className={celda}>{formatMXN(c.ventasTarjeta)}</td>
                <td className={celda}>{formatMXN(c.ventasTransferencia)}</td>
                <td className={celda}>{formatMXN(c.efectivoEsperado)}</td>
                <td className={celda}>{formatMXN(c.efectivoContado)}</td>
                <td
                  className={`py-3 text-right font-bold tabular-nums ${
                    c.diferencia < 0 ? "text-red-600" : c.diferencia > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"
                  }`}
                >
                  {c.diferencia < 0 ? "−" : c.diferencia > 0 ? "+" : ""}
                  {formatMXN(Math.abs(c.diferencia))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sinNombre && (
        <p className="text-sm text-slate-500">
          Algunos nombres se muestran abreviados porque la tabla de usuarios no es legible con la clave de la app.
        </p>
      )}
    </div>
  );
}
