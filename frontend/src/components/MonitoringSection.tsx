import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import type { SystemData, BufferedData, BufferStats, MonitoringSectionProps } from '../types';
import { getBackendUrl } from '../utils/api';
import { useNotifications } from '../contexts/NotificationContext';
import Modal, { ModalHeader, ModalBody, ModalFooter, ModalCloseButton } from './shared/Modal';

// Styled component interfaces
interface StyledConnectionProps {
  $connected: boolean;
}

interface StyledActiveProps {
  $active: boolean;
}

interface StyledPausedProps {
  $paused: boolean;
}

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const Container = styled.div`
  padding: 20px;

  /* Mobile styles */
  ${props => props.theme.media.mobile} {
    padding: 15px;
  }
  
  @media (max-width: 480px) {
    padding: 10px;
  }

  /* Tablet styles */
  ${props => props.theme.media.tablet} {
    padding: 18px;
  }

  /* Desktop styles */
  @media (min-width: 992px) {
    padding: 30px;
  }
`;

const SectionHeader = styled.div`
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};

  ${props => props.theme.media.mobile} {
    margin-bottom: 20px;
    padding-bottom: 10px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 24px;
    margin: 0;
    font-family: ${props => props.theme.fonts.display};

    ${props => props.theme.media.mobile} {
      font-size: 20px;
      gap: 8px;
    }
    
    @media (max-width: 480px) {
      font-size: 18px;
      gap: 6px;
    }

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const StatusIndicator = styled.div<StyledConnectionProps>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 15px;
  background: ${props => props.theme.colors.background.tertiary};
  border-radius: 6px;
  margin-bottom: 20px;
  
  ${props => props.theme.media.mobile} {
    padding: 8px 12px;
    gap: 6px;
    margin-bottom: 15px;
  }
  
  @media (max-width: 480px) {
    padding: 6px 10px;
    margin-bottom: 12px;
  }
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${props => props.$connected ? props.theme.colors.nvidia.green : props.theme.colors.status.error};
  }
  
  .status-text {
    color: ${props => props.theme.colors.text.primary};
    font-size: 14px;
  }
`;

const DetailCard = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.primary};
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
  
  h3 {
    color: ${props => props.theme.colors.nvidia.green};
    margin: 0 0 15px 0;
    font-size: 18px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
`;

const MetricRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid ${props => props.theme.colors.border.tertiary};
  
  &:last-child {
    border-bottom: none;
  }
  
  .label {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 14px;
  }
  
  .value {
    color: ${props => props.theme.colors.text.primary};
    font-weight: 500;
    font-family: 'Courier New', monospace;
  }
`;

// Monitoring styled components
const ChartSection = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
`;

const ChartHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  
  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    
    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const ChartContainer = styled.div`
  height: 300px;
  margin-bottom: 20px;
`;

const TabContainer = styled.div`
  margin-bottom: 20px;
`;

const TabButtons = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
`;

const TabButton = styled.button<StyledActiveProps>`
  background: ${props => props.$active ? props.theme.colors.nvidia.green : props.theme.colors.background.tertiary};
  color: ${props => props.$active ? props.theme.colors.nvidia.black : props.theme.colors.text.primary};
  border: 1px solid ${props => props.$active ? props.theme.colors.nvidia.green : props.theme.colors.border.secondary};
  border-radius: 6px;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all ${props => props.theme.transitions.fast};
  
  &:hover {
    background: ${props => props.$active ? props.theme.colors.nvidia.darkGreen : props.theme.colors.background.hover};
    border-color: ${props => props.theme.colors.nvidia.green};
  }
`;

const PauseButton = styled.button<StyledPausedProps>`
  background: ${props => props.$paused ? props.theme.colors.status.warning : props.theme.colors.nvidia.green};
  color: ${props => props.theme.colors.text.primary};
  border: 1px solid ${props => props.$paused ? props.theme.colors.status.warning : props.theme.colors.nvidia.green};
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all ${props => props.theme.transitions.fast};
  display: flex;
  align-items: center;
  gap: 5px;
  
  &:hover {
    opacity: 0.8;
  }
  
  i {
    font-size: 12px;
  }
`;

const ClearCacheButton = styled.button`
  background: ${props => props.theme.colors.status.warning};
  color: ${props => props.theme.colors.text.primary};
  border: 1px solid ${props => props.theme.colors.status.warning};
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all ${props => props.theme.transitions.fast};
  display: flex;
  align-items: center;
  gap: 6px;
  
  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.status.error};
    border-color: ${props => props.theme.colors.status.error};
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  i {
    font-size: 12px;
  }
`;

const MemorySection = styled.div`
  margin-bottom: 20px;
  padding: 15px;
  background: ${props => props.theme.colors.background.tertiary};
  border-radius: 8px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  
  h4 {
    margin: 0 0 15px 0;
    color: ${props => props.theme.colors.text.primary};
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    
    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const SudoPasswordInput = styled.input`
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
    box-shadow: 0 0 0 2px rgba(118, 185, 0, 0.2);
  }

  &::placeholder {
    color: ${props => props.theme.colors.text.secondary};
  }
