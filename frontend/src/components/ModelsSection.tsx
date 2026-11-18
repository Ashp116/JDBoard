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
  created_at?: string;      // when it was added (registry)
  last_used?: string | null;
  inference_count?: number;
  original_filename?: string;
  file_hash?: string;
  workspace?: number;
  load_info?: { loaded_at?: string; load_time?: number };
  custom_script_path?: string | null;
  inference_handler?: 'default' | 'custom';
  script_status?: 'none' | 'pending' | 'active' | 'failed';
  script_error?: string | null;
  script_error_line?: number | null;  // line in the script where it failed
  script_traceback?: string | null;
  load_problem?: string | null;   // set when the backend can't load this model (missing framework)
  precision?: Precision;          // export / inference precision chosen at download
  imgsz?: number;
  calibration?: 'coco' | 'custom';
}

// Progress toasts live in the app-wide notification list and outlive this page
// (e.g. when switching tabs), so each download's toast gets a fixed id derived
// from the download. Re-mounting the page then replaces it instead of adding a
// second, orphaned toast.
const DOWNLOAD_TOAST_PREFIX = 'download-';
const downloadToastId = (downloadId: string) => `${DOWNLOAD_TOAST_PREFIX}${downloadId}`;

// Uploads (model files, calibration zips) the browser is still sending.
// Kept at module level, not in component state, so they survive the Models
// page being unmounted when switching dashboard tabs. The backend only learns
// about an upload once the whole file has arrived.
type SendState = { name: string; progress: number; status: string };
type SendEvent =
  | { kind: 'progress'; id: string; progress: number; status: string }
  | { kind: 'failed'; id: string; name: string; error: string }
  | { kind: 'accepted'; id: string }
  | { kind: 'cancelled'; id: string; name: string };
const sendingUploads = new Map<string, SendState>();
const sendListeners = new Set<(e: SendEvent) => void>();
const unreportedSendFailures = new Map<string, { name: string; error: string }>();
const sendingRequests = new Map<string, XMLHttpRequest>();
const cancelledSends = new Set<string>();

// Stop sending a file (the backend never saw the request, so nothing to clean up there)
const abortSend = (id: string): boolean => {
  const xhr = sendingRequests.get(id);
  if (!xhr) return false;
  cancelledSends.add(id);
  xhr.abort();
  return true;
};

const emitSend = (e: SendEvent) => {
  if (e.kind === 'failed' && sendListeners.size === 0) {
    unreportedSendFailures.set(e.id, { name: e.name, error: e.error });
  }
  sendListeners.forEach(listener => listener(e));
};

// POST form data with upload progress (fetch can't report it)
const sendFormWithProgress = (url: string, formData: FormData, id: string, name: string) => {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', url);
  sendingUploads.set(id, { name, progress: 0, status: 'Sending file to the Jetson...' });
  let lastPercent = -1;
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable || e.total === 0) return;
    const percent = Math.floor((e.loaded / e.total) * 100);
    if (percent === lastPercent) return;
    lastPercent = percent;
    const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(0);
    // The backend reports 30%+ once it has the file; sending is the first quarter
    const state = { name, progress: Math.round(percent / 4),
                    status: `Sending file to the Jetson: ${percent}% (${mb(e.loaded)}/${mb(e.total)} MB)` };
    sendingUploads.set(id, state);
    emitSend({ kind: 'progress', id, progress: state.progress, status: state.status });
  };
  const fail = (error: string) => { sendingUploads.delete(id); emitSend({ kind: 'failed', id, name, error }); };
  xhr.onload = () => {
    let data: any;
    try {
      data = JSON.parse(xhr.responseText);
    } catch {
      fail(`Backend returned ${xhr.status}: ${xhr.responseText.slice(0, 200)}`);
      return;
    }
    sendingUploads.delete(id);
    if (!data.success && !data.download_started) {
      emitSend({ kind: 'failed', id, name, error: data.error || 'Upload failed' });
    } else {
      emitSend({ kind: 'accepted', id });   // backend progress (socket/polling) takes over
    }
  };
  xhr.onerror = () => fail('The connection to the Jetson dropped while sending the file');
  xhr.onabort = () => {
    if (cancelledSends.delete(id)) {
      sendingUploads.delete(id);
      emitSend({ kind: 'cancelled', id, name });
    } else {
      fail('Sending the file was interrupted');
    }
  };
  xhr.addEventListener('loadend', () => sendingRequests.delete(id));
  sendingRequests.set(id, xhr);
  xhr.send(formData);
};

// Leaving or reloading the page cancels a file that's still being sent
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (sendingUploads.size > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// Export precision choices per target format (must match the backend's
// PRECISIONS_BY_FORMAT / DEFAULT_PRECISION in ai_inference.py)
type Precision = 'fp32' | 'fp16' | 'int8';
const PRECISION_OPTIONS: Record<string, { value: Precision; label: string; hint: string }[]> = {
  PyTorch: [
    { value: 'fp32', label: 'FP32', hint: 'Full precision' },
    { value: 'fp16', label: 'FP16', hint: 'Faster on GPU, same accuracy in practice' },
  ],
  TensorRT: [
    { value: 'fp32', label: 'FP32', hint: 'Most accurate, slowest, most memory to build' },
    { value: 'fp16', label: 'FP16', hint: 'Recommended: fast, accuracy ≈ FP32' },
    { value: 'int8', label: 'INT8', hint: 'Fastest; some accuracy loss; needs calibration images' },
  ],
};
const DEFAULT_PRECISION: Record<string, Precision> = { PyTorch: 'fp32', TensorRT: 'fp16' };
// Models tab: sort and filter options (remembered per browser)
type ModelSort = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc'
               | 'recently-used' | 'most-used' | 'loaded-first';
const MODEL_SORTS: { value: ModelSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'size-desc', label: 'Largest first' },
  { value: 'size-asc', label: 'Smallest first' },
  { value: 'recently-used', label: 'Recently used' },
  { value: 'most-used', label: 'Most used' },
  { value: 'loaded-first', label: 'Loaded first' },
];
// Filters are checkbox lists; an empty list means "all"
type ModelView = {
  sort: ModelSort;
  framework: string[];
  status: ('loaded' | 'unloaded')[];
  handler: ('custom' | 'default')[];
};
const DEFAULT_MODEL_VIEW: ModelView = { sort: 'newest', framework: [], status: [], handler: [] };
const MODEL_VIEW_KEY = 'jdboard.models.view.v2';
const FRAMEWORK_LABELS: Record<string, string> = { tensorrt: 'TensorRT', pytorch: 'PyTorch', onnx: 'ONNX', tensorflow: 'TensorFlow', keras: 'Keras' };

const loadModelView = (): ModelView => {
  try {
    const saved = JSON.parse(localStorage.getItem(MODEL_VIEW_KEY) || '{}');
    const list = (value: unknown) => (Array.isArray(value) ? value.filter(v => typeof v === 'string') : []);
    return {
      sort: MODEL_SORTS.some(o => o.value === saved.sort) ? saved.sort : DEFAULT_MODEL_VIEW.sort,
      framework: list(saved.framework),
      status: list(saved.status) as ModelView['status'],
      handler: list(saved.handler) as ModelView['handler'],
    };
  } catch {
    return DEFAULT_MODEL_VIEW;
  }
};

const addedAt = (m: ModelInfo) => Date.parse(m.created_at || m.upload_date || '') || 0;

