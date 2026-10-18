"use client";

import { CheckCircle2, Download, Loader2, LogOut, Printer, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { aplicarTecla, montoDeTexto, TecladoMonto, type Tecla } from "@/components/pos/TecladoMonto";
import { calcularArqueo, textoComprobante, textoComprobanteEntrega, type CifrasTurno } from "@/lib/corte";
import { cargarCifrasTurno, cerrarTurno, cerrarTurnoCiego } from "@/lib/datos";
import { formatMXN } from "@/lib/format";
import type { Turno } from "@/types/pos";

interface CorteCajaProps {
  turno: Turno;
  cajero: string;
  /** Corte ciego: no se descargan ni muestran cifras; solo se captura el efectivo contado. */
  ciego: boolean;
  onCancelar: () => void;
  /** Se llama después de cerrar el turno, cuando el usuario sale del resumen. */
  onTerminar: () => void;
}

type Fase =
  | { tipo: "ciego" }
  | { tipo: "cargando" } | { tipo: "error"; mensaje: string } | { tipo: "arqueo"; cifras: CifrasTurno } | { tipo: "resumen"; comprobante: string };

function Fila({ etiqueta, monto, signo, fuerte }: { etiqueta: string; monto: number; signo?: "+" | "−" | "="; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between py-2 ${fuerte ? "border-t-2 border-slate-300 pt-3 text-xl font-bold dark:border-slate-600" : ""}`}>
      <span className={fuerte ? "" : "text-slate-600 dark:text-slate-300"}>
        {signo && <span className="mr-2 inline-block w-4 text-slate-400">{signo}</span>}
        {etiqueta}
      </span>
      <span className="tabular-nums">{formatMXN(monto)}</span>
    </div>
  );
}

function mensajeDe(e: unknown): string {
  return e && typeof e === "object" && "message" in e ? String(e.message) : "";
}

export function CorteCaja({ turno, cajero, ciego, onCancelar, onTerminar }: CorteCajaProps) {
  const [fase, setFase] = useState<Fase>(ciego ? { tipo: "ciego" } : { tipo: "cargando" });
  const [contadoTexto, setContadoTexto] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [errorCierre, setErrorCierre] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setFase({ tipo: "cargando" });
    try {
      setFase({ tipo: "arqueo", cifras: await cargarCifrasTurno(turno) });
    } catch (e) {
      console.error(e);
      setFase({ tipo: "error", mensaje: `No se pudieron calcular las cifras del turno. ${mensajeDe(e)}`.trim() });
    }
  }, [turno]);

  useEffect(() => {
    if (!ciego) cargar();
  }, [ciego, cargar]);

  const alTecla = useCallback((tecla: Tecla) => {
    setConfirmando(false);
    setContadoTexto((prev) => aplicarTecla(prev, tecla));
  }, []);

  const cifras = fase.tipo === "arqueo" ? fase.cifras : null;
  const capturado = contadoTexto !== "";
  const arqueo = cifras ? calcularArqueo(cifras, montoDeTexto(contadoTexto)) : null;

  const cerrar = async () => {
    if (!capturado || cerrando || (!ciego && (!cifras || !arqueo))) return;
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setCerrando(true);
    setErrorCierre(null);
    const apertura = new Date(turno.fecha_apertura);
    try {
      if (ciego) {
        const efectivoContado = montoDeTexto(contadoTexto);
        const cierre = await cerrarTurnoCiego(turno.id, efectivoContado);
        setFase({ tipo: "resumen", comprobante: textoComprobanteEntrega({ efectivoContado, cajero, apertura, cierre }) });
      } else if (cifras && arqueo) {
        const cierre = await cerrarTurno(turno.id, cifras, arqueo);
        setFase({ tipo: "resumen", comprobante: textoComprobante({ cifras, arqueo, cajero, apertura, cierre }) });
      }
    } catch (e) {
      console.error(e);
      setErrorCierre(`No se pudo cerrar el turno. ${mensajeDe(e)}`.trim());
      setConfirmando(false);
    } finally {
      setCerrando(false);
    }
  };

  const alertaError = errorCierre && (
    <p role="alert" className="rounded-xl bg-red-50 p-4 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
      {errorCierre}
    </p>
  );

  const botonCerrar = (
    <button
      type="button"
      disabled={!capturado || cerrando}
      onClick={cerrar}
      className={`pressable flex h-16 items-center justify-center gap-3 rounded-2xl text-xl font-semibold text-white disabled:opacity-40 ${
        confirmando ? "bg-red-600" : "bg-emerald-600"
      }`}
    >
      {cerrando && <Loader2 className="size-7 animate-spin" aria-hidden />}
      {cerrando
        ? "Cerrando turno…"
        : confirmando
          ? "Toca de nuevo para confirmar el cierre"
          : capturado
            ? "Cerrar turno"
            : "Captura el efectivo contado"}
    </button>
  );

  const descargar = (texto: string) => {
    const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `corte-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="safe-area fixed inset-0 z-50 flex flex-col bg-slate-100 dark:bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900 print:hidden">
        <h2 className="text-xl font-semibold">{fase.tipo === "resumen" ? "Corte realizado" : "Corte de caja"}</h2>
        {fase.tipo !== "resumen" && (
          <button
            type="button"
            onClick={onCancelar}
            disabled={cerrando}
            className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-100 px-4 font-medium dark:bg-slate-800"
          >
            <X className="size-5" aria-hidden />
            Volver a vender
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {fase.tipo === "cargando" && (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-10 animate-spin text-emerald-600" aria-label="Calculando corte" />
          </div>
        )}

        {fase.tipo === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-md text-lg">{fase.mensaje}</p>
            <button
              type="button"
              onClick={cargar}
              className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-900 px-6 text-lg font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            >
              <RefreshCw className="size-5" aria-hidden />
              Reintentar
            </button>
          </div>
        )}

        {fase.tipo === "ciego" && (
          <div className="mx-auto flex max-w-md flex-col gap-5 rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
            <div className="text-center">
              <p className="text-lg font-medium text-slate-600 dark:text-slate-300">Cuenta el efectivo en caja y captúralo</p>
              <p className={`mt-2 text-6xl font-bold tabular-nums ${capturado ? "" : "text-slate-300 dark:text-slate-600"}`}>
                {formatMXN(montoDeTexto(contadoTexto))}
              </p>
            </div>
            <TecladoMonto onTecla={alTecla} deshabilitado={cerrando} />
            {alertaError}
            {botonCerrar}
          </div>
        )}

        {cifras && arqueo && (
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6">
            <section className="flex flex-col gap-4">
              <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Efectivo del turno</h3>
                  <button
                    type="button"
                    onClick={cargar}
                    className="pressable flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-slate-500"
                  >
                    <RefreshCw className="size-4" aria-hidden />
                    Actualizar
                  </button>
                </div>
                <Fila etiqueta="Fondo inicial" monto={cifras.fondoInicial} />
                <Fila etiqueta="Ventas en efectivo" monto={cifras.ventasEfectivo} signo="+" />
                <Fila etiqueta="Entradas de efectivo" monto={cifras.entradas} signo="+" />
                <Fila etiqueta="Pagos a proveedores" monto={cifras.pagosProveedores} signo="−" />
                <Fila etiqueta="Gastos" monto={cifras.gastos} signo="−" />
                <Fila etiqueta="Efectivo esperado" monto={cifras.efectivoEsperado} signo="=" fuerte />
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
                <h3 className="mb-2 text-lg font-semibold">
                  Otros cobros <span className="font-normal text-slate-400">(no están en caja)</span>
                </h3>
                <Fila etiqueta="Tarjeta" monto={cifras.ventasTarjeta} />
                <Fila etiqueta="Transferencia" monto={cifras.ventasTransferencia} />
                <p className="pt-2 text-sm text-slate-500">
                  {cifras.numVentas} venta{cifras.numVentas === 1 ? "" : "s"} en el turno
                </p>
              </div>
            </section>

            <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm dark:bg-slate-900">
              <div>
                <p className="text-slate-500">Efectivo contado en caja</p>
                <p className={`text-5xl font-bold tabular-nums ${capturado ? "" : "text-slate-300 dark:text-slate-600"}`}>
                  {formatMXN(arqueo.efectivoContado)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`rounded-2xl p-4 ${
                    !capturado
                      ? "bg-slate-50 text-slate-400 dark:bg-slate-800"
                      : arqueo.diferencia < 0
                        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  }`}
                >
                  <p className="text-sm font-medium">
                    {!capturado ? "Diferencia" : arqueo.diferencia < 0 ? "Faltante" : arqueo.diferencia > 0 ? "Sobrante" : "Exacto"}
                  </p>
                  <p className="text-2xl font-bold tabular-nums">
                    {capturado && arqueo.diferencia < 0 ? "−" : ""}
                    {formatMXN(capturado ? Math.abs(arqueo.diferencia) : 0)}
                  </p>
                </div>
                <div className="rounded-2xl bg-sky-50 p-4 text-sky-900 dark:bg-sky-950 dark:text-sky-200">
                  <p className="text-sm font-medium">Depósito a caja fuerte</p>
                  <p className="text-2xl font-bold tabular-nums">{formatMXN(arqueo.deposito)}</p>
                  <p className="text-xs opacity-75">Se queda el fondo de {formatMXN(cifras.fondoInicial)}</p>
                </div>
              </div>

              <TecladoMonto onTecla={alTecla} deshabilitado={cerrando} />

              {alertaError}

              {botonCerrar}
            </section>
          </div>
        )}

        {fase.tipo === "resumen" && (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-6">
            <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-400 print:hidden">
              <CheckCircle2 className="size-8" aria-hidden />
              <p className="text-xl font-semibold">Turno cerrado correctamente</p>
            </div>
            <pre className="comprobante w-full overflow-x-auto rounded-2xl bg-white p-6 font-mono text-sm leading-relaxed shadow-sm dark:bg-slate-900">
              {fase.comprobante}
            </pre>
            <div className="grid w-full grid-cols-2 gap-3 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="touch-target pressable flex items-center justify-center gap-2 rounded-2xl bg-slate-900 text-lg font-medium text-white dark:bg-slate-100 dark:text-slate-900"
              >
                <Printer className="size-5" aria-hidden />
                Imprimir
              </button>
              <button
                type="button"
                onClick={() => descargar(fase.comprobante)}
                className="touch-target pressable flex items-center justify-center gap-2 rounded-2xl bg-slate-200 text-lg font-medium dark:bg-slate-800"
              >
                <Download className="size-5" aria-hidden />
                Descargar
              </button>
            </div>
            <button
              type="button"
              onClick={onTerminar}
              className="pressable flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-xl font-semibold text-white print:hidden"
            >
              <LogOut className="size-6" aria-hidden />
              Terminar y salir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
