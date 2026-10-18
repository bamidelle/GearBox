import { useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { useAuth } from '../lib/auth'
import { Icon } from '../components/Icons'
import { FIELDS, guessMapping, validateRows, type FieldKey, type Mapping, type RawRow } from '../lib/csvImport'
import { runImport, type ImportSummary } from '../lib/importRunner'
import '../import.css'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 5000
const STEPS = ['Upload', 'Map Columns', 'Review', 'Complete']

function Stepper({ current }: { current: number }) {
  return (
    <ol className="steps">
      {STEPS.map((s, i) => (
        <li key={s} className={i === current ? 'active' : i < current ? 'done' : ''}>
          <span className="num">{i < current ? '\u2713' : i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  )
}

export default function Import() {
  const { shop, session } = useAuth()

  const [step, setStep] = useState(0)
  const [filename, setFilename] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<RawRow[]>([])
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
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
    setStep(0)
    setFilename('')
    setHeaders([])
    setRows([])
    setMapping(null)
    setError(null)
    setSummary(null)
  }

  function parseFile(file: File) {
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
        setStep(1)
      },
      error: (err) => setError(err.message),
    })
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) parseFile(file)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
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
      setStep(3)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="card wide">
      <h1>Import Declined Jobs</h1>
      <p className="muted">Upload a CSV file from your shop system. We&rsquo;ll help you map the columns.</p>
      <Stepper current={step} />
      {error && <p className="error">{error}</p>}

      {step === 0 && (
        <>
          <label
            className={`dropzone${over ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <span className="up">
              <Icon name="upload" size={36} />
            </span>
            <strong>Drag and drop your CSV file here</strong>
            <span className="muted">or tap to browse</span>
            <span className="muted">Supports .csv files up to 5 MB</span>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
          </label>
          <p>
            <a href="/sample-declined-repairs.csv" download>
              Download sample file
            </a>
          </p>
        </>
      )}

      {step === 1 && mapping && (
        <>
          <p>
            <strong>{filename}</strong> &middot; {rows.length} rows
          </p>
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
          <div className="actions">
            <button type="button" className="back" onClick={reset}>
              Back
            </button>
            <button type="button" disabled={missingRequired.length > 0} onClick={() => setStep(2)}>
              Next
            </button>
          </div>
        </>
      )}

      {step === 2 && result && (
        <>
          <p>
            <strong>{result.valid.length}</strong> ready to import,{' '}
            <strong>{new Set(result.issues.map((i) => i.rowNumber)).size}</strong> with errors (skipped).
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

          <div className="actions">
            <button type="button" className="back" disabled={busy} onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" onClick={onImport} disabled={busy || result.valid.length === 0}>
              {busy ? 'Importing...' : `Import ${result.valid.length} repairs`}
            </button>
          </div>
        </>
      )}

      {step === 3 && summary && (
        <>
          <h2>Import complete</h2>
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
            <Link to="/opportunities">View declined jobs</Link>
          </div>
        </>
      )}
    </main>
  )
}
