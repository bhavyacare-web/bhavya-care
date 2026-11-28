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
    console.error("Firebase init error:", e);
}

// Public catalog & rules URL (services_rule sheet)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwIxSjlD6oVAGi4InT6Lb8RPg6NWrl7vpptoYrEG5HKPzPaadUp_0pVnN_1OZfJ7X_r/exec";

let vipPrice1Member = 2000;
let vipPrice2Member = 3600;
let selectedMemberCount = 1;
let vipReferralDiscount = 500;
let finalAmount = 2000;

let validReferrerId = "";
let validReferrerUid = "";
let appliedPromo = null; // { code, discount_type, discount_value }
let verifiedPincode = "";

let currentAuthUser = null;
let currentPatientData = {};
let sheetRulesCache = {};
let patientUnsubscribe = null;

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

function formatPayModeLabel(mode) {
    if (mode === "pay_on_collection") return "Payment on Collection Time";
    if (mode === "cash_center" || mode === "cash") return "Cash at Center";
    return "Online UPI";
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
    if (typeof firebase === "undefined" || !firebase.auth) {
        window.location.replace("../index.html");
        return;
    }

    let initialized = false;
    firebase.auth().onAuthStateChanged(async (user) => {
        if (initialized) return;
        initialized = true;

        if (!user) {
            localStorage.setItem("pending_vip_redirect", "true");
            await showMsg("Please login first to buy Bhavya VIP Membership.", "Login Required");
            window.location.replace("../index.html");
            return;
        }

        currentAuthUser = user;
        await initVipPage(user);
    });
});

