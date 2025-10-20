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
        // ★ 關鍵：請將 'YOUR_RECAPTCHA_SITE_KEY' (字串)
        //    換成您剛剛從 reCAPTCHA 網站上取得的【網站金鑰 (Site Key)】
        '6LcYdfArAAAAADhAH5MPwdfpq2GaLgD6DpiXbu4Q', 
        { isTokenAutoRefreshEnabled: true }
    );
    console.log("Firebase App Check 已啟動 (手動模式)。");
} catch (error) {
    console.error("Firebase App Check 啟動失敗:", error);
}

// ----- (以下程式碼直到 "--- 4. 表單提交邏輯 ---" 之前都無變更) -----

const db = firebase.firestore();
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
const fieldPath = firebase.firestore.FieldPath.documentId; 

// 兩個資料集合
const recordsCollection = db.collection("records"); // 儲存桶別
const materialsCollection = db.collection("materials"); // 儲存料號清單

// --- 2. 取得 DOM 元素 ---
const homeView = document.getElementById('homeView');
const detailView = document.getElementById('detailView');
const detailTitle = document.getElementById('detailTitle');
const recordForm = document.getElementById('recordForm');
const tableBody = document.getElementById('recordBody');
const operatorSelect = document.getElementById('operator');
const barrelNumberInput = document.getElementById('barrelNumber');
const materialList = document.getElementById('materialList');
const newMaterialForm = document.getElementById('newMaterialForm');
const newMaterialInput = document.getElementById('newMaterialInput');

let currentListener = null; 
let materialListListener = null;
let currentMaterialLot = null;

// --- 3. 頁面導航 (路由) 邏輯 ---
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

    materialListListener = materialsCollection
        .orderBy(fieldPath(), "asc")
        .onSnapshot((snapshot) => {
            materialList.innerHTML = ""; 
            if (snapshot.empty) {
                materialList.innerHTML = '<li>尚無資料，請由上方表單新增</li>';
                return;
            }
            snapshot.forEach((doc) => {
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

function showDetailPage(materialLot) {
    homeView.style.display = 'none';
    detailView.style.display = 'block';
    detailTitle.innerText = `料號: ${materialLot}`;

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

// ==========================================================
// ===== ★★★ 以下是本次修改的重點 ★★★ =====
// --- 4. 表單提交邏輯 ---

/** * (桶別紀錄) 表單提交 (★ 已更新：加入重複桶別防呆)
 */
recordForm.addEventListener("submit", async (e) => { // ★ 1. 改為 async 異步
    e.preventDefault();
    
    // --- 2. 取得資料 ---
    const operator = operatorSelect.value;
    const barrelNumberString = barrelNumberInput.value.trim();
    
    // --- 3. 基本驗證 ---
    if (!operator || !barrelNumberString || !currentMaterialLot) {
        alert("資料不完整！");
        return;
    }
    const barrelNumberAsNumber = parseInt(barrelNumberString, 10);
    if (isNaN(barrelNumberAsNumber)) {
        alert("桶別必須是數字！ (例如: 005, 10)");
        return;
    }

    // --- 4. 鎖定按鈕，防止重複提交 ---
    const submitButton = recordForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerText = "檢查中...";

    try {
        // --- 5. ★ 新防呆：檢查桶別是否重複 ---
        //    (這一步會觸發「建立新索引」的提示)
        const duplicateQuery = recordsCollection
            .where("materialLot", "==", currentMaterialLot)
            .where("barrelNumber_sort", "==", barrelNumberAsNumber);
            
        const querySnapshot = await duplicateQuery.get();

        if (!querySnapshot.empty) {
            // ★ 6. 如果 'empty' 是 false，代表有找到資料 (重複了)
            alert(`錯誤：桶別 "${barrelNumberString}" 已經存在於此料號！`);
        
        } else {
            // ★ 7. 如果是空的 (不重複)，才執行新增
            await recordsCollection.add({
                operator: operator,
                barrelNumber_display: barrelNumberString,
                barrelNumber_sort: barrelNumberAsNumber,
                materialLot: currentMaterialLot,
                timestamp: serverTimestamp()
            });
            console.log("資料儲存成功!");
            barrelNumberInput.value = ""; 
            operatorSelect.focus();
        }

    } catch (error) {
        // ★ 8. 捕捉錯誤 (最可能的是"缺少索引")
        console.error("儲存失敗: ", error);
        if (error.code === 'failed-precondition') {
             alert("Firebase 儲存錯誤！請按 F12 打開主控台，點擊錯誤訊息中的『連結』來建立【新的】資料庫索引。");
        } else {
             alert("儲存失敗！請檢查是否被 App Check 或 安全規則 阻擋。");
        }
    } finally {
        // ★ 9. 恢復按鈕
        submitButton.disabled = false;
        submitButton.innerText = "儲存紀錄";
    }
});


/** * (新料號) 表單提交 (邏輯不變)
 */
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
                createdAt: serverTimestamp()
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

// --- 5. 啟動路由 ---
window.addEventListener('load', router);
window.addEventListener('hashchange', router);
