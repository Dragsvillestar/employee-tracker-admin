// ✅ Firebase Configuration (Only Declare Once)
const firebaseConfig = {
    apiKey: "AIzaSyAeOIg82jbmV0pNamZRT_hkz4ekXawDqgc",
    authDomain: "employee-tracker-2.firebaseapp.com",
    projectId: "employee-tracker-2",
    storageBucket: "employee-tracker-2.appspot.com",
    messagingSenderId: "567769082501",
    appId: "1:567769082501:web:f87f7ea693aab6856217ec"
};

// ✅ Initialize Firebase
firebase.initializeApp(firebaseConfig);

// ✅ Ensure Firebase SDK is Loaded
if (typeof firebase === "undefined") {
    console.error("❌ Firebase SDK not loaded properly.");
}

// ✅ Initialize Firebase Authentication
const auth = firebase.auth();
let socket;  

function resendOtp() {
    phoneAuth(); // Resend OTP
    startResendCountdown(); // Restart countdown
}

function startResendCountdown() {
    let countdown = 10;
    const resendBtn = document.getElementById("resendOtpBtn");

    // Disable the resend button
    resendBtn.disabled = true;
    resendBtn.style.pointerEvents = "none";
    resendBtn.style.opacity = "0.5";

    resendBtn.textContent = `Resend OTP in (${countdown})`;

    const timer = setInterval(() => {
        countdown--;
        resendBtn.textContent = `Resend OTP in (${countdown})`;

        if (countdown === 0) {
            clearInterval(timer); // Stop the countdown
            resendBtn.disabled = false;
            resendBtn.style.pointerEvents = "auto";
            resendBtn.style.opacity = "1";
            resendBtn.textContent = "Resend OTP";
            document.getElementById("error-message").textContent = ""
        }
    }, 1000);
}

function toggleAuth(authType) {
    // Toggle between Phone and Email Auth forms
    if (authType === 'phone') {
        document.getElementById('phoneAuth').style.display = 'block';
        document.getElementById('emailSignIn').style.display = 'none';

        // Highlight the active button
        document.getElementById('phoneAuthBtn').style.borderBottom = '3px solid #007bff';
        document.getElementById('emailAuthBtn').style.borderBottom = 'none';
    } else {
        document.getElementById('phoneAuth').style.display = 'none';
        document.getElementById('emailSignIn').style.display = 'block';

        // Highlight the active button
        document.getElementById('phoneAuthBtn').style.borderBottom = 'none';
        document.getElementById('emailAuthBtn').style.borderBottom = '3px solid #007bff';
    }
}

// Initialize by showing phone auth and highlighting the phone button
window.onload = function() {
    toggleAuth('phone');
};
const formatPhoneNumber = (phone) => {
    if (phone.startsWith("0")) {
        return "+234" + phone.slice(1); // Convert 081... to +23481...
    }
    return phone; // If already in E.164 format, keep it
  };
// ✅ Render reCAPTCHA
function render() {
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        size: "normal"
    });
    recaptchaVerifier.render();
}
render();
let loginNumber;
// ✅ Send OTP
function phoneAuth() {
    const number = document.getElementById('number').value;
    const loginNumber = formatPhoneNumber(number);
    auth.signInWithPhoneNumber(loginNumber, window.recaptchaVerifier)
        .then((confirmationResult) => {
            window.confirmationResult = confirmationResult;
            setTimeout(() => {
                document.getElementById("login-form").style.display = "none";
                 document.getElementById("otpDiv").style.display = "block";
            },100)
            startResendCountdown();
            document.getElementById("error-message").textContent = "OTP Sent"
            console.log('📩 OTP Sent');
        }).catch((error) => {
            alert(error.message);
        });
}

