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
  COLLECTIONS.users,
  COLLECTIONS.customers,
  COLLECTIONS.products,
  COLLECTIONS.productionBatches,
  COLLECTIONS.invoices,
  COLLECTIONS.payments,
  COLLECTIONS.stockMovements
] as const;

async function main() {
  for (const collectionName of collectionNames) {
    const snapshot = await db.collection(collectionName).get();

    if (snapshot.empty) {
      continue;
    }

    const batch = db.batch();
    let updates = 0;

    snapshot.docs.forEach((documentSnapshot) => {
      const data = documentSnapshot.data();

      if (typeof data.isActive === "boolean") {
        return;
      }

      batch.set(
        documentSnapshot.ref,
        {
          isActive: true,
          deletedAt: null
        },
        { merge: true }
      );
      updates += 1;
    });

    if (updates > 0) {
      await batch.commit();
      console.log(`${collectionName}: ${updates} documentos actualizados.`);
    } else {
      console.log(`${collectionName}: sin cambios.`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
