// NVIDIA Color Theme for styled-components
export const nvidiaTheme = {
  colors: {
    // NVIDIA Brand Colors
    nvidia: {
      green: '#76B900',
      darkGreen: '#5A8B00',
      lightGreen: '#9DD922',
      greenHover: '#9DD922',
      black: '#1A1A1A',
      darkGray: '#222222',
      gray: '#333333',
      lightGray: '#666666',
      white: '#FFFFFF'
    },
    
    // Status Colors
    status: {
      success: '#76B900',
      warning: '#FFA500',
      error: '#FF4444',
      info: '#00BFFF'
    },
    
    // Background Colors
    background: {
      primary: '#1A1A1A',
      secondary: '#222222',
      tertiary: '#333333',
      hover: '#2A2A2A'
    },
    
    // Text Colors
    text: {
      primary: '#FFFFFF',
      secondary: '#CCCCCC',
      muted: '#999999'
    },
    
    // Border Colors
    border: {
      primary: '#76B900',
      secondary: '#333333',
      tertiary: '#444444',
      dark: '#222222'
    }
  },
  
  // Gradients
  gradients: {
    primary: 'linear-gradient(135deg, #222222 0%, #333333 100%)',
    hover: 'linear-gradient(135deg, #333333 0%, #222222 100%)',
    sidebar: 'linear-gradient(180deg, #222222 0%, #1A1A1A 100%)',
    nvidia: 'linear-gradient(90deg, #76B900, #5A8B00)',
    card: 'linear-gradient(135deg, #222222 0%, #333333 100%)'
  },
  
  // Shadows
  shadows: {
    card: '0 8px 25px rgba(118, 185, 0, 0.2)',
    sidebar: '2px 0 10px rgba(118, 185, 0, 0.2)',
    focus: '0 0 15px rgba(118, 185, 0, 0.3)',
    hover: '0 0 20px rgba(118, 185, 0, 0.3)'
  },
  
  // Typography
  fonts: {
    primary: "'Segoe UI', 'Roboto', 'Arial', sans-serif",
    mono: "'Share Tech Mono', monospace",
    display: "'Orbitron', monospace",
    body: "'Inter', sans-serif"
  },
  
  // Breakpoints
  breakpoints: {
    mobile: '768px',
    tablet: '1024px',
    desktop: '1200px'
  },
  
  // Transitions
  transitions: {
    fast: '0.2s ease',
    medium: '0.3s ease',
    slow: '0.5s ease'
  },
  
  // Z-indices
  zIndex: {
    sidebar: 1000,
    modal: 2000,
    notification: 3000
  }
};

// Helper functions for theme usage
export const getGradient = (name) => nvidiaTheme.gradients[name];
export const getColor = (category, shade) => nvidiaTheme.colors[category][shade];
export const getShadow = (name) => nvidiaTheme.shadows[name];