import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Product } from "../../domain/types.js";
import { calculateVesFromUsd } from "../../domain/factories.js";
import { createDocument, getExchangeRate, listDocuments, updateDocument } from "../../lib/firestore.js";
import { PageHeader } from "../components/page-header";

type ProductFormState = {
  id: string | null;
  sku: string;
  name: string;
  flavor: string;
  presentation: string;
  minimumStock: string;
  currentStock: string;
  costUsd: string;
  priceUsd: string;
  yieldExpectedPercent: string;
  status: Product["status"];
};

const emptyProductForm: ProductFormState = {
  id: null,
  sku: "",
  name: "",
  flavor: "",
  presentation: "1Kg",
  minimumStock: "0",
  currentStock: "0",
  costUsd: "0",
  priceUsd: "0",
  yieldExpectedPercent: "65",
  status: "active"
};

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatVes(value: number) {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "VES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function mapProductToRow(id: string, product: Product) {
  const status =
    product.status === "inactive"
      ? "Inactivo"
      : product.stock.current === 0
        ? "Agotado"
        : product.stock.current <= product.stock.minimum
          ? "Critico"
          : "Saludable";

  return {
    id,
    sku: product.sku,
    flavor: product.flavor,
    presentation: product.presentation,
    product: product.name,
    stockKg: product.stock.current,
    minimumKg: product.stock.minimum,
    reservedKg: product.stock.reserved,
    availableKg: product.stock.available,
    costUsd: product.cost.amountUSD,
    costVes: product.cost.amountVES,
    priceUsd: product.price.saleUSD,
    priceVes: product.price.saleVES,
    yieldExpectedPercent: product.productionConfig.yieldExpectedPercent,
    status
  };
}

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado al consultar Firestore.";
}

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<ProductFormState>(emptyProductForm);

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => listDocuments("products")
  });

  const exchangeRateQuery = useQuery({
    queryKey: ["settings", "exchange-rate"],
    queryFn: getExchangeRate
  });

  const productDocuments = [...(productsQuery.data ?? [])].sort((left, right) =>
    left.data.name.localeCompare(right.data.name)
  );
  const stockRows = productDocuments.map(({ id, data }) => mapProductToRow(id, data));
  const totalStockKg = stockRows.reduce((sum, row) => sum + row.stockKg, 0);
  const criticalProducts = stockRows.filter((row) => row.stockKg <= row.minimumKg).length;
  const availableStockKg = stockRows.reduce((sum, row) => sum + row.availableKg, 0);
  const reservedStockKg = stockRows.reduce((sum, row) => sum + row.reservedKg, 0);
  const queryError = productsQuery.error ?? exchangeRateQuery.error;
  const exchangeRate = exchangeRateQuery.data?.rate ?? 0;

  const saveProductMutation = useMutation({
    mutationFn: async () => {
      if (!exchangeRate) {
        throw new Error("Necesitas una tasa activa para guardar productos.");
      }

      if (!formState.sku.trim() || !formState.name.trim()) {
        throw new Error("SKU y nombre son obligatorios.");
      }

      const existing = productDocuments.find((entry) => entry.id === formState.id)?.data;
      const now = new Date().toISOString();
      const productId = formState.id ?? `product_${Date.now()}`;
      const currentStock = Number(formState.currentStock) || 0;
      const minimumStock = Number(formState.minimumStock) || 0;
      const reservedStock = existing?.stock.reserved ?? 0;
      const costUsd = Number(formState.costUsd) || 0;
      const priceUsd = Number(formState.priceUsd) || 0;
      const payload: Product = {
        sku: formState.sku.trim().toUpperCase(),
        name: formState.name.trim(),
        category: "pulpa",
        flavor: formState.flavor.trim().toLowerCase(),
        unit: "kg",
        presentation: formState.presentation.trim(),
        stock: {
          current: currentStock,
          minimum: minimumStock,
          reserved: reservedStock,
          available: Number(Math.max(currentStock - reservedStock, 0).toFixed(2))
        },
        cost: {
          amountUSD: costUsd,
          amountVES: calculateVesFromUsd(costUsd, exchangeRate),
          exchangeRate,
          effectiveDate: now.slice(0, 10)
        },
        price: {
          saleUSD: priceUsd,
          saleVES: calculateVesFromUsd(priceUsd, exchangeRate)
        },
        productionConfig: {
          tracksBatch: true,
          yieldExpectedPercent: Number(formState.yieldExpectedPercent) || 65
        },
        status: formState.status,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };

      if (formState.id) {
        await updateDocument("products", productId, payload);
        return;
      }

      await createDocument("products", productId, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      setFormState(emptyProductForm);
    }
  });

  const toggleProductStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: Product["status"] }) => {
      await updateDocument("products", payload.id, {
        status: payload.status,
        updatedAt: new Date().toISOString()
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  });

  function loadProductIntoForm(productId: string) {
    const existing = productDocuments.find((entry) => entry.id === productId)?.data;

    if (!existing) {
      return;
    }

    setFormState({
      id: productId,
      sku: existing.sku,
      name: existing.name,
      flavor: existing.flavor,
      presentation: existing.presentation,
      minimumStock: String(existing.stock.minimum),
      currentStock: String(existing.stock.current),
      costUsd: String(existing.cost.amountUSD),
      priceUsd: String(existing.price.saleUSD),
      yieldExpectedPercent: String(existing.productionConfig.yieldExpectedPercent),
      status: existing.status
    });
  }

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <div className="floating-orb left-[-14px] top-10 h-20 w-20 bg-[rgba(19,105,79,0.14)]" />
        <div className="relative grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <PageHeader
              eyebrow="Inventario"
              title="Stock con lectura visual de salud y rotacion"
              description="Ahora puedes dar de alta productos, editar costo y precio, y activar o inactivar referencias desde la interfaz."
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Stock total", value: `${totalStockKg} Kg`, tone: "bg-[var(--color-brand)] text-white" },
                { label: "Disponible", value: `${availableStockKg} Kg`, tone: "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]" },
                { label: "Criticos", value: `${criticalProducts}`, tone: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" }
              ].map((item, index) => (
                <div
                  key={item.label}
                  className={`reveal rounded-[26px] px-4 py-4 ${item.tone} reveal-delay-${index + 1}`}
                >
                  <p className="text-[11px] uppercase tracking-[0.24em] opacity-75">{item.label}</p>
                  <p className="mt-3 font-display text-3xl font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <article className="panel-strong soft-grid reveal reveal-delay-2 rounded-[30px] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Radar de inventario
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
              Riesgo operativo
            </h2>
            <div className="mt-5 space-y-4">
              {[
                ["Disponibilidad real", `${availableStockKg} Kg`, Math.min(availableStockKg, 100)],
                ["Reservado", `${reservedStockKg} Kg`, Math.min(reservedStockKg, 100)],
                ["Tasa activa", exchangeRate > 0 ? exchangeRate.toFixed(2) : "--", exchangeRate > 0 ? 60 : 0]
              ].map(([label, value, progress]) => (
                <div key={label} className="rounded-[24px] bg-white/80 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-[var(--color-ink-soft)]">{label}</p>
                    <span className="text-sm font-semibold text-[var(--color-ink)]">{value}</span>
                  </div>
                  <div className="progress-rail mt-3">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      {queryError ? (
        <section className="panel-strong reveal rounded-[32px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-danger)]">
            No se pudo cargar el inventario
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
            Firestore respondio con error
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            {getFriendlyErrorMessage(queryError)}
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <article className="panel-strong reveal reveal-delay-1 rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                Maestro de productos
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                {formState.id ? "Editar producto" : "Nuevo producto"}
              </h2>
            </div>
            {formState.id ? (
              <button
                className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)]"
                onClick={() => setFormState(emptyProductForm)}
                type="button"
              >
                Limpiar
              </button>
            ) : null}
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveProductMutation.mutateAsync();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">SKU</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) => setFormState((current) => ({ ...current, sku: event.target.value }))}
                  value={formState.sku}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Nombre</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                  value={formState.name}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Sabor</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) => setFormState((current) => ({ ...current, flavor: event.target.value }))}
                  value={formState.flavor}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Presentacion</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, presentation: event.target.value }))
                  }
                  value={formState.presentation}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Stock actual Kg</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, currentStock: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={formState.currentStock}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Stock minimo Kg</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, minimumStock: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={formState.minimumStock}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Costo USD</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) => setFormState((current) => ({ ...current, costUsd: event.target.value }))}
                  step="0.01"
                  type="number"
                  value={formState.costUsd}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Precio USD</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) => setFormState((current) => ({ ...current, priceUsd: event.target.value }))}
                  step="0.01"
                  type="number"
                  value={formState.priceUsd}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Rendimiento esperado %</span>
              <input
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                min="0"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, yieldExpectedPercent: event.target.value }))
                }
                step="0.01"
                type="number"
                value={formState.yieldExpectedPercent}
              />
            </label>

            {saveProductMutation.isError ? (
              <div className="rounded-[24px] bg-[var(--color-danger-soft)] px-4 py-4 text-sm text-[var(--color-danger)]">
                {getFriendlyErrorMessage(saveProductMutation.error)}
              </div>
            ) : null}

            {saveProductMutation.isSuccess ? (
              <div className="rounded-[24px] bg-[var(--color-brand-soft)] px-4 py-4 text-sm text-[var(--color-brand-deep)]">
                Producto guardado correctamente.
              </div>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-[26px] bg-[var(--color-brand)] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saveProductMutation.isPending}
              type="submit"
            >
              {saveProductMutation.isPending ? "Guardando..." : formState.id ? "Actualizar producto" : "Crear producto"}
            </button>
          </form>
        </article>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Productos</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                Estado por SKU
              </h2>
            </div>
            <span className="rounded-full bg-[var(--color-accent-soft)] px-3 py-2 text-xs font-semibold text-orange-800">
              {stockRows.length} referencias
            </span>
          </div>

          {productsQuery.isLoading || exchangeRateQuery.isLoading ? (
            Array.from({ length: 2 }).map((_, index) => (
              <article key={index} className="panel-strong rounded-[30px] p-5 sm:p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-6 w-48 rounded-full bg-slate-200/80" />
                  <div className="h-36 rounded-[24px] bg-slate-200/70" />
                </div>
              </article>
            ))
          ) : null}

          {!productsQuery.isLoading && !queryError ? (
            <section className="space-y-3">
              {stockRows.map((row) => (
                <article key={row.id} className="panel-strong lift-hover reveal reveal-delay-2 rounded-[32px] p-5 sm:p-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="font-display text-xl font-semibold text-[var(--color-ink)]">
                          {row.product}
                        </h2>
                        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                          {row.sku} · {row.presentation} · {row.flavor}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                          Costo base: {formatUsd(row.costUsd)} · Venta: {formatUsd(row.priceUsd)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-2 text-xs font-semibold ${
                          row.status === "Saludable"
                            ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]"
                            : row.status === "Critico"
                              ? "bg-[var(--color-accent-soft)] text-orange-800"
                              : row.status === "Agotado"
                                ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                                : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Stock actual</p>
                        <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                          {row.stockKg} Kg
                        </p>
                      </div>
                      <div className="rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Disponible</p>
                        <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                          {row.availableKg} Kg
                        </p>
                      </div>
                      <div className="rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Minimo</p>
                        <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                          {row.minimumKg} Kg
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[26px] bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(245,255,249,0.86))] px-4 py-4 ring-1 ring-[var(--color-line)]">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm text-[var(--color-ink-soft)]">Costo y venta en VES</p>
                        <span className="text-sm font-semibold text-[var(--color-ink)]">
                          Rendimiento {row.yieldExpectedPercent}%
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
                        {formatVes(row.costVes)} costo · {formatVes(row.priceVes)} venta
                      </p>
                      <div className="progress-rail mt-3">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${Math.min((row.stockKg / Math.max(row.minimumKg * 2, 1)) * 100, 100)}%`
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        className="rounded-[24px] bg-white/85 px-4 py-4 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)] transition hover:bg-white"
                        onClick={() => loadProductIntoForm(row.id)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="rounded-[24px] bg-white/85 px-4 py-4 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)] transition hover:bg-white disabled:opacity-60"
                        disabled={toggleProductStatusMutation.isPending}
                        onClick={() =>
                          void toggleProductStatusMutation.mutateAsync({
                            id: row.id,
                            status: row.status === "Inactivo" ? "active" : "inactive"
                          })
                        }
                        type="button"
                      >
                        {row.status === "Inactivo" ? "Activar" : "Inactivar"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
