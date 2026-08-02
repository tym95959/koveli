import { staffList } from './staff.js';

// ========== FIREBASE ==========
let db = null;
let firebaseConnected = false;

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

// ========== STAFF DATA ==========
let staffData = [];
let currentLoggedInStaff = null;
let pendingAuthResolve = null;
let pendingAuth = { staff: null, viewType: null, selectEl: null, prevDropdownValue: null };

function initStaffData() {
    staffData = staffList.map(staff => ({
        id: staff.id,
        name: staff.name,
        role: staff.role || 'Staff',
        contact: staff.contact || '',
        rcno: staff.id,
        pass: staff.pass || '',
        pattern: staff.pattern || ''
    }));
    return staffData;
}

function getStaffById(id) { 
    return staffData.find(s => s.id === id); 
}

async function loadCredentialsFromFirebase() {
    if (!db || !firebaseConnected) return false;
    try {
        const snapshot = await db.collection('staff').get();
        snapshot.forEach(doc => {
            const data = doc.data();
            const staff = staffData.find(s => s.id === doc.id);
            if (staff) { 
                staff.pass = data.pass || ''; 
                staff.pattern = data.pattern || '';
            }
        });
        return true;
    } catch(e) { 
        console.warn('Load credentials error:', e);
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
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
    } catch(e) { 
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

// ========== DUTY CHANGE FIRESTORE ==========
async function saveDutyChangeRequest(request) {
    if (!db || !firebaseConnected) return false;
    try {
        const docId = `${request.requesterId}_${request.swapDate}_${Date.now()}`;
        await db.collection('dutyChanges').doc(docId).set({
            ...request,
            status: 'pending_accept',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
    } catch(e) {
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
        
        const snap = await q.orderBy('createdAt', 'desc').get();
        const results = [];
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        return results;
    } catch(e) {
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
        return true;
    } catch(e) {
        console.error('Update error:', e);
        return false;
    }
}

async function deleteDutyChange(requestId) {
    if (!db || !firebaseConnected) return false;
    try {
        await db.collection('dutyChanges').doc(requestId).delete();
        return true;
    } catch(e) {
        console.error('Delete error:', e);
        return false;
    }
}

// ========== REQUEST LIMIT CHECKS ==========
function getRequestLimitInfo(staffId, allRequests) {
    const staffRequests = allRequests.filter(r => r.requesterId === staffId);
    
    // Count only duty changes (exclude Off Duty swaps)
    const dutyChangeRequests = staffRequests.filter(r => 
        !isOffDuty(r.requesterDuty) && !isOffDuty(r.acceptStaffDuty)
    );
    
    // Count by month half
    let firstHalfUsed = 0;
    let secondHalfUsed = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    
    dutyChangeRequests.forEach(r => {
        const half = getMonthHalf(r.swapDate);
        if (r.status === 'approved') {
            approvedCount++;
            if (half === 'first') firstHalfUsed++;
            else secondHalfUsed++;
        } else if (r.status === 'pending_accept' || r.status === 'pending_approval') {
            pendingCount++;
            if (half === 'first') firstHalfUsed++;
            else secondHalfUsed++;
        }
    });
    
    return {
        firstHalfUsed,
        secondHalfUsed,
        pendingCount,
        approvedCount,
        canRequest: (half) => {
            return half === 'first' ? firstHalfUsed < 2 : secondHalfUsed < 2;
        }
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
        
        // Login success
        currentLoggedInStaff = staff;
        document.getElementById('currentUserDisplay').style.display = 'inline-block';
        document.getElementById('currentUserName').innerHTML = `${staff.name} (RC: ${staff.rcno})`;
        document.getElementById('profileShortName').innerHTML = staff.name.split(' ')[0];
        document.getElementById('profileAvatar').innerHTML = staff.name.charAt(0).toUpperCase();
        
        populateDutyForm(staff);
        await loadAllData();
        
        showTemporaryFeedback(`✅ Welcome ${staff.name}! (RC: ${staff.rcno})`);
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

// ========== DUTY CHANGE UI ==========
let allRequestsCache = [];

function populateDutyForm(staff) {
    document.getElementById('requestStaffName').value = staff.name;
    document.getElementById('requestStaffRcNo').value = staff.rcno || '';
    
    const dateInput = document.getElementById('swapDate');
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().split('T')[0];
    
    const acceptSelect = document.getElementById('dutyAcceptStaff');
    if (acceptSelect) {
        const currentVal = acceptSelect.value;
        acceptSelect.innerHTML = '<option value="">-- Select Accepting Staff --</option>';
        staffData.forEach(s => {
            if (s.id !== staff.id) {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.name} (RC: ${s.rcno})`;
                acceptSelect.appendChild(opt);
            }
        });
        if (currentVal && acceptSelect.querySelector(`option[value="${currentVal}"]`)) {
            acceptSelect.value = currentVal;
            updateAcceptStaffDetails(currentVal);
        }
    }
    document.getElementById('submitDutyChangeBtn').disabled = false;
    updateRequestSummary();
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
        summaryDiv.innerHTML = '<p style="color: #b28b44;">Please fill all required details to see summary</p>';
        return;
    }
    
    summaryDiv.innerHTML = `
        <div style="background: #f8f1e0; padding: 15px; border-radius: 16px; margin-top: 10px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 12px;">
                <div style="border-right: 1px solid #e0d0b0; padding-right: 15px;">
                    <div style="font-weight: 700; color: #b87c1a;">👤 Request Staff</div>
                    <div style="margin-top: 5px;">${requestStaffName}</div>
                    <div style="font-size: 0.85rem; color: #7a5c1a;">RC: ${requestStaffRcNo}</div>
                    <div style="margin-top: 4px;">
                        <span class="duty-badge ${getDutyBadgeClass(requestDuty)}">${requestDuty}</span>
                    </div>
                </div>
                <div>
                    <div style="font-weight: 700; color: #2c6e2c;">🤝 Accept Staff</div>
                    <div style="margin-top: 5px;">${acceptStaffName}</div>
                    <div style="font-size: 0.85rem; color: #7a5c1a;">RC: ${acceptStaffRcNo}</div>
                    <div style="margin-top: 4px;">
                        <span class="duty-badge ${getDutyBadgeClass(acceptDuty)}">${acceptDuty}</span>
                    </div>
                </div>
            </div>
            <div style="padding-top: 12px; border-top: 1px solid #e0d0b0;">
                <div style="font-weight: 600;">📅 Swap Date: ${swapDate}</div>
                ${reason ? `<div style="font-weight: 600; margin-top: 4px;">📝 Reason: ${reason}</div>` : ''}
            </div>
            <div style="margin-top: 10px; padding: 8px; background: #fff8e0; border-radius: 8px; text-align: center; font-weight: 600; color: #b87c1a;">
                🔄 ${requestStaffName} (${requestDuty}) ↔ ${acceptStaffName} (${acceptDuty})
            </div>
        </div>
    `;
}

// ========== LOAD ALL DATA ==========
async function loadAllData() {
    if (!currentLoggedInStaff) return;
    
    // Load all requests
    allRequestsCache = await loadDutyChangeRequests({});
    
    // Update limit display
    updateRequestLimitDisplay();
    
    // Load all lists
    await loadMyDutyRequests();
    await loadReceivedRequests();
    await loadAllDutyRequests();
    updateRequestSummary();
}

function updateRequestLimitDisplay() {
    if (!currentLoggedInStaff) {
        document.getElementById('requestLimitDisplay').style.display = 'none';
        return;
    }
    
    const info = getRequestLimitInfo(currentLoggedInStaff.id, allRequestsCache);
    document.getElementById('requestLimitDisplay').style.display = 'block';
    document.getElementById('firstHalfUsed').textContent = info.firstHalfUsed;
    document.getElementById('secondHalfUsed').textContent = info.secondHalfUsed;
    document.getElementById('pendingCount').textContent = info.pendingCount;
    document.getElementById('approvedCount').textContent = info.approvedCount;
    
    // Check if can request for current date
    const swapDate = document.getElementById('swapDate').value;
    if (swapDate) {
        const half = getMonthHalf(swapDate);
        const canRequest = info.canRequest(half);
        const submitBtn = document.getElementById('submitDutyChangeBtn');
        const warning = document.getElementById('requestLimitWarning');
        
        if (!canRequest) {
            submitBtn.disabled = true;
            warning.style.display = 'block';
            warning.textContent = `⚠️ You have already used 2 duty changes for ${half === 'first' ? '1-15' : '16-31'} of this month.`;
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
    
    // Check if Off Duty swap - these don't count towards limit
    const isOffDutySwap = isOffDuty(requestDuty) || isOffDuty(acceptDuty);
    
    // Check request limit (only for duty changes, not Off Duty)
    if (!isOffDutySwap) {
        const info = getRequestLimitInfo(currentLoggedInStaff.id, allRequestsCache);
        const half = getMonthHalf(swapDate);
        if (!info.canRequest(half)) {
            showTemporaryFeedback(`⚠️ You have already used 2 duty changes for ${half === 'first' ? '1-15' : '16-31'} of this month`, true);
            return;
        }
    }
    
    // Check if request already exists for this date
    const existing = await loadDutyChangeRequests({ 
        requesterId: currentLoggedInStaff.id,
        swapDate: swapDate
    });
    const hasPending = existing.some(r => r.status === 'pending_accept' || r.status === 'pending_approval');
    if (hasPending) {
        showTemporaryFeedback('⚠️ You already have a pending swap request for this date', true);
        return;
    }
    
    const request = {
        requesterId: currentLoggedInStaff.id,
        requesterName: currentLoggedInStaff.name,
        requesterRcNo: currentLoggedInStaff.rcno || '',
        requesterDuty: requestDuty,
        acceptStaffId: acceptStaff.id,
        acceptStaffName: acceptStaff.name,
        acceptStaffRcNo: acceptStaff.rcno || '',
        acceptStaffDuty: acceptDuty,
        swapDate: swapDate,
        reason: reason || '',
        status: 'pending_accept',
        isOffDutySwap: isOffDutySwap
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

async function loadMyDutyRequests() {
    const container = document.getElementById('myDutyRequestsList');
    if (!currentLoggedInStaff) {
        container.innerHTML = '<div class="empty-state">Login to see your requests</div>';
        return;
    }
    
    const requests = await loadDutyChangeRequests({ requesterId: currentLoggedInStaff.id });
    if (requests.length === 0) {
        container.innerHTML = '<div class="empty-state">No swap requests yet</div>';
        return;
    }
    
    const statusMap = {
        'pending_accept': '⏳ Pending Accept',
        'pending_approval': '⏳ Pending Approval',
        'approved': '✅ Approved',
        'rejected': '❌ Rejected'
    };
    
    container.innerHTML = requests.map(r => `
        <div class="request-item">
            <div class="request-info">
                <div><strong>📅 ${r.swapDate}</strong></div>
                <div style="font-size: 0.85rem; margin-top: 4px;">
                    👤 Request: ${r.requesterName} (RC: ${r.requesterRcNo || ''})
                    <span class="duty-badge ${getDutyBadgeClass(r.requesterDuty)}">${r.requesterDuty}</span>
                </div>
                <div style="font-size: 0.85rem;">
                    🤝 Accept: ${r.acceptStaffName} (RC: ${r.acceptStaffRcNo || ''})
                    <span class="duty-badge ${getDutyBadgeClass(r.acceptStaffDuty)}">${r.acceptStaffDuty}</span>
                </div>
                ${r.reason ? `<div style="font-size: 0.8rem; color: #7a5c1a;">📝 ${r.reason}</div>` : ''}
                <div style="margin-top: 4px;">
                    Status: <span class="badge badge-${r.status === 'pending_accept' || r.status === 'pending_approval' ? 'pending' : r.status}">${statusMap[r.status] || r.status}</span>
                    ${r.isOffDutySwap ? ' <span style="font-size: 0.7rem; color: #b8860b;">(Off Duty swap - no limit)</span>' : ''}
                </div>
            </div>
            ${r.status === 'pending_accept' || r.status === 'pending_approval' ? `
                <div class="request-actions">
                    <button class="btn-danger" onclick="window.cancelDutyRequest('${r.id}')">❌ Cancel</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

async function loadReceivedRequests() {
    const container = document.getElementById('receivedRequestsList');
    if (!currentLoggedInStaff) {
        container.innerHTML = '<div class="empty-state">Login to see requests</div>';
        return;
    }
    
    const requests = await loadDutyChangeRequests({ 
        acceptStaffId: currentLoggedInStaff.id,
        status: 'pending_accept'
    });
    
    if (requests.length === 0) {
        container.innerHTML = '<div class="empty-state">No pending requests received</div>';
        return;
    }
    
    container.innerHTML = requests.map(r => `
        <div class="request-item" style="border-left: 4px solid #e4bc78;">
            <div class="request-info">
                <div><strong>📅 ${r.swapDate}</strong></div>
                <div style="font-size: 0.85rem; margin-top: 4px;">
                    👤 From: ${r.requesterName} (RC: ${r.requesterRcNo || ''})
                    <span class="duty-badge ${getDutyBadgeClass(r.requesterDuty)}">${r.requesterDuty}</span>
                </div>
                <div style="font-size: 0.85rem;">
                    🤝 Your Duty: <span class="duty-badge ${getDutyBadgeClass(r.acceptStaffDuty)}">${r.acceptStaffDuty}</span>
                </div>
                ${r.reason ? `<div style="font-size: 0.8rem; color: #7a5c1a;">📝 ${r.reason}</div>` : ''}
                <div style="margin-top: 4px;">
                    Status: <span class="badge badge-pending">⏳ Pending Your Response</span>
                </div>
            </div>
            <div class="request-actions">
                <button class="btn-primary" style="padding:6px 16px;font-size:0.8rem;" onclick="window.acceptSwapRequest('${r.id}')">✅ Accept</button>
                <button class="btn-danger" style="padding:6px 16px;font-size:0.8rem;" onclick="window.rejectSwapRequest('${r.id}')">❌ Reject</button>
            </div>
        </div>
    `).join('');
}

async function loadAllDutyRequests() {
    const container = document.getElementById('allDutyRequestsList');
    const section = document.getElementById('supervisorSection');
    
    if (!currentLoggedInStaff || currentLoggedInStaff.role !== 'Supervisor') {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    const requests = await loadDutyChangeRequests({});
    
    if (requests.length === 0) {
        container.innerHTML = '<div class="empty-state">No swap requests</div>';
        return;
    }
    
    const statusMap = {
        'pending_accept': '⏳ Pending Accept',
        'pending_approval': '⏳ Pending Approval',
        'approved': '✅ Approved',
        'rejected': '❌ Rejected'
    };
    
    requests.sort((a, b) => {
        const order = { 'pending_accept': 0, 'pending_approval': 1, 'approved': 2, 'rejected': 3 };
        return (order[a.status] || 99) - (order[b.status] || 99);
    });
    
    container.innerHTML = requests.map(r => `
        <div class="request-item">
            <div class="request-info">
                <div><strong>📅 ${r.swapDate}</strong></div>
                <div style="font-size: 0.85rem; margin-top: 4px;">
                    👤 Request: ${r.requesterName} (RC: ${r.requesterRcNo || ''})
                    <span class="duty-badge ${getDutyBadgeClass(r.requesterDuty)}">${r.requesterDuty}</span>
                </div>
                <div style="font-size: 0.85rem;">
                    🤝 Accept: ${r.acceptStaffName} (RC: ${r.acceptStaffRcNo || ''})
                    <span class="duty-badge ${getDutyBadgeClass(r.acceptStaffDuty)}">${r.acceptStaffDuty}</span>
                </div>
                ${r.reason ? `<div style="font-size: 0.8rem; color: #7a5c1a;">📝 ${r.reason}</div>` : ''}
                <div style="margin-top: 4px;">
                    Status: <span class="badge badge-${r.status === 'pending_accept' || r.status === 'pending_approval' ? 'pending' : r.status}">${statusMap[r.status] || r.status}</span>
                    ${r.isOffDutySwap ? ' <span style="font-size: 0.7rem; color: #b8860b;">(Off Duty swap)</span>' : ''}
                </div>
            </div>
            <div class="request-actions">
                ${r.status === 'pending_approval' ? `
                    <button class="btn-primary" style="padding:6px 16px;font-size:0.8rem;" onclick="window.approveDutyRequest('${r.id}')">✅ Approve</button>
                    <button class="btn-danger" style="padding:6px 16px;font-size:0.8rem;" onclick="window.rejectDutyRequest('${r.id}')">❌ Reject</button>
                ` : ''}
                <button class="btn-secondary" style="padding:4px 12px;font-size:0.7rem;background:#e5e7eb;" onclick="window.deleteDutyRequest('${r.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
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
    if (!confirm('Accept this swap request? It will be sent to supervisor for final approval.')) return;
    const ok = await updateDutyChangeStatus(id, 'pending_approval');
    if (ok) {
        showTemporaryFeedback('✅ Swap request accepted! Waiting for supervisor approval.');
        await loadAllData();
    }
};

window.rejectSwapRequest = async function(id) {
    if (!confirm('Reject this swap request?')) return;
    const ok = await updateDutyChangeStatus(id, 'rejected');
    if (ok) {
        showTemporaryFeedback('❌ Swap request rejected');
        await loadAllData();
    }
};

window.approveDutyRequest = async function(id) {
    const ok = await updateDutyChangeStatus(id, 'approved');
    if (ok) {
        showTemporaryFeedback('✅ Swap request approved');
        await loadAllData();
    }
};

window.rejectDutyRequest = async function(id) {
    const ok = await updateDutyChangeStatus(id, 'rejected');
    if (ok) {
        showTemporaryFeedback('❌ Swap request rejected');
        await loadAllData();
    }
};

window.deleteDutyRequest = async function(id) {
    if (!confirm('Delete this request?')) return;
    const ok = await deleteDutyChange(id);
    if (ok) {
        showTemporaryFeedback('Request deleted');
        await loadAllData();
    }
};

// ========== TOAST ==========
function showTemporaryFeedback(message, isError = false) {
    const toast = document.getElementById('messageToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'message-toast' + (isError ? ' error' : '');
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}

// ========== INIT ==========
async function initApp() {
    initFirebase();
    initStaffData();
    
    if (firebaseConnected) {
        await loadCredentialsFromFirebase();
    }
    
    initPatternLock();
    buildKeypad();
    initChangePatternGrid();
    buildChangePinKeypad();
    
    const loginSelect = document.getElementById('loginStaffSelect');
    loginSelect.innerHTML = '<option value="">-- Select Staff Member --</option>';
    staffData.forEach(s => {
        loginSelect.appendChild(new Option(`${s.name} (RC: ${s.rcno})`, s.id));
    });
    
    loginSelect.addEventListener('change', async (e) => {
        const selectedValue = e.target.value;
        if (!selectedValue) {
            if (currentLoggedInStaff) {
                currentLoggedInStaff = null;
                document.getElementById('currentUserDisplay').style.display = 'none';
                document.getElementById('profileShortName').innerHTML = 'Login';
                document.getElementById('profileAvatar').innerHTML = '👤';
                document.getElementById('requestStaffName').value = '';
                document.getElementById('requestStaffRcNo').value = '';
                document.getElementById('submitDutyChangeBtn').disabled = true;
                document.getElementById('requestLimitDisplay').style.display = 'none';
                loadMyDutyRequests();
                loadReceivedRequests();
                loadAllDutyRequests();
                updateRequestSummary();
            }
            return;
        }
        const s = getStaffById(selectedValue);
        if (s) {
            const result = await openPasswordModal(s, loginSelect, loginSelect.value);
            if (!result?.success) {
                if (currentLoggedInStaff) loginSelect.value = currentLoggedInStaff.id;
                else loginSelect.value = '';
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
    
    loadMyDutyRequests();
    loadReceivedRequests();
    loadAllDutyRequests();
    updateRequestSummary();
    
    console.log('✅ Duty Swap App initialized');
    console.log(`📊 ${staffData.length} staff members loaded`);
}

document.addEventListener('DOMContentLoaded', initApp);
