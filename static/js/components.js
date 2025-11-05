// React-like Component System for Jetson Dashboard
class Component {
    constructor(props = {}) {
        this.props = props;
        this.state = {};
        this.element = null;
    }
    
    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.render();
    }
    
    render() {
        // Override in child components
        return '';
    }
    
    mount(container) {
        if (typeof container === 'string') {
            container = document.querySelector(container);
        }
        if (container) {
            container.innerHTML = this.render();
            this.element = container;
            this.componentDidMount();
        }
    }
    
    componentDidMount() {
        // Override in child components
    }
    
    componentWillUnmount() {
        // Override in child components
    }
}

// Dashboard Section Components
class DashboardSection extends Component {
    constructor(props) {
        super(props);
        this.state = {
            systemData: {
                cpu: { usage: 0, frequency: 0, temperature: 0 },
                gpu: { usage: 0, memory_used: 0, memory_total: 0, temperature: 0 },
                memory: { used: 0, total: 0, percent: 0 },
                disk: { used: 0, total: 0, free: 0, percent: 0 }
            }
        };
    }
    
    render() {
        const { systemData } = this.state;
        return `
            <div class="section-content">
                <div class="section-header">
                    <h2><i class="fas fa-tachometer-alt"></i> System Overview</h2>
                    <div class="header-controls">
                        <span class="status-indicator ${this.props.connected ? 'online' : 'offline'}">
                            <i class="fas fa-circle"></i> ${this.props.connected ? 'ONLINE' : 'OFFLINE'}
                        </span>
                    </div>
                </div>
                
                <div class="metrics-grid">
                    ${this.renderMetricCard('CPU', 'microchip', systemData.cpu)}
                    ${this.renderMetricCard('GPU', 'video', systemData.gpu)}
                    ${this.renderMetricCard('Memory', 'memory', systemData.memory)}
                    ${this.renderMetricCard('Storage', 'hdd', systemData.disk)}
                </div>
                
                <div class="charts-section">
                    <div class="chart-container">
                        <h3>System Performance</h3>
                        <canvas id="system-chart" width="400" height="200"></canvas>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderMetricCard(title, icon, data) {
        const usage = data.usage || data.percent || 0;
        const color = usage > 80 ? 'critical' : usage > 60 ? 'warning' : 'normal';
        
        return `
            <div class="metric-card ${color}">
                <div class="metric-header">
                    <i class="fas fa-${icon}"></i>
                    <h3>${title}</h3>
                </div>
                <div class="metric-value">
                    <span class="primary-value">${usage.toFixed(1)}%</span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${usage}%"></div>
                    </div>
                </div>
                <div class="metric-details">
                    ${this.renderMetricDetails(title, data)}
                </div>
            </div>
        `;
    }
    
    renderMetricDetails(type, data) {
        switch(type) {
            case 'CPU':
                return `
                    <div class="detail-item">
                        <span>Frequency:</span>
                        <span>${(data.frequency / 1000).toFixed(2)} GHz</span>
                    </div>
                    <div class="detail-item">
                        <span>Temperature:</span>
                        <span>${data.temperature?.toFixed(1) || 'N/A'}°C</span>
                    </div>
                `;
            case 'GPU':
                return `
                    <div class="detail-item">
                        <span>Memory:</span>
                        <span>${(data.memory_used / 1024 / 1024).toFixed(0)}MB / ${(data.memory_total / 1024 / 1024).toFixed(0)}MB</span>
                    </div>
                    <div class="detail-item">
                        <span>Temperature:</span>
                        <span>${data.temperature?.toFixed(1) || 'N/A'}°C</span>
                    </div>
                `;
            case 'Memory':
                return `
                    <div class="detail-item">
                        <span>Used:</span>
                        <span>${(data.used / 1024**3).toFixed(1)} GB</span>
                    </div>
                    <div class="detail-item">
                        <span>Total:</span>
                        <span>${(data.total / 1024**3).toFixed(1)} GB</span>
                    </div>
                `;
            case 'Storage':
                return `
                    <div class="detail-item">
                        <span>Free:</span>
                        <span>${(data.free / 1024**3).toFixed(1)} GB</span>
                    </div>
                    <div class="detail-item">
                        <span>Total:</span>
                        <span>${(data.total / 1024**3).toFixed(1)} GB</span>
                    </div>
                `;
            default:
                return '';
        }
    }
    
    updateSystemData(data) {
        this.setState({ systemData: data });
    }
}

class ModelsSection extends Component {
    constructor(props) {
        super(props);
        this.state = {
            models: [],
            loading: true
        };
    }
    
    render() {
        const { models, loading } = this.state;
        return `
            <div class="section-content">
                <div class="section-header">
                    <h2><i class="fas fa-brain"></i> AI Models</h2>
                    <div class="header-controls">
                        <button class="btn-primary" onclick="app.showUploadModal()">
                            <i class="fas fa-upload"></i> Upload Model
                        </button>
                    </div>
                </div>
                
                ${loading ? this.renderLoading() : this.renderModelsGrid(models)}
            </div>
        `;
    }
    
    renderLoading() {
        return `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p>Loading models...</p>
            </div>
        `;
    }
    
    renderModelsGrid(models) {
        if (models.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-brain"></i>
                    <h3>No Models Found</h3>
                    <p>Upload your first AI model to get started</p>
                    <button class="btn-primary" onclick="app.showUploadModal()">
                        <i class="fas fa-upload"></i> Upload Model
                    </button>
                </div>
            `;
        }
        
