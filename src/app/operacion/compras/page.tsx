"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Lock,
  Plus,
  ReceiptText,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Aviso } from "@/components/comun/Aviso";
import { ControlCantidad } from "@/components/operacion/ControlCantidad";
import { ModalTeclado } from "@/components/operacion/ModalTeclado";
import { SelectorProducto } from "@/components/operacion/SelectorProducto";
import { ModalMovimiento } from "@/components/pos/ModalMovimiento";
import { useSession } from "@/components/session/SessionProvider";
import { cargarPedidos, cargarProveedores, procesarRecepcion, totalRecepcion, type Pedido } from "@/lib/compras";
import { buscarTurnoAbierto, cargarProductosActivos, registrarMovimiento } from "@/lib/datos";
import { formatMXN, redondear } from "@/lib/format";
import type { Producto, Proveedor, TipoMovimiento } from "@/types/pos";

interface Fila {
  productoId: string;
  piezas: number;
  costo: number;
}

type Fase =
  | { tipo: "inicio" }
  | { tipo: "elegir-pedido" }
  | { tipo: "captura"; pedido: Pedido | null }
  | { tipo: "listo"; total: number; proveedor: string; piezas: number; productos: number; pagado: boolean };

const fecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

function mensajeDe(e: unknown): string {
  return e && typeof e === "object" && "message" in e ? String(e.message) : "";
}

