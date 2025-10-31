// ==========================================================
// 1. Firebase 配置和初始化
// ==========================================================

const firebaseConfig = {
    // 📢 您的 Firebase 配置信息
    apiKey: "AIzaSyAkFSa6iPXSpPINsDgMZBkK6vVSiqHaDg8", 
    authDomain: "asaha001-c157e.firebaseapp.com",
    projectId: "asaha001-c157e",
    storageBucket: "asaha001-c157e.firebasestorage.app",
    messagingSenderId: "98311742305",
    appId: "1:98311742305:web:eaca4791a0b59b76a95b20",
    measurementId: "G-CYFML2DJSF"
};

// 初始化 Firebase (使用 Compatibility SDK v9.x 风格)
const app = firebase.initializeApp(firebaseConfig);
const database = app.database();

// 引用数据库路径
const dbRefs = {
    cars: database.ref('cars'),
    orders: database.ref('orders'),
    employees: database.ref('employees')
};

// 全局数据缓存 (实时同步数据)
let cars = {};
let orders = {};
let employees = {};

// ==========================================================
// 2. 核心数据同步函数
// ==========================================================

function setupDataListeners() {
    // 监听车辆数据
    dbRefs.cars.on('value', (snapshot) => {
        cars = snapshot.val() || {};
        try {
            renderCarTable();
            renderGanttChart(); 
            populateCarDropdown();
        } catch (e) { console.error("Error rendering Car/Gantt components:", e); }
    }, (error) => { console.error("Firebase Cars Data Error:", error); });

    // 监听订单数据
    dbRefs.orders.on('value', (snapshot) => {
        orders = snapshot.val() || {};
        try {
            renderEmployeeSchedule(); 
            renderGanttChart(); 
        } catch (e) { console.error("Error rendering Order/Schedule components:", e); }
    }, (error) => { console.error("Firebase Orders Data Error:", error); });

    // 监听员工数据
    dbRefs.employees.on('value', (snapshot) => {
        employees = snapshot.val() || {};
        try {
            renderEmployeeSchedule(); 
        } catch (e) { console.error("Error rendering Employee Schedule:", e); }
    }, (error) => { console.error("Firebase Employees Data Error:", error); });
}

function saveCar(key, data) {
    if (key === 'new') {
        dbRefs.cars.push(data);
    } else {
        dbRefs.cars.child(key).update(data); 
    }
}

function deleteCar(carKey) {
     if (cars[carKey] && confirm(`确定要删除车辆 ${cars[carKey]['代称']} (${cars[carKey]['车牌']}) 吗？`)) {
        dbRefs.cars.child(carKey).remove();
    }
}


function saveOrder(data) {
    // 确保订单有一个唯一的key
    if (data.key) {
        dbRefs.orders.child(data.key).update(data);
    } else {
        dbRefs.orders.push(data);
    }
}

function saveEmployee(key, data) {
    if (key === 'new') {
        dbRefs.employees.push(data);
    } else {
        dbRefs.employees.child(key).update(data);
    }
}

// ==========================================================
// 3. 通用工具函数 (时间/地点计算)
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

const travelTimes = {
    '工厂': { '羽田空港': 60, '成田空港': 120, '新宿': 30 },
    '羽田空港': { '工厂': 60, '成田空港': 90, '新宿': 45 },
    '成田空港': { '工厂': 120, '羽田空港': 90, '新宿': 120 },
    '新宿': { '工厂': 30, '羽田空港': 45, '成田空港': 120 },
};

function getTravelTime(from, to) {
    return travelTimes[from] ? (travelTimes[from][to] || 0) : 0;
}

/**
 * 计算订单任务链的结束时间（返回工厂的整个过程结束时间）
 */
function calculateTaskChainEndTime(order) {
    const startLocation = '工厂'; 
    const startTimeMinutes = timeToMinutes(order.orderTime);
    
    // 确保 orderLocation 存在
    const destination = order.orderLocation || '工厂'; 
    
    let driveToLocationTime = getTravelTime(startLocation, destination);
    let arrivalAtLocationTime = startTimeMinutes + driveToLocationTime;
    
    const processingTime = 30; // 30 分钟手续时间
    let taskFinishTime = arrivalAtLocationTime + processingTime;
    
    let returnToFactoryTime = getTravelTime(destination, '工厂');
    
    let taskChainEndTime = taskFinishTime + returnToFactoryTime;

    return taskChainEndTime;
}


