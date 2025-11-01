// ==========================================================
// 1. Firebase 配置和初始化
// ==========================================================

const firebaseConfig = {
    // 📢 您的 Firebase 配置信息
    apiKey: "AIzaSyAkFSa6iPXSpPINsDgMZBkK6vVSiqHaDg8", 
    authDomain: "asaha001-c157e.firebaseapp.com",
    projectId: "asaha001-c157e",
    storageBucket: "asaha001-c157e.firebaseapp.com",
    messagingSenderId: "98311742305",
    appId: "1:98311742305:web:eaca4791a0b59b76a95b20",
    measurementId: "G-CYFML2DJSF"
};

const app = firebase.initializeApp(firebaseConfig);
const database = app.database();

const dbRefs = {
    cars: database.ref('cars'),
    orders: database.ref('orders'),
    employees: database.ref('employees')
};

let cars = {};
let orders = {};
let employees = {};


// ==========================================================
// 2. 核心数据同步和保存函数 (包含车辆状态自动更新)
// ==========================================================

function setupDataListeners() {
    dbRefs.cars.on('value', (snapshot) => {
        cars = snapshot.val() || {};
        try {
            renderCarTable();
            renderCarGanttChart(); 
            populateCarDropdown();
        } catch (e) { console.error("Error rendering Car/Gantt components:", e); }
    }, (error) => { console.error("Firebase Cars Data Error:", error); });

    dbRefs.orders.on('value', (snapshot) => {
        orders = snapshot.val() || {};
        try {
            renderEmployeeGanttChart();
            renderCarGanttChart();      
            renderEmployeeSchedule();   
        } catch (e) { console.error("Error rendering Order/Schedule components:", e); }
    }, (error) => { console.error("Firebase Orders Data Error:", error); });

    dbRefs.employees.on('value', (snapshot) => {
        employees = snapshot.val() || {};
        try {
            renderEmployeeSchedule(); 
            renderEmployeeGanttChart();
        } catch (e) { console.error("Error rendering Employee Schedule:", e); }
    }, (error) => { console.error("Firebase Employees Data Error:", error); });
}

function saveCar(key, data) {
    // 🚨 核心修改 1：每次保存/更新时，自动检查并更新 '点检提醒' 状态
    // 只有在数据中存在 '上次点检日期' 时才进行检查
    if (data['上次点检日期']) {
        data['点检提醒'] = checkInspectionStatus(data['上次点检日期']);
    } else if (key !== 'new' && cars[key] && cars[key]['上次点检日期']) {
        // 如果是更新但未传入日期，则使用旧日期进行检查
        data['点检提醒'] = checkInspectionStatus(cars[key]['上次点检日期']);
    }
    
    if (key === 'new') {
        // 确保新车初始化时也有点检提醒状态 ( যদিও addNewCar 已经处理 )
        if (!data['点检提醒']) {
             data['点检提醒'] = checkInspectionStatus(data['上次点检日期']);
        }
        dbRefs.cars.push(data);
    } else {
        dbRefs.cars.child(key).update(data); 
    }
}

function deleteCar(carKey) {
    // ... (保持不变) ...
    if (cars[carKey] && confirm(`确定要删除车辆 ${cars[carKey]['代称']} (${cars[carKey]['车牌']}) 吗？`)) {
        dbRefs.cars.child(carKey).remove()
            .catch(error => {
                console.error("删除车辆失败:", error);
                alert("删除车辆失败，请检查网络连接或权限。");
            });
    }
}

function addNewCar() {
    const todayDate = new Date().toISOString().substring(0, 10);
    // 🚨 初始数据：确保点检提醒字段也初始化
    const newCarData = {
        '代称': '新车', 
        '车牌': '待录入',
        '颜色': '白色',
        '基本信息': '无',
        '状态': '空闲',
        '当前地点': '工厂',
        '订单ID': '无',
        '下一动作': '待命',
        '已清洗': '是',
        '上次点检日期': todayDate, 
        '点检提醒': checkInspectionStatus(todayDate) // 初始为今天，所以是 '正常'
    };
    saveCar('new', newCarData); 
}

function saveOrder(data) {
    // 🚨 核心修改 2：如果订单分配了车辆 (data.carKey)，标记车辆需要清洗
    if (data.carKey && data.employeeKey) { // 只有在订单被正式分配时才触发洗车标记
        // 获取当前车辆数据，仅更新 '已清洗' 状态
        const carUpdates = {
            '已清洗': '否' // 标记为需要清洗
        };
        dbRefs.cars.child(data.carKey).update(carUpdates)
            .catch(error => console.error("更新车辆洗车状态失败:", error));
    }

    if (data.key) {
        dbRefs.orders.child(data.key).update(data);
    } else {
        dbRefs.orders.push(data);
    }
}

function deleteOrder(orderKey) {
    // ... (保持不变) ...
    if (orders[orderKey] && confirm(`确定要删除订单 ${orders[orderKey].orderId} 吗？`)) {
        dbRefs.orders.child(orderKey).remove();
    }
}

function saveEmployee(key, data) {
    // ... (保持不变) ...
    if (data.employeeDays && typeof data.employeeDays === 'string') {
        data.employeeDays = data.employeeDays.split(/[\s,]+/).filter(d => d.trim() !== '').map(d => d.trim());
    } else {
        data.employeeDays = [];
    }
    
    if (key === 'new') {
        dbRefs.employees.push(data);
    } else {
        dbRefs.employees.child(key).update(data);
    }
}

function deleteEmployee(employeeKey) {
    // ... (保持不变) ...
    if (employees[employeeKey] && confirm(`确定要删除员工 ${employees[employeeKey].name} 吗？`)) {
        const updates = {};
        Object.keys(orders).forEach(orderKey => {
            if (orders[orderKey].employeeKey === employeeKey) {
                updates[`orders/${orderKey}/employeeKey`] = null;
            }
        });
        
        database.ref().update(updates)
            .then(() => {
                dbRefs.employees.child(employeeKey).remove();
            })
            .catch(error => {
                console.error("删除员工及订单关联失败:", error);
            });
    }
}


// ==========================================================
// 3. 通用工具函数 (时间/地点/冲突检测)
// ==========================================================

function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    return hours * 60 + minutes;
}

