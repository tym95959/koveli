import { staffList } from './staff.js';

// ========== FIREBASE ==========
let db = null;
let firebaseConnected = false;
let allRequestsCache = [];
let staffData = [];
let currentLoggedInStaff = null;
let pendingAuthResolve = null;
let pendingAuth = { staff: null, viewType: null, selectEl: null, prevDropdownValue: null };
let staffLoaded = false;
let isStaffLoading = false;
let searchTimeout = null;
let isDropdownOpen = false;

// ========== FIREBASE INITIALIZATION ==========
function initFirebase() {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
        try {
            db = firebase.firestore();
            firebaseConnected = true;
            console.log("✅ Firebase connected");
            return true;
        } catch (error) { 
            console.error("Firestore error:", error);
            return false;
        }
    }
    return false;
}

// ========== PERSISTENT LOGIN ==========
const STORAGE_KEY = 'dutyChangeLoggedInStaff';

function saveLoggedInStaff(staff) {
    if (staff) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            id: staff.id,
            name: staff.name,
            role: staff.role,
            rcno: staff.rcno
        }));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

function getLoggedInStaff() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            if (staffData.length > 0) {
                return staffData.find(s => s.id === parsed.id) || null;
            }
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

// ========== STAFF DATA FROM FIREBASE (LAZY LOAD) ==========
async function loadStaffFromFirebase(searchTerm = '') {
    if (!db || !firebaseConnected) {
        console.warn('Firebase not connected');
        return [];
    }

    if (isStaffLoading) {
        console.log('⏳ Staff already loading...');
        return [];
    }

    if (searchTerm.length < 2) {
        staffData = [];
        staffLoaded = false;
        return [];
    }

    isStaffLoading = true;

    try {
        const term = searchTerm.toLowerCase().trim();
        console.log(`🔍 Searching for: "${term}"`);

        const snapshot = await db.collection('staff').get();

        if (snapshot.empty) {
            console.log('📭 No staff found in Firebase');
            isStaffLoading = false;
            return [];
        }

        const allStaff = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            allStaff.push({
                id: doc.id,
                name: data.name || '',
                role: data.role || 'Staff',
                contact: data.contact || '',
                rcno: data.rcno || doc.id,
                pass: data.pass || '',
                pattern: data.pattern || '',
                email: data.email || ''
            });
        });

        const filtered = allStaff.filter(s =>
            s.name.toLowerCase().includes(term) ||
            s.rcno.toString().includes(term)
        );

        staffData = filtered;
        staffLoaded = true;
        console.log(`📋 Found ${staffData.length} staff matching "${term}"`);
        return staffData;

    } catch (e) {
        console.error('❌ Error loading staff:', e);
        return [];
    } finally {
        isStaffLoading = false;
    }
}

// ========== LOAD ALL STAFF (for already logged in user) ==========
async function loadStaffForLoggedInUser() {
    if (!db || !firebaseConnected) return false;

    try {
        const snapshot = await db.collection('staff').get();
        const allStaff = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            allStaff.push({
                id: doc.id,
                name: data.name || '',
                role: data.role || 'Staff',
                contact: data.contact || '',
                rcno: data.rcno || doc.id,
                pass: data.pass || '',
                pattern: data.pattern || '',
                email: data.email || ''
            });
        });
        staffData = allStaff;
        staffLoaded = true;
        console.log(`📋 Loaded ${staffData.length} staff for logged in user`);
        return true;
    } catch (e) {
        console.error('❌ Error loading staff:', e);
        return false;
    }
}

function getStaffById(id) {
    return staffData.find(s => s.id === id);
}

