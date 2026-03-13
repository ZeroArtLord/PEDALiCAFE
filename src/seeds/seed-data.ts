import type {
  AppUser,
  Customer,
  ExchangeRateSettings,
  GeneralSettings,
  InventoryItem,
  MenuItem,
  Payment,
  Product,
  ProductionBatch,
  Sale,
  StockMovement
} from "../domain/types.js";
import {
  buildPayment,
  buildProductionBatch,
  buildStockMovement,
  calculateVesFromUsd
} from "../domain/factories.js";

export const seedGeneralSettings: GeneralSettings = {
  businessName: "PEDALiCAFE",
  defaultCurrency: "USD",
  supportedCurrencies: ["USD", "VES"],
  timezone: "America/Caracas",
  updatedAt: "2026-03-07T10:00:00Z"
};

export const seedExchangeRate: ExchangeRateSettings = {
  baseCurrency: "USD",
  quoteCurrency: "VES",
  rate: 78.35,
  source: "manual",
  effectiveDate: "2026-03-07",
  createdBy: "user_admin",
  updatedAt: "2026-03-07T10:00:00Z"
};

export const seedUsers: Record<string, AppUser> = {
  user_admin: {
    displayName: "Administrador Principal",
    email: "admin@pedaicafe.local",
    phone: "+584120000000",
    role: "admin",
    status: "active",
    branchId: "main",
    createdAt: "2026-03-07T10:00:00Z",
    updatedAt: "2026-03-07T10:00:00Z"
  }
};

export const seedCustomers: Record<string, Customer> = {
  customer_walkin: {
    code: "CLI-0000",
    fullName: "Consumidor Final",
    phone: "",
    address: {
      state: "",
      city: "",
      reference: ""
    },
    purchaseDays: [],
    credit: {
      enabled: false,
      creditLimitUSD: 0,
      pendingDebtUSD: 0,
      pendingDebtVES: 0,
      lastUpdatedRate: seedExchangeRate.rate
    },
    stats: {
      totalPurchasesUSD: 0,
      totalPurchasesVES: 0,
      lastPurchaseAt: null
    },
    marketing: {
      segment: "new",
      visitsPerMonth: 0,
      lastVisitAt: null,
      preferredItems: [],
      avgTicketUSD: 0,
      lifetimeValueUSD: 0
    },
    status: "active",
    notes: "Cliente generico para POS",
    createdAt: "2026-03-07T10:00:00Z",
    updatedAt: "2026-03-07T10:00:00Z"
  },
  customer_001: {
    code: "CLI-0001",
    fullName: "Maria Gonzalez",
    phone: "+584141112233",
    address: {
      state: "Aragua",
      city: "Maracay",
      reference: "Cerca de la plaza"
    },
    purchaseDays: ["monday", "thursday"],
    credit: {
      enabled: true,
      creditLimitUSD: 150,
      pendingDebtUSD: 45.5,
      pendingDebtVES: calculateVesFromUsd(45.5, seedExchangeRate.rate),
      lastUpdatedRate: seedExchangeRate.rate
    },
    stats: {
      totalPurchasesUSD: 1200,
      totalPurchasesVES: calculateVesFromUsd(1200, seedExchangeRate.rate),
      lastPurchaseAt: "2026-03-05T15:30:00Z"
    },
    marketing: {
      segment: "frequent",
      visitsPerMonth: 6,
      lastVisitAt: "2026-03-05T15:30:00Z",
      preferredItems: ["CAF-LAT-12"],
      avgTicketUSD: 4.8,
      lifetimeValueUSD: 120.5
    },
    status: "active",
    notes: "Cliente frecuente, paga los viernes",
    createdAt: "2026-03-01T09:00:00Z",
    updatedAt: "2026-03-07T10:00:00Z"
  }
};

