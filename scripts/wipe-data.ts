import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { COLLECTIONS } from "../src/domain/collections.js";

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
const collectionNames = [
  COLLECTIONS.customers,
  COLLECTIONS.inventoryItems,
  COLLECTIONS.menuItems,
  COLLECTIONS.sales,
  COLLECTIONS.suppliers,
  COLLECTIONS.supplierBills,
  COLLECTIONS.expenses,
  COLLECTIONS.campaigns,
  COLLECTIONS.products,
  COLLECTIONS.productionBatches,
  COLLECTIONS.invoices,
  COLLECTIONS.payments,
  COLLECTIONS.stockMovements
] as const;

async function deleteCollection(name: string) {
  const snapshot = await db.collection(name).get();
  if (snapshot.empty) {
    console.log(`${name}: vacio.`);
    return;
  }

  let deleted = 0;
  let batch = db.batch();
  let pending = 0;

  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    pending += 1;
    deleted += 1;

    if (pending >= 450) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  console.log(`${name}: ${deleted} documentos eliminados.`);
}

async function main() {
  for (const name of collectionNames) {
    await deleteCollection(name);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
