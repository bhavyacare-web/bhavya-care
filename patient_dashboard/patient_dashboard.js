const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwIxSjlD6oVAGi4InT6Lb8RPg6NWrl7vpptoYrEG5HKPzPaadUp_0pVnN_1OZfJ7X_r/exec"; 
let isUserVip = false;
let globalBookingsData = [];
let globalCompletedReports = []; 

// ✨ TOAST NOTIFICATION LOGIC ✨
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if(!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = 'fa-check-circle'; 
    if(type === 'error') icon = 'fa-exclamation-circle'; else if(type === 'info') icon = 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// ==========================================
// ✨ GLOBAL SEARCH, CART & VIP CLAIM LOGIC ✨
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    checkLoginAndFetchData();
    updateGlobalCartBadge(); // Load hote hi cart check karega
});

function updateGlobalCartBadge() {
    try {
        let cart = JSON.parse(localStorage.getItem('bhavyaCart')) || [];
        let totalItems = cart.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
        let badge = document.getElementById("globalCartBadge");
        
        if (badge) {
            if (totalItems > 0) {
                badge.innerText = totalItems;
                badge.style.display = "flex";
            } else {
                badge.style.display = "none";
            }
        }
    } catch(e) { console.log("Cart read error"); }
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
        // Automatically cart me VIP package daal diya
        cart.push({ 
            service_id: "VIP-FREE-001", 
            service_name: "VIP Family Plan", 
            price: 0, 
            qty: 1, 
            service_type: "package" 
        });
        localStorage.setItem('bhavyaCart', JSON.stringify(cart));
    }
    // Seedha checkout page par bhej diya
    window.location.href = `../booking/booking.html?view=cart`;
}
// ==========================================

function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = error => reject(error);
    });
}

function toggleMobileMenu() {
    const sheet = document.getElementById("mobileMenuSheet"); const backdrop = document.getElementById("menuBackdrop");
    if(sheet && backdrop) {
        if(sheet.classList.contains("active")) { sheet.classList.remove("active"); backdrop.classList.remove("active"); } 
        else { sheet.classList.add("active"); backdrop.classList.add("active"); }
    }
}

function safeSetText(id, text) { const el = document.getElementById(id); if(el) el.innerText = text; }
function safeSetValue(id, val) { const el = document.getElementById(id); if(el && val) el.value = val; }

function switchTab(tabId) {
    const contents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < contents.length; i++) contents[i].classList.remove("active");
    const links = document.querySelectorAll(".nav-item"); links.forEach(link => link.classList.remove("active"));
    const selectedTab = document.getElementById(tabId); if(selectedTab) selectedTab.classList.add("active");
    
    if(typeof event !== 'undefined' && event && event.currentTarget && event.currentTarget.classList.contains('nav-item')) { 
        event.currentTarget.classList.add("active"); 
    } else { 
        const activeNav = document.querySelector(`[onclick*="switchTab('${tabId}')"].nav-item:not(.mobile-only)`); 
        if(activeNav) activeNav.classList.add("active"); 
    }
}

function logoutDashboard() { localStorage.clear(); window.location.href = "../index.html"; }

