// ==========================================
// 1. FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyC2nYH22wkYDhh-BWfHvkT-bQvdKLCxask",
    authDomain: "bhavya-care.firebaseapp.com",
    projectId: "bhavya-care",
    storageBucket: "bhavya-care.firebasestorage.app",
    messagingSenderId: "979254809111",
    appId: "1:979254809111:web:0181e0c97277a5d0d9c252",
    measurementId: "G-G82G4VWGGT"
};

let db = null;
try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        if (typeof firebase.firestore === 'function') {
            db = firebase.firestore();
        }
    }
} catch(e) {
    console.error("Firebase init error:", e);
}

// 🌟 GOOGLE SCRIPT URL (Only for Public Catalog / Rules) 🌟
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwIxSjlD6oVAGi4InT6Lb8RPg6NWrl7vpptoYrEG5HKPzPaadUp_0pVnN_1OZfJ7X_r/exec";
let isPartnerMode = false;

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function generateCustomUserId(name, mobile) {
    const cleanName = String(name || "USR").replace(/[^a-zA-Z]/g, "").toUpperCase();
    const prefix = (cleanName + "XXX").slice(0, 3);
    const digits = String(mobile || "").replace(/\D/g, "").slice(-4) || Math.floor(1000 + Math.random() * 9000);
    return prefix + digits;
}

function clearAuthStorage() {
    localStorage.removeItem("bhavya_uid");
    localStorage.removeItem("bhavya_mobile");
    localStorage.removeItem("bhavya_role");
    localStorage.removeItem("bhavya_user_id");
    localStorage.removeItem("bhavya_name");
    localStorage.removeItem("bhavya_plan_cache");
}

// ==========================================
// 2. AUTH STATE OBSERVER (Login Session Maintain)
// ==========================================
try {
    if (typeof firebase !== 'undefined') {
        firebase.auth().onAuthStateChanged(function(user) {
            if (user) {
                if (!localStorage.getItem("bhavya_mobile")) {
                    localStorage.setItem("bhavya_uid", user.uid);
                    localStorage.setItem("bhavya_mobile", user.phoneNumber);
                }
                checkLoginState();
            } else {
                // Only clear auth keys (keep bhavyaCart safe)
                clearAuthStorage();
                checkLoginState();
            }
        });
    }
} catch(e) {
    console.error(e);
}

function initApp() {
    const loginBtn = document.getElementById('nav-login-btn');
    if (loginBtn) { checkLoginState(); }
    else setTimeout(initApp, 100); 
}
initApp();

// ==========================================
// 3. UI & NAVIGATION FUNCTIONS
// ==========================================
function toggleMenu() { 
    const dropdown = document.getElementById("myDropdown");
    if(dropdown) dropdown.classList.toggle("show-menu"); 
}

window.onclick = function(event) {
    if (!event.target.matches('.dropbtn') && !event.target.matches('.user-profile-btn')) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        for (var i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show-menu')) dropdowns[i].classList.remove('show-menu');
        }
    }
};

function checkLoginState() {
    const savedMobile = localStorage.getItem("bhavya_mobile");
    const navLoginBtn = document.getElementById('nav-login-btn');
    const mainMenuBtn = document.getElementById('main-menu-btn'); 
    const userMenuContainer = document.getElementById('user-menu-container'); 
    const menuJoin = document.getElementById('menu-join');
    const menuDash = document.getElementById('menu-dashboard');
    const menuLogout = document.getElementById('menu-logout');

    if (savedMobile) {
        if(navLoginBtn) navLoginBtn.style.display = 'none';
        if(mainMenuBtn) mainMenuBtn.style.display = 'none';
        if(userMenuContainer) userMenuContainer.style.display = 'block';
        if(menuJoin) menuJoin.style.display = 'none';
        if(menuDash) menuDash.style.display = 'block';
        if(menuLogout) menuLogout.style.display = 'block';
    } else {
        if(navLoginBtn) navLoginBtn.style.display = 'inline-block';
        if(mainMenuBtn) mainMenuBtn.style.display = 'inline-block';
        if(userMenuContainer) userMenuContainer.style.display = 'none';
        if(menuJoin) menuJoin.style.display = 'block';
        if(menuDash) menuDash.style.display = 'none';
        if(menuLogout) menuLogout.style.display = 'none';
        if(document.getElementById('recaptcha-container')) setupRecaptcha();
    }
}

function updateNameLabel() {
    const roleElem = document.getElementById('partnerRole');
    const nameLabel = document.getElementById('nameLabel');
    const userNameInput = document.getElementById('userName');

    if (!nameLabel || !userNameInput) return;

    if (isPartnerMode && roleElem) {
        const role = roleElem.value;
        if (role === 'lab') {
            nameLabel.innerText = "Lab Name:";
            userNameInput.placeholder = "Enter lab name";
        }
    } else {
        nameLabel.innerText = "Full Name:";
        userNameInput.placeholder = "Enter your full name";
    }
}

