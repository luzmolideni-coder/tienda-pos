"use client";

import { ArrowDownUp, Percent, Receipt, TrendingUp } from "lucide-react";
import { formatMXN } from "@/lib/format";
import type { Kpis } from "@/lib/panel";

function Tarjeta({ titulo, Icono, valor, children }: { titulo: string; Icono: typeof Receipt; valor: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-slate-50 p-5 dark:bg-slate-800">
      <p className="flex items-center gap-2 font-medium text-slate-500">
        <Icono className="size-5" aria-hidden />
        {titulo}
      </p>
      <p className="text-3xl font-bold tabular-nums">{valor}</p>
      <div className="text-sm text-slate-500">{children}</div>
    </div>
  );
}

export function TarjetasKpi({ kpis }: { kpis: Kpis }) {
  const salidas = kpis.pagosProveedores + kpis.gastos;
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <Tarjeta titulo="Ventas totales" Icono={TrendingUp} valor={formatMXN(kpis.ventasTotales)}>
        <p>
          {kpis.numVentas} venta{kpis.numVentas === 1 ? "" : "s"}
        </p>
        <p className="tabular-nums">
          Efectivo {formatMXN(kpis.porMetodo.efectivo)} · Tarjeta {formatMXN(kpis.porMetodo.tarjeta)} · Transf.{" "}
          {formatMXN(kpis.porMetodo.transferencia)}
        </p>
      </Tarjeta>

      <Tarjeta titulo="Utilidad bruta estimada" Icono={Percent} valor={formatMXN(kpis.utilidadBruta)}>
        <p
          className={`text-base font-semibold ${
            kpis.margenPct === null ? "" : kpis.margenPct < 0 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {kpis.margenPct === null ? "Sin ventas" : `${kpis.margenPct.toFixed(1)}% de margen`}
        </p>
        <p className="tabular-nums">Costo de lo vendido {formatMXN(kpis.costoVendido)}</p>
      </Tarjeta>

      <Tarjeta titulo="Ticket promedio" Icono={Receipt} valor={formatMXN(kpis.ticketPromedio)}>
        <p>Ventas ÷ número de tickets</p>
      </Tarjeta>

      <Tarjeta titulo="Movimientos de caja" Icono={ArrowDownUp} valor={formatMXN(kpis.entradas - salidas)}>
        <p className="tabular-nums text-emerald-700 dark:text-emerald-400">+ Entradas {formatMXN(kpis.entradas)}</p>
        <p className="tabular-nums text-red-600">− Pagos a proveedores {formatMXN(kpis.pagosProveedores)}</p>
        <p className="tabular-nums text-red-600">− Gastos {formatMXN(kpis.gastos)}</p>
      </Tarjeta>
    </div>
  );
}
