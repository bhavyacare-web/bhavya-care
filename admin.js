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

// Primary Super Admin Emails (Always get full Super Admin access)
const SUPER_ADMIN_EMAILS = [
    "admin@bhavyadiagnostics.com",
    "contact@bhavyadiagnostics.com",
    "bhavyacare1@gmail.com"
];

// Role Permissions Map
const ROLE_PERMISSIONS = {
    super_admin:   ["bookings", "patients", "withdrawals", "support", "pnl", "staff"],
    report_staff:  ["bookings"],
    booking_staff: ["bookings", "support"],
    vip_staff:     ["patients"]
};

let currentStaff = { email: "", name: "", role: "report_staff" };
let sheetRules = {};
let allBookings = [];
let allPatients = [];
let allVipRequests = [];
let allKycProfiles = [];
let allPayouts = [];
let allPrescriptions = [];
let allSupportQueries = [];
let allExpenses = [];
let allStaffList = [];

let currentWithdrawSub = "kyc";

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

// =======================================================
// AUTOMATIC ZOHO EMAIL HELPER (via Firebase Extension)
// =======================================================
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
// 2. ADMIN & STAFF AUTHENTICATION + ROLE-BASED ACCESS
// =======================================================
firebase.auth().onAuthStateChanged(async (user) => {
    const gate = document.getElementById("adminLoginGate");
    const app = document.getElementById("adminAppWrapper");

    if (!user || !user.email) {
        gate.style.display = "flex";
        app.style.display = "none";
        return;
    }

    const emailLower = user.email.toLowerCase().trim();
    let role = "report_staff";
    let staffName = emailLower.split("@")[0];

    if (SUPER_ADMIN_EMAILS.includes(emailLower)) {
        role = "super_admin";
        staffName = "Super Admin";
    } else {
        const roleDoc = await db.collection("admin_roles").doc(emailLower).get();
        if (!roleDoc.exists || roleDoc.data().status === "inactive") {
            alert("Access Denied: Your staff account is not authorized or has been deactivated.");
            await firebase.auth().signOut();
            return;
        }
        role = roleDoc.data().role || "report_staff";
        staffName = roleDoc.data().name || staffName;
    }

    currentStaff = { email: emailLower, name: staffName, role: role };
    document.getElementById("loggedStaffEmail").innerText = `${staffName} (${emailLower})`;
    document.getElementById("loggedStaffRole").innerText = role.replace("_", " ");

    applyRolePermissions(role);
    gate.style.display = "none";
    app.style.display = "block";

    await loadSheetRules();
    await refreshAllAdminData();
});

async function handleGateLogin() {
    const email = document.getElementById("gateEmail").value.trim();
    const pass = document.getElementById("gatePassword").value;
    const btn = document.getElementById("btnGateLogin");

    if (!email || !pass) return alert("Enter Email and Password.");
    btn.innerText = "Signing In...";
    btn.disabled = true;

    try {
        await firebase.auth().signInWithEmailAndPassword(email, pass);
    } catch (err) {
        alert("Login Failed: " + err.message);
    } finally {
        btn.innerHTML = 'Sign In <i class="fas fa-arrow-right"></i>';
        btn.disabled = false;
    }
}

async function logoutAdmin() {
    if (!confirm("Logout from Admin Panel?")) return;
    localStorage.removeItem("bhavya_role");
    await firebase.auth().signOut();
    window.location.href = "index.html";
}

function applyRolePermissions(role) {
    const allowedTabs = ROLE_PERMISSIONS[role] || ["bookings"];
    const tabButtons = document.querySelectorAll("#adminMainTabs .main-tab-btn");

    tabButtons.forEach(btn => {
        const tabName = btn.getAttribute("data-tab");
        btn.style.display = allowedTabs.includes(tabName) ? "inline-flex" : "none";
    });

    if (allowedTabs.length > 0) {
        switchMainTab(allowedTabs[0]);
    }
}

function switchMainTab(tabName) {
    const allowedTabs = ROLE_PERMISSIONS[currentStaff.role] || [];
    if (!allowedTabs.includes(tabName)) return;

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
// 3. LOAD DYNAMIC RULES FROM GOOGLE SHEET (services_rule)
// =======================================================
async function loadSheetRules() {
    try {
        const res = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify({ action: "getBookingData", user_id: "" })
        });
        const json = await res.json();
        if (json.status === "success" && json.data && json.data.rules) {
            sheetRules = json.data.rules;
        }
    } catch (e) {
        console.warn("Could not load sheet rules, using defaults:", e);
    }
}

