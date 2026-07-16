/* global React, AppIcon, Btn */
var { useState, useEffect, useRef } = React;

// ═══════════════════════════════════════════════════════════════════════════
// VEILLE ONBOARDING — intégré dans le SaaS Forje
// ═══════════════════════════════════════════════════════════════════════════

const VEILLE_API = '/api';

async function veilleFetch(path, opts) {
  var sb = window.__supabase;
  var token = null;
  if (sb) { var sess = await sb.auth.getSession(); token = sess.data?.session?.access_token; }
  var headers = Object.assign({ 'Content-Type': 'application/json' }, opts && opts.headers);
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(VEILLE_API + path, Object.assign({}, opts, { headers }));
}

const LOADING_STEPS = [
  { msg: 'Recherche du compte…',               delay: 0     },
  { msg: 'Analyse de la ligne éditoriale…',    delay: 4500  },
  { msg: 'Identification des concurrents…',    delay: 10000 },
  { msg: 'Découverte des flux RSS sources…',   delay: 18000 },
  { msg: 'Génération du profil complet…',      delay: 26000 },
];

const FIELD_GROUPS = [
  {
    id: 'identite', title: 'Identité',
    fields: [
      { key: 'nom',     label: 'Nom du compte', type: 'text'   },
      { key: 'langue',  label: 'Langue',         type: 'text'   },
      { key: 'abonnes', label: 'Abonnés',         type: 'number' },
    ],
  },
  {
    id: 'editorial', title: 'Éditorial',
    fields: [
      { key: 'niche_principale',          label: 'Niche principale',             type: 'text' },
      { key: 'sous_niches',               label: 'Sous-niches',                  type: 'tags' },
      { key: 'ton',                       label: 'Ton éditorial',                type: 'text' },
      { key: 'angle_editorial',           label: 'Angle éditorial',              type: 'text' },
      { key: 'niveau_expertise_audience', label: "Niveau d'expertise audience",  type: 'text' },
      { key: 'references_culturelles',    label: 'Références culturelles',       type: 'tags' },
      { key: 'sujets_a_eviter',           label: 'Sujets à éviter',              type: 'tags' },
    ],
  },
  {
    id: 'formats', title: 'Formats & Rythme',
    fields: [
      { key: 'formats_favoris',           label: 'Formats favoris',             type: 'tags' },
      { key: 'ratio_contenu',             label: 'Ratio de contenu',            type: 'text' },
      { key: 'horaires_pic_engagement',   label: "Créneaux d'engagement",       type: 'tags' },
      { key: 'fenetre_reaction_breaking', label: 'Fenêtre breaking',            type: 'text' },
      { key: 'fenetre_reaction_trending', label: 'Fenêtre trending',            type: 'text' },
    ],
  },
  {
    id: 'audience', title: 'Audience',
    fields: [
      { key: 'audience_age',  label: "Tranche d'âge",  type: 'text' },
      { key: 'audience_type', label: "Type d'audience", type: 'text' },
    ],
  },
  {
    id: 'sources', title: 'Sources & Concurrents',
    fields: [
      { key: 'sources_prioritaires', label: 'Sources prioritaires', type: 'tags' },
      { key: 'sources_secondaires',  label: 'Sources secondaires',  type: 'tags' },
      { key: 'concurrents',          label: 'Comptes concurrents',   type: 'tags' },
      { key: 'keywords_niche',       label: 'Keywords niche',        type: 'tags' },
      { key: 'hashtags_typiques',    label: 'Hashtags typiques',     type: 'tags' },
    ],
  },
];

// ─── TagInput ────────────────────────────────────────────────────────────────
const TagInput = ({ value = [], onChange }) => {
  const [input, setInput] = useState('');
  const ref = useRef(null);

  const add = (raw) => {
    const v = raw.trim().replace(/^[@#]/, '');
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput('');
  };

  const onKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) { e.preventDefault(); add(input); }
    if (e.key === 'Backspace' && !input && value.length) onChange(value.slice(0, -1));
  };

  return (
    <div
      style={{
        display:'flex', flexWrap:'wrap', gap:5, alignItems:'center',
        background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
        borderRadius:'var(--radius)', padding:'7px 10px', cursor:'text', minHeight:42,
      }}
      onClick={() => ref.current?.focus()}
    >
      {value.map((tag, i) => (
        <span key={i} style={{
          display:'inline-flex', alignItems:'center', gap:4,
          background:'var(--app-surface)', border:'1px solid var(--app-line)',
          borderRadius:6, padding:'3px 8px 3px 9px',
          fontSize:12, color:'var(--app-fg-2)',
        }}>
          {tag}
          <button
            style={{ all:'unset', cursor:'pointer', color:'var(--app-fg-4)', fontSize:14, lineHeight:1, display:'grid', placeItems:'center' }}
            onMouseEnter={e => e.target.style.color='var(--app-fg)'}
            onMouseLeave={e => e.target.style.color='var(--app-fg-4)'}
            onClick={e => { e.stopPropagation(); onChange(value.filter((_,j) => j !== i)); }}
          >×</button>
        </span>
      ))}
      <input
        ref={ref}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => input.trim() && add(input)}
        placeholder={value.length === 0 ? 'Ajouter… (Entrée)' : ''}
        style={{
          background:'transparent', border:'none', outline:'none',
          color:'var(--app-fg)', fontSize:13, fontFamily:'DM Sans, sans-serif', flex:1, minWidth:80,
        }}
      />
    </div>
  );
};

// ─── FieldRow ─────────────────────────────────────────────────────────────────
const FieldRow = ({ field, value, onChange }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
    <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--app-fg-3)' }}>
      {field.label}
    </div>
    {field.type === 'tags' ? (
      <TagInput value={Array.isArray(value) ? value : []} onChange={onChange}/>
    ) : (
      <input
        type={field.type}
        value={value ?? ''}
        onChange={e => onChange(field.type === 'number' ? (e.target.value ? parseInt(e.target.value) : null) : e.target.value)}
        placeholder="—"
        style={{
          background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
          borderRadius:'var(--radius)', padding:'9px 12px',
          color:'var(--app-fg)', fontFamily:'DM Sans, sans-serif', fontSize:13,
          outline:'none', width:'100%', boxSizing:'border-box',
          transition:'border-color .15s, box-shadow .15s',
        }}
        onFocus={e => { e.target.style.borderColor='var(--app-accent)'; e.target.style.boxShadow='0 0 0 3px rgba(79,91,213,.08)'; }}
        onBlur={e  => { e.target.style.borderColor='var(--app-line)';   e.target.style.boxShadow='none'; }}
      />
    )}
  </div>
);

// ─── Step 1 : Saisie URL ──────────────────────────────────────────────────────
const IG_EXAMPLES = ['@footmercato', '@brutofficiel', '@voguefrance', '@lesechos', '@konbini'];

