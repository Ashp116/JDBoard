#!/usr/bin/env python3
"""
AI Model Manager for Jetson Edge AI Dashboard
Handles model loading, inference, and management
"""

import os
import sys
import json
import time
import logging
import cv2
import numpy as np
import shutil
import uuid
import subprocess
import threading
from datetime import datetime
from pathlib import Path
import hashlib
import importlib.util

# AI/ML imports with fallbacks
# ONNX Runtime can cause bus errors on some Jetson devices
# Disable it entirely to avoid crashes
ONNX_AVAILABLE = False
# try:
#     import onnxruntime as ort
#     ONNX_AVAILABLE = True
# except ImportError:
#     ONNX_AVAILABLE = False

try:
    import tensorrt as trt
    # Don't import pycuda to avoid context issues
    # TensorRT models will use Ultralytics YOLO which handles CUDA internally
    TENSORRT_AVAILABLE = True
    PYCUDA_INITIALIZED = False
except ImportError:
    TENSORRT_AVAILABLE = False
    PYCUDA_INITIALIZED = False

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

# Log ONNX Runtime status
if not ONNX_AVAILABLE:
    logger.info("ONNX Runtime support disabled (known to cause bus errors on Jetson)")

# PyCUDA context management is disabled - Ultralytics YOLO handles CUDA internally
# This prevents "context stack was not empty upon module cleanup" errors
def initialize_pycuda():
    """PyCUDA initialization disabled - not needed for Ultralytics YOLO"""
    global PYCUDA_INITIALIZED
    # No-op function - PyCUDA not used
    PYCUDA_INITIALIZED = True
    logger.info("PyCUDA initialization skipped (Ultralytics YOLO handles CUDA internally)")
    return True

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


# Export settings users can choose per download (see normalize_export_options).
# FP16 engines need much less memory to build (and run faster on Jetson) than
# FP32; the workspace cap (GB) limits TensorRT's scratch memory.
PRECISIONS_BY_FORMAT = {
    'PyTorch': ('fp32', 'fp16'),          # applied at inference time, no conversion
    'ONNX': ('fp32', 'fp16', 'int8'),
    'TensorRT': ('fp32', 'fp16', 'int8'),
}
DEFAULT_PRECISION = {'PyTorch': 'fp32', 'ONNX': 'fp32', 'TensorRT': 'fp16'}
QUANTIZE_ARG = {'fp32': 32, 'fp16': 16, 'int8': 8}
DEFAULT_IMGSZ = 640
TRT_WORKSPACE_GB = 2


def normalize_export_options(target_format, precision=None, imgsz=None, workspace=None, calibration=None):
    """Validate user-chosen export settings; returns a clean dict or raises ValueError."""
    if target_format not in PRECISIONS_BY_FORMAT:
        raise ValueError(f"Unsupported target format: {target_format}")
    precision = (precision or DEFAULT_PRECISION[target_format]).lower()
    if precision not in PRECISIONS_BY_FORMAT[target_format]:
        raise ValueError(f"{target_format} supports precision {', '.join(PRECISIONS_BY_FORMAT[target_format]).upper()}, not {precision.upper()}")
    try:
        imgsz = int(imgsz) if imgsz not in (None, '') else DEFAULT_IMGSZ
    except (TypeError, ValueError):
        raise ValueError("Image size must be a number")
    if imgsz % 32 or not 160 <= imgsz <= 1280:
        raise ValueError("Image size must be a multiple of 32 between 160 and 1280")
    options = {'precision': precision, 'imgsz': imgsz}
    if target_format == 'TensorRT':
        try:
            workspace = float(workspace) if workspace not in (None, '') else TRT_WORKSPACE_GB
        except (TypeError, ValueError):
            raise ValueError("Workspace must be a number of GB")
        if not 0.5 <= workspace <= 8:
            raise ValueError("TensorRT workspace must be between 0.5 and 8 GB")
        options['workspace'] = workspace
    if precision == 'int8':
        # 'coco' = Ultralytics' built-in COCO sample (stock models); else a folder of images
        if not calibration:
            raise ValueError("INT8 needs calibration images: choose the built-in COCO sample or upload a .zip of images")
        options['calibration'] = calibration
    return options

# `yolo export` subprocesses currently running, so they can be stopped on
# cancel and when the backend shuts down (otherwise they keep running orphaned).
_ACTIVE_EXPORTS = set()
_ACTIVE_EXPORTS_LOCK = threading.Lock()


def log_failure(context, error):
    """Log an exception as an error - or as info when it is a user cancel."""
    if 'cancelled by user' in str(error).lower():
        logger.info(f"{context}: cancelled by user")
    else:
        logger.error(f"{context}: {error}")


