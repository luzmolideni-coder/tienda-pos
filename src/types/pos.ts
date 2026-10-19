/** Los ids pueden venir como uuid (string) o serial (number) según la tabla. */
export type Id = string | number;

export interface Usuario {
  id: Id;
  nombre: string;
  rol: string;
  tienda_id: Id | null;
  /** Token de sesión que emite la base al validar el PIN (iniciar_sesion_pos). */
  token: string;
}

export interface Producto {
  id: Id;
  nombre: string;
  codigo_barras: string | null;
  precio_venta: number;
  /** Costo vigente; se copia a la partida para calcular la utilidad histórica. */
  costo_actual: number | null;
  es_favorito: boolean;
  proveedor_id: Id | null;
  /** El precio de venta no se recalcula al recibir compras. */
  es_precio_fijo: boolean;
}

export interface Proveedor {
  id: Id;
  nombre: string;
  /** Días en que se le hace el pedido. */
  dias_visita: string[];
  /** Días en que llega su mercancía. */
  dias_entrega: string[];
}

export interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

export interface Turno {
  id: Id;
  usuario_id: Id;
  tienda_id: Id | null;
  fondo_inicial: number;
  fecha_apertura: string;
}

export type MetodoPago = "efectivo" | "tarjeta" | "transferencia";

export type TipoMovimiento = "ENTRADA" | "PAGO_PROVEEDOR" | "GASTO";
