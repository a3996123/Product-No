// --- 1. 初始化 Firebase ---
// !! 這裡是您自己的 Firebase Config，請保留您原本的設定 !!
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
const db = firebase.firestore();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
const fieldPath = firebase.firestore.FieldPath.documentId; // ★ 用於字母排序

// ★ 兩個資料集合
const recordsCollection = db.collection("records"); // 儲存桶別
const materialsCollection = db.collection("materials"); // ★ (新) 儲存料號清單

// --- 2. 取得 DOM 元素 ---
const homeView = document.getElementById('homeView');
const detailView = document.getElementById('detailView');

// 詳細頁
const detailTitle = document.getElementById('detailTitle');
const recordForm = document.getElementById('recordForm');
const tableBody = document.getElementById('recordBody');
const operatorSelect = document.getElementById('operator');
const barrelNumberInput = document.getElementById('barrelNumber');

// ★ 首頁 (新)
const materialList = document.getElementById('materialList');
const newMaterialForm = document.getElementById('newMaterialForm');
const newMaterialInput = document.getElementById('newMaterialInput');

// ★ 兩個監聽器
let currentListener = null; // 監聽桶別 (詳細頁)
let materialListListener = null; // ★ (新) 監聽料號 (首頁)
let currentMaterialLot = null;

// --- 3. 頁面導航 (路由) 邏輯 ---

/** * 路由功能：檢查 URL 錨點並顯示對應頁面 
 */
function router() {
    // ★ 在切換頁面前，先中斷所有已存在的監聽器
    if (currentListener) {
        currentListener();
        currentListener = null;
    }
    if (materialListListener) {
        materialListListener();
        materialListListener = null;
    }

    const hash = window.location.hash.substring(1); 
    if (hash) {
        // 在詳細頁
        currentMaterialLot = hash;
        showDetailPage(currentMaterialLot);
    } else {
        // 在首頁
        currentMaterialLot = null;
        showHomePage();
    }
}

/** * 顯示首頁 (★ 已更新：從資料庫讀取料號清單)
 */
function showHomePage() {
    homeView.style.display = 'block';
    detailView.style.display = 'none';
    tableBody.innerHTML = "";
    materialList.innerHTML = '<li>讀取中...</li>'; // 顯示讀取中

    // ★ 監聽 materials 集合，並依字母順序排列
    materialListListener = materialsCollection
        .orderBy(fieldPath(), "asc") // 依照文件ID(料號名稱) 字母順序排列
        .onSnapshot((snapshot) => {
            materialList.innerHTML = ""; // 清空清單
            if (snapshot.empty) {
                materialList.innerHTML = '<li>尚無資料，請由上方表單新增</li>';
                return;
            }
            snapshot.forEach((doc) => {
                // doc.id 就是料號名稱 (例如 "B1001-02")
                const materialName = doc.id; 
                const li = document.createElement('li');
                li.innerHTML = `<a href="#${materialName}">${materialName}</a>`;
                materialList.appendChild(li);
            });
        }, (error) => {
            console.error("讀取料號清單失敗: ", error);
            materialList.innerHTML = '<li>讀取失敗</li>';
        });
}

/** * 顯示詳細頁 (邏輯不變，但請確認內容)
 */
function showDetailPage(materialLot) {
    homeView.style.display = 'none';
    detailView.style.display = 'block';
    detailTitle.innerText = `料號: ${materialLot}`;

    // 讀取桶別的查詢 (與您上一版相同)
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
                
                const row = `<tr>
                    <td>${date}</td>
                    <td>${data.operator}</td>
                    <td>${data.barrelNumber_display || data.barrelNumber}</td>
                </tr>`;
                tableBody.innerHTML += row;
            });
        }, (error) => {
            console.error("Firebase 讀取失敗: ", error);
            if (error.code === 'failed-precondition') {
                alert("Firebase 讀取錯誤！請按 F12 打開主控台，點擊錯誤訊息中的『連結』來建立【新的】資料庫索引。(如果您已建立，請忽略此訊息)");
            }
        });
}

// --- 4. 表單提交邏輯 ---

/** * (桶別紀錄) 表單提交 (邏輯不變)
 */
recordForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const operator = operatorSelect.value;
    const barrelNumberString = barrelNumberInput.value.trim();
    if (!operator || !barrelNumberString || !currentMaterialLot) {
        alert("資料不完整！");
        return;
    }
    const barrelNumberAsNumber = parseInt(barrelNumberString, 10);
    if (isNaN(barrelNumberAsNumber)) {
        alert("桶別必須是數字！ (例如: 005, 10)");
        return;
    }

    recordsCollection.add({
        operator: operator,
        barrelNumber_display: barrelNumberString,
        barrelNumber_sort: barrelNumberAsNumber,
        materialLot: currentMaterialLot,
        timestamp: serverTimestamp()
    })
    .then(() => {
        console.log("資料儲存成功!");
        barrelNumberInput.value = ""; 
        operatorSelect.focus();
    })
    .catch((error) => {
        console.error("儲存失敗: ", error);
    });
});

/** * ★ (新) 新增料號 表單提交
 */
newMaterialForm.addEventListener("submit", (e) => {
    e.preventDefault();
    // 建議將料號轉為大寫，避免 "b1001" 和 "B1001" 重複
    const newMaterialName = newMaterialInput.value.trim().toUpperCase(); 

    if (!newMaterialName) {
        alert("請輸入料號！");
        return;
    }

    // 我們使用 .doc(名稱).set() 方式
    // 這會以「料號名稱」作為文件的ID，可確保料號不重複
    // set({}) 裡的內容可以是空的，或存一個建立時間
    materialsCollection.doc(newMaterialName).set({
        createdAt: serverTimestamp() // 紀錄一下建立時間
    })
    .then(() => {
        console.log("新料號儲存成功:", newMaterialName);
        newMaterialInput.value = ""; // 清空輸入框
    })
    .catch((error) => {
        console.error("新增料號失敗: ", error);
        alert("新增料號失敗！");
    });
});


// --- 5. 啟動路由 ---
window.addEventListener('load', router); // 頁面載入時執行
window.addEventListener('hashchange', router); // 當 # 錨點改變時執行
