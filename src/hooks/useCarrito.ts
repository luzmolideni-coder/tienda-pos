"use client";

import { useCallback, useMemo, useState } from "react";
import { redondear } from "@/lib/format";
import type { ItemCarrito, Producto } from "@/types/pos";

export function useCarrito() {
  const [items, setItems] = useState<ItemCarrito[]>([]);

  const agregar = useCallback((producto: Producto) => {
    setItems((actual) => {
      const existente = actual.find((i) => i.producto.id === producto.id);
      if (existente) {
        return actual.map((i) => (i === existente ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [...actual, { producto, cantidad: 1 }];
    });
  }, []);

  /** Suma o resta unidades; al llegar a 0 la partida se elimina. */
  const cambiarCantidad = useCallback((productoId: Producto["id"], delta: number) => {
    setItems((actual) =>
      actual
        .map((i) => (i.producto.id === productoId ? { ...i, cantidad: i.cantidad + delta } : i))
        .filter((i) => i.cantidad > 0),
    );
  }, []);

  const quitar = useCallback((productoId: Producto["id"]) => {
    setItems((actual) => actual.filter((i) => i.producto.id !== productoId));
  }, []);

  const vaciar = useCallback(() => setItems([]), []);

  const total = useMemo(
    () => redondear(items.reduce((suma, i) => suma + i.producto.precio_venta * i.cantidad, 0)),
    [items],
  );
  const piezas = useMemo(() => items.reduce((suma, i) => suma + i.cantidad, 0), [items]);

  return { items, agregar, cambiarCantidad, quitar, vaciar, total, piezas };
}
