import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import styled, { createGlobalStyle } from 'styled-components';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import html2canvas from 'html2canvas';
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
  ArcElement,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { InferenceSectionProps } from '../types';
import Modal, { ModalHeader, ModalBody, ModalCloseButton } from './shared/Modal';
import { getBackendUrl } from '../utils/api';
import { useNotifications } from '../contexts/NotificationContext';

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
  ArcElement
);

// Debounce utility function
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Global styles for react-datepicker theming
const DatePickerGlobalStyle = createGlobalStyle`
  .react-datepicker-popper {
    z-index: 10000 !important;
  }
  
  .react-datepicker {
    background-color: #222222 !important;
    border: 1px solid #333333 !important;
    border-radius: 8px !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
    color: #FFFFFF !important;
  }
  
  .react-datepicker__header {
    background-color: #333333 !important;
    border-bottom: 1px solid #333333 !important;
    border-radius: 8px 8px 0 0 !important;
    padding: 8px 0 !important;
  }
  
  .react-datepicker__current-month,
  .react-datepicker-time__header {
    color: #FFFFFF !important;
    font-weight: 600 !important;
  }
  
  .react-datepicker__navigation {
    border: none !important;
    background: none !important;
    width: 30px !important;
    height: 30px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 4px !important;
    transition: background-color 0.2s !important;
    
    &:hover {
      background-color: #333333 !important;
    }
    
    &::before {
      content: '' !important;
      border: none !important;
      width: 0 !important;
      height: 0 !important;
    }
  }
  
  .react-datepicker__navigation--previous {
    border: none !important;
    
    &::after {
      content: '‹' !important;
      font-size: 18px !important;
      font-weight: bold !important;
      color: #CCCCCC !important;
      display: block !important;
      line-height: 1 !important;
    }
    
    &:hover::after {
      color: #FFFFFF !important;
    }
  }
  
  .react-datepicker__navigation--next {
    border: none !important;
    
    &::after {
      content: '›' !important;
      font-size: 18px !important;
      font-weight: bold !important;
      color: #CCCCCC !important;
      display: block !important;
      line-height: 1 !important;
    }
    
    &:hover::after {
      color: #FFFFFF !important;
    }
  }
  
  .react-datepicker__day-names {
    border-bottom: 1px solid #333333 !important;
    margin-bottom: 8px !important;
  }
  
  .react-datepicker__day,
  .react-datepicker__day-name {
    color: #FFFFFF !important;
  }
  
  .react-datepicker__day:hover {
    background-color: #333333 !important;
    border-radius: 4px !important;
  }
  
  .react-datepicker__day-name {
    color: #CCCCCC !important;
    font-weight: 600 !important;
  }
  
  .react-datepicker__day--disabled {
    color: #999999 !important;
  }
  
  .react-datepicker__day--disabled:hover {
    background-color: transparent !important;
    cursor: default !important;
  }
  
  .react-datepicker__day--outside-month {
    color: #999999 !important;
  }
  
  .react-datepicker__day--today {
    background-color: #333333 !important;
    border: 1px solid #76B900 !important;
    border-radius: 4px !important;
    font-weight: 600 !important;
  }
  
  .react-datepicker__day--selected,
  .react-datepicker__day--in-selecting-range,
  .react-datepicker__day--in-range {
    background-color: #76B900 !important;
    color: white !important;
    border-radius: 4px !important;
    font-weight: 600 !important;
  }
  
  .react-datepicker__day--selected:hover,
  .react-datepicker__day--in-selecting-range:hover,
  .react-datepicker__day--in-range:hover {
    background-color: #5A8B00 !important;
  }
  
  .react-datepicker__day--range-start,
  .react-datepicker__day--range-end {
    background-color: #5A8B00 !important;
    color: white !important;
    font-weight: 700 !important;
  }
  
  .react-datepicker__day--keyboard-selected {
    background-color: #5A8B00 !important;
    color: white !important;
    border-radius: 4px !important;
  }
  
  .react-datepicker__month-container {
    background-color: #222222 !important;
  }
  
  .react-datepicker__month {
    background-color: #222222 !important;
    color: #FFFFFF !important;
  }
  
  .react-datepicker__week {
    color: #FFFFFF !important;
  }
  
  .react-datepicker__triangle {
    border-bottom-color: #333333 !important;
    border-top-color: #333333 !important;
  }
  
  .react-datepicker__triangle::before {
    border-bottom-color: #222222 !important;
    border-top-color: #222222 !important;
  }
`;

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
    ${props => props.theme.media.mobile} {
      font-size: 20px;
      gap: 8px;
    }
    
    @media (max-width: 480px) {
      font-size: 18px;
      gap: 6px;
    }
  }

  /* Mobile adjustments */
  ${props => props.theme.media.mobile} {
    margin-bottom: 20px;
    padding-bottom: 10px;
  }
`;

const InferenceGrid = styled.div`
  display: grid;
  gap: 30px;
  
  /* Mobile - single column stack */
  grid-template-columns: 1fr;
  
  /* Large tablets and desktop - two columns */
  @media (min-width: 1024px) {
    grid-template-columns: 1fr 1fr;
  }
  
  /* Mobile adjustments */
  ${props => props.theme.media.mobile} {
    gap: 20px;
  }
  
  @media (max-width: 480px) {
    gap: 15px;
  }
