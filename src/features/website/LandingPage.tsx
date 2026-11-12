import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import './website.css'
import { submitInquiry } from './inquiriesApi'

/* ─── Static data ──────────────────────────────────────────────── */

const VARIETIES = [
  { name: 'Kasikas Jasmine', origin: 'Imported', icon: '🌾', desc: 'Aromatic, long-grain premium jasmine rice loved across Asia.' },
  { name: 'Japonica', origin: 'Imported', icon: '🍚', desc: 'Short-grain sticky rice perfect for Japanese and Korean cuisine.' },
  { name: 'White Rice', origin: 'Local', icon: '🌾', desc: 'Classic everyday white rice, carefully sourced from local farms.' },
  { name: 'Parboiled Rice', origin: 'Local', icon: '🌾', desc: 'Partially pre-cooked for extra nutrition and faster cooking.' },
  { name: 'Glutinous Rice', origin: 'Local & Imported', icon: '🍡', desc: 'Sticky rice for kakanin, bibingka, and special Filipino dishes.' },
]

const SACK_SIZES = ['5 kg', '25 kg', '50 kg']

const FEATURES = [
  { icon: '🏭', title: 'Licensed Supplier', desc: 'Fully licensed rice supplier and importer accredited by the NFA and DA.' },
  { icon: '🚚', title: 'Reliable Delivery', desc: 'On-time delivery to your store, restaurant, or institution across the Philippines.' },
  { icon: '📦', title: 'Flexible Packaging', desc: 'Available in 5 kg, 25 kg, and 50 kg sacks to match any volume.' },
  { icon: '🤝', title: 'Trusted Partnerships', desc: 'Serving retailers, restaurants, schools, and government agencies since 2023.' },
  { icon: '🔍', title: 'Quality-Checked', desc: 'Every batch inspected for moisture, broken grains, and foreign matter.' },
  { icon: '💳', title: 'Flexible Terms', desc: 'Cash, GCash, bank transfer, and installment arrangements available.' },
]

const BRANCHES = [
  {
    name: 'Main Office',
    address: 'Please contact us for the full address.',
    contact: 'See contact details below',
  },
]

/* ─── Component ────────────────────────────────────────────────── */

