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
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp; // ★ 重新加入

// --- 1-D. 資料庫集合 ---
const qcCollection = db.collection("qc_excel_data"); // ★ 重新加入
const employeesCollection = db.collection("employees");

// --- 1-E. 全局變數 ---
let currentUserPermissions = null;
let currentAuthUser = null;
let workbook;
let qcDataListener = null; // ★ 重新加入 (用於 Firebase 監聽)
// (移除 currentPreviewData, currentSortKey, currentSortDirection)

// --- 2. 取得 DOM 元素 ---
// (此區塊無變更)
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const welcomeMessage = document.getElementById('welcomeMessage');
const userName = document.getElementById('userName');
const permissionDenied = document.getElementById('permissionDenied');
const qcApp = document.getElementById('qcApp');
const uploadInput = document.getElementById('upload');
const fileNameDisplay = document.getElementById('fileName');
const processButton = document.getElementById('processButton');
const qcTable = document.getElementById('qcTable');
const qcTableBody = document.getElementById('qcTableBody');

// --- 3. 登入/登出/權限 邏輯 ---
// (此區塊無變更)
function signIn() { /* ... */ }
function signOut() { /* ... */ }
auth.onAuthStateChanged(async (user) => { /* ... */ });

/**
 * (★ QC 專用) 根據權限顯示/隱藏 UI
 * (★ 已修改：呼叫 renderQCTable 或停止監聽)
 */
function updateUIForPermissions() {
    const canQC = currentUserPermissions?.can_qc === true;
    if (canQC) {
        qcApp.classList.remove('is-hidden');
        permissionDenied.classList.add('is-hidden');
        renderQCTable(); // ★ 啟動 Firebase 監聽
    } else {
        qcApp.classList.add('is-hidden');
        permissionDenied.classList.remove('is-hidden');
        if (qcDataListener) qcDataListener(); // ★ 停止監聽
    }
}

// --- 4. Excel 處理與【儲存】邏輯 ---

/**
 * 監聽檔案上傳
 * (★ 已修改按鈕文字和提示)
 */
uploadInput.addEventListener('change', (e) => {
    const fileInput = e.target;
    if (fileInput.files.length > 0) {
        fileNameDisplay.textContent = fileInput.files[0].name;
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target.result);
            workbook = XLSX.read(data, { type: 'array' });
            processButton.disabled = false;
            // (移除 qcTableBody 的提示更新)
        };
        reader.readAsArrayBuffer(fileInput.files[0]);
    } else {
        fileNameDisplay.textContent = '未選擇任何檔案';
        workbook = null;
        processButton.disabled = true;
    }
});

/**
 * (★ 已重寫) 處理 Excel 並【儲存到 Firebase】
 */
async function processExcel() {
    if (!workbook) {
        alert("請先上傳 Excel 檔案！"); return;
    }
    // (權限檢查 - 雖然按鈕已隱藏，但多一層保險)
    if (!currentUserPermissions?.can_qc) {
        alert("權限不足，無法上傳資料！"); return;
    }

    processButton.disabled = true;
    processButton.innerText = "儲存中..."; // ★ 修改按鈕文字

    try {
        // --- 1. 讀取和轉換 Excel 資料 ---
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

        // --- 2. ★ (新) 寫入 Firebase (使用 Batch Write) ---
        const batch = db.batch();
        let writeCount = 0;

        for (const rowData of processedData) {
            // ★ 生成唯一 ID (將 null/undefined 轉為空字串)
             const n = String(rowData.N_Col || '');
             const a = String(rowData.A_Col || '');
             const hAfter = String(rowData.H_After || '');
             const i = String(rowData.I_Col || '');
             const eCol = String(rowData.E_Col || ''); // 避免與變數 e 衝突
             const hBefore = String(rowData.H_Before || '');
             const k = String(rowData.K_Col || '');

             // 組合 ID (如果需要，可以替換掉非法字符，但 Firestore ID 允許 _ )
             const docId = `${n}_${a}_${hAfter}_${i}_${eCol}_${hBefore}_${k}`;

             // 簡單驗證 ID 是否有效
             if (!docId || docId === "_______") { // 檢查是否全為空
                 console.warn("跳過無效 ID 的資料列:", rowData);
                 continue;
             }

            const docRef = qcCollection.doc(docId);

            // 準備要上傳的資料 (只包含 Excel 讀取的欄位 + 上傳資訊)
            const dataToUpload = {
                N_Col: rowData.N_Col,
                A_Col: rowData.A_Col,
                H_After: rowData.H_After,
                I_Col: rowData.I_Col,
                E_Col: rowData.E_Col,
                H_Before: rowData.H_Before,
                K_Col: rowData.K_Col,
                // (移除 Note)
                last_uploaded_by: {
                    name: currentUserPermissions.name,
                    email: currentAuthUser.email
                },
                last_uploaded_at: serverTimestamp()
                // (不包含 QC 欄位，讓 merge 保留舊狀態)
            };

            // 使用 { merge: true } 進行 Upsert
            batch.set(docRef, dataToUpload, { merge: true });
            writeCount++;
        }

        // 提交批次寫入
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
        processButton.innerText = "2. 上傳並儲存資料"; // ★ 修改按鈕文字
    }
}


