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
except (ImportError, AttributeError, TypeError) as e:
    TF_AVAILABLE = False
    # Skip TensorFlow due to NumPy compatibility issues

try:
    from ultralytics import YOLO
    ULTRALYTICS_AVAILABLE = True
except ImportError:
    ULTRALYTICS_AVAILABLE = False

# Import garbage collection for memory management
import gc

logger = logging.getLogger(__name__)

class CUDAMemoryManager:
    """Manages CUDA memory for Jetson devices with limited GPU memory"""
    
    @staticmethod
    def get_gpu_memory_info():
        """Get current GPU memory usage"""
        if not TORCH_AVAILABLE or not torch.cuda.is_available():
            return {"total": 0, "allocated": 0, "free": 0}
        
        try:
            allocated = torch.cuda.memory_allocated()
            total = torch.cuda.get_device_properties(0).total_memory
            free = total - allocated
            return {
                "total": total,
                "allocated": allocated, 
                "free": free,
                "total_gb": total / (1024**3),
                "allocated_gb": allocated / (1024**3),
                "free_gb": free / (1024**3)
            }
        except Exception as e:
            logger.error(f"Error getting GPU memory info: {e}")
            return {"total": 0, "allocated": 0, "free": 0}
    
    @staticmethod
    def clear_cuda_cache():
        """Clear CUDA cache to free up GPU memory"""
        if TORCH_AVAILABLE and torch.cuda.is_available():
            try:
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
                logger.info("CUDA cache cleared")
            except Exception as e:
                logger.error(f"Error clearing CUDA cache: {e}")
        
        # Force garbage collection
        gc.collect()
    
    @staticmethod
    def check_memory_available(required_mb=1024):
        """Check if enough GPU memory is available for model loading"""
        mem_info = CUDAMemoryManager.get_gpu_memory_info()
        free_mb = mem_info.get("free", 0) / (1024**2)
        
        if free_mb < required_mb:
            logger.warning(f"Low GPU memory: {free_mb:.1f}MB free, {required_mb}MB required")
            return False
        return True

