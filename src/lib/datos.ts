import { getSupabase } from "@/lib/supabase/client";
import { calcularCifras, type Arqueo, type CifrasTurno } from "@/lib/corte";
import { redondear } from "@/lib/format";
import { generarUuid } from "@/lib/uuid";
import type { Id, ItemCarrito, MetodoPago, Producto, TipoMovimiento, Turno, Usuario } from "@/types/pos";

export async function cargarProductosActivos(): Promise<Producto[]> {
  const { data, error } = await getSupabase()
    .from("productos")
    .select("id, nombre, codigo_barras, precio_venta, costo_actual, es_favorito")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  // numeric de Postgres puede llegar como string según la configuración; se normaliza a number.
  return (data ?? []).map((p) => ({
    ...p,
    precio_venta: Number(p.precio_venta),
    costo_actual: p.costo_actual == null ? null : Number(p.costo_actual),
    es_favorito: !!p.es_favorito,
  }));
}

/** Valida el PIN en el servidor (función login_con_pin); los PINs nunca llegan al navegador. */
export async function buscarUsuarioPorPin(pin: string): Promise<Usuario | null> {
  const { data, error } = await getSupabase().rpc("login_con_pin", { p_pin: pin });
  if (error) throw error;
  // La función devuelve un conjunto de filas: vacío si el PIN no existe.
  const filas = (Array.isArray(data) ? data : data ? [data] : []) as Usuario[];
  return filas[0] ?? null;
}

const COLUMNAS_TURNO = "id, usuario_id, tienda_id, fondo_inicial, fecha_apertura";

function normalizarTurno(t: Turno): Turno {
  return { ...t, fondo_inicial: Number(t.fondo_inicial) };
}

/**
 * Turno ABIERTO del usuario o de su tienda. Si hay varios, prefiere el del propio usuario
 * y luego el más reciente.
 */
export async function buscarTurnoAbierto(usuario: Usuario): Promise<Turno | null> {
  const filtro = usuario.tienda_id
    ? `usuario_id.eq.${usuario.id},tienda_id.eq.${usuario.tienda_id}`
    : `usuario_id.eq.${usuario.id}`;
  const { data, error } = await getSupabase()
    .from("turnos")
    .select(COLUMNAS_TURNO)
    .eq("estado", "ABIERTO")
    .or(filtro)
    .order("fecha_apertura", { ascending: false })
    .limit(10);
  if (error) throw error;
  const turnos = (data ?? []) as Turno[];
  const elegido = turnos.find((t) => t.usuario_id === usuario.id) ?? turnos[0];
  return elegido ? normalizarTurno(elegido) : null;
}

export async function abrirTurno(usuario: Usuario, fondoInicial: number): Promise<Turno> {
  // El id se genera aquí para no depender de leer la fila de vuelta (RLS puede no permitir SELECT).
  const turno: Turno = {
    id: generarUuid(),
    usuario_id: usuario.id,
    tienda_id: usuario.tienda_id,
    fondo_inicial: redondear(fondoInicial),
    fecha_apertura: new Date().toISOString(),
  };
  const { error } = await getSupabase()
    .from("turnos")
    .insert({ ...turno, estado: "ABIERTO" });
  if (error) throw error;
  return turno;
}

interface NuevaVenta {
  usuario: Usuario;
  turnoId: Id;
  items: ItemCarrito[];
  total: number;
  metodo: MetodoPago;
  /** Monto entregado por el cliente; para tarjeta o transferencia es igual al total. */
  pagaCon: number;
}

/**
 * Guarda la venta y sus partidas con la función registrar_venta de Supabase, en una sola
 * transacción: si cualquier partida falla, no queda ninguna venta a medias.
 * Devuelve lo que regrese la función (normalmente el id de la venta).
 */
