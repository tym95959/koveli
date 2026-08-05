const API_URL = 'https://your-backend-url.vercel.app/api';

// Check authentication
if (!checkAuth()) {
    window.location.href = 'login.html';
}

// Display user info
const user = getUser();
if (user) {
    document.getElementById('userInfo').textContent = `Welcome, ${user.username}`;
}

// Load tables on page load
document.addEventListener('DOMContentLoaded', loadTables);

async function loadTables() {
    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/admin/tables`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load tables');
        }
        
        const tables = await response.json();
        const tableList = document.getElementById('tableList');
        tableList.innerHTML = '';
        
        tables.forEach(table => {
            const div = document.createElement('div');
            div.className = 'table-item';
            div.innerHTML = `
                <span onclick="loadTableData('${table.name}')">${table.name}</span>
                <span style="color: #666; font-size: 0.9em;">${table.rowCount} rows</span>
                <div class="table-actions">
                    <button onclick="event.stopPropagation(); confirmDeleteTable('${table.name}')" 
                            class="btn-danger" style="padding: 2px 6px; font-size: 0.8em;">×</button>
                </div>
            `;
            tableList.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading tables:', error);
    }
}

async function loadTableData(tableName) {
    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/admin/tables/${tableName}/data`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load table data');
        }
        
        const data = await response.json();
        displayTableData(tableName, data);
        
        // Highlight selected table
        document.querySelectorAll('.table-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.table-item').forEach(el => {
            if (el.textContent.includes(tableName)) {
                el.classList.add('active');
            }
        });
    } catch (error) {
        console.error('Error loading table data:', error);
    }
}

function displayTableData(tableName, data) {
    const mainContent = document.getElementById('tableData');
    
    if (data.data.length === 0) {
        mainContent.innerHTML = `
            <div class="table-actions-header">
                <h2>${tableName}</h2>
                <div class="data-actions">
                    <button onclick="showAddDataModal('${tableName}')" class="btn-primary">Add Record</button>
                </div>
            </div>
            <p>No data in this table.</p>
        `;
        return;
    }
    
    const columns = Object.keys(data.data[0]);
    
    let html = `
        <div class="table-actions-header">
            <h2>${tableName}</h2>
            <div class="data-actions">
                <button onclick="showAddDataModal('${tableName}')" class="btn-primary">Add Record</button>
            </div>
        </div>
        <div class="data-table">
            <table>
                <thead>
                    <tr>
                        ${columns.map(col => `<th>${col}</th>`).join('')}
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    data.data.forEach(row => {
        html += '<tr>';
        columns.forEach(col => {
            html += `<td>${row[col] !== null ? row[col] : 'NULL'}</td>`;
        });
        html += `
            <td>
                <button onclick="editRecord('${tableName}', ${row.id})" class="btn-edit">Edit</button>
                <button onclick="deleteRecord('${tableName}', ${row.id})" class="btn-delete">Delete</button>
            </td>
        </tr>`;
    });
    
    html += '</tbody></table></div>';
    mainContent.innerHTML = html;
}

function showCreateTableModal() {
    document.getElementById('createTableModal').classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function addColumn() {
    const container = document.getElementById('columnsContainer');
    const div = document.createElement('div');
    div.className = 'column-input';
    div.innerHTML = `
        <input type="text" placeholder="Column Name" class="col-name">
        <select class="col-type">
            <option value="VARCHAR(255)">VARCHAR(255)</option>
            <option value="TEXT">TEXT</option>
            <option value="INTEGER">INTEGER</option>
            <option value="BIGINT">BIGINT</option>
            <option value="DECIMAL(10,2)">DECIMAL(10,2)</option>
            <option value="BOOLEAN">BOOLEAN</option>
            <option value="TIMESTAMP">TIMESTAMP</option>
            <option value="DATE">DATE</option>
        </select>
        <label><input type="checkbox" class="col-notnull"> NOT NULL</label>
        <button type="button" onclick="removeColumn(this)" class="btn-danger">×</button>
    `;
    container.appendChild(div);
}

function removeColumn(button) {
    button.parentElement.remove();
}

document.getElementById('createTableForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const tableName = document.getElementById('tableName').value;
    const columnInputs = document.querySelectorAll('.column-input');
    const columns = [];
    
    columnInputs.forEach(input => {
        const name = input.querySelector('.col-name').value;
        const type = input.querySelector('.col-type').value;
        const notNull = input.querySelector('.col-notnull').checked;
        
        if (name) {
            columns.push({ name, type, notNull });
        }
    });
    
    if (columns.length === 0) {
        alert('Please add at least one column');
        return;
    }
    
    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/admin/tables`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ tableName, columns })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create table');
        }
        
        alert('Table created successfully!');
        closeModal('createTableModal');
        document.getElementById('createTableForm').reset();
        document.getElementById('columnsContainer').innerHTML = '';
        addColumn(); // Add default column input
        loadTables();
    } catch (error) {
        alert('Error: ' + error.message);
    }
});

