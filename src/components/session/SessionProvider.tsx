"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { cerrarSesionEnBase, validarSesion } from "@/lib/datos";
import { EVENTO_SESION_INVALIDA } from "@/lib/supabase/rpc";
import type { Turno, Usuario } from "@/types/pos";

const STORAGE_KEY = "pos.usuario";

interface SessionContextValue {
  usuario: Usuario | null;
  /**
   * false hasta comprobar con la base el token guardado. Mientras tanto ninguna pantalla interna
   * se muestra ni consulta datos: sin token válido se va directo al PIN.
   */
  listo: boolean;
  /** Por qué se descartó la sesión guardada (para mostrarlo en la pantalla de PIN). */
  avisoSesion: string | null;
  /**
   * Turno al que se asocian las ventas. No se guarda en localStorage: se vuelve a consultar
   * al entrar al POS para no vender sobre un turno que se cerró en otro dispositivo.
   */
  turno: Turno | null;
  establecerTurno: (turno: Turno | null) => void;
  iniciarSesion: (usuario: Usuario) => void;
  cerrarSesion: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function leerUsuario(): Usuario | null {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY);
    const usuario = guardado ? (JSON.parse(guardado) as Usuario) : null;
    // Sesiones guardadas antes de los tokens no sirven: hay que volver a entrar con PIN.
    return usuario?.token ? usuario : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [listo, setListo] = useState(false);
  const [turno, setTurno] = useState<Turno | null>(null);
  const [avisoSesion, setAvisoSesion] = useState<string | null>(null);

  useEffect(() => {
    const guardado = leerUsuario();
    if (!guardado) {
      setListo(true);
      return;
    }
    let vigente = true;
    validarSesion(guardado.token)
      .then((actual) => {
        if (!vigente) return;
        // Rol y tienda vienen de la base, no de lo que quedó guardado en el navegador.
        const usuarioActual = { ...actual, token: guardado.token };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(usuarioActual));
        } catch {}
        setUsuario(usuarioActual);
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
        setAvisoSesion(e instanceof Error && e.message ? e.message : "No se pudo verificar tu sesión. Vuelve a entrar con tu PIN.");
      })
      .finally(() => vigente && setListo(true));
    return () => {
      vigente = false;
    };
  }, []);

  const iniciarSesion = useCallback((nuevo: Usuario) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevo));
    } catch {
      // Sin almacenamiento la sesión dura solo mientras la pestaña esté abierta.
    }
    setAvisoSesion(null);
    setUsuario(nuevo);
  }, []);

  const cerrarSesion = useCallback(() => {
    // Invalida el token en la base; si falla (sin red) igual expira solo.
    const token = leerUsuario()?.token;
    if (token) cerrarSesionEnBase(token).catch(() => {});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setUsuario(null);
    setTurno(null);
  }, []);

  // La base rechazó el token (expiró o se cerró en otro lado): se sale y useRequiereSesion manda al PIN.
  useEffect(() => {
    const alInvalidar = () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      setAvisoSesion("Tu sesión expiró. Vuelve a entrar con tu PIN.");
      setUsuario(null);
      setTurno(null);
    };
    window.addEventListener(EVENTO_SESION_INVALIDA, alInvalidar);
    return () => window.removeEventListener(EVENTO_SESION_INVALIDA, alInvalidar);
  }, []);

  return (
    <SessionContext.Provider value={{ usuario, listo, avisoSesion, turno, establecerTurno: setTurno, iniciarSesion, cerrarSesion }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}

/** Para pantallas internas: manda al PIN si no hay sesión. Devuelve la sesión. */
export function useRequiereSesion(): SessionContextValue {
  const sesion = useSession();
  const router = useRouter();
  useEffect(() => {
    if (sesion.listo && !sesion.usuario) router.replace("/login");
  }, [sesion.listo, sesion.usuario, router]);
  return sesion;
}
