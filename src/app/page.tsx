"use client";

import { CheckCircle2, Loader2, PackageSearch, RefreshCw, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Carrito } from "@/components/pos/Carrito";
import { CorteCaja } from "@/components/pos/CorteCaja";
import { Encabezado } from "@/components/pos/Encabezado";
import { GridProductos } from "@/components/pos/GridProductos";
import { ModalAperturaTurno } from "@/components/pos/ModalAperturaTurno";
import { ModalCobro } from "@/components/pos/ModalCobro";
import { ModalMovimiento } from "@/components/pos/ModalMovimiento";
import { NavLateral } from "@/components/nav/NavLateral";
import { useRequiereSesion } from "@/components/session/SessionProvider";
import { useCarrito } from "@/hooks/useCarrito";
import { ETIQUETA_MOVIMIENTO } from "@/lib/corte";
import { abrirTurno, buscarTurnoAbierto, cargarProductosActivos, registrarMovimiento, registrarVenta } from "@/lib/datos";
import { formatMXN } from "@/lib/format";
import { veCifrasDelCorte } from "@/lib/roles";
import type { MetodoPago, Producto, TipoMovimiento } from "@/types/pos";

/** Minúsculas y sin acentos, para que "cafe" encuentre "Café". */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const FONDO_FIJO_SUGERIDO = 350;

async function lanzarConfeti() {
  const confetti = (await import("canvas-confetti")).default;
  confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
}

