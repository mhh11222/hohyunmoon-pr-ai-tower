# MediaPipe tasks-vision (자체 호스팅)

- `vision_bundle.mjs`, `wasm/vision_wasm_internal.{js,wasm}` — npm `@mediapipe/tasks-vision@0.10.21` (Apache-2.0).
  SIMD 판만 넣었다(2021년 이후 브라우저 전부 지원). nosimd 판이 필요하면 같은 패키지의 `wasm/vision_wasm_nosimd_internal.*`를 추가.
- `pose_landmarker_lite.task` — https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task (Apache-2.0)

CDN 대신 저장소 안에 두는 이유: CSP를 `script-src 'self'`·`connect-src 'self'`로 잠가
카메라 영상이 기기 밖으로 나갈 경로를 정책 수준에서 없애고, 외부 CDN 변경·장애의 영향을 받지 않기 위해.
