import React from 'react';
import styled from 'styled-components';
import { SidebarProps } from '../types';
import packageJson from "../../package.json"

// Styled component interfaces
interface StyledActiveProps {
  $active: boolean;
}

interface StyledConnectionProps {
  $connected: boolean;
}

const SidebarContainer = styled.nav<{ $isOpen?: boolean }>`
  background: ${props => props.theme.gradients.sidebar};
  border-right: 2px solid ${props => props.theme.colors.nvidia.green};
  transition: all ${props => props.theme.transitions.medium};
  box-shadow: ${props => props.theme.shadows.sidebar};
  z-index: ${props => props.theme.zIndex.sidebar};

  /* Mobile and tablet styles */
  ${props => props.theme.media.tablet} {
    position: fixed;
    top: 60px;
    left: ${props => props.$isOpen ? '0' : '-250px'};
    width: 250px;
    height: calc(100vh - 60px);
    box-shadow: ${props => props.$isOpen ? '2px 0 20px rgba(0, 0, 0, 0.3)' : 'none'};
  }
  
  ${props => props.theme.media.mobile} {
    position: fixed;
    top: 60px;
    left: ${props => props.$isOpen ? '0' : '-250px'};
    width: 250px;
    height: calc(100vh - 60px);
    box-shadow: ${props => props.$isOpen ? '2px 0 20px rgba(0, 0, 0, 0.3)' : 'none'};
  }
  
  @media (max-width: 480px) {
    top: 55px;
    height: calc(100vh - 55px);
  }

  /* Desktop styles */
  @media (min-width: 992px) {
    position: fixed;
    left: 0;
    top: 0;
    width: 80px;
    height: 100vh;

    &:hover {
      width: 250px;
    }
  }
`;

const MobileHeader = styled.div`
  display: none;
  
  ${props => props.theme.media.tablet} {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: ${props => props.theme.colors.background.secondary};
    border-bottom: 2px solid ${props => props.theme.colors.nvidia.green};
    padding: 0 20px;
    z-index: ${props => props.theme.zIndex.modal};
    backdrop-filter: blur(10px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  
  ${props => props.theme.media.mobile} {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: ${props => props.theme.colors.background.secondary};
    border-bottom: 2px solid ${props => props.theme.colors.nvidia.green};
    padding: 0 15px;
    z-index: ${props => props.theme.zIndex.modal};
    backdrop-filter: blur(10px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  
  @media (max-width: 480px) {
    padding: 0 12px;
    height: 55px;
  }
`;

const MobileMenuButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.colors.nvidia.green};
  font-size: 1.5rem;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: all ${props => props.theme.transitions.fast};
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
  
  ${props => props.theme.media.mobile} {
    font-size: 1.3rem;
    padding: 6px;
    min-width: 40px;
    min-height: 40px;
  }
  
  @media (max-width: 480px) {
    font-size: 1.2rem;
    padding: 5px;
    min-width: 36px;
    min-height: 36px;
  }

  &:hover {
    background: rgba(118, 185, 0, 0.1);
  }
  
  &:active {
    background: rgba(118, 185, 0, 0.2);
    transform: scale(0.95);
  }
  
  &:focus {
    outline: 2px solid ${props => props.theme.colors.nvidia.green};
    outline-offset: 2px;
  }
`;

const MobileTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  color: ${props => props.theme.colors.nvidia.green};
  font-family: ${props => props.theme.fonts.display};
  font-weight: 700;
  font-size: 1.2rem;
  
  ${props => props.theme.media.mobile} {
    font-size: 1.1rem;
    gap: 10px;
  }
  
  @media (max-width: 480px) {
    font-size: 1rem;
    gap: 8px;
  }

  img {
    height: 32px;
    width: auto;
    
    ${props => props.theme.media.mobile} {
      height: 28px;
    }
    
    @media (max-width: 480px) {
      height: 24px;
    }
  }
  
  span {
    ${props => props.theme.media.mobile} {
      display: inline;
    }
    
    @media (max-width: 480px) {
      display: none;
    }
  }
`;

const MobileOverlay = styled.div<{ $isOpen?: boolean }>`
  display: ${props => props.$isOpen ? 'block' : 'none'};
  position: fixed;
  top: 60px;
  left: 0;
  width: 100vw;
  height: calc(100vh - 60px);
  background: rgba(0, 0, 0, 0.5);
  z-index: ${props => props.theme.zIndex.sidebar - 1};
  
  @media (max-width: 480px) {
    top: 55px;
    height: calc(100vh - 55px);
  }
  
  @media (min-width: 992px) {
    display: none;
  }
`;

