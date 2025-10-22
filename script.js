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
const fieldPath = firebase.firestore.FieldPath.documentId;

// --- 1-D. 資料庫集合 ---
const recordsCollection = db.collection("records");
const materialsCollection = db.collection("materials");
const employeesCollection = db.collection("employees");

// --- 1-E. 全局變數 ---
let currentUserPermissions = null;
let currentAuthUser = null;
let currentListener = null;
let materialListListener = null;
let currentMaterialLot = null;

// --- 2. 取得 DOM 元素 ---
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const welcomeMessage = document.getElementById('welcomeMessage');
const userName = document.getElementById('userName');
const detailView = document.getElementById('detailView');
const detailTitle = document.getElementById('detailTitle');
const recordForm = document.getElementById('recordForm');
const tableBody = document.getElementById('recordBody');
const barrelNumberInput = document.getElementById('barrelNumber');
const homeView = document.getElementById('homeView');
const materialList = document.getElementById('materialList');
const newMaterialForm = document.getElementById('newMaterialForm');
const newMaterialInput = document.getElementById('newMaterialInput');
const searchForm = document.getElementById('searchForm');
const searchMaterialSelect = document.getElementById('searchMaterialSelect');
const searchBarrelInput = document.getElementById('searchBarrelInput');
const searchResults = document.getElementById('searchResults');

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
 * ★★★ (已修改) 不論登入登出，最後都會呼叫 router() ★★★
 */
auth.onAuthStateChanged(async (user) => {
    let initialLoad = (currentAuthUser === null && user === null); // 標記是否為頁面首次載入（且未登入）

    if (user) {
        // --- 使用者已登入 ---
        currentAuthUser = user;
        try {
            const userPermsDoc = await employeesCollection.doc(user.email).get();
            if (userPermsDoc.exists) {
                currentUserPermissions = userPermsDoc.data();
                console.log("權限已載入:", currentUserPermissions.name, currentUserPermissions);
                updateUIForPermissions(); // 更新按鈕可見性
            } else {
                console.warn("登入的 Google 帳號 " + user.email + " 不在員工名單中。將以訪客權限處理。");
                currentUserPermissions = null; // 視為訪客
                updateUIForPermissions();
                // (可以選擇在這裡 signOut() 強制登出非名單用戶)
                 alert("您的 Google 帳號不在允許的員工名單中，將以訪客模式瀏覽。");
                 signOut(); // 強制登出
                 return; // 結束執行，等待登出後的 onAuthStateChanged
            }
        } catch (error) {
            console.error("獲取權限失敗:", error);
            currentUserPermissions = null; // 視為訪客
            updateUIForPermissions();
            alert("獲取員工權限時發生錯誤，將以訪客模式瀏覽。");
        } finally {
            loginButton.classList.add('is-hidden');
            welcomeMessage.classList.remove('is-hidden');
            if(currentUserPermissions) userName.innerText = currentUserPermissions.name;
            else userName.innerText = user.displayName || user.email; // 備用顯示

            // ★ 登入後，呼叫 router 載入資料 (如果 hash 沒變，會載入首頁)
            router();
        }
    } else {
        // --- 使用者已登出 / 訪客 ---
        currentAuthUser = null;
        currentUserPermissions = null;
        console.log("訪客模式");

        // 更新 UI
        loginButton.classList.remove('is-hidden');
        welcomeMessage.classList.add('is-hidden');
        userName.innerText = "";
        updateUIForPermissions(); // 隱藏按鈕

        // ★ 登出後/訪客首次載入，也呼叫 router 載入資料
        router();
    }
});

/**
 * 根據權限顯示/隱藏 UI 元素
 */
function updateUIForPermissions() {
    const canAdd = currentUserPermissions?.can_add === true;
    const canDelete = currentUserPermissions?.can_delete === true;
    newMaterialForm.classList.toggle('is-hidden', !canAdd);
    recordForm.classList.toggle('is-hidden', !canAdd);
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.classList.toggle('is-hidden', !canDelete);
    });
}

// --- 4. 頁面導航 (路由) 邏輯 ---
/**
 * ★★★ (已修改) 移除 !currentUserPermissions 檢查 ★★★
 */
