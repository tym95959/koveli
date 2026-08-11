// ========== IMPORT STAFF DATA ==========
import { staffList } from '/staff.js';

// ========== FIREBASE ==========
let db = null;
let firebaseConnected = false;
let staffData = [];
let currentLoggedInStaff = null;
let currentMonth = new Date();
let blockedDays = {};
let publicHolidays = {};
let staffColors = {};
let isAdmin = false;

// ========== SESSION KEY ==========
const SESSION_KEY = 'staffPortalSession';

// ========== COLORS FOR STAFF ==========
const STAFF_COLORS = [
    '#27ae60', '#e74c3c', '#f39c12', '#2980b9', '#6c3483',
    '#00bcd4', '#ff5722', '#8bc34a', '#e91e63', '#3f51b5',
    '#cddc39', '#ffc107', '#009688', '#795548', '#607d8b'
];

// ========== LEAVE TYPE LABELS ==========
const LEAVE_TYPES = {
    'annual': { label: 'Annual Leave', color: '#27ae60', class: 'annual' },
    'sick': { label: 'Sick Leave', color: '#e74c3c', class: 'sick' },
    'frl': { label: 'FRL', color: '#f39c12', class: 'frl' },
    'training': { label: 'Training', color: '#2980b9', class: 'training' },
    'other': { label: 'Other', color: '#95a5a6', class: 'other' }
};

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

// ========== GET SESSION ==========
function getSession() {
    try {
        const data = localStorage.getItem(SESSION_KEY);
        if (data) {
            const session = JSON.parse(data);
            if (Date.now() - session.timestamp > 24 * 60 * 60 * 1000) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
            return session;
        }
        return null;
    } catch {
        return null;
    }
}

// ========== STAFF DATA FUNCTIONS ==========
function getStaffById(id) {
    return staffData.find(s => s.id === id);
}

function getStaffByName(name) {
    return staffData.find(s => s.name === name);
}

function getStaffColor(staffId) {
    if (!staffColors[staffId]) {
        const index = Object.keys(staffColors).length % STAFF_COLORS.length;
        staffColors[staffId] = STAFF_COLORS[index];
    }
    return staffColors[staffId];
}

// ========== PUBLIC HOLIDAYS FUNCTIONS ==========
function isPermanentHoliday(dateStr) {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    return dayOfWeek === 5 || dayOfWeek === 6;
}

function getPermanentHolidayName(dateStr) {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 5) return 'Friday (Public Holiday)';
    if (dayOfWeek === 6) return 'Saturday (Public Holiday)';
    return '';
}

async function loadPublicHolidays() {
    if (!db || !firebaseConnected) {
        const data = localStorage.getItem('publicHolidays');
        if (data) {
            publicHolidays = JSON.parse(data);
        } else {
            publicHolidays = {};
        }
        return publicHolidays;
    }
    
    try {
        const snapshot = await db.collection('publicHolidays').get();
        publicHolidays = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            publicHolidays[data.date] = {
                name: data.name,
                id: doc.id
            };
        });
        return publicHolidays;
    } catch (e) {
        console.error('Error loading public holidays:', e);
        return {};
    }
}

async function addPublicHoliday(date, name) {
    if (!db || !firebaseConnected) {
        publicHolidays[date] = { name: name };
        localStorage.setItem('publicHolidays', JSON.stringify(publicHolidays));
        return true;
    }
    
    try {
        await db.collection('publicHolidays').add({
            date: date,
            name: name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            addedBy: currentLoggedInStaff?.name || 'Admin'
        });
        return true;
    } catch (e) {
        console.error('Error adding public holiday:', e);
        return false;
    }
}

async function removePublicHoliday(date) {
    if (!db || !firebaseConnected) {
        delete publicHolidays[date];
        localStorage.setItem('publicHolidays', JSON.stringify(publicHolidays));
        return true;
    }
    
    try {
        const holiday = publicHolidays[date];
        if (holiday && holiday.id) {
            await db.collection('publicHolidays').doc(holiday.id).delete();
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error removing public holiday:', e);
        return false;
    }
}

function isPublicHoliday(dateStr) {
    if (isPermanentHoliday(dateStr)) {
        return true;
    }
    return publicHolidays[dateStr] !== undefined;
}

function getPublicHolidayName(dateStr) {
    if (isPermanentHoliday(dateStr)) {
        return getPermanentHolidayName(dateStr);
    }
    return publicHolidays[dateStr]?.name || 'Public Holiday';
}

// ========== LOAD BLOCKED DAYS ==========
async function loadBlockedDays(year, month) {
    if (!db || !firebaseConnected) {
        const key = `annualLeave_${year}_${month}`;
        const data = localStorage.getItem(key);
        if (data) {
            blockedDays = JSON.parse(data);
        } else {
            blockedDays = {};
        }
        return blockedDays;
    }
    
    try {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);
        
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];
        
        const query = db.collection('annualLeave')
            .where('date', '>=', startStr)
            .where('date', '<=', endStr);
            
        const snapshot = await query.get();
        blockedDays = {};
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const date = data.date;
            if (!blockedDays[date]) {
                blockedDays[date] = [];
            }
            blockedDays[date].push({
                staffId: data.staffId,
                staffName: data.staffName,
                type: data.type || 'annual',
                reason: data.reason || '',
                id: doc.id,
                startDate: data.startDate || date,
                endDate: data.endDate || date,
                blockId: data.blockId || `${data.staffId}_${data.startDate}_${data.endDate}`,
                leaveNumber: data.leaveNumber !== undefined ? data.leaveNumber : 0,
                isHoliday: data.isHoliday || false
            });
        });
        
        return blockedDays;
    } catch (e) {
        console.error('Error loading blocked days:', e);
        return {};
    }
}

