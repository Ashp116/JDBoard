import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import styled, { ThemeProvider } from 'styled-components';
import { GlobalStyles } from './styles/GlobalStyles';
import { nvidiaTheme } from './styles/theme';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ModelsSection from './components/ModelsSection';
import InferenceSection from './components/InferenceSection';
import MonitoringSection from './components/MonitoringSection';
import TerminalSection from './components/TerminalSection';
import LogsSection from './components/LogsSection';
import SettingsSection from './components/SettingsSection';
import GlobalNotifications from './components/GlobalNotifications';
import SystemErrorDetector from './components/SystemErrorDetector';
import { NotificationProvider } from './contexts/NotificationContext';
import { useSocket } from './hooks/useSocket';

const AppContainer = styled.div`
  display: flex;
  min-height: 100vh;
  background: ${(props: any) => props.theme.colors.background.primary};
  position: relative;

  /* Mobile first - no sidebar margin on mobile */
  @media (max-width: 991px) {
    flex-direction: column;
  }
`;

const MainContent = styled.main<{ $isMobileMenuOpen?: boolean }>`
  flex: 1;
  min-height: 100vh;
  transition: all ${(props: any) => props.theme.transitions.medium};
  background: ${(props: any) => props.theme.colors.background.primary};
  
  /* Mobile styles */
  @media (max-width: 991px) {
    margin-left: 0;
    padding-top: 60px; /* Account for mobile header */
    transform: ${props => props.$isMobileMenuOpen ? 'translateX(250px)' : 'translateX(0)'};
  }

  /* Desktop styles */
  @media (min-width: 992px) {
    margin-left: 80px;
    padding-top: 0;
    transform: none;
  }
`;

const ContentSection = styled.section<{ $active: boolean }>`
  display: ${props => props.$active ? 'block' : 'none'};
  padding: 20px;
  animation: fadeIn ${(props: any) => props.theme.transitions.medium};
`;

type SectionKey = 'dashboard' | 'models' | 'inference' | 'monitoring' | 'terminal' | 'logs' | 'settings';

interface RouteParams {
  section?: string;
  tab?: string;
  view?: string;
}

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<SectionKey>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  
  const { 
    socket, 
    isConnected, 
    systemData, 
    getBufferedData, 
    getBufferStats, 
    clearDataBuffer 
  } = useSocket();

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Update active section based on current route
  useEffect(() => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const currentSection = pathSegments[0] as SectionKey;
    
    if (location.pathname === '/') {
      setActiveSection('dashboard');
    } else if (currentSection && ['models', 'inference', 'monitoring', 'terminal', 'logs', 'settings'].includes(currentSection)) {
      setActiveSection(currentSection);
    } else {
      setActiveSection('dashboard');
    }
  }, [location.pathname]);

  const sections: Record<SectionKey, any> = {
    dashboard: Dashboard,
    models: ModelsSection,
    inference: InferenceSection,
    monitoring: MonitoringSection,
    terminal: TerminalSection,
    logs: LogsSection,
    settings: SettingsSection
  };

  const handleSectionChange = (section: string) => {
    setActiveSection(section as SectionKey);
    setIsMobileMenuOpen(false); // Close mobile menu when navigating
    if (section === 'dashboard') {
      navigate('/');
    } else {
      navigate(`/${section}`);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const renderSectionWithProps = (SectionComponent: any, additionalProps?: any) => {
    const baseProps = {
      systemData,
      socket,
      isConnected,
      onNavigate: handleSectionChange,
      ...additionalProps
    };

    return <SectionComponent {...baseProps} />;
  };

  return (
    <SystemErrorDetector>
      <AppContainer>
        <Sidebar 
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          isConnected={isConnected}
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMobileMenu={toggleMobileMenu}
        />
        <MainContent $isMobileMenuOpen={isMobileMenuOpen}>
          <Routes>
            <Route 
              path="/" 
              element={renderSectionWithProps(Dashboard)} 
            />
            <Route 
              path="/models" 
              element={renderSectionWithProps(ModelsSection)} 
            />
            <Route 
              path="/inference" 
              element={renderSectionWithProps(InferenceSection)} 
            />
            <Route 
              path="/inference/:tab" 
              element={renderSectionWithProps(InferenceSection)} 
            />
            <Route 
              path="/inference/:tab/:view" 
              element={renderSectionWithProps(InferenceSection)} 
            />
            <Route 
              path="/monitoring" 
              element={renderSectionWithProps(MonitoringSection, {
                getBufferedData,
                getBufferStats,
                clearDataBuffer
              })} 
            />
            <Route 
              path="/monitoring/:tab" 
              element={renderSectionWithProps(MonitoringSection, {
                getBufferedData,
                getBufferStats,
                clearDataBuffer
              })} 
            />
            <Route 
              path="/terminal" 
              element={renderSectionWithProps(TerminalSection)} 
            />
            <Route 
              path="/logs" 
              element={renderSectionWithProps(LogsSection)} 
            />
            <Route 
              path="/settings" 
              element={renderSectionWithProps(SettingsSection)} 
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MainContent>
        <GlobalNotifications />
      </AppContainer>
    </SystemErrorDetector>
  );
};

function App(): JSX.Element {
  return (
    <ThemeProvider theme={nvidiaTheme}>
      <NotificationProvider>
        <GlobalStyles />
        <Router>
          <AppContent />
        </Router>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;