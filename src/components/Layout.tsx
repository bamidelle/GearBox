import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import '../layout.css'
import '../settings.css'

export default function Layout() {
  const { shop, signOut } = useAuth()

  return (
    <>
      <header className="nav">
        <strong className="brand">{shop?.name ?? 'GearBox'}</strong>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/opportunities" end>
            Opportunities
          </NavLink>
          <NavLink to="/opportunities/new">Add repair</NavLink>
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
