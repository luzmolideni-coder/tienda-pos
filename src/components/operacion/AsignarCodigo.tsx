"use client";

import { AlertTriangle, Camera, Loader2, ScanBarcode, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { EscanerCamara } from "@/components/operacion/EscanerCamara";
import { esCodigoReal } from "@/lib/codigos";
import type { Producto } from "@/types/pos";

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function mensajeDe(e: unknown): string {
  return e && typeof e === "object" && "message" in e ? String(e.message) : "No se pudo guardar el código.";
}

function Marco({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-6" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-2xl flex-col gap-4 rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">{titulo}</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="touch-target pressable grid shrink-0 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800"
          >
            <X className="size-6" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Alerta({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
      {texto}
    </p>
  );
}

interface ElegirProductoProps {
  codigo: string;
  productos: Producto[];
  /** Debe lanzar un error si la base rechaza la asignación. */
  onAsignar: (producto: Producto) => Promise<void>;
  onCerrar: () => void;
}

/** Se escaneó un código real que no está en el catálogo: ¿de qué producto es? */
export function ElegirProductoParaCodigo({ codigo, productos, onAsignar, onCerrar }: ElegirProductoProps) {
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const termino = normalizar(busqueda);

  // Los de código provisional primero: son los que normalmente esperan su código real.
  const lista = useMemo(() => {
    const base = termino ? productos.filter((p) => normalizar(p.nombre).includes(termino)) : productos;
    return [...base].sort((a, b) => Number(esCodigoReal(a.codigo_barras)) - Number(esCodigoReal(b.codigo_barras)));
  }, [productos, termino]);

  const elegir = async (p: Producto) => {
    if (guardando) return;
    setGuardando(String(p.id));
    setError(null);
    try {
      await onAsignar(p);
    } catch (e) {
      setError(mensajeDe(e));
      setGuardando(null);
    }
  };

  return (
    <Marco titulo="Código nuevo: ¿de qué producto es?" onCerrar={onCerrar}>
      <p className="flex items-center gap-2 rounded-xl bg-sky-50 p-3 text-sky-900 dark:bg-sky-950 dark:text-sky-100">
        <ScanBarcode className="size-5 shrink-0" aria-hidden />
        <span>
          El código <strong className="tabular-nums">{codigo}</strong> no está en el catálogo. Busca el producto por su nombre
          y tócalo para guardarle este código.
        </span>
      </p>
      <label className="relative">
        <span className="sr-only">Buscar producto por nombre</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          autoFocus
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre del producto"
          className="touch-target w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <Alerta texto={error} />
      <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain dark:divide-slate-800">
        {lista.slice(0, 80).map((p) => {
          const real = esCodigoReal(p.codigo_barras);
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={guardando !== null}
                onClick={() => elegir(p)}
                className="pressable flex w-full items-center gap-3 px-2 py-3 text-left disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.nombre}</span>
                  <span className={`text-sm ${real ? "text-slate-500" : "text-amber-700 dark:text-amber-400"}`}>
                    {real ? `Ya tiene código real ${p.codigo_barras}` : `Código provisional ${p.codigo_barras || "—"}`}
                  </span>
                </span>
                {guardando === String(p.id) && <Loader2 className="size-5 animate-spin text-emerald-600" aria-label="Guardando" />}
              </button>
            </li>
          );
        })}
        {lista.length === 0 && <li className="py-10 text-center text-slate-400">Ningún producto coincide.</li>}
      </ul>
    </Marco>
  );
}

interface CapturarCodigoProps {
  producto: Producto;
  /** Debe lanzar un error si la base rechaza la asignación. */
  onAsignar: (codigo: string) => Promise<void>;
  onCerrar: () => void;
}

/** El producto tiene código provisional: escanear el real con la pistola o la cámara. */
export function CapturarCodigoReal({ producto, onAsignar, onCerrar }: CapturarCodigoProps) {
  const [codigo, setCodigo] = useState("");
  const [camara, setCamara] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (valor: string) => {
    const limpio = valor.trim();
    if (!limpio || guardando) return;
    if (!esCodigoReal(limpio)) {
      setError(`${limpio} no es un código de barras válido. Vuelve a escanearlo.`);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await onAsignar(limpio);
    } catch (e) {
      setError(mensajeDe(e));
      setGuardando(false);
    }
  };

  return (
    <Marco titulo={`Código real de ${producto.nombre}`} onCerrar={onCerrar}>
      <p className="text-slate-600 dark:text-slate-300">
        Código actual (provisional): <strong className="tabular-nums">{producto.codigo_barras || "—"}</strong>. Escanéalo con la
        pistola o con la cámara.
      </p>
      <div className="flex gap-3">
        <input
          autoFocus
          inputMode="numeric"
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && guardar(codigo)}
          placeholder="Escanea o escribe el código"
          disabled={guardando}
          className="touch-target min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg tabular-nums outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          type="button"
          onClick={() => setCamara(true)}
          disabled={guardando}
          className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-900 px-5 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          <Camera className="size-5" aria-hidden />
          Cámara
        </button>
      </div>
      <Alerta texto={error} />
      <button
        type="button"
        disabled={!codigo.trim() || guardando}
        onClick={() => guardar(codigo)}
        className="pressable flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-semibold text-white disabled:opacity-40"
      >
        {guardando && <Loader2 className="size-5 animate-spin" aria-hidden />}
        Guardar código
      </button>
      {camara && (
        <EscanerCamara
          onDetectado={(leido) => {
            setCamara(false);
            setCodigo(leido);
            guardar(leido);
          }}
          onCerrar={() => setCamara(false)}
        />
      )}
    </Marco>
  );
}
