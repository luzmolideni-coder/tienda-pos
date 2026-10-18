"use client";

import { Minus, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { formatMXN, redondear } from "@/lib/format";
import type { ItemCarrito, Producto } from "@/types/pos";

interface CarritoProps {
  items: ItemCarrito[];
  total: number;
  piezas: number;
  onCambiarCantidad: (productoId: Producto["id"], delta: number) => void;
  onVaciar: () => void;
  onCobrar: () => void;
}

const botonCantidad =
  "pressable grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";

export function Carrito({ items, total, piezas, onCambiarCantidad, onVaciar, onCobrar }: CarritoProps) {
  return (
    <aside className="flex w-[26rem] shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3 dark:border-slate-800">
        <h2 className="text-lg font-semibold">
          Venta actual{piezas > 0 && <span className="ml-2 text-slate-500">({piezas})</span>}
        </h2>
        <button
          type="button"
          onClick={onVaciar}
          disabled={items.length === 0}
          className="touch-target pressable flex items-center gap-2 rounded-xl px-3 text-red-600 disabled:invisible"
        >
          <Trash2 className="size-5" aria-hidden />
          Vaciar
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-slate-400">
          <ShoppingBasket className="size-12" aria-hidden />
          <p>Toca un producto para agregarlo</p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain dark:divide-slate-800">
          {items.map(({ producto, cantidad }) => (
            <li key={producto.id} className="flex items-center gap-3 px-6 py-3">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-medium leading-snug">{producto.nombre}</p>
                <p className="text-sm tabular-nums text-slate-500">{formatMXN(producto.precio_venta)} c/u</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Quitar uno de ${producto.nombre}`}
                  onClick={() => onCambiarCantidad(producto.id, -1)}
                  className={botonCantidad}
                >
                  {cantidad === 1 ? <Trash2 className="size-5" aria-hidden /> : <Minus className="size-5" aria-hidden />}
                </button>
                <span className="w-8 text-center text-lg font-semibold tabular-nums">{cantidad}</span>
                <button
                  type="button"
                  aria-label={`Agregar uno de ${producto.nombre}`}
                  onClick={() => onCambiarCantidad(producto.id, 1)}
                  className={botonCantidad}
                >
                  <Plus className="size-5" aria-hidden />
                </button>
              </div>
              <p className="w-24 text-right font-semibold tabular-nums">
                {formatMXN(redondear(producto.precio_venta * cantidad))}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-4 border-t border-slate-200 p-6 dark:border-slate-800">
        <div className="flex items-baseline justify-between">
          <span className="text-lg text-slate-500">Total</span>
          <span className="text-4xl font-bold tabular-nums">{formatMXN(total)}</span>
        </div>
        <button
          type="button"
          onClick={onCobrar}
          disabled={items.length === 0}
          className="pressable h-16 w-full rounded-2xl bg-emerald-600 text-2xl font-semibold text-white disabled:opacity-40"
        >
          Cobrar
        </button>
      </div>
    </aside>
  );
}
