require('dotenv').config();
const express = require("express");
const path = require("path");
const axios = require("axios");
const router = express.Router();
const { db, auth } = require("./firebase");  

router.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "index2.html"));
});

const formatPhoneNumber = (phone) => {
    if (phone.startsWith("0")) {
        return "+234" + phone.slice(1); // Convert 081... to +23481...
    }
    return phone; // If already in E.164 format, keep it
};

router.post("/initiate-payment", async (req, res) => {
    try {
        const { email, firstName, lastName, phoneNumber, plan, amount, empNumber, password, gender, companyName } = req.body;
        console.log(`Company: ${companyName}, Email: ${email}, Plan: ${plan}, Amount: ${amount}`);

        if (!email || !amount || !companyName) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
        const tx_ref = "test_" + Date.now(); // Unique transaction ID
        const newCompanyName = companyName?.trim()?.replace(/\s+/g, "_");
        // 🔹 Store user data in Firestore under `temp_users`
        await db.collection("temp_users").doc(tx_ref).set({
            email,
            firstName,
            lastName,
            phoneNumber: formattedPhoneNumber,
            plan,
            password,
            amount,
            number: empNumber,
            gender: gender || "Not Specified",
            companyName : newCompanyName,  // Include company name
            createdAt: new Date()
        });

        const paymentData = {
            tx_ref,
            amount,
            currency: "NGN",
            redirect_url: "http://localhost:3000/payment/payment-success",
            payment_options: "card, banktransfer",
            customer: { email, name: `${firstName} ${lastName}`, phone_number: phoneNumber },
            customizations: { title: `Subscription Payment - ${plan}`, description: `Payment for ${plan} plan` }
        };
        const response = await axios.post("https://api.flutterwave.com/v3/payments", paymentData, {
            headers: { Authorization: `Bearer ${process.env.FW_SECRET}`, "Content-Type": "application/json" }
        });
        
        if (response.data && response.data.status === "success" && response.data.data && response.data.data.link) {
            return res.json({ success: true, paymentLink: response.data.data.link });
        } else {
            console.error("❌ Unexpected Flutterwave response:", response.data);
            return res.status(500).json({ error: "Failed to initiate payment" });
        }
        
    } catch (error) {
        console.error("Payment Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Payment failed" });
    }
});

