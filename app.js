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

if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            if (!localStorage.getItem("bhavya_mobile")) {
                localStorage.setItem("bhavya_uid", user.uid);
                localStorage.setItem("bhavya_mobile", user.phoneNumber);
            }
            window.checkLoginState();
            window.checkProfileBanner(); 
        } else {
            localStorage.clear();
            window.checkLoginState();
            window.checkProfileBanner();
        }
    });
} else {
    console.error("🔥 Firebase is missing! Please make sure Firebase SDK scripts are in your HTML.");
}

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzh5xaD_twrih6kShL6Cj8pjFuHLH6xlSvbl06rRr6ZebX1zAUuH0KtHeNUdEr3kHw/exec";
let isPartnerMode = false;

function initApp() {
    const loginBtn = document.getElementById('nav-login-btn');
    if (loginBtn) { 
        window.checkLoginState(); 
        window.checkProfileBanner(); 
    }
    else { setTimeout(initApp, 100); }
}
initApp();

window.toggleMenu = function() { 
    const dropdown = document.getElementById("myDropdown");
    if(dropdown) dropdown.classList.toggle("show-menu"); 
};

window.onclick = function(event) {
    if (!event.target.matches('.dropbtn') && !event.target.matches('.user-profile-btn') && !event.target.matches('.fa-user-circle')) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        for (var i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('show-menu')) dropdowns[i].classList.remove('show-menu');
        }
    }
}

window.checkLoginState = function() {
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
        if(document.getElementById('recaptcha-container')) window.setupRecaptcha();
    }
}

window.checkProfileBanner = function() {
    const isSkipped = localStorage.getItem("bhavya_profile_skipped");
    const isCompleted = localStorage.getItem("bhavya_profile_completed"); 
    const role = localStorage.getItem("bhavya_role");
    let banner = document.getElementById("profile-warning-banner");
    let bannerText = document.getElementById("banner-text"); 
    
    if (!banner || !bannerText) return;

    if (isSkipped === "true" && isCompleted !== "true" && role) {
        banner.style.display = "block"; 
        if (role === 'hospital') bannerText.innerHTML = "🏥 <b>Action Required:</b> Please complete your Hospital Profile to activate your account.";
        else if (role === 'lab') bannerText.innerHTML = "🔬 <b>Action Required:</b> Please complete your Lab Profile to start receiving test bookings.";
        else if (role === 'doctor') bannerText.innerHTML = "👨‍⚕️ <b>Action Required:</b> Please complete your Doctor profile to get verified.";
        else if (role === 'executive') bannerText.innerHTML = "🛵 <b>Action Required:</b> Please complete your Executive profile to get tasks.";
        else if (role === 'pharmacy') bannerText.innerHTML = "💊 <b>Action Required:</b> Please complete your Pharmacy profile to receive medicine orders.";
        else bannerText.innerHTML = "⚠️ <b>Welcome Patient:</b> Please complete your profile to book tests and consults.";
    } else {
        banner.style.display = "none"; 
    }
}

window.reopenProfileForm = function() {
    const role = localStorage.getItem("bhavya_role");
    if(role === 'doctor') document.getElementById('doctor-profile-section').style.display = 'block';
    else if(role === 'hospital') document.getElementById('hospital-profile-section').style.display = 'block';
    else if(role === 'lab') document.getElementById('lab-profile-section').style.display = 'block';
    else if(role === 'executive') document.getElementById('executive-profile-section').style.display = 'block';
    else if(role === 'pharmacy') document.getElementById('pharmacy-profile-section').style.display = 'block';
    else document.getElementById('profile-form-section').style.display = 'block';
}

window.openPatientLogin = function() {
    isPartnerMode = false;
    const partnerRoleCont = document.getElementById('partner-role-container');
    const formTitle = document.getElementById('form-title');
    if(partnerRoleCont) partnerRoleCont.style.display = 'none';
    if(formTitle) formTitle.innerText = "Patient Login / Sign Up";
    window.showLoginPopup();
}

