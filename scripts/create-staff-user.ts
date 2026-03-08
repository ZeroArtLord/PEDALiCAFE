import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const allowedRoles = ["admin", "manager", "sales", "production", "inventory"] as const;

type AllowedRole = (typeof allowedRoles)[number];

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const staffEmail = process.env.STAFF_EMAIL;
const staffPassword = process.env.STAFF_PASSWORD;
const staffName = process.env.STAFF_NAME ?? "Nuevo Empleado";
const staffPhone = process.env.STAFF_PHONE ?? "+580000000000";
const staffRole = (process.env.STAFF_ROLE ?? "sales") as AllowedRole;
const staffBranchId = process.env.STAFF_BRANCH_ID ?? "main";

if (!serviceAccountPath) {
  throw new Error(
    "Define FIREBASE_SERVICE_ACCOUNT_PATH con la ruta absoluta del JSON de service account."
  );
}

if (!staffEmail || !staffPassword) {
  throw new Error("Define STAFF_EMAIL y STAFF_PASSWORD antes de ejecutar el script.");
}

if (!allowedRoles.includes(staffRole)) {
  throw new Error(`STAFF_ROLE invalido. Usa uno de: ${allowedRoles.join(", ")}`);
}

const serviceAccount = JSON.parse(readFileSync(resolve(serviceAccountPath), "utf-8"));
const resolvedStaffEmail = staffEmail;
const resolvedStaffPassword = staffPassword;

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
    userRecord = await adminAuth.getUserByEmail(resolvedStaffEmail);
    console.log(`Usuario Auth ya existe: ${resolvedStaffEmail}`);
  } catch {
    userRecord = await adminAuth.createUser({
      email: resolvedStaffEmail,
      password: resolvedStaffPassword,
      displayName: staffName,
      phoneNumber: staffPhone.startsWith("+") ? staffPhone : undefined,
      emailVerified: true
    });
    console.log(`Usuario Auth creado: ${resolvedStaffEmail}`);
  }

  const now = new Date().toISOString();

  await db.collection("users").doc(userRecord.uid).set(
    {
      displayName: staffName,
      email: resolvedStaffEmail,
      phone: staffPhone,
      role: staffRole,
      status: "active",
      isActive: true,
      deletedAt: null,
      branchId: staffBranchId,
      createdAt: now,
      updatedAt: now
    },
    { merge: true }
  );

  console.log(`Perfil Firestore sincronizado en users/${userRecord.uid}`);
  console.log(`Rol asignado: ${staffRole}`);
  console.log(`UID: ${userRecord.uid}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
