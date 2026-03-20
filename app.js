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

window.onload = function () {
    checkLoginState();
};

function checkLoginState() {
    // Local storage se data read karein
    const savedMobile = localStorage.getItem("bhavya_mobile");
    const savedRole = localStorage.getItem("bhavya_role");

    if (savedMobile) {
        console.log("User logged in:", savedMobile, "Role:", savedRole);
        // User pehle se logged in hai -> Login button hide karo, Dashboard/Logout show karo
        document.getElementById('nav-login-btn').style.display = 'none';
        document.getElementById('nav-dashboard-btn').style.display = 'inline-block';
        document.getElementById('nav-logout-btn').style.display = 'inline-block';
        document.getElementById('login-section').style.display = 'none'; // Ensure popup is closed
    } else {
        // Naya user hai -> Dashboard/Logout hide rakho, Recaptcha ready karo
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

function resetForm() {
    document.getElementById('otp-section').style.display = 'none';
    document.getElementById('role-section').style.display = 'none';
    document.getElementById('phone-section').style.display = 'block';
    document.getElementById('form-title').innerText = "Login / Sign Up";
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
        alert("Kripya sahi 10-digit mobile number daalein!");
        return;
    }

    const finalNumberWithCode = "+91" + userNumber;

    firebase.auth().signInWithPhoneNumber(finalNumberWithCode, window.recaptchaVerifier)
        .then((confirmationResult) => {
            window.confirmationResult = confirmationResult;
            
            // UI Update
            document.getElementById('phone-section').style.display = 'none';
            document.getElementById('otp-section').style.display = 'block';
            document.getElementById('form-title').innerText = "Verify Mobile";
            
            alert("OTP SMS bhej diya gaya hai!");
        }).catch((error) => {
            console.error("OTP Error:", error);
            alert("Firebase Error: " + error.message);
        });
}

function verifyOTP() {
    const code = document.getElementById('otpCode').value.trim();
    
    if(code.length !== 6) {
        alert("Kripya 6-digit ka OTP daalein.");
        return;
    }

    window.confirmationResult.confirm(code).then((result) => {
        const user = result.user;
        
        // Step 1: Firebase se verify hote hi Mobile & UID save kar lo
        localStorage.setItem("bhavya_uid", user.uid);
        localStorage.setItem("bhavya_mobile", user.phoneNumber);

        alert("OTP Verified! Kripya apni profile select karein.");

        // Step 2: OTP section hide karo, Role Selection dikhao
        document.getElementById('otp-section').style.display = 'none';
        document.getElementById('role-section').style.display = 'block';
        document.getElementById('form-title').innerText = "Complete Profile";
        
    }).catch((error) => {
        alert("Galat OTP! Kripya dobara try karein.");
    });
}

// ---------------- NEW: ROLE SELECTION & LOGOUT LOGIC ---------------- //

function saveRole() {
    const role = document.getElementById('userRole').value;
    
    if(!role) {
        alert("Kripya aage badhne ke liye apna profile (Type) select karein!");
        return;
    }

    // Role ko local storage me save karein
    localStorage.setItem("bhavya_role", role);
    
    alert("Profile Saved! Welcome to BhavyaCare.");
    
    // Popup band karein aur navbar update karein
    document.getElementById('login-section').style.display = 'none';
    checkLoginState();
    
    // YAHAN PAR HUM NEXT STEP MEIN GOOGLE SHEETS PAR DATA BHEJENGE
    // sendDataToGoogleSheets(localStorage.getItem("bhavya_uid"), localStorage.getItem("bhavya_mobile"), role);
}

function logoutUser() {
    // Firebase se logout aur Local Storage clear karna
    firebase.auth().signOut().then(() => {
        localStorage.removeItem("bhavya_uid");
        localStorage.removeItem("bhavya_mobile");
        localStorage.removeItem("bhavya_role");
        
        alert("Aap successfully logout ho gaye hain!");
        window.location.reload(); // Page refresh to default state
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
}

function goToDashboard() {
    const role = localStorage.getItem("bhavya_role");
    if(role) {
        alert("Redirecting to " + role.toUpperCase() + " Dashboard...");
        // Future mein aap ise alag pages par redirect kar sakte hain, jaise:
        // window.location.href = role + "_dashboard.html";
    } else {
        alert("Aapka role select nahi hai. Kripya dobara login karein.");
    }
}