/**
 * 检查车辆的点检日期是否过期（超过 60 天）。
 * @param {string} lastInspectionDateStr - 上次点检日期 (YYYY-MM-DD)
 * @returns {string} - '过期' 或 '正常'
 */
function checkInspectionStatus(lastInspectionDateStr) {
    if (!lastInspectionDateStr) return '过期'; // 没有记录，默认过期
    
    const today = new Date();
    const date1 = new Date(lastInspectionDateStr);
    const date2 = new Date(today.toISOString().substring(0, 10)); // 今天日期

    // 计算天数差 (忽略时间部分)
    const date1Utc = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const date2Utc = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
    const daysSinceInspection = Math.ceil(Math.abs(date2Utc - date1Utc) / (1000 * 3600 * 24));
    
    // 超过 60 天则标记为过期
    return daysSinceInspection > 60 ? '过期' : '正常';
}

function calculateTaskChainEndTime(order) {
    const factoryLocation = '工厂'; 
    const startTimeMinutes = timeToMinutes(order.orderTime);
    const startLocation = order.startLocation || factoryLocation; 
    const endLocation = order.endLocation || factoryLocation; 
    const processingTime = 30; 
    
    let totalTime = startTimeMinutes;
    // 假设员工从工厂出发到取车点
    totalTime += getTravelTime(factoryLocation, startLocation); 
    totalTime += processingTime; // 取车/送车处理时间
    // 从取车点到交车/下一个目的地
    totalTime += getTravelTime(startLocation, endLocation); 
    totalTime += processingTime; // 交车/下一个处理时间
    // 假设员工从交车点返回工厂
    totalTime += getTravelTime(endLocation, factoryLocation);
    
    return totalTime;
}

/**
 * 检查新订单或更新后的订单是否与员工排班或现有任务冲突
 * @param {string} employeeKey - 员工ID
 * @param {object} newOrder - 待检查的订单对象 (包含 orderDate, orderTime, key 等)
 * @param {object[]} existingOrders - 已经分配给该员工的其他所有订单列表 (用于甘特图拖拽时排除自身)
 * @returns {boolean} - true 表示无冲突，false 表示有冲突
 */
function checkNoConflict(employeeKey, newOrder, existingOrders = null) {
    const employee = employees[employeeKey];
    if (!employee || !newOrder.orderDate) return false;

    // 员工出勤日检查 (数组为空则默认每天出勤)
    const employeeDays = Array.isArray(employee.employeeDays) ? employee.employeeDays : [];
    const isScheduledToWork = employeeDays.length === 0 || employeeDays.includes(newOrder.orderDate);

    if (!isScheduledToWork) {
        return false; // 员工未在这一天排班
    }

    // 获取当天分配给该员工且非自身订单的所有任务
    const allOrders = existingOrders !== null ? existingOrders : Object.values(orders);
    const currentOrders = allOrders
        .filter(o => o.employeeKey === employeeKey && o.orderDate === newOrder.orderDate && o.key !== newOrder.key)
        .sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime));

    const shiftStart = timeToMinutes(employee.startTime);
    const shiftEnd = timeToMinutes(employee.endTime);

    const newTaskStartTime = timeToMinutes(newOrder.orderTime);
    const newTaskEndTime = calculateTaskChainEndTime(newOrder);

    // 检查是否超出员工班次时间
    if (newTaskStartTime < shiftStart || newTaskEndTime > shiftEnd) {
        return false; // 超出班次时间
    }

    // 检查与当前任务的冲突
    const combinedOrders = [...currentOrders, newOrder].sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime));
    
    for (let i = 0; i < combinedOrders.length; i++) {
        const currentTask = combinedOrders[i];
        
        if (i > 0) {
            const previousTask = combinedOrders[i - 1];
            
            if(previousTask.orderDate !== currentTask.orderDate) continue; 

            const previousTaskReturnTime = calculateTaskChainEndTime(previousTask);
            const currentTaskStartTime = timeToMinutes(currentTask.orderTime);
            
            // 检查上一任务的预估返回时间是否晚于当前任务的开始时间
            if (previousTaskReturnTime > currentTaskStartTime) {
                return false; // 任务链冲突
            }
        }
    }

    return true; // 无冲突
}


// ==========================================================
// 4. 自动排班功能
// ==========================================================

function autoSchedule() {
    const unassignedOrders = Object.entries(orders)
                                   .filter(([key, data]) => !data.employeeKey)
                                   .map(([key, data]) => ({ key, ...data }))
                                   .sort((a, b) => {
                                       if (a.orderDate !== b.orderDate) {
                                           return a.orderDate.localeCompare(b.orderDate);
                                       }
                                       return timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime);
                                   });
    
    if (unassignedOrders.length === 0) {
        alert('没有待分配的订单需要自动排班。');
        return;
    }
    
    const employeeKeys = Object.keys(employees);
    const updates = {};
    let assignedCount = 0;

    unassignedOrders.forEach(order => {
        for (const employeeKey of employeeKeys) {
            // 使用 checkNoConflict 检查是否可用
            if (checkNoConflict(employeeKey, { ...order, employeeKey: employeeKey })) { 
                
                updates[`orders/${order.key}/employeeKey`] = employeeKey;
                assignedCount++;
                
                // 立即更新内存中的订单数据，以避免后续检查中发生冲突误判
                order.employeeKey = employeeKey; 
                orders[order.key].employeeKey = employeeKey; 

                break; 
            }
        }
    });

    if (assignedCount > 0) {
        database.ref().update(updates)
            .then(() => {
                alert(`自动排班完成：成功分配了 ${assignedCount} 个订单！`);
            })
            .catch(error => {
                console.error("自动排班批量更新失败:", error);
                alert('自动排班失败，请检查控制台错误。');
            });
    } else {
        alert('没有找到合适的员工来分配剩余的订单，可能是时间冲突、超出班次或员工当日未出勤。');
    }
}




// ==========================================================
// 5. UI 渲染和事件绑定 (通用/车辆/旧排班页) - 修正版
// ==========================================================

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }

    localStorage.setItem('currentPage', pageId); 

    document.querySelectorAll('nav button').forEach(button => {
        button.classList.remove('active');
    });
    const navButton = document.getElementById(`nav-${pageId.split('-')[0]}`);
    if (navButton) {
        navButton.classList.add('active');
    }

    // 页面切换时刷新对应内容
    if (pageId === 'personnel-scheduling') {
        renderEmployeeSchedule();
    }
    if (pageId === 'employee-gantt') {
        currentGanttStartDate = getTodayDateString(); 
        renderEmployeeGanttChart(); 
    }
    // 🚨 车辆表格在 car-management 页面加载时刷新
    if (pageId === 'car-management') {
         renderCarTable(); 
    }
    // 【✅ 在这里新增以下逻辑】
    if (pageId === 'car-gantt') {
        renderCarGanttChart(); 
    }
}

