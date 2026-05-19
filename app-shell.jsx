/* global React */
var { useState, useMemo, useEffect, useRef } = React;

// ═══ ICONS ═════════════════════════════════════════════════════════════════
// Clean 1.5px stroke, 16x16 viewbox, feather-ish
const AppIcon = ({ name, size = 16, className = '' }) => {
  const paths = {
    home:     <><path d="M2.5 8L8 3l5.5 5M4 7.5V13h8V7.5"/></>,
    sparkle:  <><path d="M8 2v4M8 10v4M2 8h4M10 8h4M4.5 4.5l2 2M9.5 9.5l2 2M11.5 4.5l-2 2M6.5 9.5l-2 2"/></>,
    layers:   <><path d="M8 2L2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3"/></>,
    calendar: <><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/></>,
    palette:  <><path d="M8 14A6 6 0 118 2c3 0 5.5 2 5.5 4.5 0 1.5-1.2 2.5-2.5 2.5H9.5c-.8 0-1.5.7-1.5 1.5 0 .5.2 1 .5 1.5.4.6.2 1.5-.5 1.5"/><circle cx="5" cy="7" r=".5"/><circle cx="6" cy="4.5" r=".5"/><circle cx="9" cy="4" r=".5"/><circle cx="11" cy="6.5" r=".5"/></>,
    inbox:    <><path d="M2.5 10.5L4 3h8l1.5 7.5M2.5 10.5v2.5c0 .3.2.5.5.5h10c.3 0 .5-.2.5-.5v-2.5M2.5 10.5h3l1 1.5h3l1-1.5h3"/></>,
    archive:  <><rect x="2" y="3" width="12" height="3" rx="1"/><path d="M3 6v6.5c0 .3.2.5.5.5h9c.3 0 .5-.2.5-.5V6M6 9h4"/></>,
    settings: <><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.3 3.3l1.4 1.4M11.3 11.3l1.4 1.4M3.3 12.7l1.4-1.4M11.3 4.7l1.4-1.4"/></>,
    plus:     <><path d="M8 3v10M3 8h10"/></>,
    search:   <><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3"/></>,
    chevDown: <><path d="M4 6l4 4 4-4"/></>,
    chevRight:<><path d="M6 4l4 4-4 4"/></>,
    chevLeft: <><path d="M10 4l-4 4 4 4"/></>,
    bell:     <><path d="M4 11.5V8a4 4 0 018 0v3.5M3 11.5h10M6.5 13.5a1.5 1.5 0 003 0"/></>,
    more:     <><circle cx="4" cy="8" r=".8"/><circle cx="8" cy="8" r=".8"/><circle cx="12" cy="8" r=".8"/></>,
    moreVert: <><circle cx="8" cy="4" r=".8"/><circle cx="8" cy="8" r=".8"/><circle cx="8" cy="12" r=".8"/></>,
    arrowRight:<><path d="M3 8h10M9 4l4 4-4 4"/></>,
    arrowUp:  <><path d="M8 13V3M4 7l4-4 4 4"/></>,
    trend:    <><path d="M2 12l4-4 3 3 5-6M10 5h3v3"/></>,
    edit:     <><path d="M10 2.5l3.5 3.5L6 13.5H2.5V10z"/></>,
    trash:    <><path d="M3 4.5h10M5.5 4.5V3c0-.3.2-.5.5-.5h4c.3 0 .5.2.5.5v1.5M4 4.5l.5 8c0 .3.2.5.5.5h6c.3 0 .5-.2.5-.5l.5-8"/></>,
    copy:     <><rect x="5" y="5" width="8" height="8" rx="1"/><path d="M3 10V4c0-.5.5-1 1-1h6"/></>,
    check:    <><path d="M3 8l3.5 3.5L13 5"/></>,
    clock:    <><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/></>,
    send:     <><path d="M14 2L2 7.5l5 2M14 2l-4.5 12-2-5M14 2L7 9"/></>,
    image:    <><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><circle cx="6" cy="6" r="1"/><path d="M2.5 11l3-3 3 3M8.5 10l2.5-2.5 2.5 2.5"/></>,
    grid:     <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx=".5"/><rect x="9" y="2.5" width="4.5" height="4.5" rx=".5"/><rect x="2.5" y="9" width="4.5" height="4.5" rx=".5"/><rect x="9" y="9" width="4.5" height="4.5" rx=".5"/></>,
    list:     <><path d="M5 4h9M5 8h9M5 12h9M2.5 4h.5M2.5 8h.5M2.5 12h.5"/></>,
    globe:    <><circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c1.5 2 2.5 3.5 2.5 5.5s-1 3.5-2.5 5.5C6.5 11.5 5.5 10 5.5 8s1-3.5 2.5-5.5z"/></>,
    quote:    <><path d="M3 6c0-1.5 1-2.5 2.5-2.5V5c-.5 0-1 .5-1 1h1V10H3V6zM9 6c0-1.5 1-2.5 2.5-2.5V5c-.5 0-1 .5-1 1h1V10H9V6z"/></>,
    news:     <><rect x="2" y="3" width="11" height="10" rx="1"/><path d="M13 6h1.5v6.5c0 .3-.2.5-.5.5h-1M4.5 6h5M4.5 8.5h5M4.5 11h3"/></>,
    flame:    <><path d="M8 2c0 2-2 3-2 5 0 1 .5 1.5 1 2-1 0-2.5-1-2.5-3 0 4 2 7 5.5 7s5.5-3 5.5-7c0-3-2-4.5-4-6.5 0 1 0 2-1 2.5-1 .5-2.5 0-2.5 0z"/></>,
    mic:      <><rect x="6" y="2" width="4" height="8" rx="2"/><path d="M3.5 8A4.5 4.5 0 008 12.5 4.5 4.5 0 0012.5 8M8 12.5V14.5M5.5 14.5h5"/></>,
    target:   <><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r=".8" fill="currentColor"/></>,
    pin:      <><path d="M6.5 2h3l-.5 3 2 2-1 1H6l-1-1 2-2-.5-3zM8 9v5"/></>,
    filter:   <><path d="M2 4h12l-4.5 5v4l-3 1.5v-5.5z"/></>,
    link:     <><path d="M7 9l2-2M6 11l-1 1a2 2 0 01-3-3l1-1M10 5l1-1a2 2 0 013 3l-1 1"/></>,
    heart:    <><path d="M8 13.5s-5-3-5-7a2.5 2.5 0 015-1 2.5 2.5 0 015 1c0 4-5 7-5 7z"/></>,
    eye:      <><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></>,
    bolt:     <><path d="M9 2L3.5 9H8l-1 5 5.5-7H8l1-5z"/></>,
    logout:   <><path d="M6 3H3.5C3.2 3 3 3.2 3 3.5v9c0 .3.2.5.5.5H6M10 5l3 3-3 3M13 8H6"/></>,
    refresh:  <><path d="M13 4.5A6 6 0 108 14M13 2v3h-3"/></>,
    x:        <><path d="M4 4l8 8M12 4l-8 8"/></>,
  };
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || null}
    </svg>
  );
};

