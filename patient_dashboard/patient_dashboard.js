// =======================================================
// 1. FIREBASE CONFIGURATION & INITIALIZATION
// =======================================================
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

// Public catalog URL only (all patient, booking, wallet & email data runs on Firebase)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwIxSjlD6oVAGi4InT6Lb8RPg6NWrl7vpptoYrEG5HKPzPaadUp_0pVnN_1OZfJ7X_r/exec"; 

let isUserVip = false;
let currentAuthUser = null;
let currentPatientDoc = null;
let globalBookingsData = [];
let globalCompletedReports = [];
let dashAllServices = [];
let dashCurrentSubCat = 'all';
let dashPageCart = [];

// =======================================================
// SECURITY & FORMATTING HELPERS
// =======================================================
function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function dashFormatText(text) {
    if (!text) return "";
    let cleanText = String(text).replace(/_/g, ' ');
    let formatted = cleanText.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const acronyms = /\b(cbc|esr|usg|mri|ecg|echo|ct|lft|kft|hba1c|tsh|t3|t4|ana|psa|hiv|hcv|bun|aptt|sgpt|sgot|vdrl|rbc|wbc|bchg|aec|anc|amh|ada|hbsag|crp|abp|ncv|emg|ssep|dlco|eeg|pft|nabl|nabh|crl|ved)\b/gi;
    return formatted.replace(acronyms, match => match.toUpperCase());
}

function dashFormatPrice(price) {
    return (!price || isNaN(price)) ? 0 : parseFloat(Number(price).toFixed(2));
}

function generateCustomUserId(name, mobile) {
    const cleanName = String(name || "USR").replace(/[^a-zA-Z]/g, "").toUpperCase();
    const prefix = (cleanName + "XXX").slice(0, 3);
    const digits = String(mobile || "").replace(/\D/g, "").slice(-4) || Math.floor(1000 + Math.random() * 9000);
    return prefix + digits;
}

function clearAuthLocalStorage() {
    localStorage.removeItem("bhavya_uid");
    localStorage.removeItem("bhavya_mobile");
    localStorage.removeItem("bhavya_role");
    localStorage.removeItem("bhavya_user_id");
    localStorage.removeItem("bhavya_name");
    localStorage.removeItem("bhavya_plan_cache");
}

function formatFirestoreDate(val) {
    if (!val) return "N/A";
    try {
        let d = null;
        if (typeof val.toDate === "function") d = val.toDate();
        else if (val.seconds) d = new Date(val.seconds * 1000);
        else d = new Date(val);
        if (isNaN(d.getTime())) return String(val);

        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        let hrs = d.getHours();
        const mins = String(d.getMinutes()).padStart(2, '0');
        const ampm = hrs >= 12 ? "PM" : "AM";
        hrs = hrs % 12 || 12;
        return `${dd}-${mm}-${yyyy} ${String(hrs).padStart(2, '0')}:${mins} ${ampm}`;
    } catch (e) {
        return String(val);
    }
}

function getTimestampMillis(val) {
    if (!val) return 0;
    try {
        if (typeof val.toMillis === "function") return val.toMillis();
        if (val.seconds) return val.seconds * 1000;
        const t = new Date(val).getTime();
        return isNaN(t) ? 0 : t;
    } catch (e) {
        return 0;
    }
}

// =======================================================
// AUTOMATIC BUSINESS EMAIL SYSTEM (Zoho SMTP via Firebase)
// =======================================================
const EMAIL_SENDERS = {
    contact: "Bhavya Diagnostics <contact@bhavyadiagnostics.com>",
    booking: "Bhavya Diagnostics Booking <booking@bhavyadiagnostics.com>",
    report:  "Bhavya Diagnostics Reports <report@bhavyadiagnostics.com>"
};

async function sendAutoEmail({ type = "contact", to, subject, html, replyTo = "contact@bhavyadiagnostics.com" }) {
    if (!db || !to) return;
    const recipients = (Array.isArray(to) ? to : [to]).filter(e => e && String(e).includes("@"));
    if (recipients.length === 0) return;

    return db.collection("mail").add({
        from: EMAIL_SENDERS[type] || EMAIL_SENDERS.contact,
        replyTo: replyTo,
        to: recipients,
        message: {
            subject: subject,
            html: html
        }
    }).catch(err => console.error("Auto email error:", err));
}

// ✨ TOAST NOTIFICATION LOGIC ✨
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if(!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = 'fa-check-circle'; 
    if(type === 'error') icon = 'fa-exclamation-circle'; else if(type === 'info') icon = 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// ==========================================
// ✨ INITIALIZATION & AUTH STATE ✨
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    try {
        let storedCart = localStorage.getItem('bhavyaCart');
        if (storedCart) dashPageCart = JSON.parse(storedCart);
    } catch (e) { dashPageCart = []; }

    updateGlobalCartBadge();
    initAuthAndDashboard();
    loadDashboardPackages();
});

function initAuthAndDashboard() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
        showToast("Authentication module unavailable.", "error");
        return;
    }

    let authHandled = false;
    firebase.auth().onAuthStateChanged(async (user) => {
        if (authHandled) return;
        authHandled = true;

        if (!user) {
            clearAuthLocalStorage();
            window.location.replace("../index.html");
            return;
        }

        currentAuthUser = user;
        await loadFirebasePatientProfile(user);
    });
}

// ==========================================
// ✨ CLEAN LOGOUT (SIGNS OUT FIREBASE + INDEX.HTML) ✨
// ==========================================
async function logoutDashboard() {
    try {
        clearAuthLocalStorage();
        if (typeof firebase !== 'undefined' && firebase.auth) {
            await firebase.auth().signOut();
        }
    } catch (err) {
        console.error("Sign out error:", err);
    } finally {
        clearAuthLocalStorage();
        window.location.replace("../index.html");
    }
}

function updateGlobalCartBadge() {
    try {
        dashPageCart = JSON.parse(localStorage.getItem('bhavyaCart')) || [];
        let totalItems = dashPageCart.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
        let badge = document.getElementById("globalCartBadge");
        
        if (badge) {
            if (totalItems > 0) {
                badge.innerText = totalItems;
                badge.style.display = "flex";
            } else {
                badge.style.display = "none";
            }
        }
    } catch(e) {}
}

function handleGlobalSearch(e) {
    if (e.key === 'Enter') executeGlobalSearch();
}

function executeGlobalSearch() {
    let query = document.getElementById("globalTestSearch").value.trim();
    if (query) {
        window.location.href = `../booking/booking.html?search=${encodeURIComponent(query)}`;
    } else {
        showToast("Please type a test name to search", "error");
    }
}

function goToGlobalCart() {
    let cart = JSON.parse(localStorage.getItem('bhavyaCart')) || [];
    if (cart.length > 0) {
        window.location.href = `../booking/booking.html?view=cart`;
    } else {
        window.location.href = `../booking/booking.html`; 
    }
}

function claimVipAndGoToCart() {
    let cart = JSON.parse(localStorage.getItem('bhavyaCart')) || [];
    let hasVip = cart.find(item => item.service_id === "VIP-FREE-001");
    
    if(!hasVip) {
        cart.push({ 
            service_id: "VIP-FREE-001", 
            service_name: "VIP Family Plan", 
            price: 0, 
            qty: 1, 
            service_type: "package" 
        });
        localStorage.setItem('bhavyaCart', JSON.stringify(cart));
    }
    window.location.href = `../booking/booking.html?view=cart`;
}