export async function registrarVenta({ usuario, turnoId, items, total, metodo, pagaCon }: NuevaVenta): Promise<unknown> {
  const partidas = items.map(({ producto, cantidad }) => ({
    producto_id: producto.id,
    cantidad,
    precio_unitario: producto.precio_venta,
    costo_unitario_historico: producto.costo_actual ?? 0,
    subtotal: redondear(producto.precio_venta * cantidad),
  }));

  const { data, error } = await getSupabase().rpc("registrar_venta", {
    p_tienda_id: usuario.tienda_id,
    p_usuario_id: usuario.id,
    p_turno_id: turnoId,
    p_total: total,
    p_paga_con: pagaCon,
    p_cambio: redondear(pagaCon - total),
    p_metodo_pago: metodo,
    p_items: partidas,
  });
  if (error) throw error;
  return data;
}

interface NuevoMovimiento {
  turnoId: Id;
  usuarioId: Id;
  tipo: TipoMovimiento;
  monto: number;
  concepto: string;
}

export async function registrarMovimiento({ turnoId, usuarioId, tipo, monto, concepto }: NuevoMovimiento): Promise<void> {
  const { error } = await getSupabase()
    .from("movimientos_caja")
    .insert({ id: generarUuid(), turno_id: turnoId, usuario_id: usuarioId, tipo, monto: redondear(monto), concepto });
  if (error) throw error;
}

/** Suma ventas y movimientos del turno para el corte. */
export async function cargarCifrasTurno(turno: Turno): Promise<CifrasTurno> {
  const supabase = getSupabase();
  const [ventas, movimientos] = await Promise.all([
    supabase.from("ventas").select("metodo_pago, total").eq("turno_id", turno.id),
    supabase.from("movimientos_caja").select("tipo, monto").eq("turno_id", turno.id),
  ]);
  if (ventas.error) throw ventas.error;
  if (movimientos.error) throw movimientos.error;
  return calcularCifras(
    turno.fondo_inicial,
    (ventas.data ?? []).map((v) => ({ metodo_pago: String(v.metodo_pago), total: Number(v.total) })),
    (movimientos.data ?? []).map((m) => ({ tipo: String(m.tipo), monto: Number(m.monto) })),
  );
}

/** Cierra el turno guardando las cifras del corte. Devuelve la fecha de cierre registrada. */
export async function cerrarTurno(turnoId: Id, cifras: CifrasTurno, arqueo: Arqueo): Promise<Date> {
  const cierre = new Date();
  const { data, error } = await getSupabase()
    .from("turnos")
    .update({
      estado: "CERRADO",
      fecha_cierre: cierre.toISOString(),
      ventas_efectivo: cifras.ventasEfectivo,
      ventas_tarjeta: cifras.ventasTarjeta,
      ventas_transferencia: cifras.ventasTransferencia,
      efectivo_esperado: cifras.efectivoEsperado,
      efectivo_contado: arqueo.efectivoContado,
      diferencia: arqueo.diferencia,
      deposito_caja_fuerte: arqueo.deposito,
    })
    .eq("id", turnoId)
    .eq("estado", "ABIERTO")
    .select("id");
  if (error) throw error;
  // Con RLS un UPDATE sin permiso no da error: simplemente no toca filas.
  if (!data?.length) throw new Error("El turno no se actualizó: ya estaba cerrado o no hay permiso para cerrarlo.");
  return cierre;
}

/**
 * Corte ciego: solo envía el efectivo contado. Esperado, diferencia y depósito los calcula y guarda
 * la función cerrar_turno_ciego en Postgres (supabase/cerrar_turno_ciego.sql) sin devolverlos.
 */
export async function cerrarTurnoCiego(turnoId: Id, efectivoContado: number): Promise<Date> {
  const { data, error } = await getSupabase().rpc("cerrar_turno_ciego", {
    p_turno_id: turnoId,
    p_efectivo_contado: redondear(efectivoContado),
  });
  if (error) {
    if (error.code === "PGRST202") {
      throw new Error("Falta la función cerrar_turno_ciego en Supabase. Avisa al administrador.");
    }
    throw error;
  }
  const fecha = data && typeof data === "object" && "fecha_cierre" in data ? new Date(String(data.fecha_cierre)) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha : new Date();
}
