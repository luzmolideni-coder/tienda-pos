"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiltrosPanel } from "@/components/direccion/FiltrosPanel";
import { HistorialCortes } from "@/components/direccion/HistorialCortes";
import { Seccion } from "@/components/direccion/Seccion";
import { SemaforoInventario } from "@/components/direccion/SemaforoInventario";
import { TarjetasKpi } from "@/components/direccion/TarjetasKpi";
import { useSession } from "@/components/session/SessionProvider";
import {
  cargarCortes,
  cargarInventario,
  cargarKpis,
  cargarTiendas,
  isoLocal,
  rangoDe,
  rangoPersonalizado,
  type FiltroTienda,
  type Periodo,
  type Rango,
  type Tienda,
} from "@/lib/panel";

function mensajeDe(e: unknown): string {
  return e && typeof e === "object" && "message" in e ? String(e.message) : "";
}

/**
 * Ejecuta una consulta cuando cambian sus dependencias. Si llega la respuesta de una consulta
 * anterior (el usuario cambió el filtro mientras cargaba), se descarta.
 */
function useConsulta<T>(consulta: (() => Promise<T>) | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const turno = useRef(0);

  const ejecutar = useCallback(async () => {
    if (!consulta) return;
    const mio = ++turno.current;
    setCargando(true);
    setError(null);
    try {
      const resultado = await consulta();
      if (mio === turno.current) setDatos(resultado);
    } catch (e) {
      console.error(e);
      if (mio === turno.current) setError(`No se pudo cargar. ${mensajeDe(e)}`.trim());
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, [consulta]);

  useEffect(() => {
    ejecutar();
  }, [ejecutar]);

  return { datos, cargando, error, recargar: ejecutar };
}

const fechaCorta = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });

export default function PanelDireccionPage() {
  const { usuario } = useSession();
  const [tiendas, setTiendas] = useState<Tienda[] | null>(null);
  const [errorTiendas, setErrorTiendas] = useState<string | null>(null);
  const [tienda, setTienda] = useState<FiltroTienda>(null);
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const hoy = isoLocal(new Date());
  const [desde, setDesde] = useState(hoy.slice(0, 8) + "01");
  const [hasta, setHasta] = useState(hoy);

  const cargarListaTiendas = useCallback(async () => {
    setErrorTiendas(null);
    try {
      setTiendas(await cargarTiendas());
    } catch (e) {
      console.error(e);
      setErrorTiendas(`No se pudieron cargar las tiendas. ${mensajeDe(e)}`.trim());
    }
  }, []);

  useEffect(() => {
    cargarListaTiendas();
  }, [cargarListaTiendas]);

  // Con fechas personalizadas incompletas no se consulta nada (rango null).
  const rango: Rango | null = useMemo(() => {
    if (periodo !== "personalizado") return rangoDe(periodo);
    return desde && hasta ? rangoPersonalizado(desde, hasta) : null;
  }, [periodo, desde, hasta]);

  const consultaKpis = useMemo(() => (rango ? () => cargarKpis(tienda, rango) : null), [tienda, rango]);
  const consultaCortes = useMemo(() => (rango ? () => cargarCortes(tienda, rango) : null), [tienda, rango]);
  const consultaInventario = useMemo(() => (tiendas ? () => cargarInventario(tienda, tiendas) : null), [tienda, tiendas]);

  const kpis = useConsulta(consultaKpis);
  const cortes = useConsulta(consultaCortes);
  const inventario = useConsulta(consultaInventario);

  const variasTiendas = tienda === null && (tiendas?.length ?? 0) > 1;
  const nombres = useMemo(() => new Map(usuario ? [[String(usuario.id), usuario.nombre]] : []), [usuario]);
  const descripcionRango = rango
    ? `${fechaCorta.format(rango.desde)} – ${fechaCorta.format(new Date(rango.hasta.getTime() - 1))}`
    : "Elige ambas fechas";

  if (errorTiendas) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-500">
        <p>{errorTiendas}</p>
        <button
          type="button"
          onClick={cargarListaTiendas}
          className="touch-target pressable rounded-2xl bg-slate-900 px-6 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <>
      <FiltrosPanel
        tiendas={tiendas ?? []}
        tienda={tienda}
        onTienda={setTienda}
        periodo={periodo}
        onPeriodo={setPeriodo}
        desde={desde}
        hasta={hasta}
        onDesde={setDesde}
        onHasta={setHasta}
      />

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-slate-100 p-6 dark:bg-slate-950">
        <Seccion
          titulo="Indicadores"
          extra={<span className="text-slate-500">{descripcionRango}</span>}
          cargando={kpis.cargando || !rango}
          error={kpis.error}
          onReintentar={kpis.recargar}
        >
          {kpis.datos && <TarjetasKpi kpis={kpis.datos} />}
        </Seccion>

        <Seccion
          titulo="Semáforo de inventario"
          extra={<span className="text-slate-500">Existencias actuales</span>}
          cargando={inventario.cargando}
          error={inventario.error}
          onReintentar={inventario.recargar}
        >
          {inventario.datos && <SemaforoInventario filas={inventario.datos} variasTiendas={variasTiendas} />}
        </Seccion>

        <Seccion
          titulo="Historial de cortes"
          extra={<span className="text-slate-500">{descripcionRango}</span>}
          cargando={cortes.cargando || !rango}
          error={cortes.error}
          onReintentar={cortes.recargar}
        >
          {cortes.datos && <HistorialCortes cortes={cortes.datos} variasTiendas={variasTiendas} nombres={nombres} />}
        </Seccion>
      </div>
    </>
  );
}
