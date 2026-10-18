"use client";

import { Delete, LogIn } from "lucide-react";
import { useEffect } from "react";

interface PinPadProps {
  pin: string;
  largoMaximo: number;
  deshabilitado?: boolean;
  onDigito: (digito: string) => void;
  onBorrar: () => void;
  onIngresar: () => void;
}

const DIGITOS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const teclaBase =
  "pressable grid h-20 place-items-center rounded-2xl text-3xl font-semibold select-none disabled:opacity-40";

/** Teclado numérico táctil. También acepta el teclado físico (dígitos, Backspace y Enter). */
export function PinPad({ pin, largoMaximo, deshabilitado, onDigito, onBorrar, onIngresar }: PinPadProps) {
  useEffect(() => {
    if (deshabilitado) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) onDigito(e.key);
      else if (e.key === "Backspace") onBorrar();
      else if (e.key === "Enter") onIngresar();
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [deshabilitado, onDigito, onBorrar, onIngresar]);

  return (
    <div className="grid w-full max-w-sm grid-cols-3 gap-3">
      {DIGITOS.map((d) => (
        <button
          key={d}
          type="button"
          disabled={deshabilitado || pin.length >= largoMaximo}
          onClick={() => onDigito(d)}
          className={`${teclaBase} bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700`}
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        aria-label="Borrar"
        disabled={deshabilitado || pin.length === 0}
        onClick={onBorrar}
        className={`${teclaBase} bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200`}
      >
        <Delete className="size-8" aria-hidden />
      </button>
      <button
        type="button"
        disabled={deshabilitado || pin.length >= largoMaximo}
        onClick={() => onDigito("0")}
        className={`${teclaBase} bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700`}
      >
        0
      </button>
      <button
        type="button"
        aria-label="Ingresar"
        disabled={deshabilitado || pin.length === 0}
        onClick={onIngresar}
        className={`${teclaBase} bg-emerald-600 text-white`}
      >
        <LogIn className="size-8" aria-hidden />
      </button>
    </div>
  );
}
