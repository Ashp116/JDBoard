#!/usr/bin/env python3
"""
Jetson Edge AI Dashboard - Backend Server
A cyberpunk-themed dashboard for Jetson devices with AI model management
"""

import os
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import json
import time
import logging
import subprocess
from datetime import datetime
import uuid
import threading
from pathlib import Path
import psutil
import shutil
from werkzeug.utils import secure_filename
import cv2
import numpy as np
from system_monitor import SystemMonitor
from ai_inference import AIModelManager, terminate_active_exports, log_failure, normalize_export_options
import atexit
import signal
from request_logger import RequestLogger
from jtop import JtopException
import web_frontend

# Check if running as root/sudo
def is_running_as_root():
    """Check if the application is running with root privileges"""
    return os.geteuid() == 0

app = Flask(__name__)

CORS(app)

# Initialize SocketIO for real-time communication
socketio = SocketIO(app, 
                   cors_allowed_origins="*",
                   logger=False,
                   engineio_logger=False,
                   async_mode='threading',
                   ping_timeout=60,
                   ping_interval=25)

# Global dict to track active downloads and their cancel flags
active_downloads = {}
download_cancel_flags = {}
download_threads = {}  # Track download/conversion threads

def set_download_cancelled(download_id):
    """Mark a download as cancelled"""
    download_cancel_flags[download_id] = True
    
    # Also attempt to interrupt the thread if it exists
    if download_id in download_threads:
        thread = download_threads[download_id]
        if thread and thread.is_alive():
            logger.info(f"Attempting to interrupt download thread {download_id}")
            # Note: Python threads can't be forcibly killed, but we rely on
            # the cancel check callback in the download process

def is_download_cancelled(download_id):
    """Check if a download has been cancelled"""
    return download_cancel_flags.get(download_id, False)

def cleanup_download(download_id):
    """Clean up download tracking"""
    active_downloads.pop(download_id, None)
    download_cancel_flags.pop(download_id, None)
    download_threads.pop(download_id, None)

CALIBRATION_IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
CALIBRATION_MAX_ZIP_MB = 500

def extract_calibration_zip(upload):
    """Unpack an uploaded .zip of INT8 calibration images into a temp folder.

    Returns (folder, None) or (None, error message). Only image files are
    extracted (flattened, no paths from the archive are used).
    """
    import zipfile, tempfile
    if not upload.filename.lower().endswith('.zip'):
        return None, 'Calibration images must be uploaded as a .zip file'
    folder = tempfile.mkdtemp(prefix='jdboard_calib_', dir=os.path.join(UPLOAD_FOLDER, 'downloads'))
    zip_path = os.path.join(folder, 'upload.zip')
    try:
        upload.save(zip_path)
        if os.path.getsize(zip_path) > CALIBRATION_MAX_ZIP_MB * 1024 ** 2:
            raise ValueError(f'Calibration .zip is larger than {CALIBRATION_MAX_ZIP_MB} MB')
        images_dir = os.path.join(folder, 'images')
        os.makedirs(images_dir)
        count = 0
        with zipfile.ZipFile(zip_path) as archive:
            for i, member in enumerate(archive.infolist()):
                ext = os.path.splitext(member.filename)[1].lower()
                if member.is_dir() or ext not in CALIBRATION_IMAGE_EXTS:
                    continue
                with archive.open(member) as src, open(os.path.join(images_dir, f'{i:06d}{ext}'), 'wb') as dst:
                    shutil.copyfileobj(src, dst)
                count += 1
        os.remove(zip_path)
        if count < 10:
            raise ValueError(f'The .zip has {count} images; INT8 calibration needs at least 10 (100-500 recommended)')
        logger.info(f"Extracted {count} calibration images")
        return images_dir, None
    except (ValueError, zipfile.BadZipFile, OSError) as e:
        shutil.rmtree(folder, ignore_errors=True)
        return None, f'Invalid calibration .zip: {e}' if isinstance(e, zipfile.BadZipFile) else str(e)

# Minimum total RAM to attempt a TensorRT build of large (l/x) YOLO models
TENSORRT_LARGE_MODEL_MIN_RAM_GB = 12

# Final result of each download/upload, kept so the frontend can still learn the
# outcome if it missed the socket event (reconnect, page reload, fast failure).
finished_downloads = {}
FINISHED_DOWNLOAD_TTL = 30 * 60  # seconds

def finish_download(download_id, success, model_name='', message='', error=None, warning=None):
    """Record a download's outcome, notify clients, and stop tracking it."""
    now = time.time()
    for old_id in [k for k, v in finished_downloads.items() if now - v['finished_ts'] > FINISHED_DOWNLOAD_TTL]:
        finished_downloads.pop(old_id, None)
    finished_downloads[download_id] = {
        'state': 'completed' if success else 'failed',
        'success': success,
        'model_name': model_name,
        'message': message,
        'error': error,
        'warning': warning,
        'finished_at': datetime.now().isoformat(),
        'finished_ts': now,
    }
    if success:
        socketio.emit('download_complete', {
            'download_id': download_id, 'success': True,
            'model_name': model_name, 'message': message, 'warning': warning,
        })
    else:
        socketio.emit('download_error', {
            'download_id': download_id, 'model_name': model_name, 'error': error,
        })
    cleanup_download(download_id)

def get_client_ip():
    """Get the real client IP address, handling proxies and load balancers"""
    # Check common proxy headers first
    if request.headers.get('X-Forwarded-For'):
        # X-Forwarded-For can contain multiple IPs, get the first (original client)
        forwarded_ips = request.headers.get('X-Forwarded-For').split(',')
        client_ip = forwarded_ips[0].strip()
        if client_ip and client_ip != 'unknown':
            logger.debug(f"IP detected from X-Forwarded-For: {client_ip}")
            return client_ip
    
    # Check other common proxy headers  
    for header in ['X-Real-IP', 'X-Client-IP', 'CF-Connecting-IP']:
        ip = request.headers.get(header)
        if ip and ip != 'unknown':
            logger.debug(f"IP detected from {header}: {ip.strip()}")
            return ip.strip()
    
    # Fall back to Flask's remote_addr
    fallback_ip = request.remote_addr or 'unknown'
    logger.debug(f"IP detected from remote_addr: {fallback_ip}")
    return fallback_ip

# Configuration constants
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models')
ALLOWED_EXTENSIONS = {'onnx', 'trt', 'engine', 'pb', 'pth', 'pt'}
MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # 500MB max file size

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Initialize components
system_monitor = SystemMonitor()
ai_manager = AIModelManager()
request_logger = RequestLogger()

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('../logs/dashboard.log'),
        logging.StreamHandler()
    ]
)

# Custom logging handler to forward logs to frontend
class WebSocketLogHandler(logging.Handler):
    def emit(self, record):
        try:
            # Filter out HTTP requests and non-model related logs
            logger_name = record.name
            message = record.getMessage()
            
            # Skip werkzeug HTTP requests
            if logger_name == 'werkzeug':
                return
                
            # Skip other non-model related logs
            if any(skip_word in message.lower() for skip_word in ['get /api', 'post /api', '200 -', '404 -', '500 -']):
                return
                
            # Only forward model-related logs
            model_keywords = ['tensorrt', 'yolo', 'model', 'engine', 'onnx', 'pytorch', 'loading', 'inference', 'tactic', 'profiling']
            if not any(keyword in message.lower() for keyword in model_keywords):
                return
            
            log_entry = self.format(record)
            timestamp = datetime.now().strftime('%H:%M:%S')
            level = record.levelname.lower()
            
            # Emit to all connected clients
            socketio.emit('log_message', {
                'id': str(uuid.uuid4()),
                'timestamp': timestamp,
                'type': level if level in ['info', 'error', 'warning'] else 'info',
                'message': message,
                'raw_log': log_entry
            })
        except Exception:
            pass  # Don't let logging errors break the app

# Add WebSocket handler to specific loggers only
websocket_handler = WebSocketLogHandler()
websocket_handler.setLevel(logging.INFO)
websocket_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
websocket_handler.setFormatter(websocket_formatter)

# Make sure model-related loggers emit INFO. They propagate to the root logger,
# which carries the WebSocket handler - attaching it to them as well would send
# every line to the dashboard twice.
for logger_name in ['ai_inference', 'ultralytics', 'torch', 'tensorrt', 'onnxruntime']:
    logging.getLogger(logger_name).setLevel(logging.INFO)

root_logger = logging.getLogger()
root_logger.addHandler(websocket_handler)

