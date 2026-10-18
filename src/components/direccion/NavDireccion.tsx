"use client";

import { ClipboardCheck, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/direccion", etiqueta: "Panel", Icono: LayoutDashboard },
  { href: "/direccion/pedidos", etiqueta: "Aprobación de pedidos", Icono: ClipboardCheck },
];

export function NavDireccion() {
  const ruta = usePathname();
  return (
    <nav aria-label="Dirección" className="flex gap-2 border-b border-slate-200 bg-white px-6 pt-3 dark:border-slate-800 dark:bg-slate-900">
      {PESTANAS.map(({ href, etiqueta, Icono }) => {
        const activa = ruta === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={activa ? "page" : undefined}
            className={`flex h-12 items-center gap-2 rounded-t-xl border-b-2 px-4 font-medium ${
              activa ? "border-emerald-600 text-emerald-700 dark:text-emerald-400" : "border-transparent text-slate-500"
            }`}
          >
            <Icono className="size-5" aria-hidden />
            {etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