const SetupInput = ({ onAnalyze, error }) => {
  const [url, setUrl] = useState('');
  const [localErr, setLocalErr] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const v = url.trim();
    if (!v) { setLocalErr('Colle une URL Instagram.'); return; }
    onAnalyze(v);
  };

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sources & Veille</h1>
          <p className="page-subtitle">Configure ton compte Instagram pour activer la veille temps réel.</p>
        </div>
      </div>

      <div style={{ maxWidth:520, margin:'0 auto', padding:'16px 0' }}>
        <div className="card card-pad" style={{ padding:'40px 36px' }}>
          <div style={{ marginBottom:32, display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--app-fg-2)' }}>
              Quel est le compte Instagram à analyser ?
            </div>
            <div style={{ fontSize:13, color:'var(--app-fg-3)' }}>
              Forje va analyser son univers éditorial, ses concurrents et construire ton profil de veille automatiquement.
            </div>
          </div>

          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--app-fg-3)' }}>
                URL ou handle
              </div>
              <input
                type="text"
                value={url}
                onChange={e => { setUrl(e.target.value); setLocalErr(''); }}
                placeholder="https://instagram.com/compte  ou  @compte"
                autoFocus
                style={{
                  background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
                  borderRadius:'var(--radius)', padding:'11px 14px',
                  color:'var(--app-fg)', fontFamily:'JetBrains Mono, DM Sans, monospace', fontSize:13,
                  outline:'none', width:'100%', boxSizing:'border-box',
                  transition:'border-color .15s, box-shadow .15s',
                }}
                onFocus={e => { e.target.style.borderColor='var(--app-accent)'; e.target.style.boxShadow='0 0 0 3px rgba(79,91,213,.08)'; }}
                onBlur={e  => { e.target.style.borderColor='var(--app-line)';   e.target.style.boxShadow='none'; }}
              />
              {(localErr || error) && (
                <div style={{ fontSize:12, color:'#C53030' }}>{localErr || error}</div>
              )}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginTop:4 }}>
              {IG_EXAMPLES.map(ex => (
                <button key={ex} type="button"
                  onClick={() => { setUrl(ex); setLocalErr(''); }}
                  style={{ background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
                    borderRadius:20, padding:'4px 11px', fontSize:12, color:'var(--app-fg-3)',
                    cursor:'pointer', transition:'all .12s', fontFamily:'JetBrains Mono, monospace' }}
                  onMouseEnter={e => { e.target.style.borderColor='var(--app-accent)'; e.target.style.color='var(--app-accent)'; }}
                  onMouseLeave={e => { e.target.style.borderColor='var(--app-line)'; e.target.style.color='var(--app-fg-3)'; }}>
                  {ex}
                </button>
              ))}
            </div>
            <button type="submit" className="btn btn-primary" style={{ width:'100%', padding:'12px', fontSize:14, marginTop:8 }}>
              <AppIcon name="sparkle" size={13}/>
              Analyser le compte
            </button>
          </form>

          <div style={{ marginTop:28, display:'flex', gap:20, padding:'0 4px' }}>
            {[
              { icon:'search',  label:'Analyse IA',    desc:'Claude scanne l\'univers du compte' },
              { icon:'bolt',    label:'Scoring',       desc:'News scorées en temps réel' },
              { icon:'target',  label:'Apprentissage', desc:'S\'adapte à tes choix éditoriaux' },
            ].map(f => (
              <div key={f.label} style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5, color:'var(--app-accent)', fontSize:12, fontWeight:600 }}>
                  <AppIcon name={f.icon} size={12}/> {f.label}
                </div>
                <div style={{ fontSize:11.5, color:'var(--app-fg-3)', lineHeight:1.4 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Step 2 : Chargement ──────────────────────────────────────────────────────
const LOADING_ERROR_LABELS = {
  private:  { icon: '🔒', title: 'Compte privé', desc: 'Ce compte Instagram est privé. Entre un compte public ou un handle différent.' },
  notfound: { icon: '🔍', title: 'Compte introuvable', desc: 'Aucun compte trouvé à cette adresse. Vérifie l\'URL ou le handle.' },
  timeout:  { icon: '⏱', title: 'Délai dépassé', desc: 'L\'analyse a pris trop de temps. Réessaie dans quelques secondes.' },
  ratelimit:{ icon: '⚡', title: 'Limite atteinte', desc: 'Trop de requêtes simultanées. Attends quelques secondes et réessaie.' },
  default:  { icon: '⚠', title: 'Analyse échouée', desc: null },
};

function classifyError(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('privé') || m.includes('private')) return 'private';
  if (m.includes('introuvable') || m.includes('not found') || m.includes('404')) return 'notfound';
  if (m.includes('timeout') || m.includes('délai')) return 'timeout';
  if (m.includes('rate') || m.includes('limit') || m.includes('429')) return 'ratelimit';
  return 'default';
}

const SetupLoading = ({ url, error, onRetry }) => {
  const [msgs, setMsgs] = useState([LOADING_STEPS[0].msg]);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (error) return;
    const timers = LOADING_STEPS.slice(1).map(({ msg, delay }) =>
      setTimeout(() => setMsgs(prev => [...prev, msg]), delay)
    );
    const dotTimer = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => { timers.forEach(clearTimeout); clearInterval(dotTimer); };
  }, [error]);

  const pct = Math.min(90, ((msgs.length - 1) / (LOADING_STEPS.length - 1)) * 90);

  if (error) {
    const kind = classifyError(error);
    const label = LOADING_ERROR_LABELS[kind];
    return (
      <div className="page-body">
        <div className="page-header">
          <div>
            <h1 className="page-title">Analyse échouée</h1>
            <p className="page-subtitle" style={{ fontFamily:'JetBrains Mono, monospace', fontSize:12 }}>{url}</p>
          </div>
        </div>
        <div style={{ maxWidth:480, margin:'0 auto', padding:'16px 0' }}>
          <div className="card card-pad" style={{ padding:'36px 32px', display:'flex', flexDirection:'column', alignItems:'center', gap:20, textAlign:'center' }}>
            <div style={{ fontSize:36 }}>{label.icon}</div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--app-fg)', marginBottom:8 }}>{label.title}</div>
              <div style={{ fontSize:13, color:'var(--app-fg-3)', lineHeight:1.5 }}>
                {label.desc || error}
              </div>
              {kind === 'default' && (
                <div style={{ marginTop:8, fontSize:12, color:'var(--app-fg-4)', fontFamily:'JetBrains Mono, monospace' }}>{error}</div>
              )}
            </div>
            <button
              className="btn btn-primary"
              onClick={onRetry}
              style={{ padding:'10px 28px', fontSize:13 }}
            >
              <AppIcon name="refresh" size={13}/> Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analyse en cours…</h1>
          <p className="page-subtitle" style={{ fontFamily:'JetBrains Mono, monospace', fontSize:12 }}>{url}</p>
        </div>
      </div>

      <div style={{ maxWidth:480, margin:'0 auto', padding:'16px 0' }}>
        <div className="card card-pad" style={{ padding:'36px 32px' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:18, marginBottom:28 }}>
            {msgs.map((msg, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, animation:'fadeIn .3s ease' }}>
                {i < msgs.length - 1 ? (
                  <div style={{ width:8, height:8, borderRadius:'50%', background:'#22C55E', flexShrink:0 }}/>
                ) : (
                  <div style={{
                    width:8, height:8, borderRadius:'50%', background:'var(--app-accent)', flexShrink:0,
                    animation:'pulse 1.2s ease-in-out infinite',
                  }}/>
                )}
                <span style={{ fontSize:14, color: i < msgs.length - 1 ? 'var(--app-fg-3)' : 'var(--app-fg)' }}>
                  {msg}{i === msgs.length - 1 ? dots : ''}
                </span>
              </div>
            ))}
          </div>

          <div style={{ background:'var(--app-surface-2)', borderRadius:4, height:4, overflow:'hidden' }}>
            <div style={{
              height:'100%', background:'var(--app-accent)',
              width:`${pct}%`, transition:'width 2s ease', borderRadius:4,
            }}/>
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} } @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  );
};

