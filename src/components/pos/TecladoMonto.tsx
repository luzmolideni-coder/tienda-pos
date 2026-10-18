"use client";

import { Delete } from "lucide-react";
import { useEffect } from "react";

export type Tecla = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "borrar";

const LARGO_MAXIMO = 9;

/** Aplica una tecla a un monto en texto: un solo punto, máximo dos decimales, sin ceros a la izquierda. */
export function aplicarTecla(actual: string, tecla: Tecla): string {
  if (tecla === "borrar") return actual.slice(0, -1);
  if (actual.length >= LARGO_MAXIMO) return actual;
  if (tecla === ".") return actual.includes(".") ? actual : (actual || "0") + ".";
  const [, decimales] = actual.split(".");
  if (decimales !== undefined && decimales.length >= 2) return actual;
  return actual === "0" ? tecla : actual + tecla;
}

export function montoDeTexto(texto: string): number {
  const n = Number(texto);
  return texto === "" || !Number.isFinite(n) ? 0 : n;
}

interface TecladoMontoProps {
  /** Recibe la tecla; el padre debe aplicarla con setState(prev => aplicarTecla(prev, tecla)). */
  onTecla: (tecla: Tecla) => void;
  deshabilitado?: boolean;
  /** false para cantidades enteras (piezas): oculta el punto decimal. */
  decimales?: boolean;
}

const FILAS: Tecla[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "borrar"];

/** Teclado numérico grande para montos. También acepta el teclado físico si no hay un campo de texto enfocado. */
export function TecladoMonto({ onTecla, deshabilitado, decimales = true }: TecladoMontoProps) {
  useEffect(() => {
    if (deshabilitado) return;
    const alPresionar = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null;
      if (destino && (destino.tagName === "INPUT" || destino.tagName === "TEXTAREA")) return;
      if (/^\d$/.test(e.key)) onTecla(e.key as Tecla);
      else if (decimales && (e.key === "." || e.key === ",")) onTecla(".");
      else if (e.key === "Backspace") onTecla("borrar");
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [deshabilitado, decimales, onTecla]);

  return (
    <div className="grid grid-cols-3 gap-2">
      {FILAS.map((tecla) =>
        tecla === "." && !decimales ? (
          <span key={tecla} aria-hidden />
        ) : (
          <button
            key={tecla}
            type="button"
            disabled={deshabilitado}
            aria-label={tecla === "borrar" ? "Borrar" : tecla === "." ? "Punto decimal" : undefined}
            onClick={() => onTecla(tecla)}
            className={`pressable grid h-16 place-items-center rounded-2xl text-2xl font-semibold disabled:opacity-40 ${
              tecla === "borrar"
                ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                : "bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
            }`}
          >
            {tecla === "borrar" ? <Delete className="size-7" aria-hidden /> : tecla}
          </button>
        ),
      )}
    </div>
  );
}