`;

const InferencePanel = styled.div`
  background: ${props => props.theme.colors.background.tertiary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 25px;
  
  /* Mobile styles */
  ${props => props.theme.media.mobile} {
    padding: 16px;
    border-radius: 8px;
  }
  
  @media (max-width: 480px) {
    padding: 14px;
    border-radius: 6px;
  }
  
  /* Tablet styles */
  ${props => props.theme.media.tablet} {
    padding: 20px;
    border-radius: 10px;
  }
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
    font-size: 18px;
  }
  
  /* Mobile styles */
  @media (max-width: 767px) {
    font-size: 16px;
    gap: 8px;
    margin: 0 0 16px;
    
    i {
      font-size: 16px;
    }
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

  /* Mobile responsive */
  @media (max-width: 767px) {
    padding: 30px 20px;
    margin-bottom: 16px;
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
  min-height: 44px; /* Touch target guideline */

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
  }
  
  /* Mobile styles */\n  @media (max-width: 767px) {\n    margin-bottom: 16px;\n    font-size: 16px; /* Prevent zoom on iOS */\n  }\n`;

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
  min-height: 44px; /* iOS touch target guideline */

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
  
  /* Ensure container maintains proper sizing */
  width: fit-content;
  height: fit-content;
`;

const AnnotatedImage = styled.img`
  max-width: 100%;
  max-height: 400px;
  width: auto;
  height: auto;
  display: block;
  object-fit: contain; /* Ensure aspect ratio is maintained */
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
    // If near top of container (y < 15%), position below the box
    return props.y < 15 ? '100%' : '-25px';
  }};
  
  left: ${props => {
    // If bbox x position + estimated label width would overflow, align to right side
    const estimatedLabelWidth = 100; // approximate pixels
    const bboxRightEdge = (props.x / 100) * props.containerWidth;
    return bboxRightEdge + estimatedLabelWidth > props.containerWidth ? 'auto' : '0';
  }};
  
  right: ${props => {
    // If bbox would overflow, align to right side of box  
    const estimatedLabelWidth = 100; // approximate pixels
    const bboxRightEdge = (props.x / 100) * props.containerWidth;
    return bboxRightEdge + estimatedLabelWidth > props.containerWidth ? '0' : 'auto';
  }};
  
  margin-top: ${props => props.y < 15 ? '2px' : '0'};
  margin-bottom: ${props => props.y < 15 ? '0' : '2px'};
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
  
  /* Mobile styles */
  @media (max-width: 767px) {
    padding: 16px;
    border-radius: 8px;
  }
  
  /* Tablet styles */
  @media (min-width: 768px) and (max-width: 991px) {
    padding: 20px;
  }
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

// API Routes Tab Components
const TabSection = styled.div`
  margin-bottom: 30px;
`;

const TabHeader = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  margin-bottom: 20px;
  
  /* Mobile styles */
  @media (max-width: 767px) {
    flex-direction: column;
    gap: 4px;
  }
  
  /* Small tablet - allow wrapping */
  @media (min-width: 768px) and (max-width: 900px) {
    flex-wrap: wrap;
    gap: 4px;
  }
`;

const TabButton = styled.button<{ active: boolean }>`
  padding: 12px 20px;
  background: ${props => props.active ? props.theme.colors.background.tertiary : 'transparent'};
  border: none;
  border-bottom: 2px solid ${props => props.active ? props.theme.colors.nvidia.green : 'transparent'};
  color: ${props => props.active ? props.theme.colors.text.primary : props.theme.colors.text.secondary};
  font-weight: ${props => props.active ? '600' : '400'};
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 6px 6px 0 0;
  white-space: nowrap;

  &:hover {
    background: ${props => props.theme.colors.background.tertiary};
    color: ${props => props.theme.colors.text.primary};
  }

  i {
    margin-right: 8px;
    color: ${props => props.active ? props.theme.colors.nvidia.green : 'inherit'};
  }
  
  /* Mobile styles */
  @media (max-width: 767px) {
    padding: 10px 16px;
    border-radius: 6px;
    border-bottom: none;
    border-left: 3px solid ${props => props.active ? props.theme.colors.nvidia.green : 'transparent'};
    font-size: 14px;
    justify-content: center;
    
    i {
      font-size: 14px;
    }
  }
  
  /* Small tablet adjustments */
  @media (min-width: 768px) and (max-width: 900px) {
    padding: 10px 16px;
    font-size: 14px;
    flex: 1;
    min-width: 0;
  }
`;

const TabContent = styled.div<{ visible: boolean }>`
  display: ${props => props.visible ? 'block' : 'none'};
`;

const ApiRoutesContainer = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border-radius: 12px;
  padding: 20px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
`;

const RouteSection = styled.div`
  margin-bottom: 24px;
  padding: 16px;
  background: ${props => props.theme.colors.background.primary};
  border-radius: 8px;
  border-left: 4px solid ${props => props.theme.colors.nvidia.green};
`;

const RouteHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
`;

const MethodBadge = styled.span<{ method: string }>`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${props => {
    switch (props.method) {
      case 'POST': return '#ff6b35';
      case 'GET': return '#28a745';
      case 'DELETE': return '#dc3545';
      default: return '#6c757d';
    }
  }};
  color: white;
`;

const RouteUrl = styled.code`
  background: ${props => props.theme.colors.background.tertiary};
  padding: 8px 12px;
  border-radius: 4px;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  color: ${props => props.theme.colors.nvidia.green};
  border: 1px solid ${props => props.theme.colors.border.primary};
  word-break: break-all;
`;

const RouteUrlContainer = styled.div`
  position: relative;
  flex: 1;
  width: 100%;

  .route-copy-btn {
    position: absolute;
    top: 50%;
    right: 12px;
    transform: translateY(-50%);
    background: rgba(118, 185, 0, 0.2);
    border: 1px solid ${props => props.theme.colors.nvidia.green};
    color: ${props => props.theme.colors.nvidia.green};
    cursor: pointer;
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 11px;
    opacity: 1;
    transition: all 0.2s ease;

    &:hover {
      background: ${props => props.theme.colors.nvidia.green};
      color: #000;
    }
  }
`;

const RouteDescription = styled.p`
  margin: 8px 0;
  color: ${props => props.theme.colors.text.secondary};
  font-size: 14px;
`;

const CodeBlock = styled.pre.withConfig({
  shouldForwardProp: (prop) => prop !== 'language'
})<{ onCopy?: () => void; language?: string }>`
  position: relative;
  background: ${props => props.theme.colors.background.tertiary};
  border: 1px solid ${props => props.theme.colors.border.primary};
  border-radius: 6px;
  padding: 16px;
  margin: 12px 0;
  overflow-x: auto;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  color: ${props => props.theme.colors.text.primary};
  line-height: 1.4;

  .copy-icon {
    position: absolute;
    top: 8px;
    right: 8px;
    color: ${props => props.theme.colors.nvidia.green};
    cursor: pointer;
    opacity: 1; /* Always visible */
    transition: all 0.2s ease;
    font-size: 14px;
    padding: 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.8);

    &:hover {
      background: ${props => props.theme.colors.nvidia.green};
      color: #000;
      transform: scale(1.05);
    }
  }

  .comment {
    color: ${props => props.theme.colors.text.secondary};
    font-style: italic;
  }

  .string {
    color: #ce9178;
  }

  .key, .property {
    color: #9cdcfe;
  }

  .value, .number {
    color: #b5cea8;
  }

  .keyword {
    color: #569cd6;
    font-weight: bold;
  }

  .function {
    color: #dcdcaa;
  }

  .curl-flag {
    color: #4fc1ff;
  }

  .curl-url {
    color: #ce9178;
  }
`;

const CopyButton = styled.button`
  padding: 6px 12px;
  background: ${props => props.theme.colors.nvidia.green};
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 8px;

  &:hover {
    background: ${props => props.theme.colors.nvidia.darkGreen};
  }

  i {
    margin-right: 4px;
  }
`;

const SmallCopyButton = styled.button`
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.8);
  color: ${props => props.theme.colors.nvidia.green};
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &:hover {
    background: ${props => props.theme.colors.nvidia.green};
    color: #000;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  i {
    font-size: 10px;
  }
`;

const ModelInfoCard = styled.div`
  background: ${props => props.theme.colors.background.primary};
  border: 1px solid ${props => props.theme.colors.border.primary};
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;

  .model-name {
    font-size: 16px;
    font-weight: 600;
    color: ${props => props.theme.colors.text.primary};
    margin-bottom: 8px;
  }

  .model-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    font-size: 13px;
  }

  .detail-item {
    display: flex;
    justify-content: space-between;
    
    .label {
      color: ${props => props.theme.colors.text.secondary};
    }
    
    .value {
      color: ${props => props.theme.colors.text.primary};
      font-weight: 500;
    }
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

// Analytics tab interfaces
interface InferenceLog {
  id: number;
  timestamp: string;
  model_id: string;
  client_ip: string;
  inference_time: number;
  processing_time?: number;
  status?: string;
  result?: any;
  image_hash?: string;
  session_id?: string;
  user_agent?: string;
  device_info?: string;
  device_id?: string;
  framework?: string;
  image_size?: string;
  predictions_count?: number;
  confidence_avg?: number;
}

interface InferenceStats {
  total_inferences: number;
  inferences_24h: number;
  inferences_7d: number;
  avg_inference_time: number;
  top_models: Array<{model_id: string, count: number}>;
  top_clients: Array<{client_ip: string, count: number}>;
  hourly_distribution: Array<{hour: string, count: number}>;
  performance_distribution: {fast: number, medium: number, slow: number};
  recent_inferences: Array<{
    timestamp: string;
    model_id: string;
    client_ip: string;
    inference_time: number;
  }>;
}

// Analytics styled components
const AnalyticsContainer = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border-radius: 12px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  overflow: hidden;
  
  /* Mobile styles */
  @media (max-width: 767px) {
    border-radius: 8px;
  }
`;

const SearchBarContainer = styled.div`
  padding: 20px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  background: ${props => props.theme.colors.background.primary};
  
  /* Mobile styles */
  @media (max-width: 767px) {
    padding: 16px;
  }
`;

const SearchBar = styled.input`
  width: 100%;
  padding: 12px 16px;
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  color: ${props => props.theme.colors.text.primary};
  font-size: 14px;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
    box-shadow: 0 0 0 2px rgba(118, 185, 0, 0.2);
  }
  
  &::placeholder {
    color: ${props => props.theme.colors.text.secondary};
  }
`;

const FilterSection = styled.div`
  padding: 20px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  background: ${props => props.theme.colors.background.primary};
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  align-items: end;
`;

const FilterGroup = styled.div`
  .label {
    color: ${props => props.theme.colors.text.primary};
    font-size: 13px;
    margin-bottom: 4px;
    display: block;
    font-weight: 500;
  }

  select {
    width: 100%;
    padding: 6px 8px;
    background: ${props => props.theme.colors.background.secondary};
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 4px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 13px;

    &:focus {
      outline: none;
      border-color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const LogsTable = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th, td {
    text-align: left;
    padding: 12px 16px;
    border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  }

  th {
    background: ${props => props.theme.colors.background.primary};
    color: ${props => props.theme.colors.text.primary};
    font-weight: 600;
    font-size: 14px;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  td {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 13px;
  }

  /* Mobile responsive table */
  @media (max-width: 991px) {
    font-size: 14px;
    
    th, td {
      padding: 8px 12px;
    }
    
    th {
      font-size: 13px;
    }
    
    td {
      font-size: 12px;
    }
  }

  /* Very small screens - make scrollable */
  @media (max-width: 767px) {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
    
    th, td {
      padding: 6px 8px;
      min-width: 100px;
    }
  }

  tr:hover {
    background: ${props => props.theme.colors.background.tertiary};
  }
`;

const DeviceTag = styled.span<{deviceType?: string}>`
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${props => {
    switch(props.deviceType?.toLowerCase()) {
      case 'mobile': return '#FF6B6B';
      case 'tablet': return '#4ECDC4';
      case 'desktop': return '#45B7D1';
      case 'jetson': return '#96CEB4';
      case 'api/bot': return '#9B59B6';
      default: return '#95A5A6';
    }
  }};
  color: white;
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const PerformanceIndicator = styled.span<{performance: 'high' | 'medium' | 'low'}>`
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  background: ${props => {
    switch(props.performance) {
      case 'high': return '#28a745';
      case 'medium': return '#ffc107';
      case 'low': return '#dc3545';
      default: return '#6c757d';
    }
  }};
  color: white;
  display: inline-block;
`;

const StatusIndicator = styled.span<{status: 'success' | 'error' | 'warning' | string}>`
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${props => {
    switch(props.status) {
      case 'success': return '#28a745';
      case 'warning': return '#ffc107';
      case 'error': return '#dc3545';
      case 'failed': return '#dc3545';
      default: return '#28a745'; // Default to success green
    }
  }};
  color: white;
  display: inline-block;
  cursor: help;
  position: relative;
`;

const StatusTooltip = styled.div`
  position: absolute;
  bottom: 120%;
  left: 50%;
  transform: translateX(-50%);
  background: ${props => props.theme.colors.background.primary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: normal;
  text-transform: none;
  white-space: nowrap;
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s, visibility 0.2s;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  color: ${props => props.theme.colors.text.primary};
  
  ${StatusIndicator}:hover & {
    opacity: 1;
    visibility: visible;
  }
  
  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: ${props => props.theme.colors.border.secondary};
  }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: ${props => props.theme.colors.background.primary};
  border-top: 1px solid ${props => props.theme.colors.border.secondary};

  .pagination-info {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 14px;
  }

  .pagination-controls {
    display: flex;
    gap: 10px;
  }
`;

const PaginationButton = styled.button<{disabled?: boolean}>`
  padding: 8px 16px;
  background: ${props => props.disabled ? 
    props.theme.colors.background.secondary : 
    props.theme.colors.nvidia.green};
  color: ${props => props.disabled ? 
    props.theme.colors.text.secondary : 
    'white'};
  border: none;
  border-radius: 6px;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  transition: all ${props => props.theme.transitions.standard};
  font-size: 14px;

  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.nvidia.darkGreen};
  }
`;

const SearchForm = styled.form`
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  
  button {
    padding: 12px 16px;
    background: ${props => props.theme.colors.nvidia.green};
    border: none;
    border-radius: 6px;
    color: white;
    cursor: pointer;
    
    &:hover {
      background: ${props => props.theme.colors.nvidia.darkGreen};
    }
  }
`;

const FilterRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 20px;
  margin-bottom: 20px;
  
  @media (max-width: 1024px) {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
    
    > div:first-child {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
    }
    
    > div:last-child {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
  }
  
  @media (max-width: 768px) {
    > div:first-child {
      grid-template-columns: 1fr;
    }
    
    > div:last-child {
      justify-content: stretch;
      
      button {
        flex: 1;
      }
    }
  }
`;