// ✅ Verify OTP
function codeVerify() {
    var code = document.getElementById('verificationcode').value;
    if (!code) {
        alert("Please enter the OTP.");
        return;
    }

    if (typeof confirmationResult === "undefined") {
        alert("OTP verification session expired. Please try again.");
        return;
    }

    confirmationResult.confirm(code)
        .then(async (userCredential) => {
            console.log("✅ OTP Verified:", userCredential);

            const user = userCredential.user;
            const displayName = user.displayName || "No Name";
            const userId = user.uid;
            const phoneNumber = user.phoneNumber;

            console.log("🆔 User ID:", userId);
            console.log("📱 Phone Number:", phoneNumber);

            // 🔥 Fetch Custom Claims (Role & Path)
            const idTokenResult = await user.getIdTokenResult();  // ✅ Await token retrieval
            const role = idTokenResult.claims.role || "user";  // Default to 'user' if no role
            const userPath = idTokenResult.claims.userPath || "/default-path";
            const registrarID = idTokenResult.claims.registrar || "/default-path";
            const adminUid  = idTokenResult.claims.adminUid;

            sessionStorage.setItem("token", idTokenResult.token); 
            console.log(`🔹 Role: ${role}, User Path: ${userPath}`);

            socket = io({ auth: { token: idTokenResult.token } });

            socket.on("connect", () => {
                console.log("🔌 Connected to Socket.IO");
                socket.emit("manager_visited");
            });

            socket.on("connect_error", (err) => {
                console.error("❌ Socket connection error:", err.message);
            });

            if (!role) {
                alert("Access Denied: No role assigned.");
                await firebase.auth().signOut();
                return;
            };
    
            // ✅ Step 3: Allow or deny login based on role
            if (role !== "manager") {
                alert("Access Denied: You are not a manager.");
                await firebase.auth().signOut();
                return;
            };
            
            sessionStorage.setItem("userCreds", JSON.stringify({
                uid: user.uid,
                email: user.email,
                phone: user.phoneNumber,
                displayName: user.displayName,
                role: role,
                userPath: userPath,
                registrarID: registrarID,
                adminUid: adminUid
            }));

            document.getElementById("message").textContent = "✅ Sign-in successful!";

            setTimeout(() => {
                window.location.href = `/manager/home?username=${encodeURIComponent(user.displayName)}`;
            }, 1000);
        })
        .catch((error) => {
            console.error("❌ OTP Not Correct:", error);
            alert("Invalid OTP. Try again.");
        });
}

function signIn() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (!email || !password) {
        document.getElementById("message").textContent = "⚠️ Please enter email and password.";
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then(async (userCredential) => {  // ✅ Use async to handle the token fetch
            const user = userCredential.user;
            console.log("✅ Signed in:", user);

            // 🔥 Fetch Custom Claims (Role & User Path)
            const idTokenResult = await user.getIdTokenResult();  // ✅ Await token retrieval
            const role = idTokenResult.claims.role || "user";  // Default to 'user' if no role
            const userPath = idTokenResult.claims.userPath || "/default-path";
            const registrarID = idTokenResult.claims.registrar || "/default-path";
            const adminUid  = idTokenResult.claims.adminUid;
            sessionStorage.setItem("token", idTokenResult.token); 
            console.log(`🔹 Role: ${role}, User Path: ${userPath}`);
            if (!role) {
                alert("Access Denied: No role assigned.");
                await firebase.auth().signOut();
                return;
            }
    
            // ✅ Step 3: Allow or deny login based on role
            if (role !== "manager") {
                alert("Access Denied: You are not a manager.");
                await firebase.auth().signOut();
                return;
            }

            // ✅ Store user data in sessionStorage
            sessionStorage.setItem("userCreds", JSON.stringify({
                uid: user.uid,
                email: user.email,
                phone: user.phoneNumber,
                displayName: user.displayName,
                role: role,
                userPath: userPath,
                registrarID: registrarID,
                adminUid: adminUid
            }));

            document.getElementById("message").textContent = "✅ Sign-in successful!";

            setTimeout(() => {
                window.location.href = `/manager/home?username=${encodeURIComponent(user.displayName)}`;
            }, 1000); // Redirect after login
        })
        .catch((error) => {
            console.error("❌ Sign-in error:", error.message);
            document.getElementById("message").textContent = "⚠️ " + error.message;
        });
}
