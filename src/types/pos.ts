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
  es_favorito: boolean;
}

export interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

export type MetodoPago = "efectivo" | "tarjeta" | "transferencia";
