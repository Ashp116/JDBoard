import React from 'react';
import styled from 'styled-components';
import { DashboardProps } from '../types';
import MetricCard from './MetricCard';
import SystemStatus from './SystemStatus';

const DashboardContainer = styled.div`
  padding: 30px;
  min-height: calc(100vh - 120px);
  overflow-y: auto;
`;

const ContentHeader = styled.div`
  background: ${props => props.theme.gradients.card};
  border-bottom: 2px solid ${props => props.theme.colors.nvidia.green};
  padding: 20px 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 10px rgba(118, 185, 0, 0.1);
  margin-bottom: 30px;
  border-radius: 8px;
`;

const HeaderInfo = styled.div`
  h1 {
    font-size: 28px;
    color: ${props => props.theme.colors.nvidia.green};
    margin: 0;
    font-weight: 700;
    font-family: ${props => props.theme.fonts.display};
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
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
  
  @media (max-width: 1200px) {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 15px;
  }
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 15px;
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
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
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
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: ${props => props.theme.colors.text.muted};
  letter-spacing: 1px;
  text-transform: uppercase;
`;

const Dashboard: React.FC<DashboardProps> = ({ systemData, isConnected }) => {
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
        <HeaderInfo>
          <h1>JBoard</h1>
          <HeaderMeta>
            <span>Jetson Edge Computing Platform</span>
            <span className="separator">•</span>
            <span>{currentTime}</span>
          </HeaderMeta>
        </HeaderInfo>
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