// ==========================================================
// 4. 冲突检测函数
// ==========================================================

function checkNoConflict(employeeKey, newOrder, existingOrders = null) {
    const employee = employees[employeeKey];
    if (!employee) return false;

    // 确保获取到的订单列表是可迭代的
    const allOrders = existingOrders !== null ? existingOrders : Object.values(orders);

    const currentOrders = allOrders
        .filter(o => o.employeeKey === employeeKey)
        .sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime));

    const shiftStart = timeToMinutes(employee.startTime);
    const shiftEnd = timeToMinutes(employee.endTime);

    const newTaskStartTime = timeToMinutes(newOrder.orderTime);
    const newTaskEndTime = calculateTaskChainEndTime(newOrder);

    // 1. 检查新任务是否超出班次
    if (newTaskStartTime < shiftStart || newTaskEndTime > shiftEnd) {
        return false;
    }

    // 2. 检查任务链冲突
    // 将新任务插入到现有任务列表中（用于检查新任务前后的时间差）
    const combinedOrders = [...currentOrders, newOrder].sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime));
    
    for (let i = 0; i < combinedOrders.length; i++) {
        const currentTask = combinedOrders[i];
        
        if (i > 0) {
            const previousTask = combinedOrders[i - 1];
            
            const previousTaskReturnTime = calculateTaskChainEndTime(previousTask);
            const currentTaskStartTime = timeToMinutes(currentTask.orderTime);
            
            // 检查前一个任务返回工厂的时间是否晚于当前任务的开始时间
            if (previousTaskReturnTime > currentTaskStartTime) {
                return false;
            }
        }
    }

    return true; 
}

// ==========================================================
// 5. 自动排班功能 (贪婪算法 Demo)
// ==========================================================

function autoSchedule() {
    const unassignedOrders = Object.entries(orders)
                                     .filter(([key, data]) => !data.employeeKey)
                                     .map(([key, data]) => ({ key, ...data }))
                                     .sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime));
    
    if (unassignedOrders.length === 0) {
        alert('没有待分配的订单需要自动排班。');
        return;
    }
    
    const employeeKeys = Object.keys(employees);
    const updates = {};
    let assignedCount = 0;

    unassignedOrders.forEach(order => {
        for (const employeeKey of employeeKeys) {
            
            // 使用内存中的 orders 状态进行检查
            if (checkNoConflict(employeeKey, order)) {
                
                updates[`orders/${order.key}/employeeKey`] = employeeKey;
                assignedCount++;
                
                // 虚拟地更新内存中的 order，确保后续订单的冲突检查是基于最新的调度状态
                order.employeeKey = employeeKey; 
                // 重点：更新全局 orders 对象，让 checkNoConflict 在下一次循环时能看到这个分配
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
        alert('没有找到合适的员工来分配剩余的订单，可能是时间冲突或超出班次。');
    }
}


// ==========================================================
// 6. UI 渲染和事件绑定 (车辆和甘特图)
// ==========================================================

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }

    // 记住当前页面ID
    localStorage.setItem('currentPage', pageId); 

    document.querySelectorAll('nav button').forEach(button => {
        button.classList.remove('active');
    });
    const navButton = document.getElementById(`nav-${pageId.split('-')[0]}`);
    if (navButton) {
        navButton.classList.add('active');
    }

    if (pageId === 'personnel-scheduling') {
        renderEmployeeSchedule();
    }
}

let currentGanttMonth = new Date(); 

function changeGanttMonth(delta) {
    currentGanttMonth.setMonth(currentGanttMonth.getMonth() + delta);
    renderGanttChart();
}

/**
 * 新增车辆函数
 */
function addNewCar() {
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
        '上次点检日期': new Date().toISOString().substring(0, 10), // 默认今天
        '点检提醒': '正常'
    };
    
    // 使用 'new' 键调用 saveCar，会在 Firebase 中创建一个新的唯一 ID
    saveCar('new', newCarData); 
}