function getStaffEmail(staffId) {
    const staff = getStaffById(staffId);
    if (!staff) return null;
    return staff.email || `${staff.name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
}

function getAdminEmail() {
    const admin = staffData.find(s => s.role === 'Admin');
    return admin?.email || 'admin@example.com';
}

// ========== LOAD SPECIFIC STAFF CREDENTIALS ==========
async function loadSpecificStaffCredentials(staffId) {
    if (!db || !firebaseConnected) return false;
    try {
        const doc = await db.collection('staff').doc(staffId).get();
        if (doc.exists) {
            const data = doc.data();
            const staff = staffData.find(s => s.id === staffId);
            if (staff) {
                staff.pass = data.pass || '';
                staff.pattern = data.pattern || '';
                staff.email = data.email || staff.email || '';
            }
            return true;
        }
        return false;
    } catch (e) {
        console.warn('Load staff credentials error:', e);
        return false;
    }
}

async function syncStaffToFirebase(staff) {
    if (!db || !firebaseConnected) return false;
    try {
        await db.collection('staff').doc(staff.id).set({
            id: staff.id,
            name: staff.name,
            role: staff.role,
            contact: staff.contact || '',
            rcno: staff.rcno || '',
            pass: staff.pass || '',
            pattern: staff.pattern || '',
            email: staff.email || '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
    } catch (e) {
        console.warn('Sync error:', e);
        return false;
    }
}

// ========== HELPER FUNCTIONS ==========
function isOffDuty(duty) {
    return duty && duty.includes('Off Duty');
}

function getMonthHalf(dateStr) {
    if (!dateStr) return 'first';
    const day = parseInt(dateStr.split('-')[2]);
    return day <= 15 ? 'first' : 'second';
}

function getCurrentMonthHalf() {
    const today = new Date();
    const day = today.getDate();
    return day <= 15 ? 'first' : 'second';
}

function getDutyBadgeClass(duty) {
    if (!duty) return '';
    if (duty.includes('Morning 1')) return 'duty-morning1';
    if (duty.includes('Morning 2')) return 'duty-morning2';
    if (duty.includes('Afternoon 1')) return 'duty-afternoon1';
    if (duty.includes('Afternoon 2')) return 'duty-afternoon2';
    if (duty.includes('Night')) return 'duty-night';
    if (duty.includes('Off')) return 'duty-off';
    return '';
}

function isCurrentPeriod(dateStr) {
    if (!dateStr) return false;
    const requestHalf = getMonthHalf(dateStr);
    const currentHalf = getCurrentMonthHalf();
    return requestHalf === currentHalf;
}

// ========== DUTY CHANGE FIRESTORE ==========
async function saveDutyChangeRequest(request) {
    if (!db || !firebaseConnected) return false;
    try {
        const docId = `${request.requesterId}_${request.swapDate}_${Date.now()}`;
        await db.collection('dutyChanges').doc(docId).set({
            ...request,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Request saved:', request);
        return true;
    } catch (e) {
        console.error('Save error:', e);
        return false;
    }
}

async function loadDutyChangeRequests(filters = {}) {
    if (!db || !firebaseConnected) return [];
    try {
        let q = db.collection('dutyChanges');
        if (filters.requesterId) q = q.where('requesterId', '==', filters.requesterId);
        if (filters.acceptStaffId) q = q.where('acceptStaffId', '==', filters.acceptStaffId);
        if (filters.status) q = q.where('status', '==', filters.status);
        if (filters.swapDate) q = q.where('swapDate', '==', filters.swapDate);

        const snap = await q.get();
        const results = [];
        snap.forEach(doc => {
            const data = doc.data();
            results.push({ id: doc.id, ...data });
        });
        console.log('📄 Loaded', results.length, 'requests');
        return results;
    } catch (e) {
        console.warn('Load error:', e);
        return [];
    }
}

async function updateDutyChangeStatus(requestId, status) {
    if (!db || !firebaseConnected) return false;
    try {
        await db.collection('dutyChanges').doc(requestId).update({
            status: status,
            reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
            reviewedBy: currentLoggedInStaff?.name || 'System'
        });
        console.log('✅ Status updated to:', status);
        return true;
    } catch (e) {
        console.error('Update error:', e);
        return false;
    }
}

async function deleteDutyChange(requestId) {
    if (!db || !firebaseConnected) return false;
    try {
        await db.collection('dutyChanges').doc(requestId).delete();
        return true;
    } catch (e) {
        console.error('Delete error:', e);
        return false;
    }
}

// ========== ADMIN FUNCTIONS ==========
async function deleteAllDutyChanges() {
    if (!db || !firebaseConnected) return false;

    if (!currentLoggedInStaff || currentLoggedInStaff.role !== 'Admin') {
        showTemporaryFeedback('❌ Only Admins can delete all requests', true);
        return false;
    }

    if (!confirm('⚠️ Are you sure you want to delete ALL duty change requests? This action cannot be undone!')) {
        return false;
    }

    try {
        const snapshot = await db.collection('dutyChanges').get();
        if (snapshot.empty) {
            showTemporaryFeedback('ℹ️ No requests to delete');
            return false;
        }

        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        showTemporaryFeedback('✅ All duty change requests deleted successfully!');
        await loadAllData();
        return true;
    } catch (e) {
        console.error('Delete all error:', e);
        showTemporaryFeedback('❌ Failed to delete all requests', true);
        return false;
    }
}

// ========== LOADING POPUP FUNCTIONS ==========
function showLoadingPopup(title, subtitle) {
    const popup = document.getElementById('loadingPopup');
    const spinner = document.getElementById('loadingSpinner');
    const icon = document.getElementById('loadingIcon');
    const titleEl = document.getElementById('loadingTitle');
    const subtitleEl = document.getElementById('loadingSubtitle');

    spinner.style.display = 'block';
    icon.style.display = 'none';
    icon.innerHTML = '';

    titleEl.textContent = title || 'Processing...';
    subtitleEl.textContent = subtitle || 'Please wait';

    popup.classList.add('active');
}

function showSuccessPopup(title, subtitle) {
    const popup = document.getElementById('loadingPopup');
    const spinner = document.getElementById('loadingSpinner');
    const icon = document.getElementById('loadingIcon');
    const titleEl = document.getElementById('loadingTitle');
    const subtitleEl = document.getElementById('loadingSubtitle');

    spinner.style.display = 'none';
    icon.style.display = 'block';
    icon.innerHTML = '✅';
    icon.style.fontSize = '4rem';
    icon.style.marginBottom = '15px';
    icon.style.animation = 'popIn 0.5s ease';

    titleEl.textContent = title || 'Success!';
    subtitleEl.textContent = subtitle || 'Operation completed successfully';
}

function hideLoadingPopup() {
    document.getElementById('loadingPopup').classList.remove('active');
}

// ========== EMAIL FUNCTION ==========
const EMAIL_RECIPIENTS = {
    admin: 'iirufan@gmail.com',
    supervisor: 'tym95959@gmail.com',
    ccList: [
        'inkl0509@gmail.com',
        'leelidutychange@gmail.com'
    ]
};

function getEmailRecipients() {
    const recipients = [];

    if (EMAIL_RECIPIENTS.admin) {
        recipients.push(EMAIL_RECIPIENTS.admin);
    }

    if (EMAIL_RECIPIENTS.supervisor) {
        recipients.push(EMAIL_RECIPIENTS.supervisor);
    }

    if (EMAIL_RECIPIENTS.ccList && EMAIL_RECIPIENTS.ccList.length > 0) {
        recipients.push(...EMAIL_RECIPIENTS.ccList);
    }

    return recipients;
}

async function sendSwapEmail(swapData) {
    try {
        const emailBody = `

                         DUTY CHANGE                              


📅 DUTY CHANGE DATE : ${swapData.swapDate}
🔄 STATUS    : ✅ ACCEPTED

┌───────────────────────────────────────────────────────────────┐
  REQUEST STAFF                                               

  Name           : ${swapData.requesterName}                  
  RC No          : ${swapData.requesterRcNo}                 
  Role           : ${swapData.requesterRole}                 
  Current Duty   : ${swapData.requesterDuty}                 
  Changed To     : ${swapData.acceptStaffDuty}               


┌───────────────────────────────────────────────────────────────┐
  ACCEPT STAFF                                                

  Name           : ${swapData.acceptStaffName}                
  RC No          : ${swapData.acceptStaffRcNo}               
  Role           : ${swapData.acceptStaffRole}               
  Current Duty   : ${swapData.acceptStaffDuty}               
  Changed To     : ${swapData.requesterDuty}                 


🔄 SWAP SUMMARY:
   ${swapData.requesterName} (${swapData.requesterDuty}) ↔ ${swapData.acceptStaffName} (${swapData.acceptStaffDuty}) ON ${swapData.swapDate}

${swapData.reason ? `📝 REASON: ${swapData.reason}` : ''}


        This is an automated notification from Duty Change System  

        `;

        const recipients = getEmailRecipients();

        const requesterStaff = getStaffById(swapData.requesterId);
        const acceptStaff = getStaffById(swapData.acceptStaffId);

        if (requesterStaff?.email && !recipients.includes(requesterStaff.email)) {
            recipients.push(requesterStaff.email);
        }
        if (acceptStaff?.email && !recipients.includes(acceptStaff.email)) {
            recipients.push(acceptStaff.email);
        }

        if (recipients.length === 0) {
            console.warn('No email recipients configured');
            return true;
        }

        console.log('📧 Sending duty change email to:', recipients);

        const API_URL = 'https://koveli.vercel.app/api/send-email';

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                to: recipients.join(','),
                subject: `✅ Duty Change Accepted: ${swapData.requesterName} ↔ ${swapData.acceptStaffName} (${swapData.swapDate})`,
                text: emailBody
            })
        });

        let result;
        try {
            result = await response.json();
        } catch (e) {
            const text = await response.text();
            console.log('Raw response:', text);
            result = { success: response.ok, message: text || 'Email sent' };
        }

        console.log('📡 Response:', result);

        if (response.ok && result.success) {
            console.log('✅ Duty change email sent successfully');
            return true;
        } else {
            console.warn('Email API returned error:', result);
            return true;
        }

    } catch (error) {
        console.error('Email error:', error);
        return true;
    }
}

// ========== REQUEST VALIDATION FUNCTIONS ==========
function canRequestSwap(staffId, requestDuty, swapDate, acceptStaffId, allRequests) {
    const errors = [];

    const isOffDutySwap = isOffDuty(requestDuty);
    const staffRequests = allRequests.filter(r => r.requesterId === staffId);

    const existingDateRequest = staffRequests.find(r =>
        r.swapDate === swapDate &&
        (r.status === 'pending' || r.status === 'approved')
    );
    if (existingDateRequest) {
        errors.push('You already have a pending/approved swap request for this date');
    }

    const existingDutyChange = staffRequests.find(r =>
        r.requesterDuty === requestDuty &&
        (r.status === 'pending' || r.status === 'approved')
    );
    if (existingDutyChange) {
        errors.push('You have already requested to change this duty');
    }

    if (!isOffDutySwap) {
        const currentHalf = getMonthHalf(swapDate);
        const halfRequests = staffRequests.filter(r =>
            getMonthHalf(r.swapDate) === currentHalf &&
            !isOffDuty(r.requesterDuty) &&
            (r.status === 'pending' || r.status === 'approved')
        );

        if (halfRequests.length >= 2) {
            errors.push(`You have already used 2 duty changes for ${currentHalf === 'first' ? '1-15' : '16-31'} of this month`);
        }
    }

    const requester = getStaffById(staffId);
    const acceptStaff = getStaffById(acceptStaffId);
    if (requester && acceptStaff && requester.role !== acceptStaff.role) {
        errors.push(`You can only swap with staff of the same role (${requester.role} with ${requester.role})`);
    }

    return {
        canRequest: errors.length === 0,
        errors: errors
    };
}

// ========== REQUEST LIMIT DISPLAY ==========
function getRequestLimitInfo(staffId, allRequests) {
    const staffRequests = allRequests.filter(r => r.requesterId === staffId);
    const currentHalf = getCurrentMonthHalf();

    const halfRequests = staffRequests.filter(r =>
        getMonthHalf(r.swapDate) === currentHalf &&
        !isOffDuty(r.requesterDuty) &&
        (r.status === 'pending' || r.status === 'approved')
    );

    let pendingCount = 0;
    let approvedCount = 0;

    staffRequests.forEach(r => {
        if (r.status === 'approved') approvedCount++;
        else if (r.status === 'pending') pendingCount++;
    });

    return {
        usedCount: halfRequests.length,
        pendingCount,
        approvedCount,
        canRequest: halfRequests.length < 2
    };
}

// ========== AUTH SYSTEM ==========
let currentPatternSequence = [];
let currentNumericValue = '';
let isDrawing = false;
let dotElements = [];
let ctx = null;
let canvas = null;
let patternWrapper = null;

function initPatternLock() {
    const grid = document.getElementById('patternGrid');
    if (!grid) return;
    grid.innerHTML = '';
    dotElements = [];
    for (let i = 1; i <= 9; i++) {
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.dataset.value = i;
        dot.addEventListener('mousedown', (e) => startPattern(e, i));
        dot.addEventListener('touchstart', (e) => { e.preventDefault(); startPattern(e, i); });
        grid.appendChild(dot);
        dotElements.push(dot);
    }
    canvas = document.getElementById('patternCanvas');
    ctx = canvas.getContext('2d');
    patternWrapper = document.querySelector('#patternTab .pattern-wrapper');
    resizeCanvas();
    window.addEventListener('resize', () => resizeCanvas());
    attachGlobalEvents();
}

function resizeCanvas() {
    if (!patternWrapper || !canvas) return;
    const rect = patternWrapper.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function startPattern(e, val) {
    if (!pendingAuth.staff) return;
    e.preventDefault();
    isDrawing = true;
    const idx = currentPatternSequence.indexOf(val);
    if (idx === -1) currentPatternSequence.push(val);
    else currentPatternSequence = currentPatternSequence.slice(0, idx + 1);
    dotElements.forEach((dot, index) => {
        if (currentPatternSequence.includes(index + 1)) dot.classList.add('temp-selected');
        else dot.classList.remove('temp-selected');
    });
}

function onPatternMove(e) {
    if (!isDrawing || !pendingAuth.staff) return;
    const touch = e.touches ? e.touches[0] : e;
    const elem = document.elementsFromPoint(touch.clientX, touch.clientY);
    for (let el of elem) {
        if (el.classList?.contains('dot')) {
            const val = parseInt(el.dataset.value);
            if (val && currentPatternSequence[currentPatternSequence.length - 1] !== val) {
                if (!currentPatternSequence.includes(val)) currentPatternSequence.push(val);
                else {
                    const idx = currentPatternSequence.indexOf(val);
                    if (idx !== -1 && idx !== currentPatternSequence.length - 1)
                        currentPatternSequence = currentPatternSequence.slice(0, idx + 1);
                }
                dotElements.forEach((dot, index) => {
                    if (currentPatternSequence.includes(index + 1)) dot.classList.add('temp-selected');
                    else dot.classList.remove('temp-selected');
                });
            }
            break;
        }
    }
}

function endPattern() {
    if (isDrawing) {
        isDrawing = false;
        dotElements.forEach(dot => dot.classList.remove('selected', 'temp-selected'));
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (pendingAuth.staff && pendingAuthResolve && currentPatternSequence.length > 0) {
            attemptAutoVerify('pattern');
        } else {
            resetPattern();
        }
    }
}

function attachGlobalEvents() {
    window.addEventListener('mouseup', endPattern);
    window.addEventListener('touchend', endPattern);
    window.addEventListener('mousemove', onPatternMove);
    window.addEventListener('touchmove', (e) => { e.preventDefault(); onPatternMove(e); });
}

function resetPattern() {
    currentPatternSequence = [];
    dotElements.forEach(dot => dot.classList.remove('selected', 'temp-selected'));
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    const statusEl = document.getElementById('patternStatus');
    if (statusEl) statusEl.innerText = "✏️ Draw pattern";
}

function getPatternString() {
    return currentPatternSequence.join('');
}

function buildKeypad() {
    const pad = document.getElementById('keypad');
    if (!pad) return;
    pad.innerHTML = '';
    for (let i = 1; i <= 9; i++) {
        const btn = document.createElement('div');
        btn.className = 'key-btn';
        btn.innerText = i;
        btn.addEventListener('click', () => appendNumeric(i.toString()));
        pad.appendChild(btn);
    }
    const zeroBtn = document.createElement('div');
    zeroBtn.className = 'key-btn';
    zeroBtn.innerText = '0';
    zeroBtn.addEventListener('click', () => appendNumeric('0'));
    pad.appendChild(zeroBtn);
    const dummy = document.createElement('div');
    dummy.style.visibility = 'hidden';
    pad.appendChild(dummy);
}

function appendNumeric(digit) {
    if (!pendingAuth.staff) return;
    if (currentNumericValue.length < 8) currentNumericValue += digit;
    updateNumericDisplay();
    const storedPass = String(pendingAuth.staff.pass || '');
    if (storedPass && currentNumericValue === storedPass && pendingAuthResolve)
        attemptAutoVerify('numeric');
}

function clearNumeric() {
    currentNumericValue = '';
    updateNumericDisplay();
}

function deleteNumeric() {
    currentNumericValue = currentNumericValue.slice(0, -1);
    updateNumericDisplay();
}

function updateNumericDisplay() {
    const disp = document.getElementById('numericInput');
    if (disp) disp.innerText = '●'.repeat(currentNumericValue.length) || '●●●●';
}

async function attemptAutoVerify(source) {
    if (!pendingAuth.staff || !pendingAuthResolve) return;
    const staff = pendingAuth.staff;
    let isValid = source === 'pattern' ?
        getPatternString() === String(staff.pattern || '') :
        currentNumericValue === String(staff.pass || '');

    if (isValid) {
        const resolve = pendingAuthResolve;
        pendingAuthResolve = null;
        closeAuthModal(true);
        resolve({ success: true, staff: staff });

        currentLoggedInStaff = staff;
        document.getElementById('currentUserDisplay').style.display = 'inline-block';
        document.getElementById('currentUserName').innerHTML = `${staff.name} (RC: ${staff.rcno})`;
        document.getElementById('profileShortName').innerHTML = staff.name.split(' ')[0];
        document.getElementById('profileAvatar').innerHTML = staff.name.charAt(0).toUpperCase();

        saveLoggedInStaff(staff);
        populateDutyForm(staff);
        await loadAllData();

        showTemporaryFeedback(`✅ Welcome ${staff.name}!`);
    } else {
        if (source === 'pattern') { resetPattern(); } else { clearNumeric(); }
        const statusDiv = document.getElementById(source === 'pattern' ? 'patternStatus' : 'numericInput');
        if (statusDiv) {
            statusDiv.innerText = '❌ Wrong!';
            statusDiv.style.color = '#c25d2e';
            setTimeout(() => {
                if (source === 'pattern') statusDiv.innerText = 'Draw pattern';
                else updateNumericDisplay();
                statusDiv.style.color = '#a57334';
            }, 1200);
        }
    }
}

function closeAuthModal(success = false) {
    document.getElementById('passwordModal').classList.remove('active');
    if (!success && pendingAuthResolve && pendingAuth.selectEl && pendingAuth.prevDropdownValue) {
        const resolve = pendingAuthResolve;
        pendingAuthResolve = null;
        if (pendingAuth.selectEl) pendingAuth.selectEl.value = pendingAuth.prevDropdownValue;
        resolve({ success: false });
    }
    resetPattern();
    currentNumericValue = '';
    updateNumericDisplay();
}

function openPasswordModal(staff, selectEl, prevVal) {
    return new Promise((resolve) => {
        pendingAuth = { staff, viewType: 'login', selectEl, prevDropdownValue: prevVal };
        pendingAuthResolve = resolve;
        document.getElementById('modalStaffName').innerHTML = `🔐 ${staff.name} (RC: ${staff.rcno})`;
        resetPattern();
        currentNumericValue = '';
        updateNumericDisplay();
        document.querySelector('.modal-tab-btn.active-tab')?.click();
        document.getElementById('passwordModal').classList.add('active');
        setTimeout(() => resizeCanvas(), 30);
    });
}

// ========== CHANGE PASSWORD ==========
let changeMode = 'pattern';
let changePatternSeq = [];
let changePinValue = '';
let activeStaffForChange = null;
let changeDotElements = [];
let changeCtx = null;
let changeCanvas = null;
let changeWrapper = null;
let isDrawingChange = false;

function initChangePatternGrid() {
    const grid = document.getElementById('changePatternGrid');
    if (!grid) return;
    grid.innerHTML = '';
    changeDotElements = [];
    for (let i = 1; i <= 9; i++) {
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.dataset.value = i;
        dot.addEventListener('mousedown', (e) => startChangePattern(e, i));
        dot.addEventListener('touchstart', (e) => { e.preventDefault(); startChangePattern(e, i); });
        grid.appendChild(dot);
        changeDotElements.push(dot);
    }
    changeCanvas = document.getElementById('changePatternCanvas');
    changeCtx = changeCanvas.getContext('2d');
    changeWrapper = document.querySelector('#changePatternPane .pattern-wrapper');
    window.addEventListener('resize', () => resizeChangeCanvas());
    window.addEventListener('mouseup', endChangePattern);
    window.addEventListener('touchend', endChangePattern);
    window.addEventListener('mousemove', onChangePatternMove);
    window.addEventListener('touchmove', (e) => { e.preventDefault(); onChangePatternMove(e); });
}

function resizeChangeCanvas() {
    if (!changeWrapper || !changeCanvas) return;
    const rect = changeWrapper.getBoundingClientRect();
    changeCanvas.width = rect.width;
    changeCanvas.height = rect.height;
}

function startChangePattern(e, val) {
    e.preventDefault();
    isDrawingChange = true;
    const idx = changePatternSeq.indexOf(val);
    if (idx === -1) changePatternSeq.push(val);
    else changePatternSeq = changePatternSeq.slice(0, idx + 1);
    changeDotElements.forEach((dot, index) => {
        if (changePatternSeq.includes(index + 1)) dot.classList.add('temp-selected');
        else dot.classList.remove('temp-selected');
    });
    document.getElementById('changePatternStatus').innerHTML = `Pattern: ${'●'.repeat(changePatternSeq.length)} dots`;
}

function onChangePatternMove(e) {
    if (!isDrawingChange) return;
    const touch = e.touches ? e.touches[0] : e;
    const elem = document.elementsFromPoint(touch.clientX, touch.clientY);
    for (let el of elem) {
        if (el.classList?.contains('dot')) {
            const val = parseInt(el.dataset.value);
            if (val && changePatternSeq[changePatternSeq.length - 1] !== val) {
                if (!changePatternSeq.includes(val)) changePatternSeq.push(val);
                else {
                    const idx = changePatternSeq.indexOf(val);
                    if (idx !== -1 && idx !== changePatternSeq.length - 1)
                        changePatternSeq = changePatternSeq.slice(0, idx + 1);
                }
                changeDotElements.forEach((dot, index) => {
                    if (changePatternSeq.includes(index + 1)) dot.classList.add('temp-selected');
                    else dot.classList.remove('temp-selected');
                });
                document.getElementById('changePatternStatus').innerHTML = `Pattern: ${'●'.repeat(changePatternSeq.length)} dots`;
            }
            break;
        }
    }
}

function endChangePattern() {
    isDrawingChange = false;
    changeDotElements.forEach(dot => dot.classList.remove('selected', 'temp-selected'));
    if (changeCtx) changeCtx.clearRect(0, 0, changeCanvas.width, changeCanvas.height);
}

function resetChangePattern() {
    changePatternSeq = [];
    changeDotElements.forEach(dot => dot.classList.remove('selected', 'temp-selected'));
    document.getElementById('changePatternStatus').innerHTML = '📌 Draw new pattern';
}

function buildChangePinKeypad() {
    const pad = document.getElementById('changePinKeypad');
    if (!pad) return;
    pad.innerHTML = '';
    for (let i = 1; i <= 9; i++) {
        const btn = document.createElement('div');
        btn.className = 'key-btn';
        btn.innerText = i;
        btn.addEventListener('click', () => {
            changePinValue += i.toString();
            if (changePinValue.length > 8) changePinValue = changePinValue.slice(0, 8);
            document.getElementById('changePinDisplay').innerHTML = '●'.repeat(changePinValue.length) || '●●●●●●';
        });
        pad.appendChild(btn);
    }
    const zero = document.createElement('div');
    zero.className = 'key-btn';
    zero.innerText = '0';
    zero.addEventListener('click', () => {
        changePinValue += '0';
        if (changePinValue.length > 8) changePinValue = changePinValue.slice(0, 8);
        document.getElementById('changePinDisplay').innerHTML = '●'.repeat(changePinValue.length) || '●●●●●●';
    });
    pad.appendChild(zero);
    const dummy = document.createElement('div');
    dummy.style.visibility = 'hidden';
    pad.appendChild(dummy);
    document.getElementById('clearChangePinBtn').onclick = () => {
        changePinValue = '';
        document.getElementById('changePinDisplay').innerHTML = '●●●●●●';
    };
    document.getElementById('deleteChangePinBtn').onclick = () => {
        changePinValue = changePinValue.slice(0, -1);
        document.getElementById('changePinDisplay').innerHTML = '●'.repeat(changePinValue.length) || '●●●●●●';
    };
}

async function saveNewCode() {
    let newCode = changeMode === 'pattern' ? changePatternSeq.join('') : changePinValue;
    if (!newCode) {
        document.getElementById('changeFeedback').innerHTML = '<span style="color:#c25d2e;">⚠️ Enter a code</span>';
        return;
    }
    if (!/^\d+$/.test(newCode)) {
        document.getElementById('changeFeedback').innerHTML = '<span style="color:#c25d2e;">❌ Only numbers</span>';
        return;
    }
    if (changeMode === 'pattern' && newCode.length < 3) {
        document.getElementById('changeFeedback').innerHTML = '<span style="color:#c25d2e;">⚠️ 3+ dots</span>';
        return;
    }
    if (changeMode === 'pin' && newCode.length < 4) {
        document.getElementById('changeFeedback').innerHTML = '<span style="color:#c25d2e;">⚠️ 4+ digits</span>';
        return;
    }

    document.getElementById('changeFeedback').innerHTML = '<span>💾 Saving...</span>';
    if (changeMode === 'pattern') activeStaffForChange.pattern = newCode;
    else activeStaffForChange.pass = newCode;

    const synced = await syncStaffToFirebase(activeStaffForChange);
    if (synced) {
        document.getElementById('changeFeedback').innerHTML = `<span style="color:#2c6e2c;">✅ Saved!</span>`;
        setTimeout(() => document.getElementById('changePasswordModal').classList.remove('active'), 1200);
        showTemporaryFeedback('Login code updated successfully!');
    } else {
        document.getElementById('changeFeedback').innerHTML = '<span style="color:#e67e22;">⚠️ Save failed</span>';
    }
}

// ========== SEARCHABLE DROPDOWN FUNCTIONS ==========
function setupSearchableDropdown() {
    const searchInput = document.getElementById('staffSearchInput');
    const dropdownList = document.getElementById('staffDropdownList');
    const hiddenSelect = document.getElementById('loginStaffSelect');
    const selectedDisplay = document.getElementById('selectedStaffDisplay');
    const selectedName = document.getElementById('selectedStaffName');
    const selectedRc = document.getElementById('selectedStaffRc');
    const clearBtn = document.getElementById('clearSelectedStaff');

    if (!searchInput) return;

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        const container = document.getElementById('staffSearchContainer');
        if (container && !container.contains(e.target)) {
            dropdownList.classList.remove('show');
            isDropdownOpen = false;
        }
    });

    // Handle input search
    searchInput.addEventListener('input', async (e) => {
        const term = e.target.value;

        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        if (term.length < 2) {
            dropdownList.classList.remove('show');
            isDropdownOpen = false;
            return;
        }

        // Show loading state
        dropdownList.innerHTML = `
                <div class="loading-results">
                    <span class="spinner-small"></span> Searching...
                </div>
            `;
        dropdownList.classList.add('show');
        isDropdownOpen = true;

        searchTimeout = setTimeout(async () => {
            const results = await loadStaffFromFirebase(term);
            renderDropdownResults(results, term);
        }, 400);
    });

    // Handle Enter key
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const term = searchInput.value;
            if (term.length >= 2) {
                loadStaffFromFirebase(term).then(results => {
                    renderDropdownResults(results, term);
                });
            }
        }
        // Arrow keys for navigation
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const items = dropdownList.querySelectorAll('.dropdown-item');
            if (items.length === 0) return;

            let currentIndex = -1;
            items.forEach((item, index) => {
                if (item.classList.contains('active')) {
                    currentIndex = index;
                    item.classList.remove('active');
                }
            });

            let newIndex = e.key === 'ArrowDown' ?
                (currentIndex + 1) % items.length :
                (currentIndex - 1 + items.length) % items.length;

            items[newIndex].classList.add('active');
            items[newIndex].scrollIntoView({ block: 'nearest' });
        }
    });

    // Render dropdown results
    function renderDropdownResults(results, searchTerm) {
        if (!dropdownList) return;

        if (isStaffLoading) {
            dropdownList.innerHTML = `
                    <div class="loading-results">
                        <span class="spinner-small"></span> Searching...
                    </div>
                `;
            return;
        }

        if (results.length === 0) {
            dropdownList.innerHTML = `
                    <div class="no-results">No staff found matching "<strong>${searchTerm}</strong>"</div>
                `;
            return;
        }

        const term = searchTerm.toLowerCase().trim();
        let html = '';

        results.forEach(staff => {
            const nameMatch = staff.name.toLowerCase().includes(term);
            const rcMatch = staff.rcno.toString().includes(term);

            let displayName = staff.name;
            if (nameMatch) {
                const index = staff.name.toLowerCase().indexOf(term);
                displayName = staff.name.substring(0, index) +
                    `<span class="highlight">${staff.name.substring(index, index + term.length)}</span>` +
                    staff.name.substring(index + term.length);
            }

            html += `
                    <div class="dropdown-item" data-id="${staff.id}" data-name="${staff.name}" data-rc="${staff.rcno}" data-role="${staff.role}">
                        ${displayName}
                        <span class="rcno-hint">(RC: ${staff.rcno})</span>
                        <span class="role-badge">${staff.role}</span>
                        ${rcMatch ? ' 🔍' : ''}
                    </div>
                `;
        });

        dropdownList.innerHTML = html;

        // Add click handlers to dropdown items
        dropdownList.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const name = item.dataset.name;
                const rc = item.dataset.rc;
                const role = item.dataset.role;

                selectStaff(id, name, rc, role);
                dropdownList.classList.remove('show');
                isDropdownOpen = false;
                searchInput.value = name;
            });

            // Hover effect
            item.addEventListener('mouseenter', () => {
                dropdownList.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }

    // Select staff
    function selectStaff(id, name, rc, role) {
        hiddenSelect.value = id;
        selectedName.textContent = name;
        selectedRc.textContent = `RC: ${rc} | ${role}`;
        selectedDisplay.style.display = 'block';

        // Trigger login
        const event = new Event('change');
        hiddenSelect.dispatchEvent(event);
    }

    // Clear selected staff
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            hiddenSelect.value = '';
            selectedDisplay.style.display = 'none';
            searchInput.value = '';
            dropdownList.classList.remove('show');
            isDropdownOpen = false;

            if (currentLoggedInStaff) {
                logoutUser();
            }
        });
    }

    // Show dropdown when input gets focus
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.length >= 2 && staffData.length > 0) {
            dropdownList.classList.add('show');
            isDropdownOpen = true;
            renderDropdownResults(staffData, searchInput.value);
        } else if (searchInput.value.length >= 2) {
            const term = searchInput.value;
            loadStaffFromFirebase(term).then(results => {
                renderDropdownResults(results, term);
            });
        }
    });

    // Return functions for external use
    return {
        selectStaff,
        renderDropdownResults,
        searchInput,
        dropdownList
    };
}

// ========== DUTY CHANGE UI ==========
function populateDutyForm(staff) {
    document.getElementById('requestStaffName').value = staff.name;
    document.getElementById('requestStaffRcNo').value = staff.rcno || '';

    const dateInput = document.getElementById('swapDate');
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().split('T')[0];

    updateAcceptStaffDropdown();
    document.getElementById('submitDutyChangeBtn').disabled = false;
    updateRequestSummary();
}

function updateAcceptStaffDropdown() {
    const acceptSelect = document.getElementById('dutyAcceptStaff');
    if (!acceptSelect || !currentLoggedInStaff) return;

    const currentVal = acceptSelect.value;
    acceptSelect.innerHTML = '<option value="">-- Select Accepting Staff --</option>';

    const sameRoleStaff = staffData.filter(s =>
        s.role === currentLoggedInStaff.role &&
        s.id !== currentLoggedInStaff.id
    );

    sameRoleStaff.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (RC: ${s.rcno})`;
        acceptSelect.appendChild(opt);
    });

    if (currentVal && acceptSelect.querySelector(`option[value="${currentVal}"]`)) {
        acceptSelect.value = currentVal;
        updateAcceptStaffDetails(currentVal);
    }
}

