import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Tooltip } from 'react-tooltip';
import { ModelsSectionProps } from '../types';
import { getBackendUrl } from '../utils/api';
import { useNotifications } from '../contexts/NotificationContext';
import Modal, { ModalHeader, ModalBody, ModalFooter, ModalCloseButton } from './shared/Modal';

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
  custom_script_path?: string | null;
  inference_handler?: 'default' | 'custom';
  script_status?: 'none' | 'pending' | 'active' | 'failed';
  script_error?: string | null;
  load_problem?: string | null;   // set when the backend can't load this model (missing framework)
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

const CustomScriptSection = styled.div`
  margin-top: 24px;
  margin-bottom: 20px;
  padding: 16px;
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.primary};
  border-radius: 8px;

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${props => props.theme.colors.text.primary};
    margin-bottom: 12px;
    font-weight: 500;

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const ScriptOptions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 12px;

  ${props => props.theme.media.mobile} {
    grid-template-columns: 1fr;
  }
`;

const ScriptOption = styled.div<{ $selected: boolean }>`
  padding: 12px;
  background: ${props => props.$selected ? props.theme.colors.nvidia.green : props.theme.colors.background.tertiary};
  border: 2px solid ${props => props.$selected ? props.theme.colors.nvidia.green : props.theme.colors.border.secondary};
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    transform: translateY(-2px);
  }

  i {
    display: block;
    font-size: 20px;
    margin-bottom: 8px;
    color: ${props => props.$selected ? '#fff' : props.theme.colors.nvidia.green};
  }

  span {
    display: block;
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 4px;
    color: ${props => props.$selected ? '#fff' : props.theme.colors.text.primary};
  }

  small {
    display: block;
    font-size: 11px;
    color: ${props => props.$selected ? 'rgba(255,255,255,0.8)' : props.theme.colors.text.secondary};
  }
`;

const CustomScriptUpload = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;

  .upload-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    background: ${props => props.theme.colors.background.tertiary};
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    color: ${props => props.theme.colors.text.primary};
    transition: all 0.2s ease;

    &:hover {
      border-color: ${props => props.theme.colors.nvidia.green};
      background: ${props => props.theme.colors.background.secondary};
    }

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }

  .remove-button {
    padding: 10px 12px;
    background: #ff6b6b;
    border: none;
    border-radius: 6px;
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: #ff5252;
    }
  }
`;

const ScriptInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(76, 175, 80, 0.1);
  border: 1px solid ${props => props.theme.colors.nvidia.green};
  border-radius: 6px;
  font-size: 13px;
  color: ${props => props.theme.colors.text.secondary};

  i {
    color: ${props => props.theme.colors.nvidia.green};
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
      padding: 10px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      position: relative;
      
      ${props => props.theme.media.mobile} {
        padding: 12px;
        font-size: 13px;
        min-height: 40px;
      }
      
      i {
        font-size: 16px;
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

const LoadingState = styled.div`
  text-align: center;
  padding: 80px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  
  ${props => props.theme.media.mobile} {
    padding: 60px 15px;
  }
`;

const LoadingSpinnerLarge = styled.div`
  width: 50px;
  height: 50px;
  border: 4px solid ${props => props.theme.colors.background.tertiary};
  border-radius: 50%;
  border-top-color: ${props => props.theme.colors.nvidia.green};
  animation: spin 1s ease-in-out infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.div`
  color: ${props => props.theme.colors.text.secondary};
  
  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 8px 0;
    font-size: 20px;
  }
  
  p {
    margin: 0;
    font-size: 14px;
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

const CodeViewerContainer = styled.div`
  background: #1e1e1e;
  border: 1px solid #404040;
  border-radius: 8px;
  overflow: hidden;
  max-height: 600px;
  display: flex;
  flex-direction: column;
`;

const CodeViewerHeader = styled.div`
  background: #2d2d2d;
  padding: 12px 16px;
  border-bottom: 1px solid #404040;
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  h4 {
    margin: 0;
    color: #00ff00;
    font-size: 14px;
    font-family: 'Courier New', monospace;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    
    i {
      color: #76b900;
    }
  }
`;

const CopyButton = styled.button`
  background: transparent;
  border: 1px solid #555;
  color: #cccccc;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Courier New', monospace;
  display: flex;
  align-items: center;
  gap: 6px;

  &:hover {
    background: #333;
    color: #ffffff;
    border-color: #76b900;
  }
  
  i {
    font-size: 11px;
  }
