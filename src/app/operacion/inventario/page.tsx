"use client";

import { Camera, CheckCircle2, ClipboardCheck, Loader2, PackageSearch, RefreshCw, ScanBarcode, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Aviso } from "@/components/comun/Aviso";
import { EscanerCamara } from "@/components/operacion/EscanerCamara";
import { aplicarTecla, montoDeTexto, TecladoMonto, type Tecla } from "@/components/pos/TecladoMonto";
import { useSession } from "@/components/session/SessionProvider";
import { ajustarInventario, cargarProductosActivos } from "@/lib/datos";
import type { Producto } from "@/types/pos";

interface Contado {
  productoId: string;
  nombre: string;
  cantidad: number;
  /** Solo ADMIN la recibe (el conteo de OPERACION es ciego). */
  diferencia?: number;
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function mensajeDe(e: unknown): string {
  return e && typeof e === "object" && "message" in e ? String(e.message) : "";
}

function signo(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export default function InventarioFisicoPage() {
  const { usuario } = useSession();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<Producto | null>(null);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [contados, setContados] = useState<Contado[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const ocultarAviso = useCallback(() => setAviso(null), []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setProductos(await cargarProductosActivos());
    } catch (e) {
      console.error(e);
      setErrorCarga(`No se pudieron cargar los productos. ${mensajeDe(e)}`.trim());
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const termino = normalizar(busqueda);
  const visibles = useMemo(
    () =>
      termino
        ? productos.filter((p) => normalizar(p.nombre).includes(termino) || (p.codigo_barras ?? "").includes(termino))
        : productos,
    [productos, termino],
  );
  const contadoDe = useMemo(() => new Map(contados.map((c) => [c.productoId, c])), [contados]);

  const elegir = (p: Producto) => {
    setSeleccionado(p);
    setTexto("");
    setError(null);
    // Sin foco en el buscador, el teclado físico escribe en la cantidad.
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const buscarPorCodigo = (codigo: string): boolean => {
    const encontrado = productos.find((p) => p.codigo_barras && p.codigo_barras === codigo.trim());
    if (encontrado) {
      setBusqueda("");
      elegir(encontrado);
      return true;
    }
    return false;
  };

  const alEscanear = (codigo: string) => {
    setEscaneando(false);
    if (!buscarPorCodigo(codigo)) {
      setBusqueda(codigo);
      setError(`El código ${codigo} no está en el catálogo.`);
    }
  };

  const alTecla = useCallback((tecla: Tecla) => setTexto((prev) => aplicarTecla(prev, tecla)), []);

  const guardar = async () => {
    if (!usuario || !seleccionado || texto === "" || guardando) return;
    const cantidad = Math.round(montoDeTexto(texto));
    setGuardando(true);
    setError(null);
    try {
      const r = await ajustarInventario(usuario, seleccionado.id, cantidad);
      const registro: Contado = {
        productoId: String(seleccionado.id),
        nombre: seleccionado.nombre,
        cantidad: r.stockContado,
        diferencia: r.diferencia,
      };
      setContados((lista) => [registro, ...lista.filter((c) => c.productoId !== registro.productoId)]);
      setAviso(
        r.diferencia === undefined
          ? `${seleccionado.nombre}: ${r.stockContado} pieza${r.stockContado === 1 ? "" : "s"} guardadas`
          : `${seleccionado.nombre}: ${r.stockAnterior ?? 0} → ${r.stockContado} (${signo(r.diferencia)})`,
      );
      setSeleccionado(null);
      setTexto("");
      setBusqueda("");
    } catch (e) {
      console.error(e);
      setError(`No se pudo guardar el conteo. ${mensajeDe(e)}`.trim());
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="grid flex-1 place-items-center">
        <Loader2 className="size-10 animate-spin text-emerald-600" aria-label="Cargando" />
      </div>
    );
  }

  if (errorCarga) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-500">
        <p className="max-w-md text-center text-lg">{errorCarga}</p>
        <button
          type="button"
          onClick={cargar}
          className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-900 px-6 text-lg font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          <RefreshCw className="size-5" aria-hidden />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Inventario físico</h1>
        <p className="text-slate-500">Busca o escanea un producto, cuenta las piezas en anaquel y captura el total.</p>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-3 dark:border-slate-800">
            <label className="relative flex-1">
              <span className="sr-only">Buscar producto por nombre o código</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  // Lector tipo pistola: escribe el código y manda Enter.
                  if (e.key === "Enter" && busqueda.trim()) {
                    if (buscarPorCodigo(busqueda)) return;
                    if (visibles.length === 1) {
                      setBusqueda("");
                      elegir(visibles[0]);
                    } else if (visibles.length === 0) {
                      setError(`El código ${busqueda.trim()} no está en el catálogo.`);
                    }
                  }
                  if (e.key === "Escape") setBusqueda("");
                }}
                placeholder="Nombre o código de barras"
                autoComplete="off"
                className="touch-target w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-14 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800 [&::-webkit-search-cancel-button]:hidden"
              />
              {busqueda && (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onClick={() => setBusqueda("")}
                  className="pressable absolute right-1 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-xl text-slate-500"
                >
                  <X className="size-5" aria-hidden />
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setEscaneando(true);
              }}
              className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-900 px-5 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            >
              <Camera className="size-5" aria-hidden />
              Escanear
            </button>
          </div>

          <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain px-6 dark:divide-slate-800">
            {visibles.map((p) => {
              const contado = contadoDe.get(String(p.id));
              const activo = seleccionado?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => elegir(p)}
                    className={`pressable flex w-full items-center gap-3 rounded-xl px-3 py-4 text-left ${
                      activo ? "bg-emerald-50 dark:bg-emerald-950" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-medium">{p.nombre}</span>
                      <span className="flex items-center gap-1 text-sm text-slate-500">
                        <ScanBarcode className="size-4" aria-hidden />
                        {p.codigo_barras || "Sin código"}
                      </span>
                    </span>
                    {contado && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                        <CheckCircle2 className="size-4" aria-hidden />
                        {contado.cantidad}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {visibles.length === 0 && (
              <li className="flex flex-col items-center gap-3 py-20 text-slate-400">
                <PackageSearch className="size-12" aria-hidden />
                Ningún producto coincide.
              </li>
            )}
          </ul>
        </main>

        <aside className="flex w-[26rem] shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          {seleccionado ? (
            <>
              <div>
                <p className="text-sm font-medium text-slate-500">Contando</p>
                <p className="text-2xl font-semibold leading-tight">{seleccionado.nombre}</p>
                {seleccionado.codigo_barras && <p className="text-sm text-slate-500">{seleccionado.codigo_barras}</p>}
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-center dark:bg-slate-800">
                <p className="text-slate-500">Piezas contadas</p>
                <p className={`text-6xl font-bold tabular-nums ${texto === "" ? "text-slate-300 dark:text-slate-600" : ""}`}>
                  {texto === "" ? "0" : Math.round(montoDeTexto(texto))}
                </p>
              </div>
              <TecladoMonto onTecla={alTecla} decimales={false} deshabilitado={guardando} />
              {error && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={texto === "" || guardando}
                onClick={guardar}
                className="pressable flex h-16 items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-xl font-semibold text-white disabled:opacity-40"
              >
                {guardando && <Loader2 className="size-6 animate-spin" aria-hidden />}
                {guardando ? "Guardando…" : "Guardar conteo"}
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={() => {
                  setSeleccionado(null);
                  setTexto("");
                  setError(null);
                }}
                className="touch-target pressable rounded-2xl font-medium text-slate-500"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3 py-6 text-center text-slate-500">
                <ClipboardCheck className="size-12" aria-hidden />
                <p>Elige un producto de la lista o escanéalo para capturar cuántas piezas hay.</p>
              </div>
              {error && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                  {error}
                </p>
              )}
              {contados.length > 0 && (
                <section>
                  <h2 className="mb-2 font-semibold">
                    Contados en esta sesión <span className="text-slate-500">({contados.length})</span>
                  </h2>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {contados.map((c) => (
                      <li key={c.productoId} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 truncate">{c.nombre}</span>
                        <span className="shrink-0 text-right font-semibold tabular-nums">
                          {c.cantidad}
                          {c.diferencia !== undefined && c.diferencia !== 0 && (
                            <span className={`ml-2 text-sm ${c.diferencia < 0 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}`}>
                              ({signo(c.diferencia)})
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </aside>
      </div>

      {escaneando && <EscanerCamara onDetectado={alEscanear} onCerrar={() => setEscaneando(false)} />}
      <Aviso mensaje={aviso} onOcultar={ocultarAviso} />
    </>
  );
}
