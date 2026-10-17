import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Shop = { id: string; name: string }

type AuthState = {
  session: Session | null
  shop: Shop | null
  loading: boolean
  refreshShop: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [shop, setShop] = useState<Shop | null>(null)
  const [shopLoading, setShopLoading] = useState(true)

  const userId = session?.user.id ?? null

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadShop = useCallback(async () => {
    // RLS only returns shops the user belongs to (one shop per user in the MVP).
    const { data, error } = await supabase
      .from('shops')
      .select('id, name')
      .limit(1)
      .maybeSingle()
    if (error) console.error('Failed to load shop', error)
    setShop(data ?? null)
  }, [])

  useEffect(() => {
    if (!sessionReady) return
    if (!userId) {
      setShop(null)
      setShopLoading(false)
      return
    }
    setShopLoading(true)
    loadShop().finally(() => setShopLoading(false))
  }, [sessionReady, userId, loadShop])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        shop,
        loading: !sessionReady || shopLoading,
        refreshShop: loadShop,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
