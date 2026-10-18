import { getSupabase } from "@/lib/supabase/client";
import { redondear } from "@/lib/format";
import type { Id, ItemCarrito, MetodoPago, Producto, Usuario } from "@/types/pos";

export async function cargarProductosActivos(): Promise<Producto[]> {
  const { data, error } = await getSupabase()
    .from("productos")
    .select("id, nombre, codigo_barras, precio_venta, es_favorito")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  // numeric de Postgres puede llegar como string según la configuración; se normaliza a number.
  return (data ?? []).map((p) => ({ ...p, precio_venta: Number(p.precio_venta), es_favorito: !!p.es_favorito }));
}

export async function buscarUsuarioPorPin(pin: string): Promise<Usuario | null> {
  const { data, error } = await getSupabase()
    .from("usuarios")
    .select("id, nombre, rol, tienda_id")
    .eq("pin", pin)
    .eq("activo", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

interface NuevaVenta {
  usuario: Usuario;
  items: ItemCarrito[];
  total: number;
  metodo: MetodoPago;
  /** Monto entregado por el cliente; para tarjeta o transferencia es igual al total. */
  pagaCon: number;
}

/** Guarda la venta y sus partidas. Devuelve el id de la venta creada. */
export async function registrarVenta({ usuario, items, total, metodo, pagaCon }: NuevaVenta): Promise<Id> {
  const supabase = getSupabase();

  const { data: venta, error } = await supabase
    .from("ventas")
    .insert({
      tienda_id: usuario.tienda_id,
      usuario_id: usuario.id,
      total,
      metodo_pago: metodo,
      paga_con: pagaCon,
      cambio: redondear(pagaCon - total),
    })
    .select("id")
    .single();
  if (error) throw error;

  const partidas = items.map(({ producto, cantidad }) => ({
    venta_id: venta.id,
    producto_id: producto.id,
    cantidad,
    precio_unitario: producto.precio_venta,
    subtotal: redondear(producto.precio_venta * cantidad),
  }));

  const { error: errorPartidas } = await supabase.from("venta_items").insert(partidas);
  if (errorPartidas) {
    // Sin transacción desde el cliente: se intenta no dejar una venta sin partidas.
    await supabase.from("ventas").delete().eq("id", venta.id);
    throw errorPartidas;
  }

  return venta.id;
}