router.post("/upgrade-payment", async (req, res) => {
    try {
        const { email, plan, amount, empNumber } = req.body;
        
        if (!email || !plan || !amount || !empNumber) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // 🔹 Retrieve the user's document based on email
        const userRef = db.collection("user2").doc("app_owner").collection("admin").where("email", "==", email);
        const snapshot = await userRef.get();

        if (snapshot.empty) {
            return res.status(404).json({ error: "User not found" });
        }

        // 🔹 Extract user data
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        const tx_ref = "upgrade_" + Date.now(); // Unique transaction ID

        // 🔹 Create Flutterwave payment request
        const paymentData = {
            tx_ref,
            amount,
            currency: "NGN",
            redirect_url: "http://localhost:3000/payment/payment-success",
            payment_options: "card, banktransfer",
            customer: { email, name: userData.firstName + " " + userData.lastName },
            customizations: { title: `Plan Upgrade - ${plan}`, description: `Upgrading to ${plan} plan` }
        };

        const response = await axios.post("https://api.flutterwave.com/v3/payments", paymentData, {
            headers: { Authorization: `Bearer ${process.env.FW_SECRET}`, "Content-Type": "application/json" }
        });

        if (response.data.status === "success") {
            // 🔹 Store pending transaction in Firestore under `temp_users`
            await db.collection("temp_payments").doc(tx_ref).set({
                email,
                plan,
                amount,
                number: parseInt(empNumber),
                companyName: userData.companyName,
                isUpgrade: true,  // 🟢 Flag to distinguish from new users
                createdAt: new Date()
            });

            console.log(`✅ Upgrade initiated for ${email}, awaiting payment confirmation.`);
            return res.json({ success: true, paymentLink: response.data.data.link });
        } else {
            return res.status(500).json({ error: "Failed to initiate payment" });
        }

    } catch (error) {
        console.error("❌ Upgrade Error:", error.message);
        res.status(500).json({ error: "Failed to upgrade plan" });
    }
});
// Flutterwave webhook for payment confirmation
router.post("/flutterwave-webhook", async (req, res) => {
    const payload = req.body;

    // ✅ Verify Flutterwave Signature
    const secretHash = process.env.FLW_SECRET_HASH;
    const flutterwaveSignature = req.headers["verif-hash"];
    if (!flutterwaveSignature || flutterwaveSignature !== secretHash) {
        return res.status(403).json({ error: "Invalid signature" });
    }

    if (payload.status === "successful") {
        const email = payload.customer.email;
        const transactionId = payload.txRef;
        console.log("✅ Payment successful for:", email);

        // 🔹 Check if it's a new user registration
        const tempUserDoc = await db.collection("temp_users").doc(transactionId).get();
        if (tempUserDoc.exists) {
            const userData = tempUserDoc.data();

            try {
                // ✅ Create Firebase Auth User
                const newUser = await auth.createUser({
                    email: userData.email,
                    password: userData.password, 
                    displayName: `${userData.firstName} ${userData.lastName}`,
                    phoneNumber: userData.phoneNumber || null
                });

                console.log(`✅ Firebase Auth user created: ${newUser.uid}`);

                await auth.setCustomUserClaims(newUser.uid, { role: "admin" });

                // ✅ Store user in Firestore
                await db.collection("user2").doc("app_owner").collection("admin").doc(userData.companyName).set({
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    gender: userData.gender,
                    phoneNumber: userData.phoneNumber,
                    email: userData.email,
                    uid: newUser.uid,
                    companyName: userData.companyName,
                    registeredAt: new Date(),
                    transactionId,
                    role: "admin",
                    plan: userData.plan,
                    amount: userData.amount,
                    number: parseInt(userData.number),
                    employeeCount: 0,
                    status: "active",
                    subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
                });

                console.log(`✅ User ${email} registered under company: ${userData.companyName}`);

                // 🔹 Delete temporary user data
                await db.collection("temp_users").doc(transactionId).delete();

                // 🔹 Redirect to success page ✅
                return res.redirect("/payment-success");

            } catch (error) {
                console.error("❌ User registration error:", error.message);
                return res.status(500).json({ error: "Error during user registration" });
                return res.redirect("/payment-failed");
            }
        }

        // 🔹 Check if it's a plan upgrade
        const paymentDoc = await db.collection("temp_payments").doc(transactionId).get();
        if (paymentDoc.exists) {
            console.log("📌 Processing plan upgrade...");
            const paymentData = paymentDoc.data();

            // 🔹 Retrieve the user's document
            const userQuery = db.collection("user2")
                .doc("app_owner")
                .collection("admin")
                .where("email", "==", email)
                .limit(1);

            const snapshot = await userQuery.get();
            if (snapshot.empty) {
                console.error("❌ User not found:", email);
                return res.status(404).json({ error: "User not found" });
            }

            const userDoc = snapshot.docs[0];

            // 🔹 Extend subscription expiry date
            let newExpiryDate;
            if (userDoc.data().subscriptionExpiresAt) {
                newExpiryDate = new Date(userDoc.data().subscriptionExpiresAt.toDate().getTime() + 30 * 24 * 60 * 60 * 1000);
            } else {
                newExpiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            }

            // 🔹 Update user plan
            await userDoc.ref.update({
                plan: paymentData.plan,
                amount: paymentData.amount,
                number: paymentData.number,
                subscriptionExpiresAt: newExpiryDate,
                subscriptionUpdatedAt: new Date()
            });

            console.log(`✅ Plan upgraded: ${email} -> ${paymentData.plan}`);

            // 🔹 Delete temporary payment record
            await db.collection("temp_payments").doc(transactionId).delete();

            // 🔹 Redirect to success page ✅
            return res.redirect("/payment-success");
        }

        return res.status(400).json({ error: "No matching payment found" });
    }

    console.log("❌ Payment failed:", payload.status);
    return res.redirect("/payment-failed");
});



router.get("/payment-success", (req, res) => {
    console.log("✅ Payment success page hit!");
    res.render("payment-success", {
        message: "Your payment was successful! Thank you. 🎉"
    });
});

router.get("/payment-failed", (req, res) => {
    console.log("❌ Payment failed page hit!");
    res.render("payment-failed", {
        message: "Your payment failed. Please try again. ❌"
    });
});


module.exports = router;
