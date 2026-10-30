import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Renderer, m4, orbitEye, project, type DrawItem, type Orbit, type V3 } from './gl';

export interface Label { p: V3; text: string; tone?: 'muted' | 'value' }
export interface SceneFrame { items: DrawItem[]; labels?: Label[] }
export interface Viewport3DHandle { resetCamera(): void }

interface Props {
  build: (r: Renderer, t: number) => SceneFrame;
  initial: Orbit;
  animate: boolean;              // үздіксіз кадр қажет пе (көпіршіктер, айналу)
  ariaLabel: string;
  onFail: () => void;            // WebGL жұмыс істемесе — 2D режимге ауысу
  minDist?: number; maxDist?: number;
  version: unknown;              // күй өзгергенде қайта салу
  className?: string;
}

/** WebGL көрінісі: тінтуір/саусақпен бұру, дөңгелекпен/шымшумен үлкейту, пернетақтамен басқару. */
export const Viewport3D = forwardRef<Viewport3DHandle, Props>(function Viewport3D({ build, initial, animate, ariaLabel, onFail, minDist = 2, maxDist = 14, version, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rRef = useRef<Renderer | null>(null);
  const orbit = useRef<Orbit>({ ...initial, target: [...initial.target] as V3 });
  const buildRef = useRef(build); buildRef.current = build;
  const dirty = useRef(true);
  const visible = useRef(true);
  const [labels, setLabels] = useState<{ x: number; y: number; text: string; tone?: string }[]>([]);
  const t0 = useRef(performance.now());

  useImperativeHandle(ref, () => ({ resetCamera() { orbit.current = { ...initial, target: [...initial.target] as V3 }; dirty.current = true; } }), [initial]);
  useEffect(() => { dirty.current = true; }, [version]);

  useEffect(() => {
    const c = canvasRef.current!; let r: Renderer;
    try { r = new Renderer(c); } catch { onFail(); return; }
    rRef.current = r;
    const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
    let raf = 0, lastLabels = '';
    const onLost = (e: Event) => { e.preventDefault(); onFail(); };
    c.addEventListener('webglcontextlost', onLost);
    const io = new IntersectionObserver(es => { visible.current = es[0].isIntersecting; if (visible.current) dirty.current = true; });
    io.observe(c);
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible.current || document.hidden) return;
      if (!dirty.current && !animateRef.current) return;
      dirty.current = false;
      r.resize(lowPower ? 1.25 : 2);
      const w = c.width, h = c.height;
      const eye = orbitEye(orbit.current);
      const vp = m4.mul(m4.persp(0.75, w / h, 0.05, 60), m4.lookAt(eye, orbit.current.target));
      const t = (performance.now() - t0.current) / 1000;
      let f: SceneFrame;
      try { f = buildRef.current(r, t); } catch (err) { console.error(err); onFail(); return; }
      r.draw(f.items, vp, eye, [0, 0, 0, 0]);
      const cw = c.clientWidth, ch = c.clientHeight;
      const ls = (f.labels || []).map(l => { const [x, y, ok] = project(vp, l.p, cw, ch); return ok ? { x, y, text: l.text, tone: l.tone } : null; }).filter(Boolean) as any[];
      const key = JSON.stringify(ls.map(l => [Math.round(l.x), Math.round(l.y), l.text]));
      if (key !== lastLabels) { lastLabels = key; setLabels(ls); }
    };
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => { dirty.current = true; }); ro.observe(c);
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); c.removeEventListener('webglcontextlost', onLost); r.dispose(); rRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animateRef = useRef(animate); animateRef.current = animate;

  // Басқару
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const rotate = (dx: number, dy: number) => {
    const o = orbit.current; o.theta -= dx * 0.008; o.phi = Math.max(-0.2, Math.min(1.35, o.phi + dy * 0.006)); dirty.current = true;
  };
  const zoom = (k: number) => { const o = orbit.current; o.dist = Math.max(minDist, Math.min(maxDist, o.dist * k)); dirty.current = true; };
  useEffect(() => {
    const c = canvasRef.current!; if (!c) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.08 : 1 / 1.08); };
    c.addEventListener('wheel', wheel, { passive: false });
    return () => c.removeEventListener('wheel', wheel);
  });

  return (
    <div ref={wrapRef} className={'viewport ' + (className || '')}>
      <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={ariaLabel + '. Бұру: тінтуірмен сүйреу немесе бағыт пернелері; үлкейту: дөңгелек немесе + / − пернелері; R — камераны қалпына келтіру.'}
        onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); }}
        onPointerMove={e => {
          const p = ptrs.current.get(e.pointerId); if (!p) return;
          if (ptrs.current.size === 2) {
            ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const [a, b] = [...ptrs.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinch.current) zoom(pinch.current / d); pinch.current = d; return;
          }
          rotate(e.clientX - p.x, e.clientY - p.y); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }}
        onPointerUp={e => { ptrs.current.delete(e.pointerId); pinch.current = 0; }}
        onPointerCancel={e => { ptrs.current.delete(e.pointerId); pinch.current = 0; }}
        onKeyDown={e => {
          const k = e.key;
          if (k === 'ArrowLeft') rotate(-25, 0); else if (k === 'ArrowRight') rotate(25, 0);
          else if (k === 'ArrowUp') rotate(0, 20); else if (k === 'ArrowDown') rotate(0, -20);
          else if (k === '+' || k === '=') zoom(1 / 1.12); else if (k === '-' || k === '_') zoom(1.12);
          else if (k === 'r' || k === 'R' || k === 'к' || k === 'К') { orbit.current = { ...initial, target: [...initial.target] as V3 }; dirty.current = true; }
          else return;
          e.preventDefault();
        }} />
      <div className="vp-labels" aria-hidden="true">
        {labels.map((l, i) => <span key={i} className={'vp-label ' + (l.tone || '')} style={{ transform: `translate(${l.x}px, ${l.y}px) translate(-50%, -50%)` }}>{l.text}</span>)}
      </div>
    </div>
  );
});
