import { supabase } from './supabase'
import type { OpportunityStatus } from './types'

type Sample = {
  name: string
  vehicle: [number, string, string]
  repair: string
  amount: number
  daysAgo: number
  status: OpportunityStatus
  paidDaysAgo?: number
}

// Sample customers have no email address, so they can never receive a follow-up.
const SAMPLES: Sample[] = [
  { name: 'Michael Carter', vehicle: [2019, 'Toyota', 'Camry'], repair: 'Brake pads replacement', amount: 264, daysAgo: 38, status: 'paid', paidDaysAgo: 30 },
  { name: 'Sarah Johnson', vehicle: [2020, 'Honda', 'Civic'], repair: 'Serpentine belt replacement', amount: 176, daysAgo: 34, status: 'paid', paidDaysAgo: 21 },
  { name: 'David Wilson', vehicle: [2018, 'Ford', 'F-150'], repair: 'Transmission fluid service', amount: 124, daysAgo: 29, status: 'paid', paidDaysAgo: 12 },
  { name: 'Lisa Brown', vehicle: [2021, 'Nissan', 'Altima'], repair: 'Engine and cabin air filters', amount: 89, daysAgo: 27, status: 'approved' },
  { name: 'James Martinez', vehicle: [2017, 'Chevrolet', 'Silverado'], repair: 'Front shocks and struts', amount: 1180, daysAgo: 25, status: 'work_completed' },
  { name: 'Priya Shah', vehicle: [2019, 'Toyota', 'RAV4'], repair: 'Timing belt replacement', amount: 950, daysAgo: 22, status: 'appointment_requested' },
  { name: 'Daniel Okoye', vehicle: [2015, 'Honda', 'Accord'], repair: 'Replace CV axle', amount: 645, daysAgo: 20, status: 'customer_interested' },
  { name: 'Emily Davis', vehicle: [2016, 'Subaru', 'Outback'], repair: 'Rear brake rotors', amount: 420, daysAgo: 16, status: 'contacted' },
  { name: 'Robert Taylor', vehicle: [2014, 'Jeep', 'Wrangler'], repair: 'Power steering pump', amount: 560, daysAgo: 12, status: 'contacted' },
  { name: 'Grace Kim', vehicle: [2022, 'Hyundai', 'Tucson'], repair: 'Spark plugs and ignition coils', amount: 310, daysAgo: 6, status: 'new' },
  { name: 'Omar Hassan', vehicle: [2013, 'BMW', '328i'], repair: 'Water pump and thermostat', amount: 870, daysAgo: 4, status: 'new' },
  { name: 'Karen White', vehicle: [2012, 'Ford', 'Focus'], repair: 'Catalytic converter', amount: 1450, daysAgo: 31, status: 'declined_again' },
]

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

export const SAMPLE_SOURCE = 'sample_data'

export async function loadSampleData(shopId: string, currency: string): Promise<void> {
  const { data: customers, error: cErr } = await supabase
    .from('customers')
    .insert(
      SAMPLES.map((s) => ({
        shop_id: shopId,
        name: s.name,
        consent_status: 'unknown',
        consent_source: SAMPLE_SOURCE,
      })),
    )
    .select('id, name')
  if (cErr) throw new Error(cErr.message)
  const customerId = new Map<string, string>(
    ((customers ?? []) as { id: string; name: string }[]).map((c) => [c.name, c.id]),
  )

  const { data: vehicles, error: vErr } = await supabase
    .from('vehicles')
    .insert(
      SAMPLES.map((s) => ({
        shop_id: shopId,
        customer_id: customerId.get(s.name),
        year: s.vehicle[0],
        make: s.vehicle[1],
        model: s.vehicle[2],
      })),
    )
    .select('id, customer_id')
  if (vErr) throw new Error(vErr.message)
  const vehicleId = new Map<string, string>(
    ((vehicles ?? []) as { id: string; customer_id: string }[]).map((v) => [v.customer_id, v.id]),
  )

  const { error: oErr } = await supabase.from('repair_opportunities').insert(
    SAMPLES.map((s) => {
      const cid = customerId.get(s.name) as string
      const row: Record<string, unknown> = {
        shop_id: shopId,
        customer_id: cid,
        vehicle_id: vehicleId.get(cid) ?? null,
        description: s.repair,
        estimate_amount: s.amount,
        currency,
        declined_at: ago(s.daysAgo).slice(0, 10),
        status: s.status,
      }
      if (s.status === 'approved' || s.status === 'work_completed' || s.status === 'paid') {
        row.approved_amount = s.amount
        row.approved_at = ago(s.paidDaysAgo ? s.paidDaysAgo + 2 : 5)
      }
      if (s.status === 'work_completed' || s.status === 'paid') row.completed_at = ago(s.paidDaysAgo ?? 3)
      if (s.status === 'paid') {
        row.paid_amount = s.amount
        row.paid_at = ago(s.paidDaysAgo ?? 0)
      }
      return row
    }),
  )
  if (oErr) throw new Error(oErr.message)
}

// Deleting the customers also removes their vehicles and repairs (cascade). Owner only.
export async function removeSampleData(shopId: string): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('shop_id', shopId)
    .eq('consent_source', SAMPLE_SOURCE)
  if (error) throw new Error(error.message)
}
