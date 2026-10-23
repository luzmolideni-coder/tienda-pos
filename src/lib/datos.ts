import { getSupabase } from "@/lib/supabase/client";
import { rpcSeguro } from "@/lib/supabase/rpc";
import type { Arqueo, CifrasTurno } from "@/lib/corte";
import { redondear } from "@/lib/format";
import type { Id, ItemCarrito, MetodoPago, Producto, TipoMovimiento, Turno, Usuario } from "@/types/pos";

export async function cargarProductosActivos(): Promise<Producto[]> {
  const { data, error } = await getSupabase()
    .from("productos")
    .select("id, nombre, codigo_barras, precio_venta, costo_actual, es_favorito, proveedor_id, es_precio_fijo")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  // numeric de Postgres puede llegar como string según la configuración; se normaliza a number.
  return (data ?? []).map((p) => ({
    ...p,
    precio_venta: Number(p.precio_venta),
    costo_actual: p.costo_actual == null ? null : Number(p.costo_actual),
    es_favorito: !!p.es_favorito,
    es_precio_fijo: !!p.es_precio_fijo,
  }));
}

/**
 * Valida el PIN en la base (iniciar_sesion_pos) y recibe un token de sesión. Todas las demás
 * operaciones mandan ese token: la base sabe quién es el usuario y su rol sin confiar en el navegador.
 */
export async function buscarUsuarioPorPin(pin: string): Promise<Usuario | null> {
  return rpcSeguro<Usuario | null>("iniciar_sesion_pos", { p_pin: pin });
}

/** Confirma con la base que el token sigue vigente y devuelve los datos actuales del usuario. */
export async function validarSesion(token: string): Promise<Usuario> {
  return rpcSeguro<Usuario>("pos_validar_sesion", { p_token: token });
}

export async function cerrarSesionEnBase(token: string): Promise<void> {
  await rpcSeguro("cerrar_sesion_pos", { p_token: token });
}

function normalizarTurno(t: Turno): Turno {
  return { ...t, fondo_inicial: Number(t.fondo_inicial) };
}

/** Turno ABIERTO del usuario o de su tienda (la base prefiere el propio y el más reciente). */
export async function buscarTurnoAbierto(usuario: Usuario): Promise<Turno | null> {
  const t = await rpcSeguro<Turno | null>("pos_turno_abierto", { p_token: usuario.token });
  return t ? normalizarTurno(t) : null;
}

