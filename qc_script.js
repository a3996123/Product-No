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
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const welcomeMessage = document.getElementById('welcomeMessage');
const userName = document.getElementById('userName');
const permissionDenied = document.getElementById('permissionDenied');
const qcApp = document.getElementById('qcApp');
const uploadInput = document.getElementById('upload');
const fileNameDisplay = document.getElementById('fileName');
const processButton = document.getElementById('processButton');
const qcTableBody = document.getElementById('qcTableBody');

// --- 3. 登入/登出/權限 邏輯 ---

/**
 * 處理 Google 登入 (★ 已修改為 Popup)
 */
function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    // ★★★ 使用 signInWithPopup ★★★
    auth.signInWithPopup(provider)
        .then((result) => {
            console.log("Popup 登入成功", result.user);
        })
        .catch((error) => {
            console.error("Popup 登入失敗:", error);
            alert("Google 登入失敗: " + error.message);
        });
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
    if (user) {
        currentAuthUser = user;
        try {
            const userPermsDoc = await employeesCollection.doc(user.email).get();
            if (userPermsDoc.exists) {
                currentUserPermissions = userPermsDoc.data();
                loginButton.classList.add('is-hidden');
                welcomeMessage.classList.remove('is-hidden');
                userName.innerText = currentUserPermissions.name;
                updateUIForPermissions(); 
            } else {
                alert("登入失敗：您的 Google 帳號 " + user.email + " 不在允許的員工名單中。");
                signOut();
            }
        } catch (error) {
            console.error("獲取權限失敗:", error);
            alert("獲取員工權限時發生錯誤，請稍後再試。");
            signOut();
        }
    } else {
        currentAuthUser = null;
        currentUserPermissions = null;
        loginButton.classList.remove('is-hidden');
        welcomeMessage.classList.add('is-hidden');
        userName.innerText = "";
        updateUIForPermissions(); 
    }
});

/**
 * (QC 專用) 根據權限顯示/隱藏 UI
 */
function updateUIForPermissions() {
    const canQC = currentUserPermissions?.can_qc === true;
    if (canQC) {
        qcApp.classList.remove('is-hidden');
        permissionDenied.classList.add('is-hidden');
        renderQCTable();
    } else {
        qcApp.classList.add('is-hidden');
        permissionDenied.classList.remove('is-hidden');
        if (qcDataListener) qcDataListener();
    }
}

// --- 4. Excel 處理與上傳邏輯 ---
// (此區塊無變更)
uploadInput.addEventListener('change', (e) => {
    const fileInput = e.target;
    if (fileInput.files.length > 0) {
        fileNameDisplay.textContent = fileInput.files[0].name;
        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target.result);
            workbook = XLSX.read(data, { type: 'array' });
            processButton.disabled = false;
        };
        reader.readAsArrayBuffer(fileInput.files[0]);
    } else {
        fileNameDisplay.textContent = '未選擇任何檔案';
        workbook = null;
        processButton.disabled = true;
    }
});

async function processExcel() {
    if (!workbook) {
        alert("請先上傳 Excel 檔案！"); return;
    }
    processButton.disabled = true;
    processButton.innerText = "處理中...";
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
    const allDataForNote = [["桶別", "B", "C", "D", "E", "F", "G"]]; 
    const extraSheetData = []; 
    let currentGroup = "", currentDValue = "", currentNValue = "", currentAValue = "";
    for (let i = 1; i < json.length; i++) {
        const row = json[i];
        const colA = row[0], colE = row[4], colG = row[6], colH = row[7];
        const colI = row[8], colK = row[10], colN = row[13];
        if (colA && colA.trim() !== "") { currentGroup = colA; currentAValue = colA; }
        if (colG && colG.toString().trim() !== "") currentDValue = colG;
        if (colN && colN.toString().trim() !== "") currentNValue = colN;
        let beforeDash = "", afterDash = "";
        if (typeof colH === "string" && colH.includes("-")) {
            const parts = colH.split("-");
            beforeDash = parts[0];
            afterDash = parts[1];
        }
        allDataForNote.push([currentGroup, afterDash, colI, currentDValue, beforeDash, colK, colE]);
        extraSheetData.push({ N_Col: currentNValue, A_Col: currentAValue, H_After: afterDash });
    }
    for (let i = 1; i < allDataForNote.length; i++) {
        const fColumnValue = allDataForNote[i][5];
        extraSheetData[i-1].Note = (!fColumnValue || fColumnValue.toString().trim() === "") ? "缺日期" : "";
    }
    const batch = db.batch();
    for (const rowData of extraSheetData) {
        const docId = `${rowData.N_Col}_${rowData.A_Col}_${rowData.H_After}`;
        if (!docId || docId === "__") continue; 
        const docRef = qcCollection.doc(docId);
        const dataToUpload = {
            N_Col: rowData.N_Col,
            A_Col: rowData.A_Col,
            H_After: rowData.H_After,
            Note: rowData.Note,
            last_uploaded_by: { name: currentUserPermissions.name, email: currentAuthUser.email },
            last_uploaded_at: serverTimestamp()
        };
        batch.set(docRef, dataToUpload, { merge: true });
    }
    try {
        await batch.commit();
        alert(`處理完成！\n${extraSheetData.length} 筆資料已成功新增/更新至 Firebase。`);
    } catch (error) {
        console.error("批次寫入失敗: ", error);
        if (error.code === 'permission-denied') {
            alert("錯誤：權限不足！只有 QC 管理員 (10369) 才能上傳資料。");
        } else {
            alert("上傳失敗：" + error.message);
        }
    } finally {
        processButton.disabled = false;
        processButton.innerText = "2. 上傳並處理資料";
    }
}

