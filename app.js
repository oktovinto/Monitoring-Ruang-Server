// Server Room Monitoring Web Application with Database Support
// =========================================

// Data Storage
let monitoringData = [];
let tempHumidityChart = null;
let deviceStatusChart = null;
let monthlyTrendChart = null;
let monthlyStatusChart = null;
let currentPage = 1;
const itemsPerPage = 10;

// Database Configuration
const DB_NAME = 'ServerMonitoringDB';
const DB_VERSION = 1;
const STORE_NAME = 'monitoring_data';
const MONTHLY_STORE = 'monthly_aggregates';
let db = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    initializeDatabase().then(() => {
        loadDataFromDatabase();
        initializeDate();
        initializeTabs();
        initializeForm();
        initializeCharts();
        initializeFilters();
        initializeExportButtons();
        initializeMonthlyReports();
        updateDashboard();
        renderTable();
    });
});

// ==================== DATABASE FUNCTIONS ====================

// Initialize IndexedDB Database
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            // Fallback to localStorage
            resolve();
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database initialized successfully');
            resolve();
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            // Create main monitoring data store
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('date', 'date', { unique: false });
                objectStore.createIndex('monthYear', 'monthYear', { unique: false });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            
            // Create monthly aggregates store
            if (!database.objectStoreNames.contains(MONTHLY_STORE)) {
                const monthlyStore = database.createObjectStore(MONTHLY_STORE, { keyPath: 'monthYear' });
                monthlyStore.createIndex('year', 'year', { unique: false });
                monthlyStore.createIndex('month', 'month', { unique: false });
            }
        };
    });
}

// Add data to database
function addDataToDatabase(data) {
    return new Promise((resolve, reject) => {
        if (!db) {
            // Fallback to localStorage - data already added to monitoringData in form handler
            saveDataToStorage();
            resolve();
            return;
        }
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // Add timestamp and monthYear for querying
        const dbData = {
            ...data,
            timestamp: new Date(data.date + ' ' + data.time).getTime(),
            monthYear: data.date.substring(0, 7) // YYYY-MM format
        };
        
        const request = store.add(dbData);
        
        request.onsuccess = () => {
            updateMonthlyAggregate(data.date.substring(0, 7));
            resolve();
        };
        
        request.onerror = (event) => {
            console.error('Error adding data:', event.target.error);
            reject(event.target.error);
        };
    });
}

// Load all data from database
function loadDataFromDatabase() {
    return new Promise((resolve, reject) => {
        if (!db) {
            // Fallback to localStorage
            loadDataFromStorage();
            resolve();
            return;
        }
        
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
            monitoringData = request.result.sort((a, b) => b.timestamp - a.timestamp);
            
            // If no data, generate sample data
            if (monitoringData.length === 0) {
                monitoringData = generateSampleData();
                bulkInsertData(monitoringData).then(() => {
                    resolve();
                });
            } else {
                resolve();
            }
        };
        
        request.onerror = (event) => {
            console.error('Error loading data:', event.target.error);
            // Fallback to localStorage
            loadDataFromStorage();
            resolve();
        };
    });
}

// Bulk insert data to database
function bulkInsertData(dataArray) {
    return new Promise((resolve, reject) => {
        if (!db) {
            dataArray.forEach(data => monitoringData.unshift(data));
            saveDataToStorage();
            resolve();
            return;
        }
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        dataArray.forEach((data, index) => {
            const dbData = {
                ...data,
                timestamp: new Date(data.date + ' ' + data.time).getTime(),
                monthYear: data.date.substring(0, 7)
            };
            store.put(dbData);
        });
        
        transaction.oncomplete = () => {
            // Update monthly aggregates for all months
            const months = [...new Set(dataArray.map(d => d.date.substring(0, 7)))];
            months.forEach(month => updateMonthlyAggregate(month));
            resolve();
        };
        
        transaction.onerror = (event) => {
            console.error('Error bulk inserting:', event.target.error);
            reject(event.target.error);
        };
    });
}

// Get data by month from database
function getDataByMonth(monthYear) {
    return new Promise((resolve, reject) => {
        if (!db) {
            const filtered = monitoringData.filter(d => d.date.startsWith(monthYear));
            resolve(filtered);
            return;
        }
        
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('monthYear');
        const request = index.getAll(monthYear);
        
        request.onsuccess = () => {
            const sorted = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(sorted);
        };
        
        request.onerror = (event) => {
            console.error('Error getting data by month:', event.target.error);
            reject(event.target.error);
        };
    });
}