/** Abre turno; si ya había uno abierto para el usuario o su tienda, la base devuelve ese. */
export async function abrirTurno(usuario: Usuario, fondoInicial: number): Promise<Turno> {
  const t = await rpcSeguro<Turno>("pos_abrir_turno", { p_token: usuario.token, p_fondo_inicial: redondear(fondoInicial) });
  return normalizarTurno(t);
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
 * Guarda la venta y sus partidas en una sola transacción (pos_registrar_venta → registrar_venta).
 * Usuario y tienda los pone la base a partir del token.
 */
export async function registrarVenta({ usuario, turnoId, items, total, metodo, pagaCon }: NuevaVenta): Promise<void> {
  const partidas = items.map(({ producto, cantidad }) => ({
    producto_id: producto.id,
    cantidad,
    precio_unitario: producto.precio_venta,
    costo_unitario_historico: producto.costo_actual ?? 0,
    subtotal: redondear(producto.precio_venta * cantidad),
  }));

  await rpcSeguro("pos_registrar_venta", {
    p_token: usuario.token,
    p_turno_id: turnoId,
    p_total: total,
    p_paga_con: pagaCon,
    p_cambio: redondear(pagaCon - total),
    p_metodo_pago: metodo,
    p_items: partidas,
  });
}

interface NuevoMovimiento {
  usuario: Usuario;
  turnoId: Id;
  tipo: TipoMovimiento;
  monto: number;
  concepto: string;
}

export async function registrarMovimiento({ usuario, turnoId, tipo, monto, concepto }: NuevoMovimiento): Promise<void> {
  await rpcSeguro("pos_registrar_movimiento", {
    p_token: usuario.token,
    p_turno_id: turnoId,
    p_tipo: tipo,
    p_monto: redondear(monto),
    p_concepto: concepto,
  });
}

interface CifrasBase {
  fondo_inicial: number;
  num_ventas: number;
  ventas_efectivo: number;
  ventas_tarjeta: number;
  ventas_transferencia: number;
  entradas: number;
  pagos_proveedores: number;
  gastos: number;
  efectivo_esperado: number;
}

function cifrasDesdeBase(c: CifrasBase): CifrasTurno {
  return {
    fondoInicial: Number(c.fondo_inicial),
    numVentas: Number(c.num_ventas),
    ventasEfectivo: Number(c.ventas_efectivo),
    ventasTarjeta: Number(c.ventas_tarjeta),
    ventasTransferencia: Number(c.ventas_transferencia),
    entradas: Number(c.entradas),
    pagosProveedores: Number(c.pagos_proveedores),
    gastos: Number(c.gastos),
    efectivoEsperado: Number(c.efectivo_esperado),
  };
}

/** Cifras en vivo del turno para el corte completo. Solo ADMIN: la base rechaza a los demás. */
export async function cargarCifrasTurno(usuario: Usuario, turno: Turno): Promise<CifrasTurno> {
  return cifrasDesdeBase(await rpcSeguro<CifrasBase>("pos_cifras_turno", { p_token: usuario.token, p_turno_id: turno.id }));
}

export type ResultadoCierre =
  | { tipo: "completo"; cifras: CifrasTurno; arqueo: Arqueo; cierre: Date }
  | { tipo: "ciego"; efectivoContado: number; cierre: Date };

/**
 * Cierra el turno: la base calcula esperado, diferencia y depósito y los guarda. A ADMIN le
 * devuelve todo; a los demás (corte ciego) solo lo que reportaron y la hora de cierre.
 */
export async function cerrarTurno(usuario: Usuario, turnoId: Id, efectivoContado: number): Promise<ResultadoCierre> {
  const r = await rpcSeguro<CifrasBase & { efectivo_contado: number; diferencia?: number; deposito?: number; fecha_cierre: string }>(
    "pos_cerrar_turno",
    { p_token: usuario.token, p_turno_id: turnoId, p_efectivo_contado: redondear(efectivoContado) },
  );
  const fecha = new Date(r.fecha_cierre);
  const cierre = Number.isNaN(fecha.getTime()) ? new Date() : fecha;
  if (r.diferencia === undefined || r.deposito === undefined) {
    return { tipo: "ciego", efectivoContado: Number(r.efectivo_contado), cierre };
  }
  return {
    tipo: "completo",
    cifras: cifrasDesdeBase(r),
    arqueo: { efectivoContado: Number(r.efectivo_contado), diferencia: Number(r.diferencia), deposito: Number(r.deposito) },
    cierre,
  };
}

export interface ResultadoConteo {
  stockContado: number;
  /** Solo para ADMIN: el conteo de OPERACION es ciego. */
  stockAnterior?: number | null;
  diferencia?: number;
}

/** Fija la existencia de un producto con lo contado físicamente (pos_ajustar_inventario). */
export async function ajustarInventario(usuario: Usuario, productoId: Id, cantidadContada: number): Promise<ResultadoConteo> {
  const r = await rpcSeguro<{ stock_contado: number; stock_anterior?: number | null; diferencia?: number }>(
    "pos_ajustar_inventario",
    { p_token: usuario.token, p_producto_id: productoId, p_cantidad_contada: cantidadContada },
  );
  return {
    stockContado: Number(r.stock_contado),
    stockAnterior: r.stock_anterior === undefined ? undefined : r.stock_anterior === null ? null : Number(r.stock_anterior),
    diferencia: r.diferencia === undefined ? undefined : Number(r.diferencia),
  };
}
