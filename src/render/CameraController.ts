import * as THREE from 'three';

/**
 * Orthographic camera locked to a true-isometric tilt, orbiting around a fixed
 * world-space target. Rotation is constrained to four 90° steps; intermediate
 * angles are interpolated for a smooth snap.
 */
export class CameraController {
  readonly camera: THREE.OrthographicCamera;

  private readonly target: THREE.Vector3;
  private viewTiles: number;

  // True isometric tilt: atan(1/√2) ≈ 35.264°
  private readonly tilt = Math.atan(1 / Math.SQRT2);
  private readonly distance = 40;

  private theta: number;
  private targetTheta: number;

  constructor(target: THREE.Vector3, viewTiles = 20) {
    this.target = target.clone();
    this.viewTiles = viewTiles;
    this.theta = Math.PI / 4;
    this.targetTheta = this.theta;

    const a = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      (-viewTiles / 2) * a,
      (viewTiles / 2) * a,
      viewTiles / 2,
      -viewTiles / 2,
      -100,
      200,
    );
    this.applyTheta();
  }

  rotateLeft()  { this.targetTheta -= Math.PI / 2; }
  rotateRight() { this.targetTheta += Math.PI / 2; }

  /** 0..3, snapping to the nearest cardinal quadrant of the rotation target. */
  get quadrant(): number {
    const q = Math.round((this.targetTheta - Math.PI / 4) / (Math.PI / 2));
    return ((q % 4) + 4) % 4;
  }

  update(dt: number) {
    const k = 1 - Math.exp(-dt * 12);
    this.theta += (this.targetTheta - this.theta) * k;
    if (Math.abs(this.targetTheta - this.theta) < 1e-4) this.theta = this.targetTheta;
    this.applyTheta();
  }

  resize() {
    const a = window.innerWidth / window.innerHeight;
    this.camera.left   = (-this.viewTiles / 2) * a;
    this.camera.right  = ( this.viewTiles / 2) * a;
    this.camera.top    =  this.viewTiles / 2;
    this.camera.bottom = -this.viewTiles / 2;
    this.camera.updateProjectionMatrix();
  }

  private applyTheta() {
    const horiz = Math.cos(this.tilt) * this.distance;
    const vert  = Math.sin(this.tilt) * this.distance;
    this.camera.position.set(
      this.target.x + horiz * Math.cos(this.theta),
      this.target.y + vert,
      this.target.z + horiz * Math.sin(this.theta),
    );
    this.camera.lookAt(this.target);
  }
}