function updateAcceptStaffDetails(staffId) {
    const staff = getStaffById(staffId);
    if (staff) {
        document.getElementById('acceptStaffName').value = staff.name;
        document.getElementById('acceptStaffRcNo').value = staff.rcno || '';
    } else {
        document.getElementById('acceptStaffName').value = '';
        document.getElementById('acceptStaffRcNo').value = '';
    }
    updateRequestSummary();
}

function updateRequestSummary() {
    const requestStaffName = document.getElementById('requestStaffName').value;
    const requestStaffRcNo = document.getElementById('requestStaffRcNo').value;
    const requestDuty = document.getElementById('requestCurrentDuty').value;
    const acceptStaffName = document.getElementById('acceptStaffName').value;
    const acceptStaffRcNo = document.getElementById('acceptStaffRcNo').value;
    const acceptDuty = document.getElementById('acceptCurrentDuty').value;
    const swapDate = document.getElementById('swapDate').value;
    const reason = document.getElementById('swapReason').value;

    const summaryDiv = document.getElementById('requestSummary');

    if (!requestStaffName || !requestDuty || !acceptStaffName || !acceptDuty || !swapDate) {
        summaryDiv.innerHTML = '<p style="color: #b28b44; font-size:0.85rem;">Please fill all required details to see summary</p>';
        return;
    }

    summaryDiv.innerHTML = `
            <div style="background: #f8f1e0; padding: 12px; border-radius: 14px; margin-top: 8px; font-size:0.85rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px;">
                    <div style="border-right: 1px solid #e0d0b0; padding-right: 12px;">
                        <div style="font-weight: 700; color: #b87c1a; font-size:0.8rem;">👤 Request</div>
                        <div style="font-size:0.85rem;">${requestStaffName}</div>
                        <div style="font-size:0.75rem; color: #7a5c1a;">RC: ${requestStaffRcNo}</div>
                        <div style="margin-top:2px;">
                            <span class="duty-badge ${getDutyBadgeClass(requestDuty)}">${requestDuty}</span>
                        </div>
                    </div>
                    <div>
                        <div style="font-weight: 700; color: #2c6e2c; font-size:0.8rem;">🤝 Accept</div>
                        <div style="font-size:0.85rem;">${acceptStaffName}</div>
                        <div style="font-size:0.75rem; color: #7a5c1a;">RC: ${acceptStaffRcNo}</div>
                        <div style="margin-top:2px;">
                            <span class="duty-badge ${getDutyBadgeClass(acceptDuty)}">${acceptDuty}</span>
                        </div>
                    </div>
                </div>
                <div style="padding-top: 8px; border-top: 1px solid #e0d0b0;">
                    <div style="font-weight: 600; font-size:0.85rem;">📅 ${swapDate}</div>
                    ${reason ? `<div style="font-size:0.8rem; color: #7a5c1a;">📝 ${reason}</div>` : ''}
                </div>
                <div style="margin-top: 8px; padding: 6px; background: #fff8e0; border-radius: 8px; text-align: center; font-weight: 600; color: #b87c1a; font-size:0.8rem;">
                    🔄 ${requestStaffName} ↔ ${acceptStaffName}
                </div>
            </div>
        `;
}

