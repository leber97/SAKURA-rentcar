// ==========================================================
// 1. 数据存储与初始化
// ==========================================================

const DATA_KEY = 'rentacarSystemData';
const TASK_DURATION_MINUTES = 30; // 任务操作时间常量（分钟）
const BUFFER_MINUTES = 15; // 任务间隙缓冲时间（分钟）

let appData = {
    cars: [
        // 车辆数据结构：新增 licensePlate, color, 订单相关状态
        { id: 'C001', alias: '小黑', licensePlate: '京A8888', color: '黑', info: '丰田卡罗拉', status: '在库', orderId: null, nextAction: '在库', location: '本社工厂', isClean: true, lastCheckDate: '2025-09-10' },
        { id: 'C002', alias: '小白', licensePlate: '沪B6666', color: '白', info: '本田思域', status: '在库', orderId: null, nextAction: '在库', location: '本社工厂', isClean: false, lastCheckDate: '2025-07-20' }, 
        { id: 'C003', alias: '商务之星', licensePlate: '粤C1234', color: '灰', info: '丰田海狮', status: '维修', orderId: null, nextAction: '维修', location: '本社工厂', isClean: true, lastCheckDate: '2025-10-01' }
    ],
    employees: [
        { id: 'E101', name: '佐藤', start: '09:00', end: '18:00' },
        { id: 'E102', name: '田中', start: '10:00', end: '19:00' }
    ],
    orders: [
        // 订单数据结构：新增 carId, details (babySeat, needsPayment), startTime, endTime
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

/**
 * 从 localStorage 加载数据，如果不存在则使用默认值。
 */
function loadData() {
    const json = localStorage.getItem(DATA_KEY);
    if (json) {
        const loadedData = JSON.parse(json);
        appData.cars = loadedData.cars || [];
        appData.employees = loadedData.employees || [];
        appData.orders = loadedData.orders || [];
        appData.travelTimes = loadedData.travelTimes || appData.travelTimes; // 尝试加载 travelTimes
    }
}

/**
 * 将当前数据保存到 localStorage。
 */
function saveData() {
    localStorage.setItem(DATA_KEY, JSON.stringify(appData));
}

// ==========================================================
// 2. 页面导航与初始化
// ==========================================================

/**
 * 切换显示界面
 */
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');

    document.querySelectorAll('nav button').forEach(btn => {
        btn.classList.remove('active');
    });
    const navId = pageId.includes('car') ? 'nav-car' : 'nav-schedule';
    document.getElementById(navId).classList.add('active');

    if (pageId === 'car-management') {
        renderCars();
        renderGanttChart(); // 使用新的甘特图渲染
    } else if (pageId === 'personnel-scheduling') {
        renderCarOptions(); // 填充车辆选项
        renderScheduling();
    }
}

// ==========================================================
// 3. 车辆管理逻辑 (CRUD & 甘特图)
// ==========================================================

let currentGanttMonth = new Date(); 

function changeGanttMonth(offset) {
    currentGanttMonth.setMonth(currentGanttMonth.getMonth() + offset);
    renderGanttChart();
}

/**
 * 计算两个月前的日期
 */
function getTwoMonthsAgo() {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    d.setHours(0, 0, 0, 0); 
    return d;
}

/**
 * 更新车辆的 orderId 和 nextAction 状态
 */
function updateCarAssignment(carId, orderId, orderType) {
    const car = appData.cars.find(c => c.id === carId);
    if (car) {
        car.orderId = orderId;
        if (orderId) {
            car.nextAction = (orderType === '送车') ? '待出车' : '待接车';
            car.status = '订单占用';
        } else {
            car.nextAction = '在库';
            car.status = '在库';
        }
    }
}

/**
 * 渲染车辆表格
 */
function renderCars() {
    const tableBody = document.querySelector('#car-table tbody');
    tableBody.innerHTML = '';
    const twoMonthsAgo = getTwoMonthsAgo();

    appData.cars.forEach(car => {
        const row = tableBody.insertRow();
        row.dataset.carId = car.id;

        // 可编辑字段：新增 licensePlate, color
        const editableFields = ['alias', 'licensePlate', 'color', 'info', 'status', 'location']; 
        editableFields.forEach(field => {
            const cell = row.insertCell();
            cell.textContent = car[field] || '';
            cell.contentEditable = true;
            cell.dataset.field = field;
            cell.addEventListener('blur', updateCarFromRow);
        });

        // 订单 ID
        const orderIdCell = row.insertCell();
        orderIdCell.textContent = car.orderId || '-';
        orderIdCell.title = car.orderId ? `被订单 ${car.orderId} 占用` : '空闲';
        
        // 下一动作
        const nextActionCell = row.insertCell();
        nextActionCell.textContent = car.nextAction || '在库';

        // 已清洗 (Checkbox)
        const cleanCell = row.insertCell();
        const cleanCheckbox = document.createElement('input');
        cleanCheckbox.type = 'checkbox';
        cleanCheckbox.checked = car.isClean;
        cleanCheckbox.addEventListener('change', (e) => {
            const currentCar = appData.cars.find(c => c.id === car.id);
            if (currentCar) {
                currentCar.isClean = e.target.checked;
                saveData();
            }
        });
        cleanCell.appendChild(cleanCheckbox);

        // 上次点检日期
        const dateCell = row.insertCell();
        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.value = car.lastCheckDate || '';
        dateInput.addEventListener('change', (e) => {
            const currentCar = appData.cars.find(c => c.id === car.id);
            if (currentCar) {
                currentCar.lastCheckDate = e.target.value;
                renderCars(); 
                saveData();
            }
        });
        dateCell.appendChild(dateInput);

        // 点检提醒 (保留原有逻辑)
        const reminderCell = row.insertCell();
        const checkDate = car.lastCheckDate ? new Date(car.lastCheckDate) : null;
        let needsMaintenance = false;
        if (checkDate) {
            checkDate.setHours(0, 0, 0, 0); 
            if (checkDate < twoMonthsAgo) {
                needsMaintenance = true;
            }
        } else {
            needsMaintenance = true; 
        }

        if (needsMaintenance) {
            reminderCell.textContent = '❗需点检';
            reminderCell.classList.add('maintenance-required');
        } else {
            reminderCell.textContent = '正常';
            reminderCell.classList.remove('maintenance-required');
        }

        // 操作 (删除按钮)
        const actionCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.onclick = () => deleteCar(car.id);
        actionCell.appendChild(deleteBtn);
    });
}

/**
 * 添加一个空白的可编辑行
 */
function addNewCarRow() {
    const newCar = {
        id: 'C' + Date.now(),
        alias: '新车代号',
        licensePlate: '未定',
        color: '未知',
        info: '车辆信息',
        status: '在库',
        orderId: null,
        nextAction: '在库',
        location: '工厂',
        isClean: false,
        lastCheckDate: new Date().toISOString().substring(0, 10)
    };
    appData.cars.unshift(newCar);
    saveData();
    renderCars();
}

/**
 * 表格单元格失去焦点时更新车辆信息
 */
function updateCarFromRow(event) {
    const cell = event.target;
    const row = cell.closest('tr');
    const carId = row.dataset.carId;
    const field = cell.dataset.field;
    const newValue = cell.textContent.trim();

    const car = appData.cars.find(c => c.id === carId);
    if (car && car[field] !== newValue) {
        car[field] = newValue;
        saveData();
    }
}

/**
 * 删除车辆
 */
function deleteCar(id) {
    if (confirm('确定要删除这辆车吗？')) {
        appData.cars = appData.cars.filter(car => car.id !== id);
        saveData();
        renderCars();
    }
}

/**
 * 渲染车辆甘特图 (新逻辑)
 */
function renderGanttChart() {
    const container = document.getElementById('gantt-chart-container');
    const monthDisplay = document.getElementById('gantt-month-display');
    container.innerHTML = '';

    const year = currentGanttMonth.getFullYear();
    const month = currentGanttMonth.getMonth();
    const monthName = currentGanttMonth.toLocaleString('zh-CN', { year: 'numeric', month: 'long' });
    monthDisplay.textContent = monthName;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
    const todayDay = isCurrentMonth ? today.getDate() : -1;

    const table = document.createElement('table');
    table.classList.add('gantt-table');

    // 1. 表头：日期
    const headerRow = table.insertRow();
    headerRow.insertCell().textContent = '车辆 / ID';
    for (let i = 1; i <= daysInMonth; i++) {
        const cell = headerRow.insertCell();
        cell.textContent = i;
        if (i === todayDay) {
            cell.classList.add('today-col');
        }
    }

    // 2. 身体：车辆排期
    appData.cars.forEach(car => {
        const row = table.insertRow();
        const carNameCell = row.insertCell();
        carNameCell.innerHTML = `
            <strong>${car.alias}</strong><br>
            <small>${car.licensePlate}</small>
        `;

        const carOrders = appData.orders.filter(
            order => order.carId === car.id && order.startTime && order.endTime
        );
        
        let dailyStatus = new Array(daysInMonth).fill(null);

        carOrders.forEach(order => {
            const start = new Date(order.startTime);
            const end = new Date(order.endTime);

            // 检查订单是否在当前月
            const startDay = (start.getMonth() === month && start.getFullYear() === year) 
                ? start.getDate() : 1;
            const endDay = (end.getMonth() === month && end.getFullYear() === year) 
                ? end.getDate() : daysInMonth;

            // 标记占用日期
            for (let i = Math.max(1, startDay); i <= Math.min(daysInMonth, endDay); i++) {
                // 仅当订单在月份内时才标记
                if (new Date(year, month, i) >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) && 
                    new Date(year, month, i) <= new Date(end.getFullYear(), end.getMonth(), end.getDate())) {
                    dailyStatus[i - 1] = order;
                }
            }
        });

        // 渲染单元格
        dailyStatus.forEach((order, index) => {
            const cell = row.insertCell();
            const day = index + 1;

            if (day === todayDay) {
                cell.classList.add('today-cell');
            }

            if (order) {
                cell.classList.add('reserved-day');
                cell.title = `订单: ${order.id} | 地点: ${order.location}`;
                cell.textContent = order.id.substring(1); 
                
                const orderStartDay = new Date(order.startTime).getDate();
                const orderEndDay = new Date(order.endTime).getDate();

                if (day === orderStartDay) cell.classList.add('start-day');
                if (day === orderEndDay) cell.classList.add('end-day');

            } else {
                cell.textContent = 'O'; 
            }
        });
    });

    container.appendChild(table);
}
// 确保函数在全局范围内可用
window.renderMonthlyView = renderGanttChart; 
window.renderGanttChart = renderGanttChart; 
window.changeGanttMonth = changeGanttMonth;

