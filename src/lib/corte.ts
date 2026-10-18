import { formatMXN, redondear } from "@/lib/format";
import type { TipoMovimiento } from "@/types/pos";

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ENTRADA: "Entrada de efectivo",
  PAGO_PROVEEDOR: "Pago a proveedor",
  GASTO: "Gasto extra",
};

export interface CifrasTurno {
  fondoInicial: number;
  numVentas: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransferencia: number;
  entradas: number;
  pagosProveedores: number;
  gastos: number;
  /** Fondo + ventas en efectivo + entradas − pagos − gastos (lo calcula la base). */
  efectivoEsperado: number;
}

export interface Arqueo {
  efectivoContado: number;
  /** Contado − esperado: positivo sobra, negativo falta. */
  diferencia: number;
  /** Lo que excede el fondo inicial se va a la caja fuerte; el fondo se queda para el siguiente turno. */
  deposito: number;
}

export function calcularArqueo(cifras: CifrasTurno, efectivoContado: number): Arqueo {
  return {
    efectivoContado: redondear(efectivoContado),
    diferencia: redondear(efectivoContado - cifras.efectivoEsperado),
    deposito: redondear(Math.max(0, efectivoContado - cifras.fondoInicial)),
  };
}

interface DatosComprobante {
  cifras: CifrasTurno;
  arqueo: Arqueo;
  cajero: string;
  apertura: Date;
  cierre: Date;
}

const fechaHora = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" });

/** Comprobante en texto plano de ancho fijo (sirve para impresora térmica de 40 columnas). */
export function textoComprobante({ cifras, arqueo, cajero, apertura, cierre }: DatosComprobante): string {
  const ancho = 40;
  const linea = (izq: string, der = "") => izq + der.padStart(ancho - izq.length, " ");
  const sep = "-".repeat(ancho);
  return [
    "CORTE DE CAJA".padStart((ancho + 13) / 2, " "),
    sep,
    linea("Cajero:", cajero),
    linea("Apertura:", fechaHora.format(apertura)),
    linea("Cierre:", fechaHora.format(cierre)),
    linea("Ventas:", String(cifras.numVentas)),
    sep,
    linea("Fondo inicial", formatMXN(cifras.fondoInicial)),
    linea("(+) Ventas efectivo", formatMXN(cifras.ventasEfectivo)),
    linea("(+) Entradas", formatMXN(cifras.entradas)),
    linea("(-) Pagos proveedores", formatMXN(cifras.pagosProveedores)),
    linea("(-) Gastos", formatMXN(cifras.gastos)),
    linea("(=) Efectivo esperado", formatMXN(cifras.efectivoEsperado)),
    sep,
    linea("Efectivo contado", formatMXN(arqueo.efectivoContado)),
    linea(arqueo.diferencia < 0 ? "Faltante" : "Sobrante", formatMXN(Math.abs(arqueo.diferencia))),
    linea("Deposito caja fuerte", formatMXN(arqueo.deposito)),
    linea("Fondo que queda", formatMXN(redondear(arqueo.efectivoContado - arqueo.deposito))),
    sep,
    linea("Ventas tarjeta", formatMXN(cifras.ventasTarjeta)),
    linea("Ventas transferencia", formatMXN(cifras.ventasTransferencia)),
    sep,
    "",
    "Firma: ______________________________",
  ].join("\n");
}

interface DatosEntrega {
  efectivoContado: number;
  cajero: string;
  apertura: Date;
  cierre: Date;
}

/** Comprobante del corte ciego: solo lo que la cajera entregó, sin esperado, diferencia ni depósito. */
export function textoComprobanteEntrega({ efectivoContado, cajero, apertura, cierre }: DatosEntrega): string {
  const ancho = 40;
  const linea = (izq: string, der = "") => izq + der.padStart(ancho - izq.length, " ");
  const sep = "-".repeat(ancho);
  return [
    "ENTREGA DE EFECTIVO".padStart((ancho + 19) / 2, " "),
    sep,
    linea("Cajero:", cajero),
    linea("Apertura:", fechaHora.format(apertura)),
    linea("Cierre:", fechaHora.format(cierre)),
    sep,
    linea("Efectivo reportado:", formatMXN(efectivoContado)),
    sep,
    "",
    "Entrega: ____________________________",
    "",
    "Recibe:  ____________________________",
  ].join("\n");
}