// --- 5. QC 表格顯示與更新 ---
// (此區塊無變更)
function renderQCTable() {
    if (qcDataListener) qcDataListener();
    qcDataListener = qcCollection
        .orderBy("last_uploaded_at", "desc") 
        .limit(100) 
        .onSnapshot((snapshot) => {
            qcTableBody.innerHTML = ""; 
            if (snapshot.empty) {
                qcTableBody.innerHTML = '<tr><td colspan="6">資料庫中尚無 QC 資料。請上傳一份 Excel。</td></tr>';
                return;
            }
            snapshot.forEach(doc => {
                const data = doc.data();
                const docId = doc.id;
                const metal_ok = data.heavy_metal_ok === true;
                const data_ok = data.data_complete_ok === true;
                const row = document.createElement('tr');
                row.innerHTML = `<td>${data.N_Col || ''}</td><td>${data.A_Col || ''}</td><td>${data.H_After || ''}</td><td>${data.Note || ''}</td><td class="${metal_ok ? 'status-ok' : ''}"><input type="checkbox" data-doc-id="${docId}" data-field="heavy_metal_ok" ${metal_ok ? 'checked' : ''}></td><td class="${data_ok ? 'status-ok' : ''}"><input type="checkbox" data-doc-id="${docId}" data-field="data_complete_ok" ${data_ok ? 'checked' : ''}></td>`;
                qcTableBody.appendChild(row);
            });
        }, (error) => {
            console.error("讀取 QC 資料失敗: ", error);
            if (error.code === 'permission-denied') {
                 qcTableBody.innerHTML = '<tr><td colspan="6">錯誤：權限不足，無法讀取 QC 資料。</td></tr>';
                 signOut(); 
            }
        });
}

async function handleQCCheck(checkbox) {
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

// --- 6. 啟動事件監聽 ---
// (此區塊無變更)
loginButton.addEventListener('click', signIn);
logoutButton.addEventListener('click', signOut);
processButton.addEventListener('click', processExcel);
qcTableBody.addEventListener('change', (event) => {
    if (event.target.type === 'checkbox') {
        handleQCCheck(event.target);
    }
});
/**
 * (新) 處理 QC 核取方塊的點擊
 */
async function handleQCCheck(checkbox) {
    const docId = checkbox.getAttribute('data-doc-id');
    const field = checkbox.getAttribute('data-field');
    const isChecked = checkbox.checked;

    if (!docId || !field) return;

    // 暫時禁用，防止重複點擊
    checkbox.disabled = true;
    
    // (使用 update 更新單一欄位)
    try {
        await qcCollection.doc(docId).update({
            [field]: isChecked, // [field] 允許我們使用變數 (heavy_metal_ok 或 data_complete_ok)
            last_qc_by: { // 紀錄是誰確認的
                name: currentUserPermissions.name,
                email: currentAuthUser.email
            },
            last_qc_at: serverTimestamp()
        });
        // 成功 (onSnapshot 會自動更新 UI 和背景顏色)
    } catch (error) {
        console.error("QC 更新失敗:", error);
        alert("更新失敗：" + error.message);
        checkbox.checked = !isChecked; // 恢復原狀
    } finally {
        checkbox.disabled = false;
    }
}

// --- 6. 啟動事件監聽 ---

// (登入/登出)
loginButton.addEventListener('click', signIn);
logoutButton.addEventListener('click', signOut);

// (Excel 上傳)
processButton.addEventListener('click', processExcel);

// (QC 表格 Checkbox)
qcTableBody.addEventListener('change', (event) => {
    if (event.target.type === 'checkbox') {
        handleQCCheck(event.target);
    }
});