function toggleMobileMenu() {
    const sheet = document.getElementById("mobileMenuSheet"); const backdrop = document.getElementById("menuBackdrop");
    if(sheet && backdrop) {
        if(sheet.classList.contains("active")) { sheet.classList.remove("active"); backdrop.classList.remove("active"); } 
        else { sheet.classList.add("active"); backdrop.classList.add("active"); }
    }
}

function safeSetText(id, text) { const el = document.getElementById(id); if(el) el.innerText = text; }
function safeSetValue(id, val) { const el = document.getElementById(id); if(el && val !== undefined && val !== null) el.value = val; }

function switchTab(tabId, clickedEl) {
    const contents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < contents.length; i++) contents[i].classList.remove("active");
    const links = document.querySelectorAll(".nav-item"); links.forEach(link => link.classList.remove("active"));
    const selectedTab = document.getElementById(tabId); if(selectedTab) selectedTab.classList.add("active");
    
    if (clickedEl && clickedEl.classList && clickedEl.classList.contains('nav-item')) { 
        clickedEl.classList.add("active"); 
    } else { 
        const activeNav = document.querySelector(`[onclick*="switchTab('${tabId}'"].nav-item:not(.mobile-only)`); 
        if(activeNav) activeNav.classList.add("active"); 
    }
}

// ==========================================
// ✨ 100% FIREBASE PATIENT PROFILE & DATA ✨
// ==========================================
async function loadFirebasePatientProfile(user) {
    if (!db || !user) return;

    try {
        const patientRef = db.collection("patients").doc(user.uid);
        const docSnap = await patientRef.get();

        let patient = {};
        if (docSnap.exists) {
            patient = docSnap.data();
        } else {
            const fallbackName = localStorage.getItem("bhavya_name") || "Patient";
            const customId = generateCustomUserId(fallbackName, user.phoneNumber);
            patient = {
                uid: user.uid,
                udi: user.uid,
                user_id: customId,
                name: fallbackName,
                patient_name: fallbackName,
                mobile: user.phoneNumber || "",
                mobile_number: user.phoneNumber || "",
                role: "patient",
                referral_code: customId,
                current_wallet_balance: 0,
                wallet_balance: 0,
                withdraw: "inactive",
                current_plan_status: "basic",
                plan: "basic",
                status: "active",
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            };
            await patientRef.set(patient, { merge: true });
        }

        currentPatientDoc = patient;

        if (patient.status && String(patient.status).toLowerCase() === "blocked") {
            showToast("Your account is blocked by Admin.", "error");
            await logoutDashboard();
            return;
        }

        let pName = patient.name || patient.patient_name || localStorage.getItem("bhavya_name") || "Patient";
        if ((pName === "Patient" || pName === "Unknown") && localStorage.getItem("bhavya_name")) {
            pName = localStorage.getItem("bhavya_name");
        }
        const pMobile = patient.mobile || patient.mobile_number || user.phoneNumber || "";
        const generatedShortId = generateCustomUserId(pName, pMobile);

        // Purane ya naye account mein lamba Firebase UID ho toh short referral/user code mein badlein
        let pUserId = patient.user_id || "";
        if (!pUserId || pUserId === user.uid || pUserId.length > 12) {
            pUserId = generatedShortId;
        }

        let pRefCode = patient.referral_code || "";
        if (!pRefCode || pRefCode === user.uid || pRefCode.length > 12) {
            pRefCode = pUserId;
        }

        if (patient.user_id !== pUserId || patient.referral_code !== pRefCode || !patient.name) {
            await patientRef.set({
                user_id: pUserId,
                referral_code: pRefCode,
                name: pName,
                patient_name: pName
            }, { merge: true });
        }

        const pWallet = Number(patient.current_wallet_balance ?? patient.wallet_balance ?? 0);
        const planRaw = String(patient.current_plan_status || patient.plan || "basic").toLowerCase();

        localStorage.setItem("bhavya_uid", user.uid);
        localStorage.setItem("bhavya_mobile", pMobile);
        localStorage.setItem("bhavya_role", "patient");
        localStorage.setItem("bhavya_user_id", pUserId);
        localStorage.setItem("bhavya_name", pName);
        localStorage.setItem("bhavya_plan_cache", planRaw);

        safeSetText("userNameMobile", pName);
        safeSetText("userNameDesktop", pName);
        safeSetText("userIdDisplay", "ID: " + pUserId);
        safeSetText("walletBal", pWallet.toFixed(2));
        safeSetText("refCodeDisplay", pRefCode);
        safeSetText("infoName", pName);
        safeSetText("infoMobile", pMobile);

        let btnWithdraw = document.getElementById('btn-withdraw');
        if (btnWithdraw) {
            btnWithdraw.style.display = (patient.withdraw && String(patient.withdraw).toLowerCase() === 'active') ? 'block' : 'none';
        }

        isUserVip = (planRaw === "vip");
        safeSetText("vipStatus", planRaw.toUpperCase());

        const vipBtn = document.getElementById("btn-vip-action");
        const vipAlert = document.getElementById("vipPackageAlert");

        if (isUserVip) {
            if (vipBtn) vipBtn.style.display = "none";
            const vipPkgStatus = String(patient.vip_package_status || (patient.vip_package_claimed ? "completed" : "pending")).toLowerCase();
            if (vipAlert) vipAlert.style.display = (vipPkgStatus === "pending") ? "block" : "none";

            const vd = patient.vip_details || {};
            const membersArr = Array.isArray(patient.vipMembers) ? patient.vipMembers : [];
            safeSetText("vd-start", vd.start_date || vd.vip_start_date || "Active");
            safeSetText("vd-end", vd.end_date || vd.vip_end_date || "Active");

            const m1Name = vd.member1_name || vd.member_1_name || membersArr[0] || pName;
            const m2Name = vd.member2_name || vd.member_2_name || membersArr[1] || "";
            const m3Name = vd.member3_name || vd.member_3_name || membersArr[2] || "";

            let mem1 = document.getElementById("vd-mem1");
            if (mem1) mem1.innerHTML = `<span><strong>${escapeHtml(m1Name)}</strong> <br><small style="color:#888;">(Self)</small></span><span style="font-size:11px; background:#e6f0fa; color:#0056b3; padding:3px 8px; border-radius:4px; font-weight:bold;">${escapeHtml(vd.member1_id || pUserId + "_M1")}</span>`;

            let mem2 = document.getElementById("vd-mem2");
            if (mem2) {
                if (m2Name) {
                    mem2.innerHTML = `<span><strong>${escapeHtml(m2Name)}</strong></span><span style="font-size:11px; background:#e6f0fa; color:#0056b3; padding:3px 8px; border-radius:4px; font-weight:bold;">${escapeHtml(vd.member2_id || pUserId + "_M2")}</span>`;
                    mem2.style.display = "flex";
                } else { mem2.style.display = "none"; }
            }

            let mem3 = document.getElementById("vd-mem3");
            if (mem3) {
                if (m3Name) {
                    mem3.innerHTML = `<span><strong>${escapeHtml(m3Name)}</strong></span><span style="font-size:11px; background:#e6f0fa; color:#0056b3; padding:3px 8px; border-radius:4px; font-weight:bold;">${escapeHtml(vd.member3_id || pUserId + "_M3")}</span>`;
                    mem3.style.display = "flex";
                } else { mem3.style.display = "none"; }
            }
        } else {
            if (vipBtn) vipBtn.style.display = "block";
            if (vipAlert) vipAlert.style.display = "none";
        }

        const banner = document.getElementById("profileBanner");
        const profileImages = document.querySelectorAll(".profile-img");
        const editPreview = document.getElementById("editProfilePreview");
        const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(pName)}&background=e6f0fa&color=0056b3&bold=true`;

        const pEmail = patient.email || "";
        const pAddress = patient.address || "";
        const pCity = patient.city || patient.city_village || "";
        const pDistrict = patient.district || "";
        const pState = patient.state || "";
        const pPincode = patient.pincode || "";
        const pImage = patient.image || patient.patient_image || "";

        safeSetValue("infoEmail", pEmail);
        safeSetValue("infoAddress", pAddress);
        safeSetValue("infoCity", pCity);
        safeSetValue("infoDistrict", pDistrict);
        safeSetValue("infoState", pState);
        safeSetValue("infoPincode", pPincode);

        if (pImage && String(pImage).startsWith("data:image")) {
            profileImages.forEach(img => img.src = pImage);
            if (editPreview) editPreview.src = pImage;
        } else {
            profileImages.forEach(img => img.src = fallbackUrl);
            if (editPreview) editPreview.src = fallbackUrl;
        }

        const isProfileComplete = !!(pAddress && pCity && pPincode);
        if (isProfileComplete) {
            if (banner) banner.style.display = "none";
        } else {
            if (banner) banner.style.display = "block";
            if (!sessionStorage.getItem("profilePromptShown")) {
                sessionStorage.setItem("profilePromptShown", "true");
                switchTab('profile');
                setTimeout(() => { showToast("Please complete your profile details.", "info"); }, 500);
            }
        }

        if (dashAllServices.length > 0) renderDashboardPackages(dashCurrentSubCat);

        await Promise.all([
            fetchFirebaseWalletHistory(user.uid),
            fetchFirebasePatientBookings(user.uid)
        ]);
        updateRecentActivity();
    } catch (error) {
        console.error("Firebase Profile Load Error:", error);
        showToast("Error loading profile: " + error.message, "error");
    }
}

function handleVipCardClick() {
    if (isUserVip) { document.getElementById('vip-details-modal').style.display = 'block'; } 
    else { window.location.href = '../vip/vip_member.html'; }
}

const fileInput = document.getElementById("profileImageInput");
if(fileInput) {
    fileInput.addEventListener("change", function(e) {
        const file = e.target.files[0]; if(!file) return;
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = function(event) {
            const img = new Image(); img.src = event.target.result;
            img.onload = function() {
                const canvas = document.createElement("canvas"); const scaleSize = 200 / img.width;
                canvas.width = 200; canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6); 
                document.getElementById("editProfilePreview").src = compressedBase64;
                document.getElementById("infoImageBase64").value = compressedBase64;
            };
        };
    });
}

// Save Patient Profile directly to Firebase + Send Welcome Email via contact@bhavyadiagnostics.com
async function savePatientProfile() {
    if (!db || !currentAuthUser) {
        showToast("Please login again.", "error");
        return;
    }

    const btn = document.getElementById("btnSaveProfile");
    btn.innerText = "Saving Please Wait...";
    btn.disabled = true;

    try {
        const email = document.getElementById("infoEmail").value.trim().toLowerCase();
        const address = document.getElementById("infoAddress").value.trim();
        const city = document.getElementById("infoCity").value.trim();
        const district = document.getElementById("infoDistrict").value.trim();
        const state = document.getElementById("infoState").value.trim();
        const pincode = document.getElementById("infoPincode").value.trim();
        const newImg = document.getElementById("infoImageBase64").value;

        const updatePayload = {
            email: email,
            address: address,
            city: city,
            city_village: city,
            district: district,
            state: state,
            pincode: pincode,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (newImg && newImg.length > 50) {
            updatePayload.image = newImg;
            updatePayload.patient_image = newImg;
        }

        const alreadyWelcomed = currentPatientDoc && currentPatientDoc.welcome_email_sent === true;
        if (email && email.includes("@") && !alreadyWelcomed) {
            updatePayload.welcome_email_sent = true;
            const pName = (currentPatientDoc && (currentPatientDoc.name || currentPatientDoc.patient_name)) || "Patient";

            await sendAutoEmail({
                type: "contact",
                to: email,
                replyTo: "contact@bhavyadiagnostics.com",
                subject: "Welcome to Bhavya Diagnostics!",
                html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
                        <h2 style="color:#0056b3;margin-top:0;">Welcome to Bhavya Diagnostics!</h2>
                        <p>Dear <b>${escapeHtml(pName)}</b>,</p>
                        <p>Your profile is now updated on <b>Bhavya Diagnostics</b> (Main Jhajjar Road, Opp. Narendra Farm, Bahadurgarh). You can book 700+ NABL certified tests, full body packages, ECG &amp; PFT and download reports online.</p>
                        <p style="font-size:13px;color:#64748b;">Need help? Call/WhatsApp <b>89501 12467</b> or reply to this email.</p>
                       </div>`
            });

            await sendAutoEmail({
                type: "contact",
                to: "contact@bhavyadiagnostics.com",
                replyTo: "contact@bhavyadiagnostics.com",
                subject: `Patient Profile Completed: ${pName}`,
                html: `<p><b>Patient:</b> ${escapeHtml(pName)}<br><b>Email:</b> ${escapeHtml(email)}<br><b>Address:</b> ${escapeHtml(address)}, ${escapeHtml(city)} - ${escapeHtml(pincode)}</p>`
            });
        }

        await db.collection("patients").doc(currentAuthUser.uid).set(updatePayload, { merge: true });
        showToast("Profile Details Saved Successfully!", "success");
        await loadFirebasePatientProfile(currentAuthUser);
        switchTab('overview');
    } catch (error) {
        console.error("Profile save error:", error);
        showToast("Failed to save profile: " + error.message, "error");
    } finally {
        btn.innerText = "Save & Update Profile";
        btn.disabled = false;
    }
}

