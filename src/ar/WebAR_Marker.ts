import * as THREE from 'three';
import { mat4, vec3, quat } from 'gl-matrix';
// import { detect } from 'apriltag'  // replace with your lib’s API

type Pose = { position:[number,number,number], quaternion:[number,number,number,number] };

export class WebAR_Marker {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.01, 20);
  renderer: THREE.WebGLRenderer;

  // Video feed
  video = document.createElement('video');
  vCanvas = document.createElement('canvas');
  vCtx = this.vCanvas.getContext('2d')!;

  // Background quad (video)
  bgMesh: THREE.Mesh;

  // Board
  boardMesh?: THREE.Mesh;
  haveBoard = false;

  // Callbacks
  onPlaceBoard?: (pose: Pose) => void;
  onPlaceNote?: (pose: Pose) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.resize();

    const bgGeo = new THREE.PlaneGeometry(2, 2);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.bgMesh = new THREE.Mesh(bgGeo, bgMat);
    this.bgMesh.position.z = -1;
    this.scene.add(this.bgMesh);

    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('click', () => this.handleClick());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    this.video.srcObject = stream;
    await this.video.play();
    this.vCanvas.width = this.video.videoWidth;
    this.vCanvas.height = this.video.videoHeight;

    // Fit background to screen
    const tex = new THREE.VideoTexture(this.video);
    (this.bgMesh.material as THREE.MeshBasicMaterial).map = tex;
    (this.bgMesh.material as THREE.MeshBasicMaterial).map!.needsUpdate = true;

    this.tick();
  }

  private async tick() {
    // 1) Draw current frame into canvas for detection
    this.vCtx.drawImage(this.video, 0, 0, this.vCanvas.width, this.vCanvas.height);

    // 2) Detect AprilTag(s)
    // const detections = detect(frame); // pseudo-code; returns corner points & pose

    // DEMO: fake detection if you haven’t wired apriltag yet
    const detections: any[] = []; // replace with real

    if (detections.length) {

      // 3) Compute pose (R,t) from tag corners (your library may give this directly).
      // Assume library returns a 4x4 model matrix M_tagCam in camera coords.
      // Convert to position + quaternion for Three.js.
      const M = mat4.create(); // <- fill from detection
      const position = vec3.fromValues(M[12], M[13], M[14]);
      const rotation = quat.create();
      quat.fromMat3(rotation, [
        M[0], M[1], M[2],
        M[4], M[5], M[6],
        M[8], M[9], M[10]
      ] as any);

      const pose: Pose = {
        position: [position[0], position[1], position[2]],
        quaternion: [rotation[0], rotation[1], rotation[2], rotation[3]]
      };

      if (!this.haveBoard) {
        this.placeBoard(pose);
        this.onPlaceBoard?.(pose);
      } else {
        // keep board synced to tag (stabilizes AR)
        this.updateBoard(pose);
      }
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.tick());
  }

  private placeBoard(p: Pose) {
    const geo = new THREE.PlaneGeometry(1.2, 0.8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x223244, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
    this.boardMesh = new THREE.Mesh(geo, mat);
    this.updateBoard(p);
    this.scene.add(this.boardMesh);
    this.haveBoard = true;
  }

  private updateBoard(p: Pose) {
    if (!this.boardMesh) return;
    this.boardMesh.position.set(...p.position);
    this.boardMesh.quaternion.set(...p.quaternion);
  }

  // When user taps, drop note at the board center (simple MVP).
  private handleClick() {
    if (!this.haveBoard || !this.boardMesh) return;
    const p: Pose = {
      position: [this.boardMesh.position.x, this.boardMesh.position.y, this.boardMesh.position.z],
      quaternion: [this.boardMesh.quaternion.x, this.boardMesh.quaternion.y, this.boardMesh.quaternion.z, this.boardMesh.quaternion.w]
    };
    this.onPlaceNote?.(p);
  }
}
