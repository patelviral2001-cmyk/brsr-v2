"use client";

interface ScorecardData {
  environment: number;
  social: number;
  governance: number;
  climate: number;
  waterWaste: number;
}

export function SupplierScorecardRadar({ data, size = 220, color = "#047857" }: { data: ScorecardData; size?: number; color?: string }) {
  const labels = [
    { key: "environment", label: "Env." },
    { key: "social", label: "Social" },
    { key: "governance", label: "Gov." },
    { key: "climate", label: "Climate" },
    { key: "waterWaste", label: "Water/Waste" },
  ];
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 26;
  const angleStep = (Math.PI * 2) / labels.length;
  const polar = (i: number, val: number) => {
    const angle = i * angleStep - Math.PI / 2;
    const radius = r * ((val ?? 0) / 100);
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  };

  const dataRec = (data ?? {}) as unknown as Record<string, number>;
  const points = labels.map((l, i) => polar(i, dataRec[l.key] ?? 0)).map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
      {[0.2, 0.4, 0.6, 0.8, 1].map((scale) => (
        <polygon
          key={scale}
          points={labels.map((_, i) => {
            const angle = i * angleStep - Math.PI / 2;
            return `${cx + Math.cos(angle) * r * scale},${cy + Math.sin(angle) * r * scale}`;
          }).join(" ")}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {labels.map((l, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const lx = cx + Math.cos(angle) * (r + 14);
        const ly = cy + Math.sin(angle) * (r + 14);
        return (
          <text key={l.key} x={lx} y={ly} fontSize="10" textAnchor="middle" dominantBaseline="middle" fill="#64748b">{l.label}</text>
        );
      })}
      <polygon points={points} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={1.8} />
      {labels.map((l, i) => {
        const [x, y] = polar(i, dataRec[l.key] ?? 0);
        return <circle key={i} cx={x} cy={y} r={3} fill={color} stroke="#fff" strokeWidth={1.5} />;
      })}
    </svg>
  );
}
