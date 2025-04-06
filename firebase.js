// firebase.js
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin-key-new.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

console.log("✅ Firestore and Auth initialized");
console.log("Firebase Admin Initialized:", admin.apps.length > 0 ? "✅ Yes" : "❌ No");

module.exports = { admin, db, auth };
