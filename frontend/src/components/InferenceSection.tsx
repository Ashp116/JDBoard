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

const AnnotatedImageContainer = styled.div`
  position: relative;
  display: inline-block;
  max-width: 100%;
  margin: 20px 0;
  border-radius: 8px;
  overflow: hidden;
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
}>`
  position: absolute;
  border: 2px solid ${props => {
    const conf = props.confidence;
    if (conf > 0.8) return '#00ff00'; // High confidence - green
    if (conf > 0.5) return '#ffff00'; // Medium confidence - yellow
    return '#ff6600'; // Low confidence - orange
  }};
  background: transparent;
  left: ${props => props.x}%;
  top: ${props => props.y}%;
  width: ${props => props.width}%;
  height: ${props => props.height}%;
  pointer-events: none;
  
  &::before {
    content: '';
    position: absolute;
    top: -1px;
    left: -1px;
    right: -1px;
    bottom: -1px;
    background: ${props => {
      const conf = props.confidence;
      if (conf > 0.8) return 'rgba(0, 255, 0, 0.1)';
      if (conf > 0.5) return 'rgba(255, 255, 0, 0.1)';
      return 'rgba(255, 102, 0, 0.1)';
    }};
    border-radius: 2px;
  }
`;

const BoundingBoxLabel = styled.div<{ confidence: number }>`
  position: absolute;
  top: -25px;
  left: 0;
  background: ${props => {
    const conf = props.confidence;
    if (conf > 0.8) return '#00ff00';
    if (conf > 0.5) return '#ffff00';
    return '#ff6600';
  }};
  color: #000;
  padding: 2px 6px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 3px;
  white-space: nowrap;
  min-width: 50px;
  text-align: center;
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