function getVipCashbackRuleAmount() {
    for (const k of Object.keys(sheetRules)) {
        if (k.toLowerCase().startsWith("wallet_vip_plan")) {
            return Number(sheetRules[k]) || 1000;
        }
    }
    return 1000;
}

function getVipReferralRuleAmount() {
    return Number(sheetRules.vip_purchase_referral_bonus || sheetRules.vip_referral_discount || 500);
}

// =======================================================
// 4. MASTER DATA REFRESH
// =======================================================
async function refreshAllAdminData() {
    const allowed = ROLE_PERMISSIONS[currentStaff.role] || [];
    const tasks = [];

    if (allowed.includes("bookings") || allowed.includes("pnl")) tasks.push(fetchBookings());
    if (allowed.includes("patients") || allowed.includes("pnl")) {
        tasks.push(fetchPatients());
        tasks.push(fetchVipRequests());
    }
    if (allowed.includes("withdrawals")) tasks.push(fetchWithdrawals());
    if (allowed.includes("support")) tasks.push(fetchSupportAndRx());
    if (allowed.includes("pnl")) tasks.push(fetchExpenses());
    if (allowed.includes("staff")) tasks.push(fetchStaffRoles());

    await Promise.all(tasks);
    if (allowed.includes("pnl")) calculateProfitAndLoss();
}

// =======================================================
// 5. BOOKINGS & REPORT PDF UPLOAD (Pathology, Packages, ECG, PFT)
// =======================================================
async function fetchBookings() {
    const snap = await db.collection("bookings").get();
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
}

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

    let pendingCnt = 0, completedCnt = 0;
    allBookings.forEach(b => {
        const st = String(b.status || "pending").toLowerCase();
        if (st.includes("complete")) completedCnt++;
        else if (!st.includes("cancel")) pendingCnt++;
    });
    document.getElementById("kpiTotalOrders").innerText = allBookings.length;
    document.getElementById("kpiPendingOrders").innerText = pendingCnt;
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

    tbody.innerHTML = filtered.map(b => {
        const st = String(b.status || "Pending").toLowerCase();
        let badgeCls = "b-pending";
        if (st.includes("confirm")) badgeCls = "b-confirmed";
        else if (st.includes("complete")) badgeCls = "b-completed";
        else if (st.includes("cancel")) badgeCls = "b-cancelled";

        const items = Array.isArray(b.cart_items) ? b.cart_items : [];
        const itemsHtml = items.map(i => {
            const labTag = i.selected_lab_name ? ` <small style="color:#0056b3;">[${escapeHtml(i.selected_lab_name)}]</small>` : "";
            return `<div>• <b>${escapeHtml(i.service_name)}</b> (x${i.qty || 1})${labTag}</div>`;
        }).join("") || "Diagnostic Order";

        let slotTxt = "As scheduled";
        if (b.lab_slots && typeof b.lab_slots === "object") {
            const parts = Object.values(b.lab_slots).filter(s => s && s.date).map(s => `${s.date} ${s.time || ""}`);
            if (parts.length) slotTxt = parts.join(" | ");
        }

        const reportUrl = b.report_url || (Array.isArray(b.report_pdf) ? b.report_pdf[0] : b.report_pdf) || "";
        const reportLinkHtml = reportUrl
            ? `<div style="margin-top:6px;"><a href="${escapeHtml(reportUrl)}" target="_blank" style="color:var(--success); font-weight:800; font-size:12px; text-decoration:none;"><i class="fas fa-file-pdf"></i> View Uploaded PDF</a>${b.report_uploaded_by ? `<br><small style="color:#64748b;">By: ${escapeHtml(b.report_uploaded_by)}</small>` : ""}</div>`
            : "";

        const paySt = String(b.payment_status || "DUE").toUpperCase();
        const payColor = paySt === "PAID" ? "var(--success)" : "var(--danger)";

        return `
        <tr>
            <td><strong>#${escapeHtml(b.order_id || b.docId)}</strong><br><small style="color:#64748b;">${formatDateDisplay(b.created_at)}</small></td>
            <td>
                <strong>${escapeHtml(b.patient_name || "Patient")}</strong><br>
                <small>📞 ${escapeHtml(b.mobile || "-")}</small><br>
                <small style="color:#64748b;">${escapeHtml(b.address || "")} ${escapeHtml(b.pincode || "")}</small>
            </td>
            <td>${itemsHtml}</td>
            <td>
                <span class="badge b-confirmed">${escapeHtml(String(b.fulfillment || "home").toUpperCase())}</span><br>
                <small style="font-weight:700; display:block; margin-top:4px;">${escapeHtml(slotTxt)}</small>
            </td>
            <td>
                <strong>Bill: ₹${Number(b.final_total || 0)}</strong>
                <span style="font-size:10px; font-weight:800; color:${payColor}; margin-left:4px;">(${paySt})</span><br>
                <small style="color:#b45309; font-weight:700;">Lab Cost: ₹${Number(b.lab_cost || 0)}</small>
            </td>
            <td>
                <span class="badge ${badgeCls}">${escapeHtml(b.status || "Pending")}</span>
                ${reportLinkHtml}
            </td>
            <td>
                <button class="btn-act btn-green" onclick="openReportUploadModal('${escapeHtml(b.docId)}')"><i class="fas fa-upload"></i> Upload Report</button><br>
                ${st === "pending" ? `<button class="btn-act btn-blue" onclick="updateOrderStatus('${escapeHtml(b.docId)}', 'Confirmed')">Confirm</button>` : ""}
                ${paySt !== "PAID" ? `<button class="btn-act btn-amber" onclick="markOrderPaid('${escapeHtml(b.docId)}')">Mark Paid</button>` : ""}
            </td>
        </tr>`;
    }).join("");
}

