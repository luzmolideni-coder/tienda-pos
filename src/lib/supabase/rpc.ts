import { getSupabase } from "@/lib/supabase/client";

/** Lo emite rpcSeguro cuando la base rechaza el token; SessionProvider cierra la sesión al oírlo. */
export const EVENTO_SESION_INVALIDA = "pos:sesion-invalida";

/** Error con un mensaje ya listo para mostrarse en pantalla. */
export class ErrorPos extends Error {}

const MENSAJES: Record<string, string> = {
  SESION_INVALIDA: "Tu sesión expiró. Vuelve a entrar con tu PIN.",
  SOLO_ADMIN: "Solo Dirección puede hacer esto.",
  DEMASIADOS_INTENTOS: "Demasiados PIN incorrectos. Espera unos minutos e intenta de nuevo.",
};

/**
 * Llama una función de Supabase. Los errores de seguridad conocidos (los que lanza
 * supabase/seguridad.sql) se traducen a un mensaje para la pantalla.
 */
export async function rpcSeguro<T = unknown>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(nombre, args);
  if (error) {
    const clave = Object.keys(MENSAJES).find((k) => error.message?.includes(k));
    if (clave === "SESION_INVALIDA" && typeof window !== "undefined") {
      window.dispatchEvent(new Event(EVENTO_SESION_INVALIDA));
    }
    if (clave) throw new ErrorPos(MENSAJES[clave]);
    if (error.code === "PGRST202") {
      throw new ErrorPos(`Falta la función ${nombre} en Supabase: ejecuta supabase/seguridad.sql.`);
    }
    throw error;
  }
  return data as T;
}
