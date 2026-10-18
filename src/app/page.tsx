import { PackageSearch, ScanBarcode, Search, ShoppingCart } from "lucide-react";

// Pantalla base del POS: catálogo a la izquierda, ticket a la derecha (pensada para tablet horizontal).
export default function PosPage() {
  return (
    <div className="safe-area flex h-dvh flex-col">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-emerald-600 text-white">
            <ShoppingCart className="size-6" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold">Tienda POS</h1>
        </div>

        <label className="relative ml-auto flex-1 max-w-xl">
          <span className="sr-only">Buscar producto</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            placeholder="Buscar producto o código"
            className="touch-target w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>

        <button
          type="button"
          className="touch-target pressable flex items-center gap-2 rounded-2xl bg-slate-900 px-5 text-lg font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          <ScanBarcode className="size-6" aria-hidden />
          Escanear
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-slate-500">
          <PackageSearch className="size-16" aria-hidden />
          <p className="text-lg">Aquí aparecerá el catálogo de productos.</p>
        </main>

        <aside className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <h2 className="border-b border-slate-200 px-6 py-4 text-lg font-semibold dark:border-slate-800">Venta actual</h2>
          <div className="flex flex-1 items-center justify-center p-6 text-slate-500">
            <p>Sin productos</p>
          </div>
          <div className="space-y-4 border-t border-slate-200 p-6 dark:border-slate-800">
            <div className="flex items-baseline justify-between">
              <span className="text-slate-500">Total</span>
              <span className="text-3xl font-bold tabular-nums">$0.00</span>
            </div>
            <button
              type="button"
              disabled
              className="touch-target pressable w-full rounded-2xl bg-emerald-600 text-xl font-semibold text-white disabled:opacity-40"
            >
              Cobrar
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
