import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const masterEmail = process.env.MASTER_EMAIL;
const masterPassword = process.env.MASTER_PASSWORD;
const masterName = process.env.MASTER_NAME ?? "Administrador Maestro";
const masterPhone = process.env.MASTER_PHONE ?? "+580000000000";

if (!serviceAccountPath) {
  throw new Error(
    "Define FIREBASE_SERVICE_ACCOUNT_PATH con la ruta absoluta del JSON de service account."
  );
}

if (!masterEmail || !masterPassword) {
  throw new Error("Define MASTER_EMAIL y MASTER_PASSWORD antes de ejecutar el script.");
}

const resolvedMasterEmail = masterEmail;
const resolvedMasterPassword = masterPassword;

const serviceAccount = JSON.parse(readFileSync(resolve(serviceAccountPath), "utf-8"));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

async function main() {
  const adminAuth = getAuth();
  const db = getFirestore();

  let userRecord;

  try {
    userRecord = await adminAuth.getUserByEmail(resolvedMasterEmail);
    console.log(`Usuario Auth ya existe: ${resolvedMasterEmail}`);
  } catch {
    userRecord = await adminAuth.createUser({
      email: resolvedMasterEmail,
      password: resolvedMasterPassword,
      displayName: masterName,
      phoneNumber: masterPhone.startsWith("+") ? masterPhone : undefined,
      emailVerified: true
    });
    console.log(`Usuario Auth creado: ${resolvedMasterEmail}`);
  }

  const now = new Date().toISOString();

  await db.collection("users").doc(userRecord.uid).set(
    {
      displayName: masterName,
      email: resolvedMasterEmail,
      phone: masterPhone,
      role: "admin",
      status: "active",
      isActive: true,
      deletedAt: null,
      branchId: "main",
      createdAt: now,
      updatedAt: now
    },
    { merge: true }
  );

  console.log(`Perfil Firestore sincronizado en users/${userRecord.uid}`);
  console.log(`UID: ${userRecord.uid}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
