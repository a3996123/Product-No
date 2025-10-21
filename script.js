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
    console.log("Firebase App Check 已啟動 (手動模式)。");
} catch (error) {
    console.error("Firebase App Check 啟動失敗:", error);
}

// ----------------------------------------------------------------------

const db = firebase.firestore();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
const fieldPath = firebase.firestore.FieldPath.documentId; 

// ★★★ 登入/權限 相關 ★★★
let currentUser = null; 
const usersCollection = db.collection("users"); 

// 三個資料集合
const recordsCollection = db.collection("records"); 
const materialsCollection = db.collection("materials"); 

// --- 2. 取得 DOM 元素 ---
// (此區塊無變更)
const loginForm = document.getElementById('loginForm');
const loginIdInput = document.getElementById('loginIdInput');
const loginButton = document.getElementById('loginButton');
const welcomeMessage = document.getElementById('welcomeMessage');
const userName = document.getElementById('userName');
const logoutButton = document.getElementById('logoutButton');
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

// 監聽器
let currentListener = null; 
let materialListListener = null;
let currentMaterialLot = null;


// --- 3. 登入與視圖管理邏輯 ---
// (此區塊無變更)
function checkLoginState() {
    const userData = sessionStorage.getItem('currentUser');
    if (userData) {
        currentUser = JSON.parse(userData);
        console.log("已登入:", currentUser.name);
    } else {
        currentUser = null;
        console.log("訪客模式");
    }
    updateAuthUI();
}

function updateAuthUI() {
    if (currentUser) {
        loginForm.style.display = 'none';
        welcomeMessage.style.display = 'flex'; 
        userName.innerText = currentUser.name;
    } else {
        loginForm.style.display = 'block';
        welcomeMessage.style.display = 'none';
    }
}

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = loginIdInput.value.trim();
    if (!id) return;
    loginButton.disabled = true;
    loginButton.innerText = "登入中...";
    try {
        const docRef = usersCollection.doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            currentUser = { id: docSnap.id, ...docSnap.data() };
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateAuthUI();
            router(); 
        } else {
            alert("工號錯誤或不存在！");
            loginIdInput.value = "";
        }
    } catch (error) {
        console.error("登入時發生錯誤: ", error);
        alert("登入失敗，請檢查網路或聯繫管理員。");
    } finally {
        loginButton.disabled = false;
        loginButton.innerText = "登入";
    }
});

logoutButton.addEventListener("click", () => {
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    updateAuthUI();
    router(); 
});


// --- 4. 頁面導航 (路由) 邏輯 ---
// (此區塊無變更)
function router() {
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
    if (currentUser) {
        newMaterialForm.style.display = 'block';
    } else {
        newMaterialForm.style.display = 'none';
    }
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
}

function showDetailPage(materialLot) {
    homeView.style.display = 'none';
    detailView.style.display = 'block';
    detailTitle.innerText = `料號: ${materialLot}`;
    if(barrelNumberInput) {
        barrelNumberInput.value = "";
    }
    if (currentUser) {
        recordForm.style.display = 'block';
    } else {
        recordForm.style.display = 'none';
    }
    currentListener = recordsCollection
        .where("materialLot", "==", materialLot)
        .orderBy("timestamp", "desc")
        .orderBy("barrelNumber_sort", "desc")
        .onSnapshot((snapshot) => {
            tableBody.innerHTML = ""; 
            if (snapshot.empty) {
                tableBody.innerHTML = '<tr><td colspan="3">目前沒有紀錄</td></tr>';
                return;
            }
            snapshot.forEach((doc) => {
                const data = doc.data();
                const date = data.timestamp 
                    ? data.timestamp.toDate().toLocaleString('zh-TW', { 
                        timeZone: 'Asia/Taipei',
                        year: 'numeric', month: '2-digit', day: '2-digit', 
                        hour: '2-digit', minute: '2-digit' 
                    }) 
                    : '處理中...';
                
                const rowFixed = `<tr>
                    <td>${date}</td>
                    <td>${data.operator}</td>
                    <td>${data.barrelNumber_display || data.barrelNumber}</td>
                </tr>`;
                tableBody.innerHTML += rowFixed;
            });
        }, (error) => {
            console.error("Firebase 讀取失敗: ", error);
            if (error.code === 'failed-precondition' || error.code === 'permission-denied') {
                console.warn("Firestore 讀取失敗，可能是索引未建立或 App Check/安全規則 阻擋。");
            }
        });
}

