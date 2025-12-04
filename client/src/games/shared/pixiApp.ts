import { Application } from 'pixi.js';
import { palette } from './theme';

type Disposer = () => void;
type BuildPixi = (app: Application, track: (fn: Disposer) => void) => void | Disposer;

/**
 * Boots a PixiJS Application on the provided canvas and wires a cleanup handler.
 * The build callback receives the ready app and a track() helper to register disposers.
 */
export const bootPixiApp = (
  canvas: HTMLCanvasElement,
  build: BuildPixi,
  options?: {
    background?: number | string;
    antialias?: boolean;
  },
): Disposer => {
  let app: Application | null = null;
  const disposers: Disposer[] = [];
  let destroyed = false;

  const track = (fn: Disposer) => disposers.push(fn);

  void (async () => {
    const instance = new Application();
    await instance.init({
      view: canvas,
      background: options?.background ?? palette.bg,
      antialias: options?.antialias ?? true,
      resolution: window.devicePixelRatio || 1,
      resizeTo: canvas.parentElement ?? window,
    });

    if (destroyed) {
      instance.destroy(true, { children: true, texture: true, baseTexture: true });
      return;
    }

    app = instance;
    const extraCleanup = build(instance, track);
    if (typeof extraCleanup === 'function') {
      disposers.push(extraCleanup);
    }
  })();

  return () => {
    destroyed = true;
    // run tracked disposers in reverse to avoid dependency surprises
    for (let i = disposers.length - 1; i >= 0; i -= 1) {
      try {
        disposers[i]();
      } catch {
        // ignore cleanup errors
      }
    }
    disposers.length = 0;
    if (app) {
      app.destroy(true, { children: true, texture: true, baseTexture: true });
      app = null;
    }
  };
};
