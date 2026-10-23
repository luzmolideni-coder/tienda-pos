"use client";

import { ClipboardList, Landmark, LogOut, PackageCheck, ScanBarcode, ShoppingCart, Store } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/components/session/SessionProvider";
import { esAdmin } from "@/lib/roles";

const SECCIONES = [
  { href: "/", etiqueta: "Vender", Icono: ShoppingCart, soloAdmin: false },
  { href: "/operacion/pedidos", etiqueta: "Pedidos", Icono: ClipboardList, soloAdmin: false },
  { href: "/operacion/compras", etiqueta: "Compras", Icono: PackageCheck, soloAdmin: false },
  { href: "/operacion/inventario", etiqueta: "Inventario", Icono: ScanBarcode, soloAdmin: false },
  { href: "/direccion", etiqueta: "Dirección", Icono: Landmark, soloAdmin: true },
];

/** Riel de navegación a la izquierda: ocupa poco ancho y deja botones grandes para el dedo. */
export function NavLateral() {
  const ruta = usePathname();
  const router = useRouter();
  const { usuario, cerrarSesion } = useSession();

  const cambiarUsuario = () => {
    cerrarSesion();
    router.replace("/login");
  };

  return (
    <nav
      aria-label="Secciones"
      className="flex w-24 shrink-0 flex-col items-center gap-2 border-r border-slate-200 bg-white py-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <span className="mb-2 grid size-12 place-items-center rounded-2xl bg-emerald-600 text-white">
        <Store className="size-7" aria-hidden />
      </span>
      {SECCIONES.filter((s) => !s.soloAdmin || (usuario && esAdmin(usuario.rol))).map(({ href, etiqueta, Icono, soloAdmin }) => {
        const activa = href === "/" ? ruta === "/" : ruta.startsWith(href);
        return (
          <Fragment key={href}>
            {soloAdmin && <hr className="my-1 w-14 border-slate-200 dark:border-slate-700" />}
            <Link
              href={href}
              aria-current={activa ? "page" : undefined}
              className={`pressable flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-2xl text-sm font-medium ${
                activa
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <Icono className="size-7" aria-hidden />
              {etiqueta}
            </Link>
          </Fragment>
        );
      })}

      {usuario && (
        <div className="mt-auto flex w-full flex-col items-center gap-2 px-2">
          <div className="w-full text-center leading-tight">
            <p className="line-clamp-2 text-sm font-semibold">{usuario.nombre}</p>
            <p className="text-xs text-slate-500">{usuario.rol}</p>
          </div>
          <button
            type="button"
            onClick={cambiarUsuario}
            className="pressable flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-2xl bg-slate-100 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            <LogOut className="size-5" aria-hidden />
            Cambiar usuario
          </button>
        </div>
      )}
    </nav>
  );
}
