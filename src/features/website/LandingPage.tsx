import { type FormEvent, type MouseEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import './website.css'
import { submitInquiry } from './inquiriesApi'

gsap.registerPlugin(ScrollTrigger)

/* ─── Static data ──────────────────────────────────────────────── */

const COMPANY = {
  phone: '+63 932 305 3491',
  phoneHref: 'tel:+639323053491',
  viberHref: 'viber://chat?number=%2B639323053491',
  facebookUrl: 'https://www.facebook.com/search/pages/?q=JMG%20Commodities',
  address:
    'Unit 4, AMari Building / Mendi Complex, Purok 4, Brgy. Mining, Angeles City, Pampanga',
}

const PRODUCTS = [
  { name: 'Kasikas', variant: 'Pure Local / Jasmine', size: '25 kg', price: 1270, icon: '🌾' },
  { name: 'Super Mama India', variant: 'Raw White Rice', size: '50 kg', price: 1900, icon: '🌾' },
  { name: 'Camel India', variant: 'Raw White Rice', size: '50 kg', price: 1900, icon: '🌾' },
  { name: "Mama's Best", variant: 'Super Dinurado', size: '50 kg', price: 2360, icon: '🌾' },
  { name: "Mama's Best", variant: 'Super Dinurado', size: '25 kg', price: 1180, icon: '🌾' },
  { name: 'Sweet Daisy', variant: 'Special Sinandomeng', size: '25 kg', price: 1100, icon: '🌾' },
  { name: 'Japonica', variant: 'Japanese Round Rice', size: '25 kg', price: 1160, icon: '🍚' },
]

const PRODUCT_NAMES = Array.from(new Set(PRODUCTS.map((p) => p.name)))

const PESO = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const INQUIRY_COOLDOWN_KEY = 'jmg-inquiry-sent-at'
const INQUIRY_COOLDOWN_MS = 60_000

/** Keep in sync with the .pub-leaving animation in website.css. */
const LEAVE_DELAY_MS = 240

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const FEATURES = [
  { icon: '🏭', title: 'Licensed Supplier', desc: 'Fully licensed rice supplier and importer accredited by the NFA and DA.' },
  { icon: '🛒', title: 'Wholesale & Retail', desc: 'Buy by the sack for your household or by the truckload for your store, restaurant, or institution.' },
  { icon: '🚚', title: 'Doorstep Delivery', desc: 'Door-to-door delivery through partner services such as Maxim, or pick up at any branch.' },
  { icon: '📅', title: 'Online Booking & Reservations', desc: 'Book online and reserve stock in advance so your rice is ready when you need it.' },
  { icon: '📦', title: 'Flexible Packaging', desc: 'Available in 25 kg and 50 kg sacks to match any volume.' },
  { icon: '💳', title: 'Flexible Terms', desc: 'Cash, GCash, bank transfer, and installment arrangements available.' },
]

interface PublicBranch {
  id: string
  name: string
  address: string | null
  contact: string | null
  latitude: number | null
  longitude: number | null
}

const FALLBACK_BRANCHES: PublicBranch[] = [
  {
    id: 'main',
    name: 'Angeles City · Main Office & Branch',
    address: COMPANY.address,
    contact: `${COMPANY.phone} (Phone / Viber)`,
    latitude: null,
    longitude: null,
  },
  {
    id: 'cebu',
    name: 'Cebu · Branch & Warehouse',
    address: 'Tipolo, Mandaue City, Cebu',
    contact: `${COMPANY.phone} (Phone / Viber)`,
    latitude: null,
    longitude: null,
  },
  {
    id: 'bohol',
    name: 'Bohol · Branch & Warehouse',
    address: 'Tagbilaran, Bohol',
    contact: `${COMPANY.phone} (Phone / Viber)`,
    latitude: null,
    longitude: null,
  },
]

// Pilot seed rows would otherwise hide the official locations below.
const SEED_BRANCH_NAMES = /^(main branch|cebu branch)$/i
const SEED_BRANCH_ADDRESSES = /^(metro manila|cebu city)$/i

function isPlaceholderBranch(branch: PublicBranch) {
  return (
    SEED_BRANCH_NAMES.test(branch.name.trim()) ||
    SEED_BRANCH_ADDRESSES.test((branch.address ?? '').trim())
  )
}

// A saved map pin is exact; otherwise Google resolves a full street address more
// reliably than "branch name + address", where a generic name can match an
// unrelated business.
function mapQuery(branch: PublicBranch) {
  if (branch.latitude != null && branch.longitude != null) {
    return `${branch.latitude},${branch.longitude}`
  }
  return (branch.address ?? '').trim() || branch.name
}

function mapEmbedUrl(branch: PublicBranch) {
  return `https://www.google.com/maps?q=${encodeURIComponent(mapQuery(branch))}&output=embed`
}

function mapLinkUrl(branch: PublicBranch) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery(branch))}`
}

/* ─── Component ────────────────────────────────────────────────── */

export function LandingPage() {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  const [branchInterest, setBranchInterest] = useState('')
  const [trap, setTrap] = useState('')
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showPrices, setShowPrices] = useState(true)
  const [branches, setBranches] = useState<PublicBranch[]>(FALLBACK_BRANCHES)
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  const leaveTimer = useRef<number | null>(null)
  const pubRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
  }, [])

  useEffect(() => {
    const root = pubRef.current
    if (!root || prefersReducedMotion()) return

    const ctx = gsap.context(() => {
      gsap.from(
        gsap.utils.toArray<HTMLElement>(
          '.pub-hero-logo-wrap, .pub-hero-badge, .pub-hero h1, .pub-hero-sub, .pub-hero-actions, .pub-hero-stats',
        ),
        { autoAlpha: 0, y: 28, duration: 0.85, ease: 'power3.out', stagger: 0.09, delay: 0.1 },
      )

      // Parallax: the photo drifts slower than the copy, which lifts and fades away.
      gsap.fromTo(
        '.pub-hero-bg',
        { scale: 1.22, yPercent: -6 },
        {
          scale: 1.22,
          yPercent: 6,
          ease: 'none',
          scrollTrigger: { trigger: '.pub-hero', start: 'top top', end: 'bottom top', scrub: true },
        },
      )
      gsap.to('.pub-hero-content', {
        yPercent: -12,
        autoAlpha: 0.2,
        ease: 'none',
        scrollTrigger: { trigger: '.pub-hero', start: 'top top', end: 'bottom top', scrub: true },
      })

      gsap.fromTo(
        '.pub-trucks-bg',
        { scale: 1.2, yPercent: -8 },
        {
          scale: 1.2,
          yPercent: 8,
          ease: 'none',
          scrollTrigger: { trigger: '.pub-trucks-section', start: 'top bottom', end: 'bottom top', scrub: true },
        },
      )

      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          autoAlpha: 0,
          y: 30,
          duration: 0.75,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 84%', once: true },
        })
      })

      gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((grid) => {
        gsap.from(Array.from(grid.children), {
          autoAlpha: 0,
          y: 36,
          duration: 0.65,
          ease: 'power2.out',
          stagger: 0.07,
          scrollTrigger: { trigger: grid, start: 'top 84%', once: true },
        })
      })

      if (progressRef.current) {
        gsap.to(progressRef.current, {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: 0.3 },
        })
      }

      ScrollTrigger.create({
        trigger: root,
        start: 'top -16',
        end: 'max',
        onToggle: (self) => root.classList.toggle('pub-scrolled', self.isActive),
      })
    }, root)

    return () => {
      ctx.revert()
      root.classList.remove('pub-scrolled')
    }
  }, [])

  // Branch cards arrive after the public_branches() call, so they get their own trigger.
  useEffect(() => {
    const grid = pubRef.current?.querySelector<HTMLElement>('.pub-branches')
    if (!grid || prefersReducedMotion()) return

    const ctx = gsap.context(() => {
      gsap.from(Array.from(grid.children), {
        autoAlpha: 0,
        y: 36,
        duration: 0.65,
        ease: 'power2.out',
        stagger: 0.08,
        scrollTrigger: { trigger: grid, start: 'top 84%', once: true },
      })
    }, grid)

    requestAnimationFrame(() => ScrollTrigger.refresh())

    return () => {
      ctx.revert()
    }
  }, [branches])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false

    void (async () => {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!cancelled && settings && settings.show_public_prices === false) {
        setShowPrices(false)
      }

      const { data: branchRows } = await supabase.rpc('public_branches')
      const liveBranches = Array.isArray(branchRows)
        ? (branchRows as PublicBranch[]).filter((b) => !isPlaceholderBranch(b))
        : []
      if (!cancelled && liveBranches.length > 0) {
        setBranches(liveBranches)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  function openLogin(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (leaving) return
    if (prefersReducedMotion()) {
      navigate('/login')
      return
    }
    setLeaving(true)
    leaveTimer.current = window.setTimeout(() => navigate('/login'), LEAVE_DELAY_MS)
  }

  function goToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = document.getElementById(id)
    if (!target) return
    event.preventDefault()
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    window.history.replaceState(null, '', id === 'top' ? window.location.pathname : `#${id}`)
    if (id !== 'top') {
      target.classList.remove('pub-target-hit')
      void target.offsetWidth
      target.classList.add('pub-target-hit')
      window.setTimeout(() => target.classList.remove('pub-target-hit'), 900)
    }
  }

  async function handleInquiry(e: FormEvent) {
    e.preventDefault()
    if (trap.trim()) {
      setSent(true)
      return
    }
    if (!name.trim() || !contact.trim() || !message.trim()) {
      setErr('Please fill in name, contact, and your message.')
      return
    }
    if (!consent) {
      setErr('Please agree to the privacy notice before sending.')
      return
    }
    const lastSent = Number(window.localStorage.getItem(INQUIRY_COOLDOWN_KEY) ?? 0)
    if (Date.now() - lastSent < INQUIRY_COOLDOWN_MS) {
      setErr('Please wait a minute before sending another inquiry.')
      return
    }
    setSending(true)
    setErr(null)
    try {
      await submitInquiry({
        name: name.trim(),
        contact: contact.trim(),
        message: message.trim(),
        branchInterest: branchInterest.trim(),
      })
      window.localStorage.setItem(INQUIRY_COOLDOWN_KEY, String(Date.now()))
      setSent(true)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div ref={progressRef} className="pub-progress" aria-hidden="true" />
      <div ref={pubRef} className={leaving ? 'pub pub-leaving' : 'pub'}>
        {/* ── NAV ─────────────────────────────────────────────── */}
      <nav className="pub-nav">
        <div className="pub-nav-inner">
          <a href="#top" className="pub-logo" onClick={(e) => goToSection(e, 'top')}>
            <img src="/JMG COMMODITIES.jpeg" alt="JMG Commodities" className="pub-logo-img" />
            <div>
              <div className="pub-logo-name">JMG Commodities</div>
              <div className="pub-logo-tagline">Premium Rice Supplier</div>
            </div>
          </a>
          <div className="pub-nav-links">
            <a href="#products" className="pub-nav-link" onClick={(e) => goToSection(e, 'products')}>Products</a>
            <a href="#branches" className="pub-nav-link" onClick={(e) => goToSection(e, 'branches')}>Branches</a>
            <a href="#contact" className="pub-nav-link" onClick={(e) => goToSection(e, 'contact')}>Contact</a>
            <Link to="/login" className="pub-nav-link pub-nav-cta" onClick={openLogin}>Staff Login</Link>
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
            JMG Commodities Inc. supplies Kasikas, Super Mama India, Camel India, Mama&apos;s Best Super
            Dinurado, Sweet Daisy and Japonica rice — wholesale and retail, with doorstep delivery
            nationwide.
          </p>
          <div className="pub-hero-actions">
            <a href="#contact" className="pub-btn-primary" onClick={(e) => goToSection(e, 'contact')}>Get a Quote →</a>
            <a href="#products" className="pub-btn-glass" onClick={(e) => goToSection(e, 'products')}>View Products</a>
          </div>
          <div className="pub-hero-stats">
            <div className="pub-hero-stat">
              <strong>6</strong>
              <span>Rice brands</span>
            </div>
            <div className="pub-hero-stat-divider" />
            <div className="pub-hero-stat">
              <strong>2</strong>
              <span>Sack sizes</span>
            </div>
            <div className="pub-hero-stat-divider" />
            <div className="pub-hero-stat">
              <strong>3</strong>
              <span>Locations</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY US ───────────────────────────────────────────── */}
      <section className="pub-section">
        <div className="pub-section-inner">
          <p className="pub-section-label" data-reveal>Why choose us</p>
          <h2 className="pub-section-title" data-reveal>Your trusted rice partner</h2>
          <p className="pub-section-sub" data-reveal>
            From small retailers to large institutions, we provide quality rice with reliable supply
            and flexible terms.
          </p>
          <div className="pub-features" data-stagger>
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

      {/* ── PRODUCTS ──────────────────────────────────────────── */}
      <section id="products" className="pub-section pub-section-alt">
        <div className="pub-section-inner">
          <p className="pub-section-label" data-reveal>Our products</p>
          <h2 className="pub-section-title" data-reveal>Rice by brand and sack size</h2>
          <p className="pub-section-sub" data-reveal>
            Local and imported rice in 25 kg and 50 kg sacks.
            {showPrices ? ' Prices are per sack.' : ' Ask us for current pricing.'}
          </p>
          <div className="pub-varieties" data-stagger>
            {PRODUCTS.map((p) => (
              <div key={`${p.name}-${p.size}`} className="pub-variety-card">
                <div className="pub-variety-icon">{p.icon}</div>
                <div className="pub-variety-name">{p.name}</div>
                <div className="pub-variety-variant">{p.variant}</div>
                <div className="pub-variety-origin">{p.size} sack</div>
                {showPrices ? (
                  <>
                    <div className="pub-variety-price">{PESO.format(p.price)}</div>
                    <div className="pub-variety-per">per sack</div>
                  </>
                ) : (
                  <div className="pub-variety-per" style={{ marginTop: 14 }}>
                    Ask for a quote
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="pub-price-note">
            {showPrices
              ? 'Prices may change without prior notice. Ask us about wholesale pricing and installment terms.'
              : 'Message us for today’s prices, wholesale terms, and delivery schedules.'}
          </p>
        </div>
      </section>

      {/* ── FLEET ─────────────────────────────────────────────── */}
      <section className="pub-trucks-section">
        <div className="pub-trucks-bg" />
        <div className="pub-trucks-gradient" />
        <div className="pub-trucks-content">
          <p className="pub-section-label" data-reveal style={{ color: 'rgba(255,255,255,0.65)' }}>Our fleet</p>
          <h2 data-reveal style={{ color: 'var(--color-on-brand)', fontSize: 'clamp(1.5rem,3vw,2.2rem)', marginBottom: 12 }}>
            Delivered fresh by our own trucks
          </h2>
          <p data-reveal style={{ color: 'rgba(255,255,255,0.75)', maxWidth: 500, lineHeight: 1.7, marginBottom: 24 }}>
            Rice moves straight from our warehouses to your store, restaurant, or institution.
            Our trucks handle bulk orders, and partner services such as Maxim bring smaller orders
            to your doorstep.
          </p>
          <a href="#contact" className="pub-btn-primary" data-reveal style={{ background: 'var(--color-gold)', boxShadow: '0 4px 16px rgba(201,162,39,0.4)' }} onClick={(e) => goToSection(e, 'contact')}>
            Ask for a delivery quote →
          </a>
        </div>
      </section>

      {/* ── BRANCHES ──────────────────────────────────────────── */}
      <section id="branches" className="pub-section">
        <div className="pub-section-inner">
          <p className="pub-section-label" data-reveal>Where we are</p>
          <h2 className="pub-section-title" data-reveal>Our branch locations</h2>
          <p className="pub-section-sub" data-reveal>
            Visit our main office in Angeles City, Pampanga, or our branches and warehouses in Cebu
            and Bohol. Delivery is available nationwide.
          </p>
          <div className="pub-branches">
            {branches.map((b) => (
              <div key={b.id} className="pub-branch-card">
                <div className="pub-branch-map">
                  <iframe
                    title={`Map of ${b.name}`}
                    src={mapEmbedUrl(b)}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>
                <div className="pub-branch-icon">📍</div>
                <div className="pub-branch-name">{b.name}</div>
                <div className="pub-branch-addr">{b.address ?? 'Address available on request'}</div>
                <div className="pub-branch-contact">{b.contact ?? 'Contact us through the form below'}</div>
                <a
                  className="pub-branch-maplink"
                  href={mapLinkUrl(b)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open in Google Maps →
                </a>
              </div>
            ))}
            <div className="pub-branch-card" style={{ borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10, minHeight: 160 }}>
              <div style={{ fontSize: 32 }}>🗺️</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-ink-soft)' }}>
                Outside these areas? We deliver nationwide — send us an inquiry for your location.
              </p>
              <a href="#contact" className="pub-btn-primary" style={{ fontSize: '0.875rem', padding: '10px 20px' }} onClick={(e) => goToSection(e, 'contact')}>
                Contact us
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT / INQUIRY ─────────────────────────────────── */}
      <section id="contact" className="pub-section pub-section-alt">
        <div className="pub-section-inner">
          <p className="pub-section-label" data-reveal>Get in touch</p>
          <h2 className="pub-section-title" data-reveal>Send us an inquiry</h2>
          <div className="pub-inquiry-wrap" data-reveal>
            {/* Contact info */}
            <div className="pub-contact-info">
              <p style={{ color: 'var(--color-ink-soft)', lineHeight: 1.7 }}>
                Whether you are a retailer, restaurant, institution, or wholesaler — we would love to
                hear from you. Fill in the form and our team will reach out within one business day.
              </p>
              <div className="pub-contact-item">
                <div className="pub-contact-item-icon">📞</div>
                <div>
                  <h4>Phone / Viber</h4>
                  <p>
                    <a href={COMPANY.phoneHref}>{COMPANY.phone}</a> — call or{' '}
                    <a href={COMPANY.viberHref}>message us on Viber</a>.
                  </p>
                </div>
              </div>
              <div className="pub-contact-item">
                <div className="pub-contact-item-icon">💬</div>
                <div>
                  <h4>Facebook</h4>
                  <p>
                    Send us a message on the{' '}
                    <a href={COMPANY.facebookUrl} target="_blank" rel="noreferrer noopener">
                      JMG Commodities Facebook Page
                    </a>
                    .
                  </p>
                </div>
              </div>
              <div className="pub-contact-item">
                <div className="pub-contact-item-icon">📍</div>
                <div>
                  <h4>Main office</h4>
                  <p>{COMPANY.address}</p>
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
                  onClick={() => {
                    setSent(false)
                    setName('')
                    setContact('')
                    setMessage('')
                    setBranchInterest('')
                    setConsent(false)
                  }}
                >
                  Send another
                </button>
              </div>
            ) : (
              <form className="pub-form" onSubmit={handleInquiry}>
                <h3>Send us a message</h3>
                <p style={{ color: 'var(--color-ink-soft)', fontSize: '0.875rem' }}>We reply within one business day.</p>

                {err ? <div className="error-banner" style={{ fontSize: '0.875rem' }}>{err}</div> : null}

                <div className="pub-hp" aria-hidden="true">
                  <label htmlFor="inq-website">Company website</label>
                  <input
                    id="inq-website"
                    name="company_website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={trap}
                    onChange={(e) => setTrap(e.target.value)}
                  />
                </div>

                <div className="pub-form-row">
                  <div className="pub-field">
                    <label htmlFor="inq-name">Full name *</label>
                    <input id="inq-name" type="text" required autoComplete="name" minLength={2} maxLength={120} placeholder="Juan dela Cruz" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="pub-field">
                    <label htmlFor="inq-contact">Phone or Email *</label>
                    <input id="inq-contact" type="text" required minLength={5} maxLength={160} placeholder="09xx or email@example.com" value={contact} onChange={(e) => setContact(e.target.value)} />
                  </div>
                </div>

                <div className="pub-field">
                  <label htmlFor="inq-branch">Nearest area / branch (optional)</label>
                  <input id="inq-branch" type="text" maxLength={120} placeholder="e.g. Pampanga, Cebu, Bohol…" value={branchInterest} onChange={(e) => setBranchInterest(e.target.value)} />
                </div>

                <div className="pub-field">
                  <label htmlFor="inq-message">Message *</label>
                  <textarea id="inq-message" required minLength={10} maxLength={2000} placeholder="Tell us what brand, sack size, and quantity you need. Any questions are welcome!" value={message} onChange={(e) => setMessage(e.target.value)} />
                </div>

                <label className="pub-consent">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I have read the <a href="#privacy" onClick={(e) => goToSection(e, 'privacy')}>privacy notice</a> and consent to JMG Commodities
                    storing my details to respond to this inquiry.
                  </span>
                </label>

                <button
                  type="submit"
                  className="pub-btn-primary"
                  disabled={sending}
                  aria-busy={sending || undefined}
                  style={{ minWidth: 170 }}
                >
                  {sending ? <span className="sk-spinner" aria-hidden="true" /> : 'Send inquiry →'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── PRIVACY NOTICE ───────────────────────────────────── */}
      <section id="privacy" className="pub-section">
        <div className="pub-section-inner">
          <p className="pub-section-label" data-reveal>Privacy</p>
          <h2 className="pub-section-title" data-reveal>Privacy notice</h2>
          <div className="pub-privacy" data-reveal>
            <p>
              When you send an inquiry, we collect your name, phone number or email address, your
              message, and the area or branch you select. We use these details only to reply to your
              inquiry and prepare a quotation. We do not sell or share your information with third
              parties, and our staff can access inquiries only through the secured staff system.
            </p>
            <p>
              Inquiries are kept for up to twelve months, then removed. You may ask us to access,
              correct, or delete your information at any time by sending another inquiry with your
              request. This notice follows the Philippine Data Privacy Act of 2012 (RA 10173).
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="pub-footer">
        <div className="pub-footer-inner" data-reveal>
          <div className="pub-footer-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <img src="/JMG COMMODITIES.jpeg" alt="JMG Commodities" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'contain' }} />
              <h3 style={{ margin: 0 }}>JMG Commodities Inc.</h3>
            </div>
            <p>
              Wholesale and retail Philippine rice — Kasikas, Super Mama India, Camel India,
              Mama&apos;s Best Super Dinurado, Sweet Daisy Special Sinandomeng, and Japonica Japanese
              Round Rice. Main office in Angeles City, Pampanga, with branches and warehouses in
              Cebu and Bohol.
            </p>
            <p style={{ marginTop: 14 }}>
              {COMPANY.address}
              <br />
              <a href={COMPANY.phoneHref}>{COMPANY.phone}</a> (Phone / Viber)
              <br />
              <a href={COMPANY.viberHref}>Viber</a> ·{' '}
              <a href={COMPANY.facebookUrl} target="_blank" rel="noreferrer noopener">Facebook</a>
            </p>
          </div>
          <div className="pub-footer-col">
            <h4>Products</h4>
            <ul>
              {PRODUCT_NAMES.map((name) => <li key={name}>{name}</li>)}
            </ul>
          </div>
          <div className="pub-footer-col">
            <h4>Company</h4>
            <ul>
              <li><a href="#top" onClick={(e) => goToSection(e, 'top')}>About</a></li>
              <li><a href="#branches" onClick={(e) => goToSection(e, 'branches')}>Branches</a></li>
              <li><a href="#contact" onClick={(e) => goToSection(e, 'contact')}>Contact</a></li>
              <li><a href="#privacy" onClick={(e) => goToSection(e, 'privacy')}>Privacy notice</a></li>
              <li><Link to="/login" onClick={openLogin}>Staff Login</Link></li>
            </ul>
          </div>
        </div>
        <div className="pub-footer-bottom">
          <span>© {new Date().getFullYear()} JMG Commodities Inc. All rights reserved.</span>
          <span>
            <Link to="/login" onClick={openLogin}>Staff Login</Link>
          </span>
        </div>
      </footer>
      </div>
    </>
  )
}
