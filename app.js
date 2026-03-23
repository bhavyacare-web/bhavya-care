// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyC2nYH22wkYDhh-BWfHvkT-bQvdKLCxask",
    authDomain: "bhavya-care.firebaseapp.com",
    projectId: "bhavya-care",
    storageBucket: "bhavya-care.firebasestorage.app",
    messagingSenderId: "979254809111",
    appId: "1:979254809111:web:0181e0c97277a5d0d9c252",
    measurementId: "G-G82G4VWGGT"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// AAPKA GOOGLE APPS SCRIPT URL YAHAN HAI 👇
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx_PrRVzuVvPtTXdXuO57qFe-yiTrxXDk4cAglXJnrDEXg1xVE8oJruKp1ieasoLT39/exec";

let isPartnerMode = false;

window.onload = function () {
    checkLoginState();
};

// ---------------- MENU LOGIC ---------------- //
function toggleMenu() {
    document.getElementById("myDropdown").classList.toggle("show-menu");
}

window.onclick = function(event) {
    if (!event.target.matches('.dropbtn')) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        for (var i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show-menu')) {
                dropdowns[i].classList.remove('show-menu');
            }
        }
    }
}

// ---------------- UI & STATE LOGIC ---------------- //
function checkLoginState() {
    const savedMobile = localStorage.getItem("bhavya_mobile");
    const savedRole = localStorage.getItem("bhavya_role");

    if (savedMobile) {
        document.getElementById('nav-login-btn').style.display = 'none';
        document.getElementById('menu-join').style.display = 'none';
        document.getElementById('menu-dashboard').style.display = 'block';
        document.getElementById('menu-logout').style.display = 'block';
        document.getElementById('login-section').style.display = 'none'; 
    } else {
        document.getElementById('nav-login-btn').style.display = 'inline-block';
        document.getElementById('menu-join').style.display = 'block';
        document.getElementById('menu-dashboard').style.display = 'none';
        document.getElementById('menu-logout').style.display = 'none';
        setupRecaptcha();
    }
}

function openPatientLogin() {
    isPartnerMode = false;
    document.getElementById('partner-role-container').style.display = 'none';
    document.getElementById('form-title').innerText = "Patient Login / Sign Up";
    showPopup();
}

function openPartnerLogin() {
    isPartnerMode = true;
    document.getElementById('partner-role-container').style.display = 'block';
    document.getElementById('form-title').innerText = "Partner Registration";
    toggleMenu(); 
    showPopup();
}

function showPopup() {
    document.getElementById('otp-section').style.display = 'none';
    document.getElementById('phone-section').style.display = 'block';
    document.getElementById('login-section').style.display = 'block';
    if (typeof setupRecaptcha === "function") setupRecaptcha();
}

function closePopup() {
    document.getElementById('login-section').style.display = 'none';
}

// ---------------- FIREBASE & GOOGLE SHEETS LOGIC ---------------- //
function setupRecaptcha() {
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
            'size': 'normal'
        });
        window.recaptchaVerifier.render();
    }
}

function sendOTP() {
    const userNumber = document.getElementById('phoneNumber').value.trim();
    if(userNumber.length !== 10 || isNaN(userNumber)) {
        alert("Please enter a valid 10-digit mobile number!"); return;
    }
    const finalNumberWithCode = "+91" + userNumber;

    firebase.auth().signInWithPhoneNumber(finalNumberWithCode, window.recaptchaVerifier).then((confirmationResult) => {
        window.confirmationResult = confirmationResult;
        document.getElementById('phone-section').style.display = 'none';
        document.getElementById('otp-section').style.display = 'block';
        document.getElementById('form-title').innerText = "Verify OTP";
        alert("OTP sent successfully!");
    }).catch((error) => {
        alert("Firebase Error: " + error.message);
    });
}

function verifyOTP() {
    const code = document.getElementById('otpCode').value.trim();
    const selectedRole = isPartnerMode ? document.getElementById('partnerRole').value : 'patient';
    
    if(code.length !== 6) { alert("Please enter a 6-digit OTP."); return; }

    window.confirmationResult.confirm(code).then((result) => {
        const user = result.user;
        
        // Data sheet par bhejna (Duplicate check backend mein hoga)
        sendDataToGoogleSheets(user.uid, user.phoneNumber, selectedRole);

        // Local Storage update
        localStorage.setItem("bhavya_uid", user.uid);
        localStorage.setItem("bhavya_mobile", user.phoneNumber);
        localStorage.setItem("bhavya_role", selectedRole);

        closePopup();
        checkLoginState();
    }).catch((error) => {
        alert("Invalid OTP! Please try again.");
    });
}

function sendDataToGoogleSheets(uid, mobile, role) {
    console.log("Processing Data Backend...", { uid, mobile, role });

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, 
        body: JSON.stringify({ uid: uid, mobile: mobile, role: role })
    })
    .then(response => response.json())
    .then(data => {
        if(data.status === "exists") {
            // Yeh purana user hai
            alert("Welcome Back! This mobile number is already registered.");
        } else {
            // Yeh bilkul naya user hai
            alert("Registration Successful! Welcome to BhavyaCare."); 
        }
    })
    .catch(error => {
        console.error("Backend warning:", error);
        // Fallback agar internet slow ho
        alert("Logged in Successfully!");
    });
}

// ---------------- DASHBOARD & LOGOUT LOGIC ---------------- //
function logoutUser() {
    firebase.auth().signOut().then(() => {
        localStorage.clear(); 
        alert("You have successfully logged out!");
        window.location.reload(); 
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
}

function goToDashboard() {
    const role = localStorage.getItem("bhavya_role");
    if(role) {
        alert("Redirecting to " + role.toUpperCase() + " Dashboard...");
        // Example: window.location.href = role + "_dashboard.html";
    } else {
        alert("Role not found. Please log in again.");
    }
}
