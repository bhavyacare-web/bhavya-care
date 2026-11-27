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

// Public rules URL (services_rule sheet)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwIxSjlD6oVAGi4InT6Lb8RPg6NWrl7vpptoYrEG5HKPzPaadUp_0pVnN_1OZfJ7X_r/exec";

let baseVipPrice = 3000;
let vipDiscount = 500;
let finalAmount = 3000;
let validReferrerId = "";
let validReferrerUid = "";
let currentAuthUser = null;
let currentPatientData = null;
let sheetRulesCache = {};

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

async function sendAutoEmail({ to, subject, html }) {
    if (!db || !to) return;
    const recipients = (Array.isArray(to) ? to : [to]).filter(e => e && String(e).includes("@"));
    if (recipients.length === 0) return;

    return db.collection("mail").add({
        from: "Bhavya Diagnostics <contact@bhavyadiagnostics.com>",
        replyTo: "contact@bhavyadiagnostics.com",
        to: recipients,
        message: { subject: subject, html: html }
    }).catch(err => console.error("Auto email error:", err));
}

function hideAllContainers() {
    const ids = [
        "vip-loading-container",
        "vip-incomplete-profile-container",
        "vip-pincode-container",
        "vip-pending-container",
        "vip-active-container",
        "vip-rejected-container",
        "vip-form-container"
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
}

document.addEventListener("DOMContentLoaded", () => {
    if (typeof firebase === 'undefined' || !firebase.auth) {
        window.location.replace("../index.html");
        return;
    }

    let initialized = false;
    firebase.auth().onAuthStateChanged(async (user) => {
        if (initialized) return;
        initialized = true;

        if (!user) {
            localStorage.setItem("pending_vip_redirect", "true");
            alert("VIP Membership lene ke liye pehle Login karein.");
            window.location.replace("../index.html");
            return;
        }

        currentAuthUser = user;
        await initVipPage(user);
    });
});

async function initVipPage(user) {
    try {
        // 1. Load Dynamic Rules from Google Sheet (services_rule)
        try {
            const ruleRes = await fetch(GOOGLE_SCRIPT_URL, {
                method: "POST",
                body: JSON.stringify({ action: "getBookingData", user_id: "" })
            });
            const ruleJson = await ruleRes.json();
            if (ruleJson.status === "success" && ruleJson.data && ruleJson.data.rules) {
                sheetRulesCache = ruleJson.data.rules;
                baseVipPrice = Number(sheetRulesCache.vip_plan_price || 3000);
                vipDiscount = Number(sheetRulesCache.vip_purchase_referral_bonus || sheetRulesCache.vip_referral_discount || 500);
                finalAmount = baseVipPrice;
                updatePayableUI();
            }
        } catch (ruleErr) {
            console.warn("Using default VIP rules:", ruleErr);
        }

        // 2. Load Patient Profile & VIP Status from Firebase Firestore
        const patientRef = db.collection("patients").doc(user.uid);
        const docSnap = await patientRef.get();

        if (!docSnap.exists) {
            hideAllContainers();
            document.getElementById("vip-incomplete-profile-container").style.display = "block";
            return;
        }

        const pData = docSnap.data();
        currentPatientData = pData;

        const pName = pData.name || pData.patient_name || localStorage.getItem("bhavya_name") || "Patient";
        const pMobile = pData.mobile || pData.mobile_number || user.phoneNumber || "";
        let pUserId = pData.user_id || "";
        if (!pUserId || pUserId === user.uid || pUserId.length > 12) {
            pUserId = generateCustomUserId(pName, pMobile);
            await patientRef.set({ user_id: pUserId, referral_code: pUserId }, { merge: true });
        }

        localStorage.setItem("bhavya_user_id", pUserId);
        localStorage.setItem("bhavya_name", pName);

        const planStatus = String(pData.current_plan_status || pData.plan || "basic").toLowerCase().trim();
        const vipDetails = pData.vip_details || {};
        const vipSubStatus = String(vipDetails.vip_status || planStatus).toLowerCase().trim();

        hideAllContainers();

        if (planStatus === "pending" || vipSubStatus === "pending" || vipSubStatus === "inactive") {
            document.getElementById("vip-pending-container").style.display = "block";
            const summaryBox = document.getElementById("pendingSummaryBox");
            if (summaryBox) {
                const members = Array.isArray(pData.vipMembers) ? pData.vipMembers.join(", ") : pName;
                summaryBox.innerHTML = `
                    <p style="margin:0 0 6px 0;"><strong>Applicant:</strong> ${escapeHtml(pName)} (${escapeHtml(pUserId)})</p>
                    <p style="margin:0 0 6px 0;"><strong>Covered Members:</strong> ${escapeHtml(members)}</p>
                    <p style="margin:0;"><strong>Amount Paid:</strong> ₹${escapeHtml(vipDetails.amount_paid || finalAmount)} (${escapeHtml(String(vipDetails.payment_mode || "online").toUpperCase())})</p>
                `;
            }
            return;
        }

        if (planStatus === "vip" || vipSubStatus === "active") {
            document.getElementById("vip-active-container").style.display = "block";
            document.getElementById("activeStartDate").innerText = vipDetails.start_date || "Active";
            document.getElementById("activeEndDate").innerText = vipDetails.end_date || "Active";
            const members = Array.isArray(pData.vipMembers) ? pData.vipMembers.join(", ") : pName;
            document.getElementById("activeMembersList").innerText = members;
            return;
        }

        if (planStatus === "rejected" || vipSubStatus === "rejected") {
            document.getElementById("vip-rejected-container").style.display = "block";
            document.getElementById("rejectedRemarks").innerText = vipDetails.admin_remarks || "Please check payment details and re-apply.";
            return;
        }

        // Check mandatory profile fields before allowing VIP purchase
        const hasCompleteProfile = !!(
            pData.email && String(pData.email).includes("@") &&
            pData.address && String(pData.address).trim() !== "" &&
            (pData.city || pData.city_village) &&
            pData.pincode
        );

        if (!hasCompleteProfile) {
            document.getElementById("vip-incomplete-profile-container").style.display = "block";
            return;
        }

        // Pre-fill Member 1 & Pincode
        document.getElementById("mem1Name").value = pName;
        if (pData.pincode) {
            document.getElementById("checkPincodeInput").value = pData.pincode;
        }
        document.getElementById("vip-pincode-container").style.display = "block";

    } catch (err) {
        console.error("Init VIP page error:", err);
        hideAllContainers();
        document.getElementById("vip-pincode-container").style.display = "block";
    }
}

function showVipPincodeCheck() {
    hideAllContainers();
    document.getElementById("vip-pincode-container").style.display = "block";
}

async function verifyPincodeAndProceed() {
    const pincode = document.getElementById("checkPincodeInput").value.trim();
    if (!pincode || pincode.length !== 6) {
        alert("Please enter a valid 6-digit pincode.");
        return;
    }

    const btn = document.getElementById("btnCheckPincode");
    btn.innerText = "Checking...";
    btn.disabled = true;

    try {
        // 1. Check cached rules from services_rule first
        const rawVipPins = String(sheetRulesCache.vip_available_pincodes || sheetRulesCache.serviceable_pincodes || "").trim();
        if (rawVipPins) {
            const allowedList = rawVipPins.split(',').map(p => p.trim()).filter(Boolean);
            if (allowedList.includes(pincode)) {
                document.getElementById('vip-pincode-container').style.display = 'none';
                document.getElementById('vip-form-container').style.display = 'block';
                togglePaymentMode();
                return;
            } else {
                alert("Currently, VIP Membership is not available in your area (" + pincode + "). Please try again later.");
                return;
            }
        }

        // 2. Fallback API check
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ action: "checkVipPincode", pincode: pincode })
        });
        const result = await response.json();

        if (result.status === "success") {
            document.getElementById('vip-pincode-container').style.display = 'none';
            document.getElementById('vip-form-container').style.display = 'block';
            togglePaymentMode();
        } else {
            alert("Currently, this service is not available in your area. Please try again after some time.");
            document.getElementById('checkPincodeInput').value = '';
        }
    } catch (error) {
        alert("Network error. Please try again.");
    } finally {
        btn.innerHTML = 'Check &amp; Proceed <i class="fas fa-arrow-right"></i>';
        btn.disabled = false;
    }
}

