"use client";

import { Check, ClipboardList, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Aviso } from "@/components/comun/Aviso";
import { ControlCantidad } from "@/components/operacion/ControlCantidad";
import { useSession } from "@/components/session/SessionProvider";
import { aprobarPedido, cargarPedidos, rechazarPedido, type Pedido } from "@/lib/compras";
import { cargarProductosActivos } from "@/lib/datos";
import { formatMXN } from "@/lib/format";
import type { Producto } from "@/types/pos";

const fecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

function mensajeDe(e: unknown): string {
  return e && typeof e === "object" && "message" in e ? String(e.message) : "";
}

export default function AprobacionPedidosPage() {
  const { usuario } = useSession();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  // Cantidades ajustadas por partida (itemId → piezas); solo las que cambió Dirección.
  const [ajustes, setAjustes] = useState<Record<string, number>>({});
  const [accion, setAccion] = useState<"aprobando" | "rechazando" | null>(null);
  const [confirmarRechazo, setConfirmarRechazo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const ocultarAviso = useCallback(() => setAviso(null), []);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    setErrorCarga(null);
    try {
      const [peds, prods] = await Promise.all([cargarPedidos("SOLICITADO", usuario.tienda_id), cargarProductosActivos()]);
      setPedidos(peds);
      setProductos(prods);
      setSeleccionado((actual) => (actual && peds.some((p) => String(p.id) === actual) ? actual : peds[0] ? String(peds[0].id) : null));
    } catch (e) {
      console.error(e);
      setErrorCarga(`No se pudieron cargar los pedidos. ${mensajeDe(e)}`.trim());
    } finally {
      setCargando(false);
    }
  }, [usuario]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const productoPorId = useMemo(() => new Map(productos.map((p) => [String(p.id), p])), [productos]);
  const pedido = pedidos.find((p) => String(p.id) === seleccionado) ?? null;

  const cantidadDe = (itemId: string, original: number) => ajustes[itemId] ?? original;
  const lineas = pedido?.partidas.map((p) => ({ ...p, final: cantidadDe(String(p.itemId), p.cantidad) })) ?? [];
  const piezas = lineas.reduce((s, l) => s + l.final, 0);
  const costoEstimado = lineas.reduce((s, l) => s + (productoPorId.get(String(l.productoId))?.costo_actual ?? 0) * l.final, 0);
  const cambiados = lineas.filter((l) => l.final !== l.cantidad);

  const elegir = (id: string) => {
    setSeleccionado(id);
    setAjustes({});
    setConfirmarRechazo(false);
    setError(null);
  };

  const quitarDeLista = (id: string) => {
    const restantes = pedidos.filter((p) => String(p.id) !== id);
    setPedidos(restantes);
    elegir(restantes[0] ? String(restantes[0].id) : "");
  };

  const aprobar = async () => {
    if (!usuario || !pedido || accion || piezas === 0) return;
    setAccion("aprobando");
    setError(null);
    try {
      // Se mandan todas las partidas con su cantidad final (ajustada o no): así el resultado
      // no depende de si la función trata como 0 o como "sin cambio" a las que falten.
      await aprobarPedido(
        pedido.id,
        usuario.id,
        lineas.map((l) => ({ productoId: l.productoId, cantidad: l.final })),
      );
      setAviso(`Pedido de ${pedido.proveedorNombre} aprobado · ${piezas} piezas`);
      quitarDeLista(String(pedido.id));
    } catch (e) {
      console.error(e);
      setError(`No se pudo aprobar. ${mensajeDe(e)}`.trim());
    } finally {
      setAccion(null);
    }
  };

  const rechazar = async () => {
    if (!pedido || accion) return;
    if (!confirmarRechazo) {
      setConfirmarRechazo(true);
      return;
    }
    setAccion("rechazando");
    setError(null);
    try {
      await rechazarPedido(pedido.id);
      setAviso(`Pedido de ${pedido.proveedorNombre} rechazado`);
      quitarDeLista(String(pedido.id));
    } catch (e) {
      console.error(e);
      setError(`No se pudo rechazar. ${mensajeDe(e)}`.trim());
      setConfirmarRechazo(false);
    } finally {
      setAccion(null);
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
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-2xl font-semibold">Aprobación de pedidos</h1>
          <p className="text-slate-500">Revisa, ajusta cantidades y aprueba para que Compras pueda recibirlos.</p>
        </div>
        <button
          type="button"
          onClick={cargar}
          className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-100 px-4 font-medium dark:bg-slate-800"
        >
          <RefreshCw className="size-5" aria-hidden />
          Actualizar
        </button>
      </header>

      {pedidos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
          <ClipboardList className="size-14" aria-hidden />
          <p className="text-lg">No hay pedidos por aprobar.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="w-72 shrink-0 space-y-2 overflow-y-auto border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            {pedidos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => elegir(String(p.id))}
                className={`pressable w-full rounded-2xl p-4 text-left ring-2 ${
                  String(p.id) === seleccionado ? "bg-emerald-50 ring-emerald-600 dark:bg-emerald-950" : "bg-slate-50 ring-transparent dark:bg-slate-800"
                }`}
              >
                <span className="block font-semibold">{p.proveedorNombre}</span>
                <span className="block text-sm text-slate-500">{fecha.format(new Date(p.creado))}</span>
                <span className="block text-sm text-slate-500">
                  {p.partidas.length} producto{p.partidas.length === 1 ? "" : "s"} · {p.partidas.reduce((s, x) => s + x.cantidad, 0)} piezas
                </span>
              </button>
            ))}
          </aside>

          {pedido && (
            <main className="flex min-w-0 flex-1 flex-col">
              <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain px-6 dark:divide-slate-800">
                {lineas.map((l) => {
                  const prod = productoPorId.get(String(l.productoId));
                  const nombre = prod?.nombre ?? "Producto inactivo";
                  const cambiado = l.final !== l.cantidad;
                  return (
                    <li key={l.itemId} className={`flex items-center gap-4 py-3 ${l.final === 0 ? "opacity-50" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-lg font-medium">{nombre}</p>
                        <p className="text-sm text-slate-500">
                          Costo {prod?.costo_actual != null ? formatMXN(prod.costo_actual) : "—"}
                          {cambiado && (
                            <span className="ml-2 font-medium text-amber-700 dark:text-amber-400">Solicitado: {l.cantidad}</span>
                          )}
                        </p>
                      </div>
                      {cambiado && (
                        <button
                          type="button"
                          aria-label={`Regresar ${nombre} a ${l.cantidad}`}
                          onClick={() =>
                            setAjustes((a) => {
                              const resto = { ...a };
                              delete resto[String(l.itemId)];
                              return resto;
                            })
                          }
                          className="pressable grid size-12 place-items-center rounded-xl text-slate-400"
                        >
                          <RotateCcw className="size-5" aria-hidden />
                        </button>
                      )}
                      <ControlCantidad
                        valor={l.final}
                        etiqueta={nombre}
                        onCambiar={(siguiente) => {
                          setConfirmarRechazo(false);
                          setAjustes((a) => ({ ...a, [String(l.itemId)]: siguiente(a[String(l.itemId)] ?? l.cantidad) }));
                        }}
                      />
                    </li>
                  );
                })}
              </ul>

              <footer className="flex items-center gap-4 border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex-1">
                  <p className="text-lg font-semibold">
                    {piezas} pieza{piezas === 1 ? "" : "s"} · Costo estimado {formatMXN(costoEstimado)}
                  </p>
                  {cambiados.length > 0 && (
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      {cambiados.length} cantidad{cambiados.length === 1 ? "" : "es"} ajustada{cambiados.length === 1 ? "" : "s"}
                    </p>
                  )}
                  {error && (
                    <p role="alert" className="font-medium text-red-600">
                      {error}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={accion !== null}
                  onClick={rechazar}
                  className={`pressable flex h-16 items-center gap-2 rounded-2xl px-6 text-lg font-semibold disabled:opacity-40 ${
                    confirmarRechazo ? "bg-red-600 text-white" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                  }`}
                >
                  {accion === "rechazando" ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <X className="size-6" aria-hidden />}
                  {confirmarRechazo ? "Toca de nuevo para rechazar" : "Rechazar"}
                </button>
                <button
                  type="button"
                  disabled={accion !== null || piezas === 0}
                  onClick={aprobar}
                  className="pressable flex h-16 items-center gap-2 rounded-2xl bg-emerald-600 px-8 text-xl font-semibold text-white disabled:opacity-40"
                >
                  {accion === "aprobando" ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <Check className="size-6" aria-hidden />}
                  Aprobar
                </button>
              </footer>
            </main>
          )}
        </div>
      )}

      <Aviso mensaje={aviso} onOcultar={ocultarAviso} />
    </>
  );
}
