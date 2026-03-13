import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { COLLECTIONS, SETTINGS_DOCS } from "../src/domain/collections.js";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
  throw new Error(
    "Define FIREBASE_SERVICE_ACCOUNT_PATH con la ruta absoluta del JSON de service account."
  );
}

const serviceAccount = JSON.parse(readFileSync(resolve(serviceAccountPath), "utf-8"));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

async function main() {
  const settingsGeneral = await db
    .collection(COLLECTIONS.settings)
    .doc(SETTINGS_DOCS.general)
    .get();
  const settingsExchange = await db
    .collection(COLLECTIONS.settings)
    .doc(SETTINGS_DOCS.exchangeRate)
    .get();

  const summaries = await Promise.all([
    db.collection(COLLECTIONS.users).get(),
    db.collection(COLLECTIONS.customers).get(),
    db.collection(COLLECTIONS.inventoryItems).get(),
    db.collection(COLLECTIONS.menuItems).get(),
    db.collection(COLLECTIONS.sales).get(),
    db.collection(COLLECTIONS.suppliers).get(),
    db.collection(COLLECTIONS.supplierBills).get(),
    db.collection(COLLECTIONS.expenses).get(),
    db.collection(COLLECTIONS.campaigns).get(),
    db.collection(COLLECTIONS.products).get(),
    db.collection(COLLECTIONS.productionBatches).get(),
    db.collection(COLLECTIONS.invoices).get(),
    db.collection(COLLECTIONS.payments).get(),
    db.collection(COLLECTIONS.stockMovements).get()
  ]);

  const [
    users,
    customers,
    inventoryItems,
    menuItems,
    sales,
    suppliers,
    supplierBills,
    expenses,
    campaigns,
    products,
    batches,
    invoices,
    payments,
    movements
  ] = summaries;

  console.log("Firestore check:");
  console.log(`settings/general: ${settingsGeneral.exists ? "OK" : "MISSING"}`);
  console.log(`settings/exchangeRate: ${settingsExchange.exists ? "OK" : "MISSING"}`);
  console.log(`users: ${users.size}`);
  console.log(`customers: ${customers.size}`);
  console.log(`inventoryItems: ${inventoryItems.size}`);
  console.log(`menuItems: ${menuItems.size}`);
  console.log(`sales: ${sales.size}`);
  console.log(`suppliers: ${suppliers.size}`);
  console.log(`supplierBills: ${supplierBills.size}`);
  console.log(`expenses: ${expenses.size}`);
  console.log(`campaigns: ${campaigns.size}`);
  console.log(`products: ${products.size}`);
  console.log(`productionBatches: ${batches.size}`);
  console.log(`invoices: ${invoices.size}`);
  console.log(`payments: ${payments.size}`);
  console.log(`stockMovements: ${movements.size}`);

  if (settingsGeneral.exists) {
    const data = settingsGeneral.data() ?? {};
    if (typeof data.businessName === "string") {
      console.log(`businessName: ${data.businessName}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