// ==========================================================
// 4. 人员排班逻辑 (员工, 订单, 排班算法)
// ==========================================================

/**
 * 获取 A 地点到 B 地点的车程 (分钟)
 */
function getTravelTime(locA, locB) {
    if (locA === locB) return 0;
    const key1 = `${locA}-${locB}`;
    const key2 = `${locB}-${locA}`;
    return appData.travelTimes[key1] || appData.travelTimes[key2] || 60; 
}

/**
 * 转换时间字符串为分钟数 (例如 "10:30" -> 630)
 */
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0; 
    const [hours, minutes] = parts.map(Number);
    return hours * 60 + minutes;
}

/**
 * 转换分钟数回时间字符串 (例如 630 -> "10:30")
 */
function minutesToTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * 填充订单表单中的车辆选项
 */
function renderCarOptions() {
    const select = document.getElementById('order-car-id');
    select.innerHTML = '<option value="" disabled selected>--- 分配车辆 (可选) ---</option>';

    // 只显示在库或已分配给自己订单的车辆
    appData.cars.filter(car => car.status !== '维修' && !car.orderId).forEach(car => {
        const option = document.createElement('option');
        option.value = car.id;
        option.textContent = `${car.alias} (${car.licensePlate}) - ${car.info}`;
        select.appendChild(option);
    });
}

