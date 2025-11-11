#!/usr/bin/env python3
"""
AI Model Manager for Jetson Edge AI Dashboard
Handles model loading, inference, and management
"""

import os
import json
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
    """Enhanced CUDA memory manager for Jetson devices with limited GPU memory"""
    
    def __init__(self):
        self.memory_threshold_critical = 0.9  # 90% memory usage triggers emergency cleanup
        self.memory_threshold_warning = 0.8   # 80% memory usage triggers warnings
        self.min_free_memory_mb = 256         # Minimum free memory to maintain
        
    def get_gpu_memory_info(self):
        """Get current GPU memory usage with percentage calculations"""
        if not TORCH_AVAILABLE or not torch.cuda.is_available():
            return {"total": 0, "allocated": 0, "free": 0, "usage_percent": 0}
        
        try:
            allocated = torch.cuda.memory_allocated()
            cached = torch.cuda.memory_cached()
            total = torch.cuda.get_device_properties(0).total_memory
            free = total - allocated
            usage_percent = (allocated / total) * 100 if total > 0 else 0
            
            return {
                "total": total,
                "allocated": allocated,
                "cached": cached, 
                "free": free,
                "total_gb": total / (1024**3),
                "allocated_gb": allocated / (1024**3),
                "cached_gb": cached / (1024**3),
                "free_gb": free / (1024**3),
                "usage_percent": usage_percent
            }
        except Exception as e:
            logger.error(f"Error getting GPU memory info: {e}")
            return {"total": 0, "allocated": 0, "free": 0, "usage_percent": 0}
    
    def clear_cuda_cache(self, aggressive=False):
        """Clear CUDA cache to free up GPU memory"""
        if TORCH_AVAILABLE and torch.cuda.is_available():
            try:
                if aggressive:
                    # More aggressive cleanup
                    torch.cuda.empty_cache()
                    torch.cuda.synchronize()
                    torch.cuda.reset_peak_memory_stats()
                    # Clear all cached tensors
                    for i in range(torch.cuda.device_count()):
                        with torch.cuda.device(i):
                            torch.cuda.empty_cache()
                else:
                    torch.cuda.empty_cache()
                    torch.cuda.synchronize()
                
                logger.info(f"CUDA cache cleared ({'aggressive' if aggressive else 'normal'})")
            except Exception as e:
                logger.error(f"Error clearing CUDA cache: {e}")
        
        # Force Python garbage collection
        for _ in range(3):  # Multiple GC cycles for better cleanup
            gc.collect()
    
    def check_memory_available(self, required_mb=1024):
        """Check if enough GPU memory is available"""
        mem_info = self.get_gpu_memory_info()
        free_mb = mem_info.get("free", 0) / (1024**2)
        usage_percent = mem_info.get("usage_percent", 0)
        
        if usage_percent > (self.memory_threshold_critical * 100):
            logger.error(f"Critical GPU memory usage: {usage_percent:.1f}%")
            return False
        
        if free_mb < required_mb:
            logger.warning(f"Low GPU memory: {free_mb:.1f}MB free, {required_mb}MB required")
            return False
            
        return True
    
    def force_memory_cleanup(self):
        """Force aggressive memory cleanup"""
        logger.warning("Forcing aggressive GPU memory cleanup")
        
        # Multiple rounds of aggressive cleanup
        for i in range(3):
            self.clear_cuda_cache(aggressive=True)
            
            # Additional PyTorch cleanup
            if TORCH_AVAILABLE and torch.cuda.is_available():
                try:
                    torch.cuda.ipc_collect()
                except:
                    pass
        
        # Log memory status after cleanup
        mem_info = self.get_gpu_memory_info()
        logger.info(f"Post-cleanup GPU memory: {mem_info.get('free_gb', 0):.1f}GB free ({mem_info.get('usage_percent', 0):.1f}% used)")
        
        return mem_info
    
    def monitor_and_cleanup_if_needed(self):
        """Monitor memory and perform cleanup if thresholds are exceeded"""
        mem_info = self.get_gpu_memory_info()
        usage_percent = mem_info.get("usage_percent", 0)
        
        if usage_percent > (self.memory_threshold_critical * 100):
            logger.warning(f"Critical memory usage detected: {usage_percent:.1f}%")
            return self.force_memory_cleanup()
        elif usage_percent > (self.memory_threshold_warning * 100):
            logger.info(f"High memory usage detected: {usage_percent:.1f}%, performing cleanup")
            self.clear_cuda_cache(aggressive=False)
            return self.get_gpu_memory_info()
        
        return mem_info

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
                
                # Migrate UUID-based models to name-based IDs
                self._migrate_uuid_models()
                
                logger.info(f"Loaded {len(self.models_registry)} models from registry")
        except Exception as e:
            logger.error(f"Error loading models registry: {str(e)}")
            self.models_registry = {}
    
    def _migrate_uuid_models(self):
        """Migrate models with UUID IDs to use model names as IDs"""
        uuid_models = {}
        name_models = {}
        
        for model_id, model_info in self.models_registry.items():
            # Check if this looks like a UUID (36 characters with hyphens)
            if len(model_id) == 36 and model_id.count('-') == 4:
                # This is likely a UUID, migrate to name-based ID
                new_id = model_info['name']
                
                # Handle name conflicts by appending a number
                counter = 1
                original_name = new_id
                while new_id in name_models or new_id in self.models_registry:
                    counter += 1
                    new_id = f"{original_name}_{counter}"
                
                # Update the model info
                model_info['id'] = new_id
                name_models[new_id] = model_info
                
                logger.info(f"Migrated model '{model_info['name']}' from UUID {model_id} to name-based ID '{new_id}'")
            else:
                # Already using name-based ID
                name_models[model_id] = model_info
        
        # Update the registry with migrated models
        if len(name_models) != len(self.models_registry):
            self.models_registry = name_models
            self._save_registry()
            logger.info("Model registry migration completed")
    
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
    
    def _validate_model_name(self, model_name):
        """Validate that a model name is safe to use as an ID"""
        import re
        
        # Remove leading/trailing whitespace
        model_name = model_name.strip()
        
        # Check for empty name
        if not model_name:
            raise ValueError("Model name cannot be empty")
        
        # Check length
        if len(model_name) > 100:
            raise ValueError("Model name must be 100 characters or less")
        
        # Check for invalid characters (allow alphanumeric, spaces, hyphens, underscores)
        if not re.match(r'^[a-zA-Z0-9\s\-_]+$', model_name):
            raise ValueError("Model name can only contain letters, numbers, spaces, hyphens, and underscores")
        
        return model_name
    
    def register_model(self, model_name, file_path, model_type='vision', original_filename=''):
        """Register a new model in the system"""
        # Validate and clean the model name
        model_name = self._validate_model_name(model_name)
        
        # Use model name as ID (ensure it's safe for use as an identifier)
        model_id = model_name.strip()
        
        # Check if model name already exists
        if model_id in self.models_registry:
            raise ValueError(f"Model with name '{model_name}' already exists. Please use a different name.")
        
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
        
        logger.info(f"Registered model: {model_name}")
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
        
        # Store original image dimensions before any processing
        original_height, original_width = image.shape[:2]
        logger.info(f"Original image dimensions: {original_width}x{original_height}")
        
        # Monitor and cleanup memory before inference
        mem_info = self.memory_manager.monitor_and_cleanup_if_needed()
        logger.info(f"Pre-inference GPU Memory - Free: {mem_info.get('free_gb', 0):.1f}GB ({mem_info.get('usage_percent', 0):.1f}% used)")
        
        # Check if we have enough memory for inference
        if not self.memory_manager.check_memory_available(256):
            logger.warning("Insufficient GPU memory detected, attempting cleanup")
            
            # Try aggressive cleanup first
            self.memory_manager.force_memory_cleanup()
            
            # Check again after cleanup
            if not self.memory_manager.check_memory_available(128):
                # Last resort: unload other models
                other_models = [mid for mid in self.loaded_models.keys() if mid != model_id]
                if other_models:
                    logger.warning(f"Unloading {len(other_models)} other models to free memory")
                    for other_id in other_models:
                        try:
                            self.unload_model(other_id)
                        except Exception as e:
                            logger.error(f"Failed to unload {other_id}: {e}")
                
                # Final check
                if not self.memory_manager.check_memory_available(128):
                    raise RuntimeError("Critical GPU memory shortage. Cannot perform inference.")
        
        # Store the processed image (potentially resized) and scale factor
        processed_image = image.copy()
        scale_factor_x = 1.0
        scale_factor_y = 1.0
        
        # Preprocess image to reduce memory usage
        try:
            # Adaptive image resizing based on available memory
            height, width = image.shape[:2]
            mem_info = self.memory_manager.get_gpu_memory_info()
            free_gb = mem_info.get('free_gb', 0)
            
            # Adjust max size based on available memory
            if free_gb < 0.5:  # Less than 500MB
                max_size = 640
            elif free_gb < 1.0:  # Less than 1GB
                max_size = 832
            else:
                max_size = 1024
            
            if max(height, width) > max_size:
                if width > height:
                    new_width = max_size
                    new_height = int(height * (max_size / width))
                else:
                    new_height = max_size
                    new_width = int(width * (max_size / height))
                
                processed_image = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
                scale_factor_x = original_width / new_width
                scale_factor_y = original_height / new_height
                logger.info(f"Resized image from {width}x{height} to {new_width}x{new_height} (max_size={max_size} based on {free_gb:.1f}GB free)")
                logger.info(f"Scale factors: x={scale_factor_x:.3f}, y={scale_factor_y:.3f}")
        
        except Exception as e:
            logger.error(f"Error preprocessing image: {e}")
            # Continue with original image if resize fails
        
        start_time = time.time()
        
        # Wrap inference execution with memory monitoring
        try:
            # Monitor memory before execution
            pre_mem = self.memory_manager.get_gpu_memory_info()
            
            # Check if it's a YOLO model (works for all formats when loaded with ultralytics)
            if hasattr(model, 'predict'):  # YOLO model from ultralytics
                result = self._run_yolo_inference(model, processed_image, original_width, original_height, scale_factor_x, scale_factor_y)
            elif framework == 'onnx':
                result = self._run_onnx_inference(model, processed_image)
            elif framework == 'pytorch':
                result = self._run_pytorch_inference(model, processed_image)
            elif framework == 'tensorrt':
                result = self._run_tensorrt_inference(model, processed_image)
            elif framework == 'tensorflow':
                result = self._run_tensorflow_inference(model, processed_image)
            else:
                raise ValueError(f"Inference not implemented for framework: {framework}")
            
            inference_time = time.time() - start_time
            
            # Update usage statistics
            self.models_registry[model_id]['last_used'] = datetime.now().isoformat()
            self.models_registry[model_id]['inference_count'] += 1
            self._save_registry()
            
            # Monitor memory after inference and cleanup if needed
            post_mem = self.memory_manager.monitor_and_cleanup_if_needed()
            
            logger.info(f"Inference completed for {model_id} in {inference_time:.3f}s - Memory: {post_mem.get('free_gb', 0):.1f}GB free")
            
            return {
                'predictions': result,
                'inference_time': inference_time,
                'model_id': model_id,
                'framework': framework,
                'memory_info': {
                    'pre_inference_free_gb': pre_mem.get('free_gb', 0),
                    'post_inference_free_gb': post_mem.get('free_gb', 0),
                    'usage_percent': post_mem.get('usage_percent', 0)
                }
            }
            
        except RuntimeError as e:
            error_msg = str(e)
            # Handle CUDA out of memory specifically
            if "out of memory" in error_msg.lower() or "cuda" in error_msg.lower():
                logger.error(f"CUDA memory error during inference: {error_msg}")
                
                # Emergency cleanup
                self.memory_manager.force_memory_cleanup()
                
                # Try CPU fallback for YOLO models
                if hasattr(model, 'predict'):
                    logger.warning("Attempting CPU fallback for inference")
                    try:
                        result = self._run_yolo_inference_cpu(model, processed_image, original_width, original_height, scale_factor_x, scale_factor_y)
                        inference_time = time.time() - start_time
                        
                        # Still update statistics
                        self.models_registry[model_id]['last_used'] = datetime.now().isoformat()
                        self.models_registry[model_id]['inference_count'] += 1
                        self._save_registry()
                        
                        return {
                            'predictions': result,
                            'inference_time': inference_time,
                            'model_id': model_id,
                            'framework': framework + '_cpu_fallback',
                            'warning': 'Inference performed on CPU due to GPU memory constraints'
                        }
                    except Exception as fallback_error:
                        logger.error(f"CPU fallback failed: {fallback_error}")
                        raise RuntimeError(f"GPU memory exhausted and CPU fallback failed: {fallback_error}")
                
                raise RuntimeError(f"GPU memory exhausted during inference: {error_msg}")
            else:
                raise
        
        except Exception as e:
            # Clear cache on any error to prevent memory leaks
            self.memory_manager.clear_cuda_cache(aggressive=True)
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
    
    def _run_yolo_inference(self, model, image, original_width, original_height, scale_factor_x=1.0, scale_factor_y=1.0):
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
                # GPU inference with optimizations - don't force imgsz to let YOLO handle it
                results = model(image, verbose=False, half=False)
            
            # Extract predictions
            predictions = []
            
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    # Convert to CPU immediately to free GPU memory
                    boxes_cpu = boxes.cpu()
                    
                    # Log the image shapes for debugging
                    logger.info(f"YOLO result - orig_shape: {result.orig_shape}, processed image shape: {image.shape[:2]}")
                    logger.info(f"Original image dimensions: {original_width}x{original_height}, scale factors: {scale_factor_x:.3f}x{scale_factor_y:.3f}")
                    
                    for i in range(len(boxes_cpu)):
                        # Get box coordinates, confidence, and class
                        box = boxes_cpu.xywh[i].numpy()  # x, y, w, h in pixels relative to the processed image
                        conf = float(boxes_cpu.conf[i].numpy())
                        cls = int(boxes_cpu.cls[i].numpy())
                        
                        # Scale coordinates back to original image dimensions
                        x_center = float(box[0]) * scale_factor_x  # center x in original image pixels
                        y_center = float(box[1]) * scale_factor_y  # center y in original image pixels
                        width = float(box[2]) * scale_factor_x     # width in original image pixels
                        height = float(box[3]) * scale_factor_y   # height in original image pixels
                        
                        # Get class name if available
                        class_name = model.names.get(cls, f'class_{cls}') if hasattr(model, 'names') else f'class_{cls}'
                        
                        predictions.append({
                            'class_id': cls,
                            'class': class_name,
                            'confidence': conf,
                            'bbox': {
                                'x': x_center,
                                'y': y_center,
                                'width': width,
                                'height': height
                            }
                        })
            
            # Sort by confidence
            predictions.sort(key=lambda x: x['confidence'], reverse=True)
            
            # Clear any temporary GPU tensors
            if TORCH_AVAILABLE and torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            logger.info(f"Generated {len(predictions)} predictions with coordinates scaled to original image {original_width}x{original_height}")
            
            return predictions
            
        except Exception as e:
            logger.error(f"YOLO inference error: {str(e)}")
            # Try to recover by clearing cache and forcing CPU
            self.memory_manager.clear_cuda_cache()
            raise RuntimeError(f"YOLO inference failed: {str(e)}")
    
    def _run_yolo_inference_cpu(self, model, image, original_width, original_height, scale_factor_x=1.0, scale_factor_y=1.0):
        """CPU fallback for YOLO inference when GPU memory is exhausted"""
        try:
            logger.info("Running YOLO inference on CPU as fallback")
            
            # Force CPU inference
            results = model(image, device='cpu', verbose=False, half=False)
            
            # Extract predictions (same logic as GPU version)
            predictions = []
            
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    # Log the image shapes for debugging
                    logger.info(f"CPU YOLO result - orig_shape: {result.orig_shape}, processed image shape: {image.shape[:2]}")
                    logger.info(f"Original image dimensions: {original_width}x{original_height}, scale factors: {scale_factor_x:.3f}x{scale_factor_y:.3f}")
                    
                    for i in range(len(boxes)):
                        # Get box coordinates, confidence, and class
                        box = boxes.xywh[i].numpy()  # x, y, w, h in pixels relative to the processed image
                        conf = float(boxes.conf[i].numpy())
                        cls = int(boxes.cls[i].numpy())
                        
                        # Scale coordinates back to original image dimensions
                        x_center = float(box[0]) * scale_factor_x  # center x in original image pixels
                        y_center = float(box[1]) * scale_factor_y  # center y in original image pixels
                        width = float(box[2]) * scale_factor_x     # width in original image pixels
                        height = float(box[3]) * scale_factor_y   # height in original image pixels
                        
                        # Get class name if available
                        class_name = model.names.get(cls, f'class_{cls}') if hasattr(model, 'names') else f'class_{cls}'
                        
                        predictions.append({
                            'class_id': cls,
                            'class': class_name,
                            'confidence': conf,
                            'bbox': {
                                'x': x_center,
                                'y': y_center,
                                'width': width,
                                'height': height
                            }
                        })
            
            # Sort by confidence
            predictions.sort(key=lambda x: x['confidence'], reverse=True)
            
            logger.info(f"CPU inference generated {len(predictions)} predictions with coordinates scaled to original image {original_width}x{original_height}")
            
            return predictions
            
        except Exception as e:
            logger.error(f"CPU YOLO inference error: {str(e)}")
            raise RuntimeError(f"CPU YOLO inference failed: {str(e)}")
            
            logger.info(f"CPU fallback completed with {len(predictions)} detections")
            return predictions
            
        except Exception as e:
            logger.error(f"CPU fallback YOLO inference error: {str(e)}")
            raise RuntimeError(f"CPU fallback YOLO inference failed: {str(e)}")
    
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

    def download_yolo_model(self, model_url, model_name, target_format='PyTorch', progress_callback=None, cancel_check_callback=None):
        """Download a YOLO model and optionally convert it to different format with progress tracking and cancellation support"""
        import urllib.request
        import shutil
        from pathlib import Path
        
        def update_progress(progress, status):
            if progress_callback:
                progress_callback(progress, status)
        
        def check_cancelled():
            if cancel_check_callback and cancel_check_callback():
                raise Exception("Download cancelled by user")
        
        try:
            # Create downloads directory
            download_dir = self.models_dir / 'downloads'
            download_dir.mkdir(exist_ok=True)
            
            update_progress(5, 'Initializing download...')
            check_cancelled()
            
            # Generate filename
            url_filename = model_url.split('/')[-1]
            download_path = download_dir / url_filename
            
            logger.info(f"Downloading YOLO model from {model_url}")
            logger.info(f"Target file: {download_path}")
            logger.info(f"Model name: {model_name}")
            logger.info(f"Target format: {target_format}")
            update_progress(15, 'Starting download...')
            check_cancelled()
            
            # Download the model with progress tracking and cancellation checks
            def download_with_progress():
                try:
                    response = urllib.request.urlopen(model_url)
                    total_size = int(response.getheader('Content-Length', 0))
                    downloaded = 0
                    
                    update_progress(20, 'Downloading model weights...')
                    check_cancelled()
                    
                    with open(download_path, 'wb') as f:
                        while True:
                            chunk = response.read(8192)
                            if not chunk:
                                break
                            
                            # Check for cancellation every chunk
                            check_cancelled()
                            
                            f.write(chunk)
                            downloaded += len(chunk)
                            
                            if total_size > 0:
                                progress = 20 + int((downloaded / total_size) * 50)  # 20-70%
                                update_progress(progress, f'Downloading... {progress-20}% of model data')
                    
                    response.close()
                except Exception as e:
                    # Clean up partial download on cancellation/error
                    try:
                        if download_path.exists():
                            os.remove(download_path)
                    except:
                        pass
                    
                    if "cancelled" in str(e).lower():
                        logger.info(f"Download cancelled: {url_filename}")
                    else:
                        logger.error(f"Download failed: {str(e)}")
                    raise
            
            download_with_progress()
            
            logger.info(f"Downloaded model to {download_path}")
            update_progress(75, 'Processing model file...')
            check_cancelled()
            
            # Handle format conversion if needed
            final_path = download_path
            final_format = 'pytorch'  # Default for .pt files
            
            if target_format != 'PyTorch':
                logger.info(f"Converting model to {target_format}")
                update_progress(80, f'Converting to {target_format} format...')
                check_cancelled()
                final_path, final_format = self._convert_yolo_model(download_path, target_format, progress_callback, cancel_check_callback)
            
            update_progress(90, 'Registering model...')
            check_cancelled()
            
            # Register the model
            model_info = self.register_model(
                model_name=model_name,
                file_path=final_path.resolve(),  # Use absolute path
                model_type='vision',
                original_filename=url_filename
            )
            
            update_progress(100, 'Model ready for use!')
            
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
    
    def _convert_yolo_model(self, source_path, target_format, progress_callback=None, cancel_check_callback=None):
        """Convert YOLO model to different format with progress tracking and cancellation support"""
        import shutil
        from pathlib import Path
        
        def update_progress(progress, status):
            if progress_callback:
                progress_callback(progress, status)
        
        def check_cancelled():
            if cancel_check_callback and cancel_check_callback():
                raise Exception("Conversion cancelled by user")
        
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
            update_progress(82, f'Starting {target_format} conversion...')
            check_cancelled()
            
            # Attempt real conversion using ultralytics
            if target_format == 'ONNX':
                converted_path = self._convert_to_onnx(source_path, progress_callback, cancel_check_callback)
            elif target_format == 'TensorRT':
                converted_path = self._convert_to_tensorrt(source_path, progress_callback, cancel_check_callback)
            elif target_format == 'CoreML':
                converted_path = self._convert_to_coreml(source_path, progress_callback, cancel_check_callback)
            else:
                # Fallback: copy with new extension (placeholder)
                logger.warning(f"Real conversion for {target_format} not implemented, copying file")
                update_progress(85, f'Creating {target_format} placeholder...')
                check_cancelled()
                shutil.copy2(source_path, converted_path)
            
            update_progress(88, 'Finalizing conversion...')
            check_cancelled()
            
            # Delete the original PyTorch file after successful conversion
            if converted_path != source_path and source_path.exists():
                source_path.unlink()
                logger.info(f"Deleted original PyTorch file: {source_path}")
            
            # Clean up any intermediate files created during conversion
            self._cleanup_intermediate_files(source_path, target_format, converted_path)
            
            update_progress(90, f'Model converted to {target_format}')
            logger.info(f"Model converted to {target_format}: {converted_path}")
            return converted_path, framework
            
        except Exception as e:
            logger.error(f"Conversion to {target_format} failed: {str(e)}")
            # If conversion fails, keep original file and raise error
            raise RuntimeError(f"Failed to convert model to {target_format}: {str(e)}")
    
    def _convert_to_onnx(self, source_path, progress_callback=None, cancel_check_callback=None):
        """Convert YOLO model to ONNX format with progress tracking and cancellation"""
        import threading
        import time
        
        def update_progress(progress, status):
            if progress_callback:
                progress_callback(progress, status)
        
        def check_cancelled():
            if cancel_check_callback and cancel_check_callback():
                raise Exception("ONNX conversion cancelled by user")
        
        try:
            # Check if ultralytics is available
            if not ULTRALYTICS_AVAILABLE:
                raise ImportError("ultralytics not available")
                
            from ultralytics import YOLO
            
            update_progress(83, 'Loading model for ONNX conversion...')
            check_cancelled()
            
            # Load the model
            model = YOLO(str(source_path))
            
            update_progress(85, 'Exporting to ONNX format...')
            check_cancelled()
            
            # Use threading for ONNX conversion too
            onnx_path = source_path.with_suffix('.onnx')
            conversion_completed = threading.Event()
            conversion_error = None
            conversion_cancelled = threading.Event()
            
            def run_onnx_conversion():
                nonlocal conversion_error
                try:
                    if conversion_cancelled.is_set():
                        return
                        
                    model.export(format='onnx')
                    
                    if not conversion_cancelled.is_set():
                        conversion_completed.set()
                except Exception as e:
                    if not conversion_cancelled.is_set():
                        conversion_error = e
                        conversion_completed.set()
            
            # Start conversion in background thread
            conversion_thread = threading.Thread(target=run_onnx_conversion)
            conversion_thread.daemon = True
            conversion_thread.start()
            
            # Monitor for cancellation
            start_time = time.time()
            try:
                while not conversion_completed.is_set():
                    check_cancelled()
                    time.sleep(0.5)  # Check more frequently for ONNX (usually faster)
                    
                    # Update progress during conversion
                    elapsed = time.time() - start_time
                    if elapsed > 5:
                        fake_progress = min(87, 85 + int(elapsed / 5))
                        update_progress(fake_progress, f'Converting to ONNX... ({int(elapsed)}s elapsed)')
                        
            except Exception as e:
                conversion_cancelled.set()
                logger.info("ONNX conversion cancelled, cleaning up...")
                
                conversion_thread.join(timeout=3)
                
                # Clean up partial file
                if onnx_path.exists():
                    try:
                        onnx_path.unlink()
                        logger.info(f"Cleaned up partial ONNX file: {onnx_path}")
                    except:
                        pass
                
                raise e
            
            # Wait for thread to complete
            conversion_thread.join(timeout=5)
            
            if conversion_error:
                raise conversion_error
            
            update_progress(88, 'Verifying ONNX export...')
            check_cancelled()
            
            # Check if the exported file exists
            expected_onnx = source_path.with_suffix('.onnx')
            if expected_onnx.exists():
                logger.info(f"Successfully converted to ONNX: {expected_onnx}")
                return expected_onnx
            else:
                raise RuntimeError("ONNX conversion completed but file not found")
                
        except ImportError:
            logger.warning("ultralytics not available, using fallback conversion")
            # Fallback: copy file with .onnx extension
            update_progress(85, 'Creating ONNX placeholder...')
            check_cancelled()
            onnx_path = source_path.with_suffix('.onnx')
            shutil.copy2(source_path, onnx_path)
            return onnx_path
        except Exception as e:
            if "cancelled" in str(e).lower():
                # Clean up partial conversion on cancellation
                onnx_path = source_path.with_suffix('.onnx')
                if onnx_path.exists():
                    try:
                        onnx_path.unlink()
                    except:
                        pass
            logger.error(f"ONNX conversion failed: {str(e)}")
            raise
    
    def _convert_to_tensorrt(self, source_path, progress_callback=None, cancel_check_callback=None):
        """Convert YOLO model to TensorRT format with true cancellation support"""
        import subprocess
        import time
        import sys
        import signal
        import os
        import tempfile
        
        def update_progress(progress, status):
            if progress_callback:
                progress_callback(progress, status)
        
        def check_cancelled():
            if cancel_check_callback and cancel_check_callback():
                raise Exception("TensorRT conversion cancelled by user")
        
        try:
            # Check if ultralytics is available
            if not ULTRALYTICS_AVAILABLE:
                raise ImportError("ultralytics not available")
            
            # Check if source file exists and is readable
            if not source_path.exists():
                raise FileNotFoundError(f"Source model file not found: {source_path}")
                
            file_size = source_path.stat().st_size / (1024 * 1024)  # MB
            logger.info(f"Source model file size: {file_size:.1f} MB")
                
            update_progress(83, 'Loading model for TensorRT conversion...')
            logger.info(f"Starting TensorRT conversion for {source_path}")
            logger.info(f"This conversion process may take several minutes depending on model complexity")
            logger.info(f"Model size: {file_size:.1f} MB")
            check_cancelled()
            
            update_progress(85, 'Converting to TensorRT (this may take several minutes)...')
            logger.info("Launching TensorRT conversion subprocess...")
            check_cancelled()
            
            # Create a standalone conversion script that can be killed
            conversion_script = f'''
import sys
import os
import signal
import logging
import traceback

# Allow TensorRT logs to show but reduce ultralytics noise
os.environ["YOLO_VERBOSE"] = "True"  # Keep verbose for TensorRT info
logging.basicConfig(level=logging.INFO, format='%(message)s')

try:
    from ultralytics import YOLO
    
    def signal_handler(signum, frame):
        print("CONVERSION_CANCELLED")
        sys.exit(1)
    
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    print("STARTING_CONVERSION")
    sys.stdout.flush()
    
    model = YOLO(r"{source_path}")
    print("MODEL_LOADED")
    sys.stdout.flush()
    
    print("BEGINNING_TENSORRT_EXPORT")
    sys.stdout.flush()
    
    # Export with full verbosity to see TensorRT progress
    result = model.export(format="engine", verbose=True)
    print(f"EXPORT_RESULT: {{result}}")
    print("CONVERSION_SUCCESS")
    
except KeyboardInterrupt:
    print("CONVERSION_CANCELLED")
    sys.exit(1)
except Exception as e:
    print(f"CONVERSION_ERROR: {{str(e)}}")
    print(f"CONVERSION_ERROR_DETAIL: {{repr(e)}}")
    print(f"TRACEBACK: {{traceback.format_exc()}}")
    sys.exit(1)
'''
            
            # Create a temporary script file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(conversion_script)
                script_path = f.name
            
            process = None
            try:
                # Start the conversion process
                process = subprocess.Popen([
                    sys.executable, script_path
                ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, 
                   text=True, bufsize=1, universal_newlines=True)
                
                logger.info(f"Started TensorRT conversion process: PID {process.pid}")
                
                # Monitor the process
                start_time = time.time()
                model_loaded = False
                output_lines = []
                
                while True:
                    # Check if process has finished
                    if process.poll() is not None:
                        break
                    
                    # Check for cancellation
                    try:
                        check_cancelled()
                    except Exception as e:
                        # Cancel was requested - kill the process
                        logger.info(f"Cancellation requested, terminating process {process.pid}")
                        
                        try:
                            # Try graceful termination first
                            process.terminate()
                            time.sleep(2)
                            
                            # If still running, force kill
                            if process.poll() is None:
                                process.kill()
                                logger.info(f"Force killed conversion process {process.pid}")
                                
                        except ProcessLookupError:
                            pass  # Process already dead
                        
                        # Clean up partial files
                        expected_trt = source_path.with_suffix('.engine')
                        intermediate_onnx = source_path.with_suffix('.onnx')
                        
                        for cleanup_file in [expected_trt, intermediate_onnx]:
                            if cleanup_file.exists():
                                try:
                                    cleanup_file.unlink()
                                    logger.info(f"Cleaned up partial file: {cleanup_file}")
                                except:
                                    pass
                        
                        raise e
                    
                    # Read any output
                    try:
                        line = process.stdout.readline()
                        if line:
                            line = line.strip()
                            output_lines.append(line)
                            
                            # Forward subprocess output to main logger
                            if line.startswith('[') or 'TRT' in line or 'Tactic' in line:
                                # This looks like TensorRT output - log it
                                logger.info(f"TensorRT: {line}")
                            elif "STARTING_CONVERSION" in line:
                                logger.info("TensorRT conversion: Starting conversion process")
                            elif "MODEL_LOADED" in line:
                                model_loaded = True
                                logger.info("TensorRT conversion: Model loaded successfully")
                            elif "BEGINNING_TENSORRT_EXPORT" in line:
                                logger.info("TensorRT conversion: Beginning TensorRT export")
                            elif "CONVERSION_SUCCESS" in line:
                                logger.info("TensorRT conversion completed successfully")
                                break
                            elif "CONVERSION_ERROR" in line:
                                logger.error(f"TensorRT conversion failed: {line}")
                                break
                            elif "CONVERSION_CANCELLED" in line:
                                logger.info("TensorRT conversion was cancelled")
                                break
                            elif line and not any(skip in line for skip in ['HTTP/1.1', 'werkzeug', 'GET /api']):
                                # Log other interesting output but skip HTTP requests
                                logger.info(f"TensorRT subprocess: {line}")
                                
                    except:
                        pass
                    
                    # Update progress with elapsed time
                    elapsed = time.time() - start_time
                    if elapsed > 10:
                        base_progress = 87 if model_loaded else 85
                        fake_progress = min(89, base_progress + int(elapsed / 30))
                        status = "Converting to TensorRT..." if model_loaded else "Loading model for conversion..."
                        update_progress(fake_progress, f'{status} ({int(elapsed)}s elapsed)')
                    
                    time.sleep(1)
                
                # Get final output
                try:
                    stdout, stderr = process.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    stdout, stderr = process.communicate()
                    logger.error("TensorRT conversion process timed out")
                
                all_output = '\\n'.join(output_lines) + '\\n' + (stdout or '')
                stderr_output = stderr or ''
                
                # Check results
                return_code = process.returncode
                
                logger.info(f"TensorRT conversion process finished with return code: {return_code}")
                
                if stderr_output:
                    logger.error(f"TensorRT conversion stderr: {stderr_output}")
                
                if return_code != 0:
                    if "CONVERSION_CANCELLED" in all_output:
                        raise Exception("TensorRT conversion cancelled by user")
                    elif "CONVERSION_ERROR" in all_output:
                        error_lines = [line for line in all_output.split('\\n') if 'CONVERSION_ERROR' in line]
                        if error_lines:
                            main_error = error_lines[0].split('CONVERSION_ERROR: ')[-1] if 'CONVERSION_ERROR:' in error_lines[0] else error_lines[0]
                            detailed_error = [line.split('CONVERSION_ERROR_DETAIL: ')[-1] for line in error_lines if 'CONVERSION_ERROR_DETAIL:' in line]
                            traceback_lines = [line.split('TRACEBACK: ')[-1] for line in all_output.split('\\n') if 'TRACEBACK:' in line]
                            
                            error_detail = main_error
                            if detailed_error:
                                error_detail += f" | Details: {detailed_error[0]}"
                            if traceback_lines:
                                logger.error(f"TensorRT conversion traceback: {traceback_lines[0]}")
                                
                            raise RuntimeError(f"TensorRT conversion failed: {error_detail}")
                        else:
                            raise RuntimeError(f"TensorRT conversion failed with unknown error (return code {return_code})")
                    else:
                        error_msg = f"TensorRT conversion failed with return code {return_code}"
                        if stderr_output:
                            error_msg += f" | stderr: {stderr_output[:200]}..."
                        raise RuntimeError(error_msg)
                
                if "CONVERSION_SUCCESS" not in all_output:
                    raise RuntimeError("TensorRT conversion did not complete successfully")
                    
            finally:
                # Clean up the temporary script
                try:
                    if os.path.exists(script_path):
                        os.unlink(script_path)
                except:
                    pass
                
                # Make sure process is dead
                if process and process.poll() is None:
                    try:
                        process.kill()
                    except:
                        pass
            
            update_progress(90, 'Finalizing TensorRT engine...')
            check_cancelled()
            
            # Verify the output file
            expected_trt = source_path.with_suffix('.engine')
            intermediate_onnx = source_path.with_suffix('.onnx')
            
            if expected_trt.exists():
                logger.info(f"Successfully converted to TensorRT: {expected_trt}")
                
                # Clean up intermediate ONNX file
                if intermediate_onnx.exists():
                    intermediate_onnx.unlink()
                    logger.info(f"Cleaned up intermediate ONNX file: {intermediate_onnx}")
                
                return expected_trt
            else:
                raise RuntimeError("TensorRT conversion completed but engine file not found")
                
        except ImportError:
            logger.warning("ultralytics not available, using fallback conversion")
            # Fallback: copy file with .engine extension
            update_progress(85, 'Creating TensorRT placeholder...')
            check_cancelled()
            trt_path = source_path.with_suffix('.engine')
            shutil.copy2(source_path, trt_path)
            return trt_path
        except Exception as e:
            if "cancelled" in str(e).lower():
                # Clean up partial conversion files on cancellation
                trt_path = source_path.with_suffix('.engine')
                intermediate_onnx = source_path.with_suffix('.onnx')
                for cleanup_file in [trt_path, intermediate_onnx]:
                    if cleanup_file.exists():
                        try:
                            cleanup_file.unlink()
                        except:
                            pass
            
            error_msg = str(e)
            logger.error(f"TensorRT conversion failed: {error_msg}")
            
            # Provide helpful error message and suggest alternatives
            if "ImportError" in error_msg or "ModuleNotFoundError" in error_msg:
                suggestion = "TensorRT or ultralytics dependencies missing. Try ONNX format instead."
            elif "CUDA" in error_msg or "GPU" in error_msg:
                suggestion = "GPU/CUDA issue detected. Check GPU availability or try ONNX format."
            elif "Memory" in error_msg or "memory" in error_msg:
                suggestion = "Insufficient memory for TensorRT conversion. Try a smaller model or ONNX format."
            elif "permission" in error_msg.lower() or "access" in error_msg.lower():
                suggestion = "File permission issue. Check file access rights."
            else:
                suggestion = "TensorRT conversion failed. Try ONNX format for better compatibility."
            
            # Create a more user-friendly error message
            user_friendly_error = f"Failed to convert model to TensorRT: {error_msg}. Suggestion: {suggestion}"
            raise RuntimeError(user_friendly_error)
    
    def _convert_to_coreml(self, source_path, progress_callback=None, cancel_check_callback=None):
        """Convert YOLO model to CoreML format with progress tracking and cancellation"""
        
        def update_progress(progress, status):
            if progress_callback:
                progress_callback(progress, status)
        
        def check_cancelled():
            if cancel_check_callback and cancel_check_callback():
                raise Exception("CoreML conversion cancelled by user")
        
        try:
            # Check if ultralytics is available
            if not ULTRALYTICS_AVAILABLE:
                raise ImportError("ultralytics not available")
                
            from ultralytics import YOLO
            
            update_progress(83, 'Loading model for CoreML conversion...')
            check_cancelled()
            
            # Load the model
            model = YOLO(str(source_path))
            
            update_progress(85, 'Converting to CoreML format...')
            check_cancelled()
            
            # Export to CoreML
            model.export(format='coreml')
            
            update_progress(88, 'Finalizing CoreML export...')
            check_cancelled()
            
            # Check if the exported file exists
            expected_coreml = source_path.with_suffix('.mlmodel')
            if expected_coreml.exists():
                logger.info(f"Successfully converted to CoreML: {expected_coreml}")
                return expected_coreml
            else:
                raise RuntimeError("CoreML conversion completed but model file not found")
                
        except ImportError:
            logger.warning("ultralytics not available, using fallback conversion")
            # Fallback: copy file with .mlmodel extension
            update_progress(85, 'Creating CoreML placeholder...')
            check_cancelled()
            coreml_path = source_path.with_suffix('.mlmodel')
            shutil.copy2(source_path, coreml_path)
            return coreml_path
        except Exception as e:
            if "cancelled" in str(e).lower():
                # Clean up partial conversion on cancellation
                coreml_path = source_path.with_suffix('.mlmodel')
                if coreml_path.exists():
                    try:
                        coreml_path.unlink()
                    except:
                        pass
            logger.error(f"CoreML conversion failed: {str(e)}")
            raise
                
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
