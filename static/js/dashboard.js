// Dashboard JavaScript for Jetson Edge AI Terminal with WebSocket Support
class JetsonDashboard {
    constructor() {
        this.apiBase = '';
        this.refreshInterval = 2000; // 2 seconds
        this.systemRefreshTimer = null;
        this.logsRefreshTimer = null;
        this.chart = null;
        this.socket = null;
        this.currentSection = 'dashboard';
        
        this.init();
    }
    
    init() {
        this.initWebSocket();
        this.setupEventListeners();
        this.setupSidebarNavigation();
        this.updateSystemTime();
        this.loadModels();
        this.loadLogs();
        this.loadStats();
        this.initChart();
        
        // Update system time every second
        setInterval(() => this.updateSystemTime(), 1000);
    }
    
    initWebSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to WebSocket server');
            this.updateConnectionStatus(true);
            this.socket.emit('request_system_data');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from WebSocket server');
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('system_update', (data) => {
            if (data.success && this.currentSection === 'dashboard') {
                this.updateSystemUI(data.data);
            }
        });
        
        this.socket.on('system_data', (data) => {
            if (data.success) {
                this.updateSystemUI(data.data);
            }
        });
    }
    
    setupSidebarNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        const sections = document.querySelectorAll('.content-section');
        
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetSection = item.getAttribute('data-section');
                
                // Update active nav item
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                
                // Update active section
                sections.forEach(section => section.classList.remove('active'));
                const targetElement = document.getElementById(`${targetSection}-section`);
                if (targetElement) {
                    targetElement.classList.add('active');
                    this.currentSection = targetSection;
                    
                    // Load section-specific data
                    this.loadSectionData(targetSection);
                }
            });
        });
    }
    
    loadSectionData(section) {
        switch (section) {
            case 'dashboard':
                if (this.socket) {
                    this.socket.emit('request_system_data');
                }
                break;
            case 'models':
                this.loadModels();
                break;
            case 'monitoring':
                this.loadStats();
                break;
            case 'logs':
                this.loadLogs();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }
    
    setupEventListeners() {
        // System refresh
        document.getElementById('refresh-system').addEventListener('click', () => {
            this.updateSystemMetrics();
        });
        
        // Model upload
        document.getElementById('upload-model').addEventListener('click', () => {
            this.showUploadModal();
        });
        
        // Modal controls
        document.getElementById('close-modal').addEventListener('click', () => {
            this.hideUploadModal();
        });
        
        document.getElementById('cancel-upload').addEventListener('click', () => {
            this.hideUploadModal();
        });
        
        // Model upload form
        document.getElementById('model-upload-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.uploadModel();
        });
        
        // Image upload for inference
        const imageUploadArea = document.getElementById('image-upload-area');
        const imageInput = document.getElementById('image-input');
        
        imageUploadArea.addEventListener('click', () => {
            imageInput.click();
        });
        
        imageUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            imageUploadArea.style.borderColor = 'var(--primary-cyan)';
        });
        
        imageUploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            imageUploadArea.style.borderColor = 'var(--border-color)';
        });
        
        imageUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            imageUploadArea.style.borderColor = 'var(--border-color)';
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleImageUpload(files[0]);
            }
        });
        
        imageInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleImageUpload(e.target.files[0]);
            }
        });
        
        // Log controls
        document.getElementById('refresh-logs').addEventListener('click', () => {
            this.loadLogs();
        });
        
        document.getElementById('clear-logs').addEventListener('click', () => {
            this.clearLogs();
        });
        
        // Stats timeframe change
        document.getElementById('stats-timeframe').addEventListener('change', () => {
            this.loadStats();
        });
        
        // Close modal on outside click
        document.getElementById('upload-modal').addEventListener('click', (e) => {
            if (e.target.id === 'upload-modal') {
                this.hideUploadModal();
            }
        });
    }
    
    updateSystemTime() {
        const now = new Date();
        const timeString = now.toISOString().replace('T', ' ').substring(0, 19);
        document.getElementById('system-time').textContent = timeString + ' UTC';
    }
    
    updateSystemUI(systemData) {
        // CPU metrics
        document.getElementById('cpu-usage').textContent = `${systemData.cpu.usage.toFixed(1)}%`;
        document.getElementById('cpu-progress').style.width = `${systemData.cpu.usage}%`;
        document.getElementById('cpu-freq').textContent = (systemData.cpu.frequency / 1000).toFixed(2);
        document.getElementById('cpu-temp').textContent = systemData.cpu.temperature.toFixed(1);
        
        // GPU metrics
        document.getElementById('gpu-usage').textContent = `${systemData.gpu.usage.toFixed(1)}%`;
        document.getElementById('gpu-progress').style.width = `${systemData.gpu.usage}%`;
        const gpuMemUsed = (systemData.gpu.memory_used / (1024 * 1024)).toFixed(0);
        const gpuMemTotal = (systemData.gpu.memory_total / (1024 * 1024)).toFixed(0);
        document.getElementById('gpu-memory').textContent = `${gpuMemUsed}/${gpuMemTotal}`;
        document.getElementById('gpu-temp').textContent = systemData.gpu.temperature.toFixed(1);
        
        // Memory metrics
        document.getElementById('memory-usage').textContent = `${systemData.memory.percent.toFixed(1)}%`;
        document.getElementById('memory-progress').style.width = `${systemData.memory.percent}%`;
        document.getElementById('memory-used').textContent = (systemData.memory.used / (1024**3)).toFixed(1);
        document.getElementById('memory-total').textContent = (systemData.memory.total / (1024**3)).toFixed(1);
        
        // Storage metrics
        document.getElementById('storage-usage').textContent = `${systemData.disk.percent.toFixed(1)}%`;
        document.getElementById('storage-progress').style.width = `${systemData.disk.percent}%`;
        document.getElementById('storage-free').textContent = (systemData.disk.free / (1024**3)).toFixed(1);
        document.getElementById('storage-total').textContent = (systemData.disk.total / (1024**3)).toFixed(1);
        
        // Update progress bar colors based on usage
        this.updateProgressBarColor('cpu-progress', systemData.cpu.usage);
        this.updateProgressBarColor('gpu-progress', systemData.gpu.usage);
        this.updateProgressBarColor('memory-progress', systemData.memory.percent);
        this.updateProgressBarColor('storage-progress', systemData.disk.percent);
    }
    
    updateProgressBarColor(elementId, percentage) {
        const element = document.getElementById(elementId);
        if (percentage > 80) {
            element.style.background = 'linear-gradient(90deg, var(--error-color), var(--secondary-red))';
        } else if (percentage > 60) {
            element.style.background = 'linear-gradient(90deg, var(--warning-color), var(--light-red))';
        } else {
            element.style.background = 'linear-gradient(90deg, var(--primary-red), var(--secondary-red))';
        }
    }
    
    updateConnectionStatus(online) {
        const statusElement = document.getElementById('connection-status');
        if (online) {
            statusElement.textContent = 'ONLINE';
            statusElement.className = 'status-value online';
        } else {
            statusElement.textContent = 'OFFLINE';
            statusElement.className = 'status-value offline';
        }
    }
    
    async loadModels() {
        try {
            const response = await fetch(`${this.apiBase}/api/models`);
            const data = await response.json();
            
            if (data.success) {
                this.updateModelsUI(data.data);
                this.updateModelSelector(data.data);
                document.getElementById('models-loaded').textContent = data.data.filter(m => m.loaded).length;
            } else {
                this.showError('Failed to load models');
            }
        } catch (error) {
            console.error('Error loading models:', error);
        }
    }
    
    updateModelsUI(models) {
        const modelsGrid = document.getElementById('models-grid');
        modelsGrid.innerHTML = '';
        
        if (models.length === 0) {
            modelsGrid.innerHTML = `
                <div class="no-models">
                    <i class="fas fa-brain"></i>
                    <p>No models uploaded yet</p>
                    <p>Upload a model to get started</p>
                </div>
            `;
            return;
        }
        
        models.forEach(model => {
            const modelCard = this.createModelCard(model);
            modelsGrid.appendChild(modelCard);
        });
    }
    
    createModelCard(model) {
        const card = document.createElement('div');
        card.className = `model-card ${model.loaded ? 'loaded' : ''}`;
        
        const fileSizeMB = (model.file_size / (1024 * 1024)).toFixed(1);
        const framework = model.framework.toUpperCase();
        
        card.innerHTML = `
            <div class="model-header">
                <div class="model-name">${model.name}</div>
                <div class="model-status ${model.loaded ? 'loaded' : 'unloaded'}">
                    ${model.loaded ? 'LOADED' : 'UNLOADED'}
                </div>
            </div>
            <div class="model-info">
                <div>Type: ${model.type}</div>
                <div>Framework: ${framework}</div>
                <div>Size: ${fileSizeMB} MB</div>
                <div>Inferences: ${model.inference_count}</div>
            </div>
            ${model.description ? `<div class="model-description">${model.description}</div>` : ''}
            <div class="model-actions">
                ${!model.loaded ? 
                    `<button class="btn-primary btn-small" onclick="dashboard.loadModel('${model.id}')">
                        <i class="fas fa-play"></i> LOAD
                    </button>` :
                    `<button class="btn-secondary btn-small" onclick="dashboard.unloadModel('${model.id}')">
                        <i class="fas fa-stop"></i> UNLOAD
                    </button>`
                }
                <button class="btn-secondary btn-small" onclick="dashboard.deleteModel('${model.id}')">
                    <i class="fas fa-trash"></i> DELETE
                </button>
            </div>
        `;
        
        return card;
    }
    
    updateModelSelector(models) {
        const selector = document.getElementById('model-selector');
        selector.innerHTML = '<option value="">Select Model</option>';
        
        models.filter(m => m.loaded).forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = `${model.name} (${model.framework.toUpperCase()})`;
            selector.appendChild(option);
        });
    }
    
    async loadModel(modelId) {
        this.showLoading('Loading model...');
        
        try {
            const response = await fetch(`${this.apiBase}/api/models/${modelId}/load`, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.success) {
                this.showSuccess(`Model loaded successfully in ${data.data.load_time.toFixed(2)}s`);
                this.loadModels(); // Refresh models list
            } else {
                this.showError(`Failed to load model: ${data.error}`);
            }
        } catch (error) {
            console.error('Error loading model:', error);
            this.showError('Error loading model');
        } finally {
            this.hideLoading();
        }
    }
    
    async unloadModel(modelId) {
        // Implementation for unloading model
        this.showInfo('Model unload feature coming soon');
    }
    
    async deleteModel(modelId) {
        if (!confirm('Are you sure you want to delete this model?')) {
            return;
        }
        
        this.showInfo('Model deletion feature coming soon');
    }
    
    showUploadModal() {
        document.getElementById('upload-modal').classList.add('show');
    }
    
    hideUploadModal() {
        document.getElementById('upload-modal').classList.remove('show');
        document.getElementById('model-upload-form').reset();
    }
    
    async uploadModel() {
        const form = document.getElementById('model-upload-form');
        const formData = new FormData();
        
        const modelName = document.getElementById('model-name').value;
        const modelType = document.getElementById('model-type').value;
        const modelDescription = document.getElementById('model-description').value;
        const modelFile = document.getElementById('model-file').files[0];
        
        if (!modelFile) {
            this.showError('Please select a model file');
            return;
        }
        
        formData.append('model_name', modelName);
        formData.append('model_type', modelType);
        formData.append('description', modelDescription);
        formData.append('file', modelFile);
        
        this.showLoading('Uploading model...');
        
        try {
            const response = await fetch(`${this.apiBase}/api/models/upload`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showSuccess('Model uploaded successfully');
                this.hideUploadModal();
                this.loadModels(); // Refresh models list
            } else {
                this.showError(`Upload failed: ${data.error}`);
            }
        } catch (error) {
            console.error('Error uploading model:', error);
            this.showError('Error uploading model');
        } finally {
            this.hideLoading();
        }
    }
    
    handleImageUpload(file) {
        if (!file.type.startsWith('image/')) {
            this.showError('Please select an image file');
            return;
        }
        
        const modelId = document.getElementById('model-selector').value;
        if (!modelId) {
            this.showError('Please select a model first');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('uploaded-image').src = e.target.result;
            this.runInference(file, modelId);
        };
        reader.readAsDataURL(file);
    }
    
    async runInference(imageFile, modelId) {
        this.showLoading('Running inference...');
        
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('model_id', modelId);
        
        try {
            const response = await fetch(`${this.apiBase}/api/inference`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.displayInferenceResults(data.data);
                this.showSuccess(`Inference completed in ${(data.data.inference_time * 1000).toFixed(0)}ms`);
            } else {
                this.showError(`Inference failed: ${data.error}`);
            }
        } catch (error) {
            console.error('Error running inference:', error);
            this.showError('Error running inference');
        } finally {
            this.hideLoading();
        }
    }
    
    displayInferenceResults(data) {
        document.getElementById('inference-results').style.display = 'grid';
        document.getElementById('inference-time').textContent = (data.inference_time * 1000).toFixed(0);
        document.getElementById('inference-model').textContent = data.model_id;
        
        const resultsTable = document.getElementById('results-table');
        resultsTable.innerHTML = '';
        
        if (data.result && data.result.predictions) {
            data.result.predictions.forEach((prediction, index) => {
                const resultItem = document.createElement('div');
                resultItem.className = 'result-item';
                resultItem.innerHTML = `
                    <span>Class ${prediction.class_id}</span>
                    <span>${(prediction.confidence * 100).toFixed(2)}%</span>
                `;
                resultsTable.appendChild(resultItem);
            });
        }
    }
    
    async loadLogs() {
        try {
            const response = await fetch(`${this.apiBase}/api/logs/requests?per_page=20`);
            const data = await response.json();
            
            if (data.success) {
                this.updateLogsUI(data.data.logs);
            }
        } catch (error) {
            console.error('Error loading logs:', error);
        }
    }
    
    updateLogsUI(logs) {
        const logContainer = document.getElementById('log-container');
        logContainer.innerHTML = '';
        
        logs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            const level = this.getLogLevel(log);
            
            logEntry.innerHTML = `
                <span class="log-timestamp">${timestamp}</span>
                <span class="log-level ${level.toLowerCase()}">${level}</span>
                <span class="log-message">${log.endpoint} - ${log.client_ip}</span>
            `;
            
            logContainer.appendChild(logEntry);
        });
    }
    
    getLogLevel(log) {
        if (log.status_code >= 400) return 'ERROR';
        if (log.status_code >= 300) return 'WARNING';
        return 'INFO';
    }
    
    clearLogs() {
        document.getElementById('log-container').innerHTML = '';
        this.showInfo('Logs cleared');
    }
    
    async loadStats() {
        try {
            const response = await fetch(`${this.apiBase}/api/logs/stats`);
            const data = await response.json();
            
            if (data.success) {
                this.updateStatsUI(data.data);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }
    
    updateStatsUI(stats) {
        if (stats.requests_24h) {
            document.getElementById('total-requests').textContent = stats.requests_24h.total;
            document.getElementById('unique-clients').textContent = stats.requests_24h.unique_clients;
            const avgTime = stats.requests_24h.avg_response_time ? 
                (stats.requests_24h.avg_response_time * 1000).toFixed(0) : 0;
            document.getElementById('avg-response-time').textContent = `${avgTime}ms`;
        }
        
        if (stats.inference_24h) {
            document.getElementById('total-inferences').textContent = stats.inference_24h.total;
        }
        
        if (stats.hourly_distribution && this.chart) {
            this.updateChart(stats.hourly_distribution);
        }
    }
    
    initChart() {
        const ctx = document.getElementById('activity-chart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({length: 24}, (_, i) => `${i}:00`),
                datasets: [{
                    label: 'Requests per Hour',
                    data: new Array(24).fill(0),
                    borderColor: 'rgb(0, 255, 255)',
                    backgroundColor: 'rgba(0, 255, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#ffffff'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#cccccc'
                        },
                        grid: {
                            color: '#333333'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#cccccc'
                        },
                        grid: {
                            color: '#333333'
                        }
                    }
                }
            }
        });
    }
    
    updateChart(hourlyData) {
        const data = new Array(24).fill(0);
        hourlyData.forEach(item => {
            data[item.hour] = item.count;
        });
        
        this.chart.data.datasets[0].data = data;
        this.chart.update();
    }
    
    showLoading(text = 'Loading...') {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading-overlay').classList.add('show');
    }
    
    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('show');
    }
    
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    showSuccess(message) {
        this.showNotification(message, 'success');
    }
    
    showInfo(message) {
        this.showNotification(message, 'info');
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
        `;
        
        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: '5px',
            color: '#ffffff',
            fontFamily: 'Share Tech Mono, monospace',
            fontSize: '0.9rem',
            zIndex: '3000',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            border: '2px solid',
            animation: 'slideInRight 0.3s ease'
        });
        
        // Set colors based on type
        switch (type) {
            case 'error':
                notification.style.background = 'var(--error-color)';
                notification.style.borderColor = 'var(--error-color)';
                break;
            case 'success':
                notification.style.background = 'var(--success-color)';
                notification.style.borderColor = 'var(--success-color)';
                break;
            default:
                notification.style.background = 'var(--neon-blue)';
                notification.style.borderColor = 'var(--neon-blue)';
        }
        
        // Add to document
        document.body.appendChild(notification);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
    
    getNotificationIcon(type) {
        switch (type) {
            case 'error': return 'fa-exclamation-triangle';
            case 'success': return 'fa-check-circle';
            default: return 'fa-info-circle';
        }
    }
    
    // Settings Section Methods
    loadSettings() {
        if (!this.settings) {
            this.settings = new Components.SettingsSection();
            this.settings.mount('#settings-section');
            
            // Update global app object
            if (window.app) {
                window.app.settings = this.settings;
            }
        }
        
        // Load system data for settings
        this.settings.loadSystemInfo();
    }
    
    // Global app object to make methods accessible to components
    getAppContext() {
        return {
            settings: this.settings,
            showNotification: this.showNotification.bind(this),
            socket: this.socket
        };
    }
}

// CSS for notifications
const notificationStyles = `
@keyframes slideInRight {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slideOutRight {
    from {
        transform: translateX(0);
        opacity: 1;
    }
    to {
        transform: translateX(100%);
        opacity: 0;
    }
}
`;

// Add notification styles to document
const styleSheet = document.createElement('style');
styleSheet.textContent = notificationStyles;
document.head.appendChild(styleSheet);

// Initialize dashboard when DOM is loaded
let dashboard;
let app; // Global app object for component access

document.addEventListener('DOMContentLoaded', () => {
    dashboard = new JetsonDashboard();
    
    // Create global app object for components
    app = {
        settings: null, // Will be set when settings section is loaded
        showNotification: dashboard.showNotification.bind(dashboard),
        socket: dashboard.socket,
        dashboard: dashboard
    };
    
    // Make app globally accessible
    window.app = app;
});

// Make dashboard globally available for onclick handlers
window.dashboard = dashboard;