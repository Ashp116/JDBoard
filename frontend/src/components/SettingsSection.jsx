import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { getBackendUrl } from '../utils/api';

const Container = styled.div`
  padding: 30px;
`;

const SectionHeader = styled.div`
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};

  h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 24px;
    margin: 0;
    font-family: ${props => props.theme.fonts.display};

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 24px;
  margin-bottom: 30px;
`;

const SettingsCard = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 24px;
  transition: all ${props => props.theme.transitions.standard};

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 16px 0;
    font-size: 18px;

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const SettingItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};

  &:last-child {
    border-bottom: none;
  }

  .label {
    color: ${props => props.theme.colors.text.primary};
    font-weight: 500;
  }

  .description {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 14px;
    margin-top: 4px;
  }
`;

const Toggle = styled.button`
  position: relative;
  width: 50px;
  height: 24px;
  background: ${props => props.$active ? props.theme.colors.nvidia.green : props.theme.colors.background.tertiary};
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all ${props => props.theme.transitions.fast};

  &::before {
    content: '';
    position: absolute;
    top: 2px;
    left: ${props => props.$active ? '28px' : '2px'};
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    transition: all ${props => props.theme.transitions.fast};
  }

  &:hover {
    opacity: 0.8;
  }
`;

const Select = styled.select`
  background: ${props => props.theme.colors.background.tertiary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 6px;
  color: ${props => props.theme.colors.text.primary};
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
  }
`;

const Button = styled.button`
  background: ${props => props.$variant === 'danger' ? props.theme.colors.status.error : props.theme.colors.nvidia.green};
  color: ${props => props.theme.colors.text.primary};
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all ${props => props.theme.transitions.fast};

  &:hover {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;

  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 16px 0;
    display: flex;
    align-items: center;
    gap: 10px;

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }

  p {
    color: ${props => props.theme.colors.text.secondary};
    margin: 0 0 16px 0;
    line-height: 1.5;
  }
`;

const PasswordInput = styled.input`
  width: 100%;
  background: ${props => props.theme.colors.background.tertiary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 6px;
  color: ${props => props.theme.colors.text.primary};
  padding: 12px;
  font-size: 14px;
  margin-bottom: 16px;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
  }

  &::placeholder {
    color: ${props => props.theme.colors.text.secondary};
  }
`;

const ModalButtons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const InfoCard = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;

  h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 16px 0;

    i {
      color: ${props => props.theme.colors.nvidia.blue};
    }
  }
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
`;

const InfoItem = styled.div`
  .label {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 14px;
    margin-bottom: 4px;
  }

  .value {
    color: ${props => props.theme.colors.text.primary};
    font-weight: 500;
    font-size: 16px;
  }
`;

