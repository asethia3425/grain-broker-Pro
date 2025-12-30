import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc, getDoc, setDoc, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

let bookingsData = [];
let companiesData = [];
let editBookingId = null;
let editCompanyId = null;
let deleteTargetId = null;
let deleteCompanyTargetId = null;
let brokerageChart = null;
let quantityChart = null;
let currentChartPeriod = 'month';
let selectedCompanyFilter = '';
let currentWhatsAppBooking = null;
let templatesData = [];
let editTemplateId = null;
let deleteTemplateTargetId = null;

// --- AUTH LOGIC ---
window.handleLogin = async () => {
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('pass').value;
    if(!email || !pass) return alert("Please enter email and password");
    try { await signInWithEmailAndPassword(auth, email, pass); } catch (e) { alert("Login failed: " + e.message); }
};

window.handleSignup = async () => {
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value;
    if(!name || !email || !pass) return alert("Please fill mandatory fields");
    try { 
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", userCredential.user.uid), { name, phone, email });
        alert("Account created successfully!"); 
    } catch (e) { alert("Signup Error: " + e.message); }
};

window.handleReset = async () => {
    const email = document.getElementById('reset-email').value.trim();
    if(!email) return alert("Please enter your email");
    try { await sendPasswordResetEmail(auth, email); alert("Reset link sent!"); window.showAuthSubView('login'); } catch (e) { alert(e.message); }
};

window.logout = () => signOut(auth);

window.showAuthSubView = (view) => {
    document.getElementById('login-form').style.display = view === 'login' ? 'block' : 'none';
    document.getElementById('signup-form').style.display = view === 'signup' ? 'block' : 'none';
    document.getElementById('forgot-form').style.display = view === 'forgot' ? 'block' : 'none';
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const userName = userDoc.exists() ? userDoc.data().name : "Broker";
            document.getElementById('user-name-label').innerText = userName;
        } catch (err) { 
            document.getElementById('user-name-label').innerText = "Broker"; 
        }
        document.getElementById('view-auth').style.display = 'none';
        document.getElementById('app-ui').style.display = 'block';
        window.showView('home');
        loadData();
    } else {
        document.getElementById('view-auth').style.display = 'flex';
        document.getElementById('app-ui').style.display = 'none';
    }
});

// --- NAVIGATION ---
window.showView = (view) => {
    document.querySelectorAll('.page-content').forEach(v => v.style.display = 'none');
    const target = document.getElementById(`view-${view}`);
    if(target) target.style.display = 'block';
    if(view === 'analytics') {
        setTimeout(() => {
            updateCompanyFilterDropdown();
            renderCharts();
        }, 100);
    }
};

// --- DATA LOGIC ---
async function loadData() {
    const user = auth.currentUser;
    if (!user) return;

    // Filter Companies by userId
    const companiesQuery = query(collection(db, "companies"), where("userId", "==", user.uid));
    onSnapshot(companiesQuery, (snap) => {
        companiesData = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        updateDropdowns();
        renderCompanies();
        if(document.getElementById('view-analytics').style.display === 'block') {
            updateCompanyFilterDropdown();
        }
    });

    // Filter Bookings by userId
    const bookingsQuery = query(
        collection(db, "bookings"), 
        where("userId", "==", user.uid), 
        orderBy("timestamp", "desc")
    );
    onSnapshot(bookingsQuery, (snap) => {
        bookingsData = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        renderBookings();
        calculateStats();
        if(document.getElementById('view-analytics').style.display === 'block') {
            renderCharts();
        }
    });

    // Filter Templates by userId
    const templatesQuery = query(collection(db, "templates"), where("userId", "==", user.uid));
    onSnapshot(templatesQuery, (snap) => {
        templatesData = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        renderTemplates();
        updateTemplateDropdown();
    });
}

function updateDropdowns() {
    const opts = companiesData.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    document.getElementById('book-from').innerHTML = `<option value="">From Company *</option>` + opts;
    document.getElementById('book-to').innerHTML = `<option value="">To Company *</option>` + opts;
}

function updateCompanyFilterDropdown() {
    const filterSelect = document.getElementById('company-filter');
    if(!filterSelect) return;
    
    const uniqueCompanies = new Set();
    bookingsData.forEach(b => {
        if(b.from) uniqueCompanies.add(b.from);
        if(b.to) uniqueCompanies.add(b.to);
    });
    
    const opts = Array.from(uniqueCompanies).sort().map(c => 
        `<option value="${c}">${c}</option>`
    ).join('');
    
    filterSelect.innerHTML = `<option value="">All Companies</option>` + opts;
    filterSelect.value = selectedCompanyFilter;
}

// --- COMPANY FILTER ---
window.applyCompanyFilter = () => {
    selectedCompanyFilter = document.getElementById('company-filter').value;
    renderCharts();
};

// --- COMPANY OPERATIONS ---
window.saveCompany = async () => {
    const name = document.getElementById('comp-name').value.trim();
    const phone = document.getElementById('comp-phone').value.trim();
    const client = document.getElementById('comp-client').value.trim();
    const state = document.getElementById('comp-state').value;
    if(!name || !phone || !client) return alert("Fill mandatory fields!");
    
    const data = { 
        name, phone, client, state, 
        updatedAt: serverTimestamp(),
        userId: auth.currentUser.uid 
    };
    
    try {
        if(editCompanyId) { 
            await updateDoc(doc(db, "companies", editCompanyId), data); 
        } else { 
            data.createdAt = serverTimestamp(); 
            await addDoc(collection(db, "companies"), data); 
        }
        window.closeCompanyModal();
    } catch(e) { alert(e.message); }
};

window.editCompany = (id) => {
    const c = companiesData.find(x => x.id === id);
    if(!c) return;
    editCompanyId = id;
    document.getElementById('company-modal-title').innerText = "Edit Company";
    document.getElementById('comp-name').value = c.name;
    document.getElementById('comp-phone').value = c.phone;
    document.getElementById('comp-client').value = c.client;
    document.getElementById('comp-state').value = c.state || "";
    document.getElementById('modal-company').style.display = 'flex';
};

window.deleteCompany = (id) => { deleteCompanyTargetId = id; document.getElementById('modal-confirm-company').style.display = 'flex'; };
window.confirmDeleteCompany = async () => {
    if(deleteCompanyTargetId) {
        try { await deleteDoc(doc(db, "companies", deleteCompanyTargetId)); window.closeConfirmCompanyModal(); } catch(e) { alert(e.message); }
    }
};
window.closeConfirmCompanyModal = () => { deleteCompanyTargetId = null; document.getElementById('modal-confirm-company').style.display = 'none'; };

