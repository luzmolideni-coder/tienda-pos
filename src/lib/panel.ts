import { redondear } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import { rpcSeguro } from "@/lib/supabase/rpc";
import type { Id, Usuario } from "@/types/pos";

/* ---------- Filtros ---------- */

export type Periodo = "hoy" | "semana" | "mes" | "personalizado";

export interface Rango {
  desde: Date;
  /** Exclusivo: el primer instante que ya no cuenta. */
  hasta: Date;
}

function inicioDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Rangos en la hora local de la tablet. La semana empieza en lunes. */
export function rangoDe(periodo: Exclude<Periodo, "personalizado">, hoy = new Date()): Rango {
  const dia = inicioDelDia(hoy);
  const manana = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1);
  if (periodo === "hoy") return { desde: dia, hasta: manana };
  if (periodo === "semana") {
    const desdeLunes = (dia.getDay() + 6) % 7;
    return { desde: new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() - desdeLunes), hasta: manana };
  }
  return { desde: new Date(dia.getFullYear(), dia.getMonth(), 1), hasta: manana };
}

/** "2026-10-01" → medianoche local de ese día (new Date("2026-10-01") sería UTC). */
export function fechaLocal(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Rango personalizado con ambos días incluidos. */
export function rangoPersonalizado(desdeIso: string, hastaIso: string): Rango {
  const a = fechaLocal(desdeIso);
  const b = fechaLocal(hastaIso);
  const [ini, fin] = a <= b ? [a, b] : [b, a];
  return { desde: ini, hasta: new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1) };
}

/** null = todas las tiendas. */
export type FiltroTienda = string | null;

export interface Tienda {
  id: Id;
  nombre: string;
}

export async function cargarTiendas(): Promise<Tienda[]> {
  const { data, error } = await getSupabase().from("tiendas").select("id, nombre").order("nombre");
  if (error) throw error;
  return data ?? [];
}

/* ---------- KPIs ---------- */

export interface Kpis {
  ventasTotales: number;
  numVentas: number;
  costoVendido: number;
  utilidadBruta: number;
  /** 0–100; null si no hubo ventas. */
  margenPct: number | null;
  ticketPromedio: number;
  porMetodo: { efectivo: number; tarjeta: number; transferencia: number };
  entradas: number;
  pagosProveedores: number;
  gastos: number;
}

/** Totales que suma la base (panel_kpis); de aquí salen utilidad, margen y ticket promedio. */
export interface TotalesPeriodo {
  ventas_totales: number;
  num_ventas: number;
  costo_vendido: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  entradas: number;
  pagos_proveedores: number;
  gastos: number;
}

/** Utilidad bruta = Ventas − Σ(cantidad × costo_unitario_historico). */
export function calcularKpis(t: TotalesPeriodo): Kpis {
  const ventasTotales = redondear(Number(t.ventas_totales));
  const numVentas = Number(t.num_ventas);
  const costoVendido = redondear(Number(t.costo_vendido));
  const utilidadBruta = redondear(ventasTotales - costoVendido);
  return {
    ventasTotales,
    numVentas,
    costoVendido,
    utilidadBruta,
    margenPct: ventasTotales > 0 ? Math.round((utilidadBruta / ventasTotales) * 1000) / 10 : null,
    ticketPromedio: numVentas ? redondear(ventasTotales / numVentas) : 0,
    porMetodo: { efectivo: Number(t.efectivo), tarjeta: Number(t.tarjeta), transferencia: Number(t.transferencia) },
    entradas: Number(t.entradas),
    pagosProveedores: Number(t.pagos_proveedores),
    gastos: Number(t.gastos),
  };
}

/** Las sumas se hacen en la base (sin límite de 1000 filas y sin exponer ventas a la clave pública). */
export async function cargarKpis(usuario: Usuario, tienda: FiltroTienda, rango: Rango): Promise<Kpis> {
  const totales = await rpcSeguro<TotalesPeriodo>("panel_kpis", {
    p_token: usuario.token,
    p_tienda_id: tienda,
    p_desde: rango.desde.toISOString(),
    p_hasta: rango.hasta.toISOString(),
  });
  return calcularKpis(totales);
}

/* ---------- Semáforo de inventario ---------- */

export type Semaforo = "rojo" | "amarillo" | "verde";