const ConfidenceDistribution = styled.div`
  background: ${props => props.theme.colors.background.primary};
  padding: 15px;
  border-radius: 8px;
  border: 1px solid ${props => props.theme.colors.border.primary};
  margin-bottom: 20px;

  .dist-title {
    color: ${props => props.theme.colors.text.primary};
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .confidence-bar {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    font-size: 12px;

    .bar-label {
      width: 80px;
      color: ${props => props.theme.colors.text.secondary};
    }

    .bar-container {
      flex: 1;
      height: 20px;
      background: ${props => props.theme.colors.background.secondary};
      border-radius: 10px;
      overflow: hidden;
      margin: 0 10px;
    }

    .bar-fill {
      height: 100%;
      border-radius: 10px;
      transition: width 0.3s ease;
    }

    .bar-count {
      width: 30px;
      text-align: right;
      color: ${props => props.theme.colors.text.primary};
      font-weight: 600;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // YOLO format: center x, center y, width, height
      x = bbox.x - bbox.width / 2;
      y = bbox.y - bbox.height / 2;
      width = bbox.width;
      height = bbox.height;
    } else if (bbox.x1 !== undefined && bbox.y1 !== undefined) {
      // Corners format: x1, y1, x2, y2
      x = bbox.x1;
      y = bbox.y1;
      width = bbox.x2 - bbox.x1;
      height = bbox.y2 - bbox.y1;
    } else {
      return null;
    }

    return {
      x: (x / imageWidth) * 100,
      y: (y / imageHeight) * 100,
      width: (width / imageWidth) * 100,
      height: (height / imageHeight) * 100
    };
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    setImageNaturalDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight
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
              {selectedImage ? selectedImage.name : 'Drop image here or click to browse'}
            </div>
            <div className="upload-hint">
              Supports JPG, PNG, WEBP formats
            </div>
          </ImageUploadArea>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            accept="image/*"
            style={{ display: 'none' }}
          />

          {imagePreview && (
            <PreviewImage src={imagePreview} alt="Preview" />
          )}

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
        </InferencePanel>

        {/* Results Panel */}
        <ResultsPanel>
          <PanelTitle>
            <i className="fas fa-chart-bar"></i>
            Results
          </PanelTitle>

          {results ? (
            <>
              {/* Annotated Image */}
              {annotatedImageUrl && (
                <AnnotatedImageContainer>
                  <AnnotatedImage 
                    src={annotatedImageUrl} 
                    alt="Annotated Result"
                    onLoad={handleImageLoad}
                  />
                  
                  {/* Render bounding boxes */}
                  {getPredictions(results).map((pred: any, index: number) => {
                    const bbox = convertBboxToPercentage(
                      pred.bbox, 
                      imageNaturalDimensions.width, 
                      imageNaturalDimensions.height
                    );
                    
                    if (!bbox) return null;
                    
                    return (
                      <BoundingBox
                        key={index}
                        x={bbox.x}
                        y={bbox.y}
                        width={bbox.width}
                        height={bbox.height}
                        confidence={pred.confidence || pred.score || 0}
                      >
                        <BoundingBoxLabel confidence={pred.confidence || pred.score || 0}>
                          {pred.class || pred.label || `Class ${index}`} {formatConfidence(pred.confidence || pred.score || 0)}
                        </BoundingBoxLabel>
                      </BoundingBox>
                    );
                  })}
                </AnnotatedImageContainer>
              )}

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
                  <div className="stat-label">Detections</div>
                  <div className="stat-value">{getPredictions(results).length}</div>
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
                  <div className="stat-value" style={{fontSize: '12px'}}>{(results.result?.model_id || results.model_id || '').substring(0, 8)}</div>
                  <div className="stat-unit">ID</div>
                </DetailedStatItem>
                
                <DetailedStatItem>
                  <div className="stat-icon"><i className="fas fa-percentage"></i></div>
                  <div className="stat-label">Avg Confidence</div>
                  <div className="stat-value">
                    {getPredictions(results).length > 0 
                      ? (getPredictions(results).reduce((sum, pred) => sum + (pred.confidence || pred.score || 0), 0) / getPredictions(results).length * 100).toFixed(1)
                      : '0'}
                  </div>
                  <div className="stat-unit">percent</div>
                </DetailedStatItem>
              </DetailedStatsGrid>

              {/* Confidence Distribution */}
              {getPredictions(results).length > 0 && (
                <ConfidenceDistribution>
                  <div className="dist-title">Confidence Distribution</div>
                  {(() => {
                    const dist = getConfidenceDistribution(getPredictions(results));
                    return (
                      <>
                        <div className="confidence-bar">
                          <div className="bar-label">High (&gt;80%)</div>
                          <div className="bar-container">
                            <div 
                              className="bar-fill" 
                              style={{
                                width: `${dist.total > 0 ? (dist.high / dist.total) * 100 : 0}%`,
                                background: '#00ff00'
                              }}
                            />
                          </div>
                          <div className="bar-count">{dist.high}</div>
                        </div>
                        <div className="confidence-bar">
                          <div className="bar-label">Med (50-80%)</div>
                          <div className="bar-container">
                            <div 
                              className="bar-fill" 
                              style={{
                                width: `${dist.total > 0 ? (dist.medium / dist.total) * 100 : 0}%`,
                                background: '#ffff00'
                              }}
                            />
                          </div>
                          <div className="bar-count">{dist.medium}</div>
                        </div>
                        <div className="confidence-bar">
                          <div className="bar-label">Low (&lt;50%)</div>
                          <div className="bar-container">
                            <div 
                              className="bar-fill" 
                              style={{
                                width: `${dist.total > 0 ? (dist.low / dist.total) * 100 : 0}%`,
                                background: '#ff6600'
                              }}
                            />
                          </div>
                          <div className="bar-count">{dist.low}</div>
                        </div>
                      </>
                    );
                  })()}
                </ConfidenceDistribution>
              )}

              {/* Predictions List */}
              {getPredictions(results).length > 0 && (
                <div>
                  <h4 style={{ color: 'var(--text-primary)', marginBottom: '15px' }}>Detections</h4>
                  {getPredictions(results).slice(0, 10).map((pred: any, index: number) => (
                    <ResultItem key={index}>
                      <span className="label">
                        {pred.class || pred.label || `Class ${index}`}
                        {pred.bbox && (
                          <span style={{fontSize: '10px', color: 'var(--text-secondary)', marginLeft: '8px'}}>
                            [{Math.round(pred.bbox.x)}, {Math.round(pred.bbox.y)}, {Math.round(pred.bbox.width)}×{Math.round(pred.bbox.height)}]
                          </span>
                        )}
                      </span>
                      <span className="confidence">
                        {formatConfidence(pred.confidence || pred.score || 0)}
                      </span>
                    </ResultItem>
                  ))}
                </div>
              )}
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
    </Container>
  );
};

export default InferenceSection;