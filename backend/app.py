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
    description = request.form.get('description', '')
    
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
            
            # Register the model
            model_info = ai_manager.register_model(
                model_name=model_name,
                file_path=file_path,
                model_type=model_type,
                description=description,
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
        result = ai_manager.load_model(model_id)
        logger.info(f"Model {model_id} loaded by {client_ip}")
        
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
        logger.error(f"Error during inference: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
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
                'fanMode': 'auto'
            }
        
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
        
        if enabled:
            # Enable Jetson Clocks
            result = os.system('sudo jetson_clocks')
            if result == 0:
                logger.info("Jetson Clocks enabled")
                return jsonify({'success': True, 'status': 'enabled'})
            else:
                return jsonify({'success': False, 'error': 'Failed to enable Jetson Clocks'}), 500
        else:
            # Disable Jetson Clocks (restore normal governors)
            result = os.system('sudo jetson_clocks --restore')
            if result == 0:
                logger.info("Jetson Clocks disabled")
                return jsonify({'success': True, 'status': 'disabled'})
            else:
                return jsonify({'success': False, 'error': 'Failed to disable Jetson Clocks'}), 500
                
    except Exception as e:
        logger.error(f"Error toggling Jetson Clocks: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/system/power-mode', methods=['POST'])
def set_power_mode():
    """Set system power mode"""
    try:
        data = request.json
        mode = data.get('mode', 'MAXN')
        
        # Map mode names to nvpmodel numbers
        mode_map = {
            'MAXN': 0,
            'MODE_15W': 1,
            'MODE_30W': 2,
            'MODE_50W': 3
        }
        
        if mode in mode_map:
            result = os.system(f'sudo nvpmodel -m {mode_map[mode]}')
            if result == 0:
                logger.info(f"Power mode set to {mode}")
                return jsonify({'success': True, 'mode': mode})
            else:
                return jsonify({'success': False, 'error': f'Failed to set power mode to {mode}'}), 500
        else:
            return jsonify({'success': False, 'error': 'Invalid power mode'}), 400
            
    except Exception as e:
        logger.error(f"Error setting power mode: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/system/fan-mode', methods=['POST'])
def set_fan_mode():
    """Set fan control mode"""
    try:
        data = request.json
        mode = data.get('mode', 'auto')
        
        # Fan control implementation depends on your specific Jetson model
        # This is a placeholder - you may need to adjust based on your hardware
        if mode == 'auto':
            # Enable automatic fan control
            result = os.system('sudo sh -c "echo 0 > /sys/devices/pwm-fan/target_pwm"')
        elif mode == 'quiet':
            # Set fan to quiet mode (30% speed)
            result = os.system('sudo sh -c "echo 80 > /sys/devices/pwm-fan/target_pwm"')
        elif mode == 'cool':
            # Set fan to cooling mode (70% speed)
            result = os.system('sudo sh -c "echo 180 > /sys/devices/pwm-fan/target_pwm"')
        elif mode == 'manual':
            # Manual mode - user can control via other interface
            result = 0  # Just acknowledge the setting
        else:
            return jsonify({'success': False, 'error': 'Invalid fan mode'}), 400
        
        if result == 0:
            logger.info(f"Fan mode set to {mode}")
            return jsonify({'success': True, 'mode': mode})
        else:
            return jsonify({'success': False, 'error': f'Failed to set fan mode to {mode}'}), 500
            
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
        logger.warning("System reboot requested")
        
        # Schedule reboot in 5 seconds to allow response to be sent
        def delayed_reboot():
            time.sleep(5)
            os.system('sudo reboot')
        
        threading.Thread(target=delayed_reboot, daemon=True).start()
        
        return jsonify({
            'success': True,
            'message': 'System reboot scheduled in 5 seconds'
        })
        
    except Exception as e:
        logger.error(f"Error rebooting system: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/system/shutdown', methods=['POST'])
def shutdown_system():
    """Shutdown the system"""
    try:
        logger.warning("System shutdown requested")
        
        # Schedule shutdown in 5 seconds to allow response to be sent
        def delayed_shutdown():
            time.sleep(5)
            os.system('sudo shutdown -h now')
        
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
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)