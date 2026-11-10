// Shared Three.js plumbing: renderer sized to a stage, orbit controls, HTML labels.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Disposer } from '../lib/dom';

export interface Stage3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  width: number;
  height: number;
  labels: LabelLayer;
}

export function createStage3D(host: HTMLElement, d: Disposer, opts: { fov?: number; near?: number; far?: number; logDepth?: boolean } = {}): Stage3D {
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: opts.logDepth ?? false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x03050a, 1);
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 45, 1, opts.near ?? 0.001, opts.far ?? 1e6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomSpeed = 0.9;
  controls.rotateSpeed = 0.6;
  const labels = new LabelLayer(host);
  const st: Stage3D = { renderer, scene, camera, controls, width: 1, height: 1, labels };
  const fit = () => {
    const r = host.getBoundingClientRect();
    st.width = Math.max(1, Math.round(r.width));
    st.height = Math.max(1, Math.round(r.height));
    renderer.setSize(st.width, st.height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = st.width / st.height;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  d.add(() => {
    ro.disconnect();
    controls.dispose();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    labels.el.remove();
  });
  return st;
}

export interface Label {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  visible: boolean;
  /** Only show when the anchor is closer than this many world units to the camera. */
  maxDist?: number;
  minDist?: number;
}

/** HTML labels pinned to 3D positions, with simple overlap culling. */
export class LabelLayer {
  el: HTMLDivElement;
  private items: Label[] = [];
  private v = new THREE.Vector3();
  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'labels';
    host.append(this.el);
  }
  add(text: string, pos: THREE.Vector3, cls = '', onClick?: () => void): Label {
    const el = document.createElement('div');
    el.className = `label3d ${cls}`;
    el.textContent = text;
    if (onClick) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    this.el.append(el);
    const l: Label = { el, pos, visible: true };
    this.items.push(l);
    return l;
  }
  update(camera: THREE.Camera, w: number, h: number): void {
    const boxes: [number, number, number, number][] = [];
    const camPos = camera.position;
    for (const l of this.items) {
      let show = l.visible;
      if (show) {
        const dist = camPos.distanceTo(l.pos);
        if ((l.maxDist !== undefined && dist > l.maxDist) || (l.minDist !== undefined && dist < l.minDist)) show = false;
      }
      if (show) {
        this.v.copy(l.pos).project(camera);
        if (this.v.z > 1 || this.v.z < -1) show = false;
        const x = (this.v.x * 0.5 + 0.5) * w + 8;
        const y = (-this.v.y * 0.5 + 0.5) * h - 9;
        if (show && (x < -50 || x > w || y < -20 || y > h)) show = false;
        if (show) {
          const bw = l.el.offsetWidth || 60;
          const box: [number, number, number, number] = [x, y, x + bw, y + 16];
          if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) show = false;
          else {
            boxes.push(box);
            l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          }
        }
      }
      l.el.hidden = !show;
    }
  }
  clear(): void {
    this.items.forEach((l) => l.el.remove());
    this.items = [];
  }
}

/** Ecliptic (x, y, z) in AU → Three.js world coordinates with the ecliptic north pole up. */
export const eclToWorld = (x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 => out.set(x, z, -y);