function router() {
    // (移除權限檢查 - 訪客也能路由)
    // if (!currentUserPermissions) { ... return; } // <- 已移除

    if (currentListener) { currentListener(); currentListener = null; }
    if (materialListListener) { materialListListener(); materialListListener = null; }
    const hash = window.location.hash.substring(1);
    if (hash) {
        currentMaterialLot = hash;
        showDetailPage(currentMaterialLot);
    } else {
        currentMaterialLot = null;
        showHomePage();
    }
}

/**
 * 顯示首頁
 * ★★★ (已修改) 總是嘗試載入資料 ★★★
 */
function showHomePage() {
    homeView.style.display = 'block';
    detailView.style.display = 'none';
    tableBody.innerHTML = "";
    materialList.innerHTML = '<li>讀取中...</li>'; // 初始狀態
    searchMaterialSelect.innerHTML = '<option value="">讀取料號中...</option>'; // 初始狀態
    searchResults.style.display = 'none';

    // (UI 更新由 updateUIForPermissions 處理)

    // 總是嘗試載入料號
    materialListListener = materialsCollection
        .orderBy(fieldPath(), "asc")
        .onSnapshot((snapshot) => {
            // (內部邏輯不變)
            materialList.innerHTML = "";
            searchMaterialSelect.innerHTML = '<option value="">-- 請選擇料號 --</option>';
            if (snapshot.empty) {
                materialList.innerHTML = '<li>尚無資料。' + (currentUserPermissions?.can_add ? '請由上方表單新增。' : '') + '</li>';
                searchMaterialSelect.innerHTML = '<option value="">-- 尚無料號 --</option>';
                return;
            }
            snapshot.forEach((doc) => {
                const materialName = doc.id;
                const li = document.createElement('li');
                li.innerHTML = `<a href="#${materialName}">${materialName}</a>`;
                materialList.appendChild(li);
                const option = document.createElement('option');
                option.value = materialName;
                option.innerText = materialName;
                searchMaterialSelect.appendChild(option);
            });
        }, (error) => {
            console.error("讀取料號清單失敗: ", error);
            // ★ (新) 根據錯誤類型給提示
            if (error.code === 'permission-denied') {
                materialList.innerHTML = '<li>讀取失敗 (權限不足)。請登入員工帳號。</li>';
                searchMaterialSelect.innerHTML = '<option value="">讀取失敗 (權限不足)</option>';
            } else {
                materialList.innerHTML = '<li>讀取失敗。</li>';
                searchMaterialSelect.innerHTML = '<option value="">讀取失敗</option>';
            }
        });
    // 確保 UI 正確 (例如首次載入時)
    updateUIForPermissions();
}

/**
 * 顯示詳細頁
 * ★★★ (已修改) 總是嘗試載入資料 ★★★
 */
function showDetailPage(materialLot) {
    homeView.style.display = 'none';
    detailView.style.display = 'block';
    detailTitle.innerText = `料號: ${materialLot}`;
    if(barrelNumberInput) barrelNumberInput.value = "";

    // (UI 更新由 updateUIForPermissions 處理)

    const canDelete = currentUserPermissions?.can_delete === true;

    // 總是嘗試載入桶別
    currentListener = recordsCollection
        .where("materialLot", "==", materialLot)
        .orderBy("timestamp", "desc")
        .orderBy("barrelNumber_sort", "desc")
        .onSnapshot((snapshot) => {
            // (內部邏輯不變)
            tableBody.innerHTML = "";
            if (snapshot.empty) {
                tableBody.innerHTML = '<tr><td colspan="4">目前沒有紀錄</td></tr>';
                return;
            }
            snapshot.forEach((doc) => {
                const data = doc.data();
                const date = data.timestamp ? data.timestamp.toDate().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';
                const deleteButtonHtml = `<button class="delete-btn ${canDelete ? '' : 'is-hidden'}" data-doc-id="${doc.id}">刪除</button>`;
                const rowFixed = `<tr data-row-id="${doc.id}"><td>${date}</td><td>${data.operator}</td><td>${data.barrelNumber_display || data.barrelNumber}</td><td>${deleteButtonHtml}</td></tr>`;
                tableBody.innerHTML += rowFixed;
            });
        }, (error) => {
            console.error("Firebase 讀取失敗: ", error);
            if (error.code === 'permission-denied') {
                tableBody.innerHTML = '<tr><td colspan="4">讀取失敗 (權限不足)。請登入員工帳號。</td></tr>';
                // (不需要 signOut(), 讓使用者能返回首頁)
            } else {
                 tableBody.innerHTML = '<tr><td colspan="4">讀取失敗。</td></tr>';
            }
        });
    // 確保 UI 正確
    updateUIForPermissions();
}