async function checkLoginAndFetchData() {
    const userId = localStorage.getItem("bhavya_user_id");
    if (!userId) { showToast("Please login first to access the dashboard.", "error"); window.location.href = "../index.html"; return; }

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "getPatientProfile", user_id: userId }) 
        });
        const result = await response.json();
        if (result.status === "success") {
            const patient = result.data;
            if(patient.patient_name) localStorage.setItem("bhavya_name", patient.patient_name);

            safeSetText("userNameMobile", patient.patient_name); safeSetText("userNameDesktop", patient.patient_name); safeSetText("userIdDisplay", "ID: " + patient.user_id);
            safeSetText("walletBal", patient.wallet || "0"); safeSetText("refCode", patient.referral_code || "-----");safeSetText("refCodeDisplay", patient.referral_code || "N/A");
            safeSetText("infoName", patient.patient_name); safeSetText("infoMobile", patient.mobile_number);

            let btnWithdraw = document.getElementById('btn-withdraw');
            if (btnWithdraw) {
                if (patient.withdraw && patient.withdraw.toLowerCase() === 'active') btnWithdraw.style.display = 'block';
                else btnWithdraw.style.display = 'none';
            }

            const planName = patient.plan ? patient.plan.toLowerCase() : "basic";
            isUserVip = (planName === "vip"); 
            safeSetText("vipStatus", patient.plan ? patient.plan.toUpperCase() : "BASIC");
            
            const vipBtn = document.getElementById("btn-vip-action"); const vipSubText = document.getElementById("vipSubText");
            const vipAlert = document.getElementById("vipPackageAlert"); const notifDot = document.getElementById("notifDot"); const notifDotDesktop = document.getElementById("notifDotDesktop");

            if (isUserVip) {
                if (vipBtn) vipBtn.style.display = "none";
                
                if (patient.vip_package_status === "pending") {
                    if (vipAlert) vipAlert.style.display = "block"; if (notifDot) notifDot.style.display = "block"; if (notifDotDesktop) notifDotDesktop.style.display = "block";
                } else {
                    if (vipAlert) vipAlert.style.display = "none"; if (notifDot) notifDot.style.display = "none"; if (notifDotDesktop) notifDotDesktop.style.display = "none";
                }
                if (patient.vip_details) {
                    safeSetText("vd-start", patient.vip_details.start_date || "N/A"); safeSetText("vd-end", patient.vip_details.end_date || "N/A");
                    let mem1 = document.getElementById("vd-mem1");
                    if(mem1) mem1.innerHTML = `<span><strong>${patient.vip_details.member1_name || 'N/A'}</strong> <br><small style="color:#888;">(Self)</small></span><span style="font-size:11px; background:#e6f0fa; color:#0056b3; padding:3px 8px; border-radius:4px; font-weight:bold;">${patient.vip_details.member1_id || '-'}</span>`;
                    
                    let mem2 = document.getElementById("vd-mem2");
                    if (mem2) {
                        if (patient.vip_details.member2_name) { mem2.innerHTML = `<span><strong>${patient.vip_details.member2_name}</strong></span><span style="font-size:11px; background:#e6f0fa; color:#0056b3; padding:3px 8px; border-radius:4px; font-weight:bold;">${patient.vip_details.member2_id || '-'}</span>`; mem2.style.display = "flex"; } else { mem2.style.display = "none"; }
                    }
                    let mem3 = document.getElementById("vd-mem3");
                    if (mem3) {
                        if (patient.vip_details.member3_name) { mem3.innerHTML = `<span><strong>${patient.vip_details.member3_name}</strong></span><span style="font-size:11px; background:#e6f0fa; color:#0056b3; padding:3px 8px; border-radius:4px; font-weight:bold;">${patient.vip_details.member3_id || '-'}</span>`; mem3.style.display = "flex"; } else { mem3.style.display = "none"; }
                    }
                }
            } else {
                if (vipBtn) vipBtn.style.display = "block"; 
                if (vipAlert) vipAlert.style.display = "none"; if (notifDot) notifDot.style.display = "none"; if (notifDotDesktop) notifDotDesktop.style.display = "none";
            }
            
            const banner = document.getElementById("profileBanner"); const profileImages = document.querySelectorAll(".profile-img"); const editPreview = document.getElementById("editProfilePreview");
            const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(patient.patient_name)}&background=e6f0fa&color=0056b3&bold=true`;

            if (patient.extra_details) {
                if (banner) banner.style.display = "none";
                safeSetValue("infoEmail", patient.extra_details.email); safeSetValue("infoAddress", patient.extra_details.address); safeSetValue("infoCity", patient.extra_details.city);
                safeSetValue("infoDistrict", patient.extra_details.district); safeSetValue("infoState", patient.extra_details.state); safeSetValue("infoPincode", patient.extra_details.pincode);
                if (patient.extra_details.image && patient.extra_details.image.startsWith("data:image")) {
                    profileImages.forEach(img => img.src = patient.extra_details.image); if(editPreview) editPreview.src = patient.extra_details.image;
                    let mobImg = document.getElementById("mobileProfileImg"); if(mobImg) mobImg.src = patient.extra_details.image;
                    let deskImg = document.getElementById("desktopProfileImg"); if(deskImg) deskImg.src = patient.extra_details.image;
                } else { profileImages.forEach(img => img.src = fallbackUrl); if(editPreview) editPreview.src = fallbackUrl; }
            } else {
                if (banner) banner.style.display = "block"; 
                profileImages.forEach(img => img.src = fallbackUrl); 
                if(editPreview) editPreview.src = fallbackUrl;
                
                // ✨ NAYA LOGIC: Auto-switch to Profile Tab on fresh visit
                if (!sessionStorage.getItem("profilePromptShown")) {
                    sessionStorage.setItem("profilePromptShown", "true");
                    switchTab('profile');
                    setTimeout(() => { showToast("Please complete your profile details.", "info"); }, 500);
                }
            }

            fetchWalletHistory(userId);
            await Promise.all([ fetchPatientBookings(userId) ]);
            updateRecentActivity();
        } else {
            showToast("Error: " + result.message, "error");
            if(result.message === "Your account is blocked by Admin.") logoutDashboard();
        }
    } catch (error) { console.error("Fetch Error:", error); }
}

function handleVipCardClick() {
    if (isUserVip) { document.getElementById('vip-details-modal').style.display = 'block'; } else { window.location.href = '../vip/vip_member.html'; }
}

function copyMyReferral() {
    const code = document.getElementById("refCode").innerText;
    if (code && code !== "-----") { navigator.clipboard.writeText(code); showToast("Referral Code '" + code + "' copied!", "success"); }
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
                document.getElementById("editProfilePreview").src = compressedBase64; document.getElementById("infoImageBase64").value = compressedBase64;
            }
        }
    })
}

async function savePatientProfile() {
    const btn = document.getElementById("btnSaveProfile"); btn.innerText = "Saving Please Wait..."; btn.disabled = true;
    const payload = {
        action: "savePatientDetails", user_id: localStorage.getItem("bhavya_user_id"),
        email: document.getElementById("infoEmail").value, address: document.getElementById("infoAddress").value,
        city: document.getElementById("infoCity").value, district: document.getElementById("infoDistrict").value,
        state: document.getElementById("infoState").value, pincode: document.getElementById("infoPincode").value,
        image: document.getElementById("infoImageBase64").value
    };
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (result.status === "success") { showToast("Profile Details Saved Successfully!", "success"); checkLoginAndFetchData(); switchTab('overview'); } 
        else { showToast("Error: " + result.message, "error"); }
    } catch (error) { showToast("Failed to save. Check your connection.", "error"); } 
    finally { btn.innerText = "Save & Update Profile"; btn.disabled = false; }
}

async function fetchWalletHistory(userId) {
    const container = document.getElementById("walletHistoryContainer");
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "getWalletHistory", user_id: userId })
        });
        const result = await response.json();
        if (result.status === "success") {
            const history = result.data;
            if (history.length === 0) { container.innerHTML = `<div style="text-align: center; padding: 40px; color: #ddd;"><i class="fas fa-receipt" style="font-size: 40px; margin-bottom: 15px;"></i><p>No recent transactions.</p></div>`; return; }
            let html = "";
            history.forEach(txn => {
                const isCredit = txn.type.toLowerCase() === 'credit'; const color = isCredit ? '#10b981' : '#ef4444'; const sign = isCredit ? '+' : '-';
                html += `
                <div class="list-item" style="align-items: flex-start;">
                    <div class="list-info"><h5 style="margin-bottom: 3px;">${txn.description}</h5><p><i class="far fa-clock"></i> ${txn.date}</p></div>
                    <div style="font-weight: 800; color: ${color}; font-size: 16px; margin-top: 2px;">${sign}₹${txn.amount}</div>
                </div>`;
            });
            container.innerHTML = html;
        } else { container.innerHTML = `<p style="color:red; text-align:center;">Failed: ${result.message}</p>`; }
    } catch(e) { container.innerHTML = `<p style="color:red; text-align:center;">Network error.</p>`; }
}

// ==========================================
// 🌟 LABS & TESTS DATA FETCHING 🌟
// ==========================================

async function fetchPatientBookings(userId) {
    const bookingsContainer = document.getElementById("patientBookingsContainer");
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "getPatientBookings", user_id: userId })
        });
        const result = await response.json();
        if (result.status === "success") {
            globalBookingsData = result.data; renderBookingCards(globalBookingsData);
            globalCompletedReports = globalBookingsData.filter(bk => {
                let safeStatus = (bk.status || "pending").toString().toLowerCase().trim();
                return safeStatus.includes("complete") || safeStatus === "completed";
            });
            renderFilteredReports(globalCompletedReports);
        } else { if(bookingsContainer) bookingsContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: #ef4444;"><p>Failed to load data: ${result.message}</p></div>`; }
    } catch(e) { if(bookingsContainer) bookingsContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: #ef4444;"><p>Network error. Please check your connection.</p></div>`; }
}

