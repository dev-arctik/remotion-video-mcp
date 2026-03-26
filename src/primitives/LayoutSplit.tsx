// Split layout primitive — two children side by side with configurable ratio
import React from 'react';

export interface LayoutSplitProps {
  children: React.ReactNode; // expects exactly 2 children
  // ratio as "left/right" — e.g. "60/40", "50/50", "70/30"
  ratio?: string;
  gap?: number;
  direction?: 'row' | 'column'; // horizontal or vertical split
  padding?: number | string;
  // vertical alignment of content within each side
  align?: React.CSSProperties['alignItems'];
  style?: React.CSSProperties;
}

export const LayoutSplit: React.FC<LayoutSplitProps> = ({
  children,
  ratio = '50/50',
  gap = 0,
  direction = 'row',
  padding = 0,
  align = 'center',
  style = {},
}) => {
  // Parse ratio string into flex values
  const parts = ratio.split('/').map(Number);
  const leftFlex = parts[0] ?? 50;
  const rightFlex = parts[1] ?? 50;

  const childArray = React.Children.toArray(children);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction,
        width: '100%',
        height: '100%',
        gap,
        padding,
        ...style,
      }}
    >
      <div style={{ flex: leftFlex, display: 'flex', alignItems: align, justifyContent: 'center', overflow: 'hidden' }}>
        {childArray[0]}
      </div>
      <div style={{ flex: rightFlex, display: 'flex', alignItems: align, justifyContent: 'center', overflow: 'hidden' }}>
        {childArray[1]}
      </div>
    </div>
  );
};