// ==========================================
// ✨ FIREBASE WALLET HISTORY ✨
// ==========================================
async function fetchFirebaseWalletHistory(uid) {
    const container = document.getElementById("walletHistoryContainer");
    if (!container || !db) return;

    try {
        const snap = await db.collection("wallet_transactions").where("uid", "==", uid).get();
        let history = [];
        snap.forEach(doc => {
            const d = doc.data();
            history.push({
                id: doc.id,
                type: d.type || "credit",
                amount: Number(d.amount || 0),
                description: d.description || "-",
                date: formatFirestoreDate(d.created_at || d.date),
                ts: getTimestampMillis(d.created_at || d.date)
            });
        });

        history.sort((a, b) => b.ts - a.ts);

        if (history.length === 0) {
            container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-weight:600;"><i class="fas fa-receipt" style="font-size: 36px; margin-bottom: 12px;"></i><p>No wallet transactions yet.</p></div>`;
            return;
        }

        let html = "";
        history.forEach(txn => {
            const isCredit = String(txn.type).toLowerCase() === 'credit';
            const color = isCredit ? '#10b981' : '#ef4444';
            const sign = isCredit ? '+' : '-';
            html += `
            <div class="list-item" style="align-items: flex-start;">
                <div class="list-info"><h5 style="margin-bottom: 3px;">${escapeHtml(txn.description)}</h5><p><i class="far fa-clock"></i> ${escapeHtml(txn.date)}</p></div>
                <div style="font-weight: 800; color: ${color}; font-size: 16px; margin-top: 2px;">${sign}₹${txn.amount}</div>
            </div>`;
        });
        container.innerHTML = html;
    } catch(e) {
        console.error("Wallet history error:", e);
        container.innerHTML = `<p style="color:#64748b; text-align:center; padding:20px;">No transactions available.</p>`;
    }
}