        return `
            <div class="models-grid">
                ${models.map(model => this.renderModelCard(model)).join('')}
            </div>
        `;
    }
    
    renderModelCard(model) {
        return `
            <div class="model-card">
                <div class="model-header">
                    <h3>${model.name}</h3>
                    <span class="model-type">${model.type}</span>
                </div>
                <div class="model-details">
                    <div class="detail-row">
                        <span>Size:</span>
                        <span>${(model.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                    <div class="detail-row">
                        <span>Framework:</span>
                        <span>${model.framework}</span>
                    </div>
                    <div class="detail-row">
                        <span>Status:</span>
                        <span class="status-badge ${model.status}">${model.status}</span>
                    </div>
                </div>
                <div class="model-actions">
                    <button class="btn-primary" onclick="app.loadModel('${model.id}')">
                        <i class="fas fa-play"></i> Load
                    </button>
                    <button class="btn-secondary" onclick="app.deleteModel('${model.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
    }
    
    updateModels(models) {
        this.setState({ models, loading: false });
    }
}

class InferenceSection extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedModel: null,
            inferenceHistory: [],
            processing: false
        };
    }
    
    render() {
        return `
            <div class="section-content">
                <div class="section-header">
                    <h2><i class="fas fa-rocket"></i> AI Inference</h2>
                </div>
                
                <div class="inference-workspace">
                    <div class="inference-panel">
                        <h3>Run Inference</h3>
                        <div class="model-selector">
                            <label>Select Model:</label>
                            <select id="model-select" onchange="app.selectModel(this.value)">
                                <option value="">Choose a model...</option>
                                <!-- Models will be populated dynamically -->
                            </select>
                        </div>
                        
                        <div class="input-section">
                            <label>Input Data:</label>
                            <div class="input-methods">
                                <button class="btn-secondary" onclick="app.uploadImage()">
                                    <i class="fas fa-image"></i> Upload Image
                                </button>
                                <button class="btn-secondary" onclick="app.takePhoto()">
                                    <i class="fas fa-camera"></i> Take Photo
                                </button>
                                <button class="btn-secondary" onclick="app.enterText()">
                                    <i class="fas fa-keyboard"></i> Enter Text
                                </button>
                            </div>
                        </div>
                        
                        <div class="inference-controls">
                            <button class="btn-primary" onclick="app.runInference()" ${this.state.processing ? 'disabled' : ''}>
                                <i class="fas fa-play"></i> ${this.state.processing ? 'Processing...' : 'Run Inference'}
                            </button>
                        </div>
                    </div>
                    
                    <div class="results-panel">
                        <h3>Results</h3>
                        <div class="results-container" id="inference-results">
                            <div class="empty-results">
                                <i class="fas fa-chart-line"></i>
                                <p>Run an inference to see results here</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="inference-history">
                    <h3>Recent Inferences</h3>
                    ${this.renderInferenceHistory()}
                </div>
            </div>
        `;
    }
    
    renderInferenceHistory() {
        const { inferenceHistory } = this.state;
        if (inferenceHistory.length === 0) {
            return `
                <div class="empty-state">
                    <p>No inference history yet</p>
                </div>
            `;
        }
        
        return `
            <div class="history-list">
                ${inferenceHistory.map(item => this.renderHistoryItem(item)).join('')}
            </div>
        `;
    }
    
    renderHistoryItem(item) {
        return `
            <div class="history-item">
                <div class="history-info">
                    <span class="model-name">${item.model}</span>
                    <span class="timestamp">${new Date(item.timestamp).toLocaleString()}</span>
                </div>
                <div class="history-result">
                    <span class="confidence">${(item.confidence * 100).toFixed(1)}%</span>
                    <span class="result-text">${item.result}</span>
                </div>
            </div>
        `;
    }
}

class MonitoringSection extends Component {
    render() {
        return `
            <div class="section-content">
                <div class="section-header">
                    <h2><i class="fas fa-chart-line"></i> System Monitoring</h2>
                </div>
                
                <div class="monitoring-dashboard">
                    <div class="monitoring-charts">
                        <div class="chart-card">
                            <h3>CPU Usage Over Time</h3>
                            <canvas id="cpu-chart" width="400" height="200"></canvas>
                        </div>
                        <div class="chart-card">
                            <h3>GPU Usage Over Time</h3>
                            <canvas id="gpu-chart" width="400" height="200"></canvas>
                        </div>
                        <div class="chart-card">
                            <h3>Memory Usage Over Time</h3>
                            <canvas id="memory-chart" width="400" height="200"></canvas>
                        </div>
                        <div class="chart-card">
                            <h3>Temperature Monitoring</h3>
                            <canvas id="temp-chart" width="400" height="200"></canvas>
                        </div>
                    </div>
                    
                    <div class="monitoring-controls">
                        <div class="control-group">
                            <label>Update Interval:</label>
                            <select id="update-interval" onchange="app.setUpdateInterval(this.value)">
                                <option value="1000">1 second</option>
                                <option value="2000" selected>2 seconds</option>
                                <option value="5000">5 seconds</option>
                                <option value="10000">10 seconds</option>
                            </select>
                        </div>
                        
                        <div class="control-group">
                            <label>Data Points:</label>
                            <select id="data-points" onchange="app.setDataPoints(this.value)">
                                <option value="50">50 points</option>
                                <option value="100" selected>100 points</option>
                                <option value="200">200 points</option>
                            </select>
                        </div>
                        
                        <button class="btn-secondary" onclick="app.exportMonitoringData()">
                            <i class="fas fa-download"></i> Export Data
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

class LogsSection extends Component {
    constructor(props) {
        super(props);
        this.state = {
            logs: [],
            filter: 'all',
            search: ''
        };
    }
    
    render() {
        return `
            <div class="section-content">
                <div class="section-header">
                    <h2><i class="fas fa-list"></i> System Logs</h2>
                    <div class="header-controls">
                        <button class="btn-secondary" onclick="app.clearLogs()">
                            <i class="fas fa-trash"></i> Clear Logs
                        </button>
                        <button class="btn-secondary" onclick="app.exportLogs()">
                            <i class="fas fa-download"></i> Export
                        </button>
                    </div>
                </div>
                
                <div class="logs-controls">
                    <div class="filter-group">
                        <label>Filter:</label>
                        <select id="log-filter" onchange="app.filterLogs(this.value)">
                            <option value="all">All Logs</option>
                            <option value="info">Info</option>
                            <option value="warning">Warnings</option>
                            <option value="error">Errors</option>
                            <option value="system">System</option>
                            <option value="inference">Inference</option>
                        </select>
                    </div>
                    
                    <div class="search-group">
                        <input type="text" id="log-search" placeholder="Search logs..." onkeyup="app.searchLogs(this.value)">
                        <i class="fas fa-search"></i>
                    </div>
                </div>
                
                <div class="logs-container">
                    ${this.renderLogsList()}
                </div>
            </div>
        `;
    }
    
    renderLogsList() {
        const { logs, filter, search } = this.state;
        let filteredLogs = logs;
        
        if (filter !== 'all') {
            filteredLogs = logs.filter(log => log.level === filter);
        }
        
        if (search) {
            filteredLogs = filteredLogs.filter(log => 
                log.message.toLowerCase().includes(search.toLowerCase())
            );
        }
        
        if (filteredLogs.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-list"></i>
                    <p>No logs found</p>
                </div>
            `;
        }
        
        return `
            <div class="logs-list">
                ${filteredLogs.map(log => this.renderLogItem(log)).join('')}
            </div>
        `;
    }
    
    renderLogItem(log) {
        return `
            <div class="log-item ${log.level}">
                <div class="log-timestamp">${new Date(log.timestamp).toLocaleString()}</div>
                <div class="log-level">
                    <span class="level-badge ${log.level}">${log.level.toUpperCase()}</span>
                </div>
                <div class="log-message">${log.message}</div>
                ${log.details ? `<div class="log-details">${log.details}</div>` : ''}
            </div>
        `;
    }
    
    updateLogs(logs) {
        this.setState({ logs });
    }
    
    filterLogs(filter) {
        this.setState({ filter });
    }
    
    searchLogs(search) {
        this.setState({ search });
    }
}

class SettingsSection extends Component {
    constructor(props) {
        super(props);
        this.state = {
            settings: {
                theme: 'nvidia',
                refreshInterval: 2000,
                notifications: true,
                autoUpdate: true,
                debugMode: false,
                jetsonClocks: false,
                powerMode: 'MAXN',
                fanMode: 'auto'
            },
            systemInfo: {
                model: 'Unknown',
                nvpModel: 'Unknown',
                uptime: '00:00:00',
                jetpackVersion: 'Unknown',
                kernelVersion: 'Unknown',
                connected: false,
                cpu: { temperature: 0 },
                gpu: { temperature: 0 },
                fan: { speed: 0, rpm: 0 },
                memory: { percent: 0 },
                totalPower: 0
            },
            loading: true
        };
    }
    
    componentDidMount() {
        this.loadSystemInfo();
        this.loadSettings();
    }
    
    async loadSystemInfo() {
        try {
            const response = await fetch('/api/system/info');
            if (response.ok) {
                const data = await response.json();
                this.setState({
                    systemInfo: {
                        ...this.state.systemInfo,
                        model: data.jetson_model || 'Unknown',
                        nvpModel: data.nvp_model || 'Unknown',
                        uptime: data.uptime || '00:00:00',
                        jetpackVersion: data.jetpack_version || 'Unknown',
                        kernelVersion: data.kernel_version || 'Unknown',
                        connected: true,
                        cpu: data.cpu || { temperature: 0 },
                        gpu: data.gpu || { temperature: 0 },
                        fan: data.fan || { speed: 0, rpm: 0 },
                        memory: data.memory || { percent: 0 },
                        totalPower: data.total_power || 0
                    },
                    loading: false
                });
                
                // Update Jetson Clocks status if available
                if (data.jetson_clocks !== undefined) {
                    this.updateSetting('jetsonClocks', data.jetson_clocks === 'ON');
                }
            }
        } catch (error) {
            console.error('Failed to load system info:', error);
            this.setState({ 
                systemInfo: { ...this.state.systemInfo, connected: false },
                loading: false 
            });
        }
    }
    
    async loadSettings() {
        try {
            const response = await fetch('/api/settings');
            if (response.ok) {
                const settings = await response.json();
                this.setState({ settings: { ...this.state.settings, ...settings } });
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
    
    async saveSettings() {
        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.state.settings)
            });
            
            if (response.ok) {
                this.showNotification('Settings saved successfully', 'success');
            } else {
                this.showNotification('Failed to save settings', 'error');
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('Failed to save settings', 'error');
        }
    }
    
    render() {
        const { settings, systemInfo, loading } = this.state;
        
        if (loading) {
            return `
                <div class="section-content">
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <p>Loading system information...</p>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="section-content">
                <div class="section-header">
                    <h2><i class="fas fa-cog"></i> System Settings</h2>
                    <div class="header-controls">
                        <span class="status-indicator ${systemInfo.connected ? 'online' : 'offline'}">
                            <i class="fas fa-circle"></i> ${systemInfo.connected ? 'CONNECTED' : 'DISCONNECTED'}
                        </span>
                        <button class="btn-primary" onclick="app.settings.saveSettings()">
                            <i class="fas fa-save"></i> Save Settings
                        </button>
                    </div>
                </div>
                
                <div class="settings-container">
                    ${this.renderSystemInfo()}
                    ${this.renderPerformanceSettings()}
                    ${this.renderDashboardSettings()}
                    ${this.renderSystemControl()}
                    ${this.renderAppearanceSettings()}
                </div>
            </div>
        `;
    }
    
    renderSystemInfo() {
        const { systemInfo } = this.state;
        return `
            <div class="settings-group">
                <h3><i class="fas fa-info-circle"></i> System Information</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <label>Device Model:</label>
                        <span>${systemInfo.model}</span>
                    </div>
                    <div class="info-item">
                        <label>Power Mode:</label>
                        <span>${systemInfo.nvpModel}</span>
                    </div>
                    <div class="info-item">
                        <label>System Uptime:</label>
                        <span>${systemInfo.uptime}</span>
                    </div>
                    <div class="info-item">
                        <label>CPU Temperature:</label>
                        <span>${systemInfo.cpu.temperature?.toFixed(1) || 'N/A'}°C</span>
                    </div>
                    <div class="info-item">
                        <label>GPU Temperature:</label>
                        <span>${systemInfo.gpu.temperature?.toFixed(1) || 'N/A'}°C</span>
                    </div>
                    <div class="info-item">
                        <label>Fan Speed:</label>
                        <span>${systemInfo.fan.speed?.toFixed(1) || 'N/A'}% (${systemInfo.fan.rpm || 'N/A'} RPM)</span>
                    </div>
                    <div class="info-item">
                        <label>Memory Usage:</label>
                        <span>${systemInfo.memory.percent?.toFixed(1) || 'N/A'}%</span>
                    </div>
                    <div class="info-item">
                        <label>Total Power:</label>
                        <span>${systemInfo.totalPower?.toFixed(1) || 'N/A'}W</span>
                    </div>
                    <div class="info-item">
                        <label>Connection Status:</label>
                        <span class="status-badge ${systemInfo.connected ? 'connected' : 'disconnected'}">
                            ${systemInfo.connected ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderPerformanceSettings() {
        const { settings } = this.state;
        return `
            <div class="settings-group">
                <h3><i class="fas fa-rocket"></i> Performance Settings</h3>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" ${settings.jetsonClocks ? 'checked' : ''} 
                               onchange="app.settings.toggleJetsonClocks(this.checked)">
                        Enable Jetson Clocks (Maximum Performance)
                    </label>
                    <small>Forces maximum clock frequencies for all components</small>
                </div>
                
                <div class="setting-item">
                    <label>Power Mode:</label>
                    <select value="${settings.powerMode}" onchange="app.settings.updatePowerMode(this.value)">
                        <option value="MAXN">MAXN (Maximum Performance)</option>
                        <option value="MODE_15W">15W Mode</option>
                        <option value="MODE_30W">30W Mode</option>
                        <option value="MODE_50W">50W Mode</option>
                    </select>
                    <small>Configure power consumption and performance balance</small>
                </div>
                
                <div class="setting-item">
                    <label>Fan Mode:</label>
                    <select value="${settings.fanMode}" onchange="app.settings.updateFanMode(this.value)">
                        <option value="auto">Auto</option>
                        <option value="quiet">Quiet</option>
                        <option value="cool">Cool</option>
                        <option value="manual">Manual</option>
                    </select>
                    <small>Control cooling fan behavior</small>
                </div>
            </div>
        `;
    }
    
    renderDashboardSettings() {
        const { settings } = this.state;
        return `
            <div class="settings-group">
                <h3><i class="fas fa-tachometer-alt"></i> Dashboard Settings</h3>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" ${settings.autoUpdate ? 'checked' : ''} 
                               onchange="app.settings.updateSetting('autoUpdate', this.checked)">
                        Auto-start dashboard on boot
                    </label>
                </div>
                
                <div class="setting-item">
                    <label>Data Update Interval:</label>
                    <select value="${settings.refreshInterval}" onchange="app.settings.updateSetting('refreshInterval', this.value)">
                        <option value="500">0.5 seconds</option>
                        <option value="1000">1 second</option>
                        <option value="2000">2 seconds</option>
                        <option value="5000">5 seconds</option>
                    </select>
                </div>
                
                <div class="setting-item">
                    <label>
                        <input type="checkbox" ${settings.notifications ? 'checked' : ''} 
                               onchange="app.settings.updateSetting('notifications', this.checked)">
                        Enable system notifications
                    </label>
                </div>
                
                <div class="setting-item">
                    <label>
                        <input type="checkbox" ${settings.debugMode ? 'checked' : ''} 
                               onchange="app.settings.updateSetting('debugMode', this.checked)">
                        Enable debug mode
                    </label>
                </div>
            </div>
        `;
    }
    
    renderSystemControl() {
        return `
            <div class="settings-group">
                <h3><i class="fas fa-power-off"></i> System Control</h3>
                <div class="control-buttons">
                    <button class="btn-warning" onclick="app.settings.confirmReboot()">
                        <i class="fas fa-redo"></i> Reboot System
                    </button>
                    <button class="btn-danger" onclick="app.settings.confirmShutdown()">
                        <i class="fas fa-power-off"></i> Shutdown System
                    </button>
                    <button class="btn-secondary" onclick="app.settings.loadSystemInfo()">
                        <i class="fas fa-sync"></i> Refresh Info
                    </button>
                </div>
                <small>System control actions require confirmation</small>
            </div>
        `;
    }
    
    renderAppearanceSettings() {
        const { settings } = this.state;
        return `
            <div class="settings-group">
                <h3><i class="fas fa-palette"></i> Appearance</h3>
                <div class="setting-item">
                    <label>Theme:</label>
                    <select value="${settings.theme}" onchange="app.settings.updateSetting('theme', this.value)">
                        <option value="nvidia">NVIDIA Green</option>
                        <option value="dark">Dark Mode</option>
                        <option value="light">Light Mode</option>
                    </select>
                </div>
                
                <div class="setting-item">
                    <button class="btn-secondary" onclick="app.settings.resetSettings()">
                        <i class="fas fa-undo"></i> Reset to Defaults
                    </button>
                </div>
            </div>
        `;
    }
    
    updateSetting(key, value) {
        this.setState({
            settings: { ...this.state.settings, [key]: value }
        });
    }
    
    async toggleJetsonClocks(enabled) {
        try {
            const response = await fetch('/api/system/jetson-clocks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ enabled })
            });
            
            if (response.ok) {
                this.updateSetting('jetsonClocks', enabled);
                this.showNotification(`Jetson Clocks ${enabled ? 'enabled' : 'disabled'}`, 'success');
            } else {
                this.showNotification('Failed to update Jetson Clocks', 'error');
            }
        } catch (error) {
            console.error('Failed to toggle Jetson Clocks:', error);
            this.showNotification('Failed to update Jetson Clocks', 'error');
        }
    }
    
    async updatePowerMode(mode) {
        try {
            const response = await fetch('/api/system/power-mode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mode })
            });
            
            if (response.ok) {
                this.updateSetting('powerMode', mode);
                this.showNotification(`Power mode set to ${mode}`, 'success');
            } else {
                this.showNotification('Failed to update power mode', 'error');
            }
        } catch (error) {
            console.error('Failed to update power mode:', error);
            this.showNotification('Failed to update power mode', 'error');
        }
    }
    
    async updateFanMode(mode) {
        try {
            const response = await fetch('/api/system/fan-mode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mode })
            });
            
            if (response.ok) {
                this.updateSetting('fanMode', mode);
                this.showNotification(`Fan mode set to ${mode}`, 'success');
            } else {
                this.showNotification('Failed to update fan mode', 'error');
            }
        } catch (error) {
            console.error('Failed to update fan mode:', error);
            this.showNotification('Failed to update fan mode', 'error');
        }
    }
    
    confirmReboot() {
        if (confirm('Are you sure you want to reboot the system? This will interrupt all running processes.')) {
            this.rebootSystem();
        }
    }
    
    confirmShutdown() {
        if (confirm('Are you sure you want to shutdown the system? This will power off the device.')) {
            this.shutdownSystem();
        }
    }
    
    async rebootSystem() {
        try {
            const response = await fetch('/api/system/reboot', {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showNotification('System reboot initiated...', 'warning');
            } else {
                this.showNotification('Failed to reboot system', 'error');
            }
        } catch (error) {
            console.error('Failed to reboot system:', error);
            this.showNotification('Failed to reboot system', 'error');
        }
    }
    
    async shutdownSystem() {
        try {
            const response = await fetch('/api/system/shutdown', {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showNotification('System shutdown initiated...', 'warning');
            } else {
                this.showNotification('Failed to shutdown system', 'error');
            }
        } catch (error) {
            console.error('Failed to shutdown system:', error);
            this.showNotification('Failed to shutdown system', 'error');
        }
    }
    
    resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            this.setState({
                settings: {
                    theme: 'nvidia',
                    refreshInterval: 2000,
                    notifications: true,
                    autoUpdate: true,
                    debugMode: false,
                    jetsonClocks: false,
                    powerMode: 'MAXN',
                    fanMode: 'auto'
                }
            });
            this.showNotification('Settings reset to defaults', 'success');
        }
    }
    
    showNotification(message, type = 'info') {
        // You can implement a notification system here
        console.log(`${type.toUpperCase()}: ${message}`);
        
        // Simple alert for now - you can replace with a better notification system
        if (type === 'error') {
            alert(`Error: ${message}`);
        } else if (type === 'warning') {
            alert(`Warning: ${message}`);
        } else if (type === 'success') {
            alert(`Success: ${message}`);
        }
    }
    
    updateSystemData(data) {
        // Method to update system data from WebSocket or polling
        this.setState({
            systemInfo: {
                ...this.state.systemInfo,
                ...data,
                connected: true
            }
        });
    }
}

// Export for use in main application
window.Components = {
    Component,
    DashboardSection,
    ModelsSection,
    InferenceSection,
    MonitoringSection,
    LogsSection,
    SettingsSection
};