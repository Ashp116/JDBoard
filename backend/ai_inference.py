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

# Create a specific logger for model operations
logger = logging.getLogger('ai_inference')
logger.setLevel(logging.INFO)

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
        """Load a TensorRT model using ultralytics YOLO with memory optimization and verbose logging"""
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
            
            # Enable verbose logging for TensorRT engine loading
            logger.info(f"Loading TensorRT engine: {file_path}")
            
            # Load TensorRT engine with ultralytics (verbose logging will show engine details)
            model = YOLO(str(file_path), verbose=True)
            
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
                logger.info(f"Loading PyTorch YOLO model: {file_path}")
                model = YOLO(str(file_path), verbose=True)
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
    
    def _load_onnx_model(self, file_path):
        """Load an ONNX model"""
        try:
            # First try loading as YOLO ONNX model
            if ULTRALYTICS_AVAILABLE:
                from ultralytics import YOLO
                logger.info(f"Loading ONNX YOLO model: {file_path}")
                model = YOLO(str(file_path), verbose=True)
                logger.info(f"YOLO ONNX model loaded successfully: {file_path}")
                return model
            elif ONNX_AVAILABLE:
                # Fallback to ONNX Runtime
                logger.info(f"Loading ONNX model with ONNX Runtime: {file_path}")
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
                    import time
                    start_time = time.time()
                    
                    # Open URL with detailed headers and info
                    req = urllib.request.Request(model_url)
                    req.add_header('User-Agent', 'JetsonEdge-ModelDownloader/1.0')
                    
                    update_progress(18, f'Connecting to {model_url.split("/")[2]}...')
                    response = urllib.request.urlopen(req)
                    
                    # Get detailed file information
                    total_size = int(response.getheader('Content-Length', 0))
                    content_type = response.getheader('Content-Type', 'unknown')
                    server = response.getheader('Server', 'unknown')
                    
                    # Log detailed download info
                    size_mb = total_size / (1024 * 1024) if total_size > 0 else 0
                    logger.info(f"Download details - Size: {size_mb:.1f}MB, Type: {content_type}, Server: {server}")
                    
                    downloaded = 0
                    last_update_time = time.time()
                    last_downloaded = 0
                    
                    if total_size > 0:
                        update_progress(20, f'Downloading {size_mb:.1f}MB model from {server}...')
                    else:
                        update_progress(20, f'Downloading model from {server} (size unknown)...')
                    check_cancelled()
                    
                    with open(download_path, 'wb') as f:
                        chunk_size = 8192
                        chunk_count = 0
                        
                        while True:
                            chunk = response.read(chunk_size)
                            if not chunk:
                                break
                            
                            # Check for cancellation every chunk
                            check_cancelled()
                            
                            f.write(chunk)
                            downloaded += len(chunk)
                            chunk_count += 1
                            
                            # Update progress with detailed info every 50 chunks or 1 second
                            current_time = time.time()
                            if chunk_count % 50 == 0 or (current_time - last_update_time) >= 1.0:
                                if total_size > 0:
                                    percent = (downloaded / total_size) * 100
                                    progress = 20 + int((downloaded / total_size) * 50)  # 20-70%
                                    
                                    # Calculate download speed
                                    time_diff = current_time - last_update_time
                                    if time_diff > 0:
                                        speed_bytes = (downloaded - last_downloaded) / time_diff
                                        speed_mb = speed_bytes / (1024 * 1024)
                                        
                                        # Calculate ETA
                                        remaining_bytes = total_size - downloaded
                                        eta_seconds = remaining_bytes / speed_bytes if speed_bytes > 0 else 0
                                        eta_str = f"{int(eta_seconds)}s" if eta_seconds < 60 else f"{int(eta_seconds/60)}m{int(eta_seconds%60)}s"
                                        
                                        download_msg = f'Downloading: {percent:.1f}% ({downloaded/(1024*1024):.1f}/{size_mb:.1f}MB) at {speed_mb:.1f}MB/s - ETA: {eta_str}'
                                    else:
                                        download_msg = f'Downloading: {percent:.1f}% ({downloaded/(1024*1024):.1f}/{size_mb:.1f}MB)'
                                    
                                    update_progress(progress, download_msg)
                                else:
                                    # Unknown size - just show downloaded amount and speed
                                    time_diff = current_time - last_update_time
                                    if time_diff > 0:
                                        speed_bytes = (downloaded - last_downloaded) / time_diff
                                        speed_mb = speed_bytes / (1024 * 1024)
                                        download_msg = f'Downloaded: {downloaded/(1024*1024):.1f}MB at {speed_mb:.1f}MB/s'
                                    else:
                                        download_msg = f'Downloaded: {downloaded/(1024*1024):.1f}MB'
                                    
                                    update_progress(min(65, 20 + int(downloaded/(1024*1024))), download_msg)
                                
                                last_update_time = current_time
                                last_downloaded = downloaded
                    
                    response.close()
                    
                    # Final download summary
                    total_time = time.time() - start_time
                    final_size_mb = downloaded / (1024 * 1024)
                    avg_speed_mb = final_size_mb / total_time if total_time > 0 else 0
                    
                    update_progress(70, f'Download completed: {final_size_mb:.1f}MB in {total_time:.1f}s (avg {avg_speed_mb:.1f}MB/s)')
                    logger.info(f"Download completed - {final_size_mb:.1f}MB downloaded in {total_time:.1f}s at average {avg_speed_mb:.1f}MB/s")
                    
                except Exception as e:
                    # Clean up partial download on cancellation/error
                    try:
                        if download_path.exists():
                            os.remove(download_path)
                    except:
                        pass
                    
                    if "cancelled" in str(e).lower():
                        update_progress(15, f"Download cancelled: {url_filename}")
                        logger.info(f"Download cancelled: {url_filename}")
                    else:
                        update_progress(15, f"Download failed: {str(e)}")
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
        logger.info(f"Cleaning up intermediate files for {target_format} conversion from {source_path} to {final_path}")
        
        # Only clean up intermediate files for specific conversion scenarios
        # Be very conservative to avoid deleting legitimate model files
        
        if target_format == 'TensorRT':
            # For TensorRT conversion, clean up ONNX intermediate files
            # Check multiple potential ONNX file locations
            potential_onnx_files = [
                base_path.with_suffix('.onnx'),  # Same base name
                source_path.with_suffix('.onnx'),  # Same path different extension
                final_path.with_suffix('.onnx')   # Engine path with onnx extension
            ]
            
            for intermediate_onnx in potential_onnx_files:
                if (intermediate_onnx.exists() and
                    intermediate_onnx != final_path and 
                    intermediate_onnx != source_path and
                    source_path.suffix.lower() == '.pt' and 
                    final_path.suffix.lower() == '.engine'):
                    
                    try:
                        # Check if source file still exists for timestamp comparison
                        if source_path.exists():
                            source_time = source_path.stat().st_mtime
                            onnx_time = intermediate_onnx.stat().st_mtime
                            
                            # Delete if ONNX is newer (likely intermediate) or within 1 minute of source
                            if onnx_time >= source_time - 60:  # 60 second tolerance
                                intermediate_onnx.unlink()
                                logger.info(f"Cleaned up intermediate ONNX file: {intermediate_onnx}")
                            else:
                                logger.info(f"Keeping existing ONNX file (significantly older): {intermediate_onnx}")
                        else:
                            # Source doesn't exist, be more aggressive about cleanup
                            # Check file size - very small ONNX files are likely failed conversions
                            file_size = intermediate_onnx.stat().st_size
                            if file_size < 1024 * 1024:  # Less than 1MB, likely incomplete
                                intermediate_onnx.unlink()
                                logger.info(f"Cleaned up small/incomplete ONNX file: {intermediate_onnx} ({file_size} bytes)")
                            else:
                                # For larger files, use a more recent timestamp heuristic
                                import time
                                current_time = time.time()
                                onnx_time = intermediate_onnx.stat().st_mtime
                                
                                # Delete if created within the last hour (likely from this conversion)
                                if current_time - onnx_time < 3600:  # 1 hour
                                    intermediate_onnx.unlink()
                                    logger.info(f"Cleaned up recent intermediate ONNX file: {intermediate_onnx}")
                                else:
                                    logger.info(f"Keeping older ONNX file: {intermediate_onnx}")
                    
                    except Exception as e:
                        logger.warning(f"Failed to clean up ONNX file {intermediate_onnx}: {e}")
        
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
            
            # Clean up any intermediate files created during conversion BEFORE deleting source
            self._cleanup_intermediate_files(source_path, target_format, converted_path)
            
            # Delete the original PyTorch file after successful conversion
            if converted_path != source_path and source_path.exists():
                source_path.unlink()
                logger.info(f"Deleted original PyTorch file: {source_path}")
            
            update_progress(90, f'Model converted to {target_format}')
            logger.info(f"Model converted to {target_format}: {converted_path}")
            return converted_path, framework
            
        except Exception as e:
            logger.error(f"Conversion to {target_format} failed: {str(e)}")
            # If conversion fails, keep original file and raise error
            raise RuntimeError(f"Failed to convert model to {target_format}: {str(e)}")
    
    def _convert_to_onnx(self, source_path, progress_callback=None, cancel_check_callback=None):
        """Convert YOLO model to ONNX format - fast and simple"""
        
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
            
            file_size = source_path.stat().st_size / (1024 * 1024)  # MB
            logger.info(f"Starting ONNX conversion for {source_path} ({file_size:.1f} MB)")
            
            update_progress(83, 'Loading model for ONNX conversion...')
            check_cancelled()
            
            # Load the model
            model = YOLO(str(source_path))
            logger.info(f"Model loaded successfully")
            
            update_progress(85, 'Converting to ONNX format...')
            check_cancelled()
            
            # Direct export - much faster
            logger.info("Starting ONNX export...")
            start_time = time.time()
            
            result = model.export(
                format='onnx',
                verbose=False,  # Reduce verbosity for speed
                simplify=True,  # Simplify the model
                half=False      # Use FP32 for better compatibility
            )
            
            conversion_time = time.time() - start_time
            logger.info(f"ONNX conversion completed in {conversion_time:.1f}s")
            
            update_progress(88, f'ONNX conversion completed in {conversion_time:.1f}s')
            check_cancelled()
            
            # Check if the exported file exists
            expected_onnx = source_path.with_suffix('.onnx')
            if expected_onnx.exists():
                file_size_mb = expected_onnx.stat().st_size / (1024 * 1024)
                logger.info(f"Successfully converted to ONNX: {expected_onnx} ({file_size_mb:.1f} MB)")
                update_progress(90, f'ONNX: Conversion successful - {file_size_mb:.1f}MB ONNX model created')
                return expected_onnx
            elif isinstance(result, (str, Path)) and Path(result).exists():
                # Sometimes ultralytics returns the path directly
                result_path = Path(result)
                if result_path.suffix == '.onnx':
                    file_size_mb = result_path.stat().st_size / (1024 * 1024)
                    logger.info(f"Successfully converted to ONNX: {result_path} ({file_size_mb:.1f} MB)")
                    return result_path
            
            raise RuntimeError("ONNX conversion completed but file not found")
                
        except ImportError:
            logger.warning("ultralytics not available, using fallback conversion")
            # Fallback: copy file with .onnx extension
            update_progress(85, 'ONNX: Creating ONNX placeholder (ultralytics not available)...')
            check_cancelled()
            onnx_path = source_path.with_suffix('.onnx')
            shutil.copy2(source_path, onnx_path)
            update_progress(88, f'ONNX: Fallback conversion completed')
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
                update_progress(85, f'ONNX: Conversion cancelled')
            else:
                update_progress(85, f'ONNX: Conversion failed - {str(e)}')
            logger.error(f"ONNX conversion failed: {str(e)}")
            raise
    
    def _convert_to_tensorrt(self, source_path, progress_callback=None, cancel_check_callback=None):
        """Convert YOLO model to TensorRT format with verbose output capture"""
        import subprocess
        import threading
        
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
            
            # Check if source file exists
            if not source_path.exists():
                raise FileNotFoundError(f"Source model file not found: {source_path}")
                
            file_size = source_path.stat().st_size / (1024 * 1024)  # MB
            logger.info(f"Starting TensorRT conversion for {source_path} ({file_size:.1f} MB)")
            
            update_progress(83, 'Loading model for TensorRT conversion...')
            check_cancelled()
            
            update_progress(85, 'Converting to TensorRT format...')
            check_cancelled()
            
            # Use subprocess to run yolo export with verbose output capture
            logger.info("Starting TensorRT export - this may take a few minutes...")
            start_time = time.time()
            
            # Build command for YOLO export
            cmd = [
                'yolo', 'export',
                f'model={source_path}',
                'format=engine',
                'device=0',
                'verbose=True',
                'half=False'
            ]
            
            # Start subprocess with real-time output capture
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,  # Merge stderr into stdout
                universal_newlines=True,
                bufsize=1
            )
            
            def monitor_output():
                """Monitor subprocess output and forward TensorRT logs"""
                try:
                    for line in iter(process.stdout.readline, ''):
                        if line.strip():
                            clean_line = line.strip()
                            
                            # Forward TensorRT verbose output directly
                            if any(keyword in clean_line for keyword in ['[TRT]', 'TensorRT:', 'Tactic Name:', 'Chose Runner Type:']):
                                logger.info(clean_line)  # Direct TensorRT output
                            elif 'building FP16 engine' in clean_line:
                                logger.info(clean_line)
                            elif 'export success' in clean_line.lower():
                                logger.info(f"✓ {clean_line}")
                            elif any(keyword in clean_line for keyword in ['WARNING', 'ERROR', 'WARN']):
                                logger.warning(clean_line)
                            elif any(keyword in clean_line for keyword in ['input', 'output', 'shape', 'DataType']):
                                logger.info(clean_line)  # Model structure info
                        
                        # Check for cancellation
                        if cancel_check_callback and cancel_check_callback():
                            logger.info("TensorRT conversion cancellation requested")
                            try:
                                process.terminate()
                            except:
                                pass
                            break
                except Exception as e:
                    logger.error(f"Error monitoring TensorRT output: {e}")
                finally:
                    if process.stdout:
                        process.stdout.close()
            
            # Start output monitoring in separate thread
            output_thread = threading.Thread(target=monitor_output, daemon=True)
            output_thread.start()
            
            # Wait for process to complete
            return_code = process.wait()
            
            # Wait for output thread to finish
            output_thread.join(timeout=2.0)
            
            conversion_time = time.time() - start_time
            
            if return_code != 0:
                raise RuntimeError(f"TensorRT export failed with return code {return_code}")
            
            logger.info(f"TensorRT conversion completed in {conversion_time:.1f}s")
            update_progress(90, f'TensorRT conversion completed in {conversion_time:.1f}s')
            check_cancelled()
            
            # Verify the output file
            expected_trt = source_path.with_suffix('.engine')
            
            if expected_trt.exists():
                file_size_mb = expected_trt.stat().st_size / (1024 * 1024)
                logger.info(f"Successfully converted to TensorRT: {expected_trt} ({file_size_mb:.1f} MB)")
                return expected_trt
            else:
                raise RuntimeError("TensorRT conversion completed but engine file not found")
                
        except ImportError:
            logger.warning("ultralytics not available for TensorRT conversion")
            raise RuntimeError("Cannot convert to TensorRT: ultralytics not available. Please install ultralytics.")
        except Exception as e:
            if "cancelled" in str(e).lower():
                # Clean up partial conversion files on cancellation
                trt_path = source_path.with_suffix('.engine')
                if trt_path.exists():
                    try:
                        trt_path.unlink()
                        logger.info(f"Cleaned up partial TensorRT file: {trt_path}")
                    except:
                        pass
                update_progress(85, 'TensorRT conversion cancelled')
                raise e
            
            logger.error(f"TensorRT conversion failed: {str(e)}")
            raise RuntimeError(f"TensorRT conversion failed: {str(e)}")
    
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
            raise RuntimeError("Cannot convert to TensorRT: ultralytics not available. Please install ultralytics.")
        except Exception as e:
            if "cancelled" in str(e).lower():
                # Clean up partial conversion files on cancellation
                trt_path = source_path.with_suffix('.engine')
                if trt_path.exists():
                    try:
                        trt_path.unlink()
                        logger.info(f"Cleaned up partial TensorRT file: {trt_path}")
                    except:
                        pass
                update_progress(85, 'TensorRT conversion cancelled')
                raise e
            
            logger.error(f"TensorRT conversion failed: {str(e)}")
            raise RuntimeError(f"TensorRT conversion failed: {str(e)}")
