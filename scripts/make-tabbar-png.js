/**
 * scripts/make-tabbar-png.js
 * 微信原生 tabBar 图标仅支持 png/jpg（SVG 会被 app.json 校验拒绝）。
 * 本脚本把 tabBar 图标的矢量设计直接栅格化为 81x81 PNG，纯 Node 实现、无第三方依赖。
 * 用法：node scripts/make-tabbar-png.js
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src', 'assets', 'tabbar');
const SIZE = 81; // 微信建议 tabBar 图标尺寸 81x81
const SS = 3; // 超采样抗锯齿倍数
const VB = 24; // viewBox 边长（图元定义坐标系）
const S = SIZE / VB;

/* ---------- 三次贝塞尔采样 ---------- */
function cubic(p0, p1, p2, p3, n = 20) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ]);
  }
  return pts;
}

/* ---------- 图标定义（viewBox 24 坐标系，沿用原 SVG 设计） ---------- */
const icons = {
  graph: sel => ({
    stroke: sel ? '#7d3c98' : '#999999',
    w: sel ? 2 : 1.5,
    shapes: [
      { t: 'c', x: 6, y: 6, r: 2.5, fill: !!sel },
      { t: 'c', x: 18, y: 8, r: 2.5, fill: !!sel },
      { t: 'c', x: 12, y: 18, r: 2.5, fill: !!sel },
      { t: 's', x1: 8.2, y1: 7.2, x2: 15.8, y2: 7.8 },
      { t: 's', x1: 6.8, y1: 8.4, x2: 11, y2: 15.6 },
      { t: 's', x1: 16.6, y1: 10.4, x2: 13.4, y2: 15.6 }
    ]
  }),
  card: sel => ({
    stroke: sel ? '#7d3c98' : '#999999',
    w: sel ? 2 : 1.5,
    shapes: [
      { t: 'rr', x: 3, y: 5, w: 18, h: 14, r: 2.5 },
      { t: 'c', x: 8.5, y: 10.5, r: 2, fill: !!sel },
      // 肩部：M 8.5 12.8 c -1.4 0 -2.5 1 -2.5 2.2 v .5 h5 v-.5 c 0-1.2-1.1-2.2-2.5-2.2 z
      {
        t: 'p',
        fill: !!sel,
        pts: [
          [8.5, 12.8],
          ...cubic([8.5, 12.8], [7.1, 12.8], [6, 13.8], [6, 15]),
          [6, 15.5],
          [11, 15.5],
          [11, 15],
          ...cubic([11, 15], [11, 12.8], [9.9, 12.8], [8.5, 12.8])
        ]
      },
      { t: 's', x1: 14, y1: 9.5, x2: 18, y2: 9.5 },
      { t: 's', x1: 14, y1: 12.5, x2: 18, y2: 12.5 },
      { t: 's', x1: 14, y1: 15.5, x2: 16.5, y2: 15.5 }
    ]
  }),
  album: sel => ({
    stroke: sel ? '#7d3c98' : '#999999',
    w: sel ? 2 : 1.5,
    shapes: [
      { t: 'rr', x: 3, y: 4, w: 18, h: 16, r: 2.5 },
      { t: 'c', x: 8.5, y: 9, r: 1.5, fill: !!sel },
      { t: 'p', fill: false, pts: [[3.5, 17.5], [9, 12], [13, 16], [16, 13.5], [20.5, 17.5]] }
    ]
  }),
  mine: sel => ({
    stroke: sel ? '#7d3c98' : '#999999',
    w: sel ? 2 : 1.5,
    shapes: [
      { t: 'c', x: 12, y: 8, r: 3.5, fill: !!sel },
      // 肩部：M 4.5 20 C 5.5 16 8.5 14.5 12 14.5 C 15.5 14.5 18.5 16 19.5 20
      {
        t: 'p',
        fill: !!sel,
        pts: [
          [4.5, 20],
          ...cubic([4.5, 20], [5.5, 16], [8.5, 14.5], [12, 14.5]),
          ...cubic([12, 14.5], [15.5, 14.5], [18.5, 16], [19.5, 20])
        ]
      }
    ]
  })
};