// --- BULK COMPANY UPLOAD ---
window.downloadCompanyTemplate = () => {
    const templateData = [
        {
            'Company Name': 'Example Corp',
            'Phone': '9876543210',
            'Client Name': 'John Doe',
            'State': 'Maharashtra'
        },
        {
            'Company Name': 'Sample Industries',
            'Phone': '9123456789',
            'Client Name': 'Jane Smith',
            'State': 'Gujarat'
        }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Companies");
    
    // Add column widths for better readability
    ws['!cols'] = [
        { wch: 20 },
        { wch: 15 },
        { wch: 20 },
        { wch: 15 }
    ];
    
    XLSX.writeFile(wb, 'Company_Upload_Template.xlsx');
};

window.triggerBulkUpload = () => {
    document.getElementById('bulk-upload-input').click();
};

window.handleBulkUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            
            if (jsonData.length === 0) {
                showBulkResult('Error', 'The Excel file is empty or invalid!', 'error');
                return;
            }
            
            // Validate and process companies
            const results = {
                success: [],
                errors: []
            };
            
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                const rowNum = i + 2; // Excel row number (accounting for header)
                
                // Extract and validate fields
                const name = row['Company Name']?.toString().trim();
                const phone = row['Phone']?.toString().trim();
                const client = row['Client Name']?.toString().trim();
                const state = row['State']?.toString().trim() || '';
                
                // Validation
                if (!name) {
                    results.errors.push({
                        row: rowNum,
                        error: 'Company Name is required'
                    });
                    continue;
                }
                
                if (!phone) {
                    results.errors.push({
                        row: rowNum,
                        error: 'Phone is required'
                    });
                    continue;
                }
                
                if (!client) {
                    results.errors.push({
                        row: rowNum,
                        error: 'Client Name is required'
                    });
                    continue;
                }
                
                // Check for duplicate company name
                const existingCompany = companiesData.find(c => 
                    c.name.toLowerCase() === name.toLowerCase()
                );
                
                if (existingCompany) {
                    results.errors.push({
                        row: rowNum,
                        error: `Company "${name}" already exists`
                    });
                    continue;
                }
                
                // Try to add company
                try {
                    const companyData = {
                        name,
                        phone,
                        client,
                        state,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        userId: auth.currentUser.uid
                    };
                    
                    await addDoc(collection(db, "companies"), companyData);
                    results.success.push({
                        row: rowNum,
                        name
                    });
                } catch (error) {
                    results.errors.push({
                        row: rowNum,
                        error: `Failed to add: ${error.message}`
                    });
                }
            }
            
            // Show results
            showBulkResult(
                'Upload Complete',
                results,
                results.errors.length === 0 ? 'success' : 'partial'
            );
            
        } catch (error) {
            showBulkResult('Error', `Failed to process file: ${error.message}`, 'error');
        }
        
        // Reset file input
        event.target.value = '';
    };
    
    reader.readAsArrayBuffer(file);
};

function showBulkResult(title, results, type) {
    const modal = document.getElementById('modal-bulk-result');
    const titleEl = document.getElementById('bulk-result-title');
    const contentEl = document.getElementById('bulk-result-content');
    
    titleEl.innerText = title;
    
    let html = '';
    
    if (type === 'error') {
        html = `<div style="padding: 15px; background: #fee; border-radius: 8px; color: #d32f2f;">
            <strong>❌ Error:</strong> ${results}
        </div>`;
    } else {
        if (results.success.length > 0) {
            html += `<div style="padding: 15px; background: #e8f5e9; border-radius: 8px; margin-bottom: 10px;">
                <strong style="color: var(--primary);">✅ Successfully Added (${results.success.length}):</strong>
                <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                    ${results.success.map(s => `<li>Row ${s.row}: ${s.name}</li>`).join('')}
                </ul>
            </div>`;
        }
        
        if (results.errors.length > 0) {
            html += `<div style="padding: 15px; background: #fee; border-radius: 8px;">
                <strong style="color: var(--danger);">❌ Errors (${results.errors.length}):</strong>
                <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                    ${results.errors.map(e => `<li>Row ${e.row}: ${e.error}</li>`).join('')}
                </ul>
            </div>`;
        }
        
        if (results.success.length > 0 && results.errors.length === 0) {
            html += `<p style="text-align: center; color: var(--primary); font-weight: bold; margin-top: 15px;">
                All companies uploaded successfully! 🎉
            </p>`;
        }
    }
    
    contentEl.innerHTML = html;
    modal.style.display = 'flex';
}

window.closeBulkResultModal = () => {
    document.getElementById('modal-bulk-result').style.display = 'none';
};

// --- BULK BOOKING UPLOAD ---
window.downloadBookingTemplate = () => {
    const templateData = [
        {
            'Date': '2025-12-30',
            'Grain Type': 'Wheat',
            'Quantity (MT)': 100,
            'Price (₹)': 2500,
            'Brokerage %': 2,
            'From Company': 'Example Corp',
            'To Company': 'Sample Industries'
        },
        {
            'Date': '2025-12-29',
            'Grain Type': 'Rice',
            'Quantity (MT)': 50,
            'Price (₹)': 3000,
            'Brokerage %': 1.5,
            'From Company': 'Sample Industries',
            'To Company': 'Example Corp'
        }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bookings");
    
    // Add column widths for better readability
    ws['!cols'] = [
        { wch: 12 },
        { wch: 15 },
        { wch: 15 },
        { wch: 12 },
        { wch: 15 },
        { wch: 20 },
        { wch: 20 }
    ];
    
    XLSX.writeFile(wb, 'Booking_Upload_Template.xlsx');
};

window.triggerBulkBookingUpload = () => {
    document.getElementById('bulk-booking-upload-input').click();
};

window.handleBulkBookingUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            
            if (jsonData.length === 0) {
                showBulkResult('Error', 'The Excel file is empty or invalid!', 'error');
                return;
            }
            
            // Get company names for validation
            const companyNames = companiesData.map(c => c.name.toLowerCase());
            
            // Validate and process bookings
            const results = {
                success: [],
                errors: []
            };
            
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                const rowNum = i + 2; // Excel row number (accounting for header)
                
                // Extract and validate fields
                const dateStr = row['Date']?.toString().trim();
                const grain = row['Grain Type']?.toString().trim();
                const qty = parseFloat(row['Quantity (MT)']);
                const price = parseFloat(row['Price (₹)']);
                const perc = parseFloat(row['Brokerage %']);
                const from = row['From Company']?.toString().trim();
                const to = row['To Company']?.toString().trim();
                
                // Validation
                if (!dateStr) {
                    results.errors.push({
                        row: rowNum,
                        error: 'Date is required (format: YYYY-MM-DD)'
                    });
                    continue;
                }
                
                // Parse and validate date
                let bookingDate;
                try {
                    bookingDate = new Date(dateStr);
                    if (isNaN(bookingDate.getTime())) {
                        throw new Error('Invalid date');
                    }
                } catch (err) {
                    results.errors.push({
                        row: rowNum,
                        error: 'Invalid date format (use YYYY-MM-DD)'
                    });
                    continue;
                }
                
                if (!grain) {
                    results.errors.push({
                        row: rowNum,
                        error: 'Grain Type is required'
                    });
                    continue;
                }
                
                if (isNaN(qty) || qty <= 0) {
                    results.errors.push({
                        row: rowNum,
                        error: 'Quantity must be a positive number'
                    });
                    continue;
                }
                
                if (isNaN(price) || price <= 0) {
                    results.errors.push({
                        row: rowNum,
                        error: 'Price must be a positive number'
                    });
                    continue;
                }
                
                if (isNaN(perc) || perc <= 0) {
                    results.errors.push({
                        row: rowNum,
                        error: 'Brokerage % must be a positive number'
                    });
                    continue;
                }
                
                if (!from) {
                    results.errors.push({
                        row: rowNum,
                        error: 'From Company is required'
                    });
                    continue;
                }
                
                if (!to) {
                    results.errors.push({
                        row: rowNum,
                        error: 'To Company is required'
                    });
                    continue;
                }
                
                // Check if companies exist
                if (!companyNames.includes(from.toLowerCase())) {
                    results.errors.push({
                        row: rowNum,
                        error: `Company "${from}" not found. Please add it first.`
                    });
                    continue;
                }
                
                if (!companyNames.includes(to.toLowerCase())) {
                    results.errors.push({
                        row: rowNum,
                        error: `Company "${to}" not found. Please add it first.`
                    });
                    continue;
                }
                
                // Try to add booking
                try {
                    const bookingData = {
                        grain,
                        qty,
                        price,
                        perc,
                        brokerage: (qty * price * (perc / 100)),
                        from,
                        to,
                        timestamp: Timestamp.fromDate(bookingDate),
                        userId: auth.currentUser.uid
                    };
                    
                    await addDoc(collection(db, "bookings"), bookingData);
                    results.success.push({
                        row: rowNum,
                        name: `${grain} - ${from} → ${to}`
                    });
                } catch (error) {
                    results.errors.push({
                        row: rowNum,
                        error: `Failed to add: ${error.message}`
                    });
                }
            }
            
            // Show results
            showBulkResult(
                'Upload Complete',
                results,
                results.errors.length === 0 ? 'success' : 'partial'
            );
            
        } catch (error) {
            showBulkResult('Error', `Failed to process file: ${error.message}`, 'error');
        }
        
        // Reset file input
        event.target.value = '';
    };
    
    reader.readAsArrayBuffer(file);
};

