/// <reference types="webxr" />

import * as THREE from 'three';
import { WebXRScene } from "./ar/WebXRScene";
import { WebAR_Marker as WebXRScene } from "./ar/WebAR_Marker";
export type TapPoseHandler = (pose:{ position:[number,number,number], quaternion:[number,number,number,number] })=>void;

export class WebXRScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();
  reticle: THREE.Mesh;
  boardMesh?: THREE.Mesh;
  haveBoard = false;
  hitSource: XRHitTestSource | null = null;
  refSpace!: XRReferenceSpace;
  onPlaceBoard?: TapPoseHandler;
  onPlaceNote?: TapPoseHandler;

  constructor(canvas: HTMLCanvasElement){
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;

    const geo = new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI/2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff66, opacity:0.9, transparent:true });
    this.reticle = new THREE.Mesh(geo, mat);
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    window.addEventListener('resize', () => this.onResize());
  }

  onResize(){ this.renderer.setSize(window.innerWidth, window.innerHeight); }

  async startAR(){
    if (!('xr' in navigator)) throw new Error('WebXR not supported');
    const session = await (navigator as any).xr.requestSession('immersive-ar', { requiredFeatures:['hit-test'] });
    this.renderer.xr.setReferenceSpaceType('local');
    await this.renderer.xr.setSession(session);

    const refSpace = await (this.renderer.xr.getSession() as any).requestReferenceSpace('local');
    this.refSpace = refSpace;

    const viewerSpace = await (this.renderer.xr.getSession() as any).requestReferenceSpace('viewer');
    this.hitSource = await (this.renderer.xr.getSession() as any).requestHitTestSource({ space: viewerSpace });

    // Tap listener
    (this.renderer.xr.getSession() as XRSession).addEventListener('select', () => this.handleSelect());

    this.renderer.setAnimationLoop((_t, frame: XRFrame | undefined) => this.render(frame));
  }

  private handleSelect(){
    if (!this.reticle.visible) return;
    const p = this.reticle.position; const q = this.reticle.quaternion;
    const pose = { position:[p.x,p.y,p.z] as [number,number,number], quaternion:[q.x,q.y,q.z,q.w] as [number,number,number,number] };
    if (!this.haveBoard) {
      this.placeBoardAt(pose);
      this.onPlaceBoard?.(pose);
      this.haveBoard = true;
    } else {
      this.onPlaceNote?.(pose);
    }
  }

  private placeBoardAt(pose:{position:[number,number,number], quaternion:[number,number,number,number]}){
    // simple semi-transparent plane (1.2m x 0.8m)
    const geo = new THREE.PlaneGeometry(1.2, 0.8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x223244, transparent:true, opacity:0.25, side:THREE.DoubleSide });
    this.boardMesh = new THREE.Mesh(geo, mat);
    this.boardMesh.position.fromArray(pose.position);
    this.boardMesh.quaternion.set(...pose.quaternion);
    this.scene.add(this.boardMesh);
  }

  private render(frame?: XRFrame){
    if (frame && this.hitSource) {
      const hits = frame.getHitTestResults(this.hitSource);
      if (hits.length) {
        const hitPose = hits[0].getPose(this.refSpace)!;
        this.reticle.position.set(hitPose.transform.position.x, hitPose.transform.position.y, hitPose.transform.position.z);
        const q = hitPose.transform.orientation;
        this.reticle.quaternion.set(q.x, q.y, q.z, q.w);
        this.reticle.visible = true;
      } else {
        this.reticle.visible = false;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
