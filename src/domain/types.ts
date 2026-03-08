export type CurrencyCode = "USD" | "VES";
export type UserRole = "admin" | "manager" | "sales" | "production" | "inventory";
export type EntityStatus = "active" | "inactive";
export type InvoiceStatus = "draft" | "issued" | "cancelled";
export type PaymentStatus = "pending" | "partial" | "paid";
export type SaleType = "cash" | "credit";
export type MovementType = "production_entry" | "sale" | "manual_adjustment";
export type ReferenceType = "production_batch" | "invoice" | "manual_adjustment";
export type PaymentMethod =
  | "cash_usd"
  | "cash_ves"
  | "transfer_ves"
  | "zelle"
  | "mixed";
export type PurchaseDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface TimestampFields {
  createdAt: string;
  updatedAt: string;
}

export interface SoftDeleteFields {
  isActive?: boolean;
  deletedAt?: string | null;
}

export interface AppUser extends TimestampFields, SoftDeleteFields {
  displayName: string;
  email: string;
  phone: string;
  role: UserRole;
  status: EntityStatus;
  branchId: string;
}

export interface GeneralSettings {
  businessName: string;
  defaultCurrency: CurrencyCode;
  supportedCurrencies: CurrencyCode[];
  timezone: string;
  updatedAt: string;
}

export interface ExchangeRateSettings {
  baseCurrency: "USD";
  quoteCurrency: "VES";
  rate: number;
  source: "manual" | "api";
  effectiveDate: string;
  createdBy: string;
  updatedAt: string;
}

export interface MoneyPair {
  amountUSD: number;
  amountVES: number;
  exchangeRate: number;
  effectiveDate: string;
}

export interface CustomerCredit {
  enabled: boolean;
  creditLimitUSD: number;
  pendingDebtUSD: number;
  pendingDebtVES: number;
  lastUpdatedRate: number;
}

export interface CustomerStats {
  totalPurchasesUSD: number;
  totalPurchasesVES: number;
  lastPurchaseAt: string | null;
}

export interface Customer extends TimestampFields, SoftDeleteFields {
  code: string;
  fullName: string;
  phone: string;
  address: {
    state: string;
    city: string;
    reference: string;
  };
  purchaseDays: PurchaseDay[];
  credit: CustomerCredit;
  stats: CustomerStats;
  status: EntityStatus;
  notes: string;
}

export interface ProductStock {
  current: number;
  minimum: number;
  reserved: number;
  available: number;
}

export interface ProductCost extends MoneyPair {}

export interface ProductPrice {
  saleUSD: number;
  saleVES: number;
}

export interface Product extends TimestampFields, SoftDeleteFields {
  sku: string;
  name: string;
  category: "pulpa";
  flavor: string;
  unit: "kg";
  presentation: string;
  stock: ProductStock;
  cost: ProductCost;
  price: ProductPrice;
  productionConfig: {
    tracksBatch: boolean;
    yieldExpectedPercent: number;
  };
  status: EntityStatus;
}

export interface ProductionBatch extends SoftDeleteFields {
  batchNumber: string;
  productId: string;
  productNameSnapshot: string;
  rawMaterial: {
    fruitType: string;
    inputWeightKg: number;
    supplierName: string;
    supplierInvoiceRef: string;
  };
  output: {
    netPulpKg: number;
    wasteKg: number;
    yieldPercent: number;
    lossPercent: number;
  };
  costSummary: {
    rawMaterialCostUSD: number;
    rawMaterialCostVES: number;
    laborCostUSD: number;
    otherCostUSD: number;
    totalCostUSD: number;
    unitCostPerKgUSD: number;
    exchangeRate: number;
  };
  dates: {
    productionDate: string;
    createdAt: string;
  };
  createdBy: string;
  notes: string;
}

export interface InvoiceItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceUSD: number;
  unitPriceVES: number;
  subtotalUSD: number;
  subtotalVES: number;
}

export interface Invoice extends SoftDeleteFields {
  invoiceNumber: string;
  customerId: string;
  customerSnapshot: {
    fullName: string;
    phone: string;
  };
  items: InvoiceItem[];
  totals: {
    subtotalUSD: number;
    subtotalVES: number;
    discountUSD: number;
    discountVES: number;
    taxUSD: number;
    taxVES: number;
    totalUSD: number;
    totalVES: number;
    exchangeRate: number;
  };
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    paidUSD: number;
    paidVES: number;
    pendingUSD: number;
    pendingVES: number;
  };
  saleType: SaleType;
  status: InvoiceStatus;
  issuedAt: string;
  createdBy: string;
}

export interface Payment extends SoftDeleteFields {
  customerId: string;
  invoiceId: string;
  amountUSD: number;
  amountVES: number;
  exchangeRate: number;
  method: PaymentMethod;
  receivedAt: string;
  receivedBy: string;
  notes: string;
}

export interface StockMovement extends SoftDeleteFields {
  productId: string;
  type: MovementType;
  referenceType: ReferenceType;
  referenceId: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  createdAt: string;
  createdBy: string;
}

export interface FirestoreSchema {
  users: AppUser;
  settings_general: GeneralSettings;
  settings_exchangeRate: ExchangeRateSettings;
  customers: Customer;
  products: Product;
  productionBatches: ProductionBatch;
  invoices: Invoice;
  payments: Payment;
  stockMovements: StockMovement;
}
