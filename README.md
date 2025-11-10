
<p align="center">
   <img src="/JBoardIcon.svg" alt="Jetson Board Icon" width="120" />
</p>

# JBoard

A modern, React-based edge AI dashboard designed for NVIDIA Jetson devices. This dashboard provides real-time system monitoring, AI model management, inference capabilities, and comprehensive analytics with a professional NVIDIA-themed interface.

## 🚀 Architecture

### Frontend
- **React 18**: Modern component-based architecture
- **Styled-components**: NVIDIA-themed design system
- **Vite**: Fast build tool with hot module replacement
- **Socket.IO Client**: Real-time WebSocket communication
- **Responsive Design**: Mobile-friendly interface

### Backend
- **Flask**: Python web framework
- **Socket.IO**: Real-time bidirectional communication
- **System Monitoring**: Native Linux system integration
- **AI Framework Support**: ONNX, TensorRT, PyTorch, TensorFlow

## ✨ Features

### 🤖 AI Model Management
- Upload and manage multiple AI models (ONNX, TensorRT, PyTorch, TensorFlow)
- Real-time model loading/unloading with WebSocket updates
- Model performance tracking and analytics
- Support for computer vision, NLP, and audio models

### 📊 Real-time System Monitoring
- Live CPU, GPU, memory, and storage monitoring
- Temperature and frequency tracking
- Jetson-specific hardware monitoring (tegrastats, nvidia-ml)
- Network and process monitoring with WebSocket updates

### 🔍 Inference Engine
- Drag-and-drop image upload for inference
- Real-time inference with performance metrics
- Support for multiple ML frameworks
- Batch inference capabilities

### 📈 Request Logging & Analytics
- Comprehensive request logging with timestamps
- Client IP tracking and session management
- Inference performance analytics
- Real-time activity monitoring
- Statistical dashboards