// ========== LOAD ALL DATA ==========
async function loadAllData() {
    if (!currentLoggedInStaff) {
        console.log('No user logged in');
        return;
    }

    console.log('🔄 Loading data for:', currentLoggedInStaff.name);

    const allRequests = await loadDutyChangeRequests({});
    allRequestsCache = allRequests;

    updateRequestLimitDisplay();

    await loadMyDutyRequests();
    await loadReceivedRequests();
    await loadAdminRequests();
    updateRequestSummary();
}

function updateRequestLimitDisplay() {
    if (!currentLoggedInStaff) {
        document.getElementById('requestLimitDisplay').style.display = 'none';
        return;
    }

    const info = getRequestLimitInfo(currentLoggedInStaff.id, allRequestsCache);
    const currentHalf = getCurrentMonthHalf();
    const periodLabel = currentHalf === 'first' ? '1-15' : '16-31';

    document.getElementById('requestLimitDisplay').style.display = 'block';
    document.getElementById('firstHalfLabel').textContent = `Month (${periodLabel})`;
    document.getElementById('firstHalfUsed').textContent = info.usedCount;
    document.getElementById('pendingCount').textContent = info.pendingCount;
    document.getElementById('approvedCount').textContent = info.approvedCount;

    const swapDate = document.getElementById('swapDate').value;
    if (swapDate) {
        const canRequest = info.canRequest;
        const submitBtn = document.getElementById('submitDutyChangeBtn');
        const warning = document.getElementById('requestLimitWarning');

        if (!canRequest) {
            submitBtn.disabled = true;
            warning.style.display = 'block';
            warning.textContent = `⚠️ You have already used 2 duty changes for ${periodLabel} of this month.`;
        } else {
            submitBtn.disabled = false;
            warning.style.display = 'none';
        }
    }
}

