export type Segment = { label: string; count: number; color: string }

export function TrendChart({
  points,
  currency,
}: {
  points: { label: string; value: number }[]
  currency: string
}) {
  const W = 560
  const H = 220
  const padL = 54
  const padR = 14
  const padT = 14
  const padB = 28

  const max = Math.max(...points.map((p) => p.value), 1)
  const step = Math.pow(10, Math.floor(Math.log10(max))) / 2
  const top = Math.ceil(max / step) * step

  const x = (i: number) =>
    padL + (W - padL - padR) * (points.length === 1 ? 0.5 : i / (points.length - 1))
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`

  const fmt = (v: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(v)
    } catch {
      return String(v)
    }
  }

  const ticks = [0, top / 2, top]

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Recovered revenue over time">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e6e8ec" />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end">
            {fmt(t)}
          </text>
        </g>
      ))}
      <path d={area} fill="rgba(242,106,27,0.14)" />
      <path d={line} fill="none" stroke="#f26a1b" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.label + i}>
          <circle cx={x(i)} cy={y(p.value)} r="3.5" fill="#f26a1b" />
          <text x={x(i)} y={H - 8} textAnchor="middle">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function Donut({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((a, s) => a + s.count, 0)
  const r = 40
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 100 100" role="img" aria-label="Job outcomes">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#eef0f3" strokeWidth="14" />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.count / total) * c
            const el = (
              <circle
                key={s.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="14"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
              />
            )
            offset += len
            return el
          })}
        <text x="50" y="52" textAnchor="middle" fontSize="18" fontWeight="800" fill="#14181f">
          {total}
        </text>
        <text x="50" y="64" textAnchor="middle" fontSize="7" fill="#6b7280">
          Total
        </text>
      </svg>
      <ul className="legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="dot" style={{ background: s.color }} />
            {s.label}: <strong>{s.count}</strong>
            {total > 0 && <span className="muted"> ({((s.count / total) * 100).toFixed(0)}%)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
