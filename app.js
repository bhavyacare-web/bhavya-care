// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyC2nYH22wkYDhh-BWfHvkT-bQvdKLCxask",
    authDomain: "bhavya-care.firebaseapp.com",
    projectId: "bhavya-care",
    storageBucket: "bhavya-care.firebasestorage.app",
    messagingSenderId: "979254809111",
    appId: "1:979254809111:web:0181e0c97277a5d0d9c252",
    measurementId: "G-G82G4VWGGT"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxXLA_Y4ecF_jJn5oXHoHTDUdlhB983GrWARkc-0m37YlUxFOHOTRmT4dr28YJ4Lgw/exec";
let isPartnerMode = false;

firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
        if (!localStorage.getItem("bhavya_mobile")) {
            localStorage.setItem("bhavya_uid", user.uid);
            localStorage.setItem("bhavya_mobile", user.phoneNumber);
        }
        checkLoginState();
        checkProfileBanner(); 
    } else {
        localStorage.clear();
        checkLoginState();
        checkProfileBanner();
    }
});

function initApp() {
    const loginBtn = document.getElementById('nav-login-btn');
    if (loginBtn) { checkLoginState(); checkProfileBanner(); }
    else setTimeout(initApp, 100); 
}
initApp();

function toggleMenu() { document.getElementById("myDropdown").classList.toggle("show-menu"); }

window.onclick = function(event) {
    if (!event.target.matches('.dropbtn') && !event.target.matches('.user-profile-btn') && !event.target.matches('.fa-user-circle')) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        for (var i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show-menu')) dropdowns[i].classList.remove('show-menu');
        }
    }
}

function checkLoginState() {
    const savedMobile = localStorage.getItem("bhavya_mobile");
    const navLoginBtn = document.getElementById('nav-login-btn');
    const mainMenuBtn = document.getElementById('main-menu-btn'); 
    const userMenuContainer = document.getElementById('user-menu-container'); 
    const menuJoin = document.getElementById('menu-join');
    const menuDash = document.getElementById('menu-dashboard');
    const menuOrders = document.getElementById('menu-orders');
    const menuLogout = document.getElementById('menu-logout');

    if (savedMobile) {
        if(navLoginBtn) navLoginBtn.style.display = 'none';
        if(mainMenuBtn) mainMenuBtn.style.display = 'none';
        if(userMenuContainer) userMenuContainer.style.display = 'block';
        if(menuJoin) menuJoin.style.display = 'none';
        if(menuDash) menuDash.style.display = 'block';
        if(menuOrders) menuOrders.style.display = 'block';
        if(menuLogout) menuLogout.style.display = 'block';
    } else {
        if(navLoginBtn) navLoginBtn.style.display = 'inline-block';
        if(mainMenuBtn) mainMenuBtn.style.display = 'inline-block';
        if(userMenuContainer) userMenuContainer.style.display = 'none';
        if(menuJoin) menuJoin.style.display = 'block';
        if(menuDash) menuDash.style.display = 'none';
        if(menuOrders) menuOrders.style.display = 'none';
        if(menuLogout) menuLogout.style.display = 'none';
        if(document.getElementById('recaptcha-container')) setupRecaptcha();
    }
}

// 🌟 SMART BANNER LOGIC (Replace this in app.js)
function checkProfileBanner() {
    const isSkipped = localStorage.getItem("bhavya_profile_skipped");
    const role = localStorage.getItem("bhavya_role");
    let banner = document.getElementById("profile-warning-banner");
    let bannerText = document.getElementById("banner-text"); // Ye text change karega
    
    if(isSkipped === "true" && role) {
        if(banner) {
            banner.style.display = "block"; // Banner dikhao
            
            // 💡 Proactive Advice: Role ke hisaab se text change!
            if (role === 'hospital' && bannerText) {
                bannerText.innerHTML = "🏥 <b>Hospital Alert:</b> Please complete your hospital registration to list your packages.";
            } else if (role === 'doctor' && bannerText) {
                bannerText.innerHTML = "👨‍⚕️ <b>Action Required:</b> Please complete your Doctor profile to get verified.";
            } else if (bannerText) {
                bannerText.innerHTML = "⚠️ <b>Welcome Patient:</b> Please complete your profile to book tests and consults.";
            }
        }
    } else {
        if(banner) banner.style.display = "none"; // Banner chhupao
    }
}
function reopenProfileForm() {
    const role = localStorage.getItem("bhavya_role");
    if(role === 'doctor') {
        document.getElementById('doctor-profile-section').style.display = 'block';
    } else if(role === 'hospital') {
        document.getElementById('hospital-profile-section').style.display = 'block';
        generateSurgeriesUI(); // 🌟 Yahan UI generate hoga
    } else {
        document.getElementById('profile-form-section').style.display = 'block';
    }
}