function renderCarTable() {
    const tableBody = document.querySelector('#car-table tbody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    
    const fields = [
        '代称', '车牌', '颜色', '基本信息', '状态', '当前地点', 
        '订单ID', '下一动作', '已清洗', '上次点检日期', '点检提醒'
    ];
    
    Object.keys(cars).forEach(carKey => {
        const car = cars[carKey];
        const row = tableBody.insertRow();
        row.dataset.key = carKey; 
        
        fields.forEach(field => {
            const cell = row.insertCell();
            let value = car[field] || '';
            cell.textContent = value;
            // 只有特定字段可编辑
            if (['代称', '车牌', '颜色', '基本信息', '状态', '当前地点', '订单ID', '下一动作', '已清洗', '上次点检日期', '点检提醒'].includes(field)) {
                cell.contentEditable = true; 
                cell.dataset.field = field;
            }
        });

        const reminderCell = row.cells[10];
        if (reminderCell && reminderCell.textContent.includes('过期')) { 
             reminderCell.classList.add('maintenance-required');
        } else if (reminderCell) {
             reminderCell.classList.remove('maintenance-required');
        }

        const actionCell = row.insertCell();
        actionCell.contentEditable = false;
        actionCell.innerHTML = `<button onclick="deleteCar('${carKey}')" title="删除车辆"><i class="fas fa-trash"></i></button>`;
    });

    tableBody.querySelectorAll('td[contenteditable="true"]').forEach(cell => {
        cell.addEventListener('blur', (event) => {
            const key = event.target.closest('tr').dataset.key;
            const field = event.target.dataset.field;
            const newValue = event.target.textContent;
            saveCar(key, { [field]: newValue }); 
        });
    });
}


function renderGanttChart() {
    const container = document.getElementById('gantt-chart-container');
    const display = document.getElementById('gantt-month-display');
    if (!container || !display) return;
    
    const year = currentGanttMonth.getFullYear();
    const month = currentGanttMonth.getMonth(); // 0-11
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().substring(0, 10); 

    display.textContent = `${year}年${month + 1}月`;

    let html = '<table class="gantt-table"><thead><tr><th style="min-width: 150px;">车辆代称</th>';
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        html += `<th class="${dateStr === todayStr ? 'today-col' : ''}">${i}</th>`;
    }
    html += '</tr></thead><tbody>';

    Object.keys(cars).forEach(carKey => {
        const car = cars[carKey];
        html += `<tr><td>${car['代称']} (${car['车牌']})</td>`;
        
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(year, month, i);
            date.setHours(0, 0, 0, 0); 
            const dateStr = date.toISOString().substring(0, 10);

            let classList = dateStr === todayStr ? 'today-col' : '';
            let content = '';
            let title = `${dateStr} - ${car['代称']}`;
            
            Object.values(orders).forEach(order => {
                if (order.orderCarId === carKey && order.orderStartDate && order.orderEndDate) {
                    // 使用 Date.parse 安全地处理日期字符串
                    const startMs = Date.parse(order.orderStartDate);
                    const endMs = Date.parse(order.orderEndDate);
                    const currentDayMs = date.getTime();
                    
                    if (!isNaN(startMs) && !isNaN(endMs) && currentDayMs >= startMs && currentDayMs <= endMs) {
                        classList += ' reserved-day';
                        content = content || order.orderId; 
                        title += `\n预定: ${order.orderId} (${order.orderType}) 到 ${order.orderLocation}`;
                        
                        if (currentDayMs === startMs) {
                            classList += ' start-day'; 
                        }
                        if (currentDayMs === endMs) {
                            classList += ' end-day'; 
                        }
                    }
                }
            });

            html += `<td class="${classList.trim()}" title="${title}"><span>${content}</span></td>`;
        }
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function populateCarDropdown() {
    const select = document.getElementById('order-car-id');
    if (!select) return;

    const selectedValue = select.value; 
    select.innerHTML = '<option value="" disabled selected>--- 分配车辆 (可选) ---</option>';

    Object.keys(cars).forEach(carKey => {
        const car = cars[carKey];
        const option = document.createElement('option');
        option.value = carKey;
        // 使用问号 ?. 操作符避免 car 字段为空导致的错误
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


// --- 员工排班渲染和拖拽逻辑 ---
function renderEmployeeSchedule() {
    const unassignedContainer = document.getElementById('unassigned-orders');
    const scheduleContainer = document.getElementById('employee-schedule-container');
    if (!unassignedContainer || !scheduleContainer) return;

    unassignedContainer.innerHTML = '<h4>待分配订单 (拖入员工窗口)</h4>';
    scheduleContainer.innerHTML = '';

    // 确保 orders 变量是一个对象，避免 Object.entries 报错
    const allOrders = Object.entries(orders || {}).map(([key, data]) => ({ key, ...data }));
    const unassignedOrders = allOrders.filter(o => !o.employeeKey);
    const assignedOrders = allOrders.filter(o => o.employeeKey);

    unassignedOrders
        .sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime)) 
        .forEach(order => {
            unassignedContainer.appendChild(createOrderCard(order));
        });
    
    Object.keys(employees || {}).forEach(employeeKey => {
        const employee = employees[employeeKey];
        if (!employee) return; // 避免 null 员工导致报错

        const window = document.createElement('div');
        window.className = 'employee-window';
        window.dataset.employeeKey = employeeKey;
        
        window.innerHTML = `
            <h4>
                ${employee.name} 
                (${employee.startTime}-${employee.endTime})
                <i class="fas fa-user-minus" onclick="deleteEmployee('${employeeKey}')" title="删除员工"></i>
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
    checkAllEmployeeConflicts(); 
}

function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.draggable = true;
    card.dataset.orderKey = order.key;
    
    const endTimeMinutes = calculateTaskChainEndTime(order);
    const endTimeStr = formatTime(endTimeMinutes);

    // 健壮性检查：确保 cars[order.orderCarId] 存在
    const carName = order.orderCarId && cars[order.orderCarId] ? cars[order.orderCarId]['代称'] : '未分配';

    card.innerHTML = `
        <strong>${order.orderId} - ${order.orderType}</strong>: ${order.orderTime} @ ${order.orderLocation}
        <div class="car-details">
            车辆: ${carName} | ${order.orderStartDate}
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

function deleteOrder(orderKey) {
    if (orders[orderKey] && confirm(`确定要删除订单 ${orders[orderKey].orderId} 吗？`)) {
        dbRefs.orders.child(orderKey).remove();
    }
}

function deleteEmployee(employeeKey) {
    const employee = employees[employeeKey];
    if (employee && confirm(`确定要删除员工 ${employee.name} 吗？同时所有分配给TA的订单将变为待分配！`)) {
        const updates = {};
        Object.keys(orders).forEach(orderKey => {
            if (orders[orderKey].employeeKey === employeeKey) {
                updates[`orders/${orderKey}/employeeKey`] = null;
            }
        });
        
        updates[`employees/${employeeKey}`] = null;
        
        database.ref().update(updates)
            .catch(error => console.error("Error batch updating data:", error));
    }
}

let draggedOrderKey = null;

function setupDragAndDrop() {
    document.querySelectorAll('.order-card').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            draggedOrderKey = e.target.dataset.orderKey;
            e.target.classList.add('dragging');
        });

        card.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging');
            draggedOrderKey = null;
        });
    });

    document.querySelectorAll('.employee-window, #unassigned-orders').forEach(window => {
        window.addEventListener('dragover', (e) => {
            e.preventDefault(); 
            window.classList.add('drop-target-active');
        });

        window.addEventListener('dragleave', (e) => {
            window.classList.remove('drop-target-active');
        });

        window.addEventListener('drop', (e) => {
            e.preventDefault();
            window.classList.remove('drop-target-active');

            if (draggedOrderKey) {
                let newEmployeeKey = e.currentTarget.dataset.employeeKey || null; 
                
                // 优化：在更新前检查冲突 (仅针对分配给员工的操作)
                if (newEmployeeKey) {
                     const orderToAssign = orders[draggedOrderKey];
                     if (orderToAssign && !checkNoConflict(newEmployeeKey, orderToAssign)) {
                         alert("🔴 冲突警告：该订单与员工现有任务或班次时间冲突！请手动调整。");
                         return; // 阻止更新
                     }
                }
                
                dbRefs.orders.child(draggedOrderKey).update({ employeeKey: newEmployeeKey })
                    .catch(error => {
                        console.error("Error updating order:", error);
                    });
            }
        });
    });
}

