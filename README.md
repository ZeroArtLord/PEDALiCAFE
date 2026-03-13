# PEDALiCAFE

Base inicial del MVP de un ERP/CRM web para un negocio pequeno en Venezuela, orientado a React + Firebase + Firestore. Esta entrega deja lista la capa de datos, configuracion base y un frontend React mobile-first inicial.

## Lo que ya queda hecho

- Modelo NoSQL detallado para Firestore.
- Tipos TypeScript del dominio bimonetario USD/VES.
- Helpers iniciales para Firebase y Firestore.
- Datos semilla de ejemplo.
- Reglas e indices base de Firestore.
- Script para cargar la semilla directamente a Firestore.
- Base del frontend con React, Vite y Tailwind CSS.

## Estructura

- `src/domain/types.ts`: tipos del dominio.
- `src/domain/collections.ts`: nombres de colecciones y documentos fijos.
- `src/domain/factories.ts`: calculos de facturas, pagos, produccion y movimientos.
- `src/lib/firebase.ts`: inicializacion de Firebase.
- `src/lib/firestore.ts`: operaciones base sobre Firestore.
- `src/seeds/seed-data.ts`: documentos semilla.
- `src/ui/`: shell de la aplicacion y pantallas iniciales.
- `src/router.tsx`: rutas principales del MVP.
- `firestore.rules`: reglas de acceso iniciales.
- `firestore.indexes.json`: indices recomendados.

## Colecciones Firestore

- `users`
- `settings/general`
- `settings/exchangeRate`
- `customers`
- `products`
- `productionBatches`
- `invoices`
- `payments`
- `stockMovements`

## Relacion entre colecciones

- `settings/exchangeRate` guarda la tasa del dia y se replica como snapshot en facturas, costos y pagos.
- `customers` se relaciona con `invoices` y `payments`.
- `products` se relaciona con `productionBatches`, `invoices` y `stockMovements`.
- `productionBatches` registra el insumo vs producto neto para calcular merma.
- `invoices` representa ventas y cuentas por cobrar.
- `payments` permite abonos parciales por factura.
- `stockMovements` funciona como kardex operativo.

## Pendiente de tu lado

1. Crear el proyecto en Firebase Console.
2. Activar Authentication y Firestore.
3. Copiar `.env.example` a `.env` y completar las credenciales reales.
4. Instalar dependencias con `npm install`.
5. Publicar reglas e indices con Firebase CLI:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

6. Exportar la ruta del service account y cargar la semilla:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\ruta\service-account.json"
npm run seed:firestore
```

## Ejecutar frontend

```bash
npm run dev
```

## Publicar en GitHub Pages

Este proyecto usa Vite con `base` configurado para `PEDALiCAFE`. Para publicar:

```bash
npm run deploy
```

## Crear usuario maestro

Con un service account cargado, puedes crear un administrador real en Firebase Auth y en `users`:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\ruta\service-account.json"
$env:MASTER_EMAIL="admin@pedaicafe.local"
$env:MASTER_PASSWORD="TuClaveSegura123!"
$env:MASTER_NAME="Administrador Maestro"
$env:MASTER_PHONE="+584120000000"
npm run create:master-user
```

## Crear empleados reales

Con un service account cargado, puedes crear cuentas Auth reales para vendedores, produccion, inventario o managers:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\ruta\service-account.json"
$env:STAFF_EMAIL="ventas1@pedaicafe.local"
$env:STAFF_PASSWORD="ClaveSegura123!"
$env:STAFF_NAME="Vendedor Uno"
$env:STAFF_PHONE="+584120000001"
$env:STAFF_ROLE="sales"
$env:STAFF_BRANCH_ID="main"
npm run create:staff-user
```

Roles validos:

- `admin`
- `manager`
- `sales`
- `production`
- `inventory`

## Siguiente paso recomendado

Conectar datos reales y completar CRUD sobre los modulos:

- Dashboard
- Clientes
- Inventario
- Produccion
- Ventas / Facturas

## Nota tecnica

Para historicos correctos en entorno bimonetario, cada transaccion guarda valores en USD y VES junto con la tasa usada en ese momento.
