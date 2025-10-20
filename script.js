// --- 1. 初始化 Firebase ---
// !! 關鍵步驟：請將下面的 firebaseConfig 物件 換成您自己的 Firebase 專案設定 !!
// !! 您可以從 Firebase 專案的「專案設定」 > 「您的應用程式」中找到這組設定 !!

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
// 下面的程式碼請勿修改
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

let currentMaterialLot = null; // 用來儲存當前在哪個料號頁面
let currentListener = null; // 用來儲存當前的 Firebase 監聽器

// --- 3. 頁面導航 (路由) 邏輯 ---

/** * 路由功能：檢查 URL 錨點並顯示對應頁面 
 */
function router() {
    // 移除舊的 Firebase 監聽器，避免重複監聽
    if (currentListener) {
        currentListener();
        currentListener = null;
    }

    const hash = window.location.hash.substring(1); // 取得 # 後面的文字 (例如 "B1001-02")

    if (hash) {
        // 如果有 hash (在詳細頁)
        currentMaterialLot = hash;
        showDetailPage(currentMaterialLot);
    } else {
        // 如果沒有 hash (在首頁)
        currentMaterialLot = null;
        showHomePage();
    }
}

/** * 顯示首頁 
 */
function showHomePage() {
    homeView.style.display = 'block';
    detailView.style.display = 'none';
    tableBody.innerHTML = ""; // 清空表格
}

/** * 顯示詳細頁，並載入特定料號的資料
 * @param {string} materialLot - 要顯示的料號
 */
function showDetailPage(materialLot) {
    homeView.style.display = 'none';
    detailView.style.display = 'block';
    detailTitle.innerText = `料號: ${materialLot}`; // 設定標題

    // ** 關鍵：設定 Firebase 查詢，只抓取此料號(where)，並依時間排序(orderBy) **
    // !! 這一步會觸發主控台的「建立索引」提示，請務必點擊該提示中的連結 !!
    currentListener = recordsCollection
        .where("materialLot", "==", materialLot)
        .orderBy("timestamp", "desc")
        .onSnapshot((snapshot) => {
            tableBody.innerHTML = ""; // 清空表格
            if (snapshot.empty) {
                tableBody.innerHTML = '<tr><td colspan="3">目前沒有紀錄</td></tr>';
                return;
            }
            snapshot.forEach((doc) => {
                const data = doc.data();
                
                // 格式化台北時間
                const date = data.timestamp 
                    ? data.timestamp.toDate().toLocaleString('zh-TW', { 
                        timeZone: 'Asia/Taipei',
                        year: 'numeric', 
                        month: '2-digit', 
                        day: '2-digit', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    }) 
                    : '處理中...';

                const row = `<tr>
                    <td>${date}</td>
                    <td>${data.operator}</td>
                    <td>${data.barrelNumber}</td>
                </tr>`;
                tableBody.innerHTML += row;
            });
        }, (error) => {
            console.error("Firebase 讀取失敗: ", error);
            // 提醒使用者檢查索引
            if (error.code === 'failed-precondition') {
                alert("Firebase 讀取錯誤！請按 F12 打開主控台，點擊錯誤訊息中的『連結』來建立資料庫索引。");
            }
        });
}

// --- 4. 表單提交邏輯 ---
recordForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const operator = operatorSelect.value;
    const barrelNumber = barrelNumberInput.value;

    if (!operator || !barrelNumber || !currentMaterialLot) {
        alert("資料不完整！");
        return;
    }

    // 新增資料到 Firebase
    recordsCollection.add({
        operator: operator,
        barrelNumber: barrelNumber,
        materialLot: currentMaterialLot, // 自動帶入當前頁面的料號
        timestamp: serverTimestamp() // 使用伺服器時間
    })
    .then(() => {
        console.log("資料儲存成功!");
        barrelNumberInput.value = ""; // 只清空桶別，保留操作員
        operatorSelect.focus();
    })
    .catch((error) => {
        console.error("儲存失敗: ", error);
    });
});


// --- 5. 啟動路由 ---
window.addEventListener('load', router); // 頁面載入時執行
window.addEventListener('hashchange', router); // 當 # 錨點改變時執行 (例如點擊連結)