let currentCarGanttMonth = new Date(); 
let currentGanttStartDate = getTodayDateString(); 

function getTodayDateString() {
    return new Date().toISOString().substring(0, 10);
}

// 辅助函数：将 'YYYY-MM-DD' 格式的日期转换为 Date 对象
function parseDate(dateString) {
    // 使用 'T00:00:00' 避免时区问题，确保日期计算准确
    return new Date(dateString + 'T00:00:00'); 
}

// 辅助函数：获取两个日期之间的所有日期（包含起始和结束）
function getDatesBetween(startDateStr, endDateStr) {
    const dates = [];
    let currentDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);

    while (currentDate <= endDate) {
        dates.push(currentDate.toISOString().substring(0, 10));
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
}


// 【新增/修改】专用于车辆甘特图的日期切换函数
function changeCarGanttPeriod(delta) {
    const current = new Date(currentGanttStartDate + 'T00:00:00'); // 确保使用 T00:00:00 避免时区问题
    // delta 为 1 时，前进 10 天；为 -1 时，后退 10 天
    current.setDate(current.getDate() + delta * 10); 
    currentGanttStartDate = current.toISOString().substring(0, 10);
    renderCarGanttChart();
}

// 【请在您的 HTML 中将 changeCarGanttMonth 替换为 changeCarGanttPeriod(-1) 和 changeCarGanttPeriod(1)】


function changeEmployeeGanttWeek(delta) { 
    const current = new Date(currentGanttStartDate);
    current.setDate(current.getDate() + delta);
    currentGanttStartDate = current.toISOString().substring(0, 10);
    renderEmployeeGanttChart();
}


function renderCarTable() {
    const tableBody = document.querySelector('#car-table tbody');
    if (!tableBody) return;
    
    tableBody.innerHTML = ''; 

    Object.keys(cars).forEach(carKey => {
        const car = cars[carKey];
        const row = tableBody.insertRow();
        row.dataset.key = carKey;

        // 🚨 车辆提醒状态 Class
        let rowClass = '';
        if (car['点检提醒'] === '过期') {
            rowClass += ' car-inspection-due'; 
        }
        if (car['已清洗'] === '否') {
            rowClass += ' car-needs-washing';  
        }
        row.className = rowClass;

        const fields = [
            '代称', '车牌', '颜色', '基本信息', '状态', 
            '当前地点', '订单ID', '下一动作'
        ];

        // 渲染可编辑/不可编辑字段
        fields.forEach(field => {
            const cell = row.insertCell();
            cell.textContent = car[field] || '无';
            cell.dataset.field = field;
            if (['代称', '车牌', '颜色', '基本信息', '状态', '当前地点'].includes(field)) {
                cell.contentEditable = true;
            } else {
                cell.contentEditable = false;
            }
        });
        
        // 🚨 1. 已清洗按钮
        const washBtnClass = car['已清洗'] === '否' ? 'btn-action-due' : 'btn-action-ok';
        const washBtnText = car['已清洗'] === '否' ? '🧼 需清洗' : '✅ 已清洗';
        const washCell = row.insertCell();
        washCell.innerHTML = `<button class="${washBtnClass} car-wash-btn" data-key="${carKey}">${washBtnText}</button>`;

        // 🚨 2. 上次点检日期 (可编辑日期输入框)
        const dateCell = row.insertCell();
        dateCell.innerHTML = `<input type="date" class="car-date-input" data-key="${carKey}" value="${car['上次点检日期'] || ''}">`;

        // 🚨 3. 点检提醒按钮
        const inspectBtnClass = car['点检提醒'] === '过期' ? 'btn-action-due' : 'btn-action-ok';
        const inspectBtnText = car['点检提醒'] === '过期' ? '🚨 需点检' : '✅ 正常';
        const inspectCell = row.insertCell();
        inspectCell.innerHTML = `<button class="${inspectBtnClass} car-inspect-btn" data-key="${carKey}">${inspectBtnText}</button>`;
        
        // 删除按钮
        const actionCell = row.insertCell();
        actionCell.innerHTML = `<i class="fas fa-trash delete-btn" onclick="deleteCar('${carKey}')" title="删除车辆"></i>`;
    });
    
    // 绑定可编辑字段的保存事件
    tableBody.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
        cell.removeEventListener('blur', saveCarEdit); 
        cell.addEventListener('blur', saveCarEdit); 
    });

    // 🚨 绑定新增的交互按钮事件
    setupCarTableListeners(); 
}

function saveCarEdit(event) {
    const key = event.target.closest('tr').dataset.key;
    const field = event.target.dataset.field;
    let newValue = event.target.textContent;
    
    if (newValue.trim() === '') {
        newValue = cars[key][field] || '未填写'; 
        event.target.textContent = newValue;
    }

    saveCar(key, { [field]: newValue }); 
}

// 🚨 新增：车辆表格交互逻辑
function setupCarTableListeners() {
    const container = document.querySelector('#car-table tbody');
    if (!container) return;
    
    // --- 1. 洗车按钮点击事件 ---
    container.querySelectorAll('.car-wash-btn').forEach(button => {
        button.onclick = function() {
            const carKey = this.dataset.key;
            // 只需要将 '已清洗' 状态切换为 '是'
            const updates = { '已清洗': '是' };
            saveCar(carKey, updates);
            alert(`车辆 ${cars[carKey]?.['代称']} 已完成清洗！`);
        };
    });
    
    // --- 2. 点检按钮点击事件 ---
    container.querySelectorAll('.car-inspect-btn').forEach(button => {
        button.onclick = function() {
            const carKey = this.dataset.key;
            // 标记为 '正常'，并更新 '上次点检日期' 为今天
            const todayStr = new Date().toISOString().substring(0, 10);
            
            const updates = { 
                '点检提醒': '正常',
                '上次点检日期': todayStr
            };
            
            // 直接调用 Firebase 更新 (会触发 saveCar 内部的检查和渲染)
            dbRefs.cars.child(carKey).update(updates);
            alert(`车辆 ${cars[carKey]?.['代称']} 已完成点检！日期已更新为今天。`);
        };
    });
    
    // --- 3. 点检日期输入框修改事件 ---
    container.querySelectorAll('.car-date-input').forEach(input => {
        input.onchange = function() {
            const carKey = this.dataset.key;
            const newDate = this.value;
            
            if (newDate) {
                // saveCar 内部会自动调用 checkInspectionStatus 重新计算 '点检提醒' 状态
                saveCar(carKey, { '上次点检日期': newDate }); 
            }
        };
    });
}