def stop_process(process, grace_seconds=10):
    """Ask a subprocess to stop, and force-kill it if it doesn't within the grace period."""
    if process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(timeout=grace_seconds)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
    except OSError:
        pass


def terminate_active_exports():
    """Stop every running TensorRT export (called on backend shutdown)."""
    with _ACTIVE_EXPORTS_LOCK:
        processes = list(_ACTIVE_EXPORTS)
    for process in processes:
        logger.info(f"Stopping TensorRT export process {process.pid}")
        stop_process(process, grace_seconds=5)


class CustomScriptLoader:
    """Loads and manages custom inference scripts for models"""
    
    def __init__(self, logger=None):
        self.logger = logger or logging.getLogger('custom_script_loader')
        self.loaded_scripts = {}  # Cache loaded script modules
    
    def load_script(self, script_path):
        """
        Dynamically load a custom inference script.
        
        Args:
            script_path: Path to the Python script file
            
        Returns:
            The CustomModelInference class from the script
        """
        script_path = Path(script_path)
        
        if not script_path.exists():
            raise FileNotFoundError(f"Custom script not found: {script_path}")
        
        if not script_path.suffix == '.py':
            raise ValueError(f"Custom script must be a Python file: {script_path}")
        
        # Use cached module if already loaded
        script_key = str(script_path.absolute())
        if script_key in self.loaded_scripts:
            self.logger.info(f"Using cached custom script: {script_path.name}")
            return self.loaded_scripts[script_key]
        
        try:
            # Load the module dynamically
            module_name = f"custom_inference_{script_path.stem}_{id(script_path)}"
            spec = importlib.util.spec_from_file_location(module_name, script_path)
            module = importlib.util.module_from_spec(spec)
            
            # Add to sys.modules so imports work correctly
            sys.modules[module_name] = module
            
            # Execute the module
            spec.loader.exec_module(module)
            
            # Get the CustomModelInference class
            if not hasattr(module, 'CustomModelInference'):
                raise AttributeError(
                    f"Custom script must define a 'CustomModelInference' class: {script_path}"
                )
            
            custom_class = module.CustomModelInference
            
            # Validate that the class has required methods
            required_methods = ['preprocess', 'inference', 'postprocess']
            for method in required_methods:
                if not hasattr(custom_class, method):
                    raise AttributeError(
                        f"CustomModelInference class must implement '{method}' method"
                    )
            
            # Cache the loaded class
            self.loaded_scripts[script_key] = custom_class
            self.logger.info(f"Successfully loaded custom script: {script_path.name}")
            
            return custom_class
            
        except Exception as e:
            self.logger.error(f"Error loading custom script {script_path}: {e}")
            raise RuntimeError(f"Failed to load custom inference script: {e}")
    
    def validate_script(self, script_path):
        """
        Validate a custom script without caching it.
        
        Args:
            script_path: Path to the Python script file
            
        Returns:
            True if valid, raises exception otherwise
        """
        try:
            self.load_script(script_path)
            return True
        except Exception as e:
            raise ValueError(f"Invalid custom script: {e}")
    
    def clear_cache(self):
        """Clear the cached loaded scripts"""
        self.loaded_scripts.clear()
        self.logger.info("Cleared custom script cache")


