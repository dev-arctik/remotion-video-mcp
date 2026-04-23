// MotionBlur primitive — wraps any child in @remotion/motion-blur's Trail.
// Single biggest "looks like After Effects" upgrade for any moving element.
// Use sparingly — visible blur on every move makes a video feel washed out.
import React from 'react';
import { Trail, CameraMotionBlur } from '@remotion/motion-blur';

export interface MotionBlurProps {
  children: React.ReactNode;
  // Trail = ghost copies of the element behind its current position
  // Higher layers = more visible blur (but more CPU). 5–15 is the sweet spot.
  layers?: number;
  // Frames between each ghost copy. Higher = longer trail, less dense.
  lagInFrames?: number;
  // Trail mode = directional (motion blur). cameraMotionBlur = whole-frame blur.
  mode?: 'trail' | 'camera';
}

export const MotionBlur: React.FC<MotionBlurProps> = ({
  children,
  layers = 8,
  lagInFrames = 1,
  mode = 'trail',
}) => {
  if (mode === 'camera') {
    return (
      <CameraMotionBlur layers={layers} lagInFrames={lagInFrames}>
        {children}
      </CameraMotionBlur>
    );
  }
  return (
    <Trail layers={layers} lagInFrames={lagInFrames}>
      {children}
    </Trail>
  );
};