/**
 * 渲染排班界面 (员工窗口和订单)
 */
function renderScheduling() {
    const scheduleContainer = document.getElementById('employee-schedule-container');
    const unassignedContainer = document.getElementById('unassigned-orders');
    scheduleContainer.innerHTML = '';
    unassignedContainer.innerHTML = '<h4>待分配订单 (拖入员工窗口)</h4>';

    // 1. 渲染员工窗口
    appData.employees.forEach(emp => {
        const window = document.createElement('div');
        window.className = 'employee-window';
        window.dataset.employeeId = emp.id;
        window.innerHTML = `<h4>${emp.name} (${emp.start}-${emp.end}) <i class="fas fa-user-minus" onclick="deleteEmployee('${emp.id}')"></i></h4>`;
        
        window.addEventListener('dragover', dragOver);
        window.addEventListener('dragleave', dragLeave);
        window.addEventListener('drop', dropOrder);

        // 2. 渲染已分配给该员工的订单并计算任务链
        const assignedOrders = appData.orders.filter(order => order.assignedTo === emp.id)
            .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

        let lastLocation = '本社工厂'; 
        let lastAvailableTime = timeToMinutes(emp.start);
        let conflictExists = false; 
        window.classList.remove('schedule-conflict', 'schedule-overtime'); 

        assignedOrders.forEach(order => {
            const travelTime = getTravelTime(lastLocation, order.location);
            const orderTargetTime = timeToMinutes(order.time);
            
            const expectedArrival = lastAvailableTime + travelTime + BUFFER_MINUTES;
            const actualStart = Math.max(orderTargetTime, expectedArrival);
            const taskFinishTime = actualStart + TASK_DURATION_MINUTES;

            // 冲突检测
            let conflict = false;
            if (actualStart > orderTargetTime + 15) { 
                conflict = true;
            }
            if (taskFinishTime > timeToMinutes(emp.end)) {
                conflict = true;
                window.classList.add('schedule-overtime');
            }

            if (conflict) {
                window.classList.add('schedule-conflict');
                conflictExists = true;
            }

            const card = createOrderCard(order);
            const delayTime = actualStart > orderTargetTime ? actualStart - orderTargetTime : 0;

            card.innerHTML += `
                <div class="task-chain-info">
                    <span class="${delayTime > 0 ? 'conflict-text' : ''}">
                        🚗 ${minutesToTime(travelTime)}m 
                        ${delayTime > 0 ? ` (+${delayTime}m 迟到)` : ''}
                        <br>
                        @ ${minutesToTime(actualStart)} 
                        <i class="fas fa-arrow-right"></i>
                        ✅ ${minutesToTime(taskFinishTime)}
                    </span>
                </div>
            `;
            
            window.appendChild(card);
            
            lastLocation = order.location;
            lastAvailableTime = taskFinishTime;
        });

        // 3. 提示冲突状态
        if (conflictExists) {
            window.insertAdjacentHTML('afterbegin', '<div class="conflict-alert">⚠️ 排班冲突/任务迟到</div>');
        } else if (assignedOrders.length > 0) {
            window.insertAdjacentHTML('beforeend', `<p class="schedule-summary">当前结束于: ${minutesToTime(lastAvailableTime)} 在 ${lastLocation}</p>`);
        }
        
        scheduleContainer.appendChild(window);
    });

    // 4. 渲染未分配订单
    unassignedContainer.addEventListener('dragover', dragOver);
    unassignedContainer.addEventListener('dragleave', dragLeave);
    unassignedContainer.addEventListener('drop', dropOrder);
    
    appData.orders.filter(order => order.assignedTo === null)
        .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
        .forEach(order => {
            unassignedContainer.appendChild(createOrderCard(order));
        });
}

