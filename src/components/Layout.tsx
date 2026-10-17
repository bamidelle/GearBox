import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import '../layout.css'
import '../settings.css'

export default function Layout() {
  const { shop, signOut } = useAuth()

  return (
    <>
      <header className="nav">
        <strong className="brand">{shop?.name ?? 'Gearbox'}</strong>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/opportunities">Opportunities</NavLink>
          <NavLink to="/import">Import</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <button type="button" className="link" onClick={signOut}>
          Log out
        </button>
      </header>
      <Outlet />
    </>
  )
}
