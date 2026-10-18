"use client";

import { Loader2, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PinPad } from "@/components/login/PinPad";
import { useSession } from "@/components/session/SessionProvider";
import { buscarUsuarioPorPin } from "@/lib/datos";
import { ErrorPos } from "@/lib/supabase/rpc";

const LARGO_MAXIMO_PIN = 6;

export default function LoginPage() {
  const router = useRouter();
  const { usuario, listo, iniciarSesion } = useSession();
  const [pin, setPin] = useState("");
  const [validando, setValidando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (listo && usuario) router.replace("/");
  }, [listo, usuario, router]);

  // Actualizaciones funcionales: con toques rápidos no se pierde ningún dígito.
  const agregarDigito = useCallback((digito: string) => {
    setError(null);
    setPin((actual) => (actual.length < LARGO_MAXIMO_PIN ? actual + digito : actual));
  }, []);

  const borrarDigito = useCallback(() => {
    setError(null);
    setPin((actual) => actual.slice(0, -1));
  }, []);

  const ingresar = useCallback(async () => {
    if (!pin || validando) return;
    setValidando(true);
    setError(null);
    try {
      const encontrado = await buscarUsuarioPorPin(pin);
      if (encontrado) {
        iniciarSesion(encontrado);
        router.replace("/");
      } else {
        setError("PIN incorrecto");
        setPin("");
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof ErrorPos ? e.message : "No se pudo conectar. Revisa tu conexión.");
    } finally {
      setValidando(false);
    }
  }, [pin, validando, iniciarSesion, router]);

  return (
    <main className="safe-area flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-16 place-items-center rounded-2xl bg-emerald-600 text-white">
          <ShoppingCart className="size-9" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">Tienda POS</h1>
        <p className="text-slate-500">Ingresa tu PIN</p>
      </div>

      <div className="flex h-8 items-center gap-4" aria-live="polite" aria-label={`${pin.length} dígitos ingresados`}>
        {validando ? (
          <Loader2 className="size-7 animate-spin text-emerald-600" aria-hidden />
        ) : (
          Array.from({ length: LARGO_MAXIMO_PIN }, (_, i) => (
            <span
              key={i}
              className={`size-4 rounded-full transition-colors ${
                i < pin.length ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"
              } ${error ? "bg-red-500" : ""}`}
            />
          ))
        )}
      </div>

      <p role="alert" className="h-6 font-medium text-red-600">
        {error}
      </p>

      <PinPad
        pin={pin}
        largoMaximo={LARGO_MAXIMO_PIN}
        deshabilitado={validando}
        onDigito={agregarDigito}
        onBorrar={borrarDigito}
        onIngresar={ingresar}
      />
    </main>
  );
}