// --- 5. 刪除桶別 邏輯 ---
// (此區塊無變更, 內部已有權限檢查)
async function handleDeleteClick(docId) {
    // ★ 前端權限檢查 (雙重保險)
    if (!currentUserPermissions?.can_delete) {
        alert("權限不足：只有管理員才能刪除資料。");
        return;
    }
    // (後續邏輯不變)
    let barrelName = `ID: ${docId}`;
    try {
        const docSnap = await recordsCollection.doc(docId).get();
        if(docSnap.exists) barrelName = `桶別 "${docSnap.data().barrelNumber_display}"`;
    } catch (e) {}
    if (confirm(`您確定要刪除 ${barrelName} 嗎？\n此動作無法復原！`)) {
        try {
            await recordsCollection.doc(docId).delete();
            console.log("文件已刪除:", docId);
        } catch (error) {
            console.error("刪除失敗:", error);
            if (error.code === 'permission-denied') { // 雖然前端擋了，後端規則是最終防線
                alert("權限不足：只有管理員才能刪除資料。");
            } else {
                alert("刪除時發生錯誤。");
            }
        }
    }
}

// --- 6. 表單提交邏輯 ---
// ( (桶別紀錄) 和 (新料號) 表單邏輯無變更, 內部已有權限檢查)
recordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUserPermissions?.can_add) {
        alert("權限不足：您無法新增資料。"); return;
    }
    // ... (後續邏輯不變)
    const operatorName = currentUserPermissions.name;
    const operatorId = currentUserPermissions.employee_id;
    const barrelNumberString = barrelNumberInput.value.trim();
    if (!barrelNumberString || !currentMaterialLot) { alert("資料不完整！"); return; }
    const barrelNumberAsNumber = parseInt(barrelNumberString, 10);
    if (isNaN(barrelNumberAsNumber)) { alert("桶別必須是數字！ (例如: 005, 10)"); return; }
    const submitButton = recordForm.querySelector('button[type="submit"]');
    submitButton.disabled = true; submitButton.innerText = "檢查中...";
    try {
        const duplicateQuery = recordsCollection.where("materialLot", "==", currentMaterialLot).where("barrelNumber_sort", "==", barrelNumberAsNumber);
        const querySnapshot = await duplicateQuery.get();
        if (!querySnapshot.empty) { alert(`錯誤：桶別 "${barrelNumberString}" 已經存在於此料號！`); }
        else {
            await recordsCollection.add({ operator: operatorName, operatorId: operatorId, barrelNumber_display: barrelNumberString, barrelNumber_sort: barrelNumberAsNumber, materialLot: currentMaterialLot, timestamp: serverTimestamp() });
            console.log("資料儲存成功!"); barrelNumberInput.value = "";
        }
    } catch (error) { console.error("儲存失敗: ", error); alert("儲存失敗！" + error.message); }
    finally { submitButton.disabled = false; submitButton.innerText = "儲存紀錄"; }
});
newMaterialForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUserPermissions?.can_add) {
        alert("權限不足：您無法新增資料。"); return;
    }
    // ... (後續邏輯不變)
    let rawName = newMaterialInput.value.trim();
    if (!rawName) { alert("請輸入料號！"); return; }
    let normalizedName = rawName.toUpperCase();
    if (normalizedName.startsWith("G-")) { normalizedName = normalizedName.substring(2); }
    const submitButton = newMaterialForm.querySelector('button[type="submit"]');
    submitButton.disabled = true; submitButton.innerText = "檢查中...";
    try {
        const docRef = materialsCollection.doc(normalizedName);
        const docSnap = await docRef.get();
        if (docSnap.exists) { alert(`料號已存在 (${normalizedName})`); newMaterialInput.value = ""; }
        else {
            await docRef.set({ createdAt: serverTimestamp(), createdBy: { id: currentUserPermissions.employee_id, name: currentUserPermissions.name } });
            console.log("新料號儲存成功:", normalizedName); newMaterialInput.value = "";
        }
    } catch (error) { console.error("新增料號失敗: ", error); alert("操作失敗！" + error.message); }
    finally { submitButton.disabled = false; submitButton.innerText = "儲存新料號"; }
});

