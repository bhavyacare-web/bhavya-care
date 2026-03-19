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

// Popup khulne par call hoga (Invisible Recaptcha)
function setupRecaptcha() {
    if (!window.recaptchaVerifier) {
        // 'size': 'invisible' se user ko tick nahi karna padega
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('send-otp-btn', {
            'size': 'invisible',
            'callback': (response) => {
                console.log("Invisible Recaptcha verified!");
            }
        });
        
        window.recaptchaVerifier.render().catch(function(error) {
            console.error("Recaptcha Render Error:", error);
        });
    }
}

function sendOTP() {
    const userNumber = document.getElementById('phoneNumber').value.trim();
    
    if(userNumber.length !== 10 || isNaN(userNumber)) {
        alert("Kripya sahi 10-digit mobile number daalein! (Support: +918950112467)");
        return;
    }

    const finalNumberWithCode = "+91" + userNumber;

    // Make sure recaptcha is ready
    if(!window.recaptchaVerifier) {
        setupRecaptcha();
    }

    // Button ko disable karein taaki user baar-baar click na kare
    document.getElementById('send-otp-btn').disabled = true;
    document.getElementById('send-otp-btn').innerText = "Sending...";

    firebase.auth().signInWithPhoneNumber(finalNumberWithCode, window.recaptchaVerifier)
        .then((confirmationResult) => {
            window.confirmationResult = confirmationResult;
            
            // UI MAGIC: OTP chala gaya, ab form badlo
            document.getElementById('phone-section').style.display = 'none';
            document.getElementById('otp-section').style.display = 'block';
            document.getElementById('form-title').innerText = "Verify Mobile";
            
            alert("OTP SMS bhej diya gaya hai!");
            
            // Reset button state
            document.getElementById('send-otp-btn').disabled = false;
            document.getElementById('send-otp-btn').innerText = "Get OTP";
        }).catch((error) => {
            console.error("OTP Error:", error);
            alert("Firebase Error: " + error.message);
            
            // Agar error aaye toh button ko wapas normal karein
            document.getElementById('send-otp-btn').disabled = false;
            document.getElementById('send-otp-btn').innerText = "Get OTP";
            
            // Recaptcha ko reset karna zaroori hai error ke baad
            if(window.recaptchaVerifier) {
                window.recaptchaVerifier.render().then(function(widgetId) {
                    grecaptcha.reset(widgetId);
                });
            }
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
        alert("Login Successful! Welcome to bhavyacare.com");
        
        console.log("User Data:", { uid: user.uid, phone: user.phoneNumber });

        // OTP verify hone ke baad form ko wapas band kar dena
        document.getElementById('login-section').style.display = 'none';
        
    }).catch((error) => {
        alert("Galat OTP! Kripya dobara try karein. (Issue persist? Email: bhavyacare1@gmail.com)");
    });
}
