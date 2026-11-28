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
    if (typeof firebase !== "undefined") {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        if (typeof firebase.firestore === "function") db = firebase.firestore();
    }
} catch (e) {
    console.error("Init error:", e);
}

const GOOGLE_SCRIPT_URL = "[https://script.google.com/macros/s/AKfycbwIxSjlD6oVAGi4InT6Lb8RPg6NWrl7vpptoYrEG5HKPzPaadUp_0pVnN_1OZfJ7X_r/exec](https://script.google.com/macros/s/AKfycbwIxSjlD6oVAGi4InT6Lb8RPg6NWrl7vpptoYrEG5HKPzPaadUp_0pVnN_1OZfJ7X_r/exec)";

let isUserVip = false;
let currentPlanStatus = "basic";
let currentAuthUser = null;
let currentPatientDoc = null;
let globalBookingsData = [];
let globalCompletedReports = [];
let dashAllServices = [];
let dashCurrentSubCat = "all";
let dashPageCart = [];

// Live listener unsubscribers (Auto-Refresh without page reload)
let unsubPatient = null;
let unsubWallet = null;
let unsubBookingsUid = null;
let unsubBookingsMobile = null;
let bookingsByUidMap = new Map();
let bookingsByMobileMap = new Map();

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
    let cleanText = String(text).replace(/_/g, " ");
    let formatted = cleanText.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const acronyms = /\b(cbc|esr|usg|mri|ecg|echo|ct|lft|kft|hba1c|tsh|t3|t4|ana|psa|hiv|hcv|bun|aptt|sgpt|sgot|vdrl|rbc|wbc|bchg|aec|anc|amh|ada|hbsag|crp|abp|ncv|emg|ssep|dlco|eeg|pft|nabl|nabh|crl|ved|bca)\b/gi;
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

function normalizeServiceType(t) {
    return String(t || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function isDiscountProfileService(s) {
    const norm = normalizeServiceType(s.service_type);
    return norm === "discount_profile" || norm === "vip_offer" || norm === "vip_special";
}

function isVipFreeServiceId(id) {
    const up = String(id || "").toUpperCase();
    return up === "VIP-FREE-001" || up === "VIP-FREE-002";
}

function isSurpriseService(s) {
    return normalizeServiceType(s.service_type) === "surprise_package";
}

function clearAuthLocalStorage() {
    localStorage.removeItem("bhavya_uid");
    localStorage.removeItem("bhavya_mobile");
    localStorage.removeItem("bhavya_role");
    localStorage.removeItem("bhavya_user_id");
    localStorage.removeItem("bhavya_name");
    localStorage.removeItem("bhavya_plan_cache");
    localStorage.removeItem("bhavya_profile_cache");
}

function formatFirestoreDate(val) {
    if (!val) return "N/A";
    try {
        let d = (typeof val.toDate === "function") ? val.toDate() : (val.seconds ? new Date(val.seconds * 1000) : new Date(val));
        if (isNaN(d.getTime())) return String(val);

        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = d.getFullYear();
        let hrs = d.getHours();
        const mins = String(d.getMinutes()).padStart(2, "0");
        const ampm = hrs >= 12 ? "PM" : "AM";
        hrs = hrs % 12 || 12;
        return `${dd}-${mm}-${yyyy} ${String(hrs).padStart(2, "0")}:${mins} ${ampm}`;
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

const EMAIL_SENDERS = {
    contact: "Bhavya Diagnostics <contact@bhavyadiagnostics.com>",
    booking: "Bhavya Diagnostics Booking <booking@bhavyadiagnostics.com>",
    report: "Bhavya Diagnostics Reports <report@bhavyadiagnostics.com>"
};

async function sendAutoEmail({ type = "contact", to, subject, html, replyTo = "contact@bhavyadiagnostics.com" }) {
    if (!db || !to) return;
    const recipients = (Array.isArray(to) ? to : [to]).filter(e => e && String(e).includes("@"));
    if (recipients.length === 0) return;

    return db.collection("mail").add({
        from: EMAIL_SENDERS[type] || EMAIL_SENDERS.contact,
        replyTo: replyTo,
        to: recipients,
        message: { subject: subject, html: html }
    }).catch(err => console.error("Auto email error:", err));
}

function showToast(message, type = "success") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    let icon = type === "error" ? "fa-exclamation-circle" : (type === "info" ? "fa-info-circle" : "fa-check-circle");
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// ==========================================
// INITIALIZATION & AUTH STATE
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    try {
        let storedCart = localStorage.getItem("bhavyaCart");
        if (storedCart) dashPageCart = JSON.parse(storedCart);
    } catch (e) { dashPageCart = []; }

    updateGlobalCartBadge();
    initAuthAndDashboard();
    loadDashboardPackages();
});

function initAuthAndDashboard() {
    if (typeof firebase === "undefined" || !firebase.auth) {
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
        startRealtimeDashboard(user);
    });
}

function stopRealtimeListeners() {
    try { if (unsubPatient) unsubPatient(); } catch (e) {}
    try { if (unsubWallet) unsubWallet(); } catch (e) {}
    try { if (unsubBookingsUid) unsubBookingsUid(); } catch (e) {}
    try { if (unsubBookingsMobile) unsubBookingsMobile(); } catch (e) {}
}

async function logoutDashboard() {
    stopRealtimeListeners();
    try {
        clearAuthLocalStorage();
        if (typeof firebase !== "undefined" && firebase.auth) {
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
        dashPageCart = JSON.parse(localStorage.getItem("bhavyaCart")) || [];
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
    } catch (e) {}
}

function goToGlobalCart() {
    let cart = JSON.parse(localStorage.getItem("bhavyaCart")) || [];
    window.location.href = cart.length > 0 ? "../booking/booking.html?view=cart" : "../booking/booking.html";
}

function toggleMobileMenu() {
    const sheet = document.getElementById("mobileMenuSheet");
    const backdrop = document.getElementById("menuBackdrop");
    if (sheet && backdrop) {
        sheet.classList.toggle("active");
        backdrop.classList.toggle("active");
    }
}

function safeSetText(id, text) { const el = document.getElementById(id); if (el) el.innerText = text; }
function safeSetValue(id, val) { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; }

function switchTab(tabId, clickedEl) {
    const contents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < contents.length; i++) contents[i].classList.remove("active");
    document.querySelectorAll(".nav-item").forEach(link => link.classList.remove("active"));
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) selectedTab.classList.add("active");

    if (clickedEl && clickedEl.classList && clickedEl.classList.contains("nav-item")) {
        clickedEl.classList.add("active");
    } else {
        const activeNav = document.querySelector(`[onclick*="switchTab('${tabId}'"].nav-item:not(.mobile-only)`);
        if (activeNav) activeNav.classList.add("active");
    }
}

// =======================================================
// LIVE DASHBOARD SEARCH BAR WITH DIRECT "ADD +" BUTTON
// =======================================================
function handleGlobalSearch(e) {
    if (e.key === "Enter") executeGlobalSearch();
}

function executeGlobalSearch() {
    let query = document.getElementById("globalTestSearch").value.trim();
    if (query) {
        window.location.href = `../booking/booking.html?search=${encodeURIComponent(query)}`;
    } else {
        window.location.href = "../booking/booking.html";
    }
}

