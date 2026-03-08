import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type CollectionReference,
  type DocumentData
} from "firebase/firestore";

import { COLLECTIONS, SETTINGS_DOCS } from "../domain/collections.js";
import { buildPayment, buildStockMovement } from "../domain/factories.js";
import type {
  AppUser,
  Customer,
  ExchangeRateSettings,
  GeneralSettings,
  Invoice,
  Payment,
  Product,
  ProductionBatch,
  StockMovement
} from "../domain/types.js";
import { db } from "./firebase.js";

type CollectionName =
  | "users"
  | "customers"
  | "products"
  | "productionBatches"
  | "invoices"
  | "payments"
  | "stockMovements";

type CollectionMap = {
  users: AppUser;
  customers: Customer;
  products: Product;
  productionBatches: ProductionBatch;
  invoices: Invoice;
  payments: Payment;
  stockMovements: StockMovement;
};

type SoftDeletePayload = {
  isActive: boolean;
  deletedAt: string | null;
};

function typedCollection<T>(name: string): CollectionReference<T> {
  return collection(db, name) as CollectionReference<T>;
}

function withSoftDeleteFields<T extends object>(payload: T): T & SoftDeletePayload {
  const currentPayload = payload as T & Partial<SoftDeletePayload>;

  return {
    ...currentPayload,
    isActive: currentPayload.isActive === false ? false : true,
    deletedAt:
      typeof currentPayload.deletedAt === "string" || currentPayload.deletedAt === null
        ? currentPayload.deletedAt
        : null
  };
}

export async function getExchangeRate(): Promise<ExchangeRateSettings | null> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.settings, SETTINGS_DOCS.exchangeRate));
  return snapshot.exists() ? (snapshot.data() as ExchangeRateSettings) : null;
}

export async function getGeneralSettings(): Promise<GeneralSettings | null> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.settings, SETTINGS_DOCS.general));
  return snapshot.exists() ? (snapshot.data() as GeneralSettings) : null;
}

export async function getUserProfile(userId: string): Promise<AppUser | null> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.users, userId));
  return snapshot.exists() ? (snapshot.data() as AppUser) : null;
}

export async function upsertSettings(
  documentId: keyof typeof SETTINGS_DOCS,
  payload: GeneralSettings | ExchangeRateSettings
): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.settings, SETTINGS_DOCS[documentId]), payload, { merge: true });
}

export async function createDocument<K extends CollectionName>(
  collectionName: K,
  documentId: string,
  payload: CollectionMap[K]
): Promise<void> {
  await setDoc(doc(db, COLLECTIONS[collectionName], documentId), withSoftDeleteFields(payload));
}

export async function updateDocument<K extends CollectionName>(
  collectionName: K,
  documentId: string,
  payload: Partial<CollectionMap[K]>
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS[collectionName], documentId), payload as DocumentData);
}

export async function softDeleteDocument<K extends CollectionName>(
  collectionName: K,
  documentId: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS[collectionName], documentId), {
    isActive: false,
    deletedAt: new Date().toISOString()
  } as DocumentData);
}

export async function listDocuments<K extends CollectionName>(
  collectionName: K
): Promise<Array<{ id: string; data: CollectionMap[K] }>> {
  const collectionRef = typedCollection<CollectionMap[K] & SoftDeletePayload>(
    COLLECTIONS[collectionName]
  );
  const snapshot = await getDocs(query(collectionRef, where("isActive", "==", true)));
  return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
}

export async function listInvoicesByCustomer(customerId: string) {
  const invoicesRef = typedCollection<Invoice & SoftDeletePayload>(COLLECTIONS.invoices);
  const invoicesQuery = query(
    invoicesRef,
    where("customerId", "==", customerId),
    where("isActive", "==", true)
  );
  const snapshot = await getDocs(invoicesQuery);
  return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
}