function checkEmployeeConflict(employeeKey) {
    const employeeWindow = document.querySelector(`.employee-window[data-employee-key="${employeeKey}"]`);
    const conflictAlert = employeeWindow?.querySelector('.conflict-alert');
    if (!employeeWindow || !conflictAlert) return;

    const employee = employees[employeeKey];
    const shiftStart = timeToMinutes(employee.startTime);
    const shiftEnd = timeToMinutes(employee.endTime);

    const employeeOrders = Object.values(orders || {}).filter(o => o.employeeKey === employeeKey)
                                                         .sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime));
    
    let isConflict = false;
    let conflictDetails = [];

    for (let i = 0; i < employeeOrders.length; i++) {
        const currentOrder = employeeOrders[i];
        const currentTaskStartTime = timeToMinutes(currentOrder.orderTime);
        const currentTaskEndTime = calculateTaskChainEndTime(currentOrder);
        
        // 1. 检查班次冲突
        if (currentTaskStartTime < shiftStart) {
            isConflict = true;
            conflictDetails.push(`🔴 订单 ${currentOrder.orderId} (始: ${formatTime(currentTaskStartTime)}) 早于班次开始 (${employee.startTime})`);
        }
        if (currentTaskEndTime > shiftEnd) {
             isConflict = true;
            conflictDetails.push(`🔴 订单 ${currentOrder.orderId} (终: ${formatTime(currentTaskEndTime)}) 晚于班次结束 (${employee.endTime})`);
        }
        
        // 2. 检查任务链冲突 (与下一个任务)
        if (i < employeeOrders.length - 1) {
            const nextOrder = employeeOrders[i + 1];
            const nextTaskStartTime = timeToMinutes(nextOrder.orderTime);
            const currentTaskReturnTime = calculateTaskChainEndTime(currentOrder);
            
            if (currentTaskReturnTime > nextTaskStartTime) {
                isConflict = true;
                conflictDetails.push(`💥 冲突: ${currentOrder.orderId} (终: ${formatTime(currentTaskReturnTime)}) 晚于 ${nextOrder.orderId} (始: ${nextTaskStartTime})`);
            }
        }
    }

    if (isConflict) {
        employeeWindow.classList.add('schedule-conflict');
        conflictAlert.style.display = 'block';
        conflictAlert.innerHTML = conflictDetails.join('<br>');
    } else {
        employeeWindow.classList.remove('schedule-conflict');
        conflictAlert.style.display = 'none';
        conflictAlert.innerHTML = '';
    }
}

