import { useId, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { buildProductionBatch } from "../../domain/factories.js";
import type { Product } from "../../domain/types.js";
import { createProductionBatchAndUpdateInventory, getExchangeRate, listDocuments } from "../../lib/firestore.js";
import { useAuth } from "../../auth/auth-provider.js";
import { PageHeader } from "../components/page-header";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

interface FieldProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  prefix: string;
}

function NumericField({ id, label, hint, value, onChange, prefix }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">{label}</span>
      <span className="mb-3 block text-xs leading-5 text-[var(--color-ink-soft)]">{hint}</span>
      <div className="flex items-center gap-3 rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 shadow-sm transition focus-within:border-[var(--color-brand)]">
        <span className="rounded-full bg-[var(--color-brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-deep)]">
          {prefix}
        </span>
        <input
          id={id}
          className="w-full border-none bg-transparent text-base text-[var(--color-ink)] outline-none placeholder:text-slate-400"
          inputMode="decimal"
          min="0"
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          step="0.01"
          type="number"
          value={value}
        />
      </div>
    </label>
  );
}

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado al consultar Firestore.";
}

export function ProductionPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const rawWeightId = useId();
  const rawCostId = useId();
  const overheadId = useId();
  const netPulpId = useId();
  const productFieldId = useId();

  const [selectedProductId, setSelectedProductId] = useState("");
  const [rawFruitKg, setRawFruitKg] = useState("100");
  const [rawFruitCostUsd, setRawFruitCostUsd] = useState("90");
  const [overheadUsd, setOverheadUsd] = useState("15");
  const [netPulpKg, setNetPulpKg] = useState("62");
  const [supplierName, setSupplierName] = useState("Proveedor Local");
  const [supplierInvoiceRef, setSupplierInvoiceRef] = useState("FAC-9981");
  const [notes, setNotes] = useState("Merma normal por calidad de fruta");
  const [batchProductFilter, setBatchProductFilter] = useState("all");
  const [batchDateFilter, setBatchDateFilter] = useState("");
  const [batchSearch, setBatchSearch] = useState("");

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => listDocuments("products")
  });
  const batchesQuery = useQuery({
    queryKey: ["productionBatches"],
    queryFn: () => listDocuments("productionBatches")
  });

  const exchangeRateQuery = useQuery({
    queryKey: ["settings", "exchange-rate"],
    queryFn: getExchangeRate
  });

  const products = productsQuery.data ?? [];

  const selectedProduct = useMemo(() => {
    if (!products.length) {
      return null;
    }

    if (!selectedProductId) {
      return products[0];
    }

    return products.find((entry) => entry.id === selectedProductId) ?? products[0];
  }, [products, selectedProductId]);

  const rawFruitKgValue = Number(rawFruitKg) || 0;
  const rawFruitCostValue = Number(rawFruitCostUsd) || 0;
  const overheadValue = Number(overheadUsd) || 0;
  const netPulpKgValue = Number(netPulpKg) || 0;

  const lostKg = Math.max(rawFruitKgValue - netPulpKgValue, 0);
  const lossPercent = rawFruitKgValue > 0 ? (lostKg / rawFruitKgValue) * 100 : 0;
  const totalProductionCost = rawFruitCostValue + overheadValue;
  const costPerNetKg = netPulpKgValue > 0 ? totalProductionCost / netPulpKgValue : 0;
  const suggestedSalePrice = costPerNetKg * 1.4;

  const canCalculate = rawFruitKgValue > 0 && netPulpKgValue > 0;
  const exchangeRate = exchangeRateQuery.data?.rate ?? 0;
  const productionBatches = [...(batchesQuery.data ?? [])]
    .sort((left, right) => right.data.dates.productionDate.localeCompare(left.data.dates.productionDate))
    .map(({ id, data }) => ({
      id,
      number: data.batchNumber,
      productId: data.productId,
      product: data.productNameSnapshot,
      fruitType: data.rawMaterial.fruitType,
      inputKg: data.rawMaterial.inputWeightKg,
      outputKg: data.output.netPulpKg,
      wastePercent: data.output.lossPercent,
      totalCostUsd: data.costSummary.totalCostUSD,
      unitCostUsd: data.costSummary.unitCostPerKgUSD,
      productionDate: data.dates.productionDate,
      notes: data.notes
    }));
  const filteredBatches = productionBatches.filter((batch) => {
    const searchValue = batchSearch.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      batch.number.toLowerCase().includes(searchValue) ||
      batch.product.toLowerCase().includes(searchValue) ||
      batch.fruitType.toLowerCase().includes(searchValue);
    const matchesProduct = batchProductFilter === "all" || batch.productId === batchProductFilter;
    const matchesDate = !batchDateFilter || batch.productionDate.startsWith(batchDateFilter);

    return matchesSearch && matchesProduct && matchesDate;
  });

  const queryError = productsQuery.error ?? exchangeRateQuery.error ?? batchesQuery.error;

  const saveBatchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) {
        throw new Error("No hay productos disponibles para registrar el lote.");
      }

      if (!exchangeRate) {
        throw new Error("No hay una tasa activa disponible.");
      }

      if (!canCalculate) {
        throw new Error("Completa los datos del lote antes de guardar.");
      }

      const timestamp = new Date();
      const isoDate = timestamp.toISOString();
      const suffix = timestamp.getTime().toString().slice(-4);
      const docId = `batch_${timestamp.getTime()}`;
      const movementId = `movement_${timestamp.getTime()}`;
      const batchNumber = `LOT-${isoDate.slice(0, 10).replaceAll("-", "")}-${suffix}`;

      const payload = buildProductionBatch({
        batchNumber,
        product: selectedProduct.data as Product,
        fruitType: selectedProduct.data.flavor,
        inputWeightKg: rawFruitKgValue,
        netPulpKg: netPulpKgValue,
        rawMaterialCostUSD: rawFruitCostValue,
        laborCostUSD: 0,
        otherCostUSD: overheadValue,
        exchangeRate,
        supplierName,
        supplierInvoiceRef,
        productionDate: isoDate,
        createdBy: user?.uid ?? "frontend_user",
        notes
      });

      await createProductionBatchAndUpdateInventory({
        batchId: docId,
        movementId,
        productDocumentId: selectedProduct.id,
        batch: payload,
        quantityProduced: netPulpKgValue,
        createdBy: user?.uid ?? "frontend_user",
        createdAt: isoDate
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["productionBatches"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] })
      ]);
    }
  });

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <div className="relative grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <PageHeader
            eyebrow="Produccion"
            title="Lotes con datos reales de Firestore"
            description="La pantalla ya consume productos y tasa activa desde la base. Al guardar, intenta crear un documento real en `productionBatches`."
          />

          <div className="panel-strong soft-grid reveal reveal-delay-2 rounded-[30px] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Resumen del lote
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[22px] bg-white/82 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
                  Entrada
                </p>
                <p className="mt-2 font-display text-3xl font-semibold text-[var(--color-ink)]">
                  {rawFruitKgValue.toFixed(0)} Kg
                </p>
              </div>
              <div className="rounded-[22px] bg-white/82 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
                  Salida
                </p>
                <p className="mt-2 font-display text-3xl font-semibold text-[var(--color-ink)]">
                  {netPulpKgValue.toFixed(0)} Kg
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-[24px] bg-white/82 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-[var(--color-ink-soft)]">Merma visual</p>
                <span className="text-sm font-semibold text-[var(--color-ink)]">
                  {formatPercent(lossPercent)}
                </span>
              </div>
              <div className="progress-rail mt-3">
                <div className="progress-fill" style={{ width: `${Math.min(lossPercent, 100)}%` }} />
              </div>
            </div>
            <div className="mt-4 rounded-[24px] bg-white/82 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Tasa activa</p>
              <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                {exchangeRate > 0 ? exchangeRate.toFixed(2) : "--"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {productsQuery.isLoading || exchangeRateQuery.isLoading || batchesQuery.isLoading ? (
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="panel-strong rounded-[32px] p-5 sm:p-6">
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-48 rounded-full bg-slate-200/80" />
              <div className="h-16 rounded-[24px] bg-slate-200/70" />
              <div className="h-16 rounded-[24px] bg-slate-200/70" />
              <div className="h-16 rounded-[24px] bg-slate-200/70" />
            </div>
          </article>
          <article className="panel-strong rounded-[32px] p-5 sm:p-6">
            <div className="animate-pulse space-y-3">
              <div className="h-32 rounded-[28px] bg-slate-200/70" />
              <div className="h-24 rounded-[26px] bg-slate-200/70" />
              <div className="h-24 rounded-[26px] bg-slate-200/70" />
            </div>
          </article>
        </section>
      ) : null}

      {queryError ? (
        <section className="panel-strong reveal rounded-[32px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-danger)]">
            No se pudo cargar produccion
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
            Firestore respondio con error
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            {getFriendlyErrorMessage(queryError)}
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            Tus reglas actuales exigen usuario autenticado para leer `products` y `settings`.
          </p>
        </section>
      ) : null}

      {!productsQuery.isLoading && !batchesQuery.isLoading && !queryError ? (
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="panel-strong reveal reveal-delay-1 rounded-[32px] p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                  Nuevo lote
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                  Produccion e inventario
                </h2>
              </div>
              <span className="rounded-full bg-[var(--color-brand-soft)] px-3 py-2 text-xs font-semibold text-[var(--color-brand-deep)]">
                Firestore
              </span>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void saveBatchMutation.mutateAsync();
              }}
            >
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Producto</span>
                <span className="mb-3 block text-xs leading-5 text-[var(--color-ink-soft)]">
                  Selecciona el producto terminado al que se le cargara el lote.
                </span>
                <select
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                  id={productFieldId}
                  onChange={(event) => setSelectedProductId(event.target.value)}
                  value={selectedProduct?.id ?? ""}
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.data.name}
                    </option>
                  ))}
                </select>
              </label>

              <NumericField
                hint="Peso total de la fruta cruda comprada antes de procesar."
                id={rawWeightId}
                label="Kilos de Fruta Cruda Comprada"
                onChange={setRawFruitKg}
                prefix="KG"
                value={rawFruitKg}
              />

              <NumericField
                hint="Costo pagado por la compra de la fruta en dolares."
                id={rawCostId}
                label="Costo de la Fruta"
                onChange={setRawFruitCostUsd}
                prefix="USD"
                value={rawFruitCostUsd}
              />

              <NumericField
                hint="Empaques, transporte, hielo, mano de obra y otros gastos."
                id={overheadId}
                label="Costos Operativos / Overhead"
                onChange={setOverheadUsd}
                prefix="USD"
                value={overheadUsd}
              />

              <NumericField
                hint="Cantidad final de pulpa util despues del proceso."
                id={netPulpId}
                label="Kilos de Pulpa Neta Obtenida"
                onChange={setNetPulpKg}
                prefix="KG"
                value={netPulpKg}
              />

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Proveedor</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                  onChange={(event) => setSupplierName(event.target.value)}
                  value={supplierName}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Referencia de compra</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                  onChange={(event) => setSupplierInvoiceRef(event.target.value)}
                  value={supplierInvoiceRef}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Notas</span>
                <textarea
                  className="min-h-28 w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base text-[var(--color-ink)] outline-none"
                  onChange={(event) => setNotes(event.target.value)}
                  value={notes}
                />
              </label>

              {saveBatchMutation.isError ? (
                <div className="rounded-[24px] bg-[var(--color-danger-soft)] px-4 py-4 text-sm text-[var(--color-danger)]">
                  {getFriendlyErrorMessage(saveBatchMutation.error)}
                </div>
              ) : null}

              {saveBatchMutation.isSuccess ? (
                <div className="rounded-[24px] bg-[var(--color-brand-soft)] px-4 py-4 text-sm text-[var(--color-brand-deep)]">
                  Lote guardado correctamente en `productionBatches`.
                </div>
              ) : null}

              <button
                className="inline-flex w-full items-center justify-center rounded-[26px] bg-[var(--color-brand)] px-4 py-4 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(10,67,52,0.24)] transition hover:bg-[var(--color-brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canCalculate || saveBatchMutation.isPending || !selectedProduct || !exchangeRate}
                type="submit"
              >
                {saveBatchMutation.isPending ? "Guardando lote..." : "Guardar lote"}
              </button>
            </form>
          </article>

          <article className="panel-strong reveal reveal-delay-2 rounded-[32px] p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Resultado automatico
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
              Analisis del lote
            </h2>

            <div className="mt-5 grid gap-3">
              <div className="rounded-[28px] bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-deep))] px-4 py-5 text-white shadow-[0_20px_36px_rgba(10,67,52,0.22)]">
                <p className="text-xs uppercase tracking-[0.24em] text-white/70">Merma</p>
                <p className="mt-2 font-display text-3xl font-semibold">
                  {canCalculate ? formatPercent(lossPercent) : "--"}
                </p>
                <p className="mt-2 text-sm text-white/80">
                  {canCalculate
                    ? `${lostKg.toFixed(2)} Kg perdidos en el proceso.`
                    : "Ingresa kilos de entrada y salida para calcular."}
                </p>
                <div className="progress-rail mt-4 bg-white/15">
                  <div className="progress-fill" style={{ width: `${Math.min(lossPercent, 100)}%` }} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="lift-hover rounded-[26px] border border-[var(--color-line)] bg-white/82 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                    Costo total
                  </p>
                  <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                    {formatCurrency(totalProductionCost)}
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                    Fruta + costos operativos del lote.
                  </p>
                </div>

                <div className="lift-hover rounded-[26px] border border-[var(--color-line)] bg-white/82 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                    Costo real por kilo
                  </p>
                  <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                    {canCalculate ? formatCurrency(costPerNetKg) : "--"}
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                    Costo unitario sobre pulpa neta utilizable.
                  </p>
                </div>
              </div>

              <div className="rounded-[28px] border border-orange-200 bg-[linear-gradient(135deg,#fff7eb,#ffedd8)] px-4 py-5 shadow-[0_20px_36px_rgba(243,143,41,0.12)]">
                <p className="text-xs uppercase tracking-[0.24em] text-orange-700">
                  Precio sugerido con 40% de ganancia
                </p>
                <p className="mt-2 font-display text-3xl font-semibold text-orange-800">
                  {canCalculate ? formatCurrency(suggestedSalePrice) : "--"}
                </p>
                <p className="mt-2 text-sm leading-6 text-orange-700">
                  Formula usada: costo por kilo x 1.40. Ajustalo luego segun mercado y merma historica.
                </p>
              </div>

              <div className="rounded-[26px] border border-[var(--color-line)] bg-white/82 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                  Producto seleccionado
                </p>
                <p className="mt-2 font-display text-xl font-semibold text-[var(--color-ink)]">
                  {selectedProduct?.data.name ?? "Sin producto"}
                </p>
                <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                  Stock actual: {selectedProduct?.data.stock.current ?? 0} Kg
                </p>
              </div>

              <div className="rounded-[26px] border border-[var(--color-line)] bg-white/82 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                      Historial real
                    </p>
                    <h3 className="mt-2 font-display text-xl font-semibold text-[var(--color-ink)]">
                      Lotes registrados
                    </h3>
                  </div>
                  <span className="rounded-full bg-[var(--color-accent-soft)] px-3 py-2 text-xs font-semibold text-orange-800">
                    {filteredBatches.length} lotes
                  </span>
                </div>

                <div className="mt-4 grid gap-3">
                  <input
                    className="w-full rounded-[22px] border border-[var(--color-line)] bg-white px-4 py-3 text-sm outline-none"
                    onChange={(event) => setBatchSearch(event.target.value)}
                    placeholder="Buscar por lote, producto o fruta"
                    value={batchSearch}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      className="w-full rounded-[22px] border border-[var(--color-line)] bg-white px-4 py-3 text-sm outline-none"
                      onChange={(event) => setBatchProductFilter(event.target.value)}
                      value={batchProductFilter}
                    >
                      <option value="all">Todos los productos</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.data.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="w-full rounded-[22px] border border-[var(--color-line)] bg-white px-4 py-3 text-sm outline-none"
                      onChange={(event) => setBatchDateFilter(event.target.value)}
                      type="date"
                      value={batchDateFilter}
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {filteredBatches.slice(0, 6).map((batch) => (
                    <div key={batch.id} className="rounded-[22px] bg-[var(--color-surface)] px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-[var(--color-ink)]">{batch.product}</p>
                          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{batch.number}</p>
                          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                            {new Date(batch.productionDate).toLocaleString("es-VE")}
                          </p>
                        </div>
                        <span className="rounded-full bg-[var(--color-brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-deep)]">
                          {batch.outputKg} Kg
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <p className="text-sm text-[var(--color-ink-soft)]">
                          Entrada: <span className="font-semibold text-[var(--color-ink)]">{batch.inputKg} Kg</span>
                        </p>
                        <p className="text-sm text-[var(--color-ink-soft)]">
                          Merma: <span className="font-semibold text-[var(--color-ink)]">{formatPercent(batch.wastePercent)}</span>
                        </p>
                        <p className="text-sm text-[var(--color-ink-soft)]">
                          Costo total: <span className="font-semibold text-[var(--color-ink)]">{formatCurrency(batch.totalCostUsd)}</span>
                        </p>
                        <p className="text-sm text-[var(--color-ink-soft)]">
                          Costo/Kg: <span className="font-semibold text-[var(--color-ink)]">{formatCurrency(batch.unitCostUsd)}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                  {!filteredBatches.length ? (
                    <div className="rounded-[22px] bg-[var(--color-surface)] px-4 py-4 text-sm text-[var(--color-ink-soft)]">
                      No hay lotes que coincidan con los filtros.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}