function handleDashLiveSearch() {
    const input = document.getElementById("globalTestSearch");
    const box = document.getElementById("dashSearchResults");
    if (!input || !box) return;

    const query = input.value.toLowerCase().trim();
    if (dashAllServices.length === 0) {
        box.style.display = "none";
        return;
    }

    const isPkgType = (s) => {
        const t = normalizeServiceType(s.service_type);
        return t === "profile" || t === "package" || t === "discount_profile";
    };

    const isVip = (currentPlanStatus === "vip" || currentPlanStatus === "pending");

    const renderSearchRow = (s, isPkg) => {
        const price = dashFormatPrice(isVip ? (s.vip_price || s.basic_price) : (s.basic_price || s.service_price));
        const mrp = dashFormatPrice(s.service_price);
        const sId = String(s.service_id).replace(/'/g, "\\'");
        const safeName = dashFormatText(s.service_name).replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const safeType = String(s.service_type || "").replace(/'/g, "\\'");
        const badge = isPkg
            ? `<span style="background:#e0f2fe;color:#0284c7;font-size:9.5px;font-weight:800;padding:2px 6px;border-radius:5px;margin-left:5px;">PACKAGE</span>`
            : "";

        const cartItem = dashPageCart.find(c => String(c.service_id) === String(s.service_id));
        const actionHtml = cartItem
            ? `<div class="ds-qty" onclick="event.stopPropagation()">
                <button type="button" onclick="event.stopPropagation(); updateDashCartQty('${sId}', -1, ${price}, '${safeName}', '${safeType}'); handleDashLiveSearch();">−</button>
                <span>${cartItem.qty}</span>
                <button type="button" onclick="event.stopPropagation(); updateDashCartQty('${sId}', 1, ${price}, '${safeName}', '${safeType}'); handleDashLiveSearch();">+</button>
               </div>`
            : `<button type="button" class="ds-add-btn" onclick="event.stopPropagation(); updateDashCartQty('${sId}', 1, ${price}, '${safeName}', '${safeType}'); handleDashLiveSearch();">ADD +</button>`;

        return `<div class="ds-row">
                    <div class="ds-left" onclick="window.location.href='../booking/booking.html?search=${encodeURIComponent(dashFormatText(s.service_name))}'">
                        <span class="ds-name">${escapeHtml(dashFormatText(s.service_name))}${badge}</span>
                        <span class="ds-price">₹${price}${mrp > price ? ` <del style="color:#94a3b8;font-size:11px;margin-left:4px;">₹${mrp}</del>` : ""}</span>
                    </div>
                    ${actionHtml}
                </div>`;
    };

    let html = "";
    const pool = dashAllServices.filter(s => !isVipFreeServiceId(s.service_id) && !isSurpriseService(s));

    if (query.length === 0) {
        const keywords = ["cbc", "thyroid", "hba1c", "lipid", "lft", "kft", "vitamin d", "full body"];
        let popular = [];
        keywords.forEach(k => {
            const m = pool.find(s => !popular.includes(s) && String(s.service_name || "").toLowerCase().includes(k));
            if (m) popular.push(m);
        });
        popular = popular.slice(0, 6);
        if (popular.length === 0) popular = pool.slice(0, 6);

        html += `<div style="padding:8px 14px; background:#f8fafc; font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase;">🔥 Popular Tests &amp; Packages</div>`;
        popular.forEach(s => { html += renderSearchRow(s, isPkgType(s)); });
    } else {
        const matches = pool.filter(s => {
            const blob = `${s.service_name || ""} ${s.second_name || ""} ${s.service_category || ""} ${s.description || ""}`.toLowerCase();
            return blob.includes(query);
        });
        const tests = matches.filter(s => !isPkgType(s)).slice(0, 5);
        const pkgs = matches.filter(s => isPkgType(s)).slice(0, 5);

        if (tests.length === 0 && pkgs.length === 0) {
            box.innerHTML = `<div style="padding:14px; text-align:center; color:#64748b; font-size:13px; font-weight:600;">No tests or packages found.</div>`;
            box.style.display = "block";
            return;
        }
        if (tests.length > 0) {
            html += `<div style="padding:7px 14px; background:#f8fafc; font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase;">🧪 Tests</div>`;
            tests.forEach(s => { html += renderSearchRow(s, false); });
        }
        if (pkgs.length > 0) {
            html += `<div style="padding:7px 14px; background:#eff6ff; font-size:11px; font-weight:800; color:#2563eb; text-transform:uppercase;">📦 Packages</div>`;
            pkgs.forEach(s => { html += renderSearchRow(s, true); });
        }
    }

    html += `<div style="padding:11px; text-align:center; background:#f8fafc; cursor:pointer; color:var(--primary); font-size:12.5px; font-weight:800;" onclick="executeGlobalSearch()">View all in Booking Portal <i class="fas fa-arrow-right"></i></div>`;
    box.innerHTML = html;
    box.style.display = "block";
}

document.addEventListener("click", (e) => {
    const wrap = document.getElementById("dashSearchBoxWrap");
    const box = document.getElementById("dashSearchResults");
    if (wrap && box && !wrap.contains(e.target)) {
        box.style.display = "none";
    }
});

// =======================================================
// REAL-TIME FIRESTORE LISTENERS (AUTO-REFRESH)
// =======================================================
function startRealtimeDashboard(user) {
    if (!db || !user) return;
    stopRealtimeListeners();

    const patientRef = db.collection("patients").doc(user.uid);
    let mobileListenerStarted = false;

    // 1. Real-time Patient Document Listener
    unsubPatient = patientRef.onSnapshot(async (docSnap) => {
        try {
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
                    current_wallet_balance: 100,
                    wallet_balance: 100,
                    welcome_bonus_credited: true,
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
            const pMobile = patient.mobile || patient.mobile_number || user.phoneNumber || "";
            const generatedShortId = generateCustomUserId(pName, pMobile);

            let pUserId = patient.user_id || "";
            if (!pUserId || pUserId === user.uid || pUserId.length > 12) pUserId = generatedShortId;

            let pRefCode = patient.referral_code || "";
            if (!pRefCode || pRefCode === user.uid || pRefCode.length > 12) pRefCode = pUserId;

            if (patient.user_id !== pUserId || patient.referral_code !== pRefCode) {
                patientRef.set({ user_id: pUserId, referral_code: pRefCode }, { merge: true }).catch(() => {});
            }

            const pWallet = Number(patient.current_wallet_balance ?? patient.wallet_balance ?? 0);
            const planRaw = String(patient.current_plan_status || patient.plan || "basic").toLowerCase().trim();
            currentPlanStatus = planRaw;
            isUserVip = (planRaw === "vip");

            localStorage.setItem("bhavya_uid", user.uid);
            localStorage.setItem("bhavya_mobile", pMobile);
            localStorage.setItem("bhavya_role", "patient");
            localStorage.setItem("bhavya_user_id", pUserId);
            localStorage.setItem("bhavya_name", pName);
            localStorage.setItem("bhavya_plan_cache", planRaw);
            localStorage.setItem("bhavya_profile_cache", JSON.stringify(patient));

            safeSetText("userNameMobile", pName);
            safeSetText("userNameDesktop", pName);
            safeSetText("userIdDisplay", "ID: " + pUserId);
            safeSetText("walletBal", pWallet.toFixed(2));
            safeSetText("refCodeDisplay", pRefCode);
            safeSetText("infoName", pName);
            safeSetText("infoMobile", pMobile);

            // Option 2: Withdraw / KYC button ALWAYS visible
            const btnWithdraw = document.getElementById("btn-withdraw");
            if (btnWithdraw) {
                const isWithdrawActive = String(patient.withdraw || "").toLowerCase() === "active";
                btnWithdraw.style.display = "inline-flex";
                btnWithdraw.innerHTML = isWithdrawActive
                    ? '<i class="fas fa-university"></i> Withdraw Funds'
                    : '<i class="fas fa-university"></i> Withdraw / KYC';
            }

            // Pending VIP English Warning Banner
            const pendingWarnEl = document.getElementById("dashPendingVipWarning");
            if (pendingWarnEl) {
                pendingWarnEl.style.display = (planRaw === "pending") ? "flex" : "none";
            }

            // VIP Status Card
            safeSetText("vipStatus", planRaw === "pending" ? "VIP PENDING" : planRaw.toUpperCase());
            const vipBtn = document.getElementById("btn-vip-action");
            if (vipBtn) {
                if (planRaw === "vip") {
                    vipBtn.style.display = "none";
                } else if (planRaw === "pending") {
                    vipBtn.style.display = "inline-block";
                    vipBtn.innerText = "View Status";
                } else {
                    vipBtn.style.display = "inline-block";
                    vipBtn.innerText = "Upgrade Now";
                }
            }

            // Render Split VIP Complimentary Packages & VIP Details Modal
            renderVipPackagesSection(patient, pName, pUserId);

            // Profile Fields & Avatar
            const banner = document.getElementById("profileBanner");
            const profileImages = document.querySelectorAll(".profile-img");
            const editPreview = document.getElementById("editProfilePreview");
            const fallbackUrl = `[https://ui-avatars.com/api/?name=$](https://ui-avatars.com/api/?name=$){encodeURIComponent(pName)}&background=e6f0fa&color=0056b3&bold=true`;

            safeSetValue("infoEmail", patient.email || "");
            safeSetValue("infoAddress", patient.address || "");
            safeSetValue("infoCity", patient.city || patient.city_village || "");
            safeSetValue("infoDistrict", patient.district || "");
            safeSetValue("infoState", patient.state || "");
            safeSetValue("infoPincode", patient.pincode || "");

            const pImage = patient.image || patient.patient_image || "";
            if (pImage && String(pImage).startsWith("data:image")) {
                profileImages.forEach(img => img.src = pImage);
                if (editPreview) editPreview.src = pImage;
            } else {
                profileImages.forEach(img => img.src = fallbackUrl);
                if (editPreview) editPreview.src = fallbackUrl;
            }

            const isProfileComplete = !!(patient.address && (patient.city || patient.city_village) && patient.pincode);
            if (banner) banner.style.display = isProfileComplete ? "none" : "block";

            // Refresh VIP Exclusive Special Offers (discount_profile) & Trending Packages
            if (dashAllServices.length > 0) {
                renderVipSpecialOffers();
                renderDashboardPackages(dashCurrentSubCat);
            }

            // Start Walk-in Mobile Auto-Link listener once mobile is known
            if (!mobileListenerStarted && pMobile) {
                mobileListenerStarted = true;
                startMobileLinkedBookingsListener(pMobile);
            }
        } catch (err) {
            console.error("Patient snapshot error:", err);
        }
    });

    // 2. Real-time Wallet History Listener
    unsubWallet = db.collection("wallet_transactions").where("uid", "==", user.uid).onSnapshot((snap) => {
        const container = document.getElementById("walletHistoryContainer");
        if (!container) return;
        let history = [];
        snap.forEach(doc => {
            const d = doc.data();
            history.push({
                type: d.type || "credit",
                amount: Number(d.amount || 0),
                description: d.description || "-",
                date: formatFirestoreDate(d.created_at || d.date),
                ts: getTimestampMillis(d.created_at || d.date)
            });
        });
        history.sort((a, b) => b.ts - a.ts);

        if (history.length === 0) {
            container.innerHTML = `<div style="text-align: center; padding: 36px; color: #94a3b8; font-weight:600;"><i class="fas fa-receipt" style="font-size: 32px; margin-bottom: 10px;"></i><p>No wallet transactions yet.</p></div>`;
            return;
        }

        container.innerHTML = history.map(txn => {
            const isCredit = String(txn.type).toLowerCase() === "credit";
            const color = isCredit ? "#10b981" : "#ef4444";
            const sign = isCredit ? "+" : "-";
            return `<div class="list-item" style="align-items:flex-start;">
                        <div class="list-info"><h5 style="margin-bottom:3px;">${escapeHtml(txn.description)}</h5><p><i class="far fa-clock"></i> ${escapeHtml(txn.date)}</p></div>
                        <div style="font-weight:800; color:${color}; font-size:15.5px;">${sign}₹${txn.amount}</div>
                    </div>`;
        }).join("");
    });

    // 3. Real-time Bookings Listener (UID)
    unsubBookingsUid = db.collection("bookings").where("uid", "==", user.uid).onSnapshot((snap) => {
        bookingsByUidMap.clear();
        snap.forEach(doc => {
            bookingsByUidMap.set(doc.id, normalizeBookingDoc(doc.id, doc.data()));
        });
        mergeAndRenderAllBookings();
    });
}

// Auto-Link Walk-in & Camp Bookings/Reports by Patient's 10-digit Mobile Number
function startMobileLinkedBookingsListener(rawMobile) {
    if (!db || !rawMobile) return;
    const digits10 = String(rawMobile).replace(/\D/g, "").slice(-10);
    if (digits10.length !== 10) return;

    const variants = [digits10, "+91" + digits10, "91" + digits10];
    unsubBookingsMobile = db.collection("bookings").where("mobile", "in", variants).onSnapshot((snap) => {
        bookingsByMobileMap.clear();
        snap.forEach(doc => {
            bookingsByMobileMap.set(doc.id, normalizeBookingDoc(doc.id, doc.data()));
        });
        mergeAndRenderAllBookings();
    }, (err) => {
        console.warn("Mobile auto-link skipped:", err.message);
    });
}

function mergeAndRenderAllBookings() {
    const merged = new Map();
    bookingsByMobileMap.forEach((val, key) => merged.set(key, val));
    bookingsByUidMap.forEach((val, key) => merged.set(key, val));

    const list = Array.from(merged.values());
    list.sort((a, b) => b.timestamp - a.timestamp);
    globalBookingsData = list;

    renderBookingCards(globalBookingsData);
    globalCompletedReports = globalBookingsData.filter(bk => {
        const hasPdf = parseReportUrls(bk.report_pdf).length > 0 || parseReportUrls(bk.hand_reports).length > 0;
        return bk.status.includes("complete") || hasPdf;
    });
    renderFilteredReports(globalCompletedReports);
    updateRecentActivity();
}

// =======================================================
// VIP PACKAGE DETAILS & SPLIT CLAIM CARDS (VIP-FREE-001 & VIP-FREE-002)
// =======================================================
function renderVipPackagesSection(patient, pName, pUserId) {
    const cardBox = document.getElementById("vipPackagesCard");
    const grid = document.getElementById("vipPackagesGrid");
    const validityMini = document.getElementById("vipValidityMini");

    const vd = patient.vip_details || {};
    const membersArr = Array.isArray(patient.vipMembers) ? patient.vipMembers : [];
    const memberCount = Number(patient.vip_member_count || vd.member_count || membersArr.length || 1);

    const bloodRem = (patient.vip_blood_pkg_remaining !== undefined)
        ? Number(patient.vip_blood_pkg_remaining)
        : (patient.vip_blood_pkg_claimed || patient.vip_package_claimed ? 0 : memberCount);

    const ecgPftRem = (patient.vip_ecg_pft_pkg_remaining !== undefined)
        ? Number(patient.vip_ecg_pft_pkg_remaining)
        : (patient.vip_ecg_pft_pkg_claimed ? 0 : memberCount);

    // Populate VIP Details Modal
    safeSetText("vd-plan-type", memberCount >= 2 ? `${memberCount} Members Family Plan` : "1 Member Individual Plan");
    safeSetText("vd-start", vd.start_date || vd.vip_start_date || (isUserVip ? "Active" : "Pending"));
    safeSetText("vd-end", vd.end_date || vd.vip_end_date || (isUserVip ? "Active" : "Pending"));

    const pkgStatusBox = document.getElementById("vd-pkg-status");
    if (pkgStatusBox) {
        pkgStatusBox.innerHTML = `
            <div><strong>1. VIP Blood Health Package:</strong> ${bloodRem > 0 ? `<span style="color:#059669;">${bloodRem} Available (₹0)</span>` : `<span style="color:#64748b;">Claimed ✓</span>`}</div>
            <div><strong>2. ECG + PFT + 50+ Body Parameters (Bhavya Diagnostics):</strong> ${ecgPftRem > 0 ? `<span style="color:#059669;">${ecgPftRem} Available (₹0)</span>` : `<span style="color:#64748b;">Claimed ✓</span>`}</div>
        `;
    }

    const m1Name = vd.member1_name || vd.member_1_name || membersArr[0] || pName;
    const m2Name = vd.member2_name || vd.member_2_name || membersArr[1] || "";
    const m3Name = vd.member3_name || vd.member_3_name || membersArr[2] || "";

    const mem1 = document.getElementById("vd-mem1");
    if (mem1) mem1.innerHTML = `<span><strong>${escapeHtml(m1Name)}</strong> <small style="color:#888;">(Self)</small></span><span style="font-size:11px; background:#e6f0fa; color:#0056b3; padding:3px 8px; border-radius:4px; font-weight:bold;">${escapeHtml(vd.member1_id || pUserId + "_M1")}</span>`;

    const mem2 = document.getElementById("vd-mem2");
    if (mem2) {
        if (m2Name) {
            mem2.innerHTML = `<span><strong>${escapeHtml(m2Name)}</strong></span><span style="font-size:11px; background:#e6f0fa; color:#0056b3; padding:3px 8px; border-radius:4px; font-weight:bold;">${escapeHtml(vd.member2_id || pUserId + "_M2")}</span>`;
            mem2.style.display = "flex";
        } else { mem2.style.display = "none"; }
    }

    const mem3 = document.getElementById("vd-mem3");
    if (mem3) {
        if (m3Name) {
            mem3.innerHTML = `<span><strong>${escapeHtml(m3Name)}</strong></span><span style="font-size:11px; background:#e6f0fa; color:#0056b3; padding:3px 8px; border-radius:4px; font-weight:bold;">${escapeHtml(vd.member3_id || pUserId + "_M3")}</span>`;
            mem3.style.display = "flex";
        } else { mem3.style.display = "none"; }
    }

    // Show VIP Packages Card on Dashboard Overview for Active VIP
    if (!cardBox || !grid) return;
    if (!isUserVip) {
        cardBox.style.display = "none";
        return;
    }

    cardBox.style.display = "block";
    if (validityMini) {
        const endStr = vd.end_date || vd.vip_end_date || "";
        validityMini.innerText = `${memberCount} Member Plan${endStr ? " • Valid till " + endStr : ""} • Up to 50% OFF on Tests`;
    }

    const bloodBtnHtml = bloodRem > 0
        ? `<button class="vip-pkg-claim-btn" style="background:#f59e0b; color:#0f172a;" onclick="claimSplitVipPackage('VIP-FREE-001')"><i class="fas fa-vials"></i> Claim Now (${bloodRem} left)</button>`
        : `<button class="vip-pkg-claim-btn" style="background:#334155; color:#94a3b8;" disabled><i class="fas fa-check-circle"></i> Already Claimed</button>`;

    const ecgBtnHtml = ecgPftRem > 0
        ? `<button class="vip-pkg-claim-btn" style="background:#38bdf8; color:#0f172a;" onclick="claimSplitVipPackage('VIP-FREE-002')"><i class="fas fa-heartbeat"></i> Claim Now (${ecgPftRem} left)</button>`
        : `<button class="vip-pkg-claim-btn" style="background:#334155; color:#94a3b8;" disabled><i class="fas fa-check-circle"></i> Already Claimed</button>`;

    grid.innerHTML = `
        <div class="vip-pkg-item">
            <div>
                <h5>
                    <span>🩸 Blood Health Package</span>
                    <i class="fas fa-info-circle" style="color:#93c5fd; cursor:pointer;" onclick="showDashPopup('VIP-FREE-001')" title="View included tests"></i>
                </h5>
                <p>Complete NABL Blood Checkup (CBC, LFT, KFT, Lipid, Thyroid, HbA1c, Vitamin D3 &amp; B12, Urine) with Free Home Collection.</p>
            </div>
            ${bloodBtnHtml}
        </div>
        <div class="vip-pkg-item">
            <div>
                <h5>
                    <span>❤️ ECG + PFT + 50+ Body Para</span>
                    <i class="fas fa-info-circle" style="color:#93c5fd; cursor:pointer;" onclick="showDashPopup('VIP-FREE-002')" title="View details"></i>
                </h5>
                <p>Heart ECG, Lung Function Test (PFT) &amp; 50+ Body Composition Analysis directly at Bhavya Diagnostics Center.</p>
            </div>
            ${ecgBtnHtml}
        </div>
    `;
}

function claimSplitVipPackage(pkgId) {
    const id = String(pkgId || "VIP-FREE-001").toUpperCase();
    let cart = JSON.parse(localStorage.getItem("bhavyaCart")) || [];
    let exists = cart.find(item => String(item.service_id).toUpperCase() === id);

    if (!exists) {
        const liveSvc = dashAllServices.find(s => String(s.service_id).toUpperCase() === id);
        const defaultName = id === "VIP-FREE-002"
            ? "VIP Package: ECG + PFT + 50+ Body Parameters"
            : "VIP Package: Platinum Blood Health Package";
        cart.push({
            service_id: id,
            service_name: liveSvc ? dashFormatText(liveSvc.service_name) : defaultName,
            price: 0,
            mrp_price: liveSvc ? dashFormatPrice(liveSvc.service_price) : (id === "VIP-FREE-002" ? 2000 : 6000),
            basic_price: liveSvc ? dashFormatPrice(liveSvc.basic_price) : (id === "VIP-FREE-002" ? 700 : 4000),
            vip_price: 0,
            qty: 1,
            service_type: liveSvc ? liveSvc.service_type : (id === "VIP-FREE-002" ? "ecg" : "profile"),
            labs: liveSvc ? (liveSvc.labs || "") : (id === "VIP-FREE-002" ? "Bhavya Diagnostics" : ""),
            lab_cost: liveSvc ? (Number(liveSvc.lab_cost) || 0) : 0
        });
        localStorage.setItem("bhavyaCart", JSON.stringify(cart));
    }
    window.location.href = "../booking/booking.html?view=cart";
}

function handleVipCardClick() {
    if (isUserVip) {
        document.getElementById("vip-details-modal").style.display = "block";
    } else {
        window.location.href = "../vip/vip_member.html";
    }
}

// =======================================================
// PROFILE IMAGE & SAVE
// =======================================================
const fileInput = document.getElementById("profileImageInput");
if (fileInput) {
    fileInput.addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function (event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function () {
                const canvas = document.createElement("canvas");
                const scaleSize = 200 / img.width;
                canvas.width = 200;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
                document.getElementById("editProfilePreview").src = compressedBase64;
                document.getElementById("infoImageBase64").value = compressedBase64;
            };
        };
    });
}

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
        const pincode = document.getElementById("infoPincode").value.trim().replace(/\D/g, "");
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
                subject: "Welcome to Bhavya Diagnostics!",
                html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
                        <h2 style="color:#0056b3;margin-top:0;">Welcome to Bhavya Diagnostics!</h2>
                        <p>Dear <b>${escapeHtml(pName)}</b>,</p>
                        <p>Your profile is updated on <b>Bhavya Diagnostics</b> (Main Jhajjar Road, Opp. Narendra Farm, Bahadurgarh). You can book 700+ NABL certified tests, full body packages, ECG &amp; PFT and download reports online.</p>
                        <p style="font-size:13px;color:#64748b;">Need help? Call/WhatsApp <b>89501 12467</b>.</p>
                       </div>`
            });
        }

        await db.collection("patients").doc(currentAuthUser.uid).set(updatePayload, { merge: true });
        showToast("Profile Details Saved!", "success");
        switchTab("overview");
    } catch (error) {
        showToast("Failed to save profile: " + error.message, "error");
    } finally {
        btn.innerText = "Save & Update Profile";
        btn.disabled = false;
    }
}

// =======================================================
// BOOKINGS, REPORTS & TRIPLE PROTECTION RE-TEST
// =======================================================
function normalizeBookingDoc(docId, d) {
    const items = Array.isArray(d.cart_items) ? d.cart_items : [];
    const labNames = [...new Set(items.map(i => i.selected_lab_name || i.lab_name).filter(Boolean))];
    const labDisplay = d.lab_id || (labNames.length > 0 ? labNames.join(", ") : "Bhavya Diagnostics (NABL)");

    let slotDisplay = d.slot || "";
    if (!slotDisplay && d.lab_slots && typeof d.lab_slots === "object") {
        slotDisplay = Object.values(d.lab_slots)
            .filter(s => s && (s.date || s.time))
            .map(s => `${s.date || ""} ${s.time || ""}`.trim())
            .join(" | ");
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
        final_payable: Number(d.final_total ?? d.final_payable ?? 0),
        fulfillment: d.fulfillment || (items.some(i => i.fulfillment === "home") ? "home" : "center"),
        address: fullAddress || "Center / Camp Walk-in",
        slot: slotDisplay,
        status: String(d.status || "Pending").toLowerCase(),
        payment_status: String(d.payment_status || "DUE").toLowerCase(),
        sample_collected_by: d.sample_collected_by || "",
        reverted_to_basic: !!d.reverted_to_basic,
        report_pdf: d.report_pdf || d.report_urls || d.report_url || "",
        hand_reports: d.hand_reports || "",
        rating: d.rating || ""
    };
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
            const testNames = (bk.cart_items || []).map(i => (typeof i === "object" && i !== null) ? (i.service_name || i.test_name || "") : String(i)).join(" ").toLowerCase();
            matchText = (bk.lab_id || "").toLowerCase().includes(searchText) || testNames.includes(searchText) || (bk.order_id || "").toLowerCase().includes(searchText);
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

function renderBookingCards(bookings) {
    const container = document.getElementById("patientBookingsContainer");
    if (!container) return;

    if (bookings.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 36px; color: #94a3b8; font-weight:600; background:white; border-radius:15px; border:1px solid #e2e8f0;"><i class="fas fa-microscope" style="font-size: 28px; margin-bottom: 10px;"></i><p>No lab bookings found.</p><button onclick="window.location.href='../booking/booking.html'" style="background:var(--primary);color:white;border:none;padding:10px 18px;border-radius:10px;font-weight:700;cursor:pointer;margin-top:6px;">Book Your First Test</button></div>`;
        return;
    }

    let cardsHtml = "";
    bookings.forEach(bk => {
        const items = Array.isArray(bk.cart_items) ? bk.cart_items : [];
        let testsListHtml = items.length > 0
            ? `<ul style="margin: 8px 0; padding-left: 20px; font-size: 13px; color: var(--text-main); font-weight:500;">` +
              items.map(item => {
                  let tName = (typeof item === "object" && item !== null) ? (item.service_name || item.test_name || "Test") : String(item);
                  let qtyStr = (item && item.qty > 1) ? ` x${item.qty}` : "";
                  let tPrice = (item && item.price !== undefined) ? ` <span style="color:var(--text-light); font-size:11px; font-weight:bold;">(₹${Number(item.price) * Number(item.qty || 1)})</span>` : "";
                  return `<li style="margin-bottom:4px;"><strong>${escapeHtml(tName)}${qtyStr}</strong>${tPrice}</li>`;
              }).join("") + `</ul>`
            : `<p style="margin: 8px 0; font-size: 12px; color:var(--text-light);">No test details found.</p>`;

        let safeStatus = bk.status;
        let badgeClass = "status-warning";
        let statusText = "Pending";
        let isComplete = false;

        if (safeStatus.includes("sample")) { badgeClass = "status-info"; statusText = "Sample Collected"; }
        else if (safeStatus.includes("confirm")) { badgeClass = "status-primary"; statusText = "Confirmed"; }
        else if (safeStatus.includes("complete")) { badgeClass = "status-success"; statusText = "Completed"; isComplete = true; }
        else if (safeStatus.includes("cancel")) { badgeClass = "status-danger"; statusText = "Cancelled"; }

        let modeDisplay = bk.fulfillment.includes("home") ? "Home Collection" : "Center Visit";
        let payStatus = (bk.payment_status.includes("complete") || bk.payment_status.includes("paid") || bk.payment_status.includes("verified")) ? "PAID" : "DUE";
        let payColor = payStatus === "PAID" ? "#059669" : "#dc2626";
        let payBg = payStatus === "PAID" ? "var(--success-light)" : "var(--danger-light)";
        let paymentBadge = `<span style="font-size:10px; padding:3px 8px; border-radius:6px; margin-left:8px; font-weight:800; background:${payBg}; color:${payColor};">${payStatus}</span>`;

        let revertedNote = bk.reverted_to_basic
            ? `<div style="background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:8px 10px; border-radius:8px; font-size:11.5px; font-weight:700; margin-bottom:10px;"><i class="fas fa-info-circle"></i> Prices were converted to Standard Basic rates because VIP Membership was not approved.</div>`
            : "";

        let cancelBtnHtml = (!isComplete && !safeStatus.includes("cancel") && !safeStatus.includes("sample"))
            ? `<button onclick="openCancelModal('${escapeHtml(bk.order_id)}')" style="background:var(--danger-light); color:var(--danger); border:1px solid var(--danger); padding:10px; border-radius:10px; font-size:12px; font-weight:bold; cursor:pointer; margin-top:10px; width:100%;">Cancel This Booking</button>`
            : "";

        let rateBtnHtml = "";
        if (isComplete) {
            rateBtnHtml = (bk.rating && bk.rating !== "")
                ? `<button disabled style="background:#f1f5f9; color:#94a3b8; border:1px solid #cbd5e1; padding:10px; border-radius:10px; font-size:12px; font-weight:bold; margin-top:10px; width:100%;"><i class="fas fa-check-circle" style="color:#10b981;"></i> Feedback Submitted (${escapeHtml(bk.rating)}★)</button>`
                : `<button onclick="openFeedbackModal('${escapeHtml(bk.order_id)}')" style="background:var(--warning-light); color:#b45309; border:1px solid var(--warning); padding:10px; border-radius:10px; font-size:12px; font-weight:bold; cursor:pointer; margin-top:10px; width:100%;"><i class="fas fa-star"></i> Rate Lab Experience</button>`;
        }

        let onlinePdfArr = parseReportUrls(bk.report_pdf);
        let handReportsArr = parseReportUrls(bk.hand_reports);
        let reportSectionHtml = "";

        if ((isComplete || onlinePdfArr.length > 0) && (onlinePdfArr.length > 0 || handReportsArr.length > 0)) {
            reportSectionHtml = `<div style="margin-top:12px; padding:12px; background:var(--success-light); border:1px solid #a7f3d0; border-radius:10px;"><div style="font-size:12px; color:#065f46; font-weight:800; margin-bottom:5px;"><i class="fas fa-check-circle"></i> Report Ready</div>`;
            onlinePdfArr.forEach((url, i) => {
                reportSectionHtml += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:block; text-align:center; margin-top:6px; padding:10px; background:var(--success); color:white; border-radius:8px; text-decoration:none; font-weight:bold; font-size:12px;"><i class="fas fa-download"></i> Download Report ${onlinePdfArr.length > 1 ? i + 1 : "PDF"}</a>`;
            });
            if (handReportsArr.length > 0) {
                reportSectionHtml += `<div style="font-size:11px; color:#b45309; margin-top:8px; font-weight:bold; text-transform:uppercase;">Collect Physically (In-Hand):</div><ul style="margin:4px 0; padding-left:20px; font-size:12px; color:#b45309; font-weight:600;">${handReportsArr.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
            }
            reportSectionHtml += `<button onclick="openRetestModal('${escapeHtml(bk.order_id)}')" style="margin-top:8px; width:100%; background:#ffffff; color:var(--primary); border:1.5px solid var(--primary); padding:9px; border-radius:8px; font-size:12px; font-weight:800; cursor:pointer;"><i class="fas fa-shield-alt"></i> Doubtful Result? Request Re-test</button></div>`;
        }

        cardsHtml += `
        <div style="background:#ffffff; border:1px solid var(--border); border-radius:16px; padding:16px; margin-bottom:14px; box-shadow: 0 4px 14px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; border-bottom:1px solid #f1f5f9; padding-bottom:10px; gap:8px;">
                <div>
                    <div style="font-size:10px; color:var(--text-light); font-weight:700; text-transform:uppercase;">Order ID</div>
                    <strong style="color:var(--text-main); font-size:14px; font-weight:800;">#${escapeHtml(bk.order_id)}</strong>
                    <div style="margin-top:4px;"><strong style="font-size:12px; color:var(--primary);"><i class="fas fa-flask"></i> ${escapeHtml(bk.lab_id)}</strong></div>
                </div>
                <div style="text-align:right;">
                    <span class="status-badge ${badgeClass}">${statusText}</span><br>
                    <span style="font-size:11px; color:var(--text-light); font-weight:700;"><i class="far fa-calendar-alt"></i> ${escapeHtml(bk.slot)}</span>
                </div>
            </div>
            ${revertedNote}
            <div style="margin-bottom:10px;"><h5 style="margin:0; color:var(--text-light); font-size:11px; font-weight:700; text-transform:uppercase;">Booked Tests</h5>${testsListHtml}</div>
            <div style="background:#f8fafc; padding:10px 12px; border-radius:10px; font-size:12px; color:var(--text-main); line-height:1.55; border:1px solid var(--border); margin-bottom:10px;">
                <strong>Patient:</strong> ${escapeHtml(bk.patient_name)} • <strong>Mode:</strong> ${modeDisplay}<br>
                <strong>Address:</strong> ${escapeHtml(bk.address)}
                ${bk.sample_collected_by ? `<br><strong style="color:#0369a1;">Sample Collected By:</strong> ${escapeHtml(bk.sample_collected_by)}` : ""}
            </div>
            <div style="background:#f8fafc; border:1px dashed var(--border); border-radius:10px; padding:11px 12px; font-size:12px;">
                <div style="display:flex; justify-content:space-between; font-weight:800; font-size:14.5px; color:var(--text-main); align-items:center;">
                    <span>Total Payable:</span> <span>₹${bk.final_payable}${paymentBadge}</span>
                </div>
            </div>
            ${reportSectionHtml}${cancelBtnHtml}${rateBtnHtml}
        </div>`;
    });
    container.innerHTML = cardsHtml;
}

function openRetestModal(orderId) {
    document.getElementById("rtOrderIdHidden").value = orderId;
    document.getElementById("rtOrderIdTxt").innerText = "#" + orderId;
    document.getElementById("rtTestNameInput").value = "";
    document.getElementById("rtReasonInput").value = "";
    document.getElementById("retestModal").style.display = "block";
}

async function submitRetestRequest() {
    const orderId = document.getElementById("rtOrderIdHidden").value;
    const testName = document.getElementById("rtTestNameInput").value.trim();
    const reason = document.getElementById("rtReasonInput").value.trim();
    const btn = document.getElementById("btnSubmitRetest");

    if (!testName || !reason) {
        showToast("Please enter both test name and reason.", "error");
        return;
    }
    if (!db || !currentAuthUser) return;

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    btn.disabled = true;

    try {
        const pName = (currentPatientDoc && (currentPatientDoc.name || currentPatientDoc.patient_name)) || "Patient";
        const pMobile = (currentPatientDoc && (currentPatientDoc.mobile || currentPatientDoc.mobile_number)) || currentAuthUser.phoneNumber || "";
        const pEmail = (currentPatientDoc && currentPatientDoc.email) || "";

        await db.collection("retest_requests").add({
            order_id: orderId,
            uid: currentAuthUser.uid,
            user_id: (currentPatientDoc && currentPatientDoc.user_id) || currentAuthUser.uid,
            patient_name: pName,
            mobile: pMobile,
            email: pEmail,
            test_name: testName,
            reason: reason,
            status: "Pending",
            admin_remarks: "",
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        await sendAutoEmail({
            type: "report",
            to: ["contact@bhavyadiagnostics.com", "report@bhavyadiagnostics.com"],
            subject: `🛡️ Triple Protection Re-test Request: #${orderId} - ${pName}`,
            html: `<div style="font-family:Arial,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
                    <h3 style="color:#0056b3;margin-top:0;">Triple Protection Re-test Request</h3>
                    <ul>
                      <li><b>Order ID:</b> #${escapeHtml(orderId)}</li>
                      <li><b>Patient:</b> ${escapeHtml(pName)} (${escapeHtml(pMobile)})</li>
                      <li><b>Doubtful Test:</b> ${escapeHtml(testName)}</li>
                      <li><b>Reason:</b> ${escapeHtml(reason)}</li>
                    </ul>
                   </div>`
        });

        document.getElementById("retestModal").style.display = "none";
        showToast("Re-test request submitted! Our quality team will contact you shortly.", "success");
    } catch (e) {
        showToast("Failed to submit request: " + e.message, "error");
    } finally {
        btn.innerHTML = '<i class="fas fa-sync-alt"></i> Submit Re-test Request';
        btn.disabled = false;
    }
}