const SidebarBrand = styled.div`
  padding: 20px;
  text-align: center;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60px;

  /* Hide on mobile - brand is in mobile header instead */
  @media (max-width: 991px) {
    display: none;
  }
`;

const SidebarLogo = styled.div`
  font-family: ${props => props.theme.fonts.display};
  font-weight: 700;
  font-size: 1.2rem;
  color: ${props => props.theme.colors.nvidia.green};
  text-shadow: 0 0 10px ${props => props.theme.colors.nvidia.green};
  white-space: nowrap;
  overflow: visible;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  position: relative;

  i {
    font-size: 1.5rem;
    min-width: 24px;
  }

  .brand-icon {
    opacity: 1;
    transition: opacity ${props => props.theme.transitions.medium};
    flex-shrink: 0;
    min-width: 32px;
  }

  .brand-text {
    opacity: 0;
    transition: opacity ${props => props.theme.transitions.medium};
    font-size: 1rem;
    position: absolute;
    left: 100%;
    margin-left: 10px;
    background: ${props => props.theme.colors.background.primary};
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid ${props => props.theme.colors.border.secondary};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    white-space: nowrap;
    z-index: 1000;
    
    /* Show on mobile when sidebar is open */
    @media (max-width: 991px) {
      opacity: 1;
      position: static;
      background: transparent;
      padding: 0;
      border: none;
      box-shadow: none;
      margin-left: 0;
      z-index: auto;
    }
  }

  ${SidebarContainer}:hover & .brand-text {
    opacity: 1;
    position: static;
    background: transparent;
    padding: 0;
    border: none;
    box-shadow: none;
    margin-left: 0;
    z-index: auto;
  }
`;

const SidebarNav = styled.div`
  padding: 20px 0;
`;

const NavItem = styled.div<StyledActiveProps>`
  display: flex;
  align-items: center;
  padding: 15px 20px;
  cursor: pointer;
  transition: all ${props => props.theme.transitions.medium};
  border-left: 3px solid transparent;
  position: relative;
  background: ${props => props.$active ? 'rgba(118, 185, 0, 0.2)' : 'transparent'};
  border-left-color: ${props => props.$active ? props.theme.colors.nvidia.green : 'transparent'};
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    background: rgba(118, 185, 0, 0.1);
    border-left-color: ${props => props.theme.colors.nvidia.green};
  }
  
  &:active {
    background: rgba(118, 185, 0, 0.3);
  }

  i {
    font-size: 1.5rem;
    color: ${props => props.theme.colors.nvidia.green};
    min-width: 40px;
    text-align: center;
    transition: color ${props => props.theme.transitions.fast};
    
    ${props => props.theme.media.mobile} {
      font-size: 1.3rem;
      min-width: 35px;
    }
  }

  span {
    margin-left: 15px;
    color: ${props => props.$active ? props.theme.colors.text.primary : props.theme.colors.text.primary};
    font-family: ${props => props.theme.fonts.primary};
    font-weight: ${props => props.$active ? '700' : '600'};
    white-space: nowrap;
    opacity: 0;
    transition: all ${props => props.theme.transitions.medium};
    
    ${props => props.theme.media.mobile} {
      opacity: 1;
      margin-left: 12px;
    }
    
    @media (max-width: 480px) {
      margin-left: 10px;
      font-size: 14px;
    }
  }

  ${SidebarContainer}:hover & span {
    opacity: 1;
  }
  
  &:hover {
    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
    
    span {
      color: ${props => props.theme.colors.text.primary};
    }
  }
`;

const SidebarFooter = styled.div`
  position: absolute;
  bottom: 20px;
  left: 0;
  right: 0;
  padding: 0 20px;
  text-align: center;
`;

