// --- 1. API 設定 ---
// const API_BASE_URL = window.location.protocol + "//" + window.location.hostname + ":8006"; // ★ 移除
// --- 1-E. 全局變數 ---
let workbook = null;
let currentSpecData = [];
let currentSortKey = 'mfgDate';
let currentSortDirection = 'desc';
let activeFieldKeys = []; 
let activeTimeFilter = 'all';
let histogramChart = null; 

// --- 2. 取得 DOM 元素 (先宣告) ---
let loginForm, employeeIdInput, passwordInput, loginButton, loginError;
let logoutButton, welcomeMessage, userName, permissionDenied, specApp;
let uploadInput, fileNameDisplay, processButton;
let statsDisplay, statsGrid, statsRecordCount;
let specTable, specTableHead, specTableBody;
let saveButton, filterBar, productFilter, clearFilterButton;
let timeFilterBar; 
let modalOverlay, modalTitle, modalCloseButton, histogramCanvas;

// --- Unified Field Definitions ---
// (保持不變)
const unifiedFields = {
    "產品編號": { key: "productId", display: "產品編號", type: "string" },
    "桶別": { key: "barrel", display: "桶別", type: "string" },
    "製造日期": { key: "mfgDate", display: "製造日期", type: "date" },
    "機台": { key: "machine", display: "機台", type: "string" },
    "班別": { key: "shift", display: "班別", type: "string" },
    "MI(2.16kg)": { key: "mi_2_16", display: "MI(2.16kg)", type: "number", stats: true },
    "MI(5kg)": { key: "mi_5", display: "MI(5kg)", type: "number", stats: true },
    "MI(21.6kg)": { key: "mi_21_6", display: "MI(21.6kg)", type: "number", stats: true },
    "MI(220/10kg)": { key: "mi_220_10", display: "MI(220/10kg)", type: "number", stats: true },
    "耐衝擊 kg-cm": { key: "impact_kgcm", display: "耐衝擊 kg-cm", type: "number", stats: true },
    "耐衝擊 kg-cm/cm2": { key: "impact_kgcm_cm2", display: "耐衝擊 kg-cm/cm2", type: "number", stats: true },
    "硬度(±1)": { key: "hardness", display: "硬度(±1)", type: "number", stats: false },
    "密度": { key: "density", display: "密度", type: "number", stats: true },
    "拉強": { key: "tensileStrength", display: "拉強", type: "number", stats: true },
    "降伏": { key: "yieldStrength", display: "降伏", type: "number", stats: true },
    "斷裂": { key: "breakElongation", display: "斷裂", type: "number", stats: true },
    "彎強": { key: "flexStrength", display: "彎強", type: "number", stats: true },
    "彈性係數": { key: "flexModulus", display: "彈性係數", type: "number", stats: true },
    "縮水率‰": { key: "shrinkageRate", display: "縮水率‰", type: "number", stats: true },
    "L": { key: "colorL", display: "L", type: "number", stats: true },
    "A": { key: "colorA", display: "A", type: "number", stats: true },
    "B": { key: "colorB", display: "B", type: "number", stats: true },
    "E": { key: "colorE", display: "E", type: "number", stats: true },
    "P": { key: "heavyMetalP", display: "P", type: "number" },
    "Cl": { key: "heavyMetalCl", display: "Cl", type: "number" },
    "Cr": { key: "heavyMetalCr", display: "Cr", type: "number" },
    "Br": { key: "heavyMetalBr", display: "Br", type: "number" },
    "Cd": { key: "heavyMetalCd", display: "Cd", type: "number" },
    "Hg": { key: "heavyMetalHg", display: "Hg", type: "number" },
    "Pb": { key: "heavyMetalPb", display: "Pb", type: "number" },
    "合計": { key: "heavyMetalTotal", display: "合計", type: "number" },
    ">0.3": { key: "gelGt0_3", display: ">0.3", type: "number" },
    "0.2-0.3": { key: "gel0_2_0_3", display: "0.2-0.3", type: "number" },
    "0.12-0.2": { key: "gel0_12_0_2", display: "0.12-0.2", type: "number" },
    "0.08-0.12": { key: "gel0_08_0_12", display: "0.08-0.12", type: "number" },
    "≧0.5mm2/0.09-0.49mm2": { key: "gelFishEye", display: "≧0.5mm2/0.09-0.49mm2", type: "string" },
    "timestamp": { key: "timestamp", display: "記錄時間", type: "timestamp" }
};
const statFields = Object.values(unifiedFields).filter(f => f.stats).map(f => f.key);
const displayFieldOrder = Object.values(unifiedFields).map(f => f.key);

// --- (parseMinguoDate, generateRecordKey, mergeRecordData 保持不變) ---
function parseMinguoDate(dateString) {
    if (typeof dateString !== 'string') return null;
    const parts = dateString.split('/');
    if (parts.length === 3 && parseInt(parts[0], 10) < 200) { 
        try {
            const year = parseInt(parts[0], 10) + 1911; 
            const month = parseInt(parts[1], 10) - 1; 
            const day = parseInt(parts[2], 10);
            const date = new Date(year, month, day);
            if (!isNaN(date) && date.getDate() === day && date.getMonth() === month && date.getFullYear() === year) {
                return date; 
            }
        } catch (e) { }
    }
    const standardDate = new Date(dateString);
    if (!isNaN(standardDate)) { return standardDate; }
    return null; 
}
function generateRecordKey(record) {
    if (!record || !record.productId || !record.barrel || !record.mfgDate) return null;
    let dateString;
    const mfgDate = record.mfgDate;
    try {
        if (mfgDate instanceof Date && !isNaN(mfgDate)) {
            dateString = mfgDate.toISOString().split('T')[0];
        } else {
            const parsedDate = parseMinguoDate(String(mfgDate)); 
            if (parsedDate) { dateString = parsedDate.toISOString().split('T')[0]; } else { return null; }
        }
        return `${String(record.productId).trim()}|${String(record.barrel).trim()}|${dateString}`;
    } catch (e) { return null; }
}
function mergeRecordData(oldRecord, newRecord) {
    const merged = { ...oldRecord };
    Object.values(unifiedFields).forEach(fieldInfo => {
        const key = fieldInfo.key;
        const newValue = newRecord[key];
        if (newValue !== null && newValue !== undefined) { merged[key] = newValue; }
    });
    merged.timestamp = newRecord.timestamp; 
    return merged;
}

