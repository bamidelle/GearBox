export type BarGroup = { label: string; values: number[] }

export function StackedBars({
  groups,
  colors,
  labels,
}: {
  groups: BarGroup[]
  colors: string[]
  labels: string[]
}) {
  const W = 560
  const H = 220
  const padL = 34
  const padR = 10
  const padT = 12
  const padB = 28

  const totals = groups.map((g) => g.values.reduce((a, b) => a + b, 0))
  const max = Math.max(...totals, 1)
  const slot = (W - padL - padR) / Math.max(groups.length, 1)
  const barW = Math.min(44, slot * 0.6)
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max)

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Declined jobs by outcome and month">
        {[0, max].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e6e8ec" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {groups.map((g, i) => {
          const x = padL + slot * i + (slot - barW) / 2
          let acc = 0
          return (
            <g key={g.label}>
              {g.values.map((v, k) => {
                if (v <= 0) return null
                const top = y(acc + v)
                const h = y(acc) - top
                acc += v
                return <rect key={k} x={x} y={top} width={barW} height={h} fill={colors[k]} />
              })}
              <text x={x + barW / 2} y={H - 8} textAnchor="middle">
                {g.label}
              </text>
            </g>
          )
        })}
      </svg>
      <ul className="legend" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '1rem' }}>
        {labels.map((l, i) => (
          <li key={l}>
            <span className="dot" style={{ background: colors[i] }} />
            {l}
          </li>
        ))}
      </ul>
    </div>
  )
}