/**
 * 创建一个可拖拽的订单卡片 (增强版，新增编辑/删除按钮)
 */
function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.draggable = true;
    card.dataset.orderId = order.id;
    
    const carInfo = order.carId 
        ? appData.cars.find(c => c.id === order.carId)?.alias || '车辆缺失'
        : '未分配车';
        
    let detailsHtml = '';
    if (order.details) {
        if (order.details.babySeat) detailsHtml += '👶 ';
        if (order.details.needsPayment) detailsHtml += '💰 ';
    }
    
    card.innerHTML = `
        <div class="order-actions">
            <i class="fas fa-edit" title="编辑订单" onclick="editOrder('${order.id}', event)"></i>
            <i class="fas fa-trash" title="删除订单" onclick="deleteOrder('${order.id}', event)"></i>
        </div>
        <i class="fas fa-hand-${order.type === '接车' ? 'down' : 'up'}"></i>
        <strong>${order.time}</strong> - ${order.type} ${order.location}
        <div class="car-details">
            ${detailsHtml}
            车辆: ${carInfo}
            <small>(${order.id}) | ${order.startTime} ~ ${order.endTime}</small>
        </div>
    `;
    card.addEventListener('dragstart', dragStart);
    return card;
}

/**
 * 编辑订单 (将订单数据填充回表单)
 */