export const seedInventoryItems: Record<string, InventoryItem> = {
  inventory_coffee_001: {
    sku: "CAF-COF-1KG",
    name: "Cafe Molido 1Kg",
    category: "coffee",
    unit: "g",
    stock: {
      current: 10000,
      minimum: 2000,
      reserved: 0,
      available: 10000
    },
    cost: {
      amountUSD: 6.5,
      amountVES: calculateVesFromUsd(6.5, seedExchangeRate.rate),
      exchangeRate: seedExchangeRate.rate,
      effectiveDate: seedExchangeRate.effectiveDate
    },
    supplier: {
      name: "Proveedor Cafe",
      lastInvoiceRef: "FAC-2001"
    },
    status: "active",
    createdAt: "2026-03-07T10:00:00Z",
    updatedAt: "2026-03-07T10:00:00Z"
  },
  inventory_milk_001: {
    sku: "MILK-WHOLE-1L",
    name: "Leche Entera 1L",
    category: "dairy",
    unit: "ml",
    stock: {
      current: 12000,
      minimum: 2000,
      reserved: 0,
      available: 12000
    },
    cost: {
      amountUSD: 1.25,
      amountVES: calculateVesFromUsd(1.25, seedExchangeRate.rate),
      exchangeRate: seedExchangeRate.rate,
      effectiveDate: seedExchangeRate.effectiveDate
    },
    supplier: {
      name: "Proveedor Lacteos",
      lastInvoiceRef: "FAC-2002"
    },
    status: "active",
    createdAt: "2026-03-07T10:00:00Z",
    updatedAt: "2026-03-07T10:00:00Z"
  },
  inventory_cup_001: {
    sku: "CUP-12OZ",
    name: "Vaso 12oz",
    category: "cup",
    unit: "unit",
    stock: {
      current: 300,
      minimum: 60,
      reserved: 0,
      available: 300
    },
    cost: {
      amountUSD: 0.08,
      amountVES: calculateVesFromUsd(0.08, seedExchangeRate.rate),
      exchangeRate: seedExchangeRate.rate,
      effectiveDate: seedExchangeRate.effectiveDate
    },
    supplier: {
      name: "Proveedor Empaques",
      lastInvoiceRef: "FAC-2003"
    },
    status: "active",
    createdAt: "2026-03-07T10:00:00Z",
    updatedAt: "2026-03-07T10:00:00Z"
  }
};

export const seedMenuItems: Record<string, MenuItem> = {
  menu_latte_001: {
    sku: "CAF-LAT-12",
    name: "Latte 12oz",
    category: "coffee",
    price: {
      saleUSD: 3.5,
      saleVES: calculateVesFromUsd(3.5, seedExchangeRate.rate)
    },
    recipe: [
      {
        inventoryItemId: "inventory_milk_001",
        nameSnapshot: "Leche Entera",
        unit: "ml",
        quantity: 180,
        costUSD: 0.22
      },
      {
        inventoryItemId: "inventory_coffee_001",
        nameSnapshot: "Cafe Molido",
        unit: "g",
        quantity: 18,
        costUSD: 0.15
      },
      {
        inventoryItemId: "inventory_cup_001",
        nameSnapshot: "Vaso 12oz",
        unit: "unit",
        quantity: 1,
        costUSD: 0.08
      }
    ],
    tags: ["hot", "latte"],
    status: "active",
    createdAt: "2026-03-07T10:00:00Z",
    updatedAt: "2026-03-07T10:00:00Z"
  }
};

export const seedProducts: Record<string, Product> = {
  product_001: {
    sku: "CAF-ARA-1KG",
    name: "Cafe Molido 1Kg",
    category: "cafe",
    flavor: "arabica",
    unit: "kg",
    presentation: "1Kg",
    stock: {
      current: 120,
      minimum: 20,
      reserved: 5,
      available: 115
    },
    cost: {
      amountUSD: 1.8,
      amountVES: calculateVesFromUsd(1.8, seedExchangeRate.rate),
      exchangeRate: seedExchangeRate.rate,
      effectiveDate: seedExchangeRate.effectiveDate
    },
    price: {
      saleUSD: 3.5,
      saleVES: calculateVesFromUsd(3.5, seedExchangeRate.rate)
    },
    productionConfig: {
      tracksBatch: true,
      yieldExpectedPercent: 65
    },
    status: "active",
    createdAt: "2026-03-01T09:00:00Z",
    updatedAt: "2026-03-07T10:00:00Z"
  }
};

export const seedProductionBatches: Record<string, ProductionBatch> = {
  batch_001: buildProductionBatch({
    batchNumber: "LOT-20260307-001",
    productDocumentId: "product_001",
    product: seedProducts.product_001,
    fruitType: "arabica",
    inputWeightKg: 100,
    netPulpKg: 62,
    rawMaterialCostUSD: 90,
    laborCostUSD: 10,
    otherCostUSD: 5,
    exchangeRate: seedExchangeRate.rate,
    supplierName: "Proveedor Local",
    supplierInvoiceRef: "FAC-9981",
    productionDate: "2026-03-07T14:00:00Z",
    createdBy: "user_admin",
    notes: "Merma normal por calidad de fruta"
  })
};

