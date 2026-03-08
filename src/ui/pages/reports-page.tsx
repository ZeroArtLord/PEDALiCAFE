import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { listDocuments } from "../../lib/firestore.js";
import { PageHeader } from "../components/page-header";

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function printReport(title: string, body: string) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");

  if (!printWindow) {
    throw new Error("El navegador bloqueo la ventana de impresion.");
  }

  printWindow.document.write(`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1f2937; margin: 32px; }
          h1,h2,h3,p { margin: 0; }
          .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin: 18px 0; }
          .card { border:1px solid #e5e7eb; border-radius:14px; padding:14px; }
          .table { width:100%; border-collapse:collapse; margin-top:18px; }
          .table th,.table td { border-bottom:1px solid #e5e7eb; padding:10px 8px; text-align:left; }
          .right { text-align:right; }
          .muted { color:#6b7280; }
        </style>
      </head>
      <body>${body}</body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado al consultar Firestore.";
}

export function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);

  const invoicesQuery = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listDocuments("invoices")
  });
  const paymentsQuery = useQuery({
    queryKey: ["payments"],
    queryFn: () => listDocuments("payments")
  });
  const batchesQuery = useQuery({
    queryKey: ["productionBatches"],
    queryFn: () => listDocuments("productionBatches")
  });

  const queryError = invoicesQuery.error ?? paymentsQuery.error ?? batchesQuery.error;

  const reports = useMemo(() => {
    const invoices = (invoicesQuery.data ?? []).filter((entry) => {
      const date = entry.data.issuedAt.slice(0, 10);
      return date >= dateFrom && date <= dateTo;
    });
    const payments = (paymentsQuery.data ?? []).filter((entry) => {
      const date = entry.data.receivedAt.slice(0, 10);
      return date >= dateFrom && date <= dateTo;
    });
    const batches = (batchesQuery.data ?? []).filter((entry) => {
      const date = entry.data.dates.productionDate.slice(0, 10);
      return date >= dateFrom && date <= dateTo;
    });

    const billedUsd = invoices.reduce((sum, entry) => sum + entry.data.totals.totalUSD, 0);
    const recoveredUsd = payments.reduce((sum, entry) => sum + entry.data.amountUSD, 0);
    const pendingUsd = invoices.reduce((sum, entry) => sum + entry.data.payment.pendingUSD, 0);
    const producedKg = batches.reduce((sum, entry) => sum + entry.data.output.netPulpKg, 0);
    const wasteKg = batches.reduce((sum, entry) => sum + entry.data.output.wasteKg, 0);
    const avgWastePercent = batches.length
      ? batches.reduce((sum, entry) => sum + entry.data.output.lossPercent, 0) / batches.length
      : 0;

    const topCustomers = Object.values(
      invoices.reduce<Record<string, { customer: string; totalUsd: number }>>((acc, entry) => {
        const key = entry.data.customerSnapshot.fullName;
        const current = acc[key] ?? { customer: key, totalUsd: 0 };
        current.totalUsd += entry.data.totals.totalUSD;
        acc[key] = current;
        return acc;
      }, {})
    )
      .sort((left, right) => right.totalUsd - left.totalUsd)
      .slice(0, 5);

    const topProducts = Object.values(
      invoices.reduce<Record<string, { name: string; quantity: number; totalUsd: number }>>((acc, entry) => {
        entry.data.items.forEach((item) => {
          const current = acc[item.productId] ?? { name: item.name, quantity: 0, totalUsd: 0 };
          current.quantity += item.quantity;
          current.totalUsd += item.subtotalUSD;
          acc[item.productId] = current;
        });
        return acc;
      }, {})
    )
      .sort((left, right) => right.totalUsd - left.totalUsd)
      .slice(0, 5);

    return {
      billedUsd,
      recoveredUsd,
      pendingUsd,
      producedKg,
      wasteKg,
      avgWastePercent,
      topCustomers,
      topProducts,
      invoicesCount: invoices.length,
      batchesCount: batches.length
    };
  }, [batchesQuery.data, dateFrom, dateTo, invoicesQuery.data, paymentsQuery.data]);

  function handlePrint() {
    const customerRows = reports.topCustomers
      .map(
        (customer) =>
          `<tr><td>${customer.customer}</td><td class="right">${formatUsd(customer.totalUsd)}</td></tr>`
      )
      .join("");
    const productRows = reports.topProducts
      .map(
        (product) =>
          `<tr><td>${product.name}</td><td class="right">${product.quantity} Kg</td><td class="right">${formatUsd(
            product.totalUsd
          )}</td></tr>`
      )
      .join("");

    printReport(
      "Reporte operativo",
      `<h1>Reporte operativo</h1>
      <p class="muted">Periodo: ${dateFrom} a ${dateTo}</p>
      <div class="grid">
        <div class="card"><p class="muted">Facturado</p><h2>${formatUsd(reports.billedUsd)}</h2></div>
        <div class="card"><p class="muted">Cobrado</p><h2>${formatUsd(reports.recoveredUsd)}</h2></div>
        <div class="card"><p class="muted">Por cobrar</p><h2>${formatUsd(reports.pendingUsd)}</h2></div>
        <div class="card"><p class="muted">Produccion neta</p><h2>${reports.producedKg.toFixed(2)} Kg</h2></div>
      </div>
      <h3>Top clientes</h3>
      <table class="table"><thead><tr><th>Cliente</th><th class="right">Venta</th></tr></thead><tbody>${customerRows}</tbody></table>
      <h3 style="margin-top:24px;">Top productos</h3>
      <table class="table"><thead><tr><th>Producto</th><th class="right">Cantidad</th><th class="right">Venta</th></tr></thead><tbody>${productRows}</tbody></table>`
    );
  }

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <div className="relative grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <PageHeader
            eyebrow="Reportes"
            title="Lectura gerencial por rango de fechas"
            description="Analiza ventas, cobranza, produccion y ranking comercial sin salir de la app."
          />

          <article className="panel-strong soft-grid reveal reveal-delay-2 rounded-[30px] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Periodo</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                className="w-full rounded-[22px] border border-[var(--color-line)] bg-white/82 px-4 py-3 text-sm outline-none"
                onChange={(event) => setDateFrom(event.target.value)}
                type="date"
                value={dateFrom}
              />
              <input
                className="w-full rounded-[22px] border border-[var(--color-line)] bg-white/82 px-4 py-3 text-sm outline-none"
                onChange={(event) => setDateTo(event.target.value)}
                type="date"
                value={dateTo}
              />
            </div>
            <button
              className="mt-4 inline-flex w-full items-center justify-center rounded-[24px] bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)]"
              onClick={handlePrint}
              type="button"
            >
              Imprimir reporte
            </button>
          </article>
        </div>
      </section>

      {queryError ? (
        <section className="panel-strong reveal rounded-[32px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-danger)]">
            No se pudieron cargar los reportes
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
            Firestore respondio con error
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            {getFriendlyErrorMessage(queryError)}
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Facturado", formatUsd(reports.billedUsd)],
          ["Cobrado", formatUsd(reports.recoveredUsd)],
          ["Por cobrar", formatUsd(reports.pendingUsd)],
          ["Produccion neta", `${reports.producedKg.toFixed(2)} Kg`]
        ].map(([label, value]) => (
          <article key={label} className="panel-strong rounded-[28px] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">{label}</p>
            <p className="mt-3 font-display text-3xl font-semibold text-[var(--color-ink)]">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="panel-strong rounded-[30px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Produccion</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Lotes", `${reports.batchesCount}`],
              ["Merma Kg", `${reports.wasteKg.toFixed(2)} Kg`],
              ["Merma promedio", `${reports.avgWastePercent.toFixed(2)}%`]
            ].map(([label, value]) => (
              <div key={label} className="rounded-[24px] bg-white/82 px-4 py-4">
                <p className="text-sm text-[var(--color-ink-soft)]">{label}</p>
                <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-strong rounded-[30px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Ventas</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] bg-white/82 px-4 py-4">
              <p className="text-sm text-[var(--color-ink-soft)]">Facturas en periodo</p>
              <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">{reports.invoicesCount}</p>
            </div>
            <div className="rounded-[24px] bg-white/82 px-4 py-4">
              <p className="text-sm text-[var(--color-ink-soft)]">Cobranza</p>
              <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                {reports.billedUsd > 0 ? `${Math.round((reports.recoveredUsd / reports.billedUsd) * 100)}%` : "0%"}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="panel-strong rounded-[30px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Top clientes</p>
          <div className="mt-4 space-y-3">
            {reports.topCustomers.map((customer) => (
              <div key={customer.customer} className="rounded-[22px] bg-white/82 px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold text-[var(--color-ink)]">{customer.customer}</p>
                  <span className="text-sm font-semibold text-[var(--color-ink)]">
                    {formatUsd(customer.totalUsd)}
                  </span>
                </div>
              </div>
            ))}
            {!reports.topCustomers.length ? (
              <div className="rounded-[22px] bg-white/82 px-4 py-4 text-sm text-[var(--color-ink-soft)]">
                No hay ventas en ese periodo.
              </div>
            ) : null}
          </div>
        </article>

        <article className="panel-strong rounded-[30px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Top productos</p>
          <div className="mt-4 space-y-3">
            {reports.topProducts.map((product) => (
              <div key={product.name} className="rounded-[22px] bg-white/82 px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-[var(--color-ink)]">{product.name}</p>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{product.quantity} Kg vendidos</p>
                  </div>
                  <span className="text-sm font-semibold text-[var(--color-ink)]">
                    {formatUsd(product.totalUsd)}
                  </span>
                </div>
              </div>
            ))}
            {!reports.topProducts.length ? (
              <div className="rounded-[22px] bg-white/82 px-4 py-4 text-sm text-[var(--color-ink-soft)]">
                No hay productos vendidos en ese periodo.
              </div>
            ) : null}
          </div>
        </article>
      </section>
    </div>
  );
}