// --- BOOKING OPERATIONS ---
window.saveBooking = async () => {
    const dateInput = document.getElementById('book-date').value;
    const grain = document.getElementById('book-grain').value;
    const qty = parseFloat(document.getElementById('book-qty').value);
    const price = parseFloat(document.getElementById('book-price').value);
    const perc = parseFloat(document.getElementById('book-perc').value);
    const from = document.getElementById('book-from').value;
    const to = document.getElementById('book-to').value;
    if(!grain || isNaN(qty) || isNaN(price) || isNaN(perc) || !from || !to) return alert("Fill mandatory fields!");
    
    // Convert date input to timestamp, or use current date if not provided
    let bookingTimestamp;
    if (dateInput) {
        const selectedDate = new Date(dateInput);
        bookingTimestamp = Timestamp.fromDate(selectedDate);
    } else {
        bookingTimestamp = serverTimestamp();
    }
    
    const data = { 
        grain, qty, price, perc, 
        brokerage: (qty * price * (perc/100)), 
        from, to, 
        timestamp: bookingTimestamp,
        userId: auth.currentUser.uid
    };

    try {
        if(editBookingId) { 
            await updateDoc(doc(db, "bookings", editBookingId), data); 
        } else { 
            await addDoc(collection(db, "bookings"), data); 
        }
        window.closeBookingModal();
    } catch(e) { alert(e.message); }
};

window.editBooking = (id) => {
    const b = bookingsData.find(x => x.id === id);
    if(!b) return;
    editBookingId = id;
    document.getElementById('booking-modal-title').innerText = "Edit Booking";
    
    // Set date if timestamp exists
    if (b.timestamp && b.timestamp.toDate) {
        const date = b.timestamp.toDate();
        const dateStr = date.toISOString().split('T')[0];
        document.getElementById('book-date').value = dateStr;
    } else {
        document.getElementById('book-date').value = '';
    }
    
    document.getElementById('book-grain').value = b.grain;
    document.getElementById('book-qty').value = b.qty;
    document.getElementById('book-price').value = b.price;
    document.getElementById('book-perc').value = b.perc;
    document.getElementById('book-from').value = b.from;
    document.getElementById('book-to').value = b.to;
    document.getElementById('modal-booking').style.display = 'flex';
};

window.deleteBooking = (id) => { deleteTargetId = id; document.getElementById('modal-confirm').style.display = 'flex'; };
window.confirmDelete = async () => {
    if(deleteTargetId) {
        try { await deleteDoc(doc(db, "bookings", deleteTargetId)); window.closeConfirmModal(); } catch(e) { alert(e.message); }
    }
};
window.closeConfirmModal = () => { deleteTargetId = null; document.getElementById('modal-confirm').style.display = 'none'; };