export const seedPayments: Record<string, Payment> = {
  payment_001: buildPayment({
    customerId: "customer_001",
    invoiceId: "invoice_001",
    amountUSD: 20,
    amountVES: 1000,
    exchangeRate: seedExchangeRate.rate,
    method: "mixed",
    receivedAt: "2026-03-07T16:00:00Z",
    receivedBy: "user_admin",
    notes: "Abono inicial"
  })
};

export const seedStockMovements: Record<string, StockMovement> = {
  movement_001: buildStockMovement({
    productId: "product_001",
    type: "production_entry",
    referenceType: "production_batch",
    referenceId: "batch_001",
    quantity: 62,
    stockBefore: 58,
    createdAt: "2026-03-07T14:00:00Z",
    createdBy: "user_admin"
  })
};

export const seedInvoices = {
  invoice_001: {
    invoiceNumber: "FV-20260307-0001",
    customerId: "customer_001",
    customerSnapshot: {
      fullName: seedCustomers.customer_001.fullName,
      phone: seedCustomers.customer_001.phone
    },
    items: [
      {
        productId: "product_001",
        sku: seedProducts.product_001.sku,
        name: seedProducts.product_001.name,
        quantity: 10,
        unitPriceUSD: 3.5,
        unitPriceVES: calculateVesFromUsd(3.5, seedExchangeRate.rate),
        subtotalUSD: 35,
        subtotalVES: calculateVesFromUsd(35, seedExchangeRate.rate)
      }
    ],
    totals: {
      subtotalUSD: 35,
      subtotalVES: calculateVesFromUsd(35, seedExchangeRate.rate),
      discountUSD: 0,
      discountVES: 0,
      taxUSD: 0,
      taxVES: 0,
      totalUSD: 35,
      totalVES: calculateVesFromUsd(35, seedExchangeRate.rate),
      exchangeRate: seedExchangeRate.rate
    },
    payment: {
      method: "mixed",
      status: "partial",
      paidUSD: 20,
      paidVES: 1000,
      pendingUSD: 15,
      pendingVES: calculateVesFromUsd(35, seedExchangeRate.rate) - 1000
    },
    saleType: "credit",
    status: "issued",
    issuedAt: "2026-03-07T15:00:00Z",
    createdBy: "user_admin"
  }
};

export const seedSales: Record<string, Sale> = {
  sale_001: {
    invoiceNumber: "POS-20260307-0001",
    customerId: "customer_001",
    customerSnapshot: {
      fullName: seedCustomers.customer_001.fullName,
      phone: seedCustomers.customer_001.phone
    },
    items: [
      {
        menuItemId: "menu_latte_001",
        sku: seedMenuItems.menu_latte_001.sku,
        name: seedMenuItems.menu_latte_001.name,
        quantity: 2,
        unitPriceUSD: 3.5,
        unitPriceVES: calculateVesFromUsd(3.5, seedExchangeRate.rate),
        subtotalUSD: 7,
        subtotalVES: calculateVesFromUsd(7, seedExchangeRate.rate)
      }
    ],
    totals: {
      subtotalUSD: 7,
      subtotalVES: calculateVesFromUsd(7, seedExchangeRate.rate),
      discountUSD: 0,
      discountVES: 0,
      taxUSD: 0,
      taxVES: 0,
      totalUSD: 7,
      totalVES: calculateVesFromUsd(7, seedExchangeRate.rate),
      exchangeRate: seedExchangeRate.rate
    },
    payment: {
      method: "cash_usd",
      status: "paid",
      paidUSD: 7,
      paidVES: 0,
      pendingUSD: 0,
      pendingVES: 0
    },
    status: "issued",
    issuedAt: "2026-03-07T15:20:00Z",
    createdBy: "user_admin"
  }
};

export const seedData = {
  settings: {
    general: seedGeneralSettings,
    exchangeRate: seedExchangeRate
  },
  users: seedUsers,
  customers: seedCustomers,
  inventoryItems: seedInventoryItems,
  menuItems: seedMenuItems,
  sales: seedSales,
  products: seedProducts,
  productionBatches: seedProductionBatches,
  invoices: seedInvoices,
  payments: seedPayments,
  stockMovements: seedStockMovements
};