// Update monthly aggregate
function updateMonthlyAggregate(monthYear) {
    if (!db) return;
    
    getDataByMonth(monthYear).then(data => {
        if (data.length === 0) return;
        
        const year = parseInt(monthYear.substring(0, 4));
        const month = parseInt(monthYear.substring(5, 7));
        
        // Calculate aggregates
        const avgTemp = data.reduce((sum, d) => sum + parseFloat(d.temperature), 0) / data.length;
        const avgHumidity = data.reduce((sum, d) => sum + parseFloat(d.humidity), 0) / data.length;
        const avgPower = data.reduce((sum, d) => sum + parseFloat(d.powerUsage), 0) / data.length;
        const totalRecords = data.length;
        
        // Calculate min/max
        const temps = data.map(d => parseFloat(d.temperature));
        const humidities = data.map(d => parseFloat(d.humidity));
        const minTemp = Math.min(...temps);
        const maxTemp = Math.max(...temps);
        const minHumidity = Math.min(...humidities);
        const maxHumidity = Math.max(...humidities);
        
        // Count status occurrences
        let normalDays = 0, warningDays = 0, dangerDays = 0;
        data.forEach(d => {
            if (parseFloat(d.temperature) > 28 || parseFloat(d.humidity) > 70) {
                dangerDays++;
            } else if (parseFloat(d.temperature) > 25 || parseFloat(d.humidity) > 60) {
                warningDays++;
            } else {
                normalDays++;
            }
        });
        
        // Count equipment issues
        let acIssues = data.filter(d => d.acStatus === 'rusak' || d.acStatus === 'maintenance').length;
        let upsIssues = data.filter(d => d.upsStatus === 'rusak' || d.upsStatus === 'maintenance' || d.upsStatus === 'low_battery').length;
        
        const aggregate = {
            monthYear,
            year,
            month,
            avgTemp: avgTemp.toFixed(2),
            avgHumidity: avgHumidity.toFixed(2),
            avgPower: avgPower.toFixed(2),
            minTemp: minTemp.toFixed(1),
            maxTemp: maxTemp.toFixed(1),
            minHumidity: minHumidity.toFixed(1),
            maxHumidity: maxHumidity.toFixed(1),
            totalRecords,
            normalDays,
            warningDays,
            dangerDays,
            acIssues,
            upsIssues,
            lastUpdated: new Date().toISOString()
        };
        
        // Save to monthly store
        const transaction = db.transaction([MONTHLY_STORE], 'readwrite');
        const store = transaction.objectStore(MONTHLY_STORE);
        store.put(aggregate);
    });
}

// Get monthly aggregates
function getMonthlyAggregates() {
    return new Promise((resolve, reject) => {
        if (!db) {
            // Calculate from local data
            const aggregates = calculateLocalAggregates();
            resolve(aggregates);
            return;
        }
        
        const transaction = db.transaction([MONTHLY_STORE], 'readonly');
        const store = transaction.objectStore(MONTHLY_STORE);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const sorted = request.result.sort((a, b) => b.monthYear.localeCompare(a.monthYear));
            resolve(sorted);
        };
        
        request.onerror = (event) => {
            console.error('Error getting monthly aggregates:', event.target.error);
            const aggregates = calculateLocalAggregates();
            resolve(aggregates);
        };
    });
}

// Calculate aggregates from local data (fallback)
function calculateLocalAggregates() {
    const monthGroups = {};
    
    monitoringData.forEach(data => {
        const monthYear = data.date.substring(0, 7);
        if (!monthGroups[monthYear]) {
            monthGroups[monthYear] = [];
        }
        monthGroups[monthYear].push(data);
    });
    
    const aggregates = Object.entries(monthGroups).map(([monthYear, data]) => {
        const year = parseInt(monthYear.substring(0, 4));
        const month = parseInt(monthYear.substring(5, 7));
        
        const avgTemp = data.reduce((sum, d) => sum + parseFloat(d.temperature), 0) / data.length;
        const avgHumidity = data.reduce((sum, d) => sum + parseFloat(d.humidity), 0) / data.length;
        const avgPower = data.reduce((sum, d) => sum + parseFloat(d.powerUsage), 0) / data.length;
        const totalRecords = data.length;
        
        const temps = data.map(d => parseFloat(d.temperature));
        const humidities = data.map(d => parseFloat(d.humidity));
        
        let normalDays = 0, warningDays = 0, dangerDays = 0;
        data.forEach(d => {
            if (parseFloat(d.temperature) > 28 || parseFloat(d.humidity) > 70) {
                dangerDays++;
            } else if (parseFloat(d.temperature) > 25 || parseFloat(d.humidity) > 60) {
                warningDays++;
            } else {
                normalDays++;
            }
        });
        
        return {
            monthYear,
            year,
            month,
            avgTemp: avgTemp.toFixed(2),
            avgHumidity: avgHumidity.toFixed(2),
            avgPower: avgPower.toFixed(2),
            minTemp: Math.min(...temps).toFixed(1),
            maxTemp: Math.max(...temps).toFixed(1),
            minHumidity: Math.min(...humidities).toFixed(1),
            maxHumidity: Math.max(...humidities).toFixed(1),
            totalRecords,
            normalDays,
            warningDays,
            dangerDays
        };
    });
    
    return aggregates.sort((a, b) => b.monthYear.localeCompare(a.monthYear));
}