// ==========================================================
// 🚨 最终修正：renderCarGanttChart (改为 10 天周期)
// ==========================================================
function renderCarGanttChart() { 
    const container = document.getElementById('car-gantt-chart-container'); 
    const display = document.getElementById('car-gantt-month-display');      
    if (!container || !display) return;
    
    const startDate = parseDate(currentGanttStartDate); // 使用辅助函数解析起始日期
    
    // 确定结束日期：起始日期 + 9 天（共 10 天）
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 9);
    
    const startDateStr = startDate.toISOString().substring(0, 10);
    const endDateStr = endDate.toISOString().substring(0, 10);

    // 显示周期：YYYY-MM-DD 到 YYYY-MM-DD
    display.textContent = `周期：${startDateStr} 至 ${endDateStr}`;

    // 获取这 10 天的所有日期字符串
    const displayDates = getDatesBetween(startDateStr, endDateStr);
    const daysToDisplay = displayDates.length;
    
    // -------------------------------------------------------------------
    // 生成表头 (包含日期)
    // -------------------------------------------------------------------
    const headerCells = displayDates.map(dateStr => {
        // 仅显示日期，如 11/01
        const dateParts = dateStr.substring(5).split('-'); // MM-DD
        return `<th title="${dateStr}">${dateParts[0]}/${dateParts[1]}</th>`; 
    }).join('');

    const headerHtml = `<thead><tr><th style="min-width: 150px;">车辆 / 日期</th>${headerCells}</tr></thead>`;
    
    let bodyHtml = '<tbody>';
    Object.keys(cars).forEach(carKey => {
        const car = cars[carKey];
        bodyHtml += `<tr><td>${car?.['代称'] || '未知'} (${car?.['车牌'] || '无'})</td>`;
        
        // 遍历这 10 天
        displayDates.forEach(dateStr => { 
            let cellContent = '';
            let cellClass = '';
            const ordersOnDay = [];
            
            // 逐个检查订单是否覆盖了当前的 dateStr
            Object.values(orders).forEach(order => {
                if (order.orderCarId === carKey && order.orderStartDate && order.orderEndDate) {
                    
                    const start = parseDate(order.orderStartDate);
                    const end = parseDate(order.orderEndDate);
                    const current = parseDate(dateStr); 
                    
                    if (current >= start && current <= end) {
                        ordersOnDay.push(order);
                    }
                }
            });

            // 渲染单元格
            if (ordersOnDay.length > 0) {
                cellClass = 'booked';
                
                cellContent = ordersOnDay.map(order => {
                    // 悬浮显示接送地点
                    const titleText = `订单: #${order.orderId || 'N/A'}\n取车: ${order.orderStartLocation || '无'}\n还车: ${order.orderEndLocation || '无'}`;
                    
                    // 显示订单号
                    return `<span class="car-gantt-task" title="${titleText}">#${order.orderId || 'N/A'}</span>`;
                }).join('');
            }

            bodyHtml += `<td class="${cellClass}">${cellContent}</td>`;
        });
        bodyHtml += '</tr>';
    });
    bodyHtml += '</tbody>';

    // 渲染最终表格
    container.innerHTML = `<table class="gantt-table">${headerHtml}${bodyHtml}</table>`;
}


function populateCarDropdown() {
    const select = document.getElementById('order-car-id');
    if (!select) return;

    const selectedValue = select.value; 
    select.innerHTML = '<option value="" disabled selected>--- 分配车辆 (必填) ---</option>';

    Object.keys(cars).forEach(carKey => {
        const car = cars[carKey];
        const option = document.createElement('option');
        option.value = carKey;
        option.textContent = `${car?.['代称'] || '未知'} (${car?.['车牌'] || '无'})`; 
        if (carKey === selectedValue) {
            option.selected = true; 
        }
        select.appendChild(option);
    });
    if (selectedValue && !select.querySelector(`option[value="${selectedValue}"]`)) {
        select.value = "";
    }
}


function renderEmployeeSchedule() {
    const unassignedContainer = document.getElementById('unassigned-orders');
    const scheduleContainer = document.getElementById('employee-schedule-container');
    if (!unassignedContainer || !scheduleContainer) return;

    unassignedContainer.innerHTML = '<h4>待分配订单 (拖入员工窗口)</h4>';
    scheduleContainer.innerHTML = '';

    const allOrders = Object.entries(orders || {}).map(([key, data]) => ({ key, ...data }));
    const todayStr = getTodayDateString();
    const unassignedOrders = allOrders.filter(o => !o.employeeKey && o.orderDate === todayStr);
    const assignedOrders = allOrders.filter(o => o.employeeKey && o.orderDate === todayStr);

    unassignedOrders
        .sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime)) 
        .forEach(order => {
            unassignedContainer.appendChild(createOrderCard(order));
        });
    
    Object.keys(employees || {}).forEach(employeeKey => {
        const employee = employees[employeeKey];
        if (!employee) return; 

        const window = document.createElement('div');
        window.className = 'employee-window';
        window.dataset.employeeKey = employeeKey;

        // 新逻辑：如果 employeeDays 数组为空，isWorkingToday 默认为 true
        const employeeDays = Array.isArray(employee.employeeDays) ? employee.employeeDays : [];
        const isWorkingToday = employeeDays.length === 0 || employeeDays.includes(todayStr);
        
        const workingStatus = isWorkingToday ? '' : ' (🚫 今日未出勤)';
        const workingClass = isWorkingToday ? '' : ' non-working-today';
        
        window.innerHTML = `
            <h4 class="${workingClass}">
                ${employee.name} 
                (${employee.startTime}-${employee.endTime})${workingStatus}
                <i class="fas fa-trash delete-btn" onclick="deleteEmployee('${employeeKey}')" title="删除员工"></i>
            </h4>
            <div class="conflict-alert" style="display:none;"></div>
        `;
        
        const employeeOrders = assignedOrders.filter(o => o.employeeKey === employeeKey)
                                             .sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime));
        
        employeeOrders.forEach(order => {
            window.appendChild(createOrderCard(order));
        });

        scheduleContainer.appendChild(window);
    });

    setupDragAndDrop();
    Object.keys(employees).forEach(checkEmployeeConflict);
}



