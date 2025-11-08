import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { InferenceSectionProps } from '../types';
import { getBackendUrl } from '../utils/api';
import { useNotifications } from '../contexts/NotificationContext';

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

const InferenceGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const InferencePanel = styled.div`
  background: ${props => props.theme.colors.background.tertiary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 25px;
`;

const PanelTitle = styled.h3`
  color: ${props => props.theme.colors.text.primary};
  margin: 0 0 20px;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 10px;

  i {
    color: ${props => props.theme.colors.nvidia.green};
  }
`;

const ImageUploadArea = styled.div<{ isDragOver: boolean }>`
  border: 2px dashed ${props => props.isDragOver ? props.theme.colors.nvidia.green : props.theme.colors.border.secondary};
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  background: ${props => props.isDragOver ? `${props.theme.colors.nvidia.green}10` : 'transparent'};
  transition: all 0.3s ease;
  cursor: pointer;
  margin-bottom: 20px;

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    background: ${props => props.theme.colors.nvidia.green}10;
  }

  .upload-icon {
    font-size: 48px;
    color: ${props => props.theme.colors.nvidia.green};
    margin-bottom: 16px;
    opacity: 0.6;
  }

  .upload-text {
    color: ${props => props.theme.colors.text.primary};
    font-size: 16px;
    margin-bottom: 8px;
  }

  .upload-hint {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 14px;
  }
`;

const ModelSelector = styled.select`
  width: 100%;
  padding: 12px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 6px;
  background: ${props => props.theme.colors.background.primary};
  color: ${props => props.theme.colors.text.primary};
  font-size: 14px;
  margin-bottom: 20px;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
  }
`;

const RunButton = styled.button`
  width: 100%;
  padding: 12px 24px;
  background: linear-gradient(135deg, ${props => props.theme.colors.nvidia.green}, #43A047);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(118, 185, 0, 0.4);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  &.loading {
    position: relative;
    color: transparent;
  }

  &.loading::after {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    top: 50%;
    left: 50%;
    margin-left: -10px;
    margin-top: -10px;
    border: 2px solid transparent;
    border-top: 2px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const PreviewImage = styled.img`
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  margin: 10px 0;
`;

const ImagePreviewContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin: 15px 0;
`;

const ImagePreviewCard = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 15px;
  display: flex;
  gap: 15px;
  align-items: center;
`;

const ImageThumbnail = styled.img`
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid ${props => props.theme.colors.border.primary};
  flex-shrink: 0;
`;

const ImageDetails = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ImageName = styled.div`
  font-weight: 600;
  color: ${props => props.theme.colors.text.primary};
  font-size: 14px;
  word-break: break-all;
`;

const ImageMeta = styled.div`
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: ${props => props.theme.colors.text.secondary};
`;

const ImageActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ActionButton = styled.button<{ variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.2s ease;
  white-space: nowrap;
  
  ${props => {
    switch (props.variant) {
      case 'primary':
        return `
          background: ${props.theme.colors.nvidia.green};
          border-color: ${props.theme.colors.nvidia.green};
          color: white;
          
          &:hover {
            background: ${props.theme.colors.nvidia.green}dd;
            transform: translateY(-1px);
          }
        `;
      case 'danger':
        return `
          background: #ff4757;
          border-color: #ff4757;
          color: white;
          
          &:hover {
            background: #ff3742;
            transform: translateY(-1px);
          }
        `;
      default:
        return `
          background: ${props.theme.colors.background.primary};
          border-color: ${props.theme.colors.border.secondary};
          color: ${props.theme.colors.text.primary};
          
          &:hover {
            background: ${props.theme.colors.background.tertiary};
            border-color: ${props.theme.colors.nvidia.green};
          }
        `;
    }
  }}
`;

const CompactUploadArea = styled.div<{ isDragOver: boolean }>`
  border: 2px dashed ${props => props.isDragOver ? props.theme.colors.nvidia.green : props.theme.colors.border.secondary};
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  background: ${props => props.isDragOver ? `${props.theme.colors.nvidia.green}10` : 'transparent'};
  transition: all 0.3s ease;
  cursor: pointer;

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    background: ${props => props.theme.colors.nvidia.green}10;
  }

  .upload-icon {
    font-size: 24px;
    color: ${props => props.theme.colors.nvidia.green};
    margin-bottom: 8px;
    opacity: 0.6;
  }

  .upload-text {
    color: ${props => props.theme.colors.text.primary};
    font-size: 14px;
    margin-bottom: 4px;
    font-weight: 500;
  }

  .upload-hint {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 12px;
  }
`;

const ImageCacheSection = styled.div`
  margin: 20px 0;
  padding: 15px;
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
`;

const CacheHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  
  h4 {
    margin: 0;
    font-size: 14px;
    color: ${props => props.theme.colors.text.primary};
    display: flex;
    align-items: center;
    gap: 8px;
    
    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const CacheCount = styled.span`
  font-size: 12px;
  color: ${props => props.theme.colors.text.secondary};
  background: ${props => props.theme.colors.background.primary};
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid ${props => props.theme.colors.border.primary};
`;

const CacheGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
`;

const CacheImageCard = styled.div<{ isSelected: boolean }>`
  position: relative;
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid ${props => props.isSelected ? props.theme.colors.nvidia.green : props.theme.colors.border.secondary};
  transition: all 0.2s ease;
  background: ${props => props.theme.colors.background.primary};
  
  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
`;

const CacheImage = styled.img`
  width: 100%;
  height: 60px;
  object-fit: cover;
  display: block;
`;

const CacheImageInfo = styled.div`
  padding: 4px;
  background: ${props => props.theme.colors.background.tertiary};
  
  .name {
    font-size: 10px;
    color: ${props => props.theme.colors.text.primary};
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .meta {
    font-size: 9px;
    color: ${props => props.theme.colors.text.secondary};
    margin-top: 2px;
  }
`;

const CacheImageRemove = styled.button`
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(255, 71, 87, 0.9);
  border: none;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  color: white;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
  
  &:hover {
    background: #ff4757;
  }
  
  ${CacheImageCard}:hover & {
    opacity: 1;
  }
`;

const EmptyCacheMessage = styled.div`
  text-align: center;
  padding: 20px;
  color: ${props => props.theme.colors.text.secondary};
  font-size: 12px;
  font-style: italic;
`;

const AnnotatedImageContainer = styled.div`
  position: relative;
  display: inline-block;
  max-width: 100%;
  margin: 20px 0;
  border-radius: 8px;
  overflow: visible; /* Allow labels to overflow */
  background: ${props => props.theme.colors.background.primary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
`;

const AnnotatedImage = styled.img`
  max-width: 100%;
  max-height: 400px;
  display: block;
`;

const BoundingBox = styled.div<{ 
  x: number; 
  y: number; 
  width: number; 
  height: number;
  confidence: number;
  classColor: string;
  isHovered: boolean;
  anyHovered: boolean;
}>`
  position: absolute;
  border: 2px solid ${props => props.classColor};
  background: transparent;
  left: ${props => props.x}%;
  top: ${props => props.y}%;
  width: ${props => props.width}%;
  height: ${props => props.height}%;
  pointer-events: all;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: ${props => props.isHovered ? '10' : '5'};
  opacity: ${props => props.anyHovered ? (props.isHovered ? '1' : '0.1') : '1'};
  
  &:hover {
    border-width: 3px;
    box-shadow: 0 0 10px ${props => props.classColor}80;
  }
  
  &::before {
    content: '';
    position: absolute;
    top: -1px;
    left: -1px;
    right: -1px;
    bottom: -1px;
    background: ${props => props.isHovered ? `${props.classColor}30` : `${props.classColor}15`};
    border-radius: 2px;
    transition: all 0.2s ease;
  }
`;

const BoundingBoxLabel = styled.div<{ 
  confidence: number; 
  classColor: string;
  isHovered: boolean;
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
}>`
  position: absolute;
  background: ${props => props.classColor};
  color: #fff;
  padding: 2px 6px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 3px;
  white-space: nowrap;
  min-width: 50px;
  text-align: center;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  transform: ${props => props.isHovered ? 'scale(1.1)' : 'scale(1)'};
  transition: transform 0.2s ease;
  box-shadow: ${props => props.isHovered ? `0 2px 8px ${props.classColor}60` : 'none'};
  z-index: 15;
  
  /* Smart positioning to prevent clipping */
  top: ${props => {
    const topPos = -25;
    const bottomPos = 100;
    // If near top of container, position below the box
    return props.y < 15 ? `${bottomPos}%` : `${topPos}px`;
  }};
  
  left: ${props => {
    // If near right edge, align to right side of box
    return props.x + 150 > props.containerWidth ? 'auto' : '0';
  }};
  
  right: ${props => {
    // If near right edge, align to right side of box  
    return props.x + 150 > props.containerWidth ? '0' : 'auto';
  }};
`;

const DetailedStatsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 15px;
  margin-bottom: 20px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const DetailedStatItem = styled.div`
  background: ${props => props.theme.colors.background.primary};
  padding: 15px;
  border-radius: 8px;
  border: 1px solid ${props => props.theme.colors.border.primary};
  text-align: center;

  .stat-icon {
    font-size: 24px;
    color: ${props => props.theme.colors.nvidia.green};
    margin-bottom: 8px;
  }

  .stat-label {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 12px;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    color: ${props => props.theme.colors.text.primary};
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .stat-unit {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 12px;
  }
`;

const ToggleButton = styled.button`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  color: ${props => props.theme.colors.text.primary};
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 15px 0;

  &:hover {
    background: ${props => props.theme.colors.background.tertiary};
    border-color: ${props => props.theme.colors.nvidia.green};
  }

  i {
    transition: transform 0.3s ease;
  }

  &.expanded i {
    transform: rotate(180deg);
  }
`;

const DetailsSection = styled.div<{ isExpanded: boolean }>`
  max-height: ${props => props.isExpanded ? '1000px' : '0'};
  overflow: hidden;
  transition: max-height 0.4s ease-in-out;
`;

const QuickStatsBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: ${props => props.theme.colors.background.secondary};
  padding: 12px 16px;
  border-radius: 8px;
  margin: 15px 0;
  font-size: 14px;

  .quick-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;

    .stat-value {
      color: ${props => props.theme.colors.nvidia.green};
      font-weight: 700;
      font-size: 18px;
    }

    .stat-label {
      color: ${props => props.theme.colors.text.secondary};
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  }
`;

const HoverTooltip = styled.div<{ x: number; y: number; visible: boolean }>`
  position: fixed;
  left: ${props => props.x}px;
  top: ${props => props.y}px;
  background: ${props => props.theme.colors.background.primary};
  border: 1px solid ${props => props.theme.colors.border.primary};
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  pointer-events: none;
  opacity: ${props => props.visible ? '1' : '0'};
  transform: ${props => props.visible ? 'scale(1)' : 'scale(0.9)'};
  transition: all 0.2s ease;
  min-width: 200px;
  max-width: 300px;

  .tooltip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  }

  .class-indicator {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }

  .class-name {
    font-weight: 600;
    color: ${props => props.theme.colors.text.primary};
  }

  .tooltip-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
    margin-top: 8px;
  }

  .tooltip-stat {
    .label {
      color: ${props => props.theme.colors.text.secondary};
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    .value {
      color: ${props => props.theme.colors.text.primary};
      font-weight: 600;
      margin-top: 2px;
      font-size: 11px;
    }
  }
`;

const ClassSummarySection = styled.div`
  margin: 20px 0;
  background: ${props => props.theme.colors.background.secondary};
  border-radius: 8px;
  padding: 16px;
  border: 1px solid ${props => props.theme.colors.border.secondary};

  h4 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 12px;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const ClassGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
`;

const ClassItem = styled.div<{ classColor: string }>`
  background: ${props => props.theme.colors.background.primary};
  border: 1px solid ${props => props.theme.colors.border.primary};
  border-radius: 6px;
  padding: 12px;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => props.classColor};
    box-shadow: 0 2px 8px ${props => props.classColor}40;
  }

  .class-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .class-color {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    background: ${props => props.classColor};
  }

  .class-name {
    font-weight: 600;
    color: ${props => props.theme.colors.text.primary};
    flex: 1;
  }

  .class-count {
    background: ${props => props.classColor}20;
    color: ${props => props.classColor};
    padding: 2px 6px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }

  .class-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 8px;
  }

  .class-stat {
    text-align: center;

    .stat-label {
      color: ${props => props.theme.colors.text.secondary};
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stat-value {
      color: ${props => props.theme.colors.text.primary};
      font-weight: 600;
      font-size: 14px;
      margin-top: 2px;
    }
  }
`;

const ClassFilterSection = styled.div`
  margin: 20px 0;
  background: ${props => props.theme.colors.background.secondary};
  border-radius: 8px;
  padding: 16px;
  border: 1px solid ${props => props.theme.colors.border.secondary};

  h4 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 12px;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;

    .filter-icon {
      color: ${props => props.theme.colors.nvidia.green};
    }

    .filter-actions {
      display: flex;
      gap: 8px;
    }
  }
`;

const FilterButton = styled.button<{ variant: 'select' | 'deselect' }>`
  background: ${props => props.variant === 'select' 
    ? props.theme.colors.nvidia.green 
    : props.theme.colors.status.warning};
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    opacity: 0.8;
  }
`;

const ClassFilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  margin-top: 12px;
`;

const ClassFilterItem = styled.div<{ 
  classColor: string; 
  isSelected: boolean;
}>`
  background: ${props => props.isSelected 
    ? props.theme.colors.background.primary 
    : props.theme.colors.background.tertiary};
  border: 2px solid ${props => props.isSelected 
    ? props.classColor 
    : props.theme.colors.border.primary};
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  opacity: ${props => props.isSelected ? '1' : '0.6'};

  &:hover {
    border-color: ${props => props.classColor};
    opacity: 1;
  }

  .class-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .class-color {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    background: ${props => props.classColor};
  }

  .class-name {
    font-weight: 600;
    color: ${props => props.theme.colors.text.primary};
    font-size: 12px;
    flex: 1;
  }

  .class-count {
    background: ${props => props.classColor}20;
    color: ${props => props.classColor};
    padding: 1px 4px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
  }
`;

const DetectionsList = styled.div`
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  background: ${props => props.theme.colors.background.secondary};

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: ${props => props.theme.colors.background.primary};
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${props => props.theme.colors.nvidia.green};
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: ${props => props.theme.colors.nvidia.lightGreen};
  }
`;

const DetectionHeader = styled.div`
  padding: 12px 16px;
  background: ${props => props.theme.colors.background.tertiary};
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  font-weight: 600;
  font-size: 14px;
  color: ${props => props.theme.colors.text.primary};
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .count-badge {
    background: ${props => props.theme.colors.nvidia.green};
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 700;
  }
`;

const ScrollableDetectionContent = styled.div`
  padding: 8px;
`;

const DetectionItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  margin-bottom: 6px;
  background: ${props => props.theme.colors.background.primary};
  border-radius: 6px;
  border: 1px solid ${props => props.theme.colors.border.primary};
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    transform: translateX(2px);
  }

  &:last-child {
    margin-bottom: 0;
  }

  .detection-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detection-label {
    color: ${props => props.theme.colors.text.primary};
    font-weight: 500;
    font-size: 14px;
  }

  .detection-coords {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 10px;
    font-family: monospace;
  }

  .detection-confidence {
    color: ${props => props.theme.colors.nvidia.green};
    font-weight: 600;
    font-size: 14px;
    min-width: 60px;
    text-align: right;
  }
`;

const ImageOnlyContainer = styled.div`
  text-align: center;
  
  h4 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 15px 0;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const ResultsPanel = styled.div`
  background: ${props => props.theme.colors.background.tertiary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 25px;
`;

const ResultItem = styled.div`
  display: flex;
  justify-content: between;
  align-items: center;
  padding: 12px;
  margin: 8px 0;
  background: ${props => props.theme.colors.background.primary};
  border-radius: 6px;
  border: 1px solid ${props => props.theme.colors.border.primary};

  .label {
    color: ${props => props.theme.colors.text.primary};
    font-weight: 500;
    flex: 1;
  }

  .confidence {
    color: ${props => props.theme.colors.nvidia.green};
    font-weight: 600;
    font-size: 14px;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  margin-top: 20px;
`;

const StatItem = styled.div`
  background: ${props => props.theme.colors.background.primary};
  padding: 12px;
  border-radius: 6px;
  border: 1px solid ${props => props.theme.colors.border.primary};

  .stat-label {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 12px;
    margin-bottom: 4px;
  }

  .stat-value {
    color: ${props => props.theme.colors.text.primary};
    font-size: 16px;
    font-weight: 600;
  }
`;

interface InferenceResult {
  // Direct response from backend data field
  result?: {
    predictions?: any[];
    inference_time?: number;
    model_id?: string;
    framework?: string;
  };
  inference_time?: number;
  model_id?: string;
  framework?: string;
  // For backward compatibility
  predictions?: any[];
}

interface Model {
  id: string;
  name: string;
  framework: string;
  size?: number;
  status: 'loaded' | 'unloaded';
}

const InferenceSection: React.FC<InferenceSectionProps> = ({ systemData, socket, isConnected }) => {
  const { addNotification } = useNotifications();
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<InferenceResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [annotatedImageUrl, setAnnotatedImageUrl] = useState<string>('');
  const [imageNaturalDimensions, setImageNaturalDimensions] = useState<{width: number, height: number}>({width: 0, height: 0});
  const [imageContainerDimensions, setImageContainerDimensions] = useState<{width: number, height: number}>({width: 0, height: 0});
  const [showDetails, setShowDetails] = useState(false);
  const [hoveredDetection, setHoveredDetection] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [classColors, setClassColors] = useState<{[key: string]: string}>({});
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  
  // Image cache state
  const [cachedImages, setCachedImages] = useState<Array<{
    id: string;
    file: File;
    preview: string;
    name: string;
    size: number;
    dimensions: { width: number; height: number };
  }>>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate unique colors for classes
  const generateClassColors = (detections: any[]) => {
    const uniqueClasses = [...new Set(detections.map(d => d.class || d.label || 'Unknown'))];
    const colors: {[key: string]: string} = {};
    
    const colorPalette = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
      '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
      '#10AC84', '#EE5A24', '#0984E3', '#A29BFE', '#FD79A8',
      '#E17055', '#00B894', '#00CEC9', '#6C5CE7', '#A29BFE'
    ];
    
    uniqueClasses.forEach((className, index) => {
      colors[className] = colorPalette[index % colorPalette.length];
    });
    
    // Set available classes and select all by default
    setAvailableClasses(uniqueClasses);
    setSelectedClasses(new Set(uniqueClasses));
    
    return colors;
  };

  // Helper function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Helper function to get image dimensions text
  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = URL.createObjectURL(file);
    });
  };

  // Image cache management functions
  const addToImageCache = async (file: File, preview: string) => {
    const id = Date.now().toString();
    const dimensions = await getImageDimensions(file);
    
    const newCachedImage = {
      id,
      file,
      preview,
      name: file.name,
      size: file.size,
      dimensions
    };
    
    setCachedImages(prev => {
      // Check if image already exists (by name and size)
      const exists = prev.some(img => img.name === file.name && img.size === file.size);
      if (exists) return prev;
      
      // Add new image, keep max 10 images
      const updated = [newCachedImage, ...prev];
      return updated.slice(0, 10);
    });
  };

  const selectCachedImage = (cachedImage: typeof cachedImages[0]) => {
    setSelectedImage(cachedImage.file);
    setImagePreview(cachedImage.preview);
    setAnnotatedImageUrl(cachedImage.preview);
    setImageNaturalDimensions(cachedImage.dimensions);
    setResults(null); // Clear previous results
  };

  const removeCachedImage = (id: string) => {
    setCachedImages(prev => prev.filter(img => img.id !== id));
    
    // If the removed image was the currently selected one, clear selection
    const removedImage = cachedImages.find(img => img.id === id);
    if (removedImage && selectedImage && removedImage.name === selectedImage.name) {
      setSelectedImage(null);
      setImagePreview('');
      setAnnotatedImageUrl('');
      setResults(null);
    }
  };

  const clearImageCache = () => {
    setCachedImages([]);
  };

  // Toggle class selection
  const toggleClass = (className: string) => {
    setSelectedClasses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(className)) {
        newSet.delete(className);
      } else {
        newSet.add(className);
      }
      return newSet;
    });
  };

  // Select all classes
  const selectAllClasses = () => {
    setSelectedClasses(new Set(availableClasses));
  };

  // Deselect all classes
  const deselectAllClasses = () => {
    setSelectedClasses(new Set());
  };

  // Filter predictions based on selected classes
  const getFilteredPredictions = (predictions: any[]): any[] => {
    if (selectedClasses.size === 0) return [];
    return predictions.filter(pred => {
      const className = pred.class || pred.label || 'Unknown';
      return selectedClasses.has(className);
    });
  };

  // Handle detection hover
  const handleDetectionHover = (index: number | null, event?: React.MouseEvent) => {
    if (hoveredDetection !== index) {
      setHoveredDetection(index);
    }
    if (event && index !== null) {
      updateTooltipPosition(event);
    }
  };

  // Update tooltip position helper
  const updateTooltipPosition = (event: React.MouseEvent) => {
    const tooltipWidth = 300;
    const tooltipHeight = 180;
    const offsetX = -70;
    const offsetY = 10;
    
    // Get mouse position
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    
    // Calculate initial position (to the right and slightly below cursor)
    let x = mouseX + offsetX;
    let y = mouseY + offsetY;
    
    // Check if tooltip would overflow right edge
    if (x + tooltipWidth > window.innerWidth) {
      // Position to the left of cursor instead
      x = mouseX - tooltipWidth - offsetX;
    }
    
    // Check if tooltip would overflow bottom edge
    if (y + tooltipHeight > window.innerHeight) {
      // Position above cursor instead
      y = mouseY - tooltipHeight - offsetY;
    }
    
    // Ensure tooltip doesn't go off left edge (when positioned to the left)
    if (x < 0) {
      x = offsetX;
    }
    
    // Ensure tooltip doesn't go off top edge (when positioned above)
    if (y < 0) {
      y = offsetY;
    }
    
    setTooltipPosition({ x, y });
  };

  // Handle mouse leave to clear tooltip
  const handleDetectionLeave = () => {
    setHoveredDetection(null);
  };

  // Fetch available models
  useEffect(() => {
    fetchModels();
  }, [isConnected]);

  const fetchModels = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/api/models`);
      const data = await response.json();
      if (data.success) {
        const modelList = data.data?.map((model: any) => ({
          id: model.id,
          name: model.name,
          framework: model.framework,
          size: model.size,
          status: model.loaded ? 'loaded' : 'unloaded'
        })) || [];
        
        setModels(modelList);
        // Auto-select first loaded model
        const loadedModel = modelList.find((m: Model) => m.status === 'loaded');
        if (loadedModel) {
          setSelectedModel(loadedModel.id);
        }
      }
    } catch (error) {
      console.error('Error fetching models:', error);
      addNotification({
        type: 'error',
        title: 'Failed to fetch models',
        message: 'Could not load available models from the server.'
      });
    }
  };

  const handleImageSelect = (file: File) => {
    setSelectedImage(file);
    setResults(null); // Clear previous results
    setAnnotatedImageUrl(''); // Clear annotated image
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      setImagePreview(imageUrl);
      setAnnotatedImageUrl(imageUrl); // Initially use original image
      
      // Add to cache
      addToImageCache(file, imageUrl);
      
      // Get image dimensions for metadata display
      const img = new Image();
      img.onload = () => {
        setImageNaturalDimensions({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      img.src = imageUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));
    if (imageFile) {
      handleImageSelect(imageFile);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
  };

  const runInference = async () => {
    if (!selectedImage || !selectedModel) {
      addNotification({
        type: 'warning',
        title: 'Missing Requirements',
        message: 'Please select both an image and a model before running inference.'
      });
      return;
    }

    setIsRunning(true);
    setResults(null);

    try {
      const formData = new FormData();
      formData.append('image', selectedImage);
      formData.append('model_id', selectedModel);

      const response = await fetch(`${getBackendUrl()}/api/inference`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.success) {
        setResults(data.data);
        
        // Generate colors for detected classes
        const predictions = getPredictions(data.data);
        if (predictions.length > 0) {
          const colors = generateClassColors(predictions);
          setClassColors(colors);
        }
        
        const inferenceTime = getInferenceTime(data.data);
        const predictionsCount = getPredictions(data.data).length;
        
        addNotification({
          type: 'success',
          title: 'Inference Complete',
          message: `Processed in ${inferenceTime?.toFixed(3)}s with ${predictionsCount} detection${predictionsCount !== 1 ? 's' : ''}`
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Inference Failed',
          message: data.error || 'Unknown error occurred during inference'
        });
      }
    } catch (error) {
      console.error('Error running inference:', error);
      addNotification({
        type: 'error',
        title: 'Network Error',
        message: 'Failed to connect to the inference server. Please check your connection.'
      });
    } finally {
      setIsRunning(false);
    }
  };

  const formatConfidence = (confidence: number) => {
    return `${(confidence * 100).toFixed(1)}%`;
  };

  // Helper function to safely extract predictions
  const getPredictions = (results: InferenceResult | null): any[] => {
    if (!results) return [];
    return results.result?.predictions || results.predictions || [];
  };

  // Helper function to get inference time
  const getInferenceTime = (results: InferenceResult | null): number => {
    if (!results) return 0;
    return results.result?.inference_time || results.inference_time || 0;
  };

  // Helper function to calculate confidence distribution
  const getConfidenceDistribution = (predictions: any[]) => {
    const high = predictions.filter(p => (p.confidence || p.score || 0) > 0.8).length;
    const medium = predictions.filter(p => {
      const conf = p.confidence || p.score || 0;
      return conf > 0.5 && conf <= 0.8;
    }).length;
    const low = predictions.filter(p => (p.confidence || p.score || 0) <= 0.5).length;
    
    return { high, medium, low, total: predictions.length };
  };

  // Helper function to get class distribution
  const getClassDistribution = (predictions: any[]) => {
    const classCount: { [key: string]: number } = {};
    predictions.forEach(pred => {
      const className = pred.class || pred.label || `Class ${pred.class_id || 0}`;
      classCount[className] = (classCount[className] || 0) + 1;
    });
    return classCount;
  };

  // Helper function to convert bounding box coordinates for display
  const convertBboxToPercentage = (bbox: any, imageWidth: number, imageHeight: number) => {
    if (!bbox) return null;
    
    // Handle different bbox formats
    let x, y, width, height;
    
    if (bbox.x !== undefined && bbox.y !== undefined) {
      // YOLO format: center x, center y, width, height (normalized 0-1)
      // Backend now sends normalized coordinates
      const centerX = bbox.x * 100;  // Convert to percentage
      const centerY = bbox.y * 100;
      const boxWidth = bbox.width * 100;
      const boxHeight = bbox.height * 100;
      
      // Convert center coordinates to top-left coordinates
      x = centerX - boxWidth / 2;
      y = centerY - boxHeight / 2;
      width = boxWidth;
      height = boxHeight;
      
    } else if (bbox.x1 !== undefined && bbox.y1 !== undefined) {
      // Corners format: x1, y1, x2, y2 (assumed normalized)
      x = bbox.x1 * 100;
      y = bbox.y1 * 100;
      width = (bbox.x2 - bbox.x1) * 100;
      height = (bbox.y2 - bbox.y1) * 100;
    } else {
      return null;
    }

    // Ensure coordinates are within bounds
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
      width: Math.max(0, Math.min(100 - Math.max(0, x), width)),
      height: Math.max(0, Math.min(100 - Math.max(0, y), height))
    };
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    setImageNaturalDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight
    });
    
    // Also capture the displayed/container dimensions
    setImageContainerDimensions({
      width: img.clientWidth,
      height: img.clientHeight
    });
  };

  return (
    <Container>
      <SectionHeader>
        <h2>
          <i className="fas fa-rocket"></i>
          Inference Engine
        </h2>
      </SectionHeader>

      <InferenceGrid>
        {/* Input Panel */}
        <InferencePanel>
          <PanelTitle>
            <i className="fas fa-upload"></i>
            Image Input
          </PanelTitle>

          {!selectedImage ? (
            // No image selected - show full upload area
            <ImageUploadArea
              isDragOver={isDragOver}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => setIsDragOver(true)}
              onDragLeave={() => setIsDragOver(false)}
            >
              <div className="upload-icon">
                <i className="fas fa-cloud-upload-alt"></i>
              </div>
              <div className="upload-text">
                Drop image here or click to browse
              </div>
              <div className="upload-hint">
                Supports JPG, PNG, WEBP formats
              </div>
            </ImageUploadArea>
          ) : (
            // Image selected - show compact preview with actions
            <ImagePreviewContainer>
              <ImagePreviewCard>
                <ImageThumbnail src={imagePreview} alt="Preview" />
                <ImageDetails>
                  <ImageName>{selectedImage.name}</ImageName>
                  <ImageMeta>
                    <span>{formatFileSize(selectedImage.size)}</span>
                    <span>{selectedImage.type}</span>
                    {imageNaturalDimensions.width > 0 && (
                      <span>{imageNaturalDimensions.width} × {imageNaturalDimensions.height}</span>
                    )}
                  </ImageMeta>
                </ImageDetails>
                <ImageActions>
                  <ActionButton
                    variant="danger"
                    onClick={() => {
                      setSelectedImage(null);
                      setImagePreview('');
                      setResults(null);
                      setAnnotatedImageUrl('');
                    }}
                  >
                    <i className="fas fa-trash"></i> Remove
                  </ActionButton>
                </ImageActions>
              </ImagePreviewCard>
              
              {/* Compact upload area for quick replacement */}
              <CompactUploadArea
                isDragOver={isDragOver}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setIsDragOver(true)}
                onDragLeave={() => setIsDragOver(false)}
              >
                <div className="upload-icon">
                  <i className="fas fa-plus"></i>
                </div>
                <div className="upload-text">
                  Upload Another Image
                </div>
                <div className="upload-hint">
                  Or drag & drop here
                </div>
              </CompactUploadArea>
            </ImagePreviewContainer>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            accept="image/*"
            style={{ display: 'none' }}
          />

          <ModelSelector
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <option value="">Select a model...</option>
            {models.map((model) => (
              <option key={model.id} value={model.id} disabled={model.status !== 'loaded'}>
                {model.name} ({model.framework}) {model.status !== 'loaded' && '- Not Loaded'}
              </option>
            ))}
          </ModelSelector>
          <RunButton
            onClick={runInference}
            disabled={!selectedImage || !selectedModel || isRunning}
            className={isRunning ? 'loading' : ''}
          >
            {isRunning ? 'Running Inference...' : 'Run Inference'}
          </RunButton>
          
          {/* Image Cache Section */}
          {cachedImages.length > 0 && (
            <ImageCacheSection>
              <CacheHeader>
                <h4>
                  <i className="fas fa-history"></i>
                  Recent Images
                </h4>
                <div>
                  <CacheCount>{cachedImages.length}/10</CacheCount>
                  <ActionButton
                    variant="secondary"
                    onClick={clearImageCache}
                    style={{ marginLeft: '8px', fontSize: '10px', padding: '4px 8px' }}
                  >
                    <i className="fas fa-trash"></i> Clear
                  </ActionButton>
                </div>
              </CacheHeader>
              
              <CacheGrid>
                {cachedImages.map((cachedImage) => (
                  <CacheImageCard
                    key={cachedImage.id}
                    isSelected={selectedImage?.name === cachedImage.name}
                    onClick={() => selectCachedImage(cachedImage)}
                  >
                    <CacheImage src={cachedImage.preview} alt={cachedImage.name} />
                    <CacheImageRemove
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCachedImage(cachedImage.id);
                      }}
                    >
                      <i className="fas fa-times"></i>
                    </CacheImageRemove>
                    <CacheImageInfo>
                      <div className="name">{cachedImage.name}</div>
                      <div className="meta">
                        {formatFileSize(cachedImage.size)} • {cachedImage.dimensions.width}×{cachedImage.dimensions.height}
                      </div>
                    </CacheImageInfo>
                  </CacheImageCard>
                ))}
              </CacheGrid>
            </ImageCacheSection>
          )}


        </InferencePanel>

        {/* Results Panel */}
        <ResultsPanel>
          <PanelTitle>
            <i className="fas fa-chart-bar"></i>
            Results
          </PanelTitle>

          {results ? (
            <>
              {/* Annotated Image - Main Focus */}
              <ImageOnlyContainer>
                <h4>
                  <i className="fas fa-eye"></i>
                  Detection Results
                </h4>
                
                {annotatedImageUrl && (
                  <AnnotatedImageContainer>
                    <AnnotatedImage 
                      src={annotatedImageUrl} 
                      alt="Annotated Result"
                      onLoad={handleImageLoad}
                    />
                    
                    {/* Render bounding boxes */}
                    {getFilteredPredictions(getPredictions(results)).map((pred: any, index: number) => {
                      const bbox = convertBboxToPercentage(
                        pred.bbox, 
                        imageNaturalDimensions.width, 
                        imageNaturalDimensions.height
                      );
                      
                      if (!bbox) return null;
                      
                      const className = pred.class || pred.label || `Class ${index}`;
                      const classColor = classColors[className] || '#00ff00';
                      
                      return (
                        <BoundingBox
                          key={index}
                          x={bbox.x}
                          y={bbox.y}
                          width={bbox.width}
                          height={bbox.height}
                          confidence={pred.confidence || pred.score || 0}
                          classColor={classColor}
                          isHovered={hoveredDetection === index}
                          anyHovered={hoveredDetection !== null}
                          onMouseEnter={(e) => handleDetectionHover(index, e)}
                          onMouseLeave={handleDetectionLeave}
                          onMouseMove={(e) => {
                            if (hoveredDetection === index) {
                              updateTooltipPosition(e);
                            }
                          }}
                        >
                          <BoundingBoxLabel 
                            confidence={pred.confidence || pred.score || 0}
                            classColor={classColor}
                            isHovered={hoveredDetection === index}
                            x={bbox.x}
                            y={bbox.y}
                            containerWidth={imageContainerDimensions.width}
                            containerHeight={imageContainerDimensions.height}
                          >
                            {className} {formatConfidence(pred.confidence || pred.score || 0)}
                          </BoundingBoxLabel>
                        </BoundingBox>
                      );
                    })}
                  </AnnotatedImageContainer>
                )}
              </ImageOnlyContainer>

              {/* Quick Stats Bar */}
              <QuickStatsBar>
                <div className="quick-stat">
                  <div className="stat-value">{getFilteredPredictions(getPredictions(results)).length}</div>
                  <div className="stat-label">Objects</div>
                </div>
                <div className="quick-stat">
                  <div className="stat-value">{getInferenceTime(results).toFixed(3)}s</div>
                  <div className="stat-label">Time</div>
                </div>
                <div className="quick-stat">
                  <div className="stat-value">
                    {getInferenceTime(results) > 0 ? (1 / getInferenceTime(results)).toFixed(1) : '0'}
                  </div>
                  <div className="stat-label">FPS</div>
                </div>
                <div className="quick-stat">
                  <div className="stat-value">
                    {getFilteredPredictions(getPredictions(results)).length > 0 
                      ? (getFilteredPredictions(getPredictions(results)).reduce((sum, pred) => sum + (pred.confidence || pred.score || 0), 0) / getFilteredPredictions(getPredictions(results)).length * 100).toFixed(0)
                      : '0'}%
                  </div>
                  <div className="stat-label">Avg Conf</div>
                </div>
              </QuickStatsBar>

              {/* Class Filter Section */}
              {availableClasses.length > 0 && (
                <ClassFilterSection>
                  <h4>
                    <span>
                      <i className="fas fa-filter filter-icon"></i>
                      {" Filter Classes"} ({selectedClasses.size}/{availableClasses.length})
                    </span>
                    <div className="filter-actions">
                      <FilterButton 
                        variant="select"
                        onClick={selectAllClasses}
                        title="Select All"
                      >
                        All
                      </FilterButton>
                      <FilterButton 
                        variant="deselect"
                        onClick={deselectAllClasses}
                        title="Deselect All"
                      >
                        None
                      </FilterButton>
                    </div>
                  </h4>
                  <ClassFilterGrid>
                    {availableClasses.map(className => {
                      const classColor = classColors[className] || '#00ff00';
                      const isSelected = selectedClasses.has(className);
                      const classCount = getPredictions(results).filter(
                        pred => (pred.class || pred.label || 'Unknown') === className
                      ).length;
                      
                      return (
                        <ClassFilterItem
                          key={className}
                          classColor={classColor}
                          isSelected={isSelected}
                          onClick={() => toggleClass(className)}
                          title={`Toggle ${className} (${classCount} detections)`}
                        >
                          <div className="class-header">
                            <div className="class-color"></div>
                            <span className="class-name">{className}</span>
                            <span className="class-count">{classCount}</span>
                          </div>
                        </ClassFilterItem>
                      );
                    })}
                  </ClassFilterGrid>
                </ClassFilterSection>
              )}

              {/* Toggle Details Button */}
              <ToggleButton 
                className={showDetails ? 'expanded' : ''}
                onClick={() => setShowDetails(!showDetails)}
              >
                <i className="fas fa-chevron-down"></i>
                {showDetails ? 'Hide Details' : 'Show Details'}
              </ToggleButton>

              {/* Expandable Details Section */}
              <DetailsSection isExpanded={showDetails}>
                {/* Class Summary Section - MOVED TO TOP */}
                <ClassSummarySection>
                  <h4>
                    <i className="fas fa-tags"></i>
                    Detected Classes
                  </h4>
                  <ClassGrid>
                    {Object.entries(classColors)
                      .filter(([className]) => selectedClasses.has(className))
                      .map(([className, color]) => {
                        const classDetections = getFilteredPredictions(getPredictions(results)).filter(
                          pred => (pred.class || pred.label || 'Unknown') === className
                        );
                        const avgConfidence = classDetections.length > 0 
                          ? classDetections.reduce((sum, pred) => sum + (pred.confidence || pred.score || 0), 0) / classDetections.length
                          : 0;
                      
                      return (
                        <ClassItem key={className} classColor={color}>
                          <div className="class-header">
                            <div className="class-color" />
                            <div className="class-name">{className}</div>
                            <div className="class-count">{classDetections.length}</div>
                          </div>
                          <div className="class-stats">
                            <div className="class-stat">
                              <div className="stat-label">Avg Conf</div>
                              <div className="stat-value">{(avgConfidence * 100).toFixed(1)}%</div>
                            </div>
                            <div className="class-stat">
                              <div className="stat-label">Count</div>
                              <div className="stat-value">{classDetections.length}</div>
                            </div>
                          </div>
                        </ClassItem>
                      );
                    })}
                  </ClassGrid>
                </ClassSummarySection>

                {/* Detailed Statistics */}
                <DetailedStatsGrid>
                  <DetailedStatItem>
                    <div className="stat-icon"><i className="fas fa-clock"></i></div>
                    <div className="stat-label">Inference Time</div>
                    <div className="stat-value">{getInferenceTime(results).toFixed(3)}</div>
                    <div className="stat-unit">seconds</div>
                  </DetailedStatItem>
                  
                  <DetailedStatItem>
                    <div className="stat-icon"><i className="fas fa-search"></i></div>
                    <div className="stat-label">Filtered Detections</div>
                    <div className="stat-value">{getFilteredPredictions(getPredictions(results)).length}</div>
                    <div className="stat-unit">objects</div>
                  </DetailedStatItem>
                  
                  <DetailedStatItem>
                    <div className="stat-icon"><i className="fas fa-tachometer-alt"></i></div>
                    <div className="stat-label">FPS</div>
                    <div className="stat-value">{getInferenceTime(results) > 0 ? (1 / getInferenceTime(results)).toFixed(1) : '0'}</div>
                    <div className="stat-unit">frames/sec</div>
                  </DetailedStatItem>
                  
                  <DetailedStatItem>
                    <div className="stat-icon"><i className="fas fa-microchip"></i></div>
                    <div className="stat-label">Framework</div>
                    <div className="stat-value" style={{fontSize: '14px'}}>{results.result?.framework || results.framework}</div>
                    <div className="stat-unit">engine</div>
                  </DetailedStatItem>
                  
                  <DetailedStatItem>
                    <div className="stat-icon"><i className="fas fa-brain"></i></div>
                    <div className="stat-label">Model</div>
                    <div className="stat-value" style={{fontSize: '12px'}}>{(results.result?.model_id || results.model_id || '').substring(0, 8) + "..."}</div>
                    <div className="stat-unit">ID</div>
                  </DetailedStatItem>
                  
                  <DetailedStatItem>
                    <div className="stat-icon"><i className="fas fa-percentage"></i></div>
                    <div className="stat-label">Filtered Avg Conf</div>
                    <div className="stat-value">
                      {getFilteredPredictions(getPredictions(results)).length > 0 
                        ? (getFilteredPredictions(getPredictions(results)).reduce((sum, pred) => sum + (pred.confidence || pred.score || 0), 0) / getFilteredPredictions(getPredictions(results)).length * 100).toFixed(1)
                        : '0'}
                    </div>
                    <div className="stat-unit">percent</div>
                  </DetailedStatItem>
                </DetailedStatsGrid>

                {/* Confidence Distribution */}
                {getFilteredPredictions(getPredictions(results)).length > 0 && (
                  <div style={{
                    background: 'var(--background-primary)',
                    padding: '15px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-primary)',
                    marginBottom: '20px'
                  }}>
                    <div style={{
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      fontWeight: 600,
                      marginBottom: '12px'
                    }}>Filtered Confidence Distribution</div>
                    {(() => {
                      const dist = getConfidenceDistribution(getFilteredPredictions(getPredictions(results)));
                      return (
                        <>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '8px',
                            fontSize: '12px'
                          }}>
                            <div style={{ width: '80px', color: 'var(--text-secondary)' }}>High (&gt;80%)</div>
                            <div style={{
                              flex: 1,
                              height: '20px',
                              background: 'var(--background-secondary)',
                              borderRadius: '10px',
                              overflow: 'hidden',
                              margin: '0 10px'
                            }}>
                              <div 
                                style={{
                                  width: `${dist.total > 0 ? (dist.high / dist.total) * 100 : 0}%`,
                                  height: '100%',
                                  background: '#00ff00',
                                  borderRadius: '10px',
                                  transition: 'width 0.3s ease'
                                }}
                              />
                            </div>
                            <div style={{ 
                              width: '30px', 
                              textAlign: 'right', 
                              color: 'var(--text-primary)', 
                              fontWeight: 600 
                            }}>{dist.high}</div>
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '8px',
                            fontSize: '12px'
                          }}>
                            <div style={{ width: '80px', color: 'var(--text-secondary)' }}>Med (50-80%)</div>
                            <div style={{
                              flex: 1,
                              height: '20px',
                              background: 'var(--background-secondary)',
                              borderRadius: '10px',
                              overflow: 'hidden',
                              margin: '0 10px'
                            }}>
                              <div 
                                style={{
                                  width: `${dist.total > 0 ? (dist.medium / dist.total) * 100 : 0}%`,
                                  height: '100%',
                                  background: '#ffff00',
                                  borderRadius: '10px',
                                  transition: 'width 0.3s ease'
                                }}
                              />
                            </div>
                            <div style={{ 
                              width: '30px', 
                              textAlign: 'right', 
                              color: 'var(--text-primary)', 
                              fontWeight: 600 
                            }}>{dist.medium}</div>
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '8px',
                            fontSize: '12px'
                          }}>
                            <div style={{ width: '80px', color: 'var(--text-secondary)' }}>Low (&lt;50%)</div>
                            <div style={{
                              flex: 1,
                              height: '20px',
                              background: 'var(--background-secondary)',
                              borderRadius: '10px',
                              overflow: 'hidden',
                              margin: '0 10px'
                            }}>
                              <div 
                                style={{
                                  width: `${dist.total > 0 ? (dist.low / dist.total) * 100 : 0}%`,
                                  height: '100%',
                                  background: '#ff6600',
                                  borderRadius: '10px',
                                  transition: 'width 0.3s ease'
                                }}
                              />
                            </div>
                            <div style={{ 
                              width: '30px', 
                              textAlign: 'right', 
                              color: 'var(--text-primary)', 
                              fontWeight: 600 
                            }}>{dist.low}</div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </DetailsSection>
            </>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px 20px', 
              color: 'var(--text-secondary)' 
            }}>
              <i className="fas fa-chart-bar" style={{ 
                fontSize: '48px', 
                color: 'var(--nvidia-green)', 
                marginBottom: '16px', 
                opacity: 0.6 
              }}></i>
              <div>No results yet</div>
              <div style={{ fontSize: '14px', marginTop: '8px' }}>
                Upload an image and run inference to see results
              </div>
            </div>
          )}
        </ResultsPanel>
      </InferenceGrid>
      
      {/* Hover Tooltip */}
      {hoveredDetection !== null && results && (
        <HoverTooltip 
          x={tooltipPosition.x} 
          y={tooltipPosition.y} 
          visible={hoveredDetection !== null}
        >
          {(() => {
            const filteredPredictions = getFilteredPredictions(getPredictions(results));
            const pred = filteredPredictions[hoveredDetection];
            if (!pred) return null;
            
            const className = pred.class || pred.label || `Class ${hoveredDetection}`;
            const classColor = classColors[className] || '#00ff00';
            
            return (
              <>
                <div className="tooltip-header">
                  <div className="class-indicator" style={{ backgroundColor: classColor }} />
                  <div className="class-name">{className}</div>
                </div>
                <div className="tooltip-stats">
                  <div className="tooltip-stat">
                    <div className="label">Confidence</div>
                    <div className="value">{formatConfidence(pred.confidence || pred.score || 0)}</div>
                  </div>
                  <div className="tooltip-stat">
                    <div className="label">Class ID</div>
                    <div className="value">{pred.class_id !== undefined ? pred.class_id : 'N/A'}</div>
                  </div>
                  <div className="tooltip-stat">
                    <div className="label">Center (X,Y)</div>
                    <div className="value">
                      {pred.bbox && imageNaturalDimensions.width && imageNaturalDimensions.height ? 
                        `${Math.round(pred.bbox.x * imageNaturalDimensions.width)}, ${Math.round(pred.bbox.y * imageNaturalDimensions.height)}` : 'N/A'}
                    </div>
                  </div>
                  <div className="tooltip-stat">
                    <div className="label">Size (W,H)</div>
                    <div className="value">
                      {pred.bbox && imageNaturalDimensions.width && imageNaturalDimensions.height ? 
                        `${Math.round(pred.bbox.width * imageNaturalDimensions.width)}, ${Math.round(pred.bbox.height * imageNaturalDimensions.height)}` : 'N/A'}
                    </div>
                  </div>
                  <div className="tooltip-stat">
                    <div className="label">Top-Left (X,Y)</div>
                    <div className="value">
                      {pred.bbox && imageNaturalDimensions.width && imageNaturalDimensions.height ? 
                        `${Math.round((pred.bbox.x - pred.bbox.width / 2) * imageNaturalDimensions.width)}, ${Math.round((pred.bbox.y - pred.bbox.height / 2) * imageNaturalDimensions.height)}` : 'N/A'}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </HoverTooltip>
      )}
    </Container>
  );
};

export default InferenceSection;