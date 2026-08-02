// firebase-config.js
// Firebase configuration for REALTIME DATABASE

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBJe4nvC4Q2p-lBSth8a4LOSkWIwW8Zs2g",
  authDomain: "housekeeping-791a4.firebaseapp.com",
  databaseURL: "https://housekeeping-791a4-default-rtdb.firebaseio.com", // ADD THIS LINE for Realtime Database
  projectId: "housekeeping-791a4",
  storageBucket: "housekeeping-791a4.firebasestorage.app",
  messagingSenderId: "451334815894",
  appId: "1:451334815894:web:df851c38bd22b6094382b7",
  measurementId: "G-2NQHXVSSRR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db };
