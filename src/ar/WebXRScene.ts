// src/ar/Web2DScene.ts
import * as THREE from "three";

export class Web2DScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  boardMesh: THREE.Mesh | null = null;

  onPlaceBoard?: () => void;
  onPlaceNote?: (pose: { position:[number,number,number]; quaternion:[number,number,number,number] }) => void;

  private _canvas: HTMLCanvasElement;
  private _root: THREE.Object3D = new THREE.Object3D();
  private _pan = { x: 0, y: 0 };
  private _zoom = 1;

  constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    const viewSize = 2; // world units from center to edge vertically
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect, viewSize * aspect, viewSize, -viewSize, 0.01, 100
    );
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(this._root);

    this._bindEvents();
    this._loop();
  }

  async startAR() {
    // no-op to match WebXRScene API; nothing special needed here
  }

  private _bindEvents() {
    window.addEventListener("resize", () => this._onResize());
    this._onResize();

    // zoom
    this._canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const dz = e.deltaY > 0 ? 1.1 : 1 / 1.1;
      this._zoom = THREE.MathUtils.clamp(this._zoom * dz, 0.3, 5);
      this._updateCamera();
    }, { passive: false });

    // pan (right mouse button)
    let panning = false;
    let lastX = 0, lastY = 0;
    this._canvas.addEventListener("mousedown", (e) => {
      if (e.button === 2) { panning = true; lastX = e.clientX; lastY = e.clientY; }
    });
    window.addEventListener("mousemove", (e) => {
      if (!panning) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;

      const scale = (this.camera.right - this.camera.left) / this._canvas.clientWidth;
      this._pan.x -= dx * scale;
      this._pan.y += dy * scale;
      this._updateCamera();
    });
    window.addEventListener("mouseup", () => { panning = false; });

    // left click: place board if none, else add note at click
    this._canvas.addEventListener("click", (e) => {
      if (e.button !== 0) return;
      const world = this._screenToWorld(e.clientX, e.clientY);
      if (!this.boardMesh) {
        this._spawnBoard(world);
        this.onPlaceBoard?.();
      } else {
        // only if clicking inside the board rectangle
        if (this._pointOnBoard(world)) {
          const q = this.boardMesh.quaternion.clone();
          this.onPlaceNote?.({
            position: [world.x, world.y, 0.01],
            quaternion: [q.x, q.y, q.z, q.w],
          });
        }
      }
    });

    // prevent context menu on canvas
    this._canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private _spawnBoard(center: THREE.Vector3) {
    // 2D board as a flat plane in XY
    const geo = new THREE.PlaneGeometry(2.4, 1.4); // similar to AR board ratio
    const mat = new THREE.MeshBasicMaterial({ color: 0x11151b, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    // face camera (no rotation), but keep a slight Z-forward
    mesh.quaternion.set(0, 0, 0, 1);
    this._root.add(mesh);
    this.boardMesh = mesh;

    // subtle border
    const borderGeo = new THREE.EdgesGeometry(geo);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.9 });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.position.copy(center);
    this._root.add(border);
  }

  private _pointOnBoard(p: THREE.Vector3) {
    if (!this.boardMesh) return false;
    // Board plane is XY at z≈0; transform to board local
    const inv = new THREE.Matrix4().copy(this.boardMesh.matrixWorld).invert();
    const local = p.clone().applyMatrix4(inv);
    // board plane is centered at (0,0) with width 2.4, height 1.4
    return Math.abs(local.x) <= 1.2 && Math.abs(local.y) <= 0.7;
  }

  private _screenToWorld(clientX: number, clientY: number) {
    const rect = this._canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const ndc = new THREE.Vector3(x, y, 0);
    // project to z=0 plane of world (since ortho, it’s linear)
    const world = ndc.unproject(this.camera);
    return world;
  }

  private _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this._updateCamera();
  }

  private _updateCamera() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    const base = 2; // keep same nominal view size as ctor
    const v = base * this._zoom;
    this.camera.left = -v * aspect + this._pan.x;
    this.camera.right = v * aspect + this._pan.x;
    this.camera.top = v + this._pan.y;
    this.camera.bottom = -v + this._pan.y;
    this.camera.updateProjectionMatrix();
  }

  private _loop = () => {
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  };
}
