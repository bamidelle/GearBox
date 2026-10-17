export const FIELDS = [
  { key: 'customer_name', label: 'Customer name', required: true },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'vehicle_year', label: 'Vehicle year', required: false },
  { key: 'vehicle_make', label: 'Vehicle make', required: false },
  { key: 'vehicle_model', label: 'Vehicle model', required: false },
  { key: 'description', label: 'Declined repair', required: true },
  { key: 'estimate_amount', label: 'Estimate amount', required: false },
  { key: 'declined_at', label: 'Declined date', required: false },
] as const

export type FieldKey = (typeof FIELDS)[number]['key']

// Value is the CSV column header, or '' when unmapped.
export type Mapping = Record<FieldKey, string>

export type RawRow = Record<string, string>

export type CleanRow = {
  rowNumber: number
  customer_name: string
  email: string | null
  phone: string | null
  vehicle_year: number | null
  vehicle_make: string | null
  vehicle_model: string | null
  description: string
  estimate_amount: number | null
  declined_at: string | null // YYYY-MM-DD
}

export type RowIssue = {
  rowNumber: number
  field: FieldKey | null
  message: string
  raw: RawRow
}

const SYNONYMS: Record<FieldKey, string[]> = {
  customer_name: ['customer name', 'customer', 'name', 'client', 'client name', 'owner'],
  email: ['email', 'e-mail', 'email address', 'customer email'],
  phone: ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'tel'],
  vehicle_year: ['year', 'vehicle year', 'veh year', 'model year'],
  vehicle_make: ['make', 'vehicle make', 'veh make'],
  vehicle_model: ['model', 'vehicle model', 'veh model'],
  description: [
    'declined repair',
    'declined work',
    'description',
    'repair',
    'service',
    'work',
    'recommended repair',
    'declined services',
    'declined',
  ],
  estimate_amount: ['estimate', 'estimate amount', 'amount', 'total', 'price', 'quote', 'cost'],
  declined_at: ['declined date', 'declined at', 'date declined', 'date', 'estimate date', 'ro date'],
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ')

export function guessMapping(headers: string[]): Mapping {
  const mapping = {} as Mapping
  const used = new Set<string>()
  for (const f of FIELDS) {
    const found = headers.find((h) => !used.has(h) && SYNONYMS[f.key].includes(norm(h)))
    mapping[f.key] = found ?? ''
    if (found) used.add(found)
  }
  return mapping
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function parseDate(input: string): string | null {
  const s = input.trim()
  let y: number, m: number, d: number
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (match) {
    y = +match[1]
    m = +match[2]
    d = +match[3]
  } else {
    // US style month/day/year
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s)
    if (!match) return null
    m = +match[1]
    d = +match[2]
    y = +match[3]
    if (match[3].length === 2) y += 2000
  }
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '.' || cleaned === '-') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function validateRows(
  rows: RawRow[],
  mapping: Mapping,
): { valid: CleanRow[]; issues: RowIssue[] } {
  const valid: CleanRow[] = []
  const issues: RowIssue[] = []

  rows.forEach((raw, i) => {
    const rowNumber = i + 2 // header is row 1
    const get = (k: FieldKey) => (mapping[k] ? (raw[mapping[k]] ?? '').trim() : '')
    const rowIssues: RowIssue[] = []
    const fail = (field: FieldKey, message: string) =>
      rowIssues.push({ rowNumber, field, message, raw })

    const name = get('customer_name')
    if (!name) fail('customer_name', 'Customer name is required')
    else if (name.length > 200) fail('customer_name', 'Customer name is too long (max 200)')

    const description = get('description')
    if (!description) fail('description', 'Declined repair is required')
    else if (description.length > 2000) fail('description', 'Description is too long (max 2000)')

    const email = get('email')
    if (email && !EMAIL_RE.test(email)) fail('email', `Invalid email: ${email}`)

    let year: number | null = null
    const yearRaw = get('vehicle_year')
    if (yearRaw) {
      const y = Number(yearRaw)
      if (!Number.isInteger(y) || y < 1900 || y > 2100) fail('vehicle_year', `Invalid year: ${yearRaw}`)
      else year = y
    }

    let amount: number | null = null
    const amountRaw = get('estimate_amount')
    if (amountRaw) {
      const a = parseAmount(amountRaw)
      if (a === null || a < 0) fail('estimate_amount', `Invalid amount: ${amountRaw}`)
      else amount = Math.round(a * 100) / 100
    }

    let declinedAt: string | null = null
    const dateRaw = get('declined_at')
    if (dateRaw) {
      declinedAt = parseDate(dateRaw)
      if (!declinedAt) fail('declined_at', `Unrecognized date: ${dateRaw} (use YYYY-MM-DD or MM/DD/YYYY)`)
    }

    if (rowIssues.length) {
      issues.push(...rowIssues)
      return
    }

    valid.push({
      rowNumber,
      customer_name: name,
      email: email ? email.toLowerCase() : null,
      phone: get('phone') || null,
      vehicle_year: year,
      vehicle_make: get('vehicle_make') || null,
      vehicle_model: get('vehicle_model') || null,
      description,
      estimate_amount: amount,
      declined_at: declinedAt,
    })
  })

  return { valid, issues }
}
