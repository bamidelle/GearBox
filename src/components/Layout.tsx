import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Icon, type IconName } from './Icons'
import '../layout.css'
import '../settings.css'

const ITEMS: { to: string; label: string; short: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: 'dashboard', end: true },
  { to: '/opportunities', label: 'Declined Jobs', short: 'Jobs', icon: 'jobs', end: true },
  { to: '/opportunities/new', label: 'Add Repair', short: 'Add', icon: 'plus' },
  { to: '/customers', label: 'Customers', short: 'Clients', icon: 'users' },
  { to: '/import', label: 'Import CSV', short: 'Import', icon: 'upload' },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: 'settings' },
]

function GearBoxMark() {
  return (
    <span className="logo-mark">
      <Icon name="settings" size={20} />
    </span>
  )
}

export default function Layout() {
  const { shop, session, signOut } = useAuth()

  const fullName = (session?.user.user_metadata?.full_name as string | undefined)?.trim()
  const initials = (fullName || session?.user.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <GearBoxMark />
          GearBox
        </div>
        <nav>
          {ITEMS.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>
              <Icon name={i.icon} />
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <strong>{shop?.name}</strong>
          <span>Recover more. Keep customers.</span>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="mobile-logo">
            <GearBoxMark />
            GearBox
          </div>
          <span className="where">{shop?.name}</span>
          <div className="user">
            <span className="avatar" title={fullName || session?.user.email || ''}>
              {initials}
            </span>
            <button type="button" className="icon-btn" onClick={signOut} aria-label="Log out" title="Log out">
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <Outlet />
      </div>

      <nav className="bottomnav">
        {ITEMS.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}>
            <Icon name={i.icon} size={19} />
            {i.short}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