async function confirmDeleteTable(tableName) {
    if (!confirm(`Are you sure you want to delete table "${tableName}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/admin/tables/${tableName}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete table');
        }
        
        alert('Table deleted successfully');
        loadTables();
        document.getElementById('tableData').innerHTML = '<h2>Select a table from the sidebar</h2>';
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function showAddDataModal(tableName) {
    const modal = document.getElementById('addDataModal');
    const fields = document.getElementById('dataFields');
    fields.innerHTML = '';
    
    // Get table columns from current display
    const table = document.querySelector('.data-table table');
    if (table) {
        const headers = table.querySelectorAll('thead th');
        const columnNames = [];
        headers.forEach((th, index) => {
            const text = th.textContent.trim();
            if (text !== 'Actions' && text !== 'id') {
                columnNames.push(text);
            }
        });
        
        columnNames.forEach(col => {
            const div = document.createElement('div');
            div.className = 'form-group';
            div.innerHTML = `
                <label>${col}</label>
                <input type="text" name="${col}" placeholder="Enter ${col}">
            `;
            fields.appendChild(div);
        });
    }
    
    document.getElementById('addDataForm').dataset.tableName = tableName;
    modal.classList.remove('hidden');
}

document.getElementById('addDataForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const tableName = e.target.dataset.tableName;
    const formData = new FormData(e.target);
    const data = {};
    
    formData.forEach((value, key) => {
        if (value.trim()) {
            data[key] = value;
        }
    });
    
    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/admin/tables/${tableName}/data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error('Failed to add data');
        }
        
        alert('Record added successfully');
        closeModal('addDataModal');
        loadTableData(tableName);
    } catch (error) {
        alert('Error: ' + error.message);
    }
});

async function deleteRecord(tableName, id) {
    if (!confirm('Are you sure you want to delete this record?')) {
        return;
    }
    
    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/admin/tables/${tableName}/data/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete record');
        }
        
        alert('Record deleted successfully');
        loadTableData(tableName);
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function editRecord(tableName, id) {
    // Find the row and create edit form
    const row = document.querySelector(`tr:has(td:contains("${id}"))`);
    if (!row) return;
    
    const cells = row.querySelectorAll('td');
    const columns = [];
    cells.forEach((cell, index) => {
        if (index < cells.length - 1) {
            columns.push({
                name: document.querySelectorAll('thead th')[index].textContent.trim(),
                value: cell.textContent
            });
        }
    });
    
    // Create inline edit
    const editHtml = `
        <div class="edit-form">
            ${columns.map(col => `
                <div class="form-group" style="display: inline-block; margin: 5px;">
                    <label>${col.name}</label>
                    <input type="text" value="${col.value}" data-col="${col.name}">
                </div>
            `).join('')}
            <button onclick="saveEdit('${tableName}', ${id})" class="btn-primary">Save</button>
            <button onclick="cancelEdit()" class="btn-secondary">Cancel</button>
        </div>
    `;
    
    // Replace row with edit form
    row.innerHTML = `<td colspan="${columns.length + 1}">${editHtml}</td>`;
}

async function saveEdit(tableName, id) {
    const inputs = document.querySelectorAll('.edit-form input');
    const data = {};
    inputs.forEach(input => {
        data[input.dataset.col] = input.value;
    });
    
    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/admin/tables/${tableName}/data/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error('Failed to update record');
        }
        
        alert('Record updated successfully');
        loadTableData(tableName);
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function cancelEdit() {
    // Reload table data
    const activeTable = document.querySelector('.table-item.active span');
    if (activeTable) {
        loadTableData(activeTable.textContent);
    }
}