const SettingsSection = ({ systemData, socket, isConnected }) => {
  const [settings, setSettings] = useState({
    jetsonClocks: false,
    fanMode: 'quiet',
    powerMode: 'MAXN_SUPER',
    autoStartDashboard: true,
    dataRetention: '24h',
    updateInterval: '1s',
    enableNotifications: true
  });

  const [systemInfo, setSystemInfo] = useState({
    model: 'Unknown',
    module: 'Unknown',
    nvpModel: 'Unknown',
    jetpackVersion: 'Unknown',
    uptime: '00:00:00',
    kernelVersion: 'Unknown'
  });

  const [availablePowerModes, setAvailablePowerModes] = useState(['MAXN_SUPER', '15W', '25W', '7W']);

  const [loading, setLoading] = useState({
    jetsonClocks: false,
    powerMode: false,
    fanMode: false,
    reboot: false,
    shutdown: false
  });

  const [sudoModal, setSudoModal] = useState({
    show: false,
    action: null,
    password: '',
    error: ''
  });

  const [sudoSession, setSudoSession] = useState({
    isValid: false,
    lastUsed: null
  });

  // Fetch current settings from backend
  const fetchSettings = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/api/settings`);
      if (response.ok) {
        const settingsData = await response.json();
        setSettings(prev => ({
          ...prev,
          jetsonClocks: settingsData.jetsonClocks || false,
          powerMode: settingsData.powerMode || 'MAXN',
          fanMode: settingsData.fanMode || 'quiet'
        }));
        console.log('Settings loaded from backend:', settingsData);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  // Fetch current fan mode directly from the fan-mode endpoint
  const fetchCurrentFanMode = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/api/system/fan-mode`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.current_mode) {
          setSettings(prev => ({
            ...prev,
            fanMode: data.current_mode
          }));
          console.log('Current fan mode:', data.current_mode);
        }
      }
    } catch (error) {
      console.error('Error fetching current fan mode:', error);
    }
  };

  useEffect(() => {
    // Fetch settings on component mount
    fetchSettings();
    // Also fetch current fan mode to ensure accuracy
    fetchCurrentFanMode();
  }, []);

  useEffect(() => {
    if (systemData) {
      setSystemInfo(prev => ({
        ...prev,
        model: systemData?.jetson_model || 'Unknown',
        module: systemData?.jetson_module || 'Unknown',
        jetpackVersion: systemData?.jetpack_version || 'Unknown',
        kernelVersion: systemData?.kernel_version || 'Unknown',
        nvpModel: systemData?.nvp_model || 'Unknown',
        uptime: systemData?.uptime || '00:00:00'
      }));
      
      // Update Jetson Clocks status from system data
      if (systemData?.jetson_clocks !== undefined) {
        setSettings(prev => ({
          ...prev,
          jetsonClocks: Boolean(systemData.jetson_clocks)
        }));
      }
    }
  }, [systemData]);

  // Fetch available power modes on component mount
  useEffect(() => {
    const fetchPowerModes = async () => {
      try {
        const response = await fetch(`${getBackendUrl()}/api/system/power-modes`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setAvailablePowerModes(data.available_modes);
            // Update current power mode if provided
            if (data.current_mode) {
              setSettings(prev => ({
                ...prev,
                powerMode: data.current_mode
              }));
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch power modes:', error);
        // Keep default fallback modes
      }
    };

    fetchPowerModes();
  }, []);

  // Sudo authentication functions
  const requestSudoPassword = (action) => {
    return new Promise((resolve, reject) => {
      setSudoModal({
        show: true,
        action,
        password: '',
        error: '',
        resolve,
        reject
      });
    });
  };

  const handleSudoSubmit = async () => {
    try {
      const backendUrl = getBackendUrl();
      
      // Verify sudo password
      const response = await fetch(`${backendUrl}/api/auth/sudo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: sudoModal.password }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Update sudo session
        setSudoSession({
          isValid: true,
          lastUsed: Date.now()
        });
        
        // Close modal and resolve promise
        setSudoModal(prev => ({ ...prev, show: false }));
        sudoModal.resolve && sudoModal.resolve(sudoModal.password);
      } else {
        setSudoModal(prev => ({ 
          ...prev, 
          error: result.error || 'Invalid sudo password'
        }));
      }
    } catch (error) {
      setSudoModal(prev => ({ 
        ...prev, 
        error: `Authentication error: ${error.message}`
      }));
    }
  };

  const handleSudoCancel = () => {
    setSudoModal(prev => ({ ...prev, show: false }));
    sudoModal.reject && sudoModal.reject(new Error('User cancelled sudo authentication'));
  };

  const requireSudo = async (action) => {
    // Check if sudo session is still valid (15 minutes timeout)
    const currentTime = Date.now();
    const sudoTimeout = 15 * 60 * 1000; // 15 minutes
    
    if (sudoSession.isValid && sudoSession.lastUsed && 
        (currentTime - sudoSession.lastUsed) < sudoTimeout) {
      // Session is still valid, refresh the timestamp
      setSudoSession(prev => ({ ...prev, lastUsed: currentTime }));
      return sudoSession.password || 'session_valid';
    }
    
    // Need to request password
    return await requestSudoPassword(action);
  };

  const executeSudoCommand = async (endpoint, data, actionName) => {
    try {
      const password = await requireSudo(actionName);
      const backendUrl = getBackendUrl();
      
      const response = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...data, sudo_password: password }),
      });
      
      return await response.json();
    } catch (error) {
      if (error.message === 'User cancelled sudo authentication') {
        throw error;
      }
      throw new Error(`Failed to execute ${actionName}: ${error.message}`);
    }
  };

  const handleToggle = (setting) => {
    setSettings(prev => ({
      ...prev,
      [setting]: !prev[setting]
    }));
  };

  const handleSelectChange = (setting, value) => {
    setSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const handleJetsonClocksToggle = async () => {
    setLoading(prev => ({ ...prev, jetsonClocks: true }));
    
    try {
      const newState = !settings.jetsonClocks;
      
      const result = await executeSudoCommand(
        '/api/system/jetson-clocks',
        { enabled: newState },
        'Toggle Jetson Clocks'
      );
      
      if (result.success) {
        setSettings(prev => ({
          ...prev,
          jetsonClocks: newState
        }));
        console.log(`Jetson Clocks ${newState ? 'enabled' : 'disabled'} successfully`);
      } else {
        console.error('Failed to toggle Jetson Clocks:', result.error);
        alert(`Failed to toggle Jetson Clocks: ${result.error}`);
      }
    } catch (error) {
      if (error.message !== 'User cancelled sudo authentication') {
        console.error('Error toggling Jetson Clocks:', error);
        alert(`Error toggling Jetson Clocks: ${error.message}`);
      }
    } finally {
      setLoading(prev => ({ ...prev, jetsonClocks: false }));
    }
  };

  const handlePowerModeChange = async (mode) => {
    setLoading(prev => ({ ...prev, powerMode: true }));
    
    try {
      const result = await executeSudoCommand(
        '/api/system/power-mode',
        { mode },
        'Change Power Mode'
      );
      
      if (result.success) {
        setSettings(prev => ({
          ...prev,
          powerMode: mode
        }));
        console.log(`Power mode set to ${mode} successfully`);
      } else {
        console.error('Failed to set power mode:', result.error);
        alert(`Failed to set power mode: ${result.error}`);
      }
    } catch (error) {
      if (error.message !== 'User cancelled sudo authentication') {
        console.error('Error setting power mode:', error);
        alert(`Error setting power mode: ${error.message}`);
      }
    } finally {
      setLoading(prev => ({ ...prev, powerMode: false }));
    }
  };

  const handleFanModeChange = async (mode) => {
    setLoading(prev => ({ ...prev, fanMode: true }));
    
    try {
      const result = await executeSudoCommand(
        '/api/system/fan-mode',
        { mode },
        'Change Fan Mode'
      );
      
      if (result.success) {
        setSettings(prev => ({
          ...prev,
          fanMode: mode
        }));
        console.log(`Fan mode set to ${mode} successfully`);
        // Refresh the current fan mode to ensure accuracy
        setTimeout(() => fetchCurrentFanMode(), 1000);
      } else {
        console.error('Failed to set fan mode:', result.error);
        alert(`Failed to set fan mode: ${result.error}`);
      }
    } catch (error) {
      if (error.message !== 'User cancelled sudo authentication') {
        console.error('Error setting fan mode:', error);
        alert(`Error setting fan mode: ${error.message}`);
      }
    } finally {
      setLoading(prev => ({ ...prev, fanMode: false }));
    }
  };

  const handleReboot = async () => {
    if (window.confirm('Are you sure you want to reboot the system? This will restart the Jetson device.')) {
      setLoading(prev => ({ ...prev, reboot: true }));
      
      try {
        const result = await executeSudoCommand(
          '/api/system/reboot',
          {},
          'Reboot System'
        );
        
        if (result.success) {
          alert('System reboot initiated. The device will restart in 5 seconds.');
          console.log('System reboot initiated');
        } else {
          console.error('Failed to reboot system:', result.error);
          alert(`Failed to reboot system: ${result.error}`);
        }
      } catch (error) {
        if (error.message !== 'User cancelled sudo authentication') {
          console.error('Error rebooting system:', error);
          alert(`Error rebooting system: ${error.message}`);
        }
      } finally {
        setLoading(prev => ({ ...prev, reboot: false }));
      }
    }
  };

  const handleShutdown = async () => {
    if (window.confirm('Are you sure you want to shutdown the system? This will power off the Jetson device.')) {
      setLoading(prev => ({ ...prev, shutdown: true }));
      
      try {
        const result = await executeSudoCommand(
          '/api/system/shutdown',
          {},
          'Shutdown System'
        );
        
        if (result.success) {
          alert('System shutdown initiated. The device will power off in 5 seconds.');
          console.log('System shutdown initiated');
        } else {
          console.error('Failed to shutdown system:', result.error);
          alert(`Failed to shutdown system: ${result.error}`);
        }
      } catch (error) {
        if (error.message !== 'User cancelled sudo authentication') {
          console.error('Error shutting down system:', error);
          alert(`Error shutting down system: ${error.message}`);
        }
      } finally {
        setLoading(prev => ({ ...prev, shutdown: false }));
      }
    }
  };

  return (
    <Container>
      <SectionHeader>
        <h2>
          <i className="fas fa-cog"></i>
          System Settings
        </h2>
      </SectionHeader>

      {/* System Information */}
      <InfoCard>
        <h3>
          <i className="fas fa-info-circle"></i>
          System Information
        </h3>
        <InfoGrid>
          <InfoItem>
            <div className="label">Device Model</div>
            <div className="value">{systemInfo.model}</div>
          </InfoItem>
          <InfoItem>
            <div className="label">Hardware Module</div>
            <div className="value">{systemInfo.module}</div>
          </InfoItem>
          <InfoItem>
            <div className="label">NVP Model</div>
            <div className="value">{systemInfo.nvpModel}</div>
          </InfoItem>
          <InfoItem>
            <div className="label">Uptime</div>
            <div className="value">{systemInfo.uptime}</div>
          </InfoItem>
          <InfoItem>
            <div className="label">JetPack Version</div>
            <div className="value">{systemInfo.jetpackVersion}</div>
          </InfoItem>
          <InfoItem>
            <div className="label">Connection Status</div>
            <div className="value" style={{color: isConnected ? '#4ECDC4' : '#FF6B6B'}}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </InfoItem>
          <InfoItem>
            <div className="label">Kernel Version</div>
            <div className="value">{systemInfo.kernelVersion}</div>
          </InfoItem>
        </InfoGrid>
      </InfoCard>

      <SettingsGrid>
        {/* Performance Settings */}
        <SettingsCard>
          <h3>
            <i className="fas fa-tachometer-alt"></i>
            Performance Settings
          </h3>

          <SettingItem>
            <div>
              <div className="label">Jetson Clocks</div>
              <div className="description">Maximum performance mode</div>
            </div>
            <Toggle 
              $active={settings.jetsonClocks} 
              onClick={handleJetsonClocksToggle}
              disabled={loading.jetsonClocks}
              style={{ opacity: loading.jetsonClocks ? 0.6 : 1 }}
            />
          </SettingItem>

          <SettingItem>
            <div>
              <div className="label">Power Mode</div>
              <div className="description">System power profile</div>
            </div>
            <Select 
              value={settings.powerMode}
              onChange={(e) => handlePowerModeChange(e.target.value)}
              disabled={loading.powerMode}
              style={{ opacity: loading.powerMode ? 0.6 : 1 }}
            >
              {availablePowerModes.map(mode => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </Select>
          </SettingItem>

          <SettingItem>
            <div>
              <div className="label">Fan Mode</div>
              <div className="description">Cooling fan control</div>
            </div>
            <Select 
              value={settings.fanMode}
              onChange={(e) => handleFanModeChange(e.target.value)}
              disabled={loading.fanMode}
              style={{ opacity: loading.fanMode ? 0.6 : 1 }}
            >
              <option value="quiet">Quiet</option>
              <option value="cool">Cool</option>
            </Select>
          </SettingItem>
        </SettingsCard>

        {/* Dashboard Settings */}
        <SettingsCard>
          <h3>
            <i className="fas fa-desktop"></i>
            Dashboard Settings [Not working, fix this later bro]
          </h3>

          <SettingItem>
            <div>
              <div className="label">Auto-start Dashboard</div>
              <div className="description">Start dashboard on boot</div>
            </div>
            <Toggle 
              $active={settings.autoStartDashboard} 
              onClick={() => handleToggle('autoStartDashboard')}
            />
          </SettingItem>

          <SettingItem>
            <div>
              <div className="label">Data Retention</div>
              <div className="description">How long to keep monitoring data</div>
            </div>
            <Select 
              value={settings.dataRetention}
              onChange={(e) => handleSelectChange('dataRetention', e.target.value)}
            >
              <option value="1h">1 Hour</option>
              <option value="6h">6 Hours</option>
              <option value="24h">24 Hours</option>
              <option value="7d">7 Days</option>
            </Select>
          </SettingItem>

          <SettingItem>
            <div>
              <div className="label">Update Interval</div>
              <div className="description">Data refresh frequency</div>
            </div>
            <Select 
              value={settings.updateInterval}
              onChange={(e) => handleSelectChange('updateInterval', e.target.value)}
            >
              <option value="0.5s">0.5 Second</option>
              <option value="1s">1 Second</option>
              <option value="2s">2 Seconds</option>
              <option value="5s">5 Seconds</option>
            </Select>
          </SettingItem>

          <SettingItem>
            <div>
              <div className="label">Enable Notifications</div>
              <div className="description">System alerts and warnings</div>
            </div>
            <Toggle 
              $active={settings.enableNotifications} 
              onClick={() => handleToggle('enableNotifications')}
            />
          </SettingItem>
        </SettingsCard>

        {/* System Control */}
        <SettingsCard>
          <h3>
            <i className="fas fa-power-off"></i>
            System Control
          </h3>

          <SettingItem>
            <div>
              <div className="label">Restart System</div>
              <div className="description">Reboot the Jetson device</div>
            </div>
            <Button 
              onClick={handleReboot}
              disabled={loading.reboot}
              style={{ opacity: loading.reboot ? 0.6 : 1 }}
            >
              <i className={loading.reboot ? "fas fa-spinner fa-spin" : "fas fa-redo"}></i>  
              {loading.reboot ? ' Rebooting...' : ' Reboot'}
            </Button>
          </SettingItem>

          <SettingItem>
            <div>
              <div className="label">Shutdown System</div>
              <div className="description">Power off the device</div>
            </div>
            <Button 
              $variant="danger" 
              onClick={handleShutdown}
              disabled={loading.shutdown}
              style={{ opacity: loading.shutdown ? 0.6 : 1 }}
            >
              <i className={loading.shutdown ? "fas fa-spinner fa-spin" : "fas fa-power-off"}></i> 
              {loading.shutdown ? ' Shutting down...' : ' Shutdown'}
            </Button>
          </SettingItem>
        </SettingsCard>
      </SettingsGrid>

      {/* Sudo Password Modal */}
      {sudoModal.show && (
        <Modal>
          <ModalContent>
            <h3>
              <i className="fas fa-lock"></i>
              Administrator Authentication Required
            </h3>
            <p>
              To {sudoModal.action}, please enter your sudo password:
            </p>
            
            <PasswordInput
              type="password"
              placeholder="Enter sudo password"
              value={sudoModal.password}
              onChange={(e) => setSudoModal(prev => ({ 
                ...prev, 
                password: e.target.value,
                error: '' 
              }))}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSudoSubmit();
                }
              }}
              autoFocus
            />
            
            {sudoModal.error && (
              <p style={{ color: '#FF6B6B', fontSize: '14px', margin: '0 0 16px 0' }}>
                {sudoModal.error}
              </p>
            )}
            
            <ModalButtons>
              <Button onClick={handleSudoCancel}>
                Cancel
              </Button>
              <Button 
                onClick={handleSudoSubmit}
                disabled={!sudoModal.password.trim()}
              >
                Authenticate
              </Button>
            </ModalButtons>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
};

export default SettingsSection;