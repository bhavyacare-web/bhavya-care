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
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        if (typeof firebase.firestore === "function") {
            db = firebase.firestore();
        }
    }
} catch (e) {
    console.error("Init error:", e);
}

const GAS_URL = "[https://script.google.com/macros/s/AKfycbwIxSjlD6oVAGi4InT6Lb8RPg6NWrl7vpptoYrEG5HKPzPaadUp_0pVnN_1OZfJ7X_r/exec](https://script.google.com/macros/s/AKfycbwIxSjlD6oVAGi4InT6Lb8RPg6NWrl7vpptoYrEG5HKPzPaadUp_0pVnN_1OZfJ7X_r/exec)";
const WELCOME_BONUS_AMOUNT = 100;

function showMsg(msg, title) {
    if (typeof window.bhavyaAlert === "function") {
        return window.bhavyaAlert(msg, title);
    }
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

function getAuthUser() {
    return new Promise((resolve) => {
        if (typeof firebase === "undefined" || !firebase.auth) return resolve(null);
        if (firebase.auth().currentUser) return resolve(firebase.auth().currentUser);
        const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
            unsubscribe();
            resolve(user);
        });
        setTimeout(() => {
            try { unsubscribe(); } catch (e) {}
            resolve(firebase.auth().currentUser || null);
        }, 2500);
    });
}

async function savePatientToFirebase(profileObj) {
    if (!db) return;
    const authUser = await getAuthUser();
    if (!authUser) return;

    return db.collection("patients").doc(authUser.uid).set({
        ...profileObj,
        uid: authUser.uid,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(err => console.error("Patient save error:", err));
}

// =======================================================
// GLOBALS & STATE
// =======================================================
let cart = [];
let currentView = "booking";
const categoryConfig = {
    pathology: { name: "Test", icon: "🩸" },
    profile: { name: "Package", icon: "🩺" },
    pft: { name: "PFT", icon: "🫁" },
    ecg: { name: "ECG", icon: "❤️" }
};
const defaultIcon = "🧪";
const mainCategoryKeys = ["pathology", "profile", "pft", "ecg"];
const homeServiceCategories = ["pathology", "profile", "package", "discount_profile", "ecg", "blood test"];

let allServices = [];
let userPlanStatus = "basic";
let currentCategory = "profile";
let currentSubCategory = "all";
let welcomeEmailAlreadySent = false;

// Split VIP Free Packages state (VIP-FREE-001 Blood & VIP-FREE-002 ECG+PFT+50+ BCA)
let vipBloodRemaining = 0;
let vipEcgPftRemaining = 0;
let patientRealtimeUnsub = null;

try {
    let stored = localStorage.getItem("bhavyaCart");
    if (stored) {
        let parsed = JSON.parse(stored);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        if (Array.isArray(parsed)) cart = parsed.map(item => ({ ...item, qty: item.qty || 1 }));
    }
} catch (e) {
    cart = [];
}

let searchTimeout;
let baseVipPrice = 2000;
let validReferrerUid = "";
let appliedPromo = null; // { code, discount_type, discount_value, min_order }

let bookingData = {
    name: "", mobile: "", email: "", city: "", pincode: "", address: "",
    lat: "", lng: "", map_link: "", isVip: false
};
let cartConfirmationResult;
let appRules = {};
let userWalletBalance = 0;
let finalBill = {
    subtotal: 0, totalMrp: 0, totalBasic: 0, collectionCharge: 0,
    walletUsed: 0, refDiscount: 0, promoDiscount: 0, totalPayable: 0,
    refCode: "", promoCode: ""
};
let labSlots = {};
let renderedLabClusters = []; // Used for Common Lab assignment

function isPincodeServiceable(pincode) {
    const rawPins = String(appRules.serviceable_pincodes || "").trim();
    if (!rawPins) return true;
    const allowedList = rawPins.split(",").map(p => p.trim()).filter(Boolean);
    if (allowedList.length === 0) return true;
    return allowedList.includes(String(pincode || "").trim());
}

function showHomeUnavailableAlert() {
    showMsg(`Home Sample Collection is currently not available for Pincode ${bookingData.pincode}. Please select Center Visit to proceed.`, "Home Collection Unavailable");
}

function isVipFreePackage(serviceId) {
    const id = String(serviceId || "").toUpperCase();
    return id === "VIP-FREE-001" || id === "VIP-FREE-002";
}

function isSurpriseItem(item) {
    const t = String(item.service_type || "").toLowerCase().trim().replace(/_/g, " ");
    return t === "surprise package" || String(item.service_id || "").startsWith("SURP-");
}

window.onload = async () => {
    updateCartUI();
    await startRealtimePatientSync();
    fetchBookingData();
};

// =======================================================
// REAL-TIME PATIENT SYNC (LIVE VIP STATUS / REVERT TO BASIC)
// =======================================================
async function startRealtimePatientSync() {
    if (!db) return;
    try {
        const authUser = await getAuthUser();
        if (!authUser) return;

        const patientRef = db.collection("patients").doc(authUser.uid);
        if (patientRealtimeUnsub) patientRealtimeUnsub();

        patientRealtimeUnsub = patientRef.onSnapshot(async (doc) => {
            if (!doc.exists) return;
            const data = doc.data();
            const pName = data.name || data.patient_name || localStorage.getItem("bhavya_name") || "Patient";
            const pMobile = data.mobile || data.mobile_number || authUser.phoneNumber || "";
            const shortId = generateCustomUserId(pName, pMobile);

            let pUserId = data.user_id || "";
            if (!pUserId || pUserId === authUser.uid || pUserId.length > 12) pUserId = shortId;

            let pRefCode = data.referral_code || "";
            if (!pRefCode || pRefCode === authUser.uid || pRefCode.length > 12) pRefCode = pUserId;

            if (data.user_id !== pUserId || data.referral_code !== pRefCode) {
                patientRef.set({ user_id: pUserId, referral_code: pRefCode }, { merge: true }).catch(() => {});
            }

            const prevPlan = userPlanStatus;
            const plan = String(data.current_plan_status || data.plan || "basic").toLowerCase().trim();
            userPlanStatus = plan;
            bookingData.isVip = (plan === "vip" || plan === "pending");

            localStorage.setItem("bhavya_plan_cache", plan);
            localStorage.setItem("bhavya_user_id", pUserId);
            if (pName) localStorage.setItem("bhavya_name", pName);
            localStorage.setItem("bhavya_profile_cache", JSON.stringify(data));

            userWalletBalance = Number(data.current_wallet_balance ?? data.wallet_balance ?? 0);
            const wTxt = document.getElementById("walletBalTxt");
            if (wTxt) wTxt.innerText = userWalletBalance;

            welcomeEmailAlreadySent = !!data.welcome_email_sent;

            // Split VIP Free Packages remaining count
            const totalSlots = Number(data.vip_member_count || (Array.isArray(data.vipMembers) ? data.vipMembers.length : 1) || 1);
            if (plan === "vip") {
                vipBloodRemaining = (data.vip_blood_pkg_remaining !== undefined)
                    ? Number(data.vip_blood_pkg_remaining)
                    : (data.vip_blood_pkg_claimed || data.vip_package_claimed ? 0 : totalSlots);

                vipEcgPftRemaining = (data.vip_ecg_pft_pkg_remaining !== undefined)
                    ? Number(data.vip_ecg_pft_pkg_remaining)
                    : (data.vip_ecg_pft_pkg_claimed ? 0 : totalSlots);
            } else {
                vipBloodRemaining = 0;
                vipEcgPftRemaining = 0;
            }

            // If Admin unapproved/rejected VIP while user has VIP prices in cart -> auto-revert cart to Basic rates!
            if (prevPlan !== plan && allServices.length > 0) {
                syncCartPricesWithCurrentPlan();
            }

            handleBannerDisplay();
            if (currentView === "booking" && allServices.length > 0) {
                renderServices(document.getElementById("searchInput").value.toLowerCase());
            } else if (currentView === "cart" && cart.length > 0) {
                calculateFinalBill();
            }
        });
    } catch (e) {
        console.error("Sync patient state error:", e);
    }
}

function syncCartPricesWithCurrentPlan() {
    const isVip = (userPlanStatus === "vip" || userPlanStatus === "pending");
    let changed = false;
    cart.forEach(item => {
        if (isVipFreePackage(item.service_id) || isSurpriseItem(item)) return;
        const liveSvc = allServices.find(s => String(s.service_id) === String(item.service_id));
        if (liveSvc) {
            const targetPrice = formatPrice(isVip ? (liveSvc.vip_price || liveSvc.basic_price) : (liveSvc.basic_price || liveSvc.service_price));
            if (Number(item.price) !== targetPrice) {
                item.price = targetPrice;
                changed = true;
            }
        }
    });
    if (changed) {
        localStorage.setItem("bhavyaCart", JSON.stringify(cart));
        updateCartUI();
        if (currentView === "cart") {
            renderGroupedCart();
            calculateFinalBill();
        }
    }
}

function showToast(message, type = "success") {
    let container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    let icon = type === "success" ? "fa-check-circle" : "fa-exclamation-circle";
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

function formatText(text) {
    if (!text) return "";
    let cleanText = String(text).replace(/_/g, " ");
    let formatted = cleanText.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const acronyms = /\b(cbc|esr|usg|mri|ecg|echo|ct|lft|kft|hba1c|tsh|t3|t4|ana|psa|hiv|hcv|bun|aptt|sgpt|sgot|vdrl|rbc|wbc|bchg|aec|anc|amh|ada|hbsag|crp|abp|ncv|emg|ssep|dlco|eeg|pft|nabl|nabh|crl|ved|bca)\b/gi;
    return formatted.replace(acronyms, match => match.toUpperCase());
}

function formatPrice(price) {
    return (!price || isNaN(price)) ? 0 : parseFloat(Number(price).toFixed(2));
}

// =======================================================
// PARSE LABS FROM SERVICES SHEET COLUMN R
// =======================================================
function parseLabsFromColumnR(labsRawString) {
    const raw = String(labsRawString || "").trim();
    const parts = raw ? raw.split(",").map(p => p.trim()).filter(Boolean) : ["Bhavya Diagnostics (NABL)"];

    return parts.map(entry => {
        const tagMatches = [...entry.matchAll(/\(([^)]+)\)/g)].map(m => m[1].trim().toUpperCase());
        const cleanName = entry.replace(/\([^)]*\)/g, "").trim() || "Bhavya Diagnostics";
        const labId = cleanName.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "BHAVYA_DIAGNOSTICS";
        return {
            lab_id: labId,
            lab_name: cleanName,
            tags: tagMatches,
            raw_label: entry
        };
    });
}

function getLabsForService(serviceObj) {
    if (!serviceObj) return parseLabsFromColumnR("");
    if (String(serviceObj.service_id).toUpperCase() === "VIP-FREE-002") {
        return [{
            lab_id: "BHAVYA_DIAGNOSTICS",
            lab_name: "Bhavya Diagnostics",
            tags: ["ECG", "PFT", "50+ BCA"],
            raw_label: "Bhavya Diagnostics (ECG + PFT + 50+ BCA)"
        }];
    }
    const liveSvc = allServices.find(s => String(s.service_id) === String(serviceObj.service_id));
    const labsStr = (liveSvc && liveSvc.labs) || serviceObj.labs || "";
    return parseLabsFromColumnR(labsStr);
}

function fetchBookingData() {
    const userId = localStorage.getItem("bhavya_user_id") || "";
    const cachedServices = localStorage.getItem("bhavya_services_cache");
    const cachedPlan = localStorage.getItem("bhavya_plan_cache");

    function checkUrlAndRender() {
        const urlParams = new URLSearchParams(window.location.search);
        const searchParam = urlParams.get("search");
        const viewParam = urlParams.get("view");

        if (viewParam === "cart") {
            toggleView("cart");
        } else if (searchParam) {
            document.getElementById("searchInput").value = searchParam;
            renderServices(searchParam.toLowerCase());
        } else {
            renderServices();
        }
    }

    if (cachedServices) {
        allServices = JSON.parse(cachedServices);
        if (cachedPlan) userPlanStatus = cachedPlan;
        syncCartPricesWithCurrentPlan();
        handleBannerDisplay();
        renderCategories();
        checkUrlAndRender();
    }

    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "getBookingData", user_id: userId }) })
        .then(res => res.json())
        .then(response => {
            if (response.status === "success") {
                allServices = response.data.services || [];
                if (response.data.rules) {
                    appRules = response.data.rules;
                    if (appRules.vip_plan_price_1_member || appRules.vip_plan_price) {
                        baseVipPrice = Number(appRules.vip_plan_price_1_member || appRules.vip_plan_price);
                    }
                }
                localStorage.setItem("bhavya_services_cache", JSON.stringify(allServices));
                syncCartPricesWithCurrentPlan();
                handleBannerDisplay();
                renderCategories();

                if (!cachedServices) {
                    checkUrlAndRender();
                } else if (currentView === "booking") {
                    renderServices(document.getElementById("searchInput").value.toLowerCase());
                } else if (currentView === "cart") {
                    renderGroupedCart();
                }
            }
        })
        .catch(() => {
            if (!cachedServices) {
                document.getElementById("servicesList").innerHTML = "<p style='text-align:center;'>Unable to load tests right now. Please refresh.</p>";
            }
        });
}

function handleBannerDisplay() {
    const isPendingVip = (userPlanStatus === "pending");
    const banner = document.getElementById("pendingWarningBanner");
    if (banner) {
        banner.style.display = (isPendingVip && currentView === "booking") ? "block" : "none";
    }
    const cartWarn = document.getElementById("cartPendingVipWarning");
    if (cartWarn) {
        cartWarn.style.display = (isPendingVip && currentView === "cart") ? "flex" : "none";
    }

    // Split VIP Free Packages Claim Banner
    const claimBanner = document.getElementById("vipClaimBanner");
    const claimBtnsBox = document.getElementById("vipClaimButtons");
    if (claimBanner && claimBtnsBox) {
        const showBlood = userPlanStatus === "vip" && vipBloodRemaining > 0;
        const showEcgPft = userPlanStatus === "vip" && vipEcgPftRemaining > 0;

        if ((showBlood || showEcgPft) && currentView === "booking") {
            let btnsHtml = "";
            if (showBlood) {
                btnsHtml += `<button class="vip-claim-btn" style="background:var(--warning); color:#0f172a;" onclick="claimVipPackage('VIP-FREE-001')">
                    <i class="fas fa-vials"></i> Claim Blood Package (${vipBloodRemaining} left)
                </button>`;
            }
            if (showEcgPft) {
                btnsHtml += `<button class="vip-claim-btn" style="background:#38bdf8; color:#0f172a;" onclick="claimVipPackage('VIP-FREE-002')">
                    <i class="fas fa-heartbeat"></i> Claim ECG + PFT + 50+ BCA (${vipEcgPftRemaining} left)
                </button>`;
            }
            claimBtnsBox.innerHTML = btnsHtml;
            claimBanner.style.display = "block";
        } else {
            claimBanner.style.display = "none";
        }
    }
}