// --- 5. 表單提交邏輯 ---
// ( (桶別紀錄) 和 (新料號) 表單邏輯無變更)

/** * (桶別紀錄) 表單提交 */
recordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) {
        alert("請先登入才能新增資料！");
        return;
    }
    const operatorName = currentUser.name;
    const operatorId = currentUser.id;
    const barrelNumberString = barrelNumberInput.value.trim();
    if (!barrelNumberString || !currentMaterialLot) {
        alert("資料不完整！");
        return;
    }
    const barrelNumberAsNumber = parseInt(barrelNumberString, 10);
    if (isNaN(barrelNumberAsNumber)) {
        alert("桶別必須是數字！ (例如: 005, 10)");
        return;
    }
    const submitButton = recordForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerText = "檢查中...";
    try {
        const duplicateQuery = recordsCollection
            .where("materialLot", "==", currentMaterialLot)
            .where("barrelNumber_sort", "==", barrelNumberAsNumber);
        const querySnapshot = await duplicateQuery.get();
        if (!querySnapshot.empty) {
            alert(`錯誤：桶別 "${barrelNumberString}" 已經存在於此料號！`);
        } else {
            await recordsCollection.add({
                operator: operatorName,
                operatorId: operatorId,
                barrelNumber_display: barrelNumberString,
                barrelNumber_sort: barrelNumberAsNumber,
                materialLot: currentMaterialLot,
                timestamp: serverTimestamp()
            });
            console.log("資料儲存成功!");
            barrelNumberInput.value = ""; 
        }
    } catch (error) {
        console.error("儲存失敗: ", error);
        if (error.code === 'failed-precondition') {
             alert("Firebase 儲存錯誤！請按 F12 打開主控台，點擊錯誤訊息中的『連結』來建立【新的】資料庫索引。");
        } else {
             alert("儲存失敗！請檢查是否被 App Check 或 安全規則 阻擋。");
        }
    } finally {
        submitButton.disabled = false;
        submitButton.innerText = "儲存紀錄";
    }
});

/** * (新料號) 表單提交 */
newMaterialForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    let rawName = newMaterialInput.value.trim();
    if (!rawName) {
        alert("請輸入料號！");
        return;
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
            await docRef.set({
                createdAt: serverTimestamp(),
                createdBy: { id: currentUser.id, name: currentUser.name } 
            });
            console.log("新料號儲存成功:", normalizedName);
            newMaterialInput.value = "";
        }
    } catch (error) {
        console.error("新增料號失敗: ", error);
        alert("操作失敗，請檢查網路連線或聯繫管理員。");
    } finally {
        submitButton.disabled = false;
        submitButton.innerText = "儲存新料號";
    }
});


