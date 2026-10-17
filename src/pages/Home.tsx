import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Home() {
  const { shop, session, signOut } = useAuth()

  return (
    <main className="card">
      <h1>{shop?.name}</h1>
      <p className="muted">Signed in as {session?.user.email}</p>
      <p>Recover revenue from declined repairs.</p>
      <div className="row">
        <Link to="/import" className="btn">
          Import declined repairs
        </Link>
        <button type="button" className="link" onClick={signOut}>
          Log out
        </button>
      </div>
    </main>
  )
}
