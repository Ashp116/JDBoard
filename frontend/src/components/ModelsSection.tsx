import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { ModelsSectionProps } from '../types';
import { getBackendUrl } from '../utils/api';

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
`;

const SectionHeader = styled.div`
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  display: flex;
  justify-content: space-between;
  align-items: center;

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

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(118, 185, 0, 0.3);
  }

  i {
    font-size: 16px;
  }
`;

const Modal = styled.div<{ $show: boolean }>`
  display: ${props => props.$show ? 'flex' : 'none'};
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  z-index: 1000;
  align-items: center;
  justify-content: center;
`;

const ModalContent = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.primary};
  border-radius: 12px;
  padding: 30px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};

  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0;
    font-size: 20px;
    display: flex;
    align-items: center;
    gap: 10px;

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.colors.text.secondary};
  font-size: 24px;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;

  &:hover {
    background: ${props => props.theme.colors.background.tertiary};
    color: ${props => props.theme.colors.text.primary};
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
  }

  textarea {
    resize: vertical;
    min-height: 80px;
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
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;

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
`;

const ModelCard = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.primary};
  border-radius: 8px;
  padding: 20px;
  transition: all 0.3s ease;

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    transform: translateY(-2px);
  }

  .model-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 15px;

    h4 {
      color: ${props => props.theme.colors.text.primary};
      margin: 0;
      font-size: 16px;
    }

    .status {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;

      &.loaded {
        background: ${props => props.theme.colors.nvidia.green};
        color: white;
      }

      &.unloaded {
        background: ${props => props.theme.colors.background.tertiary};
        color: ${props => props.theme.colors.text.secondary};
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

    button {
      flex: 1;
      padding: 8px 12px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s ease;

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
    }
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
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '3.2M',
        accuracy: '37.3% mAP'
      },
      {
        name: 'YOLOv8s',
        size: '21.5MB',
        description: 'Small model balancing speed and accuracy for general use',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8s.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '11.2M',
        accuracy: '44.9% mAP'
      },
      {
        name: 'YOLOv8m',
        size: '49.7MB',
        description: 'Medium model with improved accuracy for production environments',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8m.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '25.9M',
        accuracy: '50.2% mAP'
      },
      {
        name: 'YOLOv8l',
        size: '83.7MB',
        description: 'Large model for high-accuracy applications with moderate speed',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8l.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '43.7M',
        accuracy: '52.9% mAP'
      },
      {
        name: 'YOLOv8x',
        size: '136MB',
        description: 'Extra-large model for maximum accuracy in resource-rich scenarios',
        url: 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8x.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
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
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '1.9M',
        accuracy: '28.0% mAP'
      },
      {
        name: 'YOLOv5s',
        size: '14.1MB',
        description: 'Small model optimized for speed and mobile applications',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5s.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '7.2M',
        accuracy: '37.4% mAP'
      },
      {
        name: 'YOLOv5m',
        size: '42.2MB',
        description: 'Medium model with balanced accuracy and speed',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5m.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '21.2M',
        accuracy: '45.4% mAP'
      },
      {
        name: 'YOLOv5l',
        size: '93.6MB',
        description: 'Large model for high-accuracy detection tasks',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5l.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '46.5M',
        accuracy: '49.0% mAP'
      },
      {
        name: 'YOLOv5x',
        size: '166MB',
        description: 'Extra-large model for maximum detection accuracy',
        url: 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5x.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
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
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '2.6M',
        accuracy: '39.5% mAP'
      },
      {
        name: 'YOLOv11s',
        size: '19.4MB',
        description: 'Small model with enhanced accuracy and speed',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11s.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '9.4M',
        accuracy: '47.0% mAP'
      },
      {
        name: 'YOLOv11m',
        size: '49.8MB',
        description: 'Medium model with state-of-the-art performance',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11m.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '20.1M',
        accuracy: '51.5% mAP'
      },
      {
        name: 'YOLOv11l',
        size: '86.9MB',
        description: 'Large model for high-accuracy applications',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11l.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '25.3M',
        accuracy: '53.4% mAP'
      },
      {
        name: 'YOLOv11x',
        size: '56.9MB',
        description: 'Extra-large model with maximum accuracy',
        url: 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11x.pt',
        formats: ['PyTorch', 'ONNX', 'TensorRT', 'CoreML'],
        parameters: '56.9M',
        accuracy: '54.7% mAP'
      }
    ]
  }
];

