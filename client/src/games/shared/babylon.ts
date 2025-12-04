import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { palette } from './theme';

type Disposer = () => void;
type BuildBabylon = (scene: Scene, engine: Engine, track: (fn: Disposer) => void) => void | Disposer;

/**
 * Boots a BabylonJS engine + scene and wires cleanup.
 * The build callback receives scene, engine and a track() helper for disposers.
 */
export const bootBabylonScene = (
  canvas: HTMLCanvasElement,
  build: BuildBabylon,
  options?: { clearColor?: Color4 },
): Disposer => {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor =
    options?.clearColor ??
    Color4.FromColor3(Color3.FromHexString(palette.bg), 1.0) ??
    new Color4(0, 0, 0, 1);

  const disposers: Disposer[] = [];
  const track = (fn: Disposer) => disposers.push(fn);

  // Render loop
  engine.runRenderLoop(() => {
    scene.render();
  });

  const resize = () => engine.resize();
  window.addEventListener('resize', resize);
  disposers.push(() => window.removeEventListener('resize', resize));

  const extraCleanup = build(scene, engine, track);
  if (typeof extraCleanup === 'function') {
    disposers.push(extraCleanup);
  }

  return () => {
    for (let i = disposers.length - 1; i >= 0; i -= 1) {
      try {
        disposers[i]();
      } catch {
        // ignore cleanup errors
      }
    }
    disposers.length = 0;
    scene.dispose();
    engine.dispose();
  };
};

export const createOrbitCamera = (
  scene: Scene,
  canvas: HTMLCanvasElement,
  options?: { radius?: number; alpha?: number; beta?: number; target?: Vector3 },
) => {
  const camera = new ArcRotateCamera(
    'orbitCamera',
    options?.alpha ?? Math.PI / 3,
    options?.beta ?? Math.PI / 3,
    options?.radius ?? 16,
    options?.target ?? new Vector3(0, 0, 0),
    scene,
  );
  camera.lowerRadiusLimit = 4;
  camera.upperRadiusLimit = 50;
  camera.panningSensibility = 0;
  camera.wheelPrecision = 40;
  camera.attachControl(canvas, true);
  return camera;
};

export const addAmbientLight = (scene: Scene, intensity = 1.0) => {
  const light = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  light.intensity = intensity;
  light.groundColor = Color3.FromHexString(palette.panel);
  light.diffuse = Color3.FromHexString(palette.neon);
  return light;
};