const StyledDatePickerWrapper = styled.div`
  position: relative;
  
  /* Global overrides for react-datepicker popper */
  :global(.react-datepicker-popper) {
    z-index: 10000 !important;
    
    .react-datepicker {
      background-color: ${props => props.theme.colors.background.secondary} !important;
      border: 1px solid ${props => props.theme.colors.border.secondary} !important;
      color: ${props => props.theme.colors.text.primary} !important;
      border-radius: 8px !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
    }
  }
  
  .react-datepicker-wrapper,
  .react-datepicker__input-container {
    display: block;
    width: 100%;
  }

  .react-datepicker__input-container input {
    width: 100%;
    padding: 12px 40px 12px 12px;
    background: ${props => props.theme.colors.background.secondary};
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 8px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    position: relative;
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23CCCCCC' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3e%3c/rect%3e%3cline x1='16' y1='2' x2='16' y2='6'%3e%3c/line%3e%3cline x1='8' y1='2' x2='8' y2='6'%3e%3c/line%3e%3cline x1='3' y1='10' x2='21' y2='10'%3e%3c/line%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 20px 20px;
    
    &:hover {
      border-color: ${props => props.theme.colors.nvidia.green};
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
      background-color: ${props => props.theme.colors.background.hover};
    }
    
    &:focus {
      outline: none;
      border-color: ${props => props.theme.colors.nvidia.green};
      box-shadow: 0 0 0 3px rgba(118, 185, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.15);
      background-color: ${props => props.theme.colors.background.hover};
    }
    
    &::placeholder {
      color: ${props => props.theme.colors.text.secondary};
      font-weight: 400;
    }
    
    &:not(:placeholder-shown) {
      font-weight: 600;
      color: ${props => props.theme.colors.text.primary};
    }
  }

  .react-datepicker-popper {
    z-index: 10000 !important;
    position: fixed !important;
    
    .react-datepicker {
      background-color: ${props => props.theme.colors.background.secondary} !important;
      border: 1px solid ${props => props.theme.colors.border.secondary} !important;
      border-radius: 8px !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
      color: ${props => props.theme.colors.text.primary} !important;
    }
    
    .react-datepicker__triangle {
      border-bottom-color: ${props => props.theme.colors.border.secondary} !important;
      border-top-color: ${props => props.theme.colors.border.secondary} !important;
      
      &::before {
        border-bottom-color: ${props => props.theme.colors.background.secondary} !important;
        border-top-color: ${props => props.theme.colors.background.secondary} !important;
      }
    }
  }

  /* Global portal styles */
  :global(#date-picker-portal) {
    z-index: 10001 !important;
    position: relative !important;
    
    .react-datepicker-popper {
      z-index: 10002 !important;
    }
    
    .react-datepicker {
      z-index: 10002 !important;
      background-color: ${props => props.theme.colors.background.secondary} !important;
      border: 1px solid ${props => props.theme.colors.border.secondary} !important;
    }
  }

  .react-datepicker__month-container {
    background-color: ${props => props.theme.colors.background.secondary} !important;
  }

  .react-datepicker__month {
    background-color: ${props => props.theme.colors.background.secondary} !important;
    color: ${props => props.theme.colors.text.primary} !important;
  }

  .react-datepicker__week {
    color: ${props => props.theme.colors.text.primary} !important;
  }

  .react-datepicker {
    background-color: ${props => props.theme.colors.background.secondary} !important;
    border: 1px solid ${props => props.theme.colors.border.secondary} !important;
    border-radius: 8px !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
    font-family: ${props => props.theme.fonts.body} !important;
    z-index: 10000 !important;
    position: relative;
    color: ${props => props.theme.colors.text.primary} !important;
    
    @media (max-width: 768px) {
      width: 280px !important;
      font-size: 14px;
    }
    
    @media (max-width: 480px) {
      width: 260px !important;
      font-size: 12px;
    }
  }

  .react-datepicker__header {
    background-color: ${props => props.theme.colors.background.tertiary} !important;
    border-bottom: 1px solid ${props => props.theme.colors.border.secondary} !important;
    border-radius: 8px 8px 0 0 !important;
    padding: 8px 0 !important;
  }

  .react-datepicker__current-month,
  .react-datepicker-time__header {
    color: ${props => props.theme.colors.text.primary} !important;
    font-weight: 600 !important;
  }

  .react-datepicker__navigation {
    border: 0.45rem solid transparent !important;
    
    &--previous {
      border-right-color: ${props => props.theme.colors.text.secondary} !important;
      
      &:hover {
        border-right-color: ${props => props.theme.colors.text.primary} !important;
      }
    }
    
    &--next {
      border-left-color: ${props => props.theme.colors.text.secondary} !important;
      
      &:hover {
        border-left-color: ${props => props.theme.colors.text.primary} !important;
      }
    }
  }

  .react-datepicker__day-names {
    border-bottom: 1px solid ${props => props.theme.colors.border.secondary} !important;
    margin-bottom: 8px !important;
  }

  .react-datepicker__day,
  .react-datepicker__day-name {
    color: ${props => props.theme.colors.text.primary} !important;
    
    &:hover {
      background-color: ${props => props.theme.colors.background.tertiary} !important;
      border-radius: 4px !important;
    }
  }

  .react-datepicker__day-name {
    color: ${props => props.theme.colors.text.secondary} !important;
    font-weight: 600 !important;
  }

  .react-datepicker__day--disabled {
    color: ${props => props.theme.colors.text.muted} !important;
    
    &:hover {
      background-color: transparent !important;
      cursor: default !important;
    }
  }

  .react-datepicker__day--outside-month {
    color: ${props => props.theme.colors.text.muted} !important;
  }

  .react-datepicker__day--today {
    background-color: ${props => props.theme.colors.background.tertiary} !important;
    border: 1px solid ${props => props.theme.colors.nvidia.green} !important;
    border-radius: 4px !important;
    font-weight: 600 !important;
  }

  .react-datepicker__day--selected,
  .react-datepicker__day--in-selecting-range,
  .react-datepicker__day--in-range {
    background-color: ${props => props.theme.colors.nvidia.green} !important;
    color: white !important;
    border-radius: 4px !important;
    font-weight: 600 !important;
    
    &:hover {
      background-color: ${props => props.theme.colors.nvidia.darkGreen} !important;
    }
  }

  .react-datepicker__day--range-start,
  .react-datepicker__day--range-end {
    background-color: ${props => props.theme.colors.nvidia.darkGreen} !important;
    color: white !important;
    font-weight: 700 !important;
  }

  .react-datepicker__day--keyboard-selected {
    background-color: ${props => props.theme.colors.nvidia.darkGreen} !important;
    color: white !important;
    border-radius: 4px !important;
  }

  .react-datepicker__close-icon {
    background-color: transparent;
    border: none;
    cursor: pointer;
    outline: none;
    padding: 0;
    right: 7px;
    top: 7px;
    
    &::after {
      background-color: ${props => props.theme.colors.text.secondary};
      border-radius: 50%;
      bottom: 0;
      box-sizing: border-box;
      color: ${props => props.theme.colors.text.primary};
      content: '×';
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      height: 16px;
      line-height: 1;
      margin: auto;
      padding: 2px;
      position: absolute;
      right: 0;
      text-align: center;
      top: 0;
      width: 16px;
      
      &:hover {
        background-color: ${props => props.theme.colors.text.primary};
        color: ${props => props.theme.colors.background.primary};
      }
    }
  }

  .react-datepicker__triangle {
    border-bottom-color: ${props => props.theme.colors.border.secondary} !important;
    border-top-color: ${props => props.theme.colors.border.secondary} !important;
  }

  /* Portal-specific overrides */
  &:global(#date-picker-portal) .react-datepicker {
    background-color: ${props => props.theme.colors.background.secondary};
    border: 1px solid ${props => props.theme.colors.border.secondary};
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 10px;
  margin-left: auto;
`;

const ViewToggleButtons = styled.div`
  display: flex;
  gap: 2px;
  background: ${props => props.theme.colors.background.tertiary};
  border-radius: 8px;
  padding: 4px;
  margin-right: 10px;
`;

const ViewToggleButton = styled.button<{ active: boolean }>`
  padding: 8px 16px;
  background: ${props => props.active ? props.theme.colors.nvidia.green : 'transparent'};
  color: ${props => props.active ? 'white' : props.theme.colors.text.secondary};
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  
  &:hover {
    background: ${props => props.active ? props.theme.colors.nvidia.darkGreen : props.theme.colors.background.hover};
    color: ${props => props.active ? 'white' : props.theme.colors.text.primary};
  }
  
  i {
    font-size: 14px;
  }
`;

const ChartContainer = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
`;

const ChartGrid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 32px;
  margin: 32px 0;
  
  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
    gap: 24px;
  }
`;

const ChartCard = styled.div`
  background: linear-gradient(145deg, ${props => props.theme.colors.background.tertiary}, ${props => props.theme.colors.background.secondary});
  border-radius: 16px;
  padding: 28px;
  border: 1px solid ${props => props.theme.colors.border.tertiary};
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, ${props => props.theme.colors.nvidia.green}, ${props => props.theme.colors.nvidia.lightGreen});
    border-radius: 16px 16px 0 0;
  }
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
    border-color: ${props => props.theme.colors.nvidia.green};
  }
  
  /* Mobile styles */
  @media (max-width: 767px) {
    padding: 16px;
    border-radius: 12px;
    
    &:hover {
      transform: none; /* Disable hover transform on touch devices */
    }
  }
  
  /* Tablet styles */
  @media (min-width: 768px) and (max-width: 991px) {
    padding: 20px;
  }
  
  /* Touch device improvements */
  @media (hover: none) and (pointer: coarse) {
    &:hover {
      transform: none;
    }
  }
  
  h3 {
    margin: 0 0 20px 0;
    color: ${props => props.theme.colors.text.primary};
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
    letter-spacing: -0.01em;
    
    i {
      color: ${props => props.theme.colors.nvidia.green};
      font-size: 16px;
      padding: 6px;
      background: rgba(118, 185, 0, 0.1);
      border-radius: 6px;
    }
  }
`;

const SmallChartsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ChartStats = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin: 20px 0 28px 0;
  padding: 16px 20px;
  background: linear-gradient(145deg, ${props => props.theme.colors.background.tertiary}, ${props => props.theme.colors.background.secondary});
  border-radius: 12px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  
  @media (max-width: 768px) {
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }
  
  .stat {
    flex: 1;
    text-align: center;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(118, 185, 0, 0.05);
    border: 1px solid rgba(118, 185, 0, 0.1);
    transition: all 0.2s ease;
    
    &:hover {
      background: rgba(118, 185, 0, 0.08);
      border-color: rgba(118, 185, 0, 0.15);
    }
    
    .value {
      font-size: 18px;
      font-weight: 700;
      color: ${props => props.theme.colors.nvidia.green};
      display: block;
      margin-bottom: 2px;
      line-height: 1;
    }
    
    .label {
      font-size: 11px;
      color: ${props => props.theme.colors.text.secondary};
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      line-height: 1.2;
    }
  }
`;

const ExportButton = styled.button`
  padding: 8px 12px;
  background: ${props => props.theme.colors.nvidia.green};
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: all ${props => props.theme.transitions.standard};

  &:hover {
    background: ${props => props.theme.colors.nvidia.darkGreen};
  }
`;

// New styled components for dropdown export and modal
const DropdownExportContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const DropdownExportButton = styled.button`
  padding: 8px 12px;
  background: ${props => props.theme.colors.nvidia.green};
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: all ${props => props.theme.transitions.standard};

  &:hover {
    background: ${props => props.theme.colors.nvidia.darkGreen};
    transform: translateY(-1px);
  }

  i.chevron {
    transition: transform 0.2s ease;
    transform: ${props => props.className?.includes('open') ? 'rotate(180deg)' : 'rotate(0deg)'};
  }
`;

const DropdownExportMenu = styled.div<{$isOpen: boolean}>`
  position: fixed;
  top: auto;
  right: auto;
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  min-width: 160px;
  z-index: ${props => props.theme.zIndex.modal};
  opacity: ${props => props.$isOpen ? 1 : 0};
  visibility: ${props => props.$isOpen ? 'visible' : 'hidden'};
  transform: ${props => props.$isOpen ? 'translateY(0)' : 'translateY(-10px)'};
  transition: all 0.2s ease;
  pointer-events: ${props => props.$isOpen ? 'auto' : 'none'};
`;

const DropdownExportItem = styled.button`
  width: 100%;
  padding: 10px 16px;
  background: none;
  border: none;
  color: ${props => props.theme.colors.text.primary};
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.background.tertiary};
  }

  &:first-child {
    border-radius: 8px 8px 0 0;
  }

  &:last-child {
    border-radius: 0 0 8px 8px;
  }

  &:only-child {
    border-radius: 8px;
  }

  i {
    width: 16px;
    color: ${props => props.theme.colors.nvidia.green};
  }
`;

const ClickableTableRow = styled.tr`
  cursor: pointer;
  transition: background-color ${props => props.theme.transitions.fast};
  
  &:hover {
    background: ${props => props.theme.colors.background.tertiary} !important;
  }
`;

const Modal = styled.div<{$isOpen: boolean}>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: ${props => props.theme.zIndex.modal};
  display: ${props => props.$isOpen ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  padding: 20px;
  backdrop-filter: blur(5px);
`;

const ModalContent = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 16px;
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  
  /* Mobile styles */
  @media (max-width: 767px) {
    width: 95%;
    max-height: 95vh;
    border-radius: 8px;
    max-width: none;
  }\n`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, ${props => props.theme.colors.background.secondary} 0%, ${props => props.theme.colors.background.primary} 100%);
  flex-shrink: 0;
  border-radius: 16px 16px 0 0;
  
  h3 {
    margin: 0;
    color: ${props => props.theme.colors.text.primary};
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 20px;
    font-weight: 600;
    
    i {
      color: ${props => props.theme.colors.nvidia.green};
      font-size: 18px;
    }
    
    /* Mobile responsive */
    @media (max-width: 767px) {
      font-size: 18px;
      gap: 8px;
      
      i {
        font-size: 16px;
      }
    }
  }
  
  /* Mobile styles */
  @media (max-width: 767px) {
    padding: 16px;
    border-radius: 8px 8px 0 0;
  }
`;

const ModalCloseButton = styled.button`
  position: absolute;
  top: 15px;
  right: 15px;
  background: transparent;
  border: none;
  color: ${props => props.theme.colors.text.secondary};
  cursor: pointer;
  font-size: 18px;
  padding: 5px;
  
  &:hover {
    color: ${props => props.theme.colors.text.primary};
  }
`;

const ModalBody = styled.div`
  padding: 24px;
  background: ${props => props.theme.colors.background.primary};
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  border-radius: 0 0 16px 16px;

  /* Custom scrollbar styling for webkit browsers */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 0 0 16px 0;
  }

  &::-webkit-scrollbar-thumb {
    background: ${props => props.theme.colors.border.secondary};
    border-radius: 4px;
    
    &:hover {
      background: ${props => props.theme.colors.text.secondary};
    }
  }

  /* For Firefox */
  scrollbar-width: thin;
  scrollbar-color: ${props => props.theme.colors.border.secondary} transparent;
`;

const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 24px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 16px;
  }
