import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB1WNyH2I3qjYxZdmwlBghpVyRgFj19UMs",
  authDomain: "grain-broker-5a319.firebaseapp.com",
  projectId: "grain-broker-5a319",
  storageBucket: "grain-broker-5a319.firebasestorage.app",
  messagingSenderId: "918192159128",
  appId: "1:918192159128:web:9fdb960cbf84e30a0e53ed"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Admin credentials - CHANGE THESE FOR PRODUCTION!
// Replace with your actual admin email address
const ADMIN_EMAIL = "admin@grainbroker.com";

// You can also add multiple admin emails
const ADMIN_EMAILS = [
  "admin@grainbroker.com",
  "youremail@example.com" // Add your email here to make yourself admin
];

let allUsers = [];
let allBookings = [];
let allCompanies = [];
let allTemplates = [];
let selectedUserId = '';

// --- AUTH LOGIC ---
window.handleAdminLogin = async () => {
    const email = document.getElementById('admin-email').value.trim();
    const pass = document.getElementById('admin-pass').value;
    
    if(!email || !pass) return alert("Please enter credentials");
    
    // Check if email is in admin list
    if(!ADMIN_EMAILS.includes(email)) {
        return alert("Access Denied: Not an admin account");
    }
    
    try { 
        await signInWithEmailAndPassword(auth, email, pass); 
    } catch (e) { 
        alert("Login failed: " + e.message); 
    }
};

window.adminLogout = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
    if (user && ADMIN_EMAILS.includes(user.email)) {
        document.getElementById('admin-auth').style.display = 'none';
        document.getElementById('admin-ui').style.display = 'block';
        document.getElementById('admin-name').innerText = 'Admin';
        await loadAllData();
        window.showAdminView('overview');
    } else {
        document.getElementById('admin-auth').style.display = 'flex';
        document.getElementById('admin-ui').style.display = 'none';
    }
});

// --- NAVIGATION ---
window.showAdminView = (view) => {
    document.querySelectorAll('.page-content').forEach(v => v.style.display = 'none');
    const target = document.getElementById(`view-${view}`);
    if(target) target.style.display = 'block';
};

// --- DATA LOADING ---
async function loadAllData() {
    try {
        // Load all users
        const usersSnap = await getDocs(collection(db, "users"));
        allUsers = usersSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        // Load all bookings
        const bookingsSnap = await getDocs(query(collection(db, "bookings"), orderBy("timestamp", "desc")));
        allBookings = bookingsSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        // Load all companies
        const companiesSnap = await getDocs(collection(db, "companies"));
        allCompanies = companiesSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        // Load all templates
        const templatesSnap = await getDocs(collection(db, "templates"));
        allTemplates = templatesSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        updateOverview();
        renderUsers();
        renderBookings();
        renderCompanies();
        updateUserFilters();
        
    } catch(e) {
        console.error("Error loading data:", e);
        alert("Error loading data: " + e.message);
    }
}

// --- OVERVIEW ---
function updateOverview() {
    document.getElementById('total-users').innerText = allUsers.length;
    document.getElementById('total-bookings').innerText = allBookings.length;
    document.getElementById('total-companies').innerText = allCompanies.length;
    
    let totalBrokerage = 0;
    allBookings.forEach(b => totalBrokerage += (b.brokerage || 0));
    document.getElementById('total-brokerage').innerText = `₹${totalBrokerage.toLocaleString('en-IN', {maximumFractionDigits: 2})}`;
}

