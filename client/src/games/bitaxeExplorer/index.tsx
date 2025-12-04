import React from 'react';
import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  HighlightLayer,
  AbstractMesh,
  Scene,
} from '@babylonjs/core';
import { bootBabylonScene, addAmbientLight, createOrbitCamera } from '../shared/babylon';
import { palette } from '../shared/theme';
import { makeGameComponent } from '../GameShell';
import type { GameModule } from '../types';

type Hotspot = { mesh: AbstractMesh; label: string };

const buildMiner = (scene: Scene) => {
  const body = MeshBuilder.CreateBox('body', { width: 8, height: 2.2, depth: 4 }, scene);
  const frameMat = new StandardMaterial('frameMat', scene);
  frameMat.diffuseColor = Color3.FromHexString('#0e1418');
  frameMat.emissiveColor = Color3.FromHexString(palette.neon).scale(0.2);
  body.material = frameMat;

  const psu = MeshBuilder.CreateBox('psu', { width: 2.4, height: 1.8, depth: 3.6 }, scene);
  psu.position = new Vector3(-2.6, 0, 0);
  const psuMat = new StandardMaterial('psuMat', scene);
  psuMat.diffuseColor = Color3.FromHexString('#1a2f28');
  psuMat.emissiveColor = Color3.FromHexString(palette.cyan).scale(0.4);
  psu.material = psuMat;

  const board = MeshBuilder.CreateBox('board', { width: 3.8, height: 0.4, depth: 3.6 }, scene);
  board.position = new Vector3(1, -0.8, 0);
  const boardMat = new StandardMaterial('boardMat', scene);
  boardMat.diffuseColor = Color3.FromHexString('#0c1a12');
  boardMat.emissiveColor = Color3.FromHexString(palette.neon).scale(0.35);
  board.material = boardMat;

  const fan = MeshBuilder.CreateCylinder('fan', { diameter: 2.6, height: 0.5, tessellation: 32 }, scene);
  fan.rotation.z = Math.PI / 2;
  fan.position = new Vector3(3.2, 0.8, 0);
  const fanMat = new StandardMaterial('fanMat', scene);
  fanMat.diffuseColor = Color3.FromHexString('#111c1a');
  fanMat.emissiveColor = Color3.FromHexString(palette.amber).scale(0.6);
  fan.material = fanMat;

  const casing = MeshBuilder.CreateBox('casing', { width: 8.4, height: 2.6, depth: 4.4 }, scene);
  casing.material = new StandardMaterial('casingMat', scene);
  (casing.material as StandardMaterial).alpha = 0.05;
  casing.isPickable = false;

  return { body, psu, board, fan, casing };
};

export const startGame = (canvas: HTMLCanvasElement) =>
  bootBabylonScene(canvas, (scene, _engine, track) => {
    const camera = createOrbitCamera(scene, canvas, {
      radius: 16,
      alpha: Math.PI / 4,
      beta: Math.PI / 3,
      target: new Vector3(0, 0, 0),
    });
    camera.lowerBetaLimit = Math.PI / 4;
    camera.upperBetaLimit = Math.PI / 1.6;
    addAmbientLight(scene, 1.2);

    const hl = new HighlightLayer('hl', scene);
    track(() => hl.dispose());

    const miner = buildMiner(scene);
    const hotspots: Hotspot[] = [
      { mesh: miner.psu, label: 'PSU: Regulates and feeds the board power rails.' },
      { mesh: miner.board, label: 'Control Board: Oversees ASICs and telemetry.' },
      { mesh: miner.fan, label: 'Cooling Fan: Exhausts thermal load to keep hash stable.' },
    ];

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.left = '12px';
    overlay.style.bottom = '12px';
    overlay.style.color = '#9efad7';
    overlay.style.fontFamily = 'JetBrains Mono, monospace';
    overlay.style.fontSize = '12px';
    overlay.style.padding = '8px 10px';
    overlay.style.background = 'rgba(4,12,10,0.55)';
    overlay.style.border = '1px solid rgba(46,213,115,0.4)';
    overlay.style.borderRadius = '10px';
    overlay.textContent = 'Rotate / zoom to inspect. Click parts for intel.';
    canvas.parentElement?.appendChild(overlay);
    track(() => overlay.remove());

    let lastLabel = overlay.textContent;
    const showLabel = (text: string) => {
      lastLabel = text;
      overlay.textContent = text;
    };

    const obs = scene.onPointerObservable.add((pointerInfo) => {
      if (!pointerInfo.pickInfo?.hit || !pointerInfo.pickInfo.pickedMesh) {
        showLabel(lastLabel ?? '');
        return;
      }
      const mesh = pointerInfo.pickInfo.pickedMesh;
      const hotspot = hotspots.find((h) => h.mesh === mesh);
      if (hotspot) {
        showLabel(hotspot.label);
        hl.removeAllMeshes();
        hl.addMesh(mesh, Color3.FromHexString(palette.neon));
      }
    });
    track(() => scene.onPointerObservable.remove(obs));

    return () => {
      scene.meshes.slice().forEach((m) => m.dispose());
    };
  });

const Component = makeGameComponent(startGame, {
  title: 'Bitaxe 3D Explorer',
  description: 'Orbit, zoom, and inspect a stylized Bitaxe rig with clickable hotspots.',
});

const meta: GameModule = {
  id: 'bitaxe-explorer',
  title: 'Bitaxe 3D Explorer',
  description: 'BabylonJS viewer with orbit controls and component highlights.',
  tech: 'babylon',
  startGame,
  Component,
};

export default meta;