function renderCategories() {
    const mainContainer = document.getElementById("mainCategories");
    const sliderContainer = document.getElementById("dynamicCategorySlider");
    if (!mainContainer) return;

    let mainHtml = "";
    let sliderHtml = "";
    let filteredTypes = allServices.filter(s => !isVipFreePackage(s.service_id) && !isSurpriseItem(s));
    const existingTypes = [...new Set(filteredTypes.map(s => String(s.service_type || "").toLowerCase().trim()))];

    mainCategoryKeys.forEach(key => {
        let config = categoryConfig[key] || { name: formatText(key), icon: defaultIcon };
        if (existingTypes.includes(key)) {
            let isSelected = currentCategory === key ? "selected" : "";
            mainHtml += `<div class="cat-card ${isSelected}" onclick="selectCategory('${key}')">
                            <div class="cat-icon">${config.icon}</div>
                            <span class="cat-name">${config.name}</span>
                         </div>`;
        }
    });
    mainContainer.innerHTML = mainHtml;

    let hasNewCategories = false;
    existingTypes.forEach(key => {
        if (!key || mainCategoryKeys.includes(key)) return;
        hasNewCategories = true;
        let isActive = currentCategory === key ? "active" : "";
        let config = categoryConfig[key] || { name: formatText(key), icon: defaultIcon };
        sliderHtml += `<button class="sub-cat-btn ${isActive}" onclick="selectCategory('${key}')" style="display:flex; align-items:center; gap:5px;">
                          <span>${config.icon}</span> ${config.name}
                       </button>`;
    });

    if (sliderContainer) {
        if (hasNewCategories) {
            sliderContainer.innerHTML = sliderHtml;
            sliderContainer.style.display = "flex";
        } else {
            sliderContainer.innerHTML = "";
            sliderContainer.style.display = "none";
        }
    }
}

function selectCategory(categoryKey) {
    currentCategory = categoryKey;
    currentSubCategory = "all";
    document.getElementById("searchInput").value = "";
    document.getElementById("autoSuggestBox").style.display = "none";
    renderCategories();
    renderServices();
}

function selectSubCategory(subCat) {
    currentSubCategory = subCat;
    renderServices();
}

function filterServices() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        renderServices(document.getElementById("searchInput").value.toLowerCase());
    }, 220);
}

// =======================================================
// SMART SEARCH WITH DIRECT "ADD +" BUTTON (REQ #10)
// =======================================================
function matchesServiceQuery(s, query) {
    const name = String(s.service_name || "").toLowerCase();
    const secondName = String(s.second_name || "").toLowerCase();
    const cat = String(s.service_category || "").toLowerCase();
    const desc = String(s.description || "").toLowerCase();
    const id = String(s.service_id || "").toLowerCase();
    return name.includes(query) || secondName.includes(query) || cat.includes(query) || desc.includes(query) || id.includes(query);
}

