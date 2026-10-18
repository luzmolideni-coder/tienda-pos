import { redondear } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import { generarUuid } from "@/lib/uuid";
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

/**
 * Guarda el pedido con estado SOLICITADO y sus partidas. Son dos inserts (no hay función
 * transaccional para pedidos): si fallan las partidas se intenta borrar el encabezado.
 */
export async function crearPedido(usuario: Usuario, proveedorId: Id, partidas: PartidaPedido[]): Promise<Id> {
  const supabase = getSupabase();
  const pedidoId = generarUuid();

  const { error } = await supabase.from("pedidos").insert({
    id: pedidoId,
    tienda_id: usuario.tienda_id,
    proveedor_id: proveedorId,
    solicitado_por: usuario.id,
    estado: "SOLICITADO",
  });
  if (error) throw error;

  const { error: errorPartidas } = await supabase.from("pedido_items").insert(
    partidas.map((p) => ({ id: generarUuid(), pedido_id: pedidoId, producto_id: p.productoId, cantidad_solicitada: p.cantidad })),
  );
  if (errorPartidas) {
    await supabase.from("pedidos").delete().eq("id", pedidoId);
    throw errorPartidas;
  }
  return pedidoId;
}

export interface PedidoAprobado {
  id: Id;
  proveedorId: Id;
  proveedorNombre: string;
  creado: string;
  partidas: PartidaPedido[];
}

export async function cargarPedidosAprobados(tiendaId: Id | null): Promise<PedidoAprobado[]> {
  let consulta = getSupabase()
    .from("pedidos")
    .select("id, proveedor_id, created_at, proveedores(nombre), pedido_items(producto_id, cantidad_solicitada)")
    .eq("estado", "APROBADO")
    .order("created_at", { ascending: false });
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
      partidas: (p.pedido_items ?? []).map((i: { producto_id: Id; cantidad_solicitada: number }) => ({
        productoId: i.producto_id,
        cantidad: Number(i.cantidad_solicitada),
      })),
    };
  });
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
