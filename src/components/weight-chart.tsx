"use client";
import { useId, useState } from "react";
import { displayNumber } from "@/lib/nutrition-input";
export type WeightPoint = { date: string; weightG: number; rollingG: number | null; rollingCount: number };
export function WeightChart({ points, start, end }: { points: WeightPoint[]; start: string; end: string }) {
  const [selected, setSelected] = useState<string | null>(null), title = useId();
  const chosen = points.find(point => point.date === selected) ?? points.at(-1);
  if (!points.length) return <div className="empty"><h3>Još nema mjerenja u ovom razdoblju.</h3><p>Dodaj svoju prvu izmjerenu težinu. Graf neće popunjavati dane bez podataka.</p></div>;
  const min = Math.min(...points.flatMap(p => [p.weightG, p.rollingG ?? p.weightG])), max = Math.max(...points.flatMap(p => [p.weightG, p.rollingG ?? p.weightG]));
  const pad = Math.max(250, (max - min) * .15), bottom = Math.max(0, min - pad), top = max + pad;
  const beginning = Date.parse(`${start}T12:00:00Z`), last = Date.parse(`${end}T12:00:00Z`), span = Math.max(86400000, last - beginning);
  const x = (date: string) => 65 + (Date.parse(`${date}T12:00:00Z`) - beginning) / span * 600;
  const y = (grams: number) => 235 - (grams - bottom) / (top - bottom) * 200;
  const actual = points.map(p => `${x(p.date)},${y(p.weightG)}`).join(" ");
  const rolling = points.filter(p => p.rollingG !== null).map(p => `${x(p.date)},${y(p.rollingG!)}`).join(" ");
  return <div className="weight-chart"><svg viewBox="0 0 700 285" role="img" aria-labelledby={title}><title id={title}>Izmjerena težina i sedmodnevni pomični prosjek. Detalji su dostupni kroz gumbe ispod grafa.</title>{[bottom, (bottom + top) / 2, top].map(value => <g key={value}><line x1="60" x2="675" y1={y(value)} y2={y(value)} className="chart-grid"/><text x="52" y={y(value) + 4} textAnchor="end">{displayNumber(value / 1000, 1)}</text></g>)}<polyline points={actual} className="weight-line"/><polyline points={rolling} className="rolling-line"/>{points.map(point => <circle key={point.date} cx={x(point.date)} cy={y(point.weightG)} r={chosen?.date === point.date ? 6 : 4} className="weight-dot"/>)}<text x="65" y="268">{start}</text><text x="665" y="268" textAnchor="end">{end}</text></svg><p className="muted text-sm">Puna linija: izmjereno. Isprekidana: prosjek dostupnih mjerenja u prethodnih 7 kalendarskih dana. Linije povezuju mjerenja; ne procjenjuju dane bez zapisa.</p><div className="point-controls" aria-label="Odaberi mjerenje">{points.map(point => <button type="button" key={point.date} aria-pressed={chosen?.date === point.date} onClick={() => setSelected(point.date)}>{point.date.slice(5)} · {displayNumber(point.weightG / 1000, 3)} kg</button>)}</div>{chosen && <p className="notice mt-4" role="status">{chosen.date}: {displayNumber(chosen.weightG / 1000, 3)} kg. Pomični prosjek: {chosen.rollingG === null ? "nema podataka" : `${displayNumber(chosen.rollingG / 1000, 3)} kg`} ({chosen.rollingCount} mjerenja).</p>}</div>;
}