// --- 3. Auth Logic ---
async function signIn(e) {
    e.preventDefault(); 
    const employeeId = document.getElementById('employeeId').value;
    const password = document.getElementById('password').value;
    if (!loginButton || !loginError) {
        console.error("Login button or login error element not found!");
        alert("登入元件初始化失敗，請重新載入頁面。");
        return;
    }
    loginButton.disabled = true; 
    loginButton.innerText = "登入中...";
    loginError.style.display = 'none';
    try {
        const formData = new URLSearchParams();
        formData.append('username', employeeId);
        formData.append('password', password);
        const response = await fetch(`/login`, { // ★ 移除 API_BASE_URL
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
            credentials: 'include' 
        });
        const data = await response.json();
        if (!response.ok) { throw new Error(data.detail || '登入失敗'); }
        // localStorage.setItem('spec_user_name', data.user_name); // ★ 移除 (我們從 /api/me 獲取)
        updateUIForPermissions(true); 
    } catch (error) {
        loginError.innerText = "員工編號或密碼錯誤，請重試。"; 
        loginError.style.display = 'block';
    } finally {
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerText = "登入";
        }
    }
}
async function signOutUser() {
    try {
        const response = await fetch(`/logout`, { // ★ 移除 API_BASE_URL
            method: 'POST',
            credentials: 'include'
        });
        if (!response.ok) {
            console.error("後端登出失敗");
        }
    } catch (error) {
        console.error("登出錯誤:", error);
    } finally {
        // localStorage.removeItem('spec_user_name'); // ★ 移除
        location.reload();
    }
}

// --- (updateActiveFieldsAndHeaders 保持不變) ---
function updateActiveFieldsAndHeaders(data) {
    const keysWithData = new Set();
    if (data && data.length > 0) {
        data.forEach(item => {
            Object.values(unifiedFields).forEach(fieldInfo => {
                const key = fieldInfo.key;
                if (keysWithData.has(key)) return; 
                const value = item[key];
                if (value === null || value === undefined) return; 
                const stringValue = String(value).trim();
                if (stringValue === '') return; 
                if (fieldInfo.type === 'number') {
                    const num = parseFloat(stringValue);
                    if (!isNaN(num) && num !== 0) keysWithData.add(key); 
                } else { keysWithData.add(key); }
            });
        });
    }
    activeFieldKeys = displayFieldOrder.filter(key => 
        keysWithData.has(key) && key !== 'timestamp'
    );
    renderTableHeaders();
}

// --- (loadProductList, populateProductDropdown 保持不變) ---
async function loadProductList() {
    if(specTableBody) specTableBody.innerHTML = `<tr><td colspan="30">正在從 NAS 載入產品列表...</td></tr>`;
    try {
        const response = await fetch(`/api/products`, { credentials: 'include' }); // ★ 移除 API_BASE_URL
        if (!response.ok) {
            if (response.status === 401) { signOutUser(); return; }
            if (response.status === 403) { 
                updateUIForPermissions(true);
                permissionDenied.classList.remove('is-hidden');
                specApp.classList.add('is-hidden');
                return; 
            }
            throw new Error('無法載入產品列表');
        }
        const productIds = await response.json();
        populateProductDropdown(productIds);
        filterBar.classList.remove('is-hidden');
        timeFilterBar.classList.remove('is-hidden'); 
        const colCount = displayFieldOrder.length;
        if(specTableBody) specTableBody.innerHTML = `<tr><td colspan="${colCount}">請從上方下拉選單選擇產品編號以載入資料。</td></tr>`;
    } catch (error) {
        console.error(error);
        if(specTableBody) specTableBody.innerHTML = `<tr><td colspan="30">載入產品列表失敗。</td></tr>`;
    }
}
function populateProductDropdown(productIds) {
    if (!productFilter) return;
    productIds.sort();
    productFilter.innerHTML = '<option value="" disabled selected>-- 請選擇產品編號 --</option>'; 
    productIds.forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        productFilter.appendChild(option);
    });
    productFilter.value = ""; 
}