// ==========================================
// 🌟 FIREBASE BOOKINGS & REPORTS FETCHING 🌟
// ==========================================
function normalizeBookingDoc(docId, d) {
    const items = Array.isArray(d.cart_items) ? d.cart_items : [];
    const labNames = [...new Set(items.map(i => i.selected_lab_name || i.lab_name).filter(Boolean))];
    const labDisplay = d.lab_id || (labNames.length > 0 ? labNames.join(", ") : "Bhavya Diagnostics (NABL)");

    let slotDisplay = d.slot || "";
    if (!slotDisplay && d.lab_slots && typeof d.lab_slots === "object") {
        const slotParts = Object.values(d.lab_slots)
            .filter(s => s && (s.date || s.time))
            .map(s => `${s.date || ""} ${s.time || ""}`.trim());
        slotDisplay = slotParts.join(" | ");
    }
    if (!slotDisplay) slotDisplay = "As Scheduled";

    const fullAddress = [d.address, d.city, d.pincode].filter(Boolean).join(", ");
    const createdTs = getTimestampMillis(d.created_at || d.date);

    return {
        order_id: d.order_id || docId,
        date: formatFirestoreDate(d.created_at || d.date),
        timestamp: createdTs,
        patient_name: d.patient_name || "Patient",
        mobile: d.mobile || "",
        email: d.email || "",
        lab_id: labDisplay,
        cart_items: items,
        subtotal: Number(d.subtotal || 0),
        collection_charge: Number(d.collection_charge || 0),
        discount: Number(d.total_discount || d.discount || 0),
        wallet_used: Number(d.wallet_used || 0),
        final_payable: Number(d.final_total ?? d.final_payable ?? 0),
        fulfillment: d.fulfillment || (items.some(i => i.fulfillment === "home") ? "home" : "center"),
        address: fullAddress || "N/A",
        slot: slotDisplay,
        status: String(d.status || "Pending").toLowerCase(),
        payment_status: String(d.payment_status || "DUE").toLowerCase(),
        report_url: d.report_url || "",
        report_pdf: d.report_pdf || d.report_urls || d.report_url || "",
        hand_reports: d.hand_reports || "",
        rating: d.rating || "",
        feedback: d.feedback || ""
    };
}

async function fetchFirebasePatientBookings(uid) {
    const bookingsContainer = document.getElementById("patientBookingsContainer");
    if (!db) return;

    try {
        const snap = await db.collection("bookings").where("uid", "==", uid).get();
        let bookings = [];
        snap.forEach(doc => {
            bookings.push(normalizeBookingDoc(doc.id, doc.data()));
        });

        bookings.sort((a, b) => b.timestamp - a.timestamp);
        globalBookingsData = bookings;
        renderBookingCards(globalBookingsData);

        globalCompletedReports = globalBookingsData.filter(bk => {
            return bk.status.includes("complete") || bk.status === "completed";
        });
        renderFilteredReports(globalCompletedReports);
    } catch(e) {
        console.error("Firebase bookings fetch error:", e);
        if (bookingsContainer) {
            bookingsContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: #ef4444;"><p>Failed to load bookings: ${escapeHtml(e.message)}</p></div>`;
        }
    }
}

function clearBookingFilters() {
    document.getElementById("searchBookingText").value = "";
    document.getElementById("searchBookingDate").value = "";
    renderBookingCards(globalBookingsData);
}

function filterMyBookings() {
    const searchText = document.getElementById("searchBookingText").value.toLowerCase().trim();
    const searchDate = document.getElementById("searchBookingDate").value; 
    const filtered = globalBookingsData.filter(bk => {
        let matchText = true;
        if (searchText !== "") {
            const labName = (bk.lab_id || "").toLowerCase();
            const orderId = (bk.order_id || "").toLowerCase();
            const items = Array.isArray(bk.cart_items) ? bk.cart_items : [];
            const testNames = items.map(i => (typeof i === 'object' && i !== null) ? (i.service_name || i.test_name || "") : String(i)).join(" ").toLowerCase();
            matchText = labName.includes(searchText) || testNames.includes(searchText) || orderId.includes(searchText);
        }
        let matchDate = true;
        if (searchDate !== "") {
            const [year, month, day] = searchDate.split("-");
            matchDate = (bk.date || "").includes(`${day}-${month}-${year}`) || (bk.slot || "").includes(searchDate);
        }
        return matchText && matchDate;
    });
    renderBookingCards(filtered);
}

function parseReportUrls(rawVal) {
    if (!rawVal) return [];
    if (Array.isArray(rawVal)) return rawVal.filter(u => u && String(u).trim() !== "");
    const str = String(rawVal).trim();
    if (!str) return [];
    try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed.filter(u => u && String(u).trim() !== "");
    } catch (e) {}
    return [str];
}