export async function createProductionBatchAndUpdateInventory(params: {
  batchId: string;
  movementId: string;
  productDocumentId: string;
  batch: ProductionBatch;
  quantityProduced: number;
  createdBy: string;
  createdAt: string;
}): Promise<void> {
  const batchRef = doc(db, COLLECTIONS.productionBatches, params.batchId);
  const productRef = doc(db, COLLECTIONS.products, params.productDocumentId);
  const movementRef = doc(db, COLLECTIONS.stockMovements, params.movementId);

  await runTransaction(db, async (transaction) => {
    const productSnapshot = await transaction.get(productRef);

    if (!productSnapshot.exists()) {
      throw new Error("No se encontro el producto para actualizar inventario.");
    }

    const product = productSnapshot.data() as Product;
    const stockBefore = product.stock.current;
    const nextCurrent = Number((stockBefore + params.quantityProduced).toFixed(2));
    const nextAvailable = Number(
      (product.stock.available + params.quantityProduced).toFixed(2)
    );

    const stockMovement = buildStockMovement({
      productId: params.productDocumentId,
      type: "production_entry",
      referenceType: "production_batch",
      referenceId: params.batchId,
      quantity: params.quantityProduced,
      stockBefore,
      createdAt: params.createdAt,
      createdBy: params.createdBy
    });

    transaction.set(batchRef, withSoftDeleteFields(params.batch));
    transaction.update(productRef, {
      stock: {
        ...product.stock,
        current: nextCurrent,
        available: nextAvailable
      },
      updatedAt: params.createdAt
    });
    transaction.set(movementRef, withSoftDeleteFields(stockMovement));
  });
}

export async function createInvoiceAndApplyEffects(params: {
  invoiceId: string;
  paymentId?: string;
  stockMovementId: string;
  customerDocumentId: string;
  productDocumentId: string;
  invoice: Invoice;
  quantitySold: number;
  createdBy: string;
  createdAt: string;
}): Promise<void> {
  const invoiceRef = doc(db, COLLECTIONS.invoices, params.invoiceId);
  const customerRef = doc(db, COLLECTIONS.customers, params.customerDocumentId);
  const productRef = doc(db, COLLECTIONS.products, params.productDocumentId);
  const movementRef = doc(db, COLLECTIONS.stockMovements, params.stockMovementId);
  const paymentRef = params.paymentId
    ? doc(db, COLLECTIONS.payments, params.paymentId)
    : null;

  await runTransaction(db, async (transaction) => {
    const customerSnapshot = await transaction.get(customerRef);
    const productSnapshot = await transaction.get(productRef);

    if (!customerSnapshot.exists()) {
      throw new Error("No se encontro el cliente seleccionado.");
    }

    if (!productSnapshot.exists()) {
      throw new Error("No se encontro el producto seleccionado.");
    }

    const customer = customerSnapshot.data() as Customer;
    const product = productSnapshot.data() as Product;
    const stockBefore = product.stock.current;
    const availableBefore = product.stock.available;

    if (availableBefore < params.quantitySold) {
      throw new Error("No hay stock disponible suficiente para registrar la venta.");
    }

    const nextCurrent = Number((stockBefore - params.quantitySold).toFixed(2));
    const nextAvailable = Number((availableBefore - params.quantitySold).toFixed(2));
    const nextPendingDebtUsd = Number(
      (customer.credit.pendingDebtUSD + params.invoice.payment.pendingUSD).toFixed(2)
    );
    const nextPendingDebtVes = Number(
      (customer.credit.pendingDebtVES + params.invoice.payment.pendingVES).toFixed(2)
    );

    const stockMovement = buildStockMovement({
      productId: params.productDocumentId,
      type: "sale",
      referenceType: "invoice",
      referenceId: params.invoiceId,
      quantity: params.quantitySold * -1,
      stockBefore,
      createdAt: params.createdAt,
      createdBy: params.createdBy
    });

    transaction.set(invoiceRef, withSoftDeleteFields(params.invoice));
    transaction.update(productRef, {
      stock: {
        ...product.stock,
        current: nextCurrent,
        available: nextAvailable
      },
      updatedAt: params.createdAt
    });
    transaction.set(movementRef, withSoftDeleteFields(stockMovement));

    transaction.update(customerRef, {
      credit: {
        ...customer.credit,
        pendingDebtUSD: nextPendingDebtUsd,
        pendingDebtVES: nextPendingDebtVes,
        lastUpdatedRate: params.invoice.totals.exchangeRate
      },
      stats: {
        ...customer.stats,
        totalPurchasesUSD: Number(
          (customer.stats.totalPurchasesUSD + params.invoice.totals.totalUSD).toFixed(2)
        ),
        totalPurchasesVES: Number(
          (customer.stats.totalPurchasesVES + params.invoice.totals.totalVES).toFixed(2)
        ),
        lastPurchaseAt: params.createdAt
      },
      updatedAt: params.createdAt
    });

    if (
      paymentRef &&
      (params.invoice.payment.paidUSD > 0 || params.invoice.payment.paidVES > 0)
    ) {
      const payment = buildPayment({
        customerId: params.customerDocumentId,
        invoiceId: params.invoiceId,
        amountUSD: params.invoice.payment.paidUSD,
        amountVES: params.invoice.payment.paidVES,
        exchangeRate: params.invoice.totals.exchangeRate,
        method: params.invoice.payment.method,
        receivedAt: params.createdAt,
        receivedBy: params.createdBy,
        notes: "Pago inicial registrado desde ventas"
      });

      transaction.set(paymentRef, withSoftDeleteFields(payment));
    }
  });
}

