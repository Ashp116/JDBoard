import React from 'react';
import styled from 'styled-components';

interface ResponsiveGridProps {
  children: React.ReactNode;
  className?: string;
  cols?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  gap?: 'sm' | 'md' | 'lg';
  minItemWidth?: string;
}

interface StyledGridProps {
  $gap: string;
  $cols: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  $minItemWidth?: string;
}

const Grid = styled.div<StyledGridProps>`
  display: grid;
  gap: ${props => props.$gap};
  
  /* Mobile first approach */
  grid-template-columns: repeat(${props => props.$cols.xs}, 1fr);
  
  /* Small devices */
  @media (min-width: 576px) {
    grid-template-columns: repeat(${props => props.$cols.sm}, 1fr);
  }
  
  /* Medium devices */
  @media (min-width: 768px) {
    grid-template-columns: repeat(${props => props.$cols.md}, 1fr);
  }
  
  /* Large devices */
  @media (min-width: 992px) {
    grid-template-columns: repeat(${props => props.$cols.lg}, 1fr);
  }
  
  /* Extra large devices */
  @media (min-width: 1200px) {
    grid-template-columns: ${props => 
      props.$minItemWidth 
        ? `repeat(auto-fit, minmax(${props.$minItemWidth}, 1fr))`
        : `repeat(${props.$cols.xl}, 1fr)`
    };
  }
  
  /* Smooth transitions */
  transition: gap ${props => props.theme.transitions.medium};
`;

const gapMap = {
  sm: '12px',
  md: '20px',
  lg: '30px'
};

const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  className,
  cols = { xs: 1, sm: 2, md: 3, lg: 4, xl: 4 },
  gap = 'md',
  minItemWidth
}) => {
  const gridCols = {
    xs: cols.xs || 1,
    sm: cols.sm || cols.xs || 1,
    md: cols.md || cols.sm || cols.xs || 1,
    lg: cols.lg || cols.md || cols.sm || cols.xs || 1,
    xl: cols.xl || cols.lg || cols.md || cols.sm || cols.xs || 1
  };

  return (
    <Grid
      className={className}
      $gap={gapMap[gap]}
      $cols={gridCols}
      $minItemWidth={minItemWidth}
    >
      {children}
    </Grid>
  );
};

export default ResponsiveGrid;