class AIModelManager:
    def __init__(self, models_dir='../models'):
        self.models_dir = Path(models_dir)
        self.models_dir.mkdir(exist_ok=True)
        self.models_registry = {}
        self.loaded_models = {}
        self.registry_file = self.models_dir / 'models_registry.json'
        self.memory_manager = CUDAMemoryManager()
        self.script_loader = CustomScriptLoader(logger)
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
    
    def register_model(self, model_name, file_path, model_type='vision', original_filename='', custom_script_path=None, model_meta=None):
        """Register a new model in the system with optional custom inference script"""
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
        
        # Validate custom script if provided
        if custom_script_path:
            custom_script_path = Path(custom_script_path)
            if not custom_script_path.exists():
                raise FileNotFoundError(f"Custom script not found: {custom_script_path}")
            
            # Validate the script
            try:
                self.script_loader.validate_script(custom_script_path)
                logger.info(f"Validated custom inference script: {custom_script_path.name}")
            except Exception as e:
                raise ValueError(f"Invalid custom script: {e}")
        
        model_info = {
            'id': model_id,

            'type': model_type,
            'file_path': str(file_path),
            'original_filename': original_filename or file_path.name,
            'file_size': file_size,
            'file_hash': file_hash,
            'framework': framework,
            'created_at': datetime.now().isoformat(),
            'last_used': None,
            'inference_count': 0,
            'loaded': False,
            'custom_script_path': str(custom_script_path) if custom_script_path else None,
            # Export settings (precision, imgsz, workspace, calibration) when known
            **(model_meta or {})
        }
        
        self.models_registry[model_id] = model_info
        self._save_registry()
        
        logger.info(f"Registered model: {model_name}")
        return model_info
    
    # pip commands shown to the user when a framework is missing
    TORCH_INSTALL_HINT = ("pip install torch torchvision --index-url https://download.pytorch.org/whl/cu132 "
                          "(inside JDBoard's .venv)")
    ULTRALYTICS_INSTALL_HINT = "pip install ultralytics --no-deps (inside JDBoard's .venv, after PyTorch)"

    def missing_requirement(self, framework=None, yolo=False, target_format=None):
        """Return a user-facing message if the backend can't handle this model, else None.

        framework:     registry framework ('pytorch', 'onnx', 'tensorrt', 'tensorflow', ...)
        yolo:          the model is an Ultralytics YOLO model (download-yolo flow)
        target_format: requested conversion target in the download-yolo flow
        """
        if yolo or target_format:
            if not TORCH_AVAILABLE:
                return f"PyTorch is not installed on the backend, so YOLO models can't be loaded. Install it: {self.TORCH_INSTALL_HINT}"
            if not ULTRALYTICS_AVAILABLE:
                return f"Ultralytics is not installed on the backend, so YOLO models can't be loaded or converted. Install it: {self.ULTRALYTICS_INSTALL_HINT}"
            if target_format == 'TensorRT' and not TENSORRT_AVAILABLE:
                return "TensorRT Python bindings are not available on the backend, so the model can't be converted to TensorRT."
            return None
        if framework == 'pytorch' and not TORCH_AVAILABLE:
            return f"PyTorch is not installed on the backend, so .pt/.pth models can't be loaded. Install it: {self.TORCH_INSTALL_HINT}"
        if framework == 'onnx' and not ONNX_AVAILABLE:
            return "ONNX Runtime support is disabled on the backend (it caused bus errors on Jetson). Use a .pt or TensorRT .engine model instead."
        if framework == 'tensorrt' and not TENSORRT_AVAILABLE:
            return "TensorRT Python bindings are not available on the backend, so .engine/.trt models can't be loaded."
        if framework == 'tensorflow' and not TF_AVAILABLE:
            return "TensorFlow is not installed on the backend, so .pb models can't be loaded."
        if framework in ('keras', 'unknown'):
            return f"'{framework}' models are not supported for inference."
        return None

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
    
    def _remove_custom_script(self, script_path):
        """Delete an uploaded custom script, its compiled cache and loader cache entry."""
        script = Path(script_path)
        # Only scripts JDBoard stored itself - never the bundled template or arbitrary paths
        if script.resolve().parent != self.models_dir.resolve():
            return
        try:
            if script.exists():
                script.unlink()
                logger.info(f"Deleted custom script: {script.name}")
            for pyc in (script.parent / '__pycache__').glob(script.stem + '.*.pyc'):
                pyc.unlink()
        except OSError as e:
            logger.warning(f"Could not delete custom script {script}: {e}")
        self.script_loader.loaded_scripts.pop(str(script.absolute()), None)

    def cleanup_orphaned_files(self):
        """Remove files left behind by downloads/uploads that never finished
        (backend stopped or crashed mid-way) and that no registered model uses.

        Only touches files with the names JDBoard itself generates:
          models/downloads/*.pt|.pth|.onnx|.engine|.trt  (downloads + conversion outputs)
          models/<32 hex>_*                              (uploaded models and scripts)
          models/__pycache__/<32 hex>_*.pyc              (compiled custom scripts)
        """
        import re
        referenced = set()
        for info in self.models_registry.values():
            for key in ('file_path', 'custom_script_path'):
                if info.get(key):
                    referenced.add(Path(info[key]).resolve())
        candidates = []
        downloads = self.models_dir / 'downloads'
        if downloads.is_dir():
            candidates += [f for f in downloads.iterdir()
                           if f.is_file() and f.suffix in ('.pt', '.pth', '.onnx', '.engine', '.trt')]
        upload_name = re.compile(r'^[0-9a-f]{32}_')
        candidates += [f for f in self.models_dir.iterdir() if f.is_file() and upload_name.match(f.name)]
        removed = 0
        for f in candidates:
            if f.resolve() not in referenced:
                try:
                    f.unlink()
                    removed += 1
                    logger.info(f"Removed orphaned file: {f.relative_to(self.models_dir)}")
                except OSError as e:
                    logger.warning(f"Could not remove orphaned file {f}: {e}")
        # Calibration image folders from INT8 builds interrupted by a crash
        if downloads.is_dir():
            for leftover_dir in downloads.glob('jdboard_calib_*'):
                if leftover_dir.is_dir():
                    shutil.rmtree(leftover_dir, ignore_errors=True)
                    removed += 1
                    logger.info(f"Removed orphaned calibration folder: {leftover_dir.name}")
        pycache = self.models_dir / '__pycache__'
        if pycache.is_dir():
            live_scripts = {p.stem for p in referenced}
            for pyc in pycache.glob('*.pyc'):
                if upload_name.match(pyc.name) and pyc.name.split('.')[0] not in live_scripts:
                    pyc.unlink()
                    removed += 1
        if removed:
            logger.info(f"Startup cleanup removed {removed} orphaned file(s)")
        return removed

    def _warn_missing_file(self, model_id, model_info):
        """Log a registered model whose file is gone - once, not on every listing."""
        warned = self.__dict__.setdefault('_missing_file_warned', set())
        if model_id not in warned:
            warned.add(model_id)
            logger.warning(f"Model '{model_id}' is registered but its file is missing "
                           f"({model_info['file_path']}); it is hidden from the model list. "
                           f"Re-download it, or remove it from models_registry.json.")

    def _handler_status(self, model_id, model_info):
        """Which inference handler a model uses: 'custom' or 'default'.

        script_status: 'none' (no script), 'pending' (not loaded yet),
        'active', or 'failed' (script error -> default handler is used).
        """
        if not model_info.get('custom_script_path'):
            return {'inference_handler': 'default', 'script_status': 'none', 'script_error': None}
        loaded = self.loaded_models.get(model_id)
        if loaded is None:
            return {'inference_handler': 'custom', 'script_status': 'pending', 'script_error': None}
        error = loaded.get('script_error')
        if error:
            return {'inference_handler': 'default', 'script_status': 'failed', 'script_error': error}
        return {'inference_handler': 'custom', 'script_status': 'active', 'script_error': None}

    def list_models(self):
        """List all registered models"""
        models = []
        for model_id, model_info in self.models_registry.items():
            # Check if file still exists
            if Path(model_info['file_path']).exists():
                model_copy = model_info.copy()
                # Check actual loaded state (not just registry flag)
                model_copy['loaded'] = model_id in self.loaded_models
                model_copy.update(self._handler_status(model_id, model_info))
                
                # Update registry if it's out of sync
                if self.models_registry[model_id]['loaded'] != model_copy['loaded']:
                    self.models_registry[model_id]['loaded'] = model_copy['loaded']
                    self._save_registry()
                    logger.info(f"Updated registry for model {model_id}: loaded={model_copy['loaded']}")
                
                models.append(model_copy)
            else:
                self._warn_missing_file(model_id, model_info)
        
        return models
    
    def load_model(self, model_id):
        """Load a model for inference"""
        if model_id not in self.models_registry:
            raise ValueError(f"Model {model_id} not found in registry")
        
        if model_id in self.loaded_models:
            logger.info(f"Model {model_id} already loaded")
            # Get current model info for response
            mem_info = self.memory_manager.get_gpu_memory_info()
            return {
                "status": "already_loaded",
                "model_id": model_id,
                "framework": self.models_registry[model_id]['framework'],
                "gpu_memory_used_gb": round(mem_info.get('used_gb', 0), 2)
            }
        
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
                raise ValueError(self.missing_requirement(framework) or f"Unsupported framework: {framework}")
            
            load_time = time.time() - start_time
            
            # Load custom script if provided
            custom_handler = None
            script_error = None
            if model_info.get('custom_script_path'):
                try:
                    custom_script_path = model_info['custom_script_path']
                    logger.info(f"Loading custom inference script: {custom_script_path}")
                    CustomInferenceClass = self.script_loader.load_script(custom_script_path)
                    custom_handler = CustomInferenceClass(model, model_info, logger)
                    logger.info(f"Custom inference handler initialized for {model_id}")
                except Exception as e:
                    logger.warning(f"Failed to load custom script, using default inference: {e}")
                    custom_handler = None
                    script_error = f"Failed to load script: {e}"
            
            self.loaded_models[model_id] = {
                'model': model,
                'info': model_info,
                'loaded_at': datetime.now().isoformat(),
                'load_time': load_time,
                'custom_handler': custom_handler,
                'script_error': script_error
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
            # Initialize PyCUDA if needed (deferred to avoid bus errors on import)
            if TENSORRT_AVAILABLE:
                initialize_pycuda()
            
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
            # Check if model is already unloaded
            if model_id not in self.loaded_models:
                logger.info(f"Model {model_id} is not currently loaded")
                mem_info = self.memory_manager.get_gpu_memory_info()
                return {
                    "status": "not_loaded",
                    "model_id": model_id,
                    "message": "Model was not loaded",
                    "gpu_memory_freed_gb": 0
                }
            
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
                mem_info_after = self.memory_manager.get_gpu_memory_info()
                if mem_info_after.get("total", 0) > 0:
                    logger.info(f"Post-unload GPU Memory - Free: {mem_info_after.get('free_gb', 0):.1f}GB")
                
                # Calculate freed memory
                freed_gb = round(mem_info_after.get('free_gb', 0) - mem_info.get('free_gb', 0), 2)
                
                return {
                    "status": "unloaded",
                    "model_id": model_id,
                    "gpu_memory_freed_gb": freed_gb
                }
            else:
                logger.warning(f"Model {model_id} not found in registry")
                raise ValueError(f"Model {model_id} not found in registry")
                
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
            raise
    
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
        """Run inference on an image using custom script if available"""
        if model_id not in self.loaded_models:
            raise ValueError(f"Model {model_id} not loaded")
        
        model_data = self.loaded_models[model_id]
        model = model_data['model']
        model_info = model_data['info']
        framework = model_info['framework']
        custom_handler = model_data.get('custom_handler')
        
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
        
        # Store the processed image
        processed_image = image
        script_fallback_error = model_data.get('script_error')
        
        start_time = time.time()
        
        # Wrap inference execution with memory monitoring
        try:
            # Monitor memory before execution
            pre_mem = self.memory_manager.get_gpu_memory_info()
            
            # Use custom handler if available
            if custom_handler:
                logger.info(f"Using custom inference handler for {model_id}")
                try:
                    # Run custom preprocessing
                    preprocessed_data = custom_handler.preprocess(
                        processed_image,
                        original_width=original_width,
                        original_height=original_height
                    )
                    
                    # Run custom inference
                    raw_output = custom_handler.inference(preprocessed_data)
                    
                    # Run custom postprocessing
                    result = custom_handler.postprocess(
                        raw_output,
                        original_width=original_width,
                        original_height=original_height
                    )
                    
                    # Custom postprocess now returns a list of predictions
                    num_detections = len(result) if isinstance(result, list) else result.get('total_detections', 0)
                    model_data['script_error'] = None
                    script_fallback_error = None
                    logger.info(f"Custom inference completed: {num_detections} detections")
                    
                except Exception as custom_error:
                    logger.error(f"Error in custom inference handler: {custom_error}")
                    logger.warning("Falling back to default inference method")
                    # Fall back to default inference, and surface the failure
                    custom_handler = None
                    script_fallback_error = f"Script error during inference: {custom_error}"
                    model_data['script_error'] = script_fallback_error
            
            # Use default inference if no custom handler or custom handler failed
            if not custom_handler:
                # Check if it's a YOLO model (works for all formats when loaded with ultralytics)
                # YOLO models handle TensorRT, ONNX, PyTorch internally - no need to route by framework
                if hasattr(model, 'predict'):  # YOLO model from ultralytics
                    logger.info(f"Using default YOLO inference for {framework} model")
                    # Precision/imgsz chosen at download time apply to PyTorch models;
                    # TensorRT/ONNX models carry their own (baked in at export)
                    result = self._run_yolo_inference(
                        model, processed_image, original_width, original_height,
                        half=(framework == 'pytorch' and model_info.get('precision') == 'fp16'),
                        imgsz=model_info.get('imgsz') if framework == 'pytorch' else None)
                elif framework == 'onnx':
                    result = self._run_onnx_inference(model, processed_image)
                elif framework == 'pytorch':
                    result = self._run_pytorch_inference(model, processed_image)
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
            
            response = {
                'predictions': result,
                'inference_time': inference_time,
                'model_id': model_id,
                'framework': framework,
                'inference_handler': 'custom' if custom_handler else 'default',
                'memory_info': {
                    'pre_inference_free_gb': pre_mem.get('free_gb', 0),
                    'post_inference_free_gb': post_mem.get('free_gb', 0),
                    'usage_percent': post_mem.get('usage_percent', 0)
                }
            }
            if model_info.get('custom_script_path') and script_fallback_error:
                response['warning'] = f"Custom script failed, default handler used. {script_fallback_error}"
            return response
            
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
                        result = self._run_yolo_inference_cpu(model, processed_image, original_width, original_height)
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
    
    def _run_yolo_inference(self, model, image, original_width, original_height, half=False, imgsz=None):
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
                predict_kwargs = {'verbose': False, 'half': half}
                if imgsz:
                    predict_kwargs['imgsz'] = imgsz
                results = model(image, **predict_kwargs)
            
            # Extract predictions
            predictions = []
            
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    # Convert to CPU immediately to free GPU memory
                    boxes_cpu = boxes.cpu()
                    
                    for i in range(len(boxes_cpu)):
                        # Get box coordinates, confidence, and class
                        box = boxes_cpu.xywh[i].numpy()  # Raw x, y, w, h from YOLO
                        conf = float(boxes_cpu.conf[i].numpy())
                        cls = int(boxes_cpu.cls[i].numpy())
                        
                        # Use raw coordinates from YOLO
                        x_center = float(box[0])
                        y_center = float(box[1])
                        width = float(box[2])
                        height = float(box[3])
                        
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
            
            logger.info(f"Generated {len(predictions)} predictions")
            
            return predictions
            
        except Exception as e:
            logger.error(f"YOLO inference error: {str(e)}")
            # Try to recover by clearing cache and forcing CPU
            self.memory_manager.clear_cuda_cache()
            raise RuntimeError(f"YOLO inference failed: {str(e)}")
    
    def _run_yolo_inference_cpu(self, model, image, original_width, original_height):
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
                    for i in range(len(boxes)):
                        # Get box coordinates, confidence, and class
                        box = boxes.xywh[i].numpy()  # Raw x, y, w, h from YOLO
                        conf = float(boxes.conf[i].numpy())
                        cls = int(boxes.cls[i].numpy())
                        
                        # Use raw coordinates from YOLO
                        x_center = float(box[0])
                        y_center = float(box[1])
                        width = float(box[2])
                        height = float(box[3])
                        
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
            
            logger.info(f"CPU inference generated {len(predictions)} predictions")
            
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

        # Remove its custom script too, unless another model still uses it
        script = model_info.get('custom_script_path')
        if script and not any(m.get('custom_script_path') == script for m in self.models_registry.values()):
            self._remove_custom_script(script)
        
        logger.info(f"Model {model_id} deleted from registry")
        return True
    
    def rename_model(self, model_id, new_name):
        """Rename a model in the registry"""
        if model_id not in self.models_registry:
            raise ValueError(f"Model {model_id} not found")
        
        # Validate new name
        new_name = new_name.strip()
        if not new_name:
            raise ValueError("New name cannot be empty")
        
        if len(new_name) < 2:
            raise ValueError("Model ID must be at least 2 characters long")
        
        if len(new_name) > 50:
            raise ValueError("Model ID must be less than 50 characters")
        
        # Check for ID uniqueness
        if new_name in self.models_registry and new_name != model_id:
            raise ValueError("A model with this ID already exists")
        
        # Update the ID in registry (change the key)
        old_id = model_id
        model_data = self.models_registry[model_id].copy()
        model_data['id'] = new_name
        model_data['modified_at'] = datetime.now().isoformat()
        
        # Remove old entry and add new one
        del self.models_registry[model_id]
        self.models_registry[new_name] = model_data
        
        # Update loaded models if the model is currently loaded
        if model_id in self.loaded_models:
            self.loaded_models[new_name] = self.loaded_models.pop(model_id)
        
        # Save registry
        self._save_registry()
        
        logger.info(f"Model ID changed from '{old_id}' to '{new_name}'")
        return {
            'old_id': old_id,
            'new_id': new_name,
            'model_data': model_data
        }
    
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
                detailed_info.update(self._handler_status(model_id, model_info))
                # Why this model can't be loaded on this backend, if it can't (shown on the card)
                detailed_info['load_problem'] = self.missing_requirement(model_info.get('framework'))
                
                if model_id in self.loaded_models:
                    load_info = self.loaded_models[model_id]
                    detailed_info['load_info'] = {
                        'loaded_at': load_info['loaded_at'],
                        'load_time': load_info['load_time']
                    }
                
                detailed_models.append(detailed_info)
            else:
                self._warn_missing_file(model_id, model_info)
        
        return detailed_models

    def download_yolo_model(self, model_url, model_name, target_format='PyTorch', custom_script_path=None, progress_callback=None, cancel_check_callback=None, export_options=None):
        """Download a YOLO model and optionally convert it to different format with progress tracking, custom script support, and cancellation support"""
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
            
            # Unique filename per download. Ultralytics names its .onnx/.engine
            # outputs after the source file, so a shared name (e.g. two models
            # both using yolo11x.pt) let one download overwrite - and its failure
            # cleanup delete - another model's files.
            url_filename = model_url.split('/')[-1]
            safe_name = ''.join(c if c.isalnum() or c in '-_' else '_' for c in model_name)[:40] or 'model'
            download_path = download_dir / f"{safe_name}_{uuid.uuid4().hex[:8]}_{url_filename}"
            
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
                final_path, final_format = self._convert_yolo_model(download_path, target_format, progress_callback, cancel_check_callback, export_options)
            
            update_progress(90, 'Registering model...')
            check_cancelled()
            
            # Register the model with custom script if provided
            model_info = self.register_model(
                model_name=model_name,
                file_path=final_path.resolve(),  # Use absolute path
                model_type='vision',
                original_filename=url_filename,
                custom_script_path=custom_script_path,
                model_meta={k: v for k, v in (export_options or {}).items() if k in ('precision', 'imgsz', 'workspace')}
                           | ({'calibration': 'coco' if (export_options or {}).get('calibration') == 'coco' else 'custom'}
                              if (export_options or {}).get('precision') == 'int8' else {})
            )
            
            update_progress(100, 'Model ready for use!')
            
            logger.info(f"YOLO model {model_name} successfully downloaded and registered" + 
                       (" with custom script" if custom_script_path else ""))
            
            return {
                'model_id': model_info['id'],
                'model_info': model_info,
                'download_path': str(final_path),
                'format': final_format
            }
            
        except Exception as e:
            log_failure(f"Error downloading YOLO model", e)
            # Clean up this download's files: the source and anything converted
            # from it (.onnx, partial .engine, ...) - they all share its unique stem.
            if 'download_path' in locals():  # not set if it failed very early
                for leftover in download_path.parent.glob(download_path.stem + '*'):
                    try:
                        if leftover.is_file():
                            leftover.unlink()
                            logger.info(f"Removed leftover file: {leftover.name}")
                        elif leftover.is_dir():
                            shutil.rmtree(leftover, ignore_errors=True)
                    except OSError as cleanup_error:
                        logger.warning(f"Could not remove {leftover}: {cleanup_error}")
            raise
    
    def _prepare_calibration_data(self, source_path, opts, model=None):
        """Return the `data=` argument for INT8 calibration.

        'coco' -> Ultralytics' built-in COCO sample (downloaded on first use).
        A folder of images -> a dataset yaml written next to the download (same
        unique name prefix, so it is removed with the other byproducts).
        """
        calibration = opts.get('calibration')
        if calibration == 'coco':
            return 'coco8.yaml'
        images_dir = Path(calibration)
        if not images_dir.is_dir():
            raise ValueError("Calibration images folder not found")
        if model is None:
            from ultralytics import YOLO
            model = YOLO(str(source_path))
        names = dict(getattr(model, 'names', {}) or {0: 'object'})
        yaml_path = source_path.parent / f"{source_path.stem}_calibration.yaml"
        lines = [f"path: {images_dir}", "train: .", "val: .", "names:"]
        lines += [f"  {int(k)}: {json.dumps(str(v))}" for k, v in sorted(names.items())]
        yaml_path.write_text("\n".join(lines) + "\n")
        return str(yaml_path)

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
        elif target_format in ['TensorFlow']:
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
    
    def _convert_yolo_model(self, source_path, target_format, progress_callback=None, cancel_check_callback=None, export_options=None):
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
                converted_path = self._convert_to_onnx(source_path, progress_callback, cancel_check_callback, export_options)
            elif target_format == 'TensorRT':
                converted_path = self._convert_to_tensorrt(source_path, progress_callback, cancel_check_callback, export_options)

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
            # Downloads have unique names, so anything else sharing the source's
            # name (.onnx step, INT8 calibration .cache, calibration folder) is a byproduct
            for byproduct in source_path.parent.glob(source_path.stem + '*'):
                if byproduct in (converted_path, source_path):
                    continue
                if byproduct.is_dir():
                    shutil.rmtree(byproduct, ignore_errors=True)
                else:
                    byproduct.unlink(missing_ok=True)
                logger.info(f"Removed conversion byproduct: {byproduct.name}")
            
            # Delete the original PyTorch file after successful conversion
            if converted_path != source_path and source_path.exists():
                source_path.unlink()
                logger.info(f"Deleted original PyTorch file: {source_path}")
            
            update_progress(90, f'Model converted to {target_format}')
            logger.info(f"Model converted to {target_format}: {converted_path}")
            return converted_path, framework
            
        except Exception as e:
            log_failure(f"Conversion to {target_format} failed", e)
            # If conversion fails, keep original file and raise error
            raise RuntimeError(f"Failed to convert model to {target_format}: {str(e)}")
    
    def _convert_to_onnx(self, source_path, progress_callback=None, cancel_check_callback=None, export_options=None):
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
            
            opts = export_options or normalize_export_options('ONNX')
            export_kwargs = dict(format='onnx', verbose=False, simplify=True,
                                 imgsz=opts['imgsz'], quantize=QUANTIZE_ARG[opts['precision']])
            if opts['precision'] == 'fp16':
                export_kwargs['device'] = 0  # FP16 ONNX export runs on the GPU
            if opts['precision'] == 'int8':
                export_kwargs['data'] = self._prepare_calibration_data(source_path, opts, model)
            logger.info(f"ONNX export settings: {opts['precision'].upper()}, imgsz {opts['imgsz']}")
            result = model.export(**export_kwargs)
            
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
            # Used to copy the .pt and call it .onnx - a fake model. Fail clearly instead.
            raise RuntimeError(f"Ultralytics is not installed, so the model can't be converted to ONNX. "
                               f"Install it: {self.ULTRALYTICS_INSTALL_HINT}")
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
            log_failure(f"ONNX conversion failed", e)
            raise
    
    def _convert_to_tensorrt(self, source_path, progress_callback=None, cancel_check_callback=None, export_options=None):
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
            
            update_progress(85, 'Building TensorRT engine - this takes several minutes (longer for larger models)...')
            check_cancelled()
            
            # Use subprocess to run yolo export with verbose output capture
            logger.info("Starting TensorRT export - this may take a few minutes...")
            start_time = time.time()
            
            # Build command for YOLO export. Use the `yolo` CLI that belongs to
            # this interpreter (.venv/bin/yolo) - it isn't on PATH when the
            # backend is started as `.venv/bin/python app.py`.
            yolo_cli = os.path.join(os.path.dirname(sys.executable), 'yolo')
            if not os.path.exists(yolo_cli):
                yolo_cli = shutil.which('yolo')
            if not yolo_cli:
                raise RuntimeError("The Ultralytics 'yolo' command was not found next to the backend's Python. "
                                   f"Reinstall it: {self.ULTRALYTICS_INSTALL_HINT}")
            opts = export_options or normalize_export_options('TensorRT')
            cmd = [
                yolo_cli, 'export',
                f'model={source_path}',
                'format=engine',
                'device=0',
                'verbose=True',
                f"quantize={QUANTIZE_ARG[opts['precision']]}",  # FP32 / FP16 / INT8 engine
                f"imgsz={opts['imgsz']}",
                f"workspace={opts.get('workspace', TRT_WORKSPACE_GB)}",
            ]
            if opts['precision'] == 'int8':
                cmd.append(f"data={self._prepare_calibration_data(source_path, opts)}")
            logger.info(f"TensorRT build settings: {opts['precision'].upper()}, imgsz {opts['imgsz']}, "
                        f"workspace {opts.get('workspace', TRT_WORKSPACE_GB)} GB")
            
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
            
            # Wait for the build, checking for cancel every second: the engine
            # build can run for minutes without printing anything, so checking
            # only on output lines (monitor_output) is not enough.
            with _ACTIVE_EXPORTS_LOCK:
                _ACTIVE_EXPORTS.add(process)
            cancelled = False
            try:
                while True:
                    try:
                        return_code = process.wait(timeout=1)
                        break
                    except subprocess.TimeoutExpired:
                        if cancel_check_callback and cancel_check_callback():
                            cancelled = True
                            logger.info("Stopping TensorRT export (download cancelled)")
                            stop_process(process)
            finally:
                with _ACTIVE_EXPORTS_LOCK:
                    _ACTIVE_EXPORTS.discard(process)
            
            # Wait for output thread to finish
            output_thread.join(timeout=2.0)

            if cancelled or (cancel_check_callback and cancel_check_callback()):
                raise Exception("Download cancelled by user")
            
            conversion_time = time.time() - start_time
            
            if return_code != 0:
                if return_code == -9:
                    raise RuntimeError(
                        "TensorRT export was killed by the system because it ran out of memory. "
                        "This model is too large to build a TensorRT engine on this device; "
                        "use a smaller size (n/s/m) or the PyTorch format.")
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
            
            log_failure(f"TensorRT conversion failed", e)
            raise RuntimeError(f"TensorRT conversion failed: {str(e)}")

                
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
            
            log_failure(f"TensorRT conversion failed", e)
            raise RuntimeError(f"TensorRT conversion failed: {str(e)}")
