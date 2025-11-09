#!/usr/bin/env python3
"""
Jetson Edge AI Dashboard - Backend Server
A cyberpunk-themed dashboard for Jetson devices with AI model management
"""

from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
import json
import time
import logging
import subprocess
from datetime import datetime
import uuid
import threading
from pathlib import Path
import psutil
import GPUtil
from werkzeug.utils import secure_filename
import cv2
import numpy as np
from system_monitor import SystemMonitor
from ai_inference import AIModelManager
from request_logger import RequestLogger

from jtop import jtop

app = Flask(__name__, 
           template_folder='../frontend',
           static_folder='../static')

CORS(app)

# Initialize SocketIO for real-time communication
socketio = SocketIO(app, 
                   cors_allowed_origins="*",
                   logger=False,
                   engineio_logger=False,
                   async_mode='threading',
                   ping_timeout=60,
                   ping_interval=25)

# Configuration
UPLOAD_FOLDER = '../models'
ALLOWED_EXTENSIONS = {'onnx', 'trt', 'engine', 'pb', 'pth', 'pt'}
MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # 500MB max file size

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

logger = logging.getLogger(__name__)
logger.disabled = True

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    """Serve the main dashboard page"""
    return render_template('index.html')

@app.route('/api/system/status')
def get_system_status():
    """Get comprehensive system status"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/api/system/status',
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

@app.route('/api/system/gpu')
def get_gpu_status():
    """Get GPU status and statistics"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/api/system/gpu',
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

@app.route('/api/system/logs')
def get_system_logs():
    """Get system logs"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/api/system/logs',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
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

@app.route('/api/models', methods=['GET'])
def list_models():
    """List all available AI models"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/api/models',
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

@app.route('/api/gpu/memory', methods=['GET'])
def get_gpu_memory():
    """Get GPU memory usage information"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/api/gpu/memory',
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

@app.route('/api/models/upload', methods=['POST'])
def upload_model():
    """Upload a new AI model"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/api/models/upload',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method,
        data={'files': len(request.files)}
    )
    
    if 'file' not in request.files:
        return jsonify({
            'success': False,
            'error': 'No file provided'
        }), 400
    
    file = request.files['file']
    model_name = request.form.get('model_name', '')
    model_type = request.form.get('model_type', 'vision')
    
    if file.filename == '':
        return jsonify({
            'success': False,
            'error': 'No file selected'
        }), 400
    
    if file and allowed_file(file.filename):
        try:
            filename = secure_filename(file.filename)
            if not model_name:
                model_name = filename.rsplit('.', 1)[0]
            
            # Create unique filename to avoid conflicts
            unique_filename = f"{uuid.uuid4().hex}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            
            file.save(file_path)
            
            # Register the model with absolute path
            model_info = ai_manager.register_model(
                model_name=model_name,
                file_path=os.path.abspath(file_path),
                model_type=model_type,
                original_filename=filename
            )
            
            logger.info(f"Model uploaded successfully: {model_name} from {client_ip}")
            
            return jsonify({
                'success': True,
                'data': model_info,
                'message': f'Model {model_name} uploaded successfully'
            })
            
        except Exception as e:
            logger.error(f"Error uploading model: {str(e)}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
    else:
        return jsonify({
            'success': False,
            'error': 'Invalid file type'
        }), 400

@app.route('/api/models/<model_id>/load', methods=['POST'])
def load_model(model_id):
    """Load a model for inference"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/api/models/{model_id}/load',
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

@app.route('/api/models/<model_id>/force-reload', methods=['POST'])
def force_reload_model(model_id):
    """Force unload and reload a model from memory"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/api/models/{model_id}/force-reload',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method
    )
    
    try:
        # Force unload first
        ai_manager.force_reload_model(model_id)
        logger.info(f"Model {model_id} force reloaded by {client_ip}")
        
        # Get updated model status
        models = ai_manager.get_models()
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

@app.route('/api/models/<model_id>/unload', methods=['POST'])
def unload_model(model_id):
    """Unload a model from memory"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/api/models/{model_id}/unload',
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

@app.route('/api/models/<model_id>', methods=['DELETE'])
def delete_model(model_id):
    """Delete a model from the system"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint=f'/api/models/{model_id}',
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