export default function CobroPage() {
  const router = useRouter();
  const { usuario, listo, turno, establecerTurno, cerrarSesion } = useRequiereSesion();
  const carrito = useCarrito();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [registrandoMovimiento, setRegistrandoMovimiento] = useState(false);
  const [enCorte, setEnCorte] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [estadoTurno, setEstadoTurno] = useState<"buscando" | "listo" | "sin-turno" | "error">("buscando");


  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setProductos(await cargarProductosActivos());
    } catch (e) {
      console.error(e);
      setErrorCarga("No se pudieron cargar los productos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (usuario) cargar();
  }, [usuario, cargar]);

  // Al entrar: toma el turno ABIERTO del usuario o su tienda; si no hay, pide abrir uno.
  const resolverTurno = useCallback(async () => {
    if (!usuario) return;
    setEstadoTurno("buscando");
    try {
      const abierto = await buscarTurnoAbierto(usuario);
      establecerTurno(abierto);
      setEstadoTurno(abierto ? "listo" : "sin-turno");
    } catch (e) {
      console.error(e);
      setEstadoTurno("error");
    }
  }, [usuario, establecerTurno]);

  useEffect(() => {
    resolverTurno();
  }, [resolverTurno]);

  const confirmarApertura = async (fondoInicial: number) => {
    if (!usuario) return;
    establecerTurno(await abrirTurno(usuario, fondoInicial));
    setEstadoTurno("listo");
    setAviso(`Turno abierto con fondo de ${formatMXN(fondoInicial)}`);
  };

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const termino = normalizar(busqueda);
  const visibles = useMemo(() => {
    if (!termino) return productos.filter((p) => p.es_favorito);
    return productos.filter(
      (p) => normalizar(p.nombre).includes(termino) || (p.codigo_barras ?? "").toLowerCase().includes(termino),
    );
  }, [productos, termino]);

  // Enter en el buscador: coincidencia exacta de código (lector de barras) o único resultado.
  const agregarDesdeBusqueda = () => {
    if (!termino) return;
    const porCodigo = productos.find((p) => p.codigo_barras?.toLowerCase() === termino);
    const elegido = porCodigo ?? (visibles.length === 1 ? visibles[0] : undefined);
    if (elegido) {
      carrito.agregar(elegido);
      setBusqueda("");
    }
  };

  const cambiarUsuario = () => {
    cerrarSesion();
    router.replace("/login");
  };

  const confirmarVenta = async (metodo: MetodoPago, pagaCon: number) => {
    if (!usuario) return;
    if (!turno) throw new Error("No hay un turno abierto. Cambia de usuario y vuelve a entrar para abrir uno.");
    await registrarVenta({ usuario, turnoId: turno.id, items: carrito.items, total: carrito.total, metodo, pagaCon });
    const cambio = pagaCon - carrito.total;
    setCobrando(false);
    carrito.vaciar();
    setAviso(metodo === "efectivo" && cambio > 0 ? `Venta registrada · Cambio ${formatMXN(cambio)}` : "Venta registrada");
    lanzarConfeti();
  };

  const confirmarMovimiento = async (tipo: TipoMovimiento, monto: number, concepto: string) => {
    if (!usuario || !turno) throw new Error("No hay un turno abierto.");
    await registrarMovimiento({ turnoId: turno.id, usuarioId: usuario.id, tipo, monto, concepto });
    setRegistrandoMovimiento(false);
    setAviso(`Movimiento registrado: ${ETIQUETA_MOVIMIENTO[tipo]} · ${formatMXN(monto)}`);
  };

  // Tras el corte el turno queda CERRADO: se sale para que el siguiente cajero abra el suyo.
  const terminarCorte = () => {
    setEnCorte(false);
    carrito.vaciar();
    cambiarUsuario();
  };

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
      <div className="flex min-w-0 flex-1 flex-col">
        <Encabezado
          turno={turno}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          onEnterBusqueda={agregarDesdeBusqueda}
          onMovimiento={() => setRegistrandoMovimiento(true)}
          onCorte={() => setEnCorte(true)}
        />

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain p-6">
            {cargando ? (
              <div className="grid h-full place-items-center">
                <Loader2 className="size-10 animate-spin text-emerald-600" aria-label="Cargando productos" />
              </div>
            ) : errorCarga ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
                <p className="text-lg">{errorCarga}</p>
                <button
                  type="button"
                  onClick={cargar}
                  className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-900 px-6 text-lg font-medium text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  <RefreshCw className="size-5" aria-hidden />
                  Reintentar
                </button>
              </div>
            ) : (
              <>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-600 dark:text-slate-300">
                  {termino ? (
                    `${visibles.length} resultado${visibles.length === 1 ? "" : "s"}`
                  ) : (
                    <>
                      <Star className="size-5 fill-amber-400 text-amber-400" aria-hidden />
                      Favoritos
                    </>
                  )}
                </h2>
                {visibles.length > 0 ? (
                  <GridProductos productos={visibles} onAgregar={carrito.agregar} />
                ) : (
                  <div className="flex flex-col items-center gap-3 py-24 text-slate-400">
                    <PackageSearch className="size-14" aria-hidden />
                    <p className="text-lg">
                      {termino
                        ? "Ningún producto coincide con la búsqueda"
                        : productos.length === 0
                          ? "No hay productos activos"
                          : "No hay favoritos. Usa el buscador para encontrar productos."}
                    </p>
                  </div>
                )}
              </>
            )}
          </main>

          <Carrito
            items={carrito.items}
            total={carrito.total}
            piezas={carrito.piezas}
            onCambiarCantidad={carrito.cambiarCantidad}
            onVaciar={carrito.vaciar}
            onCobrar={() => setCobrando(true)}
          />
        </div>
      </div>

      {estadoTurno === "sin-turno" && (
        <ModalAperturaTurno
          nombreUsuario={usuario.nombre}
          fondoSugerido={FONDO_FIJO_SUGERIDO}
          onAbrir={confirmarApertura}
          onCambiarUsuario={cambiarUsuario}
        />
      )}

      {estadoTurno === "error" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-6">
          <div role="alertdialog" className="flex max-w-md flex-col items-center gap-5 rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-slate-900">
            <p className="text-lg">No se pudo consultar el turno. Revisa la conexión.</p>
            <button
              type="button"
              onClick={resolverTurno}
              className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-900 px-6 text-lg font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            >
              <RefreshCw className="size-5" aria-hidden />
              Reintentar
            </button>
          </div>
        </div>
      )}

      {cobrando && (
        <ModalCobro total={carrito.total} onCerrar={() => setCobrando(false)} onConfirmar={confirmarVenta} />
      )}

      {registrandoMovimiento && (
        <ModalMovimiento onCerrar={() => setRegistrandoMovimiento(false)} onRegistrar={confirmarMovimiento} />
      )}

      {enCorte && turno && (
        <CorteCaja
          turno={turno}
          cajero={usuario.nombre}
          ciego={!veCifrasDelCorte(usuario.rol)}
          onCancelar={() => setEnCorte(false)}
          onTerminar={terminarCorte}
        />
      )}

      {aviso && (
        <div
          role="status"
          className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-900 px-6 py-4 text-lg font-medium text-white shadow-xl"
        >
          <CheckCircle2 className="size-6 text-emerald-400" aria-hidden />
          {aviso}
        </div>
      )}
    </div>
  );
}