async function initVipPage(user) {
    try {
        // 1. Load Dynamic Prices & Rules from Google Sheet (services_rule)
        try {
            const ruleRes = await fetch(GOOGLE_SCRIPT_URL, {
                method: "POST",
                body: JSON.stringify({ action: "getBookingData", user_id: "" })
            });
            const ruleJson = await ruleRes.json();
            if (ruleJson.status === "success" && ruleJson.data && ruleJson.data.rules) {
                sheetRulesCache = ruleJson.data.rules;
                vipPrice1Member = Number(sheetRulesCache.vip_plan_price_1_member || sheetRulesCache.vip_plan_price || 2000);
                vipPrice2Member = Number(sheetRulesCache.vip_plan_price_2_member || 3600);
                vipReferralDiscount = Number(sheetRulesCache.vip_purchase_referral_bonus || sheetRulesCache.vip_referral_discount || 500);
            }
        } catch (ruleErr) {
            console.warn("Using default VIP rules:", ruleErr);
        }

        const p1El = document.getElementById("price1Member");
        const p2El = document.getElementById("price2Member");
        if (p1El) p1El.innerText = vipPrice1Member;
        if (p2El) p2El.innerText = vipPrice2Member;
        recalculatePayable();

        // 2. Real-time Listener (Auto-Refresh) on Patient Document — NO Profile Completion Blocker
        const patientRef = db.collection("patients").doc(user.uid);
        if (patientUnsubscribe) patientUnsubscribe();

        let initialRendered = false;
        patientUnsubscribe = patientRef.onSnapshot(async (docSnap) => {
            const pData = docSnap.exists ? docSnap.data() : {};
            currentPatientData = pData;

            const pName = pData.name || pData.patient_name || localStorage.getItem("bhavya_name") || "";
            const pMobile = pData.mobile || pData.mobile_number || user.phoneNumber || "";
            let pUserId = pData.user_id || "";

            if (!pUserId || pUserId === user.uid || pUserId.length > 12) {
                pUserId = generateCustomUserId(pName || "Patient", pMobile);
                if (docSnap.exists) {
                    patientRef.set({ user_id: pUserId, referral_code: pUserId }, { merge: true }).catch(() => {});
                }
            }

            currentPatientData.user_id = pUserId;
            localStorage.setItem("bhavya_user_id", pUserId);
            if (pName) localStorage.setItem("bhavya_name", pName);

            const planStatus = String(pData.current_plan_status || pData.plan || "basic").toLowerCase().trim();
            const vipDetails = pData.vip_details || {};
            const vipSubStatus = String(vipDetails.vip_status || planStatus).toLowerCase().trim();

            // If user is currently filling out the form, don't interrupt unless status became pending/active
            const formVisible = document.getElementById("vip-form-container").style.display === "block";

            if (planStatus === "pending" || vipSubStatus === "pending" || vipSubStatus === "inactive") {
                hideAllContainers();
                document.getElementById("vip-pending-container").style.display = "block";
                const summaryBox = document.getElementById("pendingSummaryBox");
                if (summaryBox) {
                    const members = Array.isArray(pData.vipMembers) && pData.vipMembers.length ? pData.vipMembers.join(", ") : (pName || "Self");
                    const planLabel = (Number(vipDetails.member_count || pData.vipMembers?.length || 1) === 2) ? "2 Members Plan" : "1 Member Plan";
                    summaryBox.innerHTML = `
                        <p style="margin:0 0 6px 0;"><strong>Applicant:</strong> ${escapeHtml(pName || "Patient")} (${escapeHtml(pUserId)})</p>
                        <p style="margin:0 0 6px 0;"><strong>Selected Plan:</strong> ${escapeHtml(planLabel)}</p>
                        <p style="margin:0 0 6px 0;"><strong>Covered Members:</strong> ${escapeHtml(members)}</p>
                        <p style="margin:0;"><strong>Payable / Paid:</strong> ₹${escapeHtml(vipDetails.amount_paid ?? finalAmount)} (${escapeHtml(formatPayModeLabel(vipDetails.payment_mode))})</p>
                    `;
                }
                initialRendered = true;
                return;
            }

            if (planStatus === "vip" || vipSubStatus === "active") {
                hideAllContainers();
                document.getElementById("vip-active-container").style.display = "block";
                const planLabel = (Number(vipDetails.member_count || pData.vipMembers?.length || 1) === 2) ? "2 Members Family Plan" : "1 Member Individual Plan";
                document.getElementById("activePlanType").innerText = planLabel;
                document.getElementById("activeStartDate").innerText = vipDetails.start_date || "Active";
                document.getElementById("activeEndDate").innerText = vipDetails.end_date || "Active";
                const members = Array.isArray(pData.vipMembers) && pData.vipMembers.length ? pData.vipMembers.join(", ") : (pName || "Self");
                document.getElementById("activeMembersList").innerText = members;
                initialRendered = true;
                return;
            }

            if (planStatus === "rejected" || vipSubStatus === "rejected") {
                if (!formVisible) {
                    hideAllContainers();
                    document.getElementById("vip-rejected-container").style.display = "block";
                    document.getElementById("rejectedRemarks").innerText = vipDetails.admin_remarks || "Please check payment details and re-apply.";
                }
                initialRendered = true;
                return;
            }

            // Directly show Pincode Check (No Complete Profile Requirement)
            if (!initialRendered) {
                hideAllContainers();
                const mem1El = document.getElementById("mem1Name");
                if (mem1El && pName) mem1El.value = pName;
                if (pData.pincode && document.getElementById("checkPincodeInput")) {
                    document.getElementById("checkPincodeInput").value = pData.pincode;
                }
                document.getElementById("vip-pincode-container").style.display = "block";
                initialRendered = true;
            }
        }, (err) => {
            console.error("VIP live listener error:", err);
            hideAllContainers();
            document.getElementById("vip-pincode-container").style.display = "block";
        });

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

function selectMemberPlan(count) {
    selectedMemberCount = count === 2 ? 2 : 1;
    document.getElementById("planCard1").classList.toggle("selected", selectedMemberCount === 1);
    document.getElementById("planCard2").classList.toggle("selected", selectedMemberCount === 2);

    const radios = document.querySelectorAll('input[name="memberPlan"]');
    radios.forEach(r => { r.checked = (Number(r.value) === selectedMemberCount); });

    const mem2Group = document.getElementById("member2Group");
    if (mem2Group) {
        mem2Group.style.display = selectedMemberCount === 2 ? "block" : "none";
    }

    recalculatePayable();
}

function getBasePlanPrice() {
    return selectedMemberCount === 2 ? vipPrice2Member : vipPrice1Member;
}

function recalculatePayable() {
    const base = getBasePlanPrice();
    let discountAmt = 0;
    let summaryText = selectedMemberCount === 2 ? "2 Members Plan" : "1 Member Plan";

    if (appliedPromo) {
        if (appliedPromo.discount_type === "percent") {
            discountAmt = Math.round((base * Number(appliedPromo.discount_value || 0)) / 100);
        } else {
            discountAmt = Number(appliedPromo.discount_value || 0);
        }
        summaryText += ` • Promo (${appliedPromo.code}): -₹${discountAmt}`;
    } else if (validReferrerId) {
        discountAmt = vipReferralDiscount;
        summaryText += ` • Referral Discount: -₹${discountAmt}`;
    }

    finalAmount = Math.max(0, base - discountAmt);

    const finalEl = document.getElementById("finalPayable");
    const upiBtnAmt = document.getElementById("upiBtnAmt");
    const sumEl = document.getElementById("discountSummaryLine");
    if (finalEl) finalEl.innerText = finalAmount;
    if (upiBtnAmt) upiBtnAmt.innerText = finalAmount;
    if (sumEl) sumEl.innerText = summaryText;
}

async function verifyPincodeAndProceed() {
    const pincode = document.getElementById("checkPincodeInput").value.trim();
    if (!pincode || !/^\d{6}$/.test(pincode)) {
        showMsg("Please enter a valid 6-digit pincode.", "Invalid Pincode");
        return;
    }

    const btn = document.getElementById("btnCheckPincode");
    btn.innerText = "Checking...";
    btn.disabled = true;

    try {
        const rawVipPins = String(sheetRulesCache.vip_available_pincodes || sheetRulesCache.serviceable_pincodes || "").trim();
        if (rawVipPins) {
            const allowedList = rawVipPins.split(",").map(p => p.trim()).filter(Boolean);
            if (allowedList.includes(pincode)) {
                verifiedPincode = pincode;
                document.getElementById("vip-pincode-container").style.display = "none";
                document.getElementById("vip-form-container").style.display = "block";
                togglePaymentMode();
                recalculatePayable();
                return;
            } else {
                showMsg("Currently, VIP Membership is not available in your area (" + pincode + ").", "Not Serviceable");
                return;
            }
        }

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ action: "checkVipPincode", pincode: pincode })
        });
        const result = await response.json();

        if (result.status === "success") {
            verifiedPincode = pincode;
            document.getElementById("vip-pincode-container").style.display = "none";
            document.getElementById("vip-form-container").style.display = "block";
            togglePaymentMode();
            recalculatePayable();
        } else {
            showMsg("Currently, VIP Membership is not available in your area. Please try again later.", "Not Serviceable");
            document.getElementById("checkPincodeInput").value = "";
        }
    } catch (error) {
        showMsg("Network error. Please try again.", "Connection Issue");
    } finally {
        btn.innerHTML = 'Check &amp; Proceed <i class="fas fa-arrow-right"></i>';
        btn.disabled = false;
    }
}

