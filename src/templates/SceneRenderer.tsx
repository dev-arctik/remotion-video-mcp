import React from 'react';
import { TitleCard } from './templates/TitleCard';
import { TextScene } from './templates/TextScene';
import { ImageScene } from './templates/ImageScene';
import { TextWithImage } from './templates/TextWithImage';
import { KineticTypography } from './templates/KineticTypography';
import { CodeBlock } from './templates/CodeBlock';
import { TransitionWipe } from './templates/TransitionWipe';
import { AnimatedObject } from './templates/AnimatedObject';
import { AbsoluteFill } from 'remotion';

// Scene data shape — matches composition.json scene entries
interface SceneData {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  objects?: Array<{ id: string; [key: string]: unknown }>;
}

// Static dispatcher — maps scene.type to the correct template component.
// This is a convenience utility for advanced users who want to render scenes
// dynamically from JSON. It is NOT used by generated code (scene .tsx files
// import templates directly), but is included for custom workflows.
export const SceneRenderer: React.FC<{ scene: SceneData }> = ({ scene }) => {
  const props = scene.props ?? {};

  switch (scene.type) {
    case 'title-card':
      return <TitleCard {...(props as React.ComponentProps<typeof TitleCard>)} />;
    case 'text-scene':
      return <TextScene {...(props as React.ComponentProps<typeof TextScene>)} />;
    case 'image-scene':
      return <ImageScene {...(props as React.ComponentProps<typeof ImageScene>)} />;
    case 'text-with-image':
      return <TextWithImage {...(props as React.ComponentProps<typeof TextWithImage>)} />;
    case 'kinetic-typography':
      return <KineticTypography {...(props as React.ComponentProps<typeof KineticTypography>)} />;
    case 'code-block':
      return <CodeBlock {...(props as React.ComponentProps<typeof CodeBlock>)} />;
    case 'transition-wipe':
      return <TransitionWipe {...(props as React.ComponentProps<typeof TransitionWipe>)} />;
    case 'custom':
      return (
        <AbsoluteFill style={{ backgroundColor: (props.backgroundColor as string) ?? '#000000' }}>
          {(scene.objects ?? []).map((obj) => (
            <AnimatedObject key={obj.id} object={obj as React.ComponentProps<typeof AnimatedObject>['object']} />
          ))}
        </AbsoluteFill>
      );
    default:
      return null;
  }
};