// --- ( ★ 核心修改：資料獲取邏輯 ★ ) ---
async function fetchAndRenderData(isProductChange = false) {
    const selectedProductId = productFilter.value;
    
    if (!selectedProductId) {
        currentSpecData = [];
        updateActiveFieldsAndHeaders(currentSpecData);
        displaySortedTable();
        calculateAndDisplayStats(null, 0);
        if (isProductChange) updateDynamicYearButtons([]); 
        return;
    }

    const colCount = activeFieldKeys.length > 0 ? activeFieldKeys.length : displayFieldOrder.length;
    
    if (isProductChange) {
        if(specTableBody) specTableBody.innerHTML = `<tr><td colspan="${colCount}">正在從 NAS 獲取 ${selectedProductId} (${activeTimeFilter}) の資料...</td></tr>`;
    } else {
        if(specTableBody) {
            specTableBody.style.opacity = '0.5';
            specTableBody.style.pointerEvents = 'none'; 
        }
    }
    statsDisplay.classList.add('is-hidden'); 

    try {
        const params = new URLSearchParams({
            product_id: selectedProductId,
            time_filter: activeTimeFilter,
            sort_key: currentSortKey || 'mfgDate',
            sort_dir: currentSortDirection || 'desc'
        });

        // ★ 移除 API_BASE_URL
        const response = await fetch(`/api/spec_data?${params.toString()}`, {
            credentials: 'include'
        });

        if (!response.ok) {
             if (response.status === 401) { signOutUser(); return; }
             if (response.status === 403) { 
                permissionDenied.classList.remove('is-hidden');
                specApp.classList.add('is-hidden');
                return; 
             }
            throw new Error(`獲取資料失敗 (HTTP ${response.status})`);
        }
        
        const data = await response.json(); 
        data.spec_data.forEach(item => {
            if (item.mfgDate) item.mfgDate = new Date(item.mfgDate);
            if (item.timestamp) item.timestamp = new Date(item.timestamp);
            delete item._docId; 
        });
        
        currentSpecData = data.spec_data; 
        if (isProductChange) {
            updateDynamicYearButtons(data.available_years);
        }

        updateActiveFieldsAndHeaders(currentSpecData); 
        displaySortedTable();                           
        calculateAndDisplayStats(data.statistics, data.total_records); 

        if(specTableBody) {
            specTableBody.style.opacity = '1';
            specTableBody.style.pointerEvents = 'auto';
        }
    } catch (error) {
        console.error(error);
        if(specTableBody) specTableBody.innerHTML = `<tr><td colspan="${colCount}">載入資料失敗: ${error.message}</td></tr>`;
        calculateAndDisplayStats(null, 0); 
        
        if(specTableBody) {
            specTableBody.style.opacity = '1';
            specTableBody.style.pointerEvents = 'auto';
        }
    }
}

async function handleFilterChange() {
    const selectedProductId = productFilter.value;
    
    if (!selectedProductId) {
        await fetchAndRenderData(true); 
        return;
    }
    
    activeTimeFilter = 'all'; 
    currentSortKey = 'mfgDate'; 
    currentSortDirection = 'desc';
    updateTimeFilterUI();

    await fetchAndRenderData(true);
}

// ★ 修改：updateUIForPermissions (移除 localStorage)
function updateUIForPermissions(isAuthorized = false, userNameStr = '用戶') {
    if (!loginForm || !welcomeMessage || !userName || !specApp || !permissionDenied) return;
    if (isAuthorized) {
        // const name = localStorage.getItem('spec_user_name') || '用戶'; // ★ 移除
        userName.innerText = userNameStr; // ★ 使用傳入的參數
        loginForm.classList.add('is-hidden');
        welcomeMessage.classList.remove('is-hidden');
        specApp.classList.remove('is-hidden');
        permissionDenied.classList.add('is-hidden');
        loadProductList();
    } else {
        loginForm.classList.remove('is-hidden');
        welcomeMessage.classList.add('is-hidden');
        specApp.classList.add('is-hidden');
        permissionDenied.classList.add('is-hidden'); 
        if (filterBar) filterBar.classList.add('is-hidden');
        if (timeFilterBar) timeFilterBar.classList.add('is-hidden');
    }
}

// --- 4. Excel Processing Logic ---
// (savePreviewToAPI 保持不變, 除了 API_BASE_URL)
async function savePreviewToAPI() {
    const dataToSave = currentSpecData; 

    if (!dataToSave || dataToSave.length === 0) { alert("沒有可儲存的預覽資料。"); return; }
    
    const validData = [];
    const invalidDataRows = [];
    dataToSave.forEach((item, index) => {
        const hasKeyFields = item.productId && String(item.productId).trim() !== '' &&
                             item.barrel && String(item.barrel).trim() !== '';
        const hasValidDate = item.mfgDate && (item.mfgDate instanceof Date && !isNaN(item.mfgDate));
        if (hasKeyFields && hasValidDate) { validData.push(item); } else { invalidDataRows.push(index + 1); }
    });
    if (validData.length === 0) {
        alert(`錯誤：所有 ${dataToSave.length} 筆資料都缺少關鍵欄位 (產品編號、桶別) 或製造日期格式不正確。\n\n無法儲存。`);
        return;
    }
    if (invalidDataRows.length > 0) {
        if (!confirm(`系統偵測到 ${invalidDataRows.length} 筆資料因缺少「產品編號」、「桶別」或「有效製造日期」而無效。\n\n是否繼續儲存剩下 ${validData.length} 筆有效資料？`)) {
            return;
        }
    }
    const dataToSend = validData.map(item => {
        const newItem = { ...item }; 
        if (newItem.mfgDate instanceof Date && !isNaN(newItem.mfgDate)) {
            const year = newItem.mfgDate.getFullYear();
            const month = (newItem.mfgDate.getMonth() + 1).toString().padStart(2, '0'); 
            const day = newItem.mfgDate.getDate().toString().padStart(2, '0');
            newItem.mfgDate = `${year}-${month}-${day}`; 
        }
        return newItem;
    });
    if (!confirm(`即將上傳 ${dataToSend.length} 筆有效資料至 NAS。\nAPI 將自動處理新增或彙整。\n\n確定要儲存嗎？`)) {
        return;
    }
    saveButton.disabled = true;
    saveButton.innerText = "儲存中...";
    processButton.disabled = true;
    try {
        const response = await fetch(`/api/spec_data/upload`, { // ★ 移除 API_BASE_URL
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend),
            credentials: 'include'
        });
        const result = await response.json();
        if (!response.ok) {
            if (response.status === 401) { signOutUser(); return; }
            if (response.status === 422 && result.detail) {
                 const errorMsg = result.detail.map(err => `[${err.loc.join('->')}] - ${err.msg}`).join('\n');
                 throw new Error(`API 驗證失敗 (422):\n${errorMsg}`);
            }
            throw new Error(result.detail || '儲存失敗');
        }
        alert(`成功！\n\n${invalidDataRows.length} 筆無效資料已被略過。\n${dataToSend.length} 筆有效資料已處理：\n - 新增: ${result.created} 筆\n - 彙整: ${result.updated} 筆`);
        resetPreviewState(); 
        await loadProductList(); 
    } catch (error) {
        if (error.message && error.message.includes('API 驗證失敗')) {
            alert(error.message);
        } else {
            alert("儲存失敗: F發生未預期的錯誤。");
            console.error(error);
        }
    } finally {
        saveButton.disabled = false;
        saveButton.innerText = "儲存至 NAS";
        processButton.disabled = false;
        saveButton.classList.add('is-hidden');
    }
}
// (renderTableHeaders 保持不變)
function renderTableHeaders() {
    if (!specTableHead) { console.error("specTableHead not found"); return; }
    specTableHead.innerHTML = '';
    const displayedFields = activeFieldKeys; 
    displayedFields.forEach(key => {
        const fieldInfo = Object.values(unifiedFields).find(f => f.key === key);
        if (!fieldInfo) return;
        const th = document.createElement('th');
        th.classList.add('sortable-header');
        th.setAttribute('data-sort-key', fieldInfo.key);
        th.textContent = fieldInfo.display;
        th.innerHTML += ' <span class="sort-indicator"></span>';
        specTableHead.appendChild(th);
    });
    if (specTableBody) {
         const currentTd = specTableBody.querySelector('td');
         if (currentTd) currentTd.colSpan = displayedFields.length > 0 ? displayedFields.length : displayFieldOrder.length;
    }
}