// ═══ COMMAND PALETTE ═══════════════════════════════════════════════════════
const CMD_ITEMS = [
  { label: 'Générer un post',       icon: 'sparkle',  nav: 'generate' },
  { label: 'Calendrier',            icon: 'calendar', nav: 'calendar'  },
  { label: 'Pulse — Veille live',    icon: 'flame',    nav: 'pulse'     },
  { label: 'Sources & veille',      icon: 'news',     nav: 'sources'   },
  { label: 'Identité de marque',    icon: 'palette',  nav: 'brand'     },
  { label: 'Paramètres',            icon: 'settings', nav: 'settings'  },
];
const CommandPalette = ({ onNav, onClose }) => {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const items = q.trim()
    ? CMD_ITEMS.filter(i => i.label.toLowerCase().includes(q.toLowerCase()))
    : CMD_ITEMS;
  return (
    <>
      <div className="cmd-backdrop" onClick={onClose}/>
      <div className="cmd-palette">
        <div className="cmd-input-row">
          <AppIcon name="search" size={15} className="cmd-search-icon"/>
          <input ref={inputRef} className="cmd-input" placeholder="Naviguer vers…"
            value={q} onChange={e => setQ(e.target.value)}/>
          <span className="kbd" style={{fontSize:10,opacity:.5}}>ESC</span>
        </div>
        <div className="cmd-list">
          {items.map(it => (
            <button key={it.nav} className="cmd-item" onClick={() => { onNav(it.nav); onClose(); }}>
              <AppIcon name={it.icon} size={14}/>
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

// ═══ SIDEBAR ═══════════════════════════════════════════════════════════════
const Sidebar = ({ current, onNav, counts = {}, profile = null, authUser = null, clients = [], activeClientId = null, brandScore = 0, onSelectClient, onNewClient, prefs = {} }) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(o => !o); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const email = authUser?.email || '';
  const fullName = authUser?.user_metadata?.full_name;
  const displayName = fullName || email.split('@')[0] || 'Compte';
  const initials = fullName
    ? fullName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
    : (email.split('@')[0] || '?').slice(0,2).toUpperCase();
  const plan = profile?.plan || 'free';
  const credits = profile?.credits ?? 0;
  const creditsMax = plan === 'pro' ? 150 : 30;
  const creditsPct = Math.min(100, credits > 0 ? Math.round(credits / creditsMax * 100) : 0);
  const planLabel = { pro: 'Pro', free: 'Free', starter: 'Starter' }[plan] || 'Free';

  const mainItems = [
    { key: 'generate', icon: 'sparkle',  label: 'Générer' },
    ...(prefs.pulseMode ? [{ key: 'pulse', icon: 'flame', label: 'Pulse', badge: true, count: counts.pulse || null }] : []),
    { key: 'calendar', icon: 'calendar', label: 'Calendrier' },
  ];
  const bottomItems = [
    { key: 'sources',  icon: 'news',     label: 'Sources & veille', count: counts.sources || 3 },
    { key: 'settings', icon: 'settings', label: 'Paramètres' },
  ];

  return (<>
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="assets/forje-logo.png" alt="" className="sidebar-brand-mark" />
        Forje <span className="brand-suffix">Studio</span>
      </div>

      <div className="workspace-switcher">
        <div className="workspace-avatar">{initials}</div>
        <div className="workspace-meta">
          <div className="workspace-name">{displayName}</div>
        </div>
        <AppIcon name="chevDown" size={14} className="workspace-chev"/>
      </div>

      <div className="sidebar-search" onClick={() => setCmdOpen(true)} style={{cursor:'pointer'}}>
        <AppIcon name="search" size={13}/>
        <span>Rechercher</span>
        <span className="kbd">⌘K</span>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Studio</div>
        {mainItems.map(item => (
          <div key={item.key}
               className={`sidebar-item ${current === item.key ? 'active' : ''}`}
               onClick={() => onNav(item.key)}>
            <AppIcon name={item.icon} className="icon"/>
            <span>{item.label}</span>
            {item.count != null && (
              <span className={`count ${item.badge ? 'badge' : ''}`}>{item.count}</span>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Atelier</div>

        {/* Identité de marque */}
        <div className={`sidebar-item ${current === 'brand' ? 'active' : ''}`}
             onClick={() => onNav('brand')}>
          <AppIcon name="palette" className="icon"/>
          <span>Identité de marque</span>
          {brandScore < 7 && (
            <span className="sidebar-brand-score" title={`Profil ${brandScore}/7 complété`}>
              {brandScore}/7
            </span>
          )}
        </div>

        {/* Switcher de comptes */}
        <div className="sidebar-accounts">
          {clients.map(function(c) {
            var initials = (c.name || '?').replace(/[^a-zA-Z0-9À-ɏ]/g, '').slice(0, 2).toUpperCase() || '?';
            var isActive = c.id === activeClientId;
            return (
              <div key={c.id}
                   className={'sidebar-account-item' + (isActive ? ' active' : '')}
                   onClick={function() { onSelectClient && onSelectClient(c.id); }}>
                <div className="sidebar-account-avatar">
                  {c.logo_url
                    ? <img src={c.logo_url} alt=""/>
                    : initials}
                </div>
                <div className="sidebar-account-meta">
                  <div className="sidebar-account-name">{c.name || 'Sans nom'}</div>
                  {c.instagram_handle && (
                    <div className="sidebar-account-handle">{c.instagram_handle}</div>
                  )}
                </div>
              </div>
            );
          })}
          {clients.length < 5 && (
            <div className="sidebar-account-add"
                 onClick={function() { onNewClient && onNewClient(); }}>
              <AppIcon name="plus" size={12}/>
              <span>Nouveau compte</span>
            </div>
          )}
        </div>

        {/* Autres items */}
        {bottomItems.map(item => (
          <div key={item.key}
               className={`sidebar-item ${current === item.key ? 'active' : ''}`}
               onClick={() => onNav(item.key)}>
            <AppIcon name={item.icon} className="icon"/>
            <span>{item.label}</span>
            {item.count != null && <span className="count">{item.count}</span>}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-usage">
          <div className="sidebar-usage-header">
            <span className="sidebar-usage-label">Crédits de création</span>
            <span className="sidebar-usage-count">{credits} / {creditsMax}</span>
          </div>
          <div className="sidebar-usage-bar">
            <div className="sidebar-usage-fill" style={{width: creditsPct + '%'}}/>
          </div>
          <span className="sidebar-usage-cta" style={{cursor:'pointer'}} onClick={() => onNav('settings')}>Augmenter la cadence →</span>
        </div>

        <div className="sidebar-user" ref={menuRef}>
          {userMenuOpen && (
            <div className="sidebar-user-menu">
              <div className="sum-email">{email}</div>
              <span className="sum-badge">{planLabel}</span>
              <div className="sum-divider"/>
              <button className="sum-signout" onClick={() => { setUserMenuOpen(false); window.__signOut?.(); }}>
                <AppIcon name="logout" size={14}/>
                Se déconnecter
              </button>
            </div>
          )}
          <div className="sidebar-user-trigger" onClick={() => setUserMenuOpen(o => !o)}>
            <div className="sidebar-user-avatar">{initials}</div>
            <span className="sidebar-user-name">{displayName}</span>
            <AppIcon name="chevDown" size={13} className={`sidebar-user-chev${userMenuOpen ? ' open' : ''}`}/>
          </div>
        </div>
      </div>
    </aside>
    {cmdOpen && <CommandPalette onNav={onNav} onClose={() => setCmdOpen(false)}/>}
  </>);
};

// ═══ TOPBAR ════════════════════════════════════════════════════════════════
const Topbar = ({ breadcrumb = [], actions = null }) => (
  <header className="topbar">
    <div className="topbar-breadcrumb">
      {breadcrumb.map((crumb, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="crumb-sep">/</span>}
          <span className={i === breadcrumb.length - 1 ? 'crumb-current' : ''}>{crumb}</span>
        </React.Fragment>
      ))}
    </div>
    <div className="topbar-actions">
      {actions || (
        <button className="btn btn-ghost btn-icon" title="Notifications"><AppIcon name="bell"/></button>
      )}
    </div>
  </header>
);

// ═══ BUTTONS (helpers) ═════════════════════════════════════════════════════
const Btn = ({ variant = 'ghost', size, icon, children, onClick, onBlur, style, disabled, className }) => (
  <button
    className={`btn btn-${variant}${size ? ' btn-' + size : ''}${className ? ' ' + className : ''}`}
    onClick={onClick}
    onBlur={onBlur}
    disabled={disabled}
    style={style}
  >
    {icon && <AppIcon name={icon} size={13}/>}
    {children}
  </button>
);

Object.assign(window, { AppIcon, Sidebar, Topbar, Btn });
