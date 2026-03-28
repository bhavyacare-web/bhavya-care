// 🌟 LATEST GOOGLE SCRIPT URL PROVIDED BY YOU
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz-VtrqaNvLo7y4wQx-ciTJp89Q5ncGTdZa1aCf8KGbJJVhkvllBl3duFEBZO2YB5IL/exec";

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
