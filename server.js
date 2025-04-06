require('dotenv').config();
const express = require('express');
const path = require('path');
const paymentRoute = require("./payment.js");
const axios = require('axios');
const { db, auth } = require("./firebase"); 
const managerRoute = require("./manager.js");
const subordinatesRoute = require("./subordinates.js");
const recordsRoute = require("./records.js");


const app = express();
const { Server } = require("socket.io");
const http = require("http");
const server = http.createServer(app);
const io = require("socket.io")(server);



const PORT = 3000;

app.set("view engine", "pug");
app.use(express.json()); // For JSON payloads
app.use(express.urlencoded({ extended: true })); // For form submissions

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));
app.use("/payment",paymentRoute);
app.use("/manager",managerRoute);
app.use("/subordinates", subordinatesRoute);
app.use("/records", recordsRoute);

// Route to serve "serverindex.html"
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/manager/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'indexm1.html'));
});
const formatPhoneNumber = (phone) => {
  if (phone.startsWith("0")) {
      return "+234" + phone.slice(1); // Convert 081... to +23481...
  }
  return phone; // If already in E.164 format, keep it
};

const admin = require("firebase-admin");

// Ensure Firebase Admin SDK is initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(require("./firebase-admin-sdk.json")) // Use your service account JSON
    });
}

app.post("/check-user", async (req, res) => {
    try {
        console.log("🔹 /check-user API hit!");
        console.log("Received data:", req.body);

        const { email, phoneNumber } = req.body;
        if (!email && !phoneNumber) {
            return res.status(400).json({ success: false, message: "Missing email or phone number" });
        }

        const formattedPhoneNumber = phoneNumber ? formatPhoneNumber(phoneNumber) : null;

        // ✅ Reference to Firestore "admin" collection inside "users2/app_owner"
        const adminRef = db.collection("user2").doc("app_owner").collection("admin");

        let emailExists = false;
        let phoneExists = false;

        // 🔍 Check Firestore (Admin Collection)
        if (email) {
            const adminEmailSnap = await adminRef.where("email", "==", email).get();
            emailExists = !adminEmailSnap.empty;
        }

        if (formattedPhoneNumber) {
            const adminPhoneSnap = await adminRef.where("phoneNumber", "==", formattedPhoneNumber).get();
            phoneExists = !adminPhoneSnap.empty;
        }

        // 🚨 Check Firebase Authentication for email
        if (!emailExists && email) {
            try {
                await admin.auth().getUserByEmail(email);
                emailExists = true;
                console.log("✅ Email found in Firebase Authentication:", email);
            } catch (error) {
                if (error.code !== "auth/user-not-found") {
                    console.error("❌ Error checking Firebase Authentication (Email):", error);
                }
            }
        }

        // 🚨 Check Firebase Authentication for phone number
        if (!phoneExists && formattedPhoneNumber) {
            try {
                await admin.auth().getUserByPhoneNumber(formattedPhoneNumber);
                phoneExists = true;
                console.log("✅ Phone number found in Firebase Authentication:", formattedPhoneNumber);
            } catch (error) {
                if (error.code !== "auth/user-not-found") {
                    console.error("❌ Error checking Firebase Authentication (Phone):", error);
                }
            }
        }

        console.log("Final Check → Email Exists:", emailExists, "| Phone Exists:", phoneExists);

        // 🔹 Return appropriate response
        if (emailExists && phoneExists) {
            return res.status(200).json({ exists: true, message: "Both email and phone number are already in use." });
        } else if (emailExists) {
            return res.status(200).json({ exists: true, message: "Email is already in use." });
        } else if (phoneExists) {
            return res.status(200).json({ exists: true, message: "Phone number is already in use." });
        }

        res.status(200).json({ exists: false, message: "Email and phone number are available." });

    } catch (error) {
        console.error("❌ Error checking user:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ✅ Protected Route - Verifies Firebase Token
app.post("/verify-token", async (req, res) => {
  try {
      const { token } = req.body;

      // ✅ Verify Firebase Token using `auth`
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;
      console.log("✅ Token verified for user:", userId);

      // 🔹 Get User Email from Firebase Authentication
      const userRecord = await auth.getUser(userId);
      const email = userRecord.email;
       console.log("email:",email)
      // 🔹 Fetch User Data from Firestore using email
      const userDocs = await db.collection("user2")
          .doc("app_owner")
          .collection("admin")
          .where("email", "==", email)
          .get();

      if (userDocs.empty) {
          return res.status(404).json({ error: "User data not found" });
      }

      const userData = userDocs.docs[0].data();
      return res.status(200).json(userData);

  } catch (error) {
      console.error("❌ Token Verification Error:", error.message);
      return res.status(401).json({ error: "Invalid token" });
  }
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index3.html'));
});

// Express route
app.get('/reverse-geocode', async (req, res) => {
    const { lat, lon } = req.query;
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'YourAppName/1.0 (your@email.com)',
            }
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Reverse geocoding failed' });
    }
});

/*async function getUserClaims(uid) {
  try {
    const user = await auth.getUser(uid);
    console.log("Custom Claims:", user.customClaims);
    return user.customClaims;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log(`User with UID ${uid} not found.`);
      return null; // Return null instead of crashing
    }
    throw error; // Other errors should still be reported
    console.error("Error fetching user claims:", error);
    return null;
  }
}

getUserClaims("SeYpgVOBr5azEZL9csoiHoIrCvv1");

async function resetPasswordManually(email, newPassword) {
  try {
      // Get the user by email
      const user = await auth.getUserByEmail(email);

      // Update password
      await auth.updateUser(user.uid, { password: newPassword });

      console.log(`✅ Password reset successfully for ${email}`);
  } catch (error) {
      console.error("❌ Error resetting password:", error.message);
  }
}

resetPasswordManually("dragsvillestaradmin@gmail.com", "dragsville");

async function setCustomClaims(uid, role) {
  try {
      await auth.setCustomUserClaims(uid, { role });
      console.log(`✅ Custom claim updated: ${uid} -> role: "${role}"`);
  } catch (error) {
      console.error("❌ Error setting custom claim:", error.message);
  }
}

// Example usage
setCustomClaims("SeYpgVOBr5azEZL9csoiHoIrCvv1", "admin");*/

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token; // Get token from client
        if (!token) throw new Error("No token provided");

        const decodedToken = await auth.verifyIdToken(token); // Verify token
        socket.user = decodedToken; // Attach user data to socket
        next();
    } catch (error) {
        console.error("❌ Invalid token:", error.message);
        next(new Error("Authentication error"));
    }
});