async function submitDutyChange() {
    if (!currentLoggedInStaff) {
        showTemporaryFeedback('⚠️ Please login first', true);
        return;
    }

    const requestDuty = document.getElementById('requestCurrentDuty').value;
    const acceptId = document.getElementById('dutyAcceptStaff').value;
    const acceptDuty = document.getElementById('acceptCurrentDuty').value;
    const swapDate = document.getElementById('swapDate').value;
    const reason = document.getElementById('swapReason').value;

    if (!requestDuty) { showTemporaryFeedback('⚠️ Select your current duty', true); return; }
    if (!acceptId) { showTemporaryFeedback('⚠️ Select accepting staff', true); return; }
    if (!acceptDuty) { showTemporaryFeedback('⚠️ Select accept staff current duty', true); return; }
    if (!swapDate) { showTemporaryFeedback('⚠️ Select swap date', true); return; }

    const acceptStaff = getStaffById(acceptId);
    if (!acceptStaff) { showTemporaryFeedback('⚠️ Invalid staff', true); return; }
    if (acceptStaff.id === currentLoggedInStaff.id) {
        showTemporaryFeedback('⚠️ Cannot swap with yourself', true);
        return;
    }

    if (currentLoggedInStaff.role !== acceptStaff.role) {
        showTemporaryFeedback(`⚠️ You can only swap with ${currentLoggedInStaff.role}s`, true);
        return;
    }

    const validation = canRequestSwap(
        currentLoggedInStaff.id,
        requestDuty,
        swapDate,
        acceptId,
        allRequestsCache
    );

    if (!validation.canRequest) {
        showTemporaryFeedback('⚠️ ' + validation.errors[0], true);
        return;
    }

    const request = {
        requesterId: currentLoggedInStaff.id,
        requesterName: currentLoggedInStaff.name,
        requesterRcNo: currentLoggedInStaff.rcno || '',
        requesterRole: currentLoggedInStaff.role || 'Staff',
        requesterDuty: requestDuty,
        acceptStaffId: acceptStaff.id,
        acceptStaffName: acceptStaff.name,
        acceptStaffRcNo: acceptStaff.rcno || '',
        acceptStaffRole: acceptStaff.role || 'Staff',
        acceptStaffDuty: acceptDuty,
        swapDate: swapDate,
        reason: reason || '',
        status: 'pending',
        isOffDutySwap: isOffDuty(requestDuty) || isOffDuty(acceptDuty)
    };

    const ok = await saveDutyChangeRequest(request);
    if (ok) {
        showTemporaryFeedback('✅ Duty swap request submitted! Waiting for staff acceptance.');
        document.getElementById('dutyAcceptStaff').value = '';
        document.getElementById('acceptStaffName').value = '';
        document.getElementById('acceptStaffRcNo').value = '';
        document.getElementById('acceptCurrentDuty').value = '';
        document.getElementById('swapReason').value = '';
        await loadAllData();
    } else {
        showTemporaryFeedback('❌ Failed to submit request', true);
    }
}

