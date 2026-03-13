import { useMemo, useState } from "react";

type MenuItem = {
  id: string;
  name: string;
  category: "hot" | "cold" | "dessert" | "savory";
  priceUSD: number;
};

type CartItem = {
  id: string;
  name: string;
  priceUSD: number;
  quantity: number;
};

const CATEGORIES: Array<{ id: MenuItem["category"] | "all"; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "hot", label: "Bebidas Calientes" },
  { id: "cold", label: "Bebidas Frias" },
  { id: "dessert", label: "Postres" },
  { id: "savory", label: "Salados" }
];

const MENU_ITEMS: MenuItem[] = [
  { id: "latte-12", name: "Latte 12oz", category: "hot", priceUSD: 3.5 },
  { id: "cap-12", name: "Capuccino 12oz", category: "hot", priceUSD: 3.2 },
  { id: "iced-latte", name: "Iced Latte", category: "cold", priceUSD: 3.8 },
  { id: "brownie", name: "Brownie", category: "dessert", priceUSD: 2.4 },
  { id: "croissant", name: "Croissant Jamon", category: "savory", priceUSD: 2.9 }
];

const EXCHANGE_RATE = 78.0;

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

export function PosPage() {
  const [activeCategory, setActiveCategory] = useState<
    MenuItem["category"] | "all"
  >("all");
  const [cart, setCart] = useState<CartItem[]>([]);

  const filteredItems = useMemo(() => {
    if (activeCategory === "all") {
      return MENU_ITEMS;
    }
    return MENU_ITEMS.filter((item) => item.category === activeCategory);
  }, [activeCategory]);

  const totals = useMemo(() => {
    const subtotalUSD = cart.reduce(
      (sum, item) => sum + item.priceUSD * item.quantity,
      0
    );
    const subtotalVES = subtotalUSD * EXCHANGE_RATE;
    return {
      subtotalUSD: Number(subtotalUSD.toFixed(2)),
      subtotalVES: Number(subtotalVES.toFixed(2))
    };
  }, [cart]);

  function addToCart(item: MenuItem) {
    setCart((current) => {
      const existing = current.find((entry) => entry.id === item.id);
      if (existing) {
        return current.map((entry) =>
          entry.id === item.id
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry
        );
      }
      return [
        ...current,
        { id: item.id, name: item.name, priceUSD: item.priceUSD, quantity: 1 }
      ];
    });
  }

  function updateQuantity(id: string, delta: number) {
    setCart((current) =>
      current
        .map((entry) =>
          entry.id === id
            ? { ...entry, quantity: Math.max(entry.quantity + delta, 0) }
            : entry
        )
        .filter((entry) => entry.quantity > 0)
    );
  }

  return (
    <div className="min-h-[calc(100vh-140px)]">
      <div className="grid gap-4 lg:grid-cols-[220px_1fr_360px]">
        <aside className="panel-strong reveal rounded-[28px] p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
            Categorias
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                className={`rounded-[20px] px-4 py-3 text-left text-sm font-semibold transition ${
                  activeCategory === category.id
                    ? "bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-deep))] text-white shadow-[0_14px_24px_rgba(10,67,52,0.18)]"
                    : "bg-white/80 text-[var(--color-ink-soft)] hover:bg-white hover:text-[var(--color-ink)]"
                }`}
                onClick={() => setActiveCategory(category.id)}
                type="button"
              >
                {category.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="panel-strong reveal reveal-delay-1 rounded-[28px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
                Menu
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
                Productos PEDALiCAFE
              </h2>
            </div>
            <span className="rounded-full bg-[var(--color-accent-soft)] px-3 py-2 text-xs font-semibold text-orange-800">
              {filteredItems.length} items
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                className="lift-hover rounded-[24px] border border-[var(--color-line)] bg-white/85 px-4 py-4"
              >
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  {item.name}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
                  {formatUsd(item.priceUSD)} -{" "}
                  {formatVes(item.priceUSD * EXCHANGE_RATE)}
                </p>
                <button
                  className="mt-4 inline-flex w-full items-center justify-center rounded-[20px] bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)]"
                  onClick={() => addToCart(item)}
                  type="button"
                >
                  Agregar al carrito
                </button>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel-strong reveal reveal-delay-2 rounded-[28px] p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-brand)]">
            Carrito de cobro
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--color-ink)]">
            Orden actual
          </h2>

          <div className="mt-4 space-y-3">
            {cart.length ? (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-[var(--color-line)] bg-white/85 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-ink)]">
                        {item.name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                        {formatUsd(item.priceUSD)} c/u
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-[var(--color-ink)]">
                      {formatUsd(item.priceUSD * item.quantity)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      className="h-8 w-8 rounded-full border border-[var(--color-line)] bg-white text-sm font-semibold"
                      onClick={() => updateQuantity(item.id, -1)}
                      type="button"
                    >
                      -
                    </button>
                    <span className="text-sm font-semibold text-[var(--color-ink)]">
                      {item.quantity}
                    </span>
                    <button
                      className="h-8 w-8 rounded-full border border-[var(--color-line)] bg-white text-sm font-semibold"
                      onClick={() => updateQuantity(item.id, 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-[var(--color-line)] bg-white/85 px-4 py-4 text-sm text-[var(--color-ink-soft)]">
                Agrega productos para iniciar una venta.
              </div>
            )}
          </div>

          <div className="mt-5 rounded-[22px] bg-[var(--color-surface)] px-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">Subtotal USD</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatUsd(totals.subtotalUSD)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-soft)]">Subtotal VES</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {formatVes(totals.subtotalVES)}
              </span>
            </div>
          </div>

          <button
            className="mt-5 inline-flex w-full items-center justify-center rounded-[24px] bg-[var(--color-brand)] px-4 py-4 text-base font-semibold text-white shadow-[0_18px_34px_rgba(10,67,52,0.24)] transition hover:bg-[var(--color-brand-deep)] disabled:opacity-60"
            disabled={!cart.length}
            type="button"
          >
            Procesar pago
          </button>
        </aside>
      </div>
    </div>
  );
}
