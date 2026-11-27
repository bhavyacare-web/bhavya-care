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

// =======================================================
// SECURITY HELPER (XSS Protection for Play Store Compliance)
// =======================================================
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

// =======================================================
// AUTOMATIC EMAIL SYSTEM (Zoho SMTP via Firebase Extension)
// =======================================================
const EMAIL_SENDERS = {
    contact: "Bhavya Diagnostics <contact@bhavyadiagnostics.com>",
    booking: "Bhavya Diagnostics Booking <booking@bhavyadiagnostics.com>",
    report:  "Bhavya Diagnostics Reports <report@bhavyadiagnostics.com>"
};

async function sendAutoEmail({ type = "contact", to, subject, html, replyTo = "contact@bhavyadiagnostics.com", attachments = [] }) {
    if (!db || !to) return;
    const recipients = (Array.isArray(to) ? to : [to]).filter(e => e && String(e).includes("@"));
    if (recipients.length === 0) return;

    const mailDoc = {
        from: EMAIL_SENDERS[type] || EMAIL_SENDERS.contact,
        replyTo: replyTo,
        to: recipients,
        message: {
            subject: subject,
            html: html
        }
    };

    if (attachments.length > 0) {
        mailDoc.message.attachments = attachments;
    }

    return db.collection("mail").add(mailDoc).catch(err => console.error("Auto email error:", err));
}

function getAuthUser() {
    return new Promise((resolve) => {
        if (typeof firebase === 'undefined' || !firebase.auth) return resolve(null);
        if (firebase.auth().currentUser) return resolve(firebase.auth().currentUser);
        const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
            unsubscribe();
            resolve(user);
        });
        setTimeout(() => {
            try { unsubscribe(); } catch(e) {}
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
    }, { merge: true }).catch(err => console.error("Firebase patient save error:", err));
}

// =======================================================
// MASTER FRONTEND JS (booking.js UNIFIED SPA)
// =======================================================
const GAS_URL = "https://script.google.com/macros/s/AKfycbwIxSjlD6oVAGi4InT6Lb8RPg6NWrl7vpptoYrEG5HKPzPaadUp_0pVnN_1OZfJ7X_r/exec";

// --- GLOBALS ---
let cart = [];
let currentView = 'booking';
const categoryConfig = {
    'pathology': { name: 'Test', icon: '🩸' },
    'profile':   { name: 'Package', icon: '🩺' },
    'pft':       { name: 'PFT', icon: '🫁' },
    'ecg':       { name: 'ECG', icon: '❤️' }
};
const defaultIcon = '🧪';
const mainCategoryKeys = ['pathology', 'profile', 'pft', 'ecg'];
const homeServiceCategories = ['pathology', 'profile', 'package', 'discount_profile', 'ecg', 'blood test'];

let isVipPkgPending = false;
let allServices = [];
let userPlanStatus = "basic"; 
let currentCategory = 'profile'; 
let currentSubCategory = 'all'; 
let welcomeEmailAlreadySent = false;
let patientProfileComplete = false;

try {
    let stored = localStorage.getItem('bhavyaCart');
    if (stored) {
        let parsed = JSON.parse(stored);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (Array.isArray(parsed)) cart = parsed.map(item => ({...item, qty: item.qty || 1})); 
    }
} catch (e) { cart = []; }

let searchTimeout; 

let currentVipAmount = 3000;
let baseVipPrice = 3000;
let vipDiscount = 500;
let validReferrerId = "";
let validReferrerUid = "";

let bookingData = { name: "", mobile: "", email: "", city: "", pincode: "", address: "", isVip: false };
let cartConfirmationResult; 
let appRules = {};
let userWalletBalance = 0;
let finalBill = { subtotal: 0, collectionCharge: 0, walletUsed: 0, refDiscount: 0, totalPayable: 0, refCode: "" };
let labSlots = {}; 

window.onload = async () => {
    updateCartUI(); 
    await syncFirebasePatientState();
    fetchBookingData();

    const pendingFlag = localStorage.getItem("pending_vip_redirect");
    const userId = localStorage.getItem("bhavya_user_id");
    if (pendingFlag === "true" && userId) {
        localStorage.removeItem("pending_vip_redirect");
        handleVipActivationFlow();
    }
};

// Load logged-in patient plan & profile state directly from Firebase
async function syncFirebasePatientState() {
    if (!db) return;
    try {
        const authUser = await getAuthUser();
        if (!authUser) return;
        const patientRef = db.collection("patients").doc(authUser.uid);
        const doc = await patientRef.get();
        if (doc.exists) {
            const data = doc.data();
            const pName = data.name || data.patient_name || localStorage.getItem("bhavya_name") || "Patient";
            const pMobile = data.mobile || data.mobile_number || authUser.phoneNumber || "";
            const shortId = generateCustomUserId(pName, pMobile);

            let pUserId = data.user_id || "";
            if (!pUserId || pUserId === authUser.uid || pUserId.length > 12) pUserId = shortId;

            let pRefCode = data.referral_code || "";
            if (!pRefCode || pRefCode === authUser.uid || pRefCode.length > 12) pRefCode = pUserId;

            if (data.user_id !== pUserId || data.referral_code !== pRefCode) {
                await patientRef.set({ user_id: pUserId, referral_code: pRefCode }, { merge: true });
            }

            const plan = String(data.current_plan_status || data.plan || "basic").toLowerCase();
            userPlanStatus = plan;
            localStorage.setItem("bhavya_plan_cache", plan);
            localStorage.setItem("bhavya_user_id", pUserId);
            if (pName) localStorage.setItem("bhavya_name", pName);
            userWalletBalance = Number(data.current_wallet_balance ?? data.wallet_balance ?? 0);
            welcomeEmailAlreadySent = !!data.welcome_email_sent;
            patientProfileComplete = !!(pName && pMobile && data.city && data.pincode && data.address);
            isVipPkgPending = (plan === "vip" && data.vip_package_claimed !== true);
            handleBannerDisplay();
        }
    } catch (e) {
        console.error("Sync patient state error:", e);
    }
}

// 🌟 TOAST NOTIFICATION 🌟
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

function formatText(text) {
    if (!text) return "";
    let cleanText = String(text).replace(/_/g, ' '); 
    let formatted = cleanText.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const acronyms = /\b(cbc|esr|usg|mri|ecg|echo|ct|lft|kft|hba1c|tsh|t3|t4|ana|psa|hiv|hcv|bun|aptt|sgpt|sgot|vdrl|rbc|wbc|bchg|aec|anc|amh|ada|hbsag|crp|abp|ncv|emg|ssep|dlco|eeg|pft|nabl|nabh|crl|ved)\b/gi;
    return formatted.replace(acronyms, match => match.toUpperCase());
}

function formatPrice(price) { return (!price || isNaN(price)) ? 0 : parseFloat(Number(price).toFixed(2)); }

// =======================================================
// PARSE LABS FROM SERVICES SHEET COLUMN R
// =======================================================
function parseLabsFromColumnR(labsRawString) {
    const raw = String(labsRawString || "").trim();
    const parts = raw ? raw.split(',').map(p => p.trim()).filter(Boolean) : ["Bhavya Diagnostics (NABL)"];
    
    return parts.map(entry => {
        const tagMatches = [...entry.matchAll(/\(([^)]+)\)/g)].map(m => m[1].trim().toUpperCase());
        const cleanName = entry.replace(/\([^)]*\)/g, '').trim() || "Bhavya Diagnostics";
        const labId = cleanName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || "BHAVYA_DIAGNOSTICS";
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
    const liveSvc = allServices.find(s => String(s.service_id) === String(serviceObj.service_id));
    const labsStr = (liveSvc && liveSvc.labs) || serviceObj.labs || "";
    return parseLabsFromColumnR(labsStr);
}

function fetchBookingData() {
    const userId = localStorage.getItem("bhavya_user_id") || localStorage.getItem("user_id") || ""; 
    const cachedServices = localStorage.getItem("bhavya_services_cache");
    const cachedPlan = localStorage.getItem("bhavya_plan_cache");
    
    function checkUrlAndRender() {
        const urlParams = new URLSearchParams(window.location.search);
        const searchParam = urlParams.get('search');
        const viewParam = urlParams.get('view');
        
        if (viewParam === 'cart') {
            toggleView('cart');
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
        handleBannerDisplay();
        renderCategories();
        checkUrlAndRender();
    }

    fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: "getBookingData", user_id: userId }) })
    .then(res => res.json())
    .then(response => {
        if(response.status === "success") {
            allServices = response.data.services || [];
            if (response.data.rules) {
                appRules = response.data.rules;
                if (appRules.vip_plan_price) {
                    baseVipPrice = Number(appRules.vip_plan_price);
                    currentVipAmount = baseVipPrice;
                }
                if (appRules.vip_purchase_referral_bonus) {
                    vipDiscount = Number(appRules.vip_purchase_referral_bonus);
                }
            }
            
            localStorage.setItem("bhavya_services_cache", JSON.stringify(allServices));
            handleBannerDisplay();
            renderCategories();
            
            if (!cachedServices) { 
                checkUrlAndRender(); 
            } else if (currentView === 'booking') {
                renderServices(document.getElementById("searchInput").value.toLowerCase());
            }
        }
    }).catch(() => { 
        if(!cachedServices) document.getElementById("servicesList").innerHTML = "<p style='text-align:center;'>Failed to load data.</p>"; 
    });
}

function handleBannerDisplay() {
    const banner = document.getElementById("pendingWarningBanner");
    if (banner) {
        banner.style.display = (userPlanStatus === "pending" && currentView === 'booking') ? "block" : "none";
    }
    const claimBanner = document.getElementById("vipClaimBanner");
    if (claimBanner) {
        claimBanner.style.display = (isVipPkgPending && userPlanStatus === "vip" && currentView === 'booking') ? "block" : "none";
    }
}

