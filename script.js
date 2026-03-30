const themeToggle = document.getElementById('themeToggle');
const menuSelect = document.getElementById('menuSelect');
const sharingSelect = document.getElementById('sharingSelect'); // NEW
const fileInput = document.getElementById('csvFile');
const clearButton = document.getElementById('clearFile');
const table = document.getElementById('resultTable');
const tbody = table.querySelector('tbody');
const downloadContainer = document.getElementById('downloadContainer');
const filterCheckbox = document.getElementById('filterCheckbox');
const showAllCheckbox = document.getElementById('showAllCheckbox');
const listNamesCheckbox = document.getElementById('listNamesCheckbox');
const showInvalidCheckbox = document.getElementById('showInvalidCheckbox');

let csvData = null;
const allowedCharRegex = /[a-zA-Z0-9@:!#$%&'()*+,-.=?_|~\/À-ÿ \u00A0\u2000-\u200B]/;

// --- Theme Management ---
themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode', !isDark);
    themeToggle.innerText = isDark ? 'Dark mode: On' : 'Dark mode: Off';
    updateLayoutColors();
});

function updateLayoutColors(){
    const isDark = document.body.classList.contains('dark-mode');
    table.style.backgroundColor = isDark ? '#2c2c2c' : '#ffffff';
    table.style.color = isDark ? '#f4f4f4' : '#1e1e1e';
    ['comboOptions','nameValidation', 'filterSection', 'sharingFilterSection'].forEach(id=>{
        const el=document.getElementById(id);
        if(el){
            el.style.backgroundColor = isDark ? '#2c2c2c' : '#f4f4f4';
            el.style.color = isDark ? '#f4f4f4' : '#1e1e1e';
        }
    });
}

// --- File Handling ---
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        csvData = e.target.result;
        updateDropdownFilters(); // Changed to handle multiple dropdowns
        renderTable();
    };
    reader.readAsText(file);
});

clearButton.addEventListener('click', () => {
    csvData = null;
    fileInput.value = '';
    tbody.innerHTML = '';
    table.style.display = 'none';
    downloadContainer.style.display = 'none';
    menuSelect.innerHTML = '<option value="All">-- All Menus --</option>';
    sharingSelect.innerHTML = '<option value="All">-- All Statuses --</option>'; // Reset Sharing Dropdown
});

// --- CSV Parsing ---
function parseCSVLine(line) {
    const result = []; let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char == '"') inQuotes = !inQuotes;
        else if (char == ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += char; }
    }
    result.push(current.trim());
    return result;
}

