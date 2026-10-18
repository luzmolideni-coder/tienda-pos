import { redondear } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import type { Id, Proveedor, Usuario } from "@/types/pos";

export async function cargarProveedores(): Promise<Proveedor[]> {
  const { data, error } = await getSupabase()
    .from("proveedores")
    .select("id, nombre, dias_visita")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, dias_visita: Array.isArray(p.dias_visita) ? p.dias_visita : [] }));
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** true si el proveedor visita hoy (compara sin acentos ni mayúsculas). */
export function visitaHoy(proveedor: Proveedor, hoy = new Date()): boolean {
  const limpio = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const dia = limpio(DIAS[hoy.getDay()]);
  return proveedor.dias_visita.some((d) => limpio(d) === dia);
}

export interface PartidaPedido {
  productoId: Id;
  cantidad: number;
}

/** Crea el pedido con estado SOLICITADO y sus partidas en una sola transacción (función crear_pedido). */
export async function crearPedido(usuario: Usuario, proveedorId: Id, partidas: PartidaPedido[]): Promise<unknown> {
  const { data, error } = await getSupabase().rpc("crear_pedido", {
    p_tienda_id: usuario.tienda_id,
    p_proveedor_id: proveedorId,
    p_solicitado_por: usuario.id,
    // Se mandan ambos nombres de cantidad porque son los que usan pedido_items y las demás funciones.
    p_items: partidas.map((p) => ({ producto_id: p.productoId, cantidad_solicitada: p.cantidad, cantidad: p.cantidad })),
  });
  if (error) throw error;
  return data;
}

export interface PartidaDePedido extends PartidaPedido {
  /** id de la fila en pedido_items, para ajustar la cantidad al aprobar. */
  itemId: Id;
}

export interface Pedido {
  id: Id;
  proveedorId: Id;
  proveedorNombre: string;
  creado: string;
  partidas: PartidaDePedido[];
}

export async function cargarPedidos(estado: "SOLICITADO" | "APROBADO", tiendaId: Id | null): Promise<Pedido[]> {
  let consulta = getSupabase()
    .from("pedidos")
    .select("id, proveedor_id, created_at, proveedores(nombre), pedido_items(id, producto_id, cantidad_solicitada)")
    .eq("estado", estado)
    .order("created_at", { ascending: estado === "SOLICITADO" });
  if (tiendaId) consulta = consulta.eq("tienda_id", tiendaId);
  const { data, error } = await consulta;
  if (error) throw error;

  return (data ?? []).map((p) => {
    // PostgREST devuelve la relación muchos-a-uno como objeto (o arreglo según la versión de tipos).
    const prov = Array.isArray(p.proveedores) ? p.proveedores[0] : p.proveedores;
    return {
      id: p.id,
      proveedorId: p.proveedor_id,
      proveedorNombre: (prov as { nombre?: string } | null)?.nombre ?? "Proveedor",
      creado: p.created_at,
      partidas: (p.pedido_items ?? []).map((i: { id: Id; producto_id: Id; cantidad_solicitada: number }) => ({
        itemId: i.id,
        productoId: i.producto_id,
        cantidad: Number(i.cantidad_solicitada),
      })),
    };
  });
}

/** Con RLS un UPDATE sin permiso no falla: devuelve 0 filas. Se pide el id para detectarlo. */
async function actualizarPedido(pedidoId: Id, cambios: Record<string, unknown>): Promise<void> {
  const { data, error } = await getSupabase()
    .from("pedidos")
    .update(cambios)
    .eq("id", pedidoId)
    .eq("estado", "SOLICITADO")
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("El pedido ya no está SOLICITADO o no hay permiso para cambiarlo.");
}

/**
 * Guarda las cantidades ajustadas y pasa el pedido a APROBADO para que Compras lo cargue.
 * Una cantidad en 0 deja la partida en 0 (Compras la ignora) en lugar de borrarla.
 */
export async function aprobarPedido(pedidoId: Id, aprobadoPor: Id, ajustes: { itemId: Id; cantidad: number }[]): Promise<void> {
  const supabase = getSupabase();
  const resultados = await Promise.all(
    ajustes.map((a) =>
      supabase.from("pedido_items").update({ cantidad_solicitada: a.cantidad }).eq("id", a.itemId).eq("pedido_id", pedidoId).select("id"),
    ),
  );
  for (const r of resultados) {
    if (r.error) throw r.error;
    if (!r.data?.length) throw new Error("No se pudieron guardar las cantidades ajustadas (sin permiso para editar partidas).");
  }
  await actualizarPedido(pedidoId, { estado: "APROBADO", aprobado_por: aprobadoPor });
}

export async function rechazarPedido(pedidoId: Id): Promise<void> {
  await actualizarPedido(pedidoId, { estado: "RECHAZADO" });
}

export interface PartidaRecepcion {
  productoId: Id;
  piezas: number;
  costoUnitarioNeto: number;
}

export function totalRecepcion(partidas: PartidaRecepcion[]): number {
  return redondear(partidas.reduce((s, p) => s + p.piezas * p.costoUnitarioNeto, 0));
}

interface NuevaRecepcion {
  usuario: Usuario;
  proveedorId: Id;
  pedidoId: Id | null;
  partidas: PartidaRecepcion[];
}

/**
 * procesar_recepcion_compra hace todo en una transacción: registra la recepción, suma existencias,
 * actualiza costo y precio (redondeo a $0.50, respetando precio fijo) y escribe historial_costos.
 */
export async function procesarRecepcion({ usuario, proveedorId, pedidoId, partidas }: NuevaRecepcion): Promise<number> {
  const total = totalRecepcion(partidas);
  const { error } = await getSupabase().rpc("procesar_recepcion_compra", {
    p_tienda_id: usuario.tienda_id,
    p_usuario_id: usuario.id,
    p_proveedor_id: proveedorId,
    p_pedido_id: pedidoId,
    p_total_ticket: total,
    p_items: partidas.map((p) => ({
      producto_id: p.productoId,
      piezas_recibidas: p.piezas,
      costo_unitario_neto: redondear(p.costoUnitarioNeto),
    })),
  });
  if (error) throw error;
  return total;
}
