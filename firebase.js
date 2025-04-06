// firebase.js
const admin = require("firebase-admin");
const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

console.log("✅ Firestore and Auth initialized");
console.log("Firebase Admin Initialized:", admin.apps.length > 0 ? "✅ Yes" : "❌ No");

module.exports = { admin, db, auth };
