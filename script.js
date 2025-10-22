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
 * 處理 Google 登入 (★ 已修改為 Popup)
 */
function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    // ★★★ 使用 signInWithPopup ★★★
    auth.signInWithPopup(provider)
        .then((result) => {
            // 登入成功，onAuthStateChanged 會處理後續
            console.log("Popup 登入成功", result.user);
        })
        .catch((error) => {
            // 處理錯誤 (例如彈窗被阻擋)
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
                console.log("權限已載入:", currentUserPermissions.name, currentUserPermissions);
                loginButton.classList.add('is-hidden');
                welcomeMessage.classList.remove('is-hidden');
                userName.innerText = currentUserPermissions.name;
                updateUIForPermissions();
                // ★ 首次登入或刷新頁面時，強制 router 執行一次
                if (!currentMaterialLot && window.location.hash === "") {
                    router(); 
                } else {
                    // 如果已有 hash (例如從登入頁跳轉回來), router 會由 hashchange 觸發
                }
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
        materialList.innerHTML = '<li>請先登入...</li>';
        searchMaterialSelect.innerHTML = '<option value="">請先登入...</option>';
        if (currentListener) currentListener();
        if (materialListListener) materialListListener();
        homeView.style.display = 'block';
        detailView.style.display = 'none';
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
// (此區塊無變更)
function router() {
    if (!currentUserPermissions) {
        homeView.style.display = 'block';
        detailView.style.display = 'none';
        return;
    }
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

function showHomePage() {
    homeView.style.display = 'block';
    detailView.style.display = 'none';
    tableBody.innerHTML = "";
    materialList.innerHTML = '<li>讀取中...</li>'; 
    searchMaterialSelect.innerHTML = '<option value="">讀取料號中...</option>';
    searchResults.style.display = 'none'; 
    materialListListener = materialsCollection
        .orderBy(fieldPath(), "asc")
        .onSnapshot((snapshot) => {
            materialList.innerHTML = ""; 
            searchMaterialSelect.innerHTML = '<option value="">-- 請選擇料號 --</option>';
            if (snapshot.empty) {
                materialList.innerHTML = '<li>尚無資料，請由上方表單新增</li>';
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
            materialList.innerHTML = '<li>讀取失敗</li>';
            searchMaterialSelect.innerHTML = '<option value="">讀取失敗</option>';
        });
    // ★ 確保每次回首頁都更新按鈕狀態
    updateUIForPermissions(); 
}

function showDetailPage(materialLot) {
    homeView.style.display = 'none';
    detailView.style.display = 'block';
    detailTitle.innerText = `料號: ${materialLot}`;
    if(barrelNumberInput) barrelNumberInput.value = "";
    const canDelete = currentUserPermissions?.can_delete === true;
    currentListener = recordsCollection
        .where("materialLot", "==", materialLot)
        .orderBy("timestamp", "desc")
        .orderBy("barrelNumber_sort", "desc")
        .onSnapshot((snapshot) => {
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
                alert("權限不足：無法讀取資料。請確認您的帳號是否在員工名單中。");
                signOut();
            }
        });
    // ★ 確保每次進詳細頁都更新按鈕狀態
    updateUIForPermissions(); 
}

// --- 5. 刪除桶別 邏輯 ---
// (此區塊無變更)
async function handleDeleteClick(docId) {
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
            if (error.code === 'permission-denied') {
                alert("權限不足：只有管理員才能刪除資料。");
            } else {
                alert("刪除時發生錯誤。");
            }
        }
    }
}

// --- 6. 表單提交邏輯 ---
// (此區塊無變更)
recordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUserPermissions?.can_add) {
        alert("權限不足：您無法新增資料。"); return;
    }
    const operatorName = currentUserPermissions.name;
    const operatorId = currentUserPermissions.employee_id;
    const barrelNumberString = barrelNumberInput.value.trim();
    if (!barrelNumberString || !currentMaterialLot) {
        alert("資料不完整！"); return;
    }
    const barrelNumberAsNumber = parseInt(barrelNumberString, 10);
    if (isNaN(barrelNumberAsNumber)) {
        alert("桶別必須是數字！ (例如: 005, 10)"); return;
    }
    const submitButton = recordForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerText = "檢查中...";
    try {
        const duplicateQuery = recordsCollection.where("materialLot", "==", currentMaterialLot).where("barrelNumber_sort", "==", barrelNumberAsNumber);
        const querySnapshot = await duplicateQuery.get();
        if (!querySnapshot.empty) {
            alert(`錯誤：桶別 "${barrelNumberString}" 已經存在於此料號！`);
        } else {
            await recordsCollection.add({ operator: operatorName, operatorId: operatorId, barrelNumber_display: barrelNumberString, barrelNumber_sort: barrelNumberAsNumber, materialLot: currentMaterialLot, timestamp: serverTimestamp() });
            console.log("資料儲存成功!");
            barrelNumberInput.value = ""; 
        }
    } catch (error) {
        console.error("儲存失敗: ", error);
        alert("儲存失敗！" + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerText = "儲存紀錄";
    }
});
newMaterialForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUserPermissions?.can_add) {
        alert("權限不足：您無法新增資料。"); return;
    }
    let rawName = newMaterialInput.value.trim();
    if (!rawName) {
        alert("請輸入料號！"); return;
    }
    let normalizedName = rawName.toUpperCase(); 
    if (normalizedName.startsWith("G-")) {
        normalizedName = normalizedName.substring(2);
    }
    const submitButton = newMaterialForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerText = "檢查中...";
    try {
        const docRef = materialsCollection.doc(normalizedName);
        const docSnap = await docRef.get(); 
        if (docSnap.exists) { 
            alert(`料號已存在 (${normalizedName})`);
            newMaterialInput.value = "";
        } else {
            await docRef.set({ createdAt: serverTimestamp(), createdBy: { id: currentUserPermissions.employee_id, name: currentUserPermissions.name } });
            console.log("新料號儲存成功:", normalizedName);
            newMaterialInput.value = "";
        }
    } catch (error) {
        console.error("新增料號失敗: ", error);
        alert("操作失敗！" + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerText = "儲存新料號";
    }
});
searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUserPermissions) {
        alert("請先登入。"); return;
    }
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
    try {
        if (!rawBarrelText) {
            query = recordsCollection.where("materialLot", "==", materialLot).orderBy("timestamp", "desc").orderBy("barrelNumber_sort", "desc").limit(10);
            searchTitle = `在 ${materialLot} 中【最新的 10 筆】桶別紀錄：`;
        } else {
            const searchText = rawBarrelText.split('(')[0].trim();
            const searchNumber = parseInt(searchText, 10);
            if (isNaN(searchNumber)) {
                throw new Error(`輸入的桶別無效 ("${searchText}")。`);
            }
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
                const operatorDisplay = data.operatorId ? `${data.operator} (${data.operatorId})` : data.operator;
                html += `<li style="margin-bottom: 10px;"><strong>操作員:</strong> ${operatorDisplay}<br><strong>原始輸入:</strong> ${data.barrelNumber_display}<br><strong>紀錄時間:</strong> ${date}</li>`;
            });
            html += `</ul>`;
            searchResults.innerHTML = html;
        }
    } catch (error) {
        console.error("Search failed: ", error);
        searchResults.innerHTML = `<p style="color: red;">搜尋失敗！${error.message}</p>`;
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
// (onAuthStateChanged 會在頁面載入時自動觸發第一次的 router)