// (processExcel 保持不變)
function processExcel() {
    if (!workbook) { alert("請先選擇 Excel 檔案！"); return; }
    processButton.disabled = true;
    processButton.innerText = "處理中...";
    if(specTableBody) specTableBody.innerHTML = `<tr><td colspan="${displayFieldOrder.length}">正在處理 Excel 資料...</td></tr>`;
    statsDisplay.classList.add('is-hidden');
    try {
        const sheet = workbook.Sheets["整年"];
        if (!sheet) { throw new Error(`找不到名稱為 "整年" 的分頁！`); }
        
        // ★★★ 修改 2：將 raw: false 改為 rawValues: true ★★★
        const sheetDataAoA = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false, rawValues: true });
        
        if (!sheetDataAoA || sheetDataAoA.length < 1) { throw new Error("分頁中沒有數據。"); }
        let headerRowIndex = -1; let headerRow = null;
        for(let i = 0; i < sheetDataAoA.length; i++){
            if(Array.isArray(sheetDataAoA[i]) && sheetDataAoA[i].includes("產品編號") && sheetDataAoA[i].includes("桶別")){
                 headerRowIndex = i; headerRow = sheetDataAoA[i]; break;
            }
        }
        if(headerRowIndex === -1 || !headerRow){ throw new Error(`找不到包含 "產品編號" 和 "桶別" 的標頭行！`); }
        const colMap = {}; const excelHeaderToKey = {};
        Object.entries(unifiedFields).forEach(([excelHeader, fieldInfo]) => { excelHeaderToKey[excelHeader] = fieldInfo.key; });
        headerRow.forEach((headerValue, index) => {
            if (headerValue && excelHeaderToKey[String(headerValue).trim()]) {
                colMap[excelHeaderToKey[String(headerValue).trim()]] = index;
            }
        });
        const foundKeysInExcel = Object.keys(colMap);
        activeFieldKeys = displayFieldOrder.filter(key => 
            foundKeysInExcel.includes(key) && key !== 'timestamp'
        );
        const processedData = [];
        for (let i = headerRowIndex + 1; i < sheetDataAoA.length; i++) {
            const row = sheetDataAoA[i];
            if(!Array.isArray(row) || row.every(cell => cell == null || String(cell).trim() === '')) continue;
            const rowData = {}; let isEmptyBasedOnMapping = true;
            Object.values(unifiedFields).forEach(fieldInfo => {
                if (fieldInfo.key === 'timestamp') return;
                const colIndex = colMap[fieldInfo.key]; let value = null;
                if (colIndex !== undefined && row[colIndex] !== undefined && row[colIndex] !== null && String(row[colIndex]).trim() !== '') {
                    value = row[colIndex]; isEmptyBasedOnMapping = false;

                    // ★★★ F12 偵錯點 1.1 (查看原始值) ★★★
                    if (fieldInfo.key === "barrel") {
                        console.log(`[偵錯 1.1] 讀取到 "桶別" 原始值:`, value, `(類型: ${typeof value})`);
                    }

                    // === 修正：桶別欄位一律保留原始字串（避免被 parseFloat 或公式影響） ===
                    if (fieldInfo.key === "barrel") {
                        value = String(value).trim();
                        
                        // ★★★ F12 偵錯點 1.2 (查看處理後的值) ★★★
                        console.log(`[偵錯 1.2] "桶別" 處理後的值:`, value);
                    }
                    else if (fieldInfo.type === 'number') {
                        const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
                        value = isNaN(num) ? null : num;
                    } else if (fieldInfo.type === 'date') {
                        if (value instanceof Date && !isNaN(value)) { } else {
                            // 因為我們在 read 時關閉了 cellDates，這裡要更依賴 parseMinguoDate
                            value = parseMinguoDate(String(row[colIndex])); 
                        }
                    } else { value = String(value); }
                }
                rowData[fieldInfo.key] = value;
            });
            if (isEmptyBasedOnMapping) continue;
            rowData['timestamp'] = new Date(); 
            processedData.push(rowData);
        }
        
        currentSpecData = processedData; 
        currentSortKey = 'timestamp'; 
        currentSortDirection = 'desc';
        
        updateDynamicYearButtons(currentSpecData.map(item => 
            (item.mfgDate instanceof Date && !isNaN(item.mfgDate)) ? item.mfgDate.getFullYear() : null
        )); 
        activeTimeFilter = 'all'; 
        updateTimeFilterUI();

        updateActiveFieldsAndHeaders(currentSpecData);
        displaySortedTable(); 
        
        const localStats = calculateStatistics(currentSpecData, activeFieldKeys.filter(key => statFields.includes(key)));
        calculateAndDisplayStats(localStats, currentSpecData.length); 
        
        alert(`處理完成！\n${currentSpecData.length} 筆資料已生成預覽。請檢查下方表格與統計。`);
        
        if(saveButton) saveButton.classList.remove('is-hidden'); 
        if(filterBar) filterBar.classList.add('is-hidden'); 
        if(timeFilterBar) timeFilterBar.classList.add('is-hidden');

    } catch (error) {
        alert("處理 Excel 時發生錯誤：" + error.message);
        if (specTableBody) specTableBody.innerHTML = `<tr><td colspan="${displayFieldOrder.length}">處理失敗: ${error.message}</td></tr>`;
        statsDisplay.classList.add('is-hidden');
    } finally {
        processButton.disabled = false;
        processButton.innerText = "預覽處理結果";
    }
}
// (handleFileUpload 保持不變)
function handleFileUpload(e) {
    const file = e.target.files.length > 0 ? e.target.files[0] : null;
    resetPreviewState(); 
    if (file) {
        fileNameDisplay.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                
                // ★★★ 修改 1：將 cellDates: true 改為 cellDates: false ★★★
                workbook = XLSX.read(data, { type: 'array', cellDates: false }); 
                
                processButton.disabled = false;
                if(specTableBody) specTableBody.innerHTML = `<tr><td colspan="${displayFieldOrder.length}">檔案已選擇，請點擊按鈕預覽。</td></tr>`;
            } catch (readError) {
                 alert("讀取 Excel 檔案失敗，請確認檔案格式是否正確。");
                 fileNameDisplay.textContent = '讀取失敗'; workbook = null; processButton.disabled = true;
            }
        };
        reader.onerror = () => {
             alert("讀取檔案時發生錯誤。");
             fileNameDisplay.textContent = '讀取錯誤'; workbook = null; processButton.disabled = true;
        };
        reader.readAsArrayBuffer(file);
    }
}


