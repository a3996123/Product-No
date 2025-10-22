// --- 1. 初始化 Firebase (Modular SDK) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app-check.js";
// ★★★ 引入 Firestore 所有需要的函數 ★★★
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, onSnapshot, writeBatch, setDoc, updateDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// !! 關鍵步驟：請將下面的 firebaseConfig 物件 換回您自己的 Firebase 專案設定 !!
const firebaseConfig = {
  apiKey: "AIzaSyAiwKqljpecPfLnvgFJ_D_nQVmv5VSuAqQ",
  authDomain: "product-no-38a46.firebaseapp.com",
  projectId: "product-no-38a46",
  storageBucket: "product-no-38a46.firebasestorage.app",
  messagingSenderId: "89833673713",
  appId: "1:89833673713:web:719ea9cee8c28ccb5eaa50",
  measurementId: "G-4V80L4RF0K"
};
// ----------------------------------------------------------------------

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 1-B. 初始化 App Check ---
try {
    initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('6LcYdfArAAAAADhAH5MPwdfpq2GaLgD6DpiXbu4Q'), // ★ 換成您自己的 reCAPTCHA 網站金鑰
        isTokenAutoRefreshEnabled: true,
    });
    console.log("Firebase App Check 已啟動（手動模式）。");
} catch (error) { console.error("App Check 啟動失敗:", error); }

// --- 1-D. 資料庫集合引用 ---
const qcCollectionRef = collection(db, "qc_excel_data");
const employeesCollectionRef = collection(db, "employees");
const materialStatusCollectionRef = collection(db, "material_qc_status"); // ★ QC 狀態

// --- 1-E. 全局變數 ---
let currentUserPermissions = null;
let currentAuthUser = null;
let workbook;
let qcDataListener = null; // QC 表格監聽器的 unsubscribe 函數
let qcStatusListener = null; // QC 狀態監聽器的 unsubscribe 函數
// ★ 排序相關
let currentQCData = []; // 儲存從 Firebase 獲取的【未過濾】數據
let currentSortKey = 'last_uploaded_at'; // ★ 預設排序鍵
let currentSortDirection = 'desc'; // ★ 預設排序方向
let qcStatusMap = {}; // ★ 儲存 QC 狀態 { materialId: latestBarrel }

// --- 2. 取得 DOM 元素 (先宣告) ---
let loginButton, logoutButton, welcomeMessage, userName, permissionDenied, qcApp;
let uploadInput, fileNameDisplay, processButton, qcTable, qcTableBody;
let statusList; // ★ QC 狀態列表

// --- 3. 登入/登出/權限 邏輯 ---

/**
 * 處理 Google 登入 (Popup)
 */
function signIn() {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
        .then((result) => { console.log("Popup 登入成功", result.user.email); })
        .catch((error) => {
             console.error("Popup 登入失敗:", error);
             if (error.code === 'auth/popup-blocked') { alert("Google 登入失敗：彈出視窗被瀏覽器攔截了！"); }
             else if (error.code === 'auth/cancelled-popup-request') { console.log("使用者取消了多個彈窗請求。"); }
             else { alert("Google 登入失敗: " + error.message); }
        });
}

/**
 * 處理登出
 */
function signOutUser() {
    signOut(auth).catch((error) => {
        console.error("登出失敗:", error);
    });
}

/**
 * 監聽登入狀態的改變
 */
onAuthStateChanged(auth, async (user) => {
    console.log("Auth state changed, user:", user ? user.email : 'No user');
    if (user) {
        currentAuthUser = user;
        try {
            const userDocRef = doc(employeesCollectionRef, user.email);
            const userPermsDoc = await getDoc(userDocRef);
            if (userPermsDoc.exists()) {
                currentUserPermissions = userPermsDoc.data();
                console.log("權限已載入:", currentUserPermissions.name, currentUserPermissions);
            } else {
                console.warn("登入的 Google 帳號 " + user.email + " 不在員工名單中。");
                currentUserPermissions = null;
                 alert("您的 Google 帳號不在允許的員工名單中，將自動登出。");
                 setTimeout(signOutUser, 100);
                 return;
            }
        } catch (error) {
            console.error("獲取權限失敗:", error);
            currentUserPermissions = null;
            alert("獲取員工權限時發生錯誤，請稍後再試。");
            // setTimeout(signOutUser, 100);
        }
    } else {
        currentAuthUser = null;
        currentUserPermissions = null;
        console.log("訪客模式或已登出");
    }
    updateUIForPermissions(); // ★ 更新 UI
});

