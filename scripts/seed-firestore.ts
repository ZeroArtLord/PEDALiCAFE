import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { COLLECTIONS, SETTINGS_DOCS } from "../src/domain/collections.js";
import { seedData } from "../src/seeds/seed-data.js";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
  throw new Error(
    "Define FIREBASE_SERVICE_ACCOUNT_PATH con la ruta absoluta del JSON de service account."
  );
}

const serviceAccount = JSON.parse(
  readFileSync(resolve(serviceAccountPath), "utf-8")
);

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

function withSoftDeleteFields<T extends object>(payload: T) {
  const currentPayload = payload as T & { isActive?: boolean; deletedAt?: unknown };

  return {
    ...currentPayload,
    isActive: currentPayload.isActive === false ? false : true,
    deletedAt:
      typeof currentPayload.deletedAt === "string" || currentPayload.deletedAt === null
        ? currentPayload.deletedAt
        : null
  };
}

async function setBatchDocuments<T extends Record<string, unknown>>(
  collectionName: string,
  records: T
) {
  const writes = Object.entries(records).map(([id, payload]) =>
    db
      .collection(collectionName)
      .doc(id)
      .set(withSoftDeleteFields(payload as object) as FirebaseFirestore.DocumentData, { merge: true })
  );

  await Promise.all(writes);
}

async function main() {
  await db
    .collection(COLLECTIONS.settings)
    .doc(SETTINGS_DOCS.general)
    .set(seedData.settings.general, { merge: true });

  await db
    .collection(COLLECTIONS.settings)
    .doc(SETTINGS_DOCS.exchangeRate)
    .set(seedData.settings.exchangeRate, { merge: true });

  await setBatchDocuments(COLLECTIONS.users, seedData.users);
  await setBatchDocuments(COLLECTIONS.customers, seedData.customers);
  await setBatchDocuments(COLLECTIONS.products, seedData.products);
  await setBatchDocuments(COLLECTIONS.productionBatches, seedData.productionBatches);
  await setBatchDocuments(COLLECTIONS.invoices, seedData.invoices);
  await setBatchDocuments(COLLECTIONS.payments, seedData.payments);
  await setBatchDocuments(COLLECTIONS.stockMovements, seedData.stockMovements);

  console.log("Seed cargado en Firestore.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
