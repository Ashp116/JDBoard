import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

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
    fanMode: 'auto',
    powerMode: 'MAXN',
    autoStartDashboard: true,
    dataRetention: '24h',
    updateInterval: '1s',
    enableNotifications: true,
    darkMode: true
  });

  const [systemInfo, setSystemInfo] = useState({
    model: 'Unknown',
    module: 'Unknown',
    nvpModel: 'Unknown',
    jetpackVersion: 'Unknown',
    uptime: '00:00:00',
    kernelVersion: 'Unknown'
  });

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
          jetsonClocks: systemData.jetson_clocks === 'ON'
        }));
      }
    }
  }, [systemData]);

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

  const handleJetsonClocksToggle = () => {
    // In a real implementation, this would send a command to the backend
    console.log('Toggling Jetson Clocks:', !settings.jetsonClocks);
    handleToggle('jetsonClocks');
  };

  const handleReboot = () => {
    if (window.confirm('Are you sure you want to reboot the system?')) {
      console.log('Rebooting system...');
      // In a real implementation, this would send a reboot command to the backend
    }
  };

  const handleShutdown = () => {
    if (window.confirm('Are you sure you want to shutdown the system?')) {
      console.log('Shutting down system...');
      // In a real implementation, this would send a shutdown command to the backend
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
            />
          </SettingItem>

          <SettingItem>
            <div>
              <div className="label">Power Mode</div>
              <div className="description">System power profile</div>
            </div>
            <Select 
              value={settings.powerMode}
              onChange={(e) => handleSelectChange('powerMode', e.target.value)}
            >
              <option value="MAXN">MAXN</option>
              <option value="15W">15W</option>
              <option value="30W">30W</option>
              <option value="50W">50W</option>
            </Select>
          </SettingItem>

          <SettingItem>
            <div>
              <div className="label">Fan Mode</div>
              <div className="description">Cooling fan control</div>
            </div>
            <Select 
              value={settings.fanMode}
              onChange={(e) => handleSelectChange('fanMode', e.target.value)}
            >
              <option value="auto">Auto</option>
              <option value="quiet">Quiet</option>
              <option value="cool">Cool</option>
              <option value="manual">Manual</option>
            </Select>
          </SettingItem>
        </SettingsCard>

        {/* Dashboard Settings */}
        <SettingsCard>
          <h3>
            <i className="fas fa-desktop"></i>
            Dashboard Settings
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
            <Button onClick={handleReboot}>
              <i className="fas fa-redo"></i> Reboot
            </Button>
          </SettingItem>

          <SettingItem>
            <div>
              <div className="label">Shutdown System</div>
              <div className="description">Power off the device</div>
            </div>
            <Button $variant="danger" onClick={handleShutdown}>
              <i className="fas fa-power-off"></i> Shutdown
            </Button>
          </SettingItem>
        </SettingsCard>

        {/* Appearance Settings */}
        <SettingsCard>
          <h3>
            <i className="fas fa-palette"></i>
            Appearance
          </h3>

          <SettingItem>
            <div>
              <div className="label">Dark Mode</div>
              <div className="description">Use dark theme</div>
            </div>
            <Toggle 
              $active={settings.darkMode} 
              onClick={() => handleToggle('darkMode')}
            />
          </SettingItem>
        </SettingsCard>
      </SettingsGrid>
    </Container>
  );
};

export default SettingsSection;