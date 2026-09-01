// 궤도 카메라 컨트롤 — 마우스 드래그/휠, 터치 드래그/핀치. three.js OrbitControls 없이 최소 구현.
// 한 손가락: 회전, 두 손가락: 확대·축소 + 이동, 휠: 확대·축소.

export class Orbit {
  constructor(camera, dom, { target = [0, 0, 0], distance = 3, minDistance = 0.8, maxDistance = 8 } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.target = target.slice();
    this.distance = distance;
    this.minDistance = minDistance;
    this.maxDistance = maxDistance;
    this.azimuth = 0.35;       // 좌우 회전 (rad). 0 = 정면
    this.polar = Math.PI / 2 - 0.15; // 위아래 (rad). π/2 = 눈높이
    this.minPolar = 0.05;
    this.maxPolar = Math.PI - 0.05;
    this.onChange = null;
    this._pointers = new Map();
    this._pinch = null;
    this._bind();
    this.update();
  }

  _bind() {
    const d = this.dom;
    d.style.touchAction = "none";
    d.addEventListener("pointerdown", (e) => {
      d.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      if (this._pointers.size === 2) this._pinch = this._pinchState();
    });
    d.addEventListener("pointermove", (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this._pointers.size === 1) {
        if (p.button === 2 || e.shiftKey) this.pan(dx, dy);
        else this.rotate(dx, dy);
      } else if (this._pointers.size === 2) {
        const s = this._pinchState();
        if (this._pinch) {
          this.zoomBy(this._pinch.dist / Math.max(1, s.dist));
          this.pan(s.cx - this._pinch.cx, s.cy - this._pinch.cy);
        }
        this._pinch = s;
      }
    });
    const up = (e) => {
      this._pointers.delete(e.pointerId);
      this._pinch = this._pointers.size === 2 ? this._pinchState() : null;
    };
    d.addEventListener("pointerup", up);
    d.addEventListener("pointercancel", up);
    d.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(e.deltaY * 0.0015));
    }, { passive: false });
    d.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  _pinchState() {
    const [a, b] = [...this._pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  rotate(dx, dy) {
    const k = (2 * Math.PI) / Math.max(320, this.dom.clientWidth);
    this.azimuth -= dx * k;
    this.polar = Math.max(this.minPolar, Math.min(this.maxPolar, this.polar - dy * k));
    this.update();
  }

  pan(dx, dy) {
    // 화면 픽셀 → 월드 단위 (카메라 거리에 비례)
    const k = this.distance / Math.max(320, this.dom.clientHeight);
    const right = [Math.cos(this.azimuth), 0, -Math.sin(this.azimuth)];
    this.target[0] -= right[0] * dx * k;
    this.target[2] -= right[2] * dx * k;
    this.target[1] += dy * k;
    this.update();
  }

  zoomBy(factor) {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance * factor));
    this.update();
  }

  /** 정면·측면·위 같은 미리 정의된 시점 */
  setView(name) {
    const views = {
      front: [0, Math.PI / 2 - 0.05],
      left: [Math.PI / 2, Math.PI / 2 - 0.05],
      right: [-Math.PI / 2, Math.PI / 2 - 0.05],
      back: [Math.PI, Math.PI / 2 - 0.05],
      top: [0, 0.12],
      iso: [0.6, Math.PI / 2 - 0.35],
    };
    const v = views[name] || views.front;
    this.azimuth = v[0];
    this.polar = v[1];
    this.update();
  }

  /** 좌우 회전각(도). 턴테이블 슬라이더용 */
  setAzimuthDeg(deg) {
    this.azimuth = (deg * Math.PI) / 180;
    this.update();
  }

  azimuthDeg() {
    let d = ((this.azimuth * 180) / Math.PI) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  reset({ target = [0, 0, 0], distance = 3 } = {}) {
    this.target = target.slice();
    this.distance = distance;
    this.setView("iso");
  }

  update() {
    const r = this.distance, t = this.target;
    const sp = Math.sin(this.polar);
    this.camera.position.set(
      t[0] + r * sp * Math.sin(this.azimuth),
      t[1] + r * Math.cos(this.polar),
      t[2] + r * sp * Math.cos(this.azimuth),
    );
    this.camera.lookAt(t[0], t[1], t[2]);
    if (this.onChange) this.onChange();
  }
}