export function LandingPage() {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  const [branchInterest, setBranchInterest] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleInquiry(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !contact.trim() || !message.trim()) {
      setErr('Please fill in name, contact, and your message.')
      return
    }
    setSending(true)
    setErr(null)
    try {
      await submitInquiry({ name, contact, message, branchInterest })
      setSent(true)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="pub">
      {/* ── NAV ─────────────────────────────────────────────── */}
      <nav className="pub-nav">
        <div className="pub-nav-inner">
          <a href="#top" className="pub-logo">
            <img src="/JMG COMMODITIES.jpeg" alt="JMG Commodities" className="pub-logo-img" />
            <div>
              <div className="pub-logo-name">JMG Commodities</div>
              <div className="pub-logo-tagline">Premium Rice Supplier</div>
            </div>
          </a>
          <div className="pub-nav-links">
            <a href="#varieties" className="pub-nav-link">Varieties</a>
            <a href="#branches" className="pub-nav-link">Branches</a>
            <a href="#contact" className="pub-nav-link">Contact</a>
            <Link to="/login" className="pub-nav-link pub-nav-cta">Staff Login</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section id="top" className="pub-hero">
        {/* Background: JMG Trucks photo */}
        <div className="pub-hero-bg" />
        <div className="pub-hero-gradient" />
        <div className="pub-hero-content">
          <div className="pub-hero-logo-wrap">
            <img src="/JMG COMMODITIES.jpeg" alt="JMG Commodities" className="pub-hero-logo" />
          </div>
          <div className="pub-hero-badge">🇵🇭 Licensed Philippine Rice Supplier · Est. 2023</div>
          <h1>
            Quality Rice,<br /><span>Delivered Fresh</span>
          </h1>
          <p className="pub-hero-sub">
            JMG Commodities Inc. supplies premium jasmine, japonica, white, parboiled, and glutinous rice
            across the Philippines — in 5 kg, 25 kg, and 50 kg sacks for every need.
          </p>
          <div className="pub-hero-actions">
            <a href="#contact" className="pub-btn-primary">Get a Quote →</a>
            <a href="#varieties" className="pub-btn-glass">View Varieties</a>
          </div>
          <div className="pub-hero-stats">
            <div className="pub-hero-stat">
              <strong>5</strong>
              <span>Rice varieties</span>
            </div>
            <div className="pub-hero-stat-divider" />
            <div className="pub-hero-stat">
              <strong>3</strong>
              <span>Sack sizes</span>
            </div>
            <div className="pub-hero-stat-divider" />
            <div className="pub-hero-stat">
              <strong>2023</strong>
              <span>Est. year</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY US ───────────────────────────────────────────── */}
      <section className="pub-section">
        <div className="pub-section-inner">
          <p className="pub-section-label">Why choose us</p>
          <h2 className="pub-section-title">Your trusted rice partner</h2>
          <p className="pub-section-sub">
            From small retailers to large institutions, we provide quality rice with reliable supply
            and flexible terms.
          </p>
          <div className="pub-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="pub-feature">
                <div className="pub-feature-icon">{f.icon}</div>
                <div className="pub-feature-body">
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VARIETIES ─────────────────────────────────────────── */}
      <section id="varieties" className="pub-section pub-section-alt">
        <div className="pub-section-inner">
          <p className="pub-section-label">Our products</p>
          <h2 className="pub-section-title">Five premium rice varieties</h2>
          <p className="pub-section-sub">
            Local and imported varieties available in 5 kg, 25 kg, and 50 kg sacks.
          </p>
          <div className="pub-varieties">
            {VARIETIES.map((v) => (
              <div key={v.name} className="pub-variety-card">
                <div className="pub-variety-icon">{v.icon}</div>
                <div className="pub-variety-name">{v.name}</div>
                <div className="pub-variety-origin">{v.origin}</div>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-ink-soft)', marginTop: 8, lineHeight: 1.5 }}>
                  {v.desc}
                </p>
                <div className="pub-variety-sizes">
                  {SACK_SIZES.map((s) => (
                    <span key={s} className="pub-size-chip">{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KASIKAS SHOWCASE ──────────────────────────────────── */}
      <section className="pub-trucks-section">
        <div className="pub-trucks-bg" />
        <div className="pub-trucks-gradient" />
        <div className="pub-trucks-content">
          <p className="pub-section-label" style={{ color: 'rgba(255,255,255,0.65)' }}>Our fleet</p>
          <h2 style={{ color: 'var(--color-on-brand)', fontSize: 'clamp(1.5rem,3vw,2.2rem)', marginBottom: 12 }}>
            Kasikas — Pure Local Rice
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.75)', maxWidth: 500, lineHeight: 1.7, marginBottom: 24 }}>
            Our flagship Kasikas rice brand, available in blue, red, and green variants —
            Filipino farmer's harvest, delivered fresh by JMG's own fleet of trucks.
          </p>
          <a href="#contact" className="pub-btn-primary" style={{ background: 'var(--color-gold)', boxShadow: '0 4px 16px rgba(201,162,39,0.4)' }}>
            Order Kasikas Now →
          </a>
        </div>
      </section>

      {/* ── BRANCHES ──────────────────────────────────────────── */}
      <section id="branches" className="pub-section">
        <div className="pub-section-inner">
          <p className="pub-section-label">Where we are</p>
          <h2 className="pub-section-title">Our branch locations</h2>
          <p className="pub-section-sub">
            Find a JMG Commodities branch near you. Contact us for details in your area.
          </p>
          <div className="pub-branches">
            {BRANCHES.map((b) => (
              <div key={b.name} className="pub-branch-card">
                <div className="pub-branch-icon">📍</div>
                <div className="pub-branch-name">{b.name}</div>
                <div className="pub-branch-addr">{b.address}</div>
                <div className="pub-branch-contact">{b.contact}</div>
              </div>
            ))}
            <div className="pub-branch-card" style={{ borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10, minHeight: 160 }}>
              <div style={{ fontSize: 32 }}>🗺️</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-ink-soft)' }}>
                More branches available. Send us an inquiry to find your nearest location.
              </p>
              <a href="#contact" className="pub-btn-primary" style={{ fontSize: '0.875rem', padding: '10px 20px' }}>
                Contact us
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT / INQUIRY ─────────────────────────────────── */}
      <section id="contact" className="pub-section pub-section-alt">
        <div className="pub-section-inner">
          <p className="pub-section-label">Get in touch</p>
          <h2 className="pub-section-title">Send us an inquiry</h2>
          <div className="pub-inquiry-wrap">
            {/* Contact info */}
            <div className="pub-contact-info">
              <p style={{ color: 'var(--color-ink-soft)', lineHeight: 1.7 }}>
                Whether you are a retailer, restaurant, institution, or wholesaler — we would love to
                hear from you. Fill in the form and our team will reach out within one business day.
              </p>
              <div className="pub-contact-item">
                <div className="pub-contact-item-icon">📧</div>
                <div>
                  <h4>Email</h4>
                  <p>Contact us via the inquiry form and we will reply to your email or phone.</p>
                </div>
              </div>
              <div className="pub-contact-item">
                <div className="pub-contact-item-icon">📞</div>
                <div>
                  <h4>Phone / GCash</h4>
                  <p>Provide your mobile number in the form and we will reach you directly.</p>
                </div>
              </div>
              <div className="pub-contact-item">
                <div className="pub-contact-item-icon">🕐</div>
                <div>
                  <h4>Office hours</h4>
                  <p>Monday – Saturday, 8:00 AM – 5:00 PM (PHT)</p>
                </div>
              </div>
            </div>

            {/* Inquiry form */}
            {sent ? (
              <div className="pub-form pub-form-success">
                <div className="success-icon">✓</div>
                <h3 style={{ marginBottom: 10 }}>Inquiry sent!</h3>
                <p style={{ color: 'var(--color-ink-soft)' }}>
                  Thank you, <strong>{name}</strong>. Our team will contact you at <strong>{contact}</strong> within one business day.
                </p>
                <button
                  className="pub-btn-outline"
                  style={{ marginTop: 20 }}
                  onClick={() => { setSent(false); setName(''); setContact(''); setMessage(''); setBranchInterest('') }}
                >
                  Send another
                </button>
              </div>
            ) : (
              <form className="pub-form" onSubmit={handleInquiry}>
                <h3>Send us a message</h3>
                <p style={{ color: 'var(--color-ink-soft)', fontSize: '0.875rem' }}>We reply within one business day.</p>

                {err ? <div className="error-banner" style={{ fontSize: '0.875rem' }}>{err}</div> : null}

                <div className="pub-form-row">
                  <div className="pub-field">
                    <label htmlFor="inq-name">Full name *</label>
                    <input id="inq-name" type="text" required placeholder="Juan dela Cruz" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="pub-field">
                    <label htmlFor="inq-contact">Phone or Email *</label>
                    <input id="inq-contact" type="text" required placeholder="09xx or email@example.com" value={contact} onChange={(e) => setContact(e.target.value)} />
                  </div>
                </div>

                <div className="pub-field">
                  <label htmlFor="inq-branch">Nearest area / branch (optional)</label>
                  <input id="inq-branch" type="text" placeholder="e.g. Cebu, Davao, Metro Manila…" value={branchInterest} onChange={(e) => setBranchInterest(e.target.value)} />
                </div>

                <div className="pub-field">
                  <label htmlFor="inq-message">Message *</label>
                  <textarea id="inq-message" required placeholder="Tell us what variety, sack size, and quantity you need. Any questions are welcome!" value={message} onChange={(e) => setMessage(e.target.value)} />
                </div>

                <button type="submit" className="pub-btn-primary" disabled={sending}>
                  {sending ? 'Sending…' : 'Send inquiry →'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <div className="pub-footer-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <img src="/JMG COMMODITIES.jpeg" alt="JMG Commodities" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'contain' }} />
              <h3 style={{ margin: 0 }}>JMG Commodities Inc.</h3>
            </div>
            <p>
              Licensed Philippine rice supplier and importer. Supplying quality rice — jasmine, japonica,
              white, parboiled, and glutinous — across the Philippines since 2023.
            </p>
          </div>
          <div className="pub-footer-col">
            <h4>Products</h4>
            <ul>
              {VARIETIES.map((v) => <li key={v.name}>{v.name}</li>)}
            </ul>
          </div>
          <div className="pub-footer-col">
            <h4>Company</h4>
            <ul>
              <li><a href="#top">About</a></li>
              <li><a href="#branches">Branches</a></li>
              <li><a href="#contact">Contact</a></li>
              <li><Link to="/login">Staff Login</Link></li>
            </ul>
          </div>
        </div>
        <div className="pub-footer-bottom">
          <span>© {new Date().getFullYear()} JMG Commodities Inc. All rights reserved.</span>
          <span>
            <Link to="/login">Staff Login</Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
