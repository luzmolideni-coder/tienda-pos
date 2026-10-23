import type { Producto } from "@/types/pos";

/**
 * true si es un EAN-8, UPC-A (12), EAN-13 o GTIN-14 con dígito verificador correcto.
 * Los códigos inventados (con letras, cortos o mal capturados) no pasan: son "provisionales".
 */
export function esCodigoReal(codigo: string | null | undefined): boolean {
  if (!codigo || !/^\d+$/.test(codigo) || ![8, 12, 13, 14].includes(codigo.length)) return false;
  const digitos = [...codigo].map(Number);
  const verificador = digitos.pop()!;
  const suma = digitos.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === verificador;
}

/** Sin espacios, en mayúsculas y, si es numérico, sin ceros a la izquierda (12 y 13 dígitos del mismo UPC). */
function clave(codigo: string): string {
  const limpio = codigo.trim().toUpperCase();
  return /^\d+$/.test(limpio) ? limpio.replace(/^0+/, "") : limpio;
}

export function mismoCodigo(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return clave(a) === clave(b);
}

export function buscarPorCodigo(productos: Producto[], codigo: string): Producto | undefined {
  return codigo.trim() ? productos.find((p) => mismoCodigo(p.codigo_barras, codigo)) : undefined;
}