function renderBookingCards(bookings) {
    const container = document.getElementById("patientBookingsContainer");
    if (!container) return;

    if (bookings.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-weight:600; background:white; border-radius:15px; border:1px solid #e2e8f0;"><i class="fas fa-microscope" style="font-size: 30px; margin-bottom: 10px;"></i><p>No lab bookings found.</p><button onclick="window.location.href='../booking/booking.html'" style="background:var(--primary);color:white;border:none;padding:10px 20px;border-radius:10px;font-weight:700;cursor:pointer;margin-top:8px;">Book Your First Test</button></div>`;
        return;
    }

    let cardsHtml = "";
    bookings.forEach(bk => {
        const items = Array.isArray(bk.cart_items) ? bk.cart_items : [];
        let testsListHtml = "";

        if (items.length > 0) {
            testsListHtml = `<ul style="margin: 8px 0; padding-left: 20px; font-size: 13px; color: var(--text-main); font-weight:500;">`;
            items.forEach(item => {
                let tName = (typeof item === 'object' && item !== null) ? (item.service_name || item.test_name || "Test") : String(item);
                let qtyStr = (item && item.qty > 1) ? ` x${item.qty}` : "";
                let tPrice = (item && item.price !== undefined) ? ` <span style="color:var(--text-light); font-size:11px; font-weight:bold;">(₹${Number(item.price) * Number(item.qty || 1)})</span>` : '';
                testsListHtml += `<li style="margin-bottom:4px;"><strong>${escapeHtml(tName)}${qtyStr}</strong>${tPrice}</li>`;
            });
            testsListHtml += `</ul>`;
        } else {
            testsListHtml = `<p style="margin: 8px 0; font-size: 12px; color:var(--text-light);">No test details found.</p>`;
        }

        let safeStatus = bk.status;
        let badgeClass = "status-warning"; let statusText = "Pending"; let isComplete = false;

        if (safeStatus.includes("confirm")) { badgeClass = "status-primary"; statusText = "Confirmed"; } 
        else if (safeStatus.includes("complete")) { badgeClass = "status-success"; statusText = "Completed"; isComplete = true; } 
        else if (safeStatus.includes("cancel")) { badgeClass = "status-danger"; statusText = "Cancelled"; }

        let modeDisplay = bk.fulfillment.includes('home') ? "Home Collection" : "Center Visit";
        let payStatus = (bk.payment_status.includes("complete") || bk.payment_status.includes("paid") || bk.payment_status.includes("verified")) ? "PAID" : "DUE";
        let payColor = (payStatus === "PAID") ? "#059669" : "#dc2626";
        let payBg = (payStatus === "PAID") ? "var(--success-light)" : "var(--danger-light)";
        let paymentBadge = `<span style="font-size:10px; padding:3px 8px; border-radius:6px; margin-left:8px; font-weight:800; background:${payBg}; color:${payColor}; border:1px solid ${payColor}44;">${payStatus}</span>`;

        let cancelBtnHtml = "";
        if (!isComplete && !safeStatus.includes("cancel")) {
            cancelBtnHtml = `<button onclick="openCancelModal('${escapeHtml(bk.order_id)}')" style="background:var(--danger-light); color:var(--danger); border:1px solid var(--danger); padding:10px; border-radius:10px; font-size:12px; font-weight:bold; cursor:pointer; margin-top:12px; width:100%; transition:0.2s;">Cancel This Booking</button>`;
        }

        let rateBtnHtml = "";
        if (isComplete) {
            if (bk.rating && bk.rating !== "") {
                rateBtnHtml = `<button disabled style="background:#f1f5f9; color:#94a3b8; border:1px solid #cbd5e1; padding:10px; border-radius:10px; font-size:12px; font-weight:bold; margin-top:12px; width:100%; cursor:not-allowed;"><i class="fas fa-check-circle" style="color:#10b981;"></i> Feedback Submitted (${escapeHtml(bk.rating)}★)</button>`;
            } else {
                rateBtnHtml = `<button onclick="openFeedbackModal('${escapeHtml(bk.order_id)}')" style="background:var(--warning-light); color:#b45309; border:1px solid var(--warning); padding:10px; border-radius:10px; font-size:12px; font-weight:bold; cursor:pointer; margin-top:12px; width:100%; transition:0.2s;"><i class="fas fa-star"></i> Rate Lab Experience</button>`;
            }
        }

        let onlinePdfArr = parseReportUrls(bk.report_pdf);
        let handReportsArr = parseReportUrls(bk.hand_reports);
        let reportSectionHtml = "";

        if (isComplete && (onlinePdfArr.length > 0 || handReportsArr.length > 0)) {
            reportSectionHtml = `<div style="margin-top:12px; padding:12px; background:var(--success-light); border:1px solid #a7f3d0; border-radius:10px;"><div style="font-size:12px; color:#065f46; font-weight:800; margin-bottom:5px;"><i class="fas fa-check-circle"></i> Report Ready</div>`;
            if (onlinePdfArr.length > 0) {
                onlinePdfArr.forEach((url, i) => {
                    reportSectionHtml += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:block; text-align:center; margin-top:6px; padding:10px; background:var(--success); color:white; border-radius:8px; text-decoration:none; font-weight:bold; font-size:12px;"><i class="fas fa-download"></i> Download Report ${onlinePdfArr.length > 1 ? i + 1 : 'PDF'}</a>`;
                });
            }
            if (handReportsArr.length > 0) {
                reportSectionHtml += `<div style="font-size:11px; color:#b45309; margin-top:10px; font-weight:bold; text-transform:uppercase;">Collect Physically (In-Hand):</div><ul style="margin:5px 0; padding-left:20px; font-size:12px; color:#b45309; font-weight:600;">`;
                handReportsArr.forEach(srv => { reportSectionHtml += `<li>${escapeHtml(srv)}</li>`; });
                reportSectionHtml += `</ul>`;
            }
            reportSectionHtml += `</div>`;
        }
        
        cardsHtml += `
        <div style="background:#ffffff; border:1px solid var(--border); border-radius:16px; padding:18px; margin-bottom:15px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:12px;">
                <div>
                    <div style="font-size:10px; color:var(--text-light); margin-bottom:2px; font-weight:700; text-transform:uppercase;">Order ID</div>
                    <strong style="color:var(--text-main); font-size:14px; font-weight:800;">#${escapeHtml(bk.order_id)}</strong>
                    <div style="margin-top:6px;"><strong style="font-size:12px; color:var(--primary);"><i class="fas fa-flask"></i> ${escapeHtml(bk.lab_id)}</strong></div>
                </div>
                <div style="text-align:right;">
                    <span class="status-badge ${badgeClass}" style="margin-bottom:6px;">${statusText.toUpperCase()}</span><br>
                    <span style="font-size:11px; color:var(--text-light); font-weight:700;"><i class="far fa-calendar-alt"></i> ${escapeHtml(bk.slot)}</span>
                </div>
            </div>
            <div style="margin-bottom:12px;"><h5 style="margin:0; color:var(--text-light); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Booked Tests</h5>${testsListHtml}</div>
            
            <div style="background:#f8fafc; padding:12px; border-radius:10px; font-size:12px; color:var(--text-main); font-weight:500; line-height:1.6; border:1px solid var(--border); margin-bottom:12px;">
                <strong>Patient:</strong> ${escapeHtml(bk.patient_name)} <br>
                <strong>Mode:</strong> ${modeDisplay} <br>
                <strong>Address:</strong> ${escapeHtml(bk.address)}
            </div>
            <div style="background:#f8fafc; border:1px dashed var(--border); border-radius:10px; padding:12px; font-size:12px;">
                <div style="display:flex; justify-content:space-between; font-weight:800; font-size:15px; color:var(--text-main); align-items:center;">
                    <span>Total Payable:</span> <span>₹${bk.final_payable}${paymentBadge}</span>
                </div>
            </div>
            ${reportSectionHtml}${cancelBtnHtml}${rateBtnHtml}
        </div>`;
    });
    container.innerHTML = cardsHtml;
}

function openCancelModal(orderId) {
    document.getElementById("cancelOrderIdHidden").value = orderId;
    document.getElementById("cancelReasonInput").value = "";
    document.getElementById("cancel-order-modal").style.display = "block";
}

