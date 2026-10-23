"use client";

import { formatMXN } from "@/lib/format";
import type { Producto } from "@/types/pos";

interface GridProductosProps {
  productos: Producto[];
  onAgregar: (producto: Producto) => void;
}

export function GridProductos({ productos, onAgregar }: GridProductosProps) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
      {productos.map((p) => {
        const sinPrecio = !(p.precio_venta > 0);
        return (
          <li key={p.id}>
            {/* Sin precio sigue siendo tocable: el padre explica por qué no se agrega. */}
            <button
              type="button"
              onClick={() => onAgregar(p)}
              aria-disabled={sinPrecio}
              className={`pressable flex h-32 w-full flex-col justify-between rounded-2xl p-4 text-left shadow-sm ring-1 ${
                sinPrecio
                  ? "bg-slate-100 text-slate-500 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"
                  : "bg-white ring-slate-200 active:ring-emerald-500 dark:bg-slate-800 dark:ring-slate-700"
              }`}
            >
              <span className="line-clamp-2 text-lg font-medium leading-snug">{p.nombre}</span>
              {sinPrecio ? (
                <span className="text-base font-semibold text-amber-700 dark:text-amber-400">Sin precio</span>
              ) : (
                <span className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatMXN(p.precio_venta)}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