window.openPartnerLogin = function() {
    isPartnerMode = true;
    const partnerRoleCont = document.getElementById('partner-role-container');
    const formTitle = document.getElementById('form-title');
    if(partnerRoleCont) partnerRoleCont.style.display = 'block';
    if(formTitle) formTitle.innerText = "Partner Registration";
    window.toggleMenu(); 
    window.showLoginPopup();
}

window.showLoginPopup = function() {
    document.getElementById('otp-section').style.display = 'none';
    document.getElementById('phone-section').style.display = 'block';
    document.getElementById('login-section').style.display = 'block';
    window.setupRecaptcha();
}

window.closeLoginPopup = function() { 
    const loginSec = document.getElementById('login-section');
    if(loginSec) loginSec.style.display = 'none'; 
}

window.setupRecaptcha = function() {
    if (typeof firebase !== 'undefined' && document.getElementById('recaptcha-container') && !window.recaptchaVerifier) {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { 'size': 'normal' });
        window.recaptchaVerifier.render();
    }
}

window.sendOTP = function() {
    if (typeof firebase === 'undefined') { alert("Firebase not loaded! Check connection."); return; }
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

window.verifyOTP = async function() {
    const code = document.getElementById('otpCode').value.trim();
    const selectedRole = isPartnerMode ? document.getElementById('partnerRole').value : 'patient';
    if(code.length !== 6) { alert("Please enter a 6-digit OTP."); return; }

    try {
        const result = await window.confirmationResult.confirm(code);
        const user = result.user;

        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, 
            body: JSON.stringify({ action: "login", uid: user.uid, mobile: user.phoneNumber, role: selectedRole })
        });
        const resData = await response.json();

        const finalRole = resData.role;
        const finalUserId = resData.user_id;

        localStorage.setItem("bhavya_uid", user.uid);
        localStorage.setItem("bhavya_mobile", user.phoneNumber);
        localStorage.setItem("bhavya_role", finalRole);
        localStorage.setItem("bhavya_user_id", finalUserId);

        window.closeLoginPopup();

        if (resData.profile_completed) {
            localStorage.setItem("bhavya_profile_completed", "true");
            localStorage.removeItem("bhavya_profile_skipped");
            alert("Welcome back! Logged in as " + finalRole.toUpperCase());
        } else {
            // Check local storage before overriding. If they previously completed it, don't popup.
            if(localStorage.getItem("bhavya_profile_completed") !== "true") {
                localStorage.removeItem("bhavya_profile_completed");
                localStorage.setItem("bhavya_profile_skipped", "true");
                window.reopenProfileForm(); 
            }
        }
        
        window.checkLoginState();
        window.checkProfileBanner();

    } catch (error) { 
        console.error("OTP Error Details:", error);
        if(error.code) alert("Invalid OTP! Please try again."); 
        else alert("System Error. Please check console logs.");
    }
}

window.logoutUser = function() {
    if (typeof firebase !== 'undefined') {
        firebase.auth().signOut().then(() => {
            localStorage.clear();
            alert("You have successfully logged out!");
            window.location.reload(); 
        }).catch((err) => { console.error("Logout Error:", err); });
    } else {
        localStorage.clear(); window.location.reload();
    }
}

window.goToDashboard = function() {
    const role = localStorage.getItem("bhavya_role");
    if(role === "hospital") alert("Redirecting to HOSPITAL Dashboard... (Coming Soon)");
    else if (role) alert("Redirecting to " + role.toUpperCase() + " Dashboard... (Coming Soon)");
    else alert("Role not found. Please log in again.");
}