function clearBookingFilters() {
    document.getElementById("searchBookingText").value = ""; document.getElementById("searchBookingDate").value = "";
    renderBookingCards(globalBookingsData);
}

function filterMyBookings() {
    const searchText = document.getElementById("searchBookingText").value.toLowerCase().trim();
    const searchDate = document.getElementById("searchBookingDate").value; 
    const filtered = globalBookingsData.filter(bk => {
        let matchText = true;
        if (searchText !== "") {
            const labName = (bk.lab_id || "").toLowerCase(); const orderId = (bk.order_id || "").toLowerCase();
            let items = []; let rawCart = bk.cart_items;
            if (typeof rawCart === 'string') {
                try { rawCart = JSON.parse(rawCart); } catch(e) {}
                if (typeof rawCart === 'string') { try { rawCart = JSON.parse(rawCart); } catch(e) {} }
            }
            if (Array.isArray(rawCart)) { items = rawCart; } 
            else if (typeof rawCart === 'object' && rawCart !== null) { items = rawCart.items || rawCart.cart || [rawCart]; } 
            else if (typeof rawCart === 'string' && rawCart.trim() !== "") { items = [{ service_name: rawCart }]; }

            let testNames = items.map(i => {
                if (typeof i === 'object' && i !== null) return i.service_name || i.test_name || i.name || i.title || "";
                return String(i);
            }).join(" ").toLowerCase();
            matchText = labName.includes(searchText) || testNames.includes(searchText) || orderId.includes(searchText);
        }
        let matchDate = true;
        if (searchDate !== "") {
            const [year, month, day] = searchDate.split("-");
            matchDate = (bk.date || "").includes(`${day}-${month}-${year}`);
        }
        return matchText && matchDate;
    });
    renderBookingCards(filtered);
}