// --- 5. Statistics Calculation ---
// (formatNumberByKey, calculateStatistics 保持不變)
function formatNumberByKey(value, key) {
    
    // --- 修正開始 (此修正已在您提供的檔案中) ---
    // 1. 找到這個 key 的欄位定義
    const fieldInfo = Object.values(unifiedFields).find(f => f.key === key);

    // 2. 如果找不到定義，或者欄位類型不是 'number'，則直接回傳原始值
    //    (例如 'barrel' (桶別) 的 type 是 'string'，會在這裡被直接回傳)
    if (!fieldInfo || fieldInfo.type !== 'number') {
        return value;
    }
    // --- 修正結束 ---
    
    let numValue = parseFloat(value); 
    if (isNaN(numValue)) { 
        return value; 
    }
    let formattedValue;
    switch (key) {
        case 'hardness': case 'tensileStrength': case 'yieldStrength': case 'breakElongation':
        case 'flexStrength': case 'flexModulus': case 'gelGt0_3': case 'gel0_2_0_3':
        case 'gel0_12_0_2': case 'gel0_08_0_12': case 'gelFishEye':
            formattedValue = numValue.toFixed(0); break; 
        case 'impact_kgcm_cm2':
            formattedValue = numValue.toFixed(1); break;
        case 'mi_2_16': case 'mi_5': case 'mi_21_6': case 'mi_220_10': 
        case 'impact_kgcm': case 'colorL': case 'colorA': case 'colorB': case 'colorE': 
        case 'heavyMetalP': case 'heavyMetalCl': case 'heavyMetalCr': case 'heavyMetalBr': 
        case 'heavyMetalCd': case 'heavyMetalHg': case 'heavyMetalPb': case 'heavyMetalTotal': 
        case 'shrinkageRate':
            formattedValue = numValue.toFixed(2); break; 
        case 'density':
            formattedValue = numValue.toFixed(3); break;
        default:
             formattedValue = String(numValue); 
    }
    return formattedValue;
}
function calculateStatistics(data, fieldsToCalculate) {
    const stats = {};
    if (!data || data.length === 0) return stats;
    fieldsToCalculate.forEach(key => {
        const values = data.map(item => item[key]).filter(val => val != null && !isNaN(parseFloat(val))).map(val => parseFloat(val));
        if (values.length === 0) {
            stats[key] = { avg: 'N/A', min: 'N/A', max: 'N/A', stdDev: 'N/A', count: 0 }; return;
        }
        const count = values.length; const sum = values.reduce((acc, val) => acc + val, 0); const avg = sum / count;
        const min = Math.min(...values); const max = Math.max(...values);
        const stdDev = Math.sqrt(values.map(val => Math.pow(val - avg, 2)).reduce((acc, val) => acc + val, 0) / count);
        stats[key] = { avg: avg, min: min, max: max, stdDev: stdDev, count: count };
    });
    return stats;
}

