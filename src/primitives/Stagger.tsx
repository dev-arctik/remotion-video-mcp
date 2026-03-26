// Stagger primitive — wraps children and offsets each child's entrance by a delay
// Works by cloning children and injecting an incremented delay into their animation prop
import React from 'react';

export interface StaggerProps {
  children: React.ReactNode;
  /** Frames between each child's entrance */
  delayFrames?: number;
  /** Initial delay before the first child enters */
  initialDelay?: number;
  style?: React.CSSProperties;
}

export const Stagger: React.FC<StaggerProps> = ({
  children,
  delayFrames = 8,
  initialDelay = 0,
  style = {},
}) => {
  const childArray = React.Children.toArray(children);

  return (
    <div style={style}>
      {childArray.map((child, index) => {
        if (!React.isValidElement(child)) return child;

        // Calculate cumulative delay for this child
        const staggerDelay = initialDelay + index * delayFrames;

        // Merge stagger delay into the child's existing animation config
        const existingAnimation = (child.props as Record<string, unknown>).animation as Record<string, unknown> | undefined;
        const existingDelay = (existingAnimation?.delay as number) ?? 0;

        return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          animation: {
            ...existingAnimation,
            delay: existingDelay + staggerDelay,
          },
        });
      })}
    </div>
  );
};
