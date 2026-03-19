const firebaseConfig = {
    apiKey: "AIzaSyC2nYH22wkYDhh-BWfHvkT-bQvdKLCxask",
    authDomain: "bhavya-care.firebaseapp.com",
    projectId: "bhavya-care",
    storageBucket: "bhavya-care.firebasestorage.app",
    messagingSenderId: "979254809111",
    appId: "1:979254809111:web:0181e0c97277a5d0d9c252",
    measurementId: "G-G82G4VWGGT"
};

firebase.initializeApp(firebaseConfig);

window.onload = function () {
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'normal',
        'callback': (response) => {
            console.log("Recaptcha verified!");
        }
    });
};

function sendOTP() {
    const userNumber = document.getElementById('phoneNumber').value.trim();
    
    if(userNumber.length !== 10 || isNaN(userNumber)) {
        alert("Kripya sahi 10-digit mobile number daalein!");
        return;
    }

    const finalNumberWithCode = "+91" + userNumber;

    firebase.auth().signInWithPhoneNumber(finalNumberWithCode, window.recaptchaVerifier)
        .then((confirmationResult) => {
            window.confirmationResult = confirmationResult;
            
            // UI MAGIC: OTP chala gaya, ab form badlo
            document.getElementById('phone-section').style.display = 'none';
            document.getElementById('otp-section').style.display = 'block';
            document.getElementById('form-title').innerText = "Verify Mobile";
            
            alert("OTP SMS bhej diya gaya hai!");
        }).catch((error) => {
            console.error("OTP Error:", error);
            alert("Firebase Error: " + error.message);
        });
}

function verifyOTP() {
    const code = document.getElementById('otpCode').value.trim();
    
    if(code.length !== 6) {
        alert("Kripya 6-digit ka OTP daalein.");
        return;
    }

    confirmationResult.confirm(code).then((result) => {
        const user = result.user;
        alert("Login Successful! Welcome to Bhavyacare.");
        
        console.log("User Data:", { uid: user.uid, phone: user.phoneNumber });

        // OTP verify hone ke baad form ko wapas band kar dena
        document.getElementById('login-section').style.display = 'none';
        
    }).catch((error) => {
        alert("Galat OTP! Kripya dobara try karein.");
    });
}