function renderCategories() {
    const mainContainer = document.getElementById("mainCategories");
    const sliderContainer = document.getElementById("dynamicCategorySlider");
    if(!mainContainer) return;
    
    let mainHtml = "";
    let sliderHtml = "";
    let filteredTypes = allServices.filter(s => s.service_id !== "VIP-FREE-001");
    const existingTypes = [...new Set(filteredTypes.map(s => String(s.service_type || '').toLowerCase().trim()))];

    mainCategoryKeys.forEach(key => {
        let config = categoryConfig[key] || { name: formatText(key), icon: defaultIcon };
        let isPresent = existingTypes.includes(key);
        let isSelected = currentCategory === key ? 'selected' : '';
        
        if(isPresent) {
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
        let isActive = currentCategory === key ? 'active' : '';
        let config = categoryConfig[key] || { name: formatText(key), icon: defaultIcon };
        sliderHtml += `<button class="sub-cat-btn ${isActive}" onclick="selectCategory('${key}')" style="display:flex; align-items:center; gap:5px;">
                          <span>${config.icon}</span> ${config.name}
                       </button>`;
    });

    if (sliderContainer) {
        if (hasNewCategories) {
            sliderContainer.innerHTML = sliderHtml; sliderContainer.style.display = "flex";
        } else {
            sliderContainer.innerHTML = ""; sliderContainer.style.display = "none";
        }
    }
}

function selectCategory(categoryKey) {
    currentCategory = categoryKey; currentSubCategory = 'all';
    document.getElementById("searchInput").value = ""; 
    document.getElementById("autoSuggestBox").style.display = "none";
    renderCategories(); renderServices();
}

function selectSubCategory(subCat) { currentSubCategory = subCat; renderServices(); }

function filterServices() {
    clearTimeout(searchTimeout); 
    searchTimeout = setTimeout(() => { renderServices(document.getElementById("searchInput").value.toLowerCase()); }, 250); 
}

// 🌟 SMART SEARCH 🌟
function matchesServiceQuery(s, query) {
    const name = String(s.service_name || '').toLowerCase();
    const secondName = String(s.second_name || '').toLowerCase();
    const cat = String(s.service_category || '').toLowerCase();
    const desc = String(s.description || '').toLowerCase();
    const id = String(s.service_id || '').toLowerCase();
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
        const t = String(s.service_type || '').toLowerCase().trim();
        return t === 'profile' || t === 'package' || t === 'discount_profile';
    };

    const validPool = allServices.filter(s =>
        s.service_id !== "VIP-FREE-001" &&
        String(s.service_type).toLowerCase().trim().replace(/_/g, ' ') !== "surprise package" &&
        matchesServiceQuery(s, query)
    );

    const matchingTests = validPool.filter(s => !isPkgType(s)).slice(0, 4);
    const matchingPackages = validPool.filter(s => isPkgType(s)).slice(0, 4);

    if (matchingTests.length === 0 && matchingPackages.length === 0) {
        suggestBox.style.display = "none";
        filterServices();
        return;
    }

    const isVip = (userPlanStatus === "vip" || userPlanStatus === "pending");
    const renderRow = (m, isPkg) => {
        const priceToShow = formatPrice(isVip ? (m.vip_price || m.basic_price) : (m.basic_price || m.service_price));
        const safeName = formatText(m.service_name).replace(/'/g, "\\'");
        const badge = isPkg ? `<span style="background:#e0f2fe;color:#0284c7;font-size:10px;font-weight:800;padding:2px 6px;border-radius:5px;margin-left:6px;">PACKAGE</span>` : "";
        return `<div style="padding:11px 15px; border-bottom:1px solid #f1f5f9; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="selectSuggested('${safeName}')">
                    <span style="font-size:13px;"><i class="fas fa-search" style="color:#cbd5e1; margin-right:8px;"></i><b>${escapeHtml(formatText(m.service_name))}</b>${badge}</span>
                    <span style="color:var(--success); font-weight:800; font-size:13px;">₹${priceToShow}</span>
                </div>`;
    };

    let html = "";
    if (matchingTests.length > 0) {
        html += `<div style="padding:7px 15px; background:#f8fafc; font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase;">🧪 Tests</div>`;
        matchingTests.forEach(m => { html += renderRow(m, false); });
    }
    if (matchingPackages.length > 0) {
        html += `<div style="padding:7px 15px; background:#eff6ff; font-size:11px; font-weight:800; color:#2563eb; text-transform:uppercase;">📦 Packages</div>`;
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

document.addEventListener('click', function(e) {
    const searchWrap = document.querySelector('.search-container');
    const suggestBox = document.getElementById('autoSuggestBox');
    if (searchWrap && suggestBox && !searchWrap.contains(e.target)) {
        suggestBox.style.display = 'none';
    }
});

function renderServices(searchQuery = "") {
    const container = document.getElementById("servicesList");
    const subContainer = document.getElementById("subCategoryContainer");
    if(!container) return;
    
    let displayServices = allServices.filter(s => 
        s.service_id !== "VIP-FREE-001" && 
        String(s.service_type).toLowerCase().trim().replace(/_/g, ' ') !== "surprise package"
    );

    let filtered = displayServices.filter(s => String(s.service_type || '').toLowerCase().trim() === currentCategory);

    if ((currentCategory === 'profile' || currentCategory === 'discount_profile') && !searchQuery) {
        let subCats = ['all', ...new Set(filtered.map(s => String(s.service_category || 'Other').trim()))];
        let subHtml = `<div class="sub-cat-nav">`;
        subCats.forEach(sc => {
            let active = currentSubCategory === sc ? 'active' : '';
            subHtml += `<button class="sub-cat-btn ${active}" onclick="selectSubCategory('${sc.replace(/'/g, "\\'")}')">${escapeHtml(formatText(sc))}</button>`;
        });
        subHtml += `</div>`;
        subContainer.innerHTML = subHtml;

        if (currentSubCategory !== 'all') { filtered = filtered.filter(s => String(s.service_category || 'Other').trim() === currentSubCategory); }
    } else { subContainer.innerHTML = ""; }

    if (searchQuery) {
        filtered = displayServices.filter(s => matchesServiceQuery(s, searchQuery.toLowerCase().trim()));
    }

    if (filtered.length === 0) {
        container.innerHTML = "<div style='text-align:center; padding:40px;'><i class='fas fa-search' style='font-size:30px; color:#cbd5e1; margin-bottom:15px;'></i><br><span style='color:var(--text-muted); font-weight:500;'>No tests or packages found.</span></div>";
        return;
    }

    let htmlContent = "";

    filtered.forEach(service => {
        const isVip = (userPlanStatus === "vip" || userPlanStatus === "pending");
        const totalMrp = formatPrice(service.service_price);
        const basicPrice = formatPrice(service.basic_price);
        const vipPrice = formatPrice(service.vip_price);
        const applicablePrice = isVip ? vipPrice : basicPrice;
        
        const s_id = String(service.service_id).replace(/'/g, "\\'");
        const cartItem = cart.find(item => String(item.service_id) === String(service.service_id));
        const inCart = !!cartItem;
        const currentQty = cartItem ? cartItem.qty : 0;
        
        const cleanName = formatText(service.service_name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const cleanType = String(service.service_type || '').replace(/'/g, "\\'");
        const cleanCat = formatText(service.service_category);

        let actionBtnHtml = "";
        if (inCart) {
            actionBtnHtml = `<div class="qty-control"><button onclick="updateQty('${s_id}', -1, ${applicablePrice}, '${cleanName}', '${cleanType}')"><i class="fas fa-minus"></i></button><span class="qty-text">${currentQty}</span><button onclick="updateQty('${s_id}', 1, ${applicablePrice}, '${cleanName}', '${cleanType}')"><i class="fas fa-plus"></i></button></div>`;
        } else {
            actionBtnHtml = `<button class="add-to-cart-btn" onclick="updateQty('${s_id}', 1, ${applicablePrice}, '${cleanName}', '${cleanType}')">ADD +</button>`;
        }

        let pricingHtml = "";
        if (isVip) {
            pricingHtml = `<div class="mrp-row"><span>Total: <span class="mrp">₹${totalMrp}</span></span><span style="margin-left:8px;">Basic: <span class="mrp">₹${basicPrice}</span></span></div><div class="final-price">₹${vipPrice} <i class="fas fa-crown" style="color:var(--warning); font-size:14px;"></i></div>`;
        } else {
            pricingHtml = `<div class="mrp-row"><span>Total: <span class="mrp">₹${totalMrp}</span></span></div><div class="final-price">₹${basicPrice} <span style="font-size:10px; font-weight:800; background:var(--primary-light); color:var(--primary); padding:2px 6px; border-radius:4px; transform:translateY(-2px);">BASIC</span></div><div class="locked-price" onclick="openVipPromo()"><i class="fas fa-lock" style="font-size:10px;"></i> VIP Rate: ₹${vipPrice}</div>`;
        }

        let sTypeLowerCase = String(service.service_type || '').toLowerCase().trim();
        let isPackageOrProfile = (sTypeLowerCase === 'profile' || sTypeLowerCase === 'package' || sTypeLowerCase === 'discount_profile');

        let infoIconHtml = "";
        let descText = service.description ? String(service.description).trim() : "";

        if (descText !== "") {
            if (isPackageOrProfile) {
                infoIconHtml = `<i class="fas fa-info-circle" onclick="openModal('${s_id}')" style="color:#3b82f6; cursor:pointer; margin-left:8px; font-size:16px;"></i>`;
            } else {
                infoIconHtml = `<i class="fas fa-info-circle" onclick="showTestInfo('${s_id}')" style="color:#3b82f6; cursor:pointer; margin-left:8px; font-size:16px;"></i>`;
            }
        }

        let fastingVal = service.fasting ? String(service.fasting).trim() : "";
        let reportVal = service.reporting_time ? String(service.reporting_time).trim() : "";
        let metaHtml = "";
        if (fastingVal || reportVal) {
            const fText = fastingVal ? (fastingVal.toLowerCase().includes('fast') ? fastingVal : `Fasting: ${fastingVal}`) : "";
            const rText = reportVal ? (reportVal.toLowerCase().includes('report') ? reportVal : `Report: ${reportVal}`) : "";
            metaHtml = `<div class="meta-badges-row">
                ${fText ? `<span class="meta-pill-fast"><i class="fas fa-utensils"></i> ${escapeHtml(fText)}</span>` : ''}
                ${rText ? `<span class="meta-pill-report"><i class="fas fa-clock"></i> ${escapeHtml(rText)}</span>` : ''}
            </div>`;
        }

        if (isPackageOrProfile) {
            let descPreviewHtml = "";
            let descRaw = String(service.description || '');
            if (descRaw.trim() !== "") {
                let items = descRaw.split(/<br\s*\/?>|\n/i).filter(i => i.trim() !== '');
                if (items.length > 0) {
                    let previewItems = items.slice(0, 2).map(i => formatText(i.trim()));
                    let moreText = service.number_of_test ? `+ ${service.number_of_test} Parameters` : (items.length > 2 ? "View All Details" : "");
                    descPreviewHtml = `<div class="desc-preview"><ul>${previewItems.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>${moreText ? `<div class="view-more-btn" onclick="openModal('${s_id}')">${escapeHtml(moreText)}</div>` : ''}</div>`;
                }
            }
            htmlContent += `<div class="profile-item"><div class="profile-header"><span class="profile-badge">${escapeHtml(cleanCat)}</span>${service.number_of_test ? `<span class="param-badge"><i class="fas fa-microscope"></i> ${escapeHtml(service.number_of_test)} Tests</span>` : ''}</div><div class="service-info"><h3>${escapeHtml(formatText(service.service_name))} ${infoIconHtml}</h3>${metaHtml}${descPreviewHtml}</div><div class="price-action-row"><div class="price-box">${pricingHtml}</div><div class="action-container">${actionBtnHtml}</div></div></div>`;
        } else {
            let catIcon = categoryConfig[sTypeLowerCase]?.icon || defaultIcon;
            htmlContent += `<div class="service-item"><div class="service-img-box">${catIcon}</div><div class="service-info-normal"><h3 style="font-size:14px; margin-bottom:2px;">${escapeHtml(formatText(service.service_name))} ${infoIconHtml}</h3>${metaHtml}<div class="price-box" style="margin-top:6px;">${pricingHtml}</div></div><div class="action-container">${actionBtnHtml}</div></div>`;
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
            qty: 1,
            service_type: type,
            labs: svcObj ? (svcObj.labs || "") : ""
        }); 
        showToast("Item added to cart!", "success");
    }
    
    localStorage.setItem('bhavyaCart', JSON.stringify(cart));
    updateCartUI(); 
    renderServices(document.getElementById("searchInput").value); 
}

function updateCartUI() {
    const topCartBtn = document.getElementById("topCartBtn"); 
    const cartBar = document.getElementById("bottomCartBar"); 
    const cartText = document.getElementById("bottomCartText");
    let totalItems = cart.reduce((sum, item) => sum + item.qty, 0); 
    let totalPrice = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    if(topCartBtn) topCartBtn.innerText = `🛒 Cart (${totalItems})`;
    if (totalItems > 0) {
        if(cartText) cartText.innerHTML = `${totalItems} Item${totalItems > 1 ? 's' : ''} <span style="color:#cbd5e1; margin:0 8px;">|</span> ₹${totalPrice}`;
        if(cartBar) cartBar.classList.add("visible");
    } else { if(cartBar) cartBar.classList.remove("visible"); }
    
    checkSurpriseBannerStatus();
}

function toggleView(view) {
    if (view === 'cart') {
        currentView = 'cart';
        handleBannerDisplay();
        
        document.getElementById('bookingView').style.display = 'none';
        document.getElementById('cartView').style.display = 'block';
        document.getElementById('topCartBtn').style.display = 'none';
        document.getElementById('navBackText').innerText = "Back to Tests";
        document.getElementById('pageMainTitle').innerText = "Checkout";
        window.scrollTo(0, 0);
        
        if (cart.length === 0) {
            document.getElementById('emptyCartDesign').style.display = 'block';
            document.getElementById('cartCheckoutProcess').style.display = 'none';
        } else {
            document.getElementById('emptyCartDesign').style.display = 'none';
            document.getElementById('cartCheckoutProcess').style.display = 'block';
            initCartPage();
        }
    } else {
        currentView = 'booking';
        handleBannerDisplay();
        
        document.getElementById('cartView').style.display = 'none';
        document.getElementById('bookingView').style.display = 'block';
        document.getElementById('topCartBtn').style.display = 'inline-block';
        document.getElementById('navBackText').innerText = "Home";
        document.getElementById('pageMainTitle').innerText = "Book Lab Tests & Packages";
        window.scrollTo(0, 0);
        updateCartUI();
    }
}

function openModal(serviceId) {
    const service = allServices.find(s => s.service_id === serviceId);
    if (!service) return;
    
    document.getElementById("modalTitle").innerText = formatText(service.service_name);
    let descRaw = String(service.description || '');
    let formattedDesc = "<p style='text-align:center;'>No details available.</p>";
    if (descRaw.trim() !== "") {
        let items = descRaw.split(/<br\s*\/?>|\n/i).filter(i => i.trim() !== '');
        formattedDesc = "<ul>" + items.map(i => `<li style="margin-bottom:6px; border-bottom:1px dashed #eee; padding-bottom:4px;">${escapeHtml(formatText(i.trim()))}</li>`).join('') + "</ul>";
        if (service.number_of_test) {
            formattedDesc = `<div style="background:#e0f2fe; color:#0284c7; padding:8px 12px; border-radius:8px; font-weight:bold; font-size:12px; margin-bottom:15px; display:inline-block;"><i class="fas fa-microscope"></i> Includes ${escapeHtml(service.number_of_test)} Parameters</div>` + formattedDesc;
        }
    }
    document.getElementById("modalBody").innerHTML = formattedDesc; 
    document.getElementById("infoModal").classList.add("active");
}

function closeModal() { document.getElementById("infoModal").classList.remove("active"); }

function openVipPromo() { 
    document.getElementById("vipPromoModal").classList.add("active"); 
    document.getElementById("vipPromoPincode").value = "";
    document.getElementById("vipPromoPincodeMsg").style.display = "none";
}
function closeVipPromo() { document.getElementById("vipPromoModal").classList.remove("active"); }

function openVipFormModal() {
    document.getElementById("vipFormModal").classList.add("active");
    const savedName = localStorage.getItem("bhavya_name") || "Self";
    document.getElementById("vipMem1").value = savedName;
    updateVipPayableUI();
}
function closeVipFormModal() { document.getElementById("vipFormModal").classList.remove("active"); }

function openSafeUpiLink(e) {
    const upiUrl = `upi://pay?pa=8950112467@ptsbi&pn=Bhavya%20Diagnostics&am=${currentVipAmount}&cu=INR&tn=VIP%20Membership`;
    const link = document.getElementById("upiPaymentBtn");
    if (link) link.href = upiUrl;
    if (navigator.clipboard) {
        navigator.clipboard.writeText("8950112467@ptsbi").catch(() => {});
    }
}

// ✨ LOGIN MODAL KE FUNCTIONS (100% Firebase) ✨
let loginConfirmationResult;
function openPatientLogin() {
    document.getElementById("login-section").classList.add("active");
    document.getElementById("phone-section").style.display = "block";
    document.getElementById("otp-section").style.display = "none";
    if (!window.loginRecaptchaVerifier) {
        window.loginRecaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { 'size': 'normal' });
        window.loginRecaptchaVerifier.render();
    }
}

function closeLoginPopup() {
    document.getElementById("login-section").classList.remove("active");
}

function sendOTP() {
    const mobile = document.getElementById("phoneNumber").value.trim();
    const name = document.getElementById("userName").value.trim();
    if (!name || mobile.length !== 10) return alert("Please enter a valid Name and 10-digit mobile number.");

    firebase.auth().signInWithPhoneNumber("+91" + mobile, window.loginRecaptchaVerifier)
    .then((result) => {
        loginConfirmationResult = result;
        document.getElementById("phone-section").style.display = "none";
        document.getElementById("otp-section").style.display = "block";
        showToast("OTP Sent!", "success");
    }).catch(() => {
        alert("Error sending OTP. Please check your number and try again.");
    });
}

function verifyOTP() {
    const otp = document.getElementById("otpCode").value.trim();
    if(otp.length !== 6) return alert("Enter valid 6-digit OTP");

    loginConfirmationResult.confirm(otp).then(async (result) => {
        let user = result.user;
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
                current_wallet_balance: 0,
                wallet_balance: 0,
                current_plan_status: "basic",
                plan: "basic",
                status: "active",
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            });

            await sendAutoEmail({
                type: "contact",
                to: "contact@bhavyadiagnostics.com",
                subject: `New Patient Registered: ${patientName} (${user.phoneNumber})`,
                html: `<p>New patient signed up on Bhavya Diagnostics:</p>
                       <ul>
                         <li><b>Name:</b> ${escapeHtml(patientName)}</li>
                         <li><b>Mobile:</b> ${escapeHtml(user.phoneNumber)}</li>
                         <li><b>User ID:</b> ${escapeHtml(customUserId)}</li>
                       </ul>`
            });
        }

        await syncFirebasePatientState();
        closeLoginPopup();
        showToast("Login Successful!", "success");
    }).catch(() => { alert("Invalid OTP."); });
}

// VIP Membership requires Login + Complete Patient Profile
async function handleVipActivationFlow() {
    await syncFirebasePatientState();
    const authUser = await getAuthUser();
    if (!authUser) {
        localStorage.setItem("pending_vip_redirect", "true");
        openPatientLogin();
        return;
    }

    if (!patientProfileComplete) {
        alert("VIP Membership lene ke liye pehle apni Patient Details (Email, City, Pincode aur Complete Address) fill karein.");
        if (cart.length === 0) {
            window.location.href = "../patient_dashboard/patient_dashboard.html";
        } else {
            toggleView('cart');
        }
        return;
    }

    openVipFormModal();
}

async function handleVipPromoClick() {
    const pincode = document.getElementById("vipPromoPincode").value.trim();
    const msg = document.getElementById("vipPromoPincodeMsg");
    const btn = document.getElementById("vipPromoCheckBtn");

    if(pincode.length !== 6) {
        msg.style.display = "block"; msg.style.color = "var(--danger)";
        msg.innerHTML = "Please enter a valid 6-digit pincode."; return;
    }

    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Checking...`; btn.disabled = true;

    try {
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: "checkVipPincode", pincode: pincode }) });
        const res = await response.json();

        if (res.status === "success") {
            msg.style.display = "block"; msg.style.color = "var(--success)";
            msg.innerHTML = "<i class='fas fa-check-circle'></i> Service Available! Proceeding...";
            
            setTimeout(async () => {
                closeVipPromo();
                btn.innerHTML = `<i class="fas fa-crown"></i> Activate Now`; btn.disabled = false;
                await handleVipActivationFlow();
            }, 600);
        } else {
            msg.style.display = "block"; msg.style.color = "var(--danger)";
            msg.innerHTML = `<i class='fas fa-times-circle'></i> ${escapeHtml(res.message || "VIP Plan is not available in this pincode yet.")}`;
            btn.innerHTML = `<i class="fas fa-crown"></i> Activate Now`; btn.disabled = false;
        }
    } catch(err) {
        msg.style.display = "block"; msg.style.color = "var(--danger)"; msg.innerHTML = "Network error.";
        btn.innerHTML = `<i class="fas fa-crown"></i> Activate Now`; btn.disabled = false;
    }
}

function updateVipPayableUI() {
    document.getElementById('vipFinalAmount').innerText = currentVipAmount;
    const upiUrl = `upi://pay?pa=8950112467@ptsbi&pn=Bhavya%20Diagnostics&am=${currentVipAmount}&cu=INR&tn=VIP%20Subscription`;
    document.getElementById("upiPaymentBtn").href = upiUrl;
}

async function applyVipPromo() {
    const code = document.getElementById("vipRefCode").value.trim().toUpperCase();
    const msg = document.getElementById("vipRefMsg");
    if (!code) { msg.style.display="block"; msg.style.color="var(--danger)"; msg.innerText="Enter code first!"; return; }
    
    try {
        if (db) {
            const snap = await db.collection("patients").where("referral_code", "==", code).limit(1).get();
            if (!snap.empty) {
                const refDoc = snap.docs[0];
                const authUser = await getAuthUser();
                if (authUser && refDoc.id === authUser.uid) {
                    msg.style.display="block"; msg.style.color="var(--danger)"; msg.innerHTML=`<i class="fas fa-times-circle"></i> Self referral not allowed.`;
                    return;
                }
                validReferrerId = refDoc.data().user_id || refDoc.id;
                currentVipAmount = baseVipPrice - vipDiscount;
                updateVipPayableUI();
                msg.style.display="block"; msg.style.color="var(--success)"; msg.innerHTML=`<i class="fas fa-check-circle"></i> ₹${vipDiscount} discount applied!`;
                return;
            }
        }

        const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "getVipRulesAndReferral", user_id: localStorage.getItem("bhavya_user_id"), referral_code: code }) });
        const data = await res.json();
        if (data.status === "success" && data.data.validReferral) {
            validReferrerId = data.data.referrer_id; 
            currentVipAmount = baseVipPrice - vipDiscount; 
            updateVipPayableUI();
            msg.style.display="block"; msg.style.color="var(--success)"; msg.innerHTML=`<i class="fas fa-check-circle"></i> ₹${vipDiscount} discount applied!`;
        } else {
            msg.style.display="block"; msg.style.color="var(--danger)"; msg.innerHTML=`<i class="fas fa-times-circle"></i> ${escapeHtml(data.message || "Invalid Code")}`;
            currentVipAmount = baseVipPrice; updateVipPayableUI();
        }
    } catch(err) { msg.style.display="block"; msg.style.color="var(--danger)"; msg.innerText="Error checking code."; }
}