// ========== SAVE SINGLE DAY ==========
async function saveSingleDay(staffId, date, type, reason = '') {
    const isHoliday = isPublicHoliday(date);
    const blockId = `${staffId}_${date}_${date}_${Date.now()}`;
    
    if (!db || !firebaseConnected) {
        const key = `annualLeave_${date.substring(0, 7)}`;
        let data = localStorage.getItem(key);
        let blocks = data ? JSON.parse(data) : {};
        if (!blocks[date]) blocks[date] = [];
        blocks[date].push({ 
            staffId, 
            staffName: getStaffById(staffId)?.name || staffId, 
            type,
            reason,
            startDate: date,
            endDate: date,
            blockId: blockId,
            leaveNumber: isHoliday ? 0 : 1,
            isHoliday: isHoliday
        });
        localStorage.setItem(key, JSON.stringify(blocks));
        return true;
    }
    
    try {
        await db.collection('annualLeave').add({
            staffId: staffId,
            staffName: getStaffById(staffId)?.name || staffId,
            date: date,
            startDate: date,
            endDate: date,
            type: type || 'annual',
            reason: reason || '',
            blockId: blockId,
            leaveNumber: isHoliday ? 0 : 1,
            isHoliday: isHoliday,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            allocatedBy: currentLoggedInStaff?.name || 'Admin'
        });
        return true;
    } catch (e) {
        console.error('Error saving single day:', e);
        return false;
    }
}

