import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { LogsSectionProps } from '../types';
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

const LogsContainer = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.primary};
  border-radius: 8px;
  max-height: 500px;
  overflow-y: auto;
`;

const LogsHeader = styled.div`
  padding: 15px 20px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  background: ${props => props.theme.colors.background.tertiary};
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  .log-info {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 14px;
  }
  
  .refresh-btn {
    background: ${props => props.theme.colors.nvidia.green};
    color: white;
    border: none;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    
    &:hover {
      background: ${props => props.theme.colors.nvidia.greenHover};
    }
  }
`;

const LogEntry = styled.div`
  padding: 8px 20px;
  border-bottom: 1px solid ${props => props.theme.colors.border.tertiary};
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: ${props => props.theme.colors.text.primary};
  white-space: pre-wrap;
  word-wrap: break-word;
  
  &:last-child {
    border-bottom: none;
  }
  
  &:hover {
    background: ${props => props.theme.colors.background.tertiary};
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: ${props => props.theme.colors.text.secondary};

  i {
    font-size: 48px;
    color: ${props => props.theme.colors.nvidia.green};
    margin-bottom: 16px;
    opacity: 0.6;
  }

  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 16px 0 8px;
  }
`;

const LogsSection: React.FC<LogsSectionProps> = ({ systemData, socket, isConnected }) => {
  const [logs, setLogs] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  useEffect(() => {
    if (systemData?.system_logs) {
      setLogs(systemData.system_logs.recent_logs || []);
      setLastUpdated(systemData.system_logs.last_updated);
    }
  }, [systemData]);
  
  const refreshLogs = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/system/logs`);
      const data = await response.json();
      if (data.success) {
        setLogs(data.data.recent_logs || []);
        setLastUpdated(data.data.last_updated);
      }
    } catch (error) {
      console.error('Failed to refresh logs:', error);
    }
  };
  
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <Container>
      <SectionHeader>
        <h2>
          <i className="fas fa-file-alt"></i>
          System Logs
        </h2>
      </SectionHeader>
      
      {logs.length > 0 ? (
        <LogsContainer>
          <LogsHeader>
            <div className="log-info">
              {logs.length} recent entries • Last updated: {formatTimestamp(lastUpdated)}
            </div>
            <button className="refresh-btn" onClick={refreshLogs}>
              <i className="fas fa-sync-alt"></i> Refresh
            </button>
          </LogsHeader>
          {logs.map((log, index) => (
            <LogEntry key={index}>
              {log}
            </LogEntry>
          ))}
        </LogsContainer>
      ) : (
        <EmptyState>
          <i className="fas fa-file-alt"></i>
          <h3>No System Logs Available</h3>
          <p>System logs are being collected. Check back in a moment or click refresh.</p>
          <button className="refresh-btn" onClick={refreshLogs} style={{marginTop: '10px'}}>
            <i className="fas fa-sync-alt"></i> Refresh Logs
          </button>
        </EmptyState>
      )}
    </Container>
  );
};

export default LogsSection;