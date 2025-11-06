#!/usr/bin/env python3
"""
AI Model Manager for Jetson Edge AI Dashboard
Handles model loading, inference, and management
"""

import os
import json
import uuid
import time
import logging
import cv2
import numpy as np
import shutil
from datetime import datetime
from pathlib import Path
import hashlib

# AI/ML imports with fallbacks
try:
    import onnxruntime as ort
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False

try:
    import tensorrt as trt
    import pycuda.driver as cuda
    import pycuda.autoinit
    TENSORRT_AVAILABLE = True
except ImportError:
    TENSORRT_AVAILABLE = False

try:
    import torch
    import torchvision.transforms as transforms
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

try:
    import tensorflow as tf
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False

try:
    from ultralytics import YOLO
    ULTRALYTICS_AVAILABLE = True
except ImportError:
    ULTRALYTICS_AVAILABLE = False

logger = logging.getLogger(__name__)

class AIModelManager:
    def __init__(self, models_dir='../models'):
        self.models_dir = Path(models_dir)
        self.models_dir.mkdir(exist_ok=True)
        self.models_registry = {}
        self.loaded_models = {}
        self.registry_file = self.models_dir / 'models_registry.json'
        self._load_registry()
        
    def _load_registry(self):
        """Load the models registry from file"""
        try:
            if self.registry_file.exists():
                with open(self.registry_file, 'r') as f:
                    self.models_registry = json.load(f)
                logger.info(f"Loaded {len(self.models_registry)} models from registry")
        except Exception as e:
            logger.error(f"Error loading models registry: {str(e)}")
            self.models_registry = {}
    
    def _save_registry(self):
        """Save the models registry to file"""
        try:
            with open(self.registry_file, 'w') as f:
                json.dump(self.models_registry, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving models registry: {str(e)}")
    
    def _get_file_hash(self, file_path):
        """Get SHA256 hash of a file"""
        hash_sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    
    def register_model(self, model_name, file_path, model_type='vision', description='', original_filename=''):
        """Register a new model in the system"""
        model_id = str(uuid.uuid4())
        file_path = Path(file_path)
        
        # Get model info
        file_size = file_path.stat().st_size
        file_hash = self._get_file_hash(file_path)
        file_extension = file_path.suffix.lower()
        
        # Determine framework
        framework = self._detect_framework(file_extension)
        
        model_info = {
            'id': model_id,
            'name': model_name,
            'type': model_type,
            'description': description,
            'file_path': str(file_path),
            'original_filename': original_filename or file_path.name,
            'file_size': file_size,
            'file_hash': file_hash,
            'framework': framework,
            'created_at': datetime.now().isoformat(),
            'last_used': None,
            'inference_count': 0,
            'loaded': False
        }
        
        self.models_registry[model_id] = model_info
        self._save_registry()
        
        logger.info(f"Registered model: {model_name} ({model_id})")
        return model_info
    
    def _detect_framework(self, file_extension):
        """Detect the ML framework based on file extension"""
        framework_map = {
            '.onnx': 'onnx',
            '.trt': 'tensorrt',
            '.engine': 'tensorrt',
            '.pb': 'tensorflow',
            '.pth': 'pytorch',
            '.pt': 'pytorch',
            '.h5': 'keras',
            '.savedmodel': 'tensorflow'
        }
        return framework_map.get(file_extension, 'unknown')
    
    def list_models(self):
        """List all registered models"""
        models = []
        for model_id, model_info in self.models_registry.items():
            # Check if file still exists
            if Path(model_info['file_path']).exists():
                model_copy = model_info.copy()
                model_copy['loaded'] = model_id in self.loaded_models
                models.append(model_copy)
            else:
                logger.warning(f"Model file missing: {model_info['file_path']}")
        
        return models
    
    def load_model(self, model_id):
        """Load a model for inference"""
        if model_id not in self.models_registry:
            raise ValueError(f"Model {model_id} not found in registry")
        
        if model_id in self.loaded_models:
            logger.info(f"Model {model_id} already loaded")
            return {"status": "already_loaded", "model_id": model_id}
        
        model_info = self.models_registry[model_id]
        file_path = model_info['file_path']
        framework = model_info['framework']
        
        try:
            start_time = time.time()
            
            if framework == 'onnx' and ONNX_AVAILABLE:
                model = self._load_onnx_model(file_path)
            elif framework == 'tensorrt' and TENSORRT_AVAILABLE:
                model = self._load_tensorrt_model(file_path)
            elif framework == 'pytorch' and TORCH_AVAILABLE:
                model = self._load_pytorch_model(file_path)
            elif framework == 'tensorflow' and TF_AVAILABLE:
                model = self._load_tensorflow_model(file_path)
            else:
                raise ValueError(f"Unsupported framework: {framework} or framework not available")
            
            load_time = time.time() - start_time
            
            self.loaded_models[model_id] = {
                'model': model,
                'info': model_info,
                'loaded_at': datetime.now().isoformat(),
                'load_time': load_time
            }
            
            # Update registry
            self.models_registry[model_id]['loaded'] = True
            self._save_registry()
            
            logger.info(f"Model {model_id} loaded in {load_time:.2f}s")
            
            return {
                "status": "loaded",
                "model_id": model_id,
                "load_time": load_time,
                "framework": framework
            }
            
        except Exception as e:
            logger.error(f"Error loading model {model_id}: {str(e)}")
            raise
    
    def _load_onnx_model(self, file_path):
        """Load an ONNX model"""
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
        session = ort.InferenceSession(file_path, providers=providers)
        return session
    
    def _load_tensorrt_model(self, file_path):
        """Load a TensorRT model"""
        # This is a simplified implementation
        # In practice, you'd need to implement proper TensorRT loading
        logger.warning("TensorRT loading not fully implemented")
        return None
    
    def _load_pytorch_model(self, file_path):
        """Load a PyTorch model"""
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model = torch.load(file_path, map_location=device)
        model.eval()
        return model
    
    def _load_tensorflow_model(self, file_path):
        """Load a TensorFlow model"""
        if file_path.endswith('.pb'):
            # Load frozen graph
            model = tf.saved_model.load(file_path)
        else:
            # Load SavedModel
            model = tf.saved_model.load(file_path)
        return model
    
    def unload_model(self, model_id):
        """Unload a model from memory"""
        if model_id in self.loaded_models:
            del self.loaded_models[model_id]
            self.models_registry[model_id]['loaded'] = False
            self._save_registry()
            logger.info(f"Model {model_id} unloaded")
            return True
        return False
    
    def run_inference(self, model_id, image):
        """Run inference on an image"""
        if model_id not in self.loaded_models:
            raise ValueError(f"Model {model_id} not loaded")
        
        model_data = self.loaded_models[model_id]
        model = model_data['model']
        model_info = model_data['info']
        framework = model_info['framework']
        
        start_time = time.time()
        
        try:
            if framework == 'onnx':
                result = self._run_onnx_inference(model, image)
            elif framework == 'pytorch':
                result = self._run_pytorch_inference(model, image)
            elif framework == 'tensorflow':
                result = self._run_tensorflow_inference(model, image)
            else:
                raise ValueError(f"Inference not implemented for framework: {framework}")
            
            inference_time = time.time() - start_time
            
            # Update usage statistics
            self.models_registry[model_id]['last_used'] = datetime.now().isoformat()
            self.models_registry[model_id]['inference_count'] += 1
            self._save_registry()
            
            logger.info(f"Inference completed for {model_id} in {inference_time:.3f}s")
            
            return {
                'predictions': result,
                'inference_time': inference_time,
                'model_id': model_id,
                'framework': framework
            }
            
        except Exception as e:
            logger.error(f"Error during inference: {str(e)}")
            raise
    
    def _preprocess_image(self, image, target_size=(224, 224)):
        """Preprocess image for inference"""
        # Resize image
        if target_size:
            image = cv2.resize(image, target_size)
        
        # Convert BGR to RGB
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Normalize to [0, 1]
        image = image.astype(np.float32) / 255.0
        
        # Add batch dimension
        image = np.expand_dims(image, axis=0)
        
        return image
    
    def _run_onnx_inference(self, session, image):
        """Run ONNX model inference"""
        # Preprocess image
        input_image = self._preprocess_image(image)
        
        # Get input name
        input_name = session.get_inputs()[0].name
        
        # Run inference
        outputs = session.run(None, {input_name: input_image})
        
        # Process outputs (this is a generic example)
        predictions = outputs[0]
        
        # Get top 5 predictions
        top_indices = np.argsort(predictions[0])[-5:][::-1]
        top_scores = predictions[0][top_indices]
        
        results = []
        for i, (idx, score) in enumerate(zip(top_indices, top_scores)):
            results.append({
                'class_id': int(idx),
                'confidence': float(score),
                'rank': i + 1
            })
        
        return results
    
    def _run_pytorch_inference(self, model, image):
        """Run PyTorch model inference"""
        # Preprocess image
        transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], 
                               std=[0.229, 0.224, 0.225])
        ])
        
        # Convert BGR to RGB
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        input_tensor = transform(image_rgb).unsqueeze(0)
        
        # Move to GPU if available
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        input_tensor = input_tensor.to(device)
        
        with torch.no_grad():
            outputs = model(input_tensor)
        
        # Process outputs
        probabilities = torch.nn.functional.softmax(outputs[0], dim=0)
        top5_prob, top5_indices = torch.topk(probabilities, 5)
        
        results = []
        for i, (idx, prob) in enumerate(zip(top5_indices, top5_prob)):
            results.append({
                'class_id': int(idx),
                'confidence': float(prob),
                'rank': i + 1
            })
        
        return results
    
    def _run_tensorflow_inference(self, model, image):
        """Run TensorFlow model inference"""
        # Preprocess image
        input_image = self._preprocess_image(image)
        input_tensor = tf.constant(input_image)
        
        # Run inference
        predictions = model(input_tensor)
        
        # Process outputs
        if isinstance(predictions, dict):
            # Handle multiple outputs
            predictions = predictions[list(predictions.keys())[0]]
        
        predictions = predictions.numpy()[0]
        
        # Get top 5 predictions
        top_indices = np.argsort(predictions)[-5:][::-1]
        top_scores = predictions[top_indices]
        
        results = []
        for i, (idx, score) in enumerate(zip(top_indices, top_scores)):
            results.append({
                'class_id': int(idx),
                'confidence': float(score),
                'rank': i + 1
            })
        
        return results
    
    def delete_model(self, model_id):
        """Delete a model from the system"""
        if model_id not in self.models_registry:
            raise ValueError(f"Model {model_id} not found")
        
        model_info = self.models_registry[model_id]
        
        # Unload if loaded
        if model_id in self.loaded_models:
            self.unload_model(model_id)
        
        # Delete file - resolve path relative to models directory
        file_path = Path(model_info['file_path'])
        if not file_path.is_absolute():
            # If path is relative, resolve it relative to the backend directory
            file_path = Path(__file__).parent / file_path
        
        if file_path.exists():
            file_path.unlink()
            logger.info(f"Deleted model file: {file_path}")
        else:
            logger.warning(f"Model file not found: {file_path}")
        
        # Remove from registry
        del self.models_registry[model_id]
        self._save_registry()
        
        logger.info(f"Model {model_id} deleted from registry")
        return True
    
    def get_model_info(self, model_id):
        """Get detailed information about a model"""
        if model_id not in self.models_registry:
            raise ValueError(f"Model {model_id} not found")
        
        model_info = self.models_registry[model_id].copy()
        model_info['loaded'] = model_id in self.loaded_models
        
        if model_id in self.loaded_models:
            model_info['load_info'] = {
                'loaded_at': self.loaded_models[model_id]['loaded_at'],
                'load_time': self.loaded_models[model_id]['load_time']
            }
        
        return model_info

    def get_detailed_models_list(self):
        """Get detailed list of all models with status information"""
        detailed_models = []
        for model_id, model_info in self.models_registry.items():
            # Check if file still exists
            if Path(model_info['file_path']).exists():
                detailed_info = model_info.copy()
                detailed_info['id'] = model_id
                detailed_info['loaded'] = model_id in self.loaded_models
                
                if model_id in self.loaded_models:
                    load_info = self.loaded_models[model_id]
                    detailed_info['load_info'] = {
                        'loaded_at': load_info['loaded_at'],
                        'load_time': load_info['load_time']
                    }
                
                detailed_models.append(detailed_info)
            else:
                logger.warning(f"Model file missing: {model_info['file_path']}")
        
        return detailed_models

    def download_yolo_model(self, model_url, model_name, description='', target_format='PyTorch'):
        """Download a YOLO model and optionally convert it to different format"""
        import urllib.request
        import shutil
        from pathlib import Path
        
        try:
            # Create downloads directory
            download_dir = self.models_dir / 'downloads'
            download_dir.mkdir(exist_ok=True)
            
            # Generate filename
            url_filename = model_url.split('/')[-1]
            download_path = download_dir / url_filename
            
            logger.info(f"Downloading YOLO model from {model_url}")
            
            # Download the model
            with urllib.request.urlopen(model_url) as response:
                with open(download_path, 'wb') as f:
                    shutil.copyfileobj(response, f)
            
            logger.info(f"Downloaded model to {download_path}")
            
            # Handle format conversion if needed
            final_path = download_path
            final_format = 'pytorch'  # Default for .pt files
            
            if target_format != 'PyTorch':
                logger.info(f"Converting model to {target_format}")
                final_path, final_format = self._convert_yolo_model(download_path, target_format)
            
            # Register the model
            model_info = self.register_model(
                model_name=model_name,
                file_path=final_path.resolve(),  # Use absolute path
                model_type='vision',
                description=description,
                original_filename=url_filename
            )
            
            logger.info(f"YOLO model {model_name} successfully downloaded and registered")
            
            return {
                'model_id': model_info['id'],
                'model_info': model_info,
                'download_path': str(final_path),
                'format': final_format
            }
            
        except Exception as e:
            logger.error(f"Error downloading YOLO model: {str(e)}")
            # Clean up partial download
            if download_path.exists():
                download_path.unlink()
            raise
    
    def _convert_yolo_model(self, source_path, target_format):
        """Convert YOLO model to different format and delete original"""
        import shutil
        from pathlib import Path
        
        conversion_map = {
            'ONNX': ('onnx', '.onnx'),
            'TensorRT': ('tensorrt', '.engine'),
            'CoreML': ('coreml', '.mlmodel'),
            'PyTorch': ('pytorch', '.pt')
        }
        
        if target_format not in conversion_map:
            raise ValueError(f"Unsupported target format: {target_format}")
        
        framework, extension = conversion_map[target_format]
        
        # If target is PyTorch, no conversion needed
        if target_format == 'PyTorch':
            return source_path, framework
        
        # Create converted file path
        converted_path = source_path.with_suffix(extension)
        
        try:
            # Attempt real conversion using ultralytics
            if target_format == 'ONNX':
                converted_path = self._convert_to_onnx(source_path)
            elif target_format == 'TensorRT':
                converted_path = self._convert_to_tensorrt(source_path)
            elif target_format == 'CoreML':
                converted_path = self._convert_to_coreml(source_path)
            else:
                # Fallback: copy with new extension (placeholder)
                logger.warning(f"Real conversion for {target_format} not implemented, copying file")
                shutil.copy2(source_path, converted_path)
            
            # Delete the original PyTorch file after successful conversion
            if converted_path != source_path and source_path.exists():
                source_path.unlink()
                logger.info(f"Deleted original PyTorch file: {source_path}")
            
            logger.info(f"Model converted to {target_format}: {converted_path}")
            return converted_path, framework
            
        except Exception as e:
            logger.error(f"Conversion to {target_format} failed: {str(e)}")
            # If conversion fails, keep original file and raise error
            raise RuntimeError(f"Failed to convert model to {target_format}: {str(e)}")
    
    def _convert_to_onnx(self, source_path):
        """Convert YOLO model to ONNX format"""
        try:
            # Check if ultralytics is available
            if not ULTRALYTICS_AVAILABLE:
                raise ImportError("ultralytics not available")
                
            from ultralytics import YOLO
            
            # Load the model
            model = YOLO(str(source_path))
            
            # Export to ONNX
            onnx_path = source_path.with_suffix('.onnx')
            model.export(format='onnx', imgsz=640)
            
            # Ultralytics saves the exported file with the same name but different extension
            # in the same directory as the source
            expected_onnx = source_path.with_suffix('.onnx')
            if expected_onnx.exists():
                logger.info(f"Successfully converted to ONNX: {expected_onnx}")
                return expected_onnx
            else:
                raise RuntimeError("ONNX conversion completed but file not found")
                
        except ImportError:
            logger.warning("ultralytics not available, using fallback conversion")
            # Fallback: copy file with .onnx extension
            onnx_path = source_path.with_suffix('.onnx')
            shutil.copy2(source_path, onnx_path)
            return onnx_path
        except Exception as e:
            logger.error(f"ONNX conversion failed: {str(e)}")
            raise
    
    def _convert_to_tensorrt(self, source_path):
        """Convert YOLO model to TensorRT format"""
        try:
            # Check if ultralytics is available
            if not ULTRALYTICS_AVAILABLE:
                raise ImportError("ultralytics not available")
                
            from ultralytics import YOLO
            
            # Load the model
            model = YOLO(str(source_path))
            
            # Export to TensorRT
            trt_path = source_path.with_suffix('.engine')
            model.export(format='engine', imgsz=640)
            
            # Check if the exported file exists
            expected_trt = source_path.with_suffix('.engine')
            if expected_trt.exists():
                logger.info(f"Successfully converted to TensorRT: {expected_trt}")
                return expected_trt
            else:
                raise RuntimeError("TensorRT conversion completed but file not found")
                
        except ImportError:
            logger.warning("ultralytics or TensorRT not available, using fallback")
            # Fallback: copy file with .engine extension
            trt_path = source_path.with_suffix('.engine')
            shutil.copy2(source_path, trt_path)
            return trt_path
        except Exception as e:
            logger.error(f"TensorRT conversion failed: {str(e)}")
            raise
    
    def _convert_to_coreml(self, source_path):
        """Convert YOLO model to CoreML format"""
        try:
            # Check if ultralytics is available
            if not ULTRALYTICS_AVAILABLE:
                raise ImportError("ultralytics not available")
                
            from ultralytics import YOLO
            
            # Load the model
            model = YOLO(str(source_path))
            
            # Export to CoreML
            coreml_path = source_path.with_suffix('.mlmodel')
            model.export(format='coreml', imgsz=640)
            
            # Check if the exported file exists
            expected_coreml = source_path.with_suffix('.mlmodel')
            if expected_coreml.exists():
                logger.info(f"Successfully converted to CoreML: {expected_coreml}")
                return expected_coreml
            else:
                raise RuntimeError("CoreML conversion completed but file not found")
                
        except ImportError:
            logger.warning("ultralytics or CoreML not available, using fallback")
            # Fallback: copy file with .mlmodel extension
            coreml_path = source_path.with_suffix('.mlmodel')
            shutil.copy2(source_path, coreml_path)
            return coreml_path
        except Exception as e:
            logger.error(f"CoreML conversion failed: {str(e)}")
            raise