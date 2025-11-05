// React-like NVIDIA Dashboard Application
class NVIDIADashboard {
    constructor() {
        this.apiBase = '';
        this.socket = null;
        this.currentSection = 'dashboard';
        this.components = {};
        this.connected = false;
        
        this.init();
    }
    
    init() {
        this.initComponents();
        this.initWebSocket();
        this.setupNavigation();
        this.switchSection('dashboard');
        
        // Start real-time updates
        setInterval(() => this.updateSystemTime(), 1000);
    }
    
    initComponents() {
        // Initialize all section components
        this.components = {
            dashboard: new Components.DashboardSection({ connected: this.connected }),
            models: new Components.ModelsSection(),
            inference: new Components.InferenceSection(),
            monitoring: new Components.MonitoringSection(),
            logs: new Components.LogsSection(),
            settings: new Components.SettingsSection()
        };
    }
    
    initWebSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('🔗 Connected to NVIDIA Dashboard WebSocket');
            this.connected = true;
            this.updateConnectionStatus(true);
            this.socket.emit('request_system_data');
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from WebSocket server');
            this.connected = false;
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('system_update', (data) => {
            if (data.success) {
                this.handleSystemUpdate(data.data);
            }
        });
        
        this.socket.on('system_data', (data) => {
            if (data.success) {
                this.handleSystemUpdate(data.data);
            }
        });
        
