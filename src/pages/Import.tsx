import { useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { useAuth } from '../lib/auth'
import { FIELDS, guessMapping, validateRows, type FieldKey, type Mapping, type RawRow } from '../lib/csvImport'
import { runImport, type ImportSummary } from '../lib/importRunner'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 5000

export default function Import() {
  const { shop, session } = useAuth()

  const [filename, setFilename] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<RawRow[]>([])
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  const result = useMemo(
    () => (mapping && rows.length ? validateRows(rows, mapping) : null),
    [rows, mapping],
  )

  const missingRequired = mapping
    ? FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label)
    : []

  function reset() {
    setFilename('')
    setHeaders([])
    setRows([])
    setMapping(null)
    setError(null)
    setSummary(null)
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setSummary(null)

    if (file.size > MAX_BYTES) {
      setError('File is too large (max 5 MB).')
      return
    }

    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const fields = (res.meta.fields ?? []).filter(Boolean)
        if (!fields.length || !res.data.length) {
          setError('No rows found. Make sure the first row has column names.')
          return
        }
        if (res.data.length > MAX_ROWS) {
          setError(`Too many rows (max ${MAX_ROWS}). Split the file and import in parts.`)
          return
        }
        setFilename(file.name)
        setHeaders(fields)
        setRows(res.data)
        setMapping(guessMapping(fields))
      },
      error: (err) => setError(err.message),
    })
  }

  async function onImport() {
    if (!shop || !session || !mapping || !result) return
    setBusy(true)
    setError(null)
    try {
      const s = await runImport({
        shopId: shop.id,
        userId: session.user.id,
        currency: shop.currency,
        filename,
        mapping,
        totalRows: rows.length,
        valid: result.valid,
        issues: result.issues,
      })
      setSummary(s)
      setRows([])
      setMapping(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  if (summary) {
    return (
      <main className="card wide">
        <h1>Import complete</h1>
        <ul>
          <li>{summary.imported} repairs imported</li>
          <li>{summary.newCustomers} new customers</li>
          <li>{summary.duplicates} duplicates skipped</li>
          <li>{summary.skippedInvalid} rows skipped (errors)</li>
        </ul>
        <div className="row">
          <button type="button" onClick={reset}>
            Import another file
          </button>
          <Link to="/">Back to dashboard</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="card wide">
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Import declined repairs</h1>
      <p className="muted">
        Upload a CSV with one declined repair per row.{' '}
        <a href="/sample-declined-repairs.csv" download>
          Download a sample
        </a>
      </p>

      {!mapping && (
        <label>
          CSV file
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </label>
      )}

      {error && <p className="error">{error}</p>}

      {mapping && (
        <>
          <p>
            <strong>{filename}</strong> &middot; {rows.length} rows{' '}
            <button type="button" className="link" onClick={reset}>
              Choose a different file
            </button>
          </p>

          <h2>Match your columns</h2>
          <div className="grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.required ? ' *' : ''}
                <select
                  value={mapping[f.key]}
                  onChange={(e) => setMapping({ ...mapping, [f.key as FieldKey]: e.target.value })}
                >
                  <option value="">{f.required ? 'Select column' : 'Not in file'}</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {missingRequired.length > 0 && (
            <p className="error">Map required columns: {missingRequired.join(', ')}</p>
          )}

          {result && missingRequired.length === 0 && (
            <>
              <h2>Preview</h2>
              <p>
                <strong>{result.valid.length}</strong> ready to import,{' '}
                <strong>{new Set(result.issues.map((i) => i.rowNumber)).size}</strong> with errors
                (skipped).
              </p>

              {result.valid.length > 0 && (
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Customer</th>
                        <th>Vehicle</th>
                        <th>Repair</th>
                        <th>Estimate</th>
                        <th>Declined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.valid.slice(0, 5).map((r) => (
                        <tr key={r.rowNumber}>
                          <td>{r.rowNumber}</td>
                          <td>{r.customer_name}</td>
                          <td>{[r.vehicle_year, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ')}</td>
                          <td>{r.description}</td>
                          <td>{r.estimate_amount ?? ''}</td>
                          <td>{r.declined_at ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.issues.length > 0 && (
                <>
                  <h2>Rows with errors</h2>
                  <ul className="issues">
                    {result.issues.slice(0, 10).map((i, idx) => (
                      <li key={idx}>
                        Row {i.rowNumber}: {i.message}
                      </li>
                    ))}
                    {result.issues.length > 10 && <li>...and {result.issues.length - 10} more</li>}
                  </ul>
                </>
              )}

              <button type="button" onClick={onImport} disabled={busy || result.valid.length === 0}>
                {busy ? 'Importing...' : `Import ${result.valid.length} repairs`}
              </button>
            </>
          )}
        </>
      )}
    </main>
  )
}
