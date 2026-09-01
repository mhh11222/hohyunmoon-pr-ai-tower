// 카메라 실시간 자세 인식 — 브라우저에서 MediaPipe Pose(tasks-vision)를 돌려 3D 관절을 뽑는다.
// 파이프라인(tools/)과 같은 모델 계열이라 좌표 규약도 같게 맞춘다: [x, -y, -z].
import { BONES } from "../src/skeleton.js";

// 버전을 고정한다: 범위 지정("@0.10")은 CDN이 새 버전을 내놓을 때 동작이 바뀔 수 있다.
const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

/**
 * @param {HTMLVideoElement} video  카메라 화면
 * @param {HTMLCanvasElement} overlay  2D 관절을 그릴 캔버스 (video와 같은 크기)
 * @param {(lm: number[][]|null) => void} onPose  프레임마다 3D 관절(뷰어 좌표) 또는 null
 * @param {(msg: string) => void} onStatus  진행 메시지
 */
export async function startCamera({ video, overlay, onPose, onStatus }) {
  onStatus("자세 인식 모델 불러오는 중…");
  const vision = await import(`${MP}/vision_bundle.mjs`);
  const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  let landmarker;
  try {
    landmarker = await vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
      runningMode: "VIDEO", numPoses: 1,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
  } catch {
    landmarker = await vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate: "CPU" }, runningMode: "VIDEO", numPoses: 1,
    });
  }
  onStatus("카메라 켜는 중…");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
  });
  video.srcObject = stream;
  await video.play();
  onStatus("");

  const ctx = overlay.getContext("2d");
  let running = true, lastTime = -1, fps = 0, frames = 0, fpsAt = performance.now();

  function draw(norm) {
    const w = overlay.width = video.videoWidth || 640, h = overlay.height = video.videoHeight || 480;
    ctx.clearRect(0, 0, w, h);
    if (!norm) return;
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,79,216,.9)"; ctx.fillStyle = "#fff";
    for (const [a, b] of BONES) {
      ctx.beginPath(); ctx.moveTo(norm[a].x * w, norm[a].y * h); ctx.lineTo(norm[b].x * w, norm[b].y * h); ctx.stroke();
    }
    for (const p of norm) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2); ctx.fill(); }
  }

  function loop() {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      let res = null;
      try { res = landmarker.detectForVideo(video, performance.now()); } catch (e) { console.warn(e); }
      const world = res?.worldLandmarks?.[0];
      if (world) {
        onPose(world.map((p) => [p.x, -p.y, -p.z]));
        draw(res.landmarks[0]);
      } else { onPose(null); draw(null); }
      frames++;
      const now = performance.now();
      if (now - fpsAt > 1000) { fps = frames * 1000 / (now - fpsAt); frames = 0; fpsAt = now; }
    }
    requestAnimationFrame(loop);
  }
  loop();

  return {
    get fps() { return fps; },
    stop() {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      try { landmarker.close(); } catch { /* 무시 */ }
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    },
  };
}