`;

const SudoModalButtons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;

  button {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all ${props => props.theme.transitions.fast};
    border: 1px solid transparent;
    
    &.cancel {
      background: ${props => props.theme.colors.background.tertiary};
      color: ${props => props.theme.colors.text.primary};
      border-color: ${props => props.theme.colors.border.secondary};
      
      &:hover {
        background: ${props => props.theme.colors.background.hover};
      }
    }
    
    &.confirm {
      background: ${props => props.theme.colors.status.warning};
      color: ${props => props.theme.colors.text.primary};
      border-color: ${props => props.theme.colors.status.warning};
      
      &:hover:not(:disabled) {
        background: ${props => props.theme.colors.status.error};
        border-color: ${props => props.theme.colors.status.error};
      }
      
      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
  }
`;

const MonitoringSection: React.FC<MonitoringSectionProps> = ({ systemData, socket, isConnected, getBufferedData, getBufferStats, clearDataBuffer }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tab } = useParams<{ tab?: string }>();
  
  // Initialize tab from URL parameter, default to 'cpu'
  const getValidTab = (urlTab?: string): string => {
    const validTabs = ['cpu', 'gpu', 'memory', 'network', 'fan'];
    if (urlTab && validTabs.includes(urlTab)) {
      return urlTab;
    }
    return 'cpu';
  };

  const [refreshTime, setRefreshTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState(getValidTab(tab));
  const [lastDataUpdate, setLastDataUpdate] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [showSudoModal, setShowSudoModal] = useState(false);
  const [sudoPassword, setSudoPassword] = useState('');
  //@ts-ignore
  const { showNotification } = useNotifications();
  const [historicalData, setHistoricalData] = useState<{
    cpu: { labels: string[]; datasets: any[] };
    gpu: { labels: string[]; datasets: any[] };
    memory: { labels: string[]; datasets: any[] };
    network: { labels: string[]; datasets: any[] };
    fan: { labels: string[]; datasets: any[] };
  }>({
    cpu: { labels: [], datasets: [] },
    gpu: { labels: [], datasets: [] },
    memory: { labels: [], datasets: [] },
    network: { labels: [], datasets: [] },
    fan: { labels: [], datasets: [] }
  });
  const [bufferedDataStats, setBufferedDataStats] = useState<BufferStats | null>(null);
  const maxDataPoints = 50; // Increased since we have buffered data
  const updateInterval = 2000; // Update charts every 2 seconds

  // Sync state with URL parameters
  useEffect(() => {
    const newTab = getValidTab(tab);
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
  }, [tab]);

  // Navigation helper function
  const navigateToTab = (newTab: string) => {
    navigate(`/monitoring/${newTab}`);
  };
  
  const { addNotification } = useNotifications();

  // Cache clearing handler
  const handleClearCache = async () => {
    setShowSudoModal(true);
  };

  const executeCacheClear = async () => {
    if (!sudoPassword.trim()) {
      addNotification({
        type: 'error',
        title: 'Password Required',
        message: 'Please enter your sudo password'
      });
      return;
    }

    setClearingCache(true);
    setShowSudoModal(false);
    
    try {
      const response = await fetch(`${getBackendUrl()}/system/clear-cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sudo_password: sudoPassword
        })
      });

      const result = await response.json();
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Cache Cleared',
          message: 'System cache cleared successfully! Memory freed up.'
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Cache Clear Failed',
          message: `Failed to clear cache: ${result.error}`
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Cache Clear Error',
        message: `Error clearing cache: ${error}`
      });
    } finally {
      setClearingCache(false);
      setSudoPassword(''); // Clear password for security
    }
  };

  const cancelSudoModal = () => {
    setShowSudoModal(false);
    setSudoPassword('');
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTime(new Date());
    }, 1000); // Update every 1 second
    
    return () => clearInterval(interval);
  }, []);

  // Update charts with buffered data periodically
  useEffect(() => {
    if (!getBufferedData || isPaused) {
      return undefined;
    }

    // Initial load
    const bufferedData = getBufferedData();
    const stats = getBufferStats();
    
    console.log('Initial buffered data:', bufferedData);
    console.log('Initial buffer stats:', stats);
    
    setBufferedDataStats(stats);
    
    if (bufferedData && bufferedData.size > 0) {
      updateChartsWithBufferedData(bufferedData);
    }

    const interval = setInterval(() => {
      const bufferedData = getBufferedData();
      const stats = getBufferStats();
      
      console.log('Updating charts with buffered data:', bufferedData);
      console.log('Buffer stats:', stats);
      
      setBufferedDataStats(stats);
      
      if (bufferedData && bufferedData.size > 0) {
        updateChartsWithBufferedData(bufferedData);
      }
    }, updateInterval);
    
    return () => clearInterval(interval);
  }, [getBufferedData, getBufferStats, isPaused, updateInterval]);

  const updateChartsWithBufferedData = (bufferedData: BufferedData): void => {
    // CPU Chart
    const cpuChart = {
      labels: bufferedData.cpu.map(d => d.time).slice(-maxDataPoints),
      datasets: [
        {
          label: 'CPU Usage (%)',
          data: bufferedData.cpu.map(d => d.overall).slice(-maxDataPoints),
          borderColor: '#76B900',
          backgroundColor: 'rgba(118, 185, 0, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Temperature (°C)',
          data: bufferedData.cpu.map(d => d.temperature).slice(-maxDataPoints),
          borderColor: '#FFA500',
          backgroundColor: 'rgba(255, 165, 0, 0.1)',
          fill: false,
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    };

    // GPU Chart
    const gpuChart = {
      labels: bufferedData.gpu.map(d => d.time).slice(-maxDataPoints),
      datasets: [
        {
          label: 'GPU Usage (%)',
          data: bufferedData.gpu.map(d => d.usage).slice(-maxDataPoints),
          borderColor: '#00BFFF',
          backgroundColor: 'rgba(0, 191, 255, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'GPU Temperature (°C)',
          data: bufferedData.gpu.map(d => d.temperature).slice(-maxDataPoints),
          borderColor: '#FF4444',
          backgroundColor: 'rgba(255, 68, 68, 0.1)',
          fill: false,
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    };

    // Memory Chart - Stacked Area Chart showing memory breakdown
    const memoryChart = {
      labels: bufferedData.memory.map(d => d.time).slice(-maxDataPoints),
      datasets: [
        {
          label: 'Used Memory (GB)',
          data: bufferedData.memory.map(d => d.used_gb).slice(-maxDataPoints),
          borderColor: '#FF4444',
          backgroundColor: 'rgba(255, 68, 68, 0.4)',
          fill: true,
          tension: 0.4,
          stack: 'memory'
        },
        {
          label: 'Cached (GB)',
          data: bufferedData.memory.map(d => d.cached_gb).slice(-maxDataPoints),
          borderColor: '#4ECDC4',
          backgroundColor: 'rgba(78, 205, 196, 0.4)',
          fill: true,
          tension: 0.4,
          stack: 'memory'
        },
        {
          label: 'Buffers (GB)',
          data: bufferedData.memory.map(d => d.buffers_gb).slice(-maxDataPoints),
          borderColor: '#9B59B6',
          backgroundColor: 'rgba(155, 89, 182, 0.4)',
          fill: true,
          tension: 0.4,
          stack: 'memory'
        },
      ],
    };

    // Network Chart (showing deltas for better visualization)
    const networkChart = {
      labels: bufferedData.network.map(d => d.time).slice(-maxDataPoints),
      datasets: [
        {
          label: 'Sent (Δ bytes/s)',
          data: bufferedData.network.map(d => d.sent_delta || 0).slice(-maxDataPoints),
          borderColor: '#76B900',
          backgroundColor: 'rgba(118, 185, 0, 0.1)',
          fill: false,
          tension: 0.4
        },
        {
          label: 'Received (Δ bytes/s)',
          data: bufferedData.network.map(d => d.received_delta || 0).slice(-maxDataPoints),
          borderColor: '#00BFFF',
          backgroundColor: 'rgba(0, 191, 255, 0.1)',
          fill: false,
          tension: 0.4
        }
      ]
    };

    // Fan Chart
    const fanChart = {
      labels: bufferedData.fan.map(d => d.time).slice(-maxDataPoints),
      datasets: [
        {
          label: 'Fan Speed (%)',
          data: bufferedData.fan.map(d => d.speed).slice(-maxDataPoints),
          borderColor: '#4ECDC4',
          backgroundColor: 'rgba(78, 205, 196, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Total Power (W)',
          data: bufferedData.fan.map(d => d.total_power).slice(-maxDataPoints),
          borderColor: '#FFD700',
          backgroundColor: 'rgba(255, 215, 0, 0.1)',
          fill: false,
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    };

    setHistoricalData({
      cpu: cpuChart,
      gpu: gpuChart,
      memory: memoryChart,
      network: networkChart,
      fan: fanChart
    });
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getCPUCores = () => {
    if (!systemData?.cpu?.cores || !Array.isArray(systemData.cpu.cores)) {
      return [];
    }
    return systemData.cpu.cores;
  };

  const getChartOptions = (title: string, hasSecondaryAxis: boolean = false, startFromZero: boolean = false, maxValue: number | null = null, secondaryRange: [number, number] | null = null): any => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#FFFFFF',
          font: {
            size: 12
          }
        }
      },
      title: {
        display: true,
        text: title,
        color: '#76B900',
        font: {
          size: 16,
          weight: 'bold' as const
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#CCCCCC',
          maxTicksLimit: 6
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
      y: {
        beginAtZero: startFromZero,
        ...(maxValue && { max: maxValue }),
        ticks: {
          color: '#CCCCCC'
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
      ...(hasSecondaryAxis && {
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          // Fixed range (e.g. 0-100 °C) instead of auto-scaling to the data
          ...(secondaryRange && { min: secondaryRange[0], max: secondaryRange[1] }),
          ticks: {
            color: '#CCCCCC'
          },
          grid: {
            drawOnChartArea: false,
          },
        }
      })
    },
    elements: {
      point: {
        radius: 3,
        hoverRadius: 6
      }
    },
    animation: {
      duration: 300
    }
  });

  // Stacked chart options for memory breakdown
  const getStackedChartOptions = (title: string, yAxisLabel: string = '', dynamicMax?: number): any => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#FFFFFF',
          font: {
            size: 12
          }
        }
      },
      title: {
        display: true,
        text: title,
        color: '#76B900',
        font: {
          size: 16,
          weight: 'bold' as const
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          footer: function(context: any) {
            let sum = 0;
            context.forEach(function(tooltipItem: any) {
              sum += tooltipItem.parsed.y;
            });
            return 'Total: ' + sum.toFixed(2) + ' GB';
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#CCCCCC',
          maxTicksLimit: 6
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
      y: {
        stacked: true,
        ticks: {
          color: '#CCCCCC',
          beginAtZero: true
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        title: {
          display: !!yAxisLabel,
          text: yAxisLabel,
          color: '#CCCCCC'
        },
        min: 0,
        max: dynamicMax || 8
      }
    },
    elements: {
      point: {
        radius: 2,
        hoverRadius: 4
      }
    },
    animation: {
      duration: 300
    }
  });

  const renderCPUChart = () => (
    <>
      <ChartSection>
        <ChartHeader>
          <h3><i className="fas fa-microchip"></i>CPU Performance</h3>
        </ChartHeader>
        <ChartContainer>
          <Line 
            data={historicalData.cpu} 
            options={getChartOptions('CPU Usage & Temperature', true, true, 100, [0, 100])} 
          />
        </ChartContainer>
      </ChartSection>
      
      <DetailCard>
        <h3>
          <i className="fas fa-microchip"></i>
          CPU Details
        </h3>
        <MetricRow>
          <span className="label">Overall Usage</span>
          <span className="value">{(systemData?.cpu?.usage || 0).toFixed(1)}%</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Load Average</span>
          <span className="value">{systemData?.cpu?.load_avg || 'N/A'}</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Temperature</span>
          <span className="value">{systemData?.cpu?.temperature ? `${systemData.cpu.temperature.toFixed(1)}°C` : 'N/A'}</span>
        </MetricRow>
        {getCPUCores().length > 0 ? getCPUCores().map((core, index) => (
          <MetricRow key={index}>
            <span className="label">Core {index + 1}</span>
            <span className="value">{(core || 0).toFixed(1)}%</span>
          </MetricRow>
        )) : (
          <MetricRow>
            <span className="label">CPU Cores</span>
            <span className="value">No core data available</span>
          </MetricRow>
        )}
      </DetailCard>
    </>
  );

  const renderGPUChart = () => (
    <>
      <ChartSection>
        <ChartHeader>
          <h3><i className="fas fa-tv"></i>GPU Performance</h3>
        </ChartHeader>
        <ChartContainer>
          <Line 
            data={historicalData.gpu} 
            options={getChartOptions('GPU Usage & Temperature', true, true, 100, [0, 100])} 
          />
        </ChartContainer>
      </ChartSection>
      
      <DetailCard>
        <h3>
          <i className="fas fa-tv"></i>
          GPU Details
        </h3>
        <MetricRow>
          <span className="label">Usage</span>
          <span className="value">{(systemData?.gpu?.usage || 0).toFixed(1)}%</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Temperature</span>
          <span className="value">{systemData?.gpu?.temperature ? `${systemData.gpu.temperature.toFixed(1)}°C` : 'N/A'}</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Power</span>
          <span className="value">{systemData?.gpu?.power ? `${systemData.gpu.power.toFixed(1)}W` : 'N/A'}</span>
        </MetricRow>
      </DetailCard>
    </>
  );

  const renderMemoryChart = () => (
    <>
      <ChartSection>
        <ChartHeader>
          <h3><i className="fas fa-memory"></i>Memory Usage</h3>
        </ChartHeader>
        <ChartContainer>
          <Line 
            data={historicalData.memory} 
            options={getStackedChartOptions(
              'Memory Usage Breakdown Over Time', 
              'Memory (GB)', 
              systemData?.memory?.detailed?.total_gb
            )} 
          />
        </ChartContainer>
      </ChartSection>
      
      <DetailCard>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
          <h3>
            <i className="fas fa-memory"></i>
            Memory Details
          </h3>
          <ClearCacheButton onClick={handleClearCache} disabled={clearingCache}>
            {clearingCache ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                Clearing...
              </>
            ) : (
              <>
                <i className="fas fa-broom"></i>
                Clear Cache
              </>
            )}
          </ClearCacheButton>
        </div>
        
        {/* Overview */}
        <MemorySection>
          <h4><i className="fas fa-chart-pie"></i> Overview</h4>
          <MetricRow>
            <span className="label">Usage</span>
            <span className="value">
              {(systemData?.memory?.percent || 0).toFixed(1)}% 
              ({systemData?.memory?.detailed?.used_gb?.toFixed(2) || '0.00'} GB)
            </span>
          </MetricRow>
          <MetricRow>
            <span className="label">Total RAM</span>
            <span className="value">
              {formatBytes(systemData?.memory?.total)} 
              ({systemData?.memory?.detailed?.total_gb?.toFixed(2) || '0.00'} GB)
            </span>
          </MetricRow>
          <MetricRow>
            <span className="label">Available</span>
            <span className="value">
              {formatBytes(systemData?.memory?.available)} 
              ({systemData?.memory?.detailed?.available_gb?.toFixed(2) || '0.00'} GB)
            </span>
          </MetricRow>
        </MemorySection>

        {/* Detailed Breakdown */}
        <MemorySection>
          <h4><i className="fas fa-layer-group"></i> Memory Breakdown</h4>
          <MetricRow>
            <span className="label">Free</span>
            <span className="value">
              {formatBytes(systemData?.memory?.detailed?.free)} 
              ({systemData?.memory?.detailed?.free_gb?.toFixed(2) || '0.00'} GB)
            </span>
          </MetricRow>
          <MetricRow>
            <span className="label">Cached</span>
            <span className="value">
              {formatBytes(systemData?.memory?.detailed?.cached)} 
              ({systemData?.memory?.detailed?.cached_gb?.toFixed(2) || '0.00'} GB)
            </span>
          </MetricRow>
          <MetricRow>
            <span className="label">Buffers</span>
            <span className="value">
              {formatBytes(systemData?.memory?.detailed?.buffers)} 
              ({systemData?.memory?.detailed?.buffers_gb?.toFixed(2) || '0.00'} GB)
            </span>
          </MetricRow>
          <MetricRow>
            <span className="label">Shared</span>
            <span className="value">
              {formatBytes(systemData?.memory?.detailed?.shared)} 
              ({systemData?.memory?.detailed?.shared_gb?.toFixed(2) || '0.00'} GB)
            </span>
          </MetricRow>
        </MemorySection>
      </DetailCard>
    </>
  );

  const renderNetworkChart = () => (
    <>
      <ChartSection>
        <ChartHeader>
          <h3><i className="fas fa-network-wired"></i>Network Activity</h3>
        </ChartHeader>
        <ChartContainer>
          <Line 
            data={historicalData.network} 
            options={getChartOptions('Network Traffic')} 
          />
        </ChartContainer>
      </ChartSection>
      
      <DetailCard>
        <h3>
          <i className="fas fa-network-wired"></i>
          Network Details
        </h3>
        <MetricRow>
          <span className="label">Bytes Sent</span>
          <span className="value">{formatBytes(systemData?.network?.bytes_sent)}</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Bytes Received</span>
          <span className="value">{formatBytes(systemData?.network?.bytes_recv)}</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Packets Sent</span>
          <span className="value">{(systemData?.network?.packets_sent || 0).toLocaleString()}</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Packets Received</span>
          <span className="value">{(systemData?.network?.packets_recv || 0).toLocaleString()}</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Errors In</span>
          <span className="value">{systemData?.network?.errin || 0}</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Errors Out</span>
          <span className="value">{systemData?.network?.errout || 0}</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Drops In</span>
          <span className="value">{systemData?.network?.dropin || 0}</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Drops Out</span>
          <span className="value">{systemData?.network?.dropout || 0}</span>
        </MetricRow>
      </DetailCard>
    </>
  );

  const renderFanChart = () => (
    <>
      <ChartSection>
        <ChartHeader>
          <h3><i className="fas fa-fan"></i>Fan Performance</h3>
        </ChartHeader>
        <ChartContainer>
          <Line 
            data={historicalData.fan}
            options={getChartOptions('Fan Performance', true, true, 100)} 
          />
        </ChartContainer>
      </ChartSection>
      
      <DetailCard>
        <h3>
          <i className="fas fa-fan"></i>
          Fan Details
        </h3>
        <MetricRow>
          <span className="label">Fan Speed</span>
          <span className="value">{(systemData?.fan?.speed || 0).toFixed(1)}%</span>
        </MetricRow>
        <MetricRow>
          <span className="label">RPM</span>
          <span className="value">{(systemData?.fan?.rpm || 0).toFixed(0)} RPM</span>
        </MetricRow>
        <MetricRow>
          <span className="label">CPU Temperature</span>
          <span className="value">{(systemData?.fan?.cpu_temp || 0).toFixed(1)}°C</span>
        </MetricRow>
        <MetricRow>
          <span className="label">GPU Temperature</span>
          <span className="value">{(systemData?.fan?.gpu_temp || 0).toFixed(1)}°C</span>
        </MetricRow>
        <MetricRow>
          <span className="label">Total Power</span>
          <span className="value">{(systemData?.fan?.total_power || 0).toFixed(1)}W</span>
        </MetricRow>
      </DetailCard>
    </>
  );

  const renderActiveChart = () => {
    switch (activeTab) {
      case 'cpu': return renderCPUChart();
      case 'gpu': return renderGPUChart();
      case 'memory': return renderMemoryChart();
      case 'network': return renderNetworkChart();
      case 'fan': return renderFanChart();
      default: return renderCPUChart();
    }
  };

  return (
    <>
      <Container>
        <SectionHeader>
          <h2>
            <i className="fas fa-chart-line"></i>
            System Monitoring
          </h2>
        </SectionHeader>

      <StatusIndicator $connected={isConnected}>
        <div className="status-dot"></div>
        <div className="status-text">
          {isConnected ? (isPaused ? 'Paused - Chart updates stopped' : 'Connected - Background monitoring active') : 'Disconnected - Data may be stale'}
        </div>
        <div style={{fontSize: '12px', color: '#888', flex: 1}}>
          Last update: {refreshTime.toLocaleTimeString()}
          {bufferedDataStats && (
            <span style={{marginLeft: '15px'}}>
              Buffer: {bufferedDataStats.totalDataPoints} points 
              {bufferedDataStats.isCollecting && <span style={{color: '#76B900'}}> (recording)</span>}
            </span>
          )}
        </div>
        <div style={{display: 'flex', gap: '10px', marginLeft: 'auto'}}>
          <PauseButton 
            $paused={isPaused} 
            onClick={() => setIsPaused(!isPaused)}
          >
            <i className={`fas ${isPaused ? 'fa-play' : 'fa-pause'}`}></i>
            {isPaused ? 'Resume Charts' : 'Pause Charts'}
          </PauseButton>
          {clearDataBuffer && (
            <PauseButton 
              $paused={false}
              onClick={() => {
                clearDataBuffer();
                setBufferedDataStats(null);
              }}
              style={{
                backgroundColor: '#dc3545', 
                borderColor: '#dc3545',
                color: '#ffffff'
              }}
              onMouseEnter={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.backgroundColor = '#c82333';
                target.style.borderColor = '#bd2130';
              }}
              onMouseLeave={(e) => {
                const target = e.target as HTMLButtonElement;
                target.style.backgroundColor = '#dc3545';
                target.style.borderColor = '#dc3545';
              }}
            >
              <i className="fas fa-trash"></i>
              Clear Buffer
            </PauseButton>
          )}
        </div>
      </StatusIndicator>

      {/* Tabulated Charts Section */}
      <TabContainer>
        <TabButtons>
          <TabButton 
            $active={activeTab === 'cpu'} 
            onClick={() => navigateToTab('cpu')}
          >
            <i className="fas fa-microchip"></i> CPU
          </TabButton>
          <TabButton 
            $active={activeTab === 'gpu'} 
            onClick={() => navigateToTab('gpu')}
          >
            <i className="fas fa-tv"></i> GPU
          </TabButton>
          <TabButton 
            $active={activeTab === 'memory'} 
            onClick={() => navigateToTab('memory')}
          >
            <i className="fas fa-memory"></i> Memory
          </TabButton>
          <TabButton 
            $active={activeTab === 'network'} 
            onClick={() => navigateToTab('network')}
          >
            <i className="fas fa-network-wired"></i> Network
          </TabButton>
          <TabButton 
            $active={activeTab === 'fan'} 
            onClick={() => navigateToTab('fan')}
          >
            <i className="fas fa-fan"></i> Fan
          </TabButton>
        </TabButtons>
        
        {renderActiveChart()}
      </TabContainer>
    </Container>
    
    {/* Sudo Password Modal for Cache Clearing */}
    <Modal isOpen={showSudoModal} onClose={cancelSudoModal} maxWidth="500px">
      <ModalHeader>
        <h3>
          <i className="fas fa-broom"></i>
          Clear System Cache
        </h3>
        <ModalCloseButton onClick={cancelSudoModal}>
          <i className="fas fa-times"></i>
        </ModalCloseButton>
      </ModalHeader>
      <ModalBody>
        <p style={{ color: 'var(--text-secondary)', margin: '0 0 20px 0', lineHeight: '1.5' }}>
          Enter your sudo password to clear system cache and free up memory:
        </p>
        <SudoPasswordInput
          type="password"
          placeholder="Enter sudo password"
          value={sudoPassword}
          onChange={(e) => setSudoPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              executeCacheClear();
            } else if (e.key === 'Escape') {
              cancelSudoModal();
            }
          }}
          autoFocus
        />
      </ModalBody>
      <ModalFooter>
        <SudoModalButtons>
          <button
            type="button"
            className="cancel"
            onClick={cancelSudoModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm"
            onClick={executeCacheClear}
            disabled={!sudoPassword.trim()}
          >
            Clear Cache
          </button>
        </SudoModalButtons>
      </ModalFooter>
    </Modal>
    </>
  );
};

export default MonitoringSection;