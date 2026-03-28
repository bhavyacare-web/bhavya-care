// 🌟 LATEST GOOGLE SCRIPT URL PROVIDED BY YOU
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyK5KjB9Cs1mTMqvdmOIhoFxS8KDPXfUajzXaxXrYCD6gw3_tQmnciFCKnfJoJAedSw/exec";

let userEmailForVIP = ""; 

document.addEventListener("DOMContentLoaded", () => {
    fetchDashboardData();
});

async function fetchDashboardData() {
    const userId = localStorage.getItem("bhavya_user_id");
    if (!userId) {
        alert("Please login to access your Dashboard!");
        window.location.href = "../index.html"; 
        return;
    }

    document.getElementById("userIdDisplay").innerText = userId;
    document.getElementById("userNameDisplay").innerText = "Loading...";

    try {
        const payload = { action: "getDashboardData", user_id: userId };
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.status === "success") {
            const firstName = data.profile.name ? data.profile.name.split(" ")[0] : "Patient";
            document.getElementById("userNameDisplay").innerText = firstName;
            document.getElementById("walletBal").innerText = data.profile.wallet_balance || 0;
            document.getElementById("refCode").innerText = data.profile.referral_code || "N/A";
            
            // Set VIP Status Text
            const vipStatusDisplay = document.getElementById("vipStatus");
            const vipUpgradeBtn = document.getElementById("upgradeVipBtn");
            const currentVipStatus = data.profile.vip_status || "Basic";
            
            vipStatusDisplay.innerText = currentVipStatus;

            // 🌟 LOGIC: Hide Upgrade button if user is already VIP or Pending
            if(currentVipStatus.toLowerCase() !== "basic") {
                vipStatusDisplay.style.color = "#d35400";
                vipStatusDisplay.style.fontWeight = "bold";
                if(vipUpgradeBtn) vipUpgradeBtn.style.display = "none"; // Hide Button
            } else {
                vipStatusDisplay.style.color = "#333";
                vipStatusDisplay.style.fontWeight = "normal";
                if(vipUpgradeBtn) vipUpgradeBtn.style.display = "inline-block"; // Show Button
            }

            if(data.profile.email) userEmailForVIP = data.profile.email;

            const banner = document.getElementById("profile-warning-banner");
            if (banner) {
                if (data.profile.name === "New Profile") banner.style.display = "block";
                else banner.style.display = "none";
            }

            const tbody = document.querySelector("#walletTable tbody");
            tbody.innerHTML = ""; 

            if (data.wallet_history && data.wallet_history.length > 0) {
                data.wallet_history.forEach(tx => {
                    let txDate = new Date(tx.date).toLocaleDateString('en-GB');
                    if(txDate === "Invalid Date") txDate = tx.date; 
                    
                    let color = tx.type === "Credit" ? "green" : "red";
                    let sign = tx.type === "Credit" ? "+" : "-";
                    let statusHtml = tx.status === "Pending" ? `<span class="status-badge status-pending">Pending</span>` : "";

                    let row = `<tr>
                        <td>${txDate}</td>
                        <td>${tx.reason} ${statusHtml}</td>
                        <td style="color: ${color}; font-weight: bold;">${sign} ₹${tx.amount}</td>
                        <td>${tx.type}</td>
                    </tr>`;
                    tbody.innerHTML += row;
                });
            } else {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#888;">No transactions found yet.</td></tr>`;
            }
        } else {
            alert("System Error: " + data.message);
        }
    } catch (error) {
        console.error("Dashboard Fetch Error:", error);
    }
}

window.requestWithdraw = async function() {
    const userId = localStorage.getItem("bhavya_user_id");
    const amount = prompt("Enter amount to withdraw (Min ₹500):");
    
    if (amount && !isNaN(amount) && Number(amount) >= 500) {
        const currentBal = Number(document.getElementById("walletBal").innerText);
        if(Number(amount) > currentBal) {
            alert("Insufficient Wallet Balance!");
            return;
        }

        const payload = { action: "requestWithdraw", user_id: userId, amount: Number(amount) };
        try {
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
            });
            const res = await response.json();
            if(res.status === "success") {
                alert("Withdrawal request sent! Admin will approve it shortly.");
                fetchDashboardData(); 
            } else alert("Server Error: " + res.message);
        } catch(e) { alert("Network Error while sending request."); }
    } else if (amount) alert("Please enter a valid amount (Minimum ₹500).");
}

window.copyMyReferral = function() {
    const code = document.getElementById("refCode").innerText;
    if(code && code !== "-----" && code !== "N/A") {
        navigator.clipboard.writeText(code);
        alert("Referral Code Copied! Share it with friends to earn cashback.");
    }
}

window.switchTab = function(tabId) {
    let contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));
    let links = document.querySelectorAll('.nav-links a');
    links.forEach(link => link.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
    if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('show');
}