// --- 5. ★ (新) QC 表格顯示與更新 ---

/**
 * (★ 重新加入並修改) 從 Firebase 讀取資料並顯示 QC 表格
 */
function renderQCTable() {
    if (qcDataListener) qcDataListener(); // 停止舊的監聽

    // ★ 預設排序：按上次上傳時間倒序
    qcDataListener = qcCollection
        .orderBy("last_uploaded_at", "desc")
        .limit(100) // (保持限制)
        .onSnapshot((snapshot) => {
            qcTableBody.innerHTML = "";
            if (snapshot.empty) {
                qcTableBody.innerHTML = '<tr><td colspan="9">資料庫中尚無 QC 資料。請上傳一份 Excel。</td></tr>'; // ★ 更新 colspan
                return;
            }
            snapshot.forEach(doc => {
                const data = doc.data();
                const docId = doc.id;
                const metal_ok = data.heavy_metal_ok === true;
                const data_ok = data.data_complete_ok === true;

                const row = document.createElement('tr');
                // ★ 產生包含 7 個資料欄位 + 2 個 Checkbox 的 HTML
                row.innerHTML = `
                    <td>${data.N_Col || ''}</td>
                    <td>${data.A_Col || ''}</td>
                    <td>${data.H_After || ''}</td>
                    <td>${data.I_Col || ''}</td>
                    <td>${data.E_Col || ''}</td>
                    <td>${data.H_Before || ''}</td>
                    <td>${data.K_Col || ''}</td>
                    <td class="${metal_ok ? 'status-ok' : ''}">
                        <input type="checkbox"
                               data-doc-id="${docId}"
                               data-field="heavy_metal_ok"
                               ${metal_ok ? 'checked' : ''}>
                    </td>
                    <td class="${data_ok ? 'status-ok' : ''}">
                        <input type="checkbox"
                               data-doc-id="${docId}"
                               data-field="data_complete_ok"
                               ${data_ok ? 'checked' : ''}>
                    </td>
                `;
                qcTableBody.appendChild(row);
            });
        }, (error) => {
            console.error("讀取 QC 資料失敗: ", error);
            if (error.code === 'permission-denied') {
                 qcTableBody.innerHTML = '<tr><td colspan="9">錯誤：權限不足，無法讀取 QC 資料。</td></tr>'; // ★ 更新 colspan
                 signOut();
            } else {
                 qcTableBody.innerHTML = '<tr><td colspan="9">讀取資料失敗。</td></tr>'; // ★ 更新 colspan
            }
        });
}

/**
 * (★ 重新加入) 處理 QC 核取方塊的點擊
 */
async function handleQCCheck(checkbox) {
    // (權限檢查 - 雖然 Checkbox 已隱藏，但多一層保險)
    if (!currentUserPermissions?.can_qc) {
        alert("權限不足，無法更新 QC 狀態！");
        checkbox.checked = !checkbox.checked; // 恢復原狀
        return;
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

// --- (★ 已移除) displayPreviewTable(), sortAndDisplayPreview(), compareValues() ---


// --- 6. 啟動事件監聽 ---
loginButton.addEventListener('click', signIn);
logoutButton.addEventListener('click', signOut);
processButton.addEventListener('click', processExcel);

// ★★★ (新) QC 表格 Checkbox 事件監聽 ★★★
qcTableBody.addEventListener('change', (event) => {
    if (event.target.type === 'checkbox') {
        handleQCCheck(event.target);
    }
});

// (★ 已移除 表頭點擊事件監聽)