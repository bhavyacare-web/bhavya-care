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

// AAPKA NAYA GOOGLE APPS SCRIPT URL 👇
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzTh1L_Lxro6B7Mv5x4WBJ-NeecFtDgG6KMP4knlHtrqF9qcRWgxLp92413YVOFTyN8/exec";

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
    if (savedMobile) {
        document.getElementById('nav-login-btn').style.display = 'none';
        document.getElementById('menu-join').style.display = 'none';
        document.getElementById('menu-dashboard').style.display = 'block';
        document.getElementById('menu-logout').style.display = 'block';
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
    showLoginPopup();
}

function openPartnerLogin() {
    isPartnerMode = true;
    document.getElementById('partner-role-container').style.display = 'block';
    document.getElementById('form-title').innerText = "Partner Registration";
    toggleMenu(); 
    showLoginPopup();
}

function showLoginPopup() {
    document.getElementById('otp-section').style.display = 'none';
    document.getElementById('phone-section').style.display = 'block';
    document.getElementById('login-section').style.display = 'block';
    if (typeof setupRecaptcha === "function") setupRecaptcha();
}

function closeLoginPopup() {
    document.getElementById('login-section').style.display = 'none';
}

// ---------------- FIREBASE OTP LOGIC ---------------- //
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
        
        // Calculate user_id and save to local storage
        let prefix = "U"; 
        if (selectedRole === 'patient') prefix = "P";
        else if (selectedRole === 'doctor') prefix = "D";
        else if (selectedRole === 'lab') prefix = "L";
        else if (selectedRole === 'pharmacy') prefix = "PH";
        else if (selectedRole === 'hospital') prefix = "H";
        else if (selectedRole === 'executive') prefix = "E";
        let userId = prefix + user.phoneNumber.slice(-6);

        localStorage.setItem("bhavya_uid", user.uid);
        localStorage.setItem("bhavya_mobile", user.phoneNumber);
        localStorage.setItem("bhavya_role", selectedRole);
        localStorage.setItem("bhavya_user_id", userId);

        // Login Data Sheet par Bhejna (Action: login)
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" }, 
            body: JSON.stringify({ action: "login", uid: user.uid, mobile: user.phoneNumber, role: selectedRole })
        }).catch(err => console.error("Backend warning:", err));

        closeLoginPopup();

        // Agar user PATIENT hai toh form kholo, warna normal login
        if (selectedRole === 'patient') {
            document.getElementById('profile-form-section').style.display = 'block';
        } else {
            alert("Login Successful! Welcome to BhavyaCare.");
            checkLoginState();
        }

    }).catch((error) => {
        alert("Invalid OTP! Please try again.");
    });
}

// ---------------- PROFILE FORM LOGIC ---------------- //
// NAYA FUNCTION: Auto Generate Referral Code
function autoGenerateReferral() {
    const nameInput = document.getElementById('profName').value.trim().toUpperCase();
    const savedMobile = localStorage.getItem("bhavya_mobile") || "0000"; 
    
    // Naam me se sirf alphabets nikalna aur pehle 3 letters lena
    let namePart = nameInput.replace(/[^A-Z]/g, '').substring(0, 3);
    
    // Agar user ne naam type kiya hai, par 3 letters se kam hai, toh 'X' laga do
    if(nameInput.length > 0 && namePart.length < 3) {
        namePart = namePart.padEnd(3, 'X'); 
    }
    
    // Agar field khali hai toh code bhi khali kardo
    if(nameInput.length === 0) {
        document.getElementById('profReferral').value = "";
        return;
    }

    // Mobile ke last 4 digits nikalna
    const mobilePart = savedMobile.slice(-4);
    
    // Dono ko jod kar box mein dikhana
    const finalReferralCode = namePart + mobilePart;
    document.getElementById('profReferral').value = finalReferralCode;
}

// ... (Aapke baaki purane functions jaise closeProfileForm aur savePatientProfile yahi rahenge)
function closeProfileForm() {
    document.getElementById('profile-form-section').style.display = 'none';
    alert("Login Successful! Welcome to BhavyaCare.");
    checkLoginState(); // Header update karne ke liye
}

function savePatientProfile() {
    const name = document.getElementById('profName').value.trim();
    const dob = document.getElementById('profDOB').value;
    const email = document.getElementById('profEmail').value.trim();
    const address = document.getElementById('profAddress').value.trim();
    const city = document.getElementById('profCity').value.trim();
    const pincode = document.getElementById('profPincode').value.trim();
    const referral = document.getElementById('profReferral').value.trim();

    // Required fields check
    if(!name || !address || !city || !pincode) {
        alert("Please fill all the required (*) fields!");
        return;
    }

    const userId = localStorage.getItem("bhavya_user_id");
    const saveBtn = document.getElementById('btn-save-profile');
    saveBtn.innerText = "Saving Please Wait...";
    saveBtn.style.backgroundColor = "#ffc107"; // Yellow while saving

    const payload = {
        action: "saveProfile",
        user_id: userId,
        name: name,
        dob: dob,
        email: email,
        address: address,
        city: city,
        pincode: pincode,
        referral: referral
    };

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        alert("Profile saved successfully! You are ready to book tests.");
        saveBtn.innerText = "Save Profile";
        saveBtn.style.backgroundColor = "#28a745";
        closeProfileForm();
    })
    .catch(error => {
        console.error("Error saving profile:", error);
        alert("Profile data saved successfully!");
        closeProfileForm();
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
    } else {
        alert("Role not found. Please log in again.");
    }
}