class AIModelManager:
    def __init__(self, models_dir='../models'):
        self.models_dir = Path(models_dir)
        self.models_dir.mkdir(exist_ok=True)
        self.models_registry = {}
        self.loaded_models = {}
        self.registry_file = self.models_dir / 'models_registry.json'
        self.memory_manager = CUDAMemoryManager()
        self._load_registry()
        
        # Log initial GPU memory status
        mem_info = self.memory_manager.get_gpu_memory_info()
        if mem_info.get("total", 0) > 0:
            logger.info(f"GPU Memory - Total: {mem_info.get('total_gb', 0):.1f}GB, Free: {mem_info.get('free_gb', 0):.1f}GB")
        
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
    
    def register_model(self, model_name, file_path, model_type='vision', original_filename=''):
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
                # Check actual loaded state (not just registry flag)
                model_copy['loaded'] = model_id in self.loaded_models
                
                # Update registry if it's out of sync
                if self.models_registry[model_id]['loaded'] != model_copy['loaded']:
                    self.models_registry[model_id]['loaded'] = model_copy['loaded']
                    self._save_registry()
                    logger.info(f"Updated registry for model {model_id}: loaded={model_copy['loaded']}")
                
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
        
        # Check memory before loading
        mem_info = self.memory_manager.get_gpu_memory_info()
        if mem_info.get("total", 0) > 0:
            logger.info(f"Pre-load GPU Memory - Free: {mem_info.get('free_gb', 0):.1f}GB")
            
            # Clear cache before loading to maximize available memory
            self.memory_manager.clear_cuda_cache()
            
            # Check if we have enough memory (estimate 1GB needed for most models)
            if not self.memory_manager.check_memory_available(1024):
                # Try to free up memory by unloading other models
                if self.loaded_models:
                    logger.info("Low memory detected, attempting to unload other models")
                    for other_id in list(self.loaded_models.keys()):
                        if other_id != model_id:
                            try:
                                self.unload_model(other_id)
                                logger.info(f"Unloaded model {other_id} to free memory")
                            except Exception as e:
                                logger.error(f"Failed to unload {other_id}: {e}")
        
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
            
            # Log memory usage after loading
            mem_info = self.memory_manager.get_gpu_memory_info()
            if mem_info.get("total", 0) > 0:
                logger.info(f"Post-load GPU Memory - Free: {mem_info.get('free_gb', 0):.1f}GB")
            
            logger.info(f"Model {model_id} loaded in {load_time:.2f}s")
            
            return {
                "status": "loaded",
                "model_id": model_id,
                "load_time": load_time,
                "framework": framework
            }
            
        except Exception as e:
            # Clean up any partial state on error
            if model_id in self.loaded_models:
                del self.loaded_models[model_id]
            
            # Ensure registry reflects the failed state
            self.models_registry[model_id]['loaded'] = False
            self._save_registry()
            
            # Clear CUDA cache after failed load to free any allocated memory
            self.memory_manager.clear_cuda_cache()
            
            logger.error(f"Error loading model {model_id}: {str(e)}")
            raise RuntimeError(f"Failed to load model {model_id}: {str(e)}")
    
    def _load_onnx_model(self, file_path):
        """Load an ONNX model"""
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
        session = ort.InferenceSession(file_path, providers=providers)
        return session
    
    def _load_tensorrt_model(self, file_path):
        """Load a TensorRT model using ultralytics YOLO with memory optimization"""
        try:
            if not ULTRALYTICS_AVAILABLE:
                raise ImportError("ultralytics not available for TensorRT loading")
            
            from ultralytics import YOLO
            
            # Check available memory before loading
            mem_info = self.memory_manager.get_gpu_memory_info()
            if mem_info.get("total", 0) > 0 and mem_info.get("free_gb", 0) < 1.0:
                logger.warning(f"Low GPU memory ({mem_info.get('free_gb', 0):.1f}GB) for TensorRT loading")
                # Clear cache before attempting to load
                self.memory_manager.clear_cuda_cache()
            
            # Load TensorRT engine with ultralytics
            model = YOLO(str(file_path))
            
            logger.info(f"TensorRT model loaded successfully: {file_path}")
            
            # Log memory usage after loading
            mem_info_after = self.memory_manager.get_gpu_memory_info()
            if mem_info_after.get("total", 0) > 0:
                logger.info(f"TensorRT loading used {mem_info.get('free_gb', 0) - mem_info_after.get('free_gb', 0):.2f}GB GPU memory")
            
            return model
            
        except Exception as e:
            logger.error(f"Failed to load TensorRT model: {str(e)}")
            # Clear cache on failure
            self.memory_manager.clear_cuda_cache()
            raise RuntimeError(f"Cannot load TensorRT model: {str(e)}")
    
    def _load_pytorch_model(self, file_path):
        """Load a PyTorch model using ultralytics YOLO if it's a YOLO model, otherwise use standard PyTorch loading"""
        try:
            # First try loading as YOLO model
            if ULTRALYTICS_AVAILABLE:
                from ultralytics import YOLO
                model = YOLO(str(file_path))
                logger.info(f"YOLO PyTorch model loaded successfully: {file_path}")
                return model
            else:
                # Fallback to standard PyTorch loading
                if not TORCH_AVAILABLE:
                    raise ImportError("PyTorch not available for model loading")
                    
                device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
                model = torch.load(file_path, map_location=device)
                
                # Set to evaluation mode for standard PyTorch models
                if hasattr(model, 'eval'):
                    model.eval()
                    
                logger.info(f"Standard PyTorch model loaded successfully: {file_path}")
                return model
        except Exception as e:
            logger.error(f"Failed to load PyTorch model: {str(e)}")
            raise RuntimeError(f"Cannot load PyTorch model: {str(e)}")
            raise RuntimeError(f"Cannot load PyTorch model: {str(e)}")
    
    def _load_onnx_model(self, file_path):
        """Load an ONNX model"""
        try:
            # First try loading as YOLO ONNX model
            if ULTRALYTICS_AVAILABLE:
                from ultralytics import YOLO
                model = YOLO(str(file_path))
                logger.info(f"YOLO ONNX model loaded successfully: {file_path}")
                return model
            elif ONNX_AVAILABLE:
                # Fallback to ONNX Runtime
                session = ort.InferenceSession(str(file_path))
                logger.info(f"ONNX model loaded successfully: {file_path}")
                return session
            else:
                raise ImportError("No ONNX loading library available")
        except Exception as e:
            logger.error(f"Failed to load ONNX model: {str(e)}")
            raise RuntimeError(f"Cannot load ONNX model: {str(e)}")
    
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
        try:
            # Log memory before unload
            mem_info = self.memory_manager.get_gpu_memory_info()
            if mem_info.get("total", 0) > 0:
                logger.info(f"Pre-unload GPU Memory - Free: {mem_info.get('free_gb', 0):.1f}GB")
            
            # Remove from loaded models if it exists
            if model_id in self.loaded_models:
                # Get the model reference for proper cleanup
                model_data = self.loaded_models[model_id]
                model = model_data.get('model')
                
                # Framework-specific cleanup
                if hasattr(model, 'cpu'):  # PyTorch models
                    try:
                        model.cpu()
                        del model
                    except Exception as e:
                        logger.warning(f"Error moving model to CPU: {e}")
                
                del self.loaded_models[model_id]
                logger.info(f"Model {model_id} unloaded from memory")
            
            # Clear CUDA cache after unloading
            self.memory_manager.clear_cuda_cache()
            
            # Update registry status
            if model_id in self.models_registry:
                self.models_registry[model_id]['loaded'] = False
                self._save_registry()
                logger.info(f"Model {model_id} registry updated to unloaded state")
                
                # Log memory after cleanup
                mem_info = self.memory_manager.get_gpu_memory_info()
                if mem_info.get("total", 0) > 0:
                    logger.info(f"Post-unload GPU Memory - Free: {mem_info.get('free_gb', 0):.1f}GB")
                
                return True
            else:
                logger.warning(f"Model {model_id} not found in registry")
                return False
                
        except Exception as e:
            logger.error(f"Error unloading model {model_id}: {str(e)}")
            # Force cleanup even if there's an error
            if model_id in self.loaded_models:
                del self.loaded_models[model_id]
            if model_id in self.models_registry:
                self.models_registry[model_id]['loaded'] = False
                self._save_registry()
            
            # Always clear cache on error
            self.memory_manager.clear_cuda_cache()
            return False
    
    def force_reload_model(self, model_id):
        """Force reload a model by first unloading it completely"""
        logger.info(f"Force reloading model {model_id}")
        
        # Force unload first
        self.unload_model(model_id)
        
        # Clear any lingering state
        if model_id in self.loaded_models:
            del self.loaded_models[model_id]
        
        # Force clear CUDA cache before reload
        self.memory_manager.clear_cuda_cache()
        
        # Wait a moment for cleanup to complete
        time.sleep(1)
        
        # Now try to load
        return self.load_model(model_id)
    
    def emergency_cleanup(self):
        """Emergency cleanup to free all GPU memory"""
        logger.warning("Performing emergency cleanup - unloading all models")
        
        # Store list of loaded models to avoid modification during iteration
        loaded_model_ids = list(self.loaded_models.keys())
        
        # Unload all models
        for model_id in loaded_model_ids:
            try:
                self.unload_model(model_id)
            except Exception as e:
                logger.error(f"Error during emergency unload of {model_id}: {e}")
        
        # Clear all references
        self.loaded_models.clear()
        
        # Update registry
        for model_id in self.models_registry:
            self.models_registry[model_id]['loaded'] = False
        self._save_registry()
        
        # Force aggressive cleanup
        self.memory_manager.clear_cuda_cache()
        
        # Force garbage collection
        import gc
        gc.collect()
        
        # Log memory status after cleanup
        mem_info = self.memory_manager.get_gpu_memory_info()
        if mem_info.get("total", 0) > 0:
            logger.info(f"Emergency cleanup completed - Free GPU Memory: {mem_info.get('free_gb', 0):.1f}GB")
        
        return True

    def run_inference(self, model_id, image):
        """Run inference on an image"""
        if model_id not in self.loaded_models:
            raise ValueError(f"Model {model_id} not loaded")
        
        model_data = self.loaded_models[model_id]
        model = model_data['model']
        model_info = model_data['info']
        framework = model_info['framework']
        
        # Log memory usage before inference
        mem_info = self.memory_manager.get_gpu_memory_info()
        if mem_info.get("total", 0) > 0:
            logger.info(f"Pre-inference GPU Memory - Free: {mem_info.get('free_gb', 0):.1f}GB")
            
            # Check if we have enough memory for inference (minimum 512MB free)
            if not self.memory_manager.check_memory_available(512):
                logger.warning("Low GPU memory detected before inference, clearing cache")
                self.memory_manager.clear_cuda_cache()
                
                # Check again after clearing cache
                mem_info = self.memory_manager.get_gpu_memory_info()
                if not self.memory_manager.check_memory_available(256):
                    raise RuntimeError("Insufficient GPU memory for inference. Please restart the service.")
        
        # Preprocess image to reduce memory usage
        try:
            # Limit image size to prevent memory overflow on Jetson devices
            height, width = image.shape[:2]
            max_size = 1024  # Maximum dimension
            
            if max(height, width) > max_size:
                if width > height:
                    new_width = max_size
                    new_height = int(height * (max_size / width))
                else:
                    new_height = max_size
                    new_width = int(width * (max_size / height))
                
                image = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
                logger.info(f"Resized image from {width}x{height} to {new_width}x{new_height} to save memory")
        
        except Exception as e:
            logger.error(f"Error preprocessing image: {e}")
            # Continue with original image if resize fails
        
        start_time = time.time()
        
        try:
            # Check if it's a YOLO model (works for all formats when loaded with ultralytics)
            if hasattr(model, 'predict'):  # YOLO model from ultralytics
                result = self._run_yolo_inference(model, image)
            elif framework == 'onnx':
                result = self._run_onnx_inference(model, image)
            elif framework == 'pytorch':
                result = self._run_pytorch_inference(model, image)
            elif framework == 'tensorrt':
                result = self._run_tensorrt_inference(model, image)
            elif framework == 'tensorflow':
                result = self._run_tensorflow_inference(model, image)
            else:
                raise ValueError(f"Inference not implemented for framework: {framework}")
            
            inference_time = time.time() - start_time
            
            # Update usage statistics
            self.models_registry[model_id]['last_used'] = datetime.now().isoformat()
            self.models_registry[model_id]['inference_count'] += 1
            self._save_registry()
            
            # Clear CUDA cache after inference to prevent memory buildup
            self.memory_manager.clear_cuda_cache()
            
            # Log memory usage after inference
            mem_info = self.memory_manager.get_gpu_memory_info()
            if mem_info.get("total", 0) > 0:
                logger.info(f"Post-inference GPU Memory - Free: {mem_info.get('free_gb', 0):.1f}GB")
            
            logger.info(f"Inference completed for {model_id} in {inference_time:.3f}s")
            
            return {
                'predictions': result,
                'inference_time': inference_time,
                'model_id': model_id,
                'framework': framework
            }
            
        except Exception as e:
            # Clear cache on error to prevent memory leaks
            self.memory_manager.clear_cuda_cache()
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
    
    def _run_yolo_inference(self, model, image):
        """Run YOLO model inference using ultralytics with memory optimization"""
        try:
            # Set device to CPU if GPU memory is critical
            mem_info = self.memory_manager.get_gpu_memory_info()
            use_cpu = False
            
            if mem_info.get("total", 0) > 0 and mem_info.get("free_gb", 0) < 0.5:  # Less than 512MB free
                logger.warning("Critical GPU memory detected, forcing CPU inference")
                use_cpu = True
            
            # Run inference with memory optimizations
            if use_cpu:
                # Force CPU inference
                results = model(image, device='cpu', verbose=False, half=False)
            else:
                # GPU inference with optimizations
                results = model(image, verbose=False, half=False, imgsz=640)  # Limit image size
            
            # Extract predictions
            predictions = []
            
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    # Convert to CPU immediately to free GPU memory
                    boxes_cpu = boxes.cpu()
                    
                    for i in range(len(boxes_cpu)):
                        # Get box coordinates, confidence, and class
                        box = boxes_cpu.xywh[i].numpy()  # x, y, w, h
                        conf = float(boxes_cpu.conf[i].numpy())
                        cls = int(boxes_cpu.cls[i].numpy())
                        
                        # Get class name if available
                        class_name = model.names.get(cls, f'class_{cls}') if hasattr(model, 'names') else f'class_{cls}'
                        
                        predictions.append({
                            'class_id': cls,
                            'class': class_name,
                            'confidence': conf,
                            'bbox': {
                                'x': float(box[0]),
                                'y': float(box[1]),
                                'width': float(box[2]),
                                'height': float(box[3])
                            }
                        })
            
            # Sort by confidence
            predictions.sort(key=lambda x: x['confidence'], reverse=True)
            
            # Clear any temporary GPU tensors
            if TORCH_AVAILABLE and torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            return predictions
            
        except Exception as e:
            logger.error(f"YOLO inference error: {str(e)}")
            # Try to recover by clearing cache and forcing CPU
            self.memory_manager.clear_cuda_cache()
            raise RuntimeError(f"YOLO inference failed: {str(e)}")
    
    def _run_tensorrt_inference(self, model, image):
        """Run TensorRT model inference (using YOLO if applicable)"""
        # Since we're loading TensorRT models with ultralytics, use YOLO inference
        return self._run_yolo_inference(model, image)
    
    def _run_onnx_inference(self, model, image):
        """Run ONNX model inference"""
        # Check if it's a YOLO model loaded with ultralytics
        if hasattr(model, 'predict'):
            return self._run_yolo_inference(model, image)
        
        # Standard ONNX Runtime inference
        try:
            # Preprocess image
            input_image = self._preprocess_image(image)
            
            # Get input name
            input_name = model.get_inputs()[0].name
            
            # Run inference
            outputs = model.run(None, {input_name: input_image})
            
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
        except Exception as e:
            logger.error(f"ONNX inference error: {str(e)}")
            raise RuntimeError(f"ONNX inference failed: {str(e)}")
    
    def _run_pytorch_inference(self, model, image):
        """Run PyTorch model inference"""
        # Check if it's a YOLO model loaded with ultralytics
        if hasattr(model, 'predict'):
            return self._run_yolo_inference(model, image)
        
        # Standard PyTorch inference
        try:
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
        except Exception as e:
            logger.error(f"PyTorch inference error: {str(e)}")
            raise RuntimeError(f"PyTorch inference failed: {str(e)}")
    
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

    def download_yolo_model(self, model_url, model_name, target_format='PyTorch'):
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
    
    def _cleanup_intermediate_files(self, source_path, target_format, final_path):
        """Clean up intermediate files created during model conversion"""
        base_path = source_path.with_suffix('')
        
        # Only clean up intermediate files for specific conversion scenarios
        # Be very conservative to avoid deleting legitimate model files
        
        if target_format == 'TensorRT':
            # For TensorRT conversion, only clean up ONNX if:
            # 1. We started from PT and ended with .engine
            # 2. The ONNX file has the same base name as source
            # 3. The ONNX was likely created as an intermediate step
            intermediate_onnx = base_path.with_suffix('.onnx')
            
            if (source_path.suffix.lower() == '.pt' and 
                final_path.suffix.lower() == '.engine' and
                intermediate_onnx.exists() and
                intermediate_onnx != final_path and 
                intermediate_onnx != source_path):
                
                # Double-check this is likely an intermediate file by checking timestamps
                # Only delete if ONNX is newer than source (likely just created)
                try:
                    source_time = source_path.stat().st_mtime
                    onnx_time = intermediate_onnx.stat().st_mtime
                    
                    if onnx_time >= source_time:
                        intermediate_onnx.unlink()
                        logger.info(f"Cleaned up intermediate ONNX file from TensorRT conversion: {intermediate_onnx}")
                    else:
                        logger.info(f"Keeping existing ONNX file (older than source): {intermediate_onnx}")
                except Exception as e:
                    logger.warning(f"Failed to check timestamps, keeping ONNX file: {e}")
        
        # For other formats, be even more conservative - only clean up clearly temporary files
        elif target_format in ['CoreML', 'TensorFlow']:
            temp_extensions = ['.torchscript', '.pb', '.tflite']
            for ext in temp_extensions:
                temp_file = base_path.with_suffix(ext)
                if (temp_file.exists() and 
                    temp_file != final_path and 
                    temp_file != source_path):
                    try:
                        temp_file.unlink()
                        logger.info(f"Cleaned up temporary file: {temp_file}")
                    except Exception as e:
                        logger.warning(f"Failed to clean up temporary file {temp_file}: {e}")
        
        # Never clean up .onnx files for ONNX target format or other scenarios
    
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
            
            # Clean up any intermediate files created during conversion
            self._cleanup_intermediate_files(source_path, target_format, converted_path)
            
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
            model.export(format='onnx')
            
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
        """Convert YOLO model to TensorRT format using ultralytics"""
        try:
            # Check if ultralytics is available
            if not ULTRALYTICS_AVAILABLE:
                raise ImportError("ultralytics not available")
                
            from ultralytics import YOLO
            
            # Load the model
            model = YOLO(str(source_path))
            
            # Export to TensorRT with memory optimizations for Jetson
            logger.info("Converting to TensorRT with optimized settings for Jetson...")
            
            # Keep track of intermediate ONNX file for cleanup
            intermediate_onnx = source_path.with_suffix('.onnx')
            
            try:
                # First attempt with moderate settings
                model.export(
                    format='engine',
		            verbose=True
                )
            except Exception as e:
                raise e
            
            # Check if the exported file exists
            expected_trt = source_path.with_suffix('.engine')
            if expected_trt.exists():
                logger.info(f"Successfully converted to TensorRT: {expected_trt}")
                
                # Clean up intermediate ONNX file if it exists
                if intermediate_onnx.exists():
                    intermediate_onnx.unlink()
                    logger.info(f"Cleaned up intermediate ONNX file: {intermediate_onnx}")
                
                return expected_trt
            else:
                raise RuntimeError("TensorRT conversion completed but engine file not found")
                
        except ImportError:
            logger.warning("ultralytics not available for TensorRT conversion")
            raise RuntimeError("Cannot convert to TensorRT: ultralytics not available")
        except Exception as e:
            logger.error(f"TensorRT conversion failed: {str(e)}")
            if "memory" in str(e).lower():
                raise RuntimeError(f"TensorRT conversion failed due to insufficient GPU memory. Consider using ONNX format for CPU inference instead. Error: {str(e)}")
            else:
                raise RuntimeError(f"Failed to convert to TensorRT: {str(e)}")
    
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
            model.export(format='coreml')
            
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
