import { supabase } from './supabase'
import type { CleanRow, Mapping, RowIssue } from './csvImport'

export type ImportSummary = {
  importId: string
  totalRows: number
  imported: number
  skippedInvalid: number
  duplicates: number
  newCustomers: number
}

const CHUNK = 500
const PAGE = 1000

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const digits = (s: string | null) => (s ?? '').replace(/\D/g, '')

function customerKey(name: string, email: string | null, phone: string | null): string {
  return email ? `e:${email.toLowerCase()}` : `n:${name.trim().toLowerCase()}|${digits(phone)}`
}

function vehicleKey(customerId: string, r: CleanRow): string | null {
  if (r.vehicle_year == null && !r.vehicle_make && !r.vehicle_model) return null
  return [
    customerId,
    r.vehicle_year ?? '',
    (r.vehicle_make ?? '').toLowerCase(),
    (r.vehicle_model ?? '').toLowerCase(),
  ].join('|')
}

function opportunityKey(customerId: string, description: string, declinedAt: string | null): string {
  return `${customerId}|${description.trim().toLowerCase()}|${declinedAt ?? ''}`
}

function fail(context: string, error: { message: string } | null): asserts error is null {
  if (error) throw new Error(`${context}: ${error.message}`)
}

export async function runImport(args: {
  shopId: string
  userId: string
  currency: string
  filename: string
  mapping: Mapping
  totalRows: number
  valid: CleanRow[]
  issues: RowIssue[]
}): Promise<ImportSummary> {
  const { shopId, userId, currency, filename, mapping, totalRows, valid, issues } = args

  const { data: imp, error: impErr } = await supabase
    .from('imports')
    .insert({
      shop_id: shopId,
      created_by: userId,
      filename,
      status: 'previewed',
      column_mapping: mapping,
      total_rows: totalRows,
    })
    .select('id')
    .single()
  fail('Create import', impErr)
  const importId = imp!.id as string

  try {
    // ---- Customers ----
    const customerIds = new Map<string, string>()

    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, email, phone')
        .eq('shop_id', shopId)
        .range(from, from + PAGE - 1)
      fail('Load customers', error)
      for (const c of data ?? []) customerIds.set(customerKey(c.name, c.email, c.phone), c.id)
      if ((data?.length ?? 0) < PAGE) break
    }

    const newCustomers = new Map<string, CleanRow>()
    for (const r of valid) {
      const key = customerKey(r.customer_name, r.email, r.phone)
      if (!customerIds.has(key) && !newCustomers.has(key)) newCustomers.set(key, r)
    }

    for (const batch of chunks([...newCustomers.values()])) {
      const { data, error } = await supabase
        .from('customers')
        .insert(
          batch.map((r) => ({
            shop_id: shopId,
            name: r.customer_name,
            email: r.email,
            phone: r.phone,
            consent_status: 'unknown' as const,
            consent_source: 'csv_import',
          })),
        )
        .select('id, name, email, phone')
      fail('Create customers', error)
      for (const c of data ?? []) customerIds.set(customerKey(c.name, c.email, c.phone), c.id)
    }

    // ---- Vehicles ----
    const vehicleIds = new Map<string, string>()
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, customer_id, year, make, model')
        .eq('shop_id', shopId)
        .range(from, from + PAGE - 1)
      fail('Load vehicles', error)
      for (const v of data ?? []) {
        vehicleIds.set(
          [v.customer_id, v.year ?? '', (v.make ?? '').toLowerCase(), (v.model ?? '').toLowerCase()].join('|'),
          v.id,
        )
      }
      if ((data?.length ?? 0) < PAGE) break
    }

    const newVehicles = new Map<string, { customer_id: string; r: CleanRow }>()
    for (const r of valid) {
      const cid = customerIds.get(customerKey(r.customer_name, r.email, r.phone))!
      const vk = vehicleKey(cid, r)
      if (vk && !vehicleIds.has(vk) && !newVehicles.has(vk)) newVehicles.set(vk, { customer_id: cid, r })
    }

    for (const batch of chunks([...newVehicles.values()])) {
      const { data, error } = await supabase
        .from('vehicles')
        .insert(
          batch.map(({ customer_id, r }) => ({
            shop_id: shopId,
            customer_id,
            year: r.vehicle_year,
            make: r.vehicle_make,
            model: r.vehicle_model,
          })),
        )
        .select('id, customer_id, year, make, model')
      fail('Create vehicles', error)
      for (const v of data ?? []) {
        vehicleIds.set(
          [v.customer_id, v.year ?? '', (v.make ?? '').toLowerCase(), (v.model ?? '').toLowerCase()].join('|'),
          v.id,
        )
      }
    }

    // ---- Opportunities (skip duplicates) ----
    const existing = new Set<string>()
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('repair_opportunities')
        .select('customer_id, description, declined_at')
        .eq('shop_id', shopId)
        .range(from, from + PAGE - 1)
      fail('Load opportunities', error)
      for (const o of data ?? []) existing.add(opportunityKey(o.customer_id, o.description, o.declined_at))
      if ((data?.length ?? 0) < PAGE) break
    }

    let duplicates = 0
    const toInsert: Record<string, unknown>[] = []
    for (const r of valid) {
      const cid = customerIds.get(customerKey(r.customer_name, r.email, r.phone))!
      const ok = opportunityKey(cid, r.description, r.declined_at)
      if (existing.has(ok)) {
        duplicates++
        continue
      }
      existing.add(ok)
      const vk = vehicleKey(cid, r)
      toInsert.push({
        shop_id: shopId,
        customer_id: cid,
        vehicle_id: vk ? (vehicleIds.get(vk) ?? null) : null,
        import_id: importId,
        description: r.description,
        estimate_amount: r.estimate_amount,
        currency,
        declined_at: r.declined_at,
      })
    }

    for (const batch of chunks(toInsert)) {
      const { error } = await supabase.from('repair_opportunities').insert(batch)
      fail('Create repair opportunities', error)
    }

    // ---- Row errors ----
    for (const batch of chunks(issues)) {
      const { error } = await supabase.from('import_row_errors').insert(
        batch.map((i) => ({
          shop_id: shopId,
          import_id: importId,
          row_number: i.rowNumber,
          field: i.field,
          message: i.message,
          raw_row: i.raw,
        })),
      )
      fail('Save row errors', error)
    }

    const skippedInvalid = new Set(issues.map((i) => i.rowNumber)).size

    const { error: finishErr } = await supabase
      .from('imports')
      .update({
        status: 'confirmed',
        imported_rows: toInsert.length,
        skipped_rows: skippedInvalid,
        duplicate_rows: duplicates,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', importId)
    fail('Finish import', finishErr)

    return {
      importId,
      totalRows,
      imported: toInsert.length,
      skippedInvalid,
      duplicates,
      newCustomers: newCustomers.size,
    }
  } catch (e) {
    await supabase.from('imports').update({ status: 'failed' }).eq('id', importId)
    throw e
  }
}
