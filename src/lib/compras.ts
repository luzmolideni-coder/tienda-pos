import { redondear } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import { rpcSeguro } from "@/lib/supabase/rpc";
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
  const limpio = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const dia = limpio(DIAS[hoy.getDay()]);
  return proveedor.dias_visita.some((d) => limpio(d) === dia);
}

export interface PartidaPedido {
  productoId: Id;
  cantidad: number;
}

/** Crea el pedido SOLICITADO en una transacción (pos_crear_pedido → crear_pedido); solicitante = sesión. */
export async function crearPedido(usuario: Usuario, proveedorId: Id, partidas: PartidaPedido[]): Promise<void> {
  await rpcSeguro("pos_crear_pedido", {
    p_token: usuario.token,
    p_proveedor_id: proveedorId,
    // Se mandan ambos nombres de cantidad porque son los que usan pedido_items y las demás funciones.
    p_items: partidas.map((p) => ({ producto_id: p.productoId, cantidad_solicitada: p.cantidad, cantidad: p.cantidad })),
  });
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

/**
 * Aprueba el pedido en una transacción (pos_aprobar_pedido → aprobar_pedido): guarda las cantidades
 * aprobadas y lo pasa a APROBADO. Solo ADMIN; quien aprueba lo toma la base de la sesión.
 * Una cantidad en 0 deja la partida en 0 y Compras la ignora.
 */
export async function aprobarPedido(usuario: Usuario, pedidoId: Id, partidas: PartidaPedido[]): Promise<void> {
  await rpcSeguro("pos_aprobar_pedido", {
    p_token: usuario.token,
    p_pedido_id: pedidoId,
    p_items: partidas.map((p) => ({ producto_id: p.productoId, cantidad_aprobada: p.cantidad })),
  });
}

export async function rechazarPedido(usuario: Usuario, pedidoId: Id): Promise<void> {
  await rpcSeguro("pos_rechazar_pedido", { p_token: usuario.token, p_pedido_id: pedidoId });
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
 * pos_procesar_recepcion → procesar_recepcion_compra hace todo en una transacción: registra la
 * recepción, suma existencias, actualiza costo y precio (redondeo a $0.50, respetando precio fijo)
 * y escribe historial_costos. Usuario y tienda los pone la base a partir del token.
 */
export async function procesarRecepcion({ usuario, proveedorId, pedidoId, partidas }: NuevaRecepcion): Promise<number> {
  const total = totalRecepcion(partidas);
  await rpcSeguro("pos_procesar_recepcion", {
    p_token: usuario.token,
    p_proveedor_id: proveedorId,
    p_pedido_id: pedidoId,
    p_total_ticket: total,
    p_items: partidas.map((p) => ({
      producto_id: p.productoId,
      piezas_recibidas: p.piezas,
      costo_unitario_neto: redondear(p.costoUnitarioNeto),
    })),
  });
  return total;
}
