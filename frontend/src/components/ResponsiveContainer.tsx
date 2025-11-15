import React from 'react';
import styled from 'styled-components';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

interface StyledContainerProps {
  $maxWidth: string;
  $padding: string;
}

const Container = styled.div<StyledContainerProps>`
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  padding-left: ${props => props.$padding};
  padding-right: ${props => props.$padding};
  max-width: ${props => props.$maxWidth};

  /* Smooth transitions for layout changes */
  transition: padding ${props => props.theme.transitions.medium};
`;

const maxWidthMap = {
  sm: '576px',
  md: '768px', 
  lg: '992px',
  xl: '1200px',
  full: '100%'
};

const paddingMap = {
  none: '0',
  sm: '12px',
  md: '20px',
  lg: '30px'
};

const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  className,
  maxWidth = 'full',
  padding = 'md'
}) => {
  return (
    <Container
      className={className}
      $maxWidth={maxWidthMap[maxWidth]}
      $padding={paddingMap[padding]}
    >
      {children}
    </Container>
  );
};

export default ResponsiveContainer;