// ─── Step 3 : Validation ──────────────────────────────────────────────────────
const SetupValidation = ({ profil: init, onSave, authUser }) => {
  const [profil, setProfil] = useState(init);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Twitter sources — détectées par Agent 1 + ajouts manuels
  const detected = init.comptes_twitter_sources || [];
  const [enabledHandles, setEnabledHandles] = useState(() => new Set(detected.map(s => s.handle)));
  const [extraSources, setExtraSources]     = useState([]);
  const [extraInput, setExtraInput]         = useState('');

  const toggleHandle = (handle) => setEnabledHandles(prev => {
    const n = new Set(prev);
    n.has(handle) ? n.delete(handle) : n.add(handle);
    return n;
  });

  const addExtraSource = () => {
    const h = extraInput.replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\//, '').split(/[/?]/)[0].trim();
    if (!h) return;
    if ([...detected, ...extraSources].some(s => s.handle === h)) { setExtraInput(''); return; }
    setExtraSources(prev => [...prev, { handle: h, nom: null, type: 'journaliste', vitesse: 'rapide', fiabilite: 8, pourquoi: 'Ajouté manuellement' }]);
    setEnabledHandles(prev => new Set([...prev, h]));
    setExtraInput('');
  };

  const score = profil.score_confiance ?? 0;
  const pct   = Math.round(score * 100);
  const scoreColor = score >= 0.7 ? '#15803D' : score >= 0.5 ? '#B45309' : '#C53030';
  const scoreBg    = score >= 0.7 ? 'rgba(34,197,94,.08)' : score >= 0.5 ? 'rgba(245,158,11,.08)' : 'rgba(197,48,48,.08)';
  const scoreBorder= score >= 0.7 ? 'rgba(34,197,94,.2)'  : score >= 0.5 ? 'rgba(245,158,11,.2)' : 'rgba(197,48,48,.2)';

  const update = (k, v) => setProfil(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res  = await veilleFetch(`/onboarding/save`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          profil,
          user_id: authUser?.id || null,
          twitter_sources: [...detected, ...extraSources].filter(s => enabledHandles.has(s.handle)),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      localStorage.setItem('veille_compte_id', json.compte_id);
      localStorage.setItem('veille_profil', JSON.stringify(profil));
      onSave(json.compte_id);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profil détecté</h1>
          <p className="page-subtitle">Vérifie et ajuste avant d'activer la veille.</p>
        </div>
        <div className="page-header-actions">
          <span style={{
            display:'inline-flex', alignItems:'center', gap:7,
            background:scoreBg, border:`1px solid ${scoreBorder}`,
            borderRadius:8, padding:'6px 14px', fontSize:13, fontWeight:600, color:scoreColor,
          }}>
            {score >= 0.7 ? '●' : '◐'} Profil détecté à {pct}%
          </span>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Activer la veille →'}
          </button>
        </div>
      </div>

      {score < 0.5 && (
        <div style={{
          background:'rgba(197,48,48,.06)', border:'1px solid rgba(197,48,48,.15)',
          borderRadius:10, padding:'10px 16px', marginBottom:20,
          fontSize:13, color:'#C53030', display:'flex', gap:8, alignItems:'center',
        }}>
          <AppIcon name="bolt" size={13}/>
          Données insuffisantes — complète les champs manuellement pour de meilleurs résultats.
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {/* Compte */}
        <div className="card card-pad" style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 20px' }}>
          <div style={{ width:32, height:32, borderRadius:8, background:'rgba(79,91,213,.1)', display:'grid', placeItems:'center', flexShrink:0 }}>
            <AppIcon name="globe" size={14} style={{ color:'var(--app-accent)' }}/>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--app-fg-3)', marginBottom:2 }}>Compte analysé</div>
            <div style={{ fontSize:13, fontFamily:'JetBrains Mono, monospace', color:'var(--app-accent)' }}>{profil.instagram_url}</div>
          </div>
        </div>

        {FIELD_GROUPS.map(group => (
          <div key={group.id} className="card card-pad">
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--app-fg-3)', marginBottom:20 }}>
              {group.title}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'16px 20px' }}>
              {group.fields.map(f => (
                <div key={f.key} style={f.type === 'tags' ? { gridColumn:'1 / -1' } : {}}>
                  <FieldRow field={f} value={profil[f.key]} onChange={v => update(f.key, v)}/>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sources Twitter détectées ── */}
      {(detected.length > 0 || extraSources.length > 0) && (
        <div className="card card-pad" style={{ marginTop:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color:'var(--app-fg-2)' }}>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--app-fg-3)' }}>
                Sources Twitter détectées ({[...detected, ...extraSources].length})
              </span>
            </div>
            <span style={{ fontSize:11, color:'var(--app-fg-4)' }}>{enabledHandles.size} actives</span>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(290px, 1fr))', gap:10, marginBottom:16 }}>
            {[...detected, ...extraSources].map(src => {
              const on = enabledHandles.has(src.handle);
              return (
                <div key={src.handle} style={{
                  display:'flex', gap:12, padding:'12px 14px',
                  background: on ? 'var(--app-surface-2)' : 'var(--app-surface)',
                  border:`1px solid ${on ? 'var(--app-line)' : 'var(--app-line)'}`,
                  borderRadius:10, opacity: on ? 1 : 0.45, transition:'all .15s', position:'relative',
                }}>
                  <img
                    src={`https://unavatar.io/twitter/${src.handle}`}
                    alt={`@${src.handle}`}
                    style={{ width:38, height:38, borderRadius:'50%', objectFit:'cover', flexShrink:0, background:'var(--app-line)' }}
                    onError={e => { e.target.src = ''; e.target.style.background='var(--app-line)'; }}
                  />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--app-fg)' }}>@{src.handle}</div>
                        {src.nom && <div style={{ fontSize:11, color:'var(--app-fg-3)', marginTop:1 }}>{src.nom}</div>}
                      </div>
                      <button
                        onClick={() => toggleHandle(src.handle)}
                        style={{
                          all:'unset', cursor:'pointer', flexShrink:0,
                          width:36, height:20, borderRadius:10,
                          background: on ? 'var(--app-accent)' : 'var(--app-line)',
                          position:'relative', transition:'background .2s',
                        }}
                      >
                        <span style={{
                          position:'absolute', top:2, left: on ? 18 : 2,
                          width:16, height:16, borderRadius:'50%', background:'#fff',
                          transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)',
                        }}/>
                      </button>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:6 }}>
                      {src.type && (
                        <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', padding:'2px 7px', borderRadius:5, background:'rgba(79,91,213,.08)', color:'var(--app-accent)' }}>
                          {src.type.replace('_', ' ')}
                        </span>
                      )}
                      {src.vitesse === 'breaking' && <span style={{ fontSize:11 }}>🔴 breaking</span>}
                      {src.vitesse === 'rapide'   && <span style={{ fontSize:11 }}>🟡 rapide</span>}
                      {src.vitesse === 'analyse'  && <span style={{ fontSize:11 }}>🔵 analyse</span>}
                      {src.fiabilite && (
                        <span style={{ fontSize:11, color:'var(--app-fg-3)', marginLeft:'auto' }}>★ {src.fiabilite}/10</span>
                      )}
                    </div>
                    {src.pourquoi && (
                      <div style={{ fontSize:11, color:'var(--app-fg-3)', marginTop:5, lineHeight:1.4 }}>{src.pourquoi}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ajout manuel */}
          <div style={{ display:'flex', gap:10 }}>
            <input
              type="text"
              value={extraInput}
              onChange={e => setExtraInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addExtraSource()}
              placeholder="Ajouter @handle manuellement…"
              style={{
                flex:1, background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
                borderRadius:'var(--radius)', padding:'8px 12px',
                color:'var(--app-fg)', fontFamily:'DM Sans, sans-serif', fontSize:13,
                outline:'none', transition:'border-color .15s',
              }}
              onFocus={e => e.target.style.borderColor='var(--app-accent)'}
              onBlur={e  => e.target.style.borderColor='var(--app-line)'}
            />
            <button
              className="btn btn-ghost btn-sm"
              onClick={addExtraSource}
              disabled={!extraInput.trim()}
              style={{ whiteSpace:'nowrap' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Ajouter
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(197,48,48,.06)', border:'1px solid rgba(197,48,48,.15)', borderRadius:8, fontSize:13, color:'#C53030' }}>
          {error}
        </div>
      )}
      <div style={{ height:48 }}/>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// BOARD VEILLE — écran principal (données demo, sera remplacé Step 4)
// ═══════════════════════════════════════════════════════════════════════════

// ─── BarreTendances ───────────────────────────────────────────────────────────
const fmtVolume = (v) => {
  if (!v) return '—';
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `${Math.round(v / 1000)}k`;
  return String(v);
};

const BarreTendances = ({ tendances, onTrendClick }) => {
  if (!tendances || tendances.length === 0) return null;
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'8px 20px',
      borderBottom:'1px solid var(--app-line)', overflowX:'auto',
      background:'var(--app-surface)', flexShrink:0,
    }}>
      <span style={{ fontSize:11, fontWeight:700, color:'var(--app-fg-3)', whiteSpace:'nowrap', letterSpacing:'0.05em' }}>
        🔥 DANS TA NICHE
      </span>
      <div style={{ display:'flex', gap:7, flex:1, overflowX:'auto', paddingBottom:2 }}>
        {tendances.map((t, i) => (
          <button
            key={i}
            onClick={() => onTrendClick?.(t)}
            style={{
              all:'unset', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6,
              background: t.pertinent ? 'rgba(79,91,213,.07)' : 'var(--app-surface-2)',
              border: `1px solid ${t.pertinent ? 'rgba(79,91,213,.3)' : 'var(--app-line)'}`,
              borderRadius:20, padding:'4px 12px', whiteSpace:'nowrap', flexShrink:0,
              transition:'border-color .15s, background .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='var(--app-accent)'; e.currentTarget.style.background='rgba(79,91,213,.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = t.pertinent ? 'rgba(79,91,213,.3)' : 'var(--app-line)'; e.currentTarget.style.background = t.pertinent ? 'rgba(79,91,213,.07)' : 'var(--app-surface-2)'; }}
          >
            {t.pertinent && <span style={{ fontSize:9, color:'var(--app-accent)' }}>◆</span>}
            <span style={{ fontSize:12, fontWeight: t.pertinent ? 700 : 600, color: t.pertinent ? 'var(--app-accent)' : 'var(--app-fg-2)' }}>{t.name}</span>
            {t.tweet_volume > 0 && (
              <span style={{ fontSize:10, color:'var(--app-fg-4)' }}>{fmtVolume(t.tweet_volume)}</span>
            )}
            <span style={{
              fontSize:9, fontWeight:700, letterSpacing:'0.05em',
              padding:'1px 5px', borderRadius:4,
              background: t.geo === 'FR' ? 'rgba(59,130,246,.1)' : 'rgba(99,102,241,.1)',
              color:       t.geo === 'FR' ? '#3B82F6'             : 'var(--app-accent)',
            }}>{t.geo}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const HEAT_TOPICS = [
  { name:"Camel saturé",       level:3, delta:"+47%", series:[0.2,0.3,0.25,0.5,0.7,0.85,0.95] },
  { name:"Made-in-Roubaix",    level:3, delta:"+38%", series:[0.1,0.15,0.2,0.4,0.55,0.7,0.82] },
  { name:"Relocalisation",     level:3, delta:"+29%", series:[0.35,0.4,0.5,0.6,0.65,0.75,0.78] },
  { name:"Artisans de France", level:2, delta:"+18%", series:[0.3,0.4,0.45,0.5,0.55,0.58,0.62] },
  { name:"Tannage végétal",    level:2, delta:"+12%", series:[0.4,0.42,0.45,0.5,0.52,0.55,0.56] },
  { name:"Minimalisme",        level:1, delta:"+5%",  series:[0.5,0.48,0.5,0.51,0.52,0.52,0.53] },
  { name:"Greenwashing",       level:1, delta:"—",    series:[0.4,0.4,0.41,0.4,0.4,0.39,0.4]   },
  { name:"Logomania",          level:0, delta:"-8%",  series:[0.6,0.58,0.55,0.52,0.48,0.44,0.4] },
  { name:"Streetwear luxe",    level:0, delta:"-14%", series:[0.7,0.66,0.6,0.55,0.5,0.45,0.42] },
];

const BreakingBar = ({ items, onGenerate }) => {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);

  const startTimer = () => {
    clearInterval(timerRef.current);
    if (items.length <= 1) return;
    timerRef.current = setInterval(() => setIdx(i => (i + 1) % items.length), 8000);
  };
  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, [items.length]);

  // Navigation manuelle : on relance le timer pour ne pas sauter juste après
  const go = (dir) => {
    setIdx(i => (i + dir + items.length) % items.length);
    startTimer();
  };

  const data = items[idx] || items[0];
  if (!data) return null;

  const pct = Math.min(100, (data.elapsedMinutes / (data.saturationMinutes || 1)) * 100);
  const remaining = data.saturationMinutes - data.elapsedMinutes;
  const hours = Math.floor(remaining / 60);
  const mins = remaining % 60;

  return (
    <div className="breaking-bar">
      <div className="breaking-pulse-layer"/>
      <div className="breaking-main">
        <div className="breaking-badge">
          <span className="breaking-dot"/>
          <span>BREAKING</span>
          {items.length > 1 && (
            <span style={{ fontSize:10, opacity:.6, marginLeft:5 }}>{idx + 1}/{items.length}</span>
          )}
        </div>
        <div className="breaking-content">
          <div className="breaking-title">{data.title}</div>
          <div className="breaking-meta">
            <span>{data.source}</span><span className="breaking-sep">·</span>
            <span className="breaking-match">
              Match : {data.matched.map((t,i) => <span key={i} className="match-chip">{t}</span>)}
            </span>
          </div>
        </div>
        <div className="breaking-timer">
          <div className="timer-head"><AppIcon name="clock" size={12}/><span>Trending depuis <b>{data.elapsedMinutes} min</b></span></div>
          <div className="timer-bar">
            <div className="timer-bar-fill" style={{width:`${pct}%`}}/>
            <div className="timer-markers"><span>0</span><span>saturation · {Math.round(data.saturationMinutes/60)}h</span></div>
          </div>
          <div className="timer-footer">
            <span className="timer-remaining">~{hours}h{mins.toString().padStart(2,'0')} restant</span>
            <span className="timer-advice">avant saturation du sujet</span>
          </div>
        </div>
        <div className="breaking-actions">
          {items.length > 1 && (
            <div style={{ display:'flex', gap:8, marginRight:'auto', alignItems:'center' }}>
              <button className="breaking-nav" onClick={() => go(-1)} title="Précédent" aria-label="Breaking précédent">
                <AppIcon name="chevLeft" size={14}/>
              </button>
              <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                {items.map((_, i) => (
                  <button key={i} onClick={() => { setIdx(i); startTimer(); }} style={{ all:'unset', cursor:'pointer', width:6, height:6, borderRadius:'50%', background: i === idx ? '#B91C1C' : 'rgba(185,28,28,.30)', transition:'background .2s' }}/>
                ))}
              </div>
              <button className="breaking-nav" onClick={() => go(1)} title="Suivant" aria-label="Breaking suivant">
                <AppIcon name="chevRight" size={14}/>
              </button>
            </div>
          )}
          {data.url && <Btn variant="ghost" size="sm" icon="eye" onClick={() => window.open(data.url, '_blank')}>Voir</Btn>}
          <Btn variant="primary" size="sm" icon="bolt" onClick={() => onGenerate?.(data)}>Générer maintenant</Btn>
        </div>
      </div>
    </div>
  );
};

const NewsRow = ({ item, active, onClick, onHover3s, onDismiss }) => {
  const heatDot    = item.heat === 'hot' ? 'dot-hot' : item.heat === 'warm' ? 'dot-warm' : item.heat === 'unscored' ? 'dot-unscored' : 'dot-cool';
  const hoverTimer = useRef(null);

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(() => onHover3s?.(item.id), 3000);
  };
  const handleMouseLeave = () => clearTimeout(hoverTimer.current);

  return (
    <div
      className={`news-row ${active ? 'active' : ''} ${item.scored === false ? 'news-row--unscored' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative' }}
    >
      <button style={{ all:'unset', display:'contents', cursor:'pointer', width:'100%' }} onClick={onClick}>
        <div className="news-row-time">
          <span className={`dot ${heatDot}`}/><span className="news-when">{item.when}</span>
        </div>
        <div className="news-row-body">
          <div className="news-row-top">
            {item.source?.startsWith('@') ? (
              <span className="news-source news-source--twitter">
                <span style={{ color:'var(--app-accent)', fontWeight:700 }}>⚡</span> {item.source}
              </span>
            ) : (
              <span className="news-source">{item.source}</span>
            )}
            {item.cat && <><span className="news-sep">·</span><span className="news-cat">{item.cat}</span></>}
            {item.match != null && item.match >= 0.7 && <span className="match-badge match-badge--strong">◆ {Math.round(item.match*100)}% pertinent</span>}
            {item.match != null && item.match >= 0.5 && item.match < 0.7 && <span className="match-badge">{Math.round(item.match*100)}%</span>}
            {item.match != null && item.match < 0.5 && <span className="match-badge match-badge--weak">hors univers</span>}
            {item.match == null && <span className="match-badge match-badge--weak" style={{opacity:0.5}}>non scoré</span>}
          </div>
          <div className="news-row-title">{item.title}</div>
        </div>
        {active && <div className="news-row-indicator"/>}
      </button>
      <button
        className="news-row-dismiss"
        title="Ignorer"
        onClick={e => { e.stopPropagation(); onDismiss?.(item.id); }}
      >×</button>
    </div>
  );
};

// ─── Sélecteur de format au clic sur "Forger" ────────────────────────────────
// Au lieu de générer directement une Actu, on demande le format cible, puis
// Claude transforme l'article en brief adapté (POST /generate/forge-from-article)
// avant de rediriger vers la page de génération pré-remplie.
const FORGE_FORMATS = [
  { id:'actu',     icon:'bolt',   label:'Actu',      desc:'Post breaking, rapide',        cost:'2 cr' },
  { id:'citation', icon:'quote',  label:'Citation',  desc:'Une déclaration forte',        cost:'1 cr' },
  { id:'deepdive', icon:'layers', label:'Deep Dive', desc:'Carousel analyse 7-10 slides', cost:'3-8 cr' },
];

const ForgeButton = ({ article, onForge, triggerClass, triggerStyle, triggerContent }) => {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(null);
  const [err,     setErr]     = useState(null);

  const pick = async (fmt) => {
    setLoading(fmt); setErr(null);
    try { onForge?.(fmt); } catch (_) {}
    try {
      const res = await veilleFetch('/generate/forge-from-article', {
        method: 'POST',
        body: JSON.stringify({
          format:   fmt,
          clientId: window.__activeClientId || undefined,
          userId:   window.__currentUser?.id,
          article: {
            title:        article?.title || '',
            content:      article?.description || article?.content || article?.text || '',
            source:       article?.source || '',
            published_at: article?.published_at || article?.when || '',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      if (fmt === 'citation' && data.found === false) {
        setErr('Pas de citation directe dans cet article. Essaie le format Actu ou Deep Dive.');
        setLoading(null);
        return;
      }
      setLoading(null); setOpen(false);
      window.__goToGenerate?.({ format: data.format || fmt, prefill: data.prefill, title: article?.title, source: article?.source, url: article?.url });
    } catch (e) { setErr(e.message || 'Erreur'); setLoading(null); }
  };

  return (
    <>
      <button className={triggerClass} style={triggerStyle} onClick={e => { e.stopPropagation(); setOpen(true); }}>
        {triggerContent}
      </button>
      {open && (
        <div className="forge-modal-overlay" onClick={e => { e.stopPropagation(); if (!loading) setOpen(false); }}>
          <div className="forge-modal" onClick={e => e.stopPropagation()}>
            <div className="forge-modal-head">
              <span>Forjer cet article en :</span>
              <button className="forge-modal-close" onClick={() => !loading && setOpen(false)} aria-label="Fermer"><AppIcon name="x" size={14}/></button>
            </div>
            <div className="forge-modal-opts">
              {FORGE_FORMATS.map(f => (
                <button key={f.id} className="forge-modal-opt" disabled={!!loading} onClick={() => pick(f.id)}>
                  <span className="forge-modal-opt-icon"><AppIcon name={f.icon} size={18}/></span>
                  <span className="forge-modal-opt-body">
                    <span className="forge-modal-opt-label">{f.label}</span>
                    <span className="forge-modal-opt-desc">{f.desc}</span>
                  </span>
                  <span className="forge-modal-opt-cost">{loading === f.id ? '…' : f.cost}</span>
                </button>
              ))}
            </div>
            {loading && <div className="forge-modal-loading"><span className="forge-spin"/> Claude analyse l'article…</div>}
            {err && <div className="forge-modal-err">{err}</div>}
          </div>
        </div>
      )}
    </>
  );
};

const RecapPanel = ({ news, onGenerate }) => {
  if (!news) return (
    <div className="action-empty">
      <div style={{ fontSize:28, marginBottom:8, opacity:.3 }}>◈</div>
      <div style={{ fontSize:13, color:'var(--app-fg-4)' }}>Sélectionne une actu</div>
    </div>
  );

  const scoreColor = news.score == null ? 'var(--app-fg-4)' : news.score >= 8.5 ? '#ef4444' : news.score >= 7 ? '#f59e0b' : 'var(--app-fg-4)';

  const buildRecap = () => {
    const parts = [];
    parts.push(`**${news.title}**`);
    parts.push(`Source : ${news.source} · ${news.when}`);
    if (news.description) parts.push(`\n${news.description}`);
    if (news.why)   parts.push(`\nContexte : ${news.why}`);
    if (news.angle) parts.push(`Angle : ${news.angle}`);
    return parts.join('\n');
  };

  return (
    <div className="recap-panel">
      {/* ── Score badge ── */}
      <div className="recap-score-row">
        <span className="recap-source">{news.source}</span>
        <span className="recap-when">{news.when}</span>
        <span className="recap-score" style={{ color: scoreColor }}>
        {news.score != null ? news.score.toFixed(1) : <span style={{fontSize:10,letterSpacing:'0.04em'}}>NON SCORÉ</span>}
        {news.score != null && <span style={{ fontSize:9, opacity:.6 }}>/10</span>}
      </span>
      </div>

      {/* ── Titre ── */}
      <div className="recap-titre">{news.title}</div>

      {/* ── Corps de l'article ── */}
      {news.description && (
        <div className="recap-body">{news.description}</div>
      )}

      {/* ── Analyse Forje (compact) ── */}
      {(news.why || news.angle) && (
        <div className="recap-analysis">
          {news.why   && <div className="recap-analysis-row"><span className="recap-analysis-label">Pourquoi</span><span>{news.why}</span></div>}
          {news.angle && <div className="recap-analysis-row"><span className="recap-analysis-label">Angle</span><span>{news.angle}</span></div>}
        </div>
      )}

      {/* ── Format + Timing (secondaire) ── */}
      {(news.format || news.timing) && (
        <div className="recap-meta-row">
          {news.format && <span className="recap-meta-chip"><AppIcon name="layers" size={11}/>{news.format}</span>}
          {news.timing && <span className="recap-meta-chip"><AppIcon name="clock" size={11}/>{news.timing}</span>}
          {news.url && (
            <a className="recap-meta-chip recap-meta-link" href={news.url} target="_blank" rel="noopener noreferrer">
              <AppIcon name="globe" size={11}/>Source originale ↗
            </a>
          )}
        </div>
      )}

      {/* ── CTA — sélecteur de format ── */}
      <ForgeButton
        article={news}
        onForge={(fmt) => onGenerate?.(news.id, fmt)}
        triggerClass="btn btn-primary"
        triggerStyle={{ width:'100%', marginTop:'auto', justifyContent:'center' }}
        triggerContent={<><AppIcon name="bolt" size={13}/>Forger ce post</>}
      />
    </div>
  );
};

const Sparkline = ({ series, level }) => {
  const w = 60, h = 16;
  const step = w / (series.length - 1);
  const pts = series.map((v, i) => `${i*step},${h - v*h}`).join(' ');
  const color = level === 3 ? '#FF6B4A' : level === 2 ? '#FFB061' : level === 1 ? '#FFE066' : '#9AA6D0';
  return <svg width={w} height={h} className="heat-spark"><polyline fill="none" stroke={color} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" points={pts}/></svg>;
};

const HeatBar = ({ topics }) => (
  <section className="heat-bar">
    <div className="heat-head">
      <div className="heat-title-row"><AppIcon name="flame" size={14}/><h3 className="heat-title">Chaleur des sujets · ton univers</h3></div>
      <div className="heat-meta"><span>Dernières 24h</span><span className="heat-sep">·</span><span>Rafraîchi il y a 2 min</span></div>
    </div>
    <div className="heat-grid">
      {topics.map((t, i) => (
        <div key={i} className={`heat-cell heat-cell--l${t.level}`}>
          <div className="heat-cell-row">
            <span className="heat-name">{t.name}</span>
            <span className="heat-flames">
              {t.level === 3 && '🔥🔥🔥'}{t.level === 2 && '🔥🔥'}{t.level === 1 && '🔥'}{t.level === 0 && <span className="heat-cold">—</span>}
            </span>
          </div>
          <div className="heat-cell-foot"><Sparkline series={t.series} level={t.level}/><span className={`heat-delta heat-delta--l${t.level}`}>{t.delta}</span></div>
        </div>
      ))}
    </div>
  </section>
);

// ─── StatusBar ────────────────────────────────────────────────────────────────
const StatusBar = ({ refreshedAt, scoring, total }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);
  const lastMin = refreshedAt ? Math.round((Date.now() - refreshedAt) / 60000) : null;
  const nextMin = refreshedAt ? Math.max(0, 5 - Math.round((Date.now() - refreshedAt) / 60000)) : null;
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:8, padding:'6px 20px',
      background:'var(--app-surface)', borderBottom:'1px solid var(--app-line)',
      fontSize:11.5, color:'var(--app-fg-4)', flexShrink:0,
    }}>
      <span style={{
        width:6, height:6, borderRadius:'50%', flexShrink:0,
        background: scoring ? 'var(--app-accent)' : '#22C55E',
        animation: scoring ? 'pulse 1.2s ease-in-out infinite' : 'none',
      }}/>
      <span style={{ color:'var(--app-fg-3)', fontWeight:500 }}>
        {scoring ? 'Analyse en cours…' : lastMin !== null ? `Analysé il y a ${lastMin < 1 ? 'quelques secondes' : lastMin + ' min'}` : 'Veille active'}
      </span>
      {!scoring && nextMin !== null && nextMin > 0 && (
        <><span style={{ opacity:.4 }}>·</span><span>Prochain fetch dans {nextMin} min</span></>
      )}
      {total > 0 && (
        <><span style={{ opacity:.4 }}>·</span><span>{total} articles scorés</span></>
      )}
    </div>
  );
};

// ─── UrgentCard ───────────────────────────────────────────────────────────────
const UrgentCard = ({ item, active, onClick, onDismiss, onGenerate }) => {
  const scoreColor = item.score >= 9 ? '#ef4444' : item.score >= 8.5 ? '#f59e0b' : 'var(--app-accent)';
  return (
    <div
      onClick={onClick}
      style={{
        position:'relative', cursor:'pointer',
        background: active ? 'rgba(79,91,213,.07)' : 'var(--app-surface-2)',
        border: `1px solid ${active ? 'rgba(79,91,213,.3)' : 'var(--app-line)'}`,
        borderRadius:'var(--radius)', padding:'14px 16px',
        transition:'border-color .15s, background .15s',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor='rgba(79,91,213,.2)'; e.currentTarget.style.background='rgba(79,91,213,.03)'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor='var(--app-line)'; e.currentTarget.style.background='var(--app-surface-2)'; } }}
    >
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7, gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
          <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--app-fg-4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.source}</span>
          <span style={{ fontSize:10, color:'var(--app-fg-4)', opacity:.5 }}>·</span>
          <span style={{ fontSize:10, color:'var(--app-fg-4)', whiteSpace:'nowrap' }}>{item.when}</span>
        </div>
        <span style={{ fontSize:13, fontWeight:800, color:scoreColor, flexShrink:0 }}>{item.score?.toFixed(1)}</span>
      </div>
      <div style={{ fontSize:14, fontWeight:700, color:'var(--app-fg)', lineHeight:1.4, marginBottom:10 }}>{item.title}</div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {item.format && (
          <span style={{
            fontSize:10, fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase',
            padding:'2px 8px', borderRadius:20,
            background:'rgba(79,91,213,.08)', color:'var(--app-accent)',
            border:'1px solid rgba(79,91,213,.15)',
          }}>{item.format}</span>
        )}
        <ForgeButton
          article={item}
          onForge={(fmt) => onGenerate?.(item.id, fmt)}
          triggerStyle={{
            all:'unset', cursor:'pointer', marginLeft:'auto',
            fontSize:12, fontWeight:700, color:'var(--app-accent)',
            display:'flex', alignItems:'center', gap:4,
            padding:'5px 12px', borderRadius:6,
            background:'rgba(79,91,213,.08)', border:'1px solid rgba(79,91,213,.2)',
            transition:'all .12s',
          }}
          triggerContent={<>Forger →</>}
        />
        <button
          onClick={e => { e.stopPropagation(); onDismiss?.(item.id); }}
          style={{ all:'unset', cursor:'pointer', fontSize:16, color:'var(--app-fg-4)', opacity:.4, padding:'2px 6px', lineHeight:1 }}
          onMouseEnter={e => e.currentTarget.style.opacity='1'}
          onMouseLeave={e => e.currentTarget.style.opacity='.4'}
        >×</button>
      </div>
    </div>
  );
};

const VeilleBoard = ({ compteId, freshSetup = false, onReset }) => {
  const [boardData, setBoardData]   = useState({ breaking: [], board: [], total: 0 });
  const [loading, setLoading]       = useState(true);
  const [scoring, setScoring]       = useState(false);
  const [selected, setSelected]     = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [dismissed, setDismissed]   = useState(new Set());
  const [learning, setLearning]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sourcesRss, setSourcesRss] = useState([]);
  const [compteInfo, setCompteInfo] = useState(null); // { nom, instagram_url }
  const [latestRaw, setLatestRaw]   = useState([]);
  const [latestTweets, setLatestTweets] = useState([]);
  const [addInput, setAddInput]     = useState('');
  const [addingSource, setAddingSource] = useState(false);
  const [addSourceMsg, setAddSourceMsg] = useState(null); // { type:'ok'|'err', text }
  const [twitterAccounts, setTwitterAccounts] = useState([]);
  const [curatedSources, setCuratedSources]   = useState([]);
  const [addTwInput, setAddTwInput]   = useState('');
  const [addingTw, setAddingTw]       = useState(false);
  const [addTwMsg, setAddTwMsg]       = useState(null);
  const [tendances, setTendances]     = useState([]);
  const [scoringMsg, setScoringMsg]   = useState(null);
  const scoringMsgTimer               = useRef(null);

  const track = React.useCallback((newsScoredId, action, extra = {}) => {
    if (!newsScoredId || !compteId) return;
    veilleFetch(`/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compte_id: compteId, news_scored_id: newsScoredId, action, ...extra }),
    })
      .then(r => r.json())
      .then(json => {
        if (json.trigger_agent3) {
          setLearning(true);
          setTimeout(() => setLearning(false), 4000);
        }
      })
      .catch(() => {});
  }, [compteId]);

  const loadLatestRaw = async () => {
    try {
      const [rssRes, twRes] = await Promise.all([
        veilleFetch(`/rss/news?limit=150`),
        veilleFetch(`/rss/news?source_type=twitter&limit=50`),
      ]);
      const rssJson = await rssRes.json();
      const twJson  = await twRes.json();
      if (rssRes.ok) setLatestRaw((rssJson.news || []).filter(n => !n.source?.startsWith('@')));
      if (twRes.ok)  setLatestTweets(twJson.news || []);
    } catch (err) { console.error('[LatestRaw]', err.message); }
  };

  const loadTrends = async () => {
    try {
      const res  = await veilleFetch(`/twitter/trends?compte_id=${compteId}`);
      const json = await res.json();
      if (res.ok) setTendances(json.tendances || []);
    } catch (err) { console.error('[Trends]', err.message); }
  };

  const loadSources = async () => {
    try {
      const [rssRes, curatedRes] = await Promise.all([
        veilleFetch(`/rss/sources?compte_id=${compteId}`),
        veilleFetch(`/twitter/curated-sources?compte_id=${compteId}`),
      ]);
      const rssJson = await rssRes.json();
      if (rssRes.ok) {
        setSourcesRss(rssJson.sources_rss || []);
        setTwitterAccounts(rssJson.twitter_accounts || []);
        if (rssJson.nom || rssJson.instagram_url) setCompteInfo({ nom: rssJson.nom, instagram_url: rssJson.instagram_url });
      }
      if (curatedRes.ok) {
        const curatedJson = await curatedRes.json();
        setCuratedSources(curatedJson.sources || []);
      }
    } catch (err) { console.error('[Sources]', err.message); }
  };

  const handleAddTwitter = async () => {
    const raw = addTwInput.trim();
    if (!raw) return;
    setAddingTw(true);
    setAddTwMsg(null);
    try {
      const res  = await veilleFetch(`/twitter/add-account`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compte_id: compteId, handle: raw }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setAddTwInput('');
      const label = json.already_exists
        ? `@${json.handle} était déjà suivi.`
        : `✓ @${json.handle} ajouté — ${json.inserted ?? 0} tweets récupérés.`;
      setAddTwMsg({ type: 'ok', text: label });
      await loadSources();
    } catch (err) {
      setAddTwMsg({ type: 'err', text: err.message });
    } finally { setAddingTw(false); }
  };

  const handleRemoveTwitter = async (handle) => {
    try {
      await veilleFetch(`/twitter/remove-account`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compte_id: compteId, handle }),
      });
      setTwitterAccounts(prev => prev.filter(h => h !== handle));
    } catch (err) { console.error('[RemoveTwitter]', err.message); }
  };

  const handleAddSource = async () => {
    const name = addInput.trim();
    if (!name) return;
    setAddingSource(true);
    setAddSourceMsg(null);
    try {
      const res  = await veilleFetch(`/rss/add-source`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compte_id: compteId, source_name: name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setAddInput('');
      setAddSourceMsg({ type: 'ok', text: json.already_exists ? `${name} était déjà dans tes sources.` : `✓ ${json.feed.source} ajouté — RSS actif.` });
      await loadSources();
      await loadBoard();
    } catch (err) {
      setAddSourceMsg({ type: 'err', text: err.message });
    } finally { setAddingSource(false); }
  };

  const handleRemoveSource = async (url) => {
    try {
      await veilleFetch(`/rss/remove-source`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compte_id: compteId, url }),
      });
      setSourcesRss(prev => prev.filter(f => f.url !== url));
    } catch (err) { console.error('[RemoveSource]', err.message); }
  };

  const loadBoard = async () => {
    try {
      const res  = await veilleFetch(`/scoring/board?compte_id=${compteId}&limit=50`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setBoardData(json);
      setRefreshedAt(Date.now());
      return json;
    } catch (err) { console.error('[Board]', err.message); return null; }
    finally { setLoading(false); }
  };

  const runScoring = async () => {
    setScoring(true);
    setScoringMsg(null);
    try {
      const res  = await veilleFetch(`/scoring/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compte_id: compteId }),
      });
      const json = await res.json();
      await loadBoard();
      const n = json.scored ?? 0;
      const msg = n > 0
        ? `${n} article${n > 1 ? 's' : ''} analysé${n > 1 ? 's' : ''} · prochain fetch dans ~2 min`
        : 'Tout est à jour · prochain fetch dans ~2 min';
      setScoringMsg(msg);
      if (scoringMsgTimer.current) clearTimeout(scoringMsgTimer.current);
      scoringMsgTimer.current = setTimeout(() => setScoringMsg(null), 4 * 60 * 1000);
    } catch (err) { console.error('[Scoring]', err.message); }
    finally { setScoring(false); }
  };

  useEffect(() => {
    const init = async () => {
      loadSources();
      loadLatestRaw();
      loadTrends();
      const data = await loadBoard();
      // Si le board est vide au premier chargement, on déclenche refresh+score en background
      const total = (data?.board?.length || 0) + (data?.breaking?.length || 0);
      if (total < 5) {
        setRefreshing(true);
        try {
          await veilleFetch(`/rss/refresh?compte_id=${compteId}`);
        } catch (err) { console.error('[AutoRefresh]', err.message); }
        finally { setRefreshing(false); }
        // Le scoring tourne en background côté serveur — on poll toutes les 4s pendant 3 min
        setScoring(true);
        const pollStart = Date.now();
        const pollIv = setInterval(async () => {
          const d = await loadBoard();
          const n = (d?.board?.length || 0) + (d?.breaking?.length || 0);
          if (n > 0 || Date.now() - pollStart > 3 * 60 * 1000) {
            clearInterval(pollIv);
            setScoring(false);
          }
        }, 4000);
      }
    };
    init();
    // Poll toutes les 5s pendant 3 min après onboarding, puis toutes les 2 min
    const FAST = 5 * 1000;
    const SLOW = 2 * 60 * 1000;
    let iv = setInterval(loadBoard, freshSetup ? FAST : SLOW);
    if (freshSetup) {
      setTimeout(() => { clearInterval(iv); iv = setInterval(loadBoard, SLOW); }, 3 * 60 * 1000);
    }
    // Poll statut scoring toutes les 12s — reflète aussi le scoring auto lancé par le RSS loop
    const statusIv = setInterval(async () => {
      try {
        const res  = await veilleFetch(`/scoring/status?compte_id=${compteId}`);
        const json = await res.json();
        setScoring(json.running);
        if (!json.running) loadBoard();
      } catch (_) {}
    }, 12000);
    return () => { clearInterval(iv); clearInterval(statusIv); };
  }, [compteId]);

  const fmtAge = (createdAt) => {
    if (!createdAt) return '—';
    // Postgres retourne les timestamps sans 'Z' — le navigateur les lirait comme heure locale sinon
    const ts = createdAt.endsWith('Z') || /[+\-]\d{2}:?\d{2}$/.test(createdAt) ? createdAt : createdAt + 'Z';
    const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (min < 1)  return 'à l\'instant';
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return `il y a ${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
  };

  const handleTrendClick = async (trend) => {
    // Ouvre la recherche X + log dans tendances_log
    window.open(`https://x.com/search?q=${encodeURIComponent(trend.name)}&src=trend_click`, '_blank', 'noopener');
    try {
      await veilleFetch('/twitter/trends/log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compte_id: compteId, trend_name: trend.name, tweet_volume: trend.tweet_volume, geo: trend.geo }),
      });
    } catch (_) {}
  };

  const runRefresh = async () => {
    setRefreshing(true);
    try {
      // RSS uniquement — Twitter est manuel séparé (voir bouton X)
      await veilleFetch(`/rss/refresh?compte_id=${compteId}`);
    } catch (err) { console.error('[Refresh]', err.message); }
    finally { setRefreshing(false); }
    setScoring(true);
    await loadBoard();
    const pollStart = Date.now();
    const pollIv = setInterval(async () => {
      await loadBoard();
      if (Date.now() - pollStart > 3 * 60 * 1000) { clearInterval(pollIv); setScoring(false); }
    }, 4000);
    setTimeout(() => { clearInterval(pollIv); setScoring(false); }, 3 * 60 * 1000);
  };

  const [twitterRefreshing, setTwitterRefreshing] = useState(false);
  const [twitterMsg, setTwitterMsg]               = useState(null);

  const runTwitterRefresh = async () => {
    if (!window.confirm('Fetch Twitter maintenant ?\n\nEstimation : ~160–200 crédits twitterapi.io (sur 25 000 au total).\n\nCooldown de 30 min ensuite.')) return;
    setTwitterRefreshing(true);
    setTwitterMsg(null);
    try {
      const res  = await veilleFetch('/twitter/refresh', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ compte_id: compteId }) });
      const json = await res.json();
      if (!res.ok) {
        setTwitterMsg({ type:'warn', text: json.error || 'Erreur' });
      } else {
        setTwitterMsg({ type:'ok', text: `✓ +${json.inserted} tweets · ~${json.credits_used_est} crédits · cooldown 30 min` });
        await loadBoard();
      }
    } catch (err) {
      setTwitterMsg({ type:'err', text: err.message });
    } finally { setTwitterRefreshing(false); }
  };

  const enrichItem = (item) => {
    const raw = item.news_raw || {};
    return {
      id:          item.id,
      createdAt:   raw.published_at || raw.created_at,
      when:        fmtAge(raw.published_at || raw.created_at),
      source:      raw.source || '—',
      score:       item.score_total || 0,
      why:         item.pourquoi_ce_score || '',
      format:      item.format_suggere,
      timing:      item.timing_optimal,
      caption:     item.caption,
      title:       raw.titre || '(sans titre)',
      description: raw.description || '',
      url:         raw.url,
      hashtags:    item.hashtags || [],
      angle:       item.angle || '',
    };
  };

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const isRecent = (item) => {
    const pubAt = item.news_raw?.published_at || item.news_raw?.created_at;
    return !pubAt || pubAt >= since24h;
  };

  const urgentItems = (boardData.board || [])
    .filter(item => item.flag === 'urgent' && !dismissed.has(item.id) && isRecent(item))
    .sort((a, b) => (b.score_total || 0) - (a.score_total || 0))
    .map(enrichItem);

  const watchItems = (boardData.board || [])
    .filter(item => item.flag === 'a_traiter' && !dismissed.has(item.id) && isRecent(item))
    .sort((a, b) => (b.score_total || 0) - (a.score_total || 0))
    .map(enrichItem);

  const lowItems = (boardData.board || [])
    .filter(item => item.flag === 'faible_priorite' && !dismissed.has(item.id) && isRecent(item))
    .sort((a, b) => (b.score_total || 0) - (a.score_total || 0))
    .map(enrichItem);

  const allItems = [...urgentItems, ...watchItems, ...lowItems];

  const breaking = (boardData.breaking || []).map(item => {
    const raw = item.news_raw || {};
    const pubAt = raw.published_at || raw.created_at;
    const actualAge = pubAt
      ? Math.round((Date.now() - new Date(pubAt.endsWith('Z') ? pubAt : pubAt + 'Z').getTime()) / 60000)
      : (item.fenetre_age_minutes || 0);
    const rem = item.fenetre_temps_restant_minutes || 120;
    return {
      title:             raw.titre || '(breaking)',
      source:            `${raw.source || '—'} · il y a ${actualAge} min`,
      sourceRaw:         raw.source || '—',
      matched:           item.hashtags?.length ? item.hashtags : [item.angle].filter(Boolean),
      saturationMinutes: actualAge + rem,
      elapsedMinutes:    actualAge,
      url:               raw.url,
      description:       raw.description || '',
      why:               item.pourquoi_ce_score || '',
      angle:             item.angle || '',
      caption:           item.caption || '',
    };
  });

  const activeId = selected ?? allItems[0]?.id ?? null;
  const active   = allItems.find(n => n.id === activeId);

  if (loading) return (
    <div className="page-body" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, flexDirection:'column', gap:14 }}>
      <div className="forje-blob-spin"/>
      <span style={{ fontSize:13, color:'var(--app-fg-3)' }}>Chargement…</span>
    </div>
  );

  const goGenerate = (item) => {
    if (!item || !window.__goToGenerate) return;
    const brief = [item.title, item.description || '', item.why ? 'Contexte : ' + item.why : '', item.angle ? 'Angle : ' + item.angle : '', item.caption ? 'Caption suggérée : ' + item.caption : ''].filter(Boolean).join('\n');
    window.__goToGenerate({ title: item.title, text: brief, url: item.url, source: item.source });
  };

  return (
    <div className="sources-page">
      {/* Fond « veille mondiale » — globe discret derrière le board */}
      {window.BrandGlobeBg && <window.BrandGlobeBg/>}

      {/* ── Pipeline status bar ── */}
      <StatusBar refreshedAt={refreshedAt} scoring={scoring} total={boardData.total}/>

      {/* ── Breaking alert ── */}
      {breaking.length > 0 && (
        <BreakingBar
          items={breaking}
          onGenerate={(d) => window.__goToGenerate?.({ title: d.title, url: d.url, source: d.source })}
        />
      )}

      {/* ── Tendances + action bar ── */}
      <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid var(--app-line)', background:'var(--app-surface)', flexShrink:0 }}>
        <div style={{ flex:1, overflow:'hidden' }}>
          <BarreTendances tendances={tendances} onTrendClick={handleTrendClick}/>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'0 14px', flexShrink:0, borderLeft:'1px solid var(--app-line)', height:42 }}>
          {learning && <span style={{ fontSize:11, color:'var(--app-accent)', fontWeight:600, whiteSpace:'nowrap' }}>⚡ Apprentissage</span>}
          {!learning && scoringMsg && <span style={{ fontSize:11, color:'var(--app-fg-3)', whiteSpace:'nowrap', maxWidth:240, overflow:'hidden', textOverflow:'ellipsis' }}>{scoringMsg}</span>}
          <button
            className="feed-filter-icon"
            title={twitterRefreshing ? 'Fetch X…' : 'Fetch Twitter (~160 crédits)'}
            onClick={runTwitterRefresh}
            disabled={twitterRefreshing}
            style={{ opacity: twitterRefreshing ? 0.5 : 1 }}
          >
            {twitterRefreshing
              ? <span style={{ fontSize:10, color:'#1d9bf0', fontWeight:700 }}>…</span>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color:'var(--app-fg-3)' }}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            }
          </button>
          <button className="feed-filter-icon" title={scoring ? 'Analyse en cours…' : 'Lancer le scoring'} onClick={runScoring} disabled={scoring || refreshing} style={{ opacity: (scoring || refreshing) ? 0.5 : 1 }}>
            {scoring ? <span style={{ fontSize:10, color:'var(--app-accent)', fontWeight:700 }}>…</span> : <AppIcon name="bolt" size={12}/>}
          </button>
          <button className="feed-filter-icon" title="Sources & configuration" onClick={() => setSettingsOpen(o => !o)} style={{ color: settingsOpen ? 'var(--app-accent)' : undefined }}>
            <AppIcon name="settings" size={13}/>
          </button>
        </div>
      </div>

      {/* ── Layout principal ── */}
      <div className="sources-layout">
        <section className="sources-feed">

          {/* État vide */}
          {urgentItems.length === 0 && watchItems.length === 0 && (
            <div style={{ padding:'52px 24px', textAlign:'center', display:'flex', flexDirection:'column', gap:12, alignItems:'center' }}>
              {scoring || refreshing ? (
                <>
                  <div className="forje-blob-spin"/>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--app-fg-2)', marginTop:4 }}>
                    {refreshing ? 'Récupération des flux RSS…' : 'Analyse en cours — résultats dans 1 à 2 min'}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize:28 }}>⚡</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--app-fg-2)' }}>Aucune actu pertinente pour l'instant</div>
                  <div style={{ fontSize:13, color:'var(--app-fg-3)', maxWidth:280, lineHeight:1.5 }}>Les flux se rafraîchissent toutes les 2 min. Les résultats peuvent prendre 1 à 2 min à apparaître après une analyse.</div>
                  <button className="btn btn-primary btn-sm" onClick={runScoring} style={{ marginTop:4 }}>
                    <AppIcon name="bolt" size={12}/>Forcer l'analyse maintenant
                  </button>
                </>
              )}
            </div>
          )}

          {/* 🔥 Top du moment */}
          {urgentItems.length > 0 && (
            <div style={{ padding:'16px 16px 8px' }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--app-fg-3)', marginBottom:10 }}>
                🔥 Top du moment
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {urgentItems.slice(0, 5).map(item => (
                  <UrgentCard
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    onClick={() => { setSelected(item.id); track(item.id, 'open'); }}
                    onDismiss={(id) => { setDismissed(d => new Set([...d, id])); track(id, 'dismiss'); if (activeId === id) setSelected(null); }}
                    onGenerate={(id, format) => track(id, 'generate', { format_utilise: format })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* À surveiller */}
          {watchItems.length > 0 && (
            <div style={{ padding: urgentItems.length > 0 ? '8px 16px 8px' : '16px 16px 8px' }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--app-fg-3)', marginBottom:6, padding:'4px 4px 0' }}>
                À surveiller
              </div>
              <div className="feed-list">
                {watchItems.slice(0, 15).map(item => (
                  <NewsRow
                    key={item.id} item={Object.assign({}, item, { heat: 'warm', scored: true, match: Math.min(1, (item.score || 0) / 10) })}
                    active={item.id === activeId}
                    onClick={() => { setSelected(item.id); track(item.id, 'open'); }}
                    onHover3s={(id) => track(id, 'hover', { temps_passe_secondes: 3 })}
                    onDismiss={(id) => { setDismissed(d => new Set([...d, id])); track(id, 'dismiss'); if (activeId === id) setSelected(null); }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Faible priorité — scorés mais peu pertinents, affichés en retrait */}
          {lowItems.length > 0 && (
            <div style={{ padding:'4px 16px 16px', opacity:.55 }}>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--app-fg-4)', marginBottom:4, padding:'4px 4px 0' }}>
                Faible priorité
              </div>
              <div className="feed-list">
                {lowItems.slice(0, 8).map(item => (
                  <NewsRow
                    key={item.id} item={Object.assign({}, item, { heat: 'cool', scored: true, match: Math.min(1, (item.score || 0) / 10) })}
                    active={item.id === activeId}
                    onClick={() => { setSelected(item.id); track(item.id, 'open'); }}
                    onHover3s={(id) => track(id, 'hover', { temps_passe_secondes: 3 })}
                    onDismiss={(id) => { setDismissed(d => new Set([...d, id])); track(id, 'dismiss'); if (activeId === id) setSelected(null); }}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="sources-action">
          <RecapPanel
            news={active}
            onGenerate={(id, format) => track(id, 'generate', { format_utilise: format })}
          />
        </aside>
      </div>

      {/* ── Settings drawer (slide-in depuis la droite) ── */}
      {settingsOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex' }}>
          <div style={{ flex:1 }} onClick={() => setSettingsOpen(false)}/>
          <div style={{
            width:460, background:'var(--app-bg)', borderLeft:'1px solid var(--app-line)',
            overflowY:'auto', display:'flex', flexDirection:'column',
            animation:'slideInRight .18s ease',
          }}>
            {/* Header drawer */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 22px', borderBottom:'1px solid var(--app-line)', flexShrink:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--app-fg)' }}>Sources & Veille</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setSettingsOpen(false); runRefresh(); }} disabled={refreshing || scoring} style={{ fontSize:11 }}>
                  <AppIcon name="refresh" size={11}/>{refreshing ? 'RSS…' : 'Refresh RSS'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setSettingsOpen(false); runTwitterRefresh(); }}
                  disabled={twitterRefreshing}
                  style={{ fontSize:11, gap:5 }}
                  title="Fetch Twitter (~160 crédits)"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  {twitterRefreshing ? 'X…' : 'Fetch X'}
                </button>
                <button style={{ all:'unset', cursor:'pointer', fontSize:18, color:'var(--app-fg-4)', lineHeight:1, padding:'2px 6px' }} onClick={() => setSettingsOpen(false)}>×</button>
              </div>
            </div>
            {twitterMsg && (
              <div style={{ padding:'8px 22px', fontSize:12, borderBottom:'1px solid var(--app-line)', color: twitterMsg.type==='ok'?'#15803D':'#C53030' }}>{twitterMsg.text}</div>
            )}

            <div style={{ padding:'20px 22px', flex:1 }}>
              {/* Ajouter une source */}
              <div className="card card-pad" style={{ marginBottom:18, padding:'18px 20px' }}>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--app-fg-2)', marginBottom:3 }}>Ajouter une source</div>
                <div style={{ fontSize:12, color:'var(--app-fg-3)', marginBottom:12 }}>Donne un nom de média — l'IA trouve son flux RSS automatiquement.</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input type="text" value={addInput} onChange={e => { setAddInput(e.target.value); setAddSourceMsg(null); }} onKeyDown={e => e.key === 'Enter' && !addingSource && handleAddSource()} placeholder="ex: Le Monde, Wired…" disabled={addingSource} style={{ flex:1, background:'var(--app-surface-2)', border:'1px solid var(--app-line)', borderRadius:'var(--radius)', padding:'8px 11px', color:'var(--app-fg)', fontFamily:'DM Sans, sans-serif', fontSize:13, outline:'none', opacity:addingSource?0.6:1 }} onFocus={e => e.target.style.borderColor='var(--app-accent)'} onBlur={e => e.target.style.borderColor='var(--app-line)'}/>
                  <button className="btn btn-primary btn-sm" onClick={handleAddSource} disabled={addingSource||!addInput.trim()} style={{ whiteSpace:'nowrap' }}>
                    {addingSource ? <><span style={{ display:'inline-block', width:9, height:9, border:'1.5px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'vb-spin .7s linear infinite', marginRight:5 }}/>Recherche…</> : <><AppIcon name="search" size={11}/>Trouver</>}
                  </button>
                </div>
                {addSourceMsg && <div style={{ marginTop:8, padding:'7px 10px', borderRadius:6, fontSize:12, background:addSourceMsg.type==='ok'?'rgba(34,197,94,.08)':'rgba(197,48,48,.06)', border:`1px solid ${addSourceMsg.type==='ok'?'rgba(34,197,94,.2)':'rgba(197,48,48,.15)'}`, color:addSourceMsg.type==='ok'?'#15803D':'#C53030' }}>{addSourceMsg.text}</div>}
              </div>

              {/* Sources actives */}
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--app-fg-3)', marginBottom:8 }}>Sources actives ({sourcesRss.length})</div>
              {sourcesRss.length === 0 ? (
                <div style={{ padding:'16px', textAlign:'center', color:'var(--app-fg-3)', fontSize:12, background:'var(--app-surface-2)', borderRadius:'var(--radius)' }}>Aucune source RSS — ajoute-en une ci-dessus.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  {sourcesRss.map((f, i) => (
                    <div key={i} className="card" style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px' }}>
                      <div style={{ width:26, height:26, borderRadius:6, background:'rgba(79,91,213,.08)', display:'grid', placeItems:'center', flexShrink:0 }}><AppIcon name="globe" size={12} style={{ color:'var(--app-accent)' }}/></div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--app-fg-2)' }}>{f.source}</div>
                        <div style={{ fontSize:10, color:'var(--app-fg-4)', fontFamily:'JetBrains Mono, monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.url}</div>
                      </div>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-icon btn-sm"><AppIcon name="arrowRight" size={11}/></a>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleRemoveSource(f.url)}><AppIcon name="trash" size={11}/></button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop:12, padding:'9px 12px', background:'var(--app-surface-2)', borderRadius:7, fontSize:11, color:'var(--app-fg-3)' }}>
                Forje utilise aussi des feeds généralistes (Le Monde, BBC, NYT…) et des feeds thématiques auto selon ta niche.
              </div>

              {/* Comptes Twitter */}
              <div style={{ marginTop:24 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color:'var(--app-fg-3)' }}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--app-fg-3)' }}>Comptes X ({twitterAccounts.length})</div>
                </div>
                <div className="card card-pad" style={{ marginBottom:10, padding:'14px 18px' }}>
                  <div style={{ display:'flex', gap:8 }}>
                    <input type="text" value={addTwInput} onChange={e => { setAddTwInput(e.target.value); setAddTwMsg(null); }} onKeyDown={e => e.key === 'Enter' && !addingTw && handleAddTwitter()} placeholder="@handle ou x.com/handle" disabled={addingTw} style={{ flex:1, background:'var(--app-surface-2)', border:'1px solid var(--app-line)', borderRadius:'var(--radius)', padding:'8px 11px', color:'var(--app-fg)', fontFamily:'DM Sans, sans-serif', fontSize:13, outline:'none', opacity:addingTw?0.6:1 }} onFocus={e => e.target.style.borderColor='var(--app-accent)'} onBlur={e => e.target.style.borderColor='var(--app-line)'}/>
                    <button className="btn btn-primary btn-sm" onClick={handleAddTwitter} disabled={addingTw||!addTwInput.trim()} style={{ background:'#000', borderColor:'#000', whiteSpace:'nowrap' }}>
                      {addingTw ? 'Ajout…' : <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> Ajouter</>}
                    </button>
                  </div>
                  {addTwMsg && <div style={{ marginTop:8, padding:'7px 10px', borderRadius:6, fontSize:12, background:addTwMsg.type==='ok'?'rgba(34,197,94,.08)':'rgba(197,48,48,.06)', border:`1px solid ${addTwMsg.type==='ok'?'rgba(34,197,94,.2)':'rgba(197,48,48,.15)'}`, color:addTwMsg.type==='ok'?'#15803D':'#C53030' }}>{addTwMsg.text}</div>}
                </div>
                {twitterAccounts.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    {twitterAccounts.map((handle, i) => (
                      <div key={i} className="card" style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px' }}>
                        <div style={{ width:26, height:26, borderRadius:6, background:'rgba(0,0,0,.06)', display:'grid', placeItems:'center', flexShrink:0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color:'#000' }}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></div>
                        <div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:600, color:'var(--app-fg-2)' }}>@{handle}</div></div>
                        <a href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-icon btn-sm"><AppIcon name="arrowRight" size={11}/></a>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleRemoveTwitter(handle)}><AppIcon name="trash" size={11}/></button>
                      </div>
                    ))}
                  </div>
                )}
                {curatedSources.length > 0 && (
                  <div style={{ marginTop:16 }}>
                    <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--app-fg-4)', marginBottom:8 }}>Détectés par l'IA ({curatedSources.length})</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      {curatedSources.map(src => (
                        <div key={src.id} className="card" style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', opacity:src.actif?1:0.5 }}>
                          <img src={`https://unavatar.io/twitter/${src.handle}`} alt={src.handle} style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} onError={e=>{e.target.style.display='none';}}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:600, color:'var(--app-fg-2)' }}>@{src.handle}</div>
                            {src.vitesse && <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', padding:'1px 5px', borderRadius:3, background:src.vitesse==='breaking'?'rgba(239,68,68,.1)':src.vitesse==='rapide'?'rgba(245,158,11,.1)':'rgba(99,102,241,.1)', color:src.vitesse==='breaking'?'#DC2626':src.vitesse==='rapide'?'#D97706':'#4F46E5' }}>{src.vitesse}</span>}
                          </div>
                          <button className="btn btn-ghost btn-icon btn-sm" title={src.actif?'Désactiver':'Activer'} onClick={async()=>{await veilleFetch(`/twitter/curated-sources/${src.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({actif:!src.actif})});setCuratedSources(cs=>cs.map(s=>s.id===src.id?{...s,actif:!s.actif}:s));}}><AppIcon name={src.actif?'eye':'eyeOff'} size={11}/></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reconfigurer */}
              <div style={{ marginTop:28, paddingTop:20, borderTop:'1px solid var(--app-line)' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setSettingsOpen(false); onReset(); }} style={{ width:'100%', justifyContent:'center', fontSize:12, color:'var(--app-fg-3)' }}>
                  <AppIcon name="settings" size={11}/> Reconfigurer le compte Instagram
                </button>
              </div>
            </div>
          </div>
          <style>{`@keyframes slideInRight { from{transform:translateX(100%)} to{transform:translateX(0)} }`}</style>
        </div>
      )}

    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SourcesScreen — point d'entrée
// ═══════════════════════════════════════════════════════════════════════════
const SourcesScreen = ({ authUser }) => {
  const [compteId, setCompteId]   = useState(() => localStorage.getItem('veille_compte_id'));
  const [step, setStep]           = useState('input');
  const [url, setUrl]             = useState('');
  const [profil, setProfil]       = useState(null);
  const [apiError, setApiError]   = useState(null);
  const [loadingError, setLoadingError] = useState(null);

  // Récupère le compte lié à l'user si localStorage vide
  useEffect(() => {
    if (compteId || !authUser?.id) return;
    const sb = window.__supabase;
    if (!sb) return;
    sb.from('comptes').select('id').eq('user_id', authUser.id).maybeSingle()
      .then(({ data }) => {
        if (data?.id) { localStorage.setItem('veille_compte_id', data.id); setCompteId(data.id); }
      });
  }, [authUser]);

  const handleAnalyze = async (inputUrl) => {
    setUrl(inputUrl);
    setStep('loading');
    setApiError(null);
    setLoadingError(null);
    try {
      const res  = await veilleFetch(`/onboarding/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur inconnue');
      setProfil(json.profil);
      setStep('validation');
    } catch (err) {
      setLoadingError(err.message);
    }
  };

  const handleReset = () => {
    localStorage.removeItem('veille_compte_id');
    localStorage.removeItem('veille_profil');
    setCompteId(null);
    setStep('input');
    setProfil(null);
  };

  if (compteId) return <VeilleBoard compteId={compteId} freshSetup={step === 'saved'} onReset={handleReset}/>;
  if (step === 'loading')    return <SetupLoading url={url} error={loadingError} onRetry={() => { setStep('input'); setLoadingError(null); }}/>;
  if (step === 'validation') return <SetupValidation profil={profil} authUser={authUser} onSave={id => { setCompteId(id); setStep('saved'); }}/>;
  return <SetupInput onAnalyze={handleAnalyze} error={apiError}/>;
};

Object.assign(window, { SourcesScreen });
