"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Usuario } from "@/types/pos";

const STORAGE_KEY = "pos.usuario";

interface SessionContextValue {
  usuario: Usuario | null;
  /** false hasta leer localStorage; evita redirigir antes de saber si hay sesión. */
  listo: boolean;
  iniciarSesion: (usuario: Usuario) => void;
  cerrarSesion: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function leerUsuario(): Usuario | null {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY);
    return guardado ? (JSON.parse(guardado) as Usuario) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setUsuario(leerUsuario());
    setListo(true);
  }, []);

  const iniciarSesion = useCallback((nuevo: Usuario) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevo));
    } catch {
      // Sin almacenamiento la sesión dura solo mientras la pestaña esté abierta.
    }
    setUsuario(nuevo);
  }, []);

  const cerrarSesion = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setUsuario(null);
  }, []);

  return (
    <SessionContext.Provider value={{ usuario, listo, iniciarSesion, cerrarSesion }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
