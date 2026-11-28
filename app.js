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
    if (typeof firebase !== "undefined") {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        if (typeof firebase.firestore === "function") db = firebase.firestore();
    }
} catch (e) {
    console.error("Init error:", e);
}

const WELCOME_BONUS_AMOUNT = 100;

function showAppMsg(msg, title) {
    if (typeof window.bhavyaAlert === "function") return window.bhavyaAlert(msg, title);
    alert(msg);
    return Promise.resolve();
}

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
    localStorage.removeItem("bhavya_profile_cache");
}

// ==========================================
// 2. AUTH STATE OBSERVER
// ==========================================
try {
    if (typeof firebase !== "undefined") {
        firebase.auth().onAuthStateChanged(function (user) {
            if (user) {
                if (!localStorage.getItem("bhavya_mobile") && user.phoneNumber) {
                    localStorage.setItem("bhavya_uid", user.uid);
                    localStorage.setItem("bhavya_mobile", user.phoneNumber);
                }
                checkLoginState();
            } else {
                clearAuthStorage();
                checkLoginState();
            }
        });
    }
} catch (e) {
    console.error(e);
}

function initApp() {
    const loginBtn = document.getElementById("nav-login-btn");
    if (loginBtn) checkLoginState();
    else setTimeout(initApp, 100);
}
initApp();

// ==========================================
// 3. UI & NAVIGATION FUNCTIONS
// ==========================================
function toggleMenu() {
    const dropdown = document.getElementById("myDropdown");
    if (dropdown) dropdown.classList.toggle("show-menu");
}

window.onclick = function (event) {
    if (!event.target.matches(".dropbtn") && !event.target.matches(".user-profile-btn")) {
        const dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains("show-menu")) dropdowns[i].classList.remove("show-menu");
        }
    }
};

function checkLoginState() {
    const savedMobile = localStorage.getItem("bhavya_mobile");
    const navLoginBtn = document.getElementById("nav-login-btn");
    const mainMenuBtn = document.getElementById("main-menu-btn");
    const userMenuContainer = document.getElementById("user-menu-container");
    const menuDash = document.getElementById("menu-dashboard");
    const menuLogout = document.getElementById("menu-logout");

    if (savedMobile) {
        if (navLoginBtn) navLoginBtn.style.display = "none";
        if (mainMenuBtn) mainMenuBtn.style.display = "none";
        if (userMenuContainer) userMenuContainer.style.display = "block";
        if (menuDash) menuDash.style.display = "block";
        if (menuLogout) menuLogout.style.display = "block";
    } else {
        if (navLoginBtn) navLoginBtn.style.display = "inline-flex";
        if (mainMenuBtn) mainMenuBtn.style.display = "flex";
        if (userMenuContainer) userMenuContainer.style.display = "none";
        if (menuDash) menuDash.style.display = "none";
        if (menuLogout) menuLogout.style.display = "none";
        if (document.getElementById("recaptcha-container")) setupRecaptcha();
    }
}

function openPatientLogin() {
    const formTitle = document.getElementById("form-title");
    if (formTitle) formTitle.innerText = "Login / Sign Up";
    showLoginPopup();
}

function showLoginPopup() {
    const otpSec = document.getElementById("otp-section");
    const phoneSec = document.getElementById("phone-section");
    const loginSec = document.getElementById("login-section");

    if (otpSec) otpSec.style.display = "none";
    if (phoneSec) phoneSec.style.display = "block";
    if (loginSec) loginSec.style.display = "block";
    setupRecaptcha();
}

function closeLoginPopup() {
    const loginSec = document.getElementById("login-section");
    if (loginSec) loginSec.style.display = "none";
}

// ==========================================
// 4. OTP LOGIN + ₹100 FIRST-LOGIN WELCOME BONUS + ADMIN EMAIL
// ==========================================
function setupRecaptcha() {
    try {
        if (typeof firebase !== "undefined" && document.getElementById("recaptcha-container") && !window.recaptchaVerifier) {
            window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier("recaptcha-container", { size: "normal" });
            window.recaptchaVerifier.render();
        }
    } catch (e) {
        console.error(e);
    }
}

function sendOTP() {
    if (typeof firebase === "undefined") {
        showAppMsg("System is loading, please wait a moment.", "Please Wait");
        return;
    }

    const userName = (document.getElementById("userName")?.value || "").trim();
    const userNumber = (document.getElementById("phoneNumber")?.value || "").trim().replace(/\D/g, "");

    if (!userName) {
        showAppMsg("Please enter your full name.", "Missing Name");
        return;
    }
    if (userNumber.length !== 10) {
        showAppMsg("Please enter a valid 10-digit mobile number.", "Invalid Number");
        return;
    }

    const sendBtn = document.getElementById("send-otp-btn");
    if (sendBtn) {
        sendBtn.innerText = "Sending OTP...";
        sendBtn.disabled = true;
    }

    firebase.auth().signInWithPhoneNumber("+91" + userNumber, window.recaptchaVerifier)
        .then((res) => {
            window.confirmationResult = res;
            document.getElementById("phone-section").style.display = "none";
            document.getElementById("otp-section").style.display = "block";
            document.getElementById("form-title").innerText = "Verify OTP";
            if (sendBtn) {
                sendBtn.innerHTML = 'Get OTP <i class="fas fa-arrow-right" style="margin-left:4px;"></i>';
                sendBtn.disabled = false;
            }
            showAppMsg("OTP sent to +91 " + userNumber + ". Please check your SMS.", "OTP Sent");
        })
        .catch(() => {
            if (sendBtn) {
                sendBtn.innerHTML = 'Get OTP <i class="fas fa-arrow-right" style="margin-left:4px;"></i>';
                sendBtn.disabled = false;
            }
            showAppMsg("Unable to send OTP right now. Please complete the captcha and check your mobile number.", "OTP Failed");
        });
}

