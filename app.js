// Server Room Monitoring Web Application with Firebase
// =========================================

// Data Storage
let monitoringData = [];
let tempHumidityChart = null;
let deviceStatusChart = null;
let monthlyTrendChart = null;
let monthlyStatusChart = null;
let currentPage = 1;
const itemsPerPage = 10;

// Firebase Configuration - Will be loaded from index.html
let db = null;
let firebaseInitialized = false;

// Initialize Application
document.addEventListener('DOMContentLoaded', async function() {
    // Wait for Firebase to initialize
    await waitForFirebase();
    
    if (firebaseInitialized) {
        loadDataFromFirebase();
    } else {
        // Fallback to local mode
        console.log('Running in offline mode');
        loadDataFromLocal();
    }
    
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

// Wait for Firebase SDK to load
function waitForFirebase() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (window.firebaseFunctions && window.db) {
                clearInterval(checkInterval);
                firebaseInitialized = true;
                resolve();
            }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
        }, 5000);
    });
}

// ==================== FIREBASE FUNCTIONS ====================

function loadDataFromFirebase() {
    if (!window.db) {
        loadDataFromLocal();
        return;
    }
    
    const { collection, query, orderBy, getDocs } = window.firebaseFunctions;
    
    const q = query(collection(window.db, 'monitoring_data'), orderBy('createdAt', 'desc'));
    
    getDocs(q)
        .then((snapshot) => {
            monitoringData = [];
            snapshot.forEach((doc) => {
                monitoringData.push({ id: doc.id, ...doc.data() });
            });
            
            document.getElementById('loadingIndicator').style.display = 'none';
            
            // If no data, show empty state
            if (monitoringData.length === 0) {
                renderTable();
            }
        })
        .catch((error) => {
            console.error('Error loading data:', error);
            document.getElementById('loadingIndicator').innerHTML = `
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: var(--danger-color);"></i>
                <p style="margin-top: 10px; color: var(--danger-color);">Error memuat data: ${error.message}</p>
            `;
            loadDataFromLocal();
        });
}

async function addDataToFirebase(data) {
    if (!window.db) {
        monitoringData.unshift(data);
        saveDataToLocal();
        return;
    }
    
    const { collection, addDoc, serverTimestamp } = window.firebaseFunctions;
    
    const docData = {
        ...data,
        createdAt: serverTimestamp()
    };
    
    await addDoc(collection(window.db, 'monitoring_data'), docData);
}

async function updateDataInFirebase(id, data) {
    if (!window.db) {
        const index = monitoringData.findIndex(d => d.id === id);
        if (index !== -1) {
            monitoringData[index] = { ...monitoringData[index], ...data };
            saveDataToLocal();
        }
        return;
    }
    
    const { doc, updateDoc, serverTimestamp } = window.firebaseFunctions;
    
    await updateDoc(doc(window.db, 'monitoring_data', id), {
        ...data,
        updatedAt: serverTimestamp()
    });
}

async function deleteDataFromFirebase(id) {
    if (!window.db) {
        monitoringData = monitoringData.filter(d => d.id !== id);
        saveDataToLocal();
        return;
    }
    
    const { doc, deleteDoc } = window.firebaseFunctions;
    
    await deleteDoc(doc(window.db, 'monitoring_data', id));
}

async function clearAllDataInFirebase() {
    if (!window.db) {
        monitoringData = [];
        localStorage.removeItem('serverMonitoringData');
        return;
    }
    
    const { collection, getDocs, deleteDoc } = window.firebaseFunctions;
    
    const snapshot = await getDocs(collection(window.db, 'monitoring_data'));
    
    const deletePromises = [];
    snapshot.forEach((docSnapshot) => {
        deletePromises.push(deleteDoc(doc(window.db, 'monitoring_data', docSnapshot.id)));
    });
    
    await Promise.all(deletePromises);
    monitoringData = [];
}

async function getDataByMonthFromFirebase(monthYear) {
    if (!window.db) {
        return monitoringData.filter(d => d.date.startsWith(monthYear));
    }
    
    const { collection, query, where, orderBy, getDocs } = window.firebaseFunctions;
    
    const startDate = monthYear + '-01';
    const endDate = monthYear + '-31';
    
    const q = query(
        collection(window.db, 'monitoring_data'),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const data = [];
    snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
    });
    
    return data;
}