function editOrder(orderId, event) {
    event.stopPropagation(); // 阻止触发拖拽
    const order = appData.orders.find(o => o.id === orderId);
    if (!order) return;

    // 填充表单
    document.getElementById('order-id').value = order.id;
    document.getElementById('order-id').readOnly = true; // 编辑时ID不可改
    
    document.getElementById('order-type').value = order.type;
    document.getElementById('order-location').value = order.location;
    document.getElementById('order-time').value = order.time;
    
    // 车辆和日期
    const carSelect = document.getElementById('order-car-id');
    const existingCarOption = carSelect.querySelector(`option[value="${order.carId}"]`);
    if (order.carId && !existingCarOption) {
        // 如果订单有车辆且该车辆不在“在库”列表，则临时添加该车辆选项
        const car = appData.cars.find(c => c.id === order.carId);
        if (car) {
             const tempOption = new Option(`${car.alias} (${car.licensePlate}) - ${car.info} (当前分配)`, car.id, true, true);
             carSelect.appendChild(tempOption);
             carSelect.value = car.id;
        }
    } else {
        carSelect.value = order.carId || '';
    }
    
    document.getElementById('order-start-date').value = order.startTime;
    document.getElementById('order-end-date').value = order.endTime;

    // 细节
    document.getElementById('order-baby-seat').checked = order.details.babySeat;
    document.getElementById('order-needs-payment').checked = order.details.needsPayment;
    document.getElementById('order-notes').value = order.notes;

    // 更改按钮文本
    const submitBtn = document.querySelector('#order-form button[type="submit"]');
    submitBtn.innerHTML = '<i class="fas fa-save"></i> 更新订单';
    submitBtn.onclick = (e) => updateOrder(e, orderId);
}

/**
 * 更新订单（替代新增订单的提交行为）
 */
function updateOrder(e, orderId) {
    e.preventDefault();

    const orderIndex = appData.orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;

    // 获取旧的车辆ID，以便在更新时解除其占用
    const oldCarId = appData.orders[orderIndex].carId;
    
    const newCarId = document.getElementById('order-car-id').value || null;
    
    // 更新订单数据
    appData.orders[orderIndex].type = document.getElementById('order-type').value;
    appData.orders[orderIndex].location = document.getElementById('order-location').value.trim();
    appData.orders[orderIndex].time = document.getElementById('order-time').value;
    appData.orders[orderIndex].notes = document.getElementById('order-notes').value.trim();
    appData.orders[orderIndex].carId = newCarId; 
    appData.orders[orderIndex].startTime = document.getElementById('order-start-date').value;
    appData.orders[orderIndex].endTime = document.getElementById('order-end-date').value;
    appData.orders[orderIndex].details = {
        babySeat: document.getElementById('order-baby-seat').checked,
        needsPayment: document.getElementById('order-needs-payment').checked,
        checkItems: ['油量', '外观']
    };

    // 1. 处理旧车辆状态（如果更改了车辆）
    if (oldCarId && oldCarId !== newCarId) {
        updateCarAssignment(oldCarId, null, null); 
    }
    // 2. 处理新车辆状态
    if (newCarId) {
        updateCarAssignment(newCarId, orderId, appData.orders[orderIndex].type);
    }
    
    saveData();
    // 恢复表单为新增状态
    document.getElementById('order-form').reset();
    document.getElementById('order-id').readOnly = false;
    document.querySelector('#order-form button[type="submit"]').innerHTML = '<i class="fas fa-paper-plane"></i> 提交订单';
    document.querySelector('#order-form button[type="submit"]').onclick = null; // 恢复默认提交

    renderCarOptions(); 
    renderScheduling();
    renderGanttChart();
    alert(`订单 ${orderId} 更新成功！`);
}

