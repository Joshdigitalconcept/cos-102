/* =====================================================
   EXAMPLE Firebase config — safe to commit
   -----------------------------------------------------
   Copy this file to firebase-config.js for local use:
     cp js/firebase-config.example.js js/firebase-config.js
   Then paste your real values and set FIREBASE_ENABLED = true

   On Vercel, firebase-config.js is generated automatically
   from environment variables (see README).
   ===================================================== */

var FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

var FIREBASE_ENABLED = false;