function updateFileName() {
    const fileInput = document.getElementById('vipScreenshot');
    const btnText = document.getElementById('fileUploadBtnText');
    if (fileInput.files.length > 0) {
        btnText.innerHTML = `<i class="fas fa-check-circle" style="color:var(--success);"></i> ${escapeHtml(fileInput.files[0].name)}`;
        btnText.style.borderColor = "var(--success)"; btnText.style.background = "#f0fdf4";
    }
}

const screenInput = document.getElementById("vipScreenshot");
if (screenInput) {
    screenInput.addEventListener("change", function(e) {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(event) {
            const img = new Image(); img.src = event.target.result;
            img.onload = function() {
                const canvas = document.createElement("canvas");
                const scaleSize = 600 / img.width; 
                canvas.width = 600; canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                document.getElementById("vipScreenshotBase64").value = canvas.toDataURL("image/jpeg", 0.7);
            }
        }
    });
}

// VIP Membership Application -> 100% Firebase + Automatic Email
async function submitVipApplicationForm() {
    const txnId = document.getElementById('vipTxnId').value.trim();
    const screenshot = document.getElementById('vipScreenshotBase64').value;
    if(!screenshot) { alert("Please upload the payment screenshot. It is mandatory."); return; }

    const authUser = await getAuthUser();
    if (!db || !authUser) {
        alert("Please login first to apply for VIP Plan.");
        return;
    }

    const btn = document.getElementById('submitVipBtn');
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Submitting...`; btn.disabled = true;

    try {
        const patientDoc = await db.collection("patients").doc(authUser.uid).get();
        const pData = patientDoc.exists ? patientDoc.data() : {};
        const mem1 = document.getElementById("vipMem1").value.trim() || pData.name || "Self";
        const mem2 = document.getElementById("vipMem2").value.trim();
        const mem3 = document.getElementById("vipMem3").value.trim();
        const members = [mem1, mem2, mem3].filter(Boolean);

        const vipPayload = {
            current_plan_status: "pending",
            plan: "pending",
            isVip: false,
            vipMembers: members,
            vip_details: {
                member_1_name: mem1,
                member_2_name: mem2,
                member_3_name: mem3,
                referrer_user_id: validReferrerId,
                payment_mode: "online",
                payment_id: txnId,
                payment_screenshot: screenshot,
                amount_paid: currentVipAmount,
                vip_status: "pending",
                applied_at: new Date().toISOString()
            }
        };

        await savePatientToFirebase(vipPayload);

        await db.collection("vip_requests").doc(authUser.uid).set({
            uid: authUser.uid,
            user_id: pData.user_id || authUser.uid,
            patient_name: mem1,
            mobile: pData.mobile || authUser.phoneNumber || "",
            email: pData.email || "",
            members: members,
            referrer_user_id: validReferrerId,
            payment_id: txnId,
            payment_screenshot: screenshot,
            amount_paid: currentVipAmount,
            status: "pending",
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (pData.email && pData.email.includes("@")) {
            await sendAutoEmail({
                type: "contact",
                to: pData.email,
                subject: "VIP Membership Application Received - Bhavya Diagnostics",
                html: `<p>Dear <b>${escapeHtml(mem1)}</b>,</p>
                       <p>Your <b>Bhavya VIP Family Plan</b> application (Amount: ₹${currentVipAmount}) has been received and is under verification.</p>
                       <p>You can immediately start booking tests at VIP rates!</p>`
            });
        }

        await sendAutoEmail({
            type: "contact",
            to: "contact@bhavyadiagnostics.com",
            subject: `New VIP Membership Request: ${mem1} (₹${currentVipAmount})`,
            html: `<p>New VIP Membership application received:</p>
                   <ul>
                     <li><b>Applicant:</b> ${escapeHtml(mem1)}</li>
                     <li><b>Mobile:</b> ${escapeHtml(pData.mobile || authUser.phoneNumber || "")}</li>
                     <li><b>Family Members:</b> ${escapeHtml(members.join(", "))}</li>
                     <li><b>Amount Paid:</b> ₹${currentVipAmount}</li>
                     <li><b>UTR / Ref:</b> ${escapeHtml(txnId || "Screenshot Uploaded")}</li>
                   </ul>`
        });

        userPlanStatus = "pending"; 
        localStorage.setItem("bhavya_plan_cache", "pending"); 
        closeVipFormModal();
        handleBannerDisplay(); 
        renderServices();
        alert("🎉 VIP Application Submitted! Your plan is under review and VIP rates are unlocked.");
    } catch (err) {
        console.error("VIP submit error:", err);
        alert("Error submitting VIP application: " + err.message);
    } finally {
        btn.innerHTML = `Submit Application <i class="fas fa-arrow-right"></i>`; 
        btn.disabled = false;
    }
}

function claimVipPackage() {
    const vipPackageId = "VIP-FREE-001"; 
    const service = allServices.find(s => String(s.service_id) === vipPackageId);
    if (service) {
        updateQty(service.service_id, 1, 0, service.service_name, service.service_type);
        toggleView('cart');
    } else { alert("Loading... Please wait a second or contact Admin."); }
}

function handleHomeNavigation() {
    const userId = localStorage.getItem("bhavya_user_id") || localStorage.getItem("user_id");
    if (userId) { window.location.href = '../patient_dashboard/patient_dashboard.html'; } 
    else { window.location.href = '../index.html'; }
}

// =======================================================
// 🌟 CART & CHECKOUT PAGE LOGIC (100% Firebase + Column R Labs) 🌟
// =======================================================
function initCartPage() {
    let s2 = document.getElementById('step2-card');
    let step1Nav = document.getElementById('step1-nav');
    if(s2 && step1Nav && step1Nav.classList.contains('completed')) {
        s2.style.display = 'block';
    }

    calculateFinalBill(); 

    const userId = localStorage.getItem("bhavya_user_id") || localStorage.getItem("bhavya_uid");
    if (userId) { 
        fetchProfile(); 
    } else { 
        let loader = document.getElementById('loadingOverlay');
        if(loader) loader.style.display = 'none'; 
        let skel = document.getElementById('checkoutFormSkeleton');
        let form = document.getElementById('actualCheckoutForm');
        if(skel) skel.style.display = 'none';
        if(form) form.style.display = 'block';
    }
}

async function fetchProfile() {
    let skel = document.getElementById('checkoutFormSkeleton');
    let form = document.getElementById('actualCheckoutForm');
    if(skel) skel.style.display = 'block';
    if(form) form.style.display = 'none';

    if (db) {
        try {
            const authUser = await getAuthUser();
            if (authUser) {
                const doc = await db.collection("patients").doc(authUser.uid).get();
                if (doc.exists) {
                    const data = doc.data();
                    bookingData.mobile = String(data.mobile || data.mobile_number || "").replace(/^\+91/, '');
                    bookingData.email = data.email || "";
                    const planStr = String(data.current_plan_status || data.plan || "basic").toLowerCase();
                    bookingData.isVip = (planStr === "vip" || planStr === "pending" || data.isVip === true);
                    welcomeEmailAlreadySent = !!data.welcome_email_sent;

                    let uMob = document.getElementById('uMobile');
                    if (uMob && bookingData.mobile) {
                        uMob.value = bookingData.mobile;
                        uMob.setAttribute("readonly", true);
                    }
                    let uEmail = document.getElementById('uEmail');
                    if (uEmail && data.email) uEmail.value = data.email;

                    let uPin = document.getElementById('uPincode');
                    if (uPin && data.pincode) uPin.value = data.pincode;

                    let uAddr = document.getElementById('uAddress');
                    if (uAddr && data.address) uAddr.value = data.address;

                    let uCity = document.getElementById('uCity');
                    if (uCity && (data.city || data.city_village)) uCity.value = data.city || data.city_village;

                    const nameBox = document.getElementById('nameInputBox');
                    if (nameBox) {
                        if (bookingData.isVip && Array.isArray(data.vipMembers) && data.vipMembers.length > 0) {
                            let badge = document.getElementById('vipBadge');
                            if(badge) badge.innerHTML = '<span style="background:var(--warning); color:white; font-size:10px; padding:4px 8px; border-radius:12px; margin-left: 10px;"><i class="fas fa-crown"></i> VIP Active</span>';
                            let opts = data.vipMembers.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
                            nameBox.innerHTML = `<select id="uName" class="form-input">${opts}</select>`;
                        } else {
                            nameBox.innerHTML = `<input type="text" id="uName" class="form-input" value="${escapeHtml(data.name || data.patient_name || '')}" placeholder="Patient Name">`;
                        }
                    }

                    userWalletBalance = Number(data.current_wallet_balance ?? data.wallet_balance ?? 0);
                    let walletTxt = document.getElementById('walletBalTxt');
                    if (walletTxt) walletTxt.innerText = userWalletBalance;
                    calculateFinalBill();
                }
            }
        } catch (fbErr) {
            console.error("Firebase profile load error:", fbErr);
        }
    }

    let loader = document.getElementById('loadingOverlay');
    if (loader) loader.style.display = 'none';
    if (skel) skel.style.display = 'none';
    if (form) form.style.display = 'block';
}

async function savePatientInfo() {
    const name = document.getElementById('uName').value.trim();
    const mobile = document.getElementById('uMobile').value.trim();
    const emailEl = document.getElementById('uEmail');
    const email = emailEl ? emailEl.value.trim().toLowerCase() : "";
    const city = document.getElementById('uCity').value.trim();
    const pin = document.getElementById('uPincode').value.trim();
    const addr = document.getElementById('uAddress').value.trim();
    const consentEl = document.getElementById('consentCheckbox');

    if (consentEl && !consentEl.checked) {
        return alert("Please accept the Privacy Policy & Terms consent checkbox to continue.");
    }
    if (!name || !city || pin.length < 6 || mobile.length < 10 || !addr) {
        return alert("Please enter valid Name, 10-digit Mobile, City, 6-digit Pincode, and Complete Address.");
    }

    bookingData.name = name;
    bookingData.mobile = mobile;
    bookingData.email = email;
    bookingData.city = city.toLowerCase();
    bookingData.pincode = pin;
    bookingData.address = addr;
    patientProfileComplete = true;

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

    // First-time email -> Welcome Email from contact@bhavyadiagnostics.com
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

    cart.forEach(item => {
        let type = (item.service_type || "pathology").toLowerCase().trim();
        if(!item.fulfillment) item.fulfillment = homeServiceCategories.includes(type) ? "home" : "center";
    });

    document.getElementById('step1-nav').classList.add('completed');
    document.getElementById('step2-nav').classList.add('active');
    document.getElementById('sumName').innerText = bookingData.name;
    document.getElementById('sumMobile').innerText = "+91 " + bookingData.mobile;
    const sumEmailEl = document.getElementById('sumEmail');
    if (sumEmailEl) sumEmailEl.innerText = bookingData.email ? bookingData.email : "";
    document.getElementById('sumCityPin').innerText = `${city.toUpperCase()} - ${pin}`;
    document.getElementById('sumAddress').innerText = bookingData.address;
    document.getElementById('infoForm').style.display = 'none';
    document.getElementById('infoSummary').style.display = 'block';
    
    const s2 = document.getElementById('step2-card');
    s2.style.display = 'block'; s2.style.opacity = '1'; s2.style.pointerEvents = 'auto';
    
    autoAssignGroupLabs();
    renderGroupedCart();
}

function editPatientInfo() {
    document.getElementById('infoForm').style.display = 'block';
    document.getElementById('infoSummary').style.display = 'none';
    const s2 = document.getElementById('step2-card');
    s2.style.opacity = '0.5'; s2.style.pointerEvents = 'none';
    validateCheckout();
}

function autoAssignGroupLabs() {
    let assignedLabs = {}; 
    cart.forEach(item => {
        if (item.service_id === "VIP-FREE-001") {
            item.selected_lab_id = "BHAVYACARE-INTERNAL";
            item.selected_lab_name = "Bhavya Diagnostics Nodal Center";
            item.fulfillment = "home"; 
            return;
        }

        if (item.service_type === "surprise_package" || String(item.service_id).startsWith("SURP-")) {
            item.selected_lab_id = "BHAVYACARE-INTERNAL";
            item.selected_lab_name = "Bhavya Diagnostics Nodal Center";
            item.fulfillment = "center";
            return;
        }

        let type = (item.service_type || "pathology").toLowerCase().trim();
        let eligibleLabs = getLabsForService(item);

        if (eligibleLabs.length > 0) {
            if (!assignedLabs[type]) {
                let existingValidLab = eligibleLabs.find(l => l.lab_id === item.selected_lab_id);
                assignedLabs[type] = existingValidLab ? existingValidLab : eligibleLabs[0];
            }
            item.selected_lab_id = assignedLabs[type].lab_id;
            item.selected_lab_name = assignedLabs[type].raw_label;
        } else {
            item.selected_lab_id = "BHAVYA_DIAGNOSTICS";
            item.selected_lab_name = "Bhavya Diagnostics (NABL)";
        }
    });
    localStorage.setItem('bhavyaCart', JSON.stringify(cart));
}

function renderGroupedCart() {
    let html = ""; 
    let groupedCart = {};

    cart.forEach((item, index) => {
        let type = (item.service_type || "pathology").toLowerCase().trim();
        if (item.service_id === "VIP-FREE-001") { type = "vip sponsored"; }
        else if (type === "surprise_package" || String(item.service_id).startsWith("SURP-")) { type = "surprise package"; }

        if(!groupedCart[type]) {
            groupedCart[type] = {
                items: [],
                fulfillment: item.fulfillment || (homeServiceCategories.includes(type) || type === "vip sponsored" ? "home" : "center"),
                selected_lab_id: (item.service_id === "VIP-FREE-001" || type === "surprise package") ? "BHAVYACARE-INTERNAL" : item.selected_lab_id
            };
        }
        groupedCart[type].items.push({ ...item, originalIndex: index });
    });

    for (const [type, group] of Object.entries(groupedCart)) {
        let isVipGroup = type === "vip sponsored";
        let isSurpriseGroup = type === "surprise package";
        
        let groupTitle = "";
        if (isVipGroup) groupTitle = '<i class="fas fa-gift" style="color:var(--warning);"></i> VIP Package';
        else if (isSurpriseGroup) groupTitle = '<i class="fas fa-magic" style="color:#d946ef;"></i> Surprise Package';
        else groupTitle = `<i class="fas fa-notes-medical"></i> ${escapeHtml(formatText(type))} Booking`;

        html += `<div class="group-container">
                    <div class="group-header">${groupTitle}</div>`;

        group.items.forEach(item => {
            let itemPrice = Number(item.price || item.service_price || item.basic_price || 0);
            html += `
                <div class="cart-item-header" style="margin-bottom: 12px;">
                    <div class="item-title-box">
                        <strong style="font-size:14px; color: var(--text-main);">${escapeHtml(item.service_name)} <span style="color:var(--text-muted); font-size:12px;">(x${item.qty || 1})</span></strong>
                    </div>
                    <div class="price-box" style="display:flex; flex-direction:row; align-items:center;">
                        <strong style="color:var(--success); font-size: 15px;">₹${itemPrice * (item.qty || 1)}</strong>
                        <button class="btn-remove-item" onclick="removeCartItem(${item.originalIndex})" title="Remove"><i class="fas fa-times"></i></button>
                    </div>
                </div>`;
        });

        if (isVipGroup || isSurpriseGroup) {
            let badgeTxt = isVipGroup ? "SPONSORED" : "SURPRISE";
            let infoTxt = isVipGroup ? "<i class='fas fa-check-circle' style='color:var(--success);'></i> Free Home Collection Included" : "<i class='fas fa-exclamation-circle' style='color:#b45309;'></i> Processed by Bhavya Diagnostics Nodal Center.";
            let themeColor = isVipGroup ? "var(--primary)" : "#d946ef";
            let themeBg = isVipGroup ? "var(--primary-soft)" : "#fdf4ff";
            let themeBorder = isVipGroup ? "#bfdbfe" : "#f0abfc";

            html += `
            <div style="background: ${themeBg}; border: 1px solid ${themeBorder}; border-radius: 12px; padding: 15px; margin-top: 15px;">
                <p style="font-size:12px; font-weight:800; color:${themeColor}; margin: 0 0 10px 0; text-transform:uppercase;"><i class="fas fa-star" style="color:var(--warning);"></i> Handled Internally</p>
                <div class="lab-card selected" style="border-color: ${themeColor}; background: #ffffff; margin-bottom: 0; cursor: default;">
                    <div class="lab-icon-box" style="background: ${themeColor}; color: white;">
                        <i class="fas fa-heartbeat"></i>
                    </div>
                    <div class="lab-info">
                        <h4 class="lab-name" style="color: ${themeColor};">Bhavya Diagnostics Nodal Center <span class="badge-small" style="background:var(--warning); color:white;">${badgeTxt}</span></h4>
                        <p class="lab-addr">${infoTxt}</p>
                    </div>
                </div>
            </div></div>`;
            continue;
        }

        let isHomeEligible = homeServiceCategories.includes(type);
        let isHome = group.fulfillment === "home";

        if(isHomeEligible) {
            html += `
                <div class="service-toggle-box" style="margin-bottom:15px;">
                    <button class="toggle-btn ${isHome ? 'active' : ''}" onclick="changeGroupFulfill('${type.replace(/'/g, "\\'")}', 'home')"><i class="fas fa-home"></i> Home Collection</button>
                    <button class="toggle-btn ${!isHome ? 'active' : ''}" onclick="changeGroupFulfill('${type.replace(/'/g, "\\'")}', 'center')"><i class="fas fa-hospital"></i> Center Visit</button>
                </div>`;
        } else {
            html += `<div class="center-only-badge"><i class="fas fa-info-circle"></i> Center Visit Required</div>`;
        }

        const labMap = new Map();
        group.items.forEach(item => {
            getLabsForService(item).forEach(l => {
                if (!labMap.has(l.lab_id)) labMap.set(l.lab_id, l);
            });
        });
        const displayLabs = Array.from(labMap.values());

        html += `<p style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:8px;">Select Processing Lab (Timings: 7:00 AM – 8:00 PM):</p>`;
        
        displayLabs.forEach(lab => {
            let isSelected = String(lab.lab_id) === String(group.selected_lab_id) ? "selected" : "";
            let badgesHtml = lab.tags.map(tag => {
                let extraClass = "";
                if (tag === "NABL" || tag === "NABH") extraClass = "badge-nabl";
                else if (tag === "URGENT") extraClass = "badge-urgent";
                return `<span class="badge-small ${extraClass}">${escapeHtml(tag)}</span>`;
            }).join(" ");

            html += `
                <div class="lab-card ${isSelected}" onclick="assignLabToGroup('${type.replace(/'/g, "\\'")}', '${lab.lab_id}', '${lab.raw_label.replace(/'/g, "\\'")}')">
                    <div class="lab-icon-box"><i class="fas fa-flask"></i></div>
                    <div class="lab-info">
                        <h4 class="lab-name">${escapeHtml(lab.lab_name)} ${badgesHtml}</h4>
                        <p class="lab-addr"><i class="far fa-clock"></i> Open Daily: 07:00 AM – 08:00 PM</p>
                    </div>
                    ${isSelected ? '<i class="fas fa-check-circle" style="color:var(--success); font-size:18px;"></i>' : ''}
                </div>`;
        });
        
        html += `</div>`; 
    }
    
    document.getElementById('cartItemsContainer').innerHTML = html;
    
    renderCrossSell();
    renderLabTimeSelectors();
    calculateFinalBill(); 
}

