import * as THREE from "three";

export class Web2DScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.01, 100);
  boardMesh?: THREE.Mesh;

  onPlaceBoard?: () => void;
  onPlaceNote?: (pose: { position:[number,number,number], quaternion:[number,number,number,number] }) => void;

  constructor(public canvas: HTMLCanvasElement){
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.camera.position.set(0, 0.6, 1.5);
    const light = new THREE.HemisphereLight(0xffffff, 0x222233, 1.0);
    this.scene.add(light);

    // simple board plane (1.2 x 0.8)
    const geo = new THREE.PlaneGeometry(1.2, 0.8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 1, metalness: 0 });
    this.boardMesh = new THREE.Mesh(geo, mat);
    this.boardMesh.rotation.x = -Math.PI/6;
    this.boardMesh.position.set(0, 0.3, 0);
    this.scene.add(this.boardMesh);
    this.onPlaceBoard?.();

    window.addEventListener("resize", () => this.onResize());
    this.loop();
  }

  onResize(){
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth/window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  async start() {/* no-op for 2D */}
  loop = () => {
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };
}