function handleAutoSuggest() {
    let query = document.getElementById("searchInput").value.toLowerCase().trim();
    let suggestBox = document.getElementById("autoSuggestBox");
    if (!suggestBox) return;

    if (query.length < 2) {
        suggestBox.style.display = "none";
        filterServices();
        return;
    }

    const isPkgType = (s) => {
        const t = String(s.service_type || "").toLowerCase().trim();
        return t === "profile" || t === "package" || t === "discount_profile";
    };

    const validPool = allServices.filter(s =>
        !isVipFreePackage(s.service_id) &&
        !isSurpriseItem(s) &&
        matchesServiceQuery(s, query)
    );

    const matchingTests = validPool.filter(s => !isPkgType(s)).slice(0, 5);
    const matchingPackages = validPool.filter(s => isPkgType(s)).slice(0, 5);

    if (matchingTests.length === 0 && matchingPackages.length === 0) {
        suggestBox.innerHTML = `<div style="padding:14px; text-align:center; color:#64748b; font-size:13px; font-weight:600;">No matching tests or packages found.</div>`;
        suggestBox.style.display = "block";
        filterServices();
        return;
    }

    const isVip = (userPlanStatus === "vip" || userPlanStatus === "pending");

    const renderRow = (m, isPkg) => {
        const priceToShow = formatPrice(isVip ? (m.vip_price || m.basic_price) : (m.basic_price || m.service_price));
        const mrpToShow = formatPrice(m.service_price);
        const sId = String(m.service_id).replace(/'/g, "\\'");
        const safeName = formatText(m.service_name).replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const safeType = String(m.service_type || "").replace(/'/g, "\\'");
        const badge = isPkg ? `<span style="background:#e0f2fe;color:#0284c7;font-size:9.5px;font-weight:800;padding:2px 6px;border-radius:5px;margin-left:5px;">PACKAGE</span>` : "";

        const cartItem = cart.find(c => String(c.service_id) === String(m.service_id));
        let actionHtml = "";
        if (cartItem) {
            actionHtml = `<div class="suggest-qty" onclick="event.stopPropagation()">
                <button type="button" onclick="event.stopPropagation(); updateQty('${sId}', -1, ${priceToShow}, '${safeName}', '${safeType}'); handleAutoSuggest();">−</button>
                <span>${cartItem.qty}</span>
                <button type="button" onclick="event.stopPropagation(); updateQty('${sId}', 1, ${priceToShow}, '${safeName}', '${safeType}'); handleAutoSuggest();">+</button>
            </div>`;
        } else {
            actionHtml = `<button type="button" class="suggest-add-btn" onclick="event.stopPropagation(); updateQty('${sId}', 1, ${priceToShow}, '${safeName}', '${safeType}'); handleAutoSuggest();">ADD +</button>`;
        }

        return `<div class="suggest-row">
                    <div class="suggest-left" onclick="selectSuggested('${safeName}')">
                        <span class="suggest-name">${escapeHtml(formatText(m.service_name))}${badge}</span>
                        <span class="suggest-price">₹${priceToShow} ${mrpToShow > priceToShow ? `<del style="color:#94a3b8; font-size:11px; margin-left:4px;">₹${mrpToShow}</del>` : ""}</span>
                    </div>
                    ${actionHtml}
                </div>`;
    };

    let html = "";
    if (matchingTests.length > 0) {
        html += `<div style="padding:7px 14px; background:#f8fafc; font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase;">🧪 Tests</div>`;
        matchingTests.forEach(m => { html += renderRow(m, false); });
    }
    if (matchingPackages.length > 0) {
        html += `<div style="padding:7px 14px; background:#eff6ff; font-size:11px; font-weight:800; color:#2563eb; text-transform:uppercase;">📦 Packages</div>`;
        matchingPackages.forEach(m => { html += renderRow(m, true); });
    }

    suggestBox.innerHTML = html;
    suggestBox.style.display = "block";
    filterServices();
}

function selectSuggested(name) {
    document.getElementById("searchInput").value = name;
    document.getElementById("autoSuggestBox").style.display = "none";
    renderServices(name.toLowerCase());
}

document.addEventListener("click", function (e) {
    const searchWrap = document.querySelector(".search-container");
    const suggestBox = document.getElementById("autoSuggestBox");
    if (searchWrap && suggestBox && !searchWrap.contains(e.target)) {
        suggestBox.style.display = "none";
    }
});

function renderServices(searchQuery = "") {
    const container = document.getElementById("servicesList");
    const subContainer = document.getElementById("subCategoryContainer");
    if (!container) return;

    let displayServices = allServices.filter(s => !isVipFreePackage(s.service_id) && !isSurpriseItem(s));
    let filtered = displayServices.filter(s => String(s.service_type || "").toLowerCase().trim() === currentCategory);

    if ((currentCategory === "profile" || currentCategory === "discount_profile") && !searchQuery) {
        let subCats = ["all", ...new Set(filtered.map(s => String(s.service_category || "Other").trim()))];
        let subHtml = `<div class="sub-cat-nav">`;
        subCats.forEach(sc => {
            let active = currentSubCategory === sc ? "active" : "";
            subHtml += `<button class="sub-cat-btn ${active}" onclick="selectSubCategory('${sc.replace(/'/g, "\\'")}')">${escapeHtml(formatText(sc))}</button>`;
        });
        subHtml += `</div>`;
        subContainer.innerHTML = subHtml;

        if (currentSubCategory !== "all") {
            filtered = filtered.filter(s => String(s.service_category || "Other").trim() === currentSubCategory);
        }
    } else {
        subContainer.innerHTML = "";
    }

    if (searchQuery) {
        filtered = displayServices.filter(s => matchesServiceQuery(s, searchQuery.toLowerCase().trim()));
    }

    if (filtered.length === 0) {
        container.innerHTML = "<div style='text-align:center; padding:40px;'><i class='fas fa-search' style='font-size:28px; color:#cbd5e1; margin-bottom:12px;'></i><br><span style='color:var(--text-muted); font-weight:600;'>No tests or packages found.</span></div>";
        return;
    }

    let htmlContent = "";
    const isVip = (userPlanStatus === "vip" || userPlanStatus === "pending");

    filtered.forEach(service => {
        const totalMrp = formatPrice(service.service_price);
        const basicPrice = formatPrice(service.basic_price);
        const vipPrice = formatPrice(service.vip_price);
        const applicablePrice = isVip ? vipPrice : basicPrice;

        const s_id = String(service.service_id).replace(/'/g, "\\'");
        const cartItem = cart.find(item => String(item.service_id) === String(service.service_id));
        const inCart = !!cartItem;
        const currentQty = cartItem ? cartItem.qty : 0;

        const cleanName = formatText(service.service_name).replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const cleanType = String(service.service_type || "").replace(/'/g, "\\'");
        const cleanCat = formatText(service.service_category);

        let actionBtnHtml = inCart
            ? `<div class="qty-control"><button onclick="updateQty('${s_id}', -1, ${applicablePrice}, '${cleanName}', '${cleanType}')"><i class="fas fa-minus"></i></button><span class="qty-text">${currentQty}</span><button onclick="updateQty('${s_id}', 1, ${applicablePrice}, '${cleanName}', '${cleanType}')"><i class="fas fa-plus"></i></button></div>`
            : `<button class="add-to-cart-btn" onclick="updateQty('${s_id}', 1, ${applicablePrice}, '${cleanName}', '${cleanType}')">ADD +</button>`;

        let pricingHtml = isVip
            ? `<div class="mrp-row"><span>MRP: <span class="mrp">₹${totalMrp}</span></span><span style="margin-left:8px;">Basic: <span class="mrp">₹${basicPrice}</span></span></div><div class="final-price">₹${vipPrice} <i class="fas fa-crown" style="color:var(--warning); font-size:14px;"></i></div>`
            : `<div class="mrp-row"><span>MRP: <span class="mrp">₹${totalMrp}</span></span></div><div class="final-price">₹${basicPrice} <span style="font-size:10px; font-weight:800; background:var(--primary-light); color:var(--primary); padding:2px 6px; border-radius:4px;">BASIC</span></div><div class="locked-price" onclick="openVipPromo()"><i class="fas fa-lock" style="font-size:10px;"></i> VIP Rate: ₹${vipPrice}</div>`;

        let sTypeLowerCase = String(service.service_type || "").toLowerCase().trim();
        let isPackageOrProfile = (sTypeLowerCase === "profile" || sTypeLowerCase === "package" || sTypeLowerCase === "discount_profile");
        let descText = service.description ? String(service.description).trim() : "";

        let infoIconHtml = "";
        if (descText !== "") {
            infoIconHtml = isPackageOrProfile
                ? `<i class="fas fa-info-circle" onclick="openModal('${s_id}')" style="color:#3b82f6; cursor:pointer; margin-left:7px; font-size:15px;"></i>`
                : `<i class="fas fa-info-circle" onclick="showTestInfo('${s_id}')" style="color:#3b82f6; cursor:pointer; margin-left:7px; font-size:15px;"></i>`;
        }

        let fastingVal = service.fasting ? String(service.fasting).trim() : "";
        let reportVal = service.reporting_time ? String(service.reporting_time).trim() : "";
        let metaHtml = "";
        if (fastingVal || reportVal) {
            const fText = fastingVal ? (fastingVal.toLowerCase().includes("fast") ? fastingVal : `Fasting: ${fastingVal}`) : "";
            const rText = reportVal ? (reportVal.toLowerCase().includes("report") ? reportVal : `Report: ${reportVal}`) : "";
            metaHtml = `<div class="meta-badges-row">
                ${fText ? `<span class="meta-pill-fast"><i class="fas fa-utensils"></i> ${escapeHtml(fText)}</span>` : ""}
                ${rText ? `<span class="meta-pill-report"><i class="fas fa-clock"></i> ${escapeHtml(rText)}</span>` : ""}
            </div>`;
        }

        if (isPackageOrProfile) {
            let descPreviewHtml = "";
            if (descText !== "") {
                let items = descText.split(/<br\s*\/?>|\n/i).filter(i => i.trim() !== "");
                if (items.length > 0) {
                    let previewItems = items.slice(0, 2).map(i => formatText(i.trim()));
                    let moreText = service.number_of_test ? `+ ${service.number_of_test} Parameters` : (items.length > 2 ? "View All Details" : "");
                    descPreviewHtml = `<div class="desc-preview"><ul>${previewItems.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>${moreText ? `<div class="view-more-btn" onclick="openModal('${s_id}')">${escapeHtml(moreText)}</div>` : ""}</div>`;
                }
            }
            htmlContent += `<div class="profile-item"><div class="profile-header"><span class="profile-badge">${escapeHtml(cleanCat)}</span>${service.number_of_test ? `<span class="param-badge"><i class="fas fa-microscope"></i> ${escapeHtml(service.number_of_test)} Tests</span>` : ""}</div><div class="service-info"><h3>${escapeHtml(formatText(service.service_name))} ${infoIconHtml}</h3>${metaHtml}${descPreviewHtml}</div><div class="price-action-row"><div class="price-box">${pricingHtml}</div><div class="action-container">${actionBtnHtml}</div></div></div>`;
        } else {
            let catIcon = categoryConfig[sTypeLowerCase]?.icon || defaultIcon;
            htmlContent += `<div class="service-item"><div class="service-img-box">${catIcon}</div><div class="service-info-normal"><h3 style="font-size:14px; margin:0 0 2px;">${escapeHtml(formatText(service.service_name))} ${infoIconHtml}</h3>${metaHtml}<div class="price-box" style="margin-top:6px;">${pricingHtml}</div></div><div class="action-container">${actionBtnHtml}</div></div>`;
        }
    });

    container.innerHTML = htmlContent;
}

function updateQty(id, change, price, name, type) {
    id = String(id);
    let index = cart.findIndex(item => String(item.service_id) === id);
    if (index > -1) {
        cart[index].qty += change;
        if (cart[index].qty <= 0) cart.splice(index, 1);
    } else if (change > 0) {
        const svcObj = allServices.find(s => String(s.service_id) === id);
        cart.push({
            service_id: id,
            service_name: name,
            price: price,
            mrp_price: svcObj ? formatPrice(svcObj.service_price) : price,
            basic_price: svcObj ? formatPrice(svcObj.basic_price || svcObj.service_price) : price,
            vip_price: svcObj ? formatPrice(svcObj.vip_price || svcObj.basic_price || price) : price,
            qty: 1,
            service_type: type,
            labs: svcObj ? (svcObj.labs || "") : "",
            lab_cost: svcObj ? (Number(svcObj.lab_cost) || 0) : 0
        });
        showToast("Added to cart!", "success");
    }

    localStorage.setItem("bhavyaCart", JSON.stringify(cart));
    updateCartUI();

    if (currentView === "booking") {
        renderServices(document.getElementById("searchInput").value.toLowerCase());
    } else if (currentView === "cart") {
        if (cart.length === 0) {
            toggleView("booking");
        } else {
            autoAssignGroupLabs();
            renderGroupedCart();
        }
    }
}

function updateCartUI() {
    const topCartBtn = document.getElementById("topCartBtn");
    const cartBar = document.getElementById("bottomCartBar");
    const cartText = document.getElementById("bottomCartText");
    let totalItems = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    let totalPrice = cart.reduce((sum, item) => sum + (Number(item.price || 0) * (item.qty || 1)), 0);
    if (topCartBtn) topCartBtn.innerText = `🛒 Cart (${totalItems})`;
    if (totalItems > 0) {
        if (cartText) cartText.innerHTML = `${totalItems} Item${totalItems > 1 ? "s" : ""} <span style="color:#94a3b8; margin:0 6px;">|</span> ₹${totalPrice}`;
        if (cartBar) cartBar.classList.add("visible");
    } else {
        if (cartBar) cartBar.classList.remove("visible");
    }
    checkSurpriseBannerStatus();
}

function toggleView(view) {
    if (view === "cart") {
        currentView = "cart";
        handleBannerDisplay();
        document.getElementById("bookingView").style.display = "none";
        document.getElementById("cartView").style.display = "block";
        document.getElementById("topCartBtn").style.display = "none";
        document.getElementById("navBackText").innerText = "Back";
        document.getElementById("pageMainTitle").innerText = "Checkout";
        window.scrollTo(0, 0);

        if (cart.length === 0) {
            document.getElementById("emptyCartDesign").style.display = "block";
            document.getElementById("cartCheckoutProcess").style.display = "none";
        } else {
            document.getElementById("emptyCartDesign").style.display = "none";
            document.getElementById("cartCheckoutProcess").style.display = "block";
            initCartPage();
        }
    } else {
        currentView = "booking";
        handleBannerDisplay();
        document.getElementById("cartView").style.display = "none";
        document.getElementById("bookingView").style.display = "block";
        document.getElementById("topCartBtn").style.display = "inline-block";
        document.getElementById("navBackText").innerText = "Home";
        document.getElementById("pageMainTitle").innerText = "Book Lab Tests & Packages";
        window.scrollTo(0, 0);
        updateCartUI();
    }
}

function openModal(serviceId) {
    const service = allServices.find(s => String(s.service_id) === String(serviceId));
    if (!service) return;

    document.getElementById("modalTitle").innerText = formatText(service.service_name);
    let descRaw = String(service.description || "");
    let formattedDesc = "<p style='text-align:center;'>No details available.</p>";
    if (descRaw.trim() !== "") {
        let items = descRaw.split(/<br\s*\/?>|\n/i).filter(i => i.trim() !== "");
        formattedDesc = "<ul>" + items.map(i => `<li style="margin-bottom:6px; border-bottom:1px dashed #eee; padding-bottom:4px;">${escapeHtml(formatText(i.trim()))}</li>`).join("") + "</ul>";
        if (service.number_of_test) {
            formattedDesc = `<div style="background:#e0f2fe; color:#0284c7; padding:8px 12px; border-radius:8px; font-weight:bold; font-size:12px; margin-bottom:12px; display:inline-block;"><i class="fas fa-microscope"></i> Includes ${escapeHtml(service.number_of_test)} Parameters</div>` + formattedDesc;
        }
    }
    document.getElementById("modalBody").innerHTML = formattedDesc;
    document.getElementById("infoModal").classList.add("active");
}
function closeModal() { document.getElementById("infoModal").classList.remove("active"); }

function openVipPromo() { document.getElementById("vipPromoModal").classList.add("active"); }
function closeVipPromo() { document.getElementById("vipPromoModal").classList.remove("active"); }

function goToVipPage() {
    closeVipPromo();
    const userId = localStorage.getItem("bhavya_user_id");
    if (userId) {
        window.location.href = "../vip/vip_member.html";
    } else {
        localStorage.setItem("pending_vip_redirect", "true");
        openPatientLogin();
    }
}

// =======================================================
// CLAIM SPLIT VIP PACKAGES (VIP-FREE-001 & VIP-FREE-002)
// =======================================================
function claimVipPackage(pkgId) {
    const id = String(pkgId || "VIP-FREE-001").toUpperCase();
    const alreadyInCart = cart.some(c => String(c.service_id).toUpperCase() === id);
    if (alreadyInCart) {
        toggleView("cart");
        return;
    }

    const service = allServices.find(s => String(s.service_id).toUpperCase() === id);
    const defaultName = id === "VIP-FREE-002"
        ? "VIP Package: ECG + PFT + 50+ Body Parameters"
        : "VIP Package: Platinum Blood Health Package";
    const defaultType = id === "VIP-FREE-002" ? "ecg" : "profile";

    cart.push({
        service_id: id,
        service_name: service ? formatText(service.service_name) : defaultName,
        price: 0,
        mrp_price: service ? formatPrice(service.service_price) : (id === "VIP-FREE-002" ? 2000 : 6000),
        basic_price: service ? formatPrice(service.basic_price) : (id === "VIP-FREE-002" ? 700 : 4000),
        vip_price: 0,
        qty: 1,
        service_type: service ? service.service_type : defaultType,
        labs: service ? (service.labs || "") : (id === "VIP-FREE-002" ? "Bhavya Diagnostics" : ""),
        lab_cost: service ? (Number(service.lab_cost) || 0) : 0
    });

    localStorage.setItem("bhavyaCart", JSON.stringify(cart));
    updateCartUI();
    showToast("Complimentary VIP Package added!", "success");
    toggleView("cart");
}

function handleHomeNavigation() {
    if (currentView === "cart") {
        toggleView("booking");
        return;
    }
    const userId = localStorage.getItem("bhavya_user_id");
    if (userId) window.location.href = "../patient_dashboard/patient_dashboard.html";
    else window.location.href = "../index.html";
}

// =======================================================
// LOGIN MODAL INSIDE BOOKING (WITH ₹100 WELCOME BONUS)
// =======================================================
let loginConfirmationResult;
function openPatientLogin() {
    document.getElementById("login-section").classList.add("active");
    document.getElementById("phone-section").style.display = "block";
    document.getElementById("otp-section").style.display = "none";
    if (!window.loginRecaptchaVerifier) {
        window.loginRecaptchaVerifier = new firebase.auth.RecaptchaVerifier("recaptcha-container", { size: "normal" });
        window.loginRecaptchaVerifier.render();
    }
}

function closeLoginPopup() {
    document.getElementById("login-section").classList.remove("active");
}

function sendOTP() {
    const mobile = document.getElementById("phoneNumber").value.trim().replace(/\D/g, "");
    const name = document.getElementById("userName").value.trim();
    if (!name || mobile.length !== 10) {
        return showMsg("Please enter a valid Name and 10-digit mobile number.", "Invalid Details");
    }

    firebase.auth().signInWithPhoneNumber("+91" + mobile, window.loginRecaptchaVerifier)
        .then((result) => {
            loginConfirmationResult = result;
            document.getElementById("phone-section").style.display = "none";
            document.getElementById("otp-section").style.display = "block";
            showToast("OTP Sent!", "success");
        })
        .catch(() => {
            showMsg("Unable to send OTP. Please check your mobile number and captcha.", "OTP Failed");
        });
}

function verifyOTP() {
    const otp = document.getElementById("otpCode").value.trim();
    if (otp.length !== 6) return showMsg("Please enter a valid 6-digit OTP.", "Invalid OTP");

    loginConfirmationResult.confirm(otp).then(async (result) => {
        const user = result.user;
        const patientName = document.getElementById("userName").value.trim();
        const customUserId = generateCustomUserId(patientName, user.phoneNumber);

        localStorage.setItem("bhavya_uid", user.uid);
        localStorage.setItem("bhavya_mobile", user.phoneNumber);
        localStorage.setItem("bhavya_role", "patient");
        localStorage.setItem("bhavya_user_id", customUserId);
        localStorage.setItem("bhavya_name", patientName);

        const existingDoc = db ? await db.collection("patients").doc(user.uid).get() : null;
        if (!existingDoc || !existingDoc.exists) {
            await savePatientToFirebase({
                user_id: customUserId,
                udi: user.uid,
                name: patientName,
                patient_name: patientName,
                mobile: user.phoneNumber,
                mobile_number: user.phoneNumber,
                role: "patient",
                referral_code: customUserId,
                current_wallet_balance: WELCOME_BONUS_AMOUNT,
                wallet_balance: WELCOME_BONUS_AMOUNT,
                welcome_bonus_credited: true,
                current_plan_status: "basic",
                plan: "basic",
                status: "active",
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            });

            await db.collection("wallet_transactions").add({
                uid: user.uid,
                user_id: customUserId,
                type: "credit",
                amount: WELCOME_BONUS_AMOUNT,
                description: "Welcome Bonus on First Login (Test Discount)",
                reference: "WELCOME-100",
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});

            await sendAutoEmail({
                type: "contact",
                to: "contact@bhavyadiagnostics.com",
                subject: `New Patient Registered: ${patientName} (${user.phoneNumber})`,
                html: `<p>New patient signed up on Bhavya Diagnostics:</p>
                       <ul>
                         <li><b>Name:</b> ${escapeHtml(patientName)}</li>
                         <li><b>Mobile:</b> ${escapeHtml(user.phoneNumber)}</li>
                         <li><b>User ID:</b> ${escapeHtml(customUserId)}</li>
                         <li><b>Welcome Bonus:</b> ₹${WELCOME_BONUS_AMOUNT}</li>
                       </ul>`
            });
            showToast(`Login Successful! ₹${WELCOME_BONUS_AMOUNT} Welcome Bonus added.`, "success");
        } else {
            showToast("Login Successful!", "success");
        }

        await startRealtimePatientSync();
        closeLoginPopup();

        if (localStorage.getItem("pending_vip_redirect") === "true") {
            localStorage.removeItem("pending_vip_redirect");
            window.location.href = "../vip/vip_member.html";
        }
    }).catch(() => {
        showMsg("Invalid OTP. Please try again.", "Verification Failed");
    });
}

// =======================================================
// GPS LOCATION DETECTOR (REQ #2)
// =======================================================
function detectPatientLocation() {
    const btn = document.getElementById("btnDetectLocation");
    const statusMsg = document.getElementById("locationStatusMsg");

    if (!navigator.geolocation) {
        statusMsg.style.color = "var(--danger)";
        statusMsg.innerText = "GPS location is not supported by your browser. Please enter address manually.";
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting Exact Location...';
    statusMsg.style.color = "var(--primary)";
    statusMsg.innerText = "Please allow location access on your device...";

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude.toFixed(6);
            const lng = position.coords.longitude.toFixed(6);
            const mapLink = `[https://www.google.com/maps?q=$](https://www.google.com/maps?q=$){lat},${lng}`;

            bookingData.lat = lat;
            bookingData.lng = lng;
            bookingData.map_link = mapLink;

            try {
                const res = await fetch(`[https://nominatim.openstreetmap.org/reverse?format=json&lat=$](https://nominatim.openstreetmap.org/reverse?format=json&lat=$){lat}&lon=${lng}&addressdetails=1`);
                const data = await res.json();
                const addr = data.address || {};

                const city = addr.city || addr.town || addr.village || addr.suburb || addr.state_district || "";
                const pincode = (addr.postcode || "").replace(/\D/g, "").slice(0, 6);
                const fullAddress = data.display_name || "";

                if (city && document.getElementById("uCity")) document.getElementById("uCity").value = city;
                if (pincode && document.getElementById("uPincode")) document.getElementById("uPincode").value = pincode;
                if (fullAddress && document.getElementById("uAddress")) document.getElementById("uAddress").value = fullAddress;

                statusMsg.style.color = "var(--success)";
                statusMsg.innerHTML = '<i class="fas fa-check-circle"></i> Exact GPS location detected! You can add House No. or Landmark if needed.';
            } catch (e) {
                statusMsg.style.color = "var(--warning)";
                statusMsg.innerText = "GPS pin captured! Please verify City and Pincode below.";
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> Location Detected (Re-detect)';
            }
        },
        (err) => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-crosshairs"></i> Detect My Current Location (GPS)';
            statusMsg.style.color = "var(--danger)";
            statusMsg.innerText = err.code === 1
                ? "Location permission denied. Please turn on GPS or enter address manually."
                : "Could not detect location. Please enter address manually.";
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// =======================================================
// CART & CHECKOUT PAGE LOGIC
// =======================================================
function initCartPage() {
    let s2 = document.getElementById("step2-card");
    let step1Nav = document.getElementById("step1-nav");
    if (s2 && step1Nav && step1Nav.classList.contains("completed")) {
        s2.style.display = "block";
    }

    calculateFinalBill();

    const userId = localStorage.getItem("bhavya_user_id") || localStorage.getItem("bhavya_uid");
    if (userId) {
        fetchProfile();
    } else {
        let loader = document.getElementById("loadingOverlay");
        if (loader) loader.style.display = "none";
        let skel = document.getElementById("checkoutFormSkeleton");
        let form = document.getElementById("actualCheckoutForm");
        if (skel) skel.style.display = "none";
        if (form) form.style.display = "block";
    }
}

function applyProfileToCheckoutForm(data) {
    if (!data) return;
    bookingData.mobile = String(data.mobile || data.mobile_number || "").replace(/^\+91/, "");
    bookingData.email = data.email || "";
    const planStr = String(data.current_plan_status || data.plan || "basic").toLowerCase();
    bookingData.isVip = (planStr === "vip" || planStr === "pending" || data.isVip === true);
    welcomeEmailAlreadySent = !!data.welcome_email_sent;

    const uMob = document.getElementById("uMobile");
    if (uMob && bookingData.mobile) {
        uMob.value = bookingData.mobile;
        uMob.setAttribute("readonly", true);
    }
    const uEmail = document.getElementById("uEmail");
    if (uEmail && data.email) uEmail.value = data.email;

    const uPin = document.getElementById("uPincode");
    if (uPin && data.pincode) uPin.value = data.pincode;

    const uAddr = document.getElementById("uAddress");
    if (uAddr && data.address) uAddr.value = data.address;

    const uCity = document.getElementById("uCity");
    if (uCity && (data.city || data.city_village)) uCity.value = data.city || data.city_village;

    const nameBox = document.getElementById("nameInputBox");
    if (nameBox) {
        const badge = document.getElementById("vipBadge");
        if (bookingData.isVip && Array.isArray(data.vipMembers) && data.vipMembers.length > 0) {
            if (badge) {
                badge.innerHTML = planStr === "pending"
                    ? '<span style="background:var(--warning); color:white; font-size:10px; padding:4px 8px; border-radius:12px;"><i class="fas fa-hourglass-half"></i> VIP Pending</span>'
                    : '<span style="background:var(--warning); color:white; font-size:10px; padding:4px 8px; border-radius:12px;"><i class="fas fa-crown"></i> VIP Active</span>';
            }
            const opts = data.vipMembers.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
            nameBox.innerHTML = `<select id="uName" class="form-input">${opts}</select>`;
        } else {
            if (badge) badge.innerHTML = "";
            nameBox.innerHTML = `<input type="text" id="uName" class="form-input" value="${escapeHtml(data.name || data.patient_name || "")}" placeholder="Patient Name">`;
        }
    }

    userWalletBalance = Number(data.current_wallet_balance ?? data.wallet_balance ?? 0);
    const walletTxt = document.getElementById("walletBalTxt");
    if (walletTxt) walletTxt.innerText = userWalletBalance;
    calculateFinalBill();
}

async function fetchProfile() {
    const skel = document.getElementById("checkoutFormSkeleton");
    const form = document.getElementById("actualCheckoutForm");
    const loader = document.getElementById("loadingOverlay");

    let usedCache = false;
    try {
        const cachedProfile = localStorage.getItem("bhavya_profile_cache");
        if (cachedProfile) {
            applyProfileToCheckoutForm(JSON.parse(cachedProfile));
            if (loader) loader.style.display = "none";
            if (skel) skel.style.display = "none";
            if (form) form.style.display = "block";
            usedCache = true;
        }
    } catch (e) {}

    if (!usedCache) {
        if (skel) skel.style.display = "block";
        if (form) form.style.display = "none";
    }

    if (db) {
        try {
            const authUser = await getAuthUser();
            if (authUser) {
                const doc = await db.collection("patients").doc(authUser.uid).get();
                if (doc.exists) {
                    const data = doc.data();
                    localStorage.setItem("bhavya_profile_cache", JSON.stringify(data));
                    applyProfileToCheckoutForm(data);
                }
            }
        } catch (fbErr) {
            console.error("Profile load error:", fbErr);
        }
    }

    if (loader) loader.style.display = "none";
    if (skel) skel.style.display = "none";
    if (form) form.style.display = "block";
}

async function savePatientInfo() {
    const name = document.getElementById("uName").value.trim();
    const mobile = document.getElementById("uMobile").value.trim().replace(/\D/g, "");
    const emailEl = document.getElementById("uEmail");
    const email = emailEl ? emailEl.value.trim().toLowerCase() : "";
    const city = document.getElementById("uCity").value.trim();
    const pin = document.getElementById("uPincode").value.trim().replace(/\D/g, "");
    const addr = document.getElementById("uAddress").value.trim();
    const consentEl = document.getElementById("consentCheckbox");

    if (consentEl && !consentEl.checked) {
        return showMsg("Please accept the Privacy Policy & Terms consent checkbox to continue.", "Consent Required");
    }
    if (!name || !city || pin.length !== 6 || mobile.length !== 10 || !addr) {
        return showMsg("Please enter valid Name, 10-digit Mobile, City, 6-digit Pincode, and Complete Address.", "Incomplete Details");
    }

    bookingData.name = name;
    bookingData.mobile = mobile;
    bookingData.email = email;
    bookingData.city = city.toLowerCase();
    bookingData.pincode = pin;
    bookingData.address = addr;

    const updateObj = {
        name: name,
        patient_name: name,
        mobile: mobile,
        mobile_number: mobile,
        email: email,
        city: city,
        city_village: city,
        pincode: pin,
        address: addr
    };

    if (email && email.includes("@") && !welcomeEmailAlreadySent) {
        welcomeEmailAlreadySent = true;
        updateObj.welcome_email_sent = true;
        sendAutoEmail({
            type: "contact",
            to: email,
            subject: "Welcome to Bhavya Diagnostics!",
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
                    <h2 style="color:#0056b3;margin-top:0;">Welcome to Bhavya Diagnostics!</h2>
                    <p>Dear <b>${escapeHtml(name)}</b>,</p>
                    <p>Thank you for registering with <b>Bhavya Diagnostics</b> (Main Jhajjar Road, Bahadurgarh). You can now book 700+ NABL lab blood tests, health packages, ECG, and PFT with fast digital reports.</p>
                    <p style="font-size:13px;color:#64748b;">Need help? Call/WhatsApp us at <b>89501 12467</b>.</p>
                   </div>`
        });
    }

    savePatientToFirebase(updateObj);
    try {
        const prevCache = JSON.parse(localStorage.getItem("bhavya_profile_cache") || "{}");
        localStorage.setItem("bhavya_profile_cache", JSON.stringify({ ...prevCache, ...updateObj }));
    } catch (e) {}

    const canHomeCollect = isPincodeServiceable(pin);
    cart.forEach(item => {
        let type = (item.service_type || "pathology").toLowerCase().trim();
        if (String(item.service_id).toUpperCase() === "VIP-FREE-002" || isSurpriseItem(item)) {
            item.fulfillment = "center";
        } else if (String(item.service_id).toUpperCase() === "VIP-FREE-001") {
            item.fulfillment = canHomeCollect ? "home" : "center";
        } else if (!canHomeCollect) {
            item.fulfillment = "center";
        } else {
            item.fulfillment = homeServiceCategories.includes(type) ? "home" : "center";
        }
    });

    if (!canHomeCollect) {
        showToast(`Home collection unavailable at ${pin}. Center Visit selected.`, "error");
    }

    document.getElementById("step1-nav").classList.add("completed");
    document.getElementById("step2-nav").classList.add("active");
    document.getElementById("sumName").innerText = bookingData.name;
    document.getElementById("sumMobile").innerText = "+91 " + bookingData.mobile;
    document.getElementById("sumEmail").innerText = bookingData.email || "";
    document.getElementById("sumCityPin").innerText = `${city.toUpperCase()} - ${pin}`;
    document.getElementById("sumAddress").innerText = bookingData.address;
    document.getElementById("infoForm").style.display = "none";
    document.getElementById("infoSummary").style.display = "block";

    const s2 = document.getElementById("step2-card");
    s2.style.display = "block";
    s2.style.opacity = "1";
    s2.style.pointerEvents = "auto";

    autoAssignGroupLabs();
    renderGroupedCart();
}

function editPatientInfo() {
    document.getElementById("infoForm").style.display = "block";
    document.getElementById("infoSummary").style.display = "none";
    const s2 = document.getElementById("step2-card");
    s2.style.opacity = "0.5";
    s2.style.pointerEvents = "none";
    validateCheckout();
}

// =======================================================
// SMART COMMON LAB CLUSTERING (REQ #7)
// Shows ONE common lab list for all compatible tests;
// splits into separate lab cards ONLY when tests have non-overlapping labs.
// =======================================================
function buildSmartLabClusters() {
    const clusters = [];
    const regularItems = [];

    cart.forEach((item, index) => {
        const sid = String(item.service_id || "").toUpperCase();
        if (sid === "VIP-FREE-002") {
            clusters.push({
                id: "vip-ecg-pft",
                title: "VIP Package: ECG + PFT + 50+ Body Parameters",
                icon: "fas fa-heartbeat",
                specialType: "vip_bhavya",
                homeEligible: false,
                items: [{ ...item, originalIndex: index }],
                commonLabs: getLabsForService(item)
            });
        } else if (isSurpriseItem(item)) {
            clusters.push({
                id: "surprise-cluster",
                title: "Surprise Test Package",
                icon: "fas fa-gift",
                specialType: "surprise",
                homeEligible: false,
                items: [{ ...item, originalIndex: index }],
                commonLabs: [{ lab_id: "BHAVYACARE-INTERNAL", lab_name: "Bhavya Diagnostics Nodal Center", tags: ["SURPRISE"], raw_label: "Bhavya Diagnostics Nodal Center" }]
            });
        } else {
            regularItems.push({ ...item, originalIndex: index, eligibleLabs: getLabsForService(item) });
        }
    });

    // Greedy clustering by largest common lab overlap
    let remaining = [...regularItems];
    let clusterCounter = 1;

    while (remaining.length > 0) {
        // Count how many remaining items each lab covers
        const labFreq = new Map();
        const labObjMap = new Map();
        remaining.forEach(item => {
            item.eligibleLabs.forEach(lab => {
                labFreq.set(lab.lab_id, (labFreq.get(lab.lab_id) || 0) + 1);
                if (!labObjMap.has(lab.lab_id)) labObjMap.set(lab.lab_id, lab);
            });
        });

        // Pick lab that covers maximum items
        let bestLabId = null;
        let maxCount = 0;
        labFreq.forEach((count, lid) => {
            if (count > maxCount) {
                maxCount = count;
                bestLabId = lid;
            }
        });

        // Group all remaining items that support bestLabId
        const groupItems = remaining.filter(it => it.eligibleLabs.some(l => l.lab_id === bestLabId));
        remaining = remaining.filter(it => !it.eligibleLabs.some(l => l.lab_id === bestLabId));

        // Common labs = intersection of eligibleLabs across EVERY item in this cluster
        let commonLabs = groupItems[0].eligibleLabs.filter(lab =>
            groupItems.every(it => it.eligibleLabs.some(l => l.lab_id === lab.lab_id))
        );
        if (commonLabs.length === 0 && bestLabId && labObjMap.has(bestLabId)) {
            commonLabs = [labObjMap.get(bestLabId)];
        }

        const allHomeEligible = groupItems.every(it => {
            const t = (it.service_type || "pathology").toLowerCase().trim();
            return homeServiceCategories.includes(t) || String(it.service_id).toUpperCase() === "VIP-FREE-001";
        });

        const title = (clusters.filter(c => !c.specialType).length === 0 && remaining.length === 0)
            ? "Selected Tests & Packages"
            : `Lab Group ${clusterCounter}`;

        clusters.push({
            id: "cluster-" + clusterCounter,
            title: title,
            icon: "fas fa-notes-medical",
            specialType: null,
            homeEligible: allHomeEligible,
            items: groupItems,
            commonLabs: commonLabs
        });
        clusterCounter++;
    }

    return clusters;
}

function autoAssignGroupLabs() {
    renderedLabClusters = buildSmartLabClusters();
    const canHome = isPincodeServiceable(bookingData.pincode);

    renderedLabClusters.forEach(cluster => {
        if (cluster.specialType === "vip_bhavya") {
            cluster.items.forEach(ci => {
                const orig = cart[ci.originalIndex];
                if (!orig) return;
                orig.selected_lab_id = "BHAVYA_DIAGNOSTICS";
                orig.selected_lab_name = "Bhavya Diagnostics (ECG + PFT + 50+ BCA)";
                orig.fulfillment = "center";
            });
            return;
        }
        if (cluster.specialType === "surprise") {
            cluster.items.forEach(ci => {
                const orig = cart[ci.originalIndex];
                if (!orig) return;
                orig.selected_lab_id = "BHAVYACARE-INTERNAL";
                orig.selected_lab_name = "Bhavya Diagnostics Nodal Center";
                orig.fulfillment = "center";
            });
            return;
        }

        // Check if current selection is valid across the whole cluster
        const firstSelected = cart[cluster.items[0].originalIndex]?.selected_lab_id;
        const validExisting = cluster.commonLabs.find(l => l.lab_id === firstSelected);
        const chosenLab = validExisting || cluster.commonLabs[0] || {
            lab_id: "BHAVYA_DIAGNOSTICS",
            raw_label: "Bhavya Diagnostics (NABL)"
        };

        cluster.items.forEach(ci => {
            const orig = cart[ci.originalIndex];
            if (!orig) return;
            orig.selected_lab_id = chosenLab.lab_id;
            orig.selected_lab_name = chosenLab.raw_label;
            if (!cluster.homeEligible || !canHome) {
                orig.fulfillment = "center";
            } else if (!orig.fulfillment) {
                orig.fulfillment = "home";
            }
        });
    });

    localStorage.setItem("bhavyaCart", JSON.stringify(cart));
}

function renderGroupedCart() {
    renderedLabClusters = buildSmartLabClusters();
    let html = "";

    renderedLabClusters.forEach((cluster, cIdx) => {
        const firstOrig = cart[cluster.items[0].originalIndex] || {};
        const selectedLabId = firstOrig.selected_lab_id || (cluster.commonLabs[0]?.lab_id || "");
        const canHomeAtPincode = isPincodeServiceable(bookingData.pincode);
        const isHome = cluster.homeEligible && canHomeAtPincode && (firstOrig.fulfillment === "home");

        html += `<div class="group-container">
                    <div class="group-header">
                        <span><i class="${cluster.icon}" style="color:var(--primary); margin-right:6px;"></i> ${escapeHtml(cluster.title)}</span>
                        <span style="font-size:11px; color:var(--text-muted);">${cluster.items.length} Item${cluster.items.length > 1 ? "s" : ""}</span>
                    </div>`;

        cluster.items.forEach(item => {
            let itemPrice = Number(item.price || 0);
            const liveSvc = allServices.find(s => String(s.service_id) === String(item.service_id));
            const mrpUnit = Number(item.mrp_price || (liveSvc ? liveSvc.service_price : itemPrice));
            const isFreeVip = isVipFreePackage(item.service_id);

            html += `
                <div class="cart-item-header">
                    <div class="item-title-box">
                        <strong style="font-size:13.5px; color:var(--text-main);">${escapeHtml(item.service_name)} <span style="color:var(--text-muted); font-size:12px;">(x${item.qty || 1})</span></strong>
                        ${isFreeVip ? '<br><span style="font-size:10.5px; background:#fef3c7; color:#b45309; padding:2px 7px; border-radius:5px; font-weight:800;">VIP COMPLIMENTARY ₹0</span>' : ""}
                    </div>
                    <div style="display:flex; align-items:center;">
                        <div style="text-align:right;">
                            ${mrpUnit > itemPrice ? `<del style="font-size:11px; color:#94a3b8; display:block;">₹${mrpUnit * (item.qty || 1)}</del>` : ""}
                            <strong style="color:var(--success); font-size:14.5px;">₹${itemPrice * (item.qty || 1)}</strong>
                        </div>
                        <button class="btn-remove-item" onclick="removeCartItem(${item.originalIndex})" title="Remove"><i class="fas fa-times"></i></button>
                    </div>
                </div>`;
        });

        if (cluster.specialType === "vip_bhavya" || cluster.specialType === "surprise") {
            const isVipB = cluster.specialType === "vip_bhavya";
            const themeColor = isVipB ? "var(--primary)" : "#d946ef";
            const themeBg = isVipB ? "var(--primary-soft)" : "#fdf4ff";
            const themeBorder = isVipB ? "#bfdbfe" : "#f0abfc";
            const subtitle = isVipB
                ? "Performed directly at Bhavya Diagnostics Center, Main Jhajjar Road, Bahadurgarh."
                : "Processed by Bhavya Diagnostics Nodal Center.";

            html += `
            <div style="background:${themeBg}; border:1px solid ${themeBorder}; border-radius:12px; padding:13px; margin-top:12px;">
                <div class="lab-card selected" style="border-color:${themeColor}; background:#ffffff; margin-bottom:0; cursor:default;">
                    <div class="lab-icon-box" style="background:${themeColor}; color:white;">
                        <i class="fas fa-hospital"></i>
                    </div>
                    <div class="lab-info">
                        <h4 class="lab-name" style="color:${themeColor};">Bhavya Diagnostics <span class="badge-small" style="background:var(--warning); color:white;">${isVipB ? "VIP INCLUDED" : "SURPRISE"}</span></h4>
                        <p class="lab-addr">${subtitle}</p>
                    </div>
                </div>
            </div></div>`;
            return;
        }

        if (cluster.homeEligible) {
            let homeClickAction = canHomeAtPincode
                ? `changeClusterFulfill(${cIdx}, 'home')`
                : `showHomeUnavailableAlert()`;
            let homeBtnStyle = canHomeAtPincode ? "" : "opacity:0.6; cursor:not-allowed; background:#f8fafc;";
            let lockIcon = canHomeAtPincode ? "" : ' <i class="fas fa-lock" style="font-size:11px; margin-left:4px;"></i>';

            html += `
                <div class="service-toggle-box" style="margin-top:12px;">
                    <button class="toggle-btn ${isHome ? "active" : ""}" style="${homeBtnStyle}" onclick="${homeClickAction}"><i class="fas fa-home"></i> Home Collection${lockIcon}</button>
                    <button class="toggle-btn ${!isHome ? "active" : ""}" onclick="changeClusterFulfill(${cIdx}, 'center')"><i class="fas fa-hospital"></i> Center Visit</button>
                </div>`;
        } else {
            html += `<div class="center-only-badge" style="margin-top:12px;"><i class="fas fa-info-circle"></i> Center Visit Required for these services</div>`;
        }

        html += `<p style="font-size:12px; font-weight:700; color:var(--text-muted); margin:10px 0 8px;">Select Common Processing Lab (Applies to all ${cluster.items.length} item${cluster.items.length > 1 ? "s" : ""} above):</p>`;

        cluster.commonLabs.forEach(lab => {
            let isSelected = String(lab.lab_id) === String(selectedLabId) ? "selected" : "";
            let badgesHtml = lab.tags.map(tag => {
                let extraClass = (tag === "NABL" || tag === "NABH") ? "badge-nabl" : (tag === "URGENT" ? "badge-urgent" : "");
                return `<span class="badge-small ${extraClass}">${escapeHtml(tag)}</span>`;
            }).join(" ");

            html += `
                <div class="lab-card ${isSelected}" onclick="assignLabToCluster(${cIdx}, '${lab.lab_id}', '${lab.raw_label.replace(/'/g, "\\'")}')">
                    <div class="lab-icon-box"><i class="fas fa-flask"></i></div>
                    <div class="lab-info">
                        <h4 class="lab-name">${escapeHtml(lab.lab_name)} ${badgesHtml}</h4>
                        <p class="lab-addr"><i class="far fa-clock"></i> Open Daily: 07:00 AM – 08:00 PM</p>
                    </div>
                    ${isSelected ? '<i class="fas fa-check-circle" style="color:var(--success); font-size:18px;"></i>' : ""}
                </div>`;
        });

        html += `</div>`;
    });

    document.getElementById("cartItemsContainer").innerHTML = html;

    renderCartRecommendations();
    renderLabTimeSelectors();
    calculateFinalBill();
}

function changeClusterFulfill(clusterIdx, fulfillment) {
    if (fulfillment === "home" && !isPincodeServiceable(bookingData.pincode)) {
        showHomeUnavailableAlert();
        return;
    }
    const cluster = renderedLabClusters[clusterIdx];
    if (!cluster) return;
    cluster.items.forEach(ci => {
        if (cart[ci.originalIndex]) cart[ci.originalIndex].fulfillment = fulfillment;
    });
    localStorage.setItem("bhavyaCart", JSON.stringify(cart));
    renderGroupedCart();
}

function assignLabToCluster(clusterIdx, labId, rawLabel) {
    const cluster = renderedLabClusters[clusterIdx];
    if (!cluster) return;
    cluster.items.forEach(ci => {
        if (cart[ci.originalIndex]) {
            cart[ci.originalIndex].selected_lab_id = String(labId);
            cart[ci.originalIndex].selected_lab_name = rawLabel || labId;
        }
    });
    localStorage.setItem("bhavyaCart", JSON.stringify(cart));
    renderGroupedCart();
}

function removeCartItem(originalIndex) {
    cart.splice(originalIndex, 1);
    localStorage.setItem("bhavyaCart", JSON.stringify(cart));
    if (cart.length === 0) {
        toggleView("booking");
    } else {
        autoAssignGroupLabs();
        renderGroupedCart();
    }
    showToast("Item removed from cart.", "error");
}

// =======================================================
// RELATED TESTS & PACKAGES IN CART (REQ #5 & #6)
// Replaces "Frequently Added Together"
// =======================================================
function extractKeywordsFromText(str) {
    const stopWords = new Set(["test", "tests", "blood", "serum", "profile", "package", "health", "checkup", "complete", "total", "panel", "routine", "fasting", "with", "and", "for", "the", "basic", "gold", "platinum", "arogya", "bhavya", "vip"]);
    return String(str || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length >= 3 && !stopWords.has(w));
}

function renderCartRecommendations() {
    const container = document.getElementById("relatedRecsContainer");
    if (!container) return;

    if (cart.length === 0 || allServices.length === 0) {
        container.style.display = "none";
        return;
    }

    const cartIds = new Set(cart.map(c => String(c.service_id)));
    const cartKeywords = new Set();
    const cartCategories = new Set();

    cart.forEach(item => {
        const liveSvc = allServices.find(s => String(s.service_id) === String(item.service_id));
        extractKeywordsFromText(item.service_name).forEach(k => cartKeywords.add(k));
        if (liveSvc) {
            extractKeywordsFromText(liveSvc.second_name).forEach(k => cartKeywords.add(k));
            if (liveSvc.service_category) cartCategories.add(String(liveSvc.service_category).toLowerCase().trim());
        }
    });

    const isPkgType = (s) => {
        const t = String(s.service_type || "").toLowerCase().trim();
        return t === "profile" || t === "package" || t === "discount_profile";
    };

    const scored = [];
    allServices.forEach(svc => {
        if (cartIds.has(String(svc.service_id)) || isVipFreePackage(svc.service_id) || isSurpriseItem(svc)) return;

        let score = 0;
        const textBlob = `${svc.service_name || ""} ${svc.second_name || ""} ${svc.description || ""} ${svc.service_category || ""}`.toLowerCase();
        cartKeywords.forEach(kw => {
            if (textBlob.includes(kw)) score += isPkgType(svc) ? 3 : 2;
        });
        if (svc.service_category && cartCategories.has(String(svc.service_category).toLowerCase().trim())) {
            score += 2;
        }
        if (score > 0) scored.push({ svc, score, isPkg: isPkgType(svc) });
    });

    // Sort: related packages first, then related individual tests
    scored.sort((a, b) => b.score - a.score);
    const topPackages = scored.filter(x => x.isPkg).slice(0, 4);
    const topTests = scored.filter(x => !x.isPkg).slice(0, 4);
    const finalRecs = [...topPackages, ...topTests].slice(0, 6);

    if (finalRecs.length === 0) {
        container.style.display = "none";
        return;
    }

    const isVip = (userPlanStatus === "vip" || userPlanStatus === "pending");
    let cardsHtml = "";

    finalRecs.forEach(({ svc, isPkg }) => {
        const priceToUse = formatPrice(isVip ? (svc.vip_price || svc.basic_price) : (svc.basic_price || svc.service_price));
        const mrp = formatPrice(svc.service_price);
        const sId = String(svc.service_id).replace(/'/g, "\\'");
        const safeName = formatText(svc.service_name).replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const safeType = String(svc.service_type || "").replace(/'/g, "\\'");

        const badgeHtml = isPkg
            ? `<span class="rec-badge" style="background:#e0f2fe; color:#0284c7;">📦 Package${svc.number_of_test ? " • " + escapeHtml(svc.number_of_test) + " Tests" : ""}</span>`
            : `<span class="rec-badge" style="background:#f1f5f9; color:#475569;">🧪 Related Test</span>`;

        cardsHtml += `
            <div class="rec-card">
                <div>
                    ${badgeHtml}
                    <h4 class="rec-title" style="margin-top:6px;">${escapeHtml(formatText(svc.service_name))}</h4>
                </div>
                <div class="rec-foot">
                    <div>
                        <strong style="color:var(--success); font-size:14.5px;">₹${priceToUse}</strong>
                        ${mrp > priceToUse ? `<del style="color:#94a3b8; font-size:11px; margin-left:4px;">₹${mrp}</del>` : ""}
                    </div>
                    <button type="button" class="rec-add-btn" onclick="updateQty('${sId}', 1, ${priceToUse}, '${safeName}', '${safeType}')">+ Add</button>
                </div>
            </div>`;
    });

    container.innerHTML = `
        <div class="rec-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h4 style="margin:0; font-size:13.5px; font-weight:800; color:var(--text-main);"><i class="fas fa-stethoscope" style="color:var(--primary); margin-right:6px;"></i> Recommended Related Tests &amp; Packages</h4>
            </div>
            <div class="rec-slider">${cardsHtml}</div>
        </div>`;
    container.style.display = "block";
}

// =======================================================
// TIME SLOT SELECTION
// =======================================================
function parseTime(t) {
    if (!t) return null;
    let match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return null;
    let h = parseInt(match[1]);
    let m = parseInt(match[2]);
    let ampm = match[3].toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h * 60 + m;
}

function formatTime(mins) {
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    let ampm = h >= 12 ? "PM" : "AM";
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${h12.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function renderLabTimeSelectors() {
    let container = document.getElementById("labTimesContainer");
    if (!container) return;

    let uniqueLabIds = [...new Set(cart.map(c => c.selected_lab_id).filter(Boolean))];
    if (uniqueLabIds.length === 0) {
        container.innerHTML = "";
        validateCheckout();
        return;
    }

    let todayStr = new Date().toISOString().split("T")[0];
    let html = `<h3 style="font-size:14.5px; font-weight:800; margin:0 0 12px; color:var(--text-main);">Select Appointment Date &amp; Time</h3>`;
    let hasNormalLab = uniqueLabIds.some(id => id !== "BHAVYACARE-INTERNAL");

    uniqueLabIds.forEach(labId => {
        if (labId === "BHAVYACARE-INTERNAL" && hasNormalLab) {
            if (!labSlots[labId]) labSlots[labId] = { date: "", time: "" };
            return;
        }

        const sampleItem = cart.find(c => c.selected_lab_id === labId);
        let labName = (sampleItem && sampleItem.selected_lab_name) ? sampleItem.selected_lab_name : "Selected Lab";
        if (labId === "BHAVYACARE-INTERNAL") labName = "Bhavya Diagnostics Nodal Center";

        let fulfills = cart.filter(c => c.selected_lab_id === labId).map(c => c.fulfillment);
        let fText = fulfills.includes("home") ? "Home Collection" : "Center Visit";

        if (!labSlots[labId]) labSlots[labId] = { date: "", time: "", lab_name: labName };
        labSlots[labId].lab_name = labName;
        let savedDate = labSlots[labId].date;

        html += `
        <div style="background: var(--primary-soft); border: 1px solid #bfdbfe; padding: 14px; border-radius: 12px; margin-bottom: 12px;">
            <strong style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:10px; color:var(--primary); gap:8px; flex-wrap:wrap;">
                <span><i class="far fa-clock"></i> ${escapeHtml(labName)}</span>
                <span style="font-size:10.5px; background:#dbeafe; padding:2px 8px; border-radius:6px; color:var(--text-main); font-weight:800;">${fText}</span>
            </strong>
            <input type="date" class="form-input" min="${todayStr}" value="${savedDate}" onchange="updateLabDate('${labId}', this.value)" style="margin-bottom:8px; background:white; padding:10px;">
            <div class="slot-grid" id="slots-${labId}"></div>
        </div>`;
    });

    container.innerHTML = html;

    uniqueLabIds.forEach(labId => {
        if (labSlots[labId] && labSlots[labId].date) {
            updateLabDate(labId, labSlots[labId].date, true);
        }
    });

    validateCheckout();
}

function updateLabDate(labId, dateStr, isRenderCall = false) {
    labSlots[labId].date = dateStr;
    if (!isRenderCall) labSlots[labId].time = "";

    if (labId !== "BHAVYACARE-INTERNAL" && labSlots["BHAVYACARE-INTERNAL"]) {
        labSlots["BHAVYACARE-INTERNAL"].date = dateStr;
        if (!isRenderCall) labSlots["BHAVYACARE-INTERNAL"].time = "";
    }

    let container = document.getElementById(`slots-${labId}`);
    if (!container || !dateStr) return;

    container.style.maxHeight = "500px";
    container.style.opacity = "1";
    const label = document.getElementById(`selected-time-label-${labId}`);
    if (label) label.remove();

    let dateObj = new Date(dateStr);
    let o = parseTime("07:00 AM");
    let c = parseTime("08:00 PM");

    let now = new Date();
    let isToday = (dateObj.toDateString() === now.toDateString());
    let currentMins = (now.getHours() * 60) + now.getMinutes();
    let bufferMins = (userPlanStatus === "pending") ? 120 : 30;

    let html = "";
    let slotsAdded = 0;
    for (let t = o; t <= c - 30; t += 30) {
        if (isToday && t < (currentMins + bufferMins)) continue;
        let slotStr = formatTime(t);
        let sel = labSlots[labId].time === slotStr ? "selected" : "";
        html += `<button type="button" class="slot-btn ${sel}" onclick="selectLabTime('${labId}', '${slotStr}')">${slotStr}</button>`;
        slotsAdded++;
    }

    if (slotsAdded === 0) {
        html = `<p style="color:var(--danger); font-size:12px; font-weight:700; grid-column:1/-1; margin:4px 0;">No more slots available for today (7:00 AM – 8:00 PM). Please select tomorrow.</p>`;
    }

    container.innerHTML = html;
    validateCheckout();
}

function selectLabTime(labId, timeStr) {
    labSlots[labId].time = timeStr;

    if (labId !== "BHAVYACARE-INTERNAL" && labSlots["BHAVYACARE-INTERNAL"]) {
        labSlots["BHAVYACARE-INTERNAL"].date = labSlots[labId].date;
        labSlots["BHAVYACARE-INTERNAL"].time = timeStr;
    }

    const slotButtons = document.querySelectorAll(`#slots-${labId} .slot-btn`);
    slotButtons.forEach(btn => {
        btn.classList.toggle("selected", btn.innerText === timeStr);
    });

    const slotGrid = document.getElementById(`slots-${labId}`);
    if (slotGrid) {
        setTimeout(() => {
            slotGrid.style.maxHeight = "0px";
            slotGrid.style.overflow = "hidden";
            slotGrid.style.opacity = "0";
            slotGrid.style.transition = "all 0.35s ease";

            const oldLabel = document.getElementById(`selected-time-label-${labId}`);
            if (oldLabel) oldLabel.remove();
            const timeLabel = document.createElement("div");
            timeLabel.id = `selected-time-label-${labId}`;
            timeLabel.innerHTML = `<span style="font-size:12px; color:var(--success); font-weight:700;"><i class="fas fa-check"></i> Selected: ${escapeHtml(timeStr)}</span>`;
            slotGrid.parentNode.insertBefore(timeLabel, slotGrid);
        }, 250);
    }

    validateCheckout();
}

// =======================================================
// CAMP PROMO CODE + REFERRAL CODE (CLEAN ERRORS — NO "FIREBASE" TEXT! REQ #2 & #8)
// =======================================================
async function applyCodeOrReferral() {
    const input = document.getElementById("refCodeInput");
    const code = input.value.trim().toUpperCase();
    const msg = document.getElementById("refMessage");
    const btn = document.getElementById("applyRefBtn");
    const remBtn = document.getElementById("removeRefBtn");

    if (!code) {
        msg.innerHTML = `<i class="fas fa-exclamation-circle"></i> Please enter a coupon or referral code.`;
        msg.style.color = "var(--danger)";
        return;
    }

    btn.innerText = "Checking...";
    btn.disabled = true;

    try {
        if (!db) throw new Error("offline");

        // 1. Check Camp Promo Code first ('promo_codes/{CODE}')
        const promoSnap = await db.collection("promo_codes").doc(code).get();
        if (promoSnap.exists) {
            const promo = promoSnap.data();
            const status = String(promo.status || "inactive").toLowerCase().trim();
            const applyOn = String(promo.apply_on || "all").toLowerCase().trim();
            const minOrder = Number(promo.min_order || 0);

            if (status !== "active" || (applyOn !== "tests" && applyOn !== "all")) {
                msg.innerHTML = `<i class="fas fa-times-circle"></i> Coupon expired or not valid on test bookings.`;
                msg.style.color = "var(--danger)";
                return;
            }
            if (finalBill.subtotal < minOrder) {
                msg.innerHTML = `<i class="fas fa-times-circle"></i> Minimum order of ₹${minOrder} required for this coupon.`;
                msg.style.color = "var(--danger)";
                return;
            }

            appliedPromo = {
                code: code,
                discount_type: String(promo.discount_type || "flat").toLowerCase(),
                discount_value: Number(promo.discount_value || 0),
                min_order: minOrder
            };
            validReferrerUid = "";
            finalBill.refCode = "";
            finalBill.refDiscount = 0;

            const label = appliedPromo.discount_type === "percent"
                ? `${appliedPromo.discount_value}% OFF`
                : `₹${appliedPromo.discount_value} OFF`;

            msg.innerHTML = `<i class="fas fa-check-circle"></i> Camp Coupon Applied! ${label} discount added.`;
            msg.style.color = "var(--success)";
            input.readOnly = true;
            btn.style.display = "none";
            if (remBtn) remBtn.style.display = "inline-block";
            calculateFinalBill();
            return;
        }

        // 2. Check Referral Code ('patients' collection)
        let allowedTypesStr = appRules.referral_applicable_services_type || "pathology, profile, package, ct, mri";
        let allowedTypes = allowedTypesStr.toLowerCase().split(",").map(s => s.trim());
        let eligibleSubtotal = 0;

        cart.forEach(item => {
            let type = (item.service_type || "pathology").toLowerCase().trim();
            if (allowedTypes.includes(type) || allowedTypes.includes("all")) {
                eligibleSubtotal += (Number(item.price || 0) * Number(item.qty || 1));
            }
        });

        let minOrderRef = Number(appRules.min_order_for_referral || 300);
        const myCustomId = (localStorage.getItem("bhavya_user_id") || "").toUpperCase();
        const allowSelf = String(appRules.allow_self_referral || "FALSE").toUpperCase() === "TRUE";

        if (!allowSelf && myCustomId && code === myCustomId) {
            msg.innerHTML = `<i class="fas fa-times-circle"></i> You cannot use your own referral code.`;
            msg.style.color = "var(--danger)";
            return;
        }

        const snap = await db.collection("patients").where("referral_code", "==", code).limit(1).get();
        if (!snap.empty) {
            const refDoc = snap.docs[0];
            const authUser = await getAuthUser();
            if (!allowSelf && authUser && refDoc.id === authUser.uid) {
                msg.innerHTML = `<i class="fas fa-times-circle"></i> You cannot use your own referral code.`;
                msg.style.color = "var(--danger)";
                return;
            }
            if (eligibleSubtotal < minOrderRef) {
                msg.innerHTML = `<i class="fas fa-times-circle"></i> Minimum eligible order of ₹${minOrderRef} required for referral discount.`;
                msg.style.color = "var(--danger)";
                return;
            }

            appliedPromo = null;
            validReferrerUid = refDoc.id;
            finalBill.refCode = code;
            finalBill.refDiscount = Number(appRules.referral_bonus || 50);

            msg.innerHTML = `<i class="fas fa-check-circle"></i> Referral Code Applied! ₹${finalBill.refDiscount} off.`;
            msg.style.color = "var(--success)";
            input.readOnly = true;
            btn.style.display = "none";
            if (remBtn) remBtn.style.display = "inline-block";
            calculateFinalBill();
            return;
        }

        // Clean message — NEVER mentions Firebase
        appliedPromo = null;
        validReferrerUid = "";
        finalBill.refCode = "";
        finalBill.refDiscount = 0;
        msg.innerHTML = `<i class="fas fa-times-circle"></i> Coupon / Referral code not matched. Please check and try again.`;
        msg.style.color = "var(--danger)";
        calculateFinalBill();
    } catch (e) {
        msg.innerHTML = `<i class="fas fa-times-circle"></i> Coupon not matched. Please try again.`;
        msg.style.color = "var(--danger)";
    } finally {
        btn.innerText = "Apply";
        btn.disabled = false;
    }
}

function removeAppliedCode() {
    appliedPromo = null;
    validReferrerUid = "";
    finalBill.refCode = "";
    finalBill.refDiscount = 0;
    finalBill.promoCode = "";
    finalBill.promoDiscount = 0;

    const input = document.getElementById("refCodeInput");
    const msg = document.getElementById("refMessage");
    const btn = document.getElementById("applyRefBtn");
    const remBtn = document.getElementById("removeRefBtn");

    if (input) { input.readOnly = false; input.value = ""; }
    if (msg) msg.innerHTML = "";
    if (btn) btn.style.display = "inline-block";
    if (remBtn) remBtn.style.display = "none";
    calculateFinalBill();
}

// =======================================================
// BILL & SAVINGS CALCULATION (REQ #9)
// =======================================================
function calculateFinalBill() {
    let subtotal = 0;
    let totalMrp = 0;
    let totalBasic = 0;
    let eligibleSubtotal = 0;
    let isHomeCollection = false;
    let hasVipPackage = false;

    let allowedTypesStr = appRules.wallet_applicable_services_type || appRules.referral_applicable_services_type || "pathology, profile, package, ct, mri";
    let allowedTypes = allowedTypesStr.toLowerCase().split(",").map(s => s.trim());

    cart.forEach(item => {
        const qty = Number(item.qty || 1);
        if (isVipFreePackage(item.service_id)) hasVipPackage = true;

        const liveSvc = allServices.find(s => String(s.service_id) === String(item.service_id));
        const unitApplied = Number(item.price || 0);
        const unitMrp = Number(item.mrp_price || (liveSvc ? liveSvc.service_price : unitApplied) || unitApplied);
        const unitBasic = Number(item.basic_price || (liveSvc ? liveSvc.basic_price : unitApplied) || unitApplied);

        subtotal += unitApplied * qty;
        totalMrp += Math.max(unitMrp, unitApplied) * qty;
        totalBasic += Math.max(unitBasic, unitApplied) * qty;

        let type = (item.service_type || "pathology").toLowerCase().trim();
        if (allowedTypes.includes(type) || allowedTypes.includes("all")) {
            eligibleSubtotal += unitApplied * qty;
        }
        if (item.fulfillment === "home") isHomeCollection = true;
    });

    let collectionCharge = 0;
    if (isHomeCollection) {
        if (hasVipPackage) {
            collectionCharge = 0;
        } else {
            let freeLimit = bookingData.isVip ? Number(appRules.free_collection_limit_vip || 100) : Number(appRules.free_collection_limit_basic || 300);
            if (subtotal < freeLimit) {
                collectionCharge = Number(appRules.home_collection_charge || 50);
            }
        }
    }

    let walletUsed = 0;
    let walletCb = document.getElementById("useWalletCb");
    if (walletCb && walletCb.checked) {
        if (eligibleSubtotal === 0) {
            walletCb.checked = false;
            showMsg(`Wallet can only be used on: ${allowedTypesStr.toUpperCase()}`, "Wallet Restriction");
        } else {
            let maxAllowed = bookingData.isVip ? Number(appRules.vip_max_wallet_use || 200) : Number(appRules.basic_max_wallet_use || 50);
            walletUsed = Math.min(userWalletBalance, maxAllowed, eligibleSubtotal);
        }
    }

    let promoDiscount = 0;
    let promoCode = "";
    if (appliedPromo) {
        promoCode = appliedPromo.code;
        if (appliedPromo.discount_type === "percent") {
            promoDiscount = Math.round((subtotal * appliedPromo.discount_value) / 100);
        } else {
            promoDiscount = appliedPromo.discount_value;
        }
        promoDiscount = Math.min(promoDiscount, Math.max(0, subtotal - walletUsed));
    }

    let actualRefDiscount = appliedPromo ? 0 : finalBill.refDiscount;
    if (actualRefDiscount > 0 && (eligibleSubtotal - walletUsed) < actualRefDiscount) {
        actualRefDiscount = Math.max(0, eligibleSubtotal - walletUsed);
    }

    let extraDiscount = walletUsed + actualRefDiscount + promoDiscount;
    let totalPayable = Math.max(0, subtotal + collectionCharge - extraDiscount);

    finalBill.subtotal = subtotal;
    finalBill.totalMrp = totalMrp;
    finalBill.totalBasic = totalBasic;
    finalBill.collectionCharge = collectionCharge;
    finalBill.walletUsed = walletUsed;
    finalBill.promoDiscount = promoDiscount;
    finalBill.promoCode = promoCode;
    finalBill.totalPayable = totalPayable;

    const tAmt = document.getElementById("totalAmt"); if (tAmt) tAmt.innerText = totalPayable;
    const sumTotal = document.getElementById("summaryTotalAmt"); if (sumTotal) sumTotal.innerText = totalPayable;
    const sumCount = document.getElementById("summaryItemCount"); if (sumCount) sumCount.innerText = cart.length;
    const sumMrp = document.getElementById("summaryMrpAmt"); if (sumMrp) sumMrp.innerText = Math.round(totalMrp);

    const discRow = document.getElementById("summaryDiscountRow");
    const discTxt = document.getElementById("summaryDiscountTxt");
    if (discRow && discTxt) {
        if (extraDiscount > 0) {
            discRow.style.display = "flex";
            discTxt.innerText = `-₹${Math.round(extraDiscount)}`;
        } else {
            discRow.style.display = "none";
        }
    }

    const chargeUI = document.getElementById("summaryChargeTxt");
    if (chargeUI) {
        if (collectionCharge === 0) {
            chargeUI.innerHTML = `<span style="color:var(--success); background:var(--success-soft); padding:2px 8px; border-radius:6px;">FREE</span>`;
        } else {
            chargeUI.innerText = `₹${collectionCharge}`;
            chargeUI.style.color = "var(--text-main)";
        }
    }

    // SAVINGS DISPLAY FOR BOTH VIP & BASIC PATIENTS (REQ #9)
    const savingsFromMrp = Math.max(0, Math.round(totalMrp - subtotal + extraDiscount));
    const savingsFromBasic = Math.max(0, Math.round(totalBasic - subtotal + extraDiscount));
    const isVipUser = (userPlanStatus === "vip" || userPlanStatus === "pending");

    const topBanner = document.getElementById("cartSavingsBanner");
    const topMain = document.getElementById("cartSavingsMain");
    const topSub = document.getElementById("cartSavingsSub");
    const billBox = document.getElementById("billSavingsBox");

    if (savingsFromMrp > 0) {
        let mainText = "";
        let subText = "";
        if (isVipUser) {
            mainText = `<i class="fas fa-crown" style="color:#d97706;"></i> Total VIP Savings: ₹${savingsFromMrp} OFF from MRP!`;
            subText = savingsFromBasic > 0
                ? `Includes ₹${savingsFromBasic} extra savings compared to Standard Basic prices.`
                : `You are enjoying exclusive Bhavya VIP Member pricing.`;
        } else {
            mainText = `<i class="fas fa-piggy-bank" style="color:#059669;"></i> You are saving ₹${savingsFromMrp} from MRP on this booking!`;
            subText = extraDiscount > 0 ? `Includes ₹${Math.round(extraDiscount)} Wallet / Code discount.` : `Discounted Bhavya Diagnostics rates applied.`;
        }

        if (topBanner && topMain && topSub) {
            topMain.innerHTML = mainText;
            topSub.innerText = subText;
            topBanner.style.display = "block";
        }
        if (billBox) {
            billBox.innerHTML = `${mainText}${subText ? `<br><span style="font-weight:600; font-size:11.5px;">${escapeHtml(subText)}</span>` : ""}`;
            billBox.style.display = "block";
        }
    } else {
        if (topBanner) topBanner.style.display = "none";
        if (billBox) billBox.style.display = "none";
    }

    // VIP UPSELL BANNER FOR BASIC USERS
    let upsellBanner = document.getElementById("vipUpsellCartBanner");
    if (!isVipUser && !hasVipPackage && upsellBanner) {
        let potentialVipSavings = 0;
        cart.forEach(item => {
            let service = allServices.find(s => String(s.service_id) === String(item.service_id));
            if (service) potentialVipSavings += Math.max(0, (Number(service.basic_price) - Number(service.vip_price)) * (item.qty || 1));
        });

        if (potentialVipSavings > 250) {
            upsellBanner.innerHTML = `<div style="background:linear-gradient(135deg, #1e293b, #0f172a); color:white; padding:14px 16px; border-radius:14px; display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:14px;">
                <div><h4 style="margin:0; color:#facc15; font-size:13.5px;"><i class="fas fa-crown"></i> Save ₹${Math.round(potentialVipSavings)} More with VIP!</h4><p style="margin:3px 0 0; font-size:11.5px; color:#cbd5e1;">VIP Plans start at ₹${baseVipPrice} + Free Blood &amp; ECG/PFT Packages.</p></div>
                <button onclick="openVipPromo()" style="background:#f59e0b; color:#0f172a; font-weight:800; border:none; padding:8px 13px; border-radius:9px; cursor:pointer; white-space:nowrap;">Explore</button>
            </div>`;
            upsellBanner.style.display = "block";
        } else {
            upsellBanner.style.display = "none";
        }
    } else if (upsellBanner) {
        upsellBanner.style.display = "none";
    }
}

function validateCheckout() {
    const btn = document.getElementById("confirmBtn");
    const btnProceed = document.getElementById("btnProceedCheckout");
    if (!btn) return;

    if (cart.length === 0) {
        btn.disabled = true;
        if (btnProceed) btnProceed.style.display = "none";
        return;
    }

    let uniqueLabIds = [...new Set(cart.map(c => c.selected_lab_id).filter(Boolean))];
    let allLabsAssigned = cart.every(item => item.selected_lab_id);
    let allTimesSelected = uniqueLabIds.every(id => labSlots[id] && labSlots[id].date && labSlots[id].time);

    const s3 = document.getElementById("step3-card");
    if (allLabsAssigned && allTimesSelected) {
        if (btnProceed) btnProceed.style.display = "block";
        calculateFinalBill();
        btn.disabled = false;
    } else {
        if (btnProceed) btnProceed.style.display = "none";
        if (s3) { s3.style.display = "none"; s3.style.opacity = "0.5"; s3.style.pointerEvents = "none"; }
        btn.disabled = true;
        const step3Nav = document.getElementById("step3-nav");
        if (step3Nav) step3Nav.classList.remove("active");
    }
}

function goToStep3() {
    document.getElementById("cartItemsContainer").style.display = "none";
    document.getElementById("labTimesContainer").style.display = "none";
    document.getElementById("btnProceedCheckout").style.display = "none";
    document.getElementById("relatedRecsContainer").style.display = "none";

    const summaryDiv = document.getElementById("servicesSummary");
    if (summaryDiv) {
        summaryDiv.style.display = "block";
        document.getElementById("sumTotalTests").innerText = `${cart.length} Test / Package Item${cart.length > 1 ? "s" : ""} Selected`;
    }

    document.getElementById("step2-nav").classList.add("completed");
    document.getElementById("step3-nav").classList.add("active");

    const s3 = document.getElementById("step3-card");
    if (s3) {
        s3.style.display = "block";
        s3.style.opacity = "1";
        s3.style.pointerEvents = "auto";
        s3.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function editServicesInfo() {
    document.getElementById("servicesSummary").style.display = "none";
    document.getElementById("cartItemsContainer").style.display = "block";
    document.getElementById("labTimesContainer").style.display = "block";
    document.getElementById("btnProceedCheckout").style.display = "block";
    renderCartRecommendations();

    document.getElementById("step2-nav").classList.remove("completed");
    document.getElementById("step3-nav").classList.remove("active");

    const s3 = document.getElementById("step3-card");
    if (s3) {
        s3.style.display = "none";
        s3.style.opacity = "0.5";
        s3.style.pointerEvents = "none";
    }
}

// =======================================================
// FINALIZE BOOKING & CHECKOUT OTP (ADMIN EMAIL + ₹100 BONUS FIXED)
// =======================================================
async function finalizeBooking() {
    const authUser = await getAuthUser();

    if (!authUser) {
        document.getElementById("displayOtpMobile").innerText = "+91 " + bookingData.mobile;
        document.getElementById("cartOtpModal").classList.add("active");

        if (!window.cartRecaptchaVerifier) {
            window.cartRecaptchaVerifier = new firebase.auth.RecaptchaVerifier("cart-recaptcha-container", { size: "normal" });
            window.cartRecaptchaVerifier.render();
        }

        firebase.auth().signInWithPhoneNumber("+91" + bookingData.mobile, window.cartRecaptchaVerifier)
            .then((result) => {
                cartConfirmationResult = result;
                document.getElementById("cart-recaptcha-container").style.display = "none";
                document.getElementById("cartOtpInputSection").style.display = "block";
            })
            .catch(() => {
                showMsg("Error sending OTP. Please check your mobile number.", "OTP Failed");
                document.getElementById("cartOtpModal").classList.remove("active");
            });
    } else {
        processOrderSubmission(authUser.uid);
    }
}

function verifyCartOTP() {
    const otp = document.getElementById("cartOtpCode").value.trim();
    if (otp.length !== 6) return showMsg("Please enter a valid 6-digit OTP.", "Invalid OTP");

    const btn = document.getElementById("cartVerifyOtpBtn");
    btn.innerText = "Verifying...";
    btn.disabled = true;

    cartConfirmationResult.confirm(otp).then((result) => {
        proceedWithRegistration(result.user);
    }).catch(() => {
        showMsg("Invalid OTP! Please try again.", "Verification Failed");
        btn.innerHTML = "Confirm Order <i class='fas fa-check-circle' style='margin-left: 5px;'></i>";
        btn.disabled = false;
    });
}

async function proceedWithRegistration(user) {
    const customUserId = generateCustomUserId(bookingData.name, user.phoneNumber);
    localStorage.setItem("bhavya_uid", user.uid);
    localStorage.setItem("bhavya_mobile", user.phoneNumber);
    localStorage.setItem("bhavya_role", "patient");
    localStorage.setItem("bhavya_user_id", customUserId);
    localStorage.setItem("bhavya_name", bookingData.name);

    const existingSnap = db ? await db.collection("patients").doc(user.uid).get() : null;
    const isNewUser = !existingSnap || !existingSnap.exists;

    if (isNewUser) {
        await savePatientToFirebase({
            user_id: customUserId,
            udi: user.uid,
            name: bookingData.name,
            patient_name: bookingData.name,
            mobile: user.phoneNumber,
            mobile_number: user.phoneNumber,
            email: bookingData.email,
            city: bookingData.city,
            city_village: bookingData.city,
            pincode: bookingData.pincode,
            address: bookingData.address,
            role: "patient",
            referral_code: customUserId,
            current_wallet_balance: WELCOME_BONUS_AMOUNT,
            wallet_balance: WELCOME_BONUS_AMOUNT,
            welcome_bonus_credited: true,
            current_plan_status: "basic",
            plan: "basic",
            status: "active",
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection("wallet_transactions").add({
            uid: user.uid,
            user_id: customUserId,
            type: "credit",
            amount: WELCOME_BONUS_AMOUNT,
            description: "Welcome Bonus on First Login (Test Discount)",
            reference: "WELCOME-100",
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});

        // FIXED: Admin Email Alert on Checkout Login Signup
        await sendAutoEmail({
            type: "contact",
            to: "contact@bhavyadiagnostics.com",
            subject: `New Patient Registered (via Booking): ${bookingData.name} (${customUserId})`,
            html: `<div style="font-family:Arial,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
                    <h3 style="color:#0056b3;margin-top:0;">New Patient Registered During Booking</h3>
                    <ul>
                      <li><b>Name:</b> ${escapeHtml(bookingData.name)}</li>
                      <li><b>Mobile:</b> ${escapeHtml(user.phoneNumber)}</li>
                      <li><b>Email:</b> ${escapeHtml(bookingData.email || "N/A")}</li>
                      <li><b>User ID:</b> ${escapeHtml(customUserId)}</li>
                      <li><b>City / Pincode:</b> ${escapeHtml(bookingData.city)} - ${escapeHtml(bookingData.pincode)}</li>
                      <li><b>Welcome Bonus Credited:</b> ₹${WELCOME_BONUS_AMOUNT}</li>
                    </ul>
                   </div>`
        });
    } else {
        const ex = existingSnap.data();
        if (ex.user_id) localStorage.setItem("bhavya_user_id", ex.user_id);
        await savePatientToFirebase({
            name: bookingData.name,
            patient_name: bookingData.name,
            email: bookingData.email || ex.email || "",
            city: bookingData.city,
            city_village: bookingData.city,
            pincode: bookingData.pincode,
            address: bookingData.address
        });
    }

    document.getElementById("cartOtpModal").classList.remove("active");
    processOrderSubmission(user.uid);
}

async function processOrderSubmission(userId) {
    const btn = document.getElementById("confirmBtn");
    btn.innerText = "Processing Order...";
    btn.disabled = true;
    document.getElementById("loadingOverlay").style.display = "flex";

    try {
        const authUser = await getAuthUser();
        if (!db || !authUser) {
            throw new Error("Please verify OTP / login again to complete booking.");
        }

        const orderId = "ORD-" + Date.now().toString().slice(-6);
        const customUserId = localStorage.getItem("bhavya_user_id") || generateCustomUserId(bookingData.name, bookingData.mobile);

        // Save mrp_price, basic_price, vip_price & lab_cost on every item (enables instant Admin VIP->Basic revert!)
        const enrichedCart = cart.map(item => {
            const liveSvc = allServices.find(s => String(s.service_id) === String(item.service_id));
            const unitLabCost = Number(item.lab_cost ?? (liveSvc ? liveSvc.lab_cost : 0)) || 0;
            const unitMrp = Number(item.mrp_price ?? (liveSvc ? liveSvc.service_price : item.price)) || 0;
            const unitBasic = Number(item.basic_price ?? (liveSvc ? liveSvc.basic_price : item.price)) || 0;
            const unitVip = Number(item.vip_price ?? (liveSvc ? liveSvc.vip_price : item.price)) || 0;
            return {
                ...item,
                mrp_price: unitMrp,
                basic_price: unitBasic,
                vip_price: unitVip,
                lab_cost: unitLabCost
            };
        });

        const totalLabCost = enrichedCart.reduce((sum, item) => sum + ((Number(item.lab_cost) || 0) * (Number(item.qty) || 1)), 0);

        // 1. Save Booking in Firestore (with GPS coordinates + map_link + pricing tier for VIP revert)
        await db.collection("bookings").doc(orderId).set({
            order_id: orderId,
            uid: authUser.uid,
            user_id: customUserId,
            patient_name: bookingData.name,
            mobile: bookingData.mobile,
            email: bookingData.email || "",
            city: bookingData.city,
            pincode: bookingData.pincode,
            address: bookingData.address,
            location_lat: bookingData.lat || "",
            location_lng: bookingData.lng || "",
            map_link: bookingData.map_link || "",
            pricing_tier: userPlanStatus,
            is_vip_pending_booking: userPlanStatus === "pending",
            cart_items: enrichedCart,
            lab_slots: labSlots,
            fulfillment: enrichedCart.some(c => c.fulfillment === "home") ? "home" : "center",
            total_mrp: finalBill.totalMrp,
            total_basic: finalBill.totalBasic,
            subtotal: finalBill.subtotal,
            collection_charge: finalBill.collectionCharge,
            wallet_used: finalBill.walletUsed,
            referral_discount: finalBill.refDiscount,
            promo_code: finalBill.promoCode || "",
            promo_discount: finalBill.promoDiscount || 0,
            total_discount: (finalBill.walletUsed + finalBill.refDiscount + (finalBill.promoDiscount || 0)),
            referral_code: finalBill.refCode,
            final_total: finalBill.totalPayable,
            lab_cost: totalLabCost,
            report_url: "",
            status: "Pending",
            payment_status: "DUE",
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Update Patient profile + deduct wallet + decrement Split VIP Free Packages
        const patientUpdateObj = {
            user_id: customUserId,
            name: bookingData.name,
            patient_name: bookingData.name,
            mobile: bookingData.mobile,
            email: bookingData.email || "",
            city: bookingData.city,
            city_village: bookingData.city,
            pincode: bookingData.pincode,
            address: bookingData.address
        };

        const hasVipBlood = enrichedCart.some(c => String(c.service_id).toUpperCase() === "VIP-FREE-001");
        const hasVipEcgPft = enrichedCart.some(c => String(c.service_id).toUpperCase() === "VIP-FREE-002");

        if (hasVipBlood) {
            const newRem = Math.max(0, vipBloodRemaining - 1);
            patientUpdateObj.vip_blood_pkg_remaining = newRem;
            if (newRem === 0) {
                patientUpdateObj.vip_blood_pkg_claimed = true;
                patientUpdateObj.vip_blood_pkg_status = "completed";
                patientUpdateObj.vip_package_claimed = true;
            }
        }
        if (hasVipEcgPft) {
            const newRem2 = Math.max(0, vipEcgPftRemaining - 1);
            patientUpdateObj.vip_ecg_pft_pkg_remaining = newRem2;
            if (newRem2 === 0) {
                patientUpdateObj.vip_ecg_pft_pkg_claimed = true;
                patientUpdateObj.vip_ecg_pft_pkg_status = "completed";
            }
        }

        if (finalBill.walletUsed > 0) {
            const newOwnBal = Math.max(0, userWalletBalance - finalBill.walletUsed);
            patientUpdateObj.current_wallet_balance = newOwnBal;
            patientUpdateObj.wallet_balance = newOwnBal;

            await db.collection("wallet_transactions").add({
                uid: authUser.uid,
                user_id: customUserId,
                type: "debit",
                amount: finalBill.walletUsed,
                description: `Used in Booking (${orderId})`,
                reference: orderId,
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        await savePatientToFirebase(patientUpdateObj);

        // Increment Camp Promo Code usage count
        if (finalBill.promoCode) {
            db.collection("promo_codes").doc(finalBill.promoCode).update({
                used_count: firebase.firestore.FieldValue.increment(1)
            }).catch(() => {});
        }

        // 3. Credit Referral Bonus to Referrer
        if (finalBill.refCode && validReferrerUid && validReferrerUid !== authUser.uid) {
            try {
                const bonusAmt = Number(appRules.referral_bonus || 50);
                const refPatientRef = db.collection("patients").doc(validReferrerUid);
                const refSnap = await refPatientRef.get();
                if (refSnap.exists) {
                    const rData = refSnap.data();
                    const curBal = Number(rData.current_wallet_balance ?? rData.wallet_balance ?? 0);
                    const newBal = curBal + bonusAmt;
                    await refPatientRef.update({
                        current_wallet_balance: newBal,
                        wallet_balance: newBal
                    });
                    await db.collection("wallet_transactions").add({
                        uid: validReferrerUid,
                        user_id: rData.user_id || validReferrerUid,
                        type: "credit",
                        amount: bonusAmt,
                        description: `Referral Bonus: ${bookingData.name} booked (${orderId})`,
                        reference: orderId,
                        created_at: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            } catch (refErr) {
                console.error("Referral credit error:", refErr);
            }
        }
        validReferrerUid = "";

        // 4. Booking Confirmation Emails (Patient + Admin booking@ & contact@)
        const itemsRowsHtml = enrichedCart.map(i => `
            <tr>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(i.service_name)} (x${i.qty || 1})<br><small style="color:#64748b;">Lab: ${escapeHtml(i.selected_lab_name || "Bhavya Diagnostics")} (${escapeHtml(i.fulfillment || "home")})</small></td>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">₹${Number(i.price || 0) * Number(i.qty || 1)}</td>
            </tr>`).join("");

        const slotSummaries = Object.values(labSlots)
            .filter(s => s && s.date && s.time)
            .map(s => `${s.date} at ${s.time}`)
            .join(", ") || "As scheduled";

        const mapLineHtml = bookingData.map_link
            ? `<br><b>GPS Location:</b> <a href="${escapeHtml(bookingData.map_link)}">Open Google Map</a>`
            : "";

        const confirmationHtml = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <div style="background:#0056b3;color:#ffffff;padding:18px 24px;">
                    <h2 style="margin:0;font-size:20px;">Bhavya Diagnostics — Booking Confirmed</h2>
                    <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Order ID: <b>${escapeHtml(orderId)}</b></p>
                </div>
                <div style="padding:20px 24px;color:#1e293b;">
                    <p>Dear <b>${escapeHtml(bookingData.name)}</b>,</p>
                    <p>Your diagnostic booking has been received and is currently <b>Pending Confirmation</b>.</p>
                    <p style="font-size:13px;line-height:1.6;background:#f8fafc;padding:12px;border-radius:8px;">
                        <b>Mobile:</b> +91 ${escapeHtml(bookingData.mobile)}<br>
                        <b>Address:</b> ${escapeHtml(bookingData.address)}, ${escapeHtml(bookingData.city.toUpperCase())} - ${escapeHtml(bookingData.pincode)}${mapLineHtml}<br>
                        <b>Preferred Slot:</b> ${escapeHtml(slotSummaries)}<br>
                        <b>Payment Mode:</b> Pay at Center / Home (Cash or UPI)
                    </p>
                    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
                        <thead><tr style="background:#f1f5f9;"><th style="padding:8px;text-align:left;">Test / Package</th><th style="padding:8px;text-align:right;">Amount</th></tr></thead>
                        <tbody>${itemsRowsHtml}</tbody>
                    </table>
                    <p style="text-align:right;font-size:16px;margin-top:14px;"><b>Total Payable: ₹${finalBill.totalPayable}</b></p>
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0;">
                    <p style="font-size:12px;color:#64748b;margin:0;">Bhavya Diagnostics • Main Jhajjar Road, Opp. Narendra Farm, Bahadurgarh • Helpline: 89501 12467</p>
                </div>
            </div>`;

        if (bookingData.email && bookingData.email.includes("@")) {
            await sendAutoEmail({
                type: "booking",
                to: bookingData.email,
                subject: `Booking Confirmed (${orderId}) - Bhavya Diagnostics`,
                html: confirmationHtml
            });
        }

        await sendAutoEmail({
            type: "booking",
            to: ["booking@bhavyadiagnostics.com", "contact@bhavyadiagnostics.com"],
            subject: `New Booking: ${orderId} - ${bookingData.name} (₹${finalBill.totalPayable})`,
            html: confirmationHtml
        });

        localStorage.removeItem("bhavyaCart");
        document.getElementById("loadingOverlay").style.display = "none";
        await showMsg(`Order ID: ${orderId}\nTotal Payable: ₹${finalBill.totalPayable}\n\nYou can pay directly via Cash or UPI at collection time.`, "🎉 Booking Successful!");
        window.location.href = "../patient_dashboard/patient_dashboard.html";
    } catch (err) {
        console.error("Booking error:", err);
        document.getElementById("loadingOverlay").style.display = "none";
        showMsg("Could not complete booking: " + err.message, "Booking Error");
        btn.innerText = "Confirm Booking";
        btn.disabled = false;
    }
}

window.showTestInfo = function (serviceId) {
    let targetId = String(serviceId).trim();
    let service = allServices.find(s => String(s.service_id).trim() === targetId);
    if (service && service.description && String(service.description).trim() !== "") {
        document.getElementById("testInfoTitle").innerText = formatText(service.service_name);
        document.getElementById("testInfoDesc").innerHTML = escapeHtml(String(service.description).trim()).replace(/\n/g, "<br>");
        document.getElementById("testInfoModal").style.display = "flex";
    } else {
        showToast("Details not available for this test.", "error");
    }
};

window.addEventListener("load", () => {
    setTimeout(() => {
        let checkTarget = localStorage.getItem("targetCategory");
        if (checkTarget) {
            currentCategory = checkTarget;
            localStorage.removeItem("targetCategory");
            renderCategories();
            renderServices();
        }
    }, 1200);
});

// =======================================================
// SMART NON-DUPLICATE SURPRISE SCRATCH CARD LOGIC (REQ #11)
// Checks cart test names + included parameters of packages!
// =======================================================
let surpriseService = null;
let isScratched = false;

function getEligibleSurpriseTests() {
    const surprisePool = allServices.filter(s => isSurpriseItem(s));
    if (surprisePool.length === 0) return [];

    // Build a complete normalized text corpus of everything already in the cart (names + aliases + package descriptions)
    let cartFullText = "";
    const cartExactNames = new Set();

    cart.forEach(item => {
        const cleanCartName = String(item.service_name || "").replace(/^🎁\s*Surprise:\s*/i, "").toLowerCase().trim();
        cartExactNames.add(cleanCartName);
        cartFullText += " " + cleanCartName;

        const liveSvc = allServices.find(s => String(s.service_id) === String(item.service_id));
        if (liveSvc) {
            cartFullText += " " + String(liveSvc.service_name || "").toLowerCase();
            cartFullText += " " + String(liveSvc.second_name || "").toLowerCase();
            cartFullText += " " + String(liveSvc.description || "").toLowerCase();
        }
    });

    return surprisePool.filter(s => {
        const sName = String(s.service_name || "").toLowerCase().trim();
        const sSecond = String(s.second_name || "").toLowerCase().trim();
        if (!sName) return false;
        if (cartExactNames.has(sName) || cartFullText.includes(sName)) return false;

        // Check individual aliases & keywords of the surprise test against everything in cart
        const aliases = [sName, ...sSecond.split(/[,/|]/).map(a => a.trim()).filter(a => a.length >= 3)];
        for (const alias of aliases) {
            if (cartFullText.includes(alias)) return false;
        }

        const keyTokens = extractKeywordsFromText(sName);
        if (keyTokens.length > 0 && keyTokens.every(tok => cartFullText.includes(tok))) {
            return false;
        }
        return true;
    });
}

function checkSurpriseBannerStatus() {
    let banner = document.getElementById("surpriseOfferBanner");
    if (!banner) return;

    let hasSurprise = cart.some(item => isSurpriseItem(item));
    if (hasSurprise) {
        banner.style.display = "none";
        return;
    }

    let eligibleTypes = ["pathology", "test", "blood test", "profile", "package", "discount_profile"];
    let hasEligibleService = cart.some(item => eligibleTypes.includes(String(item.service_type || "").toLowerCase().trim()));
    let nonDuplicateSurprises = getEligibleSurpriseTests();

    banner.style.display = (hasEligibleService && nonDuplicateSurprises.length > 0) ? "flex" : "none";
}

function openSurpriseModal() {
    let eligibleTests = getEligibleSurpriseTests();
    if (eligibleTests.length === 0) {
        showToast("All available surprise tests are already covered in your cart!", "error");
        document.getElementById("surpriseOfferBanner").style.display = "none";
        return;
    }

    surpriseService = eligibleTests[Math.floor(Math.random() * eligibleTests.length)];
    document.getElementById("scratchTestName").innerText = formatText(surpriseService.service_name);
    let actualPrice = surpriseService.service_price || surpriseService.basic_price || 500;
    document.getElementById("scratchActualPrice").innerText = "₹" + actualPrice;
    let desc = surpriseService.description ? surpriseService.description : "Highly recommended by doctors for routine health tracking.";
    document.getElementById("scratchDesc").innerHTML = `<i class="fas fa-stethoscope" style="color:var(--primary);"></i> <b>Why do this?</b><br>${escapeHtml(desc)}`;

    document.getElementById("scratchModal").classList.add("active");
    document.getElementById("scratchSuccessMsg").style.display = "none";
    setupScratchCanvas();
}

function setupScratchCanvas() {
    isScratched = false;
    const canvas = document.getElementById("scratchCanvas");
    const ctx = canvas.getContext("2d");

    canvas.style.display = "block";
    canvas.style.opacity = "1";
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;

    let gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#cbd5e1");
    gradient.addColorStop(0.5, "#94a3b8");
    gradient.addColorStop(1, "#64748b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = "bold 18px Inter";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("🪙 Scratch to Reveal", canvas.width / 2, canvas.height / 2);

    let isDrawing = false;
    function getMousePos(e) {
        let rect = canvas.getBoundingClientRect();
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function scratch(e) {
        if (!isDrawing) return;
        e.preventDefault();
        let pos = getMousePos(e);
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 25, 0, 2 * Math.PI);
        ctx.fill();
    }

    canvas.onmousedown = (e) => { isDrawing = true; scratch(e); };
    canvas.ontouchstart = (e) => { isDrawing = true; scratch(e); };
    canvas.onmousemove = scratch;
    canvas.ontouchmove = scratch;
    canvas.onmouseup = () => { isDrawing = false; checkScratchedArea(ctx, canvas); };
    canvas.ontouchend = () => { isDrawing = false; checkScratchedArea(ctx, canvas); };
}

function checkScratchedArea(ctx, canvas) {
    if (isScratched) return;
    let pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparentPixels = 0;
    for (let i = 3; i < pixels.length; i += 16) {
        if (pixels[i] === 0) transparentPixels++;
    }
    let scratchedPercentage = (transparentPixels / (pixels.length / 16)) * 100;

    if (scratchedPercentage > 40) {
        isScratched = true;
        canvas.style.transition = "opacity 0.5s ease-out";
        canvas.style.opacity = "0";
        setTimeout(() => {
            canvas.style.display = "none";
            addSurpriseToCart();
        }, 500);
    }
}

function addSurpriseToCart() {
    if (!surpriseService) return;
    cart.push({
        service_id: "SURP-" + surpriseService.service_id,
        service_name: "🎁 Surprise: " + formatText(surpriseService.service_name),
        price: 100,
        mrp_price: Number(surpriseService.service_price || surpriseService.basic_price || 500),
        basic_price: Number(surpriseService.basic_price || surpriseService.service_price || 500),
        vip_price: 100,
        qty: 1,
        service_type: "surprise_package",
        selected_lab_id: "BHAVYACARE-INTERNAL",
        selected_lab_name: "Bhavya Diagnostics Nodal Center",
        fulfillment: "center",
        lab_cost: Number(surpriseService.lab_cost) || 0
    });

    localStorage.setItem("bhavyaCart", JSON.stringify(cart));
    document.getElementById("scratchSuccessMsg").style.display = "block";
    showToast("Surprise Test added for ₹100!", "success");

    setTimeout(() => {
        document.getElementById("scratchModal").classList.remove("active");
        updateCartUI();
        autoAssignGroupLabs();
        renderGroupedCart();
        calculateFinalBill();
    }, 1500);
}