function changeGroupFulfill(type, fulfillment) {
    cart.forEach(item => {
        if ((item.service_type || "pathology").toLowerCase().trim() === type) item.fulfillment = fulfillment;
    });
    autoAssignGroupLabs(); 
    renderGroupedCart(); 
}

function assignLabToGroup(type, labId, rawLabel) {
    cart.forEach(item => {
        if ((item.service_type || "pathology").toLowerCase().trim() === type) {
            item.selected_lab_id = String(labId);
            item.selected_lab_name = rawLabel || labId;
        }
    });
    localStorage.setItem('bhavyaCart', JSON.stringify(cart)); 
    renderGroupedCart(); 
}

function removeCartItem(originalIndex) {
    if(confirm("Remove this item from your cart?")) {
        cart.splice(originalIndex, 1);
        localStorage.setItem('bhavyaCart', JSON.stringify(cart));
        if(cart.length === 0) {
            toggleView('booking');
        } else { 
            autoAssignGroupLabs(); 
            renderGroupedCart(); 
        }
    }
}

function parseTime(t) {
    if(!t) return null;
    let match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if(!match) return null;
    let h = parseInt(match[1]); let m = parseInt(match[2]); let ampm = match[3].toUpperCase();
    if(ampm === "PM" && h < 12) h += 12;
    if(ampm === "AM" && h === 12) h = 0;
    return h * 60 + m; 
}