// Get available months
function getAvailableMonths() {
    return new Promise((resolve) => {
        if (!db) {
            const months = [...new Set(monitoringData.map(d => d.date.substring(0, 7)))];
            resolve(months.sort().reverse());
            return;
        }
        
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('monthYear');
        const request = index.getAllKeys();
        
        request.onsuccess = () => {
            const months = [...new Set(request.result)];
            resolve(months.sort().reverse());
        };
        
        request.onerror = () => {
            const months = [...new Set(monitoringData.map(d => d.date.substring(0, 7)))];
            resolve(months.sort().reverse());
        };
    });
}

// Delete data from database
function deleteDataFromDatabase(id) {
    return new Promise((resolve, reject) => {
        if (!db) {
            monitoringData = monitoringData.filter(d => d.id !== id);
            saveDataToStorage();
            resolve();
            return;
        }
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        
        request.onsuccess = () => {
            // Update monthly aggregate
            const data = monitoringData.find(d => d.id === id);
            if (data) {
                updateMonthlyAggregate(data.date.substring(0, 7));
            }
            resolve();
        };
        
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// ==================== UTILITY FUNCTIONS ====================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
}

function formatShortDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
}

function formatMonthYear(monthYear) {
    const date = new Date(monthYear + '-01');
    return date.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });
}

function formatTime(timeString) {
    return timeString;
}

function getStatusClass(value, type) {
    if (type === 'temperature') {
        if (value >= 18 && value <= 25) return 'normal';
        if (value > 25 && value <= 28) return 'warning';
        return 'danger';
    } else if (type === 'humidity') {
        if (value >= 40 && value <= 60) return 'normal';
        if ((value > 30 && value < 40) || (value > 60 && value <= 70)) return 'warning';
        return 'danger';
    }
    return 'normal';
}

function getStatusText(value, type) {
    if (type === 'temperature') {
        if (value >= 18 && value <= 25) return 'Normal';
        if (value > 25 && value <= 28) return 'Warning';
        return 'Danger';
    } else if (type === 'humidity') {
        if (value >= 40 && value <= 60) return 'Normal';
        if ((value > 30 && value < 40) || (value > 60 && value <= 70)) return 'Warning';
        return 'Danger';
    }
    return 'Normal';
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    toast.className = 'toast active';
    if (type === 'error') {
        toast.classList.add('error');
    }
    toastMessage.textContent = message;
    
    setTimeout(() => {
        toast.classList.remove('active');
    }, 3000);
}

// ==================== LOCAL STORAGE FUNCTIONS (FALLBACK) ====================

function loadDataFromStorage() {
    const stored = localStorage.getItem('serverMonitoringData');
    if (stored) {
        monitoringData = JSON.parse(stored);
    } else {
        monitoringData = generateSampleData();
        saveDataToStorage();
    }
}

function saveDataToStorage() {
    localStorage.setItem('serverMonitoringData', JSON.stringify(monitoringData));
}

function generateSampleData() {
    const sampleData = [];
    const statuses = ['normal', 'warning', 'danger'];
    const acStatuses = ['normal', 'maintenance', 'rusak'];
    const upsStatuses = ['normal', 'low_battery', 'maintenance', 'rusak'];
    
    for (let i = 30; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        sampleData.push({
            id: generateId(),
            date: date.toISOString().split('T')[0],
            time: '08:00',
            temperature: (22 + Math.random() * 4).toFixed(1),
            humidity: (45 + Math.random() * 20).toFixed(1),
            acStatus: acStatuses[Math.floor(Math.random() * acStatuses.length)],
            upsStatus: upsStatuses[Math.floor(Math.random() * upsStatuses.length)],
            rackCount: Math.floor(Math.random() * 5) + 3,
            activeServers: Math.floor(Math.random() * 20) + 10,
            powerUsage: (3 + Math.random() * 5).toFixed(2),
            fireExtinguisher: 'siap',
            notes: 'Pemeriksaan rutin'
        });
    }
    
    return sampleData.sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));
}

// ==================== INITIALIZATION FUNCTIONS ====================

function initializeDate() {
    const dateDisplay = document.getElementById('currentDate');
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateDisplay.textContent = now.toLocaleDateString('id-ID', options);
    
    document.getElementById('entryDate').value = now.toISOString().split('T')[0];
    document.getElementById('entryTime').value = now.toTimeString().slice(0, 5);
}

function initializeTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(targetTab).classList.add('active');
            
            if (targetTab === 'dashboard') {
                updateDashboard();
            }
            
            if (targetTab === 'history') {
                renderTable();
            }
            
            if (targetTab === 'reports') {
                loadMonthlyReports();
            }
        });
    });
}

