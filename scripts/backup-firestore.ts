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

async function fetchCollection(name: string) {
  const snapshot = await db.collection(name).get();
  const data: Record<string, unknown> = {};

  snapshot.docs.forEach((doc) => {
    data[doc.id] = doc.data();
  });

  return data;
}

async function main() {
  const [settingsGeneral, settingsExchange] = await Promise.all([
    db.collection(COLLECTIONS.settings).doc(SETTINGS_DOCS.general).get(),
    db.collection(COLLECTIONS.settings).doc(SETTINGS_DOCS.exchangeRate).get()
  ]);

  const collectionNames = [
    COLLECTIONS.users,
    COLLECTIONS.customers,
    COLLECTIONS.inventoryItems,
    COLLECTIONS.menuItems,
    COLLECTIONS.sales,
    COLLECTIONS.products,
    COLLECTIONS.productionBatches,
    COLLECTIONS.invoices,
    COLLECTIONS.payments,
    COLLECTIONS.stockMovements
  ];

  const collections = await Promise.all(collectionNames.map(fetchCollection));

  const payload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    settings: {
      general: settingsGeneral.exists ? settingsGeneral.data() : null,
      exchangeRate: settingsExchange.exists ? settingsExchange.data() : null
    }
  };

  collectionNames.forEach((name, index) => {
    payload[name] = collections[index];
  });

  process.stdout.write(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