@app.route('/api/models/download-yolo', methods=['POST'])
def download_yolo_model():
    """Download and optionally convert a YOLO model"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    data = request.get_json()
    if not data:
        return jsonify({
            'success': False,
            'error': 'No JSON data provided'
        }), 400
    
    request_logger.log_request(
        endpoint='/api/models/download-yolo',
        client_ip=client_ip,
        user_agent=user_agent,
        method=request.method,
        data=data
    )
    
    model_url = data.get('model_url')
    model_name = data.get('model_name')
    target_format = data.get('target_format', 'PyTorch')
    
    if not model_url or not model_name:
        return jsonify({
            'success': False,
            'error': 'model_url and model_name are required'
        }), 400
    
    try:
        result = ai_manager.download_yolo_model(
            model_url=model_url,
            model_name=model_name,
            target_format=target_format
        )
        
        logger.info(f"YOLO model {model_name} downloaded and converted by {client_ip}")
        
        return jsonify({
            'success': True,
            'data': result,
            'message': f'YOLO model {model_name} downloaded successfully'
        })
    except Exception as e:
        logger.error(f"Error downloading YOLO model: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/models/list')
def list_models_detailed():
    """List all models with detailed information"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/api/models/list',
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

@app.route('/api/models/emergency-cleanup', methods=['POST'])
def emergency_cleanup():
    """Emergency cleanup to free all GPU memory"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/api/models/emergency-cleanup',
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

@app.route('/api/inference', methods=['POST'])
def run_inference():
    """Run inference on uploaded image"""
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    request_logger.log_request(
        endpoint='/api/inference',
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
    model_id = request.form.get('model_id')
    
    if not model_id:
        return jsonify({
            'success': False,
            'error': 'No model specified'
        }), 400
    
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
        
        # Log inference
        request_logger.log_inference(
            model_id=model_id,
            client_ip=client_ip,
            inference_time=inference_time,
            result=result
        )
        
        logger.info(f"Inference completed for {model_id} in {inference_time:.3f}s by {client_ip}")
        
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

@app.route('/api/logs/requests')
def get_request_logs():
    """Get request logs with pagination"""
    client_ip = request.remote_addr
    
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

@app.route('/api/logs/stats')
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

# System Settings API Endpoints
@app.route('/api/auth/sudo', methods=['POST'])
def authenticate_sudo():
    """Authenticate sudo password"""
    try:
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
                'message': 'Authentication successful'
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

@app.route('/api/system/info')
def get_system_info():
    """Get comprehensive system information"""
    try:
        system_data = system_monitor.get_system_status()
        
        # Get jtop board information
        board_info = get_jtop_board_info()
        
        # Add additional system info
        system_info = {
            **system_data,
            'board_info': board_info,
            'jetpack_version': get_jetpack_version(),
            'kernel_version': get_kernel_version(),
            'timestamp': datetime.now().isoformat()
        }
        
        # Override jetson_model with jtop board model if available
        if board_info and 'Model' in board_info:
            system_info['jetson_model'] = board_info['Model']
            system_info['jetson_module'] = board_info['Module']
        
        return jsonify(system_info)
    except Exception as e:
        logger.error(f"Error getting system info: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get current dashboard settings"""
    try:
        settings_file = '../config/settings.json'
        if os.path.exists(settings_file):
            with open(settings_file, 'r') as f:
                settings = json.load(f)
        else:
            # Default settings
            settings = {
                'theme': 'nvidia',
                'refreshInterval': 2000,
                'notifications': True,
                'autoUpdate': True,
                'debugMode': False,
                'jetsonClocks': False,
                'powerMode': 'MAXN',
                'fanMode': 'quiet'
            }
        
        # Override jetsonClocks, powerMode, and fanMode with real system status from system monitor
        try:
            system_data = system_monitor.get_system_data()
            if 'jetson_clocks' in system_data:
                settings['jetsonClocks'] = system_data['jetson_clocks']
            if 'nvp_model' in system_data:
                settings['powerMode'] = system_data['nvp_model']
                
            # Get current fan mode from nvfancontrol
            try:
                result = subprocess.run(['sudo', 'nvfancontrol', '--query'], 
                                      capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    for line in result.stdout.strip().split('\n'):
                        if 'FAN_PROFILE:' in line:
                            profile = line.split(':')[-1].strip()
                            settings['fanMode'] = profile  # Return actual profile (quiet or cool)
                            break
            except:
                pass  # Keep default fanMode if query fails
                
        except Exception as monitor_e:
            logger.debug(f"Could not get system status from monitor: {monitor_e}")
        
        return jsonify(settings)
    except Exception as e:
        logger.error(f"Error getting settings: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/settings', methods=['POST'])
def save_settings():
    """Save dashboard settings"""
    try:
        settings = request.json
        
        # Ensure config directory exists
        os.makedirs('../config', exist_ok=True)
        
        # Save settings to file
        settings_file = '../config/settings.json'
        with open(settings_file, 'w') as f:
            json.dump(settings, f, indent=2)
        
        logger.info(f"Settings saved: {settings}")
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error saving settings: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/system/jetson-clocks', methods=['POST'])
def toggle_jetson_clocks():
    """Toggle Jetson Clocks on/off"""
    try:
        data = request.json
        enabled = data.get('enabled', False)
        sudo_password = data.get('sudo_password', '')
        
        if not sudo_password:
            return jsonify({'success': False, 'error': 'Sudo password required'}), 400
        
        if enabled:
            # Store current configuration before enabling (if not already stored)
            store_file = f'{os.path.expanduser("~")}/l4t_dfs.conf'
            if not os.path.exists(store_file):
                # Store current configuration first
                store_result = subprocess.run(
                    ['sudo', '-S', 'jetson_clocks', '--store', store_file],
                    input=sudo_password + '\n',
                    capture_output=True,
                    text=True,
                    timeout=15
                )
                if store_result.returncode == 0:
                    logger.info(f"Current configuration stored to {store_file}")
            
            # Enable Jetson Clocks
            result = subprocess.run(
                ['sudo', '-S', 'jetson_clocks'],
                input=sudo_password + '\n',
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                logger.info("Jetson Clocks enabled")
                return jsonify({'success': True, 'status': 'enabled'})
            else:
                error_msg = result.stderr.strip() if result.stderr else 'Failed to enable Jetson Clocks'
                return jsonify({'success': False, 'error': error_msg}), 500
        else:
            # Disable Jetson Clocks (restore normal governors)
            # First try to use the system default config file, fallback to user home
            restore_configs = [
                '/usr/local/jtop/l4t_dfs.conf',  # System default from jtop
                f'{os.path.expanduser("~")}/l4t_dfs.conf'  # User home directory
            ]
            
            restore_file = None
            for config_file in restore_configs:
                if os.path.exists(config_file):
                    restore_file = config_file
                    break
            
            if restore_file:
                result = subprocess.run(
                    ['sudo', '-S', 'jetson_clocks', '--restore', restore_file],
                    input=sudo_password + '\n',
                    capture_output=True,
                    text=True,
                    timeout=30
                )
            else:
                # Fallback: try restore without specifying file (uses default)
                result = subprocess.run(
                    ['sudo', '-S', 'jetson_clocks', '--restore'],
                    input=sudo_password + '\n',
                    capture_output=True,
                    text=True,
                    timeout=30
                )
            
            if result.returncode == 0:
                logger.info("Jetson Clocks disabled")
                return jsonify({'success': True, 'status': 'disabled'})
            else:
                error_msg = result.stderr.strip() if result.stderr else 'Failed to disable Jetson Clocks'
                return jsonify({'success': False, 'error': error_msg}), 500
                
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'Command timeout'
        }), 408
    except Exception as e:
        logger.error(f"Error toggling Jetson Clocks: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/system/power-modes', methods=['GET'])
def get_power_modes():
    """Get available power modes from jtop"""
    try:
        from jtop import jtop
        
        with jtop() as jetson:
            if hasattr(jetson, 'nvpmodel') and jetson.nvpmodel is not None:
                # Get available power modes
                available_modes = jetson.nvpmodel.models if hasattr(jetson.nvpmodel, 'models') else []
                current_mode = jetson.nvpmodel.name if hasattr(jetson.nvpmodel, 'name') else 'Unknown'
                
                return jsonify({
                    'success': True,
                    'available_modes': available_modes,
                    'current_mode': current_mode
                })
            else:
                # Fallback to default modes if jtop is not available
                return jsonify({
                    'success': True,
                    'available_modes': ['15W', '25W', 'MAXN_SUPER', '7W'],
                    'current_mode': 'MAXN_SUPER'
                })
                
    except Exception as e:
        logger.error(f"Error getting power modes: {str(e)}")
        # Fallback to default modes
        return jsonify({
            'success': True,
            'available_modes': ['15W', '25W', 'MAXN_SUPER', '7W'],
            'current_mode': 'MAXN_SUPER'
        })

@app.route('/api/system/power-mode', methods=['POST'])
def set_power_mode():
    """Set system power mode"""
    try:
        data = request.json
        mode = data.get('mode', 'MAXN_SUPER')
        sudo_password = data.get('sudo_password', '')
        
        if not sudo_password:
            return jsonify({'success': False, 'error': 'Sudo password required'}), 400
        
        # Get available modes from jtop to create dynamic mapping
        try:
            from jtop import jtop
            
            with jtop() as jetson:
                if hasattr(jetson, 'nvpmodel') and jetson.nvpmodel is not None:
                    available_modes = jetson.nvpmodel.models
                    # Create mode to ID mapping based on array index
                    mode_map = {mode_name: idx for idx, mode_name in enumerate(available_modes)}
                else:
                    # Fallback mapping
                    mode_map = {'15W': 0, '25W': 1, 'MAXN_SUPER': 2, '7W': 3}
        except:
            # Fallback mapping if jtop fails
            mode_map = {'15W': 0, '25W': 1, 'MAXN_SUPER': 2, '7W': 3}
        
        if mode in mode_map:
            result = subprocess.run(
                ['sudo', '-S', 'nvpmodel', '-m', str(mode_map[mode])],
                input=sudo_password + '\n',
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                logger.info(f"Power mode set to {mode}")
                return jsonify({'success': True, 'mode': mode})
            else:
                error_msg = result.stderr.strip() if result.stderr else f'Failed to set power mode to {mode}'
                return jsonify({'success': False, 'error': error_msg}), 500
        else:
            return jsonify({'success': False, 'error': f'Invalid power mode: {mode}. Available modes: {list(mode_map.keys())}'}), 400
            
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'Command timeout'
        }), 408
    except Exception as e:
        logger.error(f"Error setting power mode: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/system/fan-mode', methods=['GET'])
def get_fan_mode():
    """Get current fan profile"""
    try:
        # Query nvfancontrol for current profile
        result = subprocess.run(
            ['sudo', 'nvfancontrol', '--query'],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            # Parse output: "FAN1:FAN_PROFILE:quiet"
            lines = result.stdout.strip().split('\n')
            current_profile = 'quiet'  # default
            
            for line in lines:
                if 'FAN_PROFILE:' in line:
                    profile = line.split(':')[-1].strip()
                    current_profile = profile  # Return actual profile (quiet or cool)
                    break
            
            return jsonify({
                'success': True,
                'current_mode': current_profile,
                'available_modes': ['quiet', 'cool']
            })
        else:
            # Fallback if query fails
            return jsonify({
                'success': True,
                'current_mode': 'quiet',
                'available_modes': ['quiet', 'cool']
            })
            
    except Exception as e:
        logger.error(f"Error getting fan mode: {str(e)}")
        return jsonify({
            'success': True,
            'current_mode': 'quiet',
            'available_modes': ['quiet', 'cool']
        })

@app.route('/api/system/fan-mode', methods=['POST'])
def set_fan_mode():
    """Set fan control mode according to NVIDIA documentation"""
    try:
        data = request.json
        fan_mode = data.get('mode', 'auto')
        sudo_password = data.get('sudo_password', '')
        
        if not sudo_password:
            return jsonify({'success': False, 'error': 'Sudo password required'}), 400
        
        if fan_mode in ['auto', 'quiet']:
            # Set to quiet profile (auto mode uses quiet profile)
            profile = 'quiet'
        elif fan_mode == 'cool':
            # Set to cool profile
            profile = 'cool'
        else:
            return jsonify({'success': False, 'error': 'Invalid fan mode. Use auto, quiet, or cool'}), 400
        
        # Change fan profile according to NVIDIA documentation
        # Step 1: Stop nvfancontrol service
        result1 = subprocess.run(
            ['sudo', '-S', 'systemctl', 'stop', 'nvfancontrol'],
            input=sudo_password + '\n',
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result1.returncode != 0:
            error_msg = result1.stderr.strip() if result1.stderr else 'Failed to stop nvfancontrol'
            return jsonify({'success': False, 'error': f'Stop service failed: {error_msg}'}), 500
        
        # Step 2: Update FAN_DEFAULT_PROFILE in config file
        config_update_cmd = f"sed -i 's/FAN_DEFAULT_PROFILE .*/FAN_DEFAULT_PROFILE {profile}/' /etc/nvfancontrol.conf"
        result2 = subprocess.run(
            ['sudo', '-S', 'sh', '-c', config_update_cmd],
            input=sudo_password + '\n',
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result2.returncode != 0:
            # Try to restart service even if config update fails
            subprocess.run(['sudo', '-S', 'systemctl', 'start', 'nvfancontrol'], 
                         input=sudo_password + '\n', capture_output=True, text=True)
            error_msg = result2.stderr.strip() if result2.stderr else 'Failed to update config'
            return jsonify({'success': False, 'error': f'Config update failed: {error_msg}'}), 500
        
        # Step 3: Remove status file
        result3 = subprocess.run(
            ['sudo', '-S', 'rm', '-f', '/var/lib/nvfancontrol/status'],
            input=sudo_password + '\n',
            capture_output=True,
            text=True,
            timeout=5
        )
        # Don't fail if status file removal fails - it might not exist
        
        # Step 4: Start nvfancontrol service
        result4 = subprocess.run(
            ['sudo', '-S', 'systemctl', 'start', 'nvfancontrol'],
            input=sudo_password + '\n',
            capture_output=True,
            text=True,
            timeout=15
        )
        
        if result4.returncode != 0:
            error_msg = result4.stderr.strip() if result4.stderr else 'Failed to start nvfancontrol'
            return jsonify({'success': False, 'error': f'Start service failed: {error_msg}'}), 500
        
        logger.info(f"Fan profile changed to {profile} (mode: {fan_mode})")
        return jsonify({'success': True, 'mode': fan_mode, 'profile': profile})
        
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'Command timeout'
        }), 408
    except Exception as e:
        logger.error(f"Error setting fan mode: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
            
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'Command timeout'
        }), 408
    except Exception as e:
        logger.error(f"Error setting fan mode: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/system/reboot', methods=['POST'])
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

@app.route('/api/system/shutdown', methods=['POST'])
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

@app.route('/api/terminal/execute', methods=['POST'])
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
JetsonBoard Terminal - Available Commands:

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

@app.route('/api/terminal/complete', methods=['POST'])
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

@app.route('/api/terminal/userinfo', methods=['GET'])
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

def get_jetpack_version():
    """Get JetPack version"""
    with jtop() as jt:
        try:
            jetpack_version = jt.board['hardware'].get('Jetpack', 'Unknown')
            return jetpack_version
        except Exception:
            return 'Unknown'

def get_kernel_version():
    """Get kernel version"""
    try:
        result = os.popen("uname -r").read().strip()
        return result if result else 'Unknown'
    except Exception:
        return 'Unknown'

def get_jtop_board_info():
    """Get jtop board information"""
    try:
        with jtop() as jt:
            # Wait for data to be available
            time.sleep(0.1)
            
            board_info = {}
            
            # Get board information
            if hasattr(jt, 'board') and jt.board:
                if 'hardware' in jt.board:
                    board_info['Model'] = jt.board['hardware']['Model']
                    board_info['Module'] = jt.board['hardware']['Module']
                
            
            return board_info
            
    except Exception as e:
        logger.error(f"Error getting jtop board info: {str(e)}")
        return {}

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
        
        socketio.sleep(1.0)  # Update every 1 second

if __name__ == '__main__':
    # Ensure directories exist
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs('../logs', exist_ok=True)
    
    # Start background monitoring
    system_monitor.start_monitoring()
    
    # Start background WebSocket updates
    socketio.start_background_task(background_system_updates)
    
    logger.info("Starting Jetson Edge AI Dashboard with WebSocket support...")
    # Use app.config['DEBUG'] instead of hardcoded debug=True
    socketio.run(app, host='0.0.0.0', port=5000, debug=app.config['DEBUG'])