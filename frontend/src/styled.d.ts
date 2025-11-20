import 'styled-components';

declare module 'styled-components' {
  export interface DefaultTheme {
    colors: {
      nvidia: {
        green: string;
        darkGreen: string;
        lightGreen: string;
        greenHover: string;
        black: string;
        darkGray: string;
        gray: string;
        lightGray: string;
        white: string;
        blue: string;
      };
      status: {
        success: string;
        warning: string;
        error: string;
        info: string;
      };
      background: {
        primary: string;
        secondary: string;
        tertiary: string;
        hover: string;
      };
      text: {
        primary: string;
        secondary: string;
        muted: string;
      };
      border: {
        primary: string;
        secondary: string;
        tertiary: string;
        dark: string;
      };
    };
    gradients: {
      primary: string;
      hover: string;
      sidebar: string;
      nvidia: string;
      card: string;
    };
    shadows: {
      card: string;
      sidebar: string;
      focus: string;
      hover: string;
    };
    fonts: {
      primary: string;
      mono: string;
      display: string;
      body: string;
    };
    breakpoints: {
      mobile: string;
      tablet: string;
      desktop: string;
    };
    media: {
      mobile: string;
      tablet: string;
      desktop: string;
    };
    spacing: {
      xs: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
      xxl: string;
    };
    transitions: {
      fast: string;
      medium: string;
      slow: string;
      standard: string;
    };
    zIndex: {
      sidebar: number;
      modal: number;
      notification: number;
    };
  }
}