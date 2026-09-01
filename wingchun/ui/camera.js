// 카메라 실시간 자세 인식 — 브라우저에서 MediaPipe Pose(tasks-vision)를 돌려 3D 관절을 뽑는다.
// 파이프라인(tools/)과 같은 모델 계열이라 좌표 규약도 같게 맞춘다: [x, -y, -z].
import { BONES } from "../src/skeleton.js";

// 라이브러리·WASM·모델을 저장소 안(vendor/mediapipe, 0.10.21 고정)에서 불러온다 — 외부 CDN 없음, CSP 'self'만으로 동작.
const MP = new URL("../vendor/mediapipe/", import.meta.url).href.replace(/\/$/, "");
const MODEL = `${MP}/pose_landmarker_lite.task`;

// 라이브러리·모델은 한 번만 내려받아 페이지가 살아 있는 동안 재사용한다 (껐다 켜도 다시 받지 않음)
let landmarkerPromise = null;
async function loadLandmarker(onStatus) {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    onStatus("자세 인식 모델 불러오는 중…");
    const vision = await import(`${MP}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "VIDEO", numPoses: 1,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { return await vision.PoseLandmarker.createFromOptions(files, opts("GPU")); }
    catch { return await vision.PoseLandmarker.createFromOptions(files, opts("CPU")); }
  })();
  landmarkerPromise = landmarkerPromise.catch((e) => { landmarkerPromise = null; e.phase = "model"; throw e; }); // 실패하면 다음에 다시 시도
  return landmarkerPromise;
}

/**
 * @param {HTMLVideoElement} video  카메라 화면
 * @param {HTMLCanvasElement} overlay  2D 관절을 그릴 캔버스 (video와 같은 크기)
 * @param {(lm: number[][]|null) => void} onPose  프레임마다 3D 관절(뷰어 좌표) 또는 null
 * @param {(msg: string) => void} onStatus  진행 메시지
 */
export async function startCamera({ video, overlay, onPose, onStatus, onEnded }) {
  const landmarker = await loadLandmarker(onStatus);
  onStatus("카메라 켜는 중…");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
  });
  video.srcObject = stream;
  await video.play();
  onStatus("");
  // 캔버스 크기는 한 번만 맞춘다 (매 프레임 width 대입은 캔버스를 매번 비운다)
  overlay.width = video.videoWidth || 640; overlay.height = video.videoHeight || 480;
  // 다른 앱이 카메라를 가져가거나 사용자가 권한을 끄면 알려서 화면을 정리한다
  const track = stream.getVideoTracks()[0];
  if (track) track.addEventListener("ended", () => { if (running) { running = false; onEnded?.(); } });

  const ctx = overlay.getContext("2d");
  let running = true, lastTime = -1;

  function draw(norm) {
    const w = overlay.width, h = overlay.height;
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
    }
    requestAnimationFrame(loop);
  }
  loop();

  return {
    stop() {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    },
  };
}