const compareModels = (sort: ModelSort) => (a: ModelInfo, b: ModelInfo): number => {
  const byName = a.id.localeCompare(b.id, undefined, { sensitivity: 'base', numeric: true });
  switch (sort) {
    case 'oldest': return addedAt(a) - addedAt(b) || byName;
    case 'name-asc': return byName;
    case 'name-desc': return -byName;
    case 'size-desc': return (b.file_size || 0) - (a.file_size || 0) || byName;
    case 'size-asc': return (a.file_size || 0) - (b.file_size || 0) || byName;
    case 'recently-used': return (Date.parse(b.last_used || '') || 0) - (Date.parse(a.last_used || '') || 0) || byName;
    case 'most-used': return (b.inference_count || 0) - (a.inference_count || 0) || byName;
    case 'loaded-first': return Number(!!b.loaded) - Number(!!a.loaded) || byName;
    case 'newest':
    default: return addedAt(b) - addedAt(a) || byName;
  }
};

// Background for selected options/buttons in the Add Model dialog. The theme's
// NVIDIA green (#76B900) is too light for white text (2.4:1); this is 5.1:1.
const SELECTED_GREEN = '#4E7A00';
const SELECTED_GREEN_HOVER = '#416600';
const IMAGE_SIZES = [320, 416, 480, 640, 800, 960, 1280];

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

const CardMenuWrapper = styled.div`
  position: relative;
`;

const CardMenu = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  min-width: 150px;
  padding: 6px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  background: ${props => props.theme.colors.background.secondary};
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;

  button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: 5px;
    background: none;
    color: ${props => props.theme.colors.text.primary};
    font-size: 13px;
    text-align: left;
    cursor: pointer;

    i {
      width: 14px;
      color: ${props => props.theme.colors.nvidia.green};
    }

    &:hover, &:focus-visible {
      background: ${props => props.theme.colors.background.tertiary};
      outline: none;
    }
  }
`;

const InfoGrid = styled.dl`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 9px 18px;
  margin: 0;
  font-size: 14px;

  dt {
    color: ${props => props.theme.colors.text.secondary};
  }

  dd {
    margin: 0;
    color: ${props => props.theme.colors.text.primary};
    word-break: break-word;
  }

  code {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #d4d4d4;
    background: ${props => props.theme.colors.background.tertiary};
    padding: 2px 6px;
    border-radius: 4px;
  }

  ${props => props.theme.media.mobile} {
    grid-template-columns: 1fr;
    gap: 2px;

    dd {
      margin-bottom: 8px;
    }
  }
`;

const ModelsToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  margin: -10px 0 22px;

  .count {
    font-size: 13px;
    color: ${props => props.theme.colors.text.secondary};
    white-space: nowrap;
  }

  ${props => props.theme.media.mobile} {
    margin-top: -4px;

    .count {
      order: 3;
      width: 100%;
    }
  }
`;

const FiltersWrapper = styled.div`
  position: relative;
`;

const FiltersButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-radius: 6px;
  border: 1px solid ${props => props.$active ? props.theme.colors.nvidia.green : props.theme.colors.border.secondary};
  background: ${props => props.theme.colors.background.secondary};
  color: ${props => props.theme.colors.text.primary};
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s ease;

  i {
    color: ${props => props.theme.colors.nvidia.green};
  }

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
  }

  .badge {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: #4E7A00;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
`;

const FiltersPanel = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 50;
  width: min(460px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  background: ${props => props.theme.colors.background.secondary};
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  fieldset {
    border: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  legend {
    padding: 0;
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${props => props.theme.colors.text.secondary};
  }

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: ${props => props.theme.colors.text.primary};
    cursor: pointer;
  }

  input {
    accent-color: #4E7A00;
    width: 15px;
    height: 15px;
    margin: 0;
    cursor: pointer;
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .none {
    font-size: 12px;
    color: ${props => props.theme.colors.text.secondary};
  }

  .footer {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid ${props => props.theme.colors.border.secondary};

    button {
      background: none;
      border: none;
      padding: 4px 0;
      color: #76b900;
      font-size: 13px;
      cursor: pointer;

      &:disabled {
        color: ${props => props.theme.colors.text.secondary};
        cursor: default;
      }
    }

    .done {
      padding: 6px 16px;
      border-radius: 6px;
      background: #4E7A00;
      color: #fff;
    }
  }

  ${props => props.theme.media.mobile} {
    grid-template-columns: 1fr;
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

  &:disabled {
    opacity: 0.7;
    cursor: wait;
  }
  
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
  background: ${props => props.$selected ? SELECTED_GREEN : props.theme.colors.background.tertiary};
  border: 2px solid ${props => props.$selected ? SELECTED_GREEN : props.theme.colors.border.secondary};
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
      background: ${SELECTED_GREEN};
      color: white;
      border-color: ${SELECTED_GREEN};
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
  background: ${props => props.selected ? SELECTED_GREEN : props.theme.colors.background.tertiary};
  color: ${props => props.selected ? 'white' : props.theme.colors.text.primary};
  border: 1px solid ${props => props.selected ? SELECTED_GREEN : props.theme.colors.border.secondary};
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
    background: ${SELECTED_GREEN};
    color: white;
    border: none;

    &:hover:not(:disabled) {
      background: ${SELECTED_GREEN_HOVER};
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

      &:disabled {
        opacity: 0.6;
        cursor: wait;
      }
      
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

// The script editor is a transparent textarea over syntax-highlighted code;
// both must use exactly the same font metrics so the caret lines up.
const SCRIPT_LINE_HEIGHT = 20;   // px
const SCRIPT_PAD = 16;           // px
const SCRIPT_FONT_STYLE: React.CSSProperties = {
  fontFamily: "'Courier New', monospace",
  fontSize: '13px',
  lineHeight: `${SCRIPT_LINE_HEIGHT}px`,
  tabSize: 4,
};
const SCRIPT_HIGHLIGHT_STYLE: React.CSSProperties = {
  ...SCRIPT_FONT_STYLE,
  margin: 0,
  padding: `${SCRIPT_PAD}px`,
  background: 'transparent',
  overflow: 'visible',
  whiteSpace: 'pre',
};

const ScriptEditorFrame = styled.div`
  display: flex;
  height: 440px;
  background: #1e1e1e;
  overflow: hidden;
`;

const ScriptGutter = styled.div`
  flex: 0 0 auto;
  min-width: 44px;
  overflow: hidden;
  padding: ${SCRIPT_PAD}px 8px ${SCRIPT_PAD}px 0;
  border-right: 1px solid #333;
  text-align: right;
  color: #6e7681;
  user-select: none;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: ${SCRIPT_LINE_HEIGHT}px;

  .error {
    color: #fff;
    background: #b3261e;
    border-radius: 2px;
  }
`;

const ScriptEditorArea = styled.div`
  position: relative;
  flex: 1;
  overflow: hidden;

  .layer {
    position: absolute;
    top: 0;
    left: 0;
    min-width: 100%;
    pointer-events: none;
    will-change: transform;
  }

  .error-line {
    position: absolute;
    left: 0;
    right: 0;
    height: ${SCRIPT_LINE_HEIGHT}px;
    background: rgba(255, 82, 82, 0.18);
  }
`;

const ScriptEditor = styled.textarea`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: ${SCRIPT_PAD}px;
  border: none;
  outline: none;
  resize: none;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: ${SCRIPT_LINE_HEIGHT}px;
  tab-size: 4;
  white-space: pre;
  overflow: auto;
  background: transparent;
  color: transparent;
  caret-color: #ffffff;

  &::selection {
    background: rgba(118, 185, 0, 0.35);
    color: transparent;
  }
`;

const ScriptErrorPanel = styled.div`
  margin-top: 10px;
  border: 1px solid rgba(255, 82, 82, 0.5);
  background: rgba(255, 82, 82, 0.08);
  border-radius: 6px;
  padding: 10px 12px;
  color: #ff8a80;
  font-size: 13px;

  .message {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  .message span {
    white-space: pre-wrap;
    word-break: break-word;
  }

  button {
    background: #b3261e;
    color: #fff;
    border: none;
    border-radius: 3px;
    padding: 1px 6px;
    margin-right: 8px;
    font-size: 12px;
    cursor: pointer;
  }

  summary {
    margin-top: 8px;
    cursor: pointer;
    color: #ffb4ab;
  }

  pre {
    margin: 6px 0 0;
    padding: 8px;
    max-height: 160px;
    overflow: auto;
    background: #1e1e1e;
    color: #d4d4d4;
    border-radius: 4px;
    font-size: 12px;
    white-space: pre-wrap;
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
        formats: ['PyTorch', 'TensorRT'],
        parameters: '3.2M',
        accuracy: '37.3% mAP'
      },
      {
        name: 'YOLOv8s',
        size: '21.5MB',
        description: 'Small model balancing speed and accuracy for general use',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8s.pt',
        formats: ['PyTorch', 'TensorRT'],
        parameters: '11.2M',
        accuracy: '44.9% mAP'
      },
      {
        name: 'YOLOv8m',
        size: '49.7MB',
        description: 'Medium model with improved accuracy for production environments',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8m.pt',
        formats: ['PyTorch', 'TensorRT'],
        parameters: '25.9M',
        accuracy: '50.2% mAP'
      },
      {
        name: 'YOLOv8l',
        size: '83.7MB',
        description: 'Large model for high-accuracy applications with moderate speed',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8l.pt',
        formats: ['PyTorch', 'TensorRT'],
        parameters: '43.7M',
        accuracy: '52.9% mAP'
      },
      {
        name: 'YOLOv8x',
        size: '136MB',
        description: 'Extra-large model for maximum accuracy in resource-rich scenarios',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8x.pt',
        formats: ['PyTorch', 'TensorRT'],
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
        formats: ['PyTorch', 'TensorRT'],
        parameters: '1.9M',
        accuracy: '28.0% mAP'
      },
      {
        name: 'YOLOv5s',
        size: '14.1MB',
        description: 'Small model optimized for speed and mobile applications',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5s.pt',
        formats: ['PyTorch', 'TensorRT'],
        parameters: '7.2M',
        accuracy: '37.4% mAP'
      },
      {
        name: 'YOLOv5m',
        size: '42.2MB',
        description: 'Medium model with balanced accuracy and speed',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5m.pt',
        formats: ['PyTorch', 'TensorRT'],
        parameters: '21.2M',
        accuracy: '45.4% mAP'
      },
      {
        name: 'YOLOv5l',
        size: '93.6MB',
        description: 'Large model for high-accuracy detection tasks',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5l.pt',
        formats: ['PyTorch', 'TensorRT'],
        parameters: '46.5M',
        accuracy: '49.0% mAP'
      },
      {
        name: 'YOLOv5x',
        size: '166MB',
        description: 'Extra-large model for maximum detection accuracy',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5x.pt',
        formats: ['PyTorch', 'TensorRT'],
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
        formats: ['PyTorch', 'TensorRT'],
        parameters: '2.6M',
        accuracy: '39.5% mAP'
      },
      {
        name: 'YOLOv11s',
        size: '19.4MB',
        description: 'Small model with enhanced accuracy and speed',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11s.pt',
        formats: ['PyTorch', 'TensorRT'],
        parameters: '9.4M',
        accuracy: '47.0% mAP'
      },
      {
        name: 'YOLOv11m',
        size: '49.8MB',
        description: 'Medium model with state-of-the-art performance',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11m.pt',
        formats: ['PyTorch', 'TensorRT'],
        parameters: '20.1M',
        accuracy: '51.5% mAP'
      },
      {
        name: 'YOLOv11l',
        size: '86.9MB',
        description: 'Large model for high-accuracy applications',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11l.pt',
        formats: ['PyTorch', 'TensorRT'],
        parameters: '25.3M',
        accuracy: '53.4% mAP'
      },
      {
        name: 'YOLOv11x',
        size: '56.9MB',
        description: 'Extra-large model with maximum accuracy',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11x.pt',
        formats: ['PyTorch', 'TensorRT'],
        parameters: '56.9M',
        accuracy: '54.7% mAP'
      }
    ]
  }
];

