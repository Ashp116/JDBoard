import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { ModelsSectionProps } from '../types';
import { getBackendUrl } from '../utils/api';
import { useNotifications } from '../contexts/NotificationContext';

// Model-related interfaces
interface ModelInfo {
  id: string;
  name: string;
  type: string;
  framework: string;
  file_path: string;
  file_size: number;
  loaded?: boolean;
  status?: string;
  upload_date?: string;
}

interface YOLOModelOption {
  name: string;
  size: string;
  description: string;
  url: string;
  formats: string[];
  parameters?: string;
  accuracy?: string;
}

interface YOLOVersion {
  version: string;
  description: string;
  models: YOLOModelOption[];
}

const Container = styled.div`
  padding: 30px;
  
  ${props => props.theme.media.mobile} {
    padding: 15px;
  }
  
  @media (max-width: 480px) {
    padding: 10px;
  }
`;

const SectionHeader = styled.div`
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;

  ${props => props.theme.media.mobile} {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
    margin-bottom: 20px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 24px;
    margin: 0;
    font-family: ${props => props.theme.fonts.display};
    flex-shrink: 0;

    ${props => props.theme.media.mobile} {
      font-size: 20px;
      gap: 8px;
    }

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const SearchAndActions = styled.div`
  display: flex;
  align-items: center;
  gap: 15px;
  
  ${props => props.theme.media.mobile} {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    width: 100%;
  }
