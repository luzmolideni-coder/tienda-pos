"use client";

import { Check, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { buscarPorCodigo } from "@/lib/codigos";
import { formatMXN } from "@/lib/format";
import type { Producto } from "@/types/pos";

interface SelectorProductoProps {
  productos: Producto[];
  /** Los del proveedor salen primero. */
  proveedorId: string | null;
  yaAgregados: Set<string>;
  onElegir: (producto: Producto) => void;
  onCerrar: () => void;
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function SelectorProducto({ productos, proveedorId, yaAgregados, onElegir, onCerrar }: SelectorProductoProps) {
  const [busqueda, setBusqueda] = useState("");
  const termino = normalizar(busqueda);

  const lista = useMemo(() => {
    const filtrados = termino
      ? productos.filter((p) => normalizar(p.nombre).includes(termino) || (p.codigo_barras ?? "").includes(termino))
      : productos;
    const delProveedor = (p: Producto) => (proveedorId !== null && String(p.proveedor_id) === proveedorId ? 0 : 1);
    return [...filtrados].sort((a, b) => delProveedor(a) - delProveedor(b) || a.nombre.localeCompare(b.nombre, "es"));
  }, [productos, proveedorId, termino]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-6" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agregar producto"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-2xl flex-col gap-4 rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-center gap-3">
          <label className="relative flex-1">
            <span className="sr-only">Buscar producto</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCerrar();
                // Lector de código de barras: Enter con coincidencia exacta agrega directo.
                if (e.key === "Enter") {
                  const exacto = buscarPorCodigo(productos, busqueda);
                  if (exacto) onElegir(exacto);
                }
              }}
              placeholder="Nombre o código de barras"
              className="touch-target w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="touch-target pressable grid place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800"
          >
            <X className="size-6" aria-hidden />
          </button>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain dark:divide-slate-800">
          {lista.map((p) => {
            const agregado = yaAgregados.has(String(p.id));
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onElegir(p)}
                  className="pressable flex w-full items-center gap-3 px-2 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{p.nombre}</span>
                    <span className="text-sm text-slate-500">
                      Costo {p.costo_actual != null ? formatMXN(p.costo_actual) : "—"}
                      {proveedorId !== null && String(p.proveedor_id) === proveedorId && " · de este proveedor"}
                    </span>
                  </span>
                  {agregado && <Check className="size-6 text-emerald-600" aria-label="Ya agregado" />}
                </button>
              </li>
            );
          })}
          {lista.length === 0 && <li className="py-12 text-center text-slate-400">Ningún producto coincide.</li>}
        </ul>
      </div>
    </div>
  );
}