/* ---------- 覆盖测试（已缩放到 81px 坐标系） ---------- */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  let t = L2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function roundRectSdf(px, py, x, y, w, h, r) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r);
  const qy = Math.abs(py - cy) - (h / 2 - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ax, ay) - r;
}

function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function hit(px, py, sh, sw) {
  const half = sw / 2;
  switch (sh.t) {
    case 'c': {
      const d = Math.hypot(px - sh.x, py - sh.y);
      return sh.fill ? d <= sh.r : Math.abs(d - sh.r) <= half;
    }
    case 's':
      return segDist(px, py, sh.x1, sh.y1, sh.x2, sh.y2) <= half;
    case 'rr': {
      const d = roundRectSdf(px, py, sh.x, sh.y, sh.w, sh.h, sh.r);
      return sh.fill ? d <= 0 : Math.abs(d) <= half;
    }
    case 'p': {
      if (sh.fill) return pointInPoly(px, py, sh.pts);
      const h2 = half;
      for (let i = 0; i < sh.pts.length - 1; i++) {
        const [x1, y1] = sh.pts[i];
        const [x2, y2] = sh.pts[i + 1];
        if (segDist(px, py, x1, y1, x2, y2) <= h2) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/* ---------- 渲染（超采样 → 单色 mask → PNG） ---------- */
function render(name, sel) {
  const def = icons[name](sel);
  const sw = def.w * S;
  const shapes = def.shapes.map(sh => {
    const o = { ...sh, fill: sh.fill };
    if (sh.t === 'c') {
      o.x = sh.x * S;
      o.y = sh.y * S;
      o.r = sh.r * S;
    } else if (sh.t === 's') {
      o.x1 = sh.x1 * S;
      o.y1 = sh.y1 * S;
      o.x2 = sh.x2 * S;
      o.y2 = sh.y2 * S;
    } else if (sh.t === 'rr') {
      o.x = sh.x * S;
      o.y = sh.y * S;
      o.w = sh.w * S;
      o.h = sh.h * S;
      o.r = sh.r * S;
    } else if (sh.t === 'p') {
      o.pts = sh.pts.map(([x, y]) => [x * S, y * S]);
    }
    return o;
  });

  const [r0, g0, b0] = [
    parseInt(def.stroke.slice(1, 3), 16),
    parseInt(def.stroke.slice(3, 5), 16),
    parseInt(def.stroke.slice(5, 7), 16)
  ];

  const raw = [];
  const sub = 1 / SS;
  for (let y = 0; y < SIZE; y++) {
    const row = Buffer.alloc(1 + SIZE * 4);
    row[0] = 0; // filter: none
    for (let x = 0; x < SIZE; x++) {
      let cnt = 0;
      for (let i = 0; i < SS; i++) {
        for (let j = 0; j < SS; j++) {
          const px = x + i * sub + sub / 2;
          const py = y + j * sub + sub / 2;
          if (shapes.some(sh => hit(px, py, sh, sw))) cnt++;
        }
      }
      const o = 1 + x * 4; // 每行第 0 字节是 filter，像素数据从第 1 字节开始
      const a = Math.round((cnt / (SS * SS)) * 255);
      row[o] = r0;
      row[o + 1] = g0;
      row[o + 2] = b0;
      row[o + 3] = a;
    }
    raw.push(row);
  }
  return encodePng(Buffer.concat(raw), SIZE, SIZE);
}

/* ---------- 最小 PNG 编码器 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([td, data])));
  return Buffer.concat([len, td, data, crc]);
}

function encodePng(rgba, width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = zlib.deflateSync(rgba, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 输出 ---------- */
for (const name of Object.keys(icons)) {
  for (const sel of [false, true]) {
    const file = path.join(OUT, `${name}${sel ? '-selected' : ''}.png`);
    fs.writeFileSync(file, render(name, sel));
    console.log('written:', path.relative(process.cwd(), file));
  }
}
