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
import ProcessMonitoring from './components/ProcessMonitoring';
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
  ${(props: any) => props.theme.media.tablet} {
    flex-direction: column;
  }
  
  ${(props: any) => props.theme.media.mobile} {
    flex-direction: column;
  }
`;

const MainContent = styled.main<{ $isMobileMenuOpen?: boolean }>`
  flex: 1;
  min-height: 100vh;
  transition: all ${(props: any) => props.theme.transitions.medium};
  background: ${(props: any) => props.theme.colors.background.primary};
  
  /* Mobile styles */
  ${(props: any) => props.theme.media.tablet} {
    margin-left: 0;
    padding-top: 60px; /* Account for mobile header */
    transform: ${props => props.$isMobileMenuOpen ? 'translateX(250px)' : 'translateX(0)'};
    min-height: calc(100vh - 60px);
  }
  
  ${(props: any) => props.theme.media.mobile} {
    margin-left: 0;
    padding-top: 60px;
    transform: ${props => props.$isMobileMenuOpen ? 'translateX(250px)' : 'translateX(0)'};
    min-height: calc(100vh - 60px);
  }
  
  @media (max-width: 480px) {
    padding-top: 55px;
    min-height: calc(100vh - 55px);
  }

  /* Desktop styles */
  @media (min-width: 992px) {
    margin-left: 80px;
    padding-top: 0;
    transform: none;
    min-height: 100vh;
  }
`;

const ContentSection = styled.section<{ $active: boolean }>`
  display: ${props => props.$active ? 'block' : 'none'};
  padding: 20px;
  animation: fadeIn ${(props: any) => props.theme.transitions.medium};
  
  ${(props: any) => props.theme.media.mobile} {
    padding: 15px;
  }
  
  @media (max-width: 480px) {
    padding: 10px;
  }
`;

type SectionKey = 'dashboard' | 'models' | 'inference' | 'monitoring' | 'processes' | 'terminal' | 'logs' | 'settings';

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

  // Update document title based on active section and current path
  useEffect(() => {
    const sectionTitles: Record<SectionKey, string> = {
      dashboard: 'Dashboard',
      models: 'Models',
      inference: 'Inference', 
      monitoring: 'Monitoring',
      processes: 'Process Monitor',
      terminal: 'Terminal',
      logs: 'Logs',
      settings: 'Settings'
    };
    
    let sectionTitle = sectionTitles[activeSection] || 'Dashboard';
    
    // Add more specific titles for subsections based on URL
    const pathSegments = location.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 1) {
      const subsection = pathSegments[1];
      
      // Handle inference subsections
      if (activeSection === 'inference') {
        const inferenceSubtitles: Record<string, string> = {
          'live': 'Live Inference',
          'batch': 'Batch Processing', 
          'upload': 'Upload & Test',
          'history': 'Inference History'
        };
        if (inferenceSubtitles[subsection]) {
          sectionTitle = `${sectionTitle} - ${inferenceSubtitles[subsection]}`;
        }
      }
      
      // Handle monitoring subsections  
      if (activeSection === 'monitoring') {
        const monitoringSubtitles: Record<string, string> = {
          'system': 'System Metrics',
          'gpu': 'GPU Monitoring',
          'memory': 'Memory Usage',
          'processes': 'Process Monitor'
        };
        if (monitoringSubtitles[subsection]) {
          sectionTitle = `${sectionTitle} - ${monitoringSubtitles[subsection]}`;
        }
      }
    }
    
    document.title = `JBoard | ${sectionTitle}`;
  }, [activeSection, location.pathname]);

  const sections: Record<SectionKey, any> = {
    dashboard: Dashboard,
    models: ModelsSection,
    inference: InferenceSection,
    monitoring: MonitoringSection,
    processes: ProcessMonitoring,
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
              path="/processes" 
              element={renderSectionWithProps(ProcessMonitoring)} 
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