// ========== SAVE BLOCKED DAYS (RANGE) ==========
async function saveBlockedDays(staffId, startDate, endDate, type, reason = '') {
    const blockId = `${staffId}_${startDate}_${endDate}_${Date.now()}`;
    
    if (!db || !firebaseConnected) {
        let currentDate = new Date(startDate);
        const end = new Date(endDate);
        let workingDayCounter = 0;
        
        while (currentDate <= end) {
            const dateStr = formatDate(currentDate);
            const isHoliday = isPublicHoliday(dateStr);
            
            if (!isHoliday) {
                workingDayCounter++;
            }
            
            const key = `annualLeave_${dateStr.substring(0, 7)}`;
            let data = localStorage.getItem(key);
            let blocks = data ? JSON.parse(data) : {};
            if (!blocks[dateStr]) blocks[dateStr] = [];
            
            const existing = blocks[dateStr].some(b => b.staffId === staffId && b.blockId === blockId);
            if (!existing) {
                blocks[dateStr].push({ 
                    staffId, 
                    staffName: getStaffById(staffId)?.name || staffId, 
                    type,
                    reason,
                    startDate,
                    endDate,
                    blockId: blockId,
                    leaveNumber: isHoliday ? 0 : workingDayCounter,
                    isHoliday: isHoliday
                });
                localStorage.setItem(key, JSON.stringify(blocks));
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return true;
    }
    
    try {
        let currentDate = new Date(startDate);
        const end = new Date(endDate);
        let workingDayCounter = 0;
        let successCount = 0;
        
        while (currentDate <= end) {
            const dateStr = formatDate(currentDate);
            const isHoliday = isPublicHoliday(dateStr);
            
            if (!isHoliday) {
                workingDayCounter++;
            }
            
            const existing = blockedDays[dateStr] || [];
            const alreadyBlocked = existing.some(b => b.staffId === staffId && b.blockId === blockId);
            
            if (!alreadyBlocked) {
                await db.collection('annualLeave').add({
                    staffId: staffId,
                    staffName: getStaffById(staffId)?.name || staffId,
                    date: dateStr,
                    startDate: startDate,
                    endDate: endDate,
                    type: type || 'annual',
                    reason: reason || '',
                    blockId: blockId,
                    leaveNumber: isHoliday ? 0 : workingDayCounter,
                    isHoliday: isHoliday,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    allocatedBy: currentLoggedInStaff?.name || 'Admin'
                });
                successCount++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return successCount > 0;
    } catch (e) {
        console.error('Error saving blocked days:', e);
        return false;
    }
}

// ========== REMOVE BLOCKED DAYS (RANGE) ==========
async function removeBlockedDays(staffId, startDate, endDate) {
    if (!db || !firebaseConnected) {
        return true;
    }
    
    try {
        let removedCount = 0;
        let currentDate = new Date(startDate);
        const end = new Date(endDate);
        
        while (currentDate <= end) {
            const dateStr = formatDate(currentDate);
            const blocks = blockedDays[dateStr] || [];
            const blockToRemove = blocks.find(b => b.staffId === staffId);
            
            if (blockToRemove) {
                await db.collection('annualLeave').doc(blockToRemove.id).delete();
                removedCount++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return removedCount > 0;
    } catch (e) {
        console.error('Error removing blocked days:', e);
        return false;
    }
}

// ========== REMOVE SINGLE BLOCKED DAY ==========
async function removeBlockedDay(docId) {
    if (!db || !firebaseConnected) {
        return true;
    }
    
    try {
        await db.collection('annualLeave').doc(docId).delete();
        return true;
    } catch (e) {
        console.error('Error removing blocked day:', e);
        return false;
    }
}

// ========== GET ALL LEAVES FOR STAFF ==========
async function getStaffLeaves(staffId) {
    if (!db || !firebaseConnected) {
        return [];
    }
    
    try {
        const query = db.collection('annualLeave')
            .where('staffId', '==', staffId);
        const snapshot = await query.get();
        const leaves = [];
        snapshot.forEach(doc => {
            leaves.push({ id: doc.id, ...doc.data() });
        });
        return leaves;
    } catch (e) {
        console.error('Error getting staff leaves:', e);
        return [];
    }
}

// ========== REMOVE ALL LEAVES FOR STAFF ==========
async function removeAllStaffLeaves(staffId) {
    if (!db || !firebaseConnected) {
        return true;
    }
    
    try {
        const query = db.collection('annualLeave')
            .where('staffId', '==', staffId);
        const snapshot = await query.get();
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        return true;
    } catch (e) {
        console.error('Error removing all staff leaves:', e);
        return false;
    }
}

// ========== GET DAYS IN MONTH ==========
function getDaysInMonth(year, month) {
    const days = [];
    const daysCount = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    
    for (let i = 0; i < firstDay; i++) {
        days.push(null);
    }
    
    for (let i = 1; i <= daysCount; i++) {
        days.push(new Date(year, month, i));
    }
    
    return days;
}

// ========== FORMAT DATE ==========
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getMonthName(month) {
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return names[month];
}

function getDayName(date) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return names[date.getDay()];
}

// ========== RENDER STAFF VIEW ==========
function renderStaffView() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const days = getDaysInMonth(year, month);
    const tableBody = document.getElementById('tableBody');
    const tableHeader = document.getElementById('tableHeader');
    
    // ===== BUILD HEADER =====
    let headerHTML = `
        <th class="fixed-col">Name</th>
        <th class="fixed-col">RC No</th>
    `;
    
    const today = new Date();
    const todayStr = formatDate(today);
    
    days.forEach((day) => {
        if (day) {
            const dateStr = formatDate(day);
            const dayNum = day.getDate();
            const dayName = getDayName(day);
            const monthName = day.toLocaleString('en', { month: 'short' });
            const isHoliday = isPublicHoliday(dateStr);
            const isToday = dateStr === todayStr;
            
            // Determine if the day is Friday or Saturday
            const dayOfWeek = day.getDay();
            const isFriSat = dayOfWeek === 5 || dayOfWeek === 6;
            
            let headerText = `${dayName} ${dayNum}-${monthName}`;
            if (isHoliday && isFriSat) {
                headerText += ' 🎉';
            } else if (isHoliday) {
                headerText += ' 🎉';
            }
            
            headerHTML += `<th class="${isHoliday ? 'holiday-header' : ''} ${isToday ? 'today-header' : ''}" 
                              title="${dateStr}${isHoliday ? ' - ' + getPublicHolidayName(dateStr) : ''}">
                ${headerText}
            </th>`;
        } else {
            headerHTML += `<th></th>`;
        }
    });
    
    tableHeader.innerHTML = headerHTML;
    
    // ===== BUILD BODY =====
    const staffMap = new Map();
    staffData.forEach(staff => {
        if (!staffMap.has(staff.id)) {
            staffMap.set(staff.id, staff);
        }
    });
    const uniqueStaff = Array.from(staffMap.values());
    const sortedStaff = uniqueStaff.sort((a, b) => a.name.localeCompare(b.name));
    
    let bodyHTML = '';
    
    sortedStaff.forEach(staff => {
        bodyHTML += `<tr>`;
        bodyHTML += `<td class="fixed-col fixed-col-name">${staff.name}</td>`;
        bodyHTML += `<td class="fixed-col fixed-col-rc">${staff.id}</td>`;
        
        // Track the current leave block by blockId
        let currentBlockId = null;
        let currentBlockType = null;
        
        days.forEach((day) => {
            if (day) {
                const dateStr = formatDate(day);
                const dayNum = day.getDate();
                const blocks = blockedDays[dateStr] || [];
                const staffBlock = blocks.find(b => b.staffId === staff.id);
                const isHoliday = isPublicHoliday(dateStr);
                const isToday = dateStr === todayStr;
                const isWeekend = day.getDay() === 5 || day.getDay() === 6;
                const dayOfWeek = day.getDay();
                
                let cellClass = 'day-cell';
                let cellContent = '';
                let title = '';
                
                if (isToday) {
                    cellClass += ' day-today';
                }
                
                if (staffBlock) {
                    const typeInfo = LEAVE_TYPES[staffBlock.type] || LEAVE_TYPES['annual'];
                    
                    // Check if this is a new block
                    if (currentBlockId !== staffBlock.blockId) {
                        currentBlockId = staffBlock.blockId;
                        currentBlockType = staffBlock.type || 'annual';
                    }
                    
                    // Always use the leave type color for ALL days in the leave period
                    const blockType = currentBlockType || staffBlock.type || 'annual';
                    cellClass += ` block-${blockType}`;
                    
                    // Get the leave number from the stored data
                    const leaveNum = staffBlock.leaveNumber !== undefined ? staffBlock.leaveNumber : 0;
                    cellContent = leaveNum;
                    
                    if (isHoliday) {
                        title = `${staffBlock.staffName}: ${typeInfo.label} - HOLIDAY (${getPublicHolidayName(dateStr)}) - Day 0`;
                    } else {
                        // Determine if it's Friday or Saturday
                        const dayOfWeekCheck = new Date(dateStr).getDay();
                        if (dayOfWeekCheck === 5 || dayOfWeekCheck === 6) {
                            title = `${staffBlock.staffName}: ${typeInfo.label} - Weekend (Friday/Saturday) - Day 0`;
                            cellContent = 0;
                            cellClass += ' day-weekend';
                        } else {
                            title = `${staffBlock.staffName}: ${typeInfo.label} - Day ${leaveNum} of leave block`;
                        }
                    }
                    
                    if (staffBlock.reason) title += ` (${staffBlock.reason})`;
                    
                    if (isAdmin) {
                        cellContent = `<span class="blocked-cell clickable" 
                                      onclick="quickRemoveLeave('${staff.id}', '${dateStr}')"
                                      title="${title}">${cellContent}</span>`;
                    } else {
                        cellContent = `<span class="blocked-cell" title="${title}">${cellContent}</span>`;
                    }
                } else {
                    // No leave block - reset tracking
                    currentBlockId = null;
                    currentBlockType = null;
                    
                    if (isHoliday) {
                        cellClass += ' day-holiday';
                        cellContent = '';
                    } else {
                        if (isWeekend) {
                            cellClass += ' day-weekend';
                            cellContent = '';
                        } else {
                            if (isAdmin) {
                                cellContent = `<span class="add-cell" 
                                              onclick="quickAddLeave('${staff.id}', '${dateStr}')"
                                              title="Click to add leave for ${staff.name} on ${dateStr}">+</span>`;
                            } else {
                                cellContent = '';
                            }
                        }
                    }
                }
                
                bodyHTML += `<td class="${cellClass}" title="${title}">${cellContent}</td>`;
            } else {
                // Reset tracking for empty days
                currentBlockId = null;
                currentBlockType = null;
                bodyHTML += `<td></td>`;
            }
        });
        
        bodyHTML += `</tr>`;
    });
    
    tableBody.innerHTML = bodyHTML;
    
    document.getElementById('currentMonthDisplay').textContent = `${getMonthName(month)} ${year}`;
    updateLegend();
}

// ========== UPDATE LEGEND ==========
function updateLegend() {
    const legendItems = document.getElementById('legendItems');
    
    let html = `
        <div class="legend-item">
            <span class="color-box available"></span>
            <span>Available</span>
        </div>
        <div class="legend-item">
            <span class="color-box holiday"></span>
            <span>Public Holiday (No Leave)</span>
        </div>
        <div class="legend-item">
            <span class="color-box weekend"></span>
            <span>Weekend (Fri/Sat - 0)</span>
        </div>
    `;
    
    if (isAdmin) {
        html += `
            <div class="legend-item">
                <span class="color-box add-legend"></span>
                <span>Click + to add</span>
            </div>
            <div class="legend-item">
                <span class="color-box remove-legend"></span>
                <span>Click number to remove</span>
            </div>
        `;
    }
    
    Object.entries(LEAVE_TYPES).forEach(([key, value]) => {
        html += `
            <div class="legend-item">
                <span class="color-box ${key}"></span>
                <span>${value.label}</span>
            </div>
        `;
    });
    
    legendItems.innerHTML = html;
}

// ========== QUICK ADD/REMOVE FUNCTIONS ==========
window.quickAddLeave = async function(staffId, date) {
    if (!isAdmin) {
        showTemporaryFeedback('⚠️ Only admins can add leave', true);
        return;
    }
    
    const staff = getStaffById(staffId);
    if (!staff) {
        showTemporaryFeedback('❌ Staff not found', true);
        return;
    }
    
    const types = Object.entries(LEAVE_TYPES).map(([key, value]) => 
        `${key}: ${value.label}`
    ).join('\n');
    
    const typeInput = prompt(
        `Add leave for ${staff.name} on ${date}\n\nSelect leave type:\n${types}\n\nEnter type name (annual/sick/frl/training/other):`,
        'annual'
    );
    
    if (typeInput === null) return;
    
    const type = typeInput.trim().toLowerCase();
    if (!LEAVE_TYPES[type]) {
        showTemporaryFeedback('❌ Invalid leave type', true);
        return;
    }
    
    const reason = prompt('Enter reason (optional):', '');
    
    showLoadingPopup('Adding leave...', `Adding leave for ${staff.name}`);
    
    const success = await saveSingleDay(staffId, date, type, reason || '');
    
    hideLoadingPopup();
    
    if (success) {
        const isHoliday = isPublicHoliday(date);
        showTemporaryFeedback(`✅ Leave added for ${staff.name} on ${date}${isHoliday ? ' (Holiday - 0)' : ''}`);
        await loadBlockedDays(currentMonth.getFullYear(), currentMonth.getMonth());
        renderCurrentView();
        updateStats();
        updateStaffLeaveSummary();
    } else {
        showTemporaryFeedback('❌ Failed to add leave', true);
    }
};

window.quickRemoveLeave = async function(staffId, date) {
    if (!isAdmin) {
        showTemporaryFeedback('⚠️ Only admins can remove leave', true);
        return;
    }
    
    const staff = getStaffById(staffId);
    if (!staff) {
        showTemporaryFeedback('❌ Staff not found', true);
        return;
    }
    
    const blocks = blockedDays[date] || [];
    const blockToRemove = blocks.find(b => b.staffId === staffId);
    
    if (!blockToRemove) {
        showTemporaryFeedback(`⚠️ No leave found for ${staff.name} on ${date}`, true);
        return;
    }
    
    if (!confirm(`Remove leave for ${staff.name} on ${date}?`)) {
        return;
    }
    
    showLoadingPopup('Removing leave...', `Removing leave for ${staff.name}`);
    
    const success = await removeBlockedDay(blockToRemove.id);
    
    hideLoadingPopup();
    
    if (success) {
        showTemporaryFeedback(`✅ Leave removed for ${staff.name} on ${date}`);
        await loadBlockedDays(currentMonth.getFullYear(), currentMonth.getMonth());
        renderCurrentView();
        updateStats();
        updateStaffLeaveSummary();
    } else {
        showTemporaryFeedback('❌ Failed to remove leave', true);
    }
};

// ========== RENDER CALENDAR VIEW ==========
function renderCalendarView() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const days = getDaysInMonth(year, month);
    const container = document.getElementById('calendarGrid');
    
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const todayStr = formatDate(today);
    
    let html = '';
    
    weekDays.forEach(day => {
        html += `<div class="calendar-header">${day}</div>`;
    });
    
    days.forEach((day) => {
        if (day) {
            const dateStr = formatDate(day);
            const blocks = blockedDays[dateStr] || [];
            const isHoliday = isPublicHoliday(dateStr);
            const isToday = dateStr === todayStr;
            const isWeekend = day.getDay() === 5 || day.getDay() === 6;
            const dayOfWeek = day.getDay();
            
            let dayClass = 'calendar-day';
            if (isToday) dayClass += ' today';
            if (isHoliday && blocks.length === 0) dayClass += ' holiday';
            if (isWeekend && blocks.length === 0) dayClass += ' weekend';
            
            html += `<div class="${dayClass}">`;
            html += `<div class="day-number">${day.getDate()}</div>`;
            if (isHoliday && blocks.length === 0) {
                html += `<div class="holiday-name">🎉 ${getPublicHolidayName(dateStr)}</div>`;
            }
            html += `<div class="day-blocks">`;
            
            blocks.forEach(block => {
                const typeInfo = LEAVE_TYPES[block.type] || LEAVE_TYPES['annual'];
                const leaveNum = block.leaveNumber !== undefined ? block.leaveNumber : '✓';
                html += `<div class="block-item block-${block.type || 'annual'}">${block.staffName} (${typeInfo.label}) ${leaveNum}</div>`;
            });
            
            html += `</div></div>`;
        } else {
            html += `<div class="calendar-day" style="background: transparent; border: none;"></div>`;
        }
    });
    
    container.innerHTML = html;
}

// ========== TOGGLE VIEW ==========
function toggleView(view) {
    const staffView = document.getElementById('staffView');
    const calendarView = document.getElementById('calendarView');
    const buttons = document.querySelectorAll('.view-btn');
    
    buttons.forEach(btn => btn.classList.remove('active'));
    
    if (view === 'staff') {
        staffView.style.display = 'block';
        calendarView.style.display = 'none';
        document.querySelector('[data-view="staff"]').classList.add('active');
        renderStaffView();
    } else {
        staffView.style.display = 'none';
        calendarView.style.display = 'block';
        document.querySelector('[data-view="calendar"]').classList.add('active');
        renderCalendarView();
    }
}

// ========== ADMIN FUNCTIONS ==========
function loadAdminPanel() {
    const session = getSession();
    if (session && session.role === 'Admin') {
        document.getElementById('adminPanel').style.display = 'block';
        document.getElementById('holidayPanel').style.display = 'block';
        populateAdminStaffSelect();
        isAdmin = true;
        updateStaffLeaveSummary();
        renderHolidayList();
        renderCurrentView();
    }
}

function populateAdminStaffSelect() {
    const select = document.getElementById('adminStaffSelect');
    select.innerHTML = '<option value="">Select Staff</option>';
    
    const staffMap = new Map();
    staffData.forEach(staff => {
        if (!staffMap.has(staff.id)) {
            staffMap.set(staff.id, staff);
        }
    });
    const uniqueStaff = Array.from(staffMap.values());
    const sortedStaff = uniqueStaff.sort((a, b) => a.name.localeCompare(b.name));
    
    sortedStaff.forEach(staff => {
        const option = document.createElement('option');
        option.value = staff.id;
        option.textContent = `${staff.name} (${staff.id})`;
        select.appendChild(option);
    });
    
    select.addEventListener('change', updateStaffLeaveSummary);
}

async function updateStaffLeaveSummary() {
    const staffId = document.getElementById('adminStaffSelect').value;
    const summaryList = document.getElementById('staffLeaveSummaryList');
    const countDisplay = document.getElementById('selectedStaffLeaveCount');
    
    if (!staffId) {
        summaryList.innerHTML = '<div class="summary-empty">Select a staff to view their leave summary</div>';
        countDisplay.textContent = '0';
        return;
    }
    
    const leaves = await getStaffLeaves(staffId);
    const staff = getStaffById(staffId);
    
    countDisplay.textContent = leaves.length;
    
    if (leaves.length === 0) {
        summaryList.innerHTML = `<div class="summary-empty">${staff?.name || 'Staff'} has no allocated leave</div>`;
        return;
    }
    
    let html = '';
    // Group leaves by blockId
    const groupedBlocks = {};
    leaves.forEach(leave => {
        const blockId = leave.blockId || `${leave.startDate}_${leave.endDate}`;
        if (!groupedBlocks[blockId]) {
            groupedBlocks[blockId] = {
                startDate: leave.startDate,
                endDate: leave.endDate,
                type: leave.type,
                leaves: [],
                reason: leave.reason
            };
        }
        groupedBlocks[blockId].leaves.push(leave);
    });
    
    Object.values(groupedBlocks).forEach(block => {
        const typeInfo = LEAVE_TYPES[block.type] || LEAVE_TYPES['annual'];
        const dateDisplay = `${block.startDate} → ${block.endDate}`;
        // Sort leaves by leaveNumber
        block.leaves.sort((a, b) => (a.leaveNumber || 0) - (b.leaveNumber || 0));
        const workingDays = block.leaves.filter(l => l.leaveNumber !== 0).length;
        const totalDays = block.leaves.length;
        html += `
            <div class="summary-item">
                <span class="date-range">${dateDisplay} (${workingDays} working days / ${totalDays} total days)</span>
                <span class="leave-type ${block.type || 'annual'}">${typeInfo.label}</span>
                ${block.reason ? `<span style="font-size:0.65rem;color:var(--text-muted)">${block.reason}</span>` : ''}
                <button class="remove-btn" onclick="removeLeaveBlock('${block.startDate}', '${block.endDate}')" title="Remove this leave block">✕</button>
            </div>
        `;
    });
    
    summaryList.innerHTML = html;
}

// ========== REMOVE LEAVE BLOCK ==========
window.removeLeaveBlock = async function(startDate, endDate) {
    const staffId = document.getElementById('adminStaffSelect').value;
    if (!staffId) return;
    
    const staff = getStaffById(staffId);
    if (!confirm(`Remove all leave for ${staff?.name} from ${startDate} to ${endDate}?`)) {
        return;
    }
    
    showLoadingPopup('Removing leave block...', 'Please wait');
    
    const success = await removeBlockedDays(staffId, startDate, endDate);
    
    hideLoadingPopup();
    
    if (success) {
        showTemporaryFeedback('✅ Leave block removed successfully');
        await loadBlockedDays(currentMonth.getFullYear(), currentMonth.getMonth());
        renderCurrentView();
        updateStats();
        updateStaffLeaveSummary();
    } else {
        showTemporaryFeedback('❌ Failed to remove leave block', true);
    }
};

// ========== HOLIDAY FUNCTIONS ==========
function renderHolidayList() {
    const container = document.getElementById('holidayList');
    const dates = Object.keys(publicHolidays).sort();
    
    if (dates.length === 0) {
        container.innerHTML = '<div class="empty-state">No additional public holidays added</div>';
        return;
    }
    
    let html = '';
    dates.forEach(date => {
        html += `
            <div class="holiday-item">
                <span class="holiday-date">${date}</span>
                <span class="holiday-name">🎉 ${publicHolidays[date].name}</span>
                <button class="remove-btn" onclick="removeHoliday('${date}')" title="Remove holiday">✕</button>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

window.removeHoliday = async function(date) {
    if (!confirm(`Remove public holiday on ${date}?`)) return;
    
    const success = await removePublicHoliday(date);
    if (success) {
        showTemporaryFeedback('✅ Public holiday removed');
        await loadPublicHolidays();
        renderHolidayList();
        renderCurrentView();
        updateStats();
    } else {
        showTemporaryFeedback('❌ Failed to remove holiday', true);
    }
};

async function addHoliday() {
    const date = document.getElementById('holidayDate').value;
    const name = document.getElementById('holidayName').value.trim();
    
    if (!date) {
        showHolidayFeedback('Please select a date', 'error');
        return;
    }
    
    if (!name) {
        showHolidayFeedback('Please enter a holiday name', 'error');
        return;
    }
    
    if (isPermanentHoliday(date)) {
        showHolidayFeedback('Friday and Saturday are permanent holidays!', 'error');
        return;
    }
    
    if (isPublicHoliday(date)) {
        showHolidayFeedback('This date is already a public holiday', 'error');
        return;
    }
    
    const success = await addPublicHoliday(date, name);
    if (success) {
        showHolidayFeedback('✅ Public holiday added successfully!', 'success');
        await loadPublicHolidays();
        renderHolidayList();
        renderCurrentView();
        updateStats();
        document.getElementById('holidayDate').value = '';
        document.getElementById('holidayName').value = '';
    } else {
        showHolidayFeedback('❌ Failed to add public holiday', 'error');
    }
}

function showHolidayFeedback(message, type) {
    const feedback = document.getElementById('holidayFeedback');
    feedback.textContent = message;
    feedback.className = 'form-feedback ' + type;
    feedback.style.display = 'block';
    setTimeout(() => { feedback.style.display = 'none'; }, 4000);
}

// ========== ALLOCATE LEAVE ==========
async function allocateLeave() {
    const staffId = document.getElementById('adminStaffSelect').value;
    const startDate = document.getElementById('adminStartDate').value;
    const endDate = document.getElementById('adminEndDate').value;
    const type = document.getElementById('adminLeaveType').value;
    const reason = document.getElementById('adminLeaveReason').value;
    
    if (!staffId) {
        showFormFeedback('Please select a staff member', 'error');
        return;
    }
    
    if (!startDate || !endDate) {
        showFormFeedback('Please select start and end dates', 'error');
        return;
    }
    
    if (startDate > endDate) {
        showFormFeedback('Start date must be before end date', 'error');
        return;
    }
    
    const staff = getStaffById(staffId);
    
    // Calculate total days in range (including holidays)
    let totalDays = 0;
    let currentDate = new Date(startDate);
    const end = new Date(endDate);
    while (currentDate <= end) {
        totalDays++;
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Check for conflicts
    let conflicts = 0;
    currentDate = new Date(startDate);
    while (currentDate <= end) {
        const dateStr = formatDate(currentDate);
        const blocks = blockedDays[dateStr] || [];
        if (blocks.some(b => b.staffId === staffId)) {
            conflicts++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    if (conflicts > 0) {
        if (!confirm(`${conflicts} day(s) out of ${totalDays} days already have leave allocated.\nDo you want to continue?`)) {
            return;
        }
    }
    
    showLoadingPopup('Allocating leave...', `Processing ${totalDays} days for ${staff?.name}`);
    
    const success = await saveBlockedDays(staffId, startDate, endDate, type, reason);
    
    hideLoadingPopup();
    
    if (success) {
        showFormFeedback(`✅ Leave allocated successfully for ${totalDays} days!`, 'success');
        await loadBlockedDays(currentMonth.getFullYear(), currentMonth.getMonth());
        renderCurrentView();
        updateStats();
        updateStaffLeaveSummary();
        document.getElementById('adminStartDate').value = '';
        document.getElementById('adminEndDate').value = '';
        document.getElementById('adminLeaveReason').value = '';
    } else {
        showFormFeedback('❌ No new days were allocated', 'error');
    }
}

// ========== REMOVE LEAVE (RANGE) ==========
async function removeLeave() {
    const staffId = document.getElementById('adminStaffSelect').value;
    const startDate = document.getElementById('adminStartDate').value;
    const endDate = document.getElementById('adminEndDate').value;
    
    if (!staffId) {
        showFormFeedback('Please select a staff member', 'error');
        return;
    }
    
    if (!startDate || !endDate) {
        showFormFeedback('Please select start and end dates', 'error');
        return;
    }
    
    if (startDate > endDate) {
        showFormFeedback('Start date must be before end date', 'error');
        return;
    }
    
    const staff = getStaffById(staffId);
    if (!confirm(`Remove all leave allocations for ${staff?.name} from ${startDate} to ${endDate}?`)) {
        return;
    }
    
    showLoadingPopup('Removing leave...', 'Please wait');
    
    const success = await removeBlockedDays(staffId, startDate, endDate);
    
    hideLoadingPopup();
    
    if (success) {
        showFormFeedback(`✅ Leave removed successfully!`, 'success');
        await loadBlockedDays(currentMonth.getFullYear(), currentMonth.getMonth());
        renderCurrentView();
        updateStats();
        updateStaffLeaveSummary();
    } else {
        showFormFeedback('❌ No leave found to remove in this range', 'error');
    }
}

// ========== REMOVE SINGLE LEAVE ==========
window.removeSingleLeave = async function(docId) {
    if (!confirm('Remove this leave allocation?')) return;
    
    const success = await removeBlockedDay(docId);
    if (success) {
        showTemporaryFeedback('✅ Leave removed successfully');
        await loadBlockedDays(currentMonth.getFullYear(), currentMonth.getMonth());
        renderCurrentView();
        updateStats();
        updateStaffLeaveSummary();
    } else {
        showTemporaryFeedback('❌ Failed to remove leave', true);
    }
};

// ========== CLEAR ALL STAFF LEAVES ==========
async function clearAllStaffLeaves() {
    const staffId = document.getElementById('adminStaffSelect').value;
    
    if (!staffId) {
        showFormFeedback('Please select a staff member', 'error');
        return;
    }
    
    const staff = getStaffById(staffId);
    if (!confirm(`Remove ALL leave allocations for ${staff?.name}? This cannot be undone.`)) {
        return;
    }
    
    showLoadingPopup('Removing all leave...', 'Please wait');
    
    const success = await removeAllStaffLeaves(staffId);
    
    hideLoadingPopup();
    
    if (success) {
        showFormFeedback(`✅ All leave removed for ${staff?.name}!`, 'success');
        await loadBlockedDays(currentMonth.getFullYear(), currentMonth.getMonth());
        renderCurrentView();
        updateStats();
        updateStaffLeaveSummary();
    } else {
        showFormFeedback('❌ Failed to remove leave', 'error');
    }
}

// ========== UPDATE STATS ==========
function updateStats() {
    const totalBlocks = Object.values(blockedDays).reduce((sum, arr) => sum + arr.length, 0);
    const staffWithBlocks = new Set();
    Object.values(blockedDays).forEach(arr => {
        arr.forEach(b => staffWithBlocks.add(b.staffId));
    });
    
    document.getElementById('totalAllocated').textContent = totalBlocks;
    document.getElementById('staffWithLeave').textContent = staffWithBlocks.size;
}

// ========== RENDER CURRENT VIEW ==========
function renderCurrentView() {
    const activeView = document.querySelector('.view-btn.active');
    if (activeView) {
        const view = activeView.dataset.view;
        if (view === 'staff') {
            renderStaffView();
        } else {
            renderCalendarView();
        }
    }
}

// ========== CHANGE MONTH ==========
function changeMonth(delta) {
    currentMonth.setMonth(currentMonth.getMonth() + delta);
    Promise.all([
        loadBlockedDays(currentMonth.getFullYear(), currentMonth.getMonth()),
        loadPublicHolidays()
    ]).then(() => {
        renderCurrentView();
        updateStats();
        renderHolidayList();
    });
}

function goToToday() {
    currentMonth = new Date();
    Promise.all([
        loadBlockedDays(currentMonth.getFullYear(), currentMonth.getMonth()),
        loadPublicHolidays()
    ]).then(() => {
        renderCurrentView();
        updateStats();
        renderHolidayList();
    });
}

// ========== FORM FEEDBACK ==========
function showFormFeedback(message, type) {
    const feedback = document.getElementById('adminFeedback');
    feedback.textContent = message;
    feedback.className = 'form-feedback ' + type;
    feedback.style.display = 'block';
    setTimeout(() => { feedback.style.display = 'none'; }, 4000);
}

// ========== TOAST ==========
function showTemporaryFeedback(message, isError = false) {
    const toast = document.getElementById('messageToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'message-toast' + (isError ? ' error' : '');
    toast.style.display = 'block';
    toast.style.opacity = '1';
    setTimeout(() => { 
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 3000);
}

// ========== LOADING POPUP ==========
function showLoadingPopup(title, subtitle) {
    const popup = document.getElementById('loadingPopup');
    const spinner = document.getElementById('loadingSpinner');
    const titleEl = document.getElementById('loadingTitle');
    const subtitleEl = document.getElementById('loadingSubtitle');
    spinner.style.display = 'block';
    titleEl.textContent = title || 'Processing...';
    subtitleEl.textContent = subtitle || 'Please wait';
    popup.classList.add('active');
}

function hideLoadingPopup() {
    document.getElementById('loadingPopup').classList.remove('active');
}

// ========== INIT ==========
async function initApp() {
    console.log('🚀 Initializing Annual Leave...');
    initFirebase();
    
    const rawStaff = staffList || [];
    const staffMap = new Map();
    rawStaff.forEach(staff => {
        if (!staffMap.has(staff.id)) {
            staffMap.set(staff.id, staff);
        }
    });
    staffData = Array.from(staffMap.values());
    
    console.log('📊 Raw staff count:', rawStaff.length);
    console.log('📊 Unique staff count:', staffData.length);
    
    const session = getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }
    
    currentLoggedInStaff = session;
    document.getElementById('profileShortName').textContent = session.name.split(' ')[0];
    document.getElementById('profileAvatar').textContent = session.name.charAt(0).toUpperCase();
    
    const statusEl = document.getElementById('sessionStatus');
    if (statusEl) {
        statusEl.style.display = 'block';
        document.getElementById('sessionUserName').textContent = session.name;
        document.getElementById('sessionUserRole').textContent = session.role;
    }
    
    await Promise.all([
        loadBlockedDays(currentMonth.getFullYear(), currentMonth.getMonth()),
        loadPublicHolidays()
    ]);
    
    renderStaffView();
    updateStats();
    loadAdminPanel();
    renderHolidayList();
    
    document.getElementById('prevMonthBtn').addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonthBtn').addEventListener('click', () => changeMonth(1));
    document.getElementById('todayBtn').addEventListener('click', goToToday);
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toggleView(btn.dataset.view);
        });
    });
    
    document.getElementById('allocateLeaveBtn').addEventListener('click', allocateLeave);
    document.getElementById('removeLeaveBtn').addEventListener('click', removeLeave);
    document.getElementById('clearStaffLeavesBtn').addEventListener('click', clearAllStaffLeaves);
    document.getElementById('addHolidayBtn').addEventListener('click', addHoliday);
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('adminStartDate').value = today;
    document.getElementById('adminEndDate').value = today;
    document.getElementById('holidayDate').value = today;
    
    const profileBtn = document.getElementById('profileButton');
    const profileMenu = document.getElementById('profileMenu');
    if (profileBtn) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('show');
        });
    }
    document.addEventListener('click', () => {
        if (profileMenu) profileMenu.classList.remove('show');
    });
    
    document.getElementById('profileViewAction').onclick = () => {
        if (currentLoggedInStaff) {
            alert(`👤 ${currentLoggedInStaff.name}\nRole: ${currentLoggedInStaff.role}\nID: ${currentLoggedInStaff.id}\nContact: ${currentLoggedInStaff.contact || 'N/A'}`);
        }
        if (profileMenu) profileMenu.classList.remove('show');
    };
    
    document.getElementById('logoutAction').addEventListener('click', function(e) {
        e.stopPropagation();
        localStorage.removeItem(SESSION_KEY);
        window.location.href = 'index.html';
        if (profileMenu) profileMenu.classList.remove('show');
    });
    
    console.log('✅ Annual Leave initialized');
}

document.addEventListener('DOMContentLoaded', initApp);