function formatTime(mins) {
    let h = Math.floor(mins / 60); let m = mins % 60; let ampm = h >= 12 ? "PM" : "AM";
    let h12 = h % 12; if(h12 === 0) h12 = 12;
    return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function renderLabTimeSelectors() {
    let container = document.getElementById('labTimesContainer');
    if(!container) return;

    let uniqueLabIds = [...new Set(cart.map(c => c.selected_lab_id).filter(Boolean))];
    if(uniqueLabIds.length === 0) { 
        container.innerHTML = ''; 
        validateCheckout();
        return; 
    }

    let todayStr = new Date().toISOString().split('T')[0];
    let html = `<h3 style="font-size:15px; font-weight:800; margin-bottom:15px; color:var(--text-main);">Select Appointment Date &amp; Time</h3>`;

    let hasNormalLab = uniqueLabIds.some(id => id !== "BHAVYACARE-INTERNAL");

    uniqueLabIds.forEach(labId => {
        if (labId === "BHAVYACARE-INTERNAL" && hasNormalLab) {
            if(!labSlots[labId]) labSlots[labId] = { date: "", time: "" };
            return;
        }

        const sampleItem = cart.find(c => c.selected_lab_id === labId);
        let labName = (sampleItem && sampleItem.selected_lab_name) ? sampleItem.selected_lab_name : "Selected Lab";
        if (labId === "BHAVYACARE-INTERNAL") labName = "Bhavya Diagnostics Nodal Center";
        
        let fulfills = cart.filter(c => c.selected_lab_id === labId).map(c => c.fulfillment);
        let fText = fulfills.includes("home") ? "Home Collection" : "Center Visit";

        if(!labSlots[labId]) labSlots[labId] = { date: "", time: "", lab_name: labName };
        labSlots[labId].lab_name = labName;
        let savedDate = labSlots[labId].date;

        html += `
        <div style="background: var(--primary-soft); border: 1px solid #bfdbfe; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
            <strong style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:12px; color:var(--primary); gap:8px;">
                <span><i class="far fa-clock"></i> ${escapeHtml(labName)}</span>
                <span style="font-size:11px; background:#dbeafe; padding:2px 8px; border-radius:6px; color:var(--text-main); font-weight:800; white-space:nowrap;">${fText}</span>
            </strong>
            <input type="date" class="form-input" min="${todayStr}" value="${savedDate}" onchange="updateLabDate('${labId}', this.value)" style="margin-bottom:10px; background:white; padding:10px;">
            <div class="slot-grid" id="slots-${labId}"></div>
        </div>`;
    });

    container.innerHTML = html;

    uniqueLabIds.forEach(labId => {
        if(labSlots[labId].date) {
            updateLabDate(labId, labSlots[labId].date, true);
        }
    });

    validateCheckout();
}

// Fixed Lab Timings: 07:00 AM to 08:00 PM for ALL Labs
function updateLabDate(labId, dateStr, isRenderCall = false) {
    labSlots[labId].date = dateStr;
    if(!isRenderCall) labSlots[labId].time = ""; 
    
    if (labId !== "BHAVYACARE-INTERNAL" && labSlots["BHAVYACARE-INTERNAL"]) {
        labSlots["BHAVYACARE-INTERNAL"].date = dateStr;
        if(!isRenderCall) labSlots["BHAVYACARE-INTERNAL"].time = "";
    }

    let container = document.getElementById(`slots-${labId}`);
    if(!container || !dateStr) return;

    container.style.maxHeight = "500px";
    container.style.opacity = "1";
    const label = document.getElementById(`selected-time-label-${labId}`);
    if(label) label.remove();

    let dateObj = new Date(dateStr);
    let o = parseTime("07:00 AM");
    let c = parseTime("08:00 PM");
    
    let now = new Date();
    let isToday = (dateObj.toDateString() === now.toDateString());
    let currentMins = (now.getHours() * 60) + now.getMinutes();
    
    let planCache = localStorage.getItem("bhavya_plan_cache") || "basic";
    let hasVipPackageInCart = cart.some(item => item.service_id === "VIP-FREE-001");
    let bufferMins = (planCache === "pending" || hasVipPackageInCart) ? 120 : 30;
    
    let html = "";
    let slotsAdded = 0;
    for(let t = o; t <= c - 30; t += 30) {
        if (isToday && t < (currentMins + bufferMins)) { continue; }
        let slotStr = formatTime(t);
        let sel = labSlots[labId].time === slotStr ? "selected" : "";
        html += `<button class="slot-btn ${sel}" onclick="selectLabTime('${labId}', '${slotStr}')">${slotStr}</button>`;
        slotsAdded++;
    }
    
    if (slotsAdded === 0) {
        html = `<p style="color:var(--danger); font-size:12px; font-weight:700; grid-column:1/-1;">No more slots available for today (7:00 AM – 8:00 PM). Please select tomorrow.</p>`;
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
        if (btn.innerText === timeStr) { btn.classList.add('selected'); } 
        else { btn.classList.remove('selected'); }
    });

    const slotGrid = document.getElementById(`slots-${labId}`);
    if (slotGrid) {
        setTimeout(() => {
            slotGrid.style.maxHeight = "0px";
            slotGrid.style.overflow = "hidden";
            slotGrid.style.opacity = "0";
            slotGrid.style.transition = "all 0.4s ease";
            
            const timeLabel = document.createElement('div');
            timeLabel.id = `selected-time-label-${labId}`;
            timeLabel.innerHTML = `<span style="font-size:12px; color:var(--success); font-weight:700;"><i class="fas fa-check"></i> Selected: ${escapeHtml(timeStr)}</span>`;
            
            const oldLabel = document.getElementById(`selected-time-label-${labId}`);
            if(oldLabel) oldLabel.remove();
            slotGrid.parentNode.insertBefore(timeLabel, slotGrid);
        }, 300);
    }

    validateCheckout();
}