window.closeProfileForm = function(type) {
    const sections = {
        'patient': 'profile-form-section', 'doctor': 'doctor-profile-section',
        'hospital': 'hospital-profile-section', 'lab': 'lab-profile-section',
        'executive': 'executive-profile-section', 'pharmacy': 'pharmacy-profile-section'
    };
    if (sections[type]) {
        const el = document.getElementById(sections[type]);
        if(el) el.style.display = 'none';
    }
    
    // Prevent banner if profile is completed
    if(localStorage.getItem("bhavya_profile_completed") !== "true"){
        localStorage.setItem("bhavya_profile_skipped", "true");
        alert("Welcome to BhavyaCare! Please complete your profile later from the banner above.");
    }
    
    window.checkLoginState(); 
    window.checkProfileBanner(); 
}

// ---------------- PATIENT PROFILE LOGIC ---------------- //

window.autoGenerateReferral = function() {
    const nameInput = document.getElementById('profName').value.trim().toUpperCase();
    const savedMobile = localStorage.getItem("bhavya_mobile") || "0000"; 
    let namePart = nameInput.replace(/[^A-Z]/g, '').substring(0, 3);
    if(nameInput.length > 0 && namePart.length < 3) namePart = namePart.padEnd(3, 'X'); 
    if(nameInput.length === 0) { document.getElementById('profReferral').value = ""; return; }
    document.getElementById('profReferral').value = namePart + savedMobile.slice(-4);
}

window.savePatientProfile = function() {
    const name = document.getElementById('profName').value.trim();
    const email = document.getElementById('profEmail').value.trim();
    const address = document.getElementById('profAddress').value.trim();
    const city = document.getElementById('profCity').value.trim();
    const pincode = document.getElementById('profPincode').value.trim();

    if(!name || !email || !address || !city || !pincode) { 
        alert("Please fill all the required (*) fields including Email!"); return; 
    }

    const saveBtn = document.getElementById('btn-save-profile');
    saveBtn.innerText = "Saving Please Wait...";
    saveBtn.style.backgroundColor = "#ffc107"; 

    const payload = {
        action: "saveProfile", user_id: localStorage.getItem("bhavya_user_id"),
        name: name, dob: document.getElementById('profDOB').value, email: email,
        address: address, city: city, pincode: pincode, referral: document.getElementById('profReferral').value.trim()
    };

    fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
    .then(response => response.json())
    .then(data => {
        alert("Profile saved successfully! You are ready to book tests.");
        saveBtn.innerText = "Save & Continue"; saveBtn.style.backgroundColor = "#28a745";
        
        localStorage.setItem("bhavya_profile_completed", "true");
        localStorage.removeItem("bhavya_profile_skipped"); 
        
        window.checkProfileBanner();
        document.getElementById('profile-form-section').style.display = 'none';
    })
    .catch(error => {
        alert("Network Error!"); document.getElementById('profile-form-section').style.display = 'none';
    });
}

// ---------------- DOCTOR PROFILE LOGIC ---------------- //
window.toggleOnlineFields = function() {
    const val = document.getElementById('docOnlineConsult').value;
    const container = document.getElementById('online-fields-container');
    if(container) container.style.display = (val === "Yes") ? "grid" : "none"; 
}

function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error);
    });
}