const ConnectionStatus = styled.div<StyledConnectionProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 11px;
  color: ${props => props.theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 1px;
  position: relative;
  padding: 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
  width: 40px;
  height: 40px;
  margin: 0 auto;
  transition: all ${props => props.theme.transitions.medium};

  /* Collapsed state - show just the icon with better styling */
  i {
    font-size: 12px;
    animation: pulse 2s infinite;
    color: ${props => props.$connected ? props.theme.colors.nvidia.green : props.theme.colors.status.error};
    position: relative;
    
    /* Add a subtle glow effect when collapsed */
    filter: drop-shadow(0 0 4px ${props => props.$connected ? props.theme.colors.nvidia.green : props.theme.colors.status.error});
  }

  /* Text label - hidden when collapsed */
    span {
      opacity: 0;
      transition: opacity ${props => props.theme.transitions.medium};
      white-space: nowrap;
      position: absolute;
      left: 50px;
      background: ${props => props.theme.colors.background.primary};
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid ${props => props.theme.colors.border.secondary};
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      pointer-events: none;
      
      /* Show text on mobile when sidebar is open */
      @media (max-width: 991px) {
        opacity: 1;
        position: static;
        background: transparent;
        padding: 0;
        border: none;
        box-shadow: none;
        z-index: auto;
      }
    }  /* Expanded state - show text and adjust layout */
  ${SidebarContainer}:hover & {
    width: auto;
    gap: 8px;
    
    span {
      opacity: 1;
      position: static;
      background: transparent;
      padding: 0;
      border: none;
      box-shadow: none;
      z-index: auto;
    }
    
    i {
      filter: none;
    }
  }

  /* Tooltip on hover when collapsed */
  &:hover span {
    opacity: 1;
  }
`;

const Sidebar: React.FC<SidebarProps> = ({ activeSection, onSectionChange, isConnected, isMobileMenuOpen, onToggleMobileMenu }) => {
  const navItems = [
    { id: 'dashboard', icon: 'fas fa-tachometer-alt', label: 'Dashboard', shortcut: 'Ctrl+1' },
    { id: 'models', icon: 'fas fa-brain', label: 'Models', shortcut: 'Ctrl+2' },
    { id: 'inference', icon: 'fas fa-rocket', label: 'Inference', shortcut: 'Ctrl+3' },
    { id: 'monitoring', icon: 'fas fa-chart-line', label: 'Monitoring', shortcut: 'Ctrl+4' },
    { id: 'processes', icon: 'fas fa-tasks', label: 'Processes', shortcut: 'Ctrl+5' },
    { id: 'terminal', icon: 'fas fa-terminal', label: 'Terminal', shortcut: 'Ctrl+6' },
    { id: 'logs', icon: 'fas fa-file-alt', label: 'Logs', shortcut: 'Ctrl+7' },
    { id: 'settings', icon: 'fas fa-cog', label: 'Settings', shortcut: 'Ctrl+8' }
  ];

  const handleNavClick = (itemId: string) => {
    if (onSectionChange && typeof onSectionChange === 'function') {
      onSectionChange(itemId);
    }
  };

  const handleMobileToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleMobileMenu && typeof onToggleMobileMenu === 'function') {
      onToggleMobileMenu();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleMobileMenu && typeof onToggleMobileMenu === 'function') {
      onToggleMobileMenu();
    }
  };

  return (
    <>
      {/* Mobile Header */}
      <MobileHeader>
        <MobileMenuButton onClick={handleMobileToggle}>
          <i className={`fas ${isMobileMenuOpen ? 'fa-times' : 'fa-bars'}`}></i>
        </MobileMenuButton>
        <MobileTitle>
          <img src="/JBoardIcon.svg" alt="JBoard Icon" />
          <span>Jetson Board</span>
        </MobileTitle>
        <div style={{ width: '44px' }}></div> {/* Spacer for centering */}
      </MobileHeader>

      {/* Mobile Overlay */}
      <MobileOverlay $isOpen={isMobileMenuOpen} onClick={handleOverlayClick} />

      {/* Sidebar */}
      <SidebarContainer $isOpen={isMobileMenuOpen}>
        <SidebarBrand>
          <SidebarLogo>
            <img className='brand-icon' src="/JBoardIcon.svg" alt="JBoard Icon" style={{ height: '32px', width: 'auto', maxHeight: '100%' }} />
            <span className="brand-text" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '0px' }}>
              v{packageJson.version}
            </span>
          </SidebarLogo>
        </SidebarBrand>

        <SidebarNav>
          {navItems.map(item => (
            <NavItem
              key={item.id}
              $active={activeSection === item.id}
              onClick={() => handleNavClick(item.id)}
              title={`${item.label} (${item.shortcut})`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleNavClick(item.id);
                }
              }}
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
    </>
  );
};

export default Sidebar;