### 🎨 NVIDIA Professional UI
- Official NVIDIA green color scheme (#76B900)
- Professional dark theme with gradients
- Smooth animations and transitions
- Component-based React architecture
- Responsive design for all screen sizes

## 🚀 Installation

### Prerequisites
- NVIDIA Jetson device (Nano, Xavier, Orin) or CUDA-capable system
- Python 3.8+
- Node.js 16+ (for React frontend)
- pip3 and npm
- At least 4GB RAM recommended

### Quick Start (React Development)

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Jetson_Edge
   ```

2. **Start backend server:**
   ```bash
   ./start.sh install
   ./start.sh start
   ```

3. **Start React development server:**
   ```bash
   ./dev-server.sh
   ```

4. **Access the application:**
   - **Frontend (Development)**: http://localhost:3000
   - **Backend API**: http://localhost:5000

### Production Deployment

1. **Build React frontend:**
   ```bash
   ./build-react.sh
   ```

2. **Start backend server:**
   ```bash
   ./start.sh start
   ```

3. **Access the dashboard:**
   ```
   http://<jetson-ip>:5000
   ```

### Manual Installation

#### Backend Setup

1. **Create virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Create directories:**
   ```bash
   mkdir -p models logs static/uploads
   ```

#### Frontend Setup

1. **Install Node.js dependencies:**
   ```bash
   cd react-frontend
   npm install
   ```

2. **Build React app:**
   ```bash
   npm run build
   ```

4. **Start the application:**
   ```bash
   cd backend
   python app.py
   ```

## Configuration

### Environment Variables
Configure the dashboard by editing the `.env` file:

```env
# Server settings
HOST=0.0.0.0
PORT=5000

# Upload limits
MAX_CONTENT_LENGTH=524288000  # 500MB

# Monitoring intervals
REFRESH_INTERVAL=2  # seconds

# Performance thresholds
CPU_WARNING_THRESHOLD=80
GPU_WARNING_THRESHOLD=80
MEMORY_WARNING_THRESHOLD=85
```

### Systemd Service
To run the dashboard as a system service:

```bash
sudo ./start.sh service
sudo systemctl start jetson-dashboard
sudo systemctl status jetson-dashboard
```

## Usage

### Model Upload
1. Click "UPLOAD MODEL" in the AI Models panel
2. Fill in model details (name, type, description)
3. Select your model file (.onnx, .trt, .pth, .pb, etc.)
4. Click "UPLOAD MODEL"

### Running Inference
1. Load a model by clicking "LOAD" on a model card
2. Select the loaded model in the Inference Engine
3. Drag and drop an image or click to upload
4. View inference results and performance metrics

### Monitoring
- System metrics update every 2 seconds
- View real-time CPU, GPU, memory, and storage usage
- Monitor temperature and frequency data
- Track network activity and active processes

### Logs and Analytics
- View request logs in the Activity Log panel
- Monitor client activity and session data
- Analyze performance statistics
- Export logs for further analysis

## API Endpoints

### System Monitoring
- `GET /api/system/status` - Get comprehensive system status
- `GET /api/system/gpu` - Get GPU-specific metrics

### Model Management
- `GET /api/models` - List all uploaded models
- `POST /api/models/upload` - Upload a new model
- `POST /api/models/{id}/load` - Load a model for inference

### Inference
- `POST /api/inference` - Run inference on uploaded image

### Logging
- `GET /api/logs/requests` - Get request logs with pagination
- `GET /api/logs/stats` - Get usage statistics

## Supported Model Formats

| Format | Framework | Extension | GPU Acceleration |
|--------|-----------|-----------|------------------|
| ONNX | ONNX Runtime | .onnx | ✅ CUDA |
| TensorRT | TensorRT | .trt, .engine | ✅ TensorRT |
| PyTorch | PyTorch | .pth, .pt | ✅ CUDA |
| TensorFlow | TensorFlow | .pb, .h5 | ✅ CUDA |

## Performance Optimization

### For Jetson Devices
```bash
# Enable maximum performance mode
sudo jetson_clocks

# Monitor power usage
sudo jtop

# Optimize model inference
# - Use TensorRT for maximum performance
# - Enable FP16 precision for compatible models
# - Batch multiple inferences when possible
```

### Memory Management
- Models are automatically cached in memory
- Configurable cache size limit
- Automatic cleanup of old inference results
- Memory usage monitoring and alerts

## Development

### Project Structure
```
Jetson_Edge/
├── backend/           # Flask application
│   ├── app.py        # Main application
│   ├── system_monitor.py  # System monitoring
│   ├── ai_inference.py   # AI model management
│   └── request_logger.py # Logging system
├── frontend/         # HTML templates
│   └── index.html   # Main dashboard
├── static/          # Static assets
│   ├── css/         # Stylesheets
│   └── js/          # JavaScript
├── models/          # Uploaded AI models
├── logs/            # Application logs
└── requirements.txt # Python dependencies
```

### Adding New Features
1. Backend: Add new API endpoints in `app.py`
2. Frontend: Update UI in `index.html` and `dashboard.js`
3. Monitoring: Extend `system_monitor.py` for new metrics
4. AI: Add new model formats in `ai_inference.py`

## Troubleshooting

### Common Issues

**Dashboard won't start:**
```bash
# Check Python version
python3 --version

# Verify dependencies
pip list | grep -E "(flask|opencv|torch|onnx)"

# Check port availability
sudo netstat -tlnp | grep :5000
```

**GPU not detected:**
```bash
# Check NVIDIA drivers
nvidia-smi

# Verify CUDA installation
nvcc --version

# Check Jetson tools (Jetson only)
tegrastats
```

**Model upload fails:**
```bash
# Check disk space
df -h

# Verify file permissions
ls -la models/

# Check upload size limits
grep MAX_CONTENT_LENGTH .env
```

**High CPU/GPU usage:**
- Reduce monitoring refresh interval
- Unload unused models
- Enable jetson_clocks for stable performance
- Check for memory leaks in logs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- NVIDIA for Jetson hardware and development tools
- The open-source ML community for model formats and frameworks
- Cyberpunk aesthetics inspired by sci-fi culture

## Support

For issues, questions, or contributions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the API documentation

---

**JETSON EDGE AI TERMINAL** - Bringing cyberpunk aesthetics to edge AI monitoring and inference.
