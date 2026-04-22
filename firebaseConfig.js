const admin = require("firebase-admin");
const path = require("path");
require("dotenv").config();

let db;
let bucket;
let mockMode = false;

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "serviceAccountKey.json";

function initializeFirebase() {
    try {
        const serviceAccount = require(path.resolve(serviceAccountPath));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET
        });
        db = admin.firestore();
        bucket = admin.storage().bucket();
        console.log("🔥 Firebase initialized in Node.js");
    } catch (error) {
        console.warn(`⚠️ Warning: Firebase credentials not found or invalid at ${serviceAccountPath}. Entering MOCK MODE.`);
        mockMode = true;
    }
}

initializeFirebase();

module.exports = {
    db,
    bucket,
    mockMode,
    admin
};