const userSockets = {}; // Store user socket IDs

io.on("connection", async (socket) => {
    console.log("✅ Socket connected:", socket.id);

    const { token, targetUID } = socket.handshake.auth; 

    if (!token) {
        console.log("❌ No token provided.");
        return socket.disconnect();
    }

    try {
        // Verify the token using Firebase Admin SDK
        const decodedToken = await auth.verifyIdToken(token);
        console.log("✅ Token verified:", decodedToken);

        // Attach user details to socket
        socket.user = {
            id: socket.id,
            displayName: decodedToken.name || "Unknown",
            role: decodedToken.role || "user",
            uid: decodedToken.uid,
        };

        console.log(`🔹 User Connected: ${socket.user.displayName}, UID: ${socket.user.uid}`);

        if (userSockets[socket.user.uid]) {
            console.log(`❌ User ${socket.user.displayName} is already logged in from another device.`);

            // Send a refusal message to the client and disconnect
            socket.emit("multiple_login_refusal", {
                message: "You are already logged in from another device. Please log out first.",
            });

            // Disconnect the new socket connection
            socket.disconnect();
            return;
        }
        
        userSockets[socket.user.uid] = socket.id;
        console.log(`🟢 Socket for UID ${socket.user.uid} added: ${socket.id}`);

        if (decodedToken.role === "admin") {
            const adminRef = db.collection("user2").doc("app_owner").collection("admin").doc(socket.user.uid).collection("notifications");

            
            const snapshot = await adminRef.get();

            const previousMessages = snapshot.docs.map(doc => ({
                id: doc.id, // Add the document ID
                ...doc.data() // Spread the data of the notification document
            }));

            socket.emit("previousMessages", previousMessages);
        }
             
        // Handle notifications when a targetUID is provided
        if (targetUID) {
            socket.targetUID = targetUID;
            console.log(`🔹 User's Target Admin UID: ${targetUID}`);

            const messageData = {
                sender: socket.user.displayName,
                message: `${socket.user.displayName} just logged in!`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            };

            // Save notification under targetUID's collection
            await db.collection("user2").doc("app_owner").collection("admin").doc(targetUID).collection("notifications").add(messageData);

            // Send real-time notification if the target admin is online
            if (userSockets[targetUID]) {
                
                const targetRef = db.collection("user2")
                .doc("app_owner")
                .collection("admin")
                .doc(targetUID)
                .collection("notifications");

                const snapshot = await targetRef.get();
                const allMessages = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
        
                // Send full list
                io.to(userSockets[targetUID]).emit("previousMessages", allMessages);
        
                console.log(`📩 Sent full message list to Admin UID: ${targetUID}`);
            } else {
                console.log(`⚠️ Target Admin UID ${targetUID} not connected. Notification saved.`);
            }
        }
        socket.on("delete_notification", async (data) => {
            const { notificationId } = data;
            console.log(`❌ Deleting notification with ID: ${notificationId}`);

            // Remove the notification from the Firestore collection
            const notificationRef = db.collection("user2").doc("app_owner").collection("admin").doc(socket.user.uid).collection("notifications").doc(notificationId);
            await notificationRef.delete();
            console.log("✅ Notification deleted from Firestore.");
        });
        
        socket.on("delete_all_notifications", async () => {
            console.log(`❌ Deleting all notifications for UID: ${socket.user.uid}`);
        
            const notificationsRef = db.collection("user2")
                .doc("app_owner")
                .collection("admin")
                .doc(socket.user.uid)
                .collection("notifications");
        
            const snapshot = await notificationsRef.get();
            const batch = db.batch();
        
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
        
            await batch.commit();
            console.log("✅ All notifications deleted from Firestore.");
        });
        
        socket.on("employee_logged_out", async () => {
            console.log(`📤 Employee ${socket.user.displayName} logged out`);
            
            const messageData = {
                sender: socket.user.displayName,
                message: `${socket.user.displayName} just logged out!`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            };

            // Save notification under targetUID’s collection
            if (targetUID) {
                await db.collection("user2").doc("app_owner").collection("admin").doc(targetUID).collection("notifications").add(messageData);
                
                // Send real-time notification if target admin is online
                if (userSockets[targetUID]) {
                   const targetRef = db.collection("user2")
                .doc("app_owner")
                .collection("admin")
                .doc(targetUID)
                .collection("notifications");
                
                const snapshot = await targetRef.get();
                const allMessages = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
        
                // Send full list
                io.to(userSockets[targetUID]).emit("previousMessages", allMessages);
        
                console.log(`📩 Sent full message list to Admin UID: ${targetUID}`);
                } else {
                    console.log(`⚠️ Target Admin UID ${targetUID} not connected. Notification saved.`);
                }
            }
        });

        socket.on("clocking_status", async (data) => {
            const {message } = data;
        
            // If the targetUID is defined, store the notification in the database
            if (targetUID) {
                try {
                    await db.collection("user2")
                        .doc("app_owner")
                        .collection("admin")
                        .doc(targetUID)
                        .collection("notifications")
                        .add({ message });
        
                    console.log(`Received clocking status from ${socket.user.displayName}: ${message}`);
        
                    // If the target user is online, send them the message
                    if (userSockets[targetUID]) {
                        const targetRef = db.collection("user2")
                        .doc("app_owner")
                        .collection("admin")
                        .doc(targetUID)
                        .collection("notifications");
        
                        const snapshot = await targetRef.get();
                        const allMessages = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                
                        // Send full list
                        io.to(userSockets[targetUID]).emit("previousMessages", allMessages);
                
                        console.log(`📩 Sent full message list to Admin UID: ${targetUID}`);
                    } else {
                        console.log(`⚠️ User with UID ${targetUID} is not connected.`);
                    }
                } catch (error) {
                    console.error("❌ Error saving notification to database:", error);
                }
            }
        });
        
        socket.on("user_location", async (data) => {
            const { latitude, longitude, timestamp } = data;
            const displayName = socket.user.displayName;
            const target = socket.targetUID;
        
            if (targetUID) {
                try {
                    const ts = timestamp ? new Date(timestamp) : new Date();
                    const dateKey = ts.toISOString().split("T")[0];
                    const date = admin.firestore.Timestamp.now();
        
                    const locationPoint = {
                        latitude,
                        longitude,
                        timestamp: ts.toISOString(),
                    };
        
                    const timelineDocRef = db.collection("user2")
                        .doc("app_owner")
                        .collection("admin")
                        .doc(targetUID)
                        .collection("locations")
                        .doc("timelines-doc")
                        .collection("timelines")
                        .doc(`dateKey-${displayName}`); // Use date as document ID
        
                    const timelineDoc = await timelineDocRef.get();
        
                    if (timelineDoc.exists) {
                        // If document for today exists, append the new location
                        await timelineDocRef.update({
                            coordinates: admin.firestore.FieldValue.arrayUnion(locationPoint),
                            lastUpdated: ts.toISOString()
                        });
                    } else {
                        // Create new document with today's date
                        await timelineDocRef.set({
                            date: dateKey,
                            sender: displayName,
                            coordinates: [locationPoint], 
                            createdAt: ts.toISOString(),
                            lastUpdated: ts.toISOString()
                        });
                    }
        
                    console.log(`📍 Stored location for ${displayName} on ${dateKey}`);
        
                    // If the admin is online, send updated timeline for that day
                    if (userSockets[targetUID]) {
                        const latestSnapshot = await timelineDocRef.get();
                        const locationData = latestSnapshot.data();
        
                        io.to(userSockets[targetUID]).emit("user_location", {
                            user: displayName,
                            date: dateKey,
                            locations: locationData.coordinates,
                        });
        
                        console.log(`📩 Sent updated locations to Admin UID: ${target}`);
                    } else {
                        console.log(`⚠️ Admin with UID ${target} is not connected.`);
                    }
        
                } catch (error) {
                    console.error("❌ Error handling daily timeline update:", error);
                }
            }
        });

        socket.on("disconnect", () => {
            console.log(`❌ Socket disconnected: ${socket.id}`);
            delete userSockets[socket.user.uid]; // Remove from active sockets
        });

    } catch (error) {
        console.error("❌ Invalid token:", error);
        socket.disconnect();
    }
});



server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`); 
}); 
