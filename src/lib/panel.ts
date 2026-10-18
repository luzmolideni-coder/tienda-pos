import { redondear } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import type { Id } from "@/types/pos";

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

/* ---------- Lectura paginada ---------- */

const PAGINA = 1000;

/**
 * PostgREST corta las respuestas en 1000 filas por omisión; para un mes de ventas eso se queda corto.
 * Pide páginas hasta que una venga incompleta.
 */
async function traerTodo<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1);
    if (error) throw error;
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return filas;
  }
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

interface VentaConPartidas {
  total: number;
  metodo_pago: string;
  venta_items: { cantidad: number; costo_unitario_historico: number | null }[] | null;
}

interface MovimientoResumen {
  tipo: string;
  monto: number;
}

/** Utilidad bruta = Ventas − Σ(cantidad × costo_unitario_historico). */
export function calcularKpis(ventas: VentaConPartidas[], movimientos: MovimientoResumen[]): Kpis {
  const ventasTotales = redondear(ventas.reduce((s, v) => s + Number(v.total), 0));
  const costoVendido = redondear(
    ventas.reduce(
      (s, v) => s + (v.venta_items ?? []).reduce((t, i) => t + Number(i.cantidad) * Number(i.costo_unitario_historico ?? 0), 0),
      0,
    ),
  );
  const utilidadBruta = redondear(ventasTotales - costoVendido);
  const porMetodo = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  for (const v of ventas) {
    const m = v.metodo_pago.toLowerCase() as keyof typeof porMetodo;
    if (m in porMetodo) porMetodo[m] = redondear(porMetodo[m] + Number(v.total));
  }
  const suma = (tipo: string) =>
    redondear(movimientos.filter((m) => m.tipo.toUpperCase() === tipo).reduce((s, m) => s + Number(m.monto), 0));

  return {
    ventasTotales,
    numVentas: ventas.length,
    costoVendido,
    utilidadBruta,
    margenPct: ventasTotales > 0 ? Math.round((utilidadBruta / ventasTotales) * 1000) / 10 : null,
    ticketPromedio: ventas.length ? redondear(ventasTotales / ventas.length) : 0,
    porMetodo,
    entradas: suma("ENTRADA"),
    pagosProveedores: suma("PAGO_PROVEEDOR"),
    gastos: suma("GASTO"),
  };
}

export async function cargarKpis(tienda: FiltroTienda, rango: Rango): Promise<Kpis> {
  const supabase = getSupabase();
  const desde = rango.desde.toISOString();
  const hasta = rango.hasta.toISOString();

  const ventas = traerTodo<VentaConPartidas>((a, b) => {
    let q = supabase
      .from("ventas")
      .select("total, metodo_pago, venta_items(cantidad, costo_unitario_historico)")
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .order("created_at")
      .range(a, b);
    if (tienda) q = q.eq("tienda_id", tienda);
    return q;
  });

  // movimientos_caja no tiene tienda: se filtra por la tienda de su turno.
  const movimientos = traerTodo<MovimientoResumen>((a, b) => {
    let q = supabase
      .from("movimientos_caja")
      .select("tipo, monto, turnos!inner(tienda_id)")
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .order("created_at")
      .range(a, b);
    if (tienda) q = q.eq("turnos.tienda_id", tienda);
    return q;
  });

  const [v, m] = await Promise.all([ventas, movimientos]);
  return calcularKpis(v, m);
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
  producto_id: Id;
  stock_actual: number | null;
  stock_minimo?: number | null;
  stock_objetivo?: number | null;
}

const ORDEN: Record<Semaforo, number> = { rojo: 0, amarillo: 1, verde: 2 };

export async function cargarInventario(tienda: FiltroTienda, tiendas: Tienda[]): Promise<FilaInventario[]> {
  const supabase = getSupabase();
  let q = supabase.from("inventario_tienda").select("*");
  if (tienda) q = q.eq("tienda_id", tienda);
  const [inv, prods] = await Promise.all([
    q,
    supabase.from("productos").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  if (inv.error) throw inv.error;
  if (prods.error) throw prods.error;

  const renglones = new Map<string, RenglonInventario>();
  for (const r of (inv.data ?? []) as RenglonInventario[]) renglones.set(`${r.tienda_id}|${r.producto_id}`, r);

  const enAlcance = tienda ? tiendas.filter((t) => String(t.id) === tienda) : tiendas;
  const filas: FilaInventario[] = [];
  for (const t of enAlcance) {
    for (const p of prods.data ?? []) {
      const r = renglones.get(`${t.id}|${p.id}`);
      const stockActual = Number(r?.stock_actual ?? 0);
      // stock_minimo si la tabla lo tiene; si no, stock_objetivo hace de mínimo.
      const stockMinimo = Number(r?.stock_minimo ?? r?.stock_objetivo ?? 0);
      filas.push({
        tiendaId: String(t.id),
        tiendaNombre: t.nombre,
        productoId: String(p.id),
        productoNombre: p.nombre,
        stockActual,
        stockMinimo,
        registrado: !!r,
        estado: semaforo(stockActual, stockMinimo),
      });
    }
  }
  return filas.sort(
    (a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.tiendaNombre.localeCompare(b.tiendaNombre, "es") || a.productoNombre.localeCompare(b.productoNombre, "es"),
  );
}

/* ---------- Historial de cortes ---------- */

export interface Corte {
  id: string;
  tiendaNombre: string;
  usuarioId: string;
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

export async function cargarCortes(tienda: FiltroTienda, rango: Rango): Promise<Corte[]> {
  let q = getSupabase()
    .from("turnos")
    .select(
      "id, usuario_id, fecha_apertura, fecha_cierre, fondo_inicial, ventas_efectivo, ventas_tarjeta, ventas_transferencia, efectivo_esperado, efectivo_contado, diferencia, deposito_caja_fuerte, tiendas(nombre)",
    )
    .eq("estado", "CERRADO")
    .gte("fecha_cierre", rango.desde.toISOString())
    .lt("fecha_cierre", rango.hasta.toISOString())
    .order("fecha_cierre", { ascending: false });
  if (tienda) q = q.eq("tienda_id", tienda);
  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((t) => {
    const tiendaRel = Array.isArray(t.tiendas) ? t.tiendas[0] : t.tiendas;
    return {
      id: String(t.id),
      tiendaNombre: (tiendaRel as { nombre?: string } | null)?.nombre ?? "—",
      usuarioId: String(t.usuario_id),
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
    };
  });
}