// ==========================================================
// ===== ★★★ (已修改) 搜尋表單邏輯 ★★★ =====
// ==========================================================
searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const materialLot = searchMaterialSelect.value;
    const rawBarrelText = searchBarrelInput.value.trim();
    
    // 基本驗證 (料號為必填)
    if (!materialLot) {
        alert("請選擇料號！");
        return;
    }

    // --- 1. 鎖定按鈕並顯示結果區 ---
    const submitButton = searchForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerText = "搜尋中...";
    searchResults.style.display = 'block';
    searchResults.innerHTML = '<p>正在搜尋中...</p>';

    let query; // 用來儲存查詢
    let searchTitle; // 用來儲存結果標題

    try {
        // --- 2. 檢查桶別輸入是否為空 ---
        if (!rawBarrelText) {
            // --- 2A. (新) 如果為空：搜尋最新的 10 筆 ---
            query = recordsCollection
                .where("materialLot", "==", materialLot)
                .orderBy("timestamp", "desc") // 依時間排序
                .orderBy("barrelNumber_sort", "desc") // 輔助排序
                .limit(10); // ★★★ (新) 只取 10 筆 ★★★
            
            searchTitle = `在 ${materialLot} 中【最新的 10 筆】桶別紀錄：`;

        } else {
            // --- 2B. (舊) 如果不為空：搜尋特定桶別 ---
            const searchText = rawBarrelText.split('(')[0].trim();
            const searchNumber = parseInt(searchText, 10);

            if (isNaN(searchNumber)) {
                // 使用 throw new Error 會被下面的 catch 捕捉
                throw new Error(`輸入的桶別無效 ("${searchText}")。`);
            }
            
            query = recordsCollection
                .where("materialLot", "==", materialLot)
                .where("barrelNumber_sort", "==", searchNumber);
            
            searchTitle = `在 ${materialLot} 中關於桶別 "${searchText}" (數字 ${searchNumber}) 的紀錄：`;
        }

        // --- 3. 執行查詢 ---
        const querySnapshot = await query.get();

        // --- 4. 顯示結果 ---
        if (querySnapshot.empty) {
            // 根據是「查全部」還是「查特定」來顯示不同訊息
            let emptyMessage = !rawBarrelText 
                ? `在料號 <strong>${materialLot}</strong> 中，找不到任何桶別紀錄。`
                : `在料號 <strong>${materialLot}</strong> 中，找不到桶別 <strong>${rawBarrelText.split('(')[0].trim()}</strong>。`;
                
            searchResults.innerHTML = `<p style="color: red; font-weight: bold;">找不到！</p>
                                       <p>${emptyMessage}</p>`;
        } else {
            // 找到了，開始組合 HTML
            let html = `<p style="color: green; font-weight: bold;">找到了！</p>
                        <h4>${searchTitle}</h4>
                        <ul style="padding-left: 20px;">`;
                        
            querySnapshot.forEach(doc => {
                const data = doc.data();
                const date = data.timestamp 
                    ? data.timestamp.toDate().toLocaleString('zh-TW', { 
                        timeZone: 'Asia/Taipei', 
                        year: 'numeric', month: '2-digit', day: '2-digit', 
                        hour: '2-digit', minute: '2-digit' 
                    }) 
                    : 'N/A';
                
                const operatorDisplay = data.operatorId 
                    ? `${data.operator} (${data.operatorId})`
                    : data.operator;

                html += `<li style="margin-bottom: 10px;">
                    <strong>操作員:</strong> ${operatorDisplay}<br>
                    <strong>原始輸入:</strong> ${data.barrelNumber_display}<br>
                    <strong>紀錄時間:</strong> ${date}
                </li>`;
            });
            html += `</ul>`;
            searchResults.innerHTML = html;
        }
        
    } catch (error) {
        console.error("Search failed: ", error);
        searchResults.innerHTML = `<p style="color: red;">搜尋失敗！${error.message}</p>`;
        if (error.code === 'failed-precondition') {
            alert("Firebase 搜尋錯誤！這可能是一個索引問題，請按 F12 打開主控台，點擊錯誤訊息中的連結來建立索引。");
        }
    } finally {
        // --- 5. 恢復按鈕 ---
        submitButton.disabled = false;
        submitButton.innerText = "搜尋";
    }
});


// --- 6. 啟動路由 ---
// (此區塊無變更)
window.addEventListener('load', () => {
    checkLoginState();
    router();
});
window.addEventListener('hashchange', router);
