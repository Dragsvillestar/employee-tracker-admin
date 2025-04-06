const firebaseConfig = {
    apiKey: "AIzaSyAeOIg82jbmV0pNamZRT_hkz4ekXawDqgc",
    authDomain: "employee-tracker-2.firebaseapp.com",
    projectId: "employee-tracker-2",
    storageBucket: "employee-tracker-2.firebasestorage.app",
    messagingSenderId: "567769082501",
    appId: "1:567769082501:web:f87f7ea693aab6856217ec"
  };

firebase.initializeApp(firebaseConfig);

if (typeof firebase === "undefined") {
    console.error("Firebase SDK not loaded");
}
let empNumber;
const auth = firebase.auth();
const db = firebase.firestore();
// ✅ Enable authentication persistence (important!)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
        console.log("Auth persistence set to LOCAL (remains after reload)");
    })
    .catch((error) => {
        console.error("Error setting auth persistence:", error);
    });

// ✅ Listen for authentication state changes
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("✅ User is signed in:", user);
    } else {
        console.log("❌ No user signed in.");
    }
});

async function verifyToken(user) {
    try {
        const idToken = await user.getIdToken();
        let response = await fetch("/verify-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: idToken }),
        });

        let result = await response.json();
        if (result.success) {
            console.log("✅ Token verified on backend.");
        } else {
            console.error("❌ Token verification failed.");
        }
    } catch (error) {
        console.error("❌ Error verifying token:", error);
    }
}


function displayPlans() {
    empNumber = document.getElementById("empNumber").value;

    if (empNumber !== "") {
        document.getElementById("plan-container").style.display = "block";     
    }
   
    let planPrices = document.getElementsByClassName("priceSpan");
    let totalAmount = [];

    // Convert HTMLCollection to an array before using forEach
    Array.from(planPrices).forEach((plan, index) => {
        totalAmount[index] = empNumber * Number(plan.textContent);
    });

    const payNowSpans = document.getElementsByClassName("pay-btnSpan");
    Array.from(payNowSpans).forEach((span, index) => {
        span.textContent = totalAmount[index];
    });
    console.log(totalAmount);
}

let userData = JSON.parse(sessionStorage.getItem("userData"));
console.log(userData);

async function processPayment(plan, amount) {
    // Retrieve stored user data
    let userData = JSON.parse(sessionStorage.getItem("userData"));
    if (!userData) {
        alert("Session expired! Please sign up again.");
        window.location.href = "/";
        return;
    }

    console.log("Plan:", plan);
    console.log("Amount:", amount);
    console.log(userData);

    try {
        let response = await fetch("/payment/initiate-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...userData, plan, amount, empNumber }),
        });

        let data = await response.json();
        if (data.paymentLink) {
            window.location.href = data.paymentLink; // Redirect to Flutterwave payment page
        } else {
            alert("Payment failed to start!");
        }
    } catch (error) {
        console.error("Payment error:", error);
    }
}

document.querySelectorAll(".pay-btn").forEach(button => {
    button.addEventListener("click", function () {
        let planDiv = this.closest(".plan"); // Get the parent .plan div
        let planName = planDiv.querySelector("h2").textContent; // Extract plan name
        let amount = planDiv.querySelector(".pay-btnSpan").textContent; // Extract amount from pay-btnSpan
       
       processPayment(planName, amount);
    });
});