// (calculateAndDisplayStats 保持不變)
function calculateAndDisplayStats(backendStats, totalRecords) {
    if (!statsGrid || !statsRecordCount) return;
    statsGrid.innerHTML = ''; 
    statsDisplay.classList.add('is-hidden');
    
    if (!backendStats || totalRecords === 0) { 
        statsRecordCount.textContent = '0'; 
        return; 
    }
    
    statsRecordCount.textContent = totalRecords ?? currentSpecData.length;
    
    const fieldsToDisplay = activeFieldKeys.filter(key => 
        statFields.includes(key) && backendStats[key]
    );

    fieldsToDisplay.forEach(key => {
        const values = backendStats[key]; 
        if (!values || values.count === 0) return;
        
        const fieldInfo = Object.values(unifiedFields).find(f => f.key === key);
        const displayName = fieldInfo ? fieldInfo.display : key;

        const displayMax = formatNumberByKey(values.max, key); 
        const displayMin = formatNumberByKey(values.min, key);
        const displayAvg = formatNumberByKey(values.avg, key);
        const displayStdDev = (typeof values.stdDev === 'number') ? values.stdDev.toFixed(3) : 'N/A';
        
        const statItem = document.createElement('div'); 
        statItem.classList.add('stat-item');
        const title = document.createElement('strong');
        title.classList.add('stat-title-clickable');
        title.setAttribute('data-key', key);
        title.setAttribute('data-display-name', displayName);
        title.textContent = `${displayName}:`; 
        const maxSpan = document.createElement('span');
        maxSpan.textContent = displayMax; 
        const minSpan = document.createElement('span');
        minSpan.textContent = displayMin; 
        const avgSpan = document.createElement('span');
        avgSpan.textContent = displayAvg; 
        const stdDevSpan = document.createElement('span');
        stdDevSpan.textContent = displayStdDev;
        statItem.appendChild(title);
        statItem.appendChild(document.createElement('br'));
        statItem.appendChild(document.createTextNode('Max: ')); 
        statItem.appendChild(maxSpan);
        statItem.appendChild(document.createTextNode(','));
        statItem.appendChild(document.createElement('br'));
        statItem.appendChild(document.createTextNode('Min: '));
        statItem.appendChild(minSpan);
        statItem.appendChild(document.createTextNode(','));
        statItem.appendChild(document.createElement('br'));
        statItem.appendChild(document.createTextNode('Avg: '));
        statItem.appendChild(avgSpan);
        statItem.appendChild(document.createTextNode(','));
        statItem.appendChild(document.createElement('br'));
        statItem.appendChild(document.createTextNode('StdDev: '));
        statItem.appendChild(stdDevSpan);
        statsGrid.appendChild(statItem);
    });
    statsDisplay.classList.remove('is-hidden');
}


