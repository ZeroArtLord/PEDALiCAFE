import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const MAX_BATCH_SIZE = 450;

async function main() {
  const productsSnapshot = await db.collection("products").get();
  const skuToId = new Map<string, string>();
  const productIds = new Set<string>();

  productsSnapshot.docs.forEach((doc) => {
    productIds.add(doc.id);
    const data = doc.data();
    if (typeof data.sku === "string") {
      skuToId.set(data.sku, doc.id);
    }
  });

  const batchesSnapshot = await db.collection("productionBatches").get();

  if (batchesSnapshot.empty) {
    console.log("productionBatches: sin documentos.");
    return;
  }

  let updates = 0;
  let skipped = 0;
  let pending = 0;
  let batch = db.batch();

  async function commitBatch() {
    if (pending === 0) {
      return;
    }

    await batch.commit();
    batch = db.batch();
    pending = 0;
  }

  for (const doc of batchesSnapshot.docs) {
    const data = doc.data();
    const current = data.productId;

    if (typeof current !== "string" || !current) {
      skipped += 1;
      continue;
    }

    if (productIds.has(current)) {
      continue;
    }

    const nextId = skuToId.get(current);

    if (!nextId) {
      skipped += 1;
      continue;
    }

    batch.update(doc.ref, { productId: nextId });
    updates += 1;
    pending += 1;

    if (pending >= MAX_BATCH_SIZE) {
      await commitBatch();
    }
  }

  await commitBatch();

  if (updates > 0) {
    console.log(`productionBatches: ${updates} actualizados.`);
  } else {
    console.log("productionBatches: sin cambios.");
  }

  if (skipped > 0) {
    console.log(`productionBatches: ${skipped} sin match.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