// =======================================================
// REFERRAL CODE VERIFICATION (Firebase First + Sheet Fallback)
// =======================================================
async function applyReferral() {
    let code = document.getElementById('refCodeInput').value.trim().toUpperCase();
    let msg = document.getElementById('refMessage');
    let btn = document.getElementById('applyRefBtn');
    
    if(!code) { msg.innerText = "Enter code!"; msg.style.color = "var(--danger)"; return; }
    
    let allowedTypesStr = appRules.referral_applicable_services_type || "pathology, profile, package, ct, mri";
    let allowedTypes = allowedTypesStr.toLowerCase().split(',').map(s => s.trim());

    let hasEligibleService = false;
    let eligibleSubtotal = 0;

    cart.forEach(item => {
        let type = (item.service_type || "pathology").toLowerCase().trim();
        if (allowedTypes.includes(type) || allowedTypes.includes("all")) {
            hasEligibleService = true;
            eligibleSubtotal += (Number(item.price || item.basic_price || item.service_price || 0) * Number(item.qty || 1));
        }
    });

    if (!hasEligibleService) {
        msg.innerText = `Referral only valid on: ${allowedTypesStr.toUpperCase()}`;
        msg.style.color = "var(--danger)"; return;
    }

    let minOrder = Number(appRules.min_order_for_referral || 300);
    if(eligibleSubtotal < minOrder) {
        msg.innerText = `Minimum eligible order ₹${minOrder} required.`;
        msg.style.color = "var(--danger)"; return;
    }

    const myCustomId = (localStorage.getItem("bhavya_user_id") || "").toUpperCase();
    const allowSelf = String(appRules.allow_self_referral || "FALSE").toUpperCase() === "TRUE";
    if (!allowSelf && myCustomId && code === myCustomId) {
        msg.innerHTML = `<i class="fas fa-times-circle"></i> You cannot use your own referral code.`;
        msg.style.color = "var(--danger)";
        return;
    }

    btn.innerText = "Wait..."; btn.disabled = true;

    try {
        // 1. Check Firebase 'patients' collection first
        if (db) {
            const snap = await db.collection("patients").where("referral_code", "==", code).limit(1).get();
            if (!snap.empty) {
                const refDoc = snap.docs[0];
                const authUser = await getAuthUser();
                if (!allowSelf && authUser && refDoc.id === authUser.uid) {
                    btn.innerText = "Apply"; btn.disabled = false;
                    msg.innerHTML = `<i class="fas fa-times-circle"></i> You cannot use your own referral code.`;
                    msg.style.color = "var(--danger)";
                    return;
                }

                validReferrerUid = refDoc.id;
                finalBill.refCode = code;
                finalBill.refDiscount = Number(appRules.referral_bonus || 50);
                btn.innerText = "Apply"; btn.disabled = false;
                msg.innerHTML = `<i class="fas fa-check-circle"></i> Code applied! ₹${finalBill.refDiscount} off.`;
                msg.style.color = "var(--success)";
                calculateFinalBill();
                return;
            }
        }

        // 2. Fallback to Google Sheet legacy referral codes
        const userId = localStorage.getItem("bhavya_user_id") || "GUEST"; 
        const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "verifyReferralCode", user_id: userId, referral_code: code }) });
        const data = await res.json();
        btn.innerText = "Apply"; btn.disabled = false;
        if(data.status === "success") {
            validReferrerUid = "";
            finalBill.refCode = code;
            finalBill.refDiscount = Number(appRules.referral_bonus || 50); 
            msg.innerHTML = `<i class="fas fa-check-circle"></i> Code applied! ₹${finalBill.refDiscount} off.`;
            msg.style.color = "var(--success)";
            calculateFinalBill();
        } else {
            validReferrerUid = "";
            finalBill.refCode = ""; finalBill.refDiscount = 0;
            msg.innerHTML = `<i class="fas fa-times-circle"></i> ${escapeHtml(data.message || "Invalid Referral Code")}`;
            msg.style.color = "var(--danger)";
            calculateFinalBill();
        }
    } catch (e) {
        btn.innerText = "Apply"; btn.disabled = false;
        msg.innerText = "Error checking code.";
        msg.style.color = "var(--danger)";
    }
}