// --- 6. Table Rendering and Sorting ---
// (compareValues, updateDynamicYearButtons, handleTimeFilterClick, updateTimeFilterUI 保持不變)
function compareValues(a, b) {
    if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1;
    if (a instanceof Date && b instanceof Date && !isNaN(a) && !isNaN(b)) { return a.getTime() - b.getTime(); }
    if (a instanceof Date && !isNaN(a)) return -1;
    if (b instanceof Date && !isNaN(b)) return 1;
    const numA = parseFloat(a); const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB)) { return numA - numB; }
    const strA = String(a).toLowerCase(); const strB = String(b).toLowerCase();
    if (strA < strB) return -1; if (strA > strB) return 1;
    return 0;
}
function updateDynamicYearButtons(years) { 
    if (!timeFilterBar) return;
    timeFilterBar.querySelectorAll('[data-filter^="year-"]').forEach(btn => btn.remove());
    const allButton = timeFilterBar.querySelector('[data-filter="all"]');
    if (!allButton) { console.error("找不到 '全部' 按鈕！"); return; }
    
    // (★ 新增：如果 years 不是陣列 (來自 Excel 預覽)，則計算它)
    if (!Array.isArray(years)) {
        const yearSet = new Set();
        years.forEach(year => {
             if (year) yearSet.add(year);
        });
        years = Array.from(yearSet).sort((a, b) => b - a); // 轉換為排序好的陣列
    }
    
    years.forEach(year => {
        const button = document.createElement('button');
        button.setAttribute('data-filter', `year-${year}`);
        button.textContent = `${year}年`;
        timeFilterBar.insertBefore(button, allButton);
    });
}
function handleTimeFilterClick(e) {
    if (e.target.tagName !== 'BUTTON') return;
    const newFilter = e.target.getAttribute('data-filter');
    if (newFilter === activeTimeFilter) return; 
    activeTimeFilter = newFilter;
    updateTimeFilterUI();
    fetchAndRenderData(false); 
}
function updateTimeFilterUI() {
    if (!timeFilterBar) return;
    const buttons = timeFilterBar.querySelectorAll('button');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-filter') === activeTimeFilter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// (displaySortedTable 保持不變)
function displaySortedTable() {
    if (!specTableBody || !specTableHead) { return; }
    specTableBody.innerHTML = "";
    const displayedFields = activeFieldKeys;
    
    if (!currentSpecData || currentSpecData.length === 0) {
        const colCount = displayedFields.length > 0 ? displayedFields.length : displayFieldOrder.length;
        specTableBody.innerHTML = `<tr><td colspan="${colCount}">沒有符合篩選的資料。</td></tr>`;
        return;
    }

    if (currentSortKey) {
        if (currentSpecData[0] && !(currentSortKey in currentSpecData[0])) { 
            currentSortKey = null; 
        }
         if (currentSortKey) {
             currentSpecData.sort((a, b) => {
                 let valA = a[currentSortKey]; let valB = b[currentSortKey];
                  if (currentSortKey === 'timestamp' || currentSortKey === 'mfgDate'){
                       valA = (valA instanceof Date && !isNaN(valA)) ? valA : null;
                       valB = (valB instanceof Date && !isNaN(valB)) ? valB : null;
                  }
                 const comparison = compareValues(valA, valB);
                 return currentSortDirection === 'asc' ? comparison : -comparison;
             });
         }
    }
    
    const headers = specTableHead.querySelectorAll('th.sortable-header');
    if (headers) {
         headers.forEach(th => {
             th.classList.remove('sort-asc', 'sort-desc');
             const indicator = th.querySelector('.sort-indicator');
             if (indicator) indicator.style.opacity = '0.3';
             if (th.getAttribute('data-sort-key') === currentSortKey) {
                 th.classList.add(currentSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
                  if (indicator) indicator.style.opacity = '1';
             }
         });
     }
    
    currentSpecData.forEach(data => {
        const row = document.createElement('tr');
        displayedFields.forEach(key => {
            const td = document.createElement('td');
            let value = data[key];

            // ★★★ F12 偵錯點 2.1 (查看準備渲染的值) ★★★
            if (key === "barrel") {
                console.log(`[偵錯 2.1] 準備渲染的 "桶別" 值:`, value);
            }

            if (key === 'mfgDate' || key === 'timestamp') {
                 let dateObj = (value instanceof Date && !isNaN(value)) ? value : null;
                 if (dateObj) {
                     try {
                         const options = key === 'timestamp' 
                            ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
                            : { year: 'numeric', month: '2-digit', day: '2-digit' };
                         value = dateObj.toLocaleString('zh-TW', options);
                     } catch(e) { }
                 }
            } else { 
                // 僅對數字欄位套用 formatNumberByKey，其他欄位保留字串原貌
                const fieldInfo = Object.values(unifiedFields).find(f => f.key === key);
                if (fieldInfo && fieldInfo.type === 'number') {
                    value = formatNumberByKey(value, key);
                } else {
                    value = value === null || value === undefined ? '' : String(value);
                }
            }
            // 使用 textContent 確保所有符號都被當作文字顯示（避免 innerHTML 解析問題）
            td.textContent = (value !== undefined && value !== null) ? String(value) : '';
            row.appendChild(td);
        });
        specTableBody.appendChild(row);
    });
}


// --- (Modal 和圖表相關函數) ---
// (hideHistogramModal, handleStatTitleClick, showHistogramModal, generateHistogram 保持不變)
function hideHistogramModal() {
    if (modalOverlay) modalOverlay.classList.add('is-hidden');
    if (histogramChart) {
        histogramChart.destroy();
        histogramChart = null;
    }
}
function handleStatTitleClick(e) {
    const titleElement = e.target.closest('.stat-title-clickable');
    if (!titleElement) return;
    const key = titleElement.getAttribute('data-key');
    const displayName = titleElement.getAttribute('data-display-name');
    if (key) {
        showHistogramModal(key, displayName);
    }
}
function showHistogramModal(key, displayName) {
    if (!modalOverlay || !modalTitle || !histogramCanvas) return;
    modalTitle.textContent = `${displayName} 數據分佈圖`;
    modalOverlay.classList.remove('is-hidden');
    generateHistogram(key);
}
function generateHistogram(key) {
    const values = currentSpecData
        .map(item => item[key])
        .filter(val => val != null && !isNaN(parseFloat(val)))
        .map(val => parseFloat(val));
        
    const ctx = histogramCanvas.getContext('2d');
    if (histogramChart) {
        histogramChart.destroy();
        histogramChart = null;
    }
    
    if (values.length === 0) {
        ctx.clearRect(0, 0, histogramCanvas.width, histogramCanvas.height);
        ctx.font = "16px Arial"; ctx.fillStyle = "#666"; ctx.textAlign = "center";
        ctx.fillText("沒有可顯示的數據", histogramCanvas.width / 2, histogramCanvas.height / 2);
        return;
    }
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const uniqueValuesCount = new Set(values).size;

    const bins = [];
    const labels = [];
    let numBins = 0;

    if (max === min || uniqueValuesCount === 1) {
        numBins = 1;
        labels.push(formatNumberByKey(min, key)); 
        bins.push(values.length);
        
    } else {
        const targetBins = 5; 
        const range = max - min;
        
        const rawWidth = range / targetBins;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawWidth))); 
        const normalizedWidth = rawWidth / magnitude; 

        let niceWidth;
        if (normalizedWidth <= 1.0) niceWidth = 1 * magnitude;
        else if (normalizedWidth <= 2.0) niceWidth = 2 * magnitude;
        else if (normalizedWidth <= 5.0) niceWidth = 5 * magnitude;
        else niceWidth = 10 * magnitude;
        
        let precision = 0;
        const widthString = String(niceWidth);
        if (widthString.includes('.')) {
            const parts = widthString.split('.');
            precision = parts[1].length;
            if (precision > 10) {
                niceWidth = parseFloat(niceWidth.toFixed(10));
                precision = 10;
                while (precision > 2 && niceWidth.toFixed(precision).endsWith('0')) {
                    precision--;
                }
                niceWidth = parseFloat(niceWidth.toFixed(precision));
            }
        }
        
        const minBin = Math.floor(min / niceWidth) * niceWidth;
        const maxBin = Math.ceil(max / niceWidth) * niceWidth;
        
        let currentStart = minBin;
        const epsilon = niceWidth * 1e-9; 

        while (currentStart < (maxBin - epsilon)) {
            const currentEnd = currentStart + niceWidth;
            
            const labelA = formatNumberByKey(currentStart, key);
            const labelB = formatNumberByKey(currentEnd, key);
            
            labels.push(`${labelA} - ${labelB}`);
            bins.push(0);
            currentStart = currentEnd;
        }
        
        numBins = bins.length;
        if (numBins === 0) { 
             bins.push(values.length);
             labels.push(`${formatNumberByKey(min, key)} - ${formatNumberByKey(max, key)}`);
             numBins = 1;
        }

        values.forEach(value => {
            if (value >= maxBin) {
                bins[numBins - 1]++;
                return;
            }
            
            let binIndex = Math.floor((value - minBin + epsilon) / niceWidth);
            binIndex = Math.max(0, Math.min(numBins - 1, binIndex));
            bins[binIndex]++;
        });
    }

    histogramChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '筆數',
                data: bins,
                backgroundColor: 'rgba(0, 123, 255, 0.7)',
                borderColor: 'rgba(0, 123, 255, 1)',
                borderWidth: 1,
                barPercentage: 1.0, 
                categoryPercentage: 1.0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                x: { title: { display: true, text: '數值區間' } },
                y: { title: { display: true, text: '筆數' }, beginAtZero: true }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: (context) => `區間: ${context[0].label}`,
                        label: (context) => `筆數: ${context.raw}`
                    }
                }
            }
        }
    });
}