function togglePaymentMode() {
    const selected = document.querySelector('input[name="payMode"]:checked');
    const isOnline = selected ? (selected.value === "online") : true;
    document.getElementById("online-pay-section").style.display = isOnline ? "block" : "none";
}

function copyUpiId() {
    if (navigator.clipboard) {
        navigator.clipboard.writeText("8950112467@ptsbi").then(() => {
            showMsg("UPI ID copied: 8950112467@ptsbi", "Copied");
        }).catch(() => {});
    }
}

function payViaUPI() {
    if (navigator.clipboard) {
        navigator.clipboard.writeText("8950112467@ptsbi").catch(() => {});
    }
    const upiId = "8950112467@ptsbi";
    const name = "Bhavya Diagnostics";
    const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${finalAmount}&cu=INR&tn=Bhavya%20VIP%20Plan`;
    window.location.href = upiUrl;
}

// =======================================================
// VERIFY CAMP PROMO CODE OR REFERRAL CODE (FIREBASE)
// =======================================================
async function verifyCode() {
    const codeInput = document.getElementById("refCodeInput");
    const code = codeInput.value.trim().toUpperCase();
    const msg = document.getElementById("refMsg");
    const btn = document.getElementById("btn-apply-ref");
    const removeBtn = document.getElementById("btn-remove-ref");

    if (!code) {
        msg.style.display = "block";
        msg.style.color = "var(--danger)";
        msg.innerText = "Please enter a promo or referral code first.";
        return;
    }

    btn.innerText = "Checking...";
    btn.disabled = true;

    try {
        if (!db) throw new Error("Database not ready");

        // 1. Check Camp Promo Code in Firestore ('promo_codes/{CODE}')
        try {
            const promoSnap = await db.collection("promo_codes").doc(code).get();
            if (promoSnap.exists) {
                const promo = promoSnap.data();
                const status = String(promo.status || "inactive").toLowerCase().trim();
                const applyOn = String(promo.apply_on || "all").toLowerCase().trim();

                if (status === "active" && (applyOn === "vip" || applyOn === "all")) {
                    validReferrerId = "";
                    validReferrerUid = "";
                    appliedPromo = {
                        code: code,
                        discount_type: String(promo.discount_type || "flat").toLowerCase(),
                        discount_value: Number(promo.discount_value || 0)
                    };
                    recalculatePayable();

                    const label = appliedPromo.discount_type === "percent"
                        ? `${appliedPromo.discount_value}% OFF`
                        : `₹${appliedPromo.discount_value} OFF`;
                    msg.style.display = "block";
                    msg.style.color = "var(--success)";
                    msg.innerText = `Camp Offer Applied! ${label} discount added.`;
                    codeInput.readOnly = true;
                    btn.style.display = "none";
                    if (removeBtn) removeBtn.style.display = "inline-block";
                    return;
                } else {
                    msg.style.display = "block";
                    msg.style.color = "var(--danger)";
                    msg.innerText = "This promo code is expired or not valid for VIP Membership.";
                    return;
                }
            }
        } catch (promoErr) {
            console.warn("Promo check skipped:", promoErr);
        }

        // 2. Check Referral Code in Firestore ('patients')
        const allowSelf = String(sheetRulesCache.allow_self_referral || "FALSE").toUpperCase() === "TRUE";
        const myUserId = (currentPatientData.user_id || localStorage.getItem("bhavya_user_id") || "").toUpperCase();

        if (!allowSelf && myUserId && code === myUserId) {
            msg.style.display = "block";
            msg.style.color = "var(--danger)";
            msg.innerText = "You cannot use your own referral code.";
            return;
        }

        const snap = await db.collection("patients").where("referral_code", "==", code).limit(1).get();
        if (!snap.empty) {
            const refDoc = snap.docs[0];
            if (!allowSelf && currentAuthUser && refDoc.id === currentAuthUser.uid) {
                msg.style.display = "block";
                msg.style.color = "var(--danger)";
                msg.innerText = "You cannot use your own referral code.";
                return;
            }

            appliedPromo = null;
            validReferrerUid = refDoc.id;
            validReferrerId = refDoc.data().user_id || refDoc.id;
            recalculatePayable();

            msg.style.display = "block";
            msg.style.color = "var(--success)";
            msg.innerText = `Referral Code Applied! ₹${vipReferralDiscount} discount added.`;
            codeInput.readOnly = true;
            btn.style.display = "none";
            if (removeBtn) removeBtn.style.display = "inline-block";
            return;
        }

        msg.style.display = "block";
        msg.style.color = "var(--danger)";
        msg.innerText = "Invalid Promo or Referral Code.";
    } catch (err) {
        msg.style.display = "block";
        msg.style.color = "var(--danger)";
        msg.innerText = "Error checking code. Please try again.";
    } finally {
        btn.innerText = "Apply";
        btn.disabled = false;
    }
}

function removeAppliedCode() {
    appliedPromo = null;
    validReferrerId = "";
    validReferrerUid = "";
    const codeInput = document.getElementById("refCodeInput");
    const msg = document.getElementById("refMsg");
    const btn = document.getElementById("btn-apply-ref");
    const removeBtn = document.getElementById("btn-remove-ref");

    if (codeInput) {
        codeInput.readOnly = false;
        codeInput.value = "";
    }
    if (msg) msg.style.display = "none";
    if (btn) btn.style.display = "inline-block";
    if (removeBtn) removeBtn.style.display = "none";
    recalculatePayable();
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
                const maxW = 600;
                const scale = img.width > maxW ? (maxW / img.width) : 1;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                document.getElementById("payScreenshotBase64").value = canvas.toDataURL("image/jpeg", 0.7);
            };
        };
    });
}

// =======================================================
// SUBMIT VIP APPLICATION TO FIREBASE + AUTO EMAIL
// =======================================================
async function submitVIP() {
    if (!db || !currentAuthUser) {
        await showMsg("Session expired. Please login again.", "Session Expired");
        window.location.replace("../index.html");
        return;
    }

    const m1 = document.getElementById("mem1Name").value.trim();
    const m2 = selectedMemberCount === 2 ? document.getElementById("mem2Name").value.trim() : "";

    if (!m1) {
        showMsg("Please enter Member 1 (Primary) Full Name.", "Missing Name");
        return;
    }
    if (selectedMemberCount === 2 && !m2) {
        showMsg("Please enter Member 2 Full Name for the 2-Member VIP Plan.", "Missing Name");
        return;
    }

    const consentEl = document.getElementById("vipConsentCheckbox");
    if (consentEl && !consentEl.checked) {
        showMsg("Please accept the Terms & Conditions and Privacy Policy checkbox.", "Consent Required");
        return;
    }

    const payMode = document.querySelector('input[name="payMode"]:checked').value;
    const screenshot = document.getElementById("payScreenshotBase64") ? document.getElementById("payScreenshotBase64").value : "";

    if (payMode === "online" && !screenshot) {
        showMsg("Please upload the UPI payment screenshot first.", "Screenshot Required");
        return;
    }

    const btn = document.getElementById("btn-submit");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    btn.disabled = true;

    try {
        const pMobile = currentPatientData.mobile || currentPatientData.mobile_number || currentAuthUser.phoneNumber || "";
        const pUserId = currentPatientData.user_id || generateCustomUserId(m1, pMobile);
        const payId = document.getElementById("payId") ? document.getElementById("payId").value.trim() : "";
        const payModeText = formatPayModeLabel(payMode);

        const m1_id = pUserId + "_M1";
        const m2_id = m2 ? (pUserId + "_M2") : "";
        const membersArr = [m1, m2].filter(Boolean);
        const planTypeLabel = selectedMemberCount === 2 ? "2_members" : "1_member";

        const vipDetailsObj = {
            start_date: "",
            end_date: "",
            plan_type: planTypeLabel,
            member_count: selectedMemberCount,
            member1_name: m1,
            member1_id: m1_id,
            member2_name: m2,
            member2_id: m2_id,
            referrer_user_id: validReferrerId,
            referrer_uid: validReferrerUid,
            promo_code_used: appliedPromo ? appliedPromo.code : "",
            payment_mode: payMode,
            payment_mode_label: payModeText,
            payment_id: payId,
            payment_screenshot: payMode === "online" ? screenshot : "",
            base_price: getBasePlanPrice(),
            amount_paid: finalAmount,
            admin_remarks: "",
            vip_status: "pending",
            applied_at: new Date().toISOString()
        };

        // 1. Update 'patients/{uid}' (Works even if user skipped profile completion)
        const patientUpdate = {
            uid: currentAuthUser.uid,
            user_id: pUserId,
            referral_code: currentPatientData.referral_code || pUserId,
            name: currentPatientData.name || m1,
            patient_name: currentPatientData.patient_name || m1,
            mobile: pMobile,
            pincode: currentPatientData.pincode || verifiedPincode || "",
            current_plan_status: "pending",
            plan: "pending",
            isVip: false,
            vip_member_count: selectedMemberCount,
            vipMembers: membersArr,
            // Split VIP Free Packages (VIP-FREE-001 Blood & VIP-FREE-002 ECG+PFT+BCA)
            vip_package_status: "pending",
            vip_blood_pkg_status: "pending",
            vip_ecg_pft_pkg_status: "pending",
            vip_blood_pkg_remaining: selectedMemberCount,
            vip_ecg_pft_pkg_remaining: selectedMemberCount,
            vip_details: vipDetailsObj,
            updated_at: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("patients").doc(currentAuthUser.uid).set(patientUpdate, { merge: true });

        // 2. Save in 'vip_requests/{uid}' for Admin Panel approval
        await db.collection("vip_requests").doc(currentAuthUser.uid).set({
            uid: currentAuthUser.uid,
            user_id: pUserId,
            patient_name: m1,
            mobile: pMobile,
            email: currentPatientData.email || "",
            pincode: currentPatientData.pincode || verifiedPincode || "",
            address: [currentPatientData.address, currentPatientData.city, currentPatientData.pincode || verifiedPincode].filter(Boolean).join(", "),
            plan_type: planTypeLabel,
            member_count: selectedMemberCount,
            members: membersArr,
            member_1_name: m1,
            member_1_user_id: m1_id,
            member_2_name: m2,
            member_2_user_id: m2_id,
            referrer_user_id: validReferrerId,
            referrer_uid: validReferrerUid,
            promo_code_used: appliedPromo ? appliedPromo.code : "",
            payment_mode: payMode,
            payment_mode_label: payModeText,
            payment_id: payId,
            payment_screenshot: payMode === "online" ? screenshot : "",
            base_price: getBasePlanPrice(),
            amount_paid: finalAmount,
            status: "pending",
            admin_remarks: "",
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 3. Increment Promo Code usage count if a Camp Promo Code was applied
        if (appliedPromo && appliedPromo.code) {
            db.collection("promo_codes").doc(appliedPromo.code).update({
                used_count: firebase.firestore.FieldValue.increment(1)
            }).catch(() => {});
        }

        // 4. Send Auto Emails
        const patientEmail = currentPatientData.email || "";
        if (patientEmail && patientEmail.includes("@")) {
            await sendAutoEmail({
                to: patientEmail,
                subject: "VIP Membership Application Received - Bhavya Diagnostics",
                html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
                        <h2 style="color:#0056b3;margin-top:0;">VIP Membership Application Received</h2>
                        <p>Dear <b>${escapeHtml(m1)}</b>,</p>
                        <p>We have received your <b>Bhavya VIP Plan (${selectedMemberCount} Member${selectedMemberCount > 1 ? "s" : ""})</b> application (Payable: <b>₹${finalAmount}</b>, Mode: <b>${escapeHtml(payModeText)}</b>).</p>
                        <p><b>Covered Members:</b> ${escapeHtml(membersArr.join(", "))}</p>
                        <p style="background:#fffbeb;border:1px solid #f59e0b;padding:10px;border-radius:8px;color:#92400e;font-size:13px;">
                            <b>Important:</b> You can book tests at VIP rates right now. However, if your VIP Membership is not activated before or at sample collection time, your booking prices will be converted to Standard Basic rates.
                        </p>
                        <p style="font-size:12px;color:#64748b;">Bhavya Diagnostics • Main Jhajjar Road, Bahadurgarh • Helpline: 89501 12467</p>
                       </div>`
            });
        }

        await sendAutoEmail({
            to: "contact@bhavyadiagnostics.com",
            subject: `New VIP Application (${selectedMemberCount}M): ${m1} (${pUserId}) - ₹${finalAmount}`,
            html: `<div style="font-family:Arial,sans-serif;padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
                    <h3 style="color:#0056b3;margin-top:0;">New VIP Membership Request</h3>
                    <ul>
                      <li><b>Applicant:</b> ${escapeHtml(m1)} (${escapeHtml(pUserId)})</li>
                      <li><b>Mobile:</b> ${escapeHtml(pMobile)}</li>
                      <li><b>Pincode:</b> ${escapeHtml(currentPatientData.pincode || verifiedPincode || "N/A")}</li>
                      <li><b>Plan:</b> ${selectedMemberCount} Member(s) — ${escapeHtml(membersArr.join(", "))}</li>
                      <li><b>Payment Mode:</b> ${escapeHtml(payModeText)}</li>
                      <li><b>Amount:</b> ₹${finalAmount} (Promo: ${escapeHtml(appliedPromo ? appliedPromo.code : "None")} | Ref: ${escapeHtml(validReferrerId || "None")})</li>
                      <li><b>UTR / Ref:</b> ${escapeHtml(payId || "N/A")}</li>
                    </ul>
                   </div>`
        });

        localStorage.setItem("bhavya_plan_cache", "pending");
        localStorage.setItem("bhavya_name", m1);
        await showMsg("VIP Application Submitted! Your VIP rates are unlocked. Note: Please ensure VIP activation before sample collection time to keep VIP prices.", "Application Submitted");
    } catch (error) {
        console.error("VIP submission error:", error);
        showMsg("Submission failed: " + error.message, "Error");
        btn.innerHTML = 'Submit VIP Application <i class="fas fa-arrow-right"></i>';
        btn.disabled = false;
    }
}
