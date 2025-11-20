import React from 'react';
import styled from 'styled-components';
import { MetricCardProps } from '../types';

interface StatusStyleProps {
  $status: 'normal' | 'warning' | 'danger' | 'critical';
}

interface ProgressStyleProps {
  $value: number;
}

const Card = styled.div<StatusStyleProps>`
  background: ${props => props.theme.gradients.card};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  padding: 20px;
  transition: all ${props => props.theme.transitions.medium};
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: ${props => {
      switch (props.$status) {
        case 'critical': return props.theme.colors.status.error;
        case 'warning': return props.theme.colors.status.warning;
        default: return props.theme.colors.nvidia.green;
      }
    }};
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${props => props.theme.shadows.card};
    border-color: ${props => props.theme.colors.nvidia.green};
  }

  /* Mobile responsive */
  ${props => props.theme.media.mobile} {
    padding: 16px;
    
    &:hover {
      transform: none; /* Disable hover transform on touch devices */
    }
  }
  
  @media (max-width: 480px) {
    padding: 14px;
  }

  /* Touch device improvements */
  @media (hover: none) and (pointer: coarse) {
    &:hover {
      transform: none;
    }
  }
`;

const MetricHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 15px;

  i {
    color: ${props => props.theme.colors.nvidia.green};
    font-size: 24px;
    min-width: 24px;
    
    /* Mobile responsive */
    ${props => props.theme.media.mobile} {
      font-size: 20px;
      min-width: 20px;
    }
    
    @media (max-width: 480px) {
      font-size: 18px;
      min-width: 18px;
    }
  }

  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    
    /* Mobile responsive */
    ${props => props.theme.media.mobile} {
      font-size: 16px;
    }
    
    @media (max-width: 480px) {
      font-size: 15px;
    }
  }
  
  /* Mobile adjustments */
  ${props => props.theme.media.mobile} {
    gap: 8px;
    margin-bottom: 12px;
  }
`;

const MetricValue = styled.div`
  margin-bottom: 15px;
`;

const PrimaryValue = styled.span<StatusStyleProps>`
  font-size: 32px;
  font-weight: bold;
  color: ${props => {
    switch (props.$status) {
      case 'critical': return props.theme.colors.status.error;
      case 'warning': return props.theme.colors.status.warning;
      default: return props.theme.colors.nvidia.green;
    }
  }};
  display: block;
  margin-bottom: 8px;
  font-family: ${props => props.theme.fonts.display};
  
  /* Mobile responsive */
  ${props => props.theme.media.mobile} {
    font-size: 28px;
  }
  
  @media (max-width: 480px) {
    font-size: 24px;
  }

  ${props => props.theme.media.tablet} {
    font-size: 30px;
  }
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  height: 8px;
  background: ${props => props.theme.colors.background.primary};
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  margin-bottom: 10px;
`;

const ProgressBar = styled.div<ProgressStyleProps>`
  height: 100%;
  background: linear-gradient(90deg, ${props => props.theme.colors.nvidia.green}, ${props => props.theme.colors.nvidia.lightGreen});
  border-radius: 4px;
  transition: width ${props => props.theme.transitions.slow};
  position: relative;
  width: ${props => Math.min(props.$value, 100)}%;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(118, 185, 0, 0.2), transparent);
    animation: shimmer 2s infinite;
  }
`;

const MetricDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const DetailItem = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: ${props => props.theme.colors.text.secondary};
`;

const MetricCard: React.FC<MetricCardProps> = ({ title, value, unit, icon, status = 'normal', details }) => {
  const numericValue = typeof value === 'string' ? parseFloat(value) || 0 : value;
  
  return (
    <Card $status={status}>
      <MetricHeader>
        <i className={icon}></i>
        <h3>{title}</h3>
      </MetricHeader>
      
      <MetricValue>
        <PrimaryValue $status={status}>
          {value}{unit}
        </PrimaryValue>
        {typeof numericValue === 'number' && (
          <ProgressBarContainer>
            <ProgressBar $value={numericValue} />
          </ProgressBarContainer>
        )}
      </MetricValue>

      {details && (
        <MetricDetails>
          {Object.entries(details).map(([key, val]) => (
            <DetailItem key={key}>
              <span>{key}</span>
              <span>{val}</span>
            </DetailItem>
          ))}
        </MetricDetails>
      )}
    </Card>
  );
};

export default MetricCard;