function updatePayableUI() {
    document.getElementById("finalPayable").innerText = finalAmount;
    const upiBtnAmt = document.getElementById("upiBtnAmt");
    if (upiBtnAmt) upiBtnAmt.innerText = finalAmount;
}

function togglePaymentMode() {
    const selected = document.querySelector('input[name="payMode"]:checked');
    const isOnline = selected ? (selected.value === 'online') : true;
    document.getElementById('online-pay-section').style.display = isOnline ? 'block' : 'none';
}

function copyUpiId() {
    if (navigator.clipboard) {
        navigator.clipboard.writeText("8950112467@ptsbi").then(() => {
            alert("UPI ID copied: 8950112467@ptsbi");
        }).catch(() => {});
    }
}

function payViaUPI() {
    copyUpiId();
    const upiId = "8950112467@ptsbi";
    const name = "Bhavya Diagnostics";
    const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${finalAmount}&cu=INR&tn=Bhavya%20VIP%20Plan`;
    window.location.href = upiUrl;
}

async function verifyReferral() {
    const code = document.getElementById("refCodeInput").value.trim().toUpperCase();
    const msg = document.getElementById("refMsg");
    const btn = document.getElementById("btn-apply-ref");

    if (!code) { msg.style.display = "block"; msg.style.color = "var(--danger)"; msg.innerText = "Enter code first!"; return; }

    const allowSelf = String(sheetRulesCache.allow_self_referral || "FALSE").toUpperCase() === "TRUE";
    const myUserId = (localStorage.getItem("bhavya_user_id") || "").toUpperCase();

    if (!allowSelf && myUserId && code === myUserId) {
        msg.style.display = "block";
        msg.style.color = "var(--danger)";
        msg.innerText = "You cannot use your own referral code.";
        return;
    }

    btn.innerText = "Checking...";
    btn.disabled = true;

    try {
        // 1. Check Firebase 'patients' collection first
        if (db) {
            const snap = await db.collection("patients").where("referral_code", "==", code).limit(1).get();
            if (!snap.empty) {
                const refDoc = snap.docs[0];
                if (!allowSelf && currentAuthUser && refDoc.id === currentAuthUser.uid) {
                    msg.style.display = "block";
                    msg.style.color = "var(--danger)";
                    msg.innerText = "You cannot use your own referral code.";
                    return;
                }

                validReferrerUid = refDoc.id;
                validReferrerId = refDoc.data().user_id || refDoc.id;
                finalAmount = Math.max(0, baseVipPrice - vipDiscount);
                updatePayableUI();
                msg.style.display = "block";
                msg.style.color = "var(--success)";
                msg.innerText = `Valid! ₹${vipDiscount} discount applied.`;
                document.getElementById("refCodeInput").readOnly = true;
                btn.style.display = "none";
                return;
            }
        }

        // 2. Fallback to Google Sheet legacy referral codes
        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ action: "getVipRulesAndReferral", user_id: myUserId, referral_code: code })
        });
        const data = await res.json();

        if (data.status === "success" && data.data.validReferral) {
            validReferrerUid = "";
            validReferrerId = data.data.referrer_id;
            finalAmount = Math.max(0, baseVipPrice - vipDiscount);
            updatePayableUI();
            msg.style.display = "block";
            msg.style.color = "var(--success)";
            msg.innerText = `Valid! ₹${vipDiscount} discount applied.`;
            document.getElementById("refCodeInput").readOnly = true;
            btn.style.display = "none";
        } else {
            msg.style.display = "block";
            msg.style.color = "var(--danger)";
            msg.innerText = data.message || "Invalid Referral Code.";
            validReferrerId = "";
            validReferrerUid = "";
            finalAmount = baseVipPrice;
            updatePayableUI();
        }
    } catch (err) {
        msg.style.display = "block";
        msg.style.color = "var(--danger)";
        msg.innerText = "Error checking code.";
    } finally {
        btn.innerText = "Apply";
        btn.disabled = false;
    }
}

const payScreenshotInput = document.getElementById("payScreenshot");
if (payScreenshotInput) {
    payScreenshotInput.addEventListener("change", function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function() {
                const canvas = document.createElement("canvas");
                const scaleSize = 600 / img.width;
                canvas.width = 600;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                document.getElementById("payScreenshotBase64").value = canvas.toDataURL("image/jpeg", 0.7);
            };
        };
    });
}

// =======================================================
// SUBMIT VIP APPLICATION DIRECTLY TO FIREBASE + AUTO EMAIL
// =======================================================
async function submitVIP() {
    if (!db || !currentAuthUser || !currentPatientData) {
        alert("Session expired. Please login again.");
        return;
    }

    const consentEl = document.getElementById("vipConsentCheckbox");
    if (consentEl && !consentEl.checked) {
        alert("Please accept the Terms & Conditions and Privacy Policy checkbox.");
        return;
    }

    const payMode = document.querySelector('input[name="payMode"]:checked').value;
    const screenshot = document.getElementById("payScreenshotBase64") ? document.getElementById("payScreenshotBase64").value : "";

    if (payMode === 'online' && !screenshot) {
        alert("Please upload the payment screenshot first.");
        return;
    }

    const btn = document.getElementById("btn-submit");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting to Firebase...';
    btn.disabled = true;

    try {
        const pUserId = currentPatientData.user_id || localStorage.getItem("bhavya_user_id") || currentAuthUser.uid;
        const m1 = (document.getElementById("mem1Name").value.trim() || currentPatientData.name || "Self");
        const m2 = document.getElementById("mem2Name").value.trim();
        const m3 = document.getElementById("mem3Name").value.trim();
        const payId = document.getElementById("payId") ? document.getElementById("payId").value.trim() : "";

        const m1_id = pUserId + "_M1";
        const m2_id = m2 ? pUserId + "_M2" : "";
        const m3_id = m3 ? pUserId + "_M3" : "";
        const membersArr = [m1, m2, m3].filter(Boolean);

        const vipDetailsObj = {
            start_date: "",
            end_date: "",
            member1_name: m1,
            member1_id: m1_id,
            member2_name: m2,
            member2_id: m2_id,
            member3_name: m3,
            member3_id: m3_id,
            referrer_user_id: validReferrerId,
            referrer_uid: validReferrerUid,
            payment_mode: payMode,
            payment_id: payId,
            payment_screenshot: screenshot,
            amount_paid: finalAmount,
            admin_remarks: "",
            vip_status: "pending",
            applied_at: new Date().toISOString()
        };

        // 1. Update 'patients/{uid}' document
        await db.collection("patients").doc(currentAuthUser.uid).set({
            current_plan_status: "pending",
            plan: "pending",
            isVip: false,
            vipMembers: membersArr,
            vip_package_status: "pending",
            vip_details: vipDetailsObj,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 2. Save in 'vip_requests/{uid}' for Admin Panel review & approval
        await db.collection("vip_requests").doc(currentAuthUser.uid).set({
            uid: currentAuthUser.uid,
            user_id: pUserId,
            patient_name: m1,
            mobile: currentPatientData.mobile || currentAuthUser.phoneNumber || "",
            email: currentPatientData.email || "",
            address: [currentPatientData.address, currentPatientData.city, currentPatientData.pincode].filter(Boolean).join(", "),
            members: membersArr,
            member_1_name: m1,
            member_1_user_id: m1_id,
            member_2_name: m2,
            member_2_user_id: m2_id,
            member_3_name: m3,
            member_3_user_id: m3_id,
            referrer_user_id: validReferrerId,
            referrer_uid: validReferrerUid,
            payment_mode: payMode,
            payment_id: payId,
            payment_screenshot: screenshot,
            amount_paid: finalAmount,
            status: "pending",
            admin_remarks: "",
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 3. Send Automatic Emails via Firebase Extension (contact@bhavyadiagnostics.com)
        const patientEmail = currentPatientData.email || "";
        if (patientEmail && patientEmail.includes("@")) {
            await sendAutoEmail({
                to: patientEmail,
                subject: "VIP Family Membership Application Received - Bhavya Diagnostics",
                html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
                        <h2 style="color:#0056b3;margin-top:0;">VIP Membership Application Received</h2>
                        <p>Dear <b>${escapeHtml(m1)}</b>,</p>
                        <p>We have received your <b>Bhavya VIP Family Plan</b> application (Amount: <b>₹${finalAmount}</b>, Mode: ${escapeHtml(payMode.toUpperCase())}).</p>
                        <p><b>Covered Family Members:</b> ${escapeHtml(membersArr.join(", "))}</p>
                        <p>Our team is verifying your details. Meanwhile, <b>VIP discounted rates are already unlocked</b> for your bookings!</p>
                        <p style="font-size:12px;color:#64748b;">Bhavya Diagnostics • Main Jhajjar Road, Bahadurgarh • Helpline: 89501 12467</p>
                       </div>`
            });
        }

        await sendAutoEmail({
            to: "contact@bhavyadiagnostics.com",
            subject: `New VIP Membership Application: ${m1} (${pUserId}) - ₹${finalAmount}`,
            html: `<div style="font-family:Arial,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
                    <h3 style="color:#0056b3;margin-top:0;">New VIP Membership Request</h3>
                    <ul>
                      <li><b>Applicant:</b> ${escapeHtml(m1)} (${escapeHtml(pUserId)})</li>
                      <li><b>Mobile:</b> ${escapeHtml(currentPatientData.mobile || "")}</li>
                      <li><b>Email:</b> ${escapeHtml(patientEmail)}</li>
                      <li><b>Members:</b> ${escapeHtml(membersArr.join(", "))}</li>
                      <li><b>Payment Mode:</b> ${escapeHtml(payMode.toUpperCase())}</li>
                      <li><b>Amount:</b> ₹${finalAmount}</li>
                      <li><b>UTR / Ref:</b> ${escapeHtml(payId || "N/A")}</li>
                    </ul>
                   </div>`
        });

        localStorage.setItem("bhavya_plan_cache", "pending");
        alert("🎉 VIP Application Submitted! Your plan is under review and VIP rates are unlocked.");
        window.location.reload();
    } catch (error) {
        console.error("VIP submission error:", error);
        alert("Submission failed: " + error.message);
        btn.innerHTML = 'Submit VIP Application <i class="fas fa-arrow-right"></i>';
        btn.disabled = false;
    }
}