/**
 * (QC 專用) 根據權限顯示/隱藏 UI
 */
function updateUIForPermissions() {
    if (!loginButton || !logoutButton || !welcomeMessage || !userName ||
        !permissionDenied || !qcApp || !qcTableBody || !statusList) { // 加上 statusList 檢查
        // console.warn("updateUIForPermissions called before all DOM elements are ready.");
        return;
    }
    // console.log("Updating UI for permissions, canQC:", currentUserPermissions?.can_qc);

    const canQC = currentUserPermissions?.can_qc === true;

    // 更新登入/歡迎區塊
    loginButton.classList.toggle('is-hidden', !!currentAuthUser);
    welcomeMessage.classList.toggle('is-hidden', !currentAuthUser);
    if (currentAuthUser && currentUserPermissions) {
        userName.innerText = currentUserPermissions.name || currentAuthUser.email; // 備用
    } else {
        userName.innerText = "";
    }

    // 根據 QC 權限顯示/隱藏主要內容
    if (canQC) {
        qcApp.classList.remove('is-hidden');
        permissionDenied.classList.add('is-hidden');
        if (!qcDataListener) renderQCTable(); // 啟動 QC 表格監聽
        if (!qcStatusListener) renderQcStatusSummary(); // 啟動 QC 狀態監聽
    } else {
        qcApp.classList.add('is-hidden');
        permissionDenied.classList.remove('is-hidden');
        // 停止監聽器
        if (typeof qcDataListener === 'function') { qcDataListener(); qcDataListener = null; }
        if (typeof qcStatusListener === 'function') { qcStatusListener(); qcStatusListener = null; }
        // 清空 UI
        qcTableBody.innerHTML = '<tr><td colspan="9">您沒有 QC 權限。</td></tr>';
        statusList.innerHTML = '<li>您沒有 QC 權限。</li>';
    }
}

// --- 4. Excel 處理與儲存邏輯 ---

/**
 * 監聽檔案上傳
 */
function handleFileUpload(e) {
    console.log("File input changed.");
    const fileInput = e.target;
    // 重置按鈕和表格狀態
    processButton.disabled = true;
    fileNameDisplay.textContent = '未選擇任何檔案';
    workbook = null;
     if(qcTableBody) qcTableBody.innerHTML = '<tr><td colspan="9">請選擇 Excel 檔案。</td></tr>'; // 重置表格

    if (fileInput.files.length > 0) {
        fileNameDisplay.textContent = fileInput.files[0].name;
        const reader = new FileReader();
        reader.onload = (event) => {
            console.log("FileReader onload triggered.");
            try {
                const data = new Uint8Array(event.target.result); // ★ 確保是 Uint8Array
                workbook = XLSX.read(data, { type: 'array' });
                console.log("Workbook parsed successfully.");
                if (currentUserPermissions?.can_qc) { // 只有有權限才啟用按鈕
                    processButton.disabled = false;
                }
                 if(qcTableBody) qcTableBody.innerHTML = '<tr><td colspan="9">檔案已選擇，請點擊按鈕儲存。</td></tr>';
            } catch (readError) {
                 console.error("讀取 Excel 檔案失敗:", readError);
                 alert("讀取 Excel 檔案失敗，請確認檔案格式是否正確。");
                 fileNameDisplay.textContent = '讀取失敗'; workbook = null; processButton.disabled = true;
            }
        };
        reader.onerror = (error) => {
             console.error("FileReader 錯誤:", error);
             alert("讀取檔案時發生錯誤。");
             fileNameDisplay.textContent = '讀取錯誤'; workbook = null; processButton.disabled = true;
        };
        reader.readAsArrayBuffer(fileInput.files[0]);
    }
}