logger = logging.getLogger(__name__)
logger.disabled = False  # Enable logging to capture messages

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/system/status')
def get_system_status():
    """Get comprehensive system status"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/system/status',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        status = system_monitor.get_system_status()
        
        # Add AI models information
        try:
            loaded_models = ai_manager.list_models()
            status['models'] = [model for model in loaded_models if model.get('loaded', False)]
        except Exception as e:
            logger.debug(f"Error getting models list: {e}")
            status['models'] = []
        
        # Add inference statistics
        try:
            request_stats = request_logger.get_stats()
            # Get total lifetime inferences (not just 24h)
            total_inferences = request_logger.get_total_inference_count()
            status['stats'] = {
                'totalInferences': total_inferences
            }
        except Exception as e:
            logger.debug(f"Error getting inference stats: {e}")
            status['stats'] = {
                'totalInferences': 0
            }
        
        return jsonify({
            'success': True,
            'data': status,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting system status: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/system/gpu')
def get_gpu_status():
    """Get GPU status and statistics"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/system/gpu',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        gpu_status = system_monitor.get_gpu_status()
        return jsonify({
            'success': True,
            'data': gpu_status,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting GPU status: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/system/logs')
def get_system_logs():
    """Get system logs with optional filtering for broken pipe monitoring"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/system/logs',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        # Check for filtering parameters
        since_timestamp = request.args.get('since', type=int)
        filter_term = request.args.get('filter', '')
        
        # If filtering parameters are provided, use enhanced log parsing
        if since_timestamp or filter_term:
            logs = []
            log_file_path = '../logs/app.log'
            
            if os.path.exists(log_file_path):
                with open(log_file_path, 'r') as f:
                    lines = f.readlines()
                    
                # Parse recent logs
                for line in reversed(lines[-1000:]):  # Check last 1000 lines
                    try:
                        # Parse log line format: timestamp - logger - level - message
                        parts = line.strip().split(' - ', 3)
                        if len(parts) >= 4:
                            timestamp_str = parts[0]
                            # Handle both comma and period in timestamp
                            timestamp_str = timestamp_str.replace(',', '.')
                            try:
                                timestamp = datetime.fromisoformat(timestamp_str).timestamp() * 1000
                            except:
                                continue
                            
                            # Filter by timestamp if provided
                            if since_timestamp and timestamp < since_timestamp:
                                continue
                                
                            logger_name = parts[1]
                            level = parts[2]
                            message = parts[3]
                            
                            # Filter by term if provided
                            if filter_term and filter_term.lower() not in message.lower():
                                continue
                            
                            logs.append({
                                'timestamp': timestamp,
                                'logger': logger_name,
                                'level': level,
                                'message': message
                            })
                            
                    except (ValueError, IndexError):
                        continue
            
            # Sort by timestamp (newest first)
            logs.sort(key=lambda x: x['timestamp'], reverse=True)
            
            return jsonify({
                'success': True,
                'logs': logs,
                'count': len(logs)
            })
        
        # Default behavior - use the system_monitor method
        logs_data = system_monitor.get_system_logs()
        return jsonify({
            'success': True,
            'data': logs_data,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting system logs: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/models', methods=['GET'])
def list_models():
    """List all available AI models"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/models',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        models = ai_manager.list_models()
        return jsonify({
            'success': True,
            'data': models,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error listing models: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/gpu/memory', methods=['GET'])
def get_gpu_memory():
    """Get GPU memory usage information"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/gpu/memory',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        memory_info = ai_manager.memory_manager.get_gpu_memory_info()
        return jsonify({
            'success': True,
            'data': memory_info,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting GPU memory info: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def tensorrt_size_problem(source_name):
    """Error message if building a TensorRT engine for this YOLO size is likely
    to run out of memory on this board, else None.

    Measured on an Orin Nano 8GB: YOLOv11x ran out of memory both as FP32 (after
    ~2-4 min) and as FP16 with a 2 GB workspace (after ~10 min)."""
    import re
    size_match = re.search(r'yolo\D*\d*([nsmlx])u?\.pt$', source_name.split('?')[0].lower())
    total_ram_gb = psutil.virtual_memory().total / 1024 ** 3
    if size_match and size_match.group(1) in ('l', 'x') and total_ram_gb < TENSORRT_LARGE_MODEL_MIN_RAM_GB:
        return (f"Building a TensorRT engine for this model size ('{size_match.group(1)}') is likely to run "
                f"out of memory on this device ({total_ram_gb:.1f} GB RAM; about "
                f"{TENSORRT_LARGE_MODEL_MIN_RAM_GB} GB is needed). Use size n, s or m for TensorRT, "
                f"or keep this size in PyTorch format.")
    return None


@app.route('/models/upload', methods=['POST'])
def upload_model():
    """Upload a model, optionally converting an Ultralytics .pt file to ONNX or
    TensorRT (same options as the YOLO download), with progress over Socket.IO."""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/models/upload',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method,
        data={'files': len(request.files),
              **{k: v for k, v in request.form.items() if k in ('target_format', 'precision', 'imgsz', 'workspace', 'calibration')}}
    )
    
    if 'file' not in request.files:
        return jsonify({
            'success': False,
            'error': 'No file provided'
        }), 400
    
    file = request.files['file']
    model_name = request.form.get('model_name', '')
    model_type = request.form.get('model_type', 'vision')
    download_id = request.form.get('download_id', str(uuid.uuid4()))
    target_format = request.form.get('target_format') or 'PyTorch'
    
    # Optional custom inference script; without one the built-in (default) handler is used
    custom_script = request.files.get('custom_script')
    
    if file.filename == '':
        return jsonify({
            'success': False,
            'error': 'No file selected'
        }), 400
    
    if not (file and allowed_file(file.filename)):
        return jsonify({
            'success': False,
            'error': 'Invalid file type'
        }), 400

    # Resolved here, not inside upload_async: assigning model_name in the
    # thread made it a local there, so every upload crashed on first use.
    filename = secure_filename(file.filename)
    if not model_name:
        model_name = filename.rsplit('.', 1)[0]
    is_pt = filename.lower().endswith('.pt')
    is_onnx = filename.lower().endswith('.onnx')
    # Keeping the uploaded format is not a conversion
    converting = target_format not in ('PyTorch', 'ONNX' if is_onnx else 'PyTorch')

    if custom_script and custom_script.filename and not custom_script.filename.endswith('.py'):
        return jsonify({'success': False, 'error': 'Custom script must be a Python (.py) file'}), 400

    # Export settings only apply to .pt files (the format Ultralytics converts from)
    export_options = None
    calibration_zip = request.files.get('calibration_zip')
    if is_pt:
        if converting:
            missing = ai_manager.missing_requirement(yolo=True, target_format=target_format)
            if missing:
                logger.error(f"Upload of {model_name} rejected: {missing}")
                return jsonify({'success': False, 'error': missing}), 400
            size_problem = target_format == 'TensorRT' and tensorrt_size_problem(filename)
            if size_problem:
                logger.error(f"Upload of {model_name} rejected: {size_problem}")
                return jsonify({'success': False, 'error': size_problem}), 400
        calibration = request.form.get('calibration') or None   # 'coco' | 'upload'
        try:
            if calibration == 'upload' and not (calibration_zip and calibration_zip.filename):
                raise ValueError("Choose a .zip of calibration images to upload")
            export_options = normalize_export_options(
                target_format,
                precision=request.form.get('precision'),
                imgsz=request.form.get('imgsz'),
                workspace=request.form.get('workspace'),
                calibration=calibration,
            )
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400
    elif is_onnx and converting:
        # Any ONNX model -> TensorRT with trtexec (FP32/FP16; INT8 would need a calibration cache)
        if target_format != 'TensorRT':
            return jsonify({'success': False, 'error': 'ONNX files can only be converted to TensorRT'}), 400
        if not ai_manager.find_trtexec():
            return jsonify({'success': False,
                            'error': "trtexec (part of JetPack's TensorRT) was not found, so ONNX can't be converted."}), 400
        if (request.form.get('precision') or '').lower() == 'int8':
            return jsonify({'success': False,
                            'error': 'INT8 is not available for ONNX uploads. Choose FP16 or FP32, '
                                     'or upload the YOLO .pt file to build an INT8 engine.'}), 400
        try:
            export_options = normalize_export_options(
                'TensorRT',
                precision=request.form.get('precision'),
                imgsz=request.form.get('imgsz'),
                workspace=request.form.get('workspace'),
            )
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400
    elif converting:
        return jsonify({'success': False,
                        'error': 'Only Ultralytics YOLO .pt files and ONNX files can be converted. '
                                 'Upload this file as-is.'}), 400

    # Save the uploaded files now: Flask closes the request's file streams
    # once this handler returns, so the background thread can't read them.
    saved_file_path = saved_script_path = calibration_dir = None

    def discard_saved_files():
        for path in (saved_file_path, saved_script_path):
            try:
                if path and os.path.exists(path):
                    os.remove(path)
            except OSError:
                pass
        if calibration_dir:
            shutil.rmtree(os.path.dirname(calibration_dir), ignore_errors=True)

    try:
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        saved_file_path = os.path.abspath(os.path.join(app.config['UPLOAD_FOLDER'], f"{uuid.uuid4().hex}_{filename}"))
        file.save(saved_file_path)
        saved_file_size = os.path.getsize(saved_file_path)
        if custom_script and custom_script.filename:
            saved_script_path = os.path.abspath(os.path.join(
                app.config['UPLOAD_FOLDER'], f"{uuid.uuid4().hex}_{secure_filename(custom_script.filename)}"))
            custom_script.save(saved_script_path)
    except Exception as e:
        discard_saved_files()
        logger.error(f"Error saving uploaded model {model_name}: {e}")
        return jsonify({'success': False, 'error': f'Could not save uploaded file: {e}'}), 500

    if is_pt and export_options is not None:
        if not ai_manager.is_ultralytics_checkpoint(saved_file_path):
            if converting:
                discard_saved_files()
                return jsonify({'success': False,
                                'error': "This .pt file isn't an Ultralytics YOLO model, so JDBoard can't convert it. "
                                         "Choose 'PyTorch' to upload it as-is."}), 400
            export_options = None   # plain PyTorch file: keep the old behaviour, no YOLO settings
        elif export_options.get('calibration') == 'upload':
            # Unpack calibration images last, after every other check has passed
            calibration_dir, error = extract_calibration_zip(calibration_zip)
            if error:
                discard_saved_files()
                return jsonify({'success': False, 'error': error}), 400
            export_options['calibration'] = calibration_dir

    def progress_callback(progress, status):
        # Update persistent state
        if download_id in active_downloads:
            active_downloads[download_id]['progress'] = progress
            active_downloads[download_id]['status'] = status
        
        socketio.emit('download_progress', {
            'download_id': download_id,
            'progress': progress,
            'status': status,
            'stage': 'upload'
        })

    def upload_async():
        try:
            # Track this upload with persistent information
            active_downloads[download_id] = {
                'type': 'upload',
                'download_type': 'upload',
                'model_name': model_name,
                'target_format': target_format,
                'started_at': datetime.now().isoformat(),
                'progress': 0,
                'status': 'Preparing upload...',
                'file_size': saved_file_size
            }
            progress_callback(30, 'File received...')
            if saved_script_path:
                logger.info(f"Custom script saved: {os.path.basename(saved_script_path)}")

            if is_download_cancelled(download_id):
                discard_saved_files()
                cleanup_download(download_id)
                return

            if export_options is not None:
                # Ultralytics .pt: convert (if asked) and register with its settings
                result = ai_manager.convert_uploaded_model(
                    saved_file_path, model_name, target_format, filename,
                    custom_script_path=saved_script_path,
                    progress_callback=progress_callback,
                    cancel_check_callback=lambda: is_download_cancelled(download_id),
                    export_options=export_options,
                    model_type=model_type,
                )
                model_info = result['model_info']
                # Cancelled just as it finished: remove the registered model
                if is_download_cancelled(download_id):
                    try:
                        ai_manager.delete_model(result['model_id'])
                        logger.info(f"Removed {model_name}: upload was cancelled as it completed")
                    except Exception as cleanup_error:
                        logger.warning(f"Could not remove cancelled model {model_name}: {cleanup_error}")
                    cleanup_download(download_id)
                    return
            else:
                progress_callback(70, 'Registering model...')
                model_info = ai_manager.register_model(
                    model_name=model_name,
                    file_path=saved_file_path,
                    model_type=model_type,
                    original_filename=filename,
                    custom_script_path=saved_script_path
                )
                progress_callback(100, 'Upload complete')

            logger.info(f"Model uploaded: {model_name} from {client_ip}" +
                        (f", converted to {target_format}" if converting else '') +
                        (' (with custom script)' if saved_script_path else ' (default handler)'))

            load_problem = ai_manager.missing_requirement(model_info.get('framework'))
            finish_download(
                download_id, True, model_name,
                message=(f'Model {model_name} uploaded, but it cannot be loaded yet.' if load_problem else
                         f'Model {model_name} ' + (f'converted to {target_format} and ' if converting else 'uploaded and ') +
                         'ready for use!' + (' Custom inference script loaded.' if saved_script_path else '')),
                warning=load_problem,
            )

        except Exception as e:
            log_failure("Error uploading model", e)
            # convert_uploaded_model already removed the model file and its byproducts
            discard_saved_files()
            if is_download_cancelled(download_id):
                logger.info(f"Upload {model_name} stopped after cancel")
                cleanup_download(download_id)
            else:
                finish_download(download_id, False, model_name, error=str(e))
        finally:
            # Uploaded calibration images are only needed for the build
            if calibration_dir:
                shutil.rmtree(os.path.dirname(calibration_dir), ignore_errors=True)

    upload_thread = threading.Thread(target=upload_async, daemon=True)
    download_threads[download_id] = upload_thread
    upload_thread.start()

    return jsonify({
        'success': True,
        'download_started': True,
        'download_id': download_id,
        'message': f'Upload started for {model_name}'
    })

@app.route('/models/<model_id>/load', methods=['POST'])
def load_model(model_id):
    """Load a model for inference"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/models/{model_id}/load',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        # Check if model is already loaded and handle edge cases
        force_reload = request.json.get('force_reload', False) if request.is_json else False
        
        if force_reload:
            result = ai_manager.force_reload_model(model_id)
        else:
            result = ai_manager.load_model(model_id)
            
        logger.info(f"Model {model_id} loaded by {client_ip} (force_reload={force_reload})")
        
        return jsonify({
            'success': True,
            'data': result,
            'message': f'Model {model_id} loaded successfully'
        })
    except Exception as e:
        logger.error(f"Error loading model {model_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/models/<model_id>/force-reload', methods=['POST'])
def force_reload_model(model_id):
    """Force unload and reload a model from memory"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/models/{model_id}/force-reload',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        # Force unload first
        ai_manager.force_reload_model(model_id)
        logger.info(f"Model {model_id} force reloaded by {client_ip}")
        
        # Get updated model status
        models = ai_manager.list_models()
        target_model = None
        for model in models:
            if model['id'] == model_id:
                target_model = model
                break
                
        if not target_model:
            return jsonify({
                'success': False,
                'error': 'Model not found after reload'
            }), 404
            
        return jsonify({
            'success': True,
            'data': target_model,
            'message': f'Model {model_id} force reloaded successfully'
        })
    except Exception as e:
        logger.error(f"Error force reloading model {model_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/models/<model_id>/unload', methods=['POST'])
def unload_model(model_id):
    """Unload a model from memory"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/models/{model_id}/unload',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        result = ai_manager.unload_model(model_id)
        logger.info(f"Model {model_id} unloaded by {client_ip}")
        
        return jsonify({
            'success': True,
            'data': result,
            'message': f'Model {model_id} unloaded successfully'
        })
    except Exception as e:
        logger.error(f"Error unloading model {model_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/models/<model_id>', methods=['DELETE'])
def delete_model(model_id):
    """Delete a model from the system"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/models/{model_id}',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        result = ai_manager.delete_model(model_id)
        logger.info(f"Model {model_id} deleted by {client_ip}")
        
        return jsonify({
            'success': True,
            'data': result,
            'message': f'Model {model_id} deleted successfully'
        })
    except Exception as e:
        logger.error(f"Error deleting model {model_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/models/<model_id>/rename', methods=['PUT'])
def rename_model(model_id):
    """Rename a model"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/models/{model_id}/rename',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    data = request.get_json()
    if not data:
        return jsonify({
            'success': False,
            'error': 'No data provided'
        }), 400
    
    new_name = data.get('new_name', '').strip()
    if not new_name:
        return jsonify({
            'success': False,
            'error': 'New name is required'
        }), 400
    
    if len(new_name) < 2:
        return jsonify({
            'success': False,
            'error': 'Model name must be at least 2 characters long'
        }), 400
    
    if len(new_name) > 50:
        return jsonify({
            'success': False,
            'error': 'Model name must be less than 50 characters'
        }), 400
    
    # Check for invalid characters (valid ID format)
    import re
    if not re.match(r'^[a-zA-Z0-9\-_\.()]+$', new_name):
        return jsonify({
            'success': False,
            'error': 'Model ID contains invalid characters. Only letters, numbers, and -_.() are allowed (no spaces)'
        }), 400
    
    try:
        # Check if model exists
        models = ai_manager.list_models()
        current_model = None
        for model in models:
            if model['id'] == model_id:
                current_model = model
                break
        
        if not current_model:
            return jsonify({
                'success': False,
                'error': 'Model not found'
            }), 404
        
        # Check for ID uniqueness
        for model in models:
            if model['id'] == new_name:
                return jsonify({
                    'success': False,
                    'error': 'A model with this ID already exists'
                }), 400
        
        # Perform the rename (change model ID)
        result = ai_manager.rename_model(model_id, new_name)
        logger.info(f"Model {model_id} renamed to '{new_name}' by {client_ip}")
        
        return jsonify({
            'success': True,
            'data': result,
            'message': f'Model ID changed to "{new_name}" successfully'
        })
    except Exception as e:
        logger.error(f"Error renaming model {model_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/models/custom-script-template', methods=['GET'])
def download_custom_script_template():
    """Download the custom model inference script template"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/models/custom-script-template',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        template_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates', 'custom_model_template.py')
        
        if not os.path.exists(template_path):
            return jsonify({
                'success': False,
                'error': 'Template file not found'
            }), 404
        
        logger.info(f"Custom script template downloaded by {client_ip}")
        
        return send_file(
            template_path,
            as_attachment=True,
            download_name='custom_model_template.py',
            mimetype='text/x-python'
        )
    except Exception as e:
        logger.error(f"Error downloading custom script template: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/models/<model_id>/custom-script', methods=['GET'])
def get_model_custom_script(model_id):
    """Get the custom inference script for a specific model"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/models/{model_id}/custom-script',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        # Get model info from registry
        models = ai_manager.list_models()
        target_model = None
        for model in models:
            if model['id'] == model_id:
                target_model = model
                break
        
        if not target_model:
            return jsonify({
                'success': False,
                'error': 'Model not found'
            }), 404
        
        # Check if model has a custom script
        custom_script_path = target_model.get('custom_script_path')
        
        if not custom_script_path:
            return jsonify({
                'success': False,
                'error': 'Model does not have a custom inference script'
            }), 404
        
        if not os.path.exists(custom_script_path):
            return jsonify({
                'success': False,
                'error': 'Custom script file not found on disk'
            }), 404
        
        # Read the script content
        with open(custom_script_path, 'r', encoding='utf-8') as f:
            script_content = f.read()
        
        logger.info(f"Custom script for model {model_id} retrieved by {client_ip}")
        
        return jsonify({
            'success': True,
            'data': {
                'script_content': script_content,
                'script_path': custom_script_path,
                'model_id': target_model['id']
            }
        })
    except Exception as e:
        logger.error(f"Error getting custom script for model {model_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/models/<model_id>/custom-script', methods=['PUT'])
def update_model_custom_script(model_id):
    """Save an edited inference script for a model (body: {"script_content": "..."})."""
    data = request.get_json(silent=True) or {}
    content = data.get('script_content')
    if not isinstance(content, str) or not content.strip():
        return jsonify({'success': False, 'error': 'script_content is required'}), 400
    request_logger.log_request(
        endpoint=f'/models/{model_id}/custom-script',
        client_ip=get_client_ip(),
        user_agent=request.headers.get('User-Agent', 'Unknown'),
        method=request.method,
        data={'bytes': len(content)}
    )
    try:
        status = ai_manager.set_custom_script(model_id, content)
        return jsonify({'success': True, 'data': status})
    except KeyError:
        return jsonify({'success': False, 'error': 'Model not found'}), 404
    except ValueError as e:
        # ScriptError carries the line in the script and a short traceback
        return jsonify({'success': False, 'error': str(e),
                        'error_line': getattr(e, 'line', None),
                        'traceback': getattr(e, 'traceback_text', None)}), 400
    except Exception as e:
        logger.error(f"Error saving custom script for {model_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/models/<model_id>/custom-script', methods=['DELETE'])
def reset_model_custom_script(model_id):
    """Remove a model's custom script so it uses the default handler again."""
    try:
        status = ai_manager.clear_custom_script(model_id)
        return jsonify({'success': True, 'data': status})
    except KeyError:
        return jsonify({'success': False, 'error': 'Model not found'}), 404
    except Exception as e:
        logger.error(f"Error resetting custom script for {model_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/models/download-yolo', methods=['POST'])
def download_yolo_model():
    """Download and optionally convert a YOLO model with custom script support and real-time progress updates"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    # Support both JSON and FormData
    if request.is_json:
        data = request.get_json()
        custom_script = None
    else:
        # FormData
        data = request.form.to_dict()
        custom_script = request.files.get('custom_script')
    
    if not data:
        return jsonify({
            'success': False,
            'error': 'No data provided'
        }), 400
    
    request_logger.log_request(
        endpoint='/models/download-yolo',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method,
        data={k: v for k, v in data.items() if k != 'download_id'}
    )
    
    model_url = data.get('model_url')
    model_name = data.get('model_name')
    target_format = data.get('target_format', 'PyTorch')
    download_id = data.get('download_id', str(uuid.uuid4()))
    
    if not model_url or not model_name:
        return jsonify({
            'success': False,
            'error': 'model_url and model_name are required'
        }), 400

    missing = ai_manager.missing_requirement(yolo=True, target_format=target_format if target_format != 'PyTorch' else None)
    if missing:
        logger.error(f"YOLO download of {model_name} rejected: {missing}")
        return jsonify({'success': False, 'error': missing}), 400

    # Export settings chosen in the dialog (precision, image size, TensorRT
    # workspace, INT8 calibration source)
    calibration_zip = None if request.is_json else request.files.get('calibration_zip')
    calibration = data.get('calibration') or None   # 'coco' | 'upload'
    try:
        if calibration == 'upload' and not (calibration_zip and calibration_zip.filename):
            raise ValueError("Choose a .zip of calibration images to upload")
        export_options = normalize_export_options(
            target_format,
            precision=data.get('precision'),
            imgsz=data.get('imgsz'),
            workspace=data.get('workspace'),
            calibration=calibration,
        )
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400


    # Building a TensorRT engine for the large YOLO sizes needs more memory than
    # 8 GB boards have (YOLOv11x was OOM-killed after minutes on an Orin Nano 8GB),
    # so refuse up front instead of failing partway through.
    # Measured on an Orin Nano 8GB: YOLOv11x ran out of memory both as FP32 (after
    # ~2-4 min) and as FP16 with a 2 GB workspace (after ~10 min).
    size_problem = target_format == 'TensorRT' and tensorrt_size_problem(model_url)
    if size_problem:
        logger.error(f"YOLO download of {model_name} rejected: {size_problem}")
        return jsonify({'success': False, 'error': size_problem}), 400

    # Save an uploaded custom script now; the request's file stream is closed
    # by the time the background thread runs.
    saved_script_path = None
    if custom_script and getattr(custom_script, 'filename', ''):
        if not custom_script.filename.endswith('.py'):
            return jsonify({'success': False, 'error': 'Custom script must be a Python (.py) file'}), 400
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        saved_script_path = os.path.abspath(os.path.join(
            app.config['UPLOAD_FOLDER'], f"{uuid.uuid4().hex}_{secure_filename(custom_script.filename)}"))
        custom_script.save(saved_script_path)

    # Unpack calibration images last, after every other check has passed
    calibration_dir = None
    if export_options.get('calibration') == 'upload':
        calibration_dir, error = extract_calibration_zip(calibration_zip)
        if error:
            if saved_script_path and os.path.exists(saved_script_path):
                os.remove(saved_script_path)
            return jsonify({'success': False, 'error': error}), 400
        export_options['calibration'] = calibration_dir
    
    try:
        def progress_callback(progress, status):
            # Update persistent state
            if download_id in active_downloads:
                active_downloads[download_id]['progress'] = progress
                active_downloads[download_id]['status'] = status
            
            socketio.emit('download_progress', {
                'download_id': download_id,
                'progress': progress,
                'status': status,
                'stage': 'download'
            })
        
        # Start async download process
        def download_async():
            custom_script_path = None
            try:
                # Track this download with persistent information
                active_downloads[download_id] = {
                    'type': 'yolo_download',
                    'download_type': 'yolo_download',
                    'model_name': model_name,
                    'model_url': model_url,
                    'target_format': target_format,
                    'started_at': datetime.now().isoformat(),
                    'progress': 0,
                    'status': 'Starting download...'
                }
                
                # Custom script (optional; default handler otherwise) - saved by the request handler
                custom_script_path = saved_script_path
                if custom_script_path:
                    logger.info(f"Custom script saved for YOLO download: {os.path.basename(custom_script_path)}")
                
                result = ai_manager.download_yolo_model(
                    model_url=model_url,
                    model_name=model_name,
                    target_format=target_format,
                    custom_script_path=custom_script_path,
                    progress_callback=progress_callback,
                    cancel_check_callback=lambda: is_download_cancelled(download_id),
                    export_options=export_options
                )
                
                # Cancelled just as it finished: the model is already registered,
                # so remove it (and its files/script) to honor the cancel
                if is_download_cancelled(download_id):
                    try:
                        ai_manager.delete_model(result['model_id'])
                        logger.info(f"Removed {model_name}: download was cancelled as it completed")
                    except Exception as cleanup_error:
                        logger.warning(f"Could not remove cancelled model {model_name}: {cleanup_error}")
                    cleanup_download(download_id)
                    return
                
                logger.info(f"YOLO model {model_name} downloaded" +
                           (f" and converted to {target_format}" if target_format != 'PyTorch' else '') +
                           f" by {client_ip}" +
                           (' (with custom script)' if custom_script_path else ' (default handler)'))
                
                finish_download(
                    download_id, True, model_name,
                    message=f'YOLO model {model_name} is ready for inference!' +
                            (' Custom inference script loaded.' if custom_script_path else '')
                )
                
            except Exception as e:
                log_failure("Error downloading YOLO model", e)
                # Clean up the uploaded custom script on error
                if custom_script_path:
                    try:
                        if os.path.exists(custom_script_path):
                            os.remove(custom_script_path)
                    except:
                        pass
                if is_download_cancelled(download_id):
                    # Cancelled by the user: the cancel endpoint already told clients
                    logger.info(f"YOLO download {model_name} stopped after cancel")
                    cleanup_download(download_id)
                else:
                    finish_download(download_id, False, model_name, error=str(e))
            finally:
                # Uploaded calibration images are only needed for the build
                if calibration_dir:
                    shutil.rmtree(os.path.dirname(calibration_dir), ignore_errors=True)
        
        # Start download in background thread and track it
        download_thread = threading.Thread(target=download_async, daemon=True)
        download_threads[download_id] = download_thread
        download_thread.start()
        
        return jsonify({
            'success': True,
            'download_started': True,
            'download_id': download_id,
            'message': f'Download started for {model_name}'
        })
        
    except Exception as e:
        logger.error(f"Error starting YOLO model download: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/models/cancel-download', methods=['POST'])
def cancel_download():
    """Cancel an active download"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    data = request.get_json()
    if not data:
        return jsonify({
            'success': False,
            'error': 'No JSON data provided'
        }), 400
    
    download_id = data.get('download_id')
    if not download_id:
        return jsonify({
            'success': False,
            'error': 'download_id is required'
        }), 400
    
    request_logger.log_request(
        endpoint='/models/cancel-download',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method,
        data={'download_id': download_id}
    )
    
    try:
        # Check if download exists
        if download_id not in active_downloads:
            result = finished_downloads.get(download_id)
            if result:
                return jsonify({
                    'success': False,
                    'already_finished': True,
                    'result': {k: v for k, v in result.items() if k != 'finished_ts'},
                    'error': ('Download already failed: ' + (result.get('error') or 'unknown error'))
                             if not result['success'] else 'Download already completed'
                }), 409
            return jsonify({
                'success': False,
                'error': 'Download not found or already completed'
            }), 404
        
        # Get download info for cleanup
        download_info = active_downloads[download_id]
        
        # Set the cancel flag
        set_download_cancelled(download_id)
        
        # File cleanup is done by the download/upload thread itself when it sees
        # the cancel flag: it removes only the files it created. (Deleting every
        # file whose name contains the model name here also removed other models'
        # files, e.g. cancelling "YOLOv11x" deleted "YOLOv11x-pt".)

        logger.info(f"Download {download_id} cancelled by {client_ip}")
        
        # Emit cancellation event
        socketio.emit('download_cancelled', {
            'download_id': download_id
        })
        
        return jsonify({
            'success': True,
            'message': 'Download cancellation requested'
        })
        
    except Exception as e:
        logger.error(f"Error cancelling download: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/models/downloads/<download_id>/status', methods=['GET'])
def get_download_status(download_id):
    """State of one download: active (with progress), completed, failed, or unknown"""
    if download_id in active_downloads:
        info = active_downloads[download_id]
        return jsonify({'success': True, 'state': 'active',
                        'progress': info.get('progress', 0), 'status': info.get('status', ''),
                        'model_name': info.get('model_name', '')})
    result = finished_downloads.get(download_id)
    if result:
        return jsonify({'success': True, **{k: v for k, v in result.items() if k not in ('finished_ts', 'success')}})
    return jsonify({'success': True, 'state': 'unknown'})

@app.route('/models/active-downloads', methods=['GET'])
def get_active_downloads():
    """Get list of active downloads/conversions to restore state on page reload"""
    try:
        # Clean up any completed downloads first
        completed_downloads = []
        for download_id, download_info in active_downloads.items():
            if download_info.get('progress', 0) >= 100:
                completed_downloads.append(download_id)
        
        for download_id in completed_downloads:
            cleanup_download(download_id)
        
        # Return sanitized active downloads (remove callback functions)
        sanitized_downloads = {}
        for download_id, download_info in active_downloads.items():
            sanitized_downloads[download_id] = {
                'model_name': download_info.get('model_name', ''),
                'progress': download_info.get('progress', 0),
                'status': download_info.get('status', 'Unknown'),
                'started_at': download_info.get('started_at', ''),
                'download_type': download_info.get('download_type', 'unknown'),
                'model_url': download_info.get('model_url', ''),
                'target_format': download_info.get('target_format', '')
            }
        
        return jsonify({
            'success': True,
            'active_downloads': sanitized_downloads
        })
        
    except Exception as e:
        logger.error(f"Error getting active downloads: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'active_downloads': {}
        }), 500

@app.route('/models/list')
def list_models_detailed():
    """List all models with detailed information"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/models/list',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        models = ai_manager.get_detailed_models_list()
        return jsonify({
            'success': True,
            'models': models,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error listing models: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/models/emergency-cleanup', methods=['POST'])
def emergency_cleanup():
    """Emergency cleanup to free all GPU memory"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/models/emergency-cleanup',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        result = ai_manager.emergency_cleanup()
        logger.info(f"Emergency cleanup performed by {client_ip}")
        
        # Get memory status after cleanup
        mem_info = ai_manager.memory_manager.get_gpu_memory_info()
        
        return jsonify({
            'success': True,
            'data': {
                'cleaned': result,
                'gpu_memory': {
                    'total_gb': mem_info.get('total_gb', 0),
                    'free_gb': mem_info.get('free_gb', 0),
                    'allocated_gb': mem_info.get('allocated_gb', 0)
                }
            },
            'message': 'Emergency cleanup completed successfully'
        })
    except Exception as e:
        logger.error(f"Error during emergency cleanup: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/debug/client-info', methods=['GET'])
def debug_client_info():
    """Debug endpoint to show client IP detection"""
    client_ip = get_client_ip()
    
    return jsonify({
        'detected_ip': client_ip,
        'remote_addr': request.remote_addr,
        'headers': {
            'X-Forwarded-For': request.headers.get('X-Forwarded-For'),
            'X-Real-IP': request.headers.get('X-Real-IP'), 
            'X-Client-IP': request.headers.get('X-Client-IP'),
            'CF-Connecting-IP': request.headers.get('CF-Connecting-IP'),
            'User-Agent': request.headers.get('User-Agent')
        },
        'all_headers': dict(request.headers)
    })

@app.route('/inference/<model_id>', methods=['POST'])
def run_inference(model_id):
    """Run inference on uploaded image"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    # Log the request with proper IP
    request_logger.log_request(
        endpoint=f'/inference/{model_id}',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    if 'image' not in request.files:
        return jsonify({
            'success': False,
            'error': 'No image provided'
        }), 400
    
    file = request.files['image']
    
    try:
        # Read image
        image_bytes = file.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            return jsonify({
                'success': False,
                'error': 'Invalid image format'
            }), 400
        
        # Run inference
        start_time = time.time()
        result = ai_manager.run_inference(model_id, image)
        inference_time = time.time() - start_time
        
        # Get image dimensions for metadata
        image_size = f"{image.shape[1]}x{image.shape[0]}" if image is not None else None
        
        # Extract framework info from result if available
        framework = result.get('framework', 'unknown') if isinstance(result, dict) else 'unknown'
        
        # Log inference with enhanced metadata and proper client IP
        request_logger.log_inference(
            model_id=model_id,
            client_ip=client_ip,
            inference_time=inference_time,
            result=result,
            image_data=image_bytes,
            user_agent=user_agent,
            framework=framework,
            image_size=image_size
        )
        
        logger.info(f"Inference completed for {model_id} in {inference_time:.3f}s by {client_ip} (User-Agent: {user_agent[:50]}...)")
        
        return jsonify({
            'success': True,
            'data': {
                'result': result,
                'inference_time': inference_time,
                'model_id': model_id
            }
        })
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error during inference: {error_msg}")
        
        # Handle CUDA memory errors specifically
        if "out of memory" in error_msg.lower() or "cuda error" in error_msg.lower():
            logger.warning("CUDA memory error detected, performing emergency cleanup")
            try:
                ai_manager.emergency_cleanup()
                return jsonify({
                    'success': False,
                    'error': 'GPU memory exhausted. All models have been unloaded to free memory. Please try again.',
                    'error_type': 'cuda_memory_error'
                }), 507  # Insufficient Storage
            except Exception as cleanup_error:
                logger.error(f"Emergency cleanup failed: {cleanup_error}")
                return jsonify({
                    'success': False,
                    'error': 'Critical GPU memory error. Please restart the service.',
                    'error_type': 'critical_memory_error'
                }), 500
        
        return jsonify({
            'success': False,
            'error': error_msg
        }), 500

@app.route('/logs/requests')
def get_request_logs():
    """Get request logs with pagination"""
    client_ip = get_client_ip()
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    
    try:
        logs = request_logger.get_logs(page=page, per_page=per_page)
        return jsonify({
            'success': True,
            'data': logs
        })
    except Exception as e:
        logger.error(f"Error getting logs: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/logs/stats')
def get_log_stats():
    """Get request statistics"""
    try:
        stats = request_logger.get_stats()
        return jsonify({
            'success': True,
            'data': stats
        })
    except Exception as e:
        logger.error(f"Error getting log stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/logs/inference')
def get_inference_logs():
    """Get inference logs with pagination and filtering"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/logs/inference',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    # Parse query parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    filter_client_ip = request.args.get('client_ip', None)
    filter_model_id = request.args.get('model_id', None)
    filter_device_info = request.args.get('device_info', None)
    search = request.args.get('search', None)
    start_date = request.args.get('start_date', None)
    end_date = request.args.get('end_date', None)
    
    try:
        logs = request_logger.get_logs(
            log_type='inference',
            page=page,
            per_page=per_page,
            client_ip=filter_client_ip,
            start_date=start_date,
            end_date=end_date,
            model_id=filter_model_id,
            search=search,
            device_info=filter_device_info
        )
        
        # Flatten the response structure
        return jsonify({
            'success': True,
            'data': {
                'logs': logs.get('logs', []),
                'page': logs.get('pagination', {}).get('page', page),
                'per_page': logs.get('pagination', {}).get('per_page', per_page),
                'total': logs.get('pagination', {}).get('total', 0),
                'pages': logs.get('pagination', {}).get('pages', 0)
            }
        })
    except Exception as e:
        logger.error(f"Error getting inference logs: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/logs/inference/export/<format>')
def export_inference_logs(format):
    """Export inference logs in different formats"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/logs/inference/export/{format}',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        if format.lower() not in ['json', 'csv', 'txt']:
            return jsonify({
                'success': False,
                'error': 'Unsupported format. Use json, csv, or txt'
            }), 400
        
        # Get all inference logs without pagination
        logs_data = request_logger.get_logs(
            log_type='inference',
            page=1,
            per_page=10000  # Large number to get all logs
        )
        
        if format.lower() == 'json':
            from flask import Response
            import json
            
            response = Response(
                json.dumps(logs_data, indent=2),
                mimetype='application/json',
                headers={'Content-Disposition': f'attachment; filename=inference_logs.json'}
            )
            return response
            
        elif format.lower() == 'csv':
            import csv
            import io
            
            output = io.StringIO()
            if logs_data.get('logs'):
                fieldnames = logs_data['logs'][0].keys() if logs_data['logs'] else []
                writer = csv.DictWriter(output, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(logs_data['logs'])
            
            from flask import Response
            response = Response(
                output.getvalue(),
                mimetype='text/csv',
                headers={'Content-Disposition': f'attachment; filename=inference_logs.csv'}
            )
            return response
            
        elif format.lower() == 'txt':
            import io
            
            output = io.StringIO()
            output.write("Inference Logs Export\n")
            output.write("=" * 50 + "\n\n")
            
            if logs_data.get('logs'):
                for log in logs_data['logs']:
                    output.write(f"Timestamp: {log.get('timestamp', 'N/A')}\n")
                    output.write(f"Model ID: {log.get('model_id', 'N/A')}\n")
                    output.write(f"Client IP: {log.get('client_ip', 'N/A')}\n")
                    output.write(f"Inference Time: {log.get('inference_time', 'N/A')}s\n")
                    output.write(f"Session ID: {log.get('session_id', 'N/A')}\n")
                    output.write("-" * 30 + "\n")
            
            from flask import Response
            response = Response(
                output.getvalue(),
                mimetype='text/plain',
                headers={'Content-Disposition': f'attachment; filename=inference_logs.txt'}
            )
            return response
            
    except Exception as e:
        logger.error(f"Error exporting inference logs: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/logs/inference/clear', methods=['POST'])
def clear_inference_logs():
    """Clear all inference logs"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/logs/inference/clear',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        result = request_logger.clear_inference_logs()
        
        # Log the clear operation as a system event
        request_logger.log_system_event(
            event_type='inference_logs_cleared',
            event_data={'cleared_count': result.get('cleared_count', 0), 'client_ip': client_ip},
            severity='INFO'
        )
        
        return jsonify({
            'success': True,
            'data': result
        })
    except Exception as e:
        logger.error(f"Error clearing inference logs: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/logs/inference/stats')
def get_inference_stats():
    """Get detailed inference statistics"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/logs/inference/stats',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        stats = request_logger.get_inference_stats()
        return jsonify({
            'success': True,
            'data': stats
        })
    except Exception as e:
        logger.error(f"Error getting inference stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.errorhandler(413)
def too_large(e):
    return jsonify({
        'success': False,
        'error': 'File too large. Maximum size is 500MB.'
    }), 413

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

# WebSocket Events
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    logger.info(f"Client connected: {request.sid}")
    emit('connected', {'status': 'Connected to Jetson Edge AI Dashboard'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    logger.info(f"Client disconnected: {request.sid}")

@socketio.on('request_system_data')
def handle_system_data_request():
    """Handle request for system data"""
    try:
        system_data = system_monitor.get_system_status()
        
        # Add AI models information
        try:
            loaded_models = ai_manager.list_models()
            system_data['models'] = [model for model in loaded_models if model.get('loaded', False)]
        except Exception as e:
            logger.debug(f"Error getting models list: {e}")
            system_data['models'] = []
        
        # Add inference statistics
        try:
            request_stats = request_logger.get_stats()
            # Get total lifetime inferences (not just 24h)
            total_inferences = request_logger.get_total_inference_count()
            system_data['stats'] = {
                'totalInferences': total_inferences
            }
        except Exception as e:
            logger.debug(f"Error getting inference stats: {e}")
            system_data['stats'] = {
                'totalInferences': 0
            }
        
        # Validate JSON serialization
        try:
            json.dumps(system_data)
        except (TypeError, ValueError) as e:
            logger.error(f"System data not JSON serializable: {str(e)}")
            emit('system_data', {
                'success': False,
                'error': 'Data serialization error'
            })
            return
            
        emit('system_data', {
            'success': True,
            'data': system_data
        })
    except Exception as e:
        logger.error(f"Error handling system data request: {str(e)}")
        emit('system_data', {
            'success': False,
            'error': str(e)
        })

@socketio.on('subscribe_logs')
def handle_log_subscription(data):
    """Handle subscription to filtered log updates"""
    try:
        since_timestamp = data.get('since', 0)
        filter_term = data.get('filter', '')
        
        logs = []
        log_file_path = '../logs/app.log'
        
        if os.path.exists(log_file_path):
            with open(log_file_path, 'r') as f:
                lines = f.readlines()
                
            # Parse recent logs
            for line in reversed(lines[-1000:]):  # Check last 1000 lines
                try:
                    # Parse log line format: timestamp - logger - level - message
                    parts = line.strip().split(' - ', 3)
                    if len(parts) >= 4:
                        timestamp_str = parts[0]
                        # Handle both comma and period in timestamp
                        timestamp_str = timestamp_str.replace(',', '.')
                        try:
                            timestamp = datetime.fromisoformat(timestamp_str).timestamp() * 1000
                        except:
                            continue
                        
                        # Filter by timestamp if provided
                        if since_timestamp and timestamp < since_timestamp:
                            continue
                            
                        logger_name = parts[1]
                        level = parts[2]
                        message = parts[3]
                        
                        # Filter by term if provided
                        if filter_term and filter_term.lower() not in message.lower():
                            continue
                        
                        logs.append({
                            'timestamp': timestamp,
                            'logger': logger_name,
                            'level': level,
                            'message': message
                        })
                        
                except (ValueError, IndexError):
                    continue
        
        # Sort by timestamp (newest first)
        logs.sort(key=lambda x: x['timestamp'], reverse=True)
        
        emit('logs_update', {
            'success': True,
            'logs': logs,
            'count': len(logs)
        })
    except Exception as e:
        logger.error(f"Error handling log subscription: {str(e)}")
        emit('logs_update', {
            'success': False,
            'error': str(e)
        })

# System Settings API Endpoints
@app.route('/auth/sudo', methods=['POST'])
def authenticate_sudo():
    """Authenticate sudo password"""
    try:
        # If already running as root, no password needed
        if is_running_as_root():
            session_id = str(uuid.uuid4())
            logger.info(f"Application running as root - sudo authentication bypassed for session {session_id}")
            return jsonify({
                'success': True,
                'session_id': session_id,
                'message': 'Running as root - no authentication needed',
                'is_root': True
            })
        
        data = request.json
        password = data.get('password', '')
        
        if not password:
            return jsonify({'success': False, 'error': 'Password required'}), 400
        
        # Test sudo password by running a simple command
        import subprocess
        result = subprocess.run(
            ['sudo', '-S', '-k', 'true'],
            input=password + '\n',
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            # Store password hash for session management (in production, use secure storage)
            session_id = str(uuid.uuid4())
            # In a real implementation, store this securely with encryption
            logger.info(f"Sudo authentication successful for session {session_id}")
            return jsonify({
                'success': True,
                'session_id': session_id,
                'message': 'Authentication successful',
                'is_root': False
            })
        else:
            logger.warning("Failed sudo authentication attempt")
            return jsonify({
                'success': False,
                'error': 'Invalid sudo password'
            }), 401
            
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'Authentication timeout'
        }), 408
    except Exception as e:
        logger.error(f"Error during sudo authentication: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Authentication failed'
        }), 500

@app.route('/system/info')
def get_system_info():
    """Get comprehensive system information"""
    try:
        system_data = system_monitor.get_system_status()
        return jsonify({
            **system_data,
            'board_info': system_monitor.get_board_info(),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting system info: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'config', 'settings.json')

@app.route('/settings', methods=['GET'])
def get_settings():
    """Get dashboard settings, with hardware settings read live from jtop"""
    try:
        settings = {
            'theme': 'nvidia',
            'refreshInterval': 2000,
            'notifications': True,
            'autoUpdate': True,
            'debugMode': False,
        }
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r') as f:
                settings.update(json.load(f))

        system_data = system_monitor.get_system_status()
        settings['jetsonClocks'] = bool(system_data.get('jetson_clocks', False))
        settings['powerMode'] = system_data.get('nvp_model', 'Unknown')
        settings['fanMode'] = (system_data.get('fan') or {}).get('profile') or 'quiet'
        return jsonify(settings)
    except Exception as e:
        logger.error(f"Error getting settings: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/settings', methods=['POST'])
def save_settings():
    """Save dashboard settings (hardware settings are applied via their own endpoints)"""
    try:
        settings = {k: v for k, v in (request.json or {}).items()
                    if k not in ('jetsonClocks', 'powerMode', 'fanMode')}
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(settings, f, indent=2)
        logger.info(f"Settings saved: {settings}")
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error saving settings: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

def _control_error(action, e):
    """Uniform error response for jtop control endpoints"""
    status = 400 if isinstance(e, (ValueError, JtopException)) else 503
    logger.error(f"Error {action}: {e}")
    return jsonify({'success': False, 'error': str(e)}), status

@app.route('/system/jetson-clocks', methods=['POST'])
def toggle_jetson_clocks():
    """Turn jetson_clocks on/off through jtop.service (no sudo required)"""
    try:
        enabled = system_monitor.set_jetson_clocks((request.json or {}).get('enabled', False))
        logger.info(f"Jetson Clocks {'enabled' if enabled else 'disabled'}")
        return jsonify({'success': True, 'status': 'enabled' if enabled else 'disabled'})
    except Exception as e:
        return _control_error('toggling Jetson Clocks', e)

@app.route('/system/power-modes', methods=['GET'])
def get_power_modes():
    """Get available NV power modes from jtop"""
    try:
        return jsonify({'success': True, **system_monitor.get_power_modes()})
    except Exception as e:
        return _control_error('getting power modes', e)

@app.route('/system/power-mode', methods=['POST'])
def set_power_mode():
    """Set NV power mode through jtop.service (no sudo required)"""
    try:
        mode = system_monitor.set_power_mode((request.json or {}).get('mode', ''))
        logger.info(f"Power mode set to {mode}")
        return jsonify({'success': True, 'mode': mode})
    except Exception as e:
        return _control_error('setting power mode', e)

@app.route('/system/fan-mode', methods=['GET'])
def get_fan_mode():
    """Get current and available fan profiles from jtop"""
    try:
        return jsonify({'success': True, **system_monitor.get_fan_modes()})
    except Exception as e:
        return _control_error('getting fan mode', e)

@app.route('/system/fan-mode', methods=['POST'])
def set_fan_mode():
    """Set fan profile through jtop.service (no sudo required)"""
    try:
        mode = system_monitor.set_fan_mode((request.json or {}).get('mode', ''))
        logger.info(f"Fan profile changed to {mode}")
        return jsonify({'success': True, 'mode': mode, 'profile': mode})
    except Exception as e:
        return _control_error('setting fan mode', e)

@app.route('/system/reboot', methods=['POST'])
def reboot_system():
    """Reboot the system"""
    try:
        data = request.json
        sudo_password = data.get('sudo_password', '')
        
        if not sudo_password:
            return jsonify({'success': False, 'error': 'Sudo password required'}), 400
        
        # Use a background process to delay reboot slightly to allow response
        def delayed_reboot():
            time.sleep(2)
            subprocess.run(
                ['sudo', '-S', 'reboot'],
                input=sudo_password + '\n',
                capture_output=True,
                text=True
            )
        
        threading.Thread(target=delayed_reboot, daemon=True).start()
        logger.info("System reboot initiated")
        return jsonify({'success': True, 'message': 'System rebooting...'})
        
    except Exception as e:
        logger.error(f"Error initiating reboot: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/system/shutdown', methods=['POST'])
def shutdown_system():
    """Shutdown the system"""
    try:
        data = request.json
        sudo_password = data.get('sudo_password', '')
        
        if not sudo_password:
            return jsonify({'success': False, 'error': 'Sudo password required'}), 400
        
        logger.warning("System shutdown requested")
        
        # Schedule shutdown in 5 seconds to allow response to be sent
        def delayed_shutdown():
            time.sleep(5)
            subprocess.run(
                ['sudo', '-S', 'shutdown', '-h', 'now'],
                input=sudo_password + '\n',
                capture_output=True,
                text=True
            )
        
        threading.Thread(target=delayed_shutdown, daemon=True).start()
        
        return jsonify({
            'success': True,
            'message': 'System shutdown scheduled in 5 seconds'
        })
        
    except Exception as e:
        logger.error(f"Error shutting down system: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/system/clear-cache', methods=['POST'])
def clear_system_cache():
    """Clear system cache and free memory"""
    try:
        data = request.json if request.json else {}
        sudo_password = data.get('sudo_password', '')
        
        if not sudo_password:
            return jsonify({'success': False, 'error': 'Sudo password required'}), 400
        
        logger.info("Clearing system cache")
        
        # Commands to clear different types of cache
        commands = [
            # Clear page cache
            'echo 1 > /proc/sys/vm/drop_caches',
            # Clear dentries and inodes
            'echo 2 > /proc/sys/vm/drop_caches', 
            # Clear page cache, dentries and inodes
            'echo 3 > /proc/sys/vm/drop_caches',
            # Sync filesystem
            'sync'
        ]
        
        results = []
        for cmd in commands:
            try:
                if cmd == 'sync':
                    # Sync doesn't need sudo
                    result = subprocess.run(['sync'], capture_output=True, text=True, timeout=10)
                else:
                    # Use sudo for cache clearing
                    result = subprocess.run(
                        ['sudo', '-S'] + ['sh', '-c', cmd],
                        input=sudo_password + '\n',
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                
                if result.returncode == 0:
                    results.append({'command': cmd, 'status': 'success'})
                else:
                    results.append({
                        'command': cmd, 
                        'status': 'error',
                        'error': result.stderr
                    })
            except subprocess.TimeoutExpired:
                results.append({'command': cmd, 'status': 'timeout'})
            except Exception as e:
                results.append({'command': cmd, 'status': 'error', 'error': str(e)})
        
        # Check if most commands succeeded
        success_count = sum(1 for r in results if r['status'] == 'success')
        
        return jsonify({
            'success': success_count >= len(commands) / 2,
            'message': f'Cache clearing completed. {success_count}/{len(commands)} commands successful.',
            'details': results
        })
        
    except Exception as e:
        logger.error(f"Error clearing cache: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/system/jtop-install-service', methods=['POST'])
def install_jtop_service():
    """Install and start the jtop service"""
    try:
        data = request.json
        sudo_password = data.get('sudo_password', '')
        
        if not sudo_password:
            return jsonify({'success': False, 'error': 'Sudo password required'}), 400
        
        logger.info("Installing jtop service")
        
        # First, validate the sudo password using the same method as SettingsSection  
        validate_result = subprocess.run(
            ['sudo', '-S', '-k', 'true'],
            input=sudo_password + '\n',
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if validate_result.returncode != 0:
            logger.warning(f"Sudo password validation failed: {validate_result.stderr}")
            return jsonify({
                'success': False, 
                'error': 'Invalid sudo password'
            }), 401
        
        # Run jtop --install-service
        result = subprocess.run(
            ['sudo', '-S', 'jtop', '--install-service'],
            input=sudo_password + '\n',
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            # Wait longer for service to fully start and initialize
            time.sleep(5)
            
            # Check if service is now active with retries
            max_retries = 3
            service_active = False
            
            for attempt in range(max_retries):
                check_result = subprocess.run(
                    ['systemctl', 'is-active', 'jtop.service'],
                    capture_output=True,
                    text=True
                )
                
                if check_result.returncode == 0:
                    service_active = True
                    break
                else:
                    logger.info(f"Service not ready yet (attempt {attempt + 1}/{max_retries}), waiting...")
                    time.sleep(3)
            
            if service_active:
                # Force restart the entire monitoring process to completely reinitialize
                restart_success = system_monitor.force_restart_monitoring()
                
                if restart_success:
                    return jsonify({
                        'success': True,
                        'message': 'jtop service installed and monitoring connected successfully'
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': 'Service installed but monitoring reconnection failed'
                    })
            else:
                # Try to start the service manually
                start_result = subprocess.run(
                    ['sudo', '-S', 'systemctl', 'start', 'jtop.service'],
                    input=sudo_password + '\n',
                    capture_output=True,
                    text=True
                )
                
                if start_result.returncode == 0:
                    restart_success = system_monitor.force_restart_monitoring()
                    if restart_success:
                        return jsonify({
                            'success': True,
                            'message': 'jtop service installed and monitoring connected successfully'
                        })
                    else:
                        return jsonify({
                            'success': False,
                            'error': 'Service started but monitoring reconnection failed'
                        })
                else:
                    return jsonify({
                        'success': False,
                        'error': f'Service installed but failed to start: {start_result.stderr}'
                    })
        else:
            return jsonify({
                'success': False,
                'error': f'Failed to install jtop service: {result.stderr}'
            })
        
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'jtop service installation timed out'
        }), 500
    except Exception as e:
        logger.error(f"Error installing jtop service: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/system/jtop-restart-service', methods=['POST'])
def restart_jtop_service():
    """Restart the jtop service to fix broken pipe issues"""
    try:
        data = request.json
        sudo_password = data.get('sudo_password', '')
        
        if not sudo_password:
            return jsonify({'success': False, 'error': 'Sudo password required'}), 400
        
        logger.info("Restarting jtop service to fix broken pipe")
        
        # First, validate the sudo password using the same method as SettingsSection
        validate_result = subprocess.run(
            ['sudo', '-S', '-k', 'true'],
            input=sudo_password + '\n',
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if validate_result.returncode != 0:
            return jsonify({
                'success': False, 
                'error': 'Invalid sudo password'
            }), 401
        
        # Stop the service first
        stop_result = subprocess.run(
            ['sudo', '-S', 'systemctl', 'stop', 'jtop.service'],
            input=sudo_password + '\n',
            capture_output=True,
            text=True,
            timeout=10
        )
        
        # Wait a moment
        time.sleep(2)
        
        # Start the service
        start_result = subprocess.run(
            ['sudo', '-S', 'systemctl', 'start', 'jtop.service'],
            input=sudo_password + '\n',
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if start_result.returncode == 0:
            # Wait longer for service to be fully ready
            time.sleep(5)
            
            # Check if service is active with retries
            max_retries = 3
            service_active = False
            
            for attempt in range(max_retries):
                check_result = subprocess.run(
                    ['systemctl', 'is-active', 'jtop.service'],
                    capture_output=True,
                    text=True
                )
                
                if check_result.returncode == 0:
                    service_active = True
                    break
                else:
                    logger.info(f"Service not ready yet after restart (attempt {attempt + 1}/{max_retries}), waiting...")
                    time.sleep(3)
            
            if service_active:
                # Force restart the entire monitoring process to completely reinitialize
                restart_success = system_monitor.force_restart_monitoring()
                
                if restart_success:
                    return jsonify({
                        'success': True,
                        'message': 'jtop service restarted and monitoring reconnected successfully'
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': 'Service restarted but monitoring reconnection failed'
                    })
            else:
                return jsonify({
                    'success': False,
                    'error': 'Service restarted but is not active'
                })
        else:
            return jsonify({
                'success': False,
                'error': f'Failed to start jtop service: {start_result.stderr}'
            })
        
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'jtop service restart timed out'
        }), 500
    except Exception as e:
        logger.error(f"Error restarting jtop service: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/system/jtop-force-reconnect', methods=['POST'])
def force_reconnect_jtop():
    """Force reconnect to jtop without restarting the service (no sudo required)"""
    try:
        logger.info("Forcing jtop reconnection without service restart")
        
        # Force restart the entire monitoring process
        restart_success = system_monitor.force_restart_monitoring()
        
        if restart_success:
            return jsonify({
                'success': True,
                'message': 'jtop monitoring reconnected successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to reconnect jtop monitoring'
            })
        
    except Exception as e:
        logger.error(f"Error force reconnecting jtop: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Terminal session management
terminal_sessions = {}

def get_or_create_terminal_session(session_id=None):
    """Get or create a terminal session"""
    if session_id is None:
        session_id = 'default'
    
    if session_id not in terminal_sessions:
        terminal_sessions[session_id] = {
            'cwd': os.path.expanduser('~'),
            'env': dict(os.environ),
            'history': [],
            'command_count': 0,
            'last_command_time': 0,
            'rate_limit_violations': 0
        }
    
    return terminal_sessions[session_id]

@app.route('/terminal/execute', methods=['POST'])
def execute_terminal_command():
    """Execute a terminal command safely with session support"""
    try:
        data = request.json
        command = data.get('command', '').strip()
        session_id = data.get('session_id', 'default')
        
        if not command:
            return jsonify({'success': False, 'error': 'No command provided'}), 400
        
        logger.info(f"Terminal command requested: {command} (session: {session_id})")
        
        # Get or create session
        session = get_or_create_terminal_session(session_id)
        
        # Rate limiting check
        import time
        current_time = time.time()
        
        # Allow max 10 commands per minute
        if session['last_command_time'] > 0:
            time_since_last = current_time - session['last_command_time']
            if time_since_last < 6:  # Less than 6 seconds between commands
                session['rate_limit_violations'] += 1
                if session['rate_limit_violations'] > 3:
                    return jsonify({
                        'success': False,
                        'error': 'Rate limit exceeded. Please wait before running more commands.'
                    }), 429
            else:
                # Reset violations if enough time has passed
                session['rate_limit_violations'] = max(0, session['rate_limit_violations'] - 1)
        
        session['last_command_time'] = current_time
        session['command_count'] += 1
        
        # Enhanced Security: Comprehensive command filtering
        
        # 1. Blocked dangerous commands
        dangerous_commands = [
            # File system destruction
            'rm -rf', 'rm -r /', 'rm -rf /', 'format', 'mkfs', 'fdisk', 'parted',
            'dd if=', 'dd of=', '> /dev/sd', '> /dev/nvme', 'shred',
            
            # System control
            'sudo reboot', 'sudo shutdown', 'sudo halt', 'sudo poweroff',
            'init 0', 'init 6', 'systemctl reboot', 'systemctl poweroff',
            'systemctl halt', 'reboot', 'shutdown', 'halt', 'poweroff',
            
            # Process/system manipulation
            'killall -9', 'pkill -9', 'kill -9 1', 'sudo kill', 'forkbomb',
            ':(){ :|:& };:', 'while true', 'for((;;))',
            
            # Network/security
            'iptables -F', 'ufw disable', 'sudo passwd', 'passwd root',
            'sudo deluser', 'sudo userdel', 'sudo usermod',
            
            # File permissions
            'chmod 777 /', 'chmod -R 777', 'sudo chmod 777',
            'chown -R root', 'sudo chown -R',
            
            # Package management (potentially destructive)
            'sudo apt remove', 'sudo apt purge', 'sudo apt autoremove',
            'sudo dpkg -r', 'sudo snap remove', 'pip uninstall',
            
            # Redirection to critical files
            '> /etc/', '> /boot/', '> /sys/', '> /proc/',
            'mv /* /dev/null', 'cp /dev/zero', 'cat /dev/zero',
            
            # Docker/container escapes
            'docker run --privileged', 'docker exec -it',
            
            # Cron/service manipulation
            'sudo crontab', 'sudo systemctl disable', 'sudo systemctl stop',
            
            # Memory/CPU bombs
            'stress --cpu', 'stress --vm', '/dev/urandom'
        ]
        
        # 2. Restricted sudo commands (only allow specific safe ones)
        allowed_sudo_commands = [
            'sudo jtop', 'sudo nvidia-smi', 'sudo jetson_clocks',
            'sudo tegrastats', 'sudo nvpmodel'
        ]
        
        # 3. Check for blocked patterns
        command_lower = command.lower().strip()
        
        # Block dangerous commands
        for dangerous_cmd in dangerous_commands:
            if dangerous_cmd in command_lower:
                return jsonify({
                    'success': False,
                    'error': f'Command blocked for security: "{dangerous_cmd}" not allowed'
                }), 403
        
        # Block sudo commands except allowed ones
        if command_lower.startswith('sudo '):
            # If running as root, remove sudo prefix from allowed commands
            if is_running_as_root():
                for allowed_cmd in allowed_sudo_commands:
                    if command_lower.startswith(allowed_cmd.lower()):
                        # Remove 'sudo ' prefix since we're already root
                        command = command[5:].strip()
                        command_lower = command.lower().strip()
                        logger.info(f"Running as root - removed sudo prefix: {command}")
                        break
            else:
                # Not running as root, check if sudo command is allowed
                sudo_allowed = False
                for allowed_cmd in allowed_sudo_commands:
                    if command_lower.startswith(allowed_cmd.lower()):
                        sudo_allowed = True
                        break
                
                if not sudo_allowed:
                    return jsonify({
                        'success': False,
                        'error': 'Sudo command not allowed. Only specific system monitoring commands are permitted.'
                    }), 403
        
        # 4. Block file operations on critical directories
        critical_dirs = ['/etc/', '/boot/', '/sys/', '/proc/', '/dev/', '/root/', '/usr/bin/', '/usr/sbin/']
        file_operations = ['rm ', 'mv ', 'cp ', 'chmod ', 'chown ', '> ', '>>', 'dd ']
        
        for file_op in file_operations:
            if file_op in command_lower:
                for critical_dir in critical_dirs:
                    if critical_dir in command_lower:
                        return jsonify({
                            'success': False,
                            'error': f'File operations on {critical_dir} are not allowed for security'
                        }), 403
        
        # 5. Block commands with excessive resource usage potential
        resource_intensive = ['find /', 'grep -r /', 'locate /', 'updatedb', 'mlocate']
        for intensive_cmd in resource_intensive:
            if command_lower.startswith(intensive_cmd):
                return jsonify({
                    'success': False,
                    'error': f'Resource-intensive command "{intensive_cmd}" is not allowed'
                }), 403
        
        # 6. Block network operations
        network_commands = ['wget', 'curl -O', 'curl -o', 'nc -l', 'netcat -l', 'python -m http.server', 'ssh ', 'scp ', 'rsync ']
        for net_cmd in network_commands:
            if command_lower.startswith(net_cmd):
                return jsonify({
                    'success': False,
                    'error': f'Network command "{net_cmd}" is not allowed'
                }), 403
        
        # 7. Command length limitation
        if len(command) > 500:
            return jsonify({
                'success': False,
                'error': 'Command too long. Maximum 500 characters allowed.'
            }), 403
        
        # 8. Allowed commands whitelist (basic safe commands)
        # Extract the base command (first word)
        base_command = command.split()[0] if command.split() else ''
        
        # Safe commands that are generally allowed
        safe_commands = [
            # Basic file operations (limited)
            'ls', 'cat', 'head', 'tail', 'less', 'more', 'file', 'stat', 'du', 'df',
            # Directory operations
            'pwd', 'cd', 'mkdir', 'tree',
            # Text processing
            'echo', 'grep', 'awk', 'sed', 'sort', 'uniq', 'wc', 'cut',
            # System information
            'ps', 'top', 'htop', 'free', 'uptime', 'who', 'whoami', 'id', 'uname',
            'lscpu', 'lsusb', 'lspci', 'lsblk', 'mount', 'lsof', 'netstat',
            # NVIDIA/Jetson specific
            'nvidia-smi', 'jtop', 'tegrastats', 'jetson_clocks', 'nvpmodel',
            # Development tools
            'python3', 'python', 'node', 'npm', 'git', 'which', 'whereis',
            # Archive operations (read-only)
            'tar -tf', 'tar -tzf', 'unzip -l', 'zip -sf',
            # Network info (read-only)
            'ping', 'curl', 'wget', 'nslookup', 'dig',
            # Text editors (safe)
            'nano', 'vim', 'vi',
            # Help commands
            'man', 'help', 'history', 'clear', 'date', 'cal'
        ]
        
        # Allow sudo only for specific whitelisted commands
        if base_command == 'sudo':
            # This is handled above in the allowed_sudo_commands check
            pass
        elif base_command not in safe_commands and not command.startswith(tuple(safe_commands)):
            return jsonify({
                'success': False,
                'error': f'Command "{base_command}" is not in the allowed command list. Use "help" to see available commands.'
            }), 403

        # Handle cd command specially to maintain session state
        if command.startswith('cd '):
            try:
                # Extract the target directory
                target_dir = command[3:].strip()
                
                # Handle special cases
                if not target_dir or target_dir == '~':
                    target_dir = os.path.expanduser('~')
                elif target_dir == '-':
                    # cd - functionality (go to previous directory)
                    if 'prev_cwd' in session:
                        prev_cwd = session['prev_cwd']
                        session['prev_cwd'] = session['cwd']
                        session['cwd'] = prev_cwd
                    else:
                        return jsonify({
                            'success': True,
                            'output': f"bash: cd: OLDPWD not set\n",
                            'error': '',
                            'return_code': 1,
                            'cwd': session['cwd']
                        })
                    
                    return jsonify({
                        'success': True,
                        'output': f"{session['cwd']}\n",
                        'error': '',
                        'return_code': 0,
                        'cwd': session['cwd']
                    })
                elif target_dir.startswith('/'):
                    # Absolute path
                    pass
                else:
                    # Relative path
                    target_dir = os.path.join(session['cwd'], target_dir)
                
                # Normalize and validate the path
                target_dir = os.path.abspath(target_dir)
                
                if os.path.isdir(target_dir):
                    # Store previous directory for cd -
                    session['prev_cwd'] = session['cwd']
                    session['cwd'] = target_dir
                    
                    return jsonify({
                        'success': True,
                        'output': '',
                        'error': '',
                        'return_code': 0,
                        'cwd': session['cwd']
                    })
                else:
                    return jsonify({
                        'success': True,
                        'output': '',
                        'error': f"bash: cd: {target_dir}: No such file or directory\n",
                        'return_code': 1,
                        'cwd': session['cwd']
                    })
                    
            except Exception as cd_error:
                return jsonify({
                    'success': True,
                    'output': '',
                    'error': f"bash: cd: {str(cd_error)}\n",
                    'return_code': 1,
                    'cwd': session['cwd']
                })
        
        # Handle pwd command
        if command.strip() == 'pwd':
            return jsonify({
                'success': True,
                'output': f"{session['cwd']}\n",
                'error': '',
                'return_code': 0,
                'cwd': session['cwd']
            })
        
        # Handle help command
        if command.strip() in ['help', 'jetsonboard-help']:
            help_text = """
JDBoard Terminal - Available Commands:

File & Directory Operations:
  ls, cat, head, tail, less, more, file, stat, du, df
  pwd, cd, mkdir, tree

Text Processing:
  echo, grep, awk, sed, sort, uniq, wc, cut

System Information:
  ps, top, htop, free, uptime, who, whoami, id, uname
  lscpu, lsusb, lspci, lsblk, mount, lsof, netstat

NVIDIA/Jetson Specific:
  nvidia-smi, jtop, tegrastats, jetson_clocks, nvpmodel
  sudo jtop, sudo nvidia-smi, sudo jetson_clocks, sudo tegrastats

Development Tools:
  python3, python, node, npm, git, which, whereis
  nano, vim, vi

Network (Read-only):
  ping, curl, wget, nslookup, dig

Other:
  man, help, history, clear, date, cal

Security Notes:
- Destructive operations are blocked for safety
- Sudo is limited to system monitoring commands only
- File operations on system directories are restricted
- Network servers and file transfers are disabled

Use 'man <command>' for detailed help on specific commands.
"""
            return jsonify({
                'success': True,
                'output': help_text,
                'error': '',
                'return_code': 0,
                'cwd': session['cwd']
            })

        # Execute other commands with current working directory
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30,  # 30-second timeout
                cwd=session['cwd'],  # Use session's current directory
                env=session['env']   # Use session's environment
            )
            
            output = result.stdout
            error = result.stderr
            
            # Limit output size to prevent memory issues
            max_output_size = 10000  # 10KB limit
            if len(output) > max_output_size:
                output = output[:max_output_size] + "\n... (output truncated)"
            if len(error) > max_output_size:
                error = error[:max_output_size] + "\n... (error output truncated)"
            
            return jsonify({
                'success': True,
                'output': output,
                'error': error,
                'return_code': result.returncode,
                'cwd': session['cwd']
            })
            
        except subprocess.TimeoutExpired:
            return jsonify({
                'success': False,
                'error': 'Command timed out (30 seconds limit)',
                'cwd': session['cwd']
            }), 408
            
        except Exception as cmd_error:
            return jsonify({
                'success': False,
                'error': f'Command execution failed: {str(cmd_error)}',
                'cwd': session['cwd']
            }), 500
        
    except Exception as e:
        logger.error(f"Error executing terminal command: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/terminal/complete', methods=['POST'])
def tab_complete():
    """Handle tab completion for terminal commands"""
    try:
        data = request.json
        partial_command = data.get('partial_command', '').strip()
        session_id = data.get('session_id', 'default')
        
        if not partial_command:
            return jsonify({'success': True, 'completions': []})
        
        # Get session for current working directory
        session = get_or_create_terminal_session(session_id)
        cwd = session['cwd']
        
        logger.info(f"Tab completion requested: '{partial_command}' in {cwd}")
        
        # Split command into parts
        parts = partial_command.split()
        
        if not parts:
            return jsonify({'success': True, 'completions': []})
        
        # Get the last part (what we're trying to complete)
        last_part = parts[-1] if partial_command.endswith(' ') else parts[-1]
        
        completions = []
        
        # If it's the first word, complete commands
        if len(parts) == 1 and not partial_command.endswith(' '):
            # Complete executable commands from PATH
            try:
                # Get commands from PATH
                path_dirs = os.environ.get('PATH', '').split(':')
                commands = set()
                
                for path_dir in path_dirs[:10]:  # Limit to first 10 PATH dirs for performance
                    if os.path.isdir(path_dir):
                        try:
                            for cmd in os.listdir(path_dir):
                                if cmd.startswith(last_part) and os.access(os.path.join(path_dir, cmd), os.X_OK):
                                    commands.add(cmd)
                        except (PermissionError, OSError):
                            continue
                
                # Add common built-in commands
                builtins = ['cd', 'pwd', 'ls', 'cat', 'grep', 'find', 'echo', 'which', 'man', 'history', 'clear']
                for builtin in builtins:
                    if builtin.startswith(last_part):
                        commands.add(builtin)
                
                completions = sorted(list(commands)[:20])  # Limit to 20 results
                
            except Exception as e:
                logger.error(f"Error completing commands: {str(e)}")
        
        # Complete file/directory paths
        else:
            try:
                # Determine the directory to search in
                if os.path.isabs(last_part):
                    # Absolute path
                    search_dir = os.path.dirname(last_part) or '/'
                    prefix = os.path.basename(last_part)
                elif last_part.startswith('~'):
                    # Home directory path
                    expanded = os.path.expanduser(last_part)
                    search_dir = os.path.dirname(expanded) or os.path.expanduser('~')
                    prefix = os.path.basename(expanded)
                else:
                    # Relative path
                    if '/' in last_part:
                        search_dir = os.path.join(cwd, os.path.dirname(last_part))
                        prefix = os.path.basename(last_part)
                    else:
                        search_dir = cwd
                        prefix = last_part
                
                # Get matching files/directories
                if os.path.isdir(search_dir):
                    try:
                        entries = []
                        for entry in os.listdir(search_dir):
                            if entry.startswith(prefix) and not entry.startswith('.'):  # Skip hidden files by default
                                full_path = os.path.join(search_dir, entry)
                                if os.path.isdir(full_path):
                                    entries.append(entry + '/')
                                else:
                                    entries.append(entry)
                        
                        # Also include hidden files if prefix starts with .
                        if prefix.startswith('.'):
                            for entry in os.listdir(search_dir):
                                if entry.startswith(prefix) and entry.startswith('.'):
                                    full_path = os.path.join(search_dir, entry)
                                    if os.path.isdir(full_path):
                                        entries.append(entry + '/')
                                    else:
                                        entries.append(entry)
                        
                        completions = sorted(entries[:20])  # Limit to 20 results
                        
                    except (PermissionError, OSError) as e:
                        logger.warning(f"Permission denied accessing {search_dir}: {str(e)}")
                        
            except Exception as e:
                logger.error(f"Error completing paths: {str(e)}")
        
        return jsonify({
            'success': True,
            'completions': completions,
            'partial': last_part
        })
        
    except Exception as e:
        logger.error(f"Error in tab completion: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'completions': []
        }), 500

@app.route('/terminal/userinfo', methods=['GET'])
def get_terminal_user_info():
    """Get current user and hostname information for terminal display"""
    try:
        import getpass
        import socket
        
        # Get current username
        username = getpass.getuser()
        
        # Get hostname
        hostname = socket.gethostname()
        
        # Get user's home directory
        home_dir = os.path.expanduser('~')
        
        return jsonify({
            'success': True,
            'username': username,
            'hostname': hostname,
            'home_dir': home_dir
        })
        
    except Exception as e:
        logger.error(f"Error getting terminal user info: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'username': 'user',
            'hostname': 'jetsonboard',
            'home_dir': '/home/user'
        }), 500

# Background task to emit system data periodically
def background_system_updates():
    """Background task to send system updates via WebSocket"""
    while True:
        try:
            system_data = system_monitor.get_system_status()
            
            # Add AI models information
            try:
                loaded_models = ai_manager.list_models()
                system_data['models'] = [model for model in loaded_models if model.get('loaded', False)]
            except Exception as e:
                logger.debug(f"Error getting models list: {e}")
                system_data['models'] = []
            
            # Add inference statistics
            try:
                request_stats = request_logger.get_stats()
                # Get total lifetime inferences (not just 24h)
                total_inferences = request_logger.get_total_inference_count()
                system_data['stats'] = {
                    'totalInferences': total_inferences
                }
            except Exception as e:
                logger.debug(f"Error getting inference stats: {e}")
                system_data['stats'] = {
                    'totalInferences': 0
                }
            
            # Validate that the data can be serialized to JSON
            try:
                json.dumps(system_data)
            except (TypeError, ValueError) as e:
                logger.error(f"System data not JSON serializable: {str(e)}")
                # Emit a safe fallback response
                socketio.emit('system_update', {
                    'success': False,
                    'error': 'Data serialization error'
                })
                socketio.sleep(5)  # Wait longer before retrying
                continue
            
            socketio.emit('system_update', {
                'success': True,
                'data': system_data
            })
        except Exception as e:
            logger.error(f"Error in background system updates: {str(e)}")
            # Emit error status instead of crashing
            try:
                socketio.emit('system_update', {
                    'success': False,
                    'error': 'System monitoring error'
                })
            except Exception:
                pass  # If we can't even emit this, just continue
        
        socketio.sleep(0.5)  # Update every 0.5 seconds for more responsive data

@app.route('/system/processes', methods=['GET'])
def get_processes():
    """Get list of running processes with optional pagination and sorting"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/system/processes',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        # Get query parameters for pagination and sorting
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        sort_by = request.args.get('sort_by', 'cpu', type=str)
        search = request.args.get('search', '', type=str)
        
        # Limit per_page to reasonable values
        per_page = min(max(per_page, 10), 500)
        
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info', 'status', 'username', 'cmdline', 'create_time']):
            try:
                pinfo = proc.info
                # Get cmdline safely
                cmdline = ' '.join(pinfo.get('cmdline', [])) if pinfo.get('cmdline') else pinfo.get('name', '')
                
                process_data = {
                    'pid': pinfo.get('pid'),
                    'name': pinfo.get('name', 'Unknown'),
                    'cpu_percent': pinfo.get('cpu_percent', 0) or 0,
                    'memory_percent': proc.memory_percent() if hasattr(proc, 'memory_percent') else 0,
                    'memory_mb': pinfo.get('memory_info').rss / (1024 * 1024) if pinfo.get('memory_info') else 0,
                    'status': pinfo.get('status', 'unknown'),
                    'username': pinfo.get('username', 'unknown'),
                    'cmdline': cmdline[:100],  # Limit command line length
                    'create_time': pinfo.get('create_time', 0)
                }
                
                # Apply search filter if provided
                if search:
                    search_lower = search.lower()
                    if not (search_lower in process_data['name'].lower() or 
                           search_lower in process_data['cmdline'].lower() or 
                           search in str(process_data['pid'])):
                        continue
                
                processes.append(process_data)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
        
        # Apply sorting
        if sort_by == 'cpu':
            processes.sort(key=lambda p: p['cpu_percent'], reverse=True)
        elif sort_by == 'memory':
            processes.sort(key=lambda p: p['memory_percent'], reverse=True)
        elif sort_by == 'name':
            processes.sort(key=lambda p: p['name'].lower())
        elif sort_by == 'pid':
            processes.sort(key=lambda p: p['pid'])
        
        # Calculate pagination
        total_count = len(processes)
        total_pages = (total_count + per_page - 1) // per_page
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_processes = processes[start_idx:end_idx]
        
        return jsonify({
            'success': True,
            'processes': paginated_processes,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total_count': total_count,
                'total_pages': total_pages,
                'has_next': page < total_pages,
                'has_prev': page > 1
            }
        })
    except Exception as e:
        logger.error(f"Error getting processes: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/system/processes/<int:pid>/kill', methods=['POST'])
def kill_process(pid):
    """Kill a process by PID"""
    client_ip = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/system/processes/{pid}/kill',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        proc = psutil.Process(pid)
        proc_name = proc.name()
        proc.kill()
        
        logger.info(f"Process {pid} ({proc_name}) killed by {client_ip}")
        
        return jsonify({
            'success': True,
            'message': f'Process {pid} ({proc_name}) killed successfully'
        })
    except psutil.NoSuchProcess:
        return jsonify({
            'success': False,
            'error': 'Process not found'
        }), 404
    except psutil.AccessDenied:
        return jsonify({
            'success': False,
            'error': 'Access denied. Cannot kill this process.'
        }), 403
    except Exception as e:
        logger.error(f"Error killing process {pid}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def _shutdown(*_args):
    """Stop running TensorRT builds with the backend instead of orphaning them."""
    terminate_active_exports()

def _handle_sigterm(signum, frame):
    _shutdown()
    raise SystemExit(0)

if __name__ == '__main__':
    # Ensure directories exist
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs('../logs', exist_ok=True)

    # Remove files left by downloads/uploads interrupted by a crash or restart
    try:
        ai_manager.cleanup_orphaned_files()
    except Exception as e:
        logger.warning(f"Startup cleanup failed: {e}")

    # Ctrl+C raises KeyboardInterrupt (atexit runs); SIGTERM needs a handler
    atexit.register(_shutdown)
    signal.signal(signal.SIGTERM, _handle_sigterm)
    
    # Start background monitoring
    system_monitor.start_monitoring()
    
    # Start background WebSocket updates
    socketio.start_background_task(background_system_updates)
    
    # Serve the built frontend + /api on one port, behind a password if configured
    web_frontend.install(app)

    host = os.environ.get('JDBOARD_HOST', '0.0.0.0')
    port = int(os.environ.get('JDBOARD_PORT', '5000'))
    logger.info(f"Starting Jetson Edge AI Dashboard with WebSocket support on port {port}...")
    # Use app.config['DEBUG'] instead of hardcoded debug=True
    socketio.run(app, host=host, port=port, debug=app.config['DEBUG'], allow_unsafe_werkzeug=True)