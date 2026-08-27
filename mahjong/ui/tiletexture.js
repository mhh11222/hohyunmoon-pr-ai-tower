// 3D 패에 붙일 얼굴 텍스처 — 2D와 같은 tileFace() 데이터를 캔버스에 그린다.

import { tileFace } from "./tileface.js";

const IVORY = "#f6f1e4";
const INK = "#1d2321";
const RED = "#b3282d";
const GREEN = "#1f6f43";
const TEAL = "#1b5a72";

const TONE_COLOR = { red: RED, green: GREEN, teal: TEAL, ink: INK, blank: INK };

/** 알갱이 좌표(순수 계산) — 행을 세로로 가운데 정렬해서 편다 */
export function pipLayout(face, w, h) {
  const rows = face.rows || [];
  const unit = Math.min(w, h) * (face.big ? 0.5 : 0.19);
  const gapY = h * 0.055;
  const rowH = unit + gapY;
  const startY = h / 2 - ((rows.length - 1) * rowH) / 2;
  const spots = [];
  rows.forEach((row, r) => {
    const gapX = w * 0.07;
    const rowW = row.length * unit + (row.length - 1) * gapX;
    const startX = w / 2 - rowW / 2 + unit / 2;
    row.forEach((pip, c) => {
      spots.push({ x: startX + c * (unit + gapX), y: startY + r * rowH, size: unit, red: pip.red });
    });
  });
  return spots;
}

/** 패 하나의 얼굴을 2D 캔버스 컨텍스트에 그린다 */
export function drawTileFace(ctx, id, w, h) {
  const face = tileFace(id);
  ctx.fillStyle = IVORY;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(0,0,0,.08)";
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.strokeRect(w * 0.04, h * 0.03, w * 0.92, h * 0.94);

  const color = TONE_COLOR[face.tone] || INK;

  if (face.kind === "dots" || face.kind === "bamboo") {
    for (const spot of pipLayout(face, w, h)) {
      ctx.fillStyle = spot.red ? RED : color;
      if (face.kind === "dots") {
        ctx.beginPath();
        ctx.arc(spot.x, spot.y, spot.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.55)";
        ctx.lineWidth = spot.size * 0.16;
        ctx.stroke();
      } else {
        const bw = spot.size * 0.42;
        const bh = spot.size * 1.15;
        ctx.fillRect(spot.x - bw / 2, spot.y - bh / 2, bw, bh);
      }
    }
    return;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (face.kind === "bird") {
    // 1삭은 새 — 몸통·머리·꼬리를 굵게 그린다
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.55, w * 0.2, h * 0.16, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w * 0.36, h * 0.38, w * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.moveTo(w * 0.26, h * 0.36);
    ctx.lineTo(w * 0.12, h * 0.42);
    ctx.lineTo(w * 0.26, h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.moveTo(w * 0.66, h * 0.6);
    ctx.lineTo(w * 0.9, h * 0.82);
    ctx.lineTo(w * 0.62, h * 0.74);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (face.kind === "zigzag") {
    ctx.fillStyle = GREEN;
    ctx.font = `700 ${h * 0.3}px system-ui, sans-serif`;
    ctx.fillText("W", w * 0.5, h * 0.36);
    ctx.fillText("W", w * 0.5, h * 0.68);
    return;
  }

  if (face.kind === "char") {
    ctx.fillStyle = INK;
    ctx.font = `700 ${h * 0.3}px "Noto Sans KR", system-ui, serif`;
    ctx.fillText(face.glyph, w * 0.5, h * 0.34);
    ctx.font = `700 ${h * 0.26}px "Noto Sans KR", system-ui, serif`;
    ctx.fillText(face.suffix, w * 0.5, h * 0.68);
    return;
  }

  if (face.kind === "blank") {
    ctx.strokeStyle = "rgba(0,0,0,.14)";
    ctx.lineWidth = Math.max(1, w * 0.025);
    ctx.strokeRect(w * 0.24, h * 0.26, w * 0.52, h * 0.48);
    return;
  }

  ctx.fillStyle = color;
  ctx.font = `700 ${h * 0.46}px "Noto Sans KR", system-ui, serif`;
  ctx.fillText(face.glyph, w * 0.5, h * 0.52);
}

/** 캔버스 하나를 만들어 얼굴을 그려 돌려준다 (브라우저 전용) */
export function faceCanvas(id, size = 128) {
  const w = size;
  const h = Math.round(size * 1.38);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  drawTileFace(canvas.getContext("2d"), id, w, h);
  return canvas;
}

/** 주사위 눈 */
export function diceCanvas(value, size = 96) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fbf8f0";
  ctx.fillRect(0, 0, size, size);
  const spots = DICE_SPOTS[value] || [];
  for (const [sx, sy] of spots) {
    ctx.fillStyle = value === 1 || value === 4 ? RED : "#222";
    ctx.beginPath();
    ctx.arc(sx * size, sy * size, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

export const DICE_SPOTS = {
  1: [[0.5, 0.5]],
  2: [[0.3, 0.3], [0.7, 0.7]],
  3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
  4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.3, 0.25], [0.3, 0.5], [0.3, 0.75], [0.7, 0.25], [0.7, 0.5], [0.7, 0.75]],
};
