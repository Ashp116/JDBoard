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

  /* Mobile-first responsive design */
  /* Base styles for mobile */
  html {
    font-size: 14px;
  }

  /* Tablet styles */
  @media (min-width: 768px) {
    html {
      font-size: 15px;
    }
  }

  /* Desktop styles */
  @media (min-width: 992px) {
    html {
      font-size: 16px;
    }
  }

  /* Large desktop styles */
  @media (min-width: 1200px) {
    html {
      font-size: 16px;
    }
  }

  /* Touch device improvements */
  @media (hover: none) and (pointer: coarse) {
    button, [role="button"], .clickable {
      min-height: 44px; /* iOS guideline for touch targets */
      min-width: 44px;
    }
  }

  /* High DPI displays */
  @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
    body {
      -webkit-font-smoothing: subpixel-antialiased;
    }
  }

  /* Responsive utility classes */
  .hidden-mobile { @media (max-width: 767px) { display: none !important; } }
  .hidden-tablet { @media (min-width: 768px) and (max-width: 991px) { display: none !important; } }
  .hidden-desktop { @media (min-width: 992px) { display: none !important; } }
  .visible-mobile { @media (min-width: 768px) { display: none !important; } }
  .visible-tablet { @media (max-width: 767px), (min-width: 992px) { display: none !important; } }
  .visible-desktop { @media (max-width: 991px) { display: none !important; } }

  /* Responsive text utilities */
  .text-xs { font-size: 0.75rem; }
  .text-sm { font-size: 0.875rem; }
  .text-base { font-size: 1rem; }
  .text-lg { font-size: 1.125rem; }
  .text-xl { font-size: 1.25rem; }

  /* Responsive spacing utilities */
  .p-0 { padding: 0; }
  .p-1 { padding: 0.25rem; }
  .p-2 { padding: 0.5rem; }
  .p-3 { padding: 0.75rem; }
  .p-4 { padding: 1rem; }
  .p-5 { padding: 1.25rem; }
  
  .m-0 { margin: 0; }
  .m-1 { margin: 0.25rem; }
  .m-2 { margin: 0.5rem; }
  .m-3 { margin: 0.75rem; }
  .m-4 { margin: 1rem; }
  .m-5 { margin: 1.25rem; }

  /* Responsive flex utilities */
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .flex-row { flex-direction: row; }
  .flex-wrap { flex-wrap: wrap; }
  .items-center { align-items: center; }
  .justify-center { justify-content: center; }
  .justify-between { justify-content: space-between; }
  
  /* Mobile responsive overrides */
  @media (max-width: 767px) {
    .mobile\\:flex-col { flex-direction: column !important; }
    .mobile\\:text-center { text-align: center !important; }
    .mobile\\:text-sm { font-size: 0.875rem !important; }
    .mobile\\:p-2 { padding: 0.5rem !important; }
    .mobile\\:m-2 { margin: 0.5rem !important; }
  }
  
  /* Tablet responsive overrides */
  @media (min-width: 768px) and (max-width: 991px) {
    .tablet\\:flex-row { flex-direction: row !important; }
    .tablet\\:text-base { font-size: 1rem !important; }
    .tablet\\:p-3 { padding: 0.75rem !important; }
  }
`;