import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/auth-provider.js";
import type { Customer, PurchaseDay } from "../../domain/types.js";
import { createDocument, getExchangeRate, listDocuments, updateDocument } from "../../lib/firestore.js";
import { PageHeader } from "../components/page-header";

const dayLabels: Record<PurchaseDay, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miercoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sabado",
  sunday: "Domingo"
};

const purchaseDayOptions = Object.entries(dayLabels) as Array<[PurchaseDay, string]>;

type CustomerFormState = {
  id: string | null;
  fullName: string;
  phone: string;
  state: string;
  city: string;
  reference: string;
  creditLimitUSD: string;
  purchaseDays: PurchaseDay[];
  notes: string;
  status: Customer["status"];
};

const emptyCustomerForm: CustomerFormState = {
  id: null,
  fullName: "",
  phone: "",
  state: "",
  city: "",
  reference: "",
  creditLimitUSD: "0",
  purchaseDays: [],
  notes: "",
  status: "active"
};

function formatPurchaseDays(days: PurchaseDay[]) {
  return days.map((day) => dayLabels[day]).join(", ");
}

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

function sanitizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function buildWhatsAppLink(customerName: string, phone: string, debtUsd: number, exchangeRate: number) {
  const debtVes = debtUsd * exchangeRate;
  const message = `Hola ${customerName}, tu pedido de pulpa esta listo. El total a pagar es ${formatUsd(
    debtUsd
  )} (o su equivalente en Bs: ${formatVes(debtVes)}).`;

  return `https://wa.me/${sanitizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

function WhatsAppIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 21a8.9 8.9 0 0 1-4.26-1.08L3 20.9l1.02-4.6A9 9 0 1 1 12 21Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M8.45 7.73c.22-.5.46-.51.67-.52h.57c.17 0 .4.06.62.52.22.46.75 1.83.82 1.97.07.14.11.3.02.48-.09.18-.14.3-.29.46-.14.16-.29.35-.41.47-.14.14-.29.3-.12.58.17.29.78 1.29 1.68 2.08 1.15 1.02 2.11 1.33 2.4 1.47.29.14.45.12.62-.07.17-.2.72-.84.91-1.13.2-.29.39-.24.67-.14.27.1 1.72.81 2.01.96.29.14.48.22.55.34.07.12.07.72-.17 1.4-.24.69-1.39 1.32-1.92 1.4-.5.08-1.14.12-1.85-.11-.43-.14-.98-.32-1.69-.63-2.98-1.3-4.93-4.47-5.08-4.68-.14-.2-1.21-1.62-1.21-3.09 0-1.47.77-2.19 1.04-2.49Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DebtIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M4 9.5h16" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 14.25h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function CustomerIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 12a3.75 3.75 0 1 0 0-7.5A3.75 3.75 0 0 0 12 12Zm-6.5 7.25a6.5 6.5 0 1 1 13 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function CustomersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [formState, setFormState] = useState<CustomerFormState>(emptyCustomerForm);

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => listDocuments("customers")
  });

  const exchangeRateQuery = useQuery({
    queryKey: ["settings", "exchange-rate"],
    queryFn: getExchangeRate
  });

  const customerDocuments = [...(customersQuery.data ?? [])].sort((left, right) =>
    left.data.fullName.localeCompare(right.data.fullName)
  );
  const globalExchangeRate = exchangeRateQuery.data?.rate ?? 0;
  const customers = customerDocuments.map(({ id, data }) => mapCustomerToCard(id, data, globalExchangeRate));
  const customersWithDebt = customers.filter((customer) => customer.pendingDebtUsd > 0).length;
  const queryError = customersQuery.error ?? exchangeRateQuery.error;

  const saveCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!formState.fullName.trim()) {
        throw new Error("El nombre del cliente es obligatorio.");
      }

      const now = new Date().toISOString();
      const existing = customerDocuments.find((entry) => entry.id === formState.id)?.data;
      const customerId = formState.id ?? `customer_${Date.now()}`;
      const nextCode =
        existing?.code ?? `CLI-${String(customerDocuments.length + 1).padStart(4, "0")}`;
      const creditLimitUSD = Number(formState.creditLimitUSD) || 0;
      const payload: Customer = {
        code: nextCode,
        fullName: formState.fullName.trim(),
        phone: formState.phone.trim(),
        address: {
          state: formState.state.trim(),
          city: formState.city.trim(),
          reference: formState.reference.trim()
        },
        purchaseDays: formState.purchaseDays,
        credit: existing?.credit ?? {
          enabled: true,
          creditLimitUSD,
          pendingDebtUSD: 0,
          pendingDebtVES: 0,
          lastUpdatedRate: globalExchangeRate
        },
        stats: existing?.stats ?? {
          totalPurchasesUSD: 0,
          totalPurchasesVES: 0,
          lastPurchaseAt: null
        },
        status: formState.status,
        notes: formState.notes.trim(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };

      payload.credit = {
        ...payload.credit,
        enabled: true,
        creditLimitUSD
      };

      if (formState.id) {
        await updateDocument("customers", customerId, payload);
        return;
      }

      await createDocument("customers", customerId, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setFormState(emptyCustomerForm);
    }
  });

  const toggleCustomerStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: Customer["status"] }) => {
      await updateDocument("customers", payload.id, {
        status: payload.status,
        updatedAt: new Date().toISOString()
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    }
  });

  function handlePurchaseDayToggle(day: PurchaseDay) {
    setFormState((current) => ({
      ...current,
      purchaseDays: current.purchaseDays.includes(day)
        ? current.purchaseDays.filter((entry) => entry !== day)
        : [...current.purchaseDays, day]
    }));
  }

  function loadCustomerIntoForm(customerId: string) {
    const existing = customerDocuments.find((entry) => entry.id === customerId)?.data;

    if (!existing) {
      return;
    }

    setFormState({
      id: customerId,
      fullName: existing.fullName,
      phone: existing.phone,
      state: existing.address.state,
      city: existing.address.city,
      reference: existing.address.reference,
      creditLimitUSD: String(existing.credit.creditLimitUSD),
      purchaseDays: existing.purchaseDays,
      notes: existing.notes,
      status: existing.status
    });
  }

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <div className="relative grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <PageHeader
              eyebrow="CRM y Clientes"
              title="Cobranza rapida con tono comercial"
              description="Ahora puedes crear, editar y activar clientes desde esta misma pantalla, ademas de despachar y cobrar por WhatsApp."
            />
          </div>

          <div className="panel-strong reveal reveal-delay-2 rounded-[30px] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">Tasa global</p>
            <p className="mt-2 font-display text-4xl font-semibold text-[var(--color-ink)]">
              {exchangeRateQuery.isLoading ? "--" : globalExchangeRate.toFixed(2)}
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
              Todo saldo USD se convierte en VES con esta referencia para el mensaje de cobro y despacho.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                ["Clientes", String(customers.length)],
                ["Con saldo", String(customersWithDebt)],
                ["Sesion", user?.isAnonymous ? "Invitado" : "Activa"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-[22px] bg-white/80 px-3 py-4 text-center">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
                    {label}
                  </p>
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
            No se pudieron cargar los clientes
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
            Firestore respondio con error
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--color-ink-soft)]">
            {getFriendlyErrorMessage(queryError)}
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="panel-strong reveal reveal-delay-1 rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                Maestro de clientes
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                {formState.id ? "Editar cliente" : "Nuevo cliente"}
              </h2>
            </div>
            {formState.id ? (
              <button
                className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)]"
                onClick={() => setFormState(emptyCustomerForm)}
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
              void saveCustomerMutation.mutateAsync();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Nombre</span>
              <input
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) => setFormState((current) => ({ ...current, fullName: event.target.value }))}
                value={formState.fullName}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Telefono</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) => setFormState((current) => ({ ...current, phone: event.target.value }))}
                  value={formState.phone}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Limite USD</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, creditLimitUSD: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={formState.creditLimitUSD}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Ciudad</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) => setFormState((current) => ({ ...current, city: event.target.value }))}
                  value={formState.city}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Estado</span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) => setFormState((current) => ({ ...current, state: event.target.value }))}
                  value={formState.state}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Referencia</span>
              <input
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) => setFormState((current) => ({ ...current, reference: event.target.value }))}
                value={formState.reference}
              />
            </label>

            <div>
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Dias de compra</span>
              <div className="flex flex-wrap gap-2">
                {purchaseDayOptions.map(([day, label]) => (
                  <button
                    key={day}
                    className={`rounded-full px-3 py-2 text-xs font-semibold ring-1 ring-[var(--color-line)] ${
                      formState.purchaseDays.includes(day)
                        ? "bg-[var(--color-brand)] text-white"
                        : "bg-white/80 text-[var(--color-ink-soft)]"
                    }`}
                    onClick={() => handlePurchaseDayToggle(day)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Notas</span>
              <textarea
                className="min-h-28 w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                value={formState.notes}
              />
            </label>

            {saveCustomerMutation.isError ? (
              <div className="rounded-[24px] bg-[var(--color-danger-soft)] px-4 py-4 text-sm text-[var(--color-danger)]">
                {getFriendlyErrorMessage(saveCustomerMutation.error)}
              </div>
            ) : null}

            {saveCustomerMutation.isSuccess ? (
              <div className="rounded-[24px] bg-[var(--color-brand-soft)] px-4 py-4 text-sm text-[var(--color-brand-deep)]">
                Cliente guardado correctamente.
              </div>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-[26px] bg-[var(--color-brand)] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saveCustomerMutation.isPending}
              type="submit"
            >
              {saveCustomerMutation.isPending ? "Guardando..." : formState.id ? "Actualizar cliente" : "Crear cliente"}
            </button>
          </form>
        </article>

        <div className="space-y-4">
          {customersQuery.isLoading || exchangeRateQuery.isLoading ? (
            Array.from({ length: 2 }).map((_, index) => (
              <article key={index} className="panel-strong rounded-[32px] p-5 sm:p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-6 w-40 rounded-full bg-slate-200/80" />
                  <div className="h-4 w-64 rounded-full bg-slate-200/70" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="h-28 rounded-[26px] bg-slate-200/70" />
                    <div className="h-28 rounded-[26px] bg-slate-200/70" />
                  </div>
                </div>
              </article>
            ))
          ) : null}

          {!customersQuery.isLoading && !queryError ? (
            <section className="grid gap-4">
              {customers.map((customer) => (
                <article key={customer.id} className="panel-strong lift-hover reveal rounded-[32px] p-5 sm:p-6">
                  <div className="flex flex-col gap-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-1 rounded-[22px] bg-[var(--color-brand-soft)] p-3 text-[var(--color-brand-deep)] shadow-sm">
                          <CustomerIcon />
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate font-display text-xl font-semibold text-[var(--color-ink)]">
                            {customer.name}
                          </h2>
                          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{customer.address}</p>
                          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{customer.phone}</p>
                        </div>
                      </div>

                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${customer.debtTone}`}>
                        {customer.status === "inactive" ? "Inactivo" : customer.pendingDebtUsd === 0 ? "Al dia" : "Pendiente"}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-[var(--color-brand-deep)] ring-1 ring-[var(--color-line)]">
                        {customer.purchaseDays || "Sin dias"}
                      </span>
                      <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-[var(--color-ink-soft)] ring-1 ring-[var(--color-line)]">
                        Codigo: {customer.code}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[26px] border border-[var(--color-line)] bg-white/80 px-4 py-4">
                        <div className="flex items-center gap-2 text-[var(--color-brand)]">
                          <DebtIcon />
                          <p className="text-xs uppercase tracking-[0.24em]">Deuda pendiente USD</p>
                        </div>
                        <p className="mt-3 font-display text-3xl font-semibold text-[var(--color-ink)]">
                          {formatUsd(customer.pendingDebtUsd)}
                        </p>
                      </div>

                      <div className="rounded-[26px] border border-[var(--color-line)] bg-white/80 px-4 py-4">
                        <div className="flex items-center gap-2 text-[var(--color-brand)]">
                          <DebtIcon />
                          <p className="text-xs uppercase tracking-[0.24em]">Equivalente VES</p>
                        </div>
                        <p className="mt-3 font-display text-3xl font-semibold text-[var(--color-ink)]">
                          {formatVes(customer.pendingDebtVes)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-[var(--color-line)] bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(245,255,249,0.85))] px-4 py-4 text-sm leading-6 text-[var(--color-ink-soft)]">
                      Mensaje listo: Hola {customer.name}, tu pedido de pulpa esta listo. El total a pagar es{" "}
                      {formatUsd(customer.pendingDebtUsd)} (o su equivalente en Bs: {formatVes(customer.pendingDebtVes)}).
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <button
                        className="rounded-[24px] bg-white/85 px-4 py-4 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)] transition hover:bg-white"
                        onClick={() => loadCustomerIntoForm(customer.id)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="rounded-[24px] bg-white/85 px-4 py-4 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)] transition hover:bg-white disabled:opacity-60"
                        disabled={toggleCustomerStatusMutation.isPending}
                        onClick={() =>
                          void toggleCustomerStatusMutation.mutateAsync({
                            id: customer.id,
                            status: customer.status === "active" ? "inactive" : "active"
                          })
                        }
                        type="button"
                      >
                        {customer.status === "active" ? "Inactivar" : "Activar"}
                      </button>
                      <a
                        className="inline-flex items-center justify-center gap-3 rounded-[24px] bg-[#19a956] px-4 py-4 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(25,169,86,0.24)] transition hover:bg-[#148646]"
                        href={customer.whatsAppLink}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <WhatsAppIcon />
                        Cobrar
                      </a>
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

function mapCustomerToCard(id: string, customer: Customer, exchangeRate: number) {
  const pendingDebtUsd = customer.credit.pendingDebtUSD;
  const pendingDebtVes = pendingDebtUsd * exchangeRate;
  const address = [customer.address.city, customer.address.state].filter(Boolean).join(", ");
  const debtTone =
    customer.status === "inactive"
      ? "bg-slate-200 text-slate-700"
      : pendingDebtUsd === 0
        ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]"
        : pendingDebtUsd > 80
          ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
          : "bg-[var(--color-accent-soft)] text-orange-800";

  return {
    id,
    code: customer.code,
    status: customer.status,
    name: customer.fullName,
    phone: customer.phone,
    address,
    purchaseDays: formatPurchaseDays(customer.purchaseDays),
    pendingDebtUsd,
    pendingDebtVes,
    debtTone,
    whatsAppLink: buildWhatsAppLink(customer.fullName, customer.phone, pendingDebtUsd, exchangeRate)
  };
}

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado al consultar Firestore.";
}
