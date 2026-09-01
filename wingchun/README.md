# 영춘권 자세 가이드 (`/wingchun/`)

기본 연속동작 영상을 프레임 단위로 쪼개 3D 관절 좌표를 뽑고, 책의 자세 사진과 맞춰서
**3D 인체로 재생·정지·회전·확대**하며 배우는 학습 프로그램입니다.

- 연속 재생 / 자세 고정 / **전환만 보기**(전 자세 → 다음 자세 구간만 반복)
- 드래그로 3D 회전, 두 손가락(휠)으로 확대, 회전 슬라이더로 정확한 각도의 시점
- 자세마다 이름(한글·한자), 책 사진, 설명, 요령
- **관절 각도표**: 팔꿈치·어깨·손목·무릎 각, 팔뚝 기울기, 중심선(中線) 대비 각, 팔꿈치가 중심선에서 떨어진 거리
- 책 사진에서 인식한 자세와 **지금 자세의 차이**를 각도별로 색으로 표시, 반투명으로 겹쳐 보기
- 전환 카드: "왼팔꿈치 92° → 165° (73° 펴기)"처럼 무엇이 얼마나 움직이는지 자동 설명
- 조그 휠·화살표 키로 한 프레임씩

빌드 없이 정적 파일로 돕니다. 지금 `data/sequence.js`에는 책 『영춘권 기본동작(1)』 01~40번
사진에서 인식한 자세를 보간한 데이터가 들어 있습니다(`tools/book_only.py`). 영상을 아래
파이프라인으로 처리하면 실제 움직임 데이터로 바뀝니다. `data/demo.js`는 테스트용 손제작 예시입니다.

## 실행

```bash
# 저장소 루트에서
python3 -m http.server 8080
# http://localhost:8080/wingchun/
```

## 본인 영상 + 책 사진으로 만들기

```
wingchun/
  book/        ← 책 자세 사진을 동작 순서대로 01.jpg, 02.jpg … 로 넣는다
  poses.json   ← 자세 이름·설명 (poses.example.json 참고) — 없어도 됨
  tools/       ← 파이프라인
```

### 0. 준비 (한 번만)

```bash
cd wingchun
python3 -m venv .venv && source .venv/bin/activate     # 선택
pip install -r tools/requirements.txt
```

리눅스에서 `libEGL.so.1` / `libGLESv2.so.2` 오류가 나면 `sudo apt install libegl1 libgles2`.
포즈 모델(약 30MB)은 처음 실행 때 `tools/models/`에 자동으로 내려받습니다.

### 1. 영상 → 프레임 + 관절 좌표

```bash
python3 tools/extract_poses.py 내영상.mp4 --work work --fps 15
```

- `work/frames/` 잘라 저장한 프레임, `work/frames_pose/` 관절을 그린 프레임(인식 확인용)
- `work/landmarks.json` 프레임별 3D 관절 33개, `work/holds.json` 자동으로 찾은 정지 구간(=자세 후보)
- 정지 구간이 너무 많거나 적으면 `--hold-speed 0.12`(m/s), `--hold-min 0.5`(초)로 조절

### 2. 책 사진 → 자세 인식 → 영상 구간에 매칭

```bash
python3 tools/match_book.py --work work --book book --poses poses.json
```

책 사진 각각에서 3D 자세를 인식하고, 영상의 정지 구간들과 **순서를 지키며** 가장 닮은 구간에
붙입니다(단조 DP). 영상이 쉬지 않고 이어져 정지 구간이 사진보다 훨씬 적으면 자동으로
**전체 프레임 시간순 정렬**(DTW식 단조 DP, 자세 거리 + 움직임 속도 페널티)로 바꿔 사진마다
가장 닮은 시점을 찾습니다(`--dtw`로 강제, `--min-gap`·`--half`로 간격·창 폭 조절).
결과 `work/poses.json`을 열어 이름·구간이 맞는지 보고 필요하면 `key`/`start`/`end`를 고칩니다.
사진에 전신이 없어 인식이 안 되면 사진 순서대로 남는 구간에 배정됩니다.

### 3. 뷰어 데이터 만들기

```bash
python3 tools/build_sequence.py --work work --out data/sequence.js --title "소념두 1단"
```

`data/sequence.js`가 교체되고 책 사진이 `book/`으로 복사됩니다. 브라우저를 새로고침하면 끝.

### 영상 없이 책 사진만으로 먼저 보기

```bash
python3 tools/book_only.py --poses poses.json --book book --out data/sequence.js --title "영춘권 기본동작(1)"
```

사진마다 자세를 인식하고 자세 사이를 보간해 연속동작처럼 만듭니다. 이름·사진·각도 확인용이며
전환 동작은 실제 움직임이 아니라 직선 보간입니다.

### 데모 데이터

```bash
python3 tools/make_demo.py                       # data/demo.js (테스트용)
python3 tools/make_demo.py --out data/sequence.js  # 뷰어에서 데모 보기
```

## 데이터 형식 (`data/sequence.js`)

```js
export const sequence = {
  title, subtitle, fps, source,
  frames: [{ t: 0.0, lm: [[x, y, z] × 33] }, …],   // MediaPipe Pose 33 관절, m 단위
  poses: [{
    id, name, zh, desc, cues: [], transition,       // 책 내용
    image: "book/01.jpg",                           // 책 사진
    ref: [[x, y, z] × 33] | null,                   // 책 사진에서 인식한 자세
    start, end, key,                                // 영상 구간(초)과 대표 시각
  }, …],
};
```

좌표계: 원점 골반 중심, +x 본인의 왼쪽, +y 위, +z 본인의 앞. 각도는 몸 기준틀로 계산하므로
카메라가 비스듬해도 값이 흔들리지 않습니다.

## 구조

```
index.html          화면
ui/app.js           상태·조작·카드·각도표
ui/figure3d.js      three.js 인체 (관절 구 + 뼈 원기둥, 유령/기준 자세, 각도 호)
ui/controls.js      궤도 카메라 (드래그·휠·핀치)
src/skeleton.js     관절 33개·뼈 연결 정의
src/angles.js       관절 각도·몸 기준틀·전환 설명 (순수 함수)
src/sequence.js     보간·정지 구간 분할·자세 정규화/비교·책 사진 매칭 (순수 함수)
data/sequence.js    데이터 (생성 파일)
tools/*.py          영상·사진 처리 파이프라인 (MediaPipe Pose + OpenCV)
tests/              vitest — src/ 와 데모 데이터
```

테스트: 저장소 루트에서 `npx vitest run wingchun`.

## 한계

- 단안 영상의 3D 추정이라 깊이(앞뒤) 값은 좌우·상하보다 오차가 큽니다. 각도표의 팔꿈치·무릎 각은
  비교적 정확하고, 중심선 거리·팔뚝 기울기는 참고치로 보세요.
- 손가락 모양(장·권·탄·복)은 손목·검지·새끼·엄지 4점으로만 표현됩니다.
- 책 사진이 상반신만 있으면 인식이 안 될 수 있습니다. 그 경우 순서로만 붙습니다.