// --- USER MANAGEMENT ---
function renderUsers() {
    const list = document.getElementById('users-list');
    if(!list) return;
    
    if(allUsers.length === 0) {
        list.innerHTML = `<div class="empty-state">No users found.</div>`;
        return;
    }
    
    list.innerHTML = allUsers.map(user => {
        const userBookings = allBookings.filter(b => b.userId === user.id);
        const userCompanies = allCompanies.filter(c => c.userId === user.id);
        const userTemplates = allTemplates.filter(t => t.userId === user.id);
        
        let totalBrokerage = 0;
        userBookings.forEach(b => totalBrokerage += (b.brokerage || 0));
        
        return `<div class="user-card">
            <div class="user-info">
                <div>
                    <strong style="font-size: 16px;">${user.name}</strong>
                    <span class="badge badge-primary">User</span>
                    <p style="margin: 5px 0; color: #64748b; font-size: 14px;">
                        📧 ${user.email}<br>
                        📞 ${user.phone || 'N/A'}
                    </p>
                    <div style="margin-top: 10px; display: flex; gap: 15px; font-size: 13px;">
                        <span><strong>Bookings:</strong> ${userBookings.length}</span>
                        <span><strong>Companies:</strong> ${userCompanies.length}</span>
                        <span><strong>Templates:</strong> ${userTemplates.length}</span>
                        <span><strong>Total Brokerage:</strong> ₹${totalBrokerage.toLocaleString('en-IN')}</span>
                    </div>
                </div>
                <div class="action-links">
                    <span class="view-link" onclick="window.viewUserDetails('${user.id}')">View Details</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

window.viewUserDetails = (userId) => {
    const user = allUsers.find(u => u.id === userId);
    if(!user) return;
    
    const userBookings = allBookings.filter(b => b.userId === userId);
    const userCompanies = allCompanies.filter(c => c.userId === userId);
    const userTemplates = allTemplates.filter(t => t.userId === userId);
    
    let totalBrokerage = 0;
    userBookings.forEach(b => totalBrokerage += (b.brokerage || 0));
    
    const content = `
        <div style="margin-bottom: 20px;">
            <h4 style="margin-top: 0;">User Information</h4>
            <p><strong>Name:</strong> ${user.name}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Phone:</strong> ${user.phone || 'N/A'}</p>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h4>Statistics</h4>
            <div class="stat-grid" style="grid-template-columns: 1fr 1fr;">
                <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center;">
                    <small>Total Bookings</small>
                    <h3>${userBookings.length}</h3>
                </div>
                <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center;">
                    <small>Total Brokerage</small>
                    <h3>₹${totalBrokerage.toLocaleString('en-IN')}</h3>
                </div>
                <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center;">
                    <small>Companies</small>
                    <h3>${userCompanies.length}</h3>
                </div>
                <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center;">
                    <small>Templates</small>
                    <h3>${userTemplates.length}</h3>
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h4>Recent Bookings (Last 5)</h4>
            ${userBookings.slice(0, 5).map(b => {
                const date = b.timestamp && b.timestamp.toDate ? 
                    b.timestamp.toDate().toLocaleDateString('en-IN') : 'N/A';
                return `<div style="padding: 10px; background: #f8fafc; border-radius: 8px; margin-bottom: 8px;">
                    <strong>${b.grain}</strong> - ${b.qty} MT (₹${b.brokerage.toFixed(2)})<br>
                    <small>${b.from} → ${b.to} | ${date}</small>
                </div>`;
            }).join('') || '<p style="color: #94a3b8;">No bookings yet</p>'}
        </div>
    `;
    
    document.getElementById('user-details-content').innerHTML = content;
    document.getElementById('modal-user-details').style.display = 'flex';
};

window.closeUserDetailsModal = () => {
    document.getElementById('modal-user-details').style.display = 'none';
};

// --- BOOKINGS ---
function renderBookings() {
    const container = document.getElementById('bookings-list');
    if(!container) return;
    
    const bookingsToShow = selectedUserId ? 
        allBookings.filter(b => b.userId === selectedUserId) : allBookings;
    
    if(bookingsToShow.length === 0) {
        container.innerHTML = `<div class="empty-state">No bookings found.</div>`;
        return;
    }
    
    let html = `<table>
        <thead>
            <tr>
                <th>User</th>
                <th>Grain</th>
                <th>Qty</th>
                <th>From → To</th>
                <th>Brokerage</th>
                <th>Date</th>
            </tr>
        </thead>
        <tbody>`;
    
    bookingsToShow.forEach(b => {
        const user = allUsers.find(u => u.id === b.userId);
        const userName = user ? user.name : 'Unknown';
        const date = b.timestamp && b.timestamp.toDate ? 
            b.timestamp.toDate().toLocaleDateString('en-IN') : 'N/A';
        
        html += `<tr>
            <td><strong>${userName}</strong></td>
            <td>${b.grain}</td>
            <td>${b.qty} MT</td>
            <td><small>${b.from}<br>→ ${b.to}</small></td>
            <td>₹${(b.brokerage || 0).toFixed(2)}</td>
            <td>${date}</td>
        </tr>`;
    });
    
    container.innerHTML = html + `</tbody></table>`;
}

window.filterByUser = () => {
    selectedUserId = document.getElementById('user-filter').value;
    renderBookings();
};

// --- COMPANIES ---
function renderCompanies() {
    const list = document.getElementById('companies-list');
    if(!list) return;
    
    const companyUserId = document.getElementById('company-user-filter') ? 
        document.getElementById('company-user-filter').value : '';
    
    const companiesToShow = companyUserId ? 
        allCompanies.filter(c => c.userId === companyUserId) : allCompanies;
    
    if(companiesToShow.length === 0) {
        list.innerHTML = `<div class="empty-state">No companies found.</div>`;
        return;
    }
    
    list.innerHTML = companiesToShow.map(c => {
        const user = allUsers.find(u => u.id === c.userId);
        const userName = user ? user.name : 'Unknown';
        
        return `<div class="card">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <strong style="font-size: 15px;">${c.name}</strong> 
                    <span class="badge badge-success">${c.client}</span>
                    <p style="margin: 5px 0; color: #64748b; font-size: 13px;">
                        📞 ${c.phone} ${c.state ? `| 📍 ${c.state}` : ''}<br>
                        <span style="color: #3b82f6;">👤 ${userName}</span>
                    </p>
                </div>
            </div>
        </div>`;
    }).join('');
}

window.filterCompaniesByUser = () => {
    renderCompanies();
};

// --- FILTERS ---
function updateUserFilters() {
    const userFilter = document.getElementById('user-filter');
    const companyUserFilter = document.getElementById('company-user-filter');
    
    const options = allUsers.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    
    if(userFilter) {
        userFilter.innerHTML = `<option value="">All Users</option>` + options;
    }
    
    if(companyUserFilter) {
        companyUserFilter.innerHTML = `<option value="">All Users</option>` + options;
    }
}

// --- EXPORT ---
window.exportAllData = () => {
    if(allBookings.length === 0) {
        alert("No data to export!");
        return;
    }
    
    const exportData = allBookings.map(booking => {
        const user = allUsers.find(u => u.id === booking.userId);
        return {
            'User': user ? user.name : 'Unknown',
            'User Email': user ? user.email : 'N/A',
            'Grain': booking.grain,
            'Quantity (MT)': booking.qty,
            'Price (₹)': booking.price,
            'Brokerage %': booking.perc,
            'Brokerage Amount (₹)': booking.brokerage ? booking.brokerage.toFixed(2) : 0,
            'From': booking.from,
            'To': booking.to,
            'Date': booking.timestamp && booking.timestamp.toDate ? 
                    booking.timestamp.toDate().toLocaleDateString('en-IN') : 'N/A'
        };
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "All Bookings");
    XLSX.writeFile(wb, `GrainBroker_Admin_Export_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.xlsx`);
};

// --- EVENT BINDINGS ---
document.getElementById('btn-admin-login').addEventListener('click', window.handleAdminLogin);