`;

const DetailCard = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(118, 185, 0, 0.1);
  }
  
  h4 {
    margin: 0 0 16px 0;
    color: ${props => props.theme.colors.text.primary};
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 12px;
    border-bottom: 2px solid ${props => props.theme.colors.nvidia.green};
    
    i {
      color: ${props => props.theme.colors.nvidia.green};
      font-size: 16px;
    }
  }
`;

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  transition: background-color 0.2s ease;
  
  &:hover {
    background: rgba(118, 185, 0, 0.05);
    margin: 0 -12px;
    padding: 12px;
    border-radius: 6px;
    border-bottom-color: transparent;
  }
  
  &:last-child {
    border-bottom: none;
  }
  
  .label {
    color: ${props => props.theme.colors.text.secondary};
    font-weight: 500;
    font-size: 14px;
    min-width: 120px;
  }
  
  .value {
    color: ${props => props.theme.colors.text.primary};
    font-weight: 600;
    text-align: right;
    font-size: 14px;
  }
`;

const ClearButton = styled.button`
  padding: 8px 12px;
  background: #dc3545;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  
  &:hover {
    background: #c82333;
  }
`;

const CodeHeaderCopyIcon = styled.button`
  background: transparent;
  border: none;
  color: ${props => props.theme.colors.text.secondary};
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 14px;
  margin-left: auto;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    color: ${props => props.theme.colors.nvidia.green};
    background: rgba(118, 185, 0, 0.1);
  }
  
  &:active {
    transform: scale(0.95);
  }
`;

const LoadingState = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
  color: ${props => props.theme.colors.text.secondary};
  
  i {
    margin-right: 8px;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: ${props => props.theme.colors.text.secondary};
  
  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  .empty-text {
    font-size: 16px;
    margin-bottom: 8px;
  }
  
  .empty-hint {
    font-size: 14px;
    opacity: 0.7;
  }
`;

