import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore
} from "firebase/firestore";

import firebaseConfig from "../config/firebase.js";

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch (error) {
    if (error instanceof Error) {
      console.warn(
        "No se pudo habilitar la persistencia offline multi-pestana. Se usara cache en memoria.",
        error.message
      );
    }

    return initializeFirestore(firebaseApp, {
      localCache: memoryLocalCache()
    });
  }
}

export const db = createFirestoreInstance();