async function updateOrderStatus(docId, newStatus) {
    await db.collection("bookings").doc(docId).update({
        status: newStatus,
        updated_by: currentStaff.name,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    await fetchBookings();
}

async function markOrderPaid(docId) {
    await db.collection("bookings").doc(docId).update({
        payment_status: "PAID",
        paid_marked_by: currentStaff.name,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    await fetchBookings();
    if (ROLE_PERMISSIONS[currentStaff.role].includes("pnl")) calculateProfitAndLoss();
}

function openReportUploadModal(docId) {
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
    const docId = document.getElementById("repModalOrderDocId").value;
    const order = allBookings.find(b => b.docId === docId);
    if (!order) return;

    const fileInput = document.getElementById("repPdfFileInput");
    let finalReportUrl = document.getElementById("repExternalUrlInput").value.trim();
    const handNote = document.getElementById("repHandNoteInput").value.trim();
    const labCost = Number(document.getElementById("repLabCostInput").value || 0);

    if ((!fileInput.files || fileInput.files.length === 0) && !finalReportUrl && !handNote) {
        return alert("Please upload a Report PDF, paste a report link, or enter a physical report note.");
    }

    const btn = document.getElementById("btnSubmitReport");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading & Sending Email...';
    btn.disabled = true;

    try {
        // 1. Upload PDF to Firebase Storage if file selected
        if (fileInput.files && fileInput.files.length > 0) {
            if (!storage) throw new Error("Firebase Storage not initialized.");
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
        if (handNote) {
            updateData.hand_reports = [handNote];
        }

        // 2. Update Firestore Booking Document
        await db.collection("bookings").doc(docId).update(updateData);

        // 3. Send Automatic Report Email from report@bhavyadiagnostics.com
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
                            ${finalReportUrl ? `<p style="margin:22px 0;"><a href="${escapeHtml(finalReportUrl)}" style="background:#10b981;color:white;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">📄 Download Report PDF</a></p>` : ""}
                            ${handNote ? `<p style="background:#fffbeb;padding:10px;border-radius:8px;color:#92400e;font-size:13px;"><b>Physical Report Note:</b> ${escapeHtml(handNote)}</p>` : ""}
                            <p style="font-size:13px;color:#64748b;">You can also view and download all your reports anytime in your Patient Dashboard at <b>bhavyadiagnostics.com</b>.</p>
                            <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">
                            <p style="font-size:12px;color:#64748b;margin:0;">Bhavya Diagnostics • Main Jhajjar Road, Opp. Narendra Farm, Bahadurgarh • Helpline: 89501 12467</p>
                        </div>
                       </div>`
            });
        }

        alert("✅ Report uploaded & sent to patient via report@bhavyadiagnostics.com!");
        closeAllModals();
        await fetchBookings();
        if (ROLE_PERMISSIONS[currentStaff.role].includes("pnl")) calculateProfitAndLoss();
    } catch (err) {
        alert("Report Upload Error: " + err.message);
    } finally {
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Save Report &amp; Email Patient';
        btn.disabled = false;
    }
}

// =======================================================
// 6. PATIENTS & VIP MEMBERSHIP APPROVALS (+₹1000 CASHBACK)
// =======================================================
function switchPatientSubTab(sub) {
    document.getElementById("subtab-vip").classList.toggle("active", sub === "vip");
    document.getElementById("subtab-allpatients").classList.toggle("active", sub === "allpatients");
    document.getElementById("subpanel-vip").style.display = sub === "vip" ? "block" : "none";
    document.getElementById("subpanel-allpatients").style.display = sub === "allpatients" ? "block" : "none";
}

async function fetchPatients() {
    const snap = await db.collection("patients").get();
    allPatients = [];
    snap.forEach(doc => {
        allPatients.push({ uid: doc.id, ...doc.data() });
    });
    renderPatientsMasterTable();
}

async function fetchVipRequests() {
    const snap = await db.collection("vip_requests").get();
    allVipRequests = [];
    snap.forEach(doc => {
        const d = doc.data();
        const ts = getDateObj(d.created_at);
        allVipRequests.push({ uid: doc.id, ...d, tsMillis: ts ? ts.getTime() : 0 });
    });
    allVipRequests.sort((a, b) => b.tsMillis - a.tsMillis);
    renderVipTable();
}

function renderVipTable() {
    const tbody = document.getElementById("vipTableBody");
    if (!tbody) return;

    const filter = document.getElementById("vipStatusFilter").value.toLowerCase();
    const list = allVipRequests.filter(v => filter === "all" || String(v.status || "pending").toLowerCase() === filter);

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:25px; color:#64748b;">No VIP applications found.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(v => {
        const st = String(v.status || "pending").toLowerCase();
        const badge = st === "active" ? `<span class="badge b-completed">Active</span>` : (st === "rejected" ? `<span class="badge b-cancelled">Rejected</span>` : `<span class="badge b-pending">Pending</span>`);
        const members = Array.isArray(v.members) ? v.members.join(", ") : (v.patient_name || "-");
        const ssHtml = v.payment_screenshot ? `<button class="btn-act btn-gray" onclick="viewBase64Image('${escapeHtml(v.uid)}')"><i class="fas fa-image"></i> View Screenshot</button>` : "No SS";
        const validity = (v.start_date && v.end_date) ? `${v.start_date} to ${v.end_date}` : "Not Started";
        const actBtn = st === "pending"
            ? `<button class="btn-act btn-blue" onclick="openVipReviewModal('${escapeHtml(v.uid)}')">Review &amp; Approve</button>`
            : `<small style="color:#64748b;">${escapeHtml(v.admin_remarks || "Processed")}</small>`;

        return `
        <tr>
            <td><strong>${escapeHtml(v.user_id || v.uid.slice(0, 8))}</strong></td>
            <td><strong>${escapeHtml(v.patient_name || "-")}</strong><br><small>Members: ${escapeHtml(members)}</small></td>
            <td>${escapeHtml(v.referrer_user_id || "None")}</td>
            <td>${escapeHtml(String(v.payment_mode || "online").toUpperCase())}<br><small>UTR: ${escapeHtml(v.payment_id || "-")}</small><br>${ssHtml}</td>
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
    const req = allVipRequests.find(v => v.uid === uid);
    if (!req) return;
    document.getElementById("vipModalUid").value = uid;
    document.getElementById("vipModalApplicant").innerText = `${req.patient_name} (${req.user_id || uid}) — ₹${req.amount_paid}`;
    document.getElementById("vipModalRemarks").value = "";
    const ssBox = document.getElementById("vipModalScreenshotBox");
    ssBox.innerHTML = req.payment_screenshot ? `<img src="${req.payment_screenshot}" style="max-height:220px; border-radius:10px; border:1px solid #cbd5e1;">` : "";
    document.getElementById("vipActionModal").classList.add("active");
}

async function processVipApproval(newStatus) {
    const uid = document.getElementById("vipModalUid").value;
    const remarks = document.getElementById("vipModalRemarks").value.trim();
    const req = allVipRequests.find(v => v.uid === uid);
    if (!req) return;

    if (newStatus === "rejected" && !remarks) {
        return alert("Please enter Admin Remarks (reason) before rejecting.");
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

            // Dynamic Cashback & Referral Bonus from services_rule sheet
            const vipCashback = getVipCashbackRuleAmount();
            const vipRefBonus = getVipReferralRuleAmount();

            const curWallet = Number(pData.current_wallet_balance ?? pData.wallet_balance ?? 0);
            const updatedWallet = curWallet + vipCashback;

            const updatedVipDetails = {
                ...(pData.vip_details || {}),
                start_date: startStr,
                end_date: endStr,
                admin_remarks: remarks || "Approved",
                vip_status: "active"
            };

            await patientRef.set({
                current_plan_status: "vip",
                plan: "vip",
                isVip: true,
                current_wallet_balance: updatedWallet,
                wallet_balance: updatedWallet,
                vip_details: updatedVipDetails
            }, { merge: true });

            await db.collection("vip_requests").doc(uid).update({
                status: "active",
                start_date: startStr,
                end_date: endStr,
                admin_remarks: remarks || "Approved",
                approved_by: currentStaff.name,
                approved_at: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Log Cashback in Wallet Transactions
            await db.collection("wallet_transactions").add({
                uid: uid,
                user_id: req.user_id || uid,
                type: "credit",
                amount: vipCashback,
                description: "VIP Membership Activation Cashback",
                reference: "VIP-APPROVAL",
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Credit Referrer if valid
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

            if (req.email && req.email.includes("@")) {
                await sendAutoEmail({
                    type: "contact",
                    to: req.email,
                    subject: "🎉 Welcome to Bhavya VIP Family Plan!",
                    html: `<p>Dear <b>${escapeHtml(req.patient_name)}</b>,</p>
                           <p>Your <b>Bhavya VIP Family Plan</b> is now <b>ACTIVE</b> (${startStr} to ${endStr})!</p>
                           <p>We have also credited <b>₹${vipCashback} VIP Activation Cashback</b> to your Bhavya Diagnostics wallet.</p>`
                });
            }

            alert(`✅ VIP Approved! ₹${vipCashback} cashback credited to patient wallet.`);
        } else {
            await patientRef.set({
                current_plan_status: "basic",
                plan: "basic",
                isVip: false,
                vip_details: { ...(pData.vip_details || {}), vip_status: "rejected", admin_remarks: remarks }
            }, { merge: true });

            await db.collection("vip_requests").doc(uid).update({
                status: "rejected",
                admin_remarks: remarks
            });

            if (req.email && req.email.includes("@")) {
                await sendAutoEmail({
                    type: "contact",
                    to: req.email,
                    subject: "VIP Membership Application Update - Bhavya Diagnostics",
                    html: `<p>Dear <b>${escapeHtml(req.patient_name)}</b>,</p><p>Your VIP Membership application could not be approved. <b>Reason:</b> ${escapeHtml(remarks)}</p>`
                });
            }
            alert("VIP Application Rejected.");
        }

        closeAllModals();
        await fetchVipRequests();
        await fetchPatients();
        if (ROLE_PERMISSIONS[currentStaff.role].includes("pnl")) calculateProfitAndLoss();
    } catch (err) {
        alert("Error processing VIP action: " + err.message);
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
            <td><strong style="color:var(--success); font-size:15px;">₹${wallet}</strong></td>
            <td><span class="badge ${plan === 'VIP' ? 'b-completed' : 'b-confirmed'}">${escapeHtml(plan)}</span></td>
            <td>
                <button class="btn-act ${wStatus === 'active' ? 'btn-green' : 'btn-red'}" ${!isSuperAdmin ? 'disabled' : ''} onclick="togglePatientField('${escapeHtml(p.uid)}', 'withdraw', '${wStatus}')">${wStatus.toUpperCase()}</button>
            </td>
            <td>
                <button class="btn-act ${aStatus === 'active' ? 'btn-green' : 'btn-red'}" ${!isSuperAdmin ? 'disabled' : ''} onclick="togglePatientField('${escapeHtml(p.uid)}', 'status', '${aStatus}')">${aStatus.toUpperCase()}</button>
            </td>
            <td>
                ${isSuperAdmin ? `<button class="btn-act btn-blue" onclick="openWalletAdjustModal('${escapeHtml(p.uid)}')"><i class="fas fa-wallet"></i> +/- Wallet</button>` : `<small style="color:#64748b;">View Only</small>`}
            </td>
        </tr>`;
    }).join("");
}

async function togglePatientField(uid, field, curVal) {
    if (currentStaff.role !== "super_admin") return;
    const nextVal = curVal === "active" ? "inactive" : "active";
    if (!confirm(`Change ${field.toUpperCase()} to ${nextVal.toUpperCase()}?`)) return;
    await db.collection("patients").doc(uid).update({ [field]: nextVal });
    await fetchPatients();
}

function openWalletAdjustModal(uid) {
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
    const uid = document.getElementById("walModalUid").value;
    const type = document.getElementById("walModalType").value;
    const amt = Number(document.getElementById("walModalAmount").value || 0);
    const reason = document.getElementById("walModalReason").value.trim();

    if (amt <= 0 || !reason) return alert("Enter valid amount and reason.");

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
        description: `Admin ${type === 'credit' ? 'Added' : 'Deducted'}: ${reason}`,
        reference: currentStaff.name,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("Wallet updated successfully!");
    closeAllModals();
    await fetchPatients();
}

// =======================================================
// 7. WALLET & WITHDRAWALS (KYC & PAYOUTS)
// =======================================================
function switchWithdrawSubTab(sub) {
    currentWithdrawSub = sub;
    document.getElementById("subtab-kyc").classList.toggle("active", sub === "kyc");
    document.getElementById("subtab-payouts").classList.toggle("active", sub === "payouts");
    renderWithdrawalsTable();
}

async function fetchWithdrawals() {
    const [kycSnap, paySnap] = await Promise.all([
        db.collection("withdrawal_profiles").get(),
        db.collection("payout_requests").get()
    ]);

    allKycProfiles = [];
    kycSnap.forEach(d => allKycProfiles.push({ docId: d.id, ...d.data() }));

    allPayouts = [];
    paySnap.forEach(d => allPayouts.push({ docId: d.id, ...d.data() }));

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
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:25px; color:#64748b;">No KYC requests found.</td></tr>`;
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
                <td><span class="badge ${isApproved ? 'b-completed' : 'b-pending'}">${escapeHtml(st)}</span></td>
                <td>${isApproved ? "Done" : `<button class="btn-act btn-blue" onclick="approveKycProfile('${escapeHtml(req.docId)}', '${escapeHtml(req.uid || "")}')">Approve KYC</button>`}</td>
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
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:25px; color:#64748b;">No payout requests found.</td></tr>`;
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
                <td><strong style="color:var(--danger); font-size:15px;">₹${Number(req.amount || 0)}</strong></td>
                <td><strong style="color:var(--primary);">${escapeHtml(req.upi_id || req.upiId || "-")}</strong></td>
                <td>${escapeHtml(req.txn_id || req.remarks || "-")}</td>
                <td><span class="badge ${isPaid ? 'b-completed' : 'b-pending'}">${escapeHtml(st)}</span></td>
                <td>${isPaid ? "Paid ✅" : `<button class="btn-act btn-green" onclick="markPayoutPaid('${escapeHtml(req.docId)}')">Mark Paid</button>`}</td>
            </tr>`;
        }).join("");
    }
}

async function approveKycProfile(docId, uid) {
    if (!confirm("Approve this KYC profile for wallet withdrawals?")) return;
    await db.collection("withdrawal_profiles").doc(docId).update({ status: "Approved" });
    if (uid) {
        await db.collection("patients").doc(uid).set({ withdraw: "active" }, { merge: true });
    }
    alert("KYC Profile Approved!");
    await fetchWithdrawals();
}

async function markPayoutPaid(docId) {
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

    alert("Payout marked as Paid & confirmation email sent!");
    await fetchWithdrawals();
}

// =======================================================
// 8. PRESCRIPTIONS & SUPPORT QUERIES
// =======================================================
function switchSupportSubTab(sub) {
    document.getElementById("subtab-rx").classList.toggle("active", sub === "rx");
    document.getElementById("subtab-tickets").classList.toggle("active", sub === "tickets");
    document.getElementById("subpanel-rx").style.display = sub === "rx" ? "block" : "none";
    document.getElementById("subpanel-tickets").style.display = sub === "tickets" ? "block" : "none";
}

async function fetchSupportAndRx() {
    const [rxSnap, supSnap] = await Promise.all([
        db.collection("prescriptions").get(),
        db.collection("support_queries").get()
    ]);

    allPrescriptions = [];
    rxSnap.forEach(d => allPrescriptions.push({ docId: d.id, ...d.data() }));

    allSupportQueries = [];
    supSnap.forEach(d => allSupportQueries.push({ docId: d.id, ...d.data() }));

    renderRxAndSupportTables();
}

function renderRxAndSupportTables() {
    const rxBody = document.getElementById("rxTableBody");
    const supBody = document.getElementById("supportTableBody");

    if (rxBody) {
        if (allPrescriptions.length === 0) {
            rxBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:25px; color:#64748b;">No prescriptions found in Firebase.</td></tr>`;
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
                    <td><span class="badge ${st.toLowerCase() === 'completed' ? 'b-completed' : 'b-pending'}">${escapeHtml(st)}</span></td>
                    <td>${st.toLowerCase() !== 'completed' ? `<button class="btn-act btn-green" onclick="markRxCompleted('${escapeHtml(r.docId)}')">Mark Processed</button>` : "Done"}</td>
                </tr>`;
            }).join("");
        }
    }

    if (supBody) {
        if (allSupportQueries.length === 0) {
            supBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:25px; color:#64748b;">No support tickets found in Firebase.</td></tr>`;
        } else {
            supBody.innerHTML = allSupportQueries.map(q => {
                const st = String(q.status || "Open");
                return `
                <tr>
                    <td><strong>${escapeHtml(q.ticket_id || q.docId)}</strong><br><small>${formatDateDisplay(q.created_at || q.date)}</small></td>
                    <td><strong>${escapeHtml(q.name || "-")}</strong><br><small>📞 ${escapeHtml(q.mobile || "-")}</small></td>
                    <td><strong>${escapeHtml(q.issue_type || "-")}</strong><br><small>Order: ${escapeHtml(q.order_id || "N/A")}</small></td>
                    <td style="max-width:260px;"><small>${escapeHtml(q.message || "-")}</small></td>
                    <td><span class="badge ${st.toLowerCase() === 'resolved' ? 'b-completed' : 'b-pending'}">${escapeHtml(st)}</span></td>
                    <td>${st.toLowerCase() !== 'resolved' ? `<button class="btn-act btn-green" onclick="resolveTicket('${escapeHtml(q.docId)}')">Mark Resolved</button>` : "Resolved"}</td>
                </tr>`;
            }).join("");
        }
    }
}

async function markRxCompleted(docId) {
    await db.collection("prescriptions").doc(docId).update({ status: "Completed" });
    await fetchSupportAndRx();
}

async function resolveTicket(docId) {
    await db.collection("support_queries").doc(docId).update({ status: "Resolved" });
    await fetchSupportAndRx();
}

// =======================================================
// 9. PROFIT & LOSS ACCOUNTING (SUPER ADMIN ONLY)
// =======================================================
async function fetchExpenses() {
    const snap = await db.collection("expenses").get();
    allExpenses = [];
    snap.forEach(d => {
        const data = d.data();
        allExpenses.push({ docId: d.id, ...data });
    });
    allExpenses.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function toggleCustomPnlDates() {
    const period = document.getElementById("pnlPeriodFilter").value;
    document.getElementById("pnlStartDate").style.display = period === "custom" ? "inline-block" : "none";
    document.getElementById("pnlEndDate").style.display = period === "custom" ? "inline-block" : "none";
}

function isDateInPnlRange(isoDateStr) {
    const period = document.getElementById("pnlPeriodFilter").value;
    if (period === "all" || !isoDateStr) return period === "all";

    const today = new Date();
    const todayIso = today.toISOString().split("T")[0];

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
    let bookingRev = 0;
    let totalLabCost = 0;

    allBookings.forEach(b => {
        const st = String(b.status || "").toLowerCase();
        if (st.includes("cancel")) return;
        if (!isDateInPnlRange(b.isoDate)) return;

        if (st.includes("complete") || String(b.payment_status || "").toUpperCase() === "PAID") {
            bookingRev += Number(b.final_total || 0);
        }
        totalLabCost += Number(b.lab_cost || 0);
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
        netSub.innerText = "Net Profit after Lab Cost & Clinic Expenses";
    } else {
        netCard.style.background = "#fef2f2";
        netCard.style.borderLeftColor = "var(--danger)";
        netValEl.style.color = "var(--danger)";
        netSub.innerText = "Net Loss in selected period";
    }

    const expBody = document.getElementById("expensesTableBody");
    if (expBody) {
        if (filteredExpenses.length === 0) {
            expBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:25px; color:#64748b;">No expenses recorded for this period.</td></tr>`;
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
    document.getElementById("expDateInput").value = new Date().toISOString().split("T")[0];
    document.getElementById("expAmountInput").value = "";
    document.getElementById("expNoteInput").value = "";
    document.getElementById("expenseModal").classList.add("active");
}

async function saveClinicExpense() {
    const date = document.getElementById("expDateInput").value;
    const category = document.getElementById("expCategoryInput").value;
    const amount = Number(document.getElementById("expAmountInput").value || 0);
    const note = document.getElementById("expNoteInput").value.trim();

    if (!date || amount <= 0) return alert("Please enter valid Date and Amount.");

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
        await fetchExpenses();
        calculateProfitAndLoss();
    } catch (err) {
        alert("Error saving expense: " + err.message);
    } finally {
        btn.disabled = false;
    }
}

async function deleteClinicExpense(docId) {
    if (!confirm("Delete this expense entry?")) return;
    await db.collection("expenses").doc(docId).delete();
    await fetchExpenses();
    calculateProfitAndLoss();
}

// =======================================================
// 10. STAFF & ROLE-BASED PASSWORD MANAGEMENT
// =======================================================
async function fetchStaffRoles() {
    const snap = await db.collection("admin_roles").get();
    allStaffList = [];
    snap.forEach(d => allStaffList.push({ email: d.id, ...d.data() }));
    renderStaffTable();
}

function renderStaffTable() {
    const tbody = document.getElementById("staffTableBody");
    if (!tbody) return;

    if (allStaffList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:25px; color:#64748b;">No staff accounts created yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = allStaffList.map(s => {
        const st = String(s.status || "active").toLowerCase();
        return `
        <tr>
            <td><strong>${escapeHtml(s.name || "-")}</strong></td>
            <td>${escapeHtml(s.email)}</td>
            <td><span class="badge b-confirmed">${escapeHtml(String(s.role || "").replace("_", " "))}</span></td>
            <td><span class="badge ${st === 'active' ? 'b-completed' : 'b-cancelled'}">${escapeHtml(st)}</span></td>
            <td>
                <button class="btn-act ${st === 'active' ? 'btn-red' : 'btn-green'}" onclick="toggleStaffStatus('${escapeHtml(s.email)}', '${st}')">
                    ${st === 'active' ? 'Deactivate' : 'Activate'}
                </button>
            </td>
        </tr>`;
    }).join("");
}

async function createStaffAccount() {
    if (currentStaff.role !== "super_admin") return;

    const name = document.getElementById("newStaffName").value.trim();
    const email = document.getElementById("newStaffEmail").value.trim().toLowerCase();
    const pass = document.getElementById("newStaffPass").value.trim();
    const role = document.getElementById("newStaffRole").value;

    if (!name || !email || pass.length < 6) {
        return alert("Enter Staff Name, valid Email, and Password (minimum 6 characters).");
    }

    const btn = document.getElementById("btnCreateStaff");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    btn.disabled = true;

    let secondaryApp = null;
    try {
        // Use secondary Firebase app instance so Super Admin remains logged in
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

        alert(`✅ Staff Account Created!\n\nEmail: ${email}\nPassword: ${pass}\nRole: ${role}`);
        await fetchStaffRoles();
    } catch (err) {
        if (err.code === "auth/email-already-in-use") {
            // If Auth user already exists, just update their role in Firestore
            await db.collection("admin_roles").doc(email).set({
                name: name,
                email: email,
                role: role,
                status: "active"
            }, { merge: true });
            alert(`✅ Existing user role updated to ${role}!`);
            await fetchStaffRoles();
        } else {
            alert("Error creating staff account: " + err.message);
        }
    } finally {
        if (secondaryApp) {
            try { await secondaryApp.delete(); } catch (e) {}
        }
        btn.innerHTML = '<i class="fas fa-key"></i> Create Staff Account';
        btn.disabled = false;
    }
}

async function toggleStaffStatus(email, curStatus) {
    if (currentStaff.role !== "super_admin") return;
    const next = curStatus === "active" ? "inactive" : "active";
    if (!confirm(`Set ${email} access to ${next.toUpperCase()}?`)) return;
    await db.collection("admin_roles").doc(email).update({ status: next });
    await fetchStaffRoles();
}
