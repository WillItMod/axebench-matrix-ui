export type StartGame = (canvas: HTMLCanvasElement) => void | (() => void);

export type GameMeta = {
  id: string;
  title: string;
  description: string;
  tech: 'pixi' | 'babylon';
};

export type GameModule = GameMeta & {
  startGame: StartGame;
  Component: React.FC;
};
