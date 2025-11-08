import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  /* CSS Custom Properties for use in styled components */
  :root {
    --text-primary: ${props => props.theme.colors.text.primary};
    --text-secondary: ${props => props.theme.colors.text.secondary};
    --nvidia-green: ${props => props.theme.colors.nvidia.green};
    --background-primary: ${props => props.theme.colors.background.primary};
    --background-secondary: ${props => props.theme.colors.background.secondary};
    --background-tertiary: ${props => props.theme.colors.background.tertiary};
    --border-primary: ${props => props.theme.colors.border.primary};
    --border-secondary: ${props => props.theme.colors.border.secondary};
  }

  /* Reset and base styles */
  *, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html {
    background: ${props => props.theme.colors.background.primary} !important;
    font-size: 16px;
  }

  body {
    font-family: ${props => props.theme.fonts.primary};
    background: ${props => props.theme.colors.background.primary} !important;
    color: ${props => props.theme.colors.text.primary};
    overflow-x: hidden;
    margin: 0;
    padding: 0;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  #root {
    min-height: 100vh;
    background: ${props => props.theme.colors.background.primary};
  }

  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: ${props => props.theme.colors.background.primary};
  }

  ::-webkit-scrollbar-thumb {
    background: ${props => props.theme.colors.nvidia.green};
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: ${props => props.theme.colors.nvidia.lightGreen};
  }

  /* Focus styles */
  button:focus,
  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    box-shadow: ${props => props.theme.shadows.focus};
  }

  /* Text selection */
  ::selection {
    background: ${props => props.theme.colors.nvidia.green};
    color: ${props => props.theme.colors.background.primary};
  }

  /* Animations */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes scan {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  /* Utility classes */
  .nvidia-green { color: ${props => props.theme.colors.nvidia.green}; }
  .text-primary { color: ${props => props.theme.colors.text.primary}; }
  .text-secondary { color: ${props => props.theme.colors.text.secondary}; }
  .text-muted { color: ${props => props.theme.colors.text.muted}; }

  /* Responsive design helpers */
  @media (max-width: ${props => props.theme.breakpoints.mobile}) {
    html {
      font-size: 14px;
    }
  }
`;