export default function ComprasPage() {
  const { usuario, turno, establecerTurno } = useSession();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [fase, setFase] = useState<Fase>({ tipo: "inicio" });
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [eligiendoProducto, setEligiendoProducto] = useState(false);
  const [editandoCosto, setEditandoCosto] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const ocultarAviso = useCallback(() => setAviso(null), []);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    setErrorCarga(null);
    try {
      const [provs, prods, peds] = await Promise.all([
        cargarProveedores(),
        cargarProductosActivos(),
        cargarPedidos("APROBADO", usuario.tienda_id),
      ]);
      setProveedores(provs);
      setProductos(prods);
      // Dirección puede dejar partidas en 0 al aprobar: no se recibe nada de ellas.
      setPedidos(peds.map((p) => ({ ...p, partidas: p.partidas.filter((x) => x.cantidad > 0) })));
    } catch (e) {
      console.error(e);
      setErrorCarga(`No se pudieron cargar los datos de compras. ${mensajeDe(e)}`.trim());
    } finally {
      setCargando(false);
    }
  }, [usuario]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const productoPorId = useMemo(() => new Map(productos.map((p) => [String(p.id), p])), [productos]);
  const proveedor = proveedores.find((p) => String(p.id) === proveedorId) ?? null;
  const conPiezas = filas.filter((f) => f.piezas > 0);
  const sinCosto = conPiezas.filter((f) => f.costo <= 0).length;
  const total = totalRecepcion(conPiezas.map((f) => ({ productoId: f.productoId, piezas: f.piezas, costoUnitarioNeto: f.costo })));
  const piezas = conPiezas.reduce((s, f) => s + f.piezas, 0);

  const actualizarFila = (productoId: string, cambios: Partial<Fila>) => {
    setConfirmando(false);
    setError(null);
    setFilas((todas) => todas.map((f) => (f.productoId === productoId ? { ...f, ...cambios } : f)));
  };

  const iniciarDirecta = () => {
    setFilas([]);
    setProveedorId(proveedores[0] ? String(proveedores[0].id) : null);
    setFase({ tipo: "captura", pedido: null });
  };

  const iniciarDesdePedido = (pedido: Pedido) => {
    setProveedorId(String(pedido.proveedorId));
    setFilas(
      pedido.partidas.map((p) => ({
        productoId: String(p.productoId),
        piezas: p.cantidad,
        costo: productoPorId.get(String(p.productoId))?.costo_actual ?? 0,
      })),
    );
    setFase({ tipo: "captura", pedido });
  };

  const agregarProducto = (p: Producto) => {
    setEligiendoProducto(false);
    setConfirmando(false);
    setFilas((todas) =>
      todas.some((f) => f.productoId === String(p.id))
        ? todas
        : [...todas, { productoId: String(p.id), piezas: 1, costo: p.costo_actual ?? 0 }],
    );
  };

  const volverAlInicio = () => {
    setFase({ tipo: "inicio" });
    setFilas([]);
    setConfirmando(false);
    setError(null);
  };

  const confirmar = async () => {
    if (!usuario || !proveedor || conPiezas.length === 0 || sinCosto > 0 || procesando || fase.tipo !== "captura") return;
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setProcesando(true);
    setError(null);
    try {
      const totalTicket = await procesarRecepcion({
        usuario,
        proveedorId: proveedor.id,
        pedidoId: fase.pedido?.id ?? null,
        partidas: conPiezas.map((f) => ({
          productoId: productoPorId.get(f.productoId)!.id,
          piezas: f.piezas,
          costoUnitarioNeto: f.costo,
        })),
      });
      setFase({ tipo: "listo", total: totalTicket, proveedor: proveedor.nombre, piezas, productos: conPiezas.length, pagado: false });
      setFilas([]);
      // Costos, precios y pedidos cambiaron en la base: se recargan para la siguiente recepción.
      cargar();
    } catch (e) {
      console.error(e);
      setError(`No se pudo procesar la recepción. ${mensajeDe(e)}`.trim());
    } finally {
      setProcesando(false);
      setConfirmando(false);
    }
  };

  const abrirPago = async () => {
    if (!usuario) return;
    setError(null);
    try {
      const activo = turno ?? (await buscarTurnoAbierto(usuario));
      if (!activo) {
        setError("No hay turno abierto. Abre turno en Vender para pagar desde caja.");
        return;
      }
      establecerTurno(activo);
      setPagando(true);
    } catch (e) {
      console.error(e);
      setError(`No se pudo consultar el turno. ${mensajeDe(e)}`.trim());
    }
  };

  const registrarPago = async (tipo: TipoMovimiento, monto: number, concepto: string) => {
    if (!usuario || !turno) throw new Error("No hay un turno abierto.");
    await registrarMovimiento({ turnoId: turno.id, usuarioId: usuario.id, tipo, monto, concepto });
    setPagando(false);
    setFase((f) => (f.tipo === "listo" ? { ...f, pagado: true } : f));
    setAviso(`Pago registrado en caja · ${formatMXN(monto)}`);
  };

  if (cargando && fase.tipo !== "listo") {
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

  const filaEditando = editandoCosto ? filas.find((f) => f.productoId === editandoCosto) : undefined;

  return (
    <>
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        {(fase.tipo === "elegir-pedido" || fase.tipo === "captura") && (
          <button
            type="button"
            onClick={volverAlInicio}
            disabled={procesando}
            className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-100 px-4 font-medium dark:bg-slate-800"
          >
            <ArrowLeft className="size-5" aria-hidden />
            Inicio
          </button>
        )}
        <div>
          <h1 className="text-2xl font-semibold">Recepción de compras</h1>
          <p className="text-slate-500">
            {fase.tipo === "captura"
              ? fase.pedido
                ? `Pedido aprobado de ${fase.pedido.proveedorNombre}`
                : "Captura directa del ticket del repartidor"
              : "Registra la mercancía que entregó el proveedor."}
          </p>
        </div>
      </header>

      {fase.tipo === "inicio" && (
        <div className="grid flex-1 grid-cols-2 content-center gap-6 p-8">
          <button
            type="button"
            onClick={() => setFase({ tipo: "elegir-pedido" })}
            className="pressable flex flex-col items-center gap-4 rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
          >
            <ClipboardCheck className="size-16 text-emerald-600" aria-hidden />
            <span className="text-2xl font-semibold">Cargar desde pedido aprobado</span>
            <span className="text-slate-500">
              {pedidos.length === 0
                ? "No hay pedidos aprobados"
                : `${pedidos.length} pedido${pedidos.length === 1 ? "" : "s"} aprobado${pedidos.length === 1 ? "" : "s"}`}
            </span>
          </button>
          <button
            type="button"
            onClick={iniciarDirecta}
            className="pressable flex flex-col items-center gap-4 rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
          >
            <ReceiptText className="size-16 text-sky-600" aria-hidden />
            <span className="text-2xl font-semibold">Captura directa de ticket</span>
            <span className="text-slate-500">Sin pedido previo</span>
          </button>
        </div>
      )}

      {fase.tipo === "elegir-pedido" && (
        <ul className="flex-1 space-y-3 overflow-y-auto p-6">
          {pedidos.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => iniciarDesdePedido(p)}
                className="pressable flex w-full items-center justify-between gap-4 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
              >
                <span>
                  <span className="block text-lg font-semibold">{p.proveedorNombre}</span>
                  <span className="text-slate-500">{fecha.format(new Date(p.creado))}</span>
                </span>
                <span className="text-right text-slate-600 dark:text-slate-300">
                  {p.partidas.length} producto{p.partidas.length === 1 ? "" : "s"}
                  <br />
                  {p.partidas.reduce((s, x) => s + x.cantidad, 0)} piezas
                </span>
              </button>
            </li>
          ))}
          {pedidos.length === 0 && (
            <li className="py-20 text-center text-lg text-slate-500">
              No hay pedidos con estado APROBADO. Usa la captura directa de ticket.
            </li>
          )}
        </ul>
      )}

      {fase.tipo === "captura" && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-6 py-3 dark:border-slate-800">
            <span className="mr-2 font-medium text-slate-500">Proveedor</span>
            {fase.pedido ? (
              <span className="rounded-2xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                {fase.pedido.proveedorNombre}
              </span>
            ) : (
              proveedores.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProveedorId(String(p.id));
                    setConfirmando(false);
                  }}
                  className={`touch-target pressable rounded-2xl px-4 font-medium ring-2 ${
                    String(p.id) === proveedorId
                      ? "bg-emerald-50 text-emerald-800 ring-emerald-600 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-slate-100 ring-transparent dark:bg-slate-800"
                  }`}
                >
                  {p.nombre}
                </button>
              ))
            )}
            <button
              type="button"
              onClick={() => setEligiendoProducto(true)}
              className="touch-target pressable ml-auto flex items-center gap-2 rounded-2xl bg-slate-900 px-5 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            >
              <Plus className="size-5" aria-hidden />
              Agregar producto
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50 text-left text-sm text-slate-500 dark:bg-slate-950">
                <tr>
                  <th className="py-3 font-medium">Producto</th>
                  <th className="py-3 font-medium">Piezas recibidas</th>
                  <th className="py-3 font-medium">Costo unitario neto</th>
                  <th className="py-3 text-right font-medium">Subtotal</th>
                  <th className="w-14" aria-label="Quitar" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filas.map((f) => {
                  const prod = productoPorId.get(f.productoId);
                  const anterior = prod?.costo_actual ?? null;
                  const cambio = anterior != null && f.costo > 0 ? redondear(f.costo - anterior) : 0;
                  return (
                    <tr key={f.productoId} className={f.piezas === 0 ? "opacity-50" : ""}>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{prod?.nombre ?? "Producto"}</p>
                        <p className="flex items-center gap-2 text-sm text-slate-500">
                          Antes {anterior != null ? formatMXN(anterior) : "—"}
                          {prod?.es_precio_fijo && (
                            <span className="flex items-center gap-1 rounded-md bg-slate-100 px-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              <Lock className="size-3" aria-hidden />
                              Precio fijo
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <ControlCantidad
                          valor={f.piezas}
                          etiqueta={prod?.nombre ?? "producto"}
                          onCambiar={(siguiente) => {
                            setConfirmando(false);
                            setError(null);
                            setFilas((todas) =>
                              todas.map((x) => (x.productoId === f.productoId ? { ...x, piezas: siguiente(x.piezas) } : x)),
                            );
                          }}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          type="button"
                          onClick={() => setEditandoCosto(f.productoId)}
                          className={`pressable flex h-14 min-w-36 items-center justify-between gap-2 rounded-2xl px-4 text-xl font-semibold tabular-nums ring-2 ${
                            f.costo <= 0
                              ? "bg-red-50 text-red-700 ring-red-400 dark:bg-red-950 dark:text-red-300"
                              : "bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
                          }`}
                        >
                          {formatMXN(f.costo)}
                          {cambio > 0 && <ArrowUp className="size-5 text-red-600" aria-label={`Subió ${formatMXN(cambio)}`} />}
                          {cambio < 0 && <ArrowDown className="size-5 text-emerald-600" aria-label={`Bajó ${formatMXN(-cambio)}`} />}
                        </button>
                      </td>
                      <td className="py-3 text-right text-lg font-semibold tabular-nums">{formatMXN(redondear(f.piezas * f.costo))}</td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          aria-label={`Quitar ${prod?.nombre ?? "producto"}`}
                          onClick={() => {
                            setConfirmando(false);
                            setFilas((todas) => todas.filter((x) => x.productoId !== f.productoId));
                          }}
                          className="pressable grid size-12 place-items-center rounded-xl text-slate-400"
                        >
                          <Trash2 className="size-5" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filas.length === 0 && (
              <p className="py-20 text-center text-lg text-slate-500">Toca “Agregar producto” para capturar el ticket.</p>
            )}
          </div>

          <footer className="flex items-center gap-4 border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex-1">
              <p className="text-slate-500">
                {conPiezas.length} producto{conPiezas.length === 1 ? "" : "s"} · {piezas} pieza{piezas === 1 ? "" : "s"}
              </p>
              <p className="text-3xl font-bold tabular-nums">Total del ticket {formatMXN(total)}</p>
              {sinCosto > 0 && (
                <p className="font-medium text-red-600">
                  Falta el costo en {sinCosto} producto{sinCosto === 1 ? "" : "s"}.
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
              disabled={!proveedor || conPiezas.length === 0 || sinCosto > 0 || procesando}
              onClick={confirmar}
              className={`pressable flex h-16 items-center gap-3 rounded-2xl px-8 text-xl font-semibold text-white disabled:opacity-40 ${
                confirmando ? "bg-red-600" : "bg-emerald-600"
              }`}
            >
              {procesando && <Loader2 className="size-6 animate-spin" aria-hidden />}
              {procesando ? "Procesando…" : confirmando ? "Toca de nuevo para confirmar" : "Confirmar recepción"}
            </button>
          </footer>
        </>
      )}

      {fase.tipo === "listo" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
          <CheckCircle2 className="size-20 text-emerald-600" aria-hidden />
          <div>
            <p className="text-2xl font-semibold">Recepción registrada</p>
            <p className="text-slate-500">
              {fase.proveedor} · {fase.productos} producto{fase.productos === 1 ? "" : "s"} · {fase.piezas} pieza
              {fase.piezas === 1 ? "" : "s"}
            </p>
            <p className="mt-2 text-sm text-slate-500">Inventario, costos y precios se actualizaron en el catálogo.</p>
          </div>
          <p className="text-5xl font-bold tabular-nums">{formatMXN(fase.total)}</p>
          {error && (
            <p role="alert" className="font-medium text-red-600">
              {error}
            </p>
          )}
          <div className="flex w-full max-w-xl flex-col gap-3">
            {fase.pagado ? (
              <p className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-emerald-50 text-xl font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                <CheckCircle2 className="size-6" aria-hidden />
                Pagado desde caja
              </p>
            ) : (
              <button
                type="button"
                onClick={abrirPago}
                className="pressable flex h-16 items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-xl font-semibold text-white"
              >
                <Wallet className="size-6" aria-hidden />
                ¿Pagar ahora desde caja?
              </button>
            )}
            <button
              type="button"
              onClick={volverAlInicio}
              className="touch-target pressable rounded-2xl bg-slate-100 text-lg font-medium dark:bg-slate-800"
            >
              Nueva recepción
            </button>
          </div>
        </div>
      )}

      {eligiendoProducto && (
        <SelectorProducto
          productos={productos}
          proveedorId={proveedorId}
          yaAgregados={new Set(filas.map((f) => f.productoId))}
          onElegir={agregarProducto}
          onCerrar={() => setEligiendoProducto(false)}
        />
      )}

      {filaEditando && (
        <ModalTeclado
          titulo={productoPorId.get(filaEditando.productoId)?.nombre ?? "Producto"}
          subtitulo="Costo unitario neto del ticket"
          modo="moneda"
          valorInicial={filaEditando.costo}
          onCerrar={() => setEditandoCosto(null)}
          onAceptar={(n) => {
            actualizarFila(filaEditando.productoId, { costo: redondear(n) });
            setEditandoCosto(null);
          }}
        />
      )}

      {pagando && fase.tipo === "listo" && (
        <ModalMovimiento
          inicial={{ tipo: "PAGO_PROVEEDOR", monto: fase.total, concepto: `${fase.proveedor} – ticket de compra` }}
          onCerrar={() => setPagando(false)}
          onRegistrar={registrarPago}
        />
      )}

      <Aviso mensaje={aviso} onOcultar={ocultarAviso} />
    </>
  );
}