// --- 7. Initialize Event Listeners ---
window.addEventListener('DOMContentLoaded', async (event) => {
    // ( ... 獲取 DOM 元素 ... 保持不變 )
    loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', signIn);
    loginError = document.getElementById('loginError');
    loginButton = document.getElementById('loginButton'); 
    logoutButton = document.getElementById('logoutButton');
    welcomeMessage = document.getElementById('welcomeMessage');
    userName = document.getElementById('userName');
    permissionDenied = document.getElementById('permissionDenied');
    specApp = document.getElementById('specApp');
    uploadInput = document.getElementById('upload');
    fileNameDisplay = document.getElementById('fileName');
    processButton = document.getElementById('processButton');
    statsDisplay = document.getElementById('statsDisplay');
    statsGrid = document.getElementById('statsGrid');
    statsRecordCount = document.getElementById('statsRecordCount');
    specTable = document.getElementById('specTable');
    specTableHead = specTable?.querySelector('thead tr');
    specTableBody = document.getElementById('specTableBody');
    saveButton = document.getElementById('saveButton');
    filterBar = document.getElementById('filterBar');
    productFilter = document.getElementById('productFilter');
    clearFilterButton = document.getElementById('clearFilterButton');
    timeFilterBar = document.getElementById('timeFilterBar');
    modalOverlay = document.getElementById('histogramModal');
    modalTitle = document.getElementById('modalTitle');
    modalCloseButton = document.getElementById('modalCloseButton');
    histogramCanvas = document.getElementById('histogramCanvas');
    if (!specTableHead) console.error("Table head (thead tr) not found!");

    // ( ... 基本事件綁定 ... 保持不變 )
    if (logoutButton) logoutButton.addEventListener('click', signOutUser);
    if (uploadInput) uploadInput.addEventListener('change', handleFileUpload);
    if (processButton) processButton.addEventListener('click', processExcel);
    if (saveButton) saveButton.addEventListener('click', savePreviewToAPI);
    if (productFilter) productFilter.addEventListener('change', handleFilterChange); 
    if (clearFilterButton) clearFilterButton.addEventListener('click', () => {
        productFilter.value = '';
        handleFilterChange(); 
    });
    if (timeFilterBar) timeFilterBar.addEventListener('click', handleTimeFilterClick); 
    if (modalCloseButton) modalCloseButton.addEventListener('click', hideHistogramModal);
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) hideHistogramModal();
    });
    if (statsGrid) statsGrid.addEventListener('click', handleStatTitleClick);

// (排序邏輯 保持不變)
const thead = specTable?.querySelector('thead');
if (thead) {
    thead.addEventListener('click', (e) => {
        const header = e.target.closest('th.sortable-header');
        if (header) {
            const sortKey = header.getAttribute('data-sort-key'); 
            if (sortKey) {
                if (currentSortKey === sortKey) { 
                    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc'; 
                } else { 
                    currentSortKey = sortKey; 
                    currentSortDirection = 'asc'; 
                }
                
                const isExcelPreviewMode = saveButton && !saveButton.classList.contains('is-hidden');

                if (isExcelPreviewMode) {
                    console.log("Sorting local Excel preview data.");
                    displaySortedTable(); 
                } else {
                    console.log("Fetching sorted data from API.");
                    fetchAndRenderData(false); 
                }
            }
        }
    });
} else { console.error("Table thead not found for sorting listener!"); }

    // ( ... 後端健康檢查 ... 保持不變, 除了 API_BASE_URL)
    if (loginButton) {
        loginButton.disabled = true;
        loginButton.innerText = "連線後端中..."; 
    }
    let backendReady = false;
    const maxRetries = 10; 
    let retries = 0;
    while (!backendReady && retries < maxRetries) {
        retries++;
        try {
            const healthResponse = await fetch(`/health`, { method: 'GET' }); // ★ 移除 API_BASE_URL
            if (healthResponse.ok) {
                backendReady = true;
                if (loginButton) {
                    loginButton.disabled = false;
                    loginButton.innerText = "登入"; 
                }
            }
        } catch (error) { }
        if (!backendReady && retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    if (!backendReady) {
        if (loginError) loginError.innerText = "無法連接到後端服務。";
        if (loginError) loginError.style.display = 'block';
        return;
    }

    // ( ... 檢查登入狀態 /api/me ... 保持不變, 除了 API_BASE_URL)
    try {
        const response = await fetch(`/api/me`, { credentials: 'include' }); // ★ 移除 API_BASE_URL
        if (response.ok) {
            const userData = await response.json();
            // localStorage.setItem('spec_user_name', userData.user_name); // ★ 移除
            updateUIForPermissions(true, userData.user_name); // ★ 傳入 user_name
        } else {
            updateUIForPermissions(false); 
        }
    } catch (error) {
        updateUIForPermissions(false); 
    }
});



// (resetPreviewState 保持不變)
function resetPreviewState() {
     console.log("Resetting preview state.");
     workbook = null;
     currentSortKey = 'mfgDate'; 
     currentSortDirection = 'desc'; 
     activeFieldKeys = []; 
     currentSpecData = [];
     activeTimeFilter = 'all';

     if(uploadInput) uploadInput.value = '';
     if(fileNameDisplay) fileNameDisplay.textContent = '未選擇任何檔案';
     if(processButton) processButton.disabled = true;
     if(statsDisplay) statsDisplay.classList.add('is-hidden');
     if(saveButton) saveButton.classList.add('is-hidden'); 
     if(filterBar) filterBar.classList.remove('is-hidden'); 
     if(timeFilterBar) timeFilterBar.classList.remove('is-hidden');
     
     if (productFilter && productFilter.value) {
         fetchAndRenderData(true); 
     } else {
         updateDynamicYearButtons([]);
         updateTimeFilterUI();
         if(specTableHead) specTableHead.innerHTML = ''; 
         if(specTableBody) {
            displaySortedTable(); 
            calculateAndDisplayStats(null, 0); 
         }
     }
     
     const headers = specTableHead?.querySelectorAll('th.sortable-header');
     if (headers) {
         headers.forEach(th => {
             th.classList.remove('sort-asc', 'sort-desc');
             const indicator = th.querySelector('.sort-indicator');
             if (indicator) indicator.style.opacity = '0.3';
         });
     }
}