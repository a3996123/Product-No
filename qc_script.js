// --- 1. 初始化 Firebase ---
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
firebase.initializeApp(firebaseConfig);

// ==========================================================
// ===== ★★★ 以下是本次修改的重點 ★★★ =====
// --- 1-B. 初始化 App Check (手動模式) ---
try {
    const appCheck = firebase.appCheck();
    appCheck.activate(
       
        '6LcYdfArAAAAADhAH5MPwdfpq2GaLgD6DpiXbu4Q', 
        { isTokenAutoRefreshEnabled: true }
    );
} catch (error) { console.error("App Check 啟動失敗:", error); }

// --- 1-C. 取得 Firebase 服務 ---
const db = firebase.firestore();
const auth = firebase.auth();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

// --- 1-D. 資料庫集合 ---
const qcCollection = db.collection("qc_excel_data");
const employeesCollection = db.collection("employees");

// --- 1-E. 全局變數 ---
let currentUserPermissions = null;
let currentAuthUser = null;
let workbook;
let qcDataListener = null;

// --- 2. 取得 DOM 元素 ---
// (在 DOMContentLoaded 外部宣告變數，但在內部獲取元素，確保元素存在)
let loginButton, logoutButton, welcomeMessage, userName, permissionDenied, qcApp;
let uploadInput, fileNameDisplay, processButton, qcTable, qcTableBody;

// --- 3. 登入/登出/權限 邏輯 ---

/**
 * 處理 Google 登入 (Popup)
 */
function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => { console.log("Popup 登入成功", result.user); })
        .catch((error) => { console.error("Popup 登入失敗:", error); alert("Google 登入失敗: " + error.message); });
}

/**
 * 處理登出
 */
function signOut() {
    auth.signOut();
}

/**
 * 監聽登入狀態的改變
 */
auth.onAuthStateChanged(async (user) => {
    // 確保 DOM 元素已獲取
    if (!loginButton) {
         console.warn("DOM not ready yet in onAuthStateChanged, retrying...");
         // 可以選擇稍後重試，或者依賴 DOMContentLoaded 中的 updateUIForPermissions
         return;
    }

    if (user) {
        currentAuthUser = user;
        try {
            const userPermsDoc = await employeesCollection.doc(user.email).get();
            if (userPermsDoc.exists) {
                currentUserPermissions = userPermsDoc.data();
                console.log("權限已載入:", currentUserPermissions.name, currentUserPermissions);
                updateUIForPermissions(); // 更新 UI
            } else {
                alert("登入失敗：您的 Google 帳號 " + user.email + " 不在允許的員工名單中。");
                signOut();
            }
        } catch (error) {
            console.error("獲取權限失敗:", error);
            alert("獲取員工權限時發生錯誤，請稍後再試。");
            signOut(); // 出錯時強制登出
        }
    } else {
        currentAuthUser = null;
        currentUserPermissions = null;
        console.log("訪客模式或已登出");
        updateUIForPermissions(); // 更新 UI 為登出狀態
    }
});

/**
 * (QC 專用) 根據權限顯示/隱藏 UI
 */
function updateUIForPermissions() {
     // 再次確保 DOM 元素已獲取
    if (!loginButton || !qcApp || !permissionDenied || !welcomeMessage || !userName) return;

    const canQC = currentUserPermissions?.can_qc === true;

    // 更新登入/歡迎區塊
    loginButton.classList.toggle('is-hidden', !!currentAuthUser); // 如果已登入就隱藏登入按鈕
    welcomeMessage.classList.toggle('is-hidden', !currentAuthUser); // 如果已登入就顯示歡迎訊息
    if (currentAuthUser && currentUserPermissions) {
        userName.innerText = currentUserPermissions.name;
    } else {
        userName.innerText = "";
    }


    if (canQC) {
        // 顯示 QC 應用程式
        qcApp.classList.remove('is-hidden');
        permissionDenied.classList.add('is-hidden');
        if (!qcDataListener) { // 避免重複啟動監聽
           renderQCTable(); // ★ 啟動 Firebase 監聽
        }
    } else {
        // 顯示權限不足 (即使登入了但權限不足也會顯示)
        qcApp.classList.add('is-hidden');
        permissionDenied.classList.remove('is-hidden');
        if (qcDataListener) {
            qcDataListener(); // ★ 停止監聽
            qcDataListener = null; // 重置監聽器
        }
        // 清空表格內容，顯示權限不足時的提示
        if(qcTableBody) qcTableBody.innerHTML = '<tr><td colspan="9">您沒有 QC 權限。</td></tr>';
    }
}