/**
 * 處理 Excel 並儲存到 Firebase
 */
async function processExcel() {
    if (!workbook) { alert("請先上傳 Excel 檔案！"); return; }
    if (!currentUserPermissions?.can_qc) { alert("權限不足，無法上傳資料！"); return; }

    processButton.disabled = true;
    processButton.innerText = "儲存中...";
    if(qcTableBody) qcTableBody.innerHTML = '<tr><td colspan="9">正在處理並儲存資料...</td></tr>';

    try {
        console.log("Starting Excel processing...");
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false, raw: false });
        const processedData = [];
        let currentGroup = null, currentAValue = null, currentNValue = null;
        for (let i = 1; i < json.length; i++) {
             const row = json[i];
             const colA = row[0] || null; const colE = row[4] || null; const colH = row[7] || null;
             const colI = row[8] || null; const colK = row[10] || null; const colN = row[13] || null;
             if (colA != null && String(colA).trim() !== "") { currentGroup = colA; currentAValue = colA; }
             if (colN != null && String(colN).trim() !== "") currentNValue = colN;
             let beforeDash = null, afterDash = null;
             if (typeof colH === "string" && colH.includes("-")) {
                 const parts = colH.split("-", 2); beforeDash = parts[0]; afterDash = parts[1];
             } else if (colH != null) { beforeDash = colH; }
             processedData.push({
                 N_Col: currentNValue, A_Col: currentAValue, H_After: afterDash,
                 I_Col: colI, E_Col: colE, H_Before: beforeDash, K_Col: colK
             });
        }
        console.log(`Processed ${processedData.length} rows from Excel.`);

        const batch = writeBatch(db);
        let writeCount = 0;
        const idSet = new Set();
        for (const rowData of processedData) {
             const n = String(rowData.N_Col || ''); const a = String(rowData.A_Col || ''); const hAfter = String(rowData.H_After || '');
             const i = String(rowData.I_Col || ''); const eCol = String(rowData.E_Col || ''); const hBefore = String(rowData.H_Before || '');
             const k = String(rowData.K_Col || '');
             const docId = `${n}_${a}_${hAfter}_${i}_${eCol}_${hBefore}_${k}`;
             if (!docId || docId === "_______") { console.warn("跳過無效 ID:", rowData); continue; }
             if (idSet.has(docId)) { console.warn("跳過重複 ID:", docId, rowData); continue; }
             idSet.add(docId);
            const docRef = doc(qcCollectionRef, docId);
            const dataToUpload = {
                N_Col: rowData.N_Col, A_Col: rowData.A_Col, H_After: rowData.H_After,
                I_Col: rowData.I_Col, E_Col: rowData.E_Col, H_Before: rowData.H_Before,
                K_Col: rowData.K_Col,
                last_uploaded_by: { name: currentUserPermissions.name, email: currentAuthUser.email },
                last_uploaded_at: serverTimestamp()
            };
            batch.set(docRef, dataToUpload, { merge: true });
            writeCount++;
        }
        console.log(`Prepared ${writeCount} writes for batch.`);

        if (writeCount > 0) {
            console.log("Committing batch write...");
            await batch.commit();
            console.log("Batch write successful.");
            alert(`處理完成！\n${writeCount} 筆資料已成功儲存/更新至 Firebase。`);
             if(qcTableBody) qcTableBody.innerHTML = '<tr><td colspan="9">資料已儲存，正在重新載入...</td></tr>';
        } else {
             alert("處理完成，但 Excel 中沒有有效的資料可儲存。");
             if(qcTableBody) qcTableBody.innerHTML = '<tr><td colspan="9">Excel 中無有效資料。</td></tr>';
        }
    } catch (error) {
        console.error("處理或儲存 Excel 失敗: ", error);
        if (error.code === 'permission-denied') { alert("錯誤：權限不足！只有 QC 管理員才能上傳資料。"); }
        else { alert("處理或儲存 Excel 時發生錯誤：" + error.message); }
         if(qcTableBody) qcTableBody.innerHTML = '<tr><td colspan="9">處理或儲存失敗，請檢查 F12 Console。</td></tr>';
    } finally {
        processButton.disabled = false;
        processButton.innerText = "2. 上傳並儲存資料";
        // 清理工作，防止重複提交舊 workbook
        workbook = null;
        uploadInput.value = ''; // 清空 file input 的值
        fileNameDisplay.textContent = '未選擇任何檔案';
        processButton.disabled = true; // 禁用按鈕直到選擇新檔案
    }
}


