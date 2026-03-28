// 🌟 LATEST GOOGLE SCRIPT URL PROVIDED BY YOU
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxL5oZQUaKElfNXa1_J8oHVEF2mzsOpy-7RNMVh9o3lz6H23kxc7tKPWrDb2AzN2hfM/exec";

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

// --- Copy Referral Code ---
window.copyMyReferral = function() {
    const code = document.getElementById("refCode").innerText;
    if(code && code !== "-----" && code !== "N/A") {
        navigator.clipboard.writeText(code);
        alert("Referral Code Copied! Share it with friends to earn cashback.");
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
