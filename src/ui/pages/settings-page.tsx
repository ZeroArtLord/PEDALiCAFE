import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/auth-provider.js";
import type { AppUser, ExchangeRateSettings, UserRole } from "../../domain/types.js";
import { getExchangeRate, listDocuments, updateDocument, upsertSettings } from "../../lib/firestore.js";
import { PageHeader } from "../components/page-header";

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado al consultar Firestore.";
}

const roleOptions: UserRole[] = ["admin", "manager", "sales", "production", "inventory"];

function printDocument(title: string, body: string) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");

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
          h1,h2,p { margin: 0; }
          .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:18px 0; }
          .card { border:1px solid #e5e7eb; border-radius:14px; padding:14px; }
        </style>
      </head>
      <body>${body}</body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [rateInput, setRateInput] = useState("");
  const [closureDate, setClosureDate] = useState(new Date().toISOString().slice(0, 10));

  const exchangeRateQuery = useQuery({
    queryKey: ["settings", "exchange-rate"],
    queryFn: getExchangeRate
  });
  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => listDocuments("users")
  });
  const invoicesQuery = useQuery({
    queryKey: ["invoices"],
    queryFn: () => listDocuments("invoices")
  });
  const paymentsQuery = useQuery({
    queryKey: ["payments"],
    queryFn: () => listDocuments("payments")
  });

  const queryError =
    exchangeRateQuery.error ?? usersQuery.error ?? invoicesQuery.error ?? paymentsQuery.error;

  const financialSummary = useMemo(() => {
    const invoices = invoicesQuery.data ?? [];
    const payments = paymentsQuery.data ?? [];

    const billedToday = invoices
      .filter((entry) => entry.data.issuedAt.startsWith(closureDate))
      .reduce((sum, entry) => sum + entry.data.totals.totalUSD, 0);
    const collectedTodayUsd = payments
      .filter((entry) => entry.data.receivedAt.startsWith(closureDate))
      .reduce((sum, entry) => sum + entry.data.amountUSD, 0);
    const collectedTodayVes = payments
      .filter((entry) => entry.data.receivedAt.startsWith(closureDate))
      .reduce((sum, entry) => sum + entry.data.amountVES, 0);

    const aging = invoices.reduce(
      (accumulator, entry) => {
        const pending = entry.data.payment.pendingUSD;

        if (pending <= 0) {
          return accumulator;
        }

        const issued = new Date(entry.data.issuedAt);
        const diffDays = Math.floor((Date.now() - issued.getTime()) / 86400000);

        if (diffDays <= 7) {
          accumulator.current += pending;
        } else if (diffDays <= 15) {
          accumulator.medium += pending;
        } else {
          accumulator.old += pending;
        }

        return accumulator;
      },
      { current: 0, medium: 0, old: 0 }
    );

    return {
      billedToday,
      collectedTodayUsd,
      collectedTodayVes,
      aging
    };
  }, [closureDate, invoicesQuery.data, paymentsQuery.data]);

  function printCashClosure() {
    printDocument(
      `Cierre de caja ${closureDate}`,
      `<h1>Cierre de caja diario</h1>
      <p>Fecha: ${closureDate}</p>
      <div class="grid">
        <div class="card"><p>Facturado</p><h2>${formatUsd(financialSummary.billedToday)}</h2></div>
        <div class="card"><p>Cobrado USD</p><h2>${formatUsd(financialSummary.collectedTodayUsd)}</h2></div>
        <div class="card"><p>Cobrado VES</p><h2>${financialSummary.collectedTodayVes.toFixed(2)}</h2></div>
        <div class="card"><p>Cartera activa</p><h2>${formatUsd(
          financialSummary.aging.current + financialSummary.aging.medium + financialSummary.aging.old
        )}</h2></div>
      </div>`
    );
  }

  const updateRateMutation = useMutation({
    mutationFn: async () => {
      const nextRate = Number(rateInput || exchangeRateQuery.data?.rate || 0);

      if (nextRate <= 0) {
        throw new Error("La tasa debe ser mayor que cero.");
      }

      const now = new Date();
      const payload: ExchangeRateSettings = {
        baseCurrency: "USD",
        quoteCurrency: "VES",
        rate: nextRate,
        source: "manual",
        effectiveDate: now.toISOString().slice(0, 10),
        createdBy: user?.uid ?? "frontend_user",
        updatedAt: now.toISOString()
      };

      await upsertSettings("exchangeRate", payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "exchange-rate"] });
      setRateInput("");
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: async (payload: { id: string; role: UserRole; status: AppUser["status"] }) => {
      await updateDocument("users", payload.id, {
        role: payload.role,
        status: payload.status,
        updatedAt: new Date().toISOString()
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    }
  });

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <div className="relative grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <PageHeader
            eyebrow="Ajustes"
            title="Control administrativo y financiero"
            description="Aqui gestionas la tasa diaria, revisas caja del dia y ajustas los roles de los usuarios existentes."
          />

          <div className="panel-strong soft-grid reveal reveal-delay-2 rounded-[30px] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Caja del dia
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {[
                ["Facturado hoy", formatUsd(financialSummary.billedToday)],
                ["Cobrado USD", formatUsd(financialSummary.collectedTodayUsd)],
                ["Cobrado VES", financialSummary.collectedTodayVes.toFixed(2)]
              ].map(([label, value]) => (
                <div key={label} className="rounded-[24px] bg-white/82 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">{label}</p>
                  <p className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {queryError ? (
        <section className="panel-strong reveal rounded-[32px] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-danger)]">
            No se pudieron cargar los ajustes
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
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Tasa diaria</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
            USD / VES
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            Ajusta la referencia del dia para clientes, ventas y produccion.
          </p>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void updateRateMutation.mutateAsync();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Tasa activa</span>
              <input
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                min="0"
                onChange={(event) => setRateInput(event.target.value)}
                placeholder={String(exchangeRateQuery.data?.rate ?? "")}
                step="0.01"
                type="number"
                value={rateInput}
              />
            </label>

            {updateRateMutation.isError ? (
              <div className="rounded-[24px] bg-[var(--color-danger-soft)] px-4 py-4 text-sm text-[var(--color-danger)]">
                {getFriendlyErrorMessage(updateRateMutation.error)}
              </div>
            ) : null}

            {updateRateMutation.isSuccess ? (
              <div className="rounded-[24px] bg-[var(--color-brand-soft)] px-4 py-4 text-sm text-[var(--color-brand-deep)]">
                Tasa actualizada correctamente.
              </div>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-[26px] bg-[var(--color-brand)] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)] disabled:opacity-60"
              disabled={updateRateMutation.isPending}
              type="submit"
            >
              {updateRateMutation.isPending ? "Guardando tasa..." : "Guardar tasa"}
            </button>
          </form>

          <div className="mt-5 rounded-[26px] border border-[var(--color-line)] bg-white/82 px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">Cartera por antiguedad</p>
              <input
                className="rounded-[18px] border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none"
                onChange={(event) => setClosureDate(event.target.value)}
                type="date"
                value={closureDate}
              />
            </div>
            <div className="mt-4 space-y-3">
              {[
                ["0-7 dias", financialSummary.aging.current],
                ["8-15 dias", financialSummary.aging.medium],
                ["16+ dias", financialSummary.aging.old]
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 rounded-[20px] bg-[var(--color-surface)] px-3 py-3">
                  <span className="text-sm text-[var(--color-ink-soft)]">{label}</span>
                  <span className="text-sm font-semibold text-[var(--color-ink)]">{formatUsd(Number(value))}</span>
                </div>
              ))}
            </div>
            <button
              className="mt-4 inline-flex w-full items-center justify-center rounded-[24px] bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)]"
              onClick={printCashClosure}
              type="button"
            >
              Imprimir cierre de caja
            </button>
          </div>
        </article>

        <article className="panel-strong reveal reveal-delay-2 rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                Usuarios y roles
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                Perfiles del sistema
              </h2>
            </div>
            <span className="rounded-full bg-[var(--color-accent-soft)] px-3 py-2 text-xs font-semibold text-orange-800">
              {usersQuery.data?.length ?? 0} usuarios
            </span>
          </div>

          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            La creacion de cuentas Auth sigue siendo un proceso administrativo. Desde aqui puedes editar el rol y el estado de perfiles ya existentes.
          </p>

          <div className="mt-4 rounded-[24px] bg-[var(--color-surface)] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">
              Alta de empleados
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-ink-soft)]">
              Crea la cuenta real desde terminal con `npm run create:staff-user` y luego administra el perfil aqui.
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {(usersQuery.data ?? []).map(({ id, data }) => (
              <div key={id} className="rounded-[24px] border border-[var(--color-line)] bg-white/82 px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-[var(--color-ink)]">{data.displayName}</p>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{data.email}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      className="rounded-[18px] border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none"
                      defaultValue={data.role}
                      onChange={(event) =>
                        void updateUserMutation.mutateAsync({
                          id,
                          role: event.target.value as UserRole,
                          status: data.status
                        })
                      }
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-[18px] border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none"
                      defaultValue={data.status}
                      onChange={(event) =>
                        void updateUserMutation.mutateAsync({
                          id,
                          role: data.role,
                          status: event.target.value as AppUser["status"]
                        })
                      }
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