function initializeForm() {
    const form = document.getElementById('monitoringForm');
    const dateInput = document.getElementById('entryDate');
    
    // Check if data already exists for selected date
    dateInput.addEventListener('change', function() {
        const selectedDate = this.value;
        const existingData = monitoringData.find(d => d.date === selectedDate);
        
        if (existingData) {
            showToast(`Data untuk tanggal ${formatDate(selectedDate)} sudah ada! Silakan pilih tanggal lain atau edit data yang ada.`, 'error');
            dateInput.value = '';
            dateInput.focus();
        }
    });
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const selectedDate = document.getElementById('entryDate').value;
        
        // Check if data already exists for the selected date
        const existingData = monitoringData.find(d => d.date === selectedDate);
        if (existingData) {
            showToast(`Data untuk tanggal ${formatDate(selectedDate)} sudah ada! Silakan pilih tanggal lain atau edit data yang ada.`, 'error');
            return;
        }
        
        const formData = {
            id: generateId(),
            date: document.getElementById('entryDate').value,
            time: document.getElementById('entryTime').value,
            temperature: parseFloat(document.getElementById('temperature').value),
            humidity: parseFloat(document.getElementById('humidity').value),
            acStatus: document.getElementById('acStatus').value,
            upsStatus: document.getElementById('upsStatus').value,
            rackCount: parseInt(document.getElementById('rackCount').value),
            activeServers: parseInt(document.getElementById('activeServers').value),
            powerUsage: parseFloat(document.getElementById('powerUsage').value),
            fireExtinguisher: document.getElementById('fireExtinguisher').value,
            notes: document.getElementById('notes').value
        };
        
        monitoringData.unshift(formData);
        
        // Save to database
        await addDataToDatabase(formData);
        
        showToast('Data monitoring berhasil disimpan!');
        
        form.reset();
        
        const now = new Date();
        document.getElementById('entryDate').value = now.toISOString().split('T')[0];
        document.getElementById('entryTime').value = now.toTimeString().slice(0, 5);
        
        updateDashboard();
    });
}

