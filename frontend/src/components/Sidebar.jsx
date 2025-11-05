import React from 'react';
import styled from 'styled-components';

const SidebarContainer = styled.nav`
  width: 80px;
  background: ${props => props.theme.gradients.sidebar};
  border-right: 2px solid ${props => props.theme.colors.nvidia.green};
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  z-index: ${props => props.theme.zIndex.sidebar};
  transition: width ${props => props.theme.transitions.medium};
  box-shadow: ${props => props.theme.shadows.sidebar};

  &:hover {
    width: 250px;
  }
`;

const SidebarBrand = styled.div`
  padding: 20px;
  text-align: center;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
`;

const SidebarLogo = styled.div`
  font-family: ${props => props.theme.fonts.display};
  font-weight: 700;
  font-size: 1.2rem;
  color: ${props => props.theme.colors.nvidia.green};
  text-shadow: 0 0 10px ${props => props.theme.colors.nvidia.green};
  white-space: nowrap;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 10px;

  i {
    font-size: 1.5rem;
  }
`;

const SidebarNav = styled.div`
  padding: 20px 0;
`;

const NavItem = styled.div`
  display: flex;
  align-items: center;
  padding: 15px 20px;
  cursor: pointer;
  transition: all ${props => props.theme.transitions.medium};
  border-left: 3px solid transparent;
  position: relative;
  background: ${props => props.$active ? 'rgba(118, 185, 0, 0.2)' : 'transparent'};
  border-left-color: ${props => props.$active ? props.theme.colors.nvidia.green : 'transparent'};

  &:hover {
    background: rgba(118, 185, 0, 0.1);
    border-left-color: ${props => props.theme.colors.nvidia.green};
  }

  i {
    font-size: 1.5rem;
    color: ${props => props.theme.colors.nvidia.green};
    min-width: 40px;
    text-align: center;
  }

  span {
    margin-left: 15px;
    font-family: ${props => props.theme.fonts.primary};
    font-weight: 600;
    white-space: nowrap;
    opacity: 0;
    transition: opacity ${props => props.theme.transitions.medium};
  }

  ${SidebarContainer}:hover & span {
    opacity: 1;
  }
`;

const SidebarFooter = styled.div`
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
`;

const ConnectionStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: ${props => props.theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 1px;

  i {
    font-size: 8px;
    animation: pulse 2s infinite;
    color: ${props => props.$connected ? props.theme.colors.nvidia.green : props.theme.colors.status.error};
  }
`;

const Sidebar = ({ activeSection, onSectionChange, isConnected }) => {
  const navItems = [
    { id: 'dashboard', icon: 'fas fa-tachometer-alt', label: 'Dashboard', shortcut: 'Ctrl+1' },
    { id: 'models', icon: 'fas fa-brain', label: 'Models', shortcut: 'Ctrl+2' },
    { id: 'inference', icon: 'fas fa-rocket', label: 'Inference', shortcut: 'Ctrl+3' },
    { id: 'monitoring', icon: 'fas fa-chart-line', label: 'Monitoring', shortcut: 'Ctrl+4' },
    { id: 'logs', icon: 'fas fa-file-alt', label: 'Logs', shortcut: 'Ctrl+5' },
    { id: 'settings', icon: 'fas fa-cog', label: 'Settings', shortcut: 'Ctrl+6' }
  ];

  return (
    <SidebarContainer>
      <SidebarBrand>
        <SidebarLogo>
          <i className="fas fa-microchip"></i>
          <span>NVIDIA</span>
        </SidebarLogo>
      </SidebarBrand>

      <SidebarNav>
        {navItems.map(item => (
          <NavItem
            key={item.id}
            $active={activeSection === item.id}
            onClick={() => onSectionChange(item.id)}
            title={`${item.label} (${item.shortcut})`}
          >
            <i className={item.icon}></i>
            <span>{item.label}</span>
          </NavItem>
        ))}
      </SidebarNav>

      <SidebarFooter>
        <ConnectionStatus $connected={isConnected}>
          <i className="fas fa-circle"></i>
          <span>{isConnected ? 'Connected' : 'Offline'}</span>
        </ConnectionStatus>
      </SidebarFooter>
    </SidebarContainer>
  );
};

export default Sidebar;