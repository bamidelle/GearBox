import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

function Loading() {
  return <p className="center muted">Loading...</p>
}

// Signed in AND has a shop.
export function RequireShop({ children }: { children: ReactNode }) {
  const { session, shop, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/welcome" replace />
  if (!shop) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

// Signed in but no shop yet.
export function RequireNoShop({ children }: { children: ReactNode }) {
  const { session, shop, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace />
  if (shop) return <Navigate to="/" replace />
  return <>{children}</>
}

// Landing/login/signup pages: bounce signed-in users onward.
export function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <Loading />
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}
