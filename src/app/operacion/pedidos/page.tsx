"use client";

import { BellRing, CalendarDays, Loader2, PackageSearch, RefreshCw, Search, Send, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Aviso } from "@/components/comun/Aviso";
import { ControlCantidad } from "@/components/operacion/ControlCantidad";
import { useSession } from "@/components/session/SessionProvider";
import { cargarProveedores, crearPedido, primeroLosDeHoy, tocaPedirHoy } from "@/lib/compras";
import { cargarProductosActivos } from "@/lib/datos";
import { formatMXN } from "@/lib/format";
import type { Producto, Proveedor } from "@/types/pos";

type Cantidades = Record<string, number>;

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export default function PedidosPage() {
  const { usuario } = useSession();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  // Cantidades por proveedor: cambiar de proveedor no borra lo que ya se capturó en otro.
  const [porProveedor, setPorProveedor] = useState<Record<string, Cantidades>>({});
  const [verTodos, setVerTodos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const ocultarAviso = useCallback(() => setAviso(null), []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const [provs, prods] = await Promise.all([cargarProveedores(), cargarProductosActivos()]);
      // A los que toca pedir hoy se les pone arriba y el primero queda seleccionado.
      const ordenados = primeroLosDeHoy(provs, (p) => tocaPedirHoy(p));
      setProveedores(ordenados);
      setProductos(prods);
      setProveedorId((actual) => actual ?? ordenados[0]?.id.toString() ?? null);
    } catch (e) {
      console.error(e);
      setErrorCarga("No se pudieron cargar proveedores y productos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const proveedor = proveedores.find((p) => String(p.id) === proveedorId) ?? null;
  const cantidades = (proveedorId && porProveedor[proveedorId]) || {};
  const delProveedor = useMemo(
    () => productos.filter((p) => proveedorId !== null && String(p.proveedor_id) === proveedorId),
    [productos, proveedorId],
  );
  const sinAsignados = delProveedor.length === 0;
  const termino = normalizar(busqueda);
  const visibles = useMemo(() => {
    const base = verTodos || sinAsignados ? productos : delProveedor;
    return termino ? base.filter((p) => normalizar(p.nombre).includes(termino) || (p.codigo_barras ?? "").includes(termino)) : base;
  }, [verTodos, sinAsignados, productos, delProveedor, termino]);

  const partidas = Object.entries(cantidades).filter(([, n]) => n > 0);
  const piezas = partidas.reduce((s, [, n]) => s + n, 0);
  const costoEstimado = partidas.reduce((s, [id, n]) => {
    const prod = productos.find((p) => String(p.id) === id);
    return s + (prod?.costo_actual ?? 0) * n;
  }, 0);

  const cambiarCantidad = (productoId: string, siguiente: (anterior: number) => number) => {
    if (!proveedorId) return;
    setErrorEnvio(null);
    setPorProveedor((todo) => {
      const delProv = todo[proveedorId] ?? {};
      return { ...todo, [proveedorId]: { ...delProv, [productoId]: siguiente(delProv[productoId] ?? 0) } };
    });
  };

  const enviar = async () => {
    if (!usuario || !proveedor || partidas.length === 0 || enviando) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      await crearPedido(
        usuario,
        proveedor.id,
        partidas.map(([id, n]) => ({ productoId: productos.find((p) => String(p.id) === id)!.id, cantidad: n })),
      );
      setPorProveedor((todo) => ({ ...todo, [String(proveedor.id)]: {} }));
      setAviso(`Pedido enviado a ${proveedor.nombre} · ${piezas} pieza${piezas === 1 ? "" : "s"}`);
    } catch (e) {
      console.error(e);
      const detalle = e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setErrorEnvio(`No se pudo enviar el pedido. ${detalle}`.trim());
    } finally {
      setEnviando(false);
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
        <p className="text-lg">{errorCarga}</p>
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

  const pedirHoy = proveedores.filter((p) => tocaPedirHoy(p)).length;

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Pedido a proveedor</h1>
        <p className="text-slate-500">
          {pedirHoy > 0
            ? `Hoy toca pedir a ${pedirHoy} proveedor${pedirHoy === 1 ? "" : "es"} (marcados en amarillo).`
            : "Hoy no toca pedir a ningún proveedor. Elige uno y captura las piezas que necesitas."}
        </p>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 space-y-2 overflow-y-auto border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {proveedores.map((p) => {
            const activo = String(p.id) === proveedorId;
            const capturadas = Object.values(porProveedor[String(p.id)] ?? {}).filter((n) => n > 0).length;
            const pideHoy = tocaPedirHoy(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProveedorId(String(p.id));
                  setVerTodos(false);
                  setBusqueda("");
                  setErrorEnvio(null);
                }}
                className={`pressable w-full rounded-2xl p-4 text-left ring-2 ${
                  activo
                    ? "bg-emerald-50 ring-emerald-600 dark:bg-emerald-950"
                    : pideHoy
                      ? "bg-amber-50 ring-amber-400 dark:bg-amber-950/60 dark:ring-amber-600"
                      : "bg-slate-50 ring-transparent dark:bg-slate-800"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{p.nombre}</span>
                  {capturadas > 0 && (
                    <span className="rounded-full bg-emerald-600 px-2 text-sm font-semibold text-white">{capturadas}</span>
                  )}
                </span>
                {pideHoy && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-sm font-semibold text-amber-950">
                    <BellRing className="size-4" aria-hidden />
                    Toca pedir hoy
                  </span>
                )}
                {p.dias_visita.length > 0 && (
                  <span className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                    <CalendarDays className="size-4 shrink-0" aria-hidden />
                    Pide: {p.dias_visita.join(", ")}
                  </span>
                )}
                {p.dias_entrega.length > 0 && (
                  <span className="flex items-center gap-1 text-sm text-slate-500">
                    <Truck className="size-4 shrink-0" aria-hidden />
                    Llega: {p.dias_entrega.join(", ")}
                  </span>
                )}
              </button>
            );
          })}
          {proveedores.length === 0 && <p className="p-2 text-slate-500">No hay proveedores activos.</p>}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {proveedor && (
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-6 py-3 dark:border-slate-800">
              <label className="relative min-w-56 flex-1">
                <span className="sr-only">Buscar producto</span>
                <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar producto"
                  className="touch-target w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              {!sinAsignados && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={verTodos}
                  onClick={() => setVerTodos((v) => !v)}
                  className={`touch-target pressable rounded-2xl px-4 font-medium ring-2 ${
                    verTodos ? "bg-emerald-50 text-emerald-800 ring-emerald-600 dark:bg-emerald-950 dark:text-emerald-200" : "bg-slate-100 ring-transparent dark:bg-slate-800"
                  }`}
                >
                  Ver todos los productos
                </button>
              )}
            </div>
          )}

          {proveedor && sinAsignados && (
            <p className="mx-6 mt-4 rounded-xl bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {proveedor.nombre} todavía no tiene productos asignados. Se muestra todo el catálogo.
            </p>
          )}

          <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain px-6 dark:divide-slate-800">
            {visibles.map((p) => (
              <li key={p.id} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-lg font-medium">{p.nombre}</p>
                  <p className="text-sm text-slate-500">
                    Costo {p.costo_actual != null ? formatMXN(p.costo_actual) : "—"}
                  </p>
                </div>
                <ControlCantidad valor={cantidades[String(p.id)] ?? 0} etiqueta={p.nombre} onCambiar={(n) => cambiarCantidad(String(p.id), n)} />
              </li>
            ))}
            {visibles.length === 0 && (
              <li className="flex flex-col items-center gap-3 py-20 text-slate-400">
                <PackageSearch className="size-12" aria-hidden />
                Ningún producto coincide.
              </li>
            )}
          </ul>

          <footer className="flex items-center gap-4 border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex-1">
              <p className="text-lg font-semibold">
                {partidas.length} producto{partidas.length === 1 ? "" : "s"} · {piezas} pieza{piezas === 1 ? "" : "s"}
              </p>
              <p className="text-sm text-slate-500">Costo estimado {formatMXN(costoEstimado)}</p>
              {errorEnvio && (
                <p role="alert" className="mt-1 font-medium text-red-600">
                  {errorEnvio}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={!proveedor || partidas.length === 0 || enviando}
              onClick={enviar}
              className="pressable flex h-16 items-center gap-3 rounded-2xl bg-emerald-600 px-8 text-xl font-semibold text-white disabled:opacity-40"
            >
              {enviando ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <Send className="size-6" aria-hidden />}
              {enviando ? "Enviando…" : "Enviar pedido"}
            </button>
          </footer>
        </main>
      </div>

      <Aviso mensaje={aviso} onOcultar={ocultarAviso} />
    </>
  );
}