function checkAllEmployeeConflicts() {
    Object.keys(employees).forEach(checkEmployeeConflict);
}


// ==========================================================
// 7. CSV 日报下载功能 (取代原来的 TXT 格式)
// ==========================================================
// ==========================================================
// 5. CSV 日报下载功能 (最终 Base64 Data URI 尝试，确保 UTF-8 BOM 注入)
// ==========================================================

function downloadTodaySummary() {
    const todayStr = new Date().toISOString().substring(0, 10);
    const COMMA = ",";
    const NEWLINE = "\n"; 

    // --- 1. CSV 内容生成 (使用 COMMA 分隔) ---
    // 故意移除 sep=, 行，只依赖 BOM
    let csvContent = ""; 

    // 通用函数：安全地处理和连接数据
    const safeJoin = (arr) => arr.map(item => {
        // 确保是字符串，转义双引号，并用双引号包裹，以处理包含逗号的数据
        let str = (item + "").replace(/"/g, '""');
        return `"${str}"`; 
    }).join(COMMA) + NEWLINE;

    // 1. 车辆状态概览部分 (Car Status)
    csvContent += "--- 车辆状态概览 ---" + NEWLINE;
    csvContent += safeJoin(["代称", "车牌", "颜色", "状态", "当前地点", "上次点检日期", "点检提醒"]);
    
    const carFields = ['代称', '车牌', '颜色', '状态', '当前地点', '上次点检日期', '点检提醒'];
    
    Object.keys(cars).forEach(carKey => {
        const car = cars[carKey];
        const row = carFields.map(field => car[field] || '');
        csvContent += safeJoin(row);
    });
    
    csvContent += NEWLINE; 
    
    // 2. 人员排班部分 (Employee Schedule)
    csvContent += "--- 今日人员排班 ---" + NEWLINE;
    csvContent += safeJoin(["员工", "班次", "订单ID", "订单类型", "开始时间", "预估返回工厂时间", "地点", "分配车辆", "订单备注"]);
    
    Object.keys(employees).forEach(employeeKey => {
        const employee = employees[employeeKey];
        const employeeOrders = Object.values(orders || {})
            .filter(o => o.employeeKey === employeeKey)
            .sort((a, b) => timeToMinutes(a.orderTime) - timeToMinutes(b.orderTime));

        if (employeeOrders.length === 0) {
            csvContent += safeJoin([employee.name, `${employee.startTime}-${employee.endTime}`, "", "", "", "", "", "", ""]);
        } else {
            employeeOrders.forEach(order => {
                const endTime = calculateTaskChainEndTime(order); 
                const carName = order.orderCarId && cars[order.orderCarId] ? cars[order.orderCarId]['代称'] : '无';

                const row = [
                    employee.name,
                    `${employee.startTime}-${employee.endTime}`,
                    order.orderId || '',
                    order.orderType || '',
                    order.orderTime || '',
                    endTime,
                    order.orderLocation || '',
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
        csvContent += safeJoin(["订单ID", "订单类型", "开始时间", "地点", "所需车辆", "订单备注"]);
        
        unassignedOrders.forEach(order => {
            const carName = order.orderCarId && cars[order.orderCarId] ? cars[order.orderCarId]['代称'] : '未分配';
            
            const row = [
                order.orderId || '',
                order.orderType || '',
                order.orderTime || '',
                order.orderLocation || '',
                carName,
                order.notes || ''
            ];
            csvContent += safeJoin(row);
        });
    }

    // --- 2. 最终下载 (Data URI with BOM) ---
    
    // 步骤 A: 添加 UTF-8 BOM 字符
    const BOM_CHAR = "\uFEFF"; 
    const finalContentWithBOM = BOM_CHAR + csvContent;

    // 步骤 B: 编码并创建 Data URI
    // 使用 encodeURIComponent 编码数据，确保 Data URI 有效
    const encodedData = encodeURIComponent(finalContentWithBOM);
    const dataUri = `data:text/csv;charset=utf-8,${encodedData}`;

    // 步骤 C: 触发下载
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = `sakura_schedule_summary_${todayStr}.csv`; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================================
// 10. 初始化和事件绑定
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
    setupDataListeners();
    
    // 绑定主要导航按钮
    document.getElementById('nav-car')?.addEventListener('click', () => showPage('car-management'));
    document.getElementById('nav-schedule')?.addEventListener('click', () => showPage('personnel-scheduling'));
    
    // 绑定新增车辆按钮 (已启用)
    document.getElementById('add-car-btn')?.addEventListener('click', addNewCar); 

    // 绑定排班管理按钮
    document.getElementById('auto-schedule-btn')?.addEventListener('click', autoSchedule);
    document.getElementById('download-summary-btn')?.addEventListener('click', downloadTodaySummary);

    // 绑定甘特图控制按钮
    document.getElementById('prev-month-btn')?.addEventListener('click', () => changeGanttMonth(-1));
    document.getElementById('next-month-btn')?.addEventListener('click', () => changeGanttMonth(1));

    // 绑定表单提交（订单）
    document.getElementById('order-form')?.addEventListener('submit', function(e) {
        // 阻止默认提交，解决订单提交后跳到顶部的问题
        e.preventDefault(); 
        
        const startDate = document.getElementById('order-start-date').value;
        const endDate = document.getElementById('order-end-date').value;
        if (new Date(startDate) > new Date(endDate)) {
            alert('租借结束日期不能早于开始日期！');
            return;
        }

        const newOrder = {
            orderId: document.getElementById('order-id').value,
            orderType: document.getElementById('order-type').value,
            orderLocation: document.getElementById('order-location').value,
            orderTime: document.getElementById('order-time').value,
            orderCarId: document.getElementById('order-car-id').value || null, 
            orderStartDate: startDate,
            orderEndDate: endDate,
            babySeat: document.getElementById('order-baby-seat').checked,
            needsPayment: document.getElementById('order-needs-payment').checked,
            notes: document.getElementById('order-notes').value,
            employeeKey: null 
        };

        saveOrder(newOrder);
        this.reset();
        alert('订单已提交并保存到 Firebase！');
    });

    // 绑定表单提交（员工）
    document.getElementById('employee-form')?.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const newEmployee = {
            name: document.getElementById('employee-name').value,
            startTime: document.getElementById('employee-start').value,
            endTime: document.getElementById('employee-end').value,
        };
        saveEmployee('new', newEmployee);
        this.reset();
    });

    // 初始化时读取上次页面ID
    const lastPageId = localStorage.getItem('currentPage');

    if (lastPageId) {
        showPage(lastPageId); // 跳转到上次访问的页面
    } else {
        showPage('car-management'); // 默认显示车辆管理页面
    }
});