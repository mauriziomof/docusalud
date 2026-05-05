import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCn1ELv-CLd2-C-agYGVt7dHeYlrw7T-_M",
  authDomain: "docusalud-4b215.firebaseapp.com",
  projectId: "docusalud-4b215",
  storageBucket: "docusalud-4b215.firebasestorage.app",
  messagingSenderId: "1061568032939",
  appId: "1:1061568032939:web:8bc330818071ea15bf87ee"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