function openPatientLogin() {
    isPartnerMode = false;
    document.getElementById('partner-role-container').style.display = 'none';
    document.getElementById('form-title').innerText = "Patient Login / Sign Up";
    showLoginPopup();
}

function openPartnerLogin() {
    isPartnerMode = true;
    document.getElementById('partner-role-container').style.display = 'block';
    document.getElementById('form-title').innerText = "Partner Registration";
    toggleMenu(); 
    showLoginPopup();
}

function showLoginPopup() {
    document.getElementById('otp-section').style.display = 'none';
    document.getElementById('phone-section').style.display = 'block';
    document.getElementById('login-section').style.display = 'block';
    setupRecaptcha();
}

function closeLoginPopup() { document.getElementById('login-section').style.display = 'none'; }

function setupRecaptcha() {
    if (document.getElementById('recaptcha-container') && !window.recaptchaVerifier) {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { 'size': 'normal' });
        window.recaptchaVerifier.render();
    }
}

function sendOTP() {
    const userNumber = document.getElementById('phoneNumber').value.trim();
    if(userNumber.length !== 10 || isNaN(userNumber)) { alert("Please enter a valid 10-digit mobile number!"); return; }
    
    firebase.auth().signInWithPhoneNumber("+91" + userNumber, window.recaptchaVerifier).then((res) => {
        window.confirmationResult = res;
        document.getElementById('phone-section').style.display = 'none';
        document.getElementById('otp-section').style.display = 'block';
        document.getElementById('form-title').innerText = "Verify OTP";
        alert("OTP sent successfully!");
    }).catch((err) => { alert("Firebase Error: " + err.message); });
}

function verifyOTP() {
    const code = document.getElementById('otpCode').value.trim();
    const selectedRole = isPartnerMode ? document.getElementById('partnerRole').value : 'patient';
    if(code.length !== 6) { alert("Please enter a 6-digit OTP."); return; }

    window.confirmationResult.confirm(code).then((result) => {
        const user = result.user;
        let prefix = "U"; 
        if (selectedRole === 'patient') prefix = "P"; else if (selectedRole === 'doctor') prefix = "D";
        else if (selectedRole === 'lab') prefix = "L"; else if (selectedRole === 'pharmacy') prefix = "PH";
        else if (selectedRole === 'hospital') prefix = "H"; else if (selectedRole === 'executive') prefix = "E";
        let userId = prefix + user.phoneNumber.slice(-6);

        localStorage.setItem("bhavya_uid", user.uid);
        localStorage.setItem("bhavya_mobile", user.phoneNumber);
        localStorage.setItem("bhavya_role", selectedRole);
        localStorage.setItem("bhavya_user_id", userId);

        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, 
            body: JSON.stringify({ action: "login", uid: user.uid, mobile: user.phoneNumber, role: selectedRole })
        }).catch(err => console.error("Backend warning:", err));

        closeLoginPopup();

        // Check Roles for Forms
        if (selectedRole === 'patient') {
            document.getElementById('profile-form-section').style.display = 'block';
        } else if (selectedRole === 'doctor') {
            document.getElementById('doctor-profile-section').style.display = 'block';
        } else if (selectedRole === 'hospital') {
            document.getElementById('hospital-profile-section').style.display = 'block';
            generateSurgeriesUI(); // 🌟 Yahan UI generate hoga
        } else {
            alert("Login Successful! Welcome to BhavyaCare.");
            checkLoginState();
        }
    }).catch((error) => { alert("Invalid OTP! Please try again."); });
}