// ==================== LOCAL FUNCTIONS (FALLBACK) ====================

function loadDataFromLocal() {
    const stored = localStorage.getItem('serverMonitoringData');
    if (stored) {
        monitoringData = JSON.parse(stored);
    }
    document.getElementById('loadingIndicator').style.display = 'none';
    document.getElementById('firebaseStatus').innerHTML = '<span style="color: orange;">⚠️ Mode Offline</span>';
}

function saveDataToLocal() {
    localStorage.setItem('serverMonitoringData', JSON.stringify(monitoringData));
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
    if (!dateString || dateString === 'Invalid Date') return '';
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
}

function formatMonthYear(monthYear) {
    if (!monthYear || monthYear.length !== 7) return '';
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

async function initializeForm() {
    const form = document.getElementById('monitoringForm');
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
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
        
        // Save to Firebase
        await addDataToFirebase(formData);
        
        showToast('Data monitoring berhasil disimpan!');
        
        form.reset();
        
        const now = new Date();
        document.getElementById('entryDate').value = now.toISOString().split('T')[0];
        document.getElementById('entryTime').value = now.toTimeString().slice(0, 5);
        
        updateDashboard();
        renderTable();
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
    document.getElementById('clearAllData').addEventListener('click', clearAllData);
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
        const months = getAvailableMonths();
        months.forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = formatMonthYear(month);
            monthSelect.appendChild(option);
        });
    }
    
    const availableMonths = getAvailableMonths();
    if (availableMonths.length === 0) {
        resetMonthlyStats();
        return;
    }
    
    const selectedMonth = monthSelect.value || availableMonths[0];
    
    if (!monthSelect.value && availableMonths.length > 0) {
        monthSelect.value = availableMonths[0];
    }
    
    // Get data for selected month
    let monthData;
    if (firebaseInitialized) {
        monthData = await getDataByMonthFromFirebase(selectedMonth);
    } else {
        monthData = monitoringData.filter(d => d.date.startsWith(selectedMonth));
    }
    
    if (monthData.length === 0) {
        resetMonthlyStats();
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
    
    document.getElementById('monthlyTempStatus').textContent = getStatusText(avgTemp, 'temperature');
    document.getElementById('monthlyTempStatus').className = 'status-badge ' + getStatusClass(avgTemp, 'temperature');
    
    document.getElementById('monthlyHumidityStatus').textContent = getStatusText(avgHumidity, 'humidity');
    document.getElementById('monthlyHumidityStatus').className = 'status-badge ' + getStatusClass(avgHumidity, 'humidity');
    
    updateMonthlyCharts(monthData);
}

function getAvailableMonths() {
    const months = [...new Set(monitoringData.map(d => d.date.substring(0, 7)))];
    return months.sort().reverse();
}

