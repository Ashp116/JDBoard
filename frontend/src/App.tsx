import React, { useState } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { GlobalStyles } from './styles/GlobalStyles';
import { nvidiaTheme } from './styles/theme';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ModelsSection from './components/ModelsSection';
import InferenceSection from './components/InferenceSection';
import MonitoringSection from './components/MonitoringSection';
import LogsSection from './components/LogsSection';
import SettingsSection from './components/SettingsSection';
import { useSocket } from './hooks/useSocket';

const AppContainer = styled.div`
  display: flex;
  min-height: 100vh;
  background: ${(props: any) => props.theme.colors.background.primary};
`;

const MainContent = styled.main`
  margin-left: 80px;
  flex: 1;
  min-height: 100vh;
  transition: margin-left ${(props: any) => props.theme.transitions.medium};
  background: ${(props: any) => props.theme.colors.background.primary};
`;

const ContentSection = styled.section<{ $active: boolean }>`
  display: ${props => props.$active ? 'block' : 'none'};
  padding: 20px;
  animation: fadeIn ${(props: any) => props.theme.transitions.medium};
`;

type SectionKey = 'dashboard' | 'models' | 'inference' | 'monitoring' | 'logs' | 'settings';

function App(): JSX.Element {
  const [activeSection, setActiveSection] = useState<SectionKey>('dashboard');
  const { 
    socket, 
    isConnected, 
    systemData, 
    getBufferedData, 
    getBufferStats, 
    clearDataBuffer 
  } = useSocket();

  const sections: Record<SectionKey, any> = {
    dashboard: Dashboard,
    models: ModelsSection,
    inference: InferenceSection,
    monitoring: MonitoringSection,
    logs: LogsSection,
    settings: SettingsSection
  };

  const renderSection = () => {
    const SectionComponent = sections[activeSection];
    if (!SectionComponent) return null;
    
    // Pass additional props to MonitoringSection
    if (activeSection === 'monitoring') {
      return (
        <SectionComponent 
          systemData={systemData} 
          socket={socket}
          isConnected={isConnected}
          getBufferedData={getBufferedData}
          getBufferStats={getBufferStats}
          clearDataBuffer={clearDataBuffer}
        />
      );
    }
    
    return (
      <SectionComponent 
        systemData={systemData} 
        socket={socket}
        isConnected={isConnected}
      />
    );
  };

  const handleSectionChange = (section: string) => {
    setActiveSection(section as SectionKey);
  };

  return (
    <ThemeProvider theme={nvidiaTheme}>
      <GlobalStyles />
      <AppContainer>
        <Sidebar 
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          isConnected={isConnected}
        />
        <MainContent>
          <ContentSection $active={true}>
            {renderSection()}
          </ContentSection>
        </MainContent>
      </AppContainer>
    </ThemeProvider>
  );
}

export default App;