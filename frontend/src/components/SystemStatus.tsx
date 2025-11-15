import React from 'react';
import styled, { keyframes } from 'styled-components';
import { SystemStatusProps } from '../types';

interface StyledProps {
  $connected: boolean;
}

const StatusContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;

  /* Mobile responsive */
  @media (max-width: 767px) {
    gap: 12px;
    justify-content: center;
  }
`;

const StatusIndicator = styled.div<StyledProps>`
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

  /* Mobile responsive */
  @media (max-width: 767px) {
    font-size: 11px;
    gap: 6px;
  }

  /* Small mobile - show icon only */
  @media (max-width: 480px) {
    span {
      display: none;
    }
  }
`;

const StatusDot = styled.div<StyledProps>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.$connected ? props.theme.colors.nvidia.green : props.theme.colors.status.error};
  animation: pulse 2s infinite;
`;

const SystemStatus: React.FC<SystemStatusProps> = ({ isConnected }) => {
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