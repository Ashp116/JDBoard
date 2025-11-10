# JBoard - React Frontend

A modern, responsive React-based frontend for JBoard with real-time system monitoring and AI model management.

## 🚀 Features

- **Modern React Architecture**: Built with React 18, Hooks, and functional components
- **NVIDIA-Themed UI**: Professional NVIDIA green color scheme with styled-components
- **Real-time Updates**: WebSocket integration for live system monitoring
- **Responsive Design**: Mobile-friendly interface with adaptive layouts
- **Component-Based**: Modular, reusable React components
- **Fast Development**: Vite build system with hot module replacement

## 🛠️ Tech Stack

- **Frontend Framework**: React 18
- **Styling**: Styled-components with NVIDIA theme
- **Build Tool**: Vite
- **Real-time Communication**: Socket.IO Client
- **State Management**: React Hooks (useState, useEffect, custom hooks)
- **Icons**: Font Awesome
- **Fonts**: Inter, Orbitron, Share Tech Mono

## 📁 Project Structure

```
react-frontend/
├── src/
│   ├── components/          # React components
│   │   ├── Dashboard.jsx    # Main dashboard
│   │   ├── Sidebar.jsx      # Navigation sidebar
│   │   ├── MetricCard.jsx   # System metrics
│   │   └── ...              # Other components
│   ├── hooks/               # Custom React hooks
│   │   └── useSocket.js     # WebSocket management
│   ├── styles/              # Styling system
│   │   ├── theme.js         # NVIDIA color theme
│   │   └── GlobalStyles.js  # Global CSS
│   ├── utils/               # Utility functions
│   ├── App.jsx              # Main app component
│   └── main.jsx             # React entry point
├── public/
│   └── index.html           # HTML template
├── package.json             # Dependencies and scripts
└── vite.config.js           # Vite configuration
```

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ and npm
- Backend Flask server running on port 5000

### Installation

1. **Install dependencies**:
   ```bash
   cd react-frontend
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```
   The frontend will be available at `http://localhost:3000`

3. **Build for production**:
   ```bash
   npm run build
   ```
   Built files will be in the `dist/` directory

### Quick Start Scripts

From the main project directory:

- **Development mode**: `./dev-server.sh`
- **Build for production**: `./build-react.sh`

## 🔧 Configuration

### Vite Configuration

The `vite.config.js` includes:
- React plugin
- Proxy configuration for backend API
- WebSocket proxy for Socket.IO
- Build optimization

### Environment Variables

Create a `.env` file in the react-frontend directory:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

## 🎨 NVIDIA Theme

The application uses a comprehensive NVIDIA-themed design system:

### Colors
- **Primary**: NVIDIA Green (#76B900)
- **Secondary**: Dark Gray (#222222)
- **Background**: NVIDIA Black (#1A1A1A)
- **Accent**: Light Green (#9DD922)

### Typography
- **Primary**: Segoe UI, Roboto, Arial
- **Display**: Orbitron (headings)
- **Monospace**: Share Tech Mono (code/metrics)

## 📱 Components

### Core Components

- **Dashboard**: Main system overview with metrics
- **Sidebar**: Navigation with NVIDIA branding
- **MetricCard**: Reusable metric display with progress bars
- **SystemStatus**: Connection status indicator

### Section Components

- **ModelsSection**: AI model management
- **InferenceSection**: Real-time inference interface
- **MonitoringSection**: Advanced system monitoring
- **LogsSection**: System logs viewer
- **SettingsSection**: Configuration panel

## 🔌 WebSocket Integration

The `useSocket` hook provides:
- Automatic connection management
- Real-time data updates
- Event handling for system metrics
- Error handling and reconnection logic

### Socket Events

- `system_update`: Real-time system metrics
- `model_update`: AI model status changes
- `inference_result`: Inference results
- `log_entry`: New log entries

## 🏗️ Development

### Adding New Components

1. Create component in `src/components/`
2. Use styled-components with theme integration
3. Follow NVIDIA design patterns
4. Add proper TypeScript types (if using TypeScript)

### Custom Hooks

Create reusable hooks in `src/hooks/`:
- Data fetching hooks
- UI state management
- WebSocket event handlers

### Styling Guidelines

- Use styled-components with theme provider
- Follow NVIDIA color scheme
- Implement responsive design
- Use consistent spacing and typography

## 🚀 Deployment

### Production Build

```bash
npm run build
```

### Integration with Backend

The build script automatically copies built files to the backend static directory for seamless integration.

## 🐛 Troubleshooting

### Common Issues

1. **WebSocket Connection Issues**
   - Ensure backend is running on port 5000
   - Check proxy configuration in vite.config.js

2. **Styling Issues**
   - Verify theme provider is properly configured
   - Check for styled-components version compatibility

3. **Build Issues**
   - Clear node_modules and reinstall dependencies
   - Check for Node.js version compatibility

## 📄 License

This project is part of the JBoard system.

## 🤝 Contributing

1. Follow the existing code style
2. Use the NVIDIA theme consistently
3. Add proper documentation
4. Test WebSocket integration thoroughly