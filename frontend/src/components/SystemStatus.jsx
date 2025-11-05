import React from 'react';
import styled from 'styled-components';

const StatusContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`;

const StatusIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: ${props => props.$connected ? props.theme.colors.nvidia.green : props.theme.colors.status.error};

  i {
    font-size: 8px;
    animation: pulse 2s infinite;
  }
`;

const StatusDot = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.$connected ? props.theme.colors.nvidia.green : props.theme.colors.status.error};
  animation: pulse 2s infinite;
`;

const SystemStatus = ({ isConnected }) => {
  return (
    <StatusContainer>
      <StatusIndicator $connected={isConnected}>
        <StatusDot $connected={isConnected} />
        <span>{isConnected ? 'System Online' : 'System Offline'}</span>
      </StatusIndicator>
    </StatusContainer>
  );
};

export default SystemStatus;