const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function formatMXN(monto: number): string {
  return mxn.format(monto);
}

/** Redondea a centavos para evitar errores de punto flotante (0.1 + 0.2). */
export function redondear(monto: number): number {
  return Math.round(monto * 100) / 100;
}