/**
 * 删除订单
 */
function deleteOrder(orderId, event) {
    event.stopPropagation(); // 阻止触发拖拽
    if (confirm(`确定要删除订单 ${orderId} 吗？`)) {
        const order = appData.orders.find(o => o.id === orderId);
        if (order && order.carId) {
            updateCarAssignment(order.carId, null, null); // 解除车辆占用
        }
        
        appData.orders = appData.orders.filter(o => o.id !== orderId);
        saveData();
        renderCarOptions();
        renderScheduling();
        renderGanttChart();
    }
}


// 添加新员工 (保留原有逻辑)
document.getElementById('employee-form')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('employee-name').value;
    const start = document.getElementById('employee-start').value;
    const end = document.getElementById('employee-end').value;

    const newEmployee = {
        id: 'E' + Date.now(),
        name: name,
        start: start,
        end: end,
    };

    appData.employees.push(newEmployee);
    saveData();
    renderScheduling();

    e.target.reset();
    document.getElementById('employee-start').value = '09:00';
    document.getElementById('employee-end').value = '18:00';
});

/**
 * 删除员工
 */
function deleteEmployee(id) {
    if (confirm('删除员工会将所有分配给他的订单设为待分配。确定删除吗？')) {
        appData.employees = appData.employees.filter(emp => emp.id !== id);
        appData.orders.forEach(order => {
            if (order.assignedTo === id) {
                order.assignedTo = null;
            }
        });
        saveData();
        renderScheduling();
    }
}

// 添加新订单 (更新逻辑：处理新增字段)
document.getElementById('order-form')?.addEventListener('submit', function(e) {
    e.preventDefault();

    const carId = document.getElementById('order-car-id').value || null;
    const startDate = document.getElementById('order-start-date').value;
    const endDate = document.getElementById('order-end-date').value;

    const newOrder = {
        id: document.getElementById('order-id').value.trim(), 
        type: document.getElementById('order-type').value,
        location: document.getElementById('order-location').value.trim(),
        time: document.getElementById('order-time').value,
        notes: document.getElementById('order-notes').value.trim(),
        assignedTo: null,
        carId: carId, // 新增
        details: { // 新增
            babySeat: document.getElementById('order-baby-seat').checked,
            needsPayment: document.getElementById('order-needs-payment').checked,
            checkItems: ['油量', '外观'] 
        },
        startTime: startDate, // 新增
        endTime: endDate // 新增
    };

    if (appData.orders.some(o => o.id === newOrder.id)) {
        alert(`订单号 ${newOrder.id} 已存在，请使用唯一的单号。`);
        return;
    }
    
    if (!newOrder.id || !newOrder.location || !newOrder.time || !newOrder.startTime || !newOrder.endTime) {
        alert('单号、地点、时间、起始日期和结束日期不能为空。');
        return;
    }

    appData.orders.push(newOrder);
    
    // 关键：如果分配了车辆，更新车辆状态
    if (carId) {
        updateCarAssignment(carId, newOrder.id, newOrder.type);
    }

    saveData();
    renderCarOptions(); // 刷新可用车辆列表
    renderScheduling(); 
    renderGanttChart();
    e.target.reset();
});

// ==========================================================
// 5. 自动排班算法 (启发式)
// ==========================================================

/**
 * 自动排班逻辑 (保留原有增强算法)
 */