// Cancel Order in Firebase + Refund Wallet if used + Business Email Alert
async function submitCancelOrder() {
    const orderId = document.getElementById("cancelOrderIdHidden").value;
    const reason = document.getElementById("cancelReasonInput").value.trim();
    const btn = document.getElementById("btnConfirmCancel");

    if (!reason) { showToast("Please enter a reason for cancellation.", "error"); return; }
    if (!db || !currentAuthUser) return;

    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        const orderRef = db.collection("bookings").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) throw new Error("Order not found.");

        const oData = orderSnap.data();
        const st = String(oData.status || "").toLowerCase();
        if (st.includes("complete")) throw new Error("Completed orders cannot be cancelled.");
        if (st.includes("cancel")) throw new Error("Order is already cancelled.");

        await orderRef.update({
            status: "Cancelled",
            cancel_reason: reason,
            cancelled_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Refund wallet if wallet balance was used in this order
        const walletUsedAmt = Number(oData.wallet_used || 0);
        if (walletUsedAmt > 0) {
            const patientRef = db.collection("patients").doc(currentAuthUser.uid);
            const pSnap = await patientRef.get();
            if (pSnap.exists) {
                const curBal = Number(pSnap.data().current_wallet_balance ?? pSnap.data().wallet_balance ?? 0);
                const newBal = curBal + walletUsedAmt;
                await patientRef.update({
                    current_wallet_balance: newBal,
                    wallet_balance: newBal
                });

                await db.collection("wallet_transactions").add({
                    uid: currentAuthUser.uid,
                    user_id: pSnap.data().user_id || currentAuthUser.uid,
                    type: "credit",
                    amount: walletUsedAmt,
                    description: `Refund: Cancelled Order ${orderId}`,
                    reference: orderId,
                    created_at: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        // Send cancellation notification via booking@bhavyadiagnostics.com
        const cancelHtml = `<p>Booking <b>#${escapeHtml(orderId)}</b> (${escapeHtml(oData.patient_name || "")}) has been cancelled by the patient.</p><p><b>Reason:</b> ${escapeHtml(reason)}</p>`;
        await sendAutoEmail({
            type: "booking",
            to: "booking@bhavyadiagnostics.com",
            replyTo: "booking@bhavyadiagnostics.com",
            subject: `Booking Cancelled: #${orderId} - ${oData.patient_name || "Patient"}`,
            html: cancelHtml
        });

        if (oData.email && String(oData.email).includes("@")) {
            await sendAutoEmail({
                type: "booking",
                to: oData.email,
                replyTo: "booking@bhavyadiagnostics.com",
                subject: `Booking Cancelled (#${orderId}) - Bhavya Diagnostics`,
                html: `<p>Dear <b>${escapeHtml(oData.patient_name || "Patient")}</b>,</p><p>Your booking <b>#${escapeHtml(orderId)}</b> has been cancelled as requested.</p><p>For any assistance, call <b>89501 12467</b>.</p>`
            });
        }

        showToast("Order cancelled successfully.", "success");
        document.getElementById("cancel-order-modal").style.display = "none";
        await loadFirebasePatientProfile(currentAuthUser);
    } catch(e) {
        showToast("Error: " + e.message, "error");
    } finally {
        btn.innerText = "Confirm Cancellation";
        btn.disabled = false;
    }
}

function clearReportFilters() {
    document.getElementById("searchReportText").value = "";
    document.getElementById("searchReportDate").value = "";
    renderFilteredReports(globalCompletedReports);
}

function filterPatientReports() {
    const searchText = document.getElementById("searchReportText").value.toLowerCase().trim();
    const searchDate = document.getElementById("searchReportDate").value; 
    const filtered = globalCompletedReports.filter(bk => {
        let matchText = true;
        if (searchText !== "") {
            const items = Array.isArray(bk.cart_items) ? bk.cart_items : [];
            const testNames = items.map(i => typeof i === 'object' ? (i.service_name || i.test_name || "") : String(i)).join(" ").toLowerCase();
            matchText = (bk.lab_id || "").toLowerCase().includes(searchText) || testNames.includes(searchText) || (bk.order_id || "").toLowerCase().includes(searchText);
        }
        let matchDate = true;
        if (searchDate !== "") {
            const [y, m, d] = searchDate.split("-");
            matchDate = (bk.date || "").includes(`${d}-${m}-${y}`);
        }
        return matchText && matchDate;
    });
    renderFilteredReports(filtered);
}

function renderFilteredReports(bookings) {
    const reportsTab = document.getElementById("reportsTabContainer");
    if (!reportsTab) return;
    let reportsHtml = "";
    let hasReports = false;

    bookings.forEach(bk => {
        let onlinePdfArr = parseReportUrls(bk.report_pdf);
        let handReportsArr = parseReportUrls(bk.hand_reports);

        if (onlinePdfArr.length > 0 || handReportsArr.length > 0) {
            hasReports = true;
            let linksHtml = "";
            if (onlinePdfArr.length > 0) {
                onlinePdfArr.forEach((url, i) => {
                    linksHtml += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:block; text-align:center; background:var(--success-light); color:#065f46; padding:12px; border-radius:10px; text-decoration:none; font-weight:800; font-size:12px; margin-top:8px; border:1px solid #a7f3d0;"><i class="fas fa-cloud-download-alt"></i> Download E-Report ${onlinePdfArr.length > 1 ? i + 1 : 'PDF'}</a>`;
                });
            }
            if (handReportsArr.length > 0) {
                linksHtml += `<div style="font-size:11px; color:#b45309; margin-top:12px; font-weight:700; text-transform:uppercase;">Collect Physically (In-Hand):</div><ul style="margin:5px 0; padding-left:20px; font-size:12px; color:#b45309; font-weight:600;">`;
                handReportsArr.forEach(srv => { linksHtml += `<li>${escapeHtml(srv)}</li>`; });
                linksHtml += `</ul>`;
            }
            reportsHtml += `
            <div style="background:#fff; border:1px solid var(--border); border-left: 4px solid var(--success); border-radius:12px; padding:18px; margin-bottom:15px; box-shadow:0 4px 15px rgba(0,0,0,0.02);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><h5 style="margin:0; font-size:14px; color:var(--text-main); font-weight:800;"><i class="fas fa-file-medical" style="color:var(--success); margin-right:5px;"></i> Order #${escapeHtml(bk.order_id)}</h5><span style="font-size:11px; color:var(--text-light); font-weight:700;">${escapeHtml(bk.date.split(' ')[0])}</span></div>
                <div style="font-size:12px; color:var(--text-light); line-height:1.6; font-weight:500;"><strong>Patient:</strong> ${escapeHtml(bk.patient_name)} <br><strong>Lab:</strong> ${escapeHtml(bk.lab_id)}</div>${linksHtml}
            </div>`;
        }
    });

    if (!hasReports) {
        reportsHtml = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-weight:600; background:white; border-radius:15px; border:1px solid #e2e8f0;"><i class="fas fa-folder-open" style="font-size: 30px; margin-bottom: 10px;"></i><p>No medical reports uploaded yet.</p></div>`;
    }
    reportsTab.innerHTML = reportsHtml;
}

function updateRecentActivity() {
    let allActivity = [];
    
    globalBookingsData.forEach(bk => {
        let safeStatus = bk.status;
        let isComplete = safeStatus.includes("complete");
        let badgeClass = "status-warning"; let statusText = "Pending";
        if (safeStatus.includes("confirm")) { badgeClass = "status-primary"; statusText = "Confirmed"; } 
        else if (isComplete) { badgeClass = "status-success"; statusText = "Completed"; } 
        else if (safeStatus.includes("cancel")) { badgeClass = "status-danger"; statusText = "Cancelled"; }

        let items = Array.isArray(bk.cart_items) ? bk.cart_items : [];
        let testSummary = items.map(i => i.service_name || i.test_name || "Lab Test").join(", ") || "Diagnostic Booking";
        testSummary = testSummary.substring(0, 32) + (testSummary.length > 32 ? '...' : '');

        allActivity.push({
            id: bk.order_id,
            title: testSummary,
            dateTime: bk.slot !== "As Scheduled" ? bk.slot : bk.date,
            badgeClass: badgeClass,
            statusText: statusText,
            icon: '<i class="fas fa-microscope" style="color:var(--primary); font-size:20px;"></i>',
            bg: 'var(--primary-light)',
            timestamp: bk.timestamp
        });
    });

    allActivity.sort((a, b) => b.timestamp - a.timestamp);
    let recentHtml = "";
    allActivity.slice(0, 4).forEach(act => {
        recentHtml += `<div class="list-item"><div class="list-info" style="display:flex; gap:15px; align-items:center;"><div style="background:${act.bg}; padding:12px; border-radius:12px; display:flex; justify-content:center; align-items:center; width:45px; height:45px;">${act.icon}</div><div><h5 style="font-size:13px; margin-bottom:4px; font-weight:800;">${escapeHtml(act.title)}</h5><p style="color:var(--text-light); font-weight:600; font-size:11px;"><i class="far fa-clock"></i> ${escapeHtml(act.dateTime)}</p></div></div><div style="text-align:right;"><span class="status-badge ${act.badgeClass}" style="font-size:9px;">${act.statusText}</span><div style="font-size:10px; color:#94a3b8; margin-top:4px; font-weight:700;">#${escapeHtml(act.id)}</div></div></div>`;
    });

    const rcContainer = document.getElementById("recentActivityContainer"); 
    if (rcContainer) {
        rcContainer.innerHTML = recentHtml || `<div style="text-align: center; padding: 30px; color: #94a3b8; font-weight:600;"><i class="fas fa-history" style="font-size:30px; margin-bottom:10px;"></i><br>No recent activities.</div>`;
    }
}

// ==========================================
// ✨ PATIENT RATING & FEEDBACK SYSTEM ✨
// ==========================================
let currentFeedbackOrderId = null; 

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', function() {
            let rating = this.getAttribute('data-val');
            document.getElementById('fbRatingValue').value = rating;
            document.querySelectorAll('.star').forEach(s => {
                s.style.color = (s.getAttribute('data-val') <= rating) ? 'var(--warning)' : '#e2e8f0';
            });
        });
    });
});

