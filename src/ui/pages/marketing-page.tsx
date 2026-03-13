import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Campaign, Customer, CustomerMarketing } from "../../domain/types.js";
import { createDocument, listDocuments, updateDocument } from "../../lib/firestore.js";
import { useAuth } from "../../auth/auth-provider.js";
import { PageHeader } from "../components/page-header";

type MarketingFormState = {
  id: string | null;
  segment: CustomerMarketing["segment"];
  visitsPerMonth: string;
  lastVisitAt: string;
  preferredItems: string;
  avgTicketUSD: string;
  lifetimeValueUSD: string;
};

const emptyForm: MarketingFormState = {
  id: null,
  segment: "new",
  visitsPerMonth: "0",
  lastVisitAt: "",
  preferredItems: "",
  avgTicketUSD: "0",
  lifetimeValueUSD: "0"
};

type CampaignFormState = {
  name: string;
  channel: Campaign["channel"];
  message: string;
  segment: CustomerMarketing["segment"] | "all";
  minVisitsPerMonth: string;
  minLifetimeUSD: string;
  lastVisitAfter: string;
  lastVisitBefore: string;
  preferredItems: string;
  scheduledFor: string;
};

const emptyCampaignForm: CampaignFormState = {
  name: "",
  channel: "sms",
  message: "",
  segment: "all",
  minVisitsPerMonth: "",
  minLifetimeUSD: "",
  lastVisitAfter: "",
  lastVisitBefore: "",
  preferredItems: "",
  scheduledFor: ""
};

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

function getSegmentLabel(segment: CustomerMarketing["segment"]) {
  switch (segment) {
    case "frequent":
      return "Frecuente";
    case "vip":
      return "VIP";
    case "inactive":
      return "Inactivo";
    default:
      return "Nuevo";
  }
}