function openPatientLogin() {
    isPartnerMode = false;
    const partnerRoleContainer = document.getElementById('partner-role-container');
    if(partnerRoleContainer) partnerRoleContainer.style.display = 'none';
    const formTitle = document.getElementById('form-title');
    if(formTitle) formTitle.innerText = "Patient Login / Sign Up";
    
    updateNameLabel(); 
    showLoginPopup();
}

function openPartnerLogin() {
    isPartnerMode = true;
    const partnerRoleContainer = document.getElementById('partner-role-container');
    if(partnerRoleContainer) partnerRoleContainer.style.display = 'block';
    const formTitle = document.getElementById('form-title');
    if(formTitle) formTitle.innerText = "Partner Registration";
    
    updateNameLabel(); 
    toggleMenu(); 
    showLoginPopup();
}

function showLoginPopup() {
    const otpSec = document.getElementById('otp-section');
    const phoneSec = document.getElementById('phone-section');
    const loginSec = document.getElementById('login-section');
    
    if(otpSec) otpSec.style.display = 'none';
    if(phoneSec) phoneSec.style.display = 'block';
    if(loginSec) loginSec.style.display = 'block';
    setupRecaptcha();
}

function closeLoginPopup() { 
    const loginSec = document.getElementById('login-section');
    if(loginSec) loginSec.style.display = 'none'; 
}

// ==========================================
// 4. FIREBASE OTP & FIRESTORE PATIENT LOGIN
// ==========================================
function setupRecaptcha() {
    try {
        if (typeof firebase !== 'undefined' && document.getElementById('recaptcha-container') && !window.recaptchaVerifier) {
            window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { 'size': 'normal' });
            window.recaptchaVerifier.render();
        }
    } catch(e) { console.error(e); }
}

function sendOTP() {
    if (typeof firebase === 'undefined') { alert("System loading, please wait a moment."); return; }
    
    const userNameInput = document.getElementById('userName');
    if(!userNameInput) return;
    const userName = userNameInput.value.trim();
    if(!userName) { alert("Please enter your name!"); return; }

    const userNumberInput = document.getElementById('phoneNumber');
    const userNumber = userNumberInput.value.trim();
    if(userNumber.length !== 10 || isNaN(userNumber)) { alert("Please enter a valid 10-digit mobile number!"); return; }
    
    const sendBtn = document.getElementById('send-otp-btn');
    if (sendBtn) { sendBtn.innerText = "Sending OTP..."; sendBtn.disabled = true; }

    firebase.auth().signInWithPhoneNumber("+91" + userNumber, window.recaptchaVerifier).then((res) => {
        window.confirmationResult = res;
        document.getElementById('phone-section').style.display = 'none';
        document.getElementById('otp-section').style.display = 'block';
        document.getElementById('form-title').innerText = "Verify OTP";
        if (sendBtn) { sendBtn.innerText = "Get OTP"; sendBtn.disabled = false; }
        alert("OTP sent successfully!");
    }).catch((err) => {
        if (sendBtn) { sendBtn.innerText = "Get OTP"; sendBtn.disabled = false; }
        alert("Firebase Error: " + err.message);
    });
}

