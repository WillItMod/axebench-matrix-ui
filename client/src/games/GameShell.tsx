import React from 'react';
import GameFrame from '../components/GameFrame';
import { StartGame } from './types';

export const makeGameComponent = (
  startGame: StartGame,
  options: { title: string; description: string; footerContent?: React.ReactNode },
) => {
  const GameComponent: React.FC = () => (
    <GameFrame
      title={options.title}
      description={options.description}
      start={startGame}
      footerContent={options.footerContent}
    />
  );

  GameComponent.displayName = options.title;
  return GameComponent;
};
