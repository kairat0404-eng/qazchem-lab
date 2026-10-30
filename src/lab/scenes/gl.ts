// Жеңіл WebGL рендерері: Блинн-Фонг жарығы, мөлдір шыны, орбиталық камера.
// Ғылыми модельден тәуелсіз: тек дайын көрініс тізімін салады.

export type V3 = [number, number, number];
export type RGBA = [number, number, number, number];
export type M4 = Float32Array;

export const m4 = {
  ident(): M4 { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a: M4, b: M4): M4 {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
    }
    return o;
  },
  persp(fov: number, asp: number, n: number, f: number): M4 {
    const t = 1 / Math.tan(fov / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o;
  },
  lookAt(e: V3, c: V3, up: V3 = [0, 1, 0]): M4 {
    const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x), o = new Float32Array(16);
    o[0] = x[0]; o[4] = x[1]; o[8] = x[2]; o[1] = y[0]; o[5] = y[1]; o[9] = y[2]; o[2] = z[0]; o[6] = z[1]; o[10] = z[2];
    o[12] = -dot(x, e); o[13] = -dot(y, e); o[14] = -dot(z, e); o[15] = 1; return o;
  },
  /** T · Ry · Rz · S */
  trs(p: V3, s: V3 = [1, 1, 1], ry = 0, rz = 0): M4 {
    const cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    // R = Ry * Rz
    const r = [cy * cz, sz, -sy * cz, -cy * sz, cz, sy * sz, sy, 0, cy];
    const o = new Float32Array(16);
    o[0] = r[0] * s[0]; o[1] = r[1] * s[0]; o[2] = r[2] * s[0];
    o[4] = r[3] * s[1]; o[5] = r[4] * s[1]; o[6] = r[5] * s[1];
    o[8] = r[6] * s[2]; o[9] = r[7] * s[2]; o[10] = r[8] * s[2];
    o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1; return o;
  },
  /** Бағыт векторын y осінен v бағытына бұратын матрица (байланыстар үшін). */
  align(p: V3, dir: V3, radius: number): M4 {
    const len = Math.hypot(...dir), y = norm(dir);
    const tmp: V3 = Math.abs(y[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
    const x = norm(cross(tmp, y)), z = cross(x, y), o = new Float32Array(16);
    o[0] = x[0] * radius; o[1] = x[1] * radius; o[2] = x[2] * radius;
    o[4] = y[0] * len; o[5] = y[1] * len; o[6] = y[2] * len;
    o[8] = z[0] * radius; o[9] = z[1] * radius; o[10] = z[2] * radius;
    o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1; return o;
  },
};
export function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function dot(a: V3, b: V3) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function norm(a: V3): V3 { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

export interface Geometry { pos: number[]; nrm: number[]; idx: number[]; lines?: boolean }

/** Айналу денесі: профиль [r, y] нүктелері y осінің айналасында. */
export function lathe(profile: [number, number][], seg = 32, capTop = false, capBottom = false): Geometry {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  const n = profile.length;
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (let j = 0; j < n; j++) {
      const [r, y] = profile[j];
      const pj = profile[Math.max(0, j - 1)], nj = profile[Math.min(n - 1, j + 1)];
      const dr = nj[0] - pj[0], dy = nj[1] - pj[1];
      let nx = dy, ny = -dr; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      pos.push(r * c, y, r * s); nrm.push(nx * c, ny, nx * s);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < n - 1; j++) {
    const a = i * n + j, b = (i + 1) * n + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const cap = (j: number, up: boolean) => {
    const [r, y] = profile[j]; if (r <= 1e-4) return;
    const base = pos.length / 3; pos.push(0, y, 0); nrm.push(0, up ? 1 : -1, 0);
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; pos.push(r * Math.cos(a), y, r * Math.sin(a)); nrm.push(0, up ? 1 : -1, 0); }
    for (let i = 0; i < seg; i++) idx.push(base, base + 1 + i, base + 2 + i);
  };
  if (capTop) cap(n - 1, true);
  if (capBottom) cap(0, false);
  return { pos, nrm, idx };
}

export function sphere(seg = 16, rings = 12): Geometry {
  const p: [number, number][] = [];
  for (let i = 0; i <= rings; i++) { const t = -Math.PI / 2 + i / rings * Math.PI; p.push([Math.cos(t), Math.sin(t)]); }
  return lathe(p, seg);
}
export function cylinder(seg = 20): Geometry { return lathe([[0, 0], [1, 0], [1, 1], [0, 1]], seg); }
export function box(): Geometry {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  const faces: [V3, V3, V3][] = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  for (const [n, u, v] of faces) {
    const b = pos.length / 3;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(n[0] * 0.5 + u[0] * su * 0.5 + v[0] * sv * 0.5, n[1] * 0.5 + u[1] * su * 0.5 + v[1] * sv * 0.5, n[2] * 0.5 + u[2] * su * 0.5 + v[2] * sv * 0.5); nrm.push(...n); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { pos, nrm, idx };
}
export function circleLine(seg = 64): Geometry {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; pos.push(Math.cos(a), 0, Math.sin(a)); nrm.push(0, 1, 0); idx.push(i, (i + 1) % seg); }
  return { pos, nrm, idx, lines: true };
}

export interface Mesh { vb: WebGLBuffer; nb: WebGLBuffer; ib: WebGLBuffer; count: number; lines: boolean }
export interface DrawItem { mesh: Mesh; model: M4; color: RGBA; shine?: number; emissive?: number; glass?: boolean; depth?: number }

const VS = `attribute vec3 aP; attribute vec3 aN; uniform mat4 uM; uniform mat4 uVP; varying vec3 vN; varying vec3 vW;
void main(){ vec4 w = uM * vec4(aP,1.0); vW = w.xyz; vN = mat3(uM) * aN; gl_Position = uVP * w; }`;
const FS = `precision mediump float; varying vec3 vN; varying vec3 vW; uniform vec4 uC; uniform vec3 uL; uniform vec3 uE; uniform float uS; uniform float uEm; uniform float uG;
void main(){ vec3 n = normalize(vN); vec3 v = normalize(uE - vW); if (dot(n, v) < 0.0) n = -n;
 float d = max(dot(n, uL), 0.0); vec3 h = normalize(uL + v); float sp = pow(max(dot(n,h),0.0), 48.0) * uS;
 float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
 vec3 col = uC.rgb * (0.32 + 0.68 * d) + vec3(sp) + uC.rgb * uEm;
 float a = uC.a; if (uG > 0.5) { a = clamp(uC.a + rim * 0.45 + sp * 0.6, 0.0, 0.92); col += vec3(0.55,0.7,0.85) * rim * 0.35; }
 gl_FragColor = vec4(col, a); }`;

export class Renderer {
  gl: WebGLRenderingContext;
  prog: WebGLProgram;
  loc: Record<string, any> = {};
  meshes = new Map<string, Mesh>();
  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('WebGL қолжетімсіз');
    this.gl = gl;
    const sh = (t: number, s: string) => { const o = gl.createShader(t)!; gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) || 'shader'); return o; };
    const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('program');
    this.prog = p; gl.useProgram(p);
    for (const n of ['aP', 'aN']) this.loc[n] = gl.getAttribLocation(p, n);
    for (const n of ['uM', 'uVP', 'uC', 'uL', 'uE', 'uS', 'uEm', 'uG']) this.loc[n] = gl.getUniformLocation(p, n);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  mesh(key: string, make: () => Geometry): Mesh {
    let m = this.meshes.get(key); if (m) return m;
    const g = make(), gl = this.gl;
    const vb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.pos), gl.STATIC_DRAW);
    const nb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.nrm), gl.STATIC_DRAW);
    const ib = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(g.idx), gl.STATIC_DRAW);
    m = { vb, nb, ib, count: g.idx.length, lines: !!g.lines }; this.meshes.set(key, m); return m;
  }
  /** Уақытша (әр кадрда өзгеретін) торды жаңарту — сұйықтық деңгейі үшін. */
  sigs = new Map<string, string>();
  dynamic(key: string, sig: string, make: () => Geometry): Mesh {
    const old = this.meshes.get(key); const gl = this.gl;
    if (old && this.sigs.get(key) === sig) return old;
    if (old) { gl.deleteBuffer(old.vb); gl.deleteBuffer(old.nb); gl.deleteBuffer(old.ib); this.meshes.delete(key); }
    this.sigs.set(key, sig);
    return this.mesh(key, make);
  }
  resize(dprCap: number) {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  draw(items: DrawItem[], vp: M4, eye: V3, clear: RGBA) {
    const gl = this.gl, L = this.loc;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(...clear); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(L.uVP, false, vp); gl.uniform3fv(L.uL, norm([0.5, 0.9, 0.6])); gl.uniform3fv(L.uE, eye);
    const opaque = items.filter(i => i.color[3] >= 0.999 && !i.glass);
    const trans = items.filter(i => !(i.color[3] >= 0.999 && !i.glass)).map(i => {
      const p: V3 = [i.model[12], i.model[13], i.model[14]]; return { i, d: -Math.hypot(...sub(p, eye)) + (i.depth || 0) };
    }).sort((a, b) => a.d - b.d).map(x => x.i);
    const one = (it: DrawItem) => {
      const m = it.mesh;
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.enableVertexAttribArray(L.aP); gl.vertexAttribPointer(L.aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.enableVertexAttribArray(L.aN); gl.vertexAttribPointer(L.aN, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
      gl.uniformMatrix4fv(L.uM, false, it.model); gl.uniform4fv(L.uC, it.color);
      gl.uniform1f(L.uS, it.shine ?? 0.25); gl.uniform1f(L.uEm, it.emissive ?? 0); gl.uniform1f(L.uG, it.glass ? 1 : 0);
      gl.drawElements(m.lines ? gl.LINES : gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    };
    gl.depthMask(true); opaque.forEach(one);
    gl.depthMask(false); trans.forEach(one); gl.depthMask(true);
  }
  dispose() {
    const gl = this.gl;
    this.meshes.forEach(m => { gl.deleteBuffer(m.vb); gl.deleteBuffer(m.nb); gl.deleteBuffer(m.ib); });
    this.meshes.clear(); gl.deleteProgram(this.prog);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

export function webglAvailable(): boolean {
  try { const c = document.createElement('canvas'); const g = c.getContext('webgl'); if (!g) return false; g.getExtension('WEBGL_lose_context')?.loseContext(); return true; } catch { return false; }
}

/** Орбиталық камера күйі. */
export interface Orbit { theta: number; phi: number; dist: number; target: V3 }
export function orbitEye(o: Orbit): V3 {
  return [o.target[0] + o.dist * Math.cos(o.phi) * Math.sin(o.theta), o.target[1] + o.dist * Math.sin(o.phi), o.target[2] + o.dist * Math.cos(o.phi) * Math.cos(o.theta)];
}
export function project(vp: M4, p: V3, w: number, h: number): [number, number, boolean] {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
  const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const ww = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  return [(x / ww * 0.5 + 0.5) * w, (1 - (y / ww * 0.5 + 0.5)) * h, ww > 0];
}