async function verifyOTP() {
    const code = document.getElementById('otpCode').value.trim();
    const roleElem = document.getElementById('partnerRole');
    const selectedRole = (isPartnerMode && roleElem) ? roleElem.value : 'patient';
    const userName = document.getElementById('userName').value.trim();

    if(code.length !== 6) { alert("Please enter a 6-digit OTP."); return; }

    try {
        const result = await window.confirmationResult.confirm(code);
        const user = result.user;

        // 100% FIREBASE PATIENT LOGIN & REGISTRATION
        if (selectedRole === 'patient') {
            if (!db && typeof firebase.firestore === 'function') {
                db = firebase.firestore();
            }

            let finalUserId = generateCustomUserId(userName, user.phoneNumber);
            let finalName = userName;
            let finalPlan = "basic";

            if (db) {
                const patientRef = db.collection("patients").doc(user.uid);
                const docSnap = await patientRef.get();

                if (docSnap.exists) {
                    const existing = docSnap.data();
                    finalUserId = existing.user_id || finalUserId;
                    finalName = existing.name || existing.patient_name || userName;
                    finalPlan = String(existing.current_plan_status || existing.plan || "basic").toLowerCase();

                    await patientRef.set({
                        uid: user.uid,
                        udi: user.uid,
                        user_id: finalUserId,
                        mobile: user.phoneNumber,
                        mobile_number: user.phoneNumber,
                        last_login_at: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                } else {
                    await patientRef.set({
                        uid: user.uid,
                        udi: user.uid,
                        user_id: finalUserId,
                        name: userName,
                        patient_name: userName,
                        mobile: user.phoneNumber,
                        mobile_number: user.phoneNumber,
                        role: "patient",
                        referral_code: finalUserId,
                        current_wallet_balance: 0,
                        wallet_balance: 0,
                        withdraw: "inactive",
                        current_plan_status: "basic",
                        plan: "basic",
                        status: "active",
                        created_at: firebase.firestore.FieldValue.serverTimestamp(),
                        updated_at: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // Send automatic Admin Alert Email via Firebase Extension (Zoho SMTP)
                    await db.collection("mail").add({
                        from: "Bhavya Diagnostics <contact@bhavyadiagnostics.com>",
                        replyTo: "contact@bhavyadiagnostics.com",
                        to: ["contact@bhavyadiagnostics.com"],
                        message: {
                            subject: `🎉 New Patient Registered: ${userName} (${finalUserId})`,
                            html: `<div style="font-family:Arial,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
                                    <h3 style="color:#0056b3;margin-top:0;">New Patient Registered on Bhavya Diagnostics</h3>
                                    <p><b>Name:</b> ${escapeHtml(userName)}</p>
                                    <p><b>Mobile:</b> ${escapeHtml(user.phoneNumber)}</p>
                                    <p><b>User ID:</b> ${escapeHtml(finalUserId)}</p>
                                   </div>`
                        }
                    }).catch(err => console.error("Admin mail trigger error:", err));
                }
            }

            localStorage.setItem("bhavya_uid", user.uid);
            localStorage.setItem("bhavya_mobile", user.phoneNumber);
            localStorage.setItem("bhavya_role", "patient");
            localStorage.setItem("bhavya_user_id", finalUserId);
            localStorage.setItem("bhavya_name", finalName);
            localStorage.setItem("bhavya_plan_cache", finalPlan);

            closeLoginPopup();
            alert("Login Successful! Welcome " + finalName);
            checkLoginState();

            if (localStorage.getItem("pending_vip_redirect") === "true") {
                window.location.reload(); 
            } else {
                goToDashboard(); 
            }
            return;
        }

        // Legacy Partner fallback (only if Partner Login is explicitly opened)
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, 
            body: JSON.stringify({ action: "login", uid: user.uid, mobile: user.phoneNumber, role: selectedRole, name: userName })
        });
        const resData = await response.json();

        localStorage.setItem("bhavya_uid", user.uid);
        localStorage.setItem("bhavya_mobile", user.phoneNumber);
        localStorage.setItem("bhavya_role", resData.role || selectedRole);
        localStorage.setItem("bhavya_user_id", resData.user_id || user.uid);
        localStorage.setItem("bhavya_name", resData.name || userName); 

        closeLoginPopup();
        alert("Login Successful! Welcome " + userName);
        checkLoginState();
        goToDashboard();

    } catch (error) { 
        console.error("OTP Error Details:", error);
        if(error.code) { 
            alert("Invalid OTP! Please try again."); 
        } else {
            alert("System Error: " + error.message);
        }
    }
}

// ==========================================
// 5. LOGOUT & DASHBOARD NAVIGATION (STRICT)
// ==========================================
function logoutUser() {
    if (typeof firebase !== 'undefined') {
        firebase.auth().signOut().then(() => {
            clearAuthStorage();
            alert("You have successfully logged out!");
            window.location.reload(); 
        }).catch((err) => { console.error("Logout Error:", err); });
    } else {
        clearAuthStorage();
        window.location.reload();
    }
}

function goToDashboard() {
    const role = localStorage.getItem("bhavya_role");
    const userId = localStorage.getItem("bhavya_user_id");

    const isValidUser = userId && userId !== "null" && userId !== "undefined" && userId.trim() !== "" &&
                        role && role !== "null" && role !== "undefined" && role.trim() !== "";

    if (!isValidUser) {
        alert("Please Login First to access Dashboard!");
        if (typeof openPatientLogin === "function") {
            openPatientLogin();
        }
        return;
    }
    
    if (role === "patient") {
        window.location.href = "patient_dashboard/patient_dashboard.html"; 
    } 
    else if (role === "lab") {
        window.location.href = "Lab/lab_registration.html"; 
    }
    else if (role === "admin") {
        window.location.href = "admin/admin_dashboard.html"; 
    }
    else {
        alert("Role not found. Please log in again.");
    }
}
