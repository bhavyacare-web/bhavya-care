// 🌟 LATEST GOOGLE SCRIPT URL PROVIDED BY YOU
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw26yqYEJ-zDBDMGovdu-OVuK1RndF5iggDrRpdpKz2wqyNiDnFIIpExKjSdWWeDAYi/exec";

// Global variables for VIP logic
let finalVipAmount = 999;
let appliedPromo = "";

// --- Page Load Event ---
document.addEventListener("DOMContentLoaded", () => {
    fetchDashboardData();
});

// --- Fetch Dashboard Data ---
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
            document.getElementById("vipStatus").innerText = data.profile.vip_status || "Basic";
            document.getElementById("refCode").innerText = data.profile.referral_code || "N/A";

            if(data.profile.vip_status && data.profile.vip_status !== "Basic") {
                document.getElementById("vipStatus").style.color = "#d35400";
                document.getElementById("vipStatus").style.fontWeight = "bold";
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
            document.getElementById("userNameDisplay").innerText = "Error Loading Profile";
        }
    } catch (error) {
        console.error("Dashboard Fetch Error:", error);
        document.getElementById("userNameDisplay").innerText = "Connection Error";
    }
}

// --- Request Withdraw Function ---
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
            } else {
                alert("Server Error: " + res.message);
            }
        } catch(e) {
            alert("Network Error while sending request.");
        }
    } else if (amount) {
        alert("Please enter a valid amount (Minimum ₹500).");
    }
}

// --- Tab Switching Logic ---
window.switchTab = function(tabId) {
    let contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));
    
    let links = document.querySelectorAll('.nav-links a');
    links.forEach(link => link.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');

    if(window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('show');
    }
}

window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('show');
}

window.logoutDashboard = function() {
    if(confirm("Are you sure you want to logout?")) {
        localStorage.clear();
        alert("Logged out successfully.");
        window.location.href = "../index.html"; 
    }
}

// ==========================================
// VIP UPGRADE LOGIC (With Promo Code)
// ==========================================

window.copyMyReferral = function() {
    const code = document.getElementById("refCode").innerText;
    if(code && code !== "-----") {
        navigator.clipboard.writeText(code);
        alert("Referral Code Copied! Share it with friends.");
    }
}

window.openVipModal = function() {
    document.getElementById("vip-modal").style.display = "flex";
}

window.closeVipModal = function() {
    document.getElementById("vip-modal").style.display = "none";
    document.getElementById("vipPayMode").value = "";
    document.getElementById("vipMem1").value = "";
    document.getElementById("vipMem2").value = "";
    document.getElementById("vipMem3").value = "";
    document.getElementById("vipUtr").value = "";
    document.getElementById("vipScreenshot").value = "";
    document.getElementById("vipPromoCode").value = "";
    document.getElementById("vipPromoCode").disabled = false;
    document.getElementById("btn-apply-promo").disabled = false;
    document.getElementById("promo-msg").style.display = "none";
    
    finalVipAmount = 999;
    appliedPromo = "";
    document.getElementById("vipFinalPrice").innerText = finalVipAmount;
    document.getElementById("originalPriceText").style.display = "none";
    
    toggleVipPaymentFields(); 
}

window.toggleVipPaymentFields = function() {
    const payMode = document.getElementById("vipPayMode").value;
    const onlineSec = document.getElementById("vip-online-section");
    const cashSec = document.getElementById("vip-cash-section");

    if (payMode === "Online") { onlineSec.style.display = "block"; cashSec.style.display = "none"; } 
    else if (payMode === "Cash") { onlineSec.style.display = "none"; cashSec.style.display = "block"; } 
    else { onlineSec.style.display = "none"; cashSec.style.display = "none"; }
}

window.copyUpiId = function() {
    const upiId = document.getElementById("bhavyaUpiId").innerText;
    navigator.clipboard.writeText(upiId).then(() => {
        const msg = document.getElementById("copy-msg");
        msg.style.display = "block";
        setTimeout(() => { msg.style.display = "none"; }, 2500); 
    });
}

window.applyPromoCode = async function() {
    const codeInput = document.getElementById("vipPromoCode").value.trim().toUpperCase();
    const msgBox = document.getElementById("promo-msg");
    
    if (!codeInput) { msgBox.style.display = "block"; msgBox.style.color = "red"; msgBox.innerText = "Please enter a code!"; return; }

    msgBox.style.display = "block";
    msgBox.style.color = "#0056b3";
    msgBox.innerText = "Checking code...";

    try {
        const payload = { action: "checkPromoCode", promo_code: codeInput };
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.status === "success") {
            let discount = Number(data.discount_amount);
            finalVipAmount = 999 - discount;
            appliedPromo = codeInput;

            document.getElementById("vipFinalPrice").innerText = finalVipAmount;
            document.getElementById("originalPriceText").style.display = "inline"; 
            
            msgBox.style.color = "green";
            msgBox.innerText = `🎉 Code Applied! You got ₹${discount} off.`;
            document.getElementById("vipPromoCode").disabled = true; 
            document.getElementById("btn-apply-promo").disabled = true; 
        } else {
            msgBox.style.color = "red";
            msgBox.innerText = "❌ Invalid or Expired Code.";
        }
    } catch (error) {
        msgBox.style.color = "red";
        msgBox.innerText = "Network error. Try again.";
    }
}

window.submitVipRequest = async function() {
    const userId = localStorage.getItem("bhavya_user_id");
    const payMode = document.getElementById("vipPayMode").value;
    const mem1 = document.getElementById("vipMem1").value.trim();
    const mem2 = document.getElementById("vipMem2").value.trim();
    const mem3 = document.getElementById("vipMem3").value.trim();

    if (!payMode) { alert("Please select a Payment Mode."); return; }

    let payload = {
        action: "submitVipRequest",
        user_id: userId,
        amount_paid: finalVipAmount,
        applied_promo: appliedPromo,
        payment_mode: payMode,
        members: [mem1, mem2, mem3],
        payment_id: "Cash on Visit", 
        screenshot_data: "",
        screenshot_name: ""
    };

    const btn = document.getElementById("btn-submit-vip");

    if (payMode === "Online") {
        const utr = document.getElementById("vipUtr").value.trim();
        const fileInput = document.getElementById("vipScreenshot");

        if (utr.length < 5) { alert("Please enter a valid UTR / Reference Number."); return; } 
        if (fileInput.files.length === 0) { alert("Please upload a payment screenshot."); return; }

        const file = fileInput.files[0];
        if (file.size > 2 * 1024 * 1024) { alert("Image size must be less than 2MB."); return; }

        payload.payment_id = utr;
        btn.innerText = "Uploading & Processing...";
        btn.disabled = true;

        const reader = new FileReader();
        reader.onload = async function(e) {
            payload.screenshot_data = e.target.result.split(",")[1];
            payload.screenshot_name = file.name;
            await sendVipDataToBackend(payload, btn);
        };
        reader.readAsDataURL(file);
    } 
    else {
        btn.innerText = "Processing...";
        btn.disabled = true;
        await sendVipDataToBackend(payload, btn);
    }
}

async function sendVipDataToBackend(payload, btn) {
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (data.status === "success") {
            alert("Application Submitted! Your VIP Plan will be activated after Admin verification.");
            closeVipModal();
        } else {
            alert("Server Error: " + data.message);
        }
    } catch (error) {
        alert("Connection Failed. Please try again.");
        console.error(error);
    } finally {
        btn.innerText = "Submit Application";
        btn.disabled = false;
    }
}