// --- 5. QC 表格顯示與更新 ---

/**
 * 從 Firebase 讀取資料，儲存到 currentQCData，然後呼叫 displaySortedTable
 */
function renderQCTable() {
     if (qcDataListener) { if (typeof qcDataListener === 'function') qcDataListener(); qcDataListener = null; }
    if (!qcTableBody) return;
    qcTableBody.innerHTML = '<tr><td colspan="9">資料載入中...</td></tr>';
    console.log("Setting up Firestore listener for qc_excel_data (Modular)...");

    const q = query(qcCollectionRef, orderBy("last_uploaded_at", "desc"), limit(500));

    qcDataListener = onSnapshot(q, (snapshot) => {
        console.log(`Firestore snapshot received: ${snapshot.size} documents.`);
        currentQCData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displaySortedTable();
    }, (error) => {
        console.error("讀取 QC 資料失敗 (Modular): ", error);
         if (!qcTableBody) return;
         qcTableBody.innerHTML = `<tr><td colspan="9">讀取資料失敗: ${error.message}</td></tr>`;
        if (error.code === 'permission-denied') { signOutUser(); }
    });
}

/**
 * 比較函數 (包含 Timestamp 修正)
 */
function compareValues(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'boolean' && typeof b === 'boolean') { return a === b ? 0 : a ? -1 : 1; }
    const aIsTimestamp = typeof a?.toMillis === 'function';
    const bIsTimestamp = typeof b?.toMillis === 'function';
    if (aIsTimestamp && bIsTimestamp) {
        try { return a.toMillis() - b.toMillis(); }
        catch (e) { console.error("Error comparing Timestamps:", e, a, b); return 0; }
    }
    if (aIsTimestamp) return -1;
    if (bIsTimestamp) return 1;
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (!isNaN(numA) && !isNaN(numB)) { return numA - numB; }
    const strA = String(a).toLowerCase();
    const strB = String(b).toLowerCase();
    if (strA < strB) return -1;
    if (strA > strB) return 1;
    return 0;
}


/**
 * 根據全局排序狀態，對 currentQCData 排序，過濾並顯示在表格中
 */
function displaySortedTable() {
    if (!qcTableBody) { console.error("displaySortedTable called but qcTableBody is null!"); return; }
    qcTableBody.innerHTML = "";

    if (!currentQCData || currentQCData.length === 0) {
        qcTableBody.innerHTML = '<tr><td colspan="9">沒有可顯示的資料。</td></tr>'; return;
    }
    // --- 1. 執行排序 ---
    if (currentSortKey) {
        const sampleData = currentQCData[0];
        if (sampleData && !(currentSortKey in sampleData) && currentSortKey !== 'last_uploaded_at' && currentSortKey !== 'last_qc_at') {
             console.warn(`Sort key "${currentSortKey}" invalid, falling back.`);
             currentSortKey = 'last_uploaded_at'; currentSortDirection = 'desc';
        }
        currentQCData.sort((a, b) => {
             let valueA = a[currentSortKey]; let valueB = b[currentSortKey];
             if (currentSortKey === 'last_uploaded_at' || currentSortKey === 'last_qc_at') {
                 // ★ 使用 Modular Timestamp 構造函數
                 valueA = valueA instanceof Timestamp ? valueA : new Timestamp(0,0);
                 valueB = valueB instanceof Timestamp ? valueB : new Timestamp(0,0);
             }
            const comparison = compareValues(valueA, valueB);
            return currentSortDirection === 'asc' ? comparison : -comparison;
        });
    }
    // --- 2. 更新表頭樣式 ---
    const headers = qcTable?.querySelectorAll('thead th.sortable-header');
    /* ... (更新表頭樣式邏輯不變) ... */
    if (headers) { /* ... */ }

    // --- 3. 產生表格行 (包含過濾) ---
    let renderedRowCount = 0;
    currentQCData.forEach(data => {
        const docId = data.id;
        const metal_ok = data.heavy_metal_ok === true;
        const data_ok = data.data_complete_ok === true;
        if (metal_ok && data_ok) { return; } // 過濾掉已完成的
        const row = document.createElement('tr');
        row.innerHTML = `<td>${data.N_Col||''}</td><td>${data.A_Col||''}</td><td>${data.H_After||''}</td><td>${data.I_Col||''}</td><td>${data.E_Col||''}</td><td>${data.H_Before||''}</td><td>${data.K_Col||''}</td><td class="${metal_ok?'status-ok':''}"><input type="checkbox" data-doc-id="${docId}" data-field="heavy_metal_ok" ${metal_ok?'checked':''}></td><td class="${data_ok?'status-ok':''}"><input type="checkbox" data-doc-id="${docId}" data-field="data_complete_ok" ${data_ok?'checked':''}></td>`;
        qcTableBody.appendChild(row);
        renderedRowCount++;
    });
    if (renderedRowCount === 0 && currentQCData.length > 0) { qcTableBody.innerHTML = '<tr><td colspan="9">所有顯示的資料均已完成 QC。</td></tr>'; }
    else if (renderedRowCount === 0) { qcTableBody.innerHTML = '<tr><td colspan="9">沒有可顯示的資料。</td></tr>'; }
    console.log(`QC Table rendered with ${renderedRowCount} (visible) of ${currentQCData.length} total rows, sorted by ${currentSortKey} ${currentSortDirection}.`);
}

