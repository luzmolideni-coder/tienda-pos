"use client";

import { Loader2 } from "lucide-react";
import { NavLateral } from "@/components/nav/NavLateral";
import { useRequiereSesion } from "@/components/session/SessionProvider";

/** Estructura de las pantallas de Operación: riel de navegación + contenido, solo con sesión. */
export function MarcoOperacion({ children }: { children: React.ReactNode }) {
  const { usuario, listo } = useRequiereSesion();

  if (!listo || !usuario) {
    return (
      <div className="grid h-dvh place-items-center">
        <Loader2 className="size-10 animate-spin text-emerald-600" aria-label="Cargando" />
      </div>
    );
  }

  return (
    <div className="safe-area flex h-dvh">
      <NavLateral />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