// ==========================================================
// 🚨 核心修改：createOrderCard (订单卡片显示车辆提醒状态)
// ==========================================================
function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.draggable = true;
    card.dataset.orderKey = order.key;
    
    const endTimeMinutes = calculateTaskChainEndTime(order);
    const endTimeStr = formatTime(endTimeMinutes);
    
    // 🚨 修正：使用 order.carKey
    const car = order.carKey && cars[order.carKey] ? cars[order.carKey] : null;
    const carName = car ? car['代称'] : '未分配';
    
    let carAlert = '';
    if (car) {
        if (car['已清洗'] === '否') {
            carAlert += ' 🧼';
            card.classList.add('needs-washing'); // 添加样式提醒
        }
        if (car['点检提醒'] === '过期') {
             carAlert += ' 🚨';
             card.classList.add('needs-inspection'); // 添加样式提醒
        }
    }

    card.innerHTML = `
        <strong>${order.orderId} - ${order.orderType}</strong>: ${order.orderTime} @ ${order.startLocation} -> ${order.endLocation}
        <div class="car-details">
            车辆: ${carName} ${carAlert} | 日期: ${order.orderDate}
        </div>
        <div class="task-chain-info">
            预估返回工厂: <span class="end-time">${endTimeStr}</span>
        </div>
        <div class="order-actions">
            <i class="fas fa-trash" onclick="deleteOrder('${order.key}')" title="删除"></i>
        </div>
    `;
    
    return card;
}

let draggedOrderKey = null;

function setupDragAndDrop() {
    document.querySelectorAll('#personnel-scheduling .order-card').forEach(card => {
        card.removeEventListener('dragstart', handleScheduleDragStart);
        card.removeEventListener('dragend', handleScheduleDragEnd);
        card.addEventListener('dragstart', handleScheduleDragStart);
        card.addEventListener('dragend', handleScheduleDragEnd);
    });

    document.querySelectorAll('#personnel-scheduling .employee-window, #personnel-scheduling #unassigned-orders').forEach(window => {
        window.removeEventListener('dragover', handleScheduleDragOver);
        window.removeEventListener('dragleave', handleScheduleDragLeave);
        window.removeEventListener('drop', handleScheduleDrop);

        window.addEventListener('dragover', handleScheduleDragOver);
        window.addEventListener('dragleave', handleScheduleDragLeave);
        window.addEventListener('drop', handleScheduleDrop);
    });
}

function handleScheduleDragStart(e) {
    draggedOrderKey = e.target.dataset.orderKey;
    e.dataTransfer.setData('orderKey', draggedOrderKey); 
    e.target.classList.add('dragging');
}

function handleScheduleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedOrderKey = null;
}

function handleScheduleDragOver(e) {
    e.preventDefault(); 
    e.currentTarget.classList.add('drop-target-active');
}

function handleScheduleDragLeave(e) {
    e.currentTarget.classList.remove('drop-target-active');
}

function handleScheduleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drop-target-active');

    const key = e.dataTransfer.getData('orderKey');
    if (key) {
        let newEmployeeKey = e.currentTarget.dataset.employeeKey || null; 
        const orderToAssign = orders[key];
        
        if (newEmployeeKey && orderToAssign) {
             if (orderToAssign.orderDate !== getTodayDateString()) {
                  alert("🔴 警告：此拖拽页面仅处理**今日**排班，请使用甘特图调整非今日任务！");
                  return;
             }

             if (!checkNoConflict(newEmployeeKey, orderToAssign)) {
                  alert("🔴 冲突警告：该订单与员工现有任务、班次时间或未出勤日冲突！请手动调整。");
                  return; 
             }
        }
        
        dbRefs.orders.child(key).update({ employeeKey: newEmployeeKey })
             .catch(error => {
                  console.error("Error updating order:", error);
             });
    }
}


function checkEmployeeConflict(employeeKey) {
    const employeeWindow = document.querySelector(`#personnel-scheduling .employee-window[data-employee-key="${employeeKey}"]`);
    const conflictAlert = employeeWindow?.querySelector('.conflict-alert');
    if (!employeeWindow || !conflictAlert) return;

    conflictAlert.style.display = 'none';

    const todayStr = getTodayDateString();
    const employeeOrders = Object.values(orders || {})
        .filter(o => o.employeeKey === employeeKey && o.orderDate === todayStr)
        .sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime));

    if (employeeOrders.length > 0) {
        
        const hasConflict = employeeOrders.some(order => {
             const allOrdersExcludingSelf = Object.values(orders).filter(o => o.key !== order.key);
             return !checkNoConflict(employeeKey, { ...order, key: order.key }, allOrdersExcludingSelf);
        });
        
        if (hasConflict) {
             conflictAlert.textContent = "🔴 任务冲突！请检查时间。";
             conflictAlert.style.display = 'block';
        }
    }
}


// ==========================================================
// 6. 员工排班甘特图 - 拖拽稳定版
// ==========================================================

