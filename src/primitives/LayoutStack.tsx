// Flex layout primitive — stack children vertically or horizontally
import React from 'react';

export interface LayoutStackProps {
  children: React.ReactNode;
  direction?: 'column' | 'row';
  align?: React.CSSProperties['alignItems'];     // cross-axis alignment
  justify?: React.CSSProperties['justifyContent']; // main-axis alignment
  gap?: number;
  padding?: number | string;
  // fill the full scene by default
  fullScreen?: boolean;
  style?: React.CSSProperties;
}

export const LayoutStack: React.FC<LayoutStackProps> = ({
  children,
  direction = 'column',
  align = 'center',
  justify = 'center',
  gap = 0,
  padding = 0,
  fullScreen = true,
  style = {},
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction,
        alignItems: align,
        justifyContent: justify,
        gap,
        padding,
        ...(fullScreen ? { width: '100%', height: '100%' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
};
