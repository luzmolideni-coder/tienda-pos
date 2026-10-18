/** Los ids pueden venir como uuid (string) o serial (number) según la tabla. */
export type Id = string | number;

export interface Usuario {
  id: Id;
  nombre: string;
  rol: string;
  tienda_id: Id | null;
}

export interface Producto {
  id: Id;
  nombre: string;
  codigo_barras: string | null;
  precio_venta: number;
  /** Costo vigente; se copia a la partida para calcular la utilidad histórica. */
  costo_actual: number | null;
  es_favorito: boolean;
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
