import * as THREE from "three";

/** Builds a Plane representing the board's surface in world space. */
export function boardToWorldPlane(boardMesh: THREE.Mesh) {
  // Board plane is its local +Z normal rotated into world space
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(boardMesh.quaternion).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, boardMesh.position.clone());
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, boardMesh.position);
}

/** Raycast from screen NDC to world and intersect with the board plane. Returns world point or null. */
export function intersectBoardPlane(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  ndc: { x: number; y: number },
  boardMesh: THREE.Mesh
) {
  const plane = boardToWorldPlane(boardMesh);
  raycaster.setFromCamera(ndc, camera);
  const point = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(plane, point);
  return hit ? point.clone() : null;
}