export function MarketingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<MarketingFormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(emptyCampaignForm);

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => listDocuments("customers")
  });
  const campaignsQuery = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => listDocuments("campaigns")
  });

  const customers = [...(customersQuery.data ?? [])].sort((left, right) =>
    left.data.fullName.localeCompare(right.data.fullName)
  );

  const filteredCustomers = customers.filter((entry) => {
    const value = search.trim().toLowerCase();
    if (!value) {
      return true;
    }
    return entry.data.fullName.toLowerCase().includes(value);
  });

  const segments = useMemo(() => {
    return customers.reduce(
      (acc, entry) => {
        const segment = entry.data.marketing?.segment ?? "new";
        acc[segment] += 1;
        return acc;
      },
      { new: 0, frequent: 0, vip: 0, inactive: 0 }
    );
  }, [customers]);

  const campaigns = [...(campaignsQuery.data ?? [])].sort((left, right) =>
    right.data.createdAt.localeCompare(left.data.createdAt)
  );

  const updateMarketingMutation = useMutation({
    mutationFn: async () => {
      if (!formState.id) {
        throw new Error("Selecciona un cliente.");
      }

      const marketing: CustomerMarketing = {
        segment: formState.segment,
        visitsPerMonth: Number(formState.visitsPerMonth) || 0,
        lastVisitAt: formState.lastVisitAt
          ? new Date(formState.lastVisitAt).toISOString()
          : null,
        preferredItems: formState.preferredItems
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        avgTicketUSD: Number(formState.avgTicketUSD) || 0,
        lifetimeValueUSD: Number(formState.lifetimeValueUSD) || 0
      };

      await updateDocument("customers", formState.id, {
        marketing,
        updatedAt: new Date().toISOString()
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setFormState(emptyForm);
    }
  });

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      if (!campaignForm.name.trim()) {
        throw new Error("El nombre de la campana es obligatorio.");
      }

      if (!campaignForm.message.trim()) {
        throw new Error("El mensaje es obligatorio.");
      }

      const filtered = customers.filter((entry) => {
        const marketing = entry.data.marketing;
        if (campaignForm.segment !== "all") {
          if ((marketing?.segment ?? "new") !== campaignForm.segment) {
            return false;
          }
        }

        const minVisits = Number(campaignForm.minVisitsPerMonth) || 0;
        if (minVisits > 0 && (marketing?.visitsPerMonth ?? 0) < minVisits) {
          return false;
        }

        const minLifetime = Number(campaignForm.minLifetimeUSD) || 0;
        if (minLifetime > 0 && (marketing?.lifetimeValueUSD ?? 0) < minLifetime) {
          return false;
        }

        const after = campaignForm.lastVisitAfter
          ? new Date(campaignForm.lastVisitAfter).toISOString()
          : null;
        const before = campaignForm.lastVisitBefore
          ? new Date(campaignForm.lastVisitBefore).toISOString()
          : null;
        const lastVisit = marketing?.lastVisitAt ?? null;

        if (after && (!lastVisit || lastVisit < after)) {
          return false;
        }
        if (before && (!lastVisit || lastVisit > before)) {
          return false;
        }

        const preferred = campaignForm.preferredItems
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        if (preferred.length > 0) {
          const customerPreferred = marketing?.preferredItems ?? [];
          const match = preferred.some((item) => customerPreferred.includes(item));
          if (!match) {
            return false;
          }
        }

        return true;
      });

      const now = new Date().toISOString();

      const payload: Campaign = {
        name: campaignForm.name.trim(),
        channel: campaignForm.channel,
        status: campaignForm.scheduledFor ? "scheduled" : "draft",
        message: campaignForm.message.trim(),
        audience: {
          segment: campaignForm.segment,
          minVisitsPerMonth: Number(campaignForm.minVisitsPerMonth) || undefined,
          minLifetimeUSD: Number(campaignForm.minLifetimeUSD) || undefined,
          lastVisitAfter: campaignForm.lastVisitAfter
            ? new Date(campaignForm.lastVisitAfter).toISOString()
            : null,
          lastVisitBefore: campaignForm.lastVisitBefore
            ? new Date(campaignForm.lastVisitBefore).toISOString()
            : null,
          preferredItems: campaignForm.preferredItems
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        },
        estimatedRecipients: filtered.length,
        scheduledFor: campaignForm.scheduledFor
          ? new Date(campaignForm.scheduledFor).toISOString()
          : null,
        createdAt: now,
        createdBy: user?.uid ?? "frontend_user",
        sentAt: null
      };

      await createDocument("campaigns", `campaign_${Date.now()}`, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setCampaignForm(emptyCampaignForm);
    }
  });

  function loadCustomer(customerId: string, customer: Customer) {
    const marketing = customer.marketing;
    setFormState({
      id: customerId,
      segment: marketing?.segment ?? "new",
      visitsPerMonth: String(marketing?.visitsPerMonth ?? 0),
      lastVisitAt: marketing?.lastVisitAt?.slice(0, 10) ?? "",
      preferredItems: marketing?.preferredItems?.join(", ") ?? "",
      avgTicketUSD: String(marketing?.avgTicketUSD ?? 0),
      lifetimeValueUSD: String(marketing?.lifetimeValueUSD ?? 0)
    });
  }

  return (
    <div className="space-y-5">
      <section className="hero-panel glass-card reveal rounded-[34px] p-5 sm:p-6">
        <PageHeader
          eyebrow="Marketing"
          title="Segmentacion y patrones de compra"
          description="Clasifica clientes por frecuencia, ticket promedio y ultima compra."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {[
          ["Nuevos", segments.new],
          ["Frecuentes", segments.frequent],
          ["VIP", segments.vip],
          ["Inactivos", segments.inactive]
        ].map(([label, value]) => (
          <article key={label} className="panel-strong rounded-[28px] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-brand)]">{label}</p>
            <p className="mt-3 font-display text-3xl font-semibold text-[var(--color-ink)]">
              {value}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="panel-strong reveal reveal-delay-1 rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                Perfil marketing
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                Actualizar segmento
              </h2>
            </div>
            {formState.id ? (
              <button
                className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)]"
                onClick={() => setFormState(emptyForm)}
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
              void updateMarketingMutation.mutateAsync();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                Segmento
              </span>
              <select
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    segment: event.target.value as CustomerMarketing["segment"]
                  }))
                }
                value={formState.segment}
              >
                <option value="new">Nuevo</option>
                <option value="frequent">Frecuente</option>
                <option value="vip">VIP</option>
                <option value="inactive">Inactivo</option>
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Visitas / mes
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      visitsPerMonth: event.target.value
                    }))
                  }
                  type="number"
                  value={formState.visitsPerMonth}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Ultima visita
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      lastVisitAt: event.target.value
                    }))
                  }
                  type="date"
                  value={formState.lastVisitAt}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                Items preferidos
              </span>
              <input
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    preferredItems: event.target.value
                  }))
                }
                placeholder="Latte, Croissant, Espresso"
                value={formState.preferredItems}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Ticket promedio USD
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      avgTicketUSD: event.target.value
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={formState.avgTicketUSD}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Lifetime USD
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      lifetimeValueUSD: event.target.value
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={formState.lifetimeValueUSD}
                />
              </label>
            </div>

            {updateMarketingMutation.isError ? (
              <div className="rounded-[24px] bg-[var(--color-danger-soft)] px-4 py-4 text-sm text-[var(--color-danger)]">
                {getFriendlyErrorMessage(updateMarketingMutation.error)}
              </div>
            ) : null}

            {updateMarketingMutation.isSuccess ? (
              <div className="rounded-[24px] bg-[var(--color-brand-soft)] px-4 py-4 text-sm text-[var(--color-brand-deep)]">
                Segmento actualizado correctamente.
              </div>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-[26px] bg-[var(--color-brand)] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)] disabled:opacity-60"
              disabled={updateMarketingMutation.isPending}
              type="submit"
            >
              {updateMarketingMutation.isPending ? "Guardando..." : "Actualizar marketing"}
            </button>
          </form>
        </article>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                Clientes
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                Segmentacion activa
              </h2>
            </div>
            <input
              className="rounded-[20px] border border-[var(--color-line)] bg-white/80 px-3 py-2 text-sm outline-none"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente"
              value={search}
            />
          </div>

          {filteredCustomers.map((customer) => {
            const marketing = customer.data.marketing;
            const segment = marketing?.segment ?? "new";
            const visits = marketing?.visitsPerMonth ?? 0;
            const avgTicket = marketing?.avgTicketUSD ?? 0;
            const lifetime = marketing?.lifetimeValueUSD ?? 0;

            return (
              <article
                key={customer.id}
                className="panel-strong lift-hover reveal rounded-[30px] p-5 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                      {getSegmentLabel(segment)}
                    </p>
                    <h3 className="mt-2 font-display text-xl font-semibold text-[var(--color-ink)]">
                      {customer.data.fullName}
                    </h3>
                    <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                      Visitas/mes: {visits}
                    </p>
                  </div>
                  <button
                    className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)]"
                    onClick={() => loadCustomer(customer.id, customer.data)}
                    type="button"
                  >
                    Editar
                  </button>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-[var(--color-ink-soft)]">
                  <span>Ticket promedio: {formatUsd(avgTicket)}</span>
                  <span>Lifetime: {formatUsd(lifetime)}</span>
                  <span>
                    Ultima visita:{" "}
                    {marketing?.lastVisitAt
                      ? new Date(marketing.lastVisitAt).toLocaleDateString("es-VE")
                      : "Sin registro"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="panel-strong reveal reveal-delay-1 rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                Campanas
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                Crear campana
              </h2>
            </div>
            {campaignForm.name || campaignForm.message ? (
              <button
                className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold text-[var(--color-ink)] ring-1 ring-[var(--color-line)]"
                onClick={() => setCampaignForm(emptyCampaignForm)}
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
              void createCampaignMutation.mutateAsync();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                Nombre
              </span>
              <input
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setCampaignForm((current) => ({ ...current, name: event.target.value }))
                }
                value={campaignForm.name}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                Canal
              </span>
              <select
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setCampaignForm((current) => ({
                    ...current,
                    channel: event.target.value as Campaign["channel"]
                  }))
                }
                value={campaignForm.channel}
              >
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                Mensaje
              </span>
              <textarea
                className="min-h-24 w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setCampaignForm((current) => ({ ...current, message: event.target.value }))
                }
                value={campaignForm.message}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Segmento
                </span>
                <select
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      segment: event.target.value as CampaignFormState["segment"]
                    }))
                  }
                  value={campaignForm.segment}
                >
                  <option value="all">Todos</option>
                  <option value="new">Nuevo</option>
                  <option value="frequent">Frecuente</option>
                  <option value="vip">VIP</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Min visitas/mes
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      minVisitsPerMonth: event.target.value
                    }))
                  }
                  type="number"
                  value={campaignForm.minVisitsPerMonth}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Lifetime minimo USD
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  min="0"
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      minLifetimeUSD: event.target.value
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={campaignForm.minLifetimeUSD}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Preferidos
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      preferredItems: event.target.value
                    }))
                  }
                  placeholder="Latte, Croissant"
                  value={campaignForm.preferredItems}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Ultima visita desde
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      lastVisitAfter: event.target.value
                    }))
                  }
                  type="date"
                  value={campaignForm.lastVisitAfter}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                  Ultima visita hasta
                </span>
                <input
                  className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                  onChange={(event) =>
                    setCampaignForm((current) => ({
                      ...current,
                      lastVisitBefore: event.target.value
                    }))
                  }
                  type="date"
                  value={campaignForm.lastVisitBefore}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
                Programar para
              </span>
              <input
                className="w-full rounded-[24px] border border-[var(--color-line)] bg-white/80 px-4 py-3 text-base outline-none"
                onChange={(event) =>
                  setCampaignForm((current) => ({
                    ...current,
                    scheduledFor: event.target.value
                  }))
                }
                type="datetime-local"
                value={campaignForm.scheduledFor}
              />
            </label>

            {createCampaignMutation.isError ? (
              <div className="rounded-[24px] bg-[var(--color-danger-soft)] px-4 py-4 text-sm text-[var(--color-danger)]">
                {getFriendlyErrorMessage(createCampaignMutation.error)}
              </div>
            ) : null}

            {createCampaignMutation.isSuccess ? (
              <div className="rounded-[24px] bg-[var(--color-brand-soft)] px-4 py-4 text-sm text-[var(--color-brand-deep)]">
                Campana creada correctamente.
              </div>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-[26px] bg-[var(--color-brand)] px-4 py-4 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)] disabled:opacity-60"
              disabled={createCampaignMutation.isPending}
              type="submit"
            >
              {createCampaignMutation.isPending ? "Creando..." : "Crear campana"}
            </button>
          </form>
        </article>

        <div className="space-y-4">
          <article className="panel-strong rounded-[30px] p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
              Campanas creadas
            </p>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              Estas campanas no envian mensajes todavia. Se usan como backlog hasta integrar SMS.
            </p>
          </article>

          {campaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="panel-strong lift-hover reveal rounded-[30px] p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                    {campaign.data.channel.toUpperCase()}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-semibold text-[var(--color-ink)]">
                    {campaign.data.name}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                    Segmento: {campaign.data.audience.segment}
                  </p>
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    Estimado: {campaign.data.estimatedRecipients} clientes
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    campaign.data.status === "sent"
                      ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-deep)]"
                      : campaign.data.status === "scheduled"
                        ? "bg-[var(--color-accent-soft)] text-orange-800"
                        : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {campaign.data.status}
                </span>
              </div>
              <p className="mt-4 rounded-[20px] bg-white/82 px-4 py-3 text-sm text-[var(--color-ink-soft)]">
                {campaign.data.message}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