export async function registerPaymentAndApplyEffects(params: {
  paymentId: string;
  invoiceDocumentId: string;
  customerDocumentId: string;
  amountUSD: number;
  amountVES: number;
  exchangeRate: number;
  paymentMethod: Payment["method"];
  receivedBy: string;
  receivedAt: string;
  notes?: string;
}): Promise<void> {
  const invoiceRef = doc(db, COLLECTIONS.invoices, params.invoiceDocumentId);
  const customerRef = doc(db, COLLECTIONS.customers, params.customerDocumentId);
  const paymentRef = doc(db, COLLECTIONS.payments, params.paymentId);

  await runTransaction(db, async (transaction) => {
    const invoiceSnapshot = await transaction.get(invoiceRef);
    const customerSnapshot = await transaction.get(customerRef);

    if (!invoiceSnapshot.exists()) {
      throw new Error("No se encontro la factura seleccionada.");
    }

    if (!customerSnapshot.exists()) {
      throw new Error("No se encontro el cliente relacionado.");
    }

    const invoice = invoiceSnapshot.data() as Invoice;
    const customer = customerSnapshot.data() as Customer;
    const amountUSD = Number(params.amountUSD.toFixed(2));
    const amountVES = Number(params.amountVES.toFixed(2));

    if (amountUSD <= 0 && amountVES <= 0) {
      throw new Error("Debes registrar un monto en USD o en VES.");
    }

    if (invoice.payment.status === "paid") {
      throw new Error("La factura ya esta totalmente pagada.");
    }

    const appliedUsdEquivalent = Number(
      (amountUSD + amountVES / params.exchangeRate).toFixed(2)
    );
    const appliedVesEquivalent = Number(
      (amountVES + amountUSD * params.exchangeRate).toFixed(2)
    );

    if (appliedUsdEquivalent - invoice.payment.pendingUSD > 0.01) {
      throw new Error("El pago supera el saldo pendiente de la factura.");
    }

    const nextPendingUSD = Number(
      Math.max(invoice.payment.pendingUSD - appliedUsdEquivalent, 0).toFixed(2)
    );
    const nextPendingVES = Number(
      Math.max(invoice.payment.pendingVES - appliedVesEquivalent, 0).toFixed(2)
    );
    const nextPaidUSD = Number((invoice.payment.paidUSD + amountUSD).toFixed(2));
    const nextPaidVES = Number((invoice.payment.paidVES + amountVES).toFixed(2));
    const nextStatus =
      nextPendingUSD <= 0.01 && nextPendingVES <= 0.01
        ? "paid"
        : nextPaidUSD > 0 || nextPaidVES > 0
          ? "partial"
          : "pending";
    const nextCustomerPendingUSD = Number(
      Math.max(customer.credit.pendingDebtUSD - appliedUsdEquivalent, 0).toFixed(2)
    );
    const nextCustomerPendingVES = Number(
      Math.max(customer.credit.pendingDebtVES - appliedVesEquivalent, 0).toFixed(2)
    );

    const payment = buildPayment({
      customerId: params.customerDocumentId,
      invoiceId: params.invoiceDocumentId,
      amountUSD,
      amountVES,
      exchangeRate: params.exchangeRate,
      method: params.paymentMethod,
      receivedAt: params.receivedAt,
      receivedBy: params.receivedBy,
      notes: params.notes ?? "Abono registrado desde ventas"
    });

    transaction.update(invoiceRef, {
      payment: {
        ...invoice.payment,
        method: params.paymentMethod,
        status: nextStatus,
        paidUSD: nextPaidUSD,
        paidVES: nextPaidVES,
        pendingUSD: nextPendingUSD,
        pendingVES: nextPendingVES
      }
    });

    transaction.update(customerRef, {
      credit: {
        ...customer.credit,
        pendingDebtUSD: nextCustomerPendingUSD,
        pendingDebtVES: nextCustomerPendingVES,
        lastUpdatedRate: params.exchangeRate
      },
      updatedAt: params.receivedAt
    });

    transaction.set(paymentRef, withSoftDeleteFields(payment));
  });
}
