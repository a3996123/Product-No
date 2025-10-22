// --- 1. 初始化 Firebase (Modular SDK) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app-check.js";
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, onSnapshot, writeBatch, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// !! 關鍵步驟：確認 firebaseConfig 正確 !!
const firebaseConfig = {
    apiKey: "AIzaSyAiwKqljpecPfLnvgFJ_D_nQVmv5VSuAqQ",
    authDomain: "product-no-38a46.firebaseapp.com",
    projectId: "product-no-38a46",
    storageBucket: "product-no-38a46.firebasestorage.app",
    messagingSenderId: "89833673713",
    appId: "1:89833673713:web:719ea9cee8c28ccb5eaa50",
    measurementId: "G-4V80L4RF0K"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // ★ 初始化 Firestore (Modular)

// --- 1-B. 初始化 App Check ---
try {
    initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('6LcYdfArAAAAADhAH5MPwdfpq2GaLgD6DpiXbu4Q'), // ★ 確認金鑰正確
        isTokenAutoRefreshEnabled: true,
    });
    console.log("Firebase App Check 已啟動（手動模式）。");
} catch (error) { console.error("App Check 啟動失敗:", error); }

// --- 1-D. 資料庫集合引用 (Modular) ---
const qcCollectionRef = collection(db, "qc_excel_data");
const employeesCollectionRef = collection(db, "employees");

// --- 1-E. 全局變數 ---
let currentUserPermissions = null;
let currentAuthUser = null;
let workbook;
let qcDataListener = null; // Unsubscribe function
// ★ 排序相關
let currentQCData = [];
let currentSortKey = 'last_uploaded_at';
let currentSortDirection = 'desc';

// --- 2. 取得 DOM 元素 (先宣告) ---
let loginButton, logoutButton, welcomeMessage, userName, permissionDenied, qcApp;
let uploadInput, fileNameDisplay, processButton, qcTable, qcTableBody;

// --- 3. 登入/登出/權限 邏輯 (Modular Auth) ---

/**
 * 處理 Google 登入 (Popup)
 */