function renderEmployeeGanttChart() {
    const container = document.getElementById('employee-gantt-chart-container');
    const display = document.getElementById('employee-gantt-week-display');
    if (!container || !display) return;
    
    // =======================================================
    // 🚨 关键修复：确保所有订单数据都是一个带有 key 的数组
    // 这样 ordersOnThisDay 和 unassignedOnDay 的 order.key 属性才会有值
    // =======================================================
    let allOrdersWithKeys = [];
    if (orders && typeof orders === 'object' && !Array.isArray(orders)) {
        // 如果 orders 是 Firebase 的对象映射格式，则转换为带 key 的数组
        for (const key in orders) {
            if (orders.hasOwnProperty(key)) {
                // 将 Firebase 键作为属性 key 附加到订单数据中
                allOrdersWithKeys.push({ ...orders[key], key: key }); 
            }
        }
    } else if (Array.isArray(orders)) {
        // 如果 orders 已经是数组，直接使用
        allOrdersWithKeys = orders;
    }
    // 如果 orders 变量未定义或为空，allOrdersWithKeys 将是空数组，这是安全的。
    // =======================================================
    
    const startDate = new Date(currentGanttStartDate);
    const dateList = [];
    const dateDisplayList = [];
    const todayStr = getTodayDateString();

    for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        dateList.push(date.toISOString().substring(0, 10));
        dateDisplayList.push(`${date.getMonth() + 1}/${date.getDate()} (${'日一二三四五六'[date.getDay()]})`);
    }

    display.textContent = `${dateList[0]} - ${dateList[6]}`;

    let html = '<table class="gantt-table employee-gantt seven-day-view"><thead><tr><th style="min-width: 180px;">员工 / 班次</th>';
    dateDisplayList.forEach((disp, index) => {
        const dateStr = dateList[index];
        html += `<th data-date="${dateStr}" class="${dateStr === todayStr ? 'today-col' : ''}">${disp}</th>`;
    });
    html += '</tr></thead><tbody>';

    Object.keys(employees).forEach(employeeKey => {
        const employee = employees[employeeKey];
        html += `<tr><td>${employee.name} (${employee.startTime}-${employee.endTime})</td>`;
        
        dateList.forEach(dateStr => {
            const employeeDays = Array.isArray(employee.employeeDays) ? employee.employeeDays : [];
            const isWorkingDay = employeeDays.length === 0 || employeeDays.includes(dateStr);

            let classList = dateStr === todayStr ? 'today-col' : '';
            let content = '';
            
            // 使用准备好的列表 allOrdersWithKeys
            const ordersOnThisDay = allOrdersWithKeys.filter(order => 
                order.employeeKey === employeeKey && order.orderDate === dateStr
            ).sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime));

            if (!isWorkingDay) {
                classList += ' non-working-day';
            } else {
                classList += ' working-day drop-target'; // 标记为放置目标

                if (ordersOnThisDay.length > 0) {
                    classList += ' task-day';
                    let conflict = false;

                    content = ordersOnThisDay.map(order => {
                        const endTimeMinutes = calculateTaskChainEndTime(order);
                        const endTimeStr = formatTime(endTimeMinutes);
                        
                        // 冲突检查也使用 allOrdersWithKeys 替换 Object.values(orders)
                        const allOrdersExcludingSelf = allOrdersWithKeys.filter(o => o.key !== order.key);
                        const taskConflict = !checkNoConflict(employeeKey, { ...order, key: order.key }, allOrdersExcludingSelf);
                        if (taskConflict) conflict = true;
                        
                        return `
                            <div class="gantt-task-card draggable-order ${taskConflict ? 'conflict-task' : ''}" 
                                 draggable="true" 
                                 data-order-key="${order.key}"
                                 title="ID:${order.orderId}, ${order.orderType}: ${order.startLocation}→${order.endLocation} (回厂: ${endTimeStr})">
                                 ${order.orderTime} | ${order.orderType}
                            </div>`;
                    }).join('');

                    if (conflict) classList += ' conflict-day';
                    
                } else {
                    classList += ' free-day';
                }
            }

            html += `<td class="${classList.trim()}" 
                             data-employee-key="${employeeKey}" 
                             data-date="${dateStr}" 
                             >
                             ${content}
                             </td>`;
        });
        html += '</tr>';
    });

    // 渲染待分配订单行
    html += '<tr class="unassigned-row"><td>待分配订单</td>';
    dateList.forEach(dateStr => {
        // 使用准备好的列表 allOrdersWithKeys
        const unassignedOnDay = allOrdersWithKeys.filter(o => !o.employeeKey && o.orderDate === dateStr);
        let content = unassignedOnDay.map(order => {
            const endTimeMinutes = calculateTaskChainEndTime(order);
            const endTimeStr = formatTime(endTimeMinutes);

            return `
                <div class="gantt-task-card draggable-order unassigned" 
                     draggable="true" 
                     data-order-key="${order.key}"
                     title="ID:${order.orderId}, ${order.orderType}: ${order.startLocation}→${order.endLocation} (回厂: ${endTimeStr})">
                     ${order.orderTime} | ${order.orderType}
                </div>`;
        }).join('');

        html += `<td class="unassigned-drop-target drop-target" 
                         data-date="${dateStr}"
                         >${content}</td>`;
    });
    html += '</tr>';


    html += '</tbody></table>';
    container.innerHTML = html;
    
    // 关键：每次渲染后重新设置事件监听
    setupGanttDragAndDrop(); 
}

// ---------------------------------------------------------
// 拖拽事件处理器 (Drag & Drop Handlers)
// ---------------------------------------------------------




function handleGanttDragStart(e) {
    const card = e.target.closest('.draggable-order');
    if (!card) return;

    const orderKey = card.dataset.orderKey; 

    if (!orderKey) {
        // 如果卡片没有 key，则阻止拖拽
        e.preventDefault();
        console.error('DragStart FAILED: Card is missing data-order-key attribute!');
        return;
    }

    // 🚨 关键：使用唯一的 MIME Type 键名来设置数据
    e.dataTransfer.setData('text/orderkey', orderKey); 
    e.dataTransfer.effectAllowed = 'move'; 
    
    card.classList.add('dragging');
    console.log('Drag Start Success! Key Set:', orderKey); 
}

function handleGanttDragEnd(e) {
    const card = e.target.closest('.draggable-order');
    if (card) {
        card.classList.remove('dragging');
    }
}

/**
 * 拖拽进入：辅助确保 drop 区域有效。
 * 🚨 必须阻止默认行为！
 */
function handleGanttDragEnter(e) {
    // 阻止默认行为，允许放置 (强制执行)
    e.preventDefault(); 
    // console.log('Drag Enter on target:', e.currentTarget); // 调试
}

/**
 * 拖拽悬停：🚨 核心修复：阻止默认行为并设置高亮。
 * 🚨 必须阻止默认行为！
 */
function handleGanttDragOver(e) { 
    // 1. 强制阻止默认行为，这是让 drop 事件触发的关键！
    e.preventDefault(); 
    
    // 2. 确保 dropEffect 是 move
    e.dataTransfer.dropEffect = 'move';

    // 3. 查找目标
    const targetCell = e.currentTarget.closest('.drop-target'); 
    
    // 4. 清除同级或邻近单元格的高亮 (只清除当前行的，防止闪烁)
    targetCell?.parentElement?.querySelectorAll('.drop-target-active').forEach(el => {
        if (el !== targetCell) {
             el.classList.remove('drop-target-active');
        }
    });

    // 5. 添加高亮
    if (targetCell) {
        targetCell.classList.add('drop-target-active');
    }
}