/**
 * (搜尋) 表單提交
 * ★★★ (已修改) 移除 !currentUserPermissions 檢查 ★★★
 */
searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    // (移除權限檢查 - 訪客也能搜尋)
    // if (!currentUserPermissions) { alert("請先登入。"); return; }

    const materialLot = searchMaterialSelect.value;
    const rawBarrelText = searchBarrelInput.value.trim();

    if (!materialLot) {
        alert("請選擇料號！"); return;
    }

    const submitButton = searchForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerText = "搜尋中...";
    searchResults.style.display = 'block';
    searchResults.innerHTML = '<p>正在搜尋中...</p>';

    let query;
    let searchTitle;
    let isSearchingAll = false;

    try {
        if (!rawBarrelText) {
            isSearchingAll = true;
            query = recordsCollection.where("materialLot", "==", materialLot).orderBy("barrelNumber_sort", "desc").limit(10);
            searchTitle = `在 ${materialLot} 中【桶別最大的 10 筆】紀錄：`;
        } else {
            isSearchingAll = false;
            const searchText = rawBarrelText.split('(')[0].trim();
            const searchNumber = parseInt(searchText, 10);
            if (isNaN(searchNumber)) { throw new Error(`輸入的桶別無效 ("${searchText}")。`); }
            query = recordsCollection.where("materialLot", "==", materialLot).where("barrelNumber_sort", "==", searchNumber);
            searchTitle = `在 ${materialLot} 中關於桶別 "${searchText}" (數字 ${searchNumber}) 的紀錄：`;
        }

        const querySnapshot = await query.get();

        if (querySnapshot.empty) {
            let emptyMessage = !rawBarrelText ? `在料號 <strong>${materialLot}</strong> 中，找不到任何桶別紀錄。` : `在料號 <strong>${materialLot}</strong> 中，找不到桶別 <strong>${rawBarrelText.split('(')[0].trim()}</strong>。`;
            searchResults.innerHTML = `<p style="color: red; font-weight: bold;">找不到！</p><p>${emptyMessage}</p>`;
        } else {
            let html = `<p style="color: green; font-weight: bold;">找到了！</p><h4>${searchTitle}</h4><ul style="padding-left: 20px;">`;
            querySnapshot.forEach(doc => {
                const data = doc.data();
                const date = data.timestamp ? data.timestamp.toDate().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';
                if (isSearchingAll) {
                    html += `<li style="margin-bottom: 10px;"><strong>原始輸入:</strong> ${data.barrelNumber_display}<br><strong>紀錄時間:</strong> ${date}</li>`;
                } else {
                    const operatorDisplay = data.operatorId ? `${data.operator} (${data.operatorId})` : data.operator;
                    html += `<li style="margin-bottom: 10px;"><strong>操作員:</strong> ${operatorDisplay}<br><strong>原始輸入:</strong> ${data.barrelNumber_display}<br><strong>紀錄時間:</strong> ${date}</li>`;
                }
            });
            html += `</ul>`;
            searchResults.innerHTML = html;
        }
    } catch (error) {
        console.error("Search failed: ", error);
        searchResults.innerHTML = `<p style="color: red;">搜尋失敗！${error.message}</p>`;
        // (保持錯誤提示)
        if (error.code === 'permission-denied' && !currentUserPermissions) {
             searchResults.innerHTML = '<p style="color: red;">搜尋失敗！訪客權限不足，請登入員工帳號。';
        } else if (error.code === 'failed-precondition') {
             alert("Firebase 搜尋錯誤！這可能是一個索引問題，請按 F12 打開主控台，點擊錯誤訊息中的連結來建立索引。");
        }
    } finally {
        submitButton.disabled = false;
        submitButton.innerText = "搜尋";
    }
});


// --- 7. 啟動路由與事件監聽 ---
// (此區塊無變更)
document.addEventListener('click', function(event) {
    if (event.target.id === 'loginButton') signIn();
    if (event.target.id === 'logoutButton') signOut();
    if (event.target.classList.contains('delete-btn')) {
        const docId = event.target.getAttribute('data-doc-id');
        if (docId) handleDeleteClick(docId);
    }
});
window.addEventListener('hashchange', router);
// (onAuthStateChanged 會在頁面載入時自動觸發)