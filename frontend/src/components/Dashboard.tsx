import React from 'react';
import styled from 'styled-components';
import { DashboardProps } from '../types';
import MetricCard from './MetricCard';
import SystemStatus from './SystemStatus';
import useResponsive from '../hooks/useResponsive';

const DashboardContainer = styled.div`
  padding: 20px;
  min-height: calc(100vh - 120px);
  overflow-y: auto;

  /* Mobile styles */
  @media (max-width: 767px) {
    padding: 15px;
  }

  /* Tablet styles */
  @media (min-width: 768px) and (max-width: 991px) {
    padding: 25px;
  }

  /* Desktop styles */
  @media (min-width: 992px) {
    padding: 30px;
  }
`;

const ContentHeader = styled.div`
  background: ${props => props.theme.gradients.card};
  border-bottom: 2px solid ${props => props.theme.colors.nvidia.green};
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 10px rgba(118, 185, 0, 0.1);
  margin-bottom: 30px;
  border-radius: 8px;

  /* Mobile styles */
  @media (max-width: 767px) {
    flex-direction: column;
    text-align: center;
    gap: 15px;
    padding: 15px;
    margin-bottom: 20px;
  }

  /* Tablet styles */
  @media (min-width: 768px) and (max-width: 991px) {
    padding: 18px;
    margin-bottom: 25px;
  }
`;

const HeaderInfo = styled.div`
  h1 {
    font-size: 28px;
    color: ${props => props.theme.colors.nvidia.green};
    margin: 0;
    font-weight: 700;
    font-family: ${props => props.theme.fonts.display};

    /* Responsive font sizes */
    @media (max-width: 767px) {
      font-size: 24px;
    }

    @media (min-width: 768px) and (max-width: 991px) {
      font-size: 26px;
    }
  }
`;

const HeaderMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  color: ${props => props.theme.colors.text.secondary};
  font-size: 14px;
  margin-top: 4px;

  .separator {
    color: ${props => props.theme.colors.nvidia.green};
  }

  /* Mobile responsive */
  @media (max-width: 567px) {
    flex-direction: column;
    gap: 4px;
    
    .separator {
      display: none;
    }
  }

  @media (max-width: 767px) {
    font-size: 13px;
    gap: 8px;
  }
