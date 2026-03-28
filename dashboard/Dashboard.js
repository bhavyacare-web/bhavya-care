// 🌟 LATEST GOOGLE SCRIPT URL PROVIDED BY YOU
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby_nXMu8P2SFuxEEgva-qtgKx8DWiIBdweFf0FFmvswaqpPd5glerFDsO1L0-h14tY/exec";

// --- Page Load Event ---
document.addEventListener("DOMContentLoaded", () => {
    fetchDashboardData();
});

// --- Fetch Data Logic (UPDATED for Profile & Wallet History) ---
async function fetchDashboardData() {
    // LocalStorage se User ID nikalna
    const userId = localStorage.getItem("bhavya_user_id");

    // Agar ID nahi mili toh Home par bhej do
    if (!userId) {
        alert("Please login to access your Dashboard!");
        window.location.href = "../index.html"; // Make sure path is correct
        return;
    }

    // Shuruwat me ID dikhao aur Name me Loading likho
    document.getElementById("userIdDisplay").innerText = userId;
    document.getElementById("userNameDisplay").innerText = "Loading...";

    try {
        const payload = {
            action: "getDashboardData",
            user_id: userId
        };

        // Fetch request to your deployed Apps Script URL
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // Success hone par UI update karna
        if (data.status === "success") {
            // 1. SET PROFILE DATA (Now coming under data.profile)
            const firstName = data.profile.name ? data.profile.name.split(" ")[0] : "Patient";

            document.getElementById("userNameDisplay").innerText = firstName;
            document.getElementById("walletBal").innerText = data.profile.wallet_balance || 0;
            document.getElementById("vipStatus").innerText = data.profile.vip_status || "Basic";
            document.getElementById("refCode").innerText = data.profile.referral_code || "N/A";

            // Highlight VIP Status
            if(data.profile.vip_status && data.profile.vip_status !== "Basic") {
                document.getElementById("vipStatus").style.color = "#d35400";
                document.getElementById("vipStatus").style.fontWeight = "bold";
            }

            // 2. AUTO-POPULATE WALLET PASSBOOK
            const tbody = document.querySelector("#wallet tbody");
            tbody.innerHTML = ""; // Clear dummy data

            if (data.wallet_history && data.wallet_history.length > 0) {
                data.wallet_history.forEach(tx => {
                    // Date formatting safely
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

// --- NAYA: Request Withdraw Function ---
window.requestWithdraw = async function() {
    const userId = localStorage.getItem("bhavya_user_id");
    const amount = prompt("Enter amount to withdraw (Min ₹500):");
    
    // Check basic validation
    if (amount && !isNaN(amount) && Number(amount) >= 500) {
        
        // Extra validation: Check if user has enough balance (from the UI text)
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
                fetchDashboardData(); // Refresh passbook to show Pending status
            } else {
                alert("Server Error: " + res.message);
            }
        } catch(e) {
            alert("Network Error while sending request.");
            console.error(e);
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

// --- Mobile Sidebar Toggle ---
window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('show');
}

// --- Logout Logic ---
window.logoutDashboard = function() {
    if(confirm("Are you sure you want to logout?")) {
        localStorage.clear();
        alert("Logged out successfully.");
        window.location.href = "../index.html"; // Redirect to home page
    }
}
// ==========================================
// VIP UPGRADE LOGIC
// ==========================================

function openVipModal() {
    document.getElementById("vip-modal").style.display = "flex";
}

function closeVipModal() {
    document.getElementById("vip-modal").style.display = "none";
    // Form reset kar do
    document.getElementById("vipPayMode").value = "";
    document.getElementById("vipMem1").value = "";
    document.getElementById("vipMem2").value = "";
    document.getElementById("vipMem3").value = "";
    document.getElementById("vipUtr").value = "";
    document.getElementById("vipScreenshot").value = "";
    toggleVipPaymentFields(); 
}

// Online aur Cash option ke hisaab se fields show/hide karna
function toggleVipPaymentFields() {
    const payMode = document.getElementById("vipPayMode").value;
    const onlineSec = document.getElementById("vip-online-section");
    const cashSec = document.getElementById("vip-cash-section");

    if (payMode === "Online") {
        onlineSec.style.display = "block";
        cashSec.style.display = "none";
    } else if (payMode === "Cash") {
        onlineSec.style.display = "none";
        cashSec.style.display = "block";
    } else {
        onlineSec.style.display = "none";
        cashSec.style.display = "none";
    }
}

// Form Submit Karna aur Image ko convert karna
async function submitVipRequest() {
    const userId = localStorage.getItem("bhavya_user_id");
    const payMode = document.getElementById("vipPayMode").value;
    const mem1 = document.getElementById("vipMem1").value.trim();
    const mem2 = document.getElementById("vipMem2").value.trim();
    const mem3 = document.getElementById("vipMem3").value.trim();

    // 1. Basic Validation
    if (!payMode) { alert("Please select a Payment Mode."); return; }

    let payload = {
        action: "submitVipRequest",
        user_id: userId,
        amount_paid: 999,
        payment_mode: payMode,
        members: [mem1, mem2, mem3],
        payment_id: "Cash on Visit", // Default for cash
        screenshot_data: "",
        screenshot_name: ""
    };

    // 2. Online Mode Validation & Image Conversion
    if (payMode === "Online") {
        const utr = document.getElementById("vipUtr").value.trim();
        const fileInput = document.getElementById("vipScreenshot");

        if (utr.length < 10) { alert("Please enter a valid UTR / Reference Number."); return; }
        if (fileInput.files.length === 0) { alert("Please upload a payment screenshot."); return; }

        const file = fileInput.files[0];
        if (file.size > 2 * 1024 * 1024) { alert("Image size must be less than 2MB."); return; }

        payload.payment_id = utr;

        // Button ko Loading state me dalo
        const btn = document.getElementById("btn-submit-vip");
        btn.innerText = "Processing...";
        btn.disabled = true;

        // Image ko Base64 String me convert karo taaki Apps Script padh sake
        const reader = new FileReader();
        reader.onload = async function(e) {
            // Data URL format: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
            // Humein sirf base64 part chahiye, isliye split kar rahe hain
            payload.screenshot_data = e.target.result.split(",")[1];
            payload.screenshot_name = file.name;
            
            // Backend ko bhejo
            await sendVipDataToBackend(payload, btn);
        };
        reader.readAsDataURL(file);
    } 
    // 3. Cash Mode (Direct Submit)
    else {
        const btn = document.getElementById("btn-submit-vip");
        btn.innerText = "Processing...";
        btn.disabled = true;
        await sendVipDataToBackend(payload, btn);
    }
}

// Final API Call to Apps Script
async function sendVipDataToBackend(payload, btn) {
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.status === "success") {
            alert("Application Submitted! Your VIP Plan will be activated after Admin verification.");
            closeVipModal();
        } else {
            alert("Error: " + data.message);
        }
    } catch (error) {
        alert("Connection Failed. Please try again.");
        console.error(error);
    } finally {
        btn.innerText = "Submit Application";
        btn.disabled = false;
    }
}