window.saveDoctorProfile = async function() {
    const userId = localStorage.getItem("bhavya_user_id");
    const saveBtn = document.getElementById('btn-save-doctor');

    const name = document.getElementById('docName').value.trim();
    const docEmail = document.getElementById('docEmail').value.trim(); 
    const docClinicAddress = document.getElementById('docClinicAddress').value.trim(); 
    const docCity = document.getElementById('docCity').value.trim(); 
    const docPincode = document.getElementById('docPincode').value.trim(); 
    const docFile = document.getElementById('docFile').files[0];
    const docImage = document.getElementById('docImage').files[0];

    if (!name || !docEmail || !docClinicAddress || !docCity || !docPincode || !docFile || !docImage) {
        alert("Please fill all required (*) fields and attach Documents."); return;
    }

    const maxSize = 2 * 1024 * 1024;
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
        const payload = {
            action: "saveDoctorProfile", user_id: userId, doctor_name: name, doctor_email: docEmail,
            speciality: document.getElementById('docSpeciality').value.trim(), qualification: document.getElementById('docQual').value.trim(),
            experience: document.getElementById('docExp').value.trim(), clinic_name: document.getElementById('docClinicName').value.trim(),
            clinic_address: docClinicAddress, city: docCity, pincode: docPincode, clinic_fee: document.getElementById('docClinicFee').value.trim(),
            service_type: document.getElementById('docServiceType').value, 
            online_consultation: isOnline,
            online_fee: isOnline === "Yes" ? document.getElementById('docOnlineFee').value.trim() : "", 
            slot_duration: document.getElementById('docSlotDuration').value,
            mon_open: document.getElementById('monOpen').value, mon_close: document.getElementById('monClose').value,
            tue_open: document.getElementById('tueOpen').value, tue_close: document.getElementById('tueClose').value,
            wed_open: document.getElementById('wedOpen').value, wed_close: document.getElementById('wedClose').value,
            thu_open: document.getElementById('thuOpen').value, thu_close: document.getElementById('thuClose').value,
            fri_open: document.getElementById('friOpen').value, fri_close: document.getElementById('friClose').value,
            sat_open: document.getElementById('satOpen').value, sat_close: document.getElementById('satClose').value,
            sun_open: document.getElementById('sunOpen').value, sun_close: document.getElementById('sunClose').value,
            online_start: isOnline === "Yes" ? document.getElementById('docOnlineStart').value : "", 
            online_end: isOnline === "Yes" ? document.getElementById('docOnlineEnd').value : "",
            docData: { base64: docB64.split(',')[1], filename: userId + "_Doc_" + docFile.name, mimeType: docFile.type },
            imageData: { base64: imgB64.split(',')[1], filename: userId + "_Img_" + docImage.name, mimeType: docImage.type }
        };

        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        const data = await response.json();
        
        if (data.status === "success") {
            alert("Your profile has been submitted successfully for verification!");
            localStorage.setItem("bhavya_profile_completed", "true");
            localStorage.removeItem("bhavya_profile_skipped"); 
            window.checkProfileBanner();
            document.getElementById('doctor-profile-section').style.display = 'none';
        } else alert("Server Error: " + data.message);
    } catch (error) { alert("An error occurred during submission. Please try again."); } 
    finally { saveBtn.innerText = "Submit Profile"; saveBtn.style.backgroundColor = "#28a745"; saveBtn.disabled = false; }
}

window.switchHospTab = function(evt, tabId) {
    let contents = document.getElementsByClassName("hosp-tab-content");
    for (let i = 0; i < contents.length; i++) { contents[i].style.display = "none"; contents[i].classList.remove("active"); }
    let btns = document.getElementsByClassName("hosp-tab-btn");
    for (let i = 0; i < btns.length; i++) { btns[i].classList.remove("active"); }
    let targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.style.display = targetTab.classList.contains('form-grid') ? "grid" : "block";
        targetTab.classList.add("active");
    }
    evt.currentTarget.classList.add("active");
};

window.addSurgeryRow = function() {
    const container = document.getElementById('dynamic-surgeries-container');
    const rowId = "surgRow_" + Math.floor(Math.random() * 10000); 
    const rowHtml = `
        <div id="${rowId}" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; margin-top: 15px; padding-bottom: 15px; border-bottom: 1px dashed #ccc; align-items: center;">
            <div><input type="text" class="input-box dyn-surg-name" placeholder="Surgery Name (e.g. Appendix)"></div>
            <div><input type="number" class="input-box dyn-surg-normal" placeholder="Gen Ward ₹"></div>
            <div><input type="number" class="input-box dyn-surg-medium" placeholder="Private ₹"></div>
            <div><input type="number" class="input-box dyn-surg-vip" placeholder="VIP ₹"></div>
            <div style="grid-column: span 4; text-align: right; margin-top: 5px;">
                <span style="color: #dc3545; font-size: 12px; font-weight: bold; cursor: pointer;" onclick="document.getElementById('${rowId}').remove()">❌ Remove</span>
            </div>
        </div>`;
    if(container) container.insertAdjacentHTML('beforeend', rowHtml);
};

