import { getSupabase } from "@/lib/supabase/client";
import { redondear } from "@/lib/format";
import { generarUuid } from "@/lib/uuid";
import type { Id, ItemCarrito, MetodoPago, Producto, Turno, Usuario } from "@/types/pos";

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

/** Guarda la venta y sus partidas. Devuelve el id de la venta creada. */
export async function registrarVenta({ usuario, turnoId, items, total, metodo, pagaCon }: NuevaVenta): Promise<Id> {
  const supabase = getSupabase();
  const ventaId = generarUuid();

  const { error } = await supabase.from("ventas").insert({
    id: ventaId,
    tienda_id: usuario.tienda_id,
    usuario_id: usuario.id,
    turno_id: turnoId,
    total,
    metodo_pago: metodo,
    paga_con: pagaCon,
    cambio: redondear(pagaCon - total),
  });
  if (error) throw error;

  const partidas = items.map(({ producto, cantidad }) => ({
    venta_id: ventaId,
    producto_id: producto.id,
    cantidad,
    precio_unitario: producto.precio_venta,
    costo_unitario_historico: producto.costo_actual ?? 0,
    subtotal: redondear(producto.precio_venta * cantidad),
  }));

  const { error: errorPartidas } = await supabase.from("venta_items").insert(partidas);
  if (errorPartidas) {
    // Sin transacción desde el cliente: se intenta no dejar una venta sin partidas.
    await supabase.from("ventas").delete().eq("id", ventaId);
    throw errorPartidas;
  }

  return ventaId;
}