function initializeCharts() {
    const tempHumidityCtx = document.getElementById('tempHumidityChart').getContext('2d');
    tempHumidityChart = new Chart(tempHumidityCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Suhu (°C)',
                    data: [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Kelembaban (%)',
                    data: [],
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: false
                }
            }
        }
    });
    
    const deviceStatusCtx = document.getElementById('deviceStatusChart').getContext('2d');
    deviceStatusChart = new Chart(deviceStatusCtx, {
        type: 'doughnut',
        data: {
            labels: ['Normal', 'Warning', 'Danger'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
    
    document.getElementById('chartPeriod').addEventListener('change', updateDashboard);
}

function initializeFilters() {
    document.getElementById('applyFilter').addEventListener('click', applyFilters);
    document.getElementById('resetFilter').addEventListener('click', resetFilters);
}

function initializeExportButtons() {
    document.getElementById('exportExcel').addEventListener('click', exportToExcel);
    document.getElementById('exportPDF').addEventListener('click', exportToPDF);
    document.getElementById('exportMonthlyExcel').addEventListener('click', exportMonthlyToExcel);
    document.getElementById('exportMonthlyPDF').addEventListener('click', exportMonthlyToPDF);
}

function initializeMonthlyReports() {
    document.getElementById('monthSelect').addEventListener('change', loadMonthlyReports);
    document.getElementById('refreshReports').addEventListener('click', loadMonthlyReports);
}

// ==================== DASHBOARD FUNCTIONS ====================

function updateDashboard() {
    if (monitoringData.length === 0) {
        document.getElementById('avgTemp').textContent = '-- °C';
        document.getElementById('avgHumidity').textContent = '-- %';
        document.getElementById('totalPower').textContent = '-- kW';
        document.getElementById('activeDevices').textContent = '--';
        return;
    }
    
    const period = parseInt(document.getElementById('chartPeriod').value);
    const recentData = monitoringData.slice(0, period);
    
    const avgTemp = recentData.reduce((sum, d) => sum + parseFloat(d.temperature), 0) / recentData.length;
    const avgHumidity = recentData.reduce((sum, d) => sum + parseFloat(d.humidity), 0) / recentData.length;
    const avgPower = recentData.reduce((sum, d) => sum + parseFloat(d.powerUsage), 0) / recentData.length;
    const totalServers = recentData.reduce((sum, d) => sum + parseInt(d.activeServers), 0) / recentData.length;
    
    document.getElementById('avgTemp').textContent = avgTemp.toFixed(1) + ' °C';
    document.getElementById('avgHumidity').textContent = avgHumidity.toFixed(1) + ' %';
    document.getElementById('totalPower').textContent = avgPower.toFixed(2) + ' kW';
    document.getElementById('activeDevices').textContent = Math.round(totalServers);
    
    const tempStatus = document.getElementById('tempStatus');
    tempStatus.textContent = getStatusText(avgTemp, 'temperature');
    tempStatus.className = 'status ' + getStatusClass(avgTemp, 'temperature');
    
    const humidityStatus = document.getElementById('humidityStatus');
    humidityStatus.textContent = getStatusText(avgHumidity, 'humidity');
    humidityStatus.className = 'status ' + getStatusClass(avgHumidity, 'humidity');
    
    const alerts = monitoringData.filter(d => 
        parseFloat(d.temperature) > 25 || 
        parseFloat(d.humidity) > 60 ||
        d.acStatus === 'rusak' ||
        d.upsStatus === 'rusak'
    ).length;
    
    document.getElementById('activeAlerts').textContent = alerts;
    document.getElementById('totalRecords').textContent = monitoringData.length;
    document.getElementById('lastUpdate').textContent = monitoringData[0] ? monitoringData[0].time : '--:--';
    
    updateCharts(recentData);
}

function updateCharts(data) {
    const labels = data.map(d => formatShortDate(d.date));
    const temperatures = data.map(d => d.temperature);
    const humidities = data.map(d => d.humidity);
    
    tempHumidityChart.data.labels = labels;
    tempHumidityChart.data.datasets[0].data = temperatures;
    tempHumidityChart.data.datasets[1].data = humidities;
    tempHumidityChart.update();
    
    let normal = 0, warning = 0, danger = 0;
    data.forEach(d => {
        if (parseFloat(d.temperature) > 28 || parseFloat(d.humidity) > 70) {
            danger++;
        } else if (parseFloat(d.temperature) > 25 || parseFloat(d.humidity) > 60) {
            warning++;
        } else {
            normal++;
        }
    });
    
    deviceStatusChart.data.datasets[0].data = [normal, warning, danger];
    deviceStatusChart.update();
}

// ==================== MONTHLY REPORTS FUNCTIONS ====================

async function loadMonthlyReports() {
    const monthSelect = document.getElementById('monthSelect');
    
    // Populate month selector if empty
    if (monthSelect.options.length <= 1) {
        const months = await getAvailableMonths();
        months.forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = formatMonthYear(month);
            monthSelect.appendChild(option);
        });
    }
    
    const selectedMonth = monthSelect.value || (await getAvailableMonths())[0];
    
    if (!selectedMonth) {
        document.getElementById('monthlySummary').innerHTML = '<p>Tidak ada data tersedia</p>';
        return;
    }
    
    // Get data for selected month
    const monthData = await getDataByMonth(selectedMonth);
    
    if (monthData.length === 0) {
        document.getElementById('monthlySummary').innerHTML = '<p>Tidak ada data untuk bulan ini</p>';
        return;
    }
    
    // Calculate statistics
    const avgTemp = monthData.reduce((sum, d) => sum + parseFloat(d.temperature), 0) / monthData.length;
    const avgHumidity = monthData.reduce((sum, d) => sum + parseFloat(d.humidity), 0) / monthData.length;
    const avgPower = monthData.reduce((sum, d) => sum + parseFloat(d.powerUsage), 0) / monthData.length;
    
    const temps = monthData.map(d => parseFloat(d.temperature));
    const humidities = monthData.map(d => parseFloat(d.humidity));
    
    let normal = 0, warning = 0, danger = 0;
    monthData.forEach(d => {
        if (parseFloat(d.temperature) > 28 || parseFloat(d.humidity) > 70) {
            danger++;
        } else if (parseFloat(d.temperature) > 25 || parseFloat(d.humidity) > 60) {
            warning++;
        } else {
            normal++;
        }
    });
    
    const acIssues = monthData.filter(d => d.acStatus === 'rusak' || d.acStatus === 'maintenance').length;
    const upsIssues = monthData.filter(d => d.upsStatus === 'rusak' || d.upsStatus === 'maintenance' || d.upsStatus === 'low_battery').length;
    
    // Update summary cards
    document.getElementById('monthlyRecords').textContent = monthData.length;
    document.getElementById('monthlyAvgTemp').textContent = avgTemp.toFixed(1) + ' °C';
    document.getElementById('monthlyAvgHumidity').textContent = avgHumidity.toFixed(1) + ' %';
    document.getElementById('monthlyAvgPower').textContent = avgPower.toFixed(2) + ' kW';
    
    document.getElementById('monthlyMinTemp').textContent = Math.min(...temps).toFixed(1) + ' °C';
    document.getElementById('monthlyMaxTemp').textContent = Math.max(...temps).toFixed(1) + ' °C';
    document.getElementById('monthlyMinHumidity').textContent = Math.min(...humidities).toFixed(1) + ' %';
    document.getElementById('monthlyMaxHumidity').textContent = Math.max(...humidities).toFixed(1) + ' %';
    
    document.getElementById('monthlyNormalDays').textContent = normal;
    document.getElementById('monthlyWarningDays').textContent = warning;
    document.getElementById('monthlyDangerDays').textContent = danger;
    
    document.getElementById('monthlyACIssues').textContent = acIssues;
    document.getElementById('monthlyUPSIssues').textContent = upsIssues;
    
    // Update status
    document.getElementById('monthlyTempStatus').textContent = getStatusText(avgTemp, 'temperature');
    document.getElementById('monthlyTempStatus').className = 'status-badge ' + getStatusClass(avgTemp, 'temperature');
    
    document.getElementById('monthlyHumidityStatus').textContent = getStatusText(avgHumidity, 'humidity');
    document.getElementById('monthlyHumidityStatus').className = 'status-badge ' + getStatusClass(avgHumidity, 'humidity');
    
    // Update charts
    updateMonthlyCharts(monthData);
}

function updateMonthlyCharts(data) {
    // Destroy existing charts if they exist
    if (monthlyTrendChart) monthlyTrendChart.destroy();
    if (monthlyStatusChart) monthlyStatusChart.destroy();
    
    // Group data by date
    const dailyData = {};
    data.forEach(d => {
        if (!dailyData[d.date]) {
            dailyData[d.date] = { temp: [], humidity: [], power: [] };
        }
        dailyData[d.date].temp.push(parseFloat(d.temperature));
        dailyData[d.date].humidity.push(parseFloat(d.humidity));
        dailyData[d.date].power.push(parseFloat(d.powerUsage));
    });
    
    const dates = Object.keys(dailyData).sort();
    const avgTemps = dates.map(d => dailyData[d].temp.reduce((a, b) => a + b, 0) / dailyData[d].temp.length);
    const avgHumidities = dates.map(d => dailyData[d].humidity.reduce((a, b) => a + b, 0) / dailyData[d].humidity.length);
    
    // Trend Chart
    const trendCtx = document.getElementById('monthlyTrendChart').getContext('2d');
    monthlyTrendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: dates.map(d => formatShortDate(d)),
            datasets: [
                {
                    label: 'Suhu Rata-rata (°C)',
                    data: avgTemps,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Kelembaban Rata-rata (%)',
                    data: avgHumidities,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                },
                title: {
                    display: true,
                    text: 'Tren Suhu & Kelembaban Bulanan'
                }
            },
            scales: {
                y: {
                    beginAtZero: false
                }
            }
        }
    });
    
    // Status Distribution Chart
    let normal = 0, warning = 0, danger = 0;
    data.forEach(d => {
        if (parseFloat(d.temperature) > 28 || parseFloat(d.humidity) > 70) {
            danger++;
        } else if (parseFloat(d.temperature) > 25 || parseFloat(d.humidity) > 60) {
            warning++;
        } else {
            normal++;
        }
    });
    
    const statusCtx = document.getElementById('monthlyStatusChart').getContext('2d');
    monthlyStatusChart = new Chart(statusCtx, {
        type: 'bar',
        data: {
            labels: ['Normal', 'Warning', 'Danger'],
            datasets: [{
                label: 'Jumlah Hari',
                data: [normal, warning, danger],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Distribusi Status'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// ==================== TABLE FUNCTIONS ====================

function applyFilters() {
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;
    
    if (!startDate && !endDate) {
        renderTable();
        return;
    }
    
    let filteredData = monitoringData;
    
    if (startDate) {
        filteredData = filteredData.filter(d => d.date >= startDate);
    }
    
    if (endDate) {
        filteredData = filteredData.filter(d => d.date <= endDate);
    }
    
    renderTable(filteredData);
}

function resetFilters() {
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    renderTable();
}

function renderTable(data = null) {
    const tableBody = document.getElementById('tableBody');
    const displayData = data || monitoringData;
    
    if (displayData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h3>Tidak ada data</h3>
                    <p>Silakan input data monitoring terlebih dahulu</p>
                </td>
            </tr>
        `;
        return;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = displayData.slice(startIndex, endIndex);
    
    tableBody.innerHTML = pageData.map((d, index) => `
        <tr>
            <td>${startIndex + index + 1}</td>
            <td>${formatDate(d.date)}</td>
            <td>${d.time}</td>
            <td>
                <span class="status-badge ${getStatusClass(parseFloat(d.temperature), 'temperature')}">
                    ${d.temperature} °C
                </span>
            </td>
            <td>
                <span class="status-badge ${getStatusClass(parseFloat(d.humidity), 'humidity')}">
                    ${d.humidity} %
                </span>
            </td>
            <td>
                <span class="status-badge ${d.acStatus === 'normal' ? 'normal' : d.acStatus === 'warning' ? 'warning' : 'danger'}">
                    ${d.acStatus === 'normal' ? 'Normal' : d.acStatus === 'maintenance' ? 'Maintenance' : 'Rusak'}
                </span>
            </td>
            <td>
                <span class="status-badge ${d.upsStatus === 'normal' ? 'normal' : d.upsStatus === 'low_battery' ? 'warning' : 'danger'}">
                    ${d.upsStatus === 'normal' ? 'Normal' : d.upsStatus === 'low_battery' ? 'Baterai Rendah' : d.upsStatus === 'maintenance' ? 'Maintenance' : 'Rusak'}
                </span>
            </td>
            <td>${d.activeServers}</td>
            <td>${d.powerUsage} kW</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-secondary btn-sm btn-icon" onclick="editData('${d.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm btn-icon" onclick="deleteData('${d.id}')" title="Hapus">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    renderPagination(displayData.length);
}

function renderPagination(totalItems) {
    const pagination = document.getElementById('pagination');
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = `
        <button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `
                <button class="${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">
                    ${i}
                </button>
            `;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += '<span>...</span>';
        }
    }
    
    html += `
        <button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    
    pagination.innerHTML = html;
}

function changePage(page) {
    currentPage = page;
    renderTable();
}

// ==================== EDIT & DELETE FUNCTIONS ====================

async function editData(id) {
    const data = monitoringData.find(d => d.id === id);
    if (!data) return;
    
    document.getElementById('editId').value = data.id;
    document.getElementById('editDate').value = data.date;
    document.getElementById('editTime').value = data.time;
    document.getElementById('editTemperature').value = data.temperature;
    document.getElementById('editHumidity').value = data.humidity;
    document.getElementById('editAcStatus').value = data.acStatus;
    document.getElementById('editUpsStatus').value = data.upsStatus;
    document.getElementById('editActiveServers').value = data.activeServers;
    document.getElementById('editPowerUsage').value = data.powerUsage;
    
    document.getElementById('editModal').classList.add('active');
}

function closeModal() {
    document.getElementById('editModal').classList.remove('active');
}

function cancelEdit() {
    closeModal();
}

async function saveEdit(e) {
    e.preventDefault();
    
    const id = document.getElementById('editId').value;
    const index = monitoringData.findIndex(d => d.id === id);
    
    if (index === -1) return;
    
    monitoringData[index] = {
        ...monitoringData[index],
        date: document.getElementById('editDate').value,
        time: document.getElementById('editTime').value,
        temperature: parseFloat(document.getElementById('editTemperature').value),
        humidity: parseFloat(document.getElementById('editHumidity').value),
        acStatus: document.getElementById('editAcStatus').value,
        upsStatus: document.getElementById('editUpsStatus').value,
        activeServers: parseInt(document.getElementById('editActiveServers').value),
        powerUsage: parseFloat(document.getElementById('editPowerUsage').value)
    };
    
    saveDataToStorage();
    closeModal();
    renderTable();
    updateDashboard();
    showToast('Data berhasil diperbarui!');
}

async function deleteData(id) {
    if (confirm('Apakah Anda yakin ingin menghapus data ini?')) {
        monitoringData = monitoringData.filter(d => d.id !== id);
        await deleteDataFromDatabase(id);
        renderTable();
        updateDashboard();
        showToast('Data berhasil dihapus!', 'success');
    }
}

document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelEdit').addEventListener('click', cancelEdit);
document.getElementById('editForm').addEventListener('submit', saveEdit);

document.getElementById('editModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

// ==================== EXPORT FUNCTIONS ====================

function exportToExcel() {
    // Filter to only 1 entry per date (keep the latest one for each date)
    const uniqueDateData = [];
    const dateMap = new Map();
    
    monitoringData.forEach(d => {
        if (!dateMap.has(d.date)) {
            dateMap.set(d.date, d);
            uniqueDateData.push(d);
        }
    });
    
    // Sort by date descending
    uniqueDateData.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const exportData = uniqueDateData.map((d, index) => ({
        'No': index + 1,
        'Tanggal': formatDate(d.date),
        'Waktu': d.time,
        'Suhu (°C)': d.temperature,
        'Kelembaban (%)': d.humidity,
        'Status AC': d.acStatus === 'normal' ? 'Normal' : d.acStatus === 'maintenance' ? 'Maintenance' : 'Rusak',
        'Status UPS': d.upsStatus === 'normal' ? 'Normal' : d.upsStatus === 'low_battery' ? 'Baterai Rendah' : d.upsStatus === 'maintenance' ? 'Maintenance' : 'Rusak',
        'Server Aktif': d.activeServers,
        'Daya (kW)': d.powerUsage,
        'Status APAR': d.fireExtinguisher === 'siap' ? 'Siap Pakai' : d.fireExtinguisher === 'expired' ? 'Expired' : 'Perlu Maintenance',
        'Catatan': d.notes || '-'
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Monitoring');
    
    const colWidths = [
        { wch: 5 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 15 },
        { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }
    ];
    ws['!cols'] = colWidths;
    
    const fileName = `monitoring_server_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showToast('Data berhasil diexport ke Excel!');
}

function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Laporan Monitoring Ruang Server', 14, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 14, 28);
    
    // Filter to only 1 entry per date (keep the latest one for each date)
    const uniqueDateData = [];
    const dateMap = new Map();
    
    monitoringData.forEach(d => {
        if (!dateMap.has(d.date)) {
            dateMap.set(d.date, d);
            uniqueDateData.push(d);
        }
    });
    
    // Sort by date descending
    uniqueDateData.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const tableData = uniqueDateData.map((d, index) => [
        index + 1,
        formatDate(d.date),
        d.time,
        d.temperature,
        d.humidity,
        d.acStatus === 'normal' ? 'Normal' : d.acStatus === 'maintenance' ? 'Mtn' : 'Rusak',
        d.upsStatus === 'normal' ? 'Normal' : d.upsStatus === 'low_battery' ? 'Low' : d.upsStatus === 'maintenance' ? 'Mtn' : 'Rusak',
        d.activeServers,
        d.powerUsage
    ]);
    
    doc.autoTable({
        head: [['No', 'Tanggal', 'Waktu', 'Suhu', 'Kelembaban', 'AC', 'UPS', 'Server', 'Daya (kW)']],
        body: tableData,
        startY: 35,
        styles: {
            fontSize: 8,
            cellPadding: 2
        },
        headStyles: {
            fillColor: [37, 99, 235],
            textColor: 255,
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [241, 245, 249]
        }
    });
    
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Halaman ${i} dari ${pageCount}`, 14, doc.internal.pageSize.height - 10);
    }
    
    const fileName = `monitoring_server_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    
    showToast('Data berhasil diexport ke PDF!');
}

async function exportMonthlyToExcel() {
    const monthSelect = document.getElementById('monthSelect');
    const selectedMonth = monthSelect.value;
    
    if (!selectedMonth) {
        showToast('Pilih bulan terlebih dahulu', 'error');
        return;
    }
    
    const monthData = await getDataByMonth(selectedMonth);
    
    if (monthData.length === 0) {
        showToast('Tidak ada data untuk bulan ini', 'error');
        return;
    }
    
    // Filter to only 1 entry per date (keep the latest one for each date)
    const uniqueDateData = [];
    const dateMap = new Map();
    
    monthData.forEach(d => {
        if (!dateMap.has(d.date)) {
            dateMap.set(d.date, d);
            uniqueDateData.push(d);
        }
    });
    
    // Sort by date descending
    uniqueDateData.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const exportData = uniqueDateData.map((d, index) => ({
        'No': index + 1,
        'Tanggal': formatDate(d.date),
        'Waktu': d.time,
        'Suhu (°C)': d.temperature,
        'Kelembaban (%)': d.humidity,
        'Status AC': d.acStatus === 'normal' ? 'Normal' : d.acStatus === 'maintenance' ? 'Maintenance' : 'Rusak',
        'Status UPS': d.upsStatus === 'normal' ? 'Normal' : d.upsStatus === 'low_battery' ? 'Baterai Rendah' : d.upsStatus === 'maintenance' ? 'Maintenance' : 'Rusak',
        'Server Aktif': d.activeServers,
        'Daya (kW)': d.powerUsage
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Bulanan');
    
    const colWidths = [
        { wch: 5 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 15 },
        { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }
    ];
    ws['!cols'] = colWidths;
    
    const fileName = `laporan_bulanan_${selectedMonth}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showToast('Laporan bulanan berhasil diexport ke Excel!');
}

async function exportMonthlyToPDF() {
    const monthSelect = document.getElementById('monthSelect');
    const selectedMonth = monthSelect.value;
    
    if (!selectedMonth) {
        showToast('Pilih bulan terlebih dahulu', 'error');
        return;
    }
    
    const monthData = await getDataByMonth(selectedMonth);
    
    if (monthData.length === 0) {
        showToast('Tidak ada data untuk bulan ini', 'error');
        return;
    }
    
    // Filter to only 1 entry per date (keep the latest one for each date)
    const uniqueDateData = [];
    const dateMap = new Map();
    
    monthData.forEach(d => {
        if (!dateMap.has(d.date)) {
            dateMap.set(d.date, d);
            uniqueDateData.push(d);
        }
    });
    
    // Sort by date descending
    uniqueDateData.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Laporan Bulanan Monitoring Ruang Server', 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Bulan: ${formatMonthYear(selectedMonth)}`, 14, 30);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 14, 38);
    
    // Calculate summary
    const avgTemp = uniqueDateData.reduce((sum, d) => sum + parseFloat(d.temperature), 0) / uniqueDateData.length;
    const avgHumidity = uniqueDateData.reduce((sum, d) => sum + parseFloat(d.humidity), 0) / uniqueDateData.length;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Ringkasan:', 14, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`- Total Pencatatan: ${uniqueDateData.length}`, 20, 58);
    doc.text(`- Suhu Rata-rata: ${avgTemp.toFixed(1)}°C`, 20, 65);
    doc.text(`- Kelembaban Rata-rata: ${avgHumidity.toFixed(1)}%`, 20, 72);
    
    // Table
    const tableData = uniqueDateData.map((d, index) => [
        index + 1,
        formatDate(d.date),
        d.time,
        d.temperature,
        d.humidity,
        d.acStatus === 'normal' ? 'N' : d.acStatus === 'maintenance' ? 'M' : 'R',
        d.upsStatus === 'normal' ? 'N' : d.upsStatus === 'low_battery' ? 'L' : d.upsStatus === 'maintenance' ? 'M' : 'R',
        d.activeServers
    ]);
    
    doc.autoTable({
        head: [['No', 'Tanggal', 'Waktu', 'Suhu', 'Kelembaban', 'AC', 'UPS', 'Server']],
        body: tableData,
        startY: 82,
        styles: {
            fontSize: 8,
            cellPadding: 2
        },
        headStyles: {
            fillColor: [37, 99, 235],
            textColor: 255,
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [241, 245, 249]
        }
    });
    
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Halaman ${i} dari ${pageCount}`, 14, doc.internal.pageSize.height - 10);
    }
    
    const fileName = `laporan_bulanan_${selectedMonth}.pdf`;
    doc.save(fileName);
    
    showToast('Laporan bulanan berhasil diexport ke PDF!');
}

// Make functions globally available
window.editData = editData;
window.deleteData = deleteData;
window.changePage = changePage;
window.closeModal = closeModal;
window.cancelEdit = cancelEdit;
window.saveEdit = saveEdit;
