"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { ModalTeclado } from "@/components/operacion/ModalTeclado";

interface ControlCantidadProps {
  valor: number;
  /**
   * Recibe una función anterior → nueva, para aplicarla con setState(prev => ...).
   * Así dos toques rápidos en + suman 2 aunque React no haya re-renderizado entre ellos.
   */
  onCambiar: (siguiente: (anterior: number) => number) => void;
  /** Nombre del producto, para el teclado y la accesibilidad. */
  etiqueta: string;
}

const boton =
  "pressable grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-700 disabled:opacity-30 dark:bg-slate-800 dark:text-slate-200";

/** − / cantidad / +. Tocar la cantidad abre un teclado para escribirla directo. */
export function ControlCantidad({ valor, onCambiar, etiqueta }: ControlCantidadProps) {
  const [tecleando, setTecleando] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Quitar una pieza de ${etiqueta}`}
        disabled={valor <= 0}
        onClick={() => onCambiar((n) => Math.max(0, n - 1))}
        className={boton}
      >
        <Minus className="size-6" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Escribir piezas de ${etiqueta}: ${valor}`}
        onClick={() => setTecleando(true)}
        className={`pressable h-14 w-20 rounded-2xl text-2xl font-bold tabular-nums ring-2 ${
          valor > 0
            ? "bg-emerald-50 text-emerald-800 ring-emerald-500 dark:bg-emerald-950 dark:text-emerald-200"
            : "bg-white text-slate-400 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
        }`}
      >
        {valor}
      </button>
      <button type="button" aria-label={`Agregar una pieza de ${etiqueta}`} onClick={() => onCambiar((n) => n + 1)} className={boton}>
        <Plus className="size-6" aria-hidden />
      </button>

      {tecleando && (
        <ModalTeclado
          titulo={etiqueta}
          subtitulo="Piezas"
          modo="piezas"
          valorInicial={valor}
          onCerrar={() => setTecleando(false)}
          onAceptar={(n) => {
            onCambiar(() => Math.max(0, Math.round(n)));
            setTecleando(false);
          }}
        />
      )}
    </div>
  );
}
