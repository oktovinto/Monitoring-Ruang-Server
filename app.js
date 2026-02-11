// Server Room Monitoring Web Application
// =========================================

// Data Storage
let monitoringData = [];
let tempHumidityChart = null;
let deviceStatusChart = null;
let currentPage = 1;
const itemsPerPage = 10;

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    loadDataFromStorage();
    initializeDate();
    initializeTabs();
    initializeForm();
    initializeCharts();
    initializeFilters();
    initializeExportButtons();
    updateDashboard();
    renderTable();
});

// Utility Functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
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

// Storage Functions
function loadDataFromStorage() {
    const stored = localStorage.getItem('serverMonitoringData');
    if (stored) {
        monitoringData = JSON.parse(stored);
    } else {
        // Add sample data for demonstration
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

// Initialize Date Display
function initializeDate() {
    const dateDisplay = document.getElementById('currentDate');
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateDisplay.textContent = now.toLocaleDateString('id-ID', options);
    
    // Set default date for form
    document.getElementById('entryDate').value = now.toISOString().split('T')[0];
    document.getElementById('entryTime').value = now.toTimeString().slice(0, 5);
}

// Initialize Tabs
function initializeTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Update active content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(targetTab).classList.add('active');
            
            // Refresh charts if dashboard
            if (targetTab === 'dashboard') {
                updateDashboard();
            }
            
            // Refresh table if history
            if (targetTab === 'history') {
                renderTable();
            }
        });
    });
}

// Initialize Form
function initializeForm() {
    const form = document.getElementById('monitoringForm');
    
    form.addEventListener('submit', function(e) {
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
        
        // Add to data
        monitoringData.unshift(formData);
        saveDataToStorage();
        
        // Show success message
        showToast('Data monitoring berhasil disimpan!');
        
        // Reset form
        form.reset();
        
        // Set current date/time again
        const now = new Date();
        document.getElementById('entryDate').value = now.toISOString().split('T')[0];
        document.getElementById('entryTime').value = now.toTimeString().slice(0, 5);
        
        // Update dashboard
        updateDashboard();
    });
}

// Initialize Charts
function initializeCharts() {
    // Temperature & Humidity Chart
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
    
    // Device Status Chart
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
    
    // Chart period change listener
    document.getElementById('chartPeriod').addEventListener('change', updateDashboard);
}

// Update Dashboard
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
    
    // Calculate averages
    const avgTemp = recentData.reduce((sum, d) => sum + parseFloat(d.temperature), 0) / recentData.length;
    const avgHumidity = recentData.reduce((sum, d) => sum + parseFloat(d.humidity), 0) / recentData.length;
    const avgPower = recentData.reduce((sum, d) => sum + parseFloat(d.powerUsage), 0) / recentData.length;
    const totalServers = recentData.reduce((sum, d) => sum + parseInt(d.activeServers), 0) / recentData.length;
    
    // Update display
    document.getElementById('avgTemp').textContent = avgTemp.toFixed(1) + ' °C';
    document.getElementById('avgHumidity').textContent = avgHumidity.toFixed(1) + ' %';
    document.getElementById('totalPower').textContent = avgPower.toFixed(2) + ' kW';
    document.getElementById('activeDevices').textContent = Math.round(totalServers);
    
    // Update status indicators
    const tempStatus = document.getElementById('tempStatus');
    tempStatus.textContent = getStatusText(avgTemp, 'temperature');
    tempStatus.className = 'status ' + getStatusClass(avgTemp, 'temperature');
    
    const humidityStatus = document.getElementById('humidityStatus');
    humidityStatus.textContent = getStatusText(avgHumidity, 'humidity');
    humidityStatus.className = 'status ' + getStatusClass(avgHumidity, 'humidity');
    
    // Update quick stats
    const alerts = monitoringData.filter(d => 
        parseFloat(d.temperature) > 25 || 
        parseFloat(d.humidity) > 60 ||
        d.acStatus === 'rusak' ||
        d.upsStatus === 'rusak'
    ).length;
    
    document.getElementById('activeAlerts').textContent = alerts;
    document.getElementById('totalRecords').textContent = monitoringData.length;
    document.getElementById('lastUpdate').textContent = monitoringData[0] ? monitoringData[0].time : '--:--';
    
    // Update charts
    updateCharts(recentData);
}

function updateCharts(data) {
    // Update Temperature & Humidity Chart
    const labels = data.map(d => formatDate(d.date));
    const temperatures = data.map(d => d.temperature);
    const humidities = data.map(d => d.humidity);
    
    tempHumidityChart.data.labels = labels;
    tempHumidityChart.data.datasets[0].data = temperatures;
    tempHumidityChart.data.datasets[1].data = humidities;
    tempHumidityChart.update();
    
    // Calculate device status distribution
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

// Initialize Filters
function initializeFilters() {
    document.getElementById('applyFilter').addEventListener('click', applyFilters);
    document.getElementById('resetFilter').addEventListener('click', resetFilters);
}

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

// Render Table
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
    
    // Pagination
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
    
    // Render pagination
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

// Edit Data
function editData(id) {
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

function saveEdit(e) {
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

// Delete Data
function deleteData(id) {
    if (confirm('Apakah Anda yakin ingin menghapus data ini?')) {
        monitoringData = monitoringData.filter(d => d.id !== id);
        saveDataToStorage();
        renderTable();
        updateDashboard();
        showToast('Data berhasil dihapus!', 'success');
    }
}

// Initialize Modal Event Listeners
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelEdit').addEventListener('click', cancelEdit);
document.getElementById('editForm').addEventListener('submit', saveEdit);

// Close modal on outside click
document.getElementById('editModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

// Export Functions
function initializeExportButtons() {
    document.getElementById('exportExcel').addEventListener('click', exportToExcel);
    document.getElementById('exportPDF').addEventListener('click', exportToPDF);
}

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
        'Daya (kW)': d.powerUsage,
        'Status APAR': d.fireExtinguisher === 'siap' ? 'Siap Pakai' : d.fireExtinguisher === 'expired' ? 'Expired' : 'Perlu Maintenance',
        'Catatan': d.notes || '-'
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Monitoring');
    
    // Auto-width columns
    const colWidths = [
        { wch: 5 },
        { wch: 20 },
        { wch: 10 },
        { wch: 12 },
        { wch: 15 },
        { wch: 12 },
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 30 }
    ];
    ws['!cols'] = colWidths;
    
    const fileName = `monitoring_server_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showToast('Data berhasil diexport ke Excel!');
}

function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Laporan Monitoring Ruang Server', 14, 20);
    
    // Date
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 14, 28);
    
    // Table data
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
    
    // Footer
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

// Make functions globally available
window.editData = editData;
window.deleteData = deleteData;
window.changePage = changePage;
window.closeModal = closeModal;
window.cancelEdit = cancelEdit;
window.saveEdit = saveEdit;
