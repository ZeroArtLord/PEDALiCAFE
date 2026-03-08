import type {
  AppUser,
  Customer,
  ExchangeRateSettings,
  GeneralSettings,
  Payment,
  Product,
  ProductionBatch,
  StockMovement
} from "../domain/types.js";
import {
  buildPayment,
  buildProductionBatch,
  buildStockMovement,
  calculateVesFromUsd
} from "../domain/factories.js";

export const seedGeneralSettings: GeneralSettings = {
  businessName: "Sistema de Gestion de Pulpas",
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
    email: "admin@pulpa.local",
    phone: "+584120000000",
    role: "admin",
    status: "active",
    branchId: "main",
    createdAt: "2026-03-07T10:00:00Z",
    updatedAt: "2026-03-07T10:00:00Z"
  }
};

export const seedCustomers: Record<string, Customer> = {
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
    status: "active",
    notes: "Cliente frecuente, paga los viernes",
    createdAt: "2026-03-01T09:00:00Z",
    updatedAt: "2026-03-07T10:00:00Z"
  }
};

export const seedProducts: Record<string, Product> = {
  product_001: {
    sku: "PUL-MAR-1KG",
    name: "Pulpa de Maracuya 1Kg",
    category: "pulpa",
    flavor: "maracuya",
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
    product: seedProducts.product_001,
    fruitType: "maracuya",
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

export const seedData = {
  settings: {
    general: seedGeneralSettings,
    exchangeRate: seedExchangeRate
  },
  users: seedUsers,
  customers: seedCustomers,
  products: seedProducts,
  productionBatches: seedProductionBatches,
  invoices: seedInvoices,
  payments: seedPayments,
  stockMovements: seedStockMovements
};