/**
 * 處理 QC 核取方塊的點擊 (包含觸發狀態更新)
 */
async function handleQCCheck(checkbox) {
    if (!currentUserPermissions?.can_qc) { /* ... 權限檢查 ... */ }
    const docId = checkbox.getAttribute('data-doc-id');
    const field = checkbox.getAttribute('data-field');
    const isChecked = checkbox.checked;
    if (!docId || !field) return;
    checkbox.disabled = true;
    try {
        const docRef = doc(qcCollectionRef, docId);
        await updateDoc(docRef, {
            [field]: isChecked,
            last_qc_by: { name: currentUserPermissions.name, email: currentAuthUser.email },
            last_qc_at: serverTimestamp()
        });
        console.log(`QC status updated for ${docId}: ${field}=${isChecked}`);
        const updatedDoc = await getDoc(docRef);
        if (updatedDoc.exists()) {
            const newData = updatedDoc.data();
            if (newData.heavy_metal_ok === true && newData.data_complete_ok === true) {
                console.log(`Both checked for ${docId}. Triggering status update...`);
                // ★ 使用 H_After
                updateLatestHiddenBarrel(newData.A_Col, newData.H_After);
            }
        }
    } catch (error) { /* ... 錯誤處理 ... */ }
    finally { checkbox.disabled = false; }
}

// --- 6. QC 狀態顯示與更新 ---

/**
 * 從 Firebase 讀取 QC 狀態並顯示摘要
 */
function renderQcStatusSummary() {
    if (qcStatusListener) { if (typeof qcStatusListener === 'function') qcStatusListener(); qcStatusListener = null; }
    if (!statusList) return;
    statusList.innerHTML = '<li>載入中...</li>';
    console.log("Setting up Firestore listener for material_qc_status...");
    const statusQuery = query(materialStatusCollectionRef, orderBy("lastUpdatedAt", "desc"));
    qcStatusListener = onSnapshot(statusQuery, (snapshot) => {
        console.log(`QC Status snapshot received: ${snapshot.size} documents.`);
        qcStatusMap = {};
        snapshot.forEach(doc => { qcStatusMap[doc.id] = doc.data().latestHiddenBarrel; });
        if (!statusList) return;
        statusList.innerHTML = "";
        if (Object.keys(qcStatusMap).length === 0) {
            statusList.innerHTML = '<li>尚無任何料號完成 QC。</li>'; return;
        }
        snapshot.forEach(doc => {
             const materialId = doc.id;
             const latestBarrel = doc.data().latestHiddenBarrel;
             const li = document.createElement('li');
             li.innerHTML = `<strong>${materialId}:</strong> QC 完成至桶號 ${latestBarrel}`;
             statusList.appendChild(li);
        });
         console.log("QC Status summary rendered.");
    }, (error) => { /* ... 錯誤處理 ... */ });
}