function signIn() {
    const provider = new GoogleAuthProvider(); // ★ Modular
    signInWithPopup(auth, provider) // ★ Modular
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
function signOutUser() { // ★ 改名避免與 import 衝突
    signOut(auth).catch((error) => { // ★ Modular
        console.error("登出失敗:", error);
    });
}

/**
 * 監聽登入狀態的改變
 */
onAuthStateChanged(auth, async (user) => { // ★ Modular
    console.log("Auth state changed, user:", user ? user.email : 'No user');
    if (user) {
        currentAuthUser = user;
        try {
            // ★ 使用 Modular Firestore 獲取權限
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
 * (QC 專用) 根據權限顯示/隱藏 UI (★ 操作舊 ID)
 */
function updateUIForPermissions() {
    if (!loginButton || !qcApp || !permissionDenied || !welcomeMessage || !userName || !qcTableBody) {
        console.warn("updateUIForPermissions called before DOM elements are ready."); return;
    }
    console.log("Updating UI for permissions, canQC:", currentUserPermissions?.can_qc);

    const canQC = currentUserPermissions?.can_qc === true;

    // 更新登入/歡迎區塊 (★ 使用舊 ID 和 class)
    loginButton.classList.toggle('is-hidden', !!currentAuthUser);
    welcomeMessage.classList.toggle('is-hidden', !currentAuthUser);
    if (currentAuthUser && currentUserPermissions) {
        userName.innerText = currentUserPermissions.name || currentAuthUser.email;
    } else {
        userName.innerText = "";
    }

    // 根據 QC 權限顯示/隱藏主要內容
    if (canQC) {
        qcApp.classList.remove('is-hidden');
        permissionDenied.classList.add('is-hidden');
        if (!qcDataListener) {
           console.log("Attempting to start QC data listener...");
           renderQCTable(); // 啟動 Firebase 監聽
        }
    } else {
        qcApp.classList.add('is-hidden');
        permissionDenied.classList.remove('is-hidden');
        if (typeof qcDataListener === 'function') {
            console.log("Stopping QC data listener.");
            qcDataListener();
            qcDataListener = null;
        }
        qcTableBody.innerHTML = '<tr><td colspan="9">您沒有 QC 權限。</td></tr>';
    }
}

// --- 4. Excel 處理與儲存邏輯 (★ 改用 Modular Firestore) ---

function handleFileUpload(e) { /* ... (無變更) ... */ }

/**
 * 處理 Excel 並儲存到 Firebase (★ 改用 Modular Firestore)
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
        for (let i = 1; i < json.length; i++) { /* ... (Excel 處理邏輯不變) ... */ }
        console.log(`Processed ${processedData.length} rows from Excel.`);

        // ★ 使用 Modular Firestore Batch
        const batch = writeBatch(db);
        let writeCount = 0;
        const idSet = new Set();

        for (const rowData of processedData) {
             const n = String(rowData.N_Col || ''); /* ... (產生 ID 邏輯不變) ... */
             const docId = `${n}_${a}_${hAfter}_${i}_${eCol}_${hBefore}_${k}`;
             if (!docId || docId === "_______") { /* ... (跳過無效) ... */ }
             if (idSet.has(docId)) { /* ... (跳過重複) ... */ }
             idSet.add(docId);

            // ★ Modular Firestore Document Reference
            const docRef = doc(qcCollectionRef, docId);

            const dataToUpload = {
                N_Col: rowData.N_Col, A_Col: rowData.A_Col, H_After: rowData.H_After,
                I_Col: rowData.I_Col, E_Col: rowData.E_Col, H_Before: rowData.H_Before,
                K_Col: rowData.K_Col,
                last_uploaded_by: { name: currentUserPermissions.name, email: currentAuthUser.email },
                last_uploaded_at: serverTimestamp() // ★ Modular
            };
            // ★ Modular Batch Set with Merge
            batch.set(docRef, dataToUpload, { merge: true });
            writeCount++;
        }
        console.log(`Prepared ${writeCount} writes for batch.`);

        if (writeCount > 0) {
            console.log("Committing batch write...");
            await batch.commit(); // ★ Modular Commit
            console.log("Batch write successful.");
            alert(`處理完成！\n${writeCount} 筆資料已成功儲存/更新至 Firebase。`);
             if(qcTableBody) qcTableBody.innerHTML = '<tr><td colspan="9">資料已儲存，正在重新載入...</td></tr>';
        } else { /* ... 無有效資料 ... */ }
    } catch (error) { /* ... 錯誤處理 ... */ }
    finally { /* ... 恢復按鈕 ... */ }
}


// --- 5. QC 表格顯示與更新 (★ 改用 Modular Firestore) ---

/**
 * 從 Firebase 讀取資料，儲存到 currentQCData，然後呼叫 displaySortedTable
 * (★ 改用 Modular Firestore onSnapshot)
 */
function renderQCTable() {
     if (qcDataListener) { if (typeof qcDataListener === 'function') qcDataListener(); qcDataListener = null; }
    if (!qcTableBody) return;
    qcTableBody.innerHTML = '<tr><td colspan="9">資料載入中...</td></tr>';
    console.log("Setting up Firestore listener for qc_excel_data (Modular)...");

    // ★ Modular Firestore Query
    const q = query(qcCollectionRef, orderBy("last_uploaded_at", "desc"), limit(500));

    // ★ Modular Firestore Listener
    qcDataListener = onSnapshot(q, (snapshot) => {
        console.log(`Firestore snapshot received: ${snapshot.size} documents.`);
        currentQCData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displaySortedTable(); // ★ 呼叫排序和顯示函數
    }, (error) => {
        console.error("讀取 QC 資料失敗 (Modular): ", error);
         if (!qcTableBody) return;
        if (error.code === 'permission-denied') { /* ... */ }
        else { /* ... */ }
    });
}

// ★ 恢復排序相關函數 (無變更)
function compareValues(a, b) { /* ... */ }
function displaySortedTable() { /* ... */ }

/**
 * 處理 QC 核取方塊的點擊 (★ 改用 Modular Firestore)
 */
async function handleQCCheck(checkbox) {
    if (!currentUserPermissions?.can_qc) { /* ... 權限檢查 ... */ }
    const docId = checkbox.getAttribute('data-doc-id');
    const field = checkbox.getAttribute('data-field');
    const isChecked = checkbox.checked;
    if (!docId || !field) return;
    checkbox.disabled = true;
    try {
        // ★ Modular Firestore Document Reference
        const docRef = doc(qcCollectionRef, docId);
        // ★ Modular Update
        await updateDoc(docRef, {
            [field]: isChecked,
            last_qc_by: { name: currentUserPermissions.name, email: currentAuthUser.email },
            last_qc_at: serverTimestamp() // ★ Modular
        });
        console.log(`QC status updated for ${docId}: ${field}=${isChecked}`);
    } catch (error) { /* ... 錯誤處理 ... */ }
    finally { checkbox.disabled = false; }
}


// --- 6. 啟動事件監聽 (★ 操作舊 ID) ---
window.addEventListener('DOMContentLoaded', (event) => {
    console.log('QC DOM fully loaded and parsed');
    // ★ 獲取舊 ID 的 DOM 元素
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

    // ★ 檢查是否成功獲取
    if (!loginButton) console.error("Login button (id=loginButton) not found!");
    // ... 其他檢查

    // ★ 綁定事件監聽器 (★ 綁定到舊 ID)
    if (loginButton) loginButton.addEventListener('click', signIn);
    if (logoutButton) logoutButton.addEventListener('click', signOutUser); // ★ 使用新函數名
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
     if(auth.currentUser){ console.log("Initial auth state: User found."); onAuthStateChanged(auth.currentUser); } // 手動觸發一次
     else { console.log("Initial auth state: No user found."); updateUIForPermissions(); }
});