        // Request initial data
        this.socket.on('connect', () => {
            this.socket.emit('request_system_data');
        });
    }
    
    setupNavigation() {
        // Setup sidebar navigation
        document.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            if (navItem) {
                const section = navItem.dataset.section;
                if (section) {
                    this.switchSection(section);
                }
            }
        });
        
        // Setup keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case '1': this.switchSection('dashboard'); e.preventDefault(); break;
                    case '2': this.switchSection('models'); e.preventDefault(); break;
                    case '3': this.switchSection('inference'); e.preventDefault(); break;
                    case '4': this.switchSection('monitoring'); e.preventDefault(); break;
                    case '5': this.switchSection('logs'); e.preventDefault(); break;
                    case '6': this.switchSection('settings'); e.preventDefault(); break;
                }
            }
        });
    }
    
    switchSection(sectionName) {
        // Update current section
        this.currentSection = sectionName;
        
        // Update navigation active state
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.section === sectionName) {
                item.classList.add('active');
            }
        });
        
        // Mount the component for the selected section
        const component = this.components[sectionName];
        if (component) {
            component.mount('#main-content');
            
            // Load section-specific data
            this.loadSectionData(sectionName);
        }
        
        // Update page title
        document.title = `NVIDIA Dashboard - ${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}`;
    }
    
    async loadSectionData(section) {
        try {
            switch(section) {
                case 'dashboard':
                    this.loadSystemData();
                    break;
                case 'models':
                    this.loadModels();
                    break;
                case 'inference':
                    this.loadInferenceData();
                    break;
                case 'monitoring':
                    this.initMonitoringCharts();
                    break;
                case 'logs':
                    this.loadLogs();
                    break;
                case 'settings':
                    this.loadSettings();
                    break;
            }
        } catch (error) {
            console.error(`Error loading ${section} data:`, error);
            this.showNotification(`Failed to load ${section} data`, 'error');
        }
    }
    
    async loadSystemData() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('request_system_data');
        } else {
            // Fallback to HTTP request
            try {
                const response = await fetch(`${this.apiBase}/api/system/status`);
                const data = await response.json();
                if (data.success) {
                    this.handleSystemUpdate(data.data);
                }
            } catch (error) {
                console.error('Error loading system data:', error);
            }
        }
    }
    
    async loadModels() {
        try {
            const response = await fetch(`${this.apiBase}/api/models`);
            const data = await response.json();
            if (data.success && this.components.models) {
                this.components.models.updateModels(data.data);
            }
        } catch (error) {
            console.error('Error loading models:', error);
            this.showNotification('Failed to load models', 'error');
        }
    }
    
    async loadInferenceData() {
        // Load available models for inference
        await this.loadModels();
        
        // Load inference history
        try {
            const response = await fetch(`${this.apiBase}/api/inference/history`);
            const data = await response.json();
            if (data.success && this.components.inference) {
                this.components.inference.setState({ inferenceHistory: data.data });
            }
        } catch (error) {
            console.error('Error loading inference data:', error);
        }
    }
    
    async loadLogs() {
        try {
            const response = await fetch(`${this.apiBase}/api/logs/requests`);
            const data = await response.json();
            if (data.success && this.components.logs) {
                this.components.logs.updateLogs(data.data);
            }
        } catch (error) {
            console.error('Error loading logs:', error);
            this.showNotification('Failed to load logs', 'error');
        }
    }
    
    loadSettings() {
        // Load settings from localStorage or server
        const settings = localStorage.getItem('nvidia-dashboard-settings');
        if (settings && this.components.settings) {
            this.components.settings.setState({ settings: JSON.parse(settings) });
        }
    }
    
    initMonitoringCharts() {
        // Initialize monitoring charts
        setTimeout(() => {
            if (this.currentSection === 'monitoring') {
                this.createChart('cpu-chart', 'CPU Usage');
                this.createChart('gpu-chart', 'GPU Usage');
                this.createChart('memory-chart', 'Memory Usage');
                this.createChart('temp-chart', 'Temperature');
            }
        }, 100);
    }
    
    createChart(canvasId, label) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Simple chart implementation (you could use Chart.js here)
        this.drawChart(ctx, label, canvas.width, canvas.height);
    }
    
    drawChart(ctx, label, width, height) {
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Set NVIDIA green color
        ctx.strokeStyle = '#76B900';
        ctx.fillStyle = 'rgba(118, 185, 0, 0.1)';
        ctx.lineWidth = 2;
        
        // Draw chart background
        ctx.fillStyle = 'rgba(118, 185, 0, 0.05)';
        ctx.fillRect(0, 0, width, height);
        
        // Draw grid lines
        ctx.strokeStyle = 'rgba(118, 185, 0, 0.2)';
        ctx.lineWidth = 1;
        
        // Vertical lines
        for (let i = 0; i <= 10; i++) {
            const x = (width / 10) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let i = 0; i <= 5; i++) {
            const y = (height / 5) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Draw sample data line
        ctx.strokeStyle = '#76B900';
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        for (let i = 0; i < width; i += 5) {
            const y = height / 2 + Math.sin(i * 0.02) * height / 4 + Math.random() * 20 - 10;
            if (i === 0) {
                ctx.moveTo(i, y);
            } else {
                ctx.lineTo(i, y);
            }
        }
        ctx.stroke();
        
        // Draw label
        ctx.fillStyle = '#76B900';
        ctx.font = '16px Segoe UI';
        ctx.fillText(label, 10, 25);
    }
    
    handleSystemUpdate(systemData) {
        // Update dashboard component if active
        if (this.currentSection === 'dashboard' && this.components.dashboard) {
            this.components.dashboard.updateSystemData(systemData);
        }
        
        // Update monitoring charts if active
        if (this.currentSection === 'monitoring') {
            this.updateMonitoringCharts(systemData);
        }
    }
    
    updateMonitoringCharts(data) {
        // Update real-time charts with new data
        // This would typically involve updating Chart.js instances
        console.log('Updating monitoring charts with:', data);
    }
    
    updateConnectionStatus(connected) {
        this.connected = connected;
        
        // Update all components that need connection status
        if (this.components.dashboard) {
            this.components.dashboard.props.connected = connected;
            if (this.currentSection === 'dashboard') {
                this.components.dashboard.render();
            }
        }
        
        // Update connection indicator in header
        const statusDot = document.querySelector('.status-dot');
        if (statusDot) {
            statusDot.style.background = connected ? '#76B900' : '#FF4444';
        }
        
        const statusText = document.querySelector('#connection-status');
        if (statusText) {
            statusText.textContent = connected ? 'ONLINE' : 'OFFLINE';
            statusText.className = `status-value ${connected ? 'online' : 'offline'}`;
        }
    }
    
    updateSystemTime() {
        const timeElement = document.getElementById('system-time');
        if (timeElement) {
            const now = new Date();
            timeElement.textContent = now.toLocaleString();
        }
    }
    
    showNotification(message, type = 'info', duration = 5000) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Auto-remove after duration
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, duration);
    }
    
    getNotificationIcon(type) {
        switch (type) {
            case 'success': return 'check-circle';
            case 'error': return 'exclamation-triangle';
            case 'warning': return 'exclamation-circle';
            default: return 'info-circle';
        }
    }
    
    // Public API methods for component interactions
    async runInference() {
        this.showNotification('Running inference...', 'info');
        // Implementation here
    }
    
    async uploadModel() {
        this.showNotification('Upload model functionality coming soon!', 'info');
    }
    
    async deleteModel(modelId) {
        if (confirm('Are you sure you want to delete this model?')) {
            this.showNotification('Model deleted', 'success');
            this.loadModels();
        }
    }
    
    updateSetting(key, value) {
        if (this.components.settings) {
            this.components.settings.updateSetting(key, value);
            
            // Save to localStorage
            const settings = this.components.settings.state.settings;
            localStorage.setItem('nvidia-dashboard-settings', JSON.stringify(settings));
            
            this.showNotification('Setting updated', 'success');
        }
    }
    
    exportLogs() {
        this.showNotification('Exporting logs...', 'info');
        // Implementation here
    }
    
    clearLogs() {
        if (confirm('Are you sure you want to clear all logs?')) {
            this.showNotification('Logs cleared', 'success');
            this.loadLogs();
        }
    }
}

// Initialize the application
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new NVIDIADashboard();
    window.app = app; // Make globally available for onclick handlers
});

// Export for global access
window.NVIDIADashboard = NVIDIADashboard;