window.saveHospitalProfile = async function() {
    const userId = localStorage.getItem("bhavya_user_id");
    const saveBtn = document.getElementById('btn-save-hospital');
    const hospName = document.getElementById('hospName').value.trim();
    const hospPhone = document.getElementById('hospPhone').value.trim();
    const hospEmail = document.getElementById('hospEmail').value.trim(); 
    const hospAddress = document.getElementById('hospAddress').value.trim();

    if (!hospName || !hospPhone || !hospEmail || !hospAddress) {
        alert("Please fill Hospital Name, Contact Number, Email, and Full Address!"); return;
    }

    saveBtn.innerText = "Uploading Files & Saving... Please Wait";
    saveBtn.style.backgroundColor = "#ffc107"; saveBtn.disabled = true;

    try {
        const imgFile = document.getElementById('hospImg').files[0];
        const docFile = document.getElementById('hospDoc').files[0];
        const certFile = document.getElementById('hospCert').files[0];
        let imgData = null, docData = null, certData = null;
        if(imgFile) imgData = { base64: (await getBase64(imgFile)).split(',')[1], filename: userId + "_HospImg_" + imgFile.name, mimeType: imgFile.type };
        if(docFile) docData = { base64: (await getBase64(docFile)).split(',')[1], filename: userId + "_HospDoc_" + docFile.name, mimeType: docFile.type };
        if(certFile) certData = { base64: (await getBase64(certFile)).split(',')[1], filename: userId + "_HospCert_" + certFile.name, mimeType: certFile.type };

        let surgeriesPricing = {};
        document.querySelectorAll('#dynamic-surgeries-container > div').forEach(row => {
            let name = row.querySelector('.dyn-surg-name').value.trim();
            let n = row.querySelector('.dyn-surg-normal').value, m = row.querySelector('.dyn-surg-medium').value, v = row.querySelector('.dyn-surg-vip').value;
            if (name && (n || m || v)) { surgeriesPricing[name] = { "Normal": n, "Medium": m, "VIP": v }; }
        });

        const payload = {
            action: "saveHospitalProfile", user_id: userId, hospital_name: hospName,
            contact_details: JSON.stringify({ phone: hospPhone, email: hospEmail }), address_info: hospAddress,
            basic_facilities: document.getElementById('hospFacilities').value.trim(), 
            empanelment_tpa: document.getElementById('hospInsurances').value.trim(),
            insurance_rules: JSON.stringify({ cashless: document.getElementById('hospCashless').value, reimbursement: document.getElementById('hospReimbursement').value }), 
            room_charges: JSON.stringify({ generalWard: document.getElementById('hospGenWard').value, privateRoom: document.getElementById('hospPrivate').value, icuCharges: document.getElementById('hospIcu').value, doctorConsultation: document.getElementById('hospDocConsult').value }),
            surgeries_pricing: JSON.stringify(surgeriesPricing), status: "Inactive", 
            imgData: imgData, docData: docData, certData: certData 
        };

        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        const data = await response.json();

        if (data.status === "success") {
            alert("Hospital profile successfully added!");
            localStorage.setItem("bhavya_profile_completed", "true");
            localStorage.removeItem("bhavya_profile_skipped"); window.checkProfileBanner();
            document.getElementById('hospital-profile-section').style.display = 'none';
        } else alert("Server Error: " + data.message);
    } catch (error) { alert("Network Error or File too large!"); } 
    finally { saveBtn.innerText = "Submit Hospital Details Online"; saveBtn.style.backgroundColor = "#17a2b8"; saveBtn.disabled = false; }
};

window.switchLabTab = function(evt, tabId) {
    let contents = document.querySelectorAll("#lab-profile-section .hosp-tab-content");
    for (let i = 0; i < contents.length; i++) { contents[i].style.display = "none"; contents[i].classList.remove("active"); }
    let btns = document.querySelectorAll("#lab-profile-section .hosp-tab-btn");
    for (let i = 0; i < btns.length; i++) btns[i].classList.remove("active");
    let targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.style.display = targetTab.classList.contains('form-grid') ? "grid" : "block"; targetTab.classList.add("active");
    }
    evt.currentTarget.classList.add("active");
};

