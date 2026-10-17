import { useAuth } from '../lib/auth'

export default function Home() {
  const { shop, session, signOut } = useAuth()

  return (
    <main className="card">
      <h1>{shop?.name}</h1>
      <p className="muted">Signed in as {session?.user.email}</p>
      <p>Recover revenue from declined repairs. Import and follow-up tools come next.</p>
      <button type="button" onClick={signOut}>
        Log out
      </button>
    </main>
  )
}