/**
 * 更新 material_qc_status 中料號的最新隱藏桶號 (使用 H_After)
 */
async function updateLatestHiddenBarrel(materialId, hAfter) {
    if (!materialId || hAfter == null) { /* ... 參數檢查 ... */ return; }
    const barrelNumber = parseInt(String(hAfter), 10);
    if (isNaN(barrelNumber)) { /* ... 數字檢查 ... */ return; }
    console.log(`Checking status for ${materialId}, new potential: ${barrelNumber} (from H_After)`);
    const statusDocRef = doc(materialStatusCollectionRef, materialId);
    try {
        const statusDoc = await getDoc(statusDocRef);
        let currentLatest = -1;
        if (statusDoc.exists()) { currentLatest = statusDoc.data().latestHiddenBarrel || -1; }
        if (barrelNumber > currentLatest) {
            console.log(`Updating latest hidden for ${materialId} from ${currentLatest} to ${barrelNumber}`);
            await setDoc(statusDocRef, {
                latestHiddenBarrel: barrelNumber,
                lastUpdatedAt: serverTimestamp()
            }, { merge: true });
            console.log(`Successfully updated status for ${materialId}`);
        } else { console.log(`No update needed for ${materialId}`); }
    } catch (error) { console.error(`Failed to update status for ${materialId}:`, error); }
}


// --- 7. 啟動事件監聽 ---
window.addEventListener('DOMContentLoaded', (event) => {
    console.log('QC DOM fully loaded and parsed');
    // ★ 獲取 DOM 元素
    loginButton = document.getElementById('loginButton');
    logoutButton = document.getElementById('logoutButton');
    welcomeMessage = document.getElementById('welcomeMessage');
    userName = document.getElementById('userName');
    permissionDenied = document.getElementById('permissionDenied');
    qcApp = document.getElementById('qcApp');
    uploadInput = document.getElementById('upload');
    fileNameDisplay = document.getElementById('fileName');
    processButton = document.getElementById('processButton');
    qcTable = document.getElementById('qcTable');
    qcTableBody = document.getElementById('qcTableBody');
    statusList = document.getElementById('statusList'); // ★ QC 狀態列表

    // ★ 檢查是否成功獲取
    if (!loginButton) console.error("Login button (id=loginButton) not found!");
    if (!statusList) console.error("statusList not found!");
    // ... 其他檢查

    // ★ 綁定事件監聽器
    if (loginButton) loginButton.addEventListener('click', signIn);
    if (logoutButton) logoutButton.addEventListener('click', signOutUser);
    if (processButton) processButton.addEventListener('click', processExcel);
    if (uploadInput) uploadInput.addEventListener('change', handleFileUpload);
    if (qcTableBody) {
        qcTableBody.addEventListener('change', (event) => {
            if (event.target.type === 'checkbox') { handleQCCheck(event.target); }
        });
    }

    // ★ 表頭點擊事件監聽 (恢復)
    const thead = qcTable?.querySelector('thead');
    if (thead) {
        thead.addEventListener('click', (event) => {
            const header = event.target.closest('th.sortable-header');
            if (header) {
                const sortKey = header.getAttribute('data-sort-key');
                if (sortKey) {
                    if (currentSortKey === sortKey) { currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc'; }
                    else { currentSortKey = sortKey; currentSortDirection = 'asc'; }
                    displaySortedTable(); // ★ 呼叫顯示函數
                }
            }
        });
    } else { console.error("Table thead not found!"); }

    // ★ 檢查初始 Auth 狀態並更新 UI
     if(auth.currentUser){ console.log("Initial auth state: User found."); onAuthStateChanged(auth.currentUser); }
     else { console.log("Initial auth state: No user found."); updateUIForPermissions(); }
});
// (auth.onAuthStateChanged 保持在全局)