`;

const SearchContainer = styled.div`
  position: relative;
  width: 300px;
  
  ${props => props.theme.media.tablet} {
    width: 250px;
  }
  
  ${props => props.theme.media.mobile} {
    width: 100%;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 12px 40px 12px 12px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 6px;
  background: ${props => props.theme.colors.background.secondary};
  color: ${props => props.theme.colors.text.primary};
  font-size: 14px;
  transition: all 0.3s ease;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
    box-shadow: 0 0 0 2px rgba(118, 185, 0, 0.2);
  }

  &::placeholder {
    color: ${props => props.theme.colors.text.muted};
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: ${props => props.theme.colors.text.muted};
  pointer-events: none;

  i {
    font-size: 14px;
  }
`;

const ClearSearch = styled.button`
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: ${props => props.theme.colors.text.muted};
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
  transition: all 0.2s ease;

  &:hover {
    color: ${props => props.theme.colors.text.primary};
    background: rgba(118, 185, 0, 0.1);
  }

  i {
    font-size: 12px;
  }
`;

const DownloadsSection = styled.div`
  margin-bottom: 20px;
`;

const DownloadCard = styled.div`
  background: ${props => props.theme.gradients.card};
  border: 1px solid ${props => props.theme.colors.nvidia.green};
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  
  ${props => props.theme.media.mobile} {
    padding: 10px;
    gap: 6px;
  }
`;

const CancelButton = styled.button`
  background: ${props => props.theme.colors.status.error};
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 55px;
  
  ${props => props.theme.media.mobile} {
    padding: 10px 16px;
    font-size: 12px;
    min-width: 70px;
  }

  &:hover {
    background: #d32f2f;
    transform: translateY(-1px);
    
    ${props => props.theme.media.mobile} {
      transform: none;
    }
  }

  &:active {
    transform: translateY(0);
  }

  i {
    margin-right: 4px;
  }
`;

const DownloadHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const DownloadContent = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 40px;
  
  ${props => props.theme.media.mobile} {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    min-height: auto;
  }
`;

const DownloadActions = styled.div`
  display: flex;
  gap: 8px;
  margin-left: auto;
  
  ${props => props.theme.media.mobile} {
    margin-left: 0;
    margin-top: 8px;
    justify-content: center;
    gap: 12px;
  }
`;

const LogsSection = styled.div<{ $expanded: boolean }>`
  border-top: 1px solid ${props => props.theme.colors.border.secondary};
  padding-top: 8px;
  margin-top: 4px;
  transition: all 0.3s ease;
  max-height: ${props => props.$expanded ? '350px' : '0'};
  overflow: hidden;
  opacity: ${props => props.$expanded ? 1 : 0};
`;

const LogsTerminal = styled.div`
  background: #1e1e1e;
  border: 1px solid #404040;
  border-radius: 4px;
  height: 250px;
  padding: 6px;
  overflow-y: auto;
  font-family: 'Courier New', monospace;
  font-size: 10px;
  line-height: 1.2;
  
  /* Terminal-like scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: #2d2d2d;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: #777;
  }
`;

const LogsHeaderInline = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  padding: 2px 0;
  
  h4 {
    margin: 0;
    color: ${props => props.theme.colors.nvidia.green};
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 4px;
    
    i {
      color: #00ff00;
    }
  }
`;

const DownloadIcon = styled.div`
  color: ${props => props.theme.colors.nvidia.green};
  font-size: 18px;
  animation: spin 1s linear infinite;

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const DownloadInfo = styled.div`
  flex: 1;
  
  h4 {
    margin: 0 0 4px 0;
    color: ${props => props.theme.colors.text.primary};
    font-size: 14px;
    font-weight: 600;
  }
  
  p {
    margin: 0;
    color: ${props => props.theme.colors.text.muted};
    font-size: 12px;
  }
`;

const ProgressBar = styled.div`
  width: 120px;
  height: 4px;
  background: ${props => props.theme.colors.background.secondary};
  border-radius: 2px;
  overflow: hidden;
  
  ${props => props.theme.media.mobile} {
    width: 100%;
    height: 6px;
  }
`;

const ProgressFill = styled.div<{ progress: number }>`
  height: 100%;
  width: ${props => props.progress}%;
  background: linear-gradient(90deg, ${props => props.theme.colors.nvidia.green}, ${props => props.theme.colors.nvidia.lightGreen});
  transition: width 0.3s ease;
`;

const ProgressText = styled.span`
  color: ${props => props.theme.colors.text.secondary};
  font-size: 11px;
  font-weight: 500;
  min-width: 35px;
  text-align: right;
`;

const AddButton = styled.button`
  background: linear-gradient(135deg, ${props => props.theme.colors.nvidia.green}, ${props => props.theme.colors.nvidia.darkGreen});
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
  white-space: nowrap;
  
  ${props => props.theme.media.mobile} {
    width: 100%;
    justify-content: center;
    padding: 14px 20px;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(118, 185, 0, 0.3);
    
    ${props => props.theme.media.mobile} {
      transform: none;
    }
  }

  i {
    font-size: 16px;
  }
`;

const LogsButton = styled.button`
  background: ${props => props.theme.colors.background.tertiary};
  color: ${props => props.theme.colors.text.primary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.3s ease;
  position: relative;
  
  ${props => props.theme.media.mobile} {
    padding: 10px 16px;
    font-size: 14px;
  }

  &:hover {
    background: ${props => props.theme.colors.background.hover};
    border-color: ${props => props.theme.colors.nvidia.green};
  }

  i {
    font-size: 14px;
  }
`;

const LogsDropdown = styled.div<{ $show: boolean }>`
  position: fixed;
  top: auto;
  left: auto;
  z-index: ${props => props.theme.zIndex.modal};
  background: #1e1e1e;
  border: 1px solid #404040;
  border-radius: 4px;
  width: 600px;
  height: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  display: ${props => props.$show ? 'block' : 'none'};
  margin-top: 4px;
  font-family: 'Courier New', monospace;
  backdrop-filter: blur(5px);
  
  ${props => props.theme.media.mobile} {
    width: 90vw;
    height: 300px;
    left: 5vw !important;
    top: 20vh !important;
  }
`;

const LogsHeader = styled.div`
  padding: 8px 12px;
  border-bottom: 1px solid #404040;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #2d2d2d;
  border-radius: 4px 4px 0 0;
  
  h4 {
    margin: 0;
    color: #00ff00;
    font-size: 12px;
    font-weight: 600;
    font-family: 'Courier New', monospace;
  }
`;

const LogsContent = styled.div`
  height: 350px;
  overflow-y: auto;
  padding: 8px;
  background: #1e1e1e;
  border-radius: 0 0 4px 4px;
  
  /* Terminal-like scrollbar */
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: #2d2d2d;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: #777;
  }
`;

const LogEntry = styled.div`
  padding: 2px 4px;
  margin: 1px 0;
  border-radius: 2px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.3;
  background: transparent;
  color: #cccccc;
  white-space: pre-wrap;
  word-break: break-word;
  
  &.info {
    color: #00ff00;
  }
  
  &.error {
    color: #ff4444;
  }
  
  &.warning {
    color: #ffaa00;
  }
  
  &.tensorrt {
    color: #00aaff;
  }
  
  &.debug {
    color: #888888;
  }
`;

const ClearLogsButton = styled.button`
  background: transparent;
  border: 1px solid #555;
  color: #cccccc;
  padding: 2px 6px;
  border-radius: 2px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Courier New', monospace;

  &:hover {
    background: #333;
    color: #ffffff;
    border-color: #777;
  }
`;

const LogsContainer = styled.div`
  position: relative;
`;

const Modal = styled.div<{ $show: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: ${props => props.theme.zIndex.modal};
  display: ${props => props.$show ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  padding: 20px;
  backdrop-filter: blur(5px);
  
  ${props => props.theme.media.mobile} {
    padding: 10px;
    align-items: flex-start;
    padding-top: 20px;
  }
`;

const ModalContent = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 16px;
  max-width: 650px;
  width: 100%;
  max-height: 90vh;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  
  ${props => props.theme.media.mobile} {
    max-width: 100%;
    max-height: 95vh;
    border-radius: 12px;
    margin: 0;
  }
`;

const ModalHeader = styled.div`
  padding: 24px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, ${props => props.theme.colors.background.secondary} 0%, ${props => props.theme.colors.background.primary} 100%);
  flex-shrink: 0;
  border-radius: 16px 16px 0 0;
  
  ${props => props.theme.media.mobile} {
    padding: 15px;
    border-radius: 12px 12px 0 0;
  }

  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    
    ${props => props.theme.media.mobile} {
      font-size: 18px;
      gap: 8px;
    }

    i {
      color: ${props => props.theme.colors.nvidia.green};
      font-size: 18px;
      
      ${props => props.theme.media.mobile} {
        font-size: 16px;
      }
    }
  }
`;

const CloseButton = styled.button`
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
  
  ${props => props.theme.media.mobile} {
    padding: 15px;
    border-radius: 0 0 12px 12px;
  }

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
`;

const OptionTabs = styled.div`
  display: flex;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  margin-bottom: 25px;
`;

const Tab = styled.button<{ $active: boolean }>`
  background: none;
  border: none;
  padding: 12px 20px;
  color: ${props => props.$active ? props.theme.colors.nvidia.green : props.theme.colors.text.secondary};
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  border-bottom: 2px solid ${props => props.$active ? props.theme.colors.nvidia.green : 'transparent'};
  transition: all 0.3s ease;
  flex: 1;
  
  ${props => props.theme.media.mobile} {
    padding: 10px 15px;
    font-size: 13px;
  }

  &:hover {
    color: ${props => props.theme.colors.text.primary};
  }
`;

const UploadArea = styled.div<{ $dragOver: boolean }>`
  border: 2px dashed ${props => props.$dragOver ? props.theme.colors.nvidia.green : props.theme.colors.border.secondary};
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  background: ${props => props.$dragOver ? 'rgba(118, 185, 0, 0.1)' : props.theme.colors.background.tertiary};
  transition: all 0.3s ease;
  cursor: pointer;
  margin-bottom: 20px;
  
  ${props => props.theme.media.mobile} {
    padding: 25px 15px;
  }

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    background: rgba(118, 185, 0, 0.1);
  }

  i {
    font-size: 48px;
    color: ${props => props.theme.colors.nvidia.green};
    margin-bottom: 15px;
  }

  h4 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 8px 0;
  }

  p {
    color: ${props => props.theme.colors.text.secondary};
    margin: 0;
    font-size: 14px;
  }
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const YOLOGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
  
  ${props => props.theme.media.tablet} {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
  
  ${props => props.theme.media.mobile} {
    grid-template-columns: 1fr;
    gap: 12px;
  }
`;

const YOLOCard = styled.div`
  background: ${props => props.theme.colors.background.tertiary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    transform: translateY(-2px);
  }

  h4 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 8px 0;
    font-size: 16px;
  }

  .size {
    color: ${props => props.theme.colors.nvidia.green};
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .description {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 13px;
    line-height: 1.4;
    margin-bottom: 12px;
  }

  .formats {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .format-tag {
    background: ${props => props.theme.colors.nvidia.green};
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 500;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 20px;

  label {
    display: block;
    color: ${props => props.theme.colors.text.primary};
    margin-bottom: 8px;
    font-weight: 500;
  }

  input, select, textarea {
    width: 100%;
    padding: 10px 12px;
    background: ${props => props.theme.colors.background.tertiary};
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 6px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 14px;

    &:focus {
      outline: none;
      border-color: ${props => props.theme.colors.nvidia.green};
    }

    &.error {
      border-color: #ff6b6b;
      background: rgba(255, 107, 107, 0.1);
    }
  }

  textarea {
    resize: vertical;
    min-height: 80px;
  }
`;

const ErrorMessage = styled.div`
  color: #ff6b6b;
  font-size: 12px;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;

  i {
    font-size: 10px;
  }
`;

const FormatSelector = styled.div`
  margin-top: 15px;

  label {
    color: ${props => props.theme.colors.text.primary};
    margin-bottom: 8px;
    font-weight: 500;
    display: block;
  }

  .format-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 8px;
    
    ${props => props.theme.media.mobile} {
      grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
      gap: 6px;
    }
  }

  .format-option {
    padding: 8px 12px;
    background: ${props => props.theme.colors.background.tertiary};
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 6px;
    cursor: pointer;
    text-align: center;
    font-size: 13px;
    transition: all 0.2s ease;

    &:hover {
      border-color: ${props => props.theme.colors.nvidia.green};
    }

    &.selected {
      background: ${props => props.theme.colors.nvidia.green};
      color: white;
      border-color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const VersionSelector = styled.div`
  margin-bottom: 20px;

  label {
    display: block;
    color: ${props => props.theme.colors.text.primary};
    margin-bottom: 8px;
    font-weight: 500;
  }

  select {
    width: 100%;
    padding: 10px 12px;
    background: ${props => props.theme.colors.background.tertiary};
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 6px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 14px;

    &:focus {
      outline: none;
      border-color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const ModelSizeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 15px;
  
  ${props => props.theme.media.tablet} {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
  
  ${props => props.theme.media.mobile} {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
  }
`;

const ModelSizeCard = styled.div<{ selected?: boolean }>`
  background: ${props => props.selected ? props.theme.colors.nvidia.green : props.theme.colors.background.tertiary};
  color: ${props => props.selected ? 'white' : props.theme.colors.text.primary};
  border: 1px solid ${props => props.selected ? props.theme.colors.nvidia.green : props.theme.colors.border.secondary};
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    ${props => !props.selected && `background: ${props.theme.colors.background.secondary};`}
  }

  .model-name {
    font-weight: bold;
    margin-bottom: 4px;
  }

  .model-size {
    font-size: 12px;
    opacity: 0.8;
    margin-bottom: 4px;
  }

  .model-params {
    font-size: 11px;
    opacity: 0.7;
  }

  .model-accuracy {
    font-size: 11px;
    opacity: 0.7;
    margin-top: 2px;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 25px;
  padding-top: 20px;
  border-top: 1px solid ${props => props.theme.colors.border.secondary};
  
  ${props => props.theme.media.mobile} {
    flex-direction: column-reverse;
    gap: 8px;
  }
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  
  ${props => props.theme.media.mobile} {
    padding: 12px 20px;
    width: 100%;
    justify-content: center;
  }

  ${props => props.variant === 'primary' ? `
    background: ${props.theme.colors.nvidia.green};
    color: white;
    border: none;

    &:hover {
      background: ${props.theme.colors.nvidia.darkGreen};
    }
  ` : `
    background: transparent;
    color: ${props.theme.colors.text.secondary};
    border: 1px solid ${props.theme.colors.border.secondary};

    &:hover {
      background: ${props.theme.colors.background.tertiary};
      color: ${props.theme.colors.text.primary};
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ModelsList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  
  ${props => props.theme.media.tablet} {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 15px;
  }
  
  ${props => props.theme.media.mobile} {
    grid-template-columns: 1fr;
    gap: 15px;
  }
`;

const ModelCard = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.primary};
  border-radius: 8px;
  padding: 20px;
  transition: all 0.3s ease;

  ${props => props.theme.media.mobile} {
    padding: 15px;
  }
  
  @media (max-width: 480px) {
    padding: 12px;
  }

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    transform: translateY(-2px);
    
    ${props => props.theme.media.mobile} {
      transform: none;
    }
  }

  .model-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 15px;
    
    ${props => props.theme.media.mobile} {
      flex-direction: column;
      gap: 8px;
    }

    h4 {
      color: ${props => props.theme.colors.text.primary};
      margin: 0;
      font-size: 16px;
      flex: 1;
      margin-right: 10px;
      
      ${props => props.theme.media.mobile} {
        margin-right: 0;
        font-size: 15px;
      }
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      
      ${props => props.theme.media.mobile} {
        align-self: flex-end;
        gap: 6px;
      }
    }

    .status {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      flex-shrink: 0;

      &.loaded {
        background: ${props => props.theme.colors.nvidia.green};
        color: white;
      }

      &.unloaded {
        background: ${props => props.theme.colors.background.tertiary};
        color: ${props => props.theme.colors.text.secondary};
      }
    }

    .edit-header {
      background: transparent;
      border: 1px solid ${props => props.theme.colors.border.secondary};
      border-radius: 4px;
      color: ${props => props.theme.colors.text.secondary};
      cursor: pointer;
      font-size: 12px;
      padding: 6px 8px;
      transition: all 0.2s ease;
      min-width: 32px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.7;

      &:hover {
        background: ${props => props.theme.colors.background.hover};
        border-color: ${props => props.theme.colors.nvidia.green};
        color: ${props => props.theme.colors.text.primary};
        opacity: 1;
      }

      &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
        
        &:hover {
          background: transparent;
          border-color: ${props => props.theme.colors.border.secondary};
          color: ${props => props.theme.colors.text.secondary};
          opacity: 0.3;
        }
      }
    }
  }

  .model-info {
    margin-bottom: 15px;

    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 12px;

      .label {
        color: ${props => props.theme.colors.text.secondary};
      }

      .value {
        color: ${props => props.theme.colors.text.primary};
        font-family: 'Courier New', monospace;
      }
    }
  }

  .model-actions {
    display: flex;
    gap: 8px;
    
    ${props => props.theme.media.mobile} {
      flex-direction: column;
      gap: 6px;
    }
    
    @media (max-width: 480px) {
      gap: 4px;
    }

    button {
      flex: 1;
      padding: 8px 12px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s ease;
      
      ${props => props.theme.media.mobile} {
        padding: 10px 12px;
        font-size: 13px;
        min-height: 40px;
      }

      &.load {
        background: ${props => props.theme.colors.nvidia.green};
        color: white;
        border: none;

        &:hover {
          background: ${props => props.theme.colors.nvidia.darkGreen};
        }
      }

      &.unload {
        background: ${props => props.theme.colors.status.warning};
        color: white;
        border: none;

        &:hover {
          background: #e0a800;
        }
      }

      &.force-reload {
        background: #6c757d;
        color: white;
        border: none;
        font-size: 11px;

        &:hover {
          background: #5a6268;
        }
      }

      &.delete {
        background: ${props => props.theme.colors.status.error};
        color: white;
        border: none;

        &:hover {
          background: #c82333;
        }
      }

      &.edit {
        background: ${props => props.theme.colors.background.tertiary};
        color: ${props => props.theme.colors.text.secondary};
        border: 1px solid ${props => props.theme.colors.border.secondary};
        flex: none;
        min-width: 40px;
        padding: 8px 10px;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: ${props => props.theme.colors.background.hover};
          border-color: ${props => props.theme.colors.nvidia.green};
          color: ${props => props.theme.colors.text.primary};
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          
          &:hover {
            background: ${props => props.theme.colors.background.tertiary};
            border-color: ${props => props.theme.colors.border.secondary};
            color: ${props => props.theme.colors.text.secondary};
          }
        }
      }
    }
  }
`;

const EditNameContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  margin-right: 10px;
`;

const EditNameInputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const EditNameInput = styled.input`
  background: ${props => props.theme.colors.background.tertiary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 4px;
  color: ${props => props.theme.colors.text.primary};
  font-size: 14px;
  font-weight: 600;
  padding: 8px 10px;
  flex: 1;
  
  ${props => props.theme.media.mobile} {
    font-size: 13px;
    padding: 10px;
  }

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
  }

  &.error {
    border-color: #ff6b6b;
    background: rgba(255, 107, 107, 0.1);
  }
`;

const EditNameError = styled.div`
  color: #ff6b6b;
  font-size: 11px;
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;

  i {
    font-size: 10px;
  }
`;

const EditActionsContainer = styled.div`
  display: flex;
  gap: 4px;

  button {
    background: ${props => props.theme.colors.background.tertiary};
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 4px;
    color: ${props => props.theme.colors.text.secondary};
    cursor: pointer;
    font-size: 12px;
    padding: 8px 10px;
    transition: all 0.2s ease;
    min-width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    
    ${props => props.theme.media.mobile} {
      min-width: 40px;
      height: 40px;
      padding: 10px;
    }

    &:hover {
      background: ${props => props.theme.colors.background.hover};
      border-color: ${props => props.theme.colors.nvidia.green};
      color: ${props => props.theme.colors.text.primary};
    }

    &.save {
      border-color: ${props => props.theme.colors.nvidia.green};
      color: ${props => props.theme.colors.nvidia.green};

      &:hover {
        background: ${props => props.theme.colors.nvidia.green};
        color: white;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        
        &:hover {
          background: ${props => props.theme.colors.background.tertiary};
          border-color: ${props => props.theme.colors.border.secondary};
          color: ${props => props.theme.colors.text.secondary};
        }
      }
    }

    &.cancel:hover {
      background: rgba(255, 107, 107, 0.1);
      border-color: #ff6b6b;
      color: #ff6b6b;
    }
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: ${props => props.theme.colors.text.secondary};
  
  ${props => props.theme.media.mobile} {
    padding: 40px 15px;
  }

  i {
    font-size: 48px;
    color: ${props => props.theme.colors.nvidia.green};
    margin-bottom: 16px;
    opacity: 0.6;
    
    ${props => props.theme.media.mobile} {
      font-size: 36px;
      margin-bottom: 12px;
    }
  }

  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 16px 0 8px;
    
    ${props => props.theme.media.mobile} {
      font-size: 18px;
      margin: 12px 0 6px;
    }
  }
`;

const LoadingSpinner = styled.div`
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid ${props => props.theme.colors.background.tertiary};
  border-radius: 50%;
  border-top-color: ${props => props.theme.colors.nvidia.green};
  animation: spin 1s ease-in-out infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

// YOLO versions and models available for download
const YOLO_VERSIONS: YOLOVersion[] = [
  {
    version: 'YOLOv8',
    description: 'Latest ultralytics YOLO with improved performance and efficiency',
    models: [
      {
        name: 'YOLOv8n',
        size: '6.2MB',
        description: 'Ultra-lightweight model for edge deployment with fastest inference',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '3.2M',
        accuracy: '37.3% mAP'
      },
      {
        name: 'YOLOv8s',
        size: '21.5MB',
        description: 'Small model balancing speed and accuracy for general use',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8s.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '11.2M',
        accuracy: '44.9% mAP'
      },
      {
        name: 'YOLOv8m',
        size: '49.7MB',
        description: 'Medium model with improved accuracy for production environments',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8m.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '25.9M',
        accuracy: '50.2% mAP'
      },
      {
        name: 'YOLOv8l',
        size: '83.7MB',
        description: 'Large model for high-accuracy applications with moderate speed',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8l.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '43.7M',
        accuracy: '52.9% mAP'
      },
      {
        name: 'YOLOv8x',
        size: '136MB',
        description: 'Extra-large model for maximum accuracy in resource-rich scenarios',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8x.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '68.2M',
        accuracy: '53.9% mAP'
      }
    ]
  },
  {
    version: 'YOLOv5',
    description: 'Well-established YOLO version with proven performance and stability',
    models: [
      {
        name: 'YOLOv5n',
        size: '3.9MB',
        description: 'Nano model - smallest and fastest for mobile deployment',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5n.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '1.9M',
        accuracy: '28.0% mAP'
      },
      {
        name: 'YOLOv5s',
        size: '14.1MB',
        description: 'Small model optimized for speed and mobile applications',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5s.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '7.2M',
        accuracy: '37.4% mAP'
      },
      {
        name: 'YOLOv5m',
        size: '42.2MB',
        description: 'Medium model with balanced accuracy and speed',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5m.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '21.2M',
        accuracy: '45.4% mAP'
      },
      {
        name: 'YOLOv5l',
        size: '93.6MB',
        description: 'Large model for high-accuracy detection tasks',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5l.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '46.5M',
        accuracy: '49.0% mAP'
      },
      {
        name: 'YOLOv5x',
        size: '166MB',
        description: 'Extra-large model for maximum detection accuracy',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5x.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '86.7M',
        accuracy: '50.7% mAP'
      }
    ]
  },
  {
    version: 'YOLOv11',
    description: 'Newest YOLO version with cutting-edge performance and features',
    models: [
      {
        name: 'YOLOv11n',
        size: '5.1MB',
        description: 'Nano model with improved efficiency over previous versions',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '2.6M',
        accuracy: '39.5% mAP'
      },
      {
        name: 'YOLOv11s',
        size: '19.4MB',
        description: 'Small model with enhanced accuracy and speed',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11s.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '9.4M',
        accuracy: '47.0% mAP'
      },
      {
        name: 'YOLOv11m',
        size: '49.8MB',
        description: 'Medium model with state-of-the-art performance',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11m.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '20.1M',
        accuracy: '51.5% mAP'
      },
      {
        name: 'YOLOv11l',
        size: '86.9MB',
        description: 'Large model for high-accuracy applications',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11l.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '25.3M',
        accuracy: '53.4% mAP'
      },
      {
        name: 'YOLOv11x',
        size: '56.9MB',
        description: 'Extra-large model with maximum accuracy',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11x.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT'],
        parameters: '56.9M',
        accuracy: '54.7% mAP'
      }
    ]
  }
];

const ModelsSection: React.FC<ModelsSectionProps> = ({ systemData, socket, isConnected }) => {
  const { addNotification, removeNotification, updateNotification } = useNotifications();
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'yolo'>('upload');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [filteredModels, setFilteredModels] = useState<ModelInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  
  // Download tracking states
  const [activeDownloads, setActiveDownloads] = useState<Map<string, { 
    name: string; 
    progress: number; 
    notificationId: string;
    status?: string;
  }>>(new Map());
  
  // File upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState('');
  const [modelType, setModelType] = useState('vision');
  
  // YOLO download states
  const [selectedVersion, setSelectedVersion] = useState<YOLOVersion | null>(null);
  const [selectedYOLO, setSelectedYOLO] = useState<YOLOModelOption | null>(null);
  const [selectedFormat, setSelectedFormat] = useState('PyTorch');
  const [yoloModelName, setYoloModelName] = useState('');
  
  // Validation states
  const [nameError, setNameError] = useState<string>('');
  const [yoloNameError, setYoloNameError] = useState<string>('');
  
  // Logs dropdown states
  const [showLogs, setShowLogs] = useState<Map<string, boolean>>(new Map()); // Per-download logs state
  const [logs, setLogs] = useState<Array<{
    id: string;
    timestamp: string;
    type: 'info' | 'error' | 'warning' | 'tensorrt';
    message: string;
  }>>([]);
  
  // Model editing states
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editNameError, setEditNameError] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Function to restore active downloads on page load/reload
  const restoreActiveDownloads = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/models/active-downloads`);
      const data = await response.json();
      
      if (data.success && data.active_downloads) {
        const restoredDownloads = new Map<string, { 
          name: string; 
          progress: number; 
          notificationId: string;
          status?: string;
        }>();
        const restoredLogsState = new Map<string, boolean>();
        
        // Convert backend format to frontend format
        Object.entries(data.active_downloads).forEach(([downloadId, downloadInfo]: [string, any]) => {
          restoredDownloads.set(downloadId, {
            name: downloadInfo.model_name || 'Unknown Model',
            progress: downloadInfo.progress || 0,
            status: downloadInfo.status || 'In Progress...',
            notificationId: `restored-${downloadId}` // Generate a notification ID for consistency
          });
          
          // Auto-open logs for active downloads to show progress
          restoredLogsState.set(downloadId, true);
        });
        
        if (restoredDownloads.size > 0) {
          setActiveDownloads(restoredDownloads);
          setShowLogs(restoredLogsState); // Restore logs state
          
          console.log(`Restored ${restoredDownloads.size} active downloads:`, Object.fromEntries(restoredDownloads));
          
          // Show notification about restored downloads
          addNotification({
            type: 'info',
            title: 'Downloads Restored',
            message: `Restored ${restoredDownloads.size} active download(s) from previous session`
          });
        }
      }
    } catch (error) {
      console.error('Error restoring active downloads:', error);
      // Don't show error notification for this as it's not critical
    }
  };

  // Load models function (defined early to be available in useEffect dependency arrays)
  const loadModels = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/models/list`);
      const data = await response.json();
      
      if (data.success && Array.isArray(data.models)) {
        setModels(data.models);
      } else {
        console.error('Failed to load models:', data.error);
        setModels([]);
      }
    } catch (error) {
      console.error('Error loading models:', error);
      setModels([]);
    }
  };

  // Logs management functions
  const addLog = (type: 'info' | 'error' | 'warning' | 'tensorrt', message: string) => {
    const newLog = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    };
    
    setLogs(prev => {
      const updated = [...prev, newLog];
      // Keep only the last 100 logs to prevent memory issues
      return updated.slice(-100);
    });
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const toggleLogs = (downloadId: string) => {
    if (!showLogs.get(downloadId)) {
      // Position the dropdown relative to the button
      setTimeout(() => {
        const button = document.querySelector(`[data-logs-button="${downloadId}"]`);
        const dropdown = document.querySelector(`[data-logs-dropdown="${downloadId}"]`);
        if (button && dropdown) {
          const rect = button.getBoundingClientRect();
          const dropdownElement = dropdown as HTMLElement;
          dropdownElement.style.top = `${rect.bottom + 4}px`;
          dropdownElement.style.left = `${rect.left}px`;
        }
      }, 0);
    }
    setShowLogs(prev => {
      const updated = new Map(prev);
      updated.set(downloadId, !updated.get(downloadId));
      return updated;
    });
  };  
  
  // Load models on component mount
  useEffect(() => {
    const initializeComponent = async () => {
      await loadModels();
      await restoreActiveDownloads();
    };
    
    initializeComponent();
  }, []);

  // Listen for real-time download progress updates
  useEffect(() => {
    if (!socket) return () => {};

    const handleDownloadProgress = (data: { 
      download_id: string; 
      progress: number; 
      status: string;
      stage: string;
    }) => {
      updateDownloadProgress(data.download_id, data.progress, data.status);
      
      // Add logs for significant progress updates
      if (data.status) {
        const logType = data.status.toLowerCase().includes('converting') ? 'tensorrt' : 'info';
        addLog(logType, `${data.download_id}: ${data.status}`);
      }
    };

    const handleDownloadComplete = (data: { 
      download_id: string; 
      success: boolean; 
      message?: string;
      model_name?: string;
    }) => {
      completeDownload(data.download_id, data.success, data.message);
      if (data.success) {
        loadModels(); // Refresh models list
        addLog('info', `✅ ${data.model_name || 'Model'} download completed successfully`);
      } else {
        addLog('error', `❌ ${data.model_name || 'Model'} download failed: ${data.message}`);
      }
    };

    const handleDownloadError = (data: { 
      download_id: string; 
      error: string;
    }) => {
      completeDownload(data.download_id, false, data.error);
      addLog('error', `❌ Download ${data.download_id} failed: ${data.error}`);
    };

    const handleDownloadCancelled = (data: { 
      download_id: string; 
    }) => {
      const download = activeDownloads.get(data.download_id);
      if (download) {
        removeNotification(download.notificationId);
        setActiveDownloads(prev => {
          const updated = new Map(prev);
          updated.delete(data.download_id);
          return updated;
        });

        addNotification({
          type: 'info',
          title: 'Download Cancelled',
          message: `${download.name} download has been cancelled`
        });
        
        addLog('warning', `⚠️ ${download.name} download was cancelled`);
      }
    };

    const handleLogMessage = (data: any) => {
      // Add all backend log messages to the logs state for full transparency
      setLogs(prev => {
        const newLogs = [...prev, {
          id: data.id,
          timestamp: data.timestamp,
          type: data.type,
          message: data.raw_log || data.message // Use raw log for full transparency
        }];
        
        // Limit logs to last 500 entries to prevent memory issues
        return newLogs.slice(-500);
      });
    };

    socket.on('download_progress', handleDownloadProgress);
    socket.on('download_complete', handleDownloadComplete);
    socket.on('download_error', handleDownloadError);
    socket.on('download_cancelled', handleDownloadCancelled);
    socket.on('log_message', handleLogMessage);

    return () => {
      socket.off('download_progress', handleDownloadProgress);
      socket.off('download_complete', handleDownloadComplete);
      socket.off('download_error', handleDownloadError);
      socket.off('download_cancelled', handleDownloadCancelled);
      socket.off('log_message', handleLogMessage);
    };
  }, [socket, activeDownloads, removeNotification, addNotification, loadModels]);

  // Filter models based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredModels(models);
    } else {
      const filtered = models.filter(model => 
        model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.framework.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredModels(filtered);
    }
  }, [models, searchQuery]);

  // Search handlers
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  // Download progress management
  const startDownload = (downloadId: string, modelName: string) => {
    const notificationId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    const notification = {
      id: notificationId,
      type: 'info' as const,
      title: 'Downloading Model',
      message: `${modelName} - Initializing download...`,
      persistent: true,
      timestamp: new Date().toISOString()
    };

    addNotification(notification);
    addLog('info', `🚀 Starting download: ${modelName}`);
    
    setActiveDownloads(prev => new Map(prev.set(downloadId, {
      name: modelName,
      progress: 0,
      notificationId
    })));

    return notificationId;
  };

  const updateDownloadProgress = (downloadId: string, progress: number, status?: string) => {
    setActiveDownloads(prev => {
      const download = prev.get(downloadId);
      if (download) {
        const updated = new Map(prev);
        updated.set(downloadId, { 
          ...download, 
          progress, 
          status: status || download.status 
        });
        
        // Update the notification with progress and status
        const message = status || `${download.name} - ${progress}% complete`;
        updateNotification(download.notificationId, {
          message: message
        });
        
        return updated;
      }
      return prev;
    });
  };

  const completeDownload = (downloadId: string, success: boolean, message?: string) => {
    const download = activeDownloads.get(downloadId);
    if (download) {
      // Remove the progress notification
      removeNotification(download.notificationId);
      
      // Remove from active downloads
      setActiveDownloads(prev => {
        const updated = new Map(prev);
        updated.delete(downloadId);
        return updated;
      });

      // Clean up logs state for this download
      setShowLogs(prev => {
        const updated = new Map(prev);
        updated.delete(downloadId);
        return updated;
      });

      // Add completion notification
      addNotification({
        type: success ? 'success' : 'error',
        title: success ? 'Model Ready' : 'Download Failed',
        message: message || `${download.name} ${success ? 'is ready for use!' : 'download failed'}`
      });
    }
  };

  const cancelDownload = async (downloadId: string) => {
    const download = activeDownloads.get(downloadId);
    if (!download) return;

    try {
      // Send cancel request to backend
      const response = await fetch(`${getBackendUrl()}/models/cancel-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ download_id: downloadId })
      });

      const data = await response.json();
      
      if (data.success) {
        // Remove from active downloads immediately
        removeNotification(download.notificationId);
        setActiveDownloads(prev => {
          const updated = new Map(prev);
          updated.delete(downloadId);
          return updated;
        });

        // Clean up logs state for this download
        setShowLogs(prev => {
          const updated = new Map(prev);
          updated.delete(downloadId);
          return updated;
        });

        // Show cancellation notification
        addNotification({
          type: 'info',
          title: 'Download Cancelled',
          message: `${download.name} download has been cancelled and files cleaned up`
        });

        // Refresh models list to reflect any cleanup
        setTimeout(loadModels, 500);
      } else {
        addNotification({
          type: 'warning',
          title: 'Cancel Failed',
          message: data.error || 'Could not cancel download'
        });
      }
    } catch (error) {
      console.error('Error cancelling download:', error);
      addNotification({
        type: 'error',
        title: 'Cancel Error',
        message: 'Failed to cancel download'
      });
    }
  };

  // Validation functions
  const validateModelName = (name: string, isYolo: boolean = false): string => {
    if (!name.trim()) {
      return 'Model name is required';
    }
    
    if (name.length < 2) {
      return 'Model name must be at least 2 characters long';
    }
    
    if (name.length > 50) {
      return 'Model name must be less than 50 characters';
    }
    
    // Check for invalid characters
    if (!/^[a-zA-Z0-9\s\-_\.()]+$/.test(name)) {
      return 'Model name contains invalid characters. Only letters, numbers, spaces, and -_.() are allowed';
    }
    
    // Check for uniqueness (case-insensitive)
    const existingNames = models.map(model => model.name.toLowerCase());
    if (existingNames.includes(name.toLowerCase())) {
      return 'A model with this name already exists. Please choose a different name.';
    }
    
    return '';
  };
  
  const validateAndSetName = (name: string, isYolo: boolean = false) => {
    const error = validateModelName(name, isYolo);
    if (isYolo) {
      setYoloNameError(error);
      setYoloModelName(name);
    } else {
      setNameError(error);
      setModelName(name);
    }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    if (!modelName) {
      // Auto-generate model name from filename
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setModelName(nameWithoutExt);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      // Check if it's a valid model file
      const validExtensions = ['.onnx', '.trt', '.engine', '.pb', '.pth', '.pt'];
      const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      if (validExtensions.includes(fileExt)) {
        handleFileSelect(file);
      } else {
        alert('Please select a valid model file (.onnx, .trt, .engine, .pb, .pth, .pt)');
      }
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !modelName.trim()) {
      addNotification({
        type: 'warning',
        title: 'Missing Information',
        message: 'Please select a file and enter a model name'
      });
      return;
    }

    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    startDownload(uploadId, modelName.trim());
    
    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('model_name', modelName.trim());
      formData.append('model_type', modelType);
      formData.append('download_id', uploadId); // Send download ID to backend

      // Close modal immediately to allow user to continue
      resetModal();

      const response = await fetch(`${getBackendUrl()}/models/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      
      if (!data.success && !data.download_started) {
        // If upload failed immediately (validation error, etc.)
        completeDownload(uploadId, false, data.error || 'Upload failed');
      }
      // If successful or download started, progress will be handled by WebSocket
    } catch (error) {
      console.error('Upload error:', error);
      completeDownload(uploadId, false, 'Upload failed: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const handleYOLODownload = async () => {
    if (!selectedYOLO || !yoloModelName.trim()) {
      addNotification({
        type: 'warning',
        title: 'Missing Information',
        message: 'Please select a YOLO model and enter a name'
      });
      return;
    }

    const downloadId = `yolo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    startDownload(downloadId, yoloModelName.trim()); // Use user-entered name, not template name

    setLoading(true);

    try {
      // Close modal immediately to allow user to continue
      resetModal();

      const response = await fetch(`${getBackendUrl()}/models/download-yolo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model_url: selectedYOLO.url,
          model_name: yoloModelName.trim(),
          target_format: selectedFormat,
          original_format: 'PyTorch',
          download_id: downloadId // Send download ID to backend
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        throw new Error(`Expected JSON response, got: ${contentType}. Response: ${textResponse}`);
      }

      const data = await response.json();

      if (!data.success && !data.download_started) {
        // If download failed immediately (validation error, etc.)
        completeDownload(downloadId, false, data.error || 'Download failed');
      }
      // If successful or download started, progress will be handled by WebSocket
    } catch (error) {
      console.error('Download error:', error);
      completeDownload(downloadId, false, 'Download failed: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const resetYOLOForm = () => {
    setSelectedYOLO(null);
    setSelectedFormat('PyTorch');
    setYoloModelName('');
    setYoloNameError('');
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setModelName('');
    setModelType('vision');
    setNameError('');
  };

  const resetModal = () => {
    resetUploadForm();
    resetYOLOForm();
    setActiveTab('upload');
    setShowModal(false);
  };

  const handleLoadModel = async (modelId: string) => {
    try {
      const response = await fetch(`${getBackendUrl()}/models/${modelId}/load`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.success) {
        await loadModels();
        addNotification({
          type: 'success',
          title: 'Model Loaded',
          message: 'Model loaded successfully!'
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Load Failed',
          message: data.error || 'Failed to load model'
        });
      }
    } catch (error) {
      console.error('Load error:', error);
      addNotification({
        type: 'error',
        title: 'Load Error',
        message: 'Failed to load model'
      });
    }
  };

  const handleForceReloadModel = async (modelId: string) => {
    try {
      const response = await fetch(`${getBackendUrl()}/models/${modelId}/force-reload`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.success) {
        await loadModels();
        addNotification({
          type: 'success',
          title: 'Model Reloaded',
          message: 'Model force reloaded successfully!'
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Reload Failed',
          message: data.error || 'Failed to force reload model'
        });
      }
    } catch (error) {
      console.error('Force reload error:', error);
      addNotification({
        type: 'error',
        title: 'Reload Error',
        message: 'Failed to force reload model'
      });
    }
  };

  const handleUnloadModel = async (modelId: string) => {
    try {
      const response = await fetch(`${getBackendUrl()}/models/${modelId}/unload`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.success) {
        await loadModels();
        addNotification({
          type: 'success',
          title: 'Model Unloaded',
          message: 'Model unloaded successfully!'
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Unload Failed',
          message: data.error || 'Failed to unload model'
        });
      }
    } catch (error) {
      console.error('Unload error:', error);
      addNotification({
        type: 'error',
        title: 'Unload Error',
        message: 'Failed to unload model'
      });
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm('Are you sure you want to delete this model? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`${getBackendUrl()}/models/${modelId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      if (data.success) {
        await loadModels();
        addNotification({
          type: 'success',
          title: 'Model Deleted',
          message: 'Model deleted successfully!'
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Delete Failed',
          message: data.error || 'Failed to delete model'
        });
      }
    } catch (error) {
      console.error('Delete error:', error);
      addNotification({
        type: 'error',
        title: 'Delete Error',
        message: 'Failed to delete model'
      });
    }
  };

  const handleEditModelName = (modelId: string, currentName: string) => {
    setEditingModel(modelId);
    setEditingName(currentName);
    setEditNameError('');
  };

  const handleCancelEdit = () => {
    setEditingModel(null);
    setEditingName('');
    setEditNameError('');
  };

  const validateEditName = (name: string): string => {
    if (!name.trim()) {
      return 'Model name is required';
    }
    
    if (name.length < 2) {
      return 'Model name must be at least 2 characters long';
    }
    
    if (name.length > 50) {
      return 'Model name must be less than 50 characters';
    }
    
    // Check for invalid characters
    if (!/^[a-zA-Z0-9\s\-_\.()]+$/.test(name)) {
      return 'Model name contains invalid characters. Only letters, numbers, spaces, and -_.() are allowed';
    }
    
    // Check for uniqueness (case-insensitive) excluding current model
    const existingNames = models
      .filter(model => model.id !== editingModel)
      .map(model => model.name.toLowerCase());
    if (existingNames.includes(name.toLowerCase())) {
      return 'A model with this name already exists. Please choose a different name.';
    }
    
    return '';
  };

  const handleSaveModelName = async (modelId: string) => {
    const trimmedName = editingName.trim();
    const error = validateEditName(trimmedName);
    
    if (error) {
      setEditNameError(error);
      return;
    }

    try {
      const response = await fetch(`${getBackendUrl()}/models/${modelId}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ new_name: trimmedName })
      });
      
      const data = await response.json();
      if (data.success) {
        await loadModels();
        setEditingModel(null);
        setEditingName('');
        setEditNameError('');
        addNotification({
          type: 'success',
          title: 'Model Renamed',
          message: 'Model name updated successfully!'
        });
      } else {
        setEditNameError(data.error || 'Failed to rename model');
      }
    } catch (error) {
      console.error('Rename error:', error);
      setEditNameError('Failed to rename model');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <Container>
      <SectionHeader>
        <h2>
          <i className="fas fa-brain"></i>
          AI Models
        </h2>
        <SearchAndActions>
          <SearchContainer>
            <SearchInput
              type="text"
              placeholder="Search models by name, type, or framework..."
              value={searchQuery}
              onChange={handleSearchChange}
            />
            {searchQuery ? (
              <ClearSearch onClick={clearSearch}>
                <i className="fas fa-times"></i>
              </ClearSearch>
            ) : (
              <SearchIcon>
                <i className="fas fa-search"></i>
              </SearchIcon>
            )}
          </SearchContainer>
          <AddButton onClick={() => setShowModal(true)}>
            <i className="fas fa-plus"></i>
            Add Model
          </AddButton>
        </SearchAndActions>
      </SectionHeader>

      {/* Active Downloads Section */}
      {activeDownloads.size > 0 && (
        <DownloadsSection>
          {Array.from(activeDownloads.entries()).map(([downloadId, download]) => (
            <DownloadCard key={downloadId}>
              <DownloadContent>
                <DownloadIcon>
                  {download.status && download.status.toLowerCase().includes('convert') ? (
                    <i className="fas fa-cog fa-spin"></i>
                  ) : (
                    <i className="fas fa-download"></i>
                  )}
                </DownloadIcon>
                <DownloadInfo>
                  <h4>{download.name}</h4>
                  <p>{download.status || 'Downloading and processing model...'}</p>
                </DownloadInfo>
                <ProgressBar>
                  <ProgressFill progress={download.progress} />
                </ProgressBar>
                <ProgressText>{download.progress}%</ProgressText>
                <DownloadActions>
                  <LogsButton 
                    data-logs-button={downloadId}
                    onClick={() => toggleLogs(downloadId)}
                  >
                    <i className="fas fa-terminal"></i>
                    Logs
                  </LogsButton>
                  <CancelButton onClick={() => cancelDownload(downloadId)}>
                    <i className="fas fa-times"></i>
                    Cancel
                  </CancelButton>
                </DownloadActions>
              </DownloadContent>
              
              <LogsSection $expanded={showLogs.get(downloadId) || false}>
                <LogsHeaderInline>
                  <h4>
                    <i className="fas fa-terminal"></i>
                    Download & Conversion Logs
                  </h4>
                  <ClearLogsButton onClick={clearLogs}>
                    Clear
                  </ClearLogsButton>
                </LogsHeaderInline>
                <LogsTerminal>
                  {logs.length === 0 ? (
                    <div style={{ 
                      padding: '20px', 
                      textAlign: 'center', 
                      color: '#666',
                      fontStyle: 'italic',
                      fontSize: '12px'
                    }}>
                      No logs yet for this download...
                    </div>
                  ) : (
                    logs.filter(log => log.message.includes(downloadId) || log.message.includes(download.name))
                       .slice().reverse().map(log => (
                      <LogEntry key={log.id} className={log.type}>
                        <span style={{ opacity: 0.7, marginRight: '8px' }}>
                          [{log.timestamp}]
                        </span>
                        {log.message}
                      </LogEntry>
                    ))
                  )}
                  {/* Show all logs if no specific download logs found */}
                  {logs.filter(log => log.message.includes(downloadId) || log.message.includes(download.name)).length === 0 && logs.length > 0 && (
                    logs.slice().reverse().map(log => (
                      <LogEntry key={log.id} className={log.type}>
                        <span style={{ opacity: 0.7, marginRight: '8px' }}>
                          [{log.timestamp}]
                        </span>
                        {log.message}
                      </LogEntry>
                    ))
                  )}
                </LogsTerminal>
              </LogsSection>
            </DownloadCard>
          ))}
        </DownloadsSection>
      )}

      {models.length === 0 ? (
        <EmptyState>
          <i className="fas fa-brain"></i>
          <h3>No Models Found</h3>
          <p>Upload your AI models or download YOLO models to get started with inference</p>
        </EmptyState>
      ) : filteredModels.length === 0 ? (
        <EmptyState>
          <i className="fas fa-search"></i>
          <h3>No Models Match Your Search</h3>
          <p>Try adjusting your search terms or clear the search to see all models</p>
        </EmptyState>
      ) : (
        <ModelsList>
          {filteredModels.map((model) => (
            <ModelCard key={model.id}>
              <div className="model-header">
                {editingModel === model.id ? (
                  <EditNameContainer>
                    <EditNameInputRow>
                      <EditNameInput
                        type="text"
                        value={editingName}
                        className={editNameError ? 'error' : ''}
                        onChange={(e) => {
                          setEditingName(e.target.value);
                          setEditNameError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveModelName(model.id);
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        placeholder="Enter model name"
                        autoFocus
                      />
                      <EditActionsContainer>
                        <button 
                          className="save"
                          onClick={() => handleSaveModelName(model.id)}
                          disabled={!editingName.trim() || !!editNameError}
                        >
                          <i className="fas fa-check"></i>
                        </button>
                        <button 
                          className="cancel"
                          onClick={handleCancelEdit}
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </EditActionsContainer>
                    </EditNameInputRow>
                    {editNameError && (
                      <EditNameError>
                        <i className="fas fa-exclamation-triangle"></i>
                        {editNameError}
                      </EditNameError>
                    )}
                  </EditNameContainer>
                ) : (
                  <>
                    <h4>{model.name}</h4>
                    <div className="header-actions">
                      <span className={`status ${model.loaded ? 'loaded' : 'unloaded'}`}>
                        {model.loaded ? 'Loaded' : 'Not Loaded'}
                      </span>
                      <button 
                        className="edit-header"
                        onClick={() => handleEditModelName(model.id, model.name)}
                        disabled={editingModel !== null}
                        title="Edit model name"
                      >
                        <i className="fas fa-ellipsis-h"></i>
                      </button>
                    </div>
                  </>
                )}
              </div>
              
              <div className="model-info">
                <div className="info-row">
                  <span className="label">Framework:</span>
                  <span className="value">{model.framework}</span>
                </div>
                <div className="info-row">
                  <span className="label">Type:</span>
                  <span className="value">{model.type}</span>
                </div>
                <div className="info-row">
                  <span className="label">Size:</span>
                  <span className="value">{formatFileSize(model.file_size)}</span>
                </div>
                {model.upload_date && (
                  <div className="info-row">
                    <span className="label">Added:</span>
                    <span className="value">{new Date(model.upload_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              <div className="model-actions">
                {!model.loaded ? (
                  <button 
                    className="load"
                    onClick={() => handleLoadModel(model.id)}
                  >
                    Load Model
                  </button>
                ) : (
                  <>
                    <button 
                      className="unload"
                      onClick={() => handleUnloadModel(model.id)}
                    >
                      Unload Model
                    </button>
                    <button 
                      className="force-reload"
                      onClick={() => handleForceReloadModel(model.id)}
                      title="Force reload model (clears any stuck states)"
                    >
                      Force Reload
                    </button>
                  </>
                )}
                <button 
                  className="delete"
                  onClick={() => handleDeleteModel(model.id)}
                >
                  Delete
                </button>
              </div>
            </ModelCard>
          ))}
        </ModelsList>
      )}

      {showModal && createPortal(
        <Modal $show={showModal}>
          <ModalContent>
            <ModalHeader>
              <h3>
                <i className="fas fa-plus"></i>
                Add New Model
              </h3>
              <CloseButton onClick={() => resetModal()}>
                <i className="fas fa-times"></i>
              </CloseButton>
            </ModalHeader>

          <ModalBody>
            <OptionTabs>
              <Tab 
                $active={activeTab === 'upload'} 
                onClick={() => setActiveTab('upload')}
              >
                <i className="fas fa-upload"></i>
                File Upload
              </Tab>
              <Tab 
                $active={activeTab === 'yolo'} 
                onClick={() => setActiveTab('yolo')}
              >
                <i className="fas fa-download"></i>
                YOLO Models
              </Tab>
            </OptionTabs>

            {activeTab === 'upload' && (
              <div>
                <UploadArea
                  $dragOver={dragOver}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <i className="fas fa-cloud-upload-alt"></i>
                  <h4>
                    {selectedFile ? selectedFile.name : 'Drop model file here or click to browse'}
                  </h4>
                  <p>
                    Supported formats: .onnx, .trt, .engine, .pb, .pth, .pt (Max 500MB)
                  </p>
                </UploadArea>

                <HiddenFileInput
                  ref={fileInputRef}
                  type="file"
                  accept=".onnx,.trt,.engine,.pb,.pth,.pt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />

                <FormGroup>
                  <label>Model Name *</label>
                  <input
                    type="text"
                    value={modelName}
                    className={nameError ? 'error' : ''}
                    onChange={(e) => validateAndSetName(e.target.value, false)}
                    placeholder="Enter a descriptive name for your model"
                  />
                  {nameError && (
                    <ErrorMessage>
                      <i className="fas fa-exclamation-triangle"></i>
                      {nameError}
                    </ErrorMessage>
                  )}
                </FormGroup>

                <FormGroup>
                  <label>Model Type</label>
                  <select
                    value={modelType}
                    onChange={(e) => setModelType(e.target.value)}
                  >
                    <option value="vision">Computer Vision</option>
                    {/* <option value="nlp">Natural Language Processing</option>
                    <option value="audio">Audio Processing</option>
                  <option value="other">Other</option> */}
                </select>
              </FormGroup>

              <ActionButtons>
                <Button variant="secondary" onClick={() => resetModal()}>
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  onClick={handleFileUpload}
                  disabled={loading || !selectedFile || !modelName.trim() || !!nameError}
                >
                  {loading ? <LoadingSpinner /> : 'Upload Model'}
                </Button>
              </ActionButtons>
            </div>
          )}

          {activeTab === 'yolo' && (
            <div>
              <VersionSelector>
                <label>YOLO Version *</label>
                <select
                  value={selectedVersion?.version || ''}
                  onChange={(e) => {
                    const version = YOLO_VERSIONS.find(v => v.version === e.target.value);
                    setSelectedVersion(version || null);
                    setSelectedYOLO(null); // Reset model selection when version changes
                    setYoloModelName('');
                  }}
                >
                  <option value="">Select YOLO Version</option>
                  {YOLO_VERSIONS.map((version) => (
                    <option key={version.version} value={version.version}>
                      {version.version} - {version.description}
                    </option>
                  ))}
                </select>
              </VersionSelector>

              {selectedVersion && (
                <>
                  <FormGroup>
                    <label>Model Size *</label>
                    <ModelSizeGrid>
                      {selectedVersion.models.map((model) => (
                        <ModelSizeCard
                          key={model.name}
                          selected={selectedYOLO?.name === model.name}
                          onClick={() => {
                            setSelectedYOLO(model);
                            if (!yoloModelName) {
                              validateAndSetName(model.name, true);
                            }
                          }}
                        >
                          <div className="model-name">{model.name}</div>
                          <div className="model-size">Size: {model.size}</div>
                          {model.parameters && (
                            <div className="model-params">Parameters: {model.parameters}</div>
                          )}
                          {model.accuracy && (
                            <div className="model-accuracy">Accuracy: {model.accuracy}</div>
                          )}
                        </ModelSizeCard>
                      ))}
                    </ModelSizeGrid>
                  </FormGroup>
                </>
              )}

              {selectedYOLO && (
                <>
                  <FormGroup>
                    <label>Model Name *</label>
                    <input
                      type="text"
                      value={yoloModelName}
                      className={yoloNameError ? 'error' : ''}
                      onChange={(e) => validateAndSetName(e.target.value, true)}
                      placeholder="Enter a name for this model instance"
                    />
                    {yoloNameError && (
                      <ErrorMessage>
                        <i className="fas fa-exclamation-triangle"></i>
                        {yoloNameError}
                      </ErrorMessage>
                    )}
                  </FormGroup>

                  <FormatSelector>
                    <label>Target Format</label>
                    <div className="format-grid">
                      {selectedYOLO.formats.map((format) => (
                        <div
                          key={format}
                          className={`format-option ${selectedFormat === format ? 'selected' : ''}`}
                          onClick={() => setSelectedFormat(format)}
                        >
                          {format}
                        </div>
                      ))}
                    </div>
                  </FormatSelector>
                </>
              )}

              <ActionButtons>
                <Button variant="secondary" onClick={() => resetModal()}>
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  onClick={handleYOLODownload}
                  disabled={loading || !selectedYOLO || !yoloModelName.trim() || !!yoloNameError}
                >
                  {loading ? <LoadingSpinner /> : 'Download & Convert'}
                </Button>
              </ActionButtons>
            </div>
          )}
          </ModalBody>
        </ModalContent>
      </Modal>,
      document.body
    )}
    </Container>
  );
};

export default ModelsSection;