// ========== MY DUTY REQUESTS ==========
async function loadMyDutyRequests() {
    const container = document.getElementById('myDutyRequestsList');
    if (!currentLoggedInStaff) {
        container.innerHTML = '<div class="empty-state">Login to see your requests</div>';
        return;
    }

    const allRequests = await loadDutyChangeRequests({ requesterId: currentLoggedInStaff.id });
    const currentPeriodRequests = allRequests.filter(r => isCurrentPeriod(r.swapDate));

    if (currentPeriodRequests.length === 0) {
        container.innerHTML = '<div class="empty-state">No swap requests for current period</div>';
        return;
    }

    const statusMap = {
        'pending': '⏳ Pending',
        'approved': '✅ Approved',
        'rejected': '❌ Rejected'
    };

    container.innerHTML = currentPeriodRequests.map(r => `
            <div class="request-item">
                <div class="request-info">
                    <div style="font-size:0.8rem;"><strong>📅 ${r.swapDate}</strong></div>
                    <div style="font-size:0.8rem; margin-top:2px;">
                        👤 ${r.requesterName} (RC: ${r.requesterRcNo || ''})
                        <span class="duty-badge ${getDutyBadgeClass(r.requesterDuty)}">${r.requesterDuty}</span>
                    </div>
                    <div style="font-size:0.8rem;">
                        🤝 ${r.acceptStaffName} (RC: ${r.acceptStaffRcNo || ''})
                        <span class="duty-badge ${getDutyBadgeClass(r.acceptStaffDuty)}">${r.acceptStaffDuty}</span>
                    </div>
                    ${r.reason ? `<div style="font-size:0.75rem; color:#7a5c1a;">📝 ${r.reason}</div>` : ''}
                    <div style="margin-top:2px;">
                        Status: <span class="badge badge-${r.status === 'pending' ? 'pending' : r.status}">${statusMap[r.status] || r.status}</span>
                        ${r.isOffDutySwap ? ' <span style="font-size:0.6rem; color:#b8860b;">(Off Duty)</span>' : ''}
                    </div>
                </div>
                ${r.status === 'pending' ? `
                    <div class="request-actions">
                        <button class="btn-danger" onclick="window.cancelDutyRequest('${r.id}')">Cancel</button>
                    </div>
                ` : ''}
            </div>
        `).join('');
}

// ========== RECEIVED REQUESTS ==========
async function loadReceivedRequests() {
    const container = document.getElementById('receivedRequestsList');
    if (!currentLoggedInStaff) {
        container.innerHTML = '<div class="empty-state">Login to see requests</div>';
        return;
    }

    const allRequests = await loadDutyChangeRequests({
        acceptStaffId: currentLoggedInStaff.id,
        status: 'pending'
    });

    const currentPeriodRequests = allRequests.filter(r => isCurrentPeriod(r.swapDate));

    if (currentPeriodRequests.length === 0) {
        container.innerHTML = '<div class="empty-state">No pending requests received from other staff for current period</div>';
        return;
    }

    container.innerHTML = currentPeriodRequests.map(r => `
            <div class="request-item received">
                <div class="request-info">
                    <div style="font-size:0.8rem;"><strong>📅 ${r.swapDate}</strong></div>
                    <div style="font-size:0.8rem; margin-top:2px;">
                        👤 From: ${r.requesterName} (RC: ${r.requesterRcNo || ''})
                        <span class="duty-badge ${getDutyBadgeClass(r.requesterDuty)}">${r.requesterDuty}</span>
                    </div>
                    <div style="font-size:0.8rem;">
                        🤝 Your Duty: <span class="duty-badge ${getDutyBadgeClass(r.acceptStaffDuty)}">${r.acceptStaffDuty}</span>
                    </div>
                    ${r.reason ? `<div style="font-size:0.75rem; color:#7a5c1a;">📝 ${r.reason}</div>` : ''}
                    <div style="margin-top:2px;">
                        Status: <span class="badge badge-pending">⏳ Pending</span>
                    </div>
                </div>
                <div class="request-actions">
                    <button class="btn-accept" onclick="window.acceptSwapRequest('${r.id}')">✅ Accept</button>
                    <button class="btn-danger" onclick="window.rejectSwapRequest('${r.id}')">❌ Reject</button>
                </div>
            </div>
        `).join('');
}

