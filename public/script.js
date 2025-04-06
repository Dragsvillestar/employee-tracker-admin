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

const auth = firebase.auth();

function showSignUp() {
    document.getElementById("loginFormDiv").style.display = "none";
    document.getElementById("SignUpFormDiv").style.display = "block";
}

function showLogin() {
    document.getElementById("SignUpFormDiv").style.display = "none";
    document.getElementById("loginFormDiv").style.display = "block";
}

let userData = {}; // Global variable to store signup details

document.getElementById("SignUpForm").addEventListener("submit", async function(event) {
    event.preventDefault(); // Prevent form submission

    // Get values
    let firstName = document.getElementById("firstName").value.trim();
    let lastName = document.getElementById("lastName").value.trim();
    let gender = document.getElementById("genderSelect").value;
    let phoneNumber = document.getElementById("telNumber").value.trim();
    let email = document.getElementById("email").value.trim();
    let companyName =document.getElementById("companyName").value;
    let password = document.getElementById("password").value;
    let confirmPassword = document.getElementById("confirmPassword").value;

    // Check if passwords match
    if (password !== confirmPassword) {
        alert("Passwords do not match!");
        return;
    }

    console.log(gender);
    // Hash the password using SHA-256
   

    try {
        // Check if email already exists in the backend
        let response = await fetch("/check-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email,phoneNumber }),
        });

        let data = await response.json();
        if (data.exists) {
            alert(data.message);
            return;
        }

        // ✅ Only store user data if the email is unique
        let userData = {
            firstName,
            lastName,
            gender,
            phoneNumber,
            email,
            companyName,
            password
        };

        // Store in sessionStorage
        sessionStorage.setItem("userData", JSON.stringify(userData));

        console.log("Stored userData:", userData); // Debugging step

        // Redirect to payment selection page
        window.location.href = "/payment";
    } catch (error) {
        console.error("Error checking user:", error);
        alert("An error occurred. Please try again.");
    }
});


document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    console.log("✅ Firebase Auth Object:", firebase.auth()); // Ensure it's defined
    console.log("📌 Email:", email);
    console.log("📌 Type of Email:", typeof email);
    console.log("📌 Password:", password);
    console.log("📌 Type of Password:", typeof password);

    if (!firebase.auth()) {
        console.error("❌ Firebase Auth not initialized");
        alert("Authentication error. Please try again later.");
        return;
    }

    try {
        if (!email || !password) {
            throw new Error("Email and password are required.");
        }

        // 🔹 Use `firebase.auth().signInWithEmailAndPassword`
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        console.log("✅ Login Successful:", userCredential);

        const user = userCredential.user;
        console.log("✅ User Object:", user);         

        if (!user) {
            throw new Error("Login failed. User object is undefined.");
        }

        const idToken = await user.getIdToken();
        const idTokenResult = await user.getIdTokenResult(); 
        sessionStorage.setItem("token", idToken);
        console.log("🔹 Retrieved Role:", idTokenResult.claims.role);
        sessionStorage.setItem("token", idToken); 
        const userRole = idTokenResult.claims.role;
        if (!userRole) {
            alert("Access Denied: No role assigned.");
            await firebase.auth().signOut();
            return;
        }

        // ✅ Step 3: Allow or deny login based on role
        if (userRole !== "admin") {
            alert("Access Denied: You are not an admin.");
            await firebase.auth().signOut();
            return;
        }
        
        
        const userCreds = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || "", // If available
            phoneNumber: user.phoneNumber || "",
            role: idTokenResult.claims.role || "No Role Assigned"
        };
        sessionStorage.setItem("userCreds", JSON.stringify(userCreds));
        // Simulating a verification request to the backend
        const response = await fetch("/verify-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: idToken }),
        });

        const userData = await response.json();
        
        sessionStorage.setItem("userData", JSON.stringify(userData));

        if (response.ok) {
            console.log("✅ User Details from Firestore:", userData);
            window.location.href = "/home"; 
        } else {
            alert("User not found in Firestore");
        }

    } catch (error) {
        console.error("❌ Login Error:", error.message);
        alert(error.message || "Invalid email or password");
    }
});


