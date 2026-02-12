const themeToggle = document.getElementById('themeToggle');
const menuSelect = document.getElementById('menuSelect');
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
});

// --- File Handling ---
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        csvData = e.target.result;
        updateMenuDropdown();
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
    // 1. Split by "/" ONLY if not preceded by double backslashes (\\)
    // Regex explanation: (?<!\\\\) is a negative lookbehind for two literal backslashes
    let root = segment.split(/(?<!\\\\)\//)[0].trim();
    
    // 2. Unescape: Replace double backslash followed by slash or comma with just the character
    // "NYE 12\\/31\\/2025" -> "NYE 12/31/2025"
    return root.replace(/\\\\([,/])/g, '$1');
}

// --- Menu Dropdown Logic ---
function updateMenuDropdown() {
    const rows = csvData.trim().split(/\r?\n/).map(parseCSVLine);
    const header = rows[0].map(h => h.trim());
    const idxMenu = header.indexOf('Menu/Screen');
    if (idxMenu === -1) return;

    const uniqueRootMenus = new Set();
    for (let i = 1; i < rows.length; i++) {
        const rawValue = rows[i][idxMenu];
        if (!rawValue) continue;
        
        // Split by comma only if not preceded by double backslashes
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

    tbody.innerHTML = '';
    const selectedRoot = menuSelect.value;

    const filteredRows = rows.filter(row => {
        if (selectedRoot === "All") return true;
        const rawValue = row[idxMenu];
        if (!rawValue) return false;
        
        // Split raw value by comma (respecting escapes) and check if any segment matches selected root
        return rawValue.split(/(?<!\\\\),/).some(seg => {
            return extractRootMenu(seg) === selectedRoot;
        });
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
        table.querySelector('thead').innerHTML = '<tr><th>SKU</th><th>Item Name</th><th>Type</th><th>Validity Reason</th></tr>';
        filteredRows.forEach(row => {
            const cleanName = (row[idxName] || '').trim().replace(/^"|"$/g, '');
            if (!cleanName) return;

            const reason = getInvalidReasons(cleanName);
            if (showInvalidCheckbox.checked && !reason) return;

            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${row[idxSKU] || ''}</td><td>${cleanName}</td><td>${row[idxType] || ''}</td><td>${reason || 'Valid'}</td>`;
            tbody.appendChild(tr);
        });
    } else {
        table.querySelector('thead').innerHTML = '<tr><th>SKU</th><th>Combo Name</th><th>Type</th><th>Groups</th><th>Items</th><th>Sub-items</th></tr>';
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
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${comboSku}</td><td>${row[idxName]}</td><td>${row[idxType]}</td><td>${g}</td><td>${iCount}</td><td>${s}</td>`;
                tbody.appendChild(tr);
            }
        });
    }

    table.style.display = tbody.children.length > 0 ? 'table' : 'none';
    downloadContainer.style.display = tbody.children.length > 0 ? 'block' : 'none';
}

menuSelect.addEventListener('change', renderTable);
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