function renderBookingCards(bookings) {
    const container = document.getElementById("patientBookingsContainer"); if (!container) return;
    if (bookings.length === 0) { container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-weight:600; background:white; border-radius:15px; border:1px solid #e2e8f0;"><i class="fas fa-microscope" style="font-size: 30px; margin-bottom: 10px;"></i><p>No lab bookings found.</p></div>`; return; }

    let cardsHtml = "";
    bookings.forEach(bk => {
        let testsListHtml = ""; let items = []; let rawCart = bk.cart_items;
        if (typeof rawCart === 'string') { try { rawCart = JSON.parse(rawCart); } catch(e) {} if (typeof rawCart === 'string') { try { rawCart = JSON.parse(rawCart); } catch(e) {} } }
        if (Array.isArray(rawCart)) { items = rawCart; } else if (typeof rawCart === 'object' && rawCart !== null) { items = rawCart.items || rawCart.cart || [rawCart]; } else if (typeof rawCart === 'string' && rawCart.trim() !== "") { items = [{ service_name: rawCart }]; }

        if (items.length > 0) {
            testsListHtml = `<ul style="margin: 8px 0; padding-left: 20px; font-size: 13px; color: var(--text-main); font-weight:500;">`;
            items.forEach(item => {
                let tName = "Unknown Test"; let tPrice = "";
                if (typeof item === 'object' && item !== null) { tName = item.service_name || item.test_name || item.name || item.title || "Unknown Test"; tPrice = item.price ? ` <span style="color:var(--text-light); font-size:11px; font-weight:bold;">(₹${item.price})</span>` : ''; } else if (typeof item === 'string') { tName = item; }
                testsListHtml += `<li style="margin-bottom:4px;"><strong>${tName}</strong>${tPrice}</li>`;
            });
            testsListHtml += `</ul>`;
        } else { testsListHtml = `<p style="margin: 8px 0; font-size: 12px; color:var(--text-light);">No test details found.</p>`; }

        let safeStatus = (bk.status || "pending").toString().toLowerCase().trim(); let safePayStatus = (bk.payment_status || "due").toString().toLowerCase().trim();
        let badgeClass = "status-warning"; let statusText = "Pending"; let isComplete = false;

        if (safeStatus.includes("confirm")) { badgeClass = "status-primary"; statusText = "Confirmed"; } else if (safeStatus.includes("complete") || safeStatus === "completed") { badgeClass = "status-success"; statusText = "Completed"; isComplete = true; } else if (safeStatus.includes("cancel")) { badgeClass = "status-danger"; statusText = "Cancelled"; }

        let modeDisplay = (bk.fulfillment && bk.fulfillment.toLowerCase().includes('home')) ? "Home Collection" : "Lab Visit";
        let payStatus = (safePayStatus.includes("complete") || safePayStatus.includes("verified")) ? "COMPLETE" : "DUE"; let payColor = (payStatus === "COMPLETE") ? "#059669" : "#dc2626"; let payBg = (payStatus === "COMPLETE") ? "var(--success-light)" : "var(--danger-light)";
        let paymentBadge = `<span style="font-size:10px; padding:3px 8px; border-radius:6px; margin-left:8px; font-weight:800; background:${payBg}; color:${payColor}; border:1px solid ${payColor}44;">${payStatus}</span>`;

        let cancelBtnHtml = "";
        if (!isComplete && !safeStatus.includes("cancel")) cancelBtnHtml = `<button onclick="openCancelModal('${bk.order_id}')" style="background:var(--danger-light); color:var(--danger); border:1px solid var(--danger); padding:10px; border-radius:10px; font-size:12px; font-weight:bold; cursor:pointer; margin-top:12px; width:100%; transition:0.2s;">Cancel This Booking</button>`;

        let rateBtnHtml = "";
        if (isComplete) {
            if (bk.rating && bk.rating !== "") {
                rateBtnHtml = `<button disabled style="background:#f1f5f9; color:#94a3b8; border:1px solid #cbd5e1; padding:10px; border-radius:10px; font-size:12px; font-weight:bold; margin-top:12px; width:100%; cursor:not-allowed;"><i class="fas fa-check-circle" style="color:#10b981;"></i> Feedback Submitted</button>`;
            } else {
                rateBtnHtml = `<button onclick="openFeedbackModal('${bk.order_id}')" style="background:var(--warning-light); color:#b45309; border:1px solid var(--warning); padding:10px; border-radius:10px; font-size:12px; font-weight:bold; cursor:pointer; margin-top:12px; width:100%; transition:0.2s;"><i class="fas fa-star"></i> Rate Lab Experience</button>`;
            }
        }
        let reportSectionHtml = ""; let handReportsArr = [];
        if (bk.hand_reports) { try { handReportsArr = JSON.parse(bk.hand_reports); if(!Array.isArray(handReportsArr)) handReportsArr = [bk.hand_reports]; } catch(e) { handReportsArr = [bk.hand_reports]; } }
        let onlinePdfArr = [];
        if (bk.report_pdf) { try { onlinePdfArr = JSON.parse(bk.report_pdf); if(!Array.isArray(onlinePdfArr)) onlinePdfArr = [bk.report_pdf]; } catch(e) { onlinePdfArr = [bk.report_pdf]; } }

        if (isComplete && (onlinePdfArr.length > 0 || handReportsArr.length > 0)) {
            reportSectionHtml = `<div style="margin-top:12px; padding:12px; background:var(--success-light); border:1px solid #a7f3d0; border-radius:10px;"><div style="font-size:12px; color:#065f46; font-weight:800; margin-bottom:5px;"><i class="fas fa-check-circle"></i> Booking Completed</div>`;
            if(onlinePdfArr.length > 0) {
                reportSectionHtml += `<div style="font-size:11px; color:#065f46; margin-top:8px; margin-bottom:5px; font-weight:bold; text-transform:uppercase;">Online Reports:</div>`;
                onlinePdfArr.forEach((url, i) => { if(url.trim() !== "") { reportSectionHtml += `<a href="${url}" target="_blank" style="display:block; text-align:center; margin-bottom:5px; padding:10px; background:var(--success); color:white; border-radius:8px; text-decoration:none; font-weight:bold; font-size:12px;"><i class="fas fa-download"></i> Download Report ${i+1}</a>`; } });
            }
            if (handReportsArr.length > 0) {
                reportSectionHtml += `<div style="font-size:11px; color:#b45309; margin-top:10px; font-weight:bold; text-transform:uppercase;">To Collect Physically (In-Hand):</div><ul style="margin:5px 0; padding-left:20px; font-size:12px; color:#b45309; font-weight:600;">`;
                handReportsArr.forEach(srv => { if(srv.trim() !== "") reportSectionHtml += `<li>${srv}</li>`; });
                reportSectionHtml += `</ul>`;
            }
            reportSectionHtml += `</div>`;
        }
        
        cardsHtml += `
        <div style="background:#ffffff; border:1px solid var(--border); border-radius:16px; padding:18px; margin-bottom:15px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:12px;">
                <div><div style="font-size:10px; color:var(--text-light); margin-bottom:2px; font-weight:700; text-transform:uppercase;">Order ID</div><strong style="color:var(--text-main); font-size:14px; font-weight:800;">#${bk.order_id}</strong><div style="margin-top:6px;"><strong style="font-size:12px; color:var(--primary);"><i class="fas fa-flask"></i> ${bk.lab_id ? bk.lab_id.split('(')[0].trim() : 'Unknown'}</strong></div></div>
                <div style="text-align:right;"><span class="status-badge ${badgeClass}" style="margin-bottom:8px;">${statusText.toUpperCase()}</span><br><span style="font-size:11px; color:var(--text-light); font-weight:700;"><i class="far fa-calendar-alt"></i> ${bk.slot}</span></div>
            </div>
            <div style="margin-bottom:12px;"><h5 style="margin:0; color:var(--text-light); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Booked Tests</h5>${testsListHtml}</div>
            
            <div style="background:#f8fafc; padding:12px; border-radius:10px; font-size:12px; color:var(--text-main); font-weight:500; line-height:1.6; border:1px solid var(--border); margin-bottom:12px;">
                <strong>Patient:</strong> ${bk.patient_name} <br>
                <strong>Mode:</strong> ${modeDisplay} <br>
                <strong>Address:</strong> ${bk.address}
            </div>
            <div style="background:#f8fafc; border:1px dashed var(--border); border-radius:10px; padding:12px; font-size:12px;">
                <div style="display:flex; justify-content:space-between; font-weight:800; font-size:15px; color:var(--text-main); align-items:center;">
                    <span>Payable:</span> <span>₹${bk.final_payable}${paymentBadge}</span>
                </div>
            </div>
            ${reportSectionHtml}${cancelBtnHtml}${rateBtnHtml}
        </div>`;
    });
    container.innerHTML = cardsHtml;
}

function openCancelModal(orderId) {
    document.getElementById("cancelOrderIdHidden").value = orderId; document.getElementById("cancelReasonInput").value = ""; document.getElementById("cancel-order-modal").style.display = "block";
}

async function submitCancelOrder() {
    const orderId = document.getElementById("cancelOrderIdHidden").value; const reason = document.getElementById("cancelReasonInput").value.trim(); const btn = document.getElementById("btnConfirmCancel");
    if (!reason) { showToast("Please enter a reason for cancellation.", "error"); return; }
    btn.innerText = "Processing..."; btn.disabled = true;
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "cancelPatientOrder", user_id: localStorage.getItem("bhavya_user_id"), order_id: orderId, cancel_reason: reason }) });
        const result = await response.json();
        if (result.status === "success") { showToast("Order cancelled successfully.", "success"); document.getElementById("cancel-order-modal").style.display = "none"; fetchPatientBookings(localStorage.getItem("bhavya_user_id")); } 
        else { showToast("Error: " + result.message, "error"); }
    } catch(e) { showToast("Failed to cancel. Check your network.", "error"); } 
    finally { btn.innerText = "Confirm Cancellation"; btn.disabled = false; }
}

function clearReportFilters() { document.getElementById("searchReportText").value = ""; document.getElementById("searchReportDate").value = ""; renderFilteredReports(globalCompletedReports); }

function filterPatientReports() {
    const searchText = document.getElementById("searchReportText").value.toLowerCase().trim(); const searchDate = document.getElementById("searchReportDate").value; 
    const filtered = globalCompletedReports.filter(bk => {
        let matchText = true;
        if (searchText !== "") {
            let testNames = "";
            try { 
                let cart = typeof bk.cart_items === 'string' ? JSON.parse(bk.cart_items) : bk.cart_items; let items = Array.isArray(cart) ? cart : [cart];
                testNames = items.map(i => typeof i === 'object' ? (i.service_name || i.test_name || "") : String(i)).join(" ").toLowerCase();
            } catch(e){}
            matchText = (bk.lab_id || "").toLowerCase().includes(searchText) || testNames.includes(searchText);
        }
        let matchDate = searchDate === "" || (bk.date || "").includes(`${searchDate.split("-")[2]}-${searchDate.split("-")[1]}-${searchDate.split("-")[0]}`);
        return matchText && matchDate;
    });
    renderFilteredReports(filtered);
}

function renderFilteredReports(bookings) {
    const reportsTab = document.getElementById("reportsTabContainer"); let reportsHtml = ""; let hasReports = false;
    bookings.forEach(bk => {
        let onlinePdfArr = []; let handReportsArr = [];
        try { if (bk.report_pdf) onlinePdfArr = Array.isArray(JSON.parse(bk.report_pdf)) ? JSON.parse(bk.report_pdf) : [bk.report_pdf]; } catch(e) { onlinePdfArr = [bk.report_pdf]; }
        try { if (bk.hand_reports) handReportsArr = Array.isArray(JSON.parse(bk.hand_reports)) ? JSON.parse(bk.hand_reports) : [bk.hand_reports]; } catch(e) { handReportsArr = [bk.hand_reports]; }

        if (onlinePdfArr.length > 0 || handReportsArr.length > 0) {
            hasReports = true; let linksHtml = "";
            if(onlinePdfArr.length > 0) { onlinePdfArr.forEach((url, i) => { if(url && url.trim() !== "") linksHtml += `<a href="${url}" target="_blank" style="display:block; text-align:center; background:var(--success-light); color:#065f46; padding:12px; border-radius:10px; text-decoration:none; font-weight:800; font-size:12px; margin-top:8px; border:1px solid #a7f3d0;"><i class="fas fa-cloud-download-alt"></i> Download E-Report ${i+1}</a>`; }); }
            if (handReportsArr.length > 0) {
                linksHtml += `<div style="font-size:11px; color:#b45309; margin-top:12px; font-weight:700; text-transform:uppercase;">To Collect Physically (In-Hand):</div><ul style="margin:5px 0; padding-left:20px; font-size:12px; color:#b45309; font-weight:600;">`;
                handReportsArr.forEach(srv => { if(srv && srv.trim() !== "") linksHtml += `<li>${srv}</li>`; }); linksHtml += `</ul>`;
            }
            reportsHtml += `
            <div style="background:#fff; border:1px solid var(--border); border-left: 4px solid var(--success); border-radius:12px; padding:18px; margin-bottom:15px; box-shadow:0 4px 15px rgba(0,0,0,0.02);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><h5 style="margin:0; font-size:14px; color:var(--text-main); font-weight:800;"><i class="fas fa-file-medical" style="color:var(--success); margin-right:5px;"></i> Order #${bk.order_id}</h5><span style="font-size:11px; color:var(--text-light); font-weight:700;">${bk.date.split(' ')[0]}</span></div>
                <div style="font-size:12px; color:var(--text-light); line-height:1.6; font-weight:500;"><strong>Patient:</strong> ${bk.patient_name} <br><strong>Lab:</strong> ${bk.lab_id ? bk.lab_id.split('(')[0].trim() : 'N/A'}</div>${linksHtml}
            </div>`;
        }
    });
    if (!hasReports) reportsHtml += `<div style="text-align: center; padding: 40px; color: #94a3b8; font-weight:600; background:white; border-radius:15px; border:1px solid #e2e8f0;"><i class="fas fa-folder-open" style="font-size: 30px; margin-bottom: 10px;"></i><p>No reports found.</p></div>`;
    if(reportsTab) reportsTab.innerHTML = reportsHtml;
}

function updateRecentActivity() {
    let allActivity = [];
    
    globalBookingsData.forEach(bk => {
        let safeStatus = (bk.status || "pending").toString().toLowerCase().trim(); let isComplete = (safeStatus.includes("complete") || safeStatus === "completed");
        let badgeClass = "status-warning"; let statusText = "Pending";
        if (safeStatus.includes("confirm")) { badgeClass = "status-primary"; statusText = "Confirmed"; } else if (isComplete) { badgeClass = "status-success"; statusText = "Completed"; } else if (safeStatus.includes("cancel")) { badgeClass = "status-danger"; statusText = "Cancelled"; }
        let testSummary = "Lab Test";
        try { let cart = (typeof bk.cart_items === 'string') ? JSON.parse(bk.cart_items) : bk.cart_items; let items = Array.isArray(cart) ? cart : (cart.items || [cart]); testSummary = items.map(i => i.service_name || i.test_name || "Lab Test").join(", "); } catch(e) {}
        testSummary = testSummary.substring(0, 30) + (testSummary.length > 30 ? '...' : '');
        allActivity.push({ type: 'lab', id: bk.order_id, title: testSummary, dateTime: bk.date + " | " + bk.slot.split('-')[0], badgeClass: badgeClass, statusText: statusText, icon: '<i class="fas fa-microscope" style="color:var(--primary); font-size:20px;"></i>', bg: 'var(--primary-light)', timestamp: new Date(bk.date.split("-").reverse().join("-")).getTime() || 0 });
    });

    allActivity.sort((a, b) => b.timestamp - a.timestamp);
    let recentHtml = "";
    allActivity.slice(0, 3).forEach(act => {
        recentHtml += `<div class="list-item"><div class="list-info" style="display:flex; gap:15px; align-items:center;"><div style="background:${act.bg}; padding:12px; border-radius:12px; display:flex; justify-content:center; align-items:center; width:45px; height:45px;">${act.icon}</div><div><h5 style="font-size:13px; margin-bottom:4px; font-weight:800;">${act.title}</h5><p style="color:var(--text-light); font-weight:600; font-size:11px;"><i class="far fa-clock"></i> ${act.dateTime}</p></div></div><div style="text-align:right;"><span class="status-badge ${act.badgeClass}" style="font-size:9px;">${act.statusText}</span><div style="font-size:10px; color:#94a3b8; margin-top:4px; font-weight:700;">${act.id}</div></div></div>`;
    });

    const rcContainer = document.getElementById("recentActivityContainer"); 
    if (recentHtml === "") {
        if(rcContainer) rcContainer.innerHTML = `<div style="text-align: center; padding: 30px; color: #94a3b8; font-weight:600;"><i class="fas fa-history" style="font-size:30px; margin-bottom:10px;"></i><br>No recent activities.</div>`;
    } else {
        if(rcContainer) rcContainer.innerHTML = recentHtml;
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
                if(s.getAttribute('data-val') <= rating) {
                    s.style.color = 'var(--warning)'; 
                } else {
                    s.style.color = '#e2e8f0'; 
                }
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

    const btn = document.getElementById('submitFeedbackBtn');
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Submitting...`;
    btn.disabled = true;

    try {
        let payload = {
            action: "submitOrderFeedback",
            order_id: currentFeedbackOrderId, 
            rating: rating,
            feedback: review
        };
        let res = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        let data = await res.json();

        if(data.status === "success") {
            showToast("Thank you! Your feedback is saved.", "success");
            document.getElementById('feedbackModal').style.display = 'none';
            fetchPatientBookings(localStorage.getItem("bhavya_user_id"));
        } else {
            showToast(data.message, "error");
        }
    } catch(e) {
        showToast("Error submitting feedback", "error");
    } finally {
        btn.innerHTML = `<i class="fas fa-paper-plane"></i> Submit Feedback`;
        btn.disabled = false;
    }
}
// Global variable modal ke data ke liye
window.dashGlobalServices = []; 

// ✨ DASHBOARD SLIDER (WITH 100% ACCURATE VIP CHECK) ✨
function loadDashboardDiscountProfiles() {
    // 💡 FIX: Yahan 'bhavya_user_id' hi use karna hai
    let pId = localStorage.getItem("bhavya_user_id") || "";

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action: "getBookingData", user_id: pId })
    })
    .then(res => res.json())
    .then(res => {
        if (res.status === "success") {
            let allServices = res.data.services || [];
            window.dashGlobalServices = allServices; 
            
            // VIP Plan check
            let userPlan = res.data.userPlan ? String(res.data.userPlan).toLowerCase().trim() : "basic";
            let isVip = (userPlan === "vip" || userPlan === "pending" || window.isUserVip === true);

            let discountProfiles = allServices.filter(s => String(s.service_type || '').toLowerCase().trim() === 'discount_profile');
            let sliderContainer = document.getElementById("dashboardDiscountSlider");
            
            if (!sliderContainer) return;
            if (discountProfiles.length === 0) {
                sliderContainer.innerHTML = `<div style="font-size:12px; color:#64748b; padding:10px;">No exclusive packages available right now.</div>`;
                return;
            }

            let html = "";
            discountProfiles.slice(0, 5).forEach(pkg => {
                let name = pkg.service_name || "Health Package";
                let basicPrice = pkg.basic_price || 0;
                let vipPrice = pkg.vip_price || 0;
                
                // Badges
                let tag = pkg.service_category ? `<span style="font-size:9px; background:#e0f2fe; color:#0284c7; padding:4px 8px; border-radius:6px; font-weight:800; text-transform:uppercase;">${pkg.service_category}</span>` : "";
                let testCountBadge = pkg.number_of_test ? `<span style="background:#fef3c7; color:#d97706; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:700;"><i class="fas fa-microscope"></i> ${pkg.number_of_test} Tests</span>` : '';

                // 'i' Icon
                let infoIcon = (pkg.description && pkg.description.trim() !== "") ? `<i class="fas fa-info-circle" onclick="showDashPopup('${pkg.service_id}'); event.stopPropagation();" style="color:#0056b3; cursor:pointer; margin-left:6px; font-size:15px;"></i>` : "";

                // Bullet Points
                let descPreviewHtml = "";
                let descRaw = String(pkg.description || '');
                if (descRaw.trim() !== "") {
                    let items = descRaw.split(/<br>|\n/).filter(i => i.trim() !== '');
                    if (items.length > 0) {
                        let previewItems = items.slice(0, 2);
                        let moreText = pkg.number_of_test ? `+ ${pkg.number_of_test} Parameters` : (items.length > 2 ? "View All" : "");
                        descPreviewHtml = `
                        <div style="background:#f8fafc; border-radius:8px; padding:6px 10px; border:1px solid #f1f5f9; margin:8px 0;">
                            <ul style="margin:0; padding-left:15px; font-size:10px; color:#64748b; font-weight:600;">${previewItems.map(i => `<li>${i}</li>`).join('')}</ul>
                            ${moreText ? `<div style="font-size:10px; color:#0056b3; margin-top:4px; font-weight:800; cursor:pointer;" onclick="showDashPopup('${pkg.service_id}'); event.stopPropagation();">${moreText}</div>` : ''}
                        </div>`;
                    }
                }

                // ✨ VIP RATE LOGIC ✨
                let pricingHtml = "";
                if (isVip) {
                    pricingHtml = `
                        <span style="font-size:10px; color:#94a3b8; text-decoration:line-through;">₹${pkg.service_price}</span><br>
                        <span style="font-size:16px; font-weight:900; color:var(--text-main);">₹${vipPrice} <i class="fas fa-crown" style="color:var(--warning); font-size:12px;"></i></span>
                    `;
                } else {
                    pricingHtml = `
                        <span style="font-size:10px; color:#94a3b8; text-decoration:line-through;">₹${pkg.service_price}</span><br>
                        <span style="font-size:16px; font-weight:900; color:var(--text-main);">₹${basicPrice}</span><br>
                        <div style="color: #64748b; font-size: 10px; font-weight: 700; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; border: 1px dashed #cbd5e1; cursor: pointer; margin-top:5px;" onclick="openVipPromo(); event.stopPropagation();">
                            <i class="fas fa-lock" style="font-size:9px;"></i> VIP Rate: ₹${vipPrice}
                        </div>
                    `;
                }

                html += `
                <div class="pkg-card" style="min-width: 270px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        ${tag}
                        ${testCountBadge}
                    </div>
                    <h4 class="pkg-title" style="display:flex; align-items:center; margin-bottom:4px; font-size:14px;">${name} ${infoIcon}</h4>
                    ${descPreviewHtml}
                    <div class="pkg-price-row" style="margin-top:auto; align-items:flex-end;">
                        <div>
                            ${pricingHtml}
                        </div>
                        <button class="pkg-book-btn" onclick="goToDiscountProfiles()">Book Now</button>
                    </div>
                </div>`;
            });
            sliderContainer.innerHTML = html;
        }
    }).catch(err => console.log("Dashboard slider error:", err));
}

// ✨ POPUP KHOLNE KA FUNCTION ✨
window.showDashPopup = function(id) {
    let srv = window.dashGlobalServices.find(s => String(s.service_id) == String(id));
    if(srv && srv.description) {
        document.getElementById('dashModalTitle').innerText = srv.service_name;
        document.getElementById('dashModalDesc').innerHTML = String(srv.description).replace(/\n/g, '<br>');
        document.getElementById('dashboardInfoModal').style.display = 'flex';
    } else {
        showToast("Description not available", "error");
    }
};

// ✨ Yahan hum ensure kar rahe hain ki dashboard load hote hi ye function chal jaye ✨
setTimeout(() => {
    loadDashboardDiscountProfiles();
}, 1000); 

// ✨ NAYA FUNCTION: DISCOUNT PAGE PAR BHEJNE KE LIYE ✨
function goToDiscountProfiles() {
    localStorage.setItem("targetCategory", "discount_profile");
    window.location.href = '../booking/booking.html';
}

// ✨ VIP BUTTON CLICK PAR NAYE PAGE PAR JANA ✨
window.openVipPromo = function() {
    window.location.href = '../vip/vip_member.html'; 
};

// ✨ DASHBOARD REFERRAL COPY FUNCTION ✨
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
    // 1. Pehle normal VIP details modal band kardo
    document.getElementById('vip-details-modal').style.display = 'none';

    // 2. Data uthao aur Card mein set karo
    const name = localStorage.getItem("bhavya_name") || "VIP Patient";
    const id = localStorage.getItem("bhavya_user_id") || "---";
    const photoSrc = document.getElementById("editProfilePreview").src; // Jo profile section me photo hai
    const refCode = document.getElementById("refCodeDisplay").innerText;

    document.getElementById("vc-name").innerText = name;
    document.getElementById("vc-id").innerText = "ID: " + id;
    document.getElementById("vc-photo").src = photoSrc;
    document.getElementById("vc-ref").innerText = (refCode === "Loading.." || refCode === "N/A") ? "NONE" : refCode;

    // Dates from the existing VIP modal
    document.getElementById("vc-start").innerText = document.getElementById("vd-start").innerText;
    document.getElementById("vc-end").innerText = document.getElementById("vd-end").innerText;

    // Members list
    let memHtml = "";
    let mem1 = document.getElementById("vd-mem1").innerText;
    let mem2 = document.getElementById("vd-mem2").innerText;
    let mem3 = document.getElementById("vd-mem3").innerText;

    if (mem1) memHtml += `<p>${mem1.split('\n')[0]} <span>(Self)</span></p>`;
    if (mem2) memHtml += `<p>${mem2.split('\n')[0]} <span>(Member)</span></p>`;
    if (mem3) memHtml += `<p>${mem3.split('\n')[0]} <span>(Member)</span></p>`;

    document.getElementById("vc-members-container").innerHTML = memHtml;

    // 3. Naya VIP Card Modal show kardo
    document.getElementById("vipCardModal").classList.add("active");
}

function closeVipCardModal() {
    document.getElementById("vipCardModal").classList.remove("active");
}

function downloadVipCard() {
    // html2canvas library ka use karke HTML div ko image banayenge
    const cardElement = document.getElementById('vipCardElement');
    const name = localStorage.getItem("bhavya_name") || "Patient";
    const btn = document.querySelector(".btn-card-action:not(.close)");
    
    let originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    btn.disabled = true;

    // Quality badhane ke liye scale = 3 use kiya hai
    html2canvas(cardElement, { scale: 3, backgroundColor: null, useCORS: true }).then(canvas => {
        // Image Data URL generate karna
        let image = canvas.toDataURL("image/png");
        
        // Auto-download link banana
        let link = document.createElement('a');
        link.download = `BhavyaCare_VIP_Card_${name.replace(/\s+/g, '_')}.png`;
        link.href = image;
        link.click();

        // Button wapas normal karna
        btn.innerHTML = `<i class="fas fa-check"></i> Saved!`;
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            showToast("VIP Card Downloaded successfully!", "success");
        }, 2000);
    }).catch(err => {
        showToast("Error saving card.", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}