`;

const MetricsGrid = styled.div`
  display: grid;
  gap: 20px;
  margin-bottom: 30px;
  
  /* Mobile - 1 column */
  grid-template-columns: 1fr;
  
  /* Small tablets - 2 columns */
  @media (min-width: 576px) {
    grid-template-columns: repeat(2, 1fr);
  }
  
  /* Large tablets - 3 columns */
  @media (min-width: 768px) {
    grid-template-columns: repeat(3, 1fr);
  }
  
  /* Desktop - auto-fit with minimum width */
  @media (min-width: 1200px) {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }
  
  /* Mobile adjustments */
  @media (max-width: 767px) {
    gap: 15px;
    margin-bottom: 20px;
  }
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
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

    /* Mobile responsive */
    @media (max-width: 767px) {
      font-size: 20px;
      gap: 8px;
    }
  }

  /* Mobile adjustments */
  @media (max-width: 767px) {
    margin-bottom: 20px;
    padding-bottom: 10px;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  gap: 20px;
  
  /* Mobile - 1 column */
  grid-template-columns: 1fr;
  
  /* Small tablets - 2 columns */
  @media (min-width: 576px) {
    grid-template-columns: repeat(2, 1fr);
  }
  
  /* Large tablets and up - 4 columns */
  @media (min-width: 768px) {
    grid-template-columns: repeat(4, 1fr);
  }
  
  /* Very large screens - auto-fit */
  @media (min-width: 1400px) {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
  
  /* Mobile adjustments */
  @media (max-width: 767px) {
    gap: 15px;
  }
`;

const StatCard = styled.div`
  background: ${props => props.theme.gradients.card};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  transition: all ${props => props.theme.transitions.medium};

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    box-shadow: ${props => props.theme.shadows.card};
    transform: translateY(-2px);
  }
`;

const StatValue = styled.div`
  font-size: 32px;
  font-weight: bold;
  color: ${props => props.theme.colors.nvidia.green};
  text-shadow: 0 0 15px currentColor;
  margin-bottom: 8px;
  font-family: ${props => props.theme.fonts.display};

  /* Mobile responsive */
  @media (max-width: 767px) {
    font-size: 28px;
  }

  @media (min-width: 768px) and (max-width: 991px) {
    font-size: 30px;
  }
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: ${props => props.theme.colors.text.muted};
  letter-spacing: 1px;
  text-transform: uppercase;
`;

const Dashboard: React.FC<DashboardProps> = ({ systemData, isConnected }) => {
  const { isMobile } = useResponsive();
  const currentTime = new Date().toLocaleString();

  const getMetricCards = () => {
    if (!systemData) {
      return [
        { title: 'CPU Usage', value: '--', unit: '%', icon: 'fas fa-microchip', status: 'normal' },
        { title: 'Memory Usage', value: '--', unit: '%', icon: 'fas fa-memory', status: 'normal' },
        { title: 'GPU Usage', value: '--', unit: '%', icon: 'fas fa-video', status: 'normal' },
        { title: 'CPU Temperature', value: '--', unit: '°C', icon: 'fas fa-temperature-high', status: 'normal' },
        { title: 'NVP Model', value: '--', unit: '', icon: 'fas fa-cogs', status: 'normal' }
      ];
    }

    return [
      {
        title: 'CPU Usage',
        value: systemData.cpu?.usage || 0,
        unit: '%',
        icon: 'fas fa-microchip',
        status: systemData.cpu?.usage > 80 ? 'critical' : systemData.cpu?.usage > 60 ? 'warning' : 'normal'
      },
      {
        title: 'Memory Usage',
        value: systemData.memory?.percent || 0,
        unit: '%',
        icon: 'fas fa-memory',
        status: systemData.memory?.percent > 85 ? 'critical' : systemData.memory?.percent > 70 ? 'warning' : 'normal'
      },
      {
        title: 'GPU Usage',
        value: systemData.gpu?.usage || 0,
        unit: '%',
        icon: 'fas fa-video',
        status: systemData.gpu?.usage > 90 ? 'critical' : systemData.gpu?.usage > 75 ? 'warning' : 'normal'
      },
      {
        title: 'CPU Temperature',
        value: systemData.cpu?.temperature || 0,
        unit: '°C',
        icon: 'fas fa-temperature-high',
        status: systemData.cpu?.temperature > 80 ? 'critical' : systemData.cpu?.temperature > 65 ? 'warning' : 'normal'
      },
      {
        title: 'NVP Model',
        value: systemData.nvp_model || 'Unknown',
        unit: '',
        icon: 'fas fa-cogs',
        status: 'normal'
      }
    ];
  };

  const getStats = () => {
    if (!systemData) {
      return {
        uptime: '--',
        processes: '--',
        models: '--',
        inferences: '--'
      };
    }

    return {
      uptime: systemData.uptime || '--',
      processes: systemData.processes || '--',
      models: Array.isArray(systemData.models) ? systemData.models.length : 0,
      inferences: systemData.stats?.totalInferences || 0
    };
  };

  const metrics = getMetricCards();
  const stats = getStats();

  return (
    <DashboardContainer>
      <ContentHeader>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8,
          flexDirection: isMobile ? 'column' : 'row',
          textAlign: isMobile ? 'center' : 'left'
        }}>
          <img 
            src="/JBoardIcon.svg" 
            alt="JBoard Icon" 
            style={{ 
              height: isMobile ? '60px' : '90px', 
              width: 'auto', 
              maxHeight: '100%' 
            }} 
          />
          <HeaderInfo>
            <h1>Jetson Board</h1>
            <HeaderMeta>
              <span>Edge Computing Platform</span>
              <span className="separator">•</span>
              <span>{currentTime}</span>
            </HeaderMeta>
          </HeaderInfo>
        </div>
        <SystemStatus isConnected={isConnected} />
      </ContentHeader>

      <SectionHeader>
        <h2>
          <i className="fas fa-tachometer-alt"></i>
          System Metrics
        </h2>
      </SectionHeader>

      <MetricsGrid>
        {metrics.map((metric, index) => (
          <MetricCard
            key={index}
            title={metric.title}
            value={metric.value}
            unit={metric.unit}
            icon={metric.icon}
            status={metric.status as 'normal' | 'warning' | 'danger' | 'critical'}
          />
        ))}
      </MetricsGrid>

      <SectionHeader>
        <h2>
          <i className="fas fa-chart-bar"></i>
          System Statistics
        </h2>
      </SectionHeader>

      <StatsGrid>
        <StatCard>
          <StatValue>{stats.uptime}</StatValue>
          <StatLabel>System Uptime</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{stats.processes}</StatValue>
          <StatLabel>Active Processes</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{stats.models}</StatValue>
          <StatLabel>Loaded Models</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{stats.inferences}</StatValue>
          <StatLabel>Total Inferences</StatLabel>
        </StatCard>
      </StatsGrid>
    </DashboardContainer>
  );
};

export default Dashboard;