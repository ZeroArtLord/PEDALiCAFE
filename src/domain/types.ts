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
export type CampaignStatus = "draft" | "scheduled" | "sent";
export type CampaignChannel = "sms" | "whatsapp" | "email";
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

export interface CustomerMarketing {
  segment: "new" | "frequent" | "vip" | "inactive";
  visitsPerMonth: number;
  lastVisitAt: string | null;
  preferredItems: string[];
  avgTicketUSD: number;
  lifetimeValueUSD: number;
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
  marketing?: CustomerMarketing;
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

export interface InventoryItem extends TimestampFields, SoftDeleteFields {
  sku: string;
  name: string;
  category: "coffee" | "dairy" | "syrup" | "cup" | "other";
  unit: "g" | "ml" | "unit";
  stock: ProductStock;
  cost: ProductCost;
  supplier?: {
    name: string;
    lastInvoiceRef: string;
  };
  status: EntityStatus;
}

export interface MenuRecipeItem {
  inventoryItemId: string;
  nameSnapshot: string;
  unit: "g" | "ml" | "unit";
  quantity: number;
  costUSD?: number;
}

export interface MenuItem extends TimestampFields, SoftDeleteFields {
  sku: string;
  name: string;
  category: "coffee" | "drink" | "food";
  price: ProductPrice;
  recipe: MenuRecipeItem[];
  tags: string[];
  status: EntityStatus;
}

export interface Supplier extends TimestampFields, SoftDeleteFields {
  name: string;
  phone: string;
  email: string;
  status: EntityStatus;
  notes: string;
}

export interface SupplierBill extends SoftDeleteFields {
  supplierId: string;
  supplierSnapshot: {
    name: string;
    phone: string;
  };
  invoiceNumber: string;
  totals: {
    totalUSD: number;
    totalVES: number;
    exchangeRate: number;
  };
  payment: {
    status: "open" | "partial" | "paid";
    paidUSD: number;
    paidVES: number;
    pendingUSD: number;
    pendingVES: number;
  };
  issuedAt: string;
  dueAt: string | null;
  createdBy: string;
}

export interface Expense extends SoftDeleteFields {
  label: string;
  category: "fixed" | "variable" | "other";
  amountUSD: number;
  amountVES: number;
  exchangeRate: number;
  paymentMethod: PaymentMethod;
  occurredAt: string;
  createdBy: string;
  notes: string;
}

export interface CampaignAudience {
  segment: CustomerMarketing["segment"] | "all";
  minVisitsPerMonth?: number;
  lastVisitAfter?: string | null;
  lastVisitBefore?: string | null;
  minLifetimeUSD?: number;
  maxLifetimeUSD?: number;
  preferredItems?: string[];
}

export interface Campaign extends SoftDeleteFields {
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  message: string;
  audience: CampaignAudience;
  estimatedRecipients: number;
  scheduledFor: string | null;
  createdAt: string;
  createdBy: string;
  sentAt?: string | null;
}

export interface Product extends TimestampFields, SoftDeleteFields {
  sku: string;
  name: string;
  category: "cafe";
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

export interface SaleItem {
  menuItemId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceUSD: number;
  unitPriceVES: number;
  subtotalUSD: number;
  subtotalVES: number;
}

export interface Sale extends SoftDeleteFields {
  invoiceNumber: string;
  customerId: string;
  customerSnapshot: {
    fullName: string;
    phone: string;
  };
  items: SaleItem[];
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
  status: InvoiceStatus;
  issuedAt: string;
  createdBy: string;
}

export interface FirestoreSchema {
  users: AppUser;
  settings_general: GeneralSettings;
  settings_exchangeRate: ExchangeRateSettings;
  customers: Customer;
  inventoryItems: InventoryItem;
  menuItems: MenuItem;
  sales: Sale;
  suppliers: Supplier;
  supplierBills: SupplierBill;
  expenses: Expense;
  campaigns: Campaign;
  products: Product;
  productionBatches: ProductionBatch;
  invoices: Invoice;
  payments: Payment;
  stockMovements: StockMovement;
}
