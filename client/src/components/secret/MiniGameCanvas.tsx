import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

type MiniGameCanvasProps = {
  onComplete: () => void;
  createScene: (onComplete: () => void) => Phaser.Types.Scenes.SceneType;
  width?: number;
  height?: number;
  className?: string;
  backgroundColor?: number | string;
  onSceneReady?: (scene: Phaser.Scene) => void;
};

export default function MiniGameCanvas({
  onComplete,
  createScene,
  width = 560,
  height = 360,
  className,
  backgroundColor = 'transparent',
  onSceneReady,
}: MiniGameCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = createScene(onComplete);
    const transparent = backgroundColor === 'transparent' || backgroundColor === undefined;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width,
      height,
      transparent,
      backgroundColor: transparent ? undefined : backgroundColor,
      fps: { target: 60 },
      scene,
    });

    if (onSceneReady && scene instanceof Phaser.Scene) {
      onSceneReady(scene);
    }

    return () => {
      game.destroy(true);
    };
  }, [backgroundColor, createScene, height, onComplete, onSceneReady, width]);

  return <div ref={containerRef} className={className ?? ''} />;
}
