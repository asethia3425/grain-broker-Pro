import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

  const firebaseConfig = {
    apiKey: "AIzaSyBwdzQd7OzLblo0EvcZIXZu65GFKFWe8kQ",
    authDomain: "testing-gemini-5d99b.firebaseapp.com",
    projectId: "testing-gemini-5d99b",
    storageBucket: "testing-gemini-5d99b.firebasestorage.app",
    messagingSenderId: "393081747454",
    appId: "1:393081747454:web:eb8fb76ceb1165f8a3b2af",
    measurementId: "G-FPMKK0DGYK"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the auth service to be used in script.js
export const auth = getAuth(app);