function openFeedbackModal(orderId) {
    currentFeedbackOrderId = orderId; 
    document.getElementById('fbOrderIdTxt').innerText = "#" + orderId;
    document.getElementById('fbRatingValue').value = 0;
    document.getElementById('fbReviewText').value = "";
    document.querySelectorAll('.star').forEach(s => s.style.color = '#e2e8f0'); 
    document.getElementById('feedbackModal').style.display = 'flex';
}

async function submitFeedback() {
    let rating = document.getElementById('fbRatingValue').value;
    let review = document.getElementById('fbReviewText').value.trim();

    if(rating == 0) { showToast("Please select a star rating first!", "error"); return; }
    if (!db || !currentAuthUser) return;

    const btn = document.getElementById('submitFeedbackBtn');
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Submitting...`;
    btn.disabled = true;

    try {
        await db.collection("bookings").doc(currentFeedbackOrderId).update({
            rating: Number(rating),
            feedback: review,
            feedback_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        await sendAutoEmail({
            type: "contact",
            to: "contact@bhavyadiagnostics.com",
            replyTo: "contact@bhavyadiagnostics.com",
            subject: `New Patient Feedback (${rating}★) - Order #${currentFeedbackOrderId}`,
            html: `<p><b>Order ID:</b> #${escapeHtml(currentFeedbackOrderId)}<br><b>Rating:</b> ${escapeHtml(rating)} / 5<br><b>Review:</b> ${escapeHtml(review || "No text review")}</p>`
        });

        showToast("Thank you! Your feedback is saved.", "success");
        document.getElementById('feedbackModal').style.display = 'none';
        await fetchFirebasePatientBookings(currentAuthUser.uid);
    } catch(e) {
        showToast("Error submitting feedback: " + e.message, "error");
    } finally {
        btn.innerHTML = `<i class="fas fa-paper-plane"></i> Submit Feedback`;
        btn.disabled = false;
    }
}

// ==========================================
// ✨ INDEX.HTML STYLE HEALTH PACKAGES SLIDER IN DASHBOARD ✨
// ==========================================
function loadDashboardPackages() {
    try {
        let cached = localStorage.getItem('bhavya_services_cache');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                dashAllServices = parsed;
                renderDashboardPackages('all');
            }
        }
    } catch (e) {}

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action: "getBookingData", user_id: localStorage.getItem("bhavya_user_id") || "" })
    })
    .then(res => res.json())
    .then(res => {
        if (res.status === "success") {
            dashAllServices = res.data.services || [];
            try { localStorage.setItem('bhavya_services_cache', JSON.stringify(dashAllServices)); } catch (e) {}
            renderDashboardPackages(dashCurrentSubCat);
        }
    }).catch(err => console.log("Dashboard packages error:", err));
}

