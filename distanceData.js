// distanceData.js

/**
 * 🗺️ 地点间所需时间预设表 (管理员维护)
 * 结构: { 起始地点: { 目的地点: 所需时间(分钟) } }
 */
const travelTimePresets = {
     '横滨工厂': {
    '羽田机场': 55,
    '成田机场': 130,
    '新宿': 75,
    '上野': 90,
    '足立工厂': 95
  },
  '羽田机场': {
    '横滨工厂': 55,
    '成田机场': 120,
    '新宿': 50,
    '上野': 55,
    '足立工厂': 70
  },
  '成田机场': {
    '横滨工厂': 130,
    '羽田机场': 120,
    '新宿': 95,
    '上野': 80,
    '足立工厂': 90
  },
  '新宿': {
    '横滨工厂': 75,
    '羽田机场': 50,
    '成田机场': 95,
    '上野': 35,
    '足立工厂': 55
  },
  '上野': {
    '横滨工厂': 90,
    '羽田机场': 55,
    '成田机场': 80,
    '新宿': 35,
    '足立工厂': 35
  },
  '足立工厂': {
    '横滨工厂': 95,
    '羽田机场': 70,
    '成田机场': 90,
    '新宿': 55,
    '上野': 35
  }

    
    // 🚨 可以在这里继续添加你的其他地名和时间！
};


/**
 * 查找两地间所需时间（分钟）。
 * @param {string} startLocation - 起始地点
 * @param {string} endLocation - 结束地点
 * @returns {number} - 所需时间（分钟），如果未找到则返回默认值。
 */
function getTravelTime(from, to) {
    if (!from || !to || from === to) return 0; // 同地点，0分钟
    
    // 检查起始地点是否存在且是否有到达目的地的记录
    const time = travelTimePresets[from]?.[to];
    
    if (time !== undefined) {
        // console.log(`[Time Preset Hit] ${from} -> ${to}: ${time} min`);
        return time;
    }
    
    // 预设表未命中，返回一个安全默认值
    // console.warn(`[Time Preset MISS] ${from} -> ${to} not found. Using default time: 30 min`);
    return 30; 
}