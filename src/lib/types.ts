export const STATUSES = [
  'new',
  'follow_up_scheduled',
  'contacted',
  'customer_interested',
  'appointment_requested',
  'approved',
  'work_completed',
  'paid',
  'declined_again',
  'opted_out',
  'closed',
] as const

export type OpportunityStatus = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  new: 'New',
  follow_up_scheduled: 'Follow-up scheduled',
  contacted: 'Contacted',
  customer_interested: 'Customer interested',
  appointment_requested: 'Appointment requested',
  approved: 'Approved',
  work_completed: 'Work completed',
  paid: 'Paid',
  declined_again: 'Declined again',
  opted_out: 'Opted out',
  closed: 'Closed',
}

// Statuses that still count as recoverable revenue.
export const CLOSED_STATUSES: OpportunityStatus[] = ['paid', 'declined_again', 'opted_out', 'closed']

export function isOpen(status: OpportunityStatus): boolean {
  return !CLOSED_STATUSES.includes(status)
}

export function money(amount: number | null | undefined, currency: string): string {
  if (amount == null) return '-'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString()
}

const PAGE = 1000

// Reads every row of a query by paging (Supabase caps a single response at 1000 rows).
export async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if ((data?.length ?? 0) < PAGE) break
  }
  return out
}