function calculateFinalBill() {
    let subtotal = 0;
    let eligibleSubtotal = 0; 
    let isHomeCollection = false;
    let hasVipPackage = false; 
    
    let allowedTypesStr = appRules.wallet_applicable_services_type || appRules.referral_applicable_services_type || "pathology, profile, package, ct, mri";
    let allowedTypes = allowedTypesStr.toLowerCase().split(',').map(s => s.trim());

    cart.forEach(item => {
        if (item.service_id === "VIP-FREE-001") hasVipPackage = true;

        let itemPrice = (Number(item.price || item.basic_price || item.service_price || 0) * Number(item.qty || 1));
        subtotal += itemPrice;

        let type = (item.service_type || "pathology").toLowerCase().trim();
        if (allowedTypes.includes(type) || allowedTypes.includes("all")) {
            eligibleSubtotal += itemPrice;
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
    let walletCb = document.getElementById('useWalletCb');
    if (walletCb && walletCb.checked) {
        if (eligibleSubtotal === 0) {
            walletCb.checked = false; 
            alert(`Wallet can only be used on: ${allowedTypesStr.toUpperCase()}`);
        } else {
            let maxAllowed = bookingData.isVip ? Number(appRules.vip_max_wallet_use || 200) : Number(appRules.basic_max_wallet_use || 50);
            walletUsed = Math.min(userWalletBalance, maxAllowed, eligibleSubtotal); 
        }
    }

    let actualRefDiscount = finalBill.refDiscount;
    if(actualRefDiscount > 0 && (eligibleSubtotal - walletUsed) < actualRefDiscount) {
        actualRefDiscount = Math.max(0, eligibleSubtotal - walletUsed);
    }

    let totalDiscount = walletUsed + actualRefDiscount;
    let totalPayable = subtotal + collectionCharge - totalDiscount;
    if (totalPayable < 0) totalPayable = 0;

    finalBill.subtotal = subtotal;
    finalBill.collectionCharge = collectionCharge;
    finalBill.walletUsed = walletUsed;
    finalBill.totalPayable = totalPayable;

    let tAmt = document.getElementById('totalAmt'); if(tAmt) tAmt.innerText = totalPayable;
    let sumTotal = document.getElementById('summaryTotalAmt'); if(sumTotal) sumTotal.innerText = totalPayable;
    let sumCount = document.getElementById('summaryItemCount'); if(sumCount) sumCount.innerText = cart.length;
    
    let chargeUI = document.getElementById('summaryChargeTxt'); 
    if (chargeUI) {
        if (collectionCharge === 0) chargeUI.innerHTML = `<span style="color:var(--success); background:var(--success-soft); padding:2px 8px; border-radius:6px;">FREE</span>`;
        else { chargeUI.innerText = `₹${collectionCharge}`; chargeUI.style.color = "var(--text-main)"; chargeUI.style.background = "transparent"; }
    }

    // 🌟 VIP SMART UPSELL LOGIC 🌟
    let upsellBanner = document.getElementById("vipUpsellCartBanner"); 
    if (userPlanStatus !== "vip" && userPlanStatus !== "pending" && !hasVipPackage && upsellBanner) {
        let potentialVipSavings = 0;
        cart.forEach(item => {
            let service = allServices.find(s => s.service_id === item.service_id);
            if(service) potentialVipSavings += (Number(service.basic_price) - Number(service.vip_price)) * item.qty;
        });

        if (potentialVipSavings > 500) {
            upsellBanner.innerHTML = `<div style="background:linear-gradient(135deg, #1e293b, #0f172a); color:white; padding:15px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; box-shadow:0 4px 15px rgba(0,0,0,0.1);">
                <div><h4 style="margin:0; color:#f59e0b; font-size:14px;"><i class="fas fa-crown"></i> Add VIP Plan</h4><p style="margin:2px 0 0; font-size:12px; color:#cbd5e1;">Get VIP Plan for ₹${baseVipPrice} &amp; save ₹${potentialVipSavings}!</p></div>
                <button onclick="openVipPromo()" style="background:#f59e0b; color:#1e293b; font-weight:800; border:none; padding:8px 12px; border-radius:8px; cursor:pointer;">Explore</button>
            </div>`;
            upsellBanner.style.display = "block";
        } else {
            upsellBanner.style.display = "none";
        }
    }
}

// 🌟 FREQUENTLY ADDED TOGETHER (CROSS-SELL) 🌟
function renderCrossSell() {
    let crossSellDiv = document.getElementById("crossSellContainer");
    if(!crossSellDiv) return;

    let inCartNames = cart.map(c => c.service_name.toLowerCase());
    const crossSellRules = [
        { trigger: "thyroid", suggest: "vitamin d" },
        { trigger: "lipid", suggest: "hba1c" },
        { trigger: "sugar", suggest: "kidney" }
    ];

    let suggestedItem = null;
    for (let rule of crossSellRules) {
        let hasTrigger = inCartNames.some(name => name.includes(rule.trigger));
        let alreadyHasSuggest = inCartNames.some(name => name.includes(rule.suggest));
        if (hasTrigger && !alreadyHasSuggest) {
            suggestedItem = allServices.find(s => s.service_name.toLowerCase().includes(rule.suggest) && s.service_id !== "VIP-FREE-001");
            if (suggestedItem) break; 
        }
    }

    if (suggestedItem) {
        let priceToUse = (userPlanStatus === "vip" || userPlanStatus === "pending") ? suggestedItem.vip_price : suggestedItem.basic_price;
        let cName = formatText(suggestedItem.service_name).replace(/'/g, "\\'");
        
        crossSellDiv.innerHTML = `
        <div style="background:#fdf8f6; border:1px dashed #f97316; padding:15px; border-radius:12px;">
            <p style="margin:0 0 8px 0; font-size:12px; color:#c2410c; font-weight:800; text-transform:uppercase;"><i class="fas fa-magic"></i> Frequently Added Together</p>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h4 style="margin:0; font-size:14px; color:var(--text-main);">${escapeHtml(formatText(suggestedItem.service_name))}</h4>
                    <p style="margin:2px 0 0; font-size:12px; color:var(--success); font-weight:bold;">Just +₹${priceToUse}</p>
                </div>
                <button onclick="updateQty('${suggestedItem.service_id}', 1, ${priceToUse}, '${cName}', '${suggestedItem.service_type}')" style="background:var(--primary); color:white; border:none; padding:8px 15px; border-radius:8px; font-weight:bold; cursor:pointer;">Add</button>
            </div>
        </div>`;
        crossSellDiv.style.display = "block";
    } else {
        crossSellDiv.style.display = "none";
    }
}

function validateCheckout() {
    const btn = document.getElementById('confirmBtn');
    const btnProceed = document.getElementById('btnProceedCheckout'); 
    if(!btn) return;
    
    if (cart.length === 0) { btn.disabled = true; if(btnProceed) btnProceed.style.display = 'none'; return; }
    
    let uniqueLabIds = [...new Set(cart.map(c => c.selected_lab_id).filter(Boolean))];
    let allLabsAssigned = cart.every(item => item.selected_lab_id);
    let allTimesSelected = uniqueLabIds.every(id => labSlots[id] && labSlots[id].date && labSlots[id].time);

    const s3 = document.getElementById('step3-card');

    if(allLabsAssigned && allTimesSelected) {
        if(btnProceed) btnProceed.style.display = 'block';
        calculateFinalBill(); 
        btn.disabled = false;
    } else {
        if(btnProceed) btnProceed.style.display = 'none';
        if(s3) { s3.style.display = 'none'; s3.style.opacity = '0.5'; s3.style.pointerEvents = 'none'; }
        btn.disabled = true;
        let step3Nav = document.getElementById('step3-nav');
        if(step3Nav) step3Nav.classList.remove('active');
    }
}

function goToStep3() {
    document.getElementById('cartItemsContainer').style.display = 'none';
    document.getElementById('labTimesContainer').style.display = 'none';
    document.getElementById('btnProceedCheckout').style.display = 'none';
    document.getElementById('crossSellContainer').style.display = 'none';
    
    let summaryDiv = document.getElementById('servicesSummary');
    if(summaryDiv) {
        summaryDiv.style.display = 'block';
        document.getElementById('sumTotalTests').innerText = `${cart.length} Tests / Packages Selected`;
    }

    document.getElementById('step2-nav').classList.add('completed');
    document.getElementById('step3-nav').classList.add('active');

    const s3 = document.getElementById('step3-card');
    if(s3) { 
        s3.style.display = 'block'; 
        s3.style.opacity = '1'; 
        s3.style.pointerEvents = 'auto'; 
        s3.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
}

function editServicesInfo() {
    document.getElementById('servicesSummary').style.display = 'none';
    document.getElementById('cartItemsContainer').style.display = 'block';
    document.getElementById('labTimesContainer').style.display = 'block';
    document.getElementById('btnProceedCheckout').style.display = 'block';
    document.getElementById('crossSellContainer').style.display = 'block'; 

    document.getElementById('step2-nav').classList.remove('completed');
    document.getElementById('step3-nav').classList.remove('active');

    const s3 = document.getElementById('step3-card');
    if(s3) { 
        s3.style.display = 'none'; 
        s3.style.opacity = '0.5'; 
        s3.style.pointerEvents = 'none'; 
    }
}

async function finalizeBooking() {
    const authUser = await getAuthUser();
    
    if (!authUser) {
        document.getElementById("displayOtpMobile").innerText = "+91 " + bookingData.mobile;
        document.getElementById("cartOtpModal").classList.add('active');
        
        if (!window.cartRecaptchaVerifier) {
            window.cartRecaptchaVerifier = new firebase.auth.RecaptchaVerifier('cart-recaptcha-container', { 'size': 'normal' });
            window.cartRecaptchaVerifier.render();
        }

        firebase.auth().signInWithPhoneNumber("+91" + bookingData.mobile, window.cartRecaptchaVerifier)
            .then((result) => {
                cartConfirmationResult = result;
                document.getElementById("cart-recaptcha-container").style.display = "none";
                document.getElementById("cartOtpInputSection").style.display = "block";
            }).catch(() => {
                alert("Error sending OTP. Please check your mobile number.");
                document.getElementById("cartOtpModal").classList.remove('active');
            });
    } else {
        processOrderSubmission(authUser.uid);
    }
}

function verifyCartOTP() {
    const otp = document.getElementById('cartOtpCode').value.trim();
    if(otp.length !== 6) return alert("Please enter valid 6-digit OTP");

    const btn = document.getElementById('cartVerifyOtpBtn');
    btn.innerText = "Verifying..."; btn.disabled = true;

    cartConfirmationResult.confirm(otp).then((result) => {
        proceedWithRegistration(result.user); 
    }).catch(() => {
        alert("Invalid OTP! Please try again.");
        btn.innerHTML = "Confirm Order <i class='fas fa-check-circle' style='margin-left: 5px;'></i>"; btn.disabled = false;
    });
}

async function proceedWithRegistration(user) {
    const customUserId = generateCustomUserId(bookingData.name, user.phoneNumber);
    localStorage.setItem("bhavya_uid", user.uid);
    localStorage.setItem("bhavya_mobile", user.phoneNumber);
    localStorage.setItem("bhavya_role", "patient");
    localStorage.setItem("bhavya_user_id", customUserId);
    localStorage.setItem("bhavya_name", bookingData.name);

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
        current_wallet_balance: 0,
        wallet_balance: 0,
        current_plan_status: "basic",
        plan: "basic",
        status: "active"
    });

    document.getElementById('cartOtpModal').classList.remove('active');
    processOrderSubmission(user.uid);
}

async function processOrderSubmission(userId) {
    const btn = document.getElementById('confirmBtn');
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

        // 1. Save Booking in Firebase 'bookings' collection
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
            cart_items: cart,
            lab_slots: labSlots,
            fulfillment: cart.some(c => c.fulfillment === "home") ? "home" : "center",
            subtotal: finalBill.subtotal,
            collection_charge: finalBill.collectionCharge,
            wallet_used: finalBill.walletUsed,
            referral_discount: finalBill.refDiscount,
            total_discount: (finalBill.walletUsed + finalBill.refDiscount),
            referral_code: finalBill.refCode,
            final_total: finalBill.totalPayable,
            report_url: "",
            status: "Pending",
            payment_status: "DUE",
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Update Patient profile (and deduct wallet if used)
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

        // 3. Credit Referral Bonus (e.g. ₹50 from services_rule) to Referrer's Firebase Wallet
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
                console.error("Referral wallet credit error:", refErr);
            }
        }
        validReferrerUid = "";

        // 4. Automatic Booking Confirmation Email (booking@bhavyadiagnostics.com)
        const itemsRowsHtml = cart.map(i => `
            <tr>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(i.service_name)} (x${i.qty || 1})<br><small style="color:#64748b;">Lab: ${escapeHtml(i.selected_lab_name || "Bhavya Diagnostics")} (${escapeHtml(i.fulfillment || "home")})</small></td>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">₹${Number(i.price || 0) * Number(i.qty || 1)}</td>
            </tr>`).join("");

        const slotSummaries = Object.values(labSlots)
            .filter(s => s && s.date && s.time)
            .map(s => `${s.date} at ${s.time}`)
            .join(", ") || "As scheduled";

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
                        <b>Address:</b> ${escapeHtml(bookingData.address)}, ${escapeHtml(bookingData.city.toUpperCase())} - ${escapeHtml(bookingData.pincode)}<br>
                        <b>Preferred Slot:</b> ${escapeHtml(slotSummaries)}<br>
                        <b>Payment Mode:</b> Pay at Center / Home (Cash or UPI)
                    </p>
                    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
                        <thead>
                            <tr style="background:#f1f5f9;">
                                <th style="padding:8px;text-align:left;">Test / Package</th>
                                <th style="padding:8px;text-align:right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>${itemsRowsHtml}</tbody>
                    </table>
                    <p style="text-align:right;font-size:16px;margin-top:14px;">
                        <b>Total Payable: ₹${finalBill.totalPayable}</b>
                    </p>
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0;">
                    <p style="font-size:12px;color:#64748b;margin:0;">
                        Bhavya Diagnostics • Main Jhajjar Road, Opp. Narendra Farm, Bahadurgarh, Haryana<br>
                        Helpline: 89501 12467 • Website: bhavyadiagnostics.com
                    </p>
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
            to: "booking@bhavyadiagnostics.com",
            subject: `New Booking: ${orderId} - ${bookingData.name} (₹${finalBill.totalPayable})`,
            html: confirmationHtml
        });

        localStorage.removeItem('bhavyaCart');
        document.getElementById("loadingOverlay").style.display = "none";
        alert("🎉 Booking Successful!\n\nOrder ID: " + orderId + "\nYou can pay directly via Cash or UPI.");
        window.location.href = "../patient_dashboard/patient_dashboard.html";
    } catch (err) {
        console.error("Firebase booking error:", err);
        alert("Booking Error: " + err.message);
        document.getElementById("loadingOverlay").style.display = "none";
        btn.innerText = "Confirm Booking";
        btn.disabled = false;
    }
}