window.saveLabProfile = async function() {
    const userId = localStorage.getItem("bhavya_user_id");
    const saveBtn = document.getElementById('btn-save-lab');
    
    const labName = document.getElementById('labName').value.trim();
    const labEmail = document.getElementById('labEmail').value.trim();
    const labCity = document.getElementById('labCity').value.trim();
    const labAddress = document.getElementById('labAddress').value.trim();
    const labPincode = document.getElementById('labPincode').value.trim(); 

    if (!labName || !labEmail || !labCity || !labAddress || !labPincode) {
        alert("Please fill Lab Name, Email, City, Full Address, and Pincode!"); return;
    }

    saveBtn.innerText = "Uploading Files & Saving... Please Wait";
    saveBtn.style.backgroundColor = "#ffc107"; saveBtn.disabled = true;

    try {
        const services = {};
        document.querySelectorAll('.lab-srv').forEach(cb => { services[cb.value] = cb.checked ? "Yes" : "No"; });

        const docFile = document.getElementById('labDoc').files[0];
        const img1 = document.getElementById('labImg1').files[0];
        const img2 = document.getElementById('labImg2').files[0];
        const img3 = document.getElementById('labImg3').files[0];

        if(!docFile || !img1) throw new Error("Lab Registration Document and Image 1 are mandatory!");

        let docData = { base64: (await getBase64(docFile)).split(',')[1], filename: userId + "_LabDoc_" + docFile.name, mimeType: docFile.type };
        let img1Data = { base64: (await getBase64(img1)).split(',')[1], filename: userId + "_LabImg1_" + img1.name, mimeType: img1.type };
        let img2Data = img2 ? { base64: (await getBase64(img2)).split(',')[1], filename: userId + "_LabImg2_" + img2.name, mimeType: img2.type } : null;
        let img3Data = img3 ? { base64: (await getBase64(img3)).split(',')[1], filename: userId + "_LabImg3_" + img3.name, mimeType: img3.type } : null;

        const payload = {
            action: "saveLabProfile", user_id: userId, lab_name: labName, lab_email: labEmail,
            lab_address: labAddress, city: labCity, pincode: labPincode, services: services, 
            mon_open: document.getElementById('lab_monOpen').value, mon_close: document.getElementById('lab_monClose').value,
            tue_open: document.getElementById('lab_tueOpen').value, tue_close: document.getElementById('lab_tueClose').value,
            wed_open: document.getElementById('lab_wedOpen').value, wed_close: document.getElementById('lab_wedClose').value,
            thu_open: document.getElementById('lab_thuOpen').value, thu_close: document.getElementById('lab_thuClose').value,
            fri_open: document.getElementById('lab_friOpen').value, fri_close: document.getElementById('lab_friClose').value,
            sat_open: document.getElementById('lab_satOpen').value, sat_close: document.getElementById('lab_satClose').value,
            sun_open: document.getElementById('lab_sunOpen').value, sun_close: document.getElementById('lab_sunClose').value,
            files: { doc: docData, img1: img1Data, img2: img2Data, img3: img3Data }, status: "Inactive"
        };

        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        const data = await response.json();

        if (data.status === "success") {
            alert("Lab profile successfully submitted!");
            localStorage.setItem("bhavya_profile_completed", "true");
            localStorage.removeItem("bhavya_profile_skipped"); window.checkProfileBanner();
            document.getElementById('lab-profile-section').style.display = 'none';
        } else alert("Server Error: " + data.message);
    } catch (error) { alert(error.message); } 
    finally { saveBtn.innerText = "Submit Lab Profile"; saveBtn.style.backgroundColor = "#8e44ad"; saveBtn.disabled = false; }
};

