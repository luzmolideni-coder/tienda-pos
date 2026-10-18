"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { aplicarTecla, montoDeTexto, TecladoMonto, type Tecla } from "@/components/pos/TecladoMonto";
import { formatMXN } from "@/lib/format";

interface ModalTecladoProps {
  titulo: string;
  subtitulo?: string;
  valorInicial: number;
  /** "piezas" usa enteros; "moneda" permite dos decimales y muestra $. */
  modo: "piezas" | "moneda";
  onAceptar: (valor: number) => void;
  onCerrar: () => void;
}

/** Captura un número con teclado grande. La primera tecla reemplaza el valor actual. */
export function ModalTeclado({ titulo, subtitulo, valorInicial, modo, onAceptar, onCerrar }: ModalTecladoProps) {
  const [texto, setTexto] = useState("");
  const alTecla = useCallback((tecla: Tecla) => setTexto((prev) => aplicarTecla(prev, tecla)), []);

  const valor = texto === "" ? valorInicial : montoDeTexto(texto);
  const aceptar = useCallback(() => onAceptar(valor), [onAceptar, valor]);

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "Enter") {
        // Sin esto, Enter también "presiona" el botón que abrió el teclado y lo vuelve a abrir.
        e.preventDefault();
        aceptar();
      }
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [aceptar, onCerrar]);

  return (
    <div className="fixed inset-0 z-[55] grid place-items-center bg-slate-950/60 p-6" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-2 text-lg font-semibold">{titulo}</p>
            {subtitulo && <p className="text-sm text-slate-500">{subtitulo}</p>}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="touch-target pressable grid shrink-0 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800"
          >
            <X className="size-6" aria-hidden />
          </button>
        </div>
        <p className={`text-center text-5xl font-bold tabular-nums ${texto === "" ? "text-slate-300 dark:text-slate-600" : ""}`}>
          {modo === "moneda" ? formatMXN(valor) : valor}
        </p>
        <TecladoMonto onTecla={alTecla} decimales={modo === "moneda"} />
        <button
          type="button"
          onClick={aceptar}
          className="pressable h-16 rounded-2xl bg-emerald-600 text-xl font-semibold text-white"
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}