const ModelsSection: React.FC<ModelsSectionProps> = ({ systemData, socket, isConnected }) => {
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'yolo'>('upload');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  
  // File upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState('');
  const [modelType, setModelType] = useState('vision');
  
  // YOLO download states
  const [selectedVersion, setSelectedVersion] = useState<YOLOVersion | null>(null);
  const [selectedYOLO, setSelectedYOLO] = useState<YOLOModelOption | null>(null);
  const [selectedFormat, setSelectedFormat] = useState('PyTorch');
  const [yoloModelName, setYoloModelName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load models on component mount
  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/api/models/list`);
      const data = await response.json();
      if (data.success) {
        setModels(data.models || []);
      }
    } catch (error) {
      console.error('Error loading models:', error);
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
      alert('Please select a file and enter a model name');
      return;
    }

    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('model_name', modelName.trim());
      formData.append('model_type', modelType);

      const response = await fetch(`${getBackendUrl()}/api/models/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      
      if (data.success) {
        await loadModels();
        resetUploadForm();
        setShowModal(false);
        alert('Model uploaded successfully!');
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const handleYOLODownload = async () => {
    if (!selectedYOLO || !yoloModelName.trim()) {
      alert('Please select a YOLO model and enter a name');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${getBackendUrl()}/api/models/download-yolo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model_url: selectedYOLO.url,
          model_name: yoloModelName.trim(),
          target_format: selectedFormat,
          original_format: 'PyTorch'
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

      if (data.success) {
        await loadModels();
        resetYOLOForm();
        setShowModal(false);
        alert(`YOLO model ${selectedYOLO.name} downloaded successfully!`);
      } else {
        alert(data.error || 'Download failed');
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Download failed: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setModelName('');
    setModelType('vision');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetYOLOForm = () => {
    setSelectedYOLO(null);
    setSelectedFormat('PyTorch');
    setYoloModelName('');
  };

  const handleLoadModel = async (modelId: string) => {
    try {
      const response = await fetch(`${getBackendUrl()}/api/models/${modelId}/load`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.success) {
        await loadModels();
        alert('Model loaded successfully!');
      } else {
        alert(data.error || 'Failed to load model');
      }
    } catch (error) {
      console.error('Load error:', error);
      alert('Failed to load model');
    }
  };

  const handleForceReloadModel = async (modelId: string) => {
    try {
      const response = await fetch(`${getBackendUrl()}/api/models/${modelId}/force-reload`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.success) {
        await loadModels();
        alert('Model force reloaded successfully!');
      } else {
        alert(data.error || 'Failed to force reload model');
      }
    } catch (error) {
      console.error('Force reload error:', error);
      alert('Failed to force reload model');
    }
  };

  const handleUnloadModel = async (modelId: string) => {
    try {
      const response = await fetch(`${getBackendUrl()}/api/models/${modelId}/unload`, {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.success) {
        await loadModels();
        alert('Model unloaded successfully!');
      } else {
        alert(data.error || 'Failed to unload model');
      }
    } catch (error) {
      console.error('Unload error:', error);
      alert('Failed to unload model');
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm('Are you sure you want to delete this model? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`${getBackendUrl()}/api/models/${modelId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      if (data.success) {
        await loadModels();
        alert('Model deleted successfully!');
      } else {
        alert(data.error || 'Failed to delete model');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete model');
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
        <AddButton onClick={() => setShowModal(true)}>
          <i className="fas fa-plus"></i>
          Add Model
        </AddButton>
      </SectionHeader>

      {models.length === 0 ? (
        <EmptyState>
          <i className="fas fa-brain"></i>
          <h3>No Models Found</h3>
          <p>Upload your AI models or download YOLO models to get started with inference</p>
        </EmptyState>
      ) : (
        <ModelsList>
          {models.map((model) => (
            <ModelCard key={model.id}>
              <div className="model-header">
                <h4>{model.name}</h4>
                <span className={`status ${model.loaded ? 'loaded' : 'unloaded'}`}>
                  {model.loaded ? 'Loaded' : 'Not Loaded'}
                </span>
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
                  <span className="label">Model ID:</span>
                  <span className="value" title={model.id}>{model.id.substring(0, 8)}...</span>
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

      <Modal $show={showModal}>
        <ModalContent>
          <ModalHeader>
            <h3>
              <i className="fas fa-plus"></i>
              Add New Model
            </h3>
            <CloseButton onClick={() => setShowModal(false)}>
              <i className="fas fa-times"></i>
            </CloseButton>
          </ModalHeader>

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
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="Enter a descriptive name for your model"
                />
              </FormGroup>

              <FormGroup>
                <label>Model Type</label>
                <select
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value)}
                >
                  <option value="vision">Computer Vision</option>
                  <option value="nlp">Natural Language Processing</option>
                  <option value="audio">Audio Processing</option>
                  <option value="other">Other</option>
                </select>
              </FormGroup>

              <ActionButtons>
                <Button variant="secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  onClick={handleFileUpload}
                  disabled={loading || !selectedFile || !modelName.trim()}
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
                              setYoloModelName(model.name);
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
                      onChange={(e) => setYoloModelName(e.target.value)}
                      placeholder="Enter a name for this model instance"
                    />
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
                <Button variant="secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  onClick={handleYOLODownload}
                  disabled={loading || !selectedYOLO || !yoloModelName.trim()}
                >
                  {loading ? <LoadingSpinner /> : 'Download & Convert'}
                </Button>
              </ActionButtons>
            </div>
          )}
        </ModalContent>
      </Modal>
    </Container>
  );
};

export default ModelsSection;