function autoSchedule() {
    if (appData.employees.length === 0) {
        alert('请先添加出勤员工！');
        return;
    }
    
    // 1. 重置所有分配（保留车辆分配，只重置人员分配）
    appData.orders.forEach(order => order.assignedTo = null); 

    // 2. 初始化员工状态
    const employeeStates = appData.employees.map(emp => ({
        id: emp.id,
        name: emp.name,
        availableTime: timeToMinutes(emp.start), 
        currentLocation: '本社工厂', 
        endShiftTime: timeToMinutes(emp.end),
        schedule: []
    }));

    // 3. 订单按时间排序
    const sortedOrders = appData.orders.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    sortedOrders.forEach(order => {
        const orderTargetTime = timeToMinutes(order.time);
        let bestEmployee = null;
        let minPenalty = Infinity; 

        // 查找最佳员工
        employeeStates.forEach(emp => {
            
            const travelTime = getTravelTime(emp.currentLocation, order.location);
            const expectedArrival = emp.availableTime + travelTime + BUFFER_MINUTES; 
            const actualStart = Math.max(orderTargetTime, expectedArrival);
            const taskFinishTime = actualStart + TASK_DURATION_MINUTES;

            // 约束 A: 员工必须在下班前完成任务
            if (taskFinishTime > emp.endShiftTime) return; 

            // 计算惩罚值
            let penalty = 0;
            
            // 惩罚 1: 任务迟到
            const delay = actualStart - orderTargetTime;
            if (delay > 0) {
                penalty += delay * 2; 
            }
            
            // 惩罚 2: 员工空闲时间
            const idleTime = actualStart - emp.availableTime;
            penalty += idleTime; 
            
            // 选择最佳员工
            if (penalty < minPenalty) {
                minPenalty = penalty;
                bestEmployee = emp;
            }
        });

        // 4. 分配订单并更新员工状态
        if (bestEmployee) {
            const travelTime = getTravelTime(bestEmployee.currentLocation, order.location);
            const expectedArrival = bestEmployee.availableTime + travelTime + BUFFER_MINUTES;
            const actualStart = Math.max(orderTargetTime, expectedArrival);
            const taskFinishTime = actualStart + TASK_DURATION_MINUTES;

            order.assignedTo = bestEmployee.id;
            bestEmployee.availableTime = taskFinishTime;
            bestEmployee.currentLocation = order.location;
            bestEmployee.schedule.push(order);
        }
    });

    saveData();
    renderScheduling();

    const unassignedCount = appData.orders.filter(o => o.assignedTo === null).length;
    alert(`自动排班完成。共分配 ${appData.orders.length - unassignedCount} 个订单，有 ${unassignedCount} 个订单待分配。`);
}


// ==========================================================
// 6. 拖拽逻辑 (Drag and Drop)
// ==========================================================

let draggedOrderId = null;

function dragStart(e) {
    // 仅在非按钮区域开始拖拽
    if (e.target.closest('.order-actions')) {
        e.preventDefault();
        return;
    }
    draggedOrderId = e.target.dataset.orderId;
    e.dataTransfer.setData('text/plain', draggedOrderId);
    setTimeout(() => e.target.classList.add('dragging'), 0); 
}

function dragOver(e) {
    e.preventDefault();
    const target = e.currentTarget;
    if (target.classList.contains('employee-window') || target.id === 'unassigned-orders') {
        target.classList.add('drop-target-active');
    }
}

function dragLeave(e) {
    e.currentTarget.classList.remove('drop-target-active');
}

function dropOrder(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drop-target-active');
    
    const targetWindow = e.currentTarget;
    const targetEmployeeId = targetWindow.dataset.employeeId || null; 

    const order = appData.orders.find(o => o.id === draggedOrderId);
    if (!order) return;

    document.querySelector('.dragging')?.classList.remove('dragging');

    if (order.assignedTo === targetEmployeeId) {
        return;
    }

    order.assignedTo = targetEmployeeId;

    saveData();
    renderScheduling(); 
}

// ==========================================================
// 7. 启动
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    if (appData.cars.length === 0 && appData.employees.length === 0 && appData.orders.length === 0) {
        saveData(); 
        loadData(); 
    }
    
    // 初始化显示甘特图的当前月份
    currentGanttMonth = new Date(currentGanttMonth.getFullYear(), currentGanttMonth.getMonth(), 1); 
    
    showPage('car-management'); 
});

// 确保函数在全局范围内可用
window.showPage = showPage;
window.addNewCarRow = addNewCarRow;
window.deleteCar = deleteCar;
window.deleteEmployee = deleteEmployee;
window.autoSchedule = autoSchedule;
window.changeGanttMonth = changeGanttMonth;
window.editOrder = editOrder; // 新增
window.deleteOrder = deleteOrder; // 新增
