import type {
  Customer,
  ExchangeRateSettings,
  Invoice,
  InvoiceItem,
  Payment,
  Product,
  ProductionBatch,
  StockMovement
} from "./types.js";

export function calculateVesFromUsd(amountUSD: number, rate: number): number {
  return Number((amountUSD * rate).toFixed(2));
}

export function buildInvoiceItem(input: {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceUSD: number;
  exchangeRate: number;
}): InvoiceItem {
  const subtotalUSD = Number((input.quantity * input.unitPriceUSD).toFixed(2));
  const unitPriceVES = calculateVesFromUsd(input.unitPriceUSD, input.exchangeRate);
  const subtotalVES = calculateVesFromUsd(subtotalUSD, input.exchangeRate);

  return {
    productId: input.productId,
    sku: input.sku,
    name: input.name,
    quantity: input.quantity,
    unitPriceUSD: input.unitPriceUSD,
    unitPriceVES,
    subtotalUSD,
    subtotalVES
  };
}

export function buildInvoice(params: {
  invoiceNumber: string;
  customerDocumentId: string;
  customer: Customer;
  items: InvoiceItem[];
  saleType: Invoice["saleType"];
  paymentMethod: Invoice["payment"]["method"];
  paidUSD: number;
  paidVES: number;
  exchangeRate: ExchangeRateSettings;
  createdBy: string;
  issuedAt: string;
}): Invoice {
  const subtotalUSD = Number(
    params.items.reduce((sum, item) => sum + item.subtotalUSD, 0).toFixed(2)
  );
  const subtotalVES = Number(
    params.items.reduce((sum, item) => sum + item.subtotalVES, 0).toFixed(2)
  );
  const totalUSD = subtotalUSD;
  const totalVES = subtotalVES;
  const pendingUSD = Number((totalUSD - params.paidUSD).toFixed(2));
  const pendingVES = Number((totalVES - params.paidVES).toFixed(2));

  return {
    invoiceNumber: params.invoiceNumber,
    customerId: params.customerDocumentId,
    customerSnapshot: {
      fullName: params.customer.fullName,
      phone: params.customer.phone
    },
    items: params.items,
    totals: {
      subtotalUSD,
      subtotalVES,
      discountUSD: 0,
      discountVES: 0,
      taxUSD: 0,
      taxVES: 0,
      totalUSD,
      totalVES,
      exchangeRate: params.exchangeRate.rate
    },
    payment: {
      method: params.paymentMethod,
      status: pendingUSD <= 0 && pendingVES <= 0 ? "paid" : params.paidUSD > 0 || params.paidVES > 0 ? "partial" : "pending",
      paidUSD: params.paidUSD,
      paidVES: params.paidVES,
      pendingUSD,
      pendingVES
    },
    saleType: params.saleType,
    status: "issued",
    issuedAt: params.issuedAt,
    createdBy: params.createdBy
  };
}

export function buildProductionBatch(params: {
  batchNumber: string;
  productDocumentId: string;
  product: Product;
  fruitType: string;
  inputWeightKg: number;
  netPulpKg: number;
  rawMaterialCostUSD: number;
  laborCostUSD: number;
  otherCostUSD: number;
  exchangeRate: number;
  supplierName: string;
  supplierInvoiceRef: string;
  productionDate: string;
  createdBy: string;
  notes?: string;
}): ProductionBatch {
  const wasteKg = Number((params.inputWeightKg - params.netPulpKg).toFixed(2));
  const yieldPercent = Number(((params.netPulpKg / params.inputWeightKg) * 100).toFixed(2));
  const lossPercent = Number((100 - yieldPercent).toFixed(2));
  const totalCostUSD = Number(
    (params.rawMaterialCostUSD + params.laborCostUSD + params.otherCostUSD).toFixed(2)
  );
  const unitCostPerKgUSD = Number((totalCostUSD / params.netPulpKg).toFixed(2));

  return {
    batchNumber: params.batchNumber,
    productId: params.productDocumentId,
    productNameSnapshot: params.product.name,
    rawMaterial: {
      fruitType: params.fruitType,
      inputWeightKg: params.inputWeightKg,
      supplierName: params.supplierName,
      supplierInvoiceRef: params.supplierInvoiceRef
    },
    output: {
      netPulpKg: params.netPulpKg,
      wasteKg,
      yieldPercent,
      lossPercent
    },
    costSummary: {
      rawMaterialCostUSD: params.rawMaterialCostUSD,
      rawMaterialCostVES: calculateVesFromUsd(params.rawMaterialCostUSD, params.exchangeRate),
      laborCostUSD: params.laborCostUSD,
      otherCostUSD: params.otherCostUSD,
      totalCostUSD,
      unitCostPerKgUSD,
      exchangeRate: params.exchangeRate
    },
    dates: {
      productionDate: params.productionDate,
      createdAt: params.productionDate
    },
    createdBy: params.createdBy,
    notes: params.notes ?? ""
  };
}

export function buildPayment(params: {
  customerId: string;
  invoiceId: string;
  amountUSD: number;
  amountVES: number;
  exchangeRate: number;
  method: Payment["method"];
  receivedAt: string;
  receivedBy: string;
  notes?: string;
}): Payment {
  return {
    customerId: params.customerId,
    invoiceId: params.invoiceId,
    amountUSD: params.amountUSD,
    amountVES: params.amountVES,
    exchangeRate: params.exchangeRate,
    method: params.method,
    receivedAt: params.receivedAt,
    receivedBy: params.receivedBy,
    notes: params.notes ?? ""
  };
}

export function buildStockMovement(params: {
  productId: string;
  type: StockMovement["type"];
  referenceType: StockMovement["referenceType"];
  referenceId: string;
  quantity: number;
  stockBefore: number;
  createdAt: string;
  createdBy: string;
}): StockMovement {
  const stockAfter = Number((params.stockBefore + params.quantity).toFixed(2));

  return {
    productId: params.productId,
    type: params.type,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    quantity: params.quantity,
    stockBefore: params.stockBefore,
    stockAfter,
    createdAt: params.createdAt,
    createdBy: params.createdBy
  };
}