// --- RENDERING ---
function renderBookings() {
    const container = document.getElementById('bookings-table-container');
    if(bookingsData.length === 0) { container.innerHTML = `<div class="empty-state">No entries found.</div>`; return; }
    let html = `<table><thead><tr><th>Grain</th><th>Qty</th><th>From ➔ To</th><th>Brokerage</th><th>Action</th></tr></thead><tbody>`;
    bookingsData.forEach(b => {
        html += `<tr>
            <td><strong>${b.grain}</strong></td>
            <td>${b.qty} MT</td>
            <td><small>${b.from}<br>➔ ${b.to}</small></td>
            <td>₹${(b.brokerage || 0).toFixed(2)}</td>
            <td>
                <div class="action-links">
                    <button class="action-btn whatsapp-btn" onclick="window.openWhatsAppModal('${b.id}')">📱 WhatsApp</button>
                    <span class="edit-link" onclick="window.editBooking('${b.id}')">Edit</span>
                    <span class="delete-link" onclick="window.deleteBooking('${b.id}')">Delete</span>
                </div>
            </td>
        </tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

function renderCompanies() {
    const list = document.getElementById('companies-list');
    if(companiesData.length === 0) { list.innerHTML = `<div class="empty-state">No companies.</div>`; return; }
    list.innerHTML = companiesData.map(c => `<div class="card">
        <div style="display:flex; justify-content:space-between; align-items:start;">
            <div><strong>${c.name}</strong> (${c.client})<br><small>📞 ${c.phone}</small></div>
            <div class="action-links"><span class="edit-link" onclick="window.editCompany('${c.id}')">Edit</span><span class="delete-link" onclick="window.deleteCompany('${c.id}')">Delete</span></div>
        </div>
    </div>`).join('');
}

function calculateStats() {
    let b = 0, q = 0;
    bookingsData.forEach(item => { b += (item.brokerage || 0); q += (item.qty || 0); });
    const bStr = `₹${b.toLocaleString('en-IN', {maximumFractionDigits: 2})}`;
    const qStr = `${q} MT`;
    document.getElementById('home-brokerage').innerText = bStr;
    document.getElementById('home-qty').innerText = qStr;
    
    // Calculate filtered stats for analytics
    const filteredData = getFilteredBookings();
    let filteredB = 0, filteredQ = 0;
    filteredData.forEach(item => { filteredB += (item.brokerage || 0); filteredQ += (item.qty || 0); });
    const filteredBStr = `₹${filteredB.toLocaleString('en-IN', {maximumFractionDigits: 2})}`;
    const filteredQStr = `${filteredQ} MT`;
    document.getElementById('stat-brokerage').innerText = filteredBStr;
    document.getElementById('stat-qty').innerText = filteredQStr;
}

function getFilteredBookings() {
    if(!selectedCompanyFilter) return bookingsData;
    return bookingsData.filter(b => 
        b.from === selectedCompanyFilter || b.to === selectedCompanyFilter
    );
}

// --- CHARTS ---
window.changeChartPeriod = (period) => {
    currentChartPeriod = period;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${period}`).classList.add('active');
    renderCharts();
};

function renderCharts() {
    const chartData = getChartData(currentChartPeriod);
    
    // Destroy existing charts
    if(brokerageChart) brokerageChart.destroy();
    if(quantityChart) quantityChart.destroy();
    
    // Brokerage Chart
    const ctx1 = document.getElementById('brokerageChart');
    if(ctx1) {
        brokerageChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Brokerage (₹)',
                    data: chartData.brokerage,
                    borderColor: '#1b5e20',
                    backgroundColor: 'rgba(27, 94, 32, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    title: { display: true, text: 'Brokerage Trend' }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
    
    // Quantity Chart
    const ctx2 = document.getElementById('quantityChart');
    if(ctx2) {
        quantityChart = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Quantity (MT)',
                    data: chartData.quantity,
                    backgroundColor: '#2563eb',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    title: { display: true, text: 'Quantity Sold' }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
    
    // Update stats with filtered data
    calculateStats();
}

function getChartData(period) {
    const now = new Date();
    let labels = [];
    let brokerageData = [];
    let quantityData = [];
    const filteredBookings = getFilteredBookings();
    
    if(period === 'month') {
        // Last 30 days
        for(let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            labels.push(dateStr);
            
            let dayBrokerage = 0;
            let dayQuantity = 0;
            
            filteredBookings.forEach(booking => {
                if(booking.timestamp && booking.timestamp.toDate) {
                    const bookingDate = booking.timestamp.toDate();
                    if(bookingDate.toDateString() === date.toDateString()) {
                        dayBrokerage += booking.brokerage || 0;
                        dayQuantity += booking.qty || 0;
                    }
                }
            });
            
            brokerageData.push(dayBrokerage);
            quantityData.push(dayQuantity);
        }
    } else {
        // Last 12 months
        for(let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStr = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            labels.push(monthStr);
            
            let monthBrokerage = 0;
            let monthQuantity = 0;
            
            filteredBookings.forEach(booking => {
                if(booking.timestamp && booking.timestamp.toDate) {
                    const bookingDate = booking.timestamp.toDate();
                    if(bookingDate.getMonth() === date.getMonth() && 
                       bookingDate.getFullYear() === date.getFullYear()) {
                        monthBrokerage += booking.brokerage || 0;
                        monthQuantity += booking.qty || 0;
                    }
                }
            });
            
            brokerageData.push(monthBrokerage);
            quantityData.push(monthQuantity);
        }
    }
    
    return {
        labels,
        brokerage: brokerageData,
        quantity: quantityData
    };
}

// --- WHATSAPP FUNCTIONALITY ---
window.openWhatsAppModal = (bookingId) => {
    const booking = bookingsData.find(b => b.id === bookingId);
    if(!booking) return alert("Booking not found!");
    
    currentWhatsAppBooking = booking;
    
    // Get company details
    const fromCompany = companiesData.find(c => c.name === booking.from);
    const toCompany = companiesData.find(c => c.name === booking.to);
    
    if(!fromCompany || !toCompany) {
        return alert("Company details not found!");
    }
    
    // Set company names in modal
    document.getElementById('wa-from-name').innerText = `${booking.from} (${fromCompany.phone})`;
    document.getElementById('wa-to-name').innerText = `${booking.to} (${toCompany.phone})`;
    
    // Update template dropdown
    updateTemplateDropdown();
    
    // Generate preview
    updateWhatsAppPreview();
    
    document.getElementById('modal-whatsapp').style.display = 'flex';
};

window.closeWhatsAppModal = () => {
    document.getElementById('modal-whatsapp').style.display = 'none';
    currentWhatsAppBooking = null;
    document.getElementById('wa-template-select').value = '';
};

window.onTemplateChange = () => {
    updateWhatsAppPreview();
};

function updateTemplateDropdown() {
    const select = document.getElementById('wa-template-select');
    if(!select) return;
    
    const opts = templatesData.map(t => 
        `<option value="${t.id}">${t.name} (${t.type})</option>`
    ).join('');
    
    select.innerHTML = `<option value="">Default Template</option>` + opts;
}

function replaceVariables(template, booking, company, isFrom) {
    const date = booking.timestamp && booking.timestamp.toDate ? 
                 booking.timestamp.toDate().toLocaleDateString('en-IN') : 'N/A';
    
    return template
        .replace(/{companyName}/g, company.name)
        .replace(/{clientName}/g, company.client)
        .replace(/{grain}/g, booking.grain)
        .replace(/{quantity}/g, booking.qty)
        .replace(/{price}/g, booking.price)
        .replace(/{brokerage%}/g, booking.perc)
        .replace(/{brokerageAmount}/g, booking.brokerage.toFixed(2))
        .replace(/{fromCompany}/g, booking.from)
        .replace(/{toCompany}/g, booking.to)
        .replace(/{date}/g, date);
}

function updateWhatsAppPreview() {
    if(!currentWhatsAppBooking) return;
    
    const booking = currentWhatsAppBooking;
    const templateId = document.getElementById('wa-template-select').value;
    const date = booking.timestamp && booking.timestamp.toDate ? 
                 booking.timestamp.toDate().toLocaleDateString('en-IN') : 'N/A';
    
    let message;
    
    if(templateId) {
        const template = templatesData.find(t => t.id === templateId);
        if(template) {
            const fromCompany = companiesData.find(c => c.name === booking.from);
            message = replaceVariables(template.content, booking, fromCompany, true);
        }
    } else {
        // Default template
        message = `🌾 *Grain Booking Confirmation*

📦 *Grain Type:* ${booking.grain}
⚖️ *Quantity:* ${booking.qty} MT
💰 *Price:* ₹${booking.price}/MT
📊 *Brokerage:* ${booking.perc}% (₹${booking.brokerage.toFixed(2)})

📍 *From:* ${booking.from}
📍 *To:* ${booking.to}
📅 *Date:* ${date}

Thank you for your business!
_GrainBroker Pro_`;
    }
    
    document.getElementById('wa-preview').innerText = message;
}

window.sendWhatsAppMessages = () => {
    if(!currentWhatsAppBooking) return;
    
    const booking = currentWhatsAppBooking;
    const sendToFrom = document.getElementById('wa-from').checked;
    const sendToTo = document.getElementById('wa-to').checked;
    
    if(!sendToFrom && !sendToTo) {
        return alert("Please select at least one recipient!");
    }
    
    const fromCompany = companiesData.find(c => c.name === booking.from);
    const toCompany = companiesData.find(c => c.name === booking.to);
    const templateId = document.getElementById('wa-template-select').value;
    const date = booking.timestamp && booking.timestamp.toDate ? 
                 booking.timestamp.toDate().toLocaleDateString('en-IN') : 'N/A';
    
    let messageFrom, messageTo;
    
    if(templateId) {
        const template = templatesData.find(t => t.id === templateId);
        if(template) {
            if(template.type === 'both') {
                messageFrom = replaceVariables(template.content, booking, fromCompany, true);
                messageTo = replaceVariables(template.content, booking, toCompany, false);
            } else if(template.type === 'sender') {
                messageFrom = replaceVariables(template.content, booking, fromCompany, true);
                messageTo = getDefaultToMessage(booking, toCompany, date);
            } else {
                messageFrom = getDefaultFromMessage(booking, fromCompany, date);
                messageTo = replaceVariables(template.content, booking, toCompany, false);
            }
        }
    } else {
        messageFrom = getDefaultFromMessage(booking, fromCompany, date);
        messageTo = getDefaultToMessage(booking, toCompany, date);
    }
    
    // Send messages sequentially with proper delay
    let sentCount = 0;
    
    if(sendToFrom) {
        const phoneFrom = fromCompany.phone.replace(/[^0-9]/g, '');
        const urlFrom = `https://wa.me/91${phoneFrom}?text=${encodeURIComponent(messageFrom)}`;
        window.open(urlFrom, '_blank');
        sentCount++;
    }
    
    if(sendToTo) {
        setTimeout(() => {
            const phoneTo = toCompany.phone.replace(/[^0-9]/g, '');
            const urlTo = `https://wa.me/91${phoneTo}?text=${encodeURIComponent(messageTo)}`;
            window.open(urlTo, '_blank');
        }, sendToFrom ? 2000 : 0); // 2 second delay if sending both
        sentCount++;
    }
    
    window.closeWhatsAppModal();
    
    if(sentCount === 2) {
        alert("Opening 2 WhatsApp chats - one for sender and one for receiver. Please send each message separately!");
    } else {
        alert("WhatsApp opened! Please send the message.");
    }
};

function getDefaultFromMessage(booking, fromCompany, date) {
    return `🌾 *Grain Booking Confirmation*

Dear ${fromCompany.client},

Your booking details:
📦 *Grain:* ${booking.grain}
⚖️ *Quantity:* ${booking.qty} MT
💰 *Price:* ₹${booking.price}/MT
📊 *Brokerage:* ${booking.perc}% (₹${booking.brokerage.toFixed(2)})

📍 *Delivering To:* ${booking.to}
📅 *Date:* ${date}

Thank you for choosing our services!
_GrainBroker Pro_`;
}

function getDefaultToMessage(booking, toCompany, date) {
    return `🌾 *Grain Delivery Notification*

Dear ${toCompany.client},

Incoming grain delivery:
📦 *Grain:* ${booking.grain}
⚖️ *Quantity:* ${booking.qty} MT
💰 *Price:* ₹${booking.price}/MT
📊 *Brokerage:* ${booking.perc}% (₹${booking.brokerage.toFixed(2)})

📍 *From:* ${booking.from}
📅 *Date:* ${date}

Please prepare for receiving the shipment.
_GrainBroker Pro_`;
}

// --- TEMPLATE MANAGEMENT ---
function renderTemplates() {
    const list = document.getElementById('templates-list');
    if(!list) return;
    
    if(templatesData.length === 0) { 
        list.innerHTML = `<div class="empty-state">No templates yet. Create your first one!</div>`; 
        return; 
    }
    
    list.innerHTML = templatesData.map(t => `<div class="card">
        <div style="display:flex; justify-content:space-between; align-items:start;">
            <div style="flex: 1;">
                <strong>${t.name}</strong>
                <span style="background: var(--primary); color: white; padding: 2px 8px; border-radius: 6px; font-size: 11px; margin-left: 8px;">
                    ${t.type === 'sender' ? 'Sender' : t.type === 'receiver' ? 'Receiver' : 'Both'}
                </span>
                <pre style="margin: 10px 0; padding: 10px; background: #f8fafc; border-radius: 8px; font-size: 13px; white-space: pre-wrap; overflow-x: auto;">${t.content}</pre>
            </div>
            <div class="action-links">
                <span class="edit-link" onclick="window.editTemplate('${t.id}')">Edit</span>
                <span class="delete-link" onclick="window.deleteTemplate('${t.id}')">Delete</span>
            </div>
        </div>
    </div>`).join('');
}

window.showTemplateModal = () => {
    editTemplateId = null;
    document.getElementById('template-modal-title').innerText = "Create Template";
    document.getElementById('template-name').value = "";
    document.getElementById('template-type').value = "sender";
    document.getElementById('template-content').value = "";
    document.getElementById('modal-template').style.display = 'flex';
};

window.closeTemplateModal = () => {
    document.getElementById('modal-template').style.display = 'none';
    editTemplateId = null;
};

window.saveTemplate = async () => {
    const name = document.getElementById('template-name').value.trim();
    const type = document.getElementById('template-type').value;
    const content = document.getElementById('template-content').value.trim();
    
    if(!name || !content) return alert("Please fill all fields!");
    
    const data = { 
        name, type, content, 
        updatedAt: serverTimestamp(),
        userId: auth.currentUser.uid 
    };
    
    try {
        if(editTemplateId) {
            await updateDoc(doc(db, "templates", editTemplateId), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "templates"), data);
        }
        window.closeTemplateModal();
    } catch(e) {
        alert("Error: " + e.message);
    }
};

window.editTemplate = (id) => {
    const template = templatesData.find(t => t.id === id);
    if(!template) return;
    
    editTemplateId = id;
    document.getElementById('template-modal-title').innerText = "Edit Template";
    document.getElementById('template-name').value = template.name;
    document.getElementById('template-type').value = template.type;
    document.getElementById('template-content').value = template.content;
    document.getElementById('modal-template').style.display = 'flex';
};

window.deleteTemplate = (id) => {
    deleteTemplateTargetId = id;
    document.getElementById('modal-confirm-template').style.display = 'flex';
};

window.confirmDeleteTemplate = async () => {
    if(deleteTemplateTargetId) {
        try {
            await deleteDoc(doc(db, "templates", deleteTemplateTargetId));
            window.closeConfirmTemplateModal();
        } catch(e) {
            alert("Error: " + e.message);
        }
    }
};

window.closeConfirmTemplateModal = () => {
    deleteTemplateTargetId = null;
    document.getElementById('modal-confirm-template').style.display = 'none';
};

// Update preview when checkboxes change
document.addEventListener('change', (e) => {
    if(e.target.id === 'wa-from' || e.target.id === 'wa-to') {
        updateWhatsAppPreview();
    }
});

// --- EXPORTS ---
window.exportBookings = () => {
    if(bookingsData.length === 0) {
        alert("No data to export!");
        return;
    }
    
    const exportData = bookingsData.map(booking => ({
        'Grain': booking.grain,
        'Quantity (MT)': booking.qty,
        'Price (₹)': booking.price,
        'Brokerage %': booking.perc,
        'Brokerage Amount (₹)': booking.brokerage ? booking.brokerage.toFixed(2) : 0,
        'From': booking.from,
        'To': booking.to,
        'Date': booking.timestamp && booking.timestamp.toDate ? 
                booking.timestamp.toDate().toLocaleDateString('en-IN') : 'N/A'
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bookings");
    XLSX.writeFile(wb, `Grain_Bookings_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.xlsx`);
};

window.downloadReport = () => {
    const reportContainer = document.getElementById('report-container');
    html2canvas(reportContainer, {
        backgroundColor: '#ffffff',
        scale: 2
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `GrainBroker_Report_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
};

// --- BINDINGS ---
document.getElementById('btn-login').addEventListener('click', window.handleLogin);
document.getElementById('btn-signup').addEventListener('click', window.handleSignup);
document.getElementById('btn-reset').addEventListener('click', window.handleReset);

// --- AI INSIGHTS ---
window.getSmartInsights = async () => {
    const contentDiv = document.getElementById('smart-insights-content');
    const btn = document.getElementById('smart-ai-btn');
    const btnText = document.getElementById('smart-ai-btn-text');
    
    // Minimum data requirement
    if (bookingsData.length < 3) {
        contentDiv.innerHTML = `
            <div class="no-data-message">
                <p style="font-size: 20px; margin-bottom: 10px;">📊</p>
                <strong>Need More Data</strong>
                <p style="margin-top: 8px;">Add at least 3 bookings to unlock AI-powered predictions.</p>
                <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">
                    Current bookings: ${bookingsData.length}/3
                </p>
            </div>
        `;
        return;
    }
    
    // Show loading state
    btn.disabled = true;
    btnText.textContent = '⏳ Analyzing...';
    contentDiv.innerHTML = `
        <div class="ai-loading">
            <div class="ai-spinner"></div>
            <p style="color: #059669; font-weight: 600;">Analyzing booking patterns...</p>
            <p style="font-size: 13px; color: #64748b; margin-top: 5px;">
                Processing ${bookingsData.length} bookings
            </p>
        </div>
    `;
    
    // Simulate AI processing delay for better UX
    await new Promise(resolve => setTimeout(resolve, 800));
    
    try {
        const predictions = analyzeBookingPatterns();
        displaySmartInsights(predictions);
    } catch (error) {
        console.error('Smart Insights Error:', error);
        contentDiv.innerHTML = `
            <div class="no-data-message">
                <p style="font-size: 20px; margin-bottom: 10px;">⚠️</p>
                <strong>Analysis Error</strong>
                <p style="margin-top: 8px;">Unable to generate predictions. Please try again.</p>
            </div>
        `;
    }
    
    // Reset button
    btn.disabled = false;
    btnText.textContent = '🔄 Refresh';
};

function analyzeBookingPatterns() {
    const now = new Date();
    const currentDay = now.getDay(); // 0-6 (Sunday-Saturday)
    const currentMonth = now.getMonth();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Company-Grain combination analysis
    const companyGrainStats = {};
    
    bookingsData.forEach(booking => {
        const bookingDate = booking.timestamp?.toDate ? booking.timestamp.toDate() : null;
        
        // Analyze both 'from' and 'to' companies
        [booking.from, booking.to].forEach(companyName => {
            if (!companyName || !booking.grain) return;
            
            const key = `${companyName}|||${booking.grain}`;
            
            if (!companyGrainStats[key]) {
                companyGrainStats[key] = {
                    company: companyName,
                    grain: booking.grain,
                    bookings: [],
                    dayOfWeekCount: Array(7).fill(0),
                    monthlyCount: Array(12).fill(0),
                    totalQuantity: 0,
                    totalBrokerage: 0,
                    lastBookingDate: null
                };
            }
            
            const stats = companyGrainStats[key];
            stats.bookings.push(booking);
            stats.totalQuantity += booking.qty || 0;
            stats.totalBrokerage += (booking.brokerage || 0) / 2; // Divided by 2 since company appears in both from/to
            
            if (bookingDate) {
                stats.dayOfWeekCount[bookingDate.getDay()]++;
                stats.monthlyCount[bookingDate.getMonth()]++;
                
                if (!stats.lastBookingDate || bookingDate > stats.lastBookingDate) {
                    stats.lastBookingDate = bookingDate;
                }
            }
        });
    });
    
    // Calculate confidence scores for each company-grain combination
    const predictions = Object.values(companyGrainStats).map(stats => {
        let confidenceScore = 0;
        let reasons = [];
        
        // 1. Day-of-Week Patterns (30% weight)
        const todayBookings = stats.dayOfWeekCount[currentDay];
        const avgDayBookings = stats.bookings.length / 7;
        const dayScore = Math.min((todayBookings / (avgDayBookings || 1)) * 30, 30);
        confidenceScore += dayScore;
        
        if (todayBookings > 0) {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            reasons.push(`Frequently books on ${days[currentDay]}s`);
        }
        
        // 2. Recent Activity (30% weight)
        let recencyScore = 0;
        let daysSinceLastBooking = null;
        
        if (stats.lastBookingDate) {
            daysSinceLastBooking = Math.floor((now - stats.lastBookingDate) / (1000 * 60 * 60 * 24));
            
            if (daysSinceLastBooking <= 7) {
                recencyScore = 30;
                reasons.push(`Recent booking ${daysSinceLastBooking} day${daysSinceLastBooking !== 1 ? 's' : ''} ago`);
            } else if (daysSinceLastBooking <= 14) {
                recencyScore = 20;
                reasons.push(`Last booking ${daysSinceLastBooking} days ago`);
            } else if (daysSinceLastBooking <= 30) {
                recencyScore = 10;
                reasons.push(`Last booking ${daysSinceLastBooking} days ago`);
            }
        }
        confidenceScore += recencyScore;
        
        // 3. Monthly Patterns (20% weight)
        const currentMonthBookings = stats.monthlyCount[currentMonth];
        const monthScore = Math.min((currentMonthBookings / stats.bookings.length) * 20, 20);
        confidenceScore += monthScore;
        
        if (currentMonthBookings > 0) {
            reasons.push(`${currentMonthBookings} booking${currentMonthBookings !== 1 ? 's' : ''} this month`);
        }
        
        // 4. Booking Frequency (20% weight)
        const frequencyScore = Math.min((stats.bookings.length / bookingsData.length) * 20, 20);
        confidenceScore += frequencyScore;
        
        reasons.push(`${stats.bookings.length} total booking${stats.bookings.length !== 1 ? 's' : ''}`);
        
        // Calculate averages
        const avgQuantity = stats.totalQuantity / stats.bookings.length;
        const avgBrokerage = stats.totalBrokerage / stats.bookings.length;
        
        return {
            company: stats.company,
            grain: stats.grain,
            confidence: Math.round(confidenceScore),
            reasons: reasons,
            totalBookings: stats.bookings.length,
            daysSinceLastBooking,
            avgQuantity: Math.round(avgQuantity),
            avgBrokerage: Math.round(avgBrokerage),
            todayBookings,
            recentBookings: stats.bookings.filter(b => {
                const date = b.timestamp?.toDate ? b.timestamp.toDate() : null;
                return date && date >= thirtyDaysAgo;
            }).length
        };
    });
    
    // Filter predictions with confidence >= 40% and sort by confidence
    const validPredictions = predictions
        .filter(p => p.confidence >= 40)
        .sort((a, b) => {
            // Sort by confidence, then by recency, then by frequency
            if (b.confidence !== a.confidence) return b.confidence - a.confidence;
            if (a.daysSinceLastBooking !== b.daysSinceLastBooking) {
                return (a.daysSinceLastBooking || 999) - (b.daysSinceLastBooking || 999);
            }
            return b.totalBookings - a.totalBookings;
        })
        .slice(0, 3); // Top 3 predictions
    
    return validPredictions;
}

function displaySmartInsights(predictions) {
    const contentDiv = document.getElementById('smart-insights-content');
    
    if (predictions.length === 0) {
        contentDiv.innerHTML = `
            <div class="no-data-message">
                <p style="font-size: 20px; margin-bottom: 10px;">🔍</p>
                <strong>No Strong Patterns Found</strong>
                <p style="margin-top: 8px;">
                    No companies meet the confidence threshold (40%+) for today.
                </p>
                <p style="font-size: 13px; color: #64748b; margin-top: 8px;">
                    Add more bookings to improve prediction accuracy.
                </p>
            </div>
        `;
        return;
    }
    
    const today = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    let html = `
        <div style="margin-bottom: 20px; padding: 12px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 8px; border-left: 4px solid #10b981;">
            <div style="font-weight: 700; color: #059669; margin-bottom: 5px;">
                📅 ${days[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}
            </div>
            <div style="font-size: 13px; color: #065f46;">
                Based on your historical booking patterns, here are the top predictions:
            </div>
        </div>
    `;
    
    predictions.forEach((prediction, index) => {
        const confidenceLevel = prediction.confidence >= 70 ? 'high' :
                               prediction.confidence >= 50 ? 'medium' : 'low';
        const confidenceText = prediction.confidence >= 70 ? 'High Confidence' :
                              prediction.confidence >= 50 ? 'Medium Confidence' : 'Low Confidence';
        const medalEmoji = ['🥇', '🥈', '🥉'][index] || '🎯';
        
        html += `
            <div class="insight-card">
                <div class="insight-header">
                    <div>
                        <span style="font-size: 20px; margin-right: 8px;">${medalEmoji}</span>
                        <span class="company-name">${prediction.company}</span>
                    </div>
                    <span class="confidence-badge confidence-${confidenceLevel}">
                        ${confidenceText} ${prediction.confidence}%
                    </span>
                </div>
                
                <div class="grain-info">
                    🌾 Grain: ${prediction.grain}
                </div>
                
                <div class="insight-details">
                    📊 ${prediction.reasons.join('. ')}.
                </div>
                
                <div class="insight-metrics">
                    💡 <strong>Historical Averages:</strong><br>
                    <div style="margin-top: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div>📦 Avg Quantity: <strong>${prediction.avgQuantity.toLocaleString()} MT</strong></div>
                        <div>💰 Avg Brokerage: <strong>₹${prediction.avgBrokerage.toLocaleString('en-IN')}</strong></div>
                    </div>
                </div>
            </div>
        `;
    });
    
    // Add footer with methodology
    html += `
        <div style="margin-top: 20px; padding: 12px; background: #f8fafc; border-radius: 8px; font-size: 12px; color: #64748b; border: 1px solid #e2e8f0;">
            <strong style="color: #475569;">📈 Analysis Methodology:</strong><br>
            <div style="margin-top: 6px; line-height: 1.6;">
                • Day-of-Week Patterns (30%)<br>
                • Recent Activity (30%)<br>
                • Monthly Patterns (20%)<br>
                • Booking Frequency (20%)
            </div>
        </div>
    `;
    
    contentDiv.innerHTML = html;
}

window.getAIInsights = async () => {
    const contentDiv = document.getElementById('ai-insights-content');
    const btn = document.getElementById('ai-analyze-btn');
    const btnText = document.getElementById('ai-btn-text');
    
    if (bookingsData.length === 0) {
        contentDiv.innerHTML = `
            <p style="color: #f59e0b; text-align: center; padding: 20px;">
                ⚠️ No booking data available. Add some bookings to get AI insights.
            </p>
        `;
        return;
    }
    
    // Show loading state
    btn.disabled = true;
    btnText.textContent = '⏳ Analyzing...';
    contentDiv.innerHTML = `
        <div class="ai-loading">
            <div class="ai-spinner"></div>
            <p>AI is analyzing your business data...</p>
        </div>
    `;
    
    try {
        // Analyze booking data locally
        const insights = analyzeBookingData();
        
        // Prepare data for AI
        const prompt = `You are a senior business analytics expert specializing in grain trading and brokerage business. Analyze the following business data and provide actionable insights.

Business Summary:
- Total Bookings: ${insights.totalBookings}
- Total Brokerage: ₹${insights.totalBrokerage.toLocaleString('en-IN')}
- Total Volume: ${insights.totalQuantity} MT
- Active Companies: ${insights.uniqueCompanies.length}

Top Performing Companies (by frequency):
${insights.topCompanies.map((c, i) => `${i + 1}. ${c.name}: ${c.count} bookings, ₹${c.brokerage.toFixed(2)} brokerage`).join('\n')}

Recent Activity (Last 7 days):
- Bookings: ${insights.recentBookings}
- Most Active: ${insights.mostActiveRecent}

Day of Week Pattern:
${insights.dayPattern.map(d => `${d.day}: ${d.count} bookings`).join(', ')}

Based on this data, provide:
1. Which company has the highest probability to work today and why (2-3 sentences)
2. Top 3 business recommendations (brief, actionable points)
3. One key trend or pattern you notice

Keep the response concise, professional, and focused on actionable insights for a grain broker.`;

        // Call free AI API (Using Hugging Face Inference API - no auth required for public models)
        const aiResponse = await callFreeAI(prompt);
        
        // Display results
        displayAIInsights(insights, aiResponse);
        
    } catch (error) {
        console.error('AI Analysis Error:', error);
        
        // Fallback to local analysis if AI fails
        const insights = analyzeBookingData();
        displayLocalInsights(insights);
    }
    
    // Reset button
    btn.disabled = false;
    btnText.textContent = '🔄 Refresh';
};

function analyzeBookingData() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Calculate company statistics
    const companyStats = {};
    let totalBrokerage = 0;
    let totalQuantity = 0;
    let recentBookings = 0;
    const dayOfWeekCount = Array(7).fill(0);
    
    bookingsData.forEach(booking => {
        totalBrokerage += booking.brokerage || 0;
        totalQuantity += booking.qty || 0;
        
        const bookingDate = booking.timestamp?.toDate ? booking.timestamp.toDate() : null;
        
        if (bookingDate) {
            // Count recent bookings
            if (bookingDate >= sevenDaysAgo) {
                recentBookings++;
            }
            
            // Day of week pattern (within last 30 days)
            if (bookingDate >= thirtyDaysAgo) {
                dayOfWeekCount[bookingDate.getDay()]++;
            }
        }
        
        // Track company statistics
        [booking.from, booking.to].forEach(company => {
            if (company) {
                if (!companyStats[company]) {
                    companyStats[company] = {
                        name: company,
                        count: 0,
                        brokerage: 0,
                        recentCount: 0,
                        lastBooking: null
                    };
                }
                companyStats[company].count++;
                companyStats[company].brokerage += (booking.brokerage || 0) / 2;
                
                if (bookingDate) {
                    if (bookingDate >= sevenDaysAgo) {
                        companyStats[company].recentCount++;
                    }
                    if (!companyStats[company].lastBooking || bookingDate > companyStats[company].lastBooking) {
                        companyStats[company].lastBooking = bookingDate;
                    }
                }
            }
        });
    });
    
    // Sort companies by various metrics
    const companiesByFrequency = Object.values(companyStats).sort((a, b) => b.count - a.count);
    const companiesByRecent = Object.values(companyStats).sort((a, b) => b.recentCount - a.recentCount);
    const companiesByBrokerage = Object.values(companyStats).sort((a, b) => b.brokerage - a.brokerage);
    
    // Day of week pattern
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayPattern = dayOfWeekCount.map((count, index) => ({
        day: days[index],
        count: count
    })).sort((a, b) => b.count - a.count);
    
    const today = days[now.getDay()];
    const todayPattern = dayOfWeekCount[now.getDay()];
    
    return {
        totalBookings: bookingsData.length,
        totalBrokerage,
        totalQuantity,
        uniqueCompanies: Object.keys(companyStats),
        topCompanies: companiesByFrequency.slice(0, 5),
        recentBookings,
        mostActiveRecent: companiesByRecent[0]?.name || 'N/A',
        dayPattern: dayPattern.slice(0, 3),
        today,
        todayPattern,
        companiesByFrequency,
        companiesByRecent,
        companiesByBrokerage
    };
}

async function callFreeAI(prompt) {
    try {
        // Using a simpler, more reliable free API approach
        // We'll use Hugging Face's free inference API with a public model
        const response = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 500,
                    temperature: 0.7,
                    top_p: 0.95,
                    return_full_text: false
                }
            })
        });
        
        if (!response.ok) {
            throw new Error('AI service unavailable');
        }
        
        const data = await response.json();
        return data[0]?.generated_text || null;
    } catch (error) {
        console.error('AI API Error:', error);
        return null;
    }
}

function displayAIInsights(insights, aiResponse) {
    const contentDiv = document.getElementById('ai-insights-content');
    
    let html = `
        <div class="insight-section">
            <strong>🎯 AI-Powered Recommendation</strong>
            ${aiResponse ? `<p>${aiResponse}</p>` : ''}
        </div>
    `;
    
    // Top company prediction
    const topCompany = predictTopCompany(insights);
    html += `
        <div class="company-highlight">
            <strong>🏆 Highest Probability Today (${insights.today})</strong>
            <p style="margin: 8px 0 0 0;">
                <strong style="font-size: 18px;">${topCompany.name}</strong><br>
                <small style="color: #64748b;">
                    • ${topCompany.count} total bookings<br>
                    • ${topCompany.recentCount} bookings this week<br>
                    • ₹${topCompany.brokerage.toFixed(2)} total brokerage<br>
                    • ${topCompany.reason}
                </small>
            </p>
        </div>
    `;
    
    // Top 3 companies
    html += `
        <div style="margin-top: 15px;">
            <strong>📊 Top Performing Companies</strong>
            <ul style="margin-top: 10px;">
    `;
    
    insights.topCompanies.slice(0, 3).forEach((company, index) => {
        const emoji = ['🥇', '🥈', '🥉'][index];
        html += `
            <li>
                ${emoji} <strong>${company.name}</strong> - ${company.count} bookings, ₹${company.brokerage.toFixed(2)} brokerage
            </li>
        `;
    });
    
    html += `
            </ul>
        </div>
    `;
    
    // Quick stats
    html += `
        <div style="margin-top: 15px; padding: 12px; background: #f1f5f9; border-radius: 8px;">
            <strong>📈 Quick Stats</strong>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; font-size: 14px;">
                <div>📦 Last 7 Days: <strong>${insights.recentBookings}</strong> bookings</div>
                <div>🏢 Active Companies: <strong>${insights.uniqueCompanies.length}</strong></div>
                <div>📅 Best Day: <strong>${insights.dayPattern[0]?.day}</strong></div>
                <div>💰 Avg/Booking: <strong>₹${(insights.totalBrokerage / insights.totalBookings).toFixed(2)}</strong></div>
            </div>
        </div>
    `;
    
    contentDiv.innerHTML = html;
}

function displayLocalInsights(insights) {
    const contentDiv = document.getElementById('ai-insights-content');
    
    const topCompany = predictTopCompany(insights);
    
    let html = `
        <div class="company-highlight">
            <strong>🏆 Highest Probability Today (${insights.today})</strong>
            <p style="margin: 8px 0 0 0;">
                <strong style="font-size: 18px;">${topCompany.name}</strong><br>
                <small style="color: #64748b;">
                    • ${topCompany.count} total bookings<br>
                    • ${topCompany.recentCount} bookings this week<br>
                    • ₹${topCompany.brokerage.toFixed(2)} total brokerage<br>
                    • ${topCompany.reason}
                </small>
            </p>
        </div>
    `;
    
    html += `
        <div style="margin-top: 15px;">
            <strong>📊 Top Performing Companies</strong>
            <ul style="margin-top: 10px;">
    `;
    
    insights.topCompanies.slice(0, 3).forEach((company, index) => {
        const emoji = ['🥇', '🥈', '🥉'][index];
        html += `
            <li>
                ${emoji} <strong>${company.name}</strong> - ${company.count} bookings, ₹${company.brokerage.toFixed(2)} brokerage
            </li>
        `;
    });
    
    html += `
            </ul>
        </div>
    `;
    
    // Recommendations
    html += `
        <div class="insight-section">
            <strong>💡 Business Recommendations</strong>
            <ul style="margin-top: 8px;">
                <li><strong>Focus on ${topCompany.name}</strong> - They show the highest engagement and recent activity</li>
                <li><strong>Best Day: ${insights.dayPattern[0]?.day}</strong> - ${insights.dayPattern[0]?.count} bookings historically</li>
                <li><strong>Recent Trend:</strong> ${insights.recentBookings} bookings in the last 7 days</li>
            </ul>
        </div>
    `;
    
    html += `
        <div style="margin-top: 15px; padding: 12px; background: #f1f5f9; border-radius: 8px;">
            <strong>📈 Quick Stats</strong>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; font-size: 14px;">
                <div>📦 Last 7 Days: <strong>${insights.recentBookings}</strong> bookings</div>
                <div>🏢 Active Companies: <strong>${insights.uniqueCompanies.length}</strong></div>
                <div>📅 Best Day: <strong>${insights.dayPattern[0]?.day}</strong></div>
                <div>💰 Avg/Booking: <strong>₹${(insights.totalBrokerage / insights.totalBookings).toFixed(2)}</strong></div>
            </div>
        </div>
    `;
    
    contentDiv.innerHTML = html;
}

function predictTopCompany(insights) {
    // Weighted scoring algorithm
    const scores = {};
    
    insights.companiesByFrequency.forEach(company => {
        const frequencyScore = company.count * 2;
        const recentScore = company.recentCount * 5;
        const brokerageScore = (company.brokerage / insights.totalBrokerage) * 100;
        
        // Days since last booking
        let recencyScore = 0;
        if (company.lastBooking) {
            const daysSince = Math.floor((new Date() - company.lastBooking) / (1000 * 60 * 60 * 24));
            recencyScore = Math.max(0, 10 - daysSince);
        }
        
        // Calculate day of week match
        const todayScore = insights.today;
        let dayMatchScore = 0;
        
        // Check if company is active on similar days
        bookingsData.forEach(booking => {
            if ((booking.from === company.name || booking.to === company.name) && booking.timestamp?.toDate) {
                const bookingDay = booking.timestamp.toDate().getDay();
                if (bookingDay === new Date().getDay()) {
                    dayMatchScore += 3;
                }
            }
        });
        
        scores[company.name] = {
            ...company,
            totalScore: frequencyScore + recentScore + brokerageScore + recencyScore + dayMatchScore,
            breakdown: { frequencyScore, recentScore, brokerageScore, recencyScore, dayMatchScore }
        };
    });
    
    // Get top company
    const topCompany = Object.values(scores).sort((a, b) => b.totalScore - a.totalScore)[0];
    
    // Generate reason
    let reason = '';
    if (topCompany.recentCount > 0) {
        reason = `Most active recently with ${topCompany.recentCount} booking(s) this week`;
    } else if (topCompany.count > insights.topCompanies[0]?.count * 0.8) {
        reason = `Highest overall booking frequency`;
    } else {
        reason = `Strong historical performance and engagement`;
    }
    
    return { ...topCompany, reason };
}

// --- MODAL BINDINGS ---
window.showCompanyModal = () => {
    editCompanyId = null;
    document.getElementById('company-modal-title').innerText = "Add New Company";
    ['comp-name', 'comp-phone', 'comp-client', 'comp-state'].forEach(id => document.getElementById(id).value = "");
    document.getElementById('modal-company').style.display = 'flex';
};
window.closeCompanyModal = () => document.getElementById('modal-company').style.display = 'none';

window.showBookingModal = () => {
    editBookingId = null;
    document.getElementById('booking-modal-title').innerText = "New Booking";
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('book-date').value = today;
    
    ['book-grain', 'book-qty', 'book-price', 'book-perc', 'book-from', 'book-to'].forEach(id => document.getElementById(id).value = "");
    document.getElementById('modal-booking').style.display = 'flex';
};
window.closeBookingModal = () => {
    document.getElementById('modal-booking').style.display = 'none';
    editBookingId = null;
};