window.toggleSidebar = function() { document.getElementById('sidebar').classList.toggle('show'); }
window.logoutDashboard = function() {
    if(confirm("Are you sure you want to logout?")) {
        localStorage.clear();
        window.location.href = "../index.html"; 
    }
}

// 🌟 SAVE PROFILE FROM DASHBOARD
window.savePatientProfileFromDash = async function() {
    const userId = localStorage.getItem("bhavya_user_id");
    const name = document.getElementById("profName").value.trim();
    const dob = document.getElementById("profDOB").value;
    const email = document.getElementById("profEmail").value.trim();
    const address = document.getElementById("profAddress").value.trim();
    const city = document.getElementById("profCity").value.trim();
    const pincode = document.getElementById("profPincode").value.trim();

    if (!name || !email || !address || !city || !pincode) return alert("Please fill all the mandatory (*) fields!");

    const btn = document.getElementById("btn-save-profile");
    btn.innerText = "Saving Profile...";
    btn.disabled = true;

    const payload = { action: "saveProfile", user_id: userId, name: name, dob: dob, email: email, address: address, city: city, pincode: pincode, referral: "" };

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.status === "success") {
            alert("Profile Saved Successfully! 🎉");
            document.getElementById("profile-form-section").style.display = "none";
            fetchDashboardData(); 
        } else alert("Error: " + data.message);
    } catch (error) { alert("Network Error!"); } 
    finally { btn.innerText = "Save Profile"; btn.disabled = false; }
}

// 🌟 VIP PLAN LOGIC
let currentVipPrice = 3000;
let appliedRefCode = "";

window.openVIPModal = function() {
    const currentName = document.getElementById("userNameDisplay").innerText;
    if(currentName === "Patient" || currentName === "Loading..." || document.getElementById("profile-warning-banner").style.display === "block") {
        alert("Please complete your profile form first before purchasing the VIP Plan!");
        document.getElementById("profile-form-section").style.display = "block";
        return;
    }
    document.getElementById("vipMem1").value = document.getElementById("userNameDisplay").innerText;
    document.getElementById("vip-upgrade-modal").style.display = "block";
    updateUPIIntent();
}

window.togglePaymentSection = function() {
    const isOnline = document.querySelector('input[name="payMode"]:checked').value === "Online";
    document.getElementById("onlinePaymentSection").style.display = isOnline ? "block" : "none";
}

window.applyReferralDiscount = function() {
    const code = document.getElementById("vipRefCode").value.trim();
    if(code === "") return alert("Please enter a referral code.");
    
    currentVipPrice = 2500; // Rs 500 Discount
    appliedRefCode = code;
    document.getElementById("finalVipAmount").innerText = currentVipPrice;
    document.getElementById("refMsg").style.display = "block";
    document.getElementById("vipRefCode").disabled = true;
    updateUPIIntent();
}

function updateUPIIntent() {
    const upiLink = `upi://pay?pa=8950112467@ptsbi&pn=BhavyaCare&am=${currentVipPrice}&cu=INR`;
    document.getElementById("upiPayBtn").href = upiLink;
}

window.submitVIPForm = async function() {
    const userId = localStorage.getItem("bhavya_user_id");
    const m1 = document.getElementById("vipMem1").value.trim();
    const m2 = document.getElementById("vipMem2").value.trim();
    const m3 = document.getElementById("vipMem3").value.trim();
    const payMode = document.querySelector('input[name="payMode"]:checked').value;
    const txnId = document.getElementById("vipTxnId").value.trim();
    const fileInput = document.getElementById("vipScreenshot");
    
    if(payMode === "Online" && txnId === "" && fileInput.files.length === 0) {
        return alert("Please provide either a Payment ID or upload a screenshot for Online Payment.");
    }

    const btn = document.getElementById("btn-submit-vip");
    btn.innerText = "Uploading & Submitting...";
    btn.disabled = true;

    let payload = {
        action: "buyVIPPlan", user_id: userId, user_email: userEmailForVIP, 
        m1_name: m1, m2_name: m2, m3_name: m3, referral_code: appliedRefCode,
        payment_mode: payMode, payment_id: txnId, amount_paid: currentVipPrice,
        screenshotBase64: "", screenshotMimeType: "", screenshotName: ""
    };

    const getBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error);
    });

    try {
        if(payMode === "Online" && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const base64Data = await getBase64(file);
            payload.screenshotBase64 = base64Data.split(',')[1];
            payload.screenshotMimeType = file.type;
            payload.screenshotName = userId + "_VIP_Payment_" + file.name;
        }

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        });
        const res = await response.json();
        
        if(res.status === "success") {
            alert("VIP Plan Request Submitted! Admin will activate your plan shortly.");
            document.getElementById("vip-upgrade-modal").style.display = "none";
            fetchDashboardData(); 
        } else alert("Submission Failed: " + res.message);
    } catch(e) { alert("Network Error! Please try again."); } 
    finally { btn.innerText = "Submit Request"; btn.disabled = false; }
}
