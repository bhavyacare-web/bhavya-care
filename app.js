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

// ---------------- LOCAL STORAGE & UI STATE ---------------- //

let isPartnerMode = false; // By default, user is a Patient

window.onload = function () {
    checkLoginState();
};

function checkLoginState() {
    const savedMobile = localStorage.getItem("bhavya_mobile");
    const savedRole = localStorage.getItem("bhavya_role");

    if (savedMobile) {
        console.log("User logged in:", savedMobile, "Role:", savedRole);
        document.getElementById('nav-login-btn').style.display = 'none';
        document.getElementById('nav-dashboard-btn').style.display = 'inline-block';
        document.getElementById('nav-logout-btn').style.display = 'inline-block';
        document.getElementById('login-section').style.display = 'none'; 
    } else {
        document.getElementById('nav-login-btn').style.display = 'inline-block';
        document.getElementById('nav-dashboard-btn').style.display = 'none';
        document.getElementById('nav-logout-btn').style.display = 'none';
        setupRecaptcha();
    }
}

// UI Toggles
function toggleLogin() {
    var loginDiv = document.getElementById('login-section');
    if (loginDiv.style.display === 'none' || loginDiv.style.display === '') {
        loginDiv.style.display = 'block'; 
        if (typeof setupRecaptcha === "function") setupRecaptcha();
    } else {
        loginDiv.style.display = 'none'; 
    }
}

function togglePartnerMode() {
    isPartnerMode = !isPartnerMode;
    const partnerContainer = document.getElementById('partner-role-container');
    const toggleText = document.getElementById('partner-toggle-text');
    const formTitle = document.getElementById('form-title');

    if (isPartnerMode) {
        partnerContainer.style.display = 'block';
        toggleText.innerText = "Login as a Patient";
        formTitle.innerText = "Partner Login / Sign Up";
    } else {
        partnerContainer.style.display = 'none';
        toggleText.innerText = "Register as a Partner";
        formTitle.innerText = "Login / Sign Up";
    }
}

function resetForm() {
    document.getElementById('otp-section').style.display = 'none';
    document.getElementById('phone-section').style.display = 'block';
    document.getElementById('partner-link-container').style.display = 'block';
    document.getElementById('form-title').innerText = isPartnerMode ? "Partner Login / Sign Up" : "Login / Sign Up";
}


// ---------------- FIREBASE AUTH LOGIC ---------------- //

function setupRecaptcha() {
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
            'size': 'normal',
            'callback': (response) => {
                console.log("Recaptcha verified!");
            }
        });
        window.recaptchaVerifier.render();
    }
}

function sendOTP() {
    const userNumber = document.getElementById('phoneNumber').value.trim();
    
    if(userNumber.length !== 10 || isNaN(userNumber)) {
        alert("Please enter a valid 10-digit mobile number!");
        return;
    }

    const finalNumberWithCode = "+91" + userNumber;

    firebase.auth().signInWithPhoneNumber(finalNumberWithCode, window.recaptchaVerifier)
        .then((confirmationResult) => {
            window.confirmationResult = confirmationResult;
            
            // Hide phone section and partner link, show OTP section
            document.getElementById('phone-section').style.display = 'none';
            document.getElementById('partner-link-container').style.display = 'none';
            document.getElementById('otp-section').style.display = 'block';
            document.getElementById('form-title').innerText = "Verify Mobile";
            
            alert("OTP sent successfully!");
        }).catch((error) => {
            console.error("OTP Error:", error);
            alert("Firebase Error: " + error.message);
        });
}

function verifyOTP() {
    const code = document.getElementById('otpCode').value.trim();
    
    // Agar partner mode ON hai, toh dropdown ki value lenge, warna default 'patient' save karenge
    const selectedRole = isPartnerMode ? document.getElementById('partnerRole').value : 'patient';
    
    if(code.length !== 6) {
        alert("Please enter a valid 6-digit OTP.");
        return;
    }

    window.confirmationResult.confirm(code).then((result) => {
        const user = result.user;
        
        // UID, Mobile, aur Role ko Local Storage mein save karna
        localStorage.setItem("bhavya_uid", user.uid);
        localStorage.setItem("bhavya_mobile", user.phoneNumber);
        localStorage.setItem("bhavya_role", selectedRole);

        alert("Login Successful! Welcome to BhavyaCare.");

        document.getElementById('login-section').style.display = 'none';
        checkLoginState();
        
        // YAHAN PAR HUM NEXT STEP MEIN GOOGLE SHEETS PAR DATA BHEJENGE
        // sendDataToGoogleSheets(user.uid, user.phoneNumber, selectedRole);
        
    }).catch((error) => {
        alert("Invalid OTP! Please try again.");
    });
}

// ---------------- DASHBOARD & LOGOUT LOGIC ---------------- //

function logoutUser() {
    firebase.auth().signOut().then(() => {
        localStorage.removeItem("bhavya_uid");
        localStorage.removeItem("bhavya_mobile");
        localStorage.removeItem("bhavya_role");
        
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
        alert("Role not found. Please login again.");
    }
}
