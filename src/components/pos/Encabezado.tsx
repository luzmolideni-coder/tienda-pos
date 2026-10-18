"use client";

import { LogOut, Search, ShoppingCart, UserRound, X } from "lucide-react";
import type { Usuario } from "@/types/pos";

interface EncabezadoProps {
  usuario: Usuario;
  busqueda: string;
  onBusqueda: (texto: string) => void;
  /** Enter en el buscador: útil con lector de código de barras tipo pistola. */
  onEnterBusqueda: () => void;
  onCambiarUsuario: () => void;
}

export function Encabezado({ usuario, busqueda, onBusqueda, onEnterBusqueda, onCambiarUsuario }: EncabezadoProps) {
  return (
    <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
        <ShoppingCart className="size-6" aria-hidden />
      </span>

      <label className="relative max-w-2xl flex-1">
        <span className="sr-only">Buscar producto por nombre o código</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnterBusqueda();
            if (e.key === "Escape") onBusqueda("");
          }}
          placeholder="Buscar por nombre o código"
          autoComplete="off"
          className="touch-target w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-14 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800 [&::-webkit-search-cancel-button]:hidden"
        />
        {busqueda && (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onClick={() => onBusqueda("")}
            className="pressable absolute right-1 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-xl text-slate-500"
          >
            <X className="size-5" aria-hidden />
          </button>
        )}
      </label>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 text-right">
          <UserRound className="size-6 text-slate-400" aria-hidden />
          <div className="leading-tight">
            <p className="font-semibold">{usuario.nombre}</p>
            <p className="text-sm capitalize text-slate-500">{usuario.rol}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCambiarUsuario}
          className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-100 px-4 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <LogOut className="size-5" aria-hidden />
          Cambiar usuario
        </button>
      </div>
    </header>
  );
}