/**
 * 放置执行：使用调试日志和简化逻辑。
 */
/**
 * 最终修复版 DROP 处理器
 * 核心：使用安全查找逻辑，解决 orders 可能是数组的问题。
 */
function handleGanttDrop(e) {
    // 阻止默认行为并清除高亮
    e.preventDefault();
    console.log('--- DROP EVENT TRIGGERED ---');
    
    e.target.closest('tr')?.querySelectorAll('.drop-target-active').forEach(el => el.classList.remove('drop-target-active'));
    
    // 🚨 关键：使用与 setData 相同的键名 'text/orderkey' 来获取数据
    const orderKey = e.dataTransfer.getData('text/orderkey'); 
    
    // 依赖事件监听器直接绑定的目标 e.currentTarget
    const targetCell = e.currentTarget; 

    if (!orderKey || !targetCell || targetCell.tagName !== 'TD') {
        // 如果 orderKey 仍为空，打印详细信息
        console.error('DROP ABORTED: Invalid target or missing key.', 'Key used:', orderKey);
        return;
    }
    
    // =======================================================
    // 修复核心：安全地查找订单对象 (沿用我们之前确定的安全逻辑)
    // =======================================================
    let orderToAssign = null;
    
    if (Array.isArray(orders)) {
        orderToAssign = orders.find(order => order.key === orderKey);
    } else if (orders && typeof orders === 'object') {
        orderToAssign = orders[orderKey];
    }
    
    if (!orderToAssign) {
        console.error('DROP ABORTED: Order not found in global list. Key used:', orderKey);
        return;
    }
    // =======================================================

    const newDate = targetCell.dataset.date;
    let newEmployeeKey = targetCell.dataset.employeeKey || null; 
    
    console.log(`Attempting to move Order ${orderKey} to Employee: ${newEmployeeKey} on Date: ${newDate}`);

    // ... (冲突检查和 Firebase 更新逻辑保持不变) ...
    if (newEmployeeKey) {
        const updatedOrder = { ...orderToAssign, orderDate: newDate, key: orderKey, employeeKey: newEmployeeKey };
        const existingOrders = Object.values(orders).filter(o => o.key !== orderKey);

        if (!checkNoConflict(newEmployeeKey, updatedOrder, existingOrders)) {
            console.warn('DROP ABORTED: Conflict detected! Alert shown.');
            alert(`🔴 冲突警告：任务与 ${employees[newEmployeeKey].name} 在 ${newDate} 的班次或现有任务冲突！`);
            return; 
        }
    }
    
    dbRefs.orders.child(orderKey).update({ 
        employeeKey: newEmployeeKey, 
        orderDate: newDate 
    }).then(() => {
        console.log('Firebase Update SUCCESS. Refreshing chart.');
        renderEmployeeGanttChart(); 
    }).catch(err => {
        console.error("Firebase Update FAILED:", err);
        alert("🚨 任务分配失败：请检查网络或日志。");
    });
}

/**
 * 集中设置甘特图的拖拽事件监听器。
 */
function setupGanttDragAndDrop() {
    const ganttContainer = document.getElementById('employee-gantt-chart-container');
    if (!ganttContainer) return;
    
    // 1. **绑定拖拽源 (任务卡片)**
    ganttContainer.querySelectorAll('.draggable-order').forEach(card => {
        card.removeEventListener('dragstart', handleGanttDragStart);
        card.removeEventListener('dragend', handleGanttDragEnd);
        
        card.addEventListener('dragstart', handleGanttDragStart);
        card.addEventListener('dragend', handleGanttDragEnd);
    });
    // console.log(`Bound ${ganttContainer.querySelectorAll('.draggable-order').length} draggable cards.`);

    // 2. **绑定拖拽目标 (TD 单元格)**
    ganttContainer.querySelectorAll('.drop-target').forEach(cell => {
        if (cell.tagName === 'TD') {
            // 🚨 强制移除所有可能的旧监听器
            cell.removeEventListener('dragenter', handleGanttDragEnter);
            cell.removeEventListener('dragover', handleGanttDragOver);
            cell.removeEventListener('drop', handleGanttDrop);

            // 🚨 强制重新绑定 dragenter, dragover, drop
            cell.addEventListener('dragenter', handleGanttDragEnter);
            cell.addEventListener('dragover', handleGanttDragOver);
            cell.addEventListener('drop', handleGanttDrop);
        }
    });
    // console.log(`Bound ${ganttContainer.querySelectorAll('.drop-target').length} drop targets.`);
}


// ==========================================================
// 7. CSV 日报下载功能
// ==========================================================