/** Por arriba del mínimo pero a menos de este factor se considera "próximo a agotarse". */
export const FACTOR_AMARILLO = 1.5;

/**
 * Rojo: agotado o por debajo del mínimo. Amarillo: hasta 1.5× el mínimo.
 * Sin mínimo definido (0) solo puede ser rojo (agotado) o verde.
 */
export function semaforo(stock: number, minimo: number): Semaforo {
  if (stock <= 0 || stock < minimo) return "rojo";
  if (minimo > 0 && stock < minimo * FACTOR_AMARILLO) return "amarillo";
  return "verde";
}

export interface FilaInventario {
  tiendaId: string;
  tiendaNombre: string;
  productoId: string;
  productoNombre: string;
  stockActual: number;
  stockMinimo: number;
  /** false si el producto no tiene renglón en inventario_tienda (se toma como 0). */
  registrado: boolean;
  estado: Semaforo;
}

interface RenglonInventario {
  tienda_id: Id;
  tienda_nombre: string;
  producto_id: Id;
  producto_nombre: string;
  stock_actual: number;
  stock_minimo: number;
  registrado: boolean;
}

const ORDEN: Record<Semaforo, number> = { rojo: 0, amarillo: 1, verde: 2 };

/** panel_inventario cruza tiendas × productos activos; sin renglón en inventario_tienda cuenta como 0. */
export async function cargarInventario(usuario: Usuario, tienda: FiltroTienda): Promise<FilaInventario[]> {
  const renglones = await rpcSeguro<RenglonInventario[]>("panel_inventario", { p_token: usuario.token, p_tienda_id: tienda });
  return (renglones ?? [])
    .map((r) => {
      const stockActual = Number(r.stock_actual);
      const stockMinimo = Number(r.stock_minimo);
      return {
        tiendaId: String(r.tienda_id),
        tiendaNombre: r.tienda_nombre,
        productoId: String(r.producto_id),
        productoNombre: r.producto_nombre,
        stockActual,
        stockMinimo,
        registrado: r.registrado,
        estado: semaforo(stockActual, stockMinimo),
      };
    })
    .sort(
      (a, b) =>
        ORDEN[a.estado] - ORDEN[b.estado] ||
        a.tiendaNombre.localeCompare(b.tiendaNombre, "es") ||
        a.productoNombre.localeCompare(b.productoNombre, "es"),
    );
}

/* ---------- Historial de cortes ---------- */

export interface Corte {
  id: string;
  tiendaNombre: string;
  usuarioNombre: string;
  apertura: string;
  cierre: string;
  fondoInicial: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransferencia: number;
  efectivoEsperado: number;
  efectivoContado: number;
  diferencia: number;
  deposito: number;
}

interface CorteBase {
  id: Id;
  usuario_nombre: string | null;
  tienda_nombre: string | null;
  fecha_apertura: string;
  fecha_cierre: string;
  fondo_inicial: number;
  ventas_efectivo: number;
  ventas_tarjeta: number;
  ventas_transferencia: number;
  efectivo_esperado: number;
  efectivo_contado: number;
  diferencia: number;
  deposito_caja_fuerte: number;
}

/** panel_cortes trae el nombre del cajero sin exponer el resto de la tabla usuarios. */
export async function cargarCortes(usuario: Usuario, tienda: FiltroTienda, rango: Rango): Promise<Corte[]> {
  const filas = await rpcSeguro<CorteBase[]>("panel_cortes", {
    p_token: usuario.token,
    p_tienda_id: tienda,
    p_desde: rango.desde.toISOString(),
    p_hasta: rango.hasta.toISOString(),
  });
  return (filas ?? []).map((t) => ({
    id: String(t.id),
    tiendaNombre: t.tienda_nombre ?? "—",
    usuarioNombre: t.usuario_nombre ?? "Usuario dado de baja",
    apertura: t.fecha_apertura,
    cierre: t.fecha_cierre,
    fondoInicial: Number(t.fondo_inicial),
    ventasEfectivo: Number(t.ventas_efectivo),
    ventasTarjeta: Number(t.ventas_tarjeta),
    ventasTransferencia: Number(t.ventas_transferencia),
    efectivoEsperado: Number(t.efectivo_esperado),
    efectivoContado: Number(t.efectivo_contado),
    diferencia: Number(t.diferencia),
    deposito: Number(t.deposito_caja_fuerte),
  }));
}