function logoutUser() {
    firebase.auth().signOut().then(() => {
        localStorage.clear();
        alert("You have successfully logged out!");
        window.location.reload(); 
    }).catch((err) => { console.error("Logout Error:", err); });
}

function goToDashboard() {
    const role = localStorage.getItem("bhavya_role");
    if(role) alert("Redirecting to " + role.toUpperCase() + " Dashboard...");
    else alert("Role not found. Please log in again.");
}

function closeProfileForm(type) {
    if(type === 'patient') document.getElementById('profile-form-section').style.display = 'none';
    if(type === 'doctor') document.getElementById('doctor-profile-section').style.display = 'none';
    if(type === 'hospital') document.getElementById('hospital-profile-section').style.display = 'none';
    
    localStorage.setItem("bhavya_profile_skipped", "true");
    checkProfileBanner();
    
    alert("Welcome to BhavyaCare. Please complete your profile later from the banner above.");
    checkLoginState(); 
}

// ---------------- PATIENT PROFILE LOGIC ---------------- //
function autoGenerateReferral() {
    const nameInput = document.getElementById('profName').value.trim().toUpperCase();
    const savedMobile = localStorage.getItem("bhavya_mobile") || "0000"; 
    let namePart = nameInput.replace(/[^A-Z]/g, '').substring(0, 3);
    if(nameInput.length > 0 && namePart.length < 3) namePart = namePart.padEnd(3, 'X'); 
    if(nameInput.length === 0) { document.getElementById('profReferral').value = ""; return; }
    document.getElementById('profReferral').value = namePart + savedMobile.slice(-4);
}

function savePatientProfile() {
    const name = document.getElementById('profName').value.trim();
    const address = document.getElementById('profAddress').value.trim();
    const city = document.getElementById('profCity').value.trim();
    const pincode = document.getElementById('profPincode').value.trim();

    if(!name || !address || !city || !pincode) { alert("Please fill all the required (*) fields!"); return; }

    const saveBtn = document.getElementById('btn-save-profile');
    saveBtn.innerText = "Saving Please Wait...";
    saveBtn.style.backgroundColor = "#ffc107"; 

    const payload = {
        action: "saveProfile", user_id: localStorage.getItem("bhavya_user_id"),
        name: name, dob: document.getElementById('profDOB').value, email: document.getElementById('profEmail').value.trim(),
        address: address, city: city, pincode: pincode, referral: document.getElementById('profReferral').value.trim()
    };

    fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
    .then(response => response.json())
    .then(data => {
        alert("Profile saved successfully! You are ready to book tests.");
        saveBtn.innerText = "Save & Continue"; saveBtn.style.backgroundColor = "#28a745";
        localStorage.removeItem("bhavya_profile_skipped"); 
        checkProfileBanner();
        document.getElementById('profile-form-section').style.display = 'none';
    })
    .catch(error => {
        alert("Network Error!"); document.getElementById('profile-form-section').style.display = 'none';
    });
}

// ---------------- DOCTOR PROFILE LOGIC ---------------- //
function toggleOnlineFields() {
    const val = document.getElementById('docOnlineConsult').value;
    const container = document.getElementById('online-fields-container');
    if(val === "Yes") {
        container.style.display = "grid"; 
    } else {
        container.style.display = "none"; 
    }
}

function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error);
    });
}

async function saveDoctorProfile() {
    const userId = localStorage.getItem("bhavya_user_id");
    const saveBtn = document.getElementById('btn-save-doctor');

    const name = document.getElementById('docName').value.trim();
    const docFile = document.getElementById('docFile').files[0];
    const docImage = document.getElementById('docImage').files[0];

    if (!name || !docFile || !docImage) {
        alert("Please fill all required fields and select both Document and Image files."); return;
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (docFile.size > maxSize || docImage.size > maxSize) {
        alert("File size too large! Please keep document and image under 2MB each."); return;
    }

    saveBtn.innerText = "Uploading & Saving... Please wait";
    saveBtn.style.backgroundColor = "#ffc107";
    saveBtn.disabled = true;

    try {
        const docB64 = await getBase64(docFile);
        const imgB64 = await getBase64(docImage);

        const isOnline = document.getElementById('docOnlineConsult').value;
        const onlineFee = isOnline === "Yes" ? document.getElementById('docOnlineFee').value.trim() : "";
        const onlineStart = isOnline === "Yes" ? document.getElementById('docOnlineStart').value : "";
        const onlineEnd = isOnline === "Yes" ? document.getElementById('docOnlineEnd').value : "";

        const payload = {
            action: "saveDoctorProfile",
            user_id: userId, doctor_name: name, doctor_email: document.getElementById('docEmail').value.trim(),
            speciality: document.getElementById('docSpeciality').value.trim(), qualification: document.getElementById('docQual').value.trim(),
            experience: document.getElementById('docExp').value.trim(), clinic_name: document.getElementById('docClinicName').value.trim(),
            clinic_address: document.getElementById('docClinicAddress').value.trim(), city: document.getElementById('docCity').value.trim(),
            pincode: document.getElementById('docPincode').value.trim(), clinic_fee: document.getElementById('docClinicFee').value.trim(),
            service_type: document.getElementById('docServiceType').value, 
            
            online_consultation: isOnline,
            online_fee: onlineFee, 
            slot_duration: document.getElementById('docSlotDuration').value,
            
            mon_open: document.getElementById('monOpen').value, mon_close: document.getElementById('monClose').value,
            tue_open: document.getElementById('tueOpen').value, tue_close: document.getElementById('tueClose').value,
            wed_open: document.getElementById('wedOpen').value, wed_close: document.getElementById('wedClose').value,
            thu_open: document.getElementById('thuOpen').value, thu_close: document.getElementById('thuClose').value,
            fri_open: document.getElementById('friOpen').value, fri_close: document.getElementById('friClose').value,
            sat_open: document.getElementById('satOpen').value, sat_close: document.getElementById('satClose').value,
            sun_open: document.getElementById('sunOpen').value, sun_close: document.getElementById('sunClose').value,
            
            online_start: onlineStart, online_end: onlineEnd,

            docData: { base64: docB64.split(',')[1], filename: userId + "_Doc_" + docFile.name, mimeType: docFile.type },
            imageData: { base64: imgB64.split(',')[1], filename: userId + "_Img_" + docImage.name, mimeType: docImage.type }
        };

        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        const data = await response.json();
        
        if (data.status === "success") {
            alert("Your profile has been submitted successfully for verification!");
            localStorage.removeItem("bhavya_profile_skipped"); 
            checkProfileBanner();
            document.getElementById('doctor-profile-section').style.display = 'none';
        } else {
            alert("Server Error: " + data.message);
        }
    } catch (error) {
        console.error("Error saving doctor profile:", error);
        alert("An error occurred during submission. Please try again.");
    } finally {
        saveBtn.innerText = "Submit Profile"; saveBtn.style.backgroundColor = "#28a745"; saveBtn.disabled = false;
    }
}

// =======================================================
// 🌟 NAYA: HOSPITAL TAB SWITCH & SURGERY GENERATION
// =======================================================
window.switchHospTab = function(evt, tabId) {
    let contents = document.getElementsByClassName("hosp-tab-content");
    for (let i = 0; i < contents.length; i++) {
        contents[i].style.display = "none";
        contents[i].classList.remove("active");
    }
    
    let btns = document.getElementsByClassName("hosp-tab-btn");
    for (let i = 0; i < btns.length; i++) {
        btns[i].classList.remove("active");
    }
    
    let targetTab = document.getElementById(tabId);
    if (targetTab) {
        // Fix for grid layout in Basic & Charges tab
        if(targetTab.classList.contains('form-grid')) {
            targetTab.style.display = "grid";
        } else {
            targetTab.style.display = "block";
        }
        targetTab.classList.add("active");
    }
    evt.currentTarget.classList.add("active");
};

window.generateSurgeriesUI = function() {
    const surgeries = ["Appendix", "Hernia", "Gallbladder", "Normal Delivery", "C-Section", "Knee Replacement", "Cataract"];
    const container = document.getElementById('surgery-list-container');
    
    // Check lagaya hai taaki baar-baar form kholne pe duplicate inputs na banein
    if(container && container.innerHTML.trim() === "") {
        surgeries.forEach(surg => {
            let idBase = surg.replace(/\s+/g, '');
            container.innerHTML += `
                <div class="full-width" style="margin-top: 10px; border-bottom: 1px solid #eee;"><strong style="color:#17a2b8;">${surg} Surgery</strong></div>
                <div><input type="number" id="surg_${idBase}_Normal" class="input-box surg-input" data-surg="${surg}" data-type="Normal" placeholder="Gen Ward ₹"></div>
                <div><input type="number" id="surg_${idBase}_Medium" class="input-box surg-input" data-surg="${surg}" data-type="Medium" placeholder="Private ₹"></div>
                <div><input type="number" id="surg_${idBase}_VIP" class="input-box surg-input" data-surg="${surg}" data-type="VIP" placeholder="VIP ₹"></div>
            `;
        });
    }
};

// =======================================================
// 🌟 NAYA: HOSPITAL PROFILE LOGIC (SMART JSON GROUPING)
// =======================================================
function saveHospitalProfile() {
    const userId = localStorage.getItem("bhavya_user_id");
    const saveBtn = document.getElementById('btn-save-hospital');
    
    const hospName = document.getElementById('hospName').value.trim();
    const hospPhone = document.getElementById('hospPhone').value.trim();
    const hospAddress = document.getElementById('hospAddress').value.trim();

    if (!hospName || !hospPhone || !hospAddress) {
        alert("Please fill Hospital Name, Contact Number, and Address!");
        return;
    }

    saveBtn.innerText = "Packing & Saving... Please Wait";
    saveBtn.style.backgroundColor = "#ffc107";
    saveBtn.disabled = true;

    // 1. Pack Contact Details into JSON
    const contactDetails = {
        phone: hospPhone,
        email: document.getElementById('hospEmail').value.trim()
    };

    // 2. Pack Room Charges into JSON
    const roomCharges = {
        generalWard: document.getElementById('hospGenWard').value,
        privateRoom: document.getElementById('hospPrivate').value,
        icuCharges: document.getElementById('hospIcu').value,
        doctorConsultation: document.getElementById('hospDocConsult').value
    };

    // 3. Dynamic Surgeries JSON Packing
    let surgeriesPricing = {};
    const surgeryInputs = document.querySelectorAll('.surg-input');
    surgeryInputs.forEach(input => {
        if (input.value) { 
            let sName = input.getAttribute('data-surg');
            let sType = input.getAttribute('data-type');
            if (!surgeriesPricing[sName]) surgeriesPricing[sName] = {};
            surgeriesPricing[sName][sType] = input.value;
        }
    });

    // 4. Create Master Payload exactly for Code.gs JSON setup
    const payload = {
        action: "saveHospitalProfile",
        user_id: userId,
        hospital_name: hospName,
        contact_details: JSON.stringify(contactDetails),
        address_info: hospAddress,
        basic_facilities: document.getElementById('hospNabh').value,
        room_charges: JSON.stringify(roomCharges),
        surgeries_pricing: JSON.stringify(surgeriesPricing)
    };

    // Send via JSON API Request
    fetch(GOOGLE_SCRIPT_URL, { 
        method: "POST", 
        headers: { "Content-Type": "text/plain;charset=utf-8" }, 
        body: JSON.stringify(payload) 
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === "success") {
            alert("Hospital profile successfully added via Smart JSON!");
            localStorage.removeItem("bhavya_profile_skipped"); 
            checkProfileBanner();
            document.getElementById('hospital-profile-section').style.display = 'none';
        } else {
            alert("Server Error: " + data.message);
        }
    })
    .catch(error => {
        console.error("Fetch Error:", error);
        alert("Network Error! Please try again.");
    })
    .finally(() => {
        saveBtn.innerText = "Submit Hospital Details";
        saveBtn.style.backgroundColor = "#17a2b8";
        saveBtn.disabled = false;
    });
}
