// utils/firebase.js
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";

const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET;

// Only initialize if no app exists
const firebaseApp = getApps().length === 0
  ? initializeApp({
      credential: cert(JSON.parse(readFileSync('./firebaseServiceAccountKey.json', 'utf8'))),
      storageBucket: STORAGE_BUCKET,
    })
  : getApps()[0]; // Reuse existing app

const bucket = getStorage().bucket();
const firebaseAdmin = {
  auth: () => getAuth(firebaseApp),
};

export { firebaseApp, firebaseAdmin, bucket };