function openCancelModal(orderId) {
    document.getElementById("cancelOrderIdHidden").value = orderId;
    document.getElementById("cancelReasonInput").value = "";
    document.getElementById("cancel-order-modal").style.display = "block";
}

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

        const walletUsedAmt = Number(oData.wallet_used || 0);
        if (walletUsedAmt > 0) {
            const patientRef = db.collection("patients").doc(currentAuthUser.uid);
            const pSnap = await patientRef.get();
            if (pSnap.exists) {
                const curBal = Number(pSnap.data().current_wallet_balance ?? pSnap.data().wallet_balance ?? 0);
                const newBal = curBal + walletUsedAmt;
                await patientRef.update({ current_wallet_balance: newBal, wallet_balance: newBal });
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

        await sendAutoEmail({
            type: "booking",
            to: "booking@bhavyadiagnostics.com",
            replyTo: "booking@bhavyadiagnostics.com",
            subject: `Booking Cancelled: #${orderId} - ${oData.patient_name || "Patient"}`,
            html: `<p>Booking <b>#${escapeHtml(orderId)}</b> (${escapeHtml(oData.patient_name || "")}) cancelled by patient.</p><p><b>Reason:</b> ${escapeHtml(reason)}</p>`
        });

        showToast("Order cancelled successfully.", "success");
        document.getElementById("cancel-order-modal").style.display = "none";
    } catch (e) {
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
            const testNames = (bk.cart_items || []).map(i => typeof i === "object" ? (i.service_name || i.test_name || "") : String(i)).join(" ").toLowerCase();
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
            onlinePdfArr.forEach((url, i) => {
                linksHtml += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:block; text-align:center; background:var(--success-light); color:#065f46; padding:11px; border-radius:10px; text-decoration:none; font-weight:800; font-size:12px; margin-top:8px; border:1px solid #a7f3d0;"><i class="fas fa-cloud-download-alt"></i> Download E-Report ${onlinePdfArr.length > 1 ? i + 1 : "PDF"}</a>`;
            });
            if (handReportsArr.length > 0) {
                linksHtml += `<div style="font-size:11px; color:#b45309; margin-top:10px; font-weight:700; text-transform:uppercase;">Collect Physically (In-Hand):</div><ul style="margin:4px 0; padding-left:20px; font-size:12px; color:#b45309; font-weight:600;">${handReportsArr.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
            }
            linksHtml += `<button onclick="openRetestModal('${escapeHtml(bk.order_id)}')" style="margin-top:8px; width:100%; background:#eff6ff; color:var(--primary); border:1.5px solid #93c5fd; padding:10px; border-radius:10px; font-size:12px; font-weight:800; cursor:pointer;"><i class="fas fa-shield-alt"></i> Triple Protection: Doubtful Result? Request Re-test</button>`;

            reportsHtml += `
            <div style="background:#fff; border:1px solid var(--border); border-left: 4px solid var(--success); border-radius:12px; padding:16px; margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <h5 style="margin:0; font-size:14px; color:var(--text-main); font-weight:800;"><i class="fas fa-file-medical" style="color:var(--success); margin-right:5px;"></i> Order #${escapeHtml(bk.order_id)}</h5>
                    <span style="font-size:11px; color:var(--text-light); font-weight:700;">${escapeHtml(bk.date.split(" ")[0])}</span>
                </div>
                <div style="font-size:12px; color:var(--text-light); line-height:1.55; font-weight:500;">
                    <strong>Patient:</strong> ${escapeHtml(bk.patient_name)} <br>
                    <strong>Lab:</strong> ${escapeHtml(bk.lab_id)}
                </div>
                ${linksHtml}
            </div>`;
        }
    });

    if (!hasReports) {
        reportsHtml = `<div style="text-align: center; padding: 36px; color: #94a3b8; font-weight:600; background:white; border-radius:15px; border:1px solid #e2e8f0;"><i class="fas fa-folder-open" style="font-size: 28px; margin-bottom: 10px;"></i><p>No medical reports uploaded yet.</p><p style="font-size:11.5px; color:#64748b;">Digital reports remain available for 1 year. Save a copy once ready.</p></div>`;
    }
    reportsTab.innerHTML = reportsHtml;
}

function updateRecentActivity() {
    let allActivity = globalBookingsData.slice(0, 4).map(bk => {
        let safeStatus = bk.status;
        let badgeClass = "status-warning";
        let statusText = "Pending";
        if (safeStatus.includes("sample")) { badgeClass = "status-info"; statusText = "Sample Collected"; }
        else if (safeStatus.includes("confirm")) { badgeClass = "status-primary"; statusText = "Confirmed"; }
        else if (safeStatus.includes("complete")) { badgeClass = "status-success"; statusText = "Completed"; }
        else if (safeStatus.includes("cancel")) { badgeClass = "status-danger"; statusText = "Cancelled"; }

        let testSummary = (bk.cart_items || []).map(i => i.service_name || i.test_name || "Lab Test").join(", ") || "Diagnostic Booking";
        if (testSummary.length > 34) testSummary = testSummary.substring(0, 34) + "...";

        return `<div class="list-item">
                    <div class="list-info" style="display:flex; gap:12px; align-items:center;">
                        <div style="background:var(--primary-light); padding:10px; border-radius:11px; display:flex; justify-content:center; align-items:center; width:42px; height:42px;"><i class="fas fa-microscope" style="color:var(--primary); font-size:18px;"></i></div>
                        <div><h5 style="font-size:13px; margin-bottom:3px; font-weight:800;">${escapeHtml(testSummary)}</h5><p style="color:var(--text-light); font-weight:600; font-size:11px;"><i class="far fa-clock"></i> ${escapeHtml(bk.slot !== "As Scheduled" ? bk.slot : bk.date)}</p></div>
                    </div>
                    <div style="text-align:right; flex-shrink:0;"><span class="status-badge ${badgeClass}" style="font-size:9px;">${statusText}</span><div style="font-size:10px; color:#94a3b8; font-weight:700;">#${escapeHtml(bk.order_id)}</div></div>
                </div>`;
    });

    const rcContainer = document.getElementById("recentActivityContainer");
    if (rcContainer) {
        rcContainer.innerHTML = allActivity.length > 0
            ? allActivity.join("")
            : `<div style="text-align: center; padding: 28px; color: #94a3b8; font-weight:600;"><i class="fas fa-history" style="font-size:26px; margin-bottom:8px;"></i><br>No recent bookings yet.</div>`;
    }
}

// =======================================================
// RATING & FEEDBACK
// =======================================================
let currentFeedbackOrderId = null;

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".star").forEach(star => {
        star.addEventListener("click", function () {
            let rating = this.getAttribute("data-val");
            document.getElementById("fbRatingValue").value = rating;
            document.querySelectorAll(".star").forEach(s => {
                s.style.color = (s.getAttribute("data-val") <= rating) ? "var(--warning)" : "#e2e8f0";
            });
        });
    });
});

function openFeedbackModal(orderId) {
    currentFeedbackOrderId = orderId;
    document.getElementById("fbOrderIdTxt").innerText = "#" + orderId;
    document.getElementById("fbRatingValue").value = 0;
    document.getElementById("fbReviewText").value = "";
    document.querySelectorAll(".star").forEach(s => s.style.color = "#e2e8f0");
    document.getElementById("feedbackModal").style.display = "block";
}

async function submitFeedback() {
    let rating = document.getElementById("fbRatingValue").value;
    let review = document.getElementById("fbReviewText").value.trim();

    if (rating == 0) { showToast("Please select a star rating first!", "error"); return; }
    if (!db || !currentAuthUser) return;

    const btn = document.getElementById("submitFeedbackBtn");
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
            subject: `New Patient Feedback (${rating}★) - Order #${currentFeedbackOrderId}`,
            html: `<p><b>Order ID:</b> #${escapeHtml(currentFeedbackOrderId)}<br><b>Rating:</b> ${escapeHtml(rating)} / 5<br><b>Review:</b> ${escapeHtml(review || "No text review")}</p>`
        });

        showToast("Thank you! Your feedback is saved.", "success");
        document.getElementById("feedbackModal").style.display = "none";
    } catch (e) {
        showToast("Error submitting feedback: " + e.message, "error");
    } finally {
        btn.innerHTML = `<i class="fas fa-paper-plane"></i> Submit Feedback`;
        btn.disabled = false;
    }
}

// =======================================================
// VIP SPECIAL OFFERS (discount_profile) & TRENDING PACKAGES
// =======================================================
function loadDashboardPackages() {
    try {
        let cached = localStorage.getItem("bhavya_services_cache");
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                dashAllServices = parsed;
                renderVipSpecialOffers();
                renderDashboardPackages("all");
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
                try { localStorage.setItem("bhavya_services_cache", JSON.stringify(dashAllServices)); } catch (e) {}
                renderVipSpecialOffers();
                renderDashboardPackages(dashCurrentSubCat);
            }
        })
        .catch(err => console.log("Dashboard packages error:", err));
}

function buildPackageCardHtml(pkg, isVip, isSpecialOffer = false) {
    const cleanName = dashFormatText(pkg.service_name || "Health Package");
    const cleanCat = dashFormatText(pkg.service_category || (isSpecialOffer ? "VIP Special" : "Package"));
    const cleanType = String(pkg.service_type || "profile").replace(/'/g, "\\'");
    const s_id = String(pkg.service_id).replace(/'/g, "\\'");
    const totalMrp = dashFormatPrice(pkg.service_price);
    const basicPrice = dashFormatPrice(pkg.basic_price || pkg.service_price);
    const vipPrice = dashFormatPrice(pkg.vip_price || basicPrice);
    const applicablePrice = isVip ? vipPrice : basicPrice;

    const cartItem = dashPageCart.find(item => String(item.service_id) === String(pkg.service_id));
    const actionBtnHtml = cartItem
        ? `<div class="qty-control"><button onclick="updateDashCartQty('${s_id}', -1, ${applicablePrice}, '${cleanName.replace(/'/g, "\\'")}', '${cleanType}')"><i class="fas fa-minus"></i></button><span class="qty-text">${cartItem.qty}</span><button onclick="updateDashCartQty('${s_id}', 1, ${applicablePrice}, '${cleanName.replace(/'/g, "\\'")}', '${cleanType}')"><i class="fas fa-plus"></i></button></div>`
        : `<button class="btn-add-cart" onclick="updateDashCartQty('${s_id}', 1, ${applicablePrice}, '${cleanName.replace(/'/g, "\\'")}', '${cleanType}')">ADD +</button>`;

    const fastingVal = String(pkg.fasting || "").trim();
    const reportVal = String(pkg.reporting_time || "").trim();
    const fastingLabel = fastingVal ? (fastingVal.toLowerCase().includes("fast") || fastingVal.toLowerCase().includes("empty") ? fastingVal : `Fasting: ${fastingVal}`) : "";
    const reportLabel = reportVal ? (reportVal.toLowerCase().includes("report") ? reportVal : `Report: ${reportVal}`) : "";

    let metaHtml = (fastingLabel || reportLabel)
        ? `<div class="pkg-meta-row">
            ${fastingLabel ? `<span class="pkg-meta-badge pkg-meta-fasting"><i class="fas fa-utensils"></i> ${escapeHtml(fastingLabel)}</span>` : ""}
            ${reportLabel ? `<span class="pkg-meta-badge pkg-meta-report"><i class="fas fa-clock"></i> ${escapeHtml(reportLabel)}</span>` : ""}
           </div>`
        : "";

    let descRaw = String(pkg.description || "");
    let descPreviewHtml = "";
    if (descRaw.trim() !== "") {
        let items = descRaw.split(/<br\s*\/?>|\n/i).filter(i => i.trim() !== "");
        if (items.length === 1 && descRaw.includes(",")) items = descRaw.split(",").filter(i => i.trim() !== "");
        if (items.length > 0) {
            let previewItems = items.length <= 4
                ? items.map(i => dashFormatText(i.trim()))
                : [...items.slice(0, 2), ...items.slice(-2)].map(i => dashFormatText(i.trim()));
            let moreText = pkg.number_of_test ? `+ ${pkg.number_of_test} Parameters` : (items.length > 4 ? "+ More Details" : "");
            descPreviewHtml = `<div class="pkg-desc"><ul>${previewItems.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>${moreText ? `<div class="pkg-param-pill" onclick="showDashPopup('${s_id}')">${escapeHtml(moreText)}</div>` : ""}</div>`;
        }
    }

    let pricingHtml = isVip
        ? `<span class="pkg-total-mrp">MRP: <del>₹${totalMrp}</del> • Basic: <del>₹${basicPrice}</del></span>
           <div class="pkg-basic-price" style="color:#059669;">₹${vipPrice} <i class="fas fa-crown" style="color:var(--warning); font-size:13px;"></i></div>`
        : `<span class="pkg-total-mrp">MRP: <del>₹${totalMrp}</del></span>
           <div class="pkg-basic-price">₹${basicPrice} <span class="pkg-basic-badge">BASIC</span></div>
           <div class="pkg-vip-pill" onclick="openVipPromo()"><i class="fas fa-crown"></i> VIP Rate: ₹${vipPrice}</div>`;

    const borderStyle = isSpecialOffer ? "border-color:#f59e0b; background:#ffffff;" : "";
    const catBadgeStyle = isSpecialOffer ? "background:#fef3c7; color:#b45309;" : "";

    return `
    <div class="pkg-card" style="${borderStyle}">
        <div class="pkg-header-row">
            <span class="pkg-cat-badge" style="${catBadgeStyle}">${escapeHtml(cleanCat)}</span>
            ${pkg.number_of_test ? `<span class="pkg-test-count"><i class="fas fa-microscope"></i> ${escapeHtml(pkg.number_of_test)} Tests</span>` : ""}
        </div>
        <h4 class="pkg-title">${escapeHtml(cleanName)} <i class="fas fa-info-circle" onclick="showDashPopup('${s_id}')" style="color:var(--primary); cursor:pointer; font-size:14px;" title="View details"></i></h4>
        ${descPreviewHtml}
        ${metaHtml}
        <div class="pkg-footer">
            <div class="pkg-price-area">${pricingHtml}</div>
            ${actionBtnHtml}
        </div>
    </div>`;
}

// Dedicated VIP Special Offers Section (discount_profile)
function renderVipSpecialOffers() {
    const section = document.getElementById("vipSpecialOffersSection");
    const slider = document.getElementById("vipSpecialOffersSlider");
    if (!section || !slider) return;

    const planCache = (localStorage.getItem("bhavya_plan_cache") || currentPlanStatus || "basic").toLowerCase();
    const isVip = (isUserVip || planCache === "vip" || planCache === "pending");

    const discountProfiles = dashAllServices.filter(s => !isVipFreeServiceId(s.service_id) && isDiscountProfileService(s));

    if (!isVip || discountProfiles.length === 0) {
        section.style.display = "none";
        return;
    }

    section.style.display = "block";
    slider.innerHTML = discountProfiles.map(pkg => buildPackageCardHtml(pkg, true, true)).join("");
}

function renderDashboardPackages(subCat = dashCurrentSubCat) {
    dashCurrentSubCat = subCat;
    const sliderContainer = document.getElementById("dashboardDiscountSlider");
    const catNav = document.getElementById("dashPackageCategories");
    if (!sliderContainer) return;

    const planCache = (localStorage.getItem("bhavya_plan_cache") || currentPlanStatus || "basic").toLowerCase();
    const isVip = (isUserVip || planCache === "vip" || planCache === "pending");

    const packages = dashAllServices.filter(s => {
        if (isVipFreeServiceId(s.service_id) || isSurpriseService(s)) return false;
        const norm = normalizeServiceType(s.service_type);
        return norm === "profile" || norm === "package" || (!isVip && isDiscountProfileService(s));
    });

    if (catNav) {
        const categories = ["all", ...new Set(packages.map(s => String(s.service_category || "Other").trim()).filter(Boolean))];
        catNav.innerHTML = categories.map(c => {
            const activeClass = c === dashCurrentSubCat ? "active" : "";
            const label = c === "all" ? "All" : dashFormatText(c);
            return `<button class="dash-cat-btn ${activeClass}" onclick="renderDashboardPackages('${c.replace(/'/g, "\\'")}')">${escapeHtml(label)}</button>`;
        }).join("");
    }

    let displayPkgs = packages;
    if (dashCurrentSubCat !== "all") {
        displayPkgs = packages.filter(s => String(s.service_category || "Other").trim() === dashCurrentSubCat);
    }

    if (displayPkgs.length === 0) {
        sliderContainer.innerHTML = `<div style="font-size:12px; color:#64748b; padding:10px;">No health packages available in this category.</div>`;
        return;
    }

    sliderContainer.innerHTML = displayPkgs.map(pkg => buildPackageCardHtml(pkg, isVip, false)).join("");
}

window.updateDashCartQty = function (id, change, price, name, type) {
    id = String(id);
    dashPageCart = JSON.parse(localStorage.getItem("bhavyaCart")) || [];
    let index = dashPageCart.findIndex(item => String(item.service_id) === id);
    if (index > -1) {
        dashPageCart[index].qty += change;
        if (dashPageCart[index].qty <= 0) {
            dashPageCart.splice(index, 1);
            showToast("Removed from cart.", "info");
        }
    } else if (change > 0) {
        const svcObj = dashAllServices.find(s => String(s.service_id) === id);
        dashPageCart.push({
            service_id: id,
            service_name: name,
            price: price,
            mrp_price: svcObj ? dashFormatPrice(svcObj.service_price) : price,
            basic_price: svcObj ? dashFormatPrice(svcObj.basic_price || svcObj.service_price) : price,
            vip_price: svcObj ? dashFormatPrice(svcObj.vip_price || svcObj.basic_price || price) : price,
            qty: 1,
            service_type: type,
            labs: svcObj ? (svcObj.labs || "") : "",
            lab_cost: svcObj ? (Number(svcObj.lab_cost) || 0) : 0
        });
        showToast("Added to Cart! Tap Cart icon to checkout.", "success");
    }
    localStorage.setItem("bhavyaCart", JSON.stringify(dashPageCart));
    updateGlobalCartBadge();
    renderVipSpecialOffers();
    renderDashboardPackages(dashCurrentSubCat);
};

window.showDashPopup = function (id) {
    let srv = dashAllServices.find(s => String(s.service_id).toUpperCase() === String(id).toUpperCase());
    if (srv && srv.description) {
        document.getElementById("dashModalTitle").innerText = dashFormatText(srv.service_name);
        let items = String(srv.description).split(/<br\s*\/?>|\n/i).filter(i => i.trim() !== "");
        let html = "<ul>" + items.map(i => `<li style="margin-bottom:5px;border-bottom:1px dashed #eee;padding-bottom:4px;">${escapeHtml(dashFormatText(i.trim()))}</li>`).join("") + "</ul>";
        if (srv.number_of_test) {
            html = `<div style="background:#e0f2fe;color:#0284c7;padding:7px 12px;border-radius:8px;font-weight:bold;font-size:12px;margin-bottom:12px;display:inline-block;"><i class="fas fa-microscope"></i> Includes ${escapeHtml(srv.number_of_test)} Parameters</div>` + html;
        }
        document.getElementById("dashModalDesc").innerHTML = html;
        document.getElementById("dashboardInfoModal").style.display = "flex";
    } else {
        showToast("Details loading or unavailable.", "info");
    }
};

window.openVipPromo = function () {
    window.location.href = "../vip/vip_member.html";
};

window.copyDashReferralCode = function () {
    const code = document.getElementById("refCodeDisplay").innerText;
    if (code && code !== "N/A" && code !== "Loading..") {
        navigator.clipboard.writeText(code);
        showToast("Referral Code '" + code + "' Copied!", "success");
    } else {
        showToast("Referral code not available right now.", "error");
    }
};

// =======================================================
// PREMIUM VIP CARD LOGIC
// =======================================================
function generateAndShowVipCard() {
    document.getElementById("vip-details-modal").style.display = "none";

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

    if (mem1) memHtml += `<p>${escapeHtml(mem1.split("\n")[0])} <span>(Self)</span></p>`;
    if (mem2 && document.getElementById("vd-mem2").style.display !== "none") memHtml += `<p>${escapeHtml(mem2.split("\n")[0])} <span>(Member)</span></p>`;
    if (mem3 && document.getElementById("vd-mem3").style.display !== "none") memHtml += `<p>${escapeHtml(mem3.split("\n")[0])} <span>(Member)</span></p>`;

    document.getElementById("vc-members-container").innerHTML = memHtml;
    document.getElementById("vipCardModal").classList.add("active");
}

function closeVipCardModal() {
    document.getElementById("vipCardModal").classList.remove("active");
}

function downloadVipCard() {
    const cardElement = document.getElementById("vipCardElement");
    const name = localStorage.getItem("bhavya_name") || "Patient";
    const btn = document.querySelector(".btn-card-action:not(.close)");

    let originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    btn.disabled = true;

    html2canvas(cardElement, { scale: 3, backgroundColor: null, useCORS: true }).then(canvas => {
        let link = document.createElement("a");
        link.download = `BhavyaDiagnostics_VIP_Card_${name.replace(/\s+/g, "_")}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();

        btn.innerHTML = `<i class="fas fa-check"></i> Saved!`;
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            showToast("VIP Card Downloaded!", "success");
        }, 1800);
    }).catch(() => {
        showToast("Error saving card.", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}
