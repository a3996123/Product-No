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
const recordsCollection = db.collection("records");
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

// --- 2. 取得 DOM 元素 ---
const homeView = document.getElementById('homeView');
const detailView = document.getElementById('detailView');
const detailTitle = document.getElementById('detailTitle');
const recordForm = document.getElementById('recordForm');
const tableBody = document.getElementById('recordBody');
const operatorSelect = document.getElementById('operator');
const barrelNumberInput = document.getElementById('barrelNumber');

let currentMaterialLot = null;
let currentListener = null; 

// --- 3. 頁面導航 (路由) 邏輯 ---

function router() {
    if (currentListener) {
        currentListener();
        currentListener = null;
    }
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
}

function showDetailPage(materialLot) {
    homeView.style.display = 'none';
    detailView.style.display = 'block';
    detailTitle.innerText = `料號: ${materialLot}`;

    // ===== 程式碼修改處 (讀取規則) =====
    // 建立新的查詢規則：
    // 1. 篩選料號 (where)
    // 2. 依照 timestamp 排序 (desc = 越新越上面)
    // 3. 依照 barrelNumber_sort (數字) 排序 (desc = 越大越上面)
    //
    // !! 這一步會觸發「建立新索引」的提示 !!
    currentListener = recordsCollection
        .where("materialLot", "==", materialLot)
        .orderBy("timestamp", "desc")
        .orderBy("barrelNumber_sort", "desc") // <-- ★ 新增的第二排序規則
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

                // ★ 使用 barrelNumber_display 來顯示 (保留 "005" 樣式)
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
                alert("Firebase 讀取錯誤！請按 F12 打開主控台，點擊錯誤訊息中的『連結』來建立【新的】資料庫索引。");
            }
        });
}

// --- 4. 表單提交邏輯 ---
recordForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const operator = operatorSelect.value;
    const barrelNumberString = barrelNumberInput.value.trim(); // 取得 "桶別" (文字)

    if (!operator || !barrelNumberString || !currentMaterialLot) {
        alert("資料不完整！");
        return;
    }

    // ===== 程式碼修改處 (儲存方式) =====
    // 將 "桶別" 文字 轉換為 數字
    const barrelNumberAsNumber = parseInt(barrelNumberString, 10);

    // 驗證是否為數字
    if (isNaN(barrelNumberAsNumber)) {
        alert("桶別必須是數字！ (例如: 005, 10)");
        return;
    }

    // 新增資料到 Firebase (同時儲存文字 和 數字)
    recordsCollection.add({
        operator: operator,
        barrelNumber_display: barrelNumberString,   // ★ (新) 儲存文字，用於顯示
        barrelNumber_sort: barrelNumberAsNumber, // ★ (新) 儲存數字，用於排序
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


// --- 5. 啟動路由 ---
window.addEventListener('load', router);
window.addEventListener('hashchange', router);
