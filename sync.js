// ==========================================================
// sync.js: Firebase 数据同步逻辑
// 注意: 本文件在 script.js 之后加载，用于覆盖 loadData/saveData
// ==========================================================

// ----------------------------------------------------------
// 1. Firebase 配置和初始化
// ----------------------------------------------------------

// !!! 替换为您自己的 Firebase 配置 !!!
const firebaseConfig = {
    apiKey: "<YOUR_API_KEY>", // 例如: "AIzaSyC0-YOUR-KEY-v0s9o"
    authDomain: "<YOUR_PROJECT_ID>.firebaseapp.com", // 例如: "rentacar-system-xxxx.firebaseapp.com"
    databaseURL: "https://<YOUR_PROJECT_ID>-default-rtdb.firebaseio.com", // 例如: "https://rentacar-system-xxxx-default-rtdb.firebaseio.com"
    projectId: "<YOUR_PROJECT_ID>", // 例如: "rentacar-system-xxxx"
    storageBucket: "<YOUR_PROJECT_ID>.appspot.com",
    messagingSenderId: "<YOUR_SENDER_ID>",
    appId: "<YOUR_APP_ID>"
};

// 确保在 HTML 中已引入兼容版本的 Firebase SDK

// 初始化 Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = app.database();
// DATA_KEY 变量来自 script.js ('rentacarSystemData')
const dataRef = db.ref(DATA_KEY); 


// ----------------------------------------------------------
// 2. 默认数据结构 (用于初始化 Firebase 数据库)
// ----------------------------------------------------------

// 提取自 script.js 中 appData 的初始值，用于首次启动
const defaultAppDataStructure = {
    cars: [
        { id: 'C001', alias: '小黑', licensePlate: '京A8888', color: '黑', info: '丰田卡罗拉', status: '在库', orderId: null, nextAction: '在库', location: '本社工厂', isClean: true, lastCheckDate: '2025-09-10' },
        { id: 'C002', alias: '小白', licensePlate: '沪B6666', color: '白', info: '本田思域', status: '在库', orderId: null, nextAction: '在库', location: '本社工厂', isClean: false, lastCheckDate: '2025-07-20' }, 
        { id: 'C003', alias: '商务之星', licensePlate: '粤C1234', color: '灰', info: '丰田海狮', status: '维修', orderId: null, nextAction: '维修', location: '本社工厂', isClean: true, lastCheckDate: '2025-10-01' }
    ],
    employees: [
        { id: 'E101', name: '佐藤', start: '09:00', end: '18:00' },
        { id: 'E102', name: '田中', start: '10:00', end: '19:00' }
    ],
    orders: [
        { id: 'O1001', type: '接车', location: '羽田空港', time: '10:30', notes: '航班JL123', assignedTo: 'E101', carId: 'C001', details: { babySeat: false, needsPayment: true, checkItems: ['油量', '外观'] }, startTime: '2025-11-01', endTime: '2025-11-03' },
        { id: 'O1002', type: '送车', location: '成田空港', time: '14:00', notes: '需收款', assignedTo: 'E101', carId: null, details: { babySeat: true, needsPayment: false, checkItems: ['导航设置', '确认客户证件'] }, startTime: '2025-11-04', endTime: '2025-11-05' }, 
        { id: 'O1003', type: '接车', location: '本社工厂', time: '11:00', notes: '紧急订单', assignedTo: null, carId: null, details: { babySeat: false, needsPayment: false, checkItems: [] }, startTime: '2025-10-31', endTime: '2025-11-01' }, 
        { id: 'O1004', type: '送车', location: '地点B', time: '17:30', notes: '客户赶时间', assignedTo: null, carId: null, details: { babySeat: false, needsPayment: false, checkItems: [] }, startTime: '2025-11-02', endTime: '2025-11-03' }
    ],
    travelTimes: {
        '羽田空港-成田空港': 90,
        '成田空港-本社工厂': 75,
        '本社工厂-羽田空港': 30,
        '地点A-地点B': 20,
        '本社工厂-地点B': 45,
        '地点B-成田空港': 60,
    }
};

// ----------------------------------------------------------
// 3. 覆盖原有数据持久化函数 (实现实时同步)
// ----------------------------------------------------------

/**
 * [覆盖原有的 saveData] 将当前 appData 状态发送到 Firebase。
 * 这是所有写入操作的入口。
 */
window.saveData = function() {
    // appData 变量来自 script.js
    if (!appData) return; 
    
    // 清除本地存储以防干扰（可选，但推荐）
    localStorage.removeItem(DATA_KEY);
    
    dataRef.set(appData)
        .then(() => console.log('数据已成功上传到 Firebase。'))
        .catch(error => console.error('数据上传失败:', error));
};

/**
 * [覆盖原有的 loadData] 监听 Firebase 数据库中的数据变化，并实时更新 appData。
 */
window.loadData = function() {
    // 监听 'value' 事件，任何数据变化都会触发此回调
    dataRef.on('value', (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            // 实时更新全局 appData 变量
            // Object.assign 用于确保 appData 引用不变，但内容被新数据替换
            Object.assign(appData, data);
            console.log('数据已从 Firebase 实时同步并更新。');
        } else {
            // 如果 Firebase 数据库中没有数据，则使用默认结构并写入一次
            console.log('Firebase 数据库为空，使用默认数据初始化。');
            Object.assign(appData, defaultAppDataStructure);
            window.saveData(); // 写入默认数据 (会调用上面覆盖后的 saveData)
            return;
        }

        // 核心：数据加载或更新后，重新渲染当前活动页面
        const activePage = document.querySelector('.page.active');
        if (activePage) {
            // 使用 window.showPage 确保调用 script.js 中的全局函数
            window.showPage(activePage.id);
        } else {
            // 首次加载，强制显示车辆管理
            window.showPage('car-management');
        }
    });
};