// ========== ADMIN REQUESTS ==========
async function loadAdminRequests() {
    const container = document.getElementById('adminRequestsList');
    const section = document.getElementById('adminSection');

    if (!currentLoggedInStaff || currentLoggedInStaff.role !== 'Admin') {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    const allRequests = await loadDutyChangeRequests({});
    const currentPeriodRequests = allRequests.filter(r => isCurrentPeriod(r.swapDate));

    if (currentPeriodRequests.length === 0) {
        container.innerHTML = '<div class="empty-state">No swap requests for current period</div>';
        return;
    }

    const statusMap = {
        'pending': '⏳ Pending',
        'approved': '✅ Approved',
        'rejected': '❌ Rejected'
    };

    container.innerHTML = currentPeriodRequests.map(r => `
            <div class="request-item admin">
                <div class="request-info">
                    <div style="font-size:0.8rem;"><strong>📅 ${r.swapDate}</strong></div>
                    <div style="font-size:0.8rem; margin-top:2px;">
                        👤 ${r.requesterName} (RC: ${r.requesterRcNo || ''})
                        <span class="duty-badge ${getDutyBadgeClass(r.requesterDuty)}">${r.requesterDuty}</span>
                    </div>
                    <div style="font-size:0.8rem;">
                        🤝 ${r.acceptStaffName} (RC: ${r.acceptStaffRcNo || ''})
                        <span class="duty-badge ${getDutyBadgeClass(r.acceptStaffDuty)}">${r.acceptStaffDuty}</span>
                    </div>
                    ${r.reason ? `<div style="font-size:0.75rem; color:#7a5c1a;">📝 ${r.reason}</div>` : ''}
                    <div style="margin-top:2px;">
                        Status: <span class="badge badge-${r.status === 'pending' ? 'pending' : r.status}">${statusMap[r.status] || r.status}</span>
                        ${r.isOffDutySwap ? ' <span style="font-size:0.6rem; color:#b8860b;">(Off Duty)</span>' : ''}
                    </div>
                </div>
                <div class="request-actions">
                    <button class="btn-danger" onclick="window.deleteDutyRequest('${r.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
}

// ========== LOGOUT FUNCTION ==========
function logoutUser() {
    if (!currentLoggedInStaff) {
        showTemporaryFeedback('⚠️ You are not logged in', true);
        return;
    }

    if (!confirm(`Logout ${currentLoggedInStaff.name}?`)) {
        return;
    }

    currentLoggedInStaff = null;
    allRequestsCache = [];
    localStorage.removeItem(STORAGE_KEY);

    // Reset UI
    document.getElementById('currentUserDisplay').style.display = 'none';
    document.getElementById('profileShortName').innerHTML = 'Login';
    document.getElementById('profileAvatar').innerHTML = '👤';
    document.getElementById('profileMenu').classList.remove('show');

    // Reset search dropdown
    const searchInput = document.getElementById('staffSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    const selectedDisplay = document.getElementById('selectedStaffDisplay');
    if (selectedDisplay) {
        selectedDisplay.style.display = 'none';
    }
    const dropdownList = document.getElementById('staffDropdownList');
    if (dropdownList) {
        dropdownList.classList.remove('show');
    }
    const hiddenSelect = document.getElementById('loginStaffSelect');
    if (hiddenSelect) {
        hiddenSelect.value = '';
    }

    document.getElementById('requestStaffName').value = '';
    document.getElementById('requestStaffRcNo').value = '';
    document.getElementById('submitDutyChangeBtn').disabled = true;
    document.getElementById('requestLimitDisplay').style.display = 'none';
    document.getElementById('requestLimitWarning').style.display = 'none';
    document.getElementById('myDutyRequestsList').innerHTML = '<div class="empty-state">Login to see your requests</div>';
    document.getElementById('receivedRequestsList').innerHTML = '<div class="empty-state">Login to see requests</div>';
    document.getElementById('adminSection').style.display = 'none';
    document.getElementById('requestSummary').innerHTML = '<p style="color: #b28b44; font-size:0.85rem;">Please login to see summary</p>';
    document.getElementById('dutyAcceptStaff').value = '';
    document.getElementById('acceptStaffName').value = '';
    document.getElementById('acceptStaffRcNo').value = '';
    document.getElementById('acceptCurrentDuty').value = '';
    document.getElementById('swapReason').value = '';

    showTemporaryFeedback('👋 Logged out!');
    console.log('👋 User logged out');
}

// ========== GLOBAL FUNCTIONS ==========
window.cancelDutyRequest = async function(id) {
    if (!confirm('Cancel this swap request?')) return;
    const ok = await deleteDutyChange(id);
    if (ok) {
        showTemporaryFeedback('Request cancelled');
        await loadAllData();
    }
};

window.acceptSwapRequest = async function(id) {
    const request = allRequestsCache.find(r => r.id === id);
    if (!request) {
        showTemporaryFeedback('❌ Request not found', true);
        return;
    }
    if (request.acceptStaffId !== currentLoggedInStaff.id) {
        showTemporaryFeedback('❌ You are not authorized to accept this request', true);
        return;
    }

    if (!confirm('Accept this swap request?')) return;

    showLoadingPopup('⏳ Processing...', 'Please wait...');

    try {
        const ok = await updateDutyChangeStatus(id, 'approved');

        if (!ok) {
            hideLoadingPopup();
            showTemporaryFeedback('❌ Failed to accept request', true);
            return;
        }

        showLoadingPopup('📧 Sending...', 'Notifying supervisors...');
        await new Promise(resolve => setTimeout(resolve, 800));

        const swapData = {
            swapDate: request.swapDate,
            requesterId: request.requesterId,
            requesterName: request.requesterName,
            requesterRcNo: request.requesterRcNo || 'N/A',
            requesterRole: request.requesterRole || 'Staff',
            requesterDuty: request.requesterDuty,
            acceptStaffId: request.acceptStaffId,
            acceptStaffName: request.acceptStaffName,
            acceptStaffRcNo: request.acceptStaffRcNo || 'N/A',
            acceptStaffRole: request.acceptStaffRole || 'Staff',
            acceptStaffDuty: request.acceptStaffDuty,
            reason: request.reason || ''
        };

        await sendSwapEmail(swapData);

        showSuccessPopup(
            '✅ Duty Change Approved!',
            `${request.requesterName} ↔ ${request.acceptStaffName}\n📅 ${request.swapDate}`
        );

        const popupContent = document.querySelector('#loadingPopup .loading-content');
        const existingBtn = popupContent.querySelector('.btn-close-popup');
        if (!existingBtn) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'btn-close-popup';
            closeBtn.textContent = 'OK';
            closeBtn.onclick = function() {
                hideLoadingPopup();
                loadAllData();
            };
            popupContent.appendChild(closeBtn);
        }

    } catch (error) {
        console.error('Error:', error);
        hideLoadingPopup();
        showTemporaryFeedback('✅ Duty change approved!', true);
        await loadAllData();
    }
};

window.rejectSwapRequest = async function(id) {
    const request = allRequestsCache.find(r => r.id === id);
    if (!request) {
        showTemporaryFeedback('❌ Request not found', true);
        return;
    }
    if (request.acceptStaffId !== currentLoggedInStaff.id) {
        showTemporaryFeedback('❌ You are not authorized to reject this request', true);
        return;
    }

    if (!confirm('Reject this swap request?')) return;
    const ok = await updateDutyChangeStatus(id, 'rejected');
    if (ok) {
        showTemporaryFeedback('❌ Swap request rejected');
        await loadAllData();
    }
};

window.deleteDutyRequest = async function(id) {
    if (currentLoggedInStaff?.role !== 'Admin') {
        showTemporaryFeedback('❌ Only Admins can delete requests', true);
        return;
    }
    if (!confirm('Delete this request?')) return;
    const ok = await deleteDutyChange(id);
    if (ok) {
        showTemporaryFeedback('Request deleted');
        await loadAllData();
    }
};

window.deleteAllDutyChanges = deleteAllDutyChanges;

// ========== TOAST ==========
function showTemporaryFeedback(message, isError = false) {
    const toast = document.getElementById('messageToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'message-toast' + (isError ? ' error' : '');
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2500);
}

// ========== INIT ==========
async function initApp() {
    console.log('🚀 Initializing Duty Change App...');

    // 1. Initialize Firebase
    initFirebase();

    // 2. Setup UI components (no Firebase calls)
    initPatternLock();
    buildKeypad();
    initChangePatternGrid();
    buildChangePinKeypad();

    // 3. Setup searchable dropdown
    const searchDropdown = setupSearchableDropdown();

    // 4. Check for persistent login
    const savedStaff = getLoggedInStaff();
    if (savedStaff) {
        const staff = getStaffById(savedStaff.id);
        if (staff) {
            // Load credentials for this staff
            await loadSpecificStaffCredentials(staff.id);

            // Also load all staff data for this user (only once)
            await loadStaffForLoggedInUser();

            currentLoggedInStaff = staff;
            document.getElementById('currentUserDisplay').style.display = 'inline-block';
            document.getElementById('currentUserName').innerHTML = `${staff.name} (RC: ${staff.rcno})`;
            document.getElementById('profileShortName').innerHTML = staff.name.split(' ')[0];
            document.getElementById('profileAvatar').innerHTML = staff.name.charAt(0).toUpperCase();

            // Set search input and selected display
            const searchInput = document.getElementById('staffSearchInput');
            if (searchInput) {
                searchInput.value = staff.name;
            }
            const selectedDisplay = document.getElementById('selectedStaffDisplay');
            const selectedName = document.getElementById('selectedStaffName');
            const selectedRc = document.getElementById('selectedStaffRc');
            if (selectedDisplay && selectedName && selectedRc) {
                selectedDisplay.style.display = 'block';
                selectedName.textContent = staff.name;
                selectedRc.textContent = `RC: ${staff.rcno} | ${staff.role}`;
            }
            const hiddenSelect = document.getElementById('loginStaffSelect');
            if (hiddenSelect) {
                hiddenSelect.value = staff.id;
            }

            populateDutyForm(staff);
            await loadAllData();

            showTemporaryFeedback(`👋 Welcome back ${staff.name}!`);
        }
    }

    // ========== LOGIN EVENT ==========
    const hiddenSelect = document.getElementById('loginStaffSelect');
    hiddenSelect.addEventListener('change', async (e) => {
        const selectedValue = e.target.value;
        if (!selectedValue) {
            if (currentLoggedInStaff) {
                logoutUser();
            }
            return;
        }
        const s = getStaffById(selectedValue);
        if (s) {
            await loadSpecificStaffCredentials(s.id);
            const result = await openPasswordModal(s, hiddenSelect, hiddenSelect.value);
            if (!result?.success) {
                if (currentLoggedInStaff) {
                    // Revert selection
                    const searchInput = document.getElementById('staffSearchInput');
                    if (searchInput) {
                        searchInput.value = currentLoggedInStaff.name;
                    }
                    const selectedDisplay = document.getElementById('selectedStaffDisplay');
                    if (selectedDisplay) {
                        selectedDisplay.style.display = 'block';
                    }
                    hiddenSelect.value = currentLoggedInStaff.id;
                } else {
                    hiddenSelect.value = '';
                }
            }
        }
    });

    document.getElementById('dutyAcceptStaff').addEventListener('change', (e) => {
        updateAcceptStaffDetails(e.target.value);
    });

    document.getElementById('requestCurrentDuty').addEventListener('change', updateRequestSummary);
    document.getElementById('acceptCurrentDuty').addEventListener('change', updateRequestSummary);
    document.getElementById('swapDate').addEventListener('change', () => {
        updateRequestSummary();
        updateRequestLimitDisplay();
    });
    document.getElementById('swapReason').addEventListener('input', updateRequestSummary);

    document.getElementById('submitDutyChangeBtn').addEventListener('click', submitDutyChange);
    document.getElementById('refreshBtn').addEventListener('click', async () => {
        showTemporaryFeedback('🔄 Refreshing...');
        await loadAllData();
        showTemporaryFeedback('✅ Refreshed!');
    });

    const dateInput = document.getElementById('swapDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    // Modal events
    document.querySelectorAll('.modal-tab-btn').forEach(btn => btn.addEventListener('click', () => {
        const tabId = btn.dataset.modalTab;
        document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active-tab'));
        btn.classList.add('active-tab');
        document.getElementById('patternTab').classList.toggle('active-pane', tabId === 'pattern');
        document.getElementById('numericTab').classList.toggle('active-pane', tabId === 'numeric');
        if (tabId === 'pattern') setTimeout(() => resizeCanvas(), 30);
    }));

    document.getElementById('resetPatternBtn').onclick = resetPattern;
    document.getElementById('clearNumericBtn').onclick = clearNumeric;
    document.getElementById('deleteNumericBtn').onclick = deleteNumeric;
    document.getElementById('modalCloseBtn').onclick = () => closeAuthModal(false);

    document.querySelectorAll('.change-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            changeMode = btn.dataset.changeMethod;
            document.querySelectorAll('.change-method-btn').forEach(b => b.classList.remove('active-method'));
            btn.classList.add('active-method');
            document.getElementById('changePatternPane').classList.toggle('active-pane', changeMode === 'pattern');
            document.getElementById('changePinPane').classList.toggle('active-pane', changeMode === 'pin');
            if (changeMode === 'pattern') setTimeout(() => resizeChangeCanvas(), 30);
        });
    });

    document.getElementById('resetChangePatternBtn').onclick = resetChangePattern;
    document.getElementById('saveNewCodeBtn').onclick = saveNewCode;
    document.getElementById('cancelChangeBtn').onclick = () => document.getElementById('changePasswordModal').classList.remove('active');
    document.getElementById('closeChangeModalBtn').onclick = () => document.getElementById('changePasswordModal').classList.remove('active');

    const profileBtn = document.getElementById('profileButton');
    const profileMenu = document.getElementById('profileMenu');
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileMenu.classList.toggle('show');
    });
    document.addEventListener('click', () => profileMenu.classList.remove('show'));

    document.getElementById('profileViewAction').onclick = () => {
        if (currentLoggedInStaff) {
            alert(`👤 ${currentLoggedInStaff.name}\nRole: ${currentLoggedInStaff.role}\nRC No: ${currentLoggedInStaff.rcno}\nContact: ${currentLoggedInStaff.contact || 'N/A'}`);
        } else {
            showTemporaryFeedback('Please login first', true);
        }
        profileMenu.classList.remove('show');
    };

    document.getElementById('profileChangePass').onclick = () => {
        if (currentLoggedInStaff) {
            activeStaffForChange = currentLoggedInStaff;
            changePatternSeq = [];
            changePinValue = '';
            resetChangePattern();
            document.getElementById('changePinDisplay').innerHTML = '●●●●●●';
            document.getElementById('changeFeedback').innerHTML = '';
            document.getElementById('changePasswordModal').classList.add('active');
        } else {
            showTemporaryFeedback('Please login first', true);
        }
        profileMenu.classList.remove('show');
    };

    document.getElementById('logoutAction').addEventListener('click', function(e) {
        e.stopPropagation();
        logoutUser();
    });

    if (!currentLoggedInStaff) {
        document.getElementById('myDutyRequestsList').innerHTML = '<div class="empty-state">Login to see your requests</div>';
        document.getElementById('receivedRequestsList').innerHTML = '<div class="empty-state">Login to see requests</div>';
        document.getElementById('adminSection').style.display = 'none';
        updateRequestSummary();
    }

    console.log('✅ Duty Swap App initialized');
}

document.addEventListener('DOMContentLoaded', initApp);