function renderDashboardPackages(subCat = dashCurrentSubCat) {
    dashCurrentSubCat = subCat;
    const sliderContainer = document.getElementById("dashboardDiscountSlider");
    const catNav = document.getElementById("dashPackageCategories");
    if (!sliderContainer) return;

    const packages = dashAllServices.filter(s =>
        s.service_id !== "VIP-FREE-001" &&
        (String(s.service_type || '').trim().toLowerCase() === 'profile' ||
         String(s.service_type || '').trim().toLowerCase() === 'package' ||
         String(s.service_type || '').trim().toLowerCase() === 'discount_profile')
    );

    if (catNav) {
        const categories = ['all', ...new Set(packages.map(s => String(s.service_category || 'Other').trim()).filter(Boolean))];
        catNav.innerHTML = categories.map(c => {
            const activeClass = c === dashCurrentSubCat ? "active" : "";
            const label = c === 'all' ? "All" : dashFormatText(c);
            return `<button class="dash-cat-btn ${activeClass}" onclick="renderDashboardPackages('${c.replace(/'/g, "\\'")}')">${escapeHtml(label)}</button>`;
        }).join('');
    }

    let displayPkgs = packages;
    if (dashCurrentSubCat !== 'all') {
        displayPkgs = packages.filter(s => String(s.service_category || 'Other').trim() === dashCurrentSubCat);
    }

    if (displayPkgs.length === 0) {
        sliderContainer.innerHTML = `<div style="font-size:12px; color:#64748b; padding:10px;">No health packages available in this category.</div>`;
        return;
    }

    const planCache = (localStorage.getItem("bhavya_plan_cache") || "basic").toLowerCase();
    const isVip = (isUserVip || planCache === "vip" || planCache === "pending");

    let html = "";
    displayPkgs.forEach(pkg => {
        const cleanName = dashFormatText(pkg.service_name || "Health Package");
        const cleanCat = dashFormatText(pkg.service_category || "Package");
        const cleanType = String(pkg.service_type || 'profile').replace(/'/g, "\\'");
        const s_id = String(pkg.service_id).replace(/'/g, "\\'");
        const totalMrp = dashFormatPrice(pkg.service_price);
        const basicPrice = dashFormatPrice(pkg.basic_price || pkg.service_price);
        const vipPrice = dashFormatPrice(pkg.vip_price || basicPrice);
        const applicablePrice = isVip ? vipPrice : basicPrice;

        const cartItem = dashPageCart.find(item => String(item.service_id) === String(pkg.service_id));
        const inCart = !!cartItem;
        const currentQty = cartItem ? cartItem.qty : 0;

        let actionBtnHtml = "";
        if (inCart) {
            actionBtnHtml = `<div class="qty-control"><button onclick="updateDashCartQty('${s_id}', -1, ${applicablePrice}, '${cleanName.replace(/'/g, "\\'")}', '${cleanType}')"><i class="fas fa-minus"></i></button><span class="qty-text">${currentQty}</span><button onclick="updateDashCartQty('${s_id}', 1, ${applicablePrice}, '${cleanName.replace(/'/g, "\\'")}', '${cleanType}')"><i class="fas fa-plus"></i></button></div>`;
        } else {
            actionBtnHtml = `<button class="btn-add-cart" onclick="updateDashCartQty('${s_id}', 1, ${applicablePrice}, '${cleanName.replace(/'/g, "\\'")}', '${cleanType}')">ADD +</button>`;
        }

        const fastingVal = String(pkg.fasting || '').trim();
        const reportVal = String(pkg.reporting_time || '').trim();
        const fastingLabel = fastingVal ? (fastingVal.toLowerCase().includes('fast') || fastingVal.toLowerCase().includes('empty') ? fastingVal : `Fasting: ${fastingVal}`) : "";
        const reportLabel = reportVal ? (reportVal.toLowerCase().includes('report') ? reportVal : `Report: ${reportVal}`) : "";

        let metaHtml = "";
        if (fastingLabel || reportLabel) {
            metaHtml = `<div class="pkg-meta-row">
                ${fastingLabel ? `<span class="pkg-meta-badge pkg-meta-fasting"><i class="fas fa-utensils"></i> ${escapeHtml(fastingLabel)}</span>` : ''}
                ${reportLabel ? `<span class="pkg-meta-badge pkg-meta-report"><i class="fas fa-clock"></i> ${escapeHtml(reportLabel)}</span>` : ''}
            </div>`;
        }

        let descRaw = String(pkg.description || '');
        let descPreviewHtml = "";
        if (descRaw.trim() !== "") {
            let items = descRaw.split(/<br\s*\/?>|\n/i).filter(i => i.trim() !== '');
            if (items.length === 1 && descRaw.includes(',')) items = descRaw.split(',').filter(i => i.trim() !== '');
            if (items.length > 0) {
                let previewItems = items.length <= 4
                    ? items.map(i => dashFormatText(i.trim()))
                    : [...items.slice(0, 2), ...items.slice(-2)].map(i => dashFormatText(i.trim()));
                let moreText = pkg.number_of_test ? `+ ${pkg.number_of_test} Parameters` : (items.length > 4 ? "+ More Details" : "");
                descPreviewHtml = `<div class="pkg-desc"><ul>${previewItems.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>${moreText ? `<div class="pkg-param-pill" onclick="showDashPopup('${s_id}')">${escapeHtml(moreText)}</div>` : ''}</div>`;
            }
        }

        let pricingHtml = "";
        if (isVip) {
            pricingHtml = `
                <span class="pkg-total-mrp">Total: <del>₹${totalMrp}</del></span>
                <div class="pkg-basic-price">₹${vipPrice} <i class="fas fa-crown" style="color:var(--warning); font-size:13px;"></i></div>
            `;
        } else {
            pricingHtml = `
                <span class="pkg-total-mrp">Total: <del>₹${totalMrp}</del></span>
                <div class="pkg-basic-price">₹${basicPrice} <span class="pkg-basic-badge">BASIC</span></div>
                <div class="pkg-vip-pill" onclick="openVipPromo()"><i class="fas fa-crown"></i> VIP Rate: ₹${vipPrice}</div>
            `;
        }

        html += `
        <div class="pkg-card">
            <div class="pkg-header-row">
                <span class="pkg-cat-badge">${escapeHtml(cleanCat)}</span>
                ${pkg.number_of_test ? `<span class="pkg-test-count"><i class="fas fa-microscope"></i> ${escapeHtml(pkg.number_of_test)} Tests</span>` : ''}
            </div>
            <h4 class="pkg-title">${escapeHtml(cleanName)} <i class="fas fa-info-circle" onclick="showDashPopup('${s_id}')" style="color:var(--primary); cursor:pointer; font-size:14px;" title="View details"></i></h4>
            ${descPreviewHtml}
            ${metaHtml}
            <div class="pkg-footer">
                <div class="pkg-price-area">${pricingHtml}</div>
                ${actionBtnHtml}
            </div>
        </div>`;
    });

    sliderContainer.innerHTML = html;
}

window.updateDashCartQty = function(id, change, price, name, type) {
    id = String(id);
    dashPageCart = JSON.parse(localStorage.getItem('bhavyaCart')) || [];
    let index = dashPageCart.findIndex(item => String(item.service_id) === id);
    if (index > -1) {
        dashPageCart[index].qty += change;
        if (dashPageCart[index].qty <= 0) {
            dashPageCart.splice(index, 1);
            showToast("Package removed from cart.", "info");
        }
    } else if (change > 0) {
        const svcObj = dashAllServices.find(s => String(s.service_id) === id);
        dashPageCart.push({
            service_id: id,
            service_name: name,
            price: price,
            qty: 1,
            service_type: type,
            labs: svcObj ? (svcObj.labs || "") : ""
        });
        showToast("Added to Cart! Click Cart icon to checkout.", "success");
    }
    localStorage.setItem('bhavyaCart', JSON.stringify(dashPageCart));
    updateGlobalCartBadge();
    renderDashboardPackages(dashCurrentSubCat);
};

window.showDashPopup = function(id) {
    let srv = dashAllServices.find(s => String(s.service_id) == String(id));
    if(srv && srv.description) {
        document.getElementById('dashModalTitle').innerText = dashFormatText(srv.service_name);
        let items = String(srv.description).split(/<br\s*\/?>|\n/i).filter(i => i.trim() !== '');
        let html = "<ul>" + items.map(i => `<li style="margin-bottom:5px;border-bottom:1px dashed #eee;padding-bottom:4px;">${escapeHtml(dashFormatText(i.trim()))}</li>`).join('') + "</ul>";
        if (srv.number_of_test) {
            html = `<div style="background:#e0f2fe;color:#0284c7;padding:7px 12px;border-radius:8px;font-weight:bold;font-size:12px;margin-bottom:12px;display:inline-block;"><i class="fas fa-microscope"></i> Includes ${escapeHtml(srv.number_of_test)} Parameters</div>` + html;
        }
        document.getElementById('dashModalDesc').innerHTML = html;
        document.getElementById('dashboardInfoModal').style.display = 'flex';
    } else {
        showToast("Description not available", "error");
    }
};

function goToDiscountProfiles() {
    localStorage.setItem("targetCategory", "profile");
    window.location.href = '../booking/booking.html';
}

window.openVipPromo = function() {
    window.location.href = '../vip/vip_member.html'; 
};

window.copyDashReferralCode = function() {
    const code = document.getElementById("refCodeDisplay").innerText;
    if (code && code !== "N/A" && code !== "Loading..") { 
        navigator.clipboard.writeText(code); 
        showToast("Referral Code '" + code + "' Copied! Share with friends 🚀", "success"); 
    } else {
        showToast("Referral code not available right now.", "error");
    }
};

// ==========================================
// ✨ PREMIUM VIP CARD LOGIC ✨
// ==========================================
function generateAndShowVipCard() {
    document.getElementById('vip-details-modal').style.display = 'none';

    const name = localStorage.getItem("bhavya_name") || "VIP Patient";
    const id = localStorage.getItem("bhavya_user_id") || "---";
    const photoSrc = document.getElementById("editProfilePreview").src;
    const refCode = document.getElementById("refCodeDisplay").innerText;

    document.getElementById("vc-name").innerText = name;
    document.getElementById("vc-id").innerText = "ID: " + id;
    document.getElementById("vc-photo").src = photoSrc;
    document.getElementById("vc-ref").innerText = (refCode === "Loading.." || refCode === "N/A") ? "NONE" : refCode;

    document.getElementById("vc-start").innerText = document.getElementById("vd-start").innerText;
    document.getElementById("vc-end").innerText = document.getElementById("vd-end").innerText;

    let memHtml = "";
    let mem1 = document.getElementById("vd-mem1").innerText;
    let mem2 = document.getElementById("vd-mem2").innerText;
    let mem3 = document.getElementById("vd-mem3").innerText;

    if (mem1) memHtml += `<p>${escapeHtml(mem1.split('\n')[0])} <span>(Self)</span></p>`;
    if (mem2 && document.getElementById("vd-mem2").style.display !== "none") memHtml += `<p>${escapeHtml(mem2.split('\n')[0])} <span>(Member)</span></p>`;
    if (mem3 && document.getElementById("vd-mem3").style.display !== "none") memHtml += `<p>${escapeHtml(mem3.split('\n')[0])} <span>(Member)</span></p>`;

    document.getElementById("vc-members-container").innerHTML = memHtml;
    document.getElementById("vipCardModal").classList.add("active");
}

function closeVipCardModal() {
    document.getElementById("vipCardModal").classList.remove("active");
}

function downloadVipCard() {
    const cardElement = document.getElementById('vipCardElement');
    const name = localStorage.getItem("bhavya_name") || "Patient";
    const btn = document.querySelector(".btn-card-action:not(.close)");
    
    let originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    btn.disabled = true;

    html2canvas(cardElement, { scale: 3, backgroundColor: null, useCORS: true }).then(canvas => {
        let image = canvas.toDataURL("image/png");
        let link = document.createElement('a');
        link.download = `BhavyaDiagnostics_VIP_Card_${name.replace(/\s+/g, '_')}.png`;
        link.href = image;
        link.click();

        btn.innerHTML = `<i class="fas fa-check"></i> Saved!`;
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            showToast("VIP Card Downloaded successfully!", "success");
        }, 2000);
    }).catch(() => {
        showToast("Error saving card.", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}