window.switchExecTab = function(evt, tabId) {
    let contents = document.querySelectorAll("#executive-profile-section .hosp-tab-content");
    for (let i = 0; i < contents.length; i++) { contents[i].style.display = "none"; contents[i].classList.remove("active"); }
    let btns = document.querySelectorAll("#executive-profile-section .hosp-tab-btn");
    for (let i = 0; i < btns.length; i++) btns[i].classList.remove("active");
    let targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.style.display = targetTab.classList.contains('form-grid') ? "grid" : "block"; targetTab.classList.add("active");
    }
    evt.currentTarget.classList.add("active");
};

window.saveExecutiveProfile = async function() {
    const userId = localStorage.getItem("bhavya_user_id");
    const saveBtn = document.getElementById('btn-save-exec');
    const execName = document.getElementById('execName').value.trim();
    const execEmail = document.getElementById('execEmail').value.trim();

    if (!execName || !execEmail) { alert("Please fill your Full Name and Email ID!"); return; }

    saveBtn.innerText = "Uploading Files & Saving... Please Wait";
    saveBtn.style.backgroundColor = "#ffc107"; saveBtn.disabled = true;

    try {
        const docFile = document.getElementById('execDoc').files[0];
        const imgFile = document.getElementById('execImg').files[0];
        if(!docFile || !imgFile) throw new Error("Document and Photo are mandatory!");

        let docData = { base64: (await getBase64(docFile)).split(',')[1], filename: userId + "_ExecDoc_" + docFile.name, mimeType: docFile.type };
        let imgData = { base64: (await getBase64(imgFile)).split(',')[1], filename: userId + "_ExecImg_" + imgFile.name, mimeType: imgFile.type };

        const payload = {
            action: "saveExecutiveProfile", user_id: userId, executive_name: execName, executive_email: execEmail,
            qualification: document.getElementById('execQual').value.trim(), experience: document.getElementById('execExp').value.trim(),
            work_type: { collection: document.getElementById('execCol').checked ? "Yes" : "No", delivery: document.getElementById('execDel').checked ? "Yes" : "No", sales: document.getElementById('execSales').checked ? "Yes" : "No" },
            mon_open: document.getElementById('exec_monOpen').value, mon_close: document.getElementById('exec_monClose').value,
            tue_open: document.getElementById('exec_tueOpen').value, tue_close: document.getElementById('exec_tueClose').value,
            wed_open: document.getElementById('exec_wedOpen').value, wed_close: document.getElementById('exec_wedClose').value,
            thu_open: document.getElementById('exec_thuOpen').value, thu_close: document.getElementById('exec_thuClose').value,
            fri_open: document.getElementById('exec_friOpen').value, fri_close: document.getElementById('exec_friClose').value,
            sat_open: document.getElementById('exec_satOpen').value, sat_close: document.getElementById('exec_satClose').value,
            sun_open: document.getElementById('exec_sunOpen').value, sun_close: document.getElementById('exec_sunClose').value,
            files: { doc: docData, img: imgData }, status: "Inactive"
        };

        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        const data = await response.json();

        if (data.status === "success") {
            alert("Executive profile successfully submitted!");
            localStorage.setItem("bhavya_profile_completed", "true");
            localStorage.removeItem("bhavya_profile_skipped"); window.checkProfileBanner();
            document.getElementById('executive-profile-section').style.display = 'none';
        } else alert("Server Error: " + data.message);
    } catch (error) { alert(error.message); } 
    finally { saveBtn.innerText = "Submit Executive Profile"; saveBtn.style.backgroundColor = "#e67e22"; saveBtn.disabled = false; }
};

window.switchPharmTab = function(evt, tabId) {
    let contents = document.querySelectorAll("#pharmacy-profile-section .hosp-tab-content");
    for (let i = 0; i < contents.length; i++) { contents[i].style.display = "none"; contents[i].classList.remove("active"); }
    let btns = document.querySelectorAll("#pharmacy-profile-section .hosp-tab-btn");
    for (let i = 0; i < btns.length; i++) btns[i].classList.remove("active");
    let targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.style.display = targetTab.classList.contains('form-grid') ? "grid" : "block"; targetTab.classList.add("active");
    }
    evt.currentTarget.classList.add("active");
};

