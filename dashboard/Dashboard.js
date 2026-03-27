// 🌟 LATEST GOOGLE SCRIPT URL PROVIDED BY YOU
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz-VtrqaNvLo7y4wQx-ciTJp89Q5ncGTdZa1aCf8KGbJJVhkvllBl3duFEBZO2YB5IL/exec";

// --- Page Load Event ---
document.addEventListener("DOMContentLoaded", () => {
    fetchDashboardData();
});

// --- Fetch Data Logic ---
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
            // Sirf First Name nikalne ka logic
            const firstName = data.name ? data.name.split(" ")[0] : "Patient";

            document.getElementById("userNameDisplay").innerText = firstName;
            document.getElementById("walletBal").innerText = data.wallet_balance || 0;
            document.getElementById("vipStatus").innerText = data.vip_status || "Basic";
            document.getElementById("refCode").innerText = data.referral_code || "N/A";

            // Highlight VIP Status
            if(data.vip_status && data.vip_status !== "Basic") {
                document.getElementById("vipStatus").style.color = "#d35400";
                document.getElementById("vipStatus").style.fontWeight = "bold";
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

// --- Tab Switching Logic (Moved from HTML to JS for cleaner code) ---
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