// --- 4. Excel 處理與儲存邏輯 ---

/**
 * 監聽檔案上傳
 */
function handleFileUpload(e) {
    const fileInput = e.target;
    if (fileInput.files.length > 0) {
        fileNameDisplay.textContent = fileInput.files[0].name;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result); // ★ 確保是 Uint8Array
                workbook = XLSX.read(data, { type: 'array' });
                processButton.disabled = false;
            } catch (readError) {
                 console.error("讀取 Excel 檔案失敗:", readError);
                 alert("讀取 Excel 檔案失敗，請確認檔案格式是否正確。");
                 fileNameDisplay.textContent = '讀取失敗';
                 workbook = null;
                 processButton.disabled = true;
            }
        };
        reader.onerror = (error) => {
             console.error("FileReader 錯誤:", error);
             alert("讀取檔案時發生錯誤。");
             fileNameDisplay.textContent = '讀取錯誤';
             workbook = null;
             processButton.disabled = true;
        };
        reader.readAsArrayBuffer(fileInput.files[0]);
    } else {
        fileNameDisplay.textContent = '未選擇任何檔案';
        workbook = null;
        processButton.disabled = true;
    }
}


/**
 * 處理 Excel 並儲存到 Firebase
 */
async function processExcel() {
    if (!workbook) {
        alert("請先上傳 Excel 檔案！"); return;
    }
    if (!currentUserPermissions?.can_qc) {
        alert("權限不足，無法上傳資料！"); return;
    }

    processButton.disabled = true;
    processButton.innerText = "儲存中...";

    try {
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
        const processedData = [];
        let currentGroup = "", currentAValue = "", currentNValue = "";
        for (let i = 1; i < json.length; i++) {
            const row = json[i];
            const colA = row[0], colE = row[4], colH = row[7];
            const colI = row[8], colK = row[10], colN = row[13];
            if (colA && colA.trim() !== "") { currentGroup = colA; currentAValue = colA; }
            if (colN && colN.toString().trim() !== "") currentNValue = colN;
            let beforeDash = "", afterDash = "";
            if (typeof colH === "string" && colH.includes("-")) {
                const parts = colH.split("-"); beforeDash = parts[0]; afterDash = parts[1];
            }
            processedData.push({
                N_Col: currentNValue, A_Col: currentAValue, H_After: afterDash,
                I_Col: colI, E_Col: colE, H_Before: beforeDash, K_Col: colK
            });
        }

        const batch = db.batch();
        let writeCount = 0;
        for (const rowData of processedData) {
             const n = String(rowData.N_Col || '');
             const a = String(rowData.A_Col || '');
             const hAfter = String(rowData.H_After || '');
             const i = String(rowData.I_Col || '');
             const eCol = String(rowData.E_Col || '');
             const hBefore = String(rowData.H_Before || '');
             const k = String(rowData.K_Col || '');
             const docId = `${n}_${a}_${hAfter}_${i}_${eCol}_${hBefore}_${k}`;
             if (!docId || docId === "_______") {
                 console.warn("跳過無效 ID 的資料列:", rowData);
                 continue;
             }
            const docRef = qcCollection.doc(docId);
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

        if (writeCount > 0) {
            await batch.commit();
            alert(`處理完成！\n${writeCount} 筆資料已成功儲存/更新至 Firebase。`);
        } else {
            alert("處理完成，但 Excel 中沒有有效的資料可儲存。");
        }
    } catch (error) {
        console.error("處理或儲存 Excel 失敗: ", error);
        if (error.code === 'permission-denied') {
            alert("錯誤：權限不足！只有 QC 管理員 (10369) 才能上傳資料。");
        } else {
            alert("處理或儲存 Excel 時發生錯誤：" + error.message);
        }
    } finally {
        processButton.disabled = false;
        processButton.innerText = "2. 上傳並儲存資料";
    }
}


// --- 5. QC 表格顯示與更新 ---

/**
 * 從 Firebase 讀取資料並顯示 QC 表格
 */
function renderQCTable() {
    if (qcDataListener) qcDataListener(); // 停止舊的監聽
    if (!qcTableBody) return; // 確保表格存在

    qcTableBody.innerHTML = '<tr><td colspan="9">資料載入中...</td></tr>'; // 初始提示

    qcDataListener = qcCollection
        .orderBy("last_uploaded_at", "desc")
        .limit(100)
        .onSnapshot((snapshot) => {
            if (!qcTableBody) return; // 再次檢查，防止元素消失
            qcTableBody.innerHTML = "";
            if (snapshot.empty) {
                qcTableBody.innerHTML = '<tr><td colspan="9">資料庫中尚無 QC 資料。請上傳一份 Excel。</td></tr>';
                return;
            }
            snapshot.forEach(doc => {
                const data = doc.data();
                const docId = doc.id;
                const metal_ok = data.heavy_metal_ok === true;
                const data_ok = data.data_complete_ok === true;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${data.N_Col || ''}</td>
                    <td>${data.A_Col || ''}</td>
                    <td>${data.H_After || ''}</td>
                    <td>${data.I_Col || ''}</td>
                    <td>${data.E_Col || ''}</td>
                    <td>${data.H_Before || ''}</td>
                    <td>${data.K_Col || ''}</td>
                    <td class="${metal_ok ? 'status-ok' : ''}">
                        <input type="checkbox" data-doc-id="${docId}" data-field="heavy_metal_ok" ${metal_ok ? 'checked' : ''}>
                    </td>
                    <td class="${data_ok ? 'status-ok' : ''}">
                        <input type="checkbox" data-doc-id="${docId}" data-field="data_complete_ok" ${data_ok ? 'checked' : ''}>
                    </td>
                `;
                qcTableBody.appendChild(row);
            });
        }, (error) => {
            console.error("讀取 QC 資料失敗: ", error);
             if (!qcTableBody) return;
            if (error.code === 'permission-denied') {
                 qcTableBody.innerHTML = '<tr><td colspan="9">錯誤：權限不足，無法讀取 QC 資料。</td></tr>';
                 // signOut(); // 考慮是否強制登出
            } else {
                 qcTableBody.innerHTML = '<tr><td colspan="9">讀取資料失敗。</td></tr>';
            }
        });
}

/**
 * 處理 QC 核取方塊的點擊
 */
async function handleQCCheck(checkbox) {
    if (!currentUserPermissions?.can_qc) {
        alert("權限不足，無法更新 QC 狀態！");
        checkbox.checked = !checkbox.checked; return;
    }
    const docId = checkbox.getAttribute('data-doc-id');
    const field = checkbox.getAttribute('data-field');
    const isChecked = checkbox.checked;
    if (!docId || !field) return;
    checkbox.disabled = true;
    try {
        await qcCollection.doc(docId).update({
            [field]: isChecked,
            last_qc_by: { name: currentUserPermissions.name, email: currentAuthUser.email },
            last_qc_at: serverTimestamp()
        });
    } catch (error) {
        console.error("QC 更新失敗:", error);
        alert("更新失敗：" + error.message);
        checkbox.checked = !isChecked;
    } finally {
        checkbox.disabled = false;
    }
}


// --- 6. 啟動事件監聽 (確保 DOM 已載入) ---
window.addEventListener('DOMContentLoaded', (event) => {
    console.log('QC DOM fully loaded and parsed');

    // ★ 在這裡才真正獲取 DOM 元素
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

    // ★ 綁定事件監聽器
    if (loginButton) loginButton.addEventListener('click', signIn);
    if (logoutButton) logoutButton.addEventListener('click', signOut);
    if (processButton) processButton.addEventListener('click', processExcel);
    if (uploadInput) uploadInput.addEventListener('change', handleFileUpload); // ★ 監聽上傳

    // QC 表格 Checkbox 事件監聽 (使用事件委派)
    if (qcTableBody) {
        qcTableBody.addEventListener('change', (event) => {
            if (event.target.type === 'checkbox') {
                handleQCCheck(event.target);
            }
        });
    }

    // 手動觸發一次 UI 更新，以處理頁面載入時的初始狀態
    updateUIForPermissions();

    // 手動觸發一次權限檢查（如果 Firebase Auth 已初始化）
    // 這確保了如果用戶已經登入，相關UI會正確顯示
     if(auth.currentUser){
         onAuthStateChanged(auth.currentUser);
     }

});

// (auth.onAuthStateChanged 保持在全局，以便 Firebase SDK 初始化後立即監聽)