window.savePharmacyProfile = async function() {
    const userId = localStorage.getItem("bhavya_user_id");
    const saveBtn = document.getElementById('btn-save-pharm');
    
    const pharmName = document.getElementById('pharmName').value.trim();
    const pharmEmail = document.getElementById('pharmEmail').value.trim();
    const pharmCity = document.getElementById('pharmCity').value.trim();
    const pharmAddress = document.getElementById('pharmAddress').value.trim();
    const pharmPincode = document.getElementById('pharmPincode').value.trim();

    if (!pharmName || !pharmEmail || !pharmCity || !pharmAddress || !pharmPincode) {
        alert("Please fill Pharmacy Name, Email, City, Full Address, and Pincode!"); return;
    }

    saveBtn.innerText = "Uploading Files & Saving... Please Wait";
    saveBtn.style.backgroundColor = "#ffc107"; saveBtn.disabled = true;

    try {
        const docFile = document.getElementById('pharmDoc').files[0];
        const img1 = document.getElementById('pharmImg1').files[0];
        const img2 = document.getElementById('pharmImg2').files[0];
        const img3 = document.getElementById('pharmImg3').files[0];

        if(!docFile || !img1) throw new Error("Pharmacy Registration Document and Image 1 are mandatory!");

        let docData = { base64: (await getBase64(docFile)).split(',')[1], filename: userId + "_PharmDoc_" + docFile.name, mimeType: docFile.type };
        let img1Data = { base64: (await getBase64(img1)).split(',')[1], filename: userId + "_PharmImg1_" + img1.name, mimeType: img1.type };
        let img2Data = img2 ? { base64: (await getBase64(img2)).split(',')[1], filename: userId + "_PharmImg2_" + img2.name, mimeType: img2.type } : null;
        let img3Data = img3 ? { base64: (await getBase64(img3)).split(',')[1], filename: userId + "_PharmImg3_" + img3.name, mimeType: img3.type } : null;

        const payload = {
            action: "savePharmacyProfile", user_id: userId, pharmacy_name: pharmName, pharmacy_email: pharmEmail,
            pharmacy_address: pharmAddress, city: pharmCity, pincode: pharmPincode,
            mon_open: document.getElementById('pharm_monOpen').value, mon_close: document.getElementById('pharm_monClose').value,
            tue_open: document.getElementById('pharm_tueOpen').value, tue_close: document.getElementById('pharm_tueClose').value,
            wed_open: document.getElementById('pharm_wedOpen').value, wed_close: document.getElementById('pharm_wedClose').value,
            thu_open: document.getElementById('pharm_thuOpen').value, thu_close: document.getElementById('pharm_thuClose').value,
            fri_open: document.getElementById('pharm_friOpen').value, fri_close: document.getElementById('pharm_friClose').value,
            sat_open: document.getElementById('pharm_satOpen').value, sat_close: document.getElementById('pharm_satClose').value,
            sun_open: document.getElementById('pharm_sunOpen').value, sun_close: document.getElementById('pharm_sunClose').value,
            files: { doc: docData, img1: img1Data, img2: img2Data, img3: img3Data }, status: "Inactive"
        };

        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        const data = await response.json();

        if (data.status === "success") {
            alert("Pharmacy profile successfully submitted!");
            localStorage.setItem("bhavya_profile_completed", "true");
            localStorage.removeItem("bhavya_profile_skipped"); window.checkProfileBanner();
            document.getElementById('pharmacy-profile-section').style.display = 'none';
        } else alert("Server Error: " + data.message);
    } catch (error) { alert(error.message); } 
    finally { saveBtn.innerText = "Submit Pharmacy Profile"; saveBtn.style.backgroundColor = "#d35400"; saveBtn.disabled = false; }
};