function downloadTodaySummary() {
    const todayStr = new Date().toISOString().substring(0, 10);
    const COMMA = ",";
    const NEWLINE = "\n"; 
    let csvContent = ""; 
    const safeJoin = (arr) => arr.map(item => {
        let str = (item + "").replace(/"/g, '""');
        return `"${str}"`; 
    }).join(COMMA) + NEWLINE;

    // 1. 车辆状态概览部分 
    csvContent += "--- 车辆状态概览 ---" + NEWLINE;
    csvContent += safeJoin(["代称", "车牌", "状态", "当前地点", "订单ID", "下一动作", "已清洗", "点检提醒"]);
    Object.keys(cars).forEach(key => {
        const car = cars[key];
        const row = [car['代称'], car['车牌'], car['状态'], car['当前地点'], car['订单ID'], car['下一动作'], car['已清洗'], car['点检提醒']];
        csvContent += safeJoin(row);
    });
    csvContent += NEWLINE;

    // 2. 人员排班部分 (Employee Schedule)
    csvContent += "--- 今日人员排班 ---" + NEWLINE;
    csvContent += safeJoin(["员工", "班次", "出勤日", "订单ID", "任务日期", "任务", "任务时间", "起始地点", "结束地点", "预估返回工厂时间", "分配车辆", "订单备注"]);
    
    Object.keys(employees).forEach(employeeKey => {
        const employee = employees[employeeKey];
        // 如果 employeeDays 数组为空，显示“每天”
        const employeeDays = Array.isArray(employee.employeeDays) && employee.employeeDays.length > 0 ? employee.employeeDays.join(' ') : '每天';

        const employeeOrders = Object.values(orders || {})
            .filter(o => o.employeeKey === employeeKey)
            .sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime));

        if (employeeOrders.length === 0) {
            csvContent += safeJoin([employee.name, `${employee.startTime}-${employee.endTime}`, employeeDays, "", "", "", "", "", "", "", "", ""]);
        } else {
            employeeOrders.forEach(order => {
                const endTime = formatTime(calculateTaskChainEndTime(order)); 
                const carName = order.orderCarId && cars[order.orderCarId] ? cars[order.orderCarId]['代称'] : '无';

                const row = [
                    employee.name,
                    `${employee.startTime}-${employee.endTime}`,
                    employeeDays, 
                    order.orderId || '',
                    order.orderDate || '', 
                    order.orderType || '',
                    order.orderTime || '',
                    order.startLocation || '', 
                    order.endLocation || '', 
                    endTime, 
                    carName,
                    order.notes || ''
                ];
                csvContent += safeJoin(row);
            });
        }
    });

    csvContent += NEWLINE;
    
    // 3. 待分配订单部分 (Unassigned Orders)
    const unassignedOrders = Object.values(orders || {}).filter(o => !o.employeeKey);
    if (unassignedOrders.length > 0) {
        csvContent += "--- 待分配订单 ---" + NEWLINE;
        csvContent += safeJoin(["订单ID", "任务日期", "任务", "任务时间", "起始地点", "结束地点", "所需车辆", "订单备注"]); 
        
        unassignedOrders.forEach(order => {
            const carName = order.orderCarId && cars[order.orderCarId] ? cars[order.orderCarId]['代称'] : '未分配';
            
            const row = [
                order.orderId || '',
                order.orderDate || '', 
                order.orderType || '',
                order.orderTime || '',
                order.startLocation || '', 
                order.endLocation || '', 
                carName,
                order.notes || ''
            ];
            csvContent += safeJoin(row);
        });
    }

    const BOM_CHAR = "\uFEFF"; 
    const finalContentWithBOM = BOM_CHAR + csvContent;

    const encodedData = encodeURIComponent(finalContentWithBOM);
    const dataUri = `data:text/csv;charset=utf-8,${encodedData}`;

    const link = document.createElement('a');
    link.href = dataUri;
    link.download = `sakura_schedule_summary_${todayStr}.csv`; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================================
// 8. 初始化和事件绑定
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
    setupDataListeners();

    // 导航按钮
    document.getElementById('nav-car')?.addEventListener('click', () => showPage('car-management'));
    document.getElementById('nav-schedule')?.addEventListener('click', () => showPage('personnel-scheduling'));
    document.getElementById('nav-gantt')?.addEventListener('click', () => showPage('employee-gantt')); 
    // 绑定新增车辆按钮
    document.getElementById('add-car-btn')?.addEventListener('click', addNewCar); 
    // 排班管理按钮 (在两个页面使用)
    document.querySelectorAll('.auto-schedule-btn').forEach(btn => btn.addEventListener('click', autoSchedule));
    document.querySelectorAll('#download-summary-btn').forEach(btn => btn.addEventListener('click', downloadTodaySummary));
    // 车辆甘特图控制按钮
    document.getElementById('car-prev-month-btn')?.addEventListener('click', () => changeCarGanttMonth(-1)); 
    document.getElementById('car-next-month-btn')?.addEventListener('click', () => changeCarGanttMonth(1)); 
    // 员工甘特图七日视图控制按钮 
    document.getElementById('employee-prev-week-btn')?.addEventListener('click', () => changeEmployeeGanttWeek(-7));
    document.getElementById('employee-next-week-btn')?.addEventListener('click', () => changeEmployeeGanttWeek(7));

    // 订单表单提交 (在 personnel-scheduling 页面)
    document.getElementById('order-form')?.addEventListener('submit', function(e) {
        e.preventDefault(); 
        
        const orderId = document.getElementById('order-id').value.trim();
        const orderDate = document.getElementById('order-date').value; 
        const orderType = document.getElementById('order-type').value.trim();
        const orderTime = document.getElementById('order-time').value;
        const startLocation = document.getElementById('order-start-location').value.trim();
        const endLocation = document.getElementById('order-end-location').value.trim();
        const orderCarId = document.getElementById('order-car-id').value;
        const rentEndDate = document.getElementById('order-rent-end-date').value; 
        const babySeat = document.getElementById('order-baby-seat').checked;
        const notes = document.getElementById('order-notes').value;

        if (!orderId || !orderDate || !orderType || !orderTime || !startLocation || !endLocation || !orderCarId) {
             alert('🔴 错误：所有核心字段都是必填项！');
             return;
        }

        if (rentEndDate && new Date(orderDate) > new Date(rentEndDate)) {
             alert('租借结束日期不能早于任务日期！');
             return;
        }

        const newOrder = {
            orderId: orderId,
            orderDate: orderDate, 
            orderType: orderType, 
            orderTime: orderTime, 
            startLocation: startLocation, 
            endLocation: endLocation, 
            orderCarId: orderCarId, 
            
            orderStartDate: orderDate, 
            orderEndDate: rentEndDate || orderDate, 
            
            babySeat: babySeat, 
            notes: notes, 
            employeeKey: null 
        };

        saveOrder(newOrder);
        this.reset();
        alert('订单已提交并保存到 Firebase！');
    });

    // 员工表单提交 (在 personnel-scheduling 页面)
    document.getElementById('employee-form')?.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const employeeDaysValue = document.getElementById('employee-days').value.trim();

        const newEmployee = {
            name: document.getElementById('employee-name').value,
            startTime: document.getElementById('employee-start').value,
            endTime: document.getElementById('employee-end').value,
            // 提交空值，让 saveEmployee 函数处理为空数组
            employeeDays: employeeDaysValue 
        };

        if (!newEmployee.name) {
            alert('员工姓名是必填项！');
            return;
        }

        saveEmployee('new', newEmployee);
        this.reset();
        alert('员工已添加！');
    });

    const lastPageId = localStorage.getItem('currentPage');

    if (lastPageId) {
        showPage(lastPageId); 
    } else {
        showPage('car-management'); 
    }
});