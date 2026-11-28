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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const storage = (typeof firebase.storage === "function") ? firebase.storage() : null;
const GAS_URL = "https://script.google.com/macros/s/AKfycbwIxSjlD6oVAGi4InT6Lb8RPg6NWrl7vpptoYrEG5HKPzPaadUp_0pVnN_1OZfJ7X_r/exec";

// Fallback Owner Emails (ONLY used if NOT explicitly restricted in admin_roles!)
const FALLBACK_SUPER_ADMIN_EMAILS = [
    "admin@bhavyadiagnostics.com",
    "contact@bhavyadiagnostics.com",
    "diagnosticsbhavya@gmail.com"
];

// STRICT Role Permissions Map
const ROLE_PERMISSIONS = {
    super_admin:   ["bookings", "retests", "patients", "promos", "withdrawals", "support", "pnl", "staff"],
    report_staff:  ["bookings", "retests"],
    phlebo_staff:  ["bookings"],
    booking_staff: ["bookings", "retests", "support"],
    vip_staff:     ["patients"]
};

let currentStaff = { email: "", name: "", role: "report_staff" };
let sheetRules = {};
let allCatalogServices = [];

let allBookings = [];
let allPatients = [];
let allVipRequests = [];
let allKycProfiles = [];
let allPayouts = [];
let allPrescriptions = [];
let allSupportQueries = [];
let allRetestRequests = [];
let allPromoCodes = [];
let allExpenses = [];
let allStaffList = [];

let walkinSelectedItems = [];
let currentWithdrawSub = "kyc";
let liveUnsubscribers = [];
let initialBookingsLoaded = false;

function showMsg(msg, title) {
    if (typeof window.bhavyaAlert === "function") return window.bhavyaAlert(msg, title);
    alert(msg);
    return Promise.resolve();
}

function showAdminToast(msg, type = "success") {
    const box = document.getElementById("adminToastBox");
    if (!box) return;
    const t = document.createElement("div");
    t.className = `admin-toast ${type}`;
    t.innerText = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 3200);
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDateDisplay(val) {
    if (!val) return "N/A";
    try {
        let d = (typeof val.toDate === "function") ? val.toDate() : (val.seconds ? new Date(val.seconds * 1000) : new Date(val));
        if (isNaN(d.getTime())) return String(val);
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) + " " +
               d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return String(val); }
}

function getDateObj(val) {
    if (!val) return null;
    try {
        let d = (typeof val.toDate === "function") ? val.toDate() : (val.seconds ? new Date(val.seconds * 1000) : new Date(val));
        return isNaN(d.getTime()) ? null : d;
    } catch (e) { return null; }
}

function getIsoDateStr(val) {
    const d = getDateObj(val);
    if (!d) return "";
    return d.toISOString().split("T")[0];
}

function hasTabAccess(tabName) {
    return (ROLE_PERMISSIONS[currentStaff.role] || []).includes(tabName);
}

const EMAIL_SENDERS = {
    contact: "Bhavya Diagnostics <contact@bhavyadiagnostics.com>",
    booking: "Bhavya Diagnostics Booking <booking@bhavyadiagnostics.com>",
    report:  "Bhavya Diagnostics Reports <report@bhavyadiagnostics.com>"
};

async function sendAutoEmail({ type = "contact", to, subject, html, replyTo = "contact@bhavyadiagnostics.com" }) {
    if (!to) return;
    const recipients = (Array.isArray(to) ? to : [to]).filter(e => e && String(e).includes("@"));
    if (recipients.length === 0) return;

    return db.collection("mail").add({
        from: EMAIL_SENDERS[type] || EMAIL_SENDERS.contact,
        replyTo: replyTo,
        to: recipients,
        message: { subject: subject, html: html }
    }).catch(err => console.error("Email trigger error:", err));
}

// =======================================================
// 2. STRICT AUTH & ROLE-BASED ACCESS (FIXED BUG #3)
// =======================================================
function clearAllRealtimeListeners() {
    liveUnsubscribers.forEach(unsub => {
        try { if (typeof unsub === "function") unsub(); } catch (e) {}
    });
    liveUnsubscribers = [];
    initialBookingsLoaded = false;
}

firebase.auth().onAuthStateChanged(async (user) => {
    const gate = document.getElementById("adminLoginGate");
    const app = document.getElementById("adminAppWrapper");

    if (!user || !user.email) {
        clearAllRealtimeListeners();
        gate.style.display = "flex";
        app.style.display = "none";
        return;
    }

    const emailLower = user.email.toLowerCase().trim();
    let role = "";
    let staffName = emailLower.split("@")[0];

    // CHECK admin_roles FIRST so staff created with report_staff/phlebo_staff NEVER get super_admin override!
    try {
        const roleDoc = await db.collection("admin_roles").doc(emailLower).get();
        if (roleDoc.exists) {
            const rd = roleDoc.data();
            if (String(rd.status || "active").toLowerCase() === "inactive") {
                await showMsg("Access Denied: Your staff account has been deactivated by Admin.", "Account Inactive");
                await firebase.auth().signOut();
                return;
            }
            role = String(rd.role || "report_staff").trim();
            staffName = rd.name || staffName;
        } else if (FALLBACK_SUPER_ADMIN_EMAILS.includes(emailLower)) {
            role = "super_admin";
            staffName = "Super Admin";
        } else {
            await showMsg("Access Denied: Your email is not authorized for the Admin Panel.", "Unauthorized");
            await firebase.auth().signOut();
            return;
        }
    } catch (e) {
        if (FALLBACK_SUPER_ADMIN_EMAILS.includes(emailLower)) {
            role = "super_admin";
            staffName = "Super Admin";
        } else {
            await showMsg("Unable to verify staff role. Please try again.", "Auth Error");
            await firebase.auth().signOut();
            return;
        }
    }

    if (!ROLE_PERMISSIONS[role]) role = "report_staff";

    currentStaff = { email: emailLower, name: staffName, role: role };
    document.getElementById("loggedStaffEmail").innerText = `${staffName} (${emailLower})`;
    document.getElementById("loggedStaffRole").innerText = role.replace("_", " ");

    applyRolePermissions(role);
    gate.style.display = "none";
    app.style.display = "block";

    await loadSheetRulesAndCatalog();
    startRealtimeAdminListeners();
});

async function handleGateLogin() {
    const email = document.getElementById("gateEmail").value.trim();
    const pass = document.getElementById("gatePassword").value;
    const btn = document.getElementById("btnGateLogin");

    if (!email || !pass) return showMsg("Please enter both Email and Password.", "Missing Credentials");
    btn.innerText = "Signing In...";
    btn.disabled = true;

    try {
        await firebase.auth().signInWithEmailAndPassword(email, pass);
    } catch (err) {
        showMsg("Invalid Email or Password. Please try again.", "Login Failed");
    } finally {
        btn.innerHTML = 'Sign In <i class="fas fa-arrow-right"></i>';
        btn.disabled = false;
    }
}

async function logoutAdmin() {
    if (!confirm("Logout from Admin Panel?")) return;
    clearAllRealtimeListeners();
    localStorage.removeItem("bhavya_role");
    await firebase.auth().signOut();
    window.location.href = "index.html";
}

function applyRolePermissions(role) {
    const allowedTabs = ROLE_PERMISSIONS[role] || ["bookings"];
    document.querySelectorAll("#adminMainTabs .main-tab-btn").forEach(btn => {
        const tabName = btn.getAttribute("data-tab");
        btn.style.display = allowedTabs.includes(tabName) ? "inline-flex" : "none";
    });

    // Hide Walk-in button for report_staff & vip_staff
    const walkinBtn = document.getElementById("btnOpenWalkin");
    if (walkinBtn) {
        walkinBtn.style.display = (role === "super_admin" || role === "booking_staff" || role === "phlebo_staff") ? "inline-flex" : "none";
    }

    // Hide B2B Lab Cost input inside Report Modal for non-super-admins if desired (keep visible for super_admin & report_staff)
    const repLabWrap = document.getElementById("repLabCostWrap");
    if (repLabWrap) {
        repLabWrap.style.display = (role === "super_admin" || role === "report_staff") ? "block" : "none";
    }

    if (allowedTabs.length > 0) switchMainTab(allowedTabs[0]);
}

function switchMainTab(tabName) {
    if (!hasTabAccess(tabName)) return;

    document.querySelectorAll("#adminMainTabs .main-tab-btn").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-tab") === tabName);
    });
    document.querySelectorAll(".section-panel").forEach(p => p.classList.remove("active"));
    const target = document.getElementById(`panel-${tabName}`);
    if (target) target.classList.add("active");
}

function closeAllModals() {
    document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("active"));
}

// =======================================================
// 3. LOAD SHEET RULES & SERVICES CATALOG (FOR WALK-IN & REVERT)
// =======================================================
async function loadSheetRulesAndCatalog() {
    try {
        const res = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify({ action: "getBookingData", user_id: "" })
        });
        const json = await res.json();
        if (json.status === "success" && json.data) {
            sheetRules = json.data.rules || {};
            allCatalogServices = json.data.services || [];
        }
    } catch (e) {
        console.warn("Catalog fetch skipped:", e);
    }
}

function getVipCashbackRuleAmount() {
    for (const k of Object.keys(sheetRules)) {
        if (k.toLowerCase().startsWith("wallet_vip_plan")) return Number(sheetRules[k]) || 1000;
    }
    return 1000;
}

function getVipReferralRuleAmount() {
    return Number(sheetRules.vip_purchase_referral_bonus || sheetRules.vip_referral_discount || 500);
}

// =======================================================
// 4. LIVE AUTO-REFRESH LISTENERS + WORKING REFRESH BUTTON (FIXED BUG #2)
// =======================================================
function startRealtimeAdminListeners() {
    clearAllRealtimeListeners();
    const allowed = ROLE_PERMISSIONS[currentStaff.role] || [];

    if (allowed.includes("bookings") || allowed.includes("pnl")) {
        const unsub = db.collection("bookings").onSnapshot((snap) => {
            const prevCount = allBookings.length;
            allBookings = [];
            snap.forEach(doc => {
                const d = doc.data();
                const ts = getDateObj(d.created_at || d.date);
                allBookings.push({
                    docId: doc.id,
                    ...d,
                    tsMillis: ts ? ts.getTime() : 0,
                    isoDate: getIsoDateStr(d.created_at || d.date)
                });
            });
            allBookings.sort((a, b) => b.tsMillis - a.tsMillis);
            renderBookingsTable();
            if (allowed.includes("pnl")) calculateProfitAndLoss();

            if (initialBookingsLoaded && allBookings.length > prevCount) {
                showAdminToast("🔔 New Booking Received!", "success");
            }
            initialBookingsLoaded = true;
        }, (err) => console.error("Bookings listener error:", err));
        liveUnsubscribers.push(unsub);
    }

    if (allowed.includes("retests")) {
        const unsub = db.collection("retest_requests").onSnapshot((snap) => {
            allRetestRequests = [];
            snap.forEach(doc => {
                const d = doc.data();
                const ts = getDateObj(d.created_at);
                allRetestRequests.push({ docId: doc.id, ...d, tsMillis: ts ? ts.getTime() : 0 });
            });
            allRetestRequests.sort((a, b) => b.tsMillis - a.tsMillis);
            renderRetestsTable();
        }, (err) => console.warn("Retests listener:", err.message));
        liveUnsubscribers.push(unsub);
    }

    if (allowed.includes("patients") || allowed.includes("pnl")) {
        const uPat = db.collection("patients").onSnapshot((snap) => {
            allPatients = [];
            snap.forEach(doc => allPatients.push({ uid: doc.id, ...doc.data() }));
            renderPatientsMasterTable();
        });
        const uVip = db.collection("vip_requests").onSnapshot((snap) => {
            allVipRequests = [];
            snap.forEach(doc => {
                const d = doc.data();
                const ts = getDateObj(d.created_at);
                allVipRequests.push({ uid: doc.id, ...d, tsMillis: ts ? ts.getTime() : 0 });
            });
            allVipRequests.sort((a, b) => b.tsMillis - a.tsMillis);
            renderVipTable();
            if (allowed.includes("pnl")) calculateProfitAndLoss();
        });
        liveUnsubscribers.push(uPat, uVip);
    }

    if (allowed.includes("promos")) {
        const uPromo = db.collection("promo_codes").onSnapshot((snap) => {
            allPromoCodes = [];
            snap.forEach(doc => allPromoCodes.push({ code: doc.id, ...doc.data() }));
            renderPromoTable();
        }, (err) => console.warn("Promo listener:", err.message));
        liveUnsubscribers.push(uPromo);
    }

    if (allowed.includes("withdrawals")) {
        const uKyc = db.collection("withdrawal_profiles").onSnapshot((snap) => {
            allKycProfiles = [];
            snap.forEach(d => allKycProfiles.push({ docId: d.id, ...d.data() }));
            renderWithdrawalsTable();
        });
        const uPay = db.collection("payout_requests").onSnapshot((snap) => {
            allPayouts = [];
            snap.forEach(d => allPayouts.push({ docId: d.id, ...d.data() }));
            renderWithdrawalsTable();
        });
        liveUnsubscribers.push(uKyc, uPay);
    }

    if (allowed.includes("support")) {
        const uRx = db.collection("prescriptions").onSnapshot((snap) => {
            allPrescriptions = [];
            snap.forEach(d => allPrescriptions.push({ docId: d.id, ...d.data() }));
            renderRxAndSupportTables();
        });
        const uSup = db.collection("support_queries").onSnapshot((snap) => {
            allSupportQueries = [];
            snap.forEach(d => allSupportQueries.push({ docId: d.id, ...d.data() }));
            renderRxAndSupportTables();
        });
        liveUnsubscribers.push(uRx, uSup);
    }

    if (allowed.includes("pnl")) {
        const uExp = db.collection("expenses").onSnapshot((snap) => {
            allExpenses = [];
            snap.forEach(d => allExpenses.push({ docId: d.id, ...d.data() }));
            allExpenses.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
            calculateProfitAndLoss();
        });
        liveUnsubscribers.push(uExp);
    }

    if (allowed.includes("staff")) {
        const uStaff = db.collection("admin_roles").onSnapshot((snap) => {
            allStaffList = [];
            snap.forEach(d => allStaffList.push({ email: d.id, ...d.data() }));
            renderStaffTable();
        });
        liveUnsubscribers.push(uStaff);
    }
}

async function refreshAllAdminData(manualClick = false) {
    const icon = document.getElementById("refreshIcon");
    const btn = document.getElementById("btnMasterRefresh");
    if (icon) icon.classList.add("fa-spin");
    if (btn) btn.disabled = true;

    try {
        await Promise.allSettled([loadSheetRulesAndCatalog()]);
        startRealtimeAdminListeners();
        if (manualClick) showAdminToast("✅ Live data refreshed!", "success");
    } catch (e) {
        if (manualClick) showAdminToast("Refresh encountered an error.", "error");
    } finally {
        setTimeout(() => {
            if (icon) icon.classList.remove("fa-spin");
            if (btn) btn.disabled = false;
        }, 500);
    }
}

// =======================================================
// 5. BOOKINGS, TECHNICIAN SAMPLE COLLECTED & REPORT UPLOAD
// =======================================================
function clearBookingFilters() {
    document.getElementById("bookingSearchInput").value = "";
    document.getElementById("bookingStatusFilter").value = "ALL";
    document.getElementById("bookingDateFilter").value = "";
    renderBookingsTable();
}

function renderBookingsTable() {
    const tbody = document.getElementById("bookingsTableBody");
    if (!tbody) return;

    const search = document.getElementById("bookingSearchInput").value.toLowerCase().trim();
    const statusFilter = document.getElementById("bookingStatusFilter").value.toLowerCase();
    const dateFilter = document.getElementById("bookingDateFilter").value;

    let pendingCnt = 0, collectedCnt = 0, completedCnt = 0;
    allBookings.forEach(b => {
        const st = String(b.status || "pending").toLowerCase();
        if (st.includes("complete")) completedCnt++;
        else if (st.includes("sample")) collectedCnt++;
        else if (!st.includes("cancel")) pendingCnt++;
    });

    document.getElementById("kpiTotalOrders").innerText = allBookings.length;
    document.getElementById("kpiPendingOrders").innerText = pendingCnt;
    document.getElementById("kpiCollectedOrders").innerText = collectedCnt;
    document.getElementById("kpiCompletedOrders").innerText = completedCnt;

    const filtered = allBookings.filter(b => {
        const st = String(b.status || "pending").toLowerCase();
        if (statusFilter !== "all" && !st.includes(statusFilter)) return false;
        if (dateFilter && b.isoDate !== dateFilter) return false;
        if (search) {
            const itemsStr = (Array.isArray(b.cart_items) ? b.cart_items : []).map(i => i.service_name || "").join(" ").toLowerCase();
            const hay = `${b.order_id || ""} ${b.patient_name || ""} ${b.mobile || ""} ${itemsStr}`.toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#64748b;">No bookings found matching filters.</td></tr>`;
        return;
    }

    const role = currentStaff.role;
    const canUploadReport = (role === "super_admin" || role === "report_staff");
    const canCollectSample = (role === "super_admin" || role === "phlebo_staff" || role === "booking_staff");
    const canSeeB2B = (role === "super_admin");

    tbody.innerHTML = filtered.map(b => {
        const st = String(b.status || "Pending").toLowerCase();
        const isCompleted = st.includes("complete");
        const isCancelled = st.includes("cancel");
        const isSampleCollected = st.includes("sample");

        let badgeCls = "b-pending";
        if (isSampleCollected) badgeCls = "b-sample";
        else if (st.includes("confirm")) badgeCls = "b-confirmed";
        else if (isCompleted) badgeCls = "b-completed";
        else if (isCancelled) badgeCls = "b-cancelled";

        const items = Array.isArray(b.cart_items) ? b.cart_items : [];
        const itemsHtml = items.map(i => {
            const labTag = i.selected_lab_name ? ` <small style="color:#0056b3;">[${escapeHtml(i.selected_lab_name)}]</small>` : "";
            return `<div>• <b>${escapeHtml(i.service_name)}</b> (x${i.qty || 1})${labTag}</div>`;
        }).join("") || "Diagnostic Order";

        let slotTxt = b.slot || "As scheduled";
        if (!b.slot && b.lab_slots && typeof b.lab_slots === "object") {
            const parts = Object.values(b.lab_slots).filter(s => s && s.date).map(s => `${s.date} ${s.time || ""}`);
            if (parts.length) slotTxt = parts.join(" | ");
        }

        const cleanMobile = String(b.mobile || "").replace(/\D/g, "").slice(-10);
        const callBtn = cleanMobile.length === 10
            ? `<a href="tel:${cleanMobile}" style="color:#059669; font-weight:800; text-decoration:none; margin-left:4px;"><i class="fas fa-phone-alt"></i> Call</a>`
            : "";

        const mapUrl = b.map_link || (b.location_lat && b.location_lng ? `https://www.google.com/maps?q=${b.location_lat},${b.location_lng}` : "");
        const mapLinkHtml = mapUrl
            ? `<br><a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; gap:4px; margin-top:4px; background:#eff6ff; color:#1d4ed8; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:800; text-decoration:none; border:1px solid #bfdbfe;"><i class="fas fa-map-marker-alt"></i> Open Google Map</a>`
            : "";

        const sourceBadge = b.booking_source === "walkin"
            ? `<span class="badge b-confirmed" style="margin-top:3px;">WALK-IN</span>`
            : (b.booking_source === "camp" ? `<span class="badge b-sample" style="margin-top:3px;">HEALTH CAMP</span>` : "");

        const reportUrl = b.report_url || (Array.isArray(b.report_pdf) ? b.report_pdf[0] : b.report_pdf) || "";
        const waReportMsg = reportUrl
            ? `Namaste ${b.patient_name || "Patient"}, your diagnostic report for Order #${b.order_id || b.docId} from Bhavya Diagnostics Bahadurgarh is ready.\n\nDownload Report PDF: ${reportUrl}\n\nHelpline: 89501 12467`
            : "";
        const waShareBtn = (reportUrl && cleanMobile.length === 10)
            ? `<a href="https://wa.me/91${cleanMobile}?text=${encodeURIComponent(waReportMsg)}" target="_blank" rel="noopener noreferrer" class="btn-act" style="background:#25D366; color:white; margin-top:4px;"><i class="fab fa-whatsapp"></i> Send on WhatsApp</a>`
            : "";

        const reportLinkHtml = reportUrl
            ? `<div style="margin-top:5px;"><a href="${escapeHtml(reportUrl)}" target="_blank" style="color:var(--success); font-weight:800; font-size:12px; text-decoration:none;"><i class="fas fa-file-pdf"></i> View PDF</a>${b.report_uploaded_by ? `<br><small style="color:#64748b;">By: ${escapeHtml(b.report_uploaded_by)}</small>` : ""}<br>${waShareBtn}</div>`
            : "";

        const collectedNote = b.sample_collected_by
            ? `<div style="font-size:11px; color:#0369a1; font-weight:700; margin-top:4px;"><i class="fas fa-vial"></i> By: ${escapeHtml(b.sample_collected_by)}</div>`
            : "";

        const paySt = String(b.payment_status || "DUE").toUpperCase();
        const payColor = paySt.includes("PAID") ? "var(--success)" : "var(--danger)";

        // BUG #1 FIX: Show B2B Lab Cost ONLY AFTER Order is COMPLETED!
        const b2bLineHtml = canSeeB2B
            ? (isCompleted
                ? `<br><small style="color:#b45309; font-weight:800;">B2B Lab Cost: ₹${Number(b.lab_cost || 0)}</small>`
                : `<br><small style="color:#94a3b8; font-weight:600;">B2B Cost: On Completion</small>`)
            : "";

        const revertedTag = b.reverted_to_basic
            ? `<br><span style="font-size:10px; background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:800;">REVERTED TO BASIC</span>`
            : "";

        let actionsHtml = "";
        if (canCollectSample && !isCompleted && !isCancelled && !isSampleCollected) {
            actionsHtml += `<button class="btn-act btn-sky" onclick="openSampleCollectModal('${escapeHtml(b.docId)}')"><i class="fas fa-vial"></i> Sample Collected</button><br>`;
        }
        if (canUploadReport && !isCancelled) {
            actionsHtml += `<button class="btn-act btn-green" onclick="openReportUploadModal('${escapeHtml(b.docId)}')"><i class="fas fa-upload"></i> Upload Report</button><br>`;
        }
        if (canCollectSample && st === "pending") {
            actionsHtml += `<button class="btn-act btn-blue" onclick="updateOrderStatus('${escapeHtml(b.docId)}', 'Confirmed')">Confirm</button>`;
        }
        if (canCollectSample && !paySt.includes("PAID") && !isCancelled) {
            actionsHtml += `<button class="btn-act btn-amber" onclick="markOrderPaid('${escapeHtml(b.docId)}')">Mark Paid</button>`;
        }

        return `
        <tr>
            <td><strong>#${escapeHtml(b.order_id || b.docId)}</strong><br><small style="color:#64748b;">${formatDateDisplay(b.created_at)}</small><br>${sourceBadge}</td>
            <td>
                <strong>${escapeHtml(b.patient_name || "Patient")}</strong><br>
                <small>📞 ${escapeHtml(b.mobile || "-")}${callBtn}</small><br>
                <small style="color:#64748b;">${escapeHtml(b.address || "")} ${escapeHtml(b.pincode || "")}</small>
                ${mapLinkHtml}
            </td>
            <td>${itemsHtml}</td>
            <td>
                <span class="badge b-confirmed">${escapeHtml(String(b.fulfillment || "home").toUpperCase())}</span><br>
                <small style="font-weight:700; display:block; margin-top:4px;">${escapeHtml(slotTxt)}</small>
            </td>
            <td>
                <strong>Bill: ₹${Number(b.final_total || 0)}</strong>
                <span style="font-size:10px; font-weight:800; color:${payColor}; margin-left:4px;">(${escapeHtml(paySt)})</span>
                ${b2bLineHtml}${revertedTag}
            </td>
            <td>
                <span class="badge ${badgeCls}">${escapeHtml(b.status || "Pending")}</span>
                ${collectedNote}${reportLinkHtml}
            </td>
            <td>${actionsHtml || '<small style="color:#94a3b8;">No actions</small>'}</td>
        </tr>`;
    }).join("");
}

// Technician Sample Collected Modal & Submission
function openSampleCollectModal(docId) {
    const b = allBookings.find(x => x.docId === docId);
    if (!b) return;
    document.getElementById("scModalDocId").value = docId;
    document.getElementById("scModalOrderId").innerText = "#" + (b.order_id || docId);
    document.getElementById("scModalPatientName").innerText = b.patient_name || "Patient";
    document.getElementById("scModalAmount").innerText = Number(b.final_total || 0);
    document.getElementById("scPaymentSelect").value = String(b.payment_status || "").toUpperCase().includes("PAID") ? "PAID_CASH" : "PAID_UPI";
    document.getElementById("scNoteInput").value = "";
    document.getElementById("sampleCollectModal").classList.add("active");
}

async function submitSampleCollected() {
    const docId = document.getElementById("scModalDocId").value;
    const payVal = document.getElementById("scPaymentSelect").value;
    const note = document.getElementById("scNoteInput").value.trim();
    const order = allBookings.find(b => b.docId === docId);
    if (!order) return;

    const btn = document.getElementById("btnConfirmSample");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        const payStatus = payVal === "DUE" ? "DUE" : "PAID";
        const payMethod = payVal === "PAID_CASH" ? "Cash" : (payVal === "PAID_UPI" ? "UPI" : "Pending");

        await db.collection("bookings").doc(docId).update({
            status: "Sample Collected",
            payment_status: payStatus,
            payment_method: payMethod,
            sample_collected_by: currentStaff.name,
            sample_note: note,
            sample_collected_at: firebase.firestore.FieldValue.serverTimestamp(),
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        if (order.email && order.email.includes("@")) {
            await sendAutoEmail({
                type: "booking",
                to: order.email,
                subject: `Sample Collected (#${order.order_id || docId}) - Bhavya Diagnostics`,
                html: `<p>Dear <b>${escapeHtml(order.patient_name || "Patient")}</b>,</p>
                       <p>Your diagnostic sample for Order <b>#${escapeHtml(order.order_id || docId)}</b> has been safely collected by <b>${escapeHtml(currentStaff.name)}</b> and is being sent for lab processing.</p>
                       <p><b>Payment Status:</b> ${escapeHtml(payStatus)} (${escapeHtml(payMethod)})</p>
                       <p style="font-size:12px;color:#64748b;">You will receive your digital report on WhatsApp, Email &amp; Patient Dashboard shortly.</p>`
            });
        }

        closeAllModals();
        showAdminToast("✅ Sample marked as collected!", "success");
    } catch (err) {
        showMsg("Error updating sample status: " + err.message, "Error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Mark Sample Collected';
    }
}

async function updateOrderStatus(docId, newStatus) {
    await db.collection("bookings").doc(docId).update({
        status: newStatus,
        updated_by: currentStaff.name,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showAdminToast(`Order marked ${newStatus}`, "success");
}

async function markOrderPaid(docId) {
    await db.collection("bookings").doc(docId).update({
        payment_status: "PAID",
        paid_marked_by: currentStaff.name,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    showAdminToast("Payment marked PAID", "success");
}

function openReportUploadModal(docId) {
    if (currentStaff.role !== "super_admin" && currentStaff.role !== "report_staff") {
        return showMsg("Only Report Team or Super Admin can upload reports.", "Access Denied");
    }
    const order = allBookings.find(b => b.docId === docId);
    if (!order) return;

    document.getElementById("repModalOrderDocId").value = docId;
    document.getElementById("repModalOrderId").innerText = "#" + (order.order_id || docId);
    document.getElementById("repModalPatientName").innerText = order.patient_name || "Patient";
    document.getElementById("repPdfFileInput").value = "";
    document.getElementById("repExternalUrlInput").value = order.report_url || "";
    document.getElementById("repHandNoteInput").value = Array.isArray(order.hand_reports) ? order.hand_reports.join(", ") : (order.hand_reports || "");
    document.getElementById("repLabCostInput").value = order.lab_cost || "";
    document.getElementById("reportUploadModal").classList.add("active");
}

async function submitOrderReport() {
    if (currentStaff.role !== "super_admin" && currentStaff.role !== "report_staff") return;
    const docId = document.getElementById("repModalOrderDocId").value;
    const order = allBookings.find(b => b.docId === docId);
    if (!order) return;

    const fileInput = document.getElementById("repPdfFileInput");
    let finalReportUrl = document.getElementById("repExternalUrlInput").value.trim();
    const handNote = document.getElementById("repHandNoteInput").value.trim();
    const labCost = Number(document.getElementById("repLabCostInput").value || order.lab_cost || 0);

    if ((!fileInput.files || fileInput.files.length === 0) && !finalReportUrl && !handNote) {
        return showMsg("Please upload a Report PDF, paste a report link, or enter a physical report note.", "Missing Report");
    }

    const btn = document.getElementById("btnSubmitReport");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading & Sending...';
    btn.disabled = true;

    try {
        if (fileInput.files && fileInput.files.length > 0) {
            if (!storage) throw new Error("Storage service unavailable.");
            const file = fileInput.files[0];
            const safeName = `${order.order_id || docId}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
            const storageRef = storage.ref().child(`reports/${safeName}`);
            const uploadSnap = await storageRef.put(file);
            finalReportUrl = await uploadSnap.ref.getDownloadURL();
        }

        const updateData = {
            status: "Completed",
            lab_cost: labCost,
            report_uploaded_by: `${currentStaff.name} (${currentStaff.email})`,
            completed_at: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (finalReportUrl) {
            updateData.report_url = finalReportUrl;
            updateData.report_pdf = [finalReportUrl];
        }
        if (handNote) updateData.hand_reports = [handNote];

        await db.collection("bookings").doc(docId).update(updateData);

        const patientEmail = order.email || "";
        const itemsList = (Array.isArray(order.cart_items) ? order.cart_items : []).map(i => i.service_name).join(", ") || "Diagnostic Tests";

        if (patientEmail && patientEmail.includes("@")) {
            await sendAutoEmail({
                type: "report",
                replyTo: "report@bhavyadiagnostics.com",
                to: patientEmail,
                subject: `Your Diagnostic Report is Ready (#${order.order_id || docId}) - Bhavya Diagnostics`,
                html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                        <div style="background:#0056b3;color:white;padding:18px 24px;">
                            <h2 style="margin:0;font-size:20px;">Bhavya Diagnostics — Digital Lab Report</h2>
                            <p style="margin:4px 0 0;font-size:13px;">Order ID: <b>#${escapeHtml(order.order_id || docId)}</b></p>
                        </div>
                        <div style="padding:22px 24px;color:#1e293b;">
                            <p>Dear <b>${escapeHtml(order.patient_name || "Patient")}</b>,</p>
                            <p>Your diagnostic report for <b>${escapeHtml(itemsList)}</b> is now ready.</p>
                            ${finalReportUrl ? `<p style="margin:20px 0;"><a href="${escapeHtml(finalReportUrl)}" style="background:#10b981;color:white;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">📄 Download Report PDF</a></p>` : ""}
                            ${handNote ? `<p style="background:#fffbeb;padding:10px;border-radius:8px;color:#92400e;font-size:13px;"><b>Physical Report Note:</b> ${escapeHtml(handNote)}</p>` : ""}
                            <p style="font-size:12px;color:#64748b;">Bhavya Diagnostics • Main Jhajjar Road, Opp. Narendra Farm, Bahadurgarh • Helpline: 89501 12467</p>
                        </div>
                       </div>`
            });
        }

        closeAllModals();
        showAdminToast("✅ Report uploaded & emailed to patient!", "success");
    } catch (err) {
        showMsg("Report Upload Error: " + err.message, "Upload Failed");
    } finally {
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Save Report &amp; Email Patient';
        btn.disabled = false;
    }
}

// =======================================================
// 6. WALK-IN / HEALTH CAMP QUICK ENTRY (NO OTP REQUIRED)
// =======================================================
function openWalkinModal() {
    walkinSelectedItems = [];
    document.getElementById("wkName").value = "";
    document.getElementById("wkMobile").value = "";
    document.getElementById("wkEmail").value = "";
    document.getElementById("wkTestSearch").value = "";
    document.getElementById("wkDiscount").value = "0";
    document.getElementById("wkSearchResults").style.display = "none";
    renderWalkinSelected();
    document.getElementById("walkinModal").classList.add("active");
}

function searchWalkinServices() {
    const q = document.getElementById("wkTestSearch").value.toLowerCase().trim();
    const box = document.getElementById("wkSearchResults");
    if (!q || q.length < 2) { box.style.display = "none"; return; }

    const matches = allCatalogServices.filter(s => {
        const blob = `${s.service_name || ""} ${s.second_name || ""} ${s.service_id || ""}`.toLowerCase();
        return blob.includes(q);
    }).slice(0, 12);

    if (matches.length === 0) {
        box.innerHTML = `<div style="padding:10px; color:#64748b; text-align:center;">No tests found.</div>`;
        box.style.display = "block";
        return;
    }

    box.innerHTML = matches.map(s => {
        const price = Number(s.basic_price || s.service_price || 0);
        const sid = String(s.service_id).replace(/'/g, "\\'");
        return `<div class="walkin-res-row">
                    <span><strong>${escapeHtml(s.service_name)}</strong> <small style="color:#64748b;">(₹${price})</small></span>
                    <button type="button" class="btn-act btn-blue" onclick="addWalkinTest('${sid}')">+ Add</button>
                </div>`;
    }).join("");
    box.style.display = "block";
}

function addWalkinTest(serviceId) {
    const svc = allCatalogServices.find(s => String(s.service_id) === String(serviceId));
    if (!svc) return;
    if (walkinSelectedItems.some(i => String(i.service_id) === String(serviceId))) return;

    walkinSelectedItems.push({
        service_id: String(svc.service_id),
        service_name: svc.service_name,
        price: Number(svc.basic_price || svc.service_price || 0),
        basic_price: Number(svc.basic_price || svc.service_price || 0),
        mrp_price: Number(svc.service_price || svc.basic_price || 0),
        qty: 1,
        service_type: svc.service_type || "pathology",
        selected_lab_name: String(svc.labs || "Bhavya Diagnostics").split(",")[0].trim(),
        fulfillment: "center",
        lab_cost: Number(svc.lab_cost || 0)
    });
    document.getElementById("wkTestSearch").value = "";
    document.getElementById("wkSearchResults").style.display = "none";
    renderWalkinSelected();
}

function removeWalkinTest(idx) {
    walkinSelectedItems.splice(idx, 1);
    renderWalkinSelected();
}

function renderWalkinSelected() {
    const box = document.getElementById("wkSelectedList");
    const disc = Number(document.getElementById("wkDiscount").value || 0);
    let sub = 0;

    if (walkinSelectedItems.length === 0) {
        box.innerHTML = `<span style="color:#64748b;">No tests added yet.</span>`;
        document.getElementById("wkFinalTotal").innerText = "0";
        return;
    }

    box.innerHTML = walkinSelectedItems.map((it, idx) => {
        sub += Number(it.price || 0);
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px dashed #e2e8f0;">
                    <span><b>${escapeHtml(it.service_name)}</b> — ₹${it.price}</span>
                    <button type="button" onclick="removeWalkinTest(${idx})" style="border:none; background:#fee2e2; color:#dc2626; border-radius:6px; padding:3px 8px; cursor:pointer; font-weight:800;">✖</button>
                </div>`;
    }).join("");

    document.getElementById("wkFinalTotal").innerText = Math.max(0, sub - disc);
}

async function submitWalkinBooking() {
    const name = document.getElementById("wkName").value.trim();
    const mobile = document.getElementById("wkMobile").value.trim().replace(/\D/g, "");
    const email = document.getElementById("wkEmail").value.trim().toLowerCase();
    const source = document.getElementById("wkSource").value;
    const disc = Number(document.getElementById("wkDiscount").value || 0);
    const paySel = document.getElementById("wkPayStatus").value;

    if (!name || walkinSelectedItems.length === 0) {
        return showMsg("Please enter Patient Name and select at least one test/package.", "Incomplete Entry");
    }

    const btn = document.getElementById("btnSaveWalkin");
    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        const prefix = source === "camp" ? "CMP-" : "WLK-";
        const orderId = prefix + Date.now().toString().slice(-6);
        const subtotal = walkinSelectedItems.reduce((s, i) => s + Number(i.price || 0), 0);
        const totalLabCost = walkinSelectedItems.reduce((s, i) => s + Number(i.lab_cost || 0), 0);
        const finalTotal = Math.max(0, subtotal - disc);

        const payStatus = paySel === "DUE" ? "DUE" : "PAID";
        const payMethod = paySel === "PAID_CASH" ? "Cash" : (paySel === "PAID_UPI" ? "UPI" : "Pending");

        await db.collection("bookings").doc(orderId).set({
            order_id: orderId,
            uid: "",
            user_id: source.toUpperCase(),
            booking_source: source,
            patient_name: name,
            mobile: mobile,
            email: email,
            address: source === "camp" ? "Health Camp Entry" : "Walk-in Collection Center",
            city: "Bahadurgarh",
            pincode: "124507",
            cart_items: walkinSelectedItems,
            fulfillment: "center",
            slot: new Date().toLocaleDateString("en-IN"),
            subtotal: subtotal,
            total_discount: disc,
            final_total: finalTotal,
            lab_cost: totalLabCost,
            payment_status: payStatus,
            payment_method: payMethod,
            status: "Sample Collected",
            sample_collected_by: currentStaff.name,
            report_url: "",
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        closeAllModals();
        showAdminToast(`✅ Entry #${orderId} saved!`, "success");
    } catch (err) {
        showMsg("Error saving entry: " + err.message, "Error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Save Walk-in / Camp Entry';
    }
}

// =======================================================
// 7. TRIPLE PROTECTION RE-TEST REQUESTS TAB
// =======================================================
function renderRetestsTable() {
    const tbody = document.getElementById("retestsTableBody");
    const badge = document.getElementById("retestCountBadge");

    const pendingCount = allRetestRequests.filter(r => String(r.status || "pending").toLowerCase() === "pending").length;
    if (badge) {
        badge.innerText = pendingCount;
        badge.style.display = pendingCount > 0 ? "inline-block" : "none";
    }

    if (!tbody) return;
    const filter = (document.getElementById("retestStatusFilter")?.value || "ALL").toLowerCase();
    const list = allRetestRequests.filter(r => filter === "all" || String(r.status || "pending").toLowerCase() === filter);

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:26px; color:#64748b;">No re-test requests found.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(r => {
        const st = String(r.status || "Pending").toLowerCase();
        const bCls = st === "completed" ? "b-completed" : (st === "rejected" ? "b-cancelled" : (st === "approved" ? "b-confirmed" : "b-pending"));
        return `
        <tr>
            <td><strong>#${escapeHtml(r.order_id || "-")}</strong><br><small style="color:#64748b;">${formatDateDisplay(r.created_at)}</small></td>
            <td><strong>${escapeHtml(r.patient_name || "Patient")}</strong><br><small>📞 ${escapeHtml(r.mobile || "-")}</small></td>
            <td><strong>${escapeHtml(r.test_name || "-")}</strong></td>
            <td style="max-width:260px;"><small>${escapeHtml(r.reason || "-")}</small></td>
            <td><span class="badge ${bCls}">${escapeHtml(r.status || "Pending")}</span>${r.admin_remarks ? `<br><small style="color:#64748b;">${escapeHtml(r.admin_remarks)}</small>` : ""}</td>
            <td>
                ${st === "pending" ? `<button class="btn-act btn-blue" onclick="updateRetestStatus('${escapeHtml(r.docId)}', 'Approved')">Approve</button>` : ""}
                ${st !== "completed" && st !== "rejected" ? `<button class="btn-act btn-green" onclick="updateRetestStatus('${escapeHtml(r.docId)}', 'Completed')">Complete</button>` : ""}
                ${st === "pending" ? `<button class="btn-act btn-red" onclick="updateRetestStatus('${escapeHtml(r.docId)}', 'Rejected')">Reject</button>` : ""}
            </td>
        </tr>`;
    }).join("");
}

async function updateRetestStatus(docId, newStatus) {
    const req = allRetestRequests.find(r => r.docId === docId);
    const remarks = prompt(`Enter remarks for marking Re-test Request as ${newStatus} (optional):`) || "";

    await db.collection("retest_requests").doc(docId).update({
        status: newStatus,
        admin_remarks: remarks,
        handled_by: currentStaff.name,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (req && req.email && req.email.includes("@")) {
        await sendAutoEmail({
            type: "report",
            to: req.email,
            subject: `Triple Protection Re-test Update (#${req.order_id}) - ${newStatus}`,
            html: `<p>Dear <b>${escapeHtml(req.patient_name || "Patient")}</b>,</p>
                   <p>Your Triple Protection re-test request for <b>${escapeHtml(req.test_name || "")}</b> (Order #${escapeHtml(req.order_id || "")}) has been updated to: <b>${escapeHtml(newStatus)}</b>.</p>
                   ${remarks ? `<p><b>Team Remarks:</b> ${escapeHtml(remarks)}</p>` : ""}`
        });
    }
    showAdminToast(`Re-test marked ${newStatus}`, "success");
}

// =======================================================
// 8. PATIENTS & VIP APPROVALS + AUTO-REVERT TO BASIC RATES
// =======================================================
function switchPatientSubTab(sub) {
    document.getElementById("subtab-vip").classList.toggle("active", sub === "vip");
    document.getElementById("subtab-allpatients").classList.toggle("active", sub === "allpatients");
    document.getElementById("subpanel-vip").style.display = sub === "vip" ? "block" : "none";
    document.getElementById("subpanel-allpatients").style.display = sub === "allpatients" ? "block" : "none";
}

function renderVipTable() {
    const tbody = document.getElementById("vipTableBody");
    if (!tbody) return;

    const filter = document.getElementById("vipStatusFilter").value.toLowerCase();
    const list = allVipRequests.filter(v => filter === "all" || String(v.status || "pending").toLowerCase() === filter);

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748b;">No VIP applications found.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(v => {
        const st = String(v.status || "pending").toLowerCase();
        const badge = st === "active" ? `<span class="badge b-completed">Active</span>` : (st === "rejected" ? `<span class="badge b-cancelled">Rejected</span>` : `<span class="badge b-pending">Pending</span>`);
        const members = Array.isArray(v.members) ? v.members.join(", ") : (v.patient_name || "-");
        const mCount = Number(v.member_count || (Array.isArray(v.members) ? v.members.length : 1));
        const ssHtml = v.payment_screenshot ? `<button class="btn-act btn-gray" onclick="viewBase64Image('${escapeHtml(v.uid)}')"><i class="fas fa-image"></i> View SS</button>` : "";
        const validity = (v.start_date && v.end_date) ? `${v.start_date} to ${v.end_date}` : "Not Started";

        let actBtn = "";
        if (st === "pending") {
            actBtn = `<button class="btn-act btn-blue" onclick="openVipReviewModal('${escapeHtml(v.uid)}')">Review / Approve</button>`;
        } else if (st === "active") {
            actBtn = `<button class="btn-act btn-red" onclick="openVipReviewModal('${escapeHtml(v.uid)}')">Unapprove / Revert</button>`;
        } else {
            actBtn = `<small style="color:#64748b;">${escapeHtml(v.admin_remarks || "Rejected")}</small>`;
        }

        const codeInfo = v.promo_code_used ? `Promo: <b>${escapeHtml(v.promo_code_used)}</b>` : (v.referrer_user_id ? `Ref: <b>${escapeHtml(v.referrer_user_id)}</b>` : "None");

        return `
        <tr>
            <td><strong>${escapeHtml(v.user_id || v.uid.slice(0, 8))}</strong></td>
            <td><strong>${escapeHtml(v.patient_name || "-")}</strong> <span class="badge b-confirmed">${mCount}M</span><br><small>Members: ${escapeHtml(members)}</small></td>
            <td><small>${codeInfo}</small></td>
            <td><strong>${escapeHtml(v.payment_mode_label || String(v.payment_mode || "online").toUpperCase())}</strong><br><small>UTR: ${escapeHtml(v.payment_id || "-")}</small><br>${ssHtml}</td>
            <td><strong style="color:var(--success);">₹${Number(v.amount_paid || 0)}</strong></td>
            <td>${badge}<br><small style="color:#64748b;">${escapeHtml(validity)}</small></td>
            <td>${actBtn}</td>
        </tr>`;
    }).join("");
}

function viewBase64Image(uid) {
    const req = allVipRequests.find(v => v.uid === uid);
    if (!req || !req.payment_screenshot) return;
    const win = window.open("");
    win.document.write(`<img src="${req.payment_screenshot}" style="max-width:100%;">`);
}

function openVipReviewModal(uid) {
    if (!hasTabAccess("patients")) return;
    const req = allVipRequests.find(v => v.uid === uid);
    if (!req) return;
    document.getElementById("vipModalUid").value = uid;
    document.getElementById("vipModalApplicant").innerText = `${req.patient_name} (${req.user_id || uid}) — ₹${req.amount_paid}`;
    document.getElementById("vipModalRemarks").value = req.admin_remarks || "";
    const ssBox = document.getElementById("vipModalScreenshotBox");
    ssBox.innerHTML = req.payment_screenshot ? `<img src="${req.payment_screenshot}" style="max-height:200px; border-radius:10px; border:1px solid #cbd5e1;">` : "";
    document.getElementById("vipActionModal").classList.add("active");
}

// Auto-Revert Patient's Uncompleted VIP-Rate Bookings back to Standard Basic Rates
async function revertPatientBookingsToBasic(uid, patientEmail, patientName) {
    const snap = await db.collection("bookings").where("uid", "==", uid).get();
    let revertedCount = 0;

    const freeLimitBasic = Number(sheetRules.free_collection_limit_basic || 300);
    const homeChargeRule = Number(sheetRules.home_collection_charge || 50);

    for (const doc of snap.docs) {
        const b = doc.data();
        const st = String(b.status || "").toLowerCase();
        if (st.includes("complete") || st.includes("cancel") || b.reverted_to_basic) continue;

        const tier = String(b.pricing_tier || "").toLowerCase();
        const wasVipPriced = (tier === "pending" || tier === "vip" || b.is_vip_pending_booking === true);
        if (!wasVipPriced) continue;

        const items = Array.isArray(b.cart_items) ? b.cart_items : [];
        let newSubtotal = 0;
        const updatedItems = items.map(item => {
            const isSurprise = String(item.service_type || "").toLowerCase().includes("surprise") || String(item.service_id || "").startsWith("SURP-");
            if (isSurprise) {
                newSubtotal += Number(item.price || 100) * Number(item.qty || 1);
                return item;
            }
            const liveSvc = allCatalogServices.find(s => String(s.service_id) === String(item.service_id));
            const basicRate = Number(item.basic_price || (liveSvc ? (liveSvc.basic_price || liveSvc.service_price) : item.price) || item.price);
            newSubtotal += basicRate * Number(item.qty || 1);
            return { ...item, price: basicRate };
        });

        const isHome = b.fulfillment === "home" || updatedItems.some(i => i.fulfillment === "home");
        const newCollectionCharge = (isHome && newSubtotal < freeLimitBasic) ? homeChargeRule : 0;
        const existingDiscount = Number(b.total_discount || 0);
        const newFinalTotal = Math.max(0, newSubtotal + newCollectionCharge - existingDiscount);

        await db.collection("bookings").doc(doc.id).update({
            cart_items: updatedItems,
            subtotal: newSubtotal,
            collection_charge: newCollectionCharge,
            final_total: newFinalTotal,
            pricing_tier: "basic",
            is_vip_pending_booking: false,
            reverted_to_basic: true,
            reverted_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        revertedCount++;
    }

    if (revertedCount > 0 && patientEmail && patientEmail.includes("@")) {
        await sendAutoEmail({
            type: "booking",
            to: patientEmail,
            subject: "Booking Prices Updated to Standard Basic Rates - Bhavya Diagnostics",
            html: `<p>Dear <b>${escapeHtml(patientName || "Patient")}</b>,</p>
                   <p>Since your VIP Membership was not activated/approved, <b>${revertedCount}</b> pending booking(s) have been updated from VIP rates to <b>Standard Basic rates</b> as per policy.</p>`
        });
    }
    return revertedCount;
}

async function processVipApproval(newStatus) {
    if (!hasTabAccess("patients")) return;
    const uid = document.getElementById("vipModalUid").value;
    const remarks = document.getElementById("vipModalRemarks").value.trim();
    const req = allVipRequests.find(v => v.uid === uid);
    if (!req) return;

    if (newStatus === "rejected" && !remarks) {
        return showMsg("Please enter Admin Remarks (reason) before rejecting / unapproving.", "Remarks Required");
    }

    const btnA = document.getElementById("btnApproveVip");
    const btnR = document.getElementById("btnRejectVip");
    btnA.disabled = true; btnR.disabled = true;

    try {
        const patientRef = db.collection("patients").doc(uid);
        const pSnap = await patientRef.get();
        const pData = pSnap.exists ? pSnap.data() : {};

        if (newStatus === "active") {
            const today = new Date();
            const end = new Date();
            end.setFullYear(today.getFullYear() + 1);
            const startStr = today.toLocaleDateString("en-GB");
            const endStr = end.toLocaleDateString("en-GB");

            const vipCashback = getVipCashbackRuleAmount();
            const vipRefBonus = getVipReferralRuleAmount();
            const memberCount = Number(req.member_count || (Array.isArray(req.members) ? req.members.length : 1) || 1);

            const curWallet = Number(pData.current_wallet_balance ?? pData.wallet_balance ?? 0);
            const alreadyActive = String(req.status || "").toLowerCase() === "active";
            const updatedWallet = alreadyActive ? curWallet : (curWallet + vipCashback);

            await patientRef.set({
                current_plan_status: "vip",
                plan: "vip",
                isVip: true,
                vip_member_count: memberCount,
                vip_blood_pkg_remaining: pData.vip_blood_pkg_remaining !== undefined ? pData.vip_blood_pkg_remaining : memberCount,
                vip_ecg_pft_pkg_remaining: pData.vip_ecg_pft_pkg_remaining !== undefined ? pData.vip_ecg_pft_pkg_remaining : memberCount,
                current_wallet_balance: updatedWallet,
                wallet_balance: updatedWallet,
                vip_details: {
                    ...(pData.vip_details || {}),
                    start_date: startStr,
                    end_date: endStr,
                    member_count: memberCount,
                    admin_remarks: remarks || "Approved",
                    vip_status: "active"
                }
            }, { merge: true });

            await db.collection("vip_requests").doc(uid).update({
                status: "active",
                start_date: startStr,
                end_date: endStr,
                admin_remarks: remarks || "Approved",
                approved_by: currentStaff.name,
                approved_at: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (!alreadyActive) {
                await db.collection("wallet_transactions").add({
                    uid: uid,
                    user_id: req.user_id || uid,
                    type: "credit",
                    amount: vipCashback,
                    description: "VIP Membership Activation Cashback",
                    reference: "VIP-APPROVAL",
                    created_at: firebase.firestore.FieldValue.serverTimestamp()
                });

                if (req.referrer_uid || req.referrer_user_id) {
                    let refDocSnap = null;
                    if (req.referrer_uid) {
                        const s = await db.collection("patients").doc(req.referrer_uid).get();
                        if (s.exists) refDocSnap = s;
                    } else if (req.referrer_user_id) {
                        const q = await db.collection("patients").where("user_id", "==", req.referrer_user_id).limit(1).get();
                        if (!q.empty) refDocSnap = q.docs[0];
                    }

                    if (refDocSnap && refDocSnap.id !== uid) {
                        const rData = refDocSnap.data();
                        const rCur = Number(rData.current_wallet_balance ?? rData.wallet_balance ?? 0);
                        await db.collection("patients").doc(refDocSnap.id).update({
                            current_wallet_balance: rCur + vipRefBonus,
                            wallet_balance: rCur + vipRefBonus
                        });
                        await db.collection("wallet_transactions").add({
                            uid: refDocSnap.id,
                            user_id: rData.user_id || refDocSnap.id,
                            type: "credit",
                            amount: vipRefBonus,
                            description: `VIP Referral Bonus from ${req.patient_name}`,
                            reference: req.user_id || uid,
                            created_at: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
            }

            if (req.email && req.email.includes("@")) {
                await sendAutoEmail({
                    type: "contact",
                    to: req.email,
                    subject: "🎉 Bhavya VIP Membership Activated!",
                    html: `<p>Dear <b>${escapeHtml(req.patient_name)}</b>,</p>
                           <p>Your <b>Bhavya VIP Membership (${memberCount} Member${memberCount > 1 ? "s" : ""})</b> is now <b>ACTIVE</b> (${startStr} to ${endStr})!</p>
                           <p>₹${vipCashback} VIP Activation Cashback has been credited to your wallet, and your complimentary Blood Package + ECG/PFT/50+ Body Parameters are unlocked on your dashboard.</p>`
                });
            }

            showAdminToast(`✅ VIP Approved! ₹${vipCashback} cashback credited.`, "success");
        } else {
            // REJECT / UNAPPROVE -> Revert Patient Plan + Revert Pending Bookings to Basic Rates
            await patientRef.set({
                current_plan_status: "basic",
                plan: "basic",
                isVip: false,
                vip_blood_pkg_remaining: 0,
                vip_ecg_pft_pkg_remaining: 0,
                vip_details: { ...(pData.vip_details || {}), vip_status: "rejected", admin_remarks: remarks }
            }, { merge: true });

            await db.collection("vip_requests").doc(uid).update({
                status: "rejected",
                admin_remarks: remarks,
                rejected_by: currentStaff.name,
                updated_at: firebase.firestore.FieldValue.serverTimestamp()
            });

            const revertedCount = await revertPatientBookingsToBasic(uid, req.email || pData.email, req.patient_name || pData.name);

            if (req.email && req.email.includes("@")) {
                await sendAutoEmail({
                    type: "contact",
                    to: req.email,
                    subject: "VIP Membership Application Update - Bhavya Diagnostics",
                    html: `<p>Dear <b>${escapeHtml(req.patient_name)}</b>,</p><p>Your VIP Membership was not approved / revoked. <b>Reason:</b> ${escapeHtml(remarks)}</p>`
                });
            }
            showAdminToast(`VIP Unapproved. ${revertedCount} booking(s) reverted to Basic rates.`, "error");
        }

        closeAllModals();
    } catch (err) {
        showMsg("Error processing VIP action: " + err.message, "Error");
    } finally {
        btnA.disabled = false; btnR.disabled = false;
    }
}

function renderPatientsMasterTable() {
    const tbody = document.getElementById("patientsMasterBody");
    if (!tbody) return;

    const search = (document.getElementById("patientMasterSearch")?.value || "").toLowerCase().trim();
    const list = allPatients.filter(p => {
        if (!search) return true;
        const hay = `${p.name || p.patient_name || ""} ${p.user_id || ""} ${p.mobile || p.mobile_number || ""}`.toLowerCase();
        return hay.includes(search);
    });

    const isSuperAdmin = currentStaff.role === "super_admin";

    tbody.innerHTML = list.map(p => {
        const name = p.name || p.patient_name || "Patient";
        const mobile = p.mobile || p.mobile_number || "-";
        const wallet = Number(p.current_wallet_balance ?? p.wallet_balance ?? 0);
        const plan = String(p.current_plan_status || p.plan || "basic").toUpperCase();
        const wStatus = String(p.withdraw || "inactive").toLowerCase();
        const aStatus = String(p.status || "active").toLowerCase();
        const avatar = (p.image && String(p.image).startsWith("data:image")) ? p.image : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e6f0fa&color=0056b3`;

        return `
        <tr>
            <td><img src="${avatar}" class="patient-avatar" alt="Pic"></td>
            <td><strong>${escapeHtml(p.user_id || p.uid.slice(0, 8))}</strong></td>
            <td><strong>${escapeHtml(name)}</strong><br><small>📞 ${escapeHtml(mobile)}</small><br><small style="color:#64748b;">${escapeHtml(p.email || "")}</small></td>
            <td><small>${escapeHtml([p.address, p.city, p.pincode].filter(Boolean).join(", ") || "Not Provided")}</small></td>
            <td><strong style="color:var(--success); font-size:14.5px;">₹${wallet}</strong></td>
            <td><span class="badge ${plan === 'VIP' ? 'b-completed' : 'b-confirmed'}">${escapeHtml(plan)}</span></td>
            <td><button class="btn-act ${wStatus === 'active' ? 'btn-green' : 'btn-red'}" ${!isSuperAdmin ? 'disabled' : ''} onclick="togglePatientField('${escapeHtml(p.uid)}', 'withdraw', '${wStatus}')">${wStatus.toUpperCase()}</button></td>
            <td><button class="btn-act ${aStatus === 'active' ? 'btn-green' : 'btn-red'}" ${!isSuperAdmin ? 'disabled' : ''} onclick="togglePatientField('${escapeHtml(p.uid)}', 'status', '${aStatus}')">${aStatus.toUpperCase()}</button></td>
            <td>${isSuperAdmin ? `<button class="btn-act btn-blue" onclick="openWalletAdjustModal('${escapeHtml(p.uid)}')"><i class="fas fa-wallet"></i> +/- Wallet</button>` : `<small style="color:#64748b;">View Only</small>`}</td>
        </tr>`;
    }).join("");
}

async function togglePatientField(uid, field, curVal) {
    if (currentStaff.role !== "super_admin") return;
    const nextVal = curVal === "active" ? "inactive" : "active";
    if (!confirm(`Change ${field.toUpperCase()} to ${nextVal.toUpperCase()}?`)) return;
    await db.collection("patients").doc(uid).update({ [field]: nextVal });
    showAdminToast(`Updated ${field} to ${nextVal}`, "success");
}

function openWalletAdjustModal(uid) {
    if (currentStaff.role !== "super_admin") return;
    const p = allPatients.find(x => x.uid === uid);
    if (!p) return;
    document.getElementById("walModalUid").value = uid;
    document.getElementById("walModalPatientName").innerText = p.name || p.patient_name || "Patient";
    document.getElementById("walModalCurrentBal").innerText = Number(p.current_wallet_balance ?? p.wallet_balance ?? 0);
    document.getElementById("walModalAmount").value = "";
    document.getElementById("walModalReason").value = "";
    document.getElementById("walletModal").classList.add("active");
}

async function submitAdminWalletAdjustment() {
    if (currentStaff.role !== "super_admin") return;
    const uid = document.getElementById("walModalUid").value;
    const type = document.getElementById("walModalType").value;
    const amt = Number(document.getElementById("walModalAmount").value || 0);
    const reason = document.getElementById("walModalReason").value.trim();

    if (amt <= 0 || !reason) return showMsg("Enter valid amount and reason.", "Invalid Input");

    const pRef = db.collection("patients").doc(uid);
    const snap = await pRef.get();
    if (!snap.exists) return;

    const pData = snap.data();
    const cur = Number(pData.current_wallet_balance ?? pData.wallet_balance ?? 0);
    const nextBal = type === "credit" ? (cur + amt) : Math.max(0, cur - amt);

    await pRef.update({ current_wallet_balance: nextBal, wallet_balance: nextBal });
    await db.collection("wallet_transactions").add({
        uid: uid,
        user_id: pData.user_id || uid,
        type: type,
        amount: amt,
        description: `Admin ${type === "credit" ? "Added" : "Deducted"}: ${reason}`,
        reference: currentStaff.name,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
    });

    closeAllModals();
    showAdminToast("Wallet updated successfully!", "success");
}

// =======================================================
// 9. CAMP PROMO CODE MANAGER (SUPER ADMIN ONLY)
// =======================================================
function renderPromoTable() {
    const tbody = document.getElementById("promoTableBody");
    if (!tbody) return;

    if (allPromoCodes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">No camp promo codes created yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = allPromoCodes.map(p => {
        const isActive = String(p.status || "inactive").toLowerCase() === "active";
        const discTxt = p.discount_type === "percent" ? `${p.discount_value}% OFF` : `₹${p.discount_value} OFF`;
        return `
        <tr>
            <td><strong style="color:var(--primary); letter-spacing:0.5px;">${escapeHtml(p.code)}</strong></td>
            <td><span class="badge b-confirmed">${escapeHtml(String(p.apply_on || "all").toUpperCase())}</span></td>
            <td><strong>${escapeHtml(discTxt)}</strong><br><small style="color:#64748b;">Min: ₹${Number(p.min_order || 0)}</small></td>
            <td><strong>${Number(p.used_count || 0)}</strong></td>
            <td><span class="badge ${isActive ? "b-completed" : "b-cancelled"}">${isActive ? "ACTIVE" : "INACTIVE"}</span></td>
            <td>
                <button class="btn-act ${isActive ? "btn-amber" : "btn-green"}" onclick="togglePromoStatus('${escapeHtml(p.code)}', '${isActive ? "inactive" : "active"}')">${isActive ? "Turn OFF" : "Turn ON"}</button>
                <button class="btn-act btn-red" onclick="deletePromoCode('${escapeHtml(p.code)}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join("");
}

async function savePromoCode() {
    if (currentStaff.role !== "super_admin") return;
    const code = document.getElementById("promoCodeInput").value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const applyOn = document.getElementById("promoApplyOn").value;
    const discType = document.getElementById("promoDiscType").value;
    const discVal = Number(document.getElementById("promoDiscVal").value || 0);
    const minOrder = Number(document.getElementById("promoMinOrder").value || 0);

    if (!code || discVal <= 0) return showMsg("Enter a valid Promo Code and Discount Value.", "Invalid Input");

    await db.collection("promo_codes").doc(code).set({
        code: code,
        apply_on: applyOn,
        discount_type: discType,
        discount_value: discVal,
        min_order: minOrder,
        status: "active",
        used_count: 0,
        created_by: currentStaff.email,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    document.getElementById("promoCodeInput").value = "";
    document.getElementById("promoDiscVal").value = "";
    showAdminToast(`✅ Promo Code ${code} Activated!`, "success");
}

async function togglePromoStatus(code, nextStatus) {
    if (currentStaff.role !== "super_admin") return;
    await db.collection("promo_codes").doc(code).update({ status: nextStatus });
    showAdminToast(`Code ${code} set to ${nextStatus.toUpperCase()}`, "success");
}

async function deletePromoCode(code) {
    if (currentStaff.role !== "super_admin") return;
    if (!confirm(`Delete promo code ${code}?`)) return;
    await db.collection("promo_codes").doc(code).delete();
    showAdminToast(`Deleted ${code}`, "error");
}

// =======================================================
// 10. WALLET & WITHDRAWALS (SUPER ADMIN ONLY)
// =======================================================
function switchWithdrawSubTab(sub) {
    currentWithdrawSub = sub;
    document.getElementById("subtab-kyc").classList.toggle("active", sub === "kyc");
    document.getElementById("subtab-payouts").classList.toggle("active", sub === "payouts");
    renderWithdrawalsTable();
}

function renderWithdrawalsTable() {
    const thead = document.getElementById("withdrawTableHead");
    const tbody = document.getElementById("withdrawTableBody");
    const filter = document.getElementById("withdrawStatusFilter").value;
    if (!thead || !tbody) return;

    if (currentWithdrawSub === "kyc") {
        thead.innerHTML = `<tr><th>Date</th><th>User ID</th><th>Name &amp; Profession</th><th>UPI / QR</th><th>Status</th><th>Action</th></tr>`;
        const list = allKycProfiles.filter(item => {
            if (filter === "ALL") return true;
            const st = String(item.status || "Pending").toLowerCase();
            return filter === "Pending" ? st === "pending" : (st === "approved" || st === "paid");
        });

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">No KYC requests found.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(req => {
            const st = String(req.status || "Pending");
            const isApproved = st.toLowerCase() === "approved";
            return `
            <tr>
                <td>${formatDateDisplay(req.created_at || req.timestamp)}</td>
                <td><strong>${escapeHtml(req.user_id || req.userId || "-")}</strong></td>
                <td><strong>${escapeHtml(req.full_name || req.fullName || "-")}</strong><br><small>${escapeHtml(req.profession || "")}</small></td>
                <td>UPI: <strong>${escapeHtml(req.upi_id || req.upiId || "-")}</strong><br><small>${req.user_image ? `<a href="${escapeHtml(req.user_image)}" target="_blank">Photo</a> | ` : ""}${req.prof_doc ? `<a href="${escapeHtml(req.prof_doc)}" target="_blank">Doc</a> | ` : ""}${req.qr_code ? `<a href="${escapeHtml(req.qr_code)}" target="_blank">QR</a>` : ""}</small></td>
                <td><span class="badge ${isApproved ? "b-completed" : "b-pending"}">${escapeHtml(st)}</span></td>
                <td>${isApproved ? "Approved ✅" : `<button class="btn-act btn-blue" onclick="approveKycProfile('${escapeHtml(req.docId)}', '${escapeHtml(req.uid || "")}')">Approve KYC</button>`}</td>
            </tr>`;
        }).join("");
    } else {
        thead.innerHTML = `<tr><th>Date</th><th>User ID</th><th>Patient Name</th><th>Amount</th><th>Pay To (UPI)</th><th>UTR / Remarks</th><th>Status</th><th>Action</th></tr>`;
        const list = allPayouts.filter(item => {
            if (filter === "ALL") return true;
            const st = String(item.status || "Pending").toLowerCase();
            return filter === "Pending" ? st === "pending" : (st === "approved" || st === "paid");
        });

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748b;">No payout requests found.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(req => {
            const st = String(req.status || "Pending");
            const isPaid = st.toLowerCase() === "paid";
            return `
            <tr>
                <td>${formatDateDisplay(req.created_at || req.timestamp)}</td>
                <td><strong>${escapeHtml(req.user_id || req.userId || "-")}</strong></td>
                <td><strong>${escapeHtml(req.patient_name || req.patientName || "-")}</strong></td>
                <td><strong style="color:var(--danger); font-size:14.5px;">₹${Number(req.amount || 0)}</strong></td>
                <td><strong style="color:var(--primary);">${escapeHtml(req.upi_id || req.upiId || "-")}</strong></td>
                <td>${escapeHtml(req.txn_id || req.remarks || "-")}</td>
                <td><span class="badge ${isPaid ? "b-completed" : "b-pending"}">${escapeHtml(st)}</span></td>
                <td>${isPaid ? "Paid ✅" : `<button class="btn-act btn-green" onclick="markPayoutPaid('${escapeHtml(req.docId)}')">Mark Paid</button>`}</td>
            </tr>`;
        }).join("");
    }
}

async function approveKycProfile(docId, uid) {
    if (currentStaff.role !== "super_admin") return;
    if (!confirm("Approve this KYC profile for wallet withdrawals?")) return;
    await db.collection("withdrawal_profiles").doc(docId).update({ status: "Approved" });
    if (uid) await db.collection("patients").doc(uid).set({ withdraw: "active" }, { merge: true });
    showAdminToast("KYC Approved!", "success");
}

async function markPayoutPaid(docId) {
    if (currentStaff.role !== "super_admin") return;
    const req = allPayouts.find(p => p.docId === docId);
    if (!req) return;
    const txnId = prompt(`Enter UPI Transaction ID / UTR for ₹${req.amount} paid to ${req.patient_name || req.patientName}:`);
    if (!txnId || !txnId.trim()) return;

    await db.collection("payout_requests").doc(docId).update({
        status: "Paid",
        txn_id: txnId.trim(),
        remarks: txnId.trim(),
        paid_at: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (req.email && req.email.includes("@")) {
        await sendAutoEmail({
            type: "contact",
            to: req.email,
            subject: `Wallet Payout of ₹${req.amount} Processed - Bhavya Diagnostics`,
            html: `<p>Dear <b>${escapeHtml(req.patient_name || "Member")}</b>,</p><p>Your withdrawal payout of <b>₹${req.amount}</b> has been transferred to UPI ID <b>${escapeHtml(req.upi_id || "")}</b>.</p><p><b>Transaction UTR:</b> ${escapeHtml(txnId.trim())}</p>`
        });
    }
    showAdminToast("Payout marked as Paid!", "success");
}

// =======================================================
// 11. PRESCRIPTIONS & SUPPORT QUERIES
// =======================================================
function switchSupportSubTab(sub) {
    document.getElementById("subtab-rx").classList.toggle("active", sub === "rx");
    document.getElementById("subtab-tickets").classList.toggle("active", sub === "tickets");
    document.getElementById("subpanel-rx").style.display = sub === "rx" ? "block" : "none";
    document.getElementById("subpanel-tickets").style.display = sub === "tickets" ? "block" : "none";
}

function renderRxAndSupportTables() {
    const rxBody = document.getElementById("rxTableBody");
    const supBody = document.getElementById("supportTableBody");

    if (rxBody) {
        if (allPrescriptions.length === 0) {
            rxBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">No prescriptions uploaded yet.</td></tr>`;
        } else {
            rxBody.innerHTML = allPrescriptions.map(r => {
                const st = String(r.status || "Pending");
                const fileUrl = r.prescription_url || r.file_url || "";
                return `
                <tr>
                    <td><strong>${escapeHtml(r.prescription_id || r.docId)}</strong><br><small>${formatDateDisplay(r.created_at || r.upload_date)}</small></td>
                    <td><strong>${escapeHtml(r.patient_name || r.user_id || "Guest")}</strong><br><small>📞 ${escapeHtml(r.mobile || r.mobile_number || "-")}</small></td>
                    <td>${fileUrl ? `<a href="${escapeHtml(fileUrl)}" target="_blank" style="color:var(--primary); font-weight:700;">View Prescription</a>` : "N/A"}</td>
                    <td><small>${escapeHtml(r.notes || r.patient_notes || "-")}</small></td>
                    <td><span class="badge ${st.toLowerCase() === "completed" ? "b-completed" : "b-pending"}">${escapeHtml(st)}</span></td>
                    <td>${st.toLowerCase() !== "completed" ? `<button class="btn-act btn-green" onclick="markRxCompleted('${escapeHtml(r.docId)}')">Mark Processed</button>` : "Done"}</td>
                </tr>`;
            }).join("");
        }
    }

    if (supBody) {
        if (allSupportQueries.length === 0) {
            supBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">No support tickets found.</td></tr>`;
        } else {
            supBody.innerHTML = allSupportQueries.map(q => {
                const st = String(q.status || "Open");
                return `
                <tr>
                    <td><strong>${escapeHtml(q.ticket_id || q.docId)}</strong><br><small>${formatDateDisplay(q.created_at || q.date)}</small></td>
                    <td><strong>${escapeHtml(q.name || "-")}</strong><br><small>📞 ${escapeHtml(q.mobile || "-")}</small></td>
                    <td><strong>${escapeHtml(q.issue_type || "-")}</strong><br><small>Order: ${escapeHtml(q.order_id || "N/A")}</small></td>
                    <td style="max-width:250px;"><small>${escapeHtml(q.message || "-")}</small></td>
                    <td><span class="badge ${st.toLowerCase() === "resolved" ? "b-completed" : "b-pending"}">${escapeHtml(st)}</span></td>
                    <td>${st.toLowerCase() !== "resolved" ? `<button class="btn-act btn-green" onclick="resolveTicket('${escapeHtml(q.docId)}')">Mark Resolved</button>` : "Resolved"}</td>
                </tr>`;
            }).join("");
        }
    }
}

async function markRxCompleted(docId) {
    await db.collection("prescriptions").doc(docId).update({ status: "Completed" });
    showAdminToast("Prescription marked Processed", "success");
}

async function resolveTicket(docId) {
    await db.collection("support_queries").doc(docId).update({ status: "Resolved" });
    showAdminToast("Ticket Resolved", "success");
}

// =======================================================
// 12. PROFIT & LOSS ACCOUNTING (BUG #1 FIXED: B2B ONLY ON COMPLETED!)
// =======================================================
function toggleCustomPnlDates() {
    const period = document.getElementById("pnlPeriodFilter").value;
    document.getElementById("pnlStartDate").style.display = period === "custom" ? "inline-block" : "none";
    document.getElementById("pnlEndDate").style.display = period === "custom" ? "inline-block" : "none";
}

function isDateInPnlRange(isoDateStr) {
    const period = document.getElementById("pnlPeriodFilter").value;
    if (period === "all") return true;
    if (!isoDateStr) return false;

    const todayIso = new Date().toISOString().split("T")[0];
    if (period === "today") return isoDateStr === todayIso;
    if (period === "month") return isoDateStr.slice(0, 7) === todayIso.slice(0, 7);
    if (period === "custom") {
        const s = document.getElementById("pnlStartDate").value;
        const e = document.getElementById("pnlEndDate").value;
        if (s && isoDateStr < s) return false;
        if (e && isoDateStr > e) return false;
        return true;
    }
    return true;
}

function calculateProfitAndLoss() {
    if (!hasTabAccess("pnl")) return;
    let bookingRev = 0;
    let totalLabCost = 0;

    allBookings.forEach(b => {
        const st = String(b.status || "").toLowerCase();
        if (st.includes("cancel")) return;
        if (!isDateInPnlRange(b.isoDate)) return;

        const isCompleted = st.includes("complete");
        const isPaid = String(b.payment_status || "").toUpperCase().includes("PAID");

        if (isCompleted || isPaid) {
            bookingRev += Number(b.final_total || 0);
        }
        // STRICT FIX: B2B Lab Cost counted ONLY after booking is COMPLETED!
        if (isCompleted) {
            totalLabCost += Number(b.lab_cost || 0);
        }
    });

    let vipRev = 0;
    allVipRequests.forEach(v => {
        if (String(v.status || "").toLowerCase() !== "active") return;
        const vDate = getIsoDateStr(v.approved_at || v.created_at);
        if (!isDateInPnlRange(vDate)) return;
        vipRev += Number(v.amount_paid || 0);
    });

    let totalExp = 0;
    const filteredExpenses = allExpenses.filter(e => isDateInPnlRange(e.date));
    filteredExpenses.forEach(e => { totalExp += Number(e.amount || 0); });

    const totalRevenue = bookingRev + vipRev;
    const netProfit = totalRevenue - (totalLabCost + totalExp);

    document.getElementById("pnlRevenue").innerText = totalRevenue.toLocaleString("en-IN");
    document.getElementById("pnlRevenueBreakup").innerText = `Bookings: ₹${bookingRev.toLocaleString("en-IN")} | VIP: ₹${vipRev.toLocaleString("en-IN")}`;
    document.getElementById("pnlLabCost").innerText = totalLabCost.toLocaleString("en-IN");
    document.getElementById("pnlExpenses").innerText = totalExp.toLocaleString("en-IN");
    document.getElementById("pnlNetProfit").innerText = netProfit.toLocaleString("en-IN");

    const netCard = document.getElementById("pnlNetCard");
    const netValEl = document.getElementById("pnlNetProfit").parentElement;
    const netSub = document.getElementById("pnlNetStatus");

    if (netProfit >= 0) {
        netCard.style.background = "#f0fdf4";
        netCard.style.borderLeftColor = "var(--success)";
        netValEl.style.color = "var(--success)";
        netSub.innerText = "Net Profit after Completed Lab Cost & Expenses";
    } else {
        netCard.style.background = "#fef2f2";
        netCard.style.borderLeftColor = "var(--danger)";
        netValEl.style.color = "var(--danger)";
        netSub.innerText = "Net Loss in selected period";
    }

    const expBody = document.getElementById("expensesTableBody");
    if (expBody) {
        if (filteredExpenses.length === 0) {
            expBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">No expenses recorded for this period.</td></tr>`;
        } else {
            expBody.innerHTML = filteredExpenses.map(e => `
                <tr>
                    <td><strong>${escapeHtml(e.date || "-")}</strong></td>
                    <td><span class="badge b-confirmed">${escapeHtml(e.category || "Expense")}</span></td>
                    <td>${escapeHtml(e.note || "-")}</td>
                    <td><strong style="color:var(--danger);">₹${Number(e.amount || 0)}</strong></td>
                    <td><small>${escapeHtml(e.added_by || "Admin")}</small></td>
                    <td><button class="btn-act btn-red" onclick="deleteClinicExpense('${escapeHtml(e.docId)}')"><i class="fas fa-trash"></i></button></td>
                </tr>`).join("");
        }
    }
}

function openAddExpenseModal() {
    if (currentStaff.role !== "super_admin") return;
    document.getElementById("expDateInput").value = new Date().toISOString().split("T")[0];
    document.getElementById("expAmountInput").value = "";
    document.getElementById("expNoteInput").value = "";
    document.getElementById("expenseModal").classList.add("active");
}

async function saveClinicExpense() {
    if (currentStaff.role !== "super_admin") return;
    const date = document.getElementById("expDateInput").value;
    const category = document.getElementById("expCategoryInput").value;
    const amount = Number(document.getElementById("expAmountInput").value || 0);
    const note = document.getElementById("expNoteInput").value.trim();

    if (!date || amount <= 0) return showMsg("Please enter valid Date and Amount.", "Invalid Input");

    const btn = document.getElementById("btnSaveExpense");
    btn.disabled = true;
    try {
        await db.collection("expenses").add({
            date: date,
            category: category,
            amount: amount,
            note: note,
            added_by: currentStaff.name,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeAllModals();
        showAdminToast("Expense saved!", "success");
    } catch (err) {
        showMsg("Error saving expense: " + err.message, "Error");
    } finally {
        btn.disabled = false;
    }
}

async function deleteClinicExpense(docId) {
    if (currentStaff.role !== "super_admin") return;
    if (!confirm("Delete this expense entry?")) return;
    await db.collection("expenses").doc(docId).delete();
    showAdminToast("Expense deleted", "error");
}

// =======================================================
// 13. STAFF MANAGEMENT & 1-YEAR OLD DATA BACKUP + DELETE
// =======================================================
function renderStaffTable() {
    const tbody = document.getElementById("staffTableBody");
    if (!tbody) return;

    if (allStaffList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:#64748b;">No staff accounts created yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = allStaffList.map(s => {
        const st = String(s.status || "active").toLowerCase();
        return `
        <tr>
            <td><strong>${escapeHtml(s.name || "-")}</strong></td>
            <td>${escapeHtml(s.email)}</td>
            <td>
                <select class="input-ctrl" style="padding:5px 8px; font-size:12px;" onchange="changeStaffRole('${escapeHtml(s.email)}', this.value)">
                    <option value="report_staff" ${s.role === "report_staff" ? "selected" : ""}>Report Team</option>
                    <option value="phlebo_staff" ${s.role === "phlebo_staff" ? "selected" : ""}>Technician / Phlebo</option>
                    <option value="booking_staff" ${s.role === "booking_staff" ? "selected" : ""}>Booking Desk</option>
                    <option value="vip_staff" ${s.role === "vip_staff" ? "selected" : ""}>VIP Desk</option>
                    <option value="super_admin" ${s.role === "super_admin" ? "selected" : ""}>Super Admin</option>
                </select>
            </td>
            <td><span class="badge ${st === "active" ? "b-completed" : "b-cancelled"}">${escapeHtml(st)}</span></td>
            <td>
                <button class="btn-act ${st === "active" ? "btn-red" : "btn-green"}" onclick="toggleStaffStatus('${escapeHtml(s.email)}', '${st}')">
                    ${st === "active" ? "Deactivate" : "Activate"}
                </button>
            </td>
        </tr>`;
    }).join("");
}

async function changeStaffRole(email, newRole) {
    if (currentStaff.role !== "super_admin") return;
    await db.collection("admin_roles").doc(email).update({ role: newRole });
    showAdminToast(`Role updated for ${email}`, "success");
}

async function createStaffAccount() {
    if (currentStaff.role !== "super_admin") return;

    const name = document.getElementById("newStaffName").value.trim();
    const email = document.getElementById("newStaffEmail").value.trim().toLowerCase();
    const pass = document.getElementById("newStaffPass").value.trim();
    const role = document.getElementById("newStaffRole").value;

    if (!name || !email || pass.length < 6) {
        return showMsg("Enter Staff Name, valid Email, and Password (minimum 6 characters).", "Invalid Input");
    }

    const btn = document.getElementById("btnCreateStaff");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    let secondaryApp = null;
    try {
        secondaryApp = firebase.initializeApp(firebaseConfig, "StaffCreator_" + Date.now());
        await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
        await secondaryApp.auth().signOut();

        await db.collection("admin_roles").doc(email).set({
            name: name,
            email: email,
            role: role,
            status: "active",
            created_by: currentStaff.email,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        document.getElementById("newStaffName").value = "";
        document.getElementById("newStaffEmail").value = "";
        document.getElementById("newStaffPass").value = "";

        showMsg(`Staff Account Created!\n\nEmail: ${email}\nPassword: ${pass}\nRole: ${role}`, "✅ Staff Created");
    } catch (err) {
        if (err.code === "auth/email-already-in-use") {
            await db.collection("admin_roles").doc(email).set({
                name: name,
                email: email,
                role: role,
                status: "active"
            }, { merge: true });
            showMsg(`Existing user's role has been updated to: ${role}`, "✅ Role Updated");
        } else {
            showMsg("Error creating staff account: " + err.message, "Error");
        }
    } finally {
        if (secondaryApp) {
            try { await secondaryApp.delete(); } catch (e) {}
        }
        btn.innerHTML = '<i class="fas fa-key"></i> Create / Update Staff Account';
        btn.disabled = false;
    }
}

async function toggleStaffStatus(email, curStatus) {
    if (currentStaff.role !== "super_admin") return;
    const next = curStatus === "active" ? "inactive" : "active";
    if (!confirm(`Set ${email} access to ${next.toUpperCase()}?`)) return;
    await db.collection("admin_roles").doc(email).update({ status: next });
    showAdminToast(`${email} set to ${next.toUpperCase()}`, "success");
}

// =======================================================
// 1-YEAR OLD DATA CSV BACKUP & BATCH DELETE (SUPER ADMIN)
// =======================================================
function getOneYearCutoffMillis() {
    const d = new Date();
    d.setDate(d.getDate() - 365);
    return d.getTime();
}

function scanOldRecords() {
    if (currentStaff.role !== "super_admin") return;
    const cutoff = getOneYearCutoffMillis();
    const oldBookings = allBookings.filter(b => b.tsMillis > 0 && b.tsMillis < cutoff);
    const oldRx = allPrescriptions.filter(r => {
        const d = getDateObj(r.created_at || r.upload_date);
        return d && d.getTime() < cutoff;
    });

    const el = document.getElementById("cleanupStatusText");
    if (el) {
        el.innerHTML = `Found <strong>${oldBookings.length}</strong> bookings and <strong>${oldRx.length}</strong> prescriptions older than 365 days.`;
    }
}

async function backupAndDeleteOldRecords() {
    if (currentStaff.role !== "super_admin") return;
    const cutoff = getOneYearCutoffMillis();

    const oldBookings = allBookings.filter(b => b.tsMillis > 0 && b.tsMillis < cutoff);
    const oldRx = allPrescriptions.filter(r => {
        const d = getDateObj(r.created_at || r.upload_date);
        return d && d.getTime() < cutoff;
    });

    if (oldBookings.length === 0 && oldRx.length === 0) {
        return showMsg("No bookings or prescriptions older than 365 days found.", "Already Clean");
    }

    // Step 1: Download CSV Backup BEFORE deleting anything
    const csvRows = [
        ["Order ID", "Date", "Patient Name", "Mobile", "Tests", "Status", "Payment Status", "Final Total (INR)", "B2B Lab Cost (INR)"]
    ];
    oldBookings.forEach(b => {
        const tests = (Array.isArray(b.cart_items) ? b.cart_items : []).map(i => i.service_name || "").join(" | ");
        const row = [
            b.order_id || b.docId,
            b.isoDate || "",
            b.patient_name || "",
            b.mobile || "",
            tests,
            b.status || "",
            b.payment_status || "",
            Number(b.final_total || 0),
            Number(b.lab_cost || 0)
        ].map(v => `"${String(v).replace(/"/g, '""')}"`);
        csvRows.push(row);
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Bhavya_Diagnostics_1Yr_Archive_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    if (!confirm(`CSV Backup downloaded!\n\nNow permanently delete ${oldBookings.length} old bookings (with their PDFs) and ${oldRx.length} old prescriptions?`)) {
        return;
    }

    const btn = document.getElementById("btnBackupAndDeleteOld");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting Old Data...';

    try {
        // Delete associated report PDFs from Storage safely
        if (storage) {
            for (const b of oldBookings) {
                const urls = Array.isArray(b.report_pdf) ? b.report_pdf : (b.report_url ? [b.report_url] : []);
                for (const u of urls) {
                    if (u && String(u).includes("firebasestorage")) {
                        try { await storage.refFromURL(u).delete(); } catch (e) {}
                    }
                }
            }
        }

        // Batch delete in chunks of 450 (Firestore limit is 500 per batch)
        const targets = [
            ...oldBookings.map(b => db.collection("bookings").doc(b.docId)),
            ...oldRx.map(r => db.collection("prescriptions").doc(r.docId))
        ];

        for (let i = 0; i < targets.length; i += 450) {
            const batch = db.batch();
            targets.slice(i, i + 450).forEach(ref => batch.delete(ref));
            await batch.commit();
        }

        showMsg(`Backup saved & ${targets.length} records older than 1 year permanently deleted.`, "✅ Cleanup Complete");
        scanOldRecords();
    } catch (err) {
        showMsg("Cleanup error: " + err.message, "Error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-download"></i> Download CSV Backup &amp; Delete 1-Year Old Data';
    }
}