// ✨ TEST DESCRIPTION MODAL ✨
window.showTestInfo = function(serviceId) {
    let targetId = String(serviceId).trim();
    let service = allServices.find(s => String(s.service_id).trim() === targetId);
    
    if (service) {
        let desc = service.description ? String(service.description).trim() : "";
        if (desc !== "") {
            document.getElementById('testInfoTitle').innerText = formatText(service.service_name);
            document.getElementById('testInfoDesc').innerHTML = escapeHtml(desc).replace(/\n/g, '<br>');
            document.getElementById('testInfoModal').style.display = 'flex';
        } else {
            showToast("No description text found in database.", "error");
        }
    } else {
        showToast("Test loading... Please wait.", "info");
    }
};

window.addEventListener('load', () => {
    setTimeout(() => {
        let checkTarget = localStorage.getItem("targetCategory");
        if(checkTarget) {
            currentCategory = checkTarget; 
            localStorage.removeItem("targetCategory"); 
            document.querySelectorAll('.cat-card').forEach(btn => btn.classList.remove('selected'));
            renderServices(); 
        }
    }, 1500); 
});

// =======================================================
// ✨ SMART SURPRISE SCRATCH CARD LOGIC ✨
// =======================================================
let surpriseService = null;
let isScratched = false;

function checkSurpriseBannerStatus() {
    let banner = document.getElementById("surpriseOfferBanner");
    if (!banner) return;
    
    let hasSurprise = cart.some(item => item.service_type === "surprise_package" || String(item.service_id).startsWith("SURP-"));
    if (hasSurprise) {
        banner.style.display = "none";
        return;
    }

    let eligibleTypes = ['pathology', 'test', 'blood test', 'profile', 'package', 'discount_profile'];
    let hasEligibleService = cart.some(item => {
        let type = String(item.service_type || '').toLowerCase().trim();
        return eligibleTypes.includes(type);
    });

    banner.style.display = hasEligibleService ? "flex" : "none";
}

function openSurpriseModal() {
    let cartServiceNames = cart.map(item => String(item.service_name).toLowerCase().trim());
    let surprisePool = allServices.filter(s => 
        String(s.service_type).toLowerCase().trim().replace(/_/g, ' ') === "surprise package"
    );

    if (surprisePool.length === 0) {
        showToast("Surprise offer is currently not configured.", "error");
        return;
    }

    let eligibleTests = surprisePool.filter(s => 
        !cartServiceNames.includes(String(s.service_name).toLowerCase().trim())
    );

    if (eligibleTests.length === 0) {
        showToast("You already have all our surprise tests in your cart!", "info");
        return;
    }

    surpriseService = eligibleTests[Math.floor(Math.random() * eligibleTests.length)];
    document.getElementById("scratchTestName").innerText = formatText(surpriseService.service_name);
    let actualPrice = surpriseService.service_price || surpriseService.basic_price || 500;
    document.getElementById("scratchActualPrice").innerText = "₹" + actualPrice;
    let desc = surpriseService.description ? surpriseService.description : "Highly recommended by doctors for routine checkups.";
    document.getElementById("scratchDesc").innerHTML = `<i class="fas fa-stethoscope" style="color:var(--primary);"></i> <b>Why do this?</b><br>${escapeHtml(desc)}`;

    document.getElementById("scratchModal").classList.add("active");
    document.getElementById("scratchSuccessMsg").style.display = "none";
    setupScratchCanvas();
}

function setupScratchCanvas() {
    isScratched = false;
    const canvas = document.getElementById('scratchCanvas');
    const ctx = canvas.getContext('2d');
    
    canvas.style.display = 'block';
    canvas.style.opacity = '1';
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;

    let gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#cbd5e1");
    gradient.addColorStop(0.5, "#94a3b8");
    gradient.addColorStop(1, "#64748b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 18px Inter';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('🪙 Scratch to Reveal', canvas.width / 2, canvas.height / 2);

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
        ctx.globalCompositeOperation = 'destination-out';
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
    let totalPixels = pixels.length / 16;
    let scratchedPercentage = (transparentPixels / totalPixels) * 100;

    if (scratchedPercentage > 40) {
        isScratched = true;
        canvas.style.transition = 'opacity 0.6s ease-out';
        canvas.style.opacity = '0';
        setTimeout(() => {
            canvas.style.display = 'none';
            addSurpriseToCart();
        }, 600);
    }
}

function addSurpriseToCart() {
    if (!surpriseService) return;
    cart.push({ 
        service_id: "SURP-" + surpriseService.service_id, 
        service_name: "🎁 Surprise: " + formatText(surpriseService.service_name), 
        price: 100, 
        qty: 1, 
        service_type: "surprise_package", 
        selected_lab_id: "BHAVYACARE-INTERNAL",
        selected_lab_name: "Bhavya Diagnostics Nodal Center",
        fulfillment: "center"
    });

    localStorage.setItem('bhavyaCart', JSON.stringify(cart));
    document.getElementById("scratchSuccessMsg").style.display = "block";
    showToast("Surprise Test added for ₹100!", "success");

    setTimeout(() => {
        document.getElementById("scratchModal").classList.remove("active");
        updateCartUI(); 
        autoAssignGroupLabs(); 
        renderGroupedCart();
        calculateFinalBill();
    }, 1800); 
}