// --- Helper: Clean Menu Name ---
function extractRootMenu(segment) {
    let root = segment.split(/(?<!\\\\)\//)[0].trim();
    return root.replace(/\\\\([,/])/g, '$1');
}

// --- Populate Dropdown Filters ---
function updateDropdownFilters() {
    const rows = csvData.trim().split(/\r?\n/).map(parseCSVLine);
    const header = rows[0].map(h => h.trim());
    
    const idxMenu = header.indexOf('Menu/Screen');
    const idxSharing = header.findIndex(h => h.toLowerCase() === 'sharing status');

    // Populate Menu Dropdown
    if (idxMenu !== -1) {
        const uniqueRootMenus = new Set();
        for (let i = 1; i < rows.length; i++) {
            const rawValue = rows[i][idxMenu];
            if (!rawValue) continue;
            
            const segments = rawValue.split(/(?<!\\\\),/);
            segments.forEach(seg => {
                const rootMenu = extractRootMenu(seg);
                if (rootMenu) uniqueRootMenus.add(rootMenu);
            });
        }

        menuSelect.innerHTML = '<option value="All">-- All Menus --</option>';
        Array.from(uniqueRootMenus).sort().forEach(menu => {
            const opt = document.createElement('option');
            opt.value = menu; opt.innerText = menu; menuSelect.appendChild(opt);
        });
    }

    // Populate Sharing Dropdown
    if (idxSharing !== -1) {
        const uniqueSharingStatuses = new Set();
        for (let i = 1; i < rows.length; i++) {
            const rawValue = rows[i][idxSharing];
            if (rawValue) uniqueSharingStatuses.add(rawValue.trim());
        }

        sharingSelect.innerHTML = '<option value="All">-- All Statuses --</option>';
        Array.from(uniqueSharingStatuses).sort().forEach(status => {
            const opt = document.createElement('option');
            opt.value = status; opt.innerText = status; sharingSelect.appendChild(opt);
        });
    }
}

// --- Table Rendering ---
function renderTable() {
    if (!csvData) return;
    const rows = csvData.trim().split(/\r?\n/).map(parseCSVLine);
    const header = rows.shift().map(h => h.trim());
    const idxSKU = header.indexOf('SKU'),
        idxName = header.indexOf('Name'),
        idxParent = header.indexOf('Parent SKU'),
        idxType = header.indexOf('Type'),
        idxMenu = header.indexOf('Menu/Screen');
        
    const idxSharing = header.findIndex(h => h.toLowerCase() === 'sharing status');

    tbody.innerHTML = '';
    const selectedRoot = menuSelect.value;
    const selectedSharing = sharingSelect.value;

    // Filter by both Menu AND Sharing Status
    const filteredRows = rows.filter(row => {
        let menuMatch = true;
        let sharingMatch = true;

        // Check Menu
        if (selectedRoot !== "All") {
            const rawMenu = row[idxMenu];
            if (!rawMenu) {
                menuMatch = false;
            } else {
                menuMatch = rawMenu.split(/(?<!\\\\),/).some(seg => extractRootMenu(seg) === selectedRoot);
            }
        }

        // Check Sharing Status
        if (selectedSharing !== "All") {
            const rawSharing = idxSharing !== -1 ? (row[idxSharing] || '').trim() : '';
            sharingMatch = (rawSharing === selectedSharing);
        }

        return menuMatch && sharingMatch;
    });

    function getInvalidReasons(name) {
        const reasons = [];
        if (name.length < 2 || name.length > 128) reasons.push('Length 2-128');
        if (/^\s|\s$/.test(name)) reasons.push('Whitespace edge');

        const invalidChars = [];
        for (let char of name) {
            if (!allowedCharRegex.test(char)) {
                if (!invalidChars.includes(char)) invalidChars.push(char);
            }
        }
        if (invalidChars.length > 0) {
            reasons.push(`Invalid characters: ${invalidChars.join(', ')}`);
        }
        return reasons.join('; ');
    }

    if (listNamesCheckbox.checked || showInvalidCheckbox.checked) {
        table.querySelector('thead').innerHTML = '<tr><th>SKU</th><th>Item Name</th><th>Type</th><th>Sharing Status</th><th>Validity Reason</th></tr>';
        
        filteredRows.forEach(row => {
            const cleanName = (row[idxName] || '').trim().replace(/^"|"$/g, '');
            if (!cleanName) return;

            const reason = getInvalidReasons(cleanName);
            if (showInvalidCheckbox.checked && !reason) return;
            
            const sharingStatus = idxSharing !== -1 ? (row[idxSharing] || '') : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${row[idxSKU] || ''}</td><td>${cleanName}</td><td>${row[idxType] || ''}</td><td>${sharingStatus}</td><td>${reason || 'Valid'}</td>`;
            tbody.appendChild(tr);
        });
    } else {
        table.querySelector('thead').innerHTML = '<tr><th>SKU</th><th>Combo Name</th><th>Type</th><th>Sharing Status</th><th>Groups</th><th>Items</th><th>Sub-items</th></tr>';
        const skuTypeMap = {};
        rows.forEach(row => { if (row[idxSKU] && row[idxType]) skuTypeMap[row[idxSKU].trim()] = row[idxType].trim().toLowerCase(); });

        filteredRows.forEach(row => {
            if (row[idxType]?.toLowerCase() === 'combo') {
                const comboSku = row[idxSKU]?.trim();
                const related = rows.filter(i => i[idxParent] === comboSku);
                let g = 0, iCount = 0, s = 0;
                
                related.forEach(child => {
                    const t = skuTypeMap[child[idxSKU]?.trim()];
                    if (t === 'group') g++; else if (t === 'item') iCount++; else if (t === 'sub-item') s++;
                });
                
                if (filterCheckbox.checked && (iCount + s) === 0) return;
                
                const sharingStatus = idxSharing !== -1 ? (row[idxSharing] || '') : '';

                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${comboSku}</td><td>${row[idxName]}</td><td>${row[idxType]}</td><td>${sharingStatus}</td><td>${g}</td><td>${iCount}</td><td>${s}</td>`;
                tbody.appendChild(tr);
            }
        });
    }

    table.style.display = tbody.children.length > 0 ? 'table' : 'none';
    downloadContainer.style.display = tbody.children.length > 0 ? 'block' : 'none';
}

// Ensure both dropdowns trigger a re-render
menuSelect.addEventListener('change', renderTable);
sharingSelect.addEventListener('change', renderTable);
[filterCheckbox, showAllCheckbox, listNamesCheckbox, showInvalidCheckbox].forEach(radio => radio.addEventListener('change', renderTable));

document.getElementById('downloadCSV').addEventListener('click', () => {
    let csvContent = '';
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText);
    csvContent += headers.join(',') + '\n';
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
        csvContent += Array.from(tr.querySelectorAll('td')).map(td => `"${td.innerText}"`).join(',') + '\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'analysis_result.csv';
    link.click();
});