const InferenceSection: React.FC<InferenceSectionProps> = ({ systemData, socket, isConnected }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tab, view } = useParams<{ tab?: string; view?: string }>();
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
  
  // Tab state
  // Initialize tab from URL parameter, default to 'inference'
  const getValidTab = (urlTab?: string): 'inference' | 'api' | 'analytics' => {
    if (urlTab && ['inference', 'api', 'analytics'].includes(urlTab)) {
      return urlTab as 'inference' | 'api' | 'analytics';
    }
    return 'inference';
  };
  
  const [activeTab, setActiveTab] = useState<'inference' | 'api' | 'analytics'>(getValidTab(tab));
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
  const [activeCodeTab, setActiveCodeTab] = useState<{[key: string]: string}>({});
  
  // Analytics state
  const [inferenceLogs, setInferenceLogs] = useState<InferenceLog[]>([]);
  const [inferenceStats, setInferenceStats] = useState<InferenceStats | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    model_id: '',
    client_ip: '',
    device_info: '',
    start_date: '',
    end_date: '',
    page: 1,
    per_page: 20
  });
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 20,
    total: 0,
    pages: 0
  });
  
  // Modal and dropdown state
  const [selectedLogForModal, setSelectedLogForModal] = useState<InferenceLog | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Initialize view mode from URL parameter, default to 'table'
  const getValidView = (urlView?: string): 'table' | 'chart' => {
    if (urlView && ['table', 'chart'].includes(urlView)) {
      return urlView as 'table' | 'chart';
    }
    return 'table';
  };
  
  const [viewMode, setViewMode] = useState<'table' | 'chart'>(getValidView(view));
  
  // Date range picker state
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state with URL parameters
  useEffect(() => {
    const newTab = getValidTab(tab);
    const newView = getValidView(view);
    
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
    if (newView !== viewMode) {
      setViewMode(newView);
    }
  }, [tab, view]);

  // Navigation helper functions
  const navigateToTab = (newTab: 'inference' | 'api' | 'analytics') => {
    const currentView = activeTab === 'analytics' ? viewMode : undefined;
    const pathSegments = ['/inference', newTab];
    if (newTab === 'analytics' && currentView) {
      pathSegments.push(currentView);
    }
    navigate(pathSegments.join('/'));
  };

  const navigateToView = (newView: 'table' | 'chart') => {
    navigate(`/inference/${activeTab}/${newView}`);
  };

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

  // Date picker helper functions
  const handleDateRangeChange = (dates: [Date | null, Date | null]) => {
    const [start, end] = dates;
    setStartDate(start);
    setEndDate(end);
    
    // Update filters with ISO strings
    const newFilters = {
      ...filters,
      start_date: start ? start.toISOString() : '',
      end_date: end ? end.toISOString() : '',
      page: 1
    };
    setFilters(newFilters);
    
    // Only fetch if both dates are selected or both are cleared
    if ((start && end) || (!start && !end)) {
      fetchInferenceLogs(newFilters);
    }
  };

  const clearDateRange = () => {
    setStartDate(null);
    setEndDate(null);
    setFilters(prev => ({
      ...prev,
      start_date: '',
      end_date: '',
      page: 1
    }));
    fetchInferenceLogs({
      ...filters,
      start_date: '',
      end_date: '',
      page: 1
    });
  };

  // Chart data preparation functions
  const prepareTimelineData = () => {
    const timeData: {[key: string]: number} = {};
    
    inferenceLogs.forEach(log => {
      const date = new Date(log.timestamp).toLocaleDateString();
      timeData[date] = (timeData[date] || 0) + 1;
    });

    const sortedDates = Object.keys(timeData).sort((a, b) => 
      new Date(a).getTime() - new Date(b).getTime()
    );

    return {
      labels: sortedDates,
      datasets: [
        {
          label: 'Inference Count',
          data: sortedDates.map(date => timeData[date]),
          borderColor: '#76B900',
          backgroundColor: ((context: any) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return 'rgba(118, 185, 0, 0.1)';
            
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(118, 185, 0, 0.3)');
            gradient.addColorStop(0.5, 'rgba(118, 185, 0, 0.15)');
            gradient.addColorStop(1, 'rgba(118, 185, 0, 0.05)');
            return gradient;
          }),
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#76B900',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: '#9DD922',
          pointHoverBorderColor: '#FFFFFF',
          pointHoverBorderWidth: 3,
        },
      ],
    };
  };

  const prepareModelUsageData = () => {
    const modelData: {[key: string]: number} = {};
    
    inferenceLogs.forEach(log => {
      modelData[log.model_id] = (modelData[log.model_id] || 0) + 1;
    });

    const sortedModels = Object.entries(modelData)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Top 10 models

    return {
      labels: sortedModels.map(([model]) => model),
      datasets: [
        {
          label: 'Usage Count',
          data: sortedModels.map(([, count]) => count),
          backgroundColor: ((context: any) => {
            const chart = context.chart;
            const { ctx } = chart;
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, '#76B900');
            gradient.addColorStop(1, '#5A8B00');
            return gradient;
          }),
          borderColor: '#76B900',
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
          hoverBackgroundColor: '#9DD922',
          hoverBorderColor: '#9DD922',
          hoverBorderWidth: 3,
        },
      ],
    };
  };

  const prepareDeviceTypeData = () => {
    const deviceData: {[key: string]: number} = {};
    
    inferenceLogs.forEach(log => {
      const device = log.device_info || 'Unknown';
      deviceData[device] = (deviceData[device] || 0) + 1;
    });

    const getDeviceColor = (deviceType: string) => {
      switch(deviceType.toLowerCase()) {
        case 'mobile': return '#FF6B6B';
        case 'tablet': return '#4ECDC4';
        case 'desktop': return '#45B7D1';
        case 'jetson': return '#96CEB4';
        case 'api/bot': return '#9B59B6';
        default: return '#95A5A6';
      }
    };

    const deviceEntries = Object.entries(deviceData);

    return {
      labels: deviceEntries.map(([device]) => device),
      datasets: [
        {
          data: deviceEntries.map(([, count]) => count),
          backgroundColor: deviceEntries.map(([device]) => getDeviceColor(device)),
          borderWidth: 0,
        },
      ],
    };
  };

  // Chart configuration options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1500,
      easing: 'easeInOutQuart' as const,
    },
    plugins: {
      legend: {
        labels: {
          color: '#FFFFFF',
          font: {
            size: 13,
            weight: 600,
            family: 'Inter, sans-serif'
          },
          padding: 20,
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltip: {
        backgroundColor: 'rgba(34, 34, 34, 0.95)',
        titleColor: '#FFFFFF',
        bodyColor: '#FFFFFF',
        borderColor: '#76B900',
        borderWidth: 2,
        cornerRadius: 8,
        padding: 12,
        titleFont: {
          size: 14,
          weight: 600
        },
        bodyFont: {
          size: 13,
          weight: 500
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#CCCCCC',
          font: {
            size: 12,
            weight: 500
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.08)',
          lineWidth: 1
        },
        border: {
          color: 'rgba(118, 185, 0, 0.3)',
          width: 2
        }
      },
      y: {
        ticks: {
          color: '#CCCCCC',
          font: {
            size: 12,
            weight: 500
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.08)',
          lineWidth: 1
        },
        border: {
          color: 'rgba(118, 185, 0, 0.3)',
          width: 2
        }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1500,
      easing: 'easeInOutQuart' as const,
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#FFFFFF',
          font: {
            size: 12,
            weight: 600,
            family: 'Inter, sans-serif'
          },
          padding: 20,
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltip: {
        backgroundColor: 'rgba(34, 34, 34, 0.95)',
        titleColor: '#FFFFFF',
        bodyColor: '#FFFFFF',
        borderColor: '#76B900',
        borderWidth: 2,
        cornerRadius: 8,
        padding: 12,
        titleFont: {
          size: 14,
          weight: 600
        },
        bodyFont: {
          size: 13,
          weight: 500
        }
      }
    },
    cutout: '65%',
    elements: {
      arc: {
        borderWidth: 3,
        borderColor: '#1A1A1A'
      }
    }
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

  // Copy to clipboard helper
  const copyToClipboard = (text: string) => {
    // Fallback for when navigator.clipboard is not available (non-HTTPS contexts)
    const fallbackCopy = (text: string) => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        return true;
      } catch (err) {
        console.error('Fallback: Unable to copy', err);
        return false;
      } finally {
        document.body.removeChild(textArea);
      }
    };

    if (navigator.clipboard && window.isSecureContext) {
      // Use modern clipboard API
      navigator.clipboard.writeText(text).then(() => {
        addNotification({
          type: 'success',
          title: 'Copied',
          message: 'Content copied to clipboard'
        });
      }).catch((err) => {
        console.error('Clipboard API failed:', err);
        if (fallbackCopy(text)) {
          addNotification({
            type: 'success',
            title: 'Copied',
            message: 'Content copied to clipboard'
          });
        } else {
          addNotification({
            type: 'error',
            title: 'Copy Failed',
            message: 'Failed to copy to clipboard'
          });
        }
      });
    } else {
      // Use fallback method
      if (fallbackCopy(text)) {
        addNotification({
          type: 'success',
          title: 'Copied',
          message: 'Content copied to clipboard'
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Copy Failed',
          message: 'Failed to copy to clipboard'
        });
      }
    }
  };

  // Copy hash to clipboard helper
  const copyHashToClipboard = (hash: string) => {
    // Fallback for when navigator.clipboard is not available (non-HTTPS contexts)
    const fallbackCopy = (text: string) => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        return true;
      } catch (err) {
        console.error('Fallback: Unable to copy', err);
        return false;
      } finally {
        document.body.removeChild(textArea);
      }
    };

    if (navigator.clipboard && window.isSecureContext) {
      // Use modern clipboard API
      navigator.clipboard.writeText(hash).then(() => {
        addNotification({
          type: 'success',
          title: 'Hash Copied',
          message: 'Image hash copied to clipboard'
        });
      }).catch((err) => {
        console.error('Clipboard API failed:', err);
        if (fallbackCopy(hash)) {
          addNotification({
            type: 'success',
            title: 'Hash Copied',
            message: 'Image hash copied to clipboard'
          });
        } else {
          addNotification({
            type: 'error',
            title: 'Copy Failed',
            message: 'Failed to copy hash to clipboard'
          });
        }
      });
    } else {
      // Use fallback method
      if (fallbackCopy(hash)) {
        addNotification({
          type: 'success',
          title: 'Hash Copied',
          message: 'Image hash copied to clipboard'
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Copy Failed',
          message: 'Failed to copy hash to clipboard'
        });
      }
    }
  };

  // Debounced search function for smart search
  const debouncedSearch = useCallback(
    debounce((searchValue: string, currentFilters: any) => {
      const newFilters = { ...currentFilters, page: 1 };
      setFilters(newFilters);
      fetchInferenceLogs({ ...newFilters, search: searchValue });
    }, 500),
    []
  );

  // Get device icon based on device type
  const getDeviceIcon = (deviceType: string) => {
    switch(deviceType?.toLowerCase()) {
      case 'mobile': return 'fas fa-mobile-alt';
      case 'tablet': return 'fas fa-tablet-alt';
      case 'desktop': return 'fas fa-desktop';
      case 'jetson': return 'fas fa-microchip';
      case 'api/bot': return 'fas fa-robot';
      default: return 'fas fa-question-circle';
    }
  };

  // Get status description for tooltip
  const getStatusDescription = (status: string) => {
    switch(status?.toLowerCase()) {
      case 'success': return 'Inference completed successfully';
      case 'error': case 'failed': return 'Inference failed with error';
      case 'pending': return 'Inference is pending';
      case 'processing': return 'Inference is currently processing';
      default: return 'Inference completed successfully';
    }
  };

  // Copy raw log data to clipboard
  const copyRawDataToClipboard = (log: InferenceLog) => {
    // Extract just the raw results data, not the entire log
    const rawData = log.result ? JSON.stringify(log.result, null, 2) : JSON.stringify({
      error: "No results data available"
    }, null, 2);
    
    // Fallback for when navigator.clipboard is not available (non-HTTPS contexts)
    const fallbackCopy = (text: string) => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        return true;
      } catch (err) {
        console.error('Fallback: Unable to copy', err);
        return false;
      } finally {
        document.body.removeChild(textArea);
      }
    };

    if (navigator.clipboard && window.isSecureContext) {
      // Use modern clipboard API
      navigator.clipboard.writeText(rawData).then(() => {
        addNotification({
          type: 'success',
          title: 'Results Copied',
          message: 'Raw inference results copied to clipboard'
        });
      }).catch((err) => {
        console.error('Clipboard API failed:', err);
        if (fallbackCopy(rawData)) {
          addNotification({
            type: 'success',
            title: 'Results Copied',
            message: 'Raw inference results copied to clipboard'
          });
        } else {
          addNotification({
            type: 'error',
            title: 'Copy Failed',
            message: 'Failed to copy results to clipboard'
          });
        }
      });
    } else {
      // Use fallback method
      if (fallbackCopy(rawData)) {
        addNotification({
          type: 'success',
          title: 'Results Copied',
          message: 'Raw inference results copied to clipboard'
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Copy Failed',
          message: 'Failed to copy results to clipboard'
        });
      }
    }
  };

  // Get selected model info
  const getSelectedModelInfo = () => {
    return models.find(model => model.id === selectedModel);
  };

  const setCodeTab = (route: string, tab: string) => {
    setActiveCodeTab(prev => ({ ...prev, [route]: tab }));
  };

  const getCodeTab = (route: string) => {
    return activeCodeTab[route] || 'curl';
  };

  // Syntax highlighting helper
  const renderHighlightedCode = (code: string, language: string) => {
    const parts = [];
    let lastIndex = 0;
    
    const patterns = {
      curl: [
        { regex: /(curl|POST|GET|PUT|DELETE)/g, className: 'keyword' },
        { regex: /(-X|-F|-H|--data|--json|-d)/g, className: 'curl-flag' },
        { regex: /(https?:\/\/[^\s"\\]+)/g, className: 'curl-url' },
        { regex: /("(?:[^"\\]|\\.)*")/g, className: 'string' }
      ],
      javascript: [
        { regex: /(const|let|var|function|async|await|fetch|new|return|method)/g, className: 'keyword' },
        { regex: /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g, className: 'string' },
        { regex: /(\/\/.*$)/gm, className: 'comment' },
        { regex: /\b(\d+\.?\d*)\b/g, className: 'number' },
        { regex: /(\w+)(?=\s*\()/g, className: 'function' }
      ],
      python: [
        { regex: /(import|from|def|class|if|else|elif|for|while|try|except|with|as|return|print)/g, className: 'keyword' },
        { regex: /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, className: 'string' },
        { regex: /(#.*$)/gm, className: 'comment' },
        { regex: /\b(\d+\.?\d*)\b/g, className: 'number' }
      ],
      json: [
        { regex: /("(?:[^"\\]|\\.)*")(\s*:)/g, className: 'property', group: 1 },
        { regex: /:\s*("(?:[^"\\]|\\.)*")/g, className: 'string', group: 1 },
        { regex: /:\s*(\d+\.?\d*)/g, className: 'number', group: 1 },
        { regex: /:\s*(true|false|null)/g, className: 'keyword', group: 1 }
      ]
    };

    const langPatterns = patterns[language] || [];
    const matches = [];

    langPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.regex.exec(code)) !== null) {
        matches.push({
          start: match.index,
          end: pattern.regex.lastIndex,
          className: pattern.className,
          text: pattern.group ? match[pattern.group] : match[0]
        });
      }
    });

    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);

    // Remove overlapping matches (keep the first one)
    const cleanMatches = [];
    matches.forEach(match => {
      if (!cleanMatches.some(existing => 
        (match.start >= existing.start && match.start < existing.end) ||
        (match.end > existing.start && match.end <= existing.end)
      )) {
        cleanMatches.push(match);
      }
    });

    cleanMatches.forEach((match, index) => {
      // Add text before this match
      if (match.start > lastIndex) {
        parts.push(code.substring(lastIndex, match.start));
      }
      // Add highlighted match
      parts.push(<span key={index} className={match.className}>{match.text}</span>);
      lastIndex = match.end;
    });

    // Add remaining text
    if (lastIndex < code.length) {
      parts.push(code.substring(lastIndex));
    }

    return parts;
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

  // Analytics functions
  const fetchInferenceLogs = async (searchParams: any = {}) => {
    setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams({
        page: searchParams.page?.toString() || filters.page.toString(),
        per_page: searchParams.per_page?.toString() || filters.per_page.toString(),
        search: searchParams.search || searchQuery,
        model_id: searchParams.model_id || filters.model_id,
        client_ip: searchParams.client_ip || filters.client_ip,
        device_info: searchParams.device_info || filters.device_info,
        start_date: searchParams.start_date || filters.start_date,
        end_date: searchParams.end_date || filters.end_date
      });

      const response = await fetch(`${getBackendUrl()}/logs/inference?${params}`);
      const data = await response.json();

      if (data.success) {
        setInferenceLogs(data.data.logs || []);
        setPagination({
          page: data.data.page,
          per_page: data.data.per_page,
          total: data.data.total,
          pages: data.data.pages
        });
      }
    } catch (error) {
      console.error('Error fetching inference logs:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load inference logs'
      });
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const fetchInferenceStats = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/logs/inference/stats`);
      const data = await response.json();

      if (data.success) {
        setInferenceStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching inference stats:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Immediate search on form submit
    const newFilters = { ...filters, page: 1 };
    setFilters(newFilters);
    fetchInferenceLogs({ ...newFilters, search: searchQuery });
  };

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // Trigger debounced search if there's a value, or clear search if empty
    if (value.trim()) {
      debouncedSearch(value.trim(), filters);
    } else {
      // If search is cleared, immediately fetch without search
      const newFilters = { ...filters, page: 1 };
      setFilters(newFilters);
      fetchInferenceLogs(newFilters);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value, page: 1 };
    setFilters(newFilters);
    fetchInferenceLogs(newFilters);
  };

  const handlePageChange = (newPage: number) => {
    const newFilters = { ...filters, page: newPage };
    setFilters(newFilters);
    fetchInferenceLogs(newFilters);
  };

  const clearFilters = () => {
    const clearedFilters = {
      model_id: '',
      client_ip: '',
      device_info: '',
      start_date: '',
      end_date: '',
      page: 1,
      per_page: 20
    };
    setFilters(clearedFilters);
    setSearchQuery('');
    fetchInferenceLogs({ ...clearedFilters, search: '' });
  };

  const handleExportLogs = async (format: string) => {
    try {
      // Export the same filtered raw logs for both chart and table view
      let exportData: string;
      let filename: string;
      let mimeType: string;

      if (format === 'json') {
        exportData = JSON.stringify(inferenceLogs, null, 2);
        filename = `inference_logs_${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
        
      } else if (format === 'csv') {
        let csvContent = '';
        
        if (inferenceLogs.length > 0) {
          const headers = Object.keys(inferenceLogs[0]).join(',');
          csvContent += headers + '\n';
          inferenceLogs.forEach(log => {
            const values = Object.values(log).map(value => 
              typeof value === 'string' && value.includes(',') ? `"${value}"` : value
            ).join(',');
            csvContent += values + '\n';
          });
        }
        
        exportData = csvContent;
        filename = `inference_logs_${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
        
      } else if (format === 'txt') {
        let txtContent = '';
        
        if (inferenceLogs.length > 0) {
          inferenceLogs.forEach((log, index) => {
            if (index > 0) txtContent += '\n';
            Object.entries(log).forEach(([key, value]) => {
              txtContent += `${key}: ${value}\n`;
            });
          });
        }
        
        exportData = txtContent;
        filename = `inference_logs_${new Date().toISOString().split('T')[0]}.txt`;
        mimeType = 'text/plain';
        
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }
      
      // Create and download file
      const blob = new Blob([exportData], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addNotification({
        type: 'success',
        title: 'Export Complete',
        message: `Logs exported as ${format.toUpperCase()}`
      });
    } catch (error) {
      console.error('Error exporting logs:', error);
      addNotification({
        type: 'error',
        title: 'Export Failed',
        message: 'Failed to export data'
      });
    }
  };

  const handleExportChartsAsImage = async () => {
    try {
      setIsExportDropdownOpen(false);
      
      // Find the chart container
      const chartContainer = document.querySelector('.charts-section');
      if (!chartContainer) {
        throw new Error('Chart container not found');
      }

      // Create canvas from chart container
      const canvas = await html2canvas(chartContainer as HTMLElement, {
        backgroundColor: '#1a1a1a',
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        ignoreElements: (element) => {
          // Ignore tooltips and other floating elements
          return element.classList.contains('tooltip') || 
                 element.classList.contains('dropdown-menu') ||
                 element.getAttribute('role') === 'tooltip';
        }
      });

      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        if (blob) {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `inference_analytics_charts_${new Date().toISOString().split('T')[0]}.png`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          addNotification({
            type: 'success',
            title: 'Export Complete',
            message: 'Charts exported as PNG image'
          });
        }
      }, 'image/png', 0.95);

    } catch (error) {
      console.error('Error exporting charts as image:', error);
      addNotification({
        type: 'error',
        title: 'Export Failed',
        message: 'Failed to export charts as image'
      });
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all inference logs? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`${getBackendUrl()}/logs/inference/clear`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (data.success) {
        setInferenceLogs([]);
        setPagination({
          page: 1,
          per_page: 20,
          total: 0,
          pages: 0
        });
        fetchInferenceStats(); // Refresh stats

        addNotification({
          type: 'success',
          title: 'Logs Cleared',
          message: 'All inference logs have been cleared'
        });
      }
    } catch (error) {
      console.error('Error clearing logs:', error);
      addNotification({
        type: 'error',
        title: 'Clear Failed',
        message: 'Failed to clear logs'
      });
    }
  };

  // New handler functions for modal and dropdown
  const handleRowClick = (log: InferenceLog) => {
    setSelectedLogForModal(log);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedLogForModal(null);
  };

  const toggleExportDropdown = () => {
    if (!isExportDropdownOpen) {
      // Position the dropdown relative to the button
      const button = document.querySelector('.dropdown-export-container button');
      const dropdown = document.querySelector('.dropdown-export-menu');
      if (button && dropdown) {
        const rect = button.getBoundingClientRect();
        const dropdownElement = dropdown as HTMLElement;
        dropdownElement.style.top = `${rect.bottom + 4}px`;
        dropdownElement.style.right = `${window.innerWidth - rect.right}px`;
      }
    }
    setIsExportDropdownOpen(!isExportDropdownOpen);
  };

  const handleDropdownExport = async (format: string) => {
    setIsExportDropdownOpen(false);
    await handleExportLogs(format);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.dropdown-export-container')) {
        setIsExportDropdownOpen(false);
      }
    };

    if (isExportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExportDropdownOpen]);

  // Fetch available models
  useEffect(() => {
    fetchModels();
  }, [isConnected]);

  // Create portal container for date picker
  useEffect(() => {
    let portalContainer = document.getElementById('date-picker-portal');
    if (!portalContainer) {
      portalContainer = document.createElement('div');
      portalContainer.id = 'date-picker-portal';
      portalContainer.style.zIndex = '10001';
      portalContainer.style.position = 'relative';
      document.body.appendChild(portalContainer);
    }

    return () => {
      const container = document.getElementById('date-picker-portal');
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    };
  }, []);

  // Update container dimensions when window resizes
  useEffect(() => {
    const handleResize = () => {
      // Trigger re-measurement of image container if image is loaded
      const imageElement = document.querySelector('.annotated-image') as HTMLImageElement;
      if (imageElement) {
        setImageContainerDimensions({
          width: imageElement.clientWidth,
          height: imageElement.clientHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load analytics data when analytics tab is active
  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchInferenceLogs();
      fetchInferenceStats();
    }
  }, [activeTab]);

  // Reload analytics when filters change
  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchInferenceLogs();
    }
  }, [filters, searchQuery]);

  const fetchModels = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/models`);
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

      const response = await fetch(`${getBackendUrl()}/inference`, {
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
  const convertBboxToPercentage = (bbox: any, imageWidth: number, imageHeight: number, containerWidth: number, containerHeight: number) => {
    if (!bbox || !imageWidth || !imageHeight || !containerWidth || !containerHeight) return null;
    
    // Backend now sends coordinates in pixels relative to the original image dimensions
    // We need to convert these to percentages relative to the container
    
    // Handle different bbox formats - bbox comes in pixel values from backend relative to original image
    let pixelX, pixelY, pixelWidth, pixelHeight;
    
    if (bbox.x !== undefined && bbox.y !== undefined) {
      // Center format: center x, center y, width, height (in pixels relative to original image)
      const centerX = bbox.x;
      const centerY = bbox.y;
      const boxWidth = bbox.width;
      const boxHeight = bbox.height;
      
      // Convert center coordinates to top-left coordinates (still in original image pixels)
      pixelX = centerX - boxWidth / 2;
      pixelY = centerY - boxHeight / 2;
      pixelWidth = boxWidth;
      pixelHeight = boxHeight;
      
    } else if (bbox.x1 !== undefined && bbox.y1 !== undefined) {
      // Corners format: x1, y1, x2, y2 (in pixels relative to original image)
      pixelX = bbox.x1;
      pixelY = bbox.y1;
      pixelWidth = bbox.x2 - bbox.x1;
      pixelHeight = bbox.y2 - bbox.y1;
    } else {
      return null;
    }

    // Convert from original image pixels to percentages relative to original image
    const xPercent = (pixelX / imageWidth) * 100;
    const yPercent = (pixelY / imageHeight) * 100;
    const widthPercent = (pixelWidth / imageWidth) * 100;
    const heightPercent = (pixelHeight / imageHeight) * 100;

    // Ensure coordinates are within bounds
    return {
      x: Math.max(0, Math.min(100, xPercent)),
      y: Math.max(0, Math.min(100, yPercent)),
      width: Math.max(0, Math.min(100 - Math.max(0, xPercent), widthPercent)),
      height: Math.max(0, Math.min(100 - Math.max(0, yPercent), heightPercent))
    };
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    
    // Set natural dimensions
    setImageNaturalDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight
    });
    
    // Use a small delay to ensure the image is properly rendered before measuring
    setTimeout(() => {
      const currentWidth = img.clientWidth;
      const currentHeight = img.clientHeight;
      
      if (currentWidth > 0 && currentHeight > 0) {
        setImageContainerDimensions({
          width: currentWidth,
          height: currentHeight
        });
      }
    }, 10);
    
    // Set up a resize observer to update container dimensions when the image size changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setImageContainerDimensions({ width, height });
        }
      }
    });
    
    resizeObserver.observe(img);
    
    // Cleanup observer when component unmounts or image changes
    return () => {
      resizeObserver.disconnect();
    };
  };

  return (
    <Container>
      <DatePickerGlobalStyle />
      <SectionHeader>
        <h2>
          <i className="fas fa-rocket"></i>
          Inference Engine
        </h2>
      </SectionHeader>

      {/* Tab Navigation */}
      <TabSection>
        <TabHeader>
          <TabButton 
            active={activeTab === 'inference'} 
            onClick={() => navigateToTab('inference')}
          >
            <i className="fas fa-play-circle"></i>
            Run Inference
          </TabButton>
          <TabButton 
            active={activeTab === 'api'} 
            onClick={() => navigateToTab('api')}
          >
            <i className="fas fa-code"></i>
            API Routes
          </TabButton>
          <TabButton 
            active={activeTab === 'analytics'} 
            onClick={() => navigateToTab('analytics')}
          >
            <i className="fas fa-chart-bar"></i>
            Analytics
          </TabButton>
        </TabHeader>

        {/* Inference Tab Content */}
        <TabContent visible={activeTab === 'inference'}>
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
                      className="annotated-image"
                      src={annotatedImageUrl} 
                      alt="Annotated Result"
                      onLoad={handleImageLoad}
                    />
                    
                    {/* Render bounding boxes */}
                    {getFilteredPredictions(getPredictions(results)).map((pred: any, index: number) => {
                      // Ensure we have valid dimensions before attempting to render bounding boxes
                      if (imageNaturalDimensions.width === 0 || imageNaturalDimensions.height === 0) {
                        return null;
                      }
                      
                      const bbox = convertBboxToPercentage(
                        pred.bbox, 
                        imageNaturalDimensions.width, 
                        imageNaturalDimensions.height,
                        imageContainerDimensions.width,
                        imageContainerDimensions.height
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
                    <div className="stat-value" style={{fontSize: '12px'}}>{(results.result?.model_id || results.model_id || '')}</div>
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
        </TabContent>

        {/* API Routes Tab Content */}
        <TabContent visible={activeTab === 'api'}>
          <ApiRoutesContainer>
            {/* Model Selection Dropdown */}
            <ModelInfoCard>
              <div className="model-name">API Documentation</div>
              <div className="model-details">
                <div className="detail-item">
                  <span className="label">Select Model:</span>
                  <select
                    value={selectedModel || ''}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    style={{
                      background: '#2a2a2a',
                      color: '#ffffff',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      minWidth: '200px'
                    }}
                  >
                    <option value="">Select a model...</option>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.framework}) {model.status !== 'loaded' && '- Not Loaded'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="detail-item">
                  <span className="label">Base URL:</span>
                  <span className="value">{getBackendUrl()}</span>
                </div>
                {selectedModel && getSelectedModelInfo() && (
                  <>
                    <div className="detail-item">
                      <span className="label">Framework:</span>
                      <span className="value">{getSelectedModelInfo()?.framework || 'Unknown'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">Status:</span>
                      <span className="value" style={{
                        color: getSelectedModelInfo()?.status === 'loaded' ? '#76b900' : '#ff4757'
                      }}>{getSelectedModelInfo()?.status === 'loaded' ? 'Loaded' : 'Not Loaded'}</span>
                    </div>
                  </>
                )}
              </div>
            </ModelInfoCard>

            {/* API Endpoints Overview */}
            <RouteSection>
              <RouteHeader>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#76b900' }}>
                  <i className="fas fa-list"></i> Available API Endpoints
                </div>
                <div style={{ fontSize: '14px', color: '#888', marginTop: '4px' }}>
                  Click on any endpoint to see detailed examples and documentation
                </div>
              </RouteHeader>
              
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {/* POST /api/inference */}
                  <div style={{ 
                    background: '#2a2a2a', 
                    borderRadius: '6px',
                    border: '1px solid #444'
                  }}>
                    <div 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: '10px', 
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                      onClick={() => setExpandedRoute(expandedRoute === 'inference' ? null : 'inference')}
                    >
                      <MethodBadge method="POST" style={{ marginRight: '15px' }}>POST</MethodBadge>
                      <RouteUrlContainer>
                        <RouteUrl>{getBackendUrl()}/inference</RouteUrl>
                        <button 
                          className="route-copy-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(`${getBackendUrl()}/inference`);
                          }}
                        >
                          <i className="fas fa-copy"></i>
                        </button>
                      </RouteUrlContainer>
                      <i className={`fas fa-chevron-${expandedRoute === 'inference' ? 'up' : 'down'}`} style={{ color: '#76b900', marginLeft: '15px' }}></i>
                    </div>
                    
                    {expandedRoute === 'inference' && (
                      <div style={{ padding: '0 15px 15px', borderTop: '1px solid #444', margin: '0 10px', paddingTop: '15px' }}>
                        <RouteDescription>
                          Upload an image file and get AI detection results using the selected model.
                          {!selectedModel && (
                            <div style={{ color: '#ff4757', fontSize: '14px', marginTop: '8px' }}>
                              <i className="fas fa-exclamation-triangle"></i> Select a model above to see model-specific examples
                            </div>
                          )}
                        </RouteDescription>
                        
                        {/* Request Body Section */}
                        <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                          <h4 style={{ color: '#76b900', marginBottom: '10px', fontSize: '16px' }}>
                            <i className="fas fa-upload"></i> Request Body
                          </h4>
                          <CodeBlock language="json">
                            <div style={{ color: '#d4d4d4' }}>
                              {`{`}<br />
                              &nbsp;&nbsp;<span className="property">"image"</span>: <span className="comment">// File (required) - Image file to analyze</span><br />
                              &nbsp;&nbsp;<span className="comment">// Supported formats: JPEG, PNG, WebP, BMP</span><br />
                              &nbsp;&nbsp;<span className="comment">// Max size: 10MB</span><br />
                              <br />
                              &nbsp;&nbsp;<span className="property">"model_id"</span>: <span className="string">"{selectedModel ? (getSelectedModelInfo()?.name || selectedModel) : 'MODEL_NAME'}"</span><span className="comment"> // String (required)</span><br />
                              &nbsp;&nbsp;<span className="comment">// Available models: "YOLOv11n", "YOLOv11x"</span><br />
                              {`}`}
                            </div>
                            <i className="fas fa-copy copy-icon" onClick={() => copyToClipboard(`{\n  "image": "// File (required) - Image file to analyze\\n  // Supported formats: JPEG, PNG, WebP, BMP\\n  // Max size: 10MB\\n\\n  "model_id": "${selectedModel ? (getSelectedModelInfo()?.name || selectedModel) : 'MODEL_NAME'}" // String (required)\\n  // Available models: \\"YOLOv11n\\", \\"YOLOv11x\\"\\n}"`)}>
                            </i>
                          </CodeBlock>
                        </div>
                        
                        {/* Code Examples with Tabs */}
                        <div style={{ marginTop: '20px' }}>
                          <h4 style={{ color: '#76b900', marginBottom: '10px', fontSize: '16px' }}>
                            <i className="fas fa-code"></i> Code Examples
                          </h4>
                          
                          {/* Language Tabs */}
                          <div style={{ 
                            display: 'flex', 
                            marginBottom: '10px',
                            borderBottom: '1px solid #444'
                          }}>
                            {['curl', 'javascript', 'python'].map(lang => (
                              <button
                                key={lang}
                                onClick={() => setCodeTab('inference', lang)}
                                style={{
                                  background: getCodeTab('inference') === lang ? '#76b900' : 'transparent',
                                  color: getCodeTab('inference') === lang ? '#000' : '#888',
                                  border: 'none',
                                  padding: '8px 16px',
                                  cursor: 'pointer',
                                  borderRadius: '4px 4px 0 0',
                                  fontSize: '14px',
                                  fontWeight: getCodeTab('inference') === lang ? 'bold' : 'normal',
                                  textTransform: 'uppercase'
                                }}
                              >
                                {lang === 'curl' ? 'cURL' : lang}
                              </button>
                            ))}
                          </div>

                          {/* cURL Tab */}
                          {getCodeTab('inference') === 'curl' && (
                            <CodeBlock language="curl">
                              {renderHighlightedCode(`curl -X POST "${getBackendUrl()}/inference" \\
  -F "image=@/path/to/your/image.jpg" \\
  -F "model_id=${selectedModel ? (getSelectedModelInfo()?.name || selectedModel) : 'MODEL_NAME'}"`, 'curl')}
                              <i className="fas fa-copy copy-icon" onClick={() => copyToClipboard(`curl -X POST "${getBackendUrl()}/inference" \\\n  -F "image=@/path/to/your/image.jpg" \\\n  -F "model_id=${selectedModel ? (getSelectedModelInfo()?.name || selectedModel) : 'MODEL_NAME'}"`)}>
                              </i>
                            </CodeBlock>
                          )}

                          {/* JavaScript Tab */}
                          {getCodeTab('inference') === 'javascript' && (
                            <CodeBlock language="javascript">
                              {renderHighlightedCode(`const formData = new FormData();
formData.append('image', imageFile);
formData.append('model_id', '${selectedModel ? (getSelectedModelInfo()?.name || selectedModel) : 'MODEL_NAME'}');

const response = await fetch('${getBackendUrl()}/inference', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result);`, 'javascript')}
                              <i className="fas fa-copy copy-icon" onClick={() => copyToClipboard(`const formData = new FormData();
formData.append('image', imageFile);
formData.append('model_id', '${selectedModel ? (getSelectedModelInfo()?.name || selectedModel) : 'MODEL_NAME'}');

const response = await fetch('${getBackendUrl()}/inference', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result);`)}>
                              </i>
                            </CodeBlock>
                          )}

                          {/* Python Tab */}
                          {getCodeTab('inference') === 'python' && (
                            <CodeBlock language="python">
                              {renderHighlightedCode(`import requests

url = "${getBackendUrl()}/inference"
files = {'image': open('/path/to/your/image.jpg', 'rb')}
data = {'model_id': '${selectedModel ? (getSelectedModelInfo()?.name || selectedModel) : 'MODEL_NAME'}'}

response = requests.post(url, files=files, data=data)
result = response.json()
print(result)`, 'python')}
                              <i className="fas fa-copy copy-icon" onClick={() => copyToClipboard(`import requests

url = "${getBackendUrl()}/inference"
files = {'image': open('/path/to/your/image.jpg', 'rb')}
data = {'model_id': '${selectedModel ? (getSelectedModelInfo()?.name || selectedModel) : 'MODEL_NAME'}'}

response = requests.post(url, files=files, data=data)
result = response.json()
print(result)`)}>
                              </i>
                            </CodeBlock>
                          )}
                        </div>

                        {/* Response Example */}
                        <div style={{ marginTop: '25px' }}>
                          <h4 style={{ color: '#76b900', marginBottom: '10px', fontSize: '16px' }}>
                            <i className="fas fa-arrow-left"></i> Response Example
                          </h4>
                          <CodeBlock language="json">
                            {renderHighlightedCode(`{
  "success": true,
  "data": {
    "result": {
      "predictions": [
        {
          "class_id": 0,
          "class": "person",
          "confidence": 0.85,
          "bbox": {
            "x": 320.5,
            "y": 240.0,
            "width": 150.2,
            "height": 200.8
          }
        }
      ],
      "inference_time": 0.123,
      "model_id": "${selectedModel ? (getSelectedModelInfo()?.name || selectedModel) : 'MODEL_NAME'}",
      "framework": "${selectedModel ? (getSelectedModelInfo()?.framework || 'pytorch') : 'FRAMEWORK'}"
    }
  }
}`, 'json')}
                            <i className="fas fa-copy copy-icon" onClick={() => copyToClipboard(`{
  "success": true,
  "data": {
    "result": {
      "predictions": [
        {
          "class_id": 0,
          "class": "person",
          "confidence": 0.85,
          "bbox": {
            "x": 320.5,
            "y": 240.0,
            "width": 150.2,
            "height": 200.8
          }
        }
      ],
      "inference_time": 0.123,
      "model_id": "${selectedModel ? (getSelectedModelInfo()?.name || selectedModel) : 'MODEL_NAME'}",
      "framework": "${selectedModel ? (getSelectedModelInfo()?.framework || 'pytorch') : 'FRAMEWORK'}"
    }
  }
}`)}>
                            </i>
                          </CodeBlock>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </RouteSection>

            {/* Error Handling Documentation */}
            <RouteSection>
              <RouteHeader>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#76b900' }}>
                  <i className="fas fa-exclamation-triangle"></i> Error Handling
                </div>
              </RouteHeader>

              <div style={{ marginBottom: '25px' }}>
                <strong>Common Error Response Format:</strong>
                <CodeBlock>{`{
  "success": false,
  "error": "Error message description",
  "error_type": "validation_error | cuda_memory_error | inference_error | model_not_found"
}`}
                  <i className="fas fa-copy copy-icon" onClick={() => copyToClipboard(`{
  "success": false,
  "error": "Error message description",
  "error_type": "validation_error | cuda_memory_error | inference_error | model_not_found"
}`)}></i>
                </CodeBlock>
                
                <div style={{ marginTop: '15px' }}>
                  <strong>Error Types:</strong>
                  <ul style={{ color: '#ccc', paddingLeft: '20px', lineHeight: '1.6' }}>
                    <li><code>validation_error</code> - Invalid input parameters</li>
                    <li><code>cuda_memory_error</code> - GPU memory exhausted</li>
                    <li><code>inference_error</code> - Model inference failed</li>
                    <li><code>model_not_found</code> - Requested model doesn't exist</li>
                  </ul>
                </div>
              </div>
            </RouteSection>
          </ApiRoutesContainer>
        </TabContent>

        {/* Analytics Tab Content */}
        <TabContent visible={activeTab === 'analytics'}>
          <AnalyticsContainer>
            {/* Search and Filters */}
            <FilterSection>
              <SearchForm onSubmit={handleSearch}>
                <SearchBar
                  type="text"
                  placeholder="Search logs by model, IP, device, etc..."
                  value={searchQuery}
                  onChange={handleSearchInput}
                />
                <button type="submit">
                  <i className="fas fa-search" />
                </button>
              </SearchForm>
              
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                <ViewToggleButtons>
                  <ViewToggleButton 
                    active={viewMode === 'table'} 
                    onClick={() => navigateToView('table')}
                  >
                    <i className="fas fa-table" />
                    Table View
                  </ViewToggleButton>
                  <ViewToggleButton 
                    active={viewMode === 'chart'} 
                    onClick={() => navigateToView('chart')}
                  >
                    <i className="fas fa-chart-line" />
                    Chart View
                  </ViewToggleButton>
                </ViewToggleButtons>
              </div>
              
              <FilterRow>
                <div style={{display: 'flex', gap: '15px', alignItems: 'end', flex: '1'}}>
                  <FilterGroup style={{minWidth: '160px'}}>
                    <label className="label">Model:</label>
                    <select
                      value={filters.model_id}
                      onChange={(e) => handleFilterChange('model_id', e.target.value)}
                      style={{fontSize: '13px', padding: '6px 8px'}}
                    >
                      <option value="">All Models</option>
                      {models.map(model => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                      ))}
                    </select>
                  </FilterGroup>
                  
                  <FilterGroup style={{minWidth: '140px'}}>
                    <label className="label">Device:</label>
                    <select
                      value={filters.device_info}
                      onChange={(e) => handleFilterChange('device_info', e.target.value)}
                      style={{fontSize: '13px', padding: '6px 8px'}}
                    >
                      <option value="">All</option>
                      <option value="Mobile">Mobile</option>
                      <option value="Tablet">Tablet</option>
                      <option value="Desktop">Desktop</option>
                      <option value="Jetson">Jetson</option>
                      <option value="API/Bot">API/Bot</option>
                    </select>
                  </FilterGroup>
                  
                  <FilterGroup style={{minWidth: '280px'}}>
                    <label className="label">Date Range:</label>
                    <StyledDatePickerWrapper>
                      <DatePicker
                        selected={startDate}
                        onChange={handleDateRangeChange}
                        startDate={startDate}
                        endDate={endDate}
                        selectsRange
                        placeholderText="Select date range..."
                        dateFormat="MMM d, yyyy"
                        isClearable={startDate || endDate ? true : false}
                        maxDate={new Date()}
                        showPopperArrow={false}
                        withPortal={window.innerWidth < 768}
                        portalId="date-picker-portal"
                        popperProps={{
                          strategy: "fixed"
                        }}
                      />
                    </StyledDatePickerWrapper>
                  </FilterGroup>
                </div>
                
                <div style={{display: 'flex', gap: '10px', alignItems: 'end', marginLeft: 'auto'}}>
                  <button 
                    onClick={clearFilters}
                    style={{
                      padding: '8px 12px',
                      background: '#444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      height: '32px'
                    }}
                  >
                    <i className="fas fa-times" />
                    Clear Filters
                  </button>
                  
                  <DropdownExportContainer className="dropdown-export-container">
                    <DropdownExportButton 
                      onClick={toggleExportDropdown} 
                      className={isExportDropdownOpen ? 'open' : ''}
                      style={{height: '32px', fontSize: '13px'}}
                    >
                      <i className="fas fa-download" />
                      Export Data
                      <i className={`fas fa-chevron-down chevron`} />
                    </DropdownExportButton>
                    <DropdownExportMenu className="dropdown-export-menu" $isOpen={isExportDropdownOpen}>
                      <DropdownExportItem onClick={() => handleDropdownExport('csv')}>
                        <i className="fas fa-file-csv" />
                        CSV
                      </DropdownExportItem>
                      <DropdownExportItem onClick={() => handleDropdownExport('json')}>
                        <i className="fas fa-file-code" />
                        JSON
                      </DropdownExportItem>
                      <DropdownExportItem onClick={() => handleDropdownExport('txt')}>
                        <i className="fas fa-file-alt" />
                        TXT
                      </DropdownExportItem>
                      {viewMode === 'chart' && (
                        <DropdownExportItem onClick={handleExportChartsAsImage}>
                          <i className="fas fa-image" />
                          Charts as PNG
                        </DropdownExportItem>
                      )}
                    </DropdownExportMenu>
                  </DropdownExportContainer>
                </div>
              </FilterRow>
            </FilterSection>

            {analyticsLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: '24px', color: '#00ff88' }} />
                <p style={{ marginTop: '16px', color: '#ffffff' }}>Loading analytics...</p>
              </div>
            ) : (
              <>
                {viewMode === 'table' ? (
                  /* Table View */
                  <>
                    {/* Logs Table */}
                    <Table>
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Model</th>
                          <th>Client IP</th>
                          <th>Device</th>
                          <th>Device ID</th>
                          <th>Framework</th>
                          <th>Image Size</th>
                          <th>Predictions</th>
                          <th>Avg Confidence</th>
                          <th>Processing Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                    {inferenceLogs.length === 0 ? (
                      <tr>
                        <td colSpan={11} style={{ textAlign: 'center', padding: '40px' }}>
                          No inference logs found
                        </td>
                      </tr>
                    ) : (
                      inferenceLogs.map((log) => (
                        <ClickableTableRow key={log.id} onClick={() => handleRowClick(log)}>
                          <td>{new Date(log.timestamp).toLocaleString()}</td>
                          <td>{log.model_id}</td>
                          <td>{log.client_ip}</td>
                          <td>
                            <DeviceTag deviceType={log.device_info || 'Unknown'}>
                              <i className={getDeviceIcon(log.device_info || 'Unknown')} />
                              {log.device_info || 'Unknown'}
                            </DeviceTag>
                          </td>
                          <td style={{fontFamily: 'monospace', fontSize: '11px'}}>
                            {log.device_id || 'N/A'}
                          </td>
                          <td>{log.framework || 'N/A'}</td>
                          <td>{log.image_size || 'N/A'}</td>
                          <td>{log.predictions_count || 0}</td>
                          <td>
                            {log.confidence_avg ? (
                              <PerformanceIndicator 
                                performance={log.confidence_avg > 0.8 ? 'high' : log.confidence_avg > 0.5 ? 'medium' : 'low'}
                              >
                                {(log.confidence_avg * 100).toFixed(1)}%
                              </PerformanceIndicator>
                            ) : 'N/A'}
                          </td>
                          <td>{log.processing_time ? `${log.processing_time.toFixed(3)}s` : 'N/A'}</td>
                          <td>
                            <StatusIndicator status={log.status || 'success'}>
                              {log.status || 'success'}
                              <StatusTooltip>
                                {getStatusDescription(log.status || 'success')}
                              </StatusTooltip>
                            </StatusIndicator>
                          </td>
                        </ClickableTableRow>
                      ))
                    )}
                  </tbody>
                </Table>

                {/* Pagination */}
                {pagination.pages > 1 && (
                  <Pagination>
                    <PaginationButton
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                    >
                      <i className="fas fa-chevron-left" />
                      Previous
                    </PaginationButton>
                    <span className="pagination-info">
                      Page {pagination.page} of {pagination.pages} ({pagination.total} total)
                    </span>
                    <PaginationButton
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.pages}
                    >
                      Next
                      <i className="fas fa-chevron-right" />
                    </PaginationButton>
                  </Pagination>
                )}
                  </>
                ) : (
                  /* Chart View */
                  <div className="charts-section" style={{ padding: '24px' }}>
                    {inferenceLogs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '60px' }}>
                        <i className="fas fa-chart-line" style={{ fontSize: '48px', color: '#666', marginBottom: '16px' }} />
                        <h3 style={{ color: '#ffffff', marginBottom: '8px' }}>No Data to Visualize</h3>
                        <p style={{ color: '#999' }}>No inference logs found for the selected filters.</p>
                      </div>
                    ) : (
                      <>
                        {/* Summary Stats */}
                        <ChartStats>
                          <div className="stat">
                            <span className="value">{new Set(inferenceLogs.map(log => log.model_id)).size}</span>
                            <span className="label">Unique Models</span>
                          </div>
                          <div className="stat">
                            <span className="value">{new Set(inferenceLogs.map(log => log.client_ip)).size}</span>
                            <span className="label">Unique IPs</span>
                          </div>
                          <div className="stat">
                            <span className="value">
                              {Math.round(inferenceLogs.reduce((sum, log) => {
                                const timeStr = String(log.processing_time || '0');
                                const time = parseFloat(timeStr.replace('ms', '') || '0');
                                return sum + time;
                              }, 0) / inferenceLogs.length)}ms
                            </span>
                            <span className="label">Avg Processing Time</span>
                          </div>
                        </ChartStats>

                        {/* Main Charts Grid */}
                        <ChartGrid>
                          {/* Timeline Chart */}
                          <ChartCard>
                            <h3>
                              <i className="fas fa-chart-line" />
                              Inference Timeline
                            </h3>
                            <div style={{ height: '380px', position: 'relative' }}>
                              <Line data={prepareTimelineData()} options={chartOptions} />
                            </div>
                          </ChartCard>

                          {/* Device Types Pie Chart */}
                          <ChartCard>
                            <h3>
                              <i className="fas fa-mobile-alt" />
                              Device Distribution
                            </h3>
                            <div style={{ height: '380px', position: 'relative' }}>
                              <Doughnut data={prepareDeviceTypeData()} options={doughnutOptions} />
                            </div>
                          </ChartCard>
                        </ChartGrid>

                        {/* Model Usage Chart */}
                        <ChartCard style={{ marginBottom: '32px' }}>
                          <h3>
                            <i className="fas fa-robot" />
                            Top Model Performance
                          </h3>
                          <div style={{ height: '420px', position: 'relative' }}>
                            <Bar data={prepareModelUsageData()} options={chartOptions} />
                          </div>
                        </ChartCard>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </AnalyticsContainer>
        </TabContent>
      </TabSection>
      
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
                      {pred.bbox ? 
                        `${Math.round(pred.bbox.x)}, ${Math.round(pred.bbox.y)}` : 'N/A'}
                    </div>
                  </div>
                  <div className="tooltip-stat">
                    <div className="label">Size (W,H)</div>
                    <div className="value">
                      {pred.bbox ? 
                        `${Math.round(pred.bbox.width)}, ${Math.round(pred.bbox.height)}` : 'N/A'}
                    </div>
                  </div>
                  <div className="tooltip-stat">
                    <div className="label">Top-Left (X,Y)</div>
                    <div className="value">
                      {pred.bbox ? 
                        `${Math.round(pred.bbox.x - pred.bbox.width / 2)}, ${Math.round(pred.bbox.y - pred.bbox.height / 2)}` : 'N/A'}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </HoverTooltip>
      )}
      
      {/* Log Details Modal */}
      {isModalOpen && createPortal(
        <Modal $isOpen={isModalOpen} onClick={closeModal}>
        <ModalContent onClick={(e) => e.stopPropagation()}>
          <ModalCloseButton onClick={closeModal}>
            <i className="fas fa-times" />
          </ModalCloseButton>
          
          {selectedLogForModal && (
            <>
              <ModalHeader>
                <h3>
                  <i className="fas fa-analytics" />
                  Inference Log Details
                  <span style={{fontSize: '14px', fontWeight: 'normal', color: '#666', marginLeft: '12px'}}>
                    #{selectedLogForModal.id}
                  </span>
                </h3>
              </ModalHeader>
              
              <ModalBody>
                <DetailGrid>
                  <DetailCard>
                    <h4>
                      <i className="fas fa-info-circle" />
                      Basic Information
                    </h4>
                    <DetailRow>
                      <span className="label">Log ID</span>
                      <span className="value">#{selectedLogForModal.id}</span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">Timestamp</span>
                      <span className="value">{new Date(selectedLogForModal.timestamp).toLocaleString()}</span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">Model Used</span>
                      <span className="value">{selectedLogForModal.model_id}</span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">Status</span>
                      <span className="value">
                        <StatusIndicator status={selectedLogForModal.status || 'success'}>
                          {selectedLogForModal.status || 'success'}
                          <StatusTooltip>
                            {getStatusDescription(selectedLogForModal.status || 'success')}
                          </StatusTooltip>
                        </StatusIndicator>
                      </span>
                    </DetailRow>
                  </DetailCard>
                  
                  <DetailCard>
                    <h4>
                      <i className="fas fa-network-wired" />
                      Client Information
                    </h4>
                    <DetailRow>
                      <span className="label">IP Address</span>
                      <span className="value">{selectedLogForModal.client_ip}</span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">Session ID</span>
                      <span className="value">{selectedLogForModal.session_id || 'N/A'}</span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">User Agent</span>
                      <span className="value">{selectedLogForModal.user_agent || 'N/A'}</span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">Device Info</span>
                      <span className="value">
                        <DeviceTag deviceType={selectedLogForModal.device_info || 'Unknown'}>
                          <i className={getDeviceIcon(selectedLogForModal.device_info || 'Unknown')} />
                          {selectedLogForModal.device_info || 'Unknown'}
                        </DeviceTag>
                      </span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">Device ID</span>
                      <span className="value" style={{fontFamily: 'monospace', fontSize: '12px', display: 'flex', alignItems: 'center'}}>
                        {selectedLogForModal.device_id ? (
                          <>
                            {selectedLogForModal.device_id}
                            <SmallCopyButton 
                              onClick={() => copyToClipboard(selectedLogForModal.device_id!)}
                              title="Copy device ID"
                            >
                              <i className="fas fa-copy" />
                            </SmallCopyButton>
                          </>
                        ) : 'N/A'}
                      </span>
                    </DetailRow>
                  </DetailCard>
                  
                  <DetailCard>
                    <h4>
                      <i className="fas fa-cogs" />
                      Technical Details
                    </h4>
                    <DetailRow>
                      <span className="label">Framework</span>
                      <span className="value">{selectedLogForModal.framework || 'N/A'}</span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">Processing Time</span>
                      <span className="value">
                        {selectedLogForModal.processing_time ? 
                          `${selectedLogForModal.processing_time.toFixed(3)}s` : 
                          selectedLogForModal.inference_time ? 
                          `${(selectedLogForModal.inference_time * 1000).toFixed(1)}ms` : 'N/A'}
                      </span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">Image Size</span>
                      <span className="value">{selectedLogForModal.image_size || 'N/A'}</span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">Image Hash</span>
                      <span className="value" style={{fontFamily: 'monospace', fontSize: '12px', display: 'flex', alignItems: 'center'}}>
                        {selectedLogForModal.image_hash ? (
                          <>
                            {selectedLogForModal.image_hash.slice(0, 16) + '...'}
                            <SmallCopyButton 
                              onClick={() => copyHashToClipboard(selectedLogForModal.image_hash!)}
                              title="Copy full hash"
                            >
                              <i className="fas fa-copy" />
                            </SmallCopyButton>
                          </>
                        ) : 'N/A'}
                      </span>
                    </DetailRow>
                  </DetailCard>
                  
                  <DetailCard>
                    <h4>
                      <i className="fas fa-chart-bar" />
                      Results Summary
                    </h4>
                    <DetailRow>
                      <span className="label">Predictions Count</span>
                      <span className="value">{selectedLogForModal.predictions_count || 0}</span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">Average Confidence</span>
                      <span className="value">
                        {selectedLogForModal.confidence_avg ? (
                          <PerformanceIndicator 
                            performance={selectedLogForModal.confidence_avg > 0.8 ? 'high' : selectedLogForModal.confidence_avg > 0.5 ? 'medium' : 'low'}
                          >
                            {(selectedLogForModal.confidence_avg * 100).toFixed(1)}%
                          </PerformanceIndicator>
                        ) : 'N/A'}
                      </span>
                    </DetailRow>
                    <DetailRow>
                      <span className="label">Result Status</span>
                      <span className="value">
                        {selectedLogForModal.result ? 'Results Available' : 'No Results'}
                      </span>
                    </DetailRow>
                  </DetailCard>
                </DetailGrid>
                
                {selectedLogForModal.result && (
                  <DetailCard style={{marginTop: '24px', gridColumn: '1 / -1'}}>
                    <h4 style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                      <span style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                        <i className="fas fa-code" />
                        Raw Result Data
                        <span style={{
                          fontSize: '12px', 
                          fontWeight: 'normal', 
                          color: '#666',
                          background: 'rgba(118, 185, 0, 0.1)',
                          padding: '2px 8px',
                          borderRadius: '12px'
                        }}>
                          JSON
                        </span>
                      </span>
                      <CodeHeaderCopyIcon 
                        onClick={() => copyRawDataToClipboard(selectedLogForModal)}
                        title="Copy raw JSON data to clipboard"
                      >
                        <i className="fas fa-copy" />
                      </CodeHeaderCopyIcon>
                    </h4>
                    <pre style={{
                      background: '#1a1a1a',
                      padding: '20px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      overflow: 'auto',
                      maxHeight: '300px',
                      color: '#00ff88',
                      fontFamily: 'JetBrains Mono, Consolas, Monaco, monospace',
                      lineHeight: '1.5',
                      border: '1px solid #333',
                      scrollbarWidth: 'thin',
                      scrollbarColor: '#666 #1a1a1a'
                    }}>
                      {JSON.stringify(selectedLogForModal.result, null, 2)}
                    </pre>
                  </DetailCard>
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>,
      document.body
      )}
    </Container>
  );
};

export default InferenceSection;