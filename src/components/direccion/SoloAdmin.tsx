"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/session/SessionProvider";
import { esAdmin } from "@/lib/roles";

/**
 * Oculta la Vista Dirección a quien no es ADMIN. Es una barrera de interfaz: la protección real
 * de los datos depende de las políticas RLS en Supabase.
 */
export function SoloAdmin({ children }: { children: React.ReactNode }) {
  const { usuario } = useSession();
  if (usuario && esAdmin(usuario.rol)) return <>{children}</>;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <ShieldAlert className="size-14 text-slate-400" aria-hidden />
      <p className="text-xl font-semibold">Esta sección es solo para Dirección</p>
      <Link
        href="/"
        className="touch-target pressable grid place-items-center rounded-2xl bg-slate-900 px-6 text-lg font-medium text-white dark:bg-slate-100 dark:text-slate-900"
      >
        Volver a vender
      </Link>
    </div>
  );
}