function updateMonthlyCharts(data) {
    if (monthlyTrendChart) monthlyTrendChart.destroy();
    if (monthlyStatusChart) monthlyStatusChart.destroy();
    
    if (!data || data.length === 0) return;
    
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
    
    const trendCtx = document.getElementById('monthlyTrendChart');
    if (!trendCtx) return;
    
    monthlyTrendChart = new Chart(trendCtx.getContext('2d'), {
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
                legend: { position: 'top' },
                title: { display: true, text: 'Tren Suhu & Kelembaban Bulanan' }
            },
            scales: { y: { beginAtZero: false } }
        }
    });
    
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
    
    const statusCtx = document.getElementById('monthlyStatusChart');
    if (!statusCtx) return;
    
    monthlyStatusChart = new Chart(statusCtx.getContext('2d'), {
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
                legend: { display: false },
                title: { display: true, text: 'Distribusi Status' }
            },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

function resetMonthlyStats() {
    document.getElementById('monthlyRecords').textContent = '0';
    document.getElementById('monthlyAvgTemp').textContent = '-- °C';
    document.getElementById('monthlyAvgHumidity').textContent = '-- %';
    document.getElementById('monthlyAvgPower').textContent = '-- kW';
    document.getElementById('monthlyMinTemp').textContent = '-- °C';
    document.getElementById('monthlyMaxTemp').textContent = '-- °C';
    document.getElementById('monthlyMinHumidity').textContent = '-- %';
    document.getElementById('monthlyMaxHumidity').textContent = '-- %';
    document.getElementById('monthlyNormalDays').textContent = '0';
    document.getElementById('monthlyWarningDays').textContent = '0';
    document.getElementById('monthlyDangerDays').textContent = '0';
    document.getElementById('monthlyACIssues').textContent = '0';
    document.getElementById('monthlyUPSIssues').textContent = '0';
    document.getElementById('monthlyTempStatus').textContent = '--';
    document.getElementById('monthlyHumidityStatus').textContent = '--';
    
    if (monthlyTrendChart) { monthlyTrendChart.destroy(); monthlyTrendChart = null; }
    if (monthlyStatusChart) { monthlyStatusChart.destroy(); monthlyStatusChart = null; }
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
            html += `<button class="${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
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
    
    const updatedData = {
        date: document.getElementById('editDate').value,
        time: document.getElementById('editTime').value,
        temperature: parseFloat(document.getElementById('editTemperature').value),
        humidity: parseFloat(document.getElementById('editHumidity').value),
        acStatus: document.getElementById('editAcStatus').value,
        upsStatus: document.getElementById('editUpsStatus').value,
        activeServers: parseInt(document.getElementById('editActiveServers').value),
        powerUsage: parseFloat(document.getElementById('editPowerUsage').value)
    };
    
    monitoringData[index] = { ...monitoringData[index], ...updatedData };
    
    await updateDataInFirebase(id, updatedData);
    
    saveDataToLocal();
    closeModal();
    renderTable();
    updateDashboard();
    showToast('Data berhasil diperbarui!');
}

async function deleteData(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return;
    
    monitoringData = monitoringData.filter(d => d.id !== id);
    await deleteDataFromFirebase(id);
    
    saveDataToLocal();
    renderTable();
    updateDashboard();
    showToast('Data berhasil dihapus!', 'success');
}

document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelEdit').addEventListener('click', cancelEdit);
document.getElementById('editForm').addEventListener('submit', saveEdit);

document.getElementById('editModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

// ==================== CLEAR ALL DATA ====================

async function clearAllData() {
    if (!confirm('Apakah Anda yakin ingin menghapus SEMUA data? Tindakan ini tidak dapat dibatalkan!')) {
        return;
    }
    
    await clearAllDataInFirebase();
    monitoringData = [];
    saveDataToLocal();
    showToast('Semua data berhasil dihapus!');
    updateDashboard();
    renderTable();
    location.reload();
}

// ==================== EXPORT FUNCTIONS ====================

function exportToExcel() {
    const exportData = monitoringData.map((d, index) => ({
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
    XLSX.utils.book_append_sheet(wb, ws, 'Data Monitoring');
    
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
    
    const tableData = monitoringData.map((d, index) => [
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
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [241, 245, 249] }
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
    
    let monthData;
    if (firebaseInitialized) {
        monthData = await getDataByMonthFromFirebase(selectedMonth);
    } else {
        monthData = monitoringData.filter(d => d.date.startsWith(selectedMonth));
    }
    
    if (monthData.length === 0) {
        showToast('Tidak ada data untuk bulan ini', 'error');
        return;
    }
    
    const exportData = monthData.map((d, index) => ({
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
    
    let monthData;
    if (firebaseInitialized) {
        monthData = await getDataByMonthFromFirebase(selectedMonth);
    } else {
        monthData = monitoringData.filter(d => d.date.startsWith(selectedMonth));
    }
    
    if (monthData.length === 0) {
        showToast('Tidak ada data untuk bulan ini', 'error');
        return;
    }
    
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
    
    const avgTemp = monthData.reduce((sum, d) => sum + parseFloat(d.temperature), 0) / monthData.length;
    const avgHumidity = monthData.reduce((sum, d) => sum + parseFloat(d.humidity), 0) / monthData.length;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Ringkasan:', 14, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`- Total Pencatatan: ${monthData.length}`, 20, 58);
    doc.text(`- Suhu Rata-rata: ${avgTemp.toFixed(1)}°C`, 20, 65);
    doc.text(`- Kelembaban Rata-rata: ${avgHumidity.toFixed(1)}%`, 20, 72);
    
    const tableData = monthData.map((d, index) => [
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
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [241, 245, 249] }
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
window.clearAllData = clearAllData;