`;

const CodeContent = styled.pre`
  margin: 0;
  padding: 16px;
  overflow: auto;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #d4d4d4;
  background: #1e1e1e;
  flex: 1;
  
  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  
  &::-webkit-scrollbar-track {
    background: #2d2d2d;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 5px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: #777;
  }
  
  /* Syntax highlighting */
  .keyword {
    color: #569cd6;
    font-weight: bold;
  }
  
  .string {
    color: #ce9178;
  }
  
  .comment {
    color: #6a9955;
    font-style: italic;
  }
  
  .function {
    color: #dcdcaa;
  }
  
  .class-name {
    color: #4ec9b0;
  }
  
  .decorator {
    color: #c586c0;
  }
  
  .number {
    color: #b5cea8;
  }
  
  .operator {
    color: #d4d4d4;
  }
  
  .builtin {
    color: #4ec9b0;
  }
`;

const ScriptInfoBanner = styled.div`
  background: rgba(118, 185, 0, 0.1);
  border-left: 3px solid #76b900;
  padding: 12px 16px;
  margin-bottom: 12px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 10px;
  
  i {
    color: #76b900;
    font-size: 16px;
  }
  
  p {
    margin: 0;
    color: ${props => props.theme.colors.text.secondary};
    font-size: 13px;
    line-height: 1.4;
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
  const [fetchingModels, setFetchingModels] = useState(true); // Track initial model fetch
  const [dragOver, setDragOver] = useState(false);
  
  // Download tracking states
  const [activeDownloads, setActiveDownloads] = useState<Map<string, { 
    name: string; 
    progress: number; 
    notificationId: string;
    status?: string;
  }>>(new Map());
  // Always-current view of activeDownloads for socket handlers / async code.
  // Updated synchronously in start/complete so a failure reported in the same
  // tick as the start (or before React re-renders) is never dropped.
  const activeDownloadsRef = useRef(activeDownloads);
  const reportedFailuresRef = useRef<Set<string>>(new Set());
  useEffect(() => { activeDownloadsRef.current = activeDownloads; }, [activeDownloads]);
  
  // File upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState('');
  const [modelType, setModelType] = useState('vision');
  const [customScript, setCustomScript] = useState<File | null>(null);
  // 'default' = built-in handler (no script sent); 'custom' = user-supplied .py
  const [scriptOption, setScriptOption] = useState<'default' | 'custom'>('default');
  
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
  const [originalModelId, setOriginalModelId] = useState('');
  const [editNameError, setEditNameError] = useState('');
  const [showRenameConfirm, setShowRenameConfirm] = useState(false);
  const [pendingRename, setPendingRename] = useState<{modelId: string, newName: string} | null>(null);
  
  // Custom script viewing states
  const [viewingScript, setViewingScript] = useState<{
    modelId: string;
    modelName: string;
    scriptContent: string;
  } | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  
  // Template viewing state
  const [viewingTemplate, setViewingTemplate] = useState(false);
  const [templateContent, setTemplateContent] = useState('');
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsTerminalRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const modalBodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs terminal to bottom when new logs are added
  useEffect(() => {
    // Scroll all visible log terminals to the bottom
    activeDownloads.forEach((_, downloadId) => {
      const terminalElement = logsTerminalRefs.current.get(downloadId);
      if (terminalElement && showLogs.get(downloadId)) {
        terminalElement.scrollTop = terminalElement.scrollHeight;
      }
    });
  }, [logs, activeDownloads, showLogs]);

  // Auto-scroll modal body when YOLO model is selected to show expanded content
  useEffect(() => {
    if (selectedYOLO && modalBodyRef.current) {
      setTimeout(() => {
        modalBodyRef.current?.scrollTo({
          top: modalBodyRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [selectedYOLO]);

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
    } finally {
      setFetchingModels(false);
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
      warning?: string | null;
    }) => {
      const wasTracked = activeDownloadsRef.current.has(data.download_id);
      completeDownload(data.download_id, data.success, data.message,
                       { modelName: data.model_name, warning: data.warning });
      if (data.success) {
        loadModels(); // Refresh models list
        if (wasTracked) addLog('info', `✅ ${data.model_name || 'Model'} download completed successfully`);
      }
    };

    const handleDownloadError = (data: { 
      download_id: string; 
      error: string;
      model_name?: string;
    }) => {
      completeDownload(data.download_id, false, data.error, { modelName: data.model_name });
      loadModels();
    };

    const handleDownloadCancelled = (data: { 
      download_id: string; 
    }) => {
      const download = activeDownloadsRef.current.get(data.download_id);
      if (download) {
        removeNotification(download.notificationId);
        const remaining = new Map(activeDownloadsRef.current);
        remaining.delete(data.download_id);
        activeDownloadsRef.current = remaining;
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
  }, [socket]); // handlers read state through refs, so no re-subscribing mid-download

  // Safety net for missed socket events (reconnects, very fast failures, the
  // socket being down): poll the outcome of every download still shown as active.
  const unknownCountsRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (activeDownloads.size === 0) return () => {};

    const checkDownloads = async () => {
      for (const [downloadId, download] of activeDownloadsRef.current) {
        try {
          const response = await fetch(`${getBackendUrl()}/models/downloads/${encodeURIComponent(downloadId)}/status`);
          if (!response.ok) continue;
          const status = await response.json();
          if (status.state === 'failed') {
            completeDownload(downloadId, false, status.error, { modelName: download.name });
            loadModels();
          } else if (status.state === 'completed') {
            completeDownload(downloadId, true, status.message, { modelName: download.name, warning: status.warning });
            loadModels();
          } else if (status.state === 'unknown') {
            // The backend registers a download a moment after the request; only
            // give up after it has been unknown for several checks in a row.
            const count = (unknownCountsRef.current.get(downloadId) || 0) + 1;
            unknownCountsRef.current.set(downloadId, count);
            if (count >= 4) {
              unknownCountsRef.current.delete(downloadId);
              completeDownload(downloadId, false,
                'The backend lost track of this download (it may have restarted). Check the logs and try again.',
                { modelName: download.name });
            }
          } else {
            unknownCountsRef.current.delete(downloadId);
          }
        } catch {
          // Backend unreachable - the connection banner already covers this
        }
      }
    };

    const interval = setInterval(checkDownloads, 3000);
    const onReconnect = () => { checkDownloads(); };
    socket?.on('connect', onReconnect);
    return () => {
      clearInterval(interval);
      socket?.off('connect', onReconnect);
    };
  }, [activeDownloads.size > 0, socket]);

  // Filter models based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredModels(models);
    } else {
      const filtered = models.filter(model => 
        model.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
    
    const entry = { name: modelName, progress: 0, notificationId };
    activeDownloadsRef.current = new Map(activeDownloadsRef.current).set(downloadId, entry);
    setActiveDownloads(prev => new Map(prev).set(downloadId, entry));

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

  const completeDownload = (
    downloadId: string,
    success: boolean,
    message?: string,
    options: { modelName?: string; warning?: string | null } = {}
  ) => {
    const download = activeDownloadsRef.current.get(downloadId);
    if (!download && success) {
      // Already reported (e.g. both the socket event and a status poll arrived)
      return;
    }
    if (download) {
      removeNotification(download.notificationId);
      const remaining = new Map(activeDownloadsRef.current);
      remaining.delete(downloadId);
      activeDownloadsRef.current = remaining;
      setActiveDownloads(prev => {
        const updated = new Map(prev);
        updated.delete(downloadId);
        return updated;
      });
      setShowLogs(prev => {
        const updated = new Map(prev);
        updated.delete(downloadId);
        return updated;
      });
    } else if (reportedFailuresRef.current.has(downloadId)) {
      return; // this failure was already shown
    }

    const name = download?.name || options.modelName || 'Model';
    if (!success) {
      reportedFailuresRef.current.add(downloadId);
      addLog('error', `❌ ${name} failed: ${message || 'unknown error'}`);
    }
    if (success && options.warning) {
      addNotification({
        type: 'warning',
        title: 'Model Added - Not Loadable Yet',
        message: `${message || `${name} added.`} ${options.warning}`,
        persistent: true
      });
      return;
    }
    addNotification({
      type: success ? 'success' : 'error',
      title: success ? 'Model Ready' : 'Download Failed',
      message: message || `${name} ${success ? 'is ready for use!' : 'download failed'}`,
      ...(success ? {} : { persistent: true })
    });
  };

  const cancelDownload = async (downloadId: string) => {
    const download = activeDownloadsRef.current.get(downloadId);
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

      if (data.already_finished && data.result) {
        // It ended before the cancel arrived (we missed the event) - report how
        completeDownload(downloadId, data.result.state === 'completed',
                         data.result.state === 'completed' ? data.result.message : data.result.error,
                         { modelName: download.name, warning: data.result.warning });
        loadModels();
        return;
      }
      
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
    const existingNames = models.map(model => model.id.toLowerCase());
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
      
      // Only a custom script is sent; otherwise the backend uses its default handler
      if (scriptOption === 'custom' && customScript) {
        formData.append('custom_script', customScript);
      }

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
      completeDownload(uploadId, false, `Upload failed: ${error instanceof Error ? error.message : error}`);
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

      // Use FormData to support custom script upload
      const formData = new FormData();
      formData.append('model_url', selectedYOLO.url);
      formData.append('model_name', yoloModelName.trim());
      formData.append('target_format', selectedFormat);
      formData.append('original_format', 'PyTorch');
      formData.append('download_id', downloadId);
      
      // Only a custom script is sent; otherwise the backend uses its default handler
      if (scriptOption === 'custom' && customScript) {
        formData.append('custom_script', customScript);
      }

      const response = await fetch(`${getBackendUrl()}/models/download-yolo`, {
        method: 'POST',
        body: formData
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        throw new Error(`Backend returned ${response.status} ${contentType || ''}: ${textResponse.slice(0, 200)}`);
      }

      const data = await response.json();

      if (!data.success && !data.download_started) {
        // If download failed immediately (validation error, etc.)
        completeDownload(downloadId, false, data.error || 'Download failed');
      }
      // If successful or download started, progress will be handled by WebSocket
    } catch (error) {
      console.error('Download error:', error);
      completeDownload(downloadId, false, `Download failed: ${error instanceof Error ? error.message : error}`);
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
    setCustomScript(null);
    setScriptOption('default');
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
    setOriginalModelId(modelId);
    setEditNameError('');
  };

  const handleCancelEdit = () => {
    setEditingModel(null);
    setEditingName('');
    setOriginalModelId('');
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
    
    // Check for valid ID format (no spaces allowed)
    if (!/^[a-zA-Z0-9\-_\.()]+$/.test(name)) {
      return 'Model ID contains invalid characters. Only letters, numbers, and -_.() are allowed (no spaces)';
    }
    
    // Check for uniqueness excluding current model
    const existingIds = models
      .filter(model => model.id !== editingModel)
      .map(model => model.id);
    if (existingIds.includes(name)) {
      return 'A model with this ID already exists. Please choose a different ID.';
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

    // If the ID hasn't changed, just close the editor
    if (trimmedName === originalModelId) {
      setEditingModel(null);
      setEditingName('');
      setOriginalModelId('');
      setEditNameError('');
      addNotification({
        type: 'info',
        title: 'No Changes',
        message: 'Model ID was not modified'
      });
      return;
    }

    // Show confirmation modal only if ID changed
    setPendingRename({ modelId, newName: trimmedName });
    setShowRenameConfirm(true);
  };

  const handleConfirmRename = async () => {
    if (!pendingRename) return;

    const { modelId, newName } = pendingRename;

    try {
      const response = await fetch(`${getBackendUrl()}/models/${modelId}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ new_name: newName })
      });
      
      const data = await response.json();
      if (data.success) {
        await loadModels();
        setEditingModel(null);
        setEditingName('');
        setOriginalModelId('');
        setEditNameError('');
        setShowRenameConfirm(false);
        setPendingRename(null);
        addNotification({
          type: 'success',
          title: 'Model Renamed',
          message: 'Model ID updated successfully!'
        });
      } else {
        setShowRenameConfirm(false);
        setPendingRename(null);
        setEditNameError(data.error || 'Failed to rename model');
      }
    } catch (error) {
      console.error('Rename error:', error);
      setShowRenameConfirm(false);
      setPendingRename(null);
      setEditNameError('Failed to rename model');
    }
  };

  const handleCancelRename = () => {
    setShowRenameConfirm(false);
    setPendingRename(null);
  };

  const handleDownloadTemplate = async () => {
    setLoadingTemplate(true);
    try {
      const response = await fetch(`${getBackendUrl()}/models/custom-script-template`);
      if (!response.ok) {
        throw new Error(`Template request failed (${response.status})`);
      }
      const blob = await response.blob();
      const text = await blob.text();
      
      setTemplateContent(text);
      setViewingTemplate(true);
    } catch (error) {
      console.error('Error fetching template:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load template script'
      });
    } finally {
      setLoadingTemplate(false);
    }
  };
  
  const handleDownloadTemplateFile = () => {
    if (!templateContent) return;
    
    // Create blob and download
    const blob = new Blob([templateContent], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'custom_model_template.py';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    addNotification({
      type: 'success',
      title: 'Template Downloaded',
      message: 'Custom inference script template downloaded successfully!'
    });
  };
  
  const handleCopyTemplate = () => {
    if (!templateContent) return;
    
    navigator.clipboard.writeText(templateContent).then(() => {
      addNotification({
        type: 'success',
        title: 'Copied!',
        message: 'Template script copied to clipboard'
      });
    }).catch((err) => {
      console.error('Failed to copy:', err);
      addNotification({
        type: 'error',
        title: 'Copy Failed',
        message: 'Failed to copy template to clipboard'
      });
    });
  };

  const handleViewCustomScript = async (modelId: string, modelName: string) => {
    setLoadingScript(true);
    try {
      const response = await fetch(`${getBackendUrl()}/models/${modelId}/custom-script`);
      const data = await response.json();
      
      if (data.success) {
        setViewingScript({
          modelId,
          modelName,
          scriptContent: data.data.script_content
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Failed to Load Script',
          message: data.error || 'Could not retrieve custom script'
        });
      }
    } catch (error) {
      console.error('Error fetching custom script:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load custom inference script'
      });
    } finally {
      setLoadingScript(false);
    }
  };

  const highlightPythonSyntax = (code: string) => {
    return (
      <SyntaxHighlighter
        language="python"
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: '#1a1a1a',
          borderRadius: '4px',
          fontSize: '0.85rem',
          lineHeight: '1.5'
        }}
        showLineNumbers={true}
        wrapLines={true}
        wrapLongLines={true}
      >
        {code}
      </SyntaxHighlighter>
    );
  };

  const handleCopyScript = () => {
    if (viewingScript) {
      navigator.clipboard.writeText(viewingScript.scriptContent).then(() => {
        addNotification({
          type: 'success',
          title: 'Copied!',
          message: 'Custom inference script copied to clipboard'
        });
      }).catch((err) => {
        console.error('Failed to copy:', err);
        addNotification({
          type: 'error',
          title: 'Copy Failed',
          message: 'Failed to copy script to clipboard'
        });
      });
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
                <LogsTerminal ref={(el) => {
                  if (el) logsTerminalRefs.current.set(downloadId, el);
                  else logsTerminalRefs.current.delete(downloadId);
                }}>
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

      {fetchingModels ? (
        <LoadingState>
          <LoadingSpinnerLarge />
          <LoadingText>
            <h3>Loading Models</h3>
            <p>Fetching your AI models...</p>
          </LoadingText>
        </LoadingState>
      ) : models.length === 0 ? (
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
                    <h4>{model.id}</h4>
                    <div className="header-actions">
                      <span className={`status ${model.loaded ? 'loaded' : 'unloaded'}`}>
                        {model.loaded ? 'Loaded' : 'Not Loaded'}
                      </span>
                      <button 
                        className="edit-header"
                        onClick={() => handleEditModelName(model.id, model.id)}
                        disabled={editingModel !== null}
                        title="Edit model ID"
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
                <div className="info-row">
                  <span className="label">Inference:</span>
                  {model.script_status === 'failed' ? (
                    <span
                      className="value"
                      style={{ color: '#ff6b6b' }}
                      title={model.script_error || 'Custom script failed'}
                    >
                      <i className="fas fa-exclamation-triangle"></i> Custom script failed (using default)
                    </span>
                  ) : (
                    <span className="value">
                      {model.custom_script_path ? 'Custom script' : 'Default'}
                    </span>
                  )}
                </div>
                {model.load_problem && !model.loaded && (
                  <div
                    className="info-row"
                    style={{ color: '#ffb020', alignItems: 'flex-start', gap: '6px' }}
                  >
                    <span className="label"><i className="fas fa-exclamation-circle"></i> Can't load:</span>
                    <span className="value" style={{ whiteSpace: 'normal', textAlign: 'right' }}>{model.load_problem}</span>
                  </div>
                )}
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
                    data-tooltip-id="tooltip-load"
                    data-tooltip-content="Load model into memory for inference"
                  >
                    <i className="fas fa-upload"></i>
                  </button>
                ) : (
                  <>
                    <button 
                      className="unload"
                      onClick={() => handleUnloadModel(model.id)}
                      data-tooltip-id="tooltip-unload"
                      data-tooltip-content="Unload model from memory to free resources"
                    >
                      <i className="fas fa-download"></i>
                    </button>
                    <button 
                      className="force-reload"
                      onClick={() => handleForceReloadModel(model.id)}
                      data-tooltip-id="tooltip-reload"
                      data-tooltip-content="Force reload model (clears stuck states)"
                    >
                      <i className="fas fa-sync-alt"></i>
                    </button>
                  </>
                )}
                <button 
                  className="delete"
                  onClick={() => handleDeleteModel(model.id)}
                  data-tooltip-id="tooltip-delete"
                  data-tooltip-content="Permanently delete this model"
                >
                  <i className="fas fa-trash"></i>
                </button>
              </div>
              
              {model.custom_script_path && (
                <div style={{ marginTop: '8px' }}>
                  <button
                    onClick={() => handleViewCustomScript(model.id, model.name)}
                    disabled={loadingScript}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'transparent',
                      border: '1px solid #76b900',
                      borderRadius: '4px',
                      color: '#76b900',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <i className="fas fa-code"></i>
                    {loadingScript ? 'Loading...' : 'View Custom Inference Script'}
                  </button>
                </div>
              )}
            </ModelCard>
          ))}
        </ModelsList>
      )}

      {showModal && (
        <Modal isOpen={showModal} onClose={() => resetModal()}>
          <ModalHeader>
            <h3>
              <i className="fas fa-plus"></i>
              Add New Model
            </h3>
            <ModalCloseButton onClick={() => resetModal()}>
              <i className="fas fa-times"></i>
            </ModalCloseButton>
          </ModalHeader>

          <ModalBody ref={modalBodyRef}>
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

              <CustomScriptSection>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ margin: 0 }}>
                    <i className="fas fa-code"></i> Inference Script
                  </label>
                  <button
                    onClick={handleDownloadTemplate}
                    disabled={loadingTemplate}
                    style={{
                      background: 'transparent',
                      border: '1px solid #76b900',
                      color: '#76b900',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: loadingTemplate ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease',
                      opacity: loadingTemplate ? 0.5 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!loadingTemplate) e.currentTarget.style.background = 'rgba(118, 185, 0, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <i className={loadingTemplate ? "fas fa-spinner fa-spin" : "fas fa-file-code"}></i>
                    {loadingTemplate ? 'Loading...' : 'View Template'}
                  </button>
                </div>
                  
                  <ScriptOptions>
                    <ScriptOption
                      $selected={scriptOption === 'default'}
                      onClick={() => {
                        setScriptOption('default');
                        setCustomScript(null);
                      }}
                    >
                      <i className="fas fa-cogs"></i>
                      <span>Default</span>
                      <small>Built-in handler (YOLO, ONNX, PyTorch)</small>
                    </ScriptOption>
                    
                    <ScriptOption
                      $selected={scriptOption === 'custom'}
                      onClick={() => setScriptOption('custom')}
                    >
                      <i className="fas fa-file-code"></i>
                      <span>Custom Script</span>
                      <small>Upload your own .py file</small>
                    </ScriptOption>
                  </ScriptOptions>

                  {scriptOption === 'custom' && (
                    <CustomScriptUpload>
                      <input
                        type="file"
                        accept=".py"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (!file.name.endsWith('.py')) {
                              addNotification({
                                type: 'error',
                                title: 'Invalid File',
                                message: 'Custom script must be a Python (.py) file'
                              });
                              return;
                            }
                            setCustomScript(file);
                          }
                        }}
                        style={{ display: 'none' }}
                        id="custom-script-upload"
                      />
                      <label htmlFor="custom-script-upload" className="upload-button">
                        <i className="fas fa-upload"></i>
                        {customScript ? customScript.name : 'Choose Python File'}
                      </label>
                      {customScript && (
                        <button
                          onClick={() => setCustomScript(null)}
                          className="remove-button"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      )}
                    </CustomScriptUpload>
                  )}

                  {scriptOption === 'default' && (
                    <ScriptInfo>
                      <i className="fas fa-info-circle"></i>
                      No script needed. Ultralytics YOLO models (.pt, .onnx, .engine) get detection boxes automatically; other models use the generic ONNX/PyTorch/TensorFlow handler. Pick Custom for segmentation, pose, or models with their own pre/post-processing.
                    </ScriptInfo>
                  )}
                </CustomScriptSection>
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

                  <CustomScriptSection>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <label style={{ margin: 0 }}>
                        <i className="fas fa-code"></i> Inference Script
                      </label>
                      <button
                        onClick={handleDownloadTemplate}
                        style={{
                          background: 'transparent',
                          border: '1px solid #76b900',
                          color: '#76b900',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(118, 185, 0, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <i className="fas fa-download"></i>
                        Download Template
                      </button>
                    </div>
                    
                    <ScriptOptions>
                      <ScriptOption
                        $selected={scriptOption === 'default'}
                        onClick={() => {
                          setScriptOption('default');
                          setCustomScript(null);
                        }}
                      >
                        <i className="fas fa-cogs"></i>
                        <span>Default</span>
                        <small>Built-in handler (YOLO, ONNX, PyTorch)</small>
                      </ScriptOption>
                      
                      <ScriptOption
                        $selected={scriptOption === 'custom'}
                        onClick={() => setScriptOption('custom')}
                      >
                        <i className="fas fa-file-code"></i>
                        <span>Custom Script</span>
                        <small>Upload your own .py file</small>
                      </ScriptOption>
                    </ScriptOptions>

                    {scriptOption === 'custom' && (
                      <CustomScriptUpload>
                        <input
                          type="file"
                          accept=".py"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (!file.name.endsWith('.py')) {
                                addNotification({
                                  type: 'error',
                                  title: 'Invalid File',
                                  message: 'Custom script must be a Python (.py) file'
                                });
                                return;
                              }
                              setCustomScript(file);
                            }
                          }}
                          style={{ display: 'none' }}
                          id="custom-script-upload-yolo"
                        />
                        <label htmlFor="custom-script-upload-yolo" className="upload-button">
                          <i className="fas fa-upload"></i>
                          {customScript ? customScript.name : 'Choose Python File'}
                        </label>
                        {customScript && (
                          <button
                            onClick={() => setCustomScript(null)}
                            className="remove-button"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        )}
                      </CustomScriptUpload>
                    )}

                    {scriptOption === 'default' && (
                      <ScriptInfo>
                        <i className="fas fa-info-circle"></i>
                        No script needed. Ultralytics YOLO models (.pt, .onnx, .engine) get detection boxes automatically; other models use the generic ONNX/PyTorch/TensorFlow handler. Pick Custom for segmentation, pose, or models with their own pre/post-processing.
                      </ScriptInfo>
                    )}
                  </CustomScriptSection>
                </>
              )}
            </div>
          )}
          </ModalBody>

          <ModalFooter>
            <ActionButtons>
              {activeTab === 'upload' ? (
                <>
                  <Button variant="secondary" onClick={() => resetModal()}>
                    Cancel
                  </Button>
                  <Button 
                    variant="primary" 
                    onClick={handleFileUpload}
                    disabled={loading || !selectedFile || !modelName.trim() || !!nameError || (scriptOption === 'custom' && !customScript)}
                  >
                    {loading ? <LoadingSpinner /> : 'Upload Model'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => resetModal()}>
                    Cancel
                  </Button>
                  <Button 
                    variant="primary" 
                    onClick={handleYOLODownload}
                    disabled={loading || !selectedYOLO || !yoloModelName.trim() || !!yoloNameError || (scriptOption === 'custom' && !customScript)}
                  >
                    {loading ? <LoadingSpinner /> : 'Download & Convert'}
                  </Button>
                </>
              )}
            </ActionButtons>
          </ModalFooter>
        </Modal>
      )}
      
      {/* Custom Script Viewer Modal */}
      {viewingScript && (
        <Modal isOpen={true} onClose={() => setViewingScript(null)}>
          <ModalHeader>
            <h3>
              <i className="fas fa-code"></i>
              Custom Inference Script - {viewingScript.modelName}
            </h3>
            <ModalCloseButton onClick={() => setViewingScript(null)}>
              <i className="fas fa-times"></i>
            </ModalCloseButton>
          </ModalHeader>

          <ModalBody>
            <ScriptInfoBanner>
              <i className="fas fa-info-circle"></i>
              <p>
                This is the custom inference script used by this model. You can copy it to create similar scripts for other models.
              </p>
            </ScriptInfoBanner>
            
            <CodeViewerContainer>
              <CodeViewerHeader>
                <h4>
                  <i className="fas fa-file-code"></i>
                  custom_inference.py
                </h4>
                <CopyButton onClick={handleCopyScript}>
                  <i className="fas fa-copy"></i>
                  Copy to Clipboard
                </CopyButton>
              </CodeViewerHeader>
              <CodeContent>
                {highlightPythonSyntax(viewingScript.scriptContent)}
              </CodeContent>
            </CodeViewerContainer>
          </ModalBody>

          <ModalFooter>
            <ActionButtons>
              <Button variant="secondary" onClick={() => setViewingScript(null)}>
                Close
              </Button>
            </ActionButtons>
          </ModalFooter>
        </Modal>
      )}
      
      {/* Rename Confirmation Modal */}
      {showRenameConfirm && pendingRename && (
        <Modal isOpen={true} onClose={handleCancelRename} maxWidth="450px">
          <ModalHeader>
            <h3>
              <p style={{color: '#ffa500' }}>
              Warning:
              </p>
              Model ID Change
            </h3>
            <ModalCloseButton onClick={handleCancelRename}>
              <i className="fas fa-times"></i>
            </ModalCloseButton>
          </ModalHeader>

          <ModalBody>
            <div style={{ padding: '30px 20px' }}>
              <div style={{ 
                background: 'rgba(255, 165, 0, 0.1)', 
                border: '1px solid rgba(255, 165, 0, 0.3)',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '25px'
              }}>
                <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.8', color: '#ffa500' }}>
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }}></i>
                  <strong>Warning:</strong> If you change the model ID, all applications and code that use this model ID for inference will be affected and may fail until updated with the new ID.
                </p>
              </div>
              <p style={{ marginBottom: '20px', fontSize: '15px', lineHeight: '1.8' }}>
                You are about to change the model ID from <strong>{pendingRename.modelId}</strong> to <strong>{pendingRename.newName}</strong>.
              </p>
              <p style={{ margin: 0, fontSize: '14px', color: '#999', lineHeight: '1.6' }}>
                Are you sure you want to continue?
              </p>
            </div>
          </ModalBody>

          <ModalFooter>
            <ActionButtons>
              <Button variant="secondary" onClick={handleCancelRename}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmRename}>
                Confirm
              </Button>
            </ActionButtons>
          </ModalFooter>
        </Modal>
      )}
      
      {/* Template Viewer Modal */}
      {viewingTemplate && (
        <Modal isOpen={true} onClose={() => setViewingTemplate(false)}>
          <ModalHeader>
            <h3>
              <i className="fas fa-file-code"></i>
              Custom Inference Script Template
            </h3>
            <ModalCloseButton onClick={() => setViewingTemplate(false)}>
              <i className="fas fa-times"></i>
            </ModalCloseButton>
          </ModalHeader>

          <ModalBody>
            <ScriptInfoBanner>
              <i className="fas fa-lightbulb"></i>
              <p>
                This template shows the structure for creating custom inference scripts. Copy or download this template to create your own custom preprocessing, inference, and postprocessing logic for your models.
              </p>
            </ScriptInfoBanner>
            
            <CodeViewerContainer>
              <CodeViewerHeader>
                <h4>
                  <i className="fas fa-file-code"></i>
                  custom_model_template.py
                </h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <CopyButton onClick={handleCopyTemplate}>
                    <i className="fas fa-copy"></i>
                    Copy to Clipboard
                  </CopyButton>
                  <CopyButton onClick={handleDownloadTemplateFile}>
                    <i className="fas fa-download"></i>
                    Download File
                  </CopyButton>
                </div>
              </CodeViewerHeader>
              <CodeContent>
                {highlightPythonSyntax(templateContent)}
              </CodeContent>
            </CodeViewerContainer>
          </ModalBody>

          <ModalFooter>
            <ActionButtons>
              <Button variant="secondary" onClick={() => setViewingTemplate(false)}>
                Close
              </Button>
            </ActionButtons>
          </ModalFooter>
        </Modal>
      )}
      
      {/* Color-coded tooltips for each action */}
      <Tooltip 
        id="tooltip-load" 
        place="top"
        style={{
          backgroundColor: '#76b900',
          color: '#fff',
          fontSize: '11px',
          borderRadius: '4px',
          padding: '6px 10px',
          zIndex: 9999
        }}
      />
      <Tooltip 
        id="tooltip-unload" 
        place="top"
        style={{
          backgroundColor: '#ffc107',
          color: '#000',
          fontSize: '11px',
          borderRadius: '4px',
          padding: '6px 10px',
          zIndex: 9999
        }}
      />
      <Tooltip 
        id="tooltip-reload" 
        place="top"
        style={{
          backgroundColor: '#6c757d',
          color: '#fff',
          fontSize: '11px',
          borderRadius: '4px',
          padding: '6px 10px',
          zIndex: 9999
        }}
      />
      <Tooltip 
        id="tooltip-delete" 
        place="top"
        style={{
          backgroundColor: '#dc3545',
          color: '#fff',
          fontSize: '11px',
          borderRadius: '4px',
          padding: '6px 10px',
          zIndex: 9999
        }}
      />
    </Container>
  );
};

export default ModelsSection;