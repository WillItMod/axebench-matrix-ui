import React from 'react';
import { Color3, MeshBuilder, StandardMaterial, Vector3, AbstractMesh } from '@babylonjs/core';
import { bootBabylonScene, addAmbientLight, createOrbitCamera } from '../shared/babylon';
import { palette } from '../shared/theme';
import { makeGameComponent } from '../GameShell';
import type { GameModule } from '../types';

type Enemy = {
  mesh: AbstractMesh;
  velocity: Vector3;
};

type Projectile = {
  mesh: AbstractMesh;
  velocity: Vector3;
};

export const startGame = (canvas: HTMLCanvasElement) =>
  bootBabylonScene(canvas, (scene, engine, track) => {
    const camera = createOrbitCamera(scene, canvas, {
      radius: 22,
      alpha: Math.PI / 1.4,
      beta: Math.PI / 3,
      target: new Vector3(0, 0, 0),
    });
    addAmbientLight(scene, 1.15);

    // Ground plane
    const ground = MeshBuilder.CreateGround(
      'ground',
      { width: 40, height: 40, subdivisions: 2 },
      scene,
    );
    const groundMat = new StandardMaterial('groundMat', scene);
    groundMat.diffuseColor = Color3.FromHexString('#0d1a15');
    groundMat.emissiveColor = Color3.FromHexString('#0f251d');
    groundMat.specularColor = Color3.Black();
    ground.material = groundMat;

    // Turret base
    const base = MeshBuilder.CreateCylinder('base', { diameter: 3.5, height: 1.4 }, scene);
    const barrel = MeshBuilder.CreateBox('barrel', { width: 0.6, height: 0.6, depth: 3.2 }, scene);
    base.position.y = 0.7;
    barrel.position.y = 1.5;
    barrel.position.z = 1.8;

    const baseMat = new StandardMaterial('baseMat', scene);
    baseMat.diffuseColor = Color3.FromHexString(palette.panel);
    baseMat.emissiveColor = Color3.FromHexString(palette.neon).scale(0.35);
    base.material = baseMat;
    const barrelMat = new StandardMaterial('barrelMat', scene);
    barrelMat.diffuseColor = Color3.FromHexString('#1a2f28');
    barrelMat.emissiveColor = Color3.FromHexString(palette.cyan).scale(0.6);
    barrel.material = barrelMat;

    const turretPivot = MeshBuilder.CreateBox('pivot', { size: 0.1 }, scene);
    turretPivot.isVisible = false;
    base.setParent(turretPivot);
    barrel.setParent(turretPivot);

    let yaw = 0;
    let pitch = -0.08;
    let score = 0;
    let health = 100;

    const enemies: Enemy[] = [];
    const projectiles: Projectile[] = [];
    let spawnTimer = 0;

    const spawnEnemy = () => {
      const mesh = MeshBuilder.CreateSphere(
        `enemy-${Date.now()}`,
        { diameter: 1.2, segments: 12 },
        scene,
      );
      const mat = new StandardMaterial(`enemyMat-${Date.now()}`, scene);
      mat.emissiveColor = Color3.FromHexString('#ff5555').scale(0.7);
      mesh.material = mat;
      const angle = Math.random() * Math.PI * 2;
      const radius = 16 + Math.random() * 8;
      mesh.position = new Vector3(Math.cos(angle) * radius, 0.6, Math.sin(angle) * radius);
      const dir = mesh.position.scale(-1).normalize();
      enemies.push({ mesh, velocity: dir.scale(0.03 + Math.random() * 0.02) });
    };

    const shoot = () => {
      const proj = MeshBuilder.CreateSphere(
        `proj-${Date.now()}`,
        { diameter: 0.35, segments: 6 },
        scene,
      );
      const mat = new StandardMaterial(`projMat-${Date.now()}`, scene);
      mat.emissiveColor = Color3.FromHexString(palette.neon);
      proj.material = mat;
      proj.position = turretPivot.position.add(
        new Vector3(Math.sin(yaw) * 2.2, 1.5 + Math.sin(pitch) * 0.4, Math.cos(yaw) * 2.2),
      );
      const dir = new Vector3(Math.sin(yaw), Math.sin(pitch), Math.cos(yaw)).normalize();
      projectiles.push({ mesh: proj, velocity: dir.scale(0.6) });
    };

    const handleMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      yaw = nx * Math.PI * 1.2;
      pitch = -0.25 + -ny * 0.5;
    };
    const handleDown = () => shoot();
    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('pointerdown', handleDown);
    track(() => {
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerdown', handleDown);
    });

    const uiText = document.createElement('div');
    uiText.style.position = 'absolute';
    uiText.style.top = '10px';
    uiText.style.left = '12px';
    uiText.style.color = '#9efad7';
    uiText.style.fontFamily = 'JetBrains Mono, monospace';
    uiText.style.fontSize = '12px';
    uiText.style.textShadow = '0 0 8px rgba(46,213,115,0.5)';
    uiText.innerText = 'Score 0 | Health 100';
    canvas.parentElement?.appendChild(uiText);
    track(() => uiText.remove());

    const tick = () => {
      const dt = engine.getDeltaTime() * 0.016;
      spawnTimer += dt;
      if (spawnTimer > 60) {
        spawnTimer = 0;
        spawnEnemy();
      }

      turretPivot.rotation.y = yaw;
      barrel.rotation.x = pitch;

      // Move enemies
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        const e = enemies[i];
        e.mesh.position.addInPlace(e.velocity.scale(dt * 60));
        if (e.mesh.position.length() < 1.8) {
          health = Math.max(0, health - 12);
          e.mesh.dispose();
          enemies.splice(i, 1);
        }
      }

      // Move projectiles & hit detection
      for (let i = projectiles.length - 1; i >= 0; i -= 1) {
        const p = projectiles[i];
        p.mesh.position.addInPlace(p.velocity.scale(dt * 60));
        if (p.mesh.position.length() > 40) {
          p.mesh.dispose();
          projectiles.splice(i, 1);
          continue;
        }
        for (let j = enemies.length - 1; j >= 0; j -= 1) {
          const e = enemies[j];
          if (Vector3.Distance(p.mesh.position, e.mesh.position) < 1.2) {
            score += 5;
            e.mesh.dispose();
            enemies.splice(j, 1);
            p.mesh.dispose();
            projectiles.splice(i, 1);
            break;
          }
        }
      }

      if (health <= 0) {
        health = 100;
        score = 0;
      }

      uiText.innerText = `Score ${score} | Health ${health}`;
    };

    scene.onBeforeRenderObservable.add(tick);
    track(() => scene.onBeforeRenderObservable.removeCallback(tick));

    return () => {
      scene.meshes.slice().forEach((m) => m.dispose());
    };
  });

const Component = makeGameComponent(startGame, {
  title: 'Countermeasure',
  description: 'Rotate turret and neutralize hostile packets before they breach.',
});

const meta: GameModule = {
  id: 'countermeasure',
  title: 'Countermeasure',
  description: 'BabylonJS turret defense with mouse aim, projectiles, and incoming threats.',
  tech: 'babylon',
  startGame,
  Component,
};

export default meta;