const ModelsSection: React.FC<ModelsSectionProps> = ({ systemData, socket, isConnected }) => {
  const { notifications, addNotification, removeNotification, updateNotification } = useNotifications();
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'yolo'>('upload');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [filteredModels, setFilteredModels] = useState<ModelInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [modelView, setModelView] = useState<ModelView>(loadModelView);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Card "..." menu (model id whose menu is open) and the Info dialog
  const [cardMenu, setCardMenu] = useState<string | null>(null);
  const [infoModel, setInfoModel] = useState<string | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const toggleInList = <K extends 'framework' | 'status' | 'handler'>(key: K, value: ModelView[K][number]) => {
    const current = modelView[key] as string[];
    updateModelView({ [key]: current.includes(value) ? current.filter(v => v !== value) : [...current, value] } as Partial<ModelView>);
  };
  const updateModelView = (change: Partial<ModelView>) => {
    setModelView(prev => {
      const next = { ...prev, ...change };
      try { localStorage.setItem(MODEL_VIEW_KEY, JSON.stringify(next)); } catch { /* private mode etc. */ }
      return next;
    });
  };
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
  const [precision, setPrecision] = useState<Precision>('fp32');
  const [imageSize, setImageSize] = useState(640);
  const [trtWorkspace, setTrtWorkspace] = useState(2);
  const [calibrationSource, setCalibrationSource] = useState<'coco' | 'upload'>('coco');
  const [calibrationZip, setCalibrationZip] = useState<File | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const chooseFormat = (format: string) => {
    setSelectedFormat(format);
    setPrecision(DEFAULT_PRECISION[format] || 'fp32');
  };
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
  // Inference script editor (per model). isCustom=false means the model uses
  // the default handler and the editor starts from the template.
  const [viewingScript, setViewingScript] = useState<{
    modelId: string;
    modelName: string;
    scriptContent: string;   // as loaded, to detect unsaved changes
    draft: string;
    isCustom: boolean;
    error: string;
    errorLine: number | null;
    traceback: string;
    saving: boolean;
  } | null>(null);
  const scriptEditorRef = useRef<HTMLTextAreaElement>(null);
  const scriptLayerRef = useRef<HTMLDivElement>(null);
  const scriptGutterRef = useRef<HTMLDivElement>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  
  // Template viewing state
  const [viewingTemplate, setViewingTemplate] = useState(false);
  const [templateContent, setTemplateContent] = useState('');
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // Model card actions in progress: model id -> action. The clicked button
  // shows a spinner and the card's other actions are disabled meanwhile.
  type ModelAction = 'load' | 'unload' | 'reload' | 'delete';
  const [modelBusy, setModelBusy] = useState<Map<string, ModelAction>>(new Map());
  const [renaming, setRenaming] = useState(false);
  const [cancellingDownloads, setCancellingDownloads] = useState<Set<string>>(new Set());
  const withModelBusy = async (modelId: string, action: ModelAction, run: () => Promise<void>) => {
    if (modelBusy.has(modelId)) return;
    setModelBusy(prev => new Map(prev).set(modelId, action));
    try {
      await run();
    } finally {
      setModelBusy(prev => { const next = new Map(prev); next.delete(modelId); return next; });
    }
  };
  const BUSY_LABEL: Record<ModelAction, string> = {
    load: 'Loading...', unload: 'Unloading...', reload: 'Reloading...', delete: 'Deleting...'
  };
  
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
            notificationId: downloadToastId(downloadId)
          });
          
          // Progress toast with the id we track, so it updates and is removed on completion
          addNotification({
            id: downloadToastId(downloadId),
            type: 'info',
            title: 'Downloading Model',
            message: downloadInfo.status || `${downloadInfo.model_name || 'Model'} - In Progress...`,
            persistent: true
          });

          // Auto-open logs for active downloads to show progress
          restoredLogsState.set(downloadId, true);
        });
        
        // Uploads still being sent from this browser (the backend doesn't know them yet)
        sendingUploads.forEach((send, downloadId) => {
          if (restoredDownloads.has(downloadId)) return;
          restoredDownloads.set(downloadId, {
            name: send.name, progress: send.progress, status: send.status,
            notificationId: downloadToastId(downloadId)
          });
          addNotification({ id: downloadToastId(downloadId), type: 'info', title: 'Downloading Model',
                            message: send.status, persistent: true });
        });
        
        if (restoredDownloads.size > 0) {
          activeDownloadsRef.current = restoredDownloads;
          setActiveDownloads(restoredDownloads);
          setShowLogs(restoredLogsState); // Restore logs state
          
          // Each restored download already has its own progress toast (above)
          console.log(`Restored ${restoredDownloads.size} active downloads:`, Object.fromEntries(restoredDownloads));
        }

        // Toasts of downloads that finished while this page wasn't mounted:
        // look up how each one ended, report it, and close the progress toast.
        const stale = notifications.filter(n =>
          n.id.startsWith(DOWNLOAD_TOAST_PREFIX) &&
          !(n.id.slice(DOWNLOAD_TOAST_PREFIX.length) in data.active_downloads) &&
          !sendingUploads.has(n.id.slice(DOWNLOAD_TOAST_PREFIX.length)));
        for (const toast of stale) {
          const downloadId = toast.id.slice(DOWNLOAD_TOAST_PREFIX.length);
          removeNotification(toast.id);
          try {
            const statusResponse = await fetch(`${getBackendUrl()}/models/downloads/${encodeURIComponent(downloadId)}/status`);
            const status = await statusResponse.json();
            if (status.state === 'failed') {
              completeDownload(downloadId, false, status.error, { modelName: status.model_name });
            } else if (status.state === 'completed') {
              addNotification({
                type: status.warning ? 'warning' : 'success',
                title: status.warning ? 'Model Added - Not Loadable Yet' : 'Model Ready',
                message: [status.message || `${status.model_name || 'Model'} is ready for use!`, status.warning]
                  .filter(Boolean).join(' '),
                ...(status.warning ? { persistent: true } : {})
              });
            }
          } catch (error) {
            console.error('Error checking finished download:', error);
          }
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

  // Uploads still being sent are tracked outside this component (see
  // sendingUploads), so they survive switching dashboard tabs. Route their
  // progress/result events to the current instance's handlers.
  const sendHandlerRef = useRef<(e: SendEvent) => void>(() => {});
  sendHandlerRef.current = (e: SendEvent) => {
    if (e.kind === 'progress') {
      updateDownloadProgress(e.id, e.progress, e.status);
    } else if (e.kind === 'failed') {
      completeDownload(e.id, false, e.error, { modelName: e.name });
    } else if (e.kind === 'cancelled') {
      const download = activeDownloadsRef.current.get(e.id);
      if (download) removeNotification(download.notificationId);
      const remaining = new Map(activeDownloadsRef.current);
      remaining.delete(e.id);
      activeDownloadsRef.current = remaining;
      setActiveDownloads(remaining);
      addNotification({ type: 'info', title: 'Upload Cancelled', message: `${e.name}: the file was not sent` });
    }
  };
  useEffect(() => {
    const listener = (e: SendEvent) => sendHandlerRef.current(e);
    sendListeners.add(listener);
    // Report sends that failed while this page wasn't open
    unreportedSendFailures.forEach((f, id) => completeDownload(id, false, f.error, { modelName: f.name }));
    unreportedSendFailures.clear();
    return () => { sendListeners.delete(listener); };
  }, []);

  // Safety net for missed socket events (reconnects, very fast failures, the
  // socket being down): poll the outcome of every download still shown as active.
  const unknownCountsRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (activeDownloads.size === 0) return () => {};

    const checkDownloads = async () => {
      for (const [downloadId, download] of activeDownloadsRef.current) {
        if (sendingUploads.has(downloadId)) continue;  // backend doesn't have it yet
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

  // Search, filter and sort the model list
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = models.filter(model => {
      if (query && ![model.id, model.type, model.framework, FRAMEWORK_LABELS[model.framework],
                     model.original_filename, model.precision]
            .some(field => field && field.toLowerCase().includes(query))) {
        return false;
      }
      if (modelView.framework.length && !modelView.framework.includes(model.framework)) return false;
      if (modelView.status.length && !modelView.status.includes(model.loaded ? 'loaded' : 'unloaded')) return false;
      if (modelView.handler.length && !modelView.handler.includes(model.custom_script_path ? 'custom' : 'default')) return false;
      return true;
    });
    filtered.sort(compareModels(modelView.sort));
    setFilteredModels(filtered);
  }, [models, searchQuery, modelView]);

  const frameworksPresent = Array.from(new Set(models.map(m => m.framework))).sort();
  const activeFilterCount = modelView.framework.length + modelView.status.length + modelView.handler.length;
  const viewIsFiltered = activeFilterCount > 0;
  const clearFilters = () => updateModelView({ framework: [], status: [], handler: [] });

  // Close a card's "..." menu on an outside click or Escape
  useEffect(() => {
    if (!cardMenu) return undefined;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('[data-card-menu]')) setCardMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCardMenu(null); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [cardMenu]);

  // Close the filters panel on an outside click or Escape
  useEffect(() => {
    if (!filtersOpen) return undefined;
    const onClick = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFiltersOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [filtersOpen]);

  // Search handlers
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  // Download progress management
  const startDownload = (downloadId: string, modelName: string) => {
    const notificationId = downloadToastId(downloadId);
    
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

    // Still sending the file: stop the transfer here, the backend hasn't seen it
    if (abortSend(downloadId)) return;

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
    
    // Same characters the backend accepts (ai_inference._validate_model_name)
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
      return 'Model name can only contain letters, numbers, spaces, hyphens and underscores';
    }
    
    // Unique (case-insensitive) among existing models and ones still being added
    const wanted = name.trim().toLowerCase();
    if (models.some(model => model.id.toLowerCase() === wanted)) {
      return 'A model with this name already exists. Please choose a different name.';
    }
    if (Array.from(activeDownloadsRef.current.values()).some(d => d.name.trim().toLowerCase() === wanted)) {
      return 'A model with this name is already being added. Please choose a different name.';
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
    // .pt starts as "keep as PyTorch"; ONNX can't run on Jetson, so .onnx is always built into TensorRT
    chooseFormat(file.name.toLowerCase().endsWith('.onnx') ? 'TensorRT' : 'PyTorch');
    if (!modelName) {
      // Name it after the file, swapping characters the backend doesn't allow
      // (e.g. "best.v2.pt" -> "best-v2"), and check it like a typed name
      const suggested = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9\s\-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);
      validateAndSetName(suggested, false);
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

  const uploadIsOnnx = !!selectedFile && selectedFile.name.toLowerCase().endsWith('.onnx');
  // .pt (Ultralytics YOLO) -> kept or TensorRT; .onnx (any model) -> always TensorRT via trtexec
  const isConvertibleUpload = !!selectedFile && (selectedFile.name.toLowerCase().endsWith('.pt') || uploadIsOnnx);
  const uploadKeepFormat = uploadIsOnnx ? null : 'PyTorch';
  const uploadConverting = isConvertibleUpload && selectedFormat !== uploadKeepFormat;

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
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('model_name', modelName.trim());
    formData.append('model_type', modelType);
    formData.append('download_id', uploadId); // Send download ID to backend
    // .pt files can be converted (Ultralytics YOLO); .onnx to TensorRT; others are used as-is
    if (isConvertibleUpload) {
      appendExportSettings(formData);
    }
    // Only a custom script is sent; otherwise the backend uses its default handler
    if (scriptOption === 'custom' && customScript) {
      formData.append('custom_script', customScript);
    }

    // Close the dialog right away; the toast shows progress, also after
    // switching tabs (the send is tracked outside this page)
    resetModal();
    updateDownloadProgress(uploadId, 0, 'Sending file to the Jetson...');
    sendFormWithProgress(`${getBackendUrl()}/models/upload`, formData, uploadId, modelName.trim());
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

    // Use FormData to support custom script upload
    const formData = new FormData();
    formData.append('model_url', selectedYOLO.url);
    formData.append('model_name', yoloModelName.trim());
    appendExportSettings(formData);
    formData.append('original_format', 'PyTorch');
    formData.append('download_id', downloadId);
    
    // Only a custom script is sent; otherwise the backend uses its default handler
    if (scriptOption === 'custom' && customScript) {
      formData.append('custom_script', customScript);
    }

    // Close the dialog right away; progress shows in the toast
    resetModal();
    sendFormWithProgress(`${getBackendUrl()}/models/download-yolo`, formData, downloadId, yoloModelName.trim());
  };

  // Target format, precision, INT8 calibration and advanced export settings.
  // Shared by the YOLO download tab and the upload tab (for .pt files).
  // keepFormat: the uploaded file's own format (no conversion, so no precision
  // settings); noInt8: hide INT8 (trtexec ONNX builds have no image calibration)
  const renderExportSettings = (formats: string[], idPrefix: string, targetLabel: string = 'Target Format',
                                opts: { keepFormat?: string; noInt8?: boolean } = {}) => (
    <>
        <FormatSelector>
          <label>{targetLabel}</label>
          <div className="format-grid">
            {formats.map((format) => (
              <div
                key={format}
                className={`format-option ${selectedFormat === format ? 'selected' : ''}`}
                onClick={() => chooseFormat(format)}
              >
                {format}
              </div>
            ))}
          </div>
        </FormatSelector>
  
        {opts.keepFormat !== selectedFormat && (
        <FormatSelector>
          <label>Precision</label>
          <div className="format-grid">
            {(PRECISION_OPTIONS[selectedFormat] || []).filter(o => !(opts.noInt8 && o.value === 'int8')).map(option => (
              <div
                key={option.value}
                className={`format-option ${precision === option.value ? 'selected' : ''}`}
                onClick={() => setPrecision(option.value)}
                title={option.hint}
              >
                {option.label}
              </div>
            ))}
          </div>
  
          {precision === 'int8' && (
            <div style={{ marginTop: '10px' }}>
              <label>Calibration images</label>
              <div className="format-grid">
                <div
                  className={`format-option ${calibrationSource === 'coco' ? 'selected' : ''}`}
                  onClick={() => { setCalibrationSource('coco'); setCalibrationZip(null); }}
                  title="Ultralytics' COCO sample - fine for the stock COCO-trained YOLO models"
                >
                  Built-in COCO sample
                </div>
                <div
                  className={`format-option ${calibrationSource === 'upload' ? 'selected' : ''}`}
                  onClick={() => setCalibrationSource('upload')}
                  title="A .zip of 100-500 images like the ones the model will see"
                >
                  Upload .zip
                </div>
              </div>
              {calibrationSource === 'upload' && (
                <CustomScriptUpload style={{ marginTop: '8px' }}>
                  <input
                    type="file"
                    accept=".zip"
                    id={`calibration-zip-${idPrefix}`}
                    style={{ display: 'none' }}
                    onChange={(e) => setCalibrationZip(e.target.files?.[0] || null)}
                  />
                  <label htmlFor={`calibration-zip-${idPrefix}`} className="upload-button">
                    <i className="fas fa-file-archive"></i>
                    {calibrationZip ? calibrationZip.name : 'Choose .zip of images (100-500 recommended)'}
                  </label>
                  {calibrationZip && (
                    <button onClick={() => setCalibrationZip(null)} className="remove-button">
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </CustomScriptUpload>
              )}
            </div>
          )}
  
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              style={{ background: 'transparent', border: 'none', color: '#76b900', cursor: 'pointer', padding: 0, fontSize: '13px' }}
            >
              <i className={`fas fa-chevron-${showAdvanced ? 'down' : 'right'}`}></i> Advanced
            </button>
            {showAdvanced && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '8px' }}>
                <div>
                  <label>Image size</label>
                  <select value={imageSize} onChange={(e) => setImageSize(Number(e.target.value))}>
                    {IMAGE_SIZES.map(size => (
                      <option key={size} value={size}>{size}px{size === 640 ? ' (default)' : ''}</option>
                    ))}
                  </select>
                </div>
                {selectedFormat === 'TensorRT' && (
                  <div>
                    <label>TensorRT workspace</label>
                    <select value={trtWorkspace} onChange={(e) => setTrtWorkspace(Number(e.target.value))}>
                      {[0.5, 1, 2, 3, 4].map(gb => (
                        <option key={gb} value={gb}>{gb} GB{gb === 2 ? ' (default)' : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </FormatSelector>
        )}
    </>
  );

  // Adds the export settings above to an upload/download request
  const appendExportSettings = (formData: FormData) => {
    formData.append('target_format', selectedFormat);
    formData.append('precision', precision);
    formData.append('imgsz', String(imageSize));
    if (selectedFormat === 'TensorRT') {
      formData.append('workspace', String(trtWorkspace));
    }
    if (precision === 'int8') {
      formData.append('calibration', calibrationSource);
      if (calibrationSource === 'upload' && calibrationZip) {
        formData.append('calibration_zip', calibrationZip);
      }
    }
  };

  const resetYOLOForm = () => {
    setSelectedYOLO(null);
    setSelectedFormat('PyTorch');
    setPrecision('fp32');
    setImageSize(640);
    setTrtWorkspace(2);
    setCalibrationSource('coco');
    setCalibrationZip(null);
    setShowAdvanced(false);
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

  const handleEditScript = async (modelId: string, modelName: string, hasCustomScript: boolean,
                                  lastError?: { error?: string | null; line?: number | null; traceback?: string | null }) => {
    setLoadingScript(true);
    try {
      let content: string;
      if (hasCustomScript) {
        const response = await fetch(`${getBackendUrl()}/models/${modelId}/custom-script`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Could not retrieve custom script');
        content = data.data.script_content;
      } else {
        const response = await fetch(`${getBackendUrl()}/models/custom-script-template`);
        if (!response.ok) throw new Error(`Template request failed (${response.status})`);
        content = await response.text();
      }
      setViewingScript({ modelId, modelName, scriptContent: content, draft: content,
                         isCustom: hasCustomScript, saving: false,
                         error: lastError?.error || '', errorLine: lastError?.line ?? null,
                         traceback: lastError?.traceback || '' });
      if (lastError?.line) scrollScriptToLine(lastError.line);
    } catch (error) {
      console.error('Error loading inference script:', error);
      addNotification({
        type: 'error',
        title: 'Failed to Load Script',
        message: error instanceof Error ? error.message : 'Could not load the inference script'
      });
    } finally {
      setLoadingScript(false);
    }
  };

  const openScriptEditor = (model: ModelInfo) => {
    if (loadingScript) return;
    handleEditScript(model.id, model.id, !!model.custom_script_path,
      model.script_status === 'failed'
        ? { error: model.script_error, line: model.script_error_line, traceback: model.script_traceback }
        : undefined);
  };

  const closeScriptEditor = () => {
    if (viewingScript && viewingScript.draft !== viewingScript.scriptContent &&
        !window.confirm('Discard your changes to this script?')) {
      return;
    }
    setViewingScript(null);
  };

  const handleSaveScript = async () => {
    if (!viewingScript) return;
    const { modelId, modelName, draft } = viewingScript;
    setViewingScript(prev => prev && { ...prev, saving: true, error: '' });
    try {
      const response = await fetch(`${getBackendUrl()}/models/${modelId}/custom-script`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script_content: draft })
      });
      const data = await response.json();
      if (!data.success) {
        setViewingScript(prev => prev && { ...prev, saving: false, error: data.error || 'Could not save the script',
                                           errorLine: data.error_line ?? null, traceback: data.traceback || '' });
        if (data.error_line) scrollScriptToLine(data.error_line);
        return;
      }
      await loadModels();
      if (data.data?.script_status === 'failed') {
        // Saved, but it failed when the loaded model switched to it: keep the editor open with the error
        setViewingScript(prev => prev && { ...prev, saving: false, isCustom: true, scriptContent: prev.draft,
                                           error: `Saved, but the script failed to start (the default handler is used): ${data.data.script_error}`,
                                           errorLine: data.data.script_error_line ?? null,
                                           traceback: data.data.script_traceback || '' });
        if (data.data.script_error_line) scrollScriptToLine(data.data.script_error_line);
        return;
      }
      setViewingScript(null);
      addNotification({ type: 'success', title: 'Script Saved',
                        message: `${modelName} now uses your custom inference script.` });
    } catch (error) {
      setViewingScript(prev => prev && { ...prev, saving: false, errorLine: null, traceback: '',
        error: `Could not save: ${error instanceof Error ? error.message : error}` });
    }
  };

  const handleResetScript = async () => {
    if (!viewingScript) return;
    const { modelId, modelName } = viewingScript;
    if (!window.confirm(`Remove the custom script from ${modelName} and use the default handler?`)) return;
    setViewingScript(prev => prev && { ...prev, saving: true, error: '' });
    try {
      const response = await fetch(`${getBackendUrl()}/models/${modelId}/custom-script`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Could not reset the script');
      setViewingScript(null);
      await loadModels();
      addNotification({ type: 'success', title: 'Script Reset', message: `${modelName} uses the default handler again.` });
    } catch (error) {
      setViewingScript(prev => prev && { ...prev, saving: false, errorLine: null, traceback: '',
        error: error instanceof Error ? error.message : String(error) });
    }
  };

  // The highlighted code and line numbers sit under the transparent textarea
  // and follow its scroll position
  const syncScriptScroll = () => {
    const el = scriptEditorRef.current;
    if (!el) return;
    if (scriptLayerRef.current) {
      scriptLayerRef.current.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;
    }
    if (scriptGutterRef.current) {
      scriptGutterRef.current.style.transform = `translateY(${-el.scrollTop}px)`;
    }
  };

  const scrollScriptToLine = (line: number) => {
    requestAnimationFrame(() => {
      const el = scriptEditorRef.current;
      if (!el) return;
      el.scrollTop = Math.max(0, SCRIPT_PAD + (line - 1) * SCRIPT_LINE_HEIGHT - el.clientHeight / 3);
      syncScriptScroll();
    });
  };

  // Tab inserts 4 spaces instead of leaving the editor
  const handleScriptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart, selectionEnd, value } = el;
    const next = value.slice(0, selectionStart) + '    ' + value.slice(selectionEnd);
    setViewingScript(prev => prev && { ...prev, draft: next });
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = selectionStart + 4; });
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
      navigator.clipboard.writeText(viewingScript.draft).then(() => {
        addNotification({
          type: 'success',
          title: 'Copied!',
          message: 'Inference script copied to clipboard'
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
      </SectionHeader>

      <ModelsToolbar>
        <SearchContainer>
          <SearchInput
            type="text"
            placeholder="Search models by name, file, framework..."
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

        <FiltersWrapper ref={filtersRef}>
          <FiltersButton
            type="button"
            $active={filtersOpen || viewIsFiltered}
            onClick={() => setFiltersOpen(open => !open)}
            aria-expanded={filtersOpen}
            aria-label="Sort and filter models"
            title="Sort and filter"
          >
            <i className="fas fa-sliders-h"></i>
            {activeFilterCount > 0 && <span className="badge">{activeFilterCount}</span>}
          </FiltersButton>
          {filtersOpen && (
            <FiltersPanel role="dialog" aria-label="Sort and filter models">
              <fieldset>
                <legend>Sort by</legend>
                {MODEL_SORTS.map(option => (
                  <label key={option.value}>
                    <input type="radio" name="model-sort" checked={modelView.sort === option.value}
                           onChange={() => updateModelView({ sort: option.value })} />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <div className="filters">
                <fieldset>
                  <legend>Framework</legend>
                  {frameworksPresent.length === 0 && <span className="none">No models yet</span>}
                  {frameworksPresent.map(fw => (
                    <label key={fw}>
                      <input type="checkbox" checked={modelView.framework.includes(fw)}
                             onChange={() => toggleInList('framework', fw)} />
                      {FRAMEWORK_LABELS[fw] || fw}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>Status</legend>
                  <label>
                    <input type="checkbox" checked={modelView.status.includes('loaded')}
                           onChange={() => toggleInList('status', 'loaded')} />
                    Loaded
                  </label>
                  <label>
                    <input type="checkbox" checked={modelView.status.includes('unloaded')}
                           onChange={() => toggleInList('status', 'unloaded')} />
                    Not loaded
                  </label>
                </fieldset>
                <fieldset>
                  <legend>Inference</legend>
                  <label>
                    <input type="checkbox" checked={modelView.handler.includes('custom')}
                           onChange={() => toggleInList('handler', 'custom')} />
                    Custom script
                  </label>
                  <label>
                    <input type="checkbox" checked={modelView.handler.includes('default')}
                           onChange={() => toggleInList('handler', 'default')} />
                    Default
                  </label>
                </fieldset>
              </div>
              <div className="footer">
                <button type="button" onClick={clearFilters} disabled={!viewIsFiltered}>Clear filters</button>
                <button type="button" className="done" onClick={() => setFiltersOpen(false)}>Done</button>
              </div>
            </FiltersPanel>
          )}
        </FiltersWrapper>

        <AddButton onClick={() => setShowModal(true)}>
          <i className="fas fa-plus"></i>
          Add Model
        </AddButton>
        <div className="count">
          {filteredModels.length === models.length
            ? `${models.length} model${models.length === 1 ? '' : 's'}`
            : `Showing ${filteredModels.length} of ${models.length}`}
        </div>

      </ModelsToolbar>

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
                  <CancelButton
                    disabled={cancellingDownloads.has(downloadId)}
                    onClick={async () => {
                      setCancellingDownloads(prev => new Set(prev).add(downloadId));
                      try { await cancelDownload(downloadId); }
                      finally { setCancellingDownloads(prev => { const next = new Set(prev); next.delete(downloadId); return next; }); }
                    }}
                  >
                    <i className={cancellingDownloads.has(downloadId) ? 'fas fa-spinner fa-spin' : 'fas fa-times'}></i>
                    {cancellingDownloads.has(downloadId) ? 'Cancelling...' : 'Cancel'}
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
                    // Oldest first, newest at the bottom (the terminal auto-scrolls there)
                    logs.filter(log => log.message.includes(downloadId) || log.message.includes(download.name))
                       .map(log => (
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
                    logs.map(log => (
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
          <h3>No Models Match</h3>
          <p>No model matches your search{viewIsFiltered ? ' and filters' : ''}.</p>
          <button
            type="button"
            onClick={() => { setSearchQuery(''); clearFilters(); }}
            style={{ marginTop: '12px', background: 'none', border: '1px solid #76b900', color: '#76b900',
                     padding: '8px 14px', borderRadius: '6px', cursor: 'pointer' }}
          >
            Show all models
          </button>
        </EmptyState>
      ) : (
        <ModelsList>
          {filteredModels.map((model) => (
            <ModelCard key={model.id}
              style={cardMenu === model.id ? { position: 'relative', zIndex: 30 } : undefined}>
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
                        {modelBusy.has(model.id) ? (
                          <><i className="fas fa-spinner fa-spin"></i> {BUSY_LABEL[modelBusy.get(model.id)!]}</>
                        ) : (model.loaded ? 'Loaded' : 'Not Loaded')}
                      </span>
                      <CardMenuWrapper data-card-menu>
                        <button
                          className="edit-header"
                          onClick={() => setCardMenu(open => (open === model.id ? null : model.id))}
                          disabled={editingModel !== null}
                          title="More"
                          aria-haspopup="menu"
                          aria-expanded={cardMenu === model.id}
                        >
                          <i className="fas fa-ellipsis-h"></i>
                        </button>
                        {cardMenu === model.id && (
                          <CardMenu role="menu">
                            <button role="menuitem" onClick={() => { setCardMenu(null); handleEditModelName(model.id, model.id); }}>
                              <i className="fas fa-pen"></i> Rename
                            </button>
                            <button role="menuitem" onClick={() => { setCardMenu(null); setInfoModel(model.id); }}>
                              <i className="fas fa-info-circle"></i> Info
                            </button>
                          </CardMenu>
                        )}
                      </CardMenuWrapper>
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
                {model.precision && (
                  <div className="info-row">
                    <span className="label">Precision:</span>
                    <span className="value">
                      {model.precision.toUpperCase()}
                      {model.imgsz ? ` · ${model.imgsz}px` : ''}
                      {model.calibration ? ` · ${model.calibration === 'coco' ? 'COCO' : 'custom'} calibration` : ''}
                    </span>
                  </div>
                )}
                <div className="info-row">
                  <span className="label">Size:</span>
                  <span className="value">{formatFileSize(model.file_size)}</span>
                </div>
                <div className="info-row">
                  <span className="label">Inference:</span>
                  {/* Clicking the handler opens the script editor */}
                  <span
                    className="value"
                    role="button"
                    tabIndex={0}
                    onClick={() => openScriptEditor(model)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openScriptEditor(model); } }}
                    style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: '3px',
                             ...(model.script_status === 'failed' ? { color: '#ff6b6b' } : {}) }}
                    title={model.script_status === 'failed'
                      ? `${model.script_error || 'Custom script failed'} (click to open the script)`
                      : 'Click to view or edit the inference script'}
                  >
                    {model.script_status === 'failed' ? (
                      <><i className="fas fa-exclamation-triangle"></i> Custom script failed (using default)</>
                    ) : (
                      model.custom_script_path ? 'Custom script' : 'Default'
                    )}
                  </span>
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
              </div>

              <div className="model-actions">
                {!model.loaded ? (
                  <button 
                    className="load"
                    onClick={() => withModelBusy(model.id, 'load', () => handleLoadModel(model.id))}
                    disabled={modelBusy.has(model.id)}
                    data-tooltip-id="tooltip-load"
                    data-tooltip-content="Load model into memory for inference"
                  >
                    <i className={modelBusy.get(model.id) === 'load' ? 'fas fa-spinner fa-spin' : 'fas fa-upload'}></i>
                  </button>
                ) : (
                  <>
                    <button 
                      className="unload"
                      onClick={() => withModelBusy(model.id, 'unload', () => handleUnloadModel(model.id))}
                      disabled={modelBusy.has(model.id)}
                      data-tooltip-id="tooltip-unload"
                      data-tooltip-content="Unload model from memory to free resources"
                    >
                      <i className={modelBusy.get(model.id) === 'unload' ? 'fas fa-spinner fa-spin' : 'fas fa-download'}></i>
                    </button>
                    <button 
                      className="force-reload"
                      onClick={() => withModelBusy(model.id, 'reload', () => handleForceReloadModel(model.id))}
                      disabled={modelBusy.has(model.id)}
                      data-tooltip-id="tooltip-reload"
                      data-tooltip-content="Force reload model (clears stuck states)"
                    >
                      <i className={modelBusy.get(model.id) === 'reload' ? 'fas fa-spinner fa-spin' : 'fas fa-sync-alt'}></i>
                    </button>
                  </>
                )}
                <button 
                  className="delete"
                  onClick={() => withModelBusy(model.id, 'delete', () => handleDeleteModel(model.id))}
                  disabled={modelBusy.has(model.id)}
                  data-tooltip-id="tooltip-delete"
                  data-tooltip-content="Permanently delete this model"
                >
                  <i className={modelBusy.get(model.id) === 'delete' ? 'fas fa-spinner fa-spin' : 'fas fa-trash'}></i>
                </button>
              </div>
              
              <div style={{ marginTop: '8px' }}>
                <button
                  onClick={() => openScriptEditor(model)}
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
                  {loadingScript ? 'Loading...' : 'Edit Inference Script'}
                </button>
              </div>
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
                onClick={() => { if (activeTab !== 'upload') { chooseFormat('PyTorch'); setCalibrationSource('coco'); setCalibrationZip(null); setShowAdvanced(false); } setActiveTab('upload'); }}
              >
                <i className="fas fa-upload"></i>
                File Upload
              </Tab>
              <Tab 
                $active={activeTab === 'yolo'} 
                onClick={() => { if (activeTab !== 'yolo') { chooseFormat('PyTorch'); setCalibrationSource('coco'); setCalibrationZip(null); setShowAdvanced(false); } setActiveTab('yolo'); }}
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

              {isConvertibleUpload && (
                <>
                  {uploadIsOnnx
                    ? renderExportSettings(['TensorRT'], 'upload', 'Convert To', { noInt8: true })
                    : renderExportSettings(['PyTorch', 'TensorRT'], 'upload', 'Convert To')}
                  {uploadIsOnnx && selectedFormat === 'TensorRT' && (
                    <ScriptInfo style={{ marginTop: '8px', marginBottom: '16px' }}>
                      <i className="fas fa-info-circle"></i>
                      Non-YOLO ONNX models need a custom inference script to show results.
                    </ScriptInfo>
                  )}
                </>
              )}

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
                      <small>Built-in handler (YOLO, TensorRT, PyTorch)</small>
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

                  {renderExportSettings(selectedYOLO.formats, 'yolo')}

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
                        <small>Built-in handler (YOLO, TensorRT, PyTorch)</small>
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
                    disabled={loading || !selectedFile || !modelName.trim() || !!nameError || (scriptOption === 'custom' && !customScript)
                              || (isConvertibleUpload && precision === 'int8' && calibrationSource === 'upload' && !calibrationZip)}
                  >
                    {loading ? <LoadingSpinner /> : (uploadConverting ? 'Upload & Convert' : 'Upload Model')}
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
                    disabled={loading || !selectedYOLO || !yoloModelName.trim() || !!yoloNameError || (scriptOption === 'custom' && !customScript)
                              || (precision === 'int8' && calibrationSource === 'upload' && !calibrationZip)}
                  >
                    {loading ? <LoadingSpinner /> : 'Download & Convert'}
                  </Button>
                </>
              )}
            </ActionButtons>
          </ModalFooter>
        </Modal>
      )}
      
      {/* Inference Script Editor Modal */}
      {viewingScript && (
        <Modal isOpen={true} onClose={closeScriptEditor}>
          <ModalHeader>
            <h3>
              <i className="fas fa-code"></i>
              Inference Script - {viewingScript.modelName}
            </h3>
            <ModalCloseButton onClick={closeScriptEditor}>
              <i className="fas fa-times"></i>
            </ModalCloseButton>
          </ModalHeader>

          <ModalBody>
            {!viewingScript.isCustom && (
              <ScriptInfoBanner>
                <i className="fas fa-info-circle"></i>
                <p>This model uses the default handler. Edit the template below and save to give it a custom script.</p>
              </ScriptInfoBanner>
            )}
            <CodeViewerContainer>
              <CodeViewerHeader>
                <h4>
                  <i className="fas fa-file-code"></i>
                  custom_inference.py
                </h4>
                <CopyButton onClick={handleCopyScript}>
                  <i className="fas fa-copy"></i>
                  Copy
                </CopyButton>
              </CodeViewerHeader>
              <ScriptEditorFrame>
                <ScriptGutter>
                  <div ref={scriptGutterRef}>
                    {viewingScript.draft.split('\n').map((_, i) => (
                      <div key={i} className={viewingScript.errorLine === i + 1 ? 'error' : ''}>{i + 1}</div>
                    ))}
                  </div>
                </ScriptGutter>
                <ScriptEditorArea>
                  <div ref={scriptLayerRef} className="layer" aria-hidden="true">
                    {viewingScript.errorLine && (
                      <div className="error-line"
                           style={{ top: SCRIPT_PAD + (viewingScript.errorLine - 1) * SCRIPT_LINE_HEIGHT }} />
                    )}
                    <SyntaxHighlighter
                      language="python"
                      style={vscDarkPlus}
                      customStyle={SCRIPT_HIGHLIGHT_STYLE}
                      codeTagProps={{ style: SCRIPT_FONT_STYLE }}
                    >
                      {viewingScript.draft + '\n'}
                    </SyntaxHighlighter>
                  </div>
                  <ScriptEditor
                    ref={scriptEditorRef}
                    value={viewingScript.draft}
                    onChange={(e) => {
                      const value = e.target.value;
                      setViewingScript(prev => prev && { ...prev, draft: value });
                    }}
                    onScroll={syncScriptScroll}
                    onKeyDown={handleScriptKeyDown}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    wrap="off"
                  />
                </ScriptEditorArea>
              </ScriptEditorFrame>
            </CodeViewerContainer>
            {viewingScript.error && (
              <ScriptErrorPanel>
                <div className="message">
                  <i className="fas fa-exclamation-triangle"></i>
                  <span>
                    {viewingScript.errorLine && (
                      <button type="button" onClick={() => scrollScriptToLine(viewingScript.errorLine!)}>
                        Line {viewingScript.errorLine}
                      </button>
                    )}
                    {viewingScript.error}
                  </span>
                </div>
                {viewingScript.traceback && (
                  <details>
                    <summary>Traceback</summary>
                    <pre>{viewingScript.traceback}</pre>
                  </details>
                )}
              </ScriptErrorPanel>
            )}
          </ModalBody>

          <ModalFooter>
            <ActionButtons>
              {viewingScript.isCustom && (
                <Button variant="secondary" onClick={handleResetScript} disabled={viewingScript.saving}
                        style={{ marginRight: 'auto' }}>
                  Reset to Default
                </Button>
              )}
              <Button variant="secondary" onClick={closeScriptEditor} disabled={viewingScript.saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveScript}
                      disabled={viewingScript.saving || (viewingScript.isCustom && viewingScript.draft === viewingScript.scriptContent)}>
                {viewingScript.saving ? <LoadingSpinner /> : 'Save'}
              </Button>
            </ActionButtons>
          </ModalFooter>
        </Modal>
      )}
      
      {/* Model Info Modal */}
      {infoModel && (() => {
        const m = models.find(x => x.id === infoModel);
        if (!m) return null;
        const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : 'Never');
        const fileName = (path?: string | null) => (path ? path.split('/').pop() : '');
        const handlerText = m.script_status === 'failed'
          ? 'Custom script failed (using default)'
          : m.custom_script_path ? 'Custom script' : 'Default';
        const rows: [string, React.ReactNode][] = [
          ['Model ID', m.id],
          ['Status', m.loaded ? 'Loaded' : 'Not loaded'],
          ['Framework', FRAMEWORK_LABELS[m.framework] || m.framework],
          ['Type', m.type],
          ['Inference', handlerText],
          ...(m.precision ? [['Precision', m.precision.toUpperCase()] as [string, React.ReactNode]] : []),
          ...(m.imgsz ? [['Image size', `${m.imgsz}px`] as [string, React.ReactNode]] : []),
          ...(m.workspace ? [['TensorRT workspace', `${m.workspace} GB`] as [string, React.ReactNode]] : []),
          ...(m.calibration ? [['INT8 calibration', m.calibration === 'coco' ? 'COCO sample' : 'Custom images'] as [string, React.ReactNode]] : []),
          ['Size', formatFileSize(m.file_size)],
          ['Added', when(m.created_at || m.upload_date)],
          ['Runs', String(m.inference_count || 0)],
          ['Last used', when(m.last_used)],
          ...(m.loaded && m.load_info?.loaded_at
            ? [['Loaded at', `${when(m.load_info.loaded_at)}${m.load_info.load_time != null ? ` (took ${m.load_info.load_time.toFixed(1)} s)` : ''}`] as [string, React.ReactNode]]
            : []),
          ...(m.original_filename ? [['Original file', m.original_filename] as [string, React.ReactNode]] : []),
          ['Model file', <code key="f" title={m.file_path}>{fileName(m.file_path)}</code>],
          ...(m.custom_script_path ? [['Script file', <code key="s" title={m.custom_script_path}>{fileName(m.custom_script_path)}</code>] as [string, React.ReactNode]] : []),
          ...(m.file_hash ? [['SHA-256', <code key="h" title={m.file_hash}>{m.file_hash.slice(0, 16)}…</code>] as [string, React.ReactNode]] : []),
        ];
        return (
          <Modal isOpen={true} onClose={() => setInfoModel(null)} maxWidth="520px">
            <ModalHeader>
              <h3>
                <i className="fas fa-info-circle"></i>
                {m.id}
              </h3>
              <ModalCloseButton onClick={() => setInfoModel(null)}>
                <i className="fas fa-times"></i>
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody>
              <InfoGrid>
                {rows.map(([label, value]) => (
                  <React.Fragment key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </React.Fragment>
                ))}
              </InfoGrid>
              {m.script_status === 'failed' && m.script_error && (
                <ScriptErrorPanel style={{ marginTop: '14px' }}>
                  <div className="message">
                    <i className="fas fa-exclamation-triangle"></i>
                    <span>{m.script_error}</span>
                  </div>
                </ScriptErrorPanel>
              )}
              {m.load_problem && !m.loaded && (
                <ScriptErrorPanel style={{ marginTop: '14px' }}>
                  <div className="message">
                    <i className="fas fa-exclamation-circle"></i>
                    <span>{m.load_problem}</span>
                  </div>
                </ScriptErrorPanel>
              )}
            </ModalBody>
            <ModalFooter>
              <ActionButtons>
                <Button variant="secondary" onClick={() => { setInfoModel(null); openScriptEditor(m); }}>
                  Inference Script
                </Button>
                <Button variant="primary" onClick={() => setInfoModel(null)}>
                  Close
                </Button>
              </ActionButtons>
            </ModalFooter>
          </Modal>
        );
      })()}

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
              <p style={{ marginBottom: '20px', fontSize: '15px', lineHeight: '1.8' }}>
                You are about to change the model ID:
                <br />
                From: <strong>{pendingRename.modelId}</strong>
                <br />
                To: <strong>{pendingRename.newName}</strong>
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
              <Button variant="primary" disabled={renaming}
                      onClick={async () => { setRenaming(true); try { await handleConfirmRename(); } finally { setRenaming(false); } }}>
                {renaming ? <LoadingSpinner /> : 'Confirm'}
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