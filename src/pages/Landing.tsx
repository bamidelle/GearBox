import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icons'
import '../landing.css'

const FEATURES: { icon: IconName; title: string }[] = [
  { icon: 'upload', title: 'Import declined jobs from CSV' },
  { icon: 'mail', title: 'Automated email reminders' },
  { icon: 'check', title: 'Approval links for customers' },
  { icon: 'trend', title: 'Track outcomes & recovered revenue' },
]

export default function Landing() {
  return (
    <div className="land">
      <header className="land-head">
        <div className="brand">
          <span className="logo-mark">
            <Icon name="settings" size={20} />
          </span>
          <span>
            GearBox
            <small>Recover More. Keep Customers.</small>
          </span>
        </div>
        <nav>
          <Link to="/login" className="plain">
            Login
          </Link>
          <Link to="/signup" className="btn">
            Get Started
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div>
          <h1>
            Turn Declined Repairs <em>Into Recovered Revenue</em>
          </h1>
          <p className="lead">
            Track declined work, follow up automatically, and get customers to approve repairs &mdash; without
            changing your existing shop management system.
          </p>
          <div className="cta">
            <Link to="/signup" className="btn">
              Get Started
            </Link>
            <Link to="/login" className="btn btn-outline">
              Log in
            </Link>
          </div>
          <p className="muted">Set up in minutes. Import a spreadsheet and go.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="approved-card">
            <span className="ok">
              <Icon name="check" size={18} />
            </span>
            <div>
              <strong>Customer approved!</strong>
              <div className="muted">Brake pads replacement &middot; $284.00</div>
              <div className="sample">Sample</div>
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <span className="ico">
              <Icon name={f.icon} />
            </span>
            <strong>{f.title}</strong>
          </div>
        ))}
      </section>

      <section className="band">
        <div className="band-inner">
          <h2 style={{ margin: 0 }}>Built for modern auto repair shops</h2>
          <div className="items">
            <div>
              <strong>No system replacement</strong>
              <p>Works alongside your current shop software.</p>
            </div>
            <div>
              <strong>Simple CSV import</strong>
              <p>Get started with a spreadsheet.</p>
            </div>
            <div>
              <strong>Real results</strong>
              <p>See approvals and recovered revenue on your dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="land-foot">&copy; GearBox. Recover more. Keep customers.</footer>
    </div>
  )
}
