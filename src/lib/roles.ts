/**
 * Solo ADMIN ve las cifras del corte (esperado, diferencia, depósito).
 * Cualquier otro rol, incluido OPERACION, hace corte ciego: así un rol nuevo no ve cifras por omisión.
 */
export function veCifrasDelCorte(rol: string): boolean {
  return rol.trim().toUpperCase() === "ADMIN";
}