async function verifyOTP() {
    const code = (document.getElementById("otpCode")?.value || "").trim();
    const userName = (document.getElementById("userName")?.value || "").trim();

    if (code.length !== 6) {
        showAppMsg("Please enter a valid 6-digit OTP.", "Invalid OTP");
        return;
    }

    try {
        const result = await window.confirmationResult.confirm(code);
        const user = result.user;

        if (!db && typeof firebase.firestore === "function") {
            db = firebase.firestore();
        }

        let finalUserId = generateCustomUserId(userName, user.phoneNumber);
        let finalName = userName;
        let finalPlan = "basic";
        let isFirstLogin = false;

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
                isFirstLogin = true;
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
                    current_wallet_balance: WELCOME_BONUS_AMOUNT,
                    wallet_balance: WELCOME_BONUS_AMOUNT,
                    welcome_bonus_credited: true,
                    withdraw: "inactive",
                    current_plan_status: "basic",
                    plan: "basic",
                    status: "active",
                    created_at: firebase.firestore.FieldValue.serverTimestamp(),
                    updated_at: firebase.firestore.FieldValue.serverTimestamp()
                });

                await db.collection("wallet_transactions").add({
                    uid: user.uid,
                    user_id: finalUserId,
                    type: "credit",
                    amount: WELCOME_BONUS_AMOUNT,
                    description: "Welcome Bonus on First Login (Test Discount)",
                    reference: "WELCOME-100",
                    created_at: firebase.firestore.FieldValue.serverTimestamp()
                }).catch(() => {});

                await db.collection("mail").add({
                    from: "Bhavya Diagnostics <contact@bhavyadiagnostics.com>",
                    replyTo: "contact@bhavyadiagnostics.com",
                    to: ["contact@bhavyadiagnostics.com"],
                    message: {
                        subject: `New Patient Registered: ${userName} (${finalUserId})`,
                        html: `<div style="font-family:Arial,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
                                <h3 style="color:#0056b3;margin-top:0;">New Patient Registered on Bhavya Diagnostics</h3>
                                <p><b>Name:</b> ${escapeHtml(userName)}</p>
                                <p><b>Mobile:</b> ${escapeHtml(user.phoneNumber)}</p>
                                <p><b>User ID:</b> ${escapeHtml(finalUserId)}</p>
                                <p><b>Welcome Bonus Credited:</b> ₹${WELCOME_BONUS_AMOUNT}</p>
                               </div>`
                    }
                }).catch(err => console.error("Admin mail error:", err));
            }
        }

        localStorage.setItem("bhavya_uid", user.uid);
        localStorage.setItem("bhavya_mobile", user.phoneNumber);
        localStorage.setItem("bhavya_role", "patient");
        localStorage.setItem("bhavya_user_id", finalUserId);
        localStorage.setItem("bhavya_name", finalName);
        localStorage.setItem("bhavya_plan_cache", finalPlan);

        closeLoginPopup();
        checkLoginState();

        const welcomeMsg = isFirstLogin
            ? `Welcome ${finalName}! ₹${WELCOME_BONUS_AMOUNT} Welcome Bonus has been added to your wallet for test discounts.`
            : `Welcome back, ${finalName}!`;

        await showAppMsg(welcomeMsg, "Login Successful");

        if (localStorage.getItem("pending_vip_redirect") === "true") {
            localStorage.removeItem("pending_vip_redirect");
            window.location.href = "vip/vip_member.html";
        } else {
            goToDashboard();
        }
    } catch (error) {
        console.error("OTP Verify Error:", error);
        showAppMsg("Invalid OTP! Please check the 6-digit code and try again.", "Verification Failed");
    }
}

// ==========================================
// 5. LOGOUT & DASHBOARD NAVIGATION
// ==========================================
async function logoutUser() {
    try {
        if (typeof firebase !== "undefined") {
            await firebase.auth().signOut();
        }
    } catch (err) {
        console.error("Logout Error:", err);
    }
    clearAuthStorage();
    await showAppMsg("You have been logged out securely.", "Logged Out");
    window.location.reload();
}

function goToDashboard() {
    const role = localStorage.getItem("bhavya_role");
    const userId = localStorage.getItem("bhavya_user_id");

    const isValidUser = userId && userId !== "null" && userId !== "undefined" && userId.trim() !== "" &&
                        role && role !== "null" && role !== "undefined" && role.trim() !== "";

    if (!isValidUser) {
        showAppMsg("Please login first to access your dashboard.", "Login Required").then(() => {
            openPatientLogin();
        });
        return;
    }

    if (role === "patient") {
        window.location.href = "patient_dashboard/patient_dashboard.html";
    } else if (role === "admin") {
        window.location.href = "admin.html";
    } else {
        showAppMsg("Session expired. Please login again.", "Session Expired");
    }
}
