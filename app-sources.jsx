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
          <h1 className="page-title">Sources & Veille ⚡</h1>
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
            <button type="submit" className="btn btn-primary" style={{ width:'100%', padding:'12px', fontSize:14, marginTop:4 }}>
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

const BreakingBar = ({ data, onGenerate }) => {
  const pct = (data.elapsedMinutes / data.saturationMinutes) * 100;
  const remaining = data.saturationMinutes - data.elapsedMinutes;
  const hours = Math.floor(remaining / 60);
  const mins = remaining % 60;
  return (
    <div className="breaking-bar">
      <div className="breaking-pulse-layer"/>
      <div className="breaking-main">
        <div className="breaking-badge"><span className="breaking-dot"/><span>BREAKING</span></div>
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
          {data.url && <Btn variant="ghost" size="sm" icon="eye" onClick={() => window.open(data.url, '_blank')}>Voir</Btn>}
          <Btn variant="primary" size="sm" icon="bolt" onClick={() => onGenerate?.(data)}>Générer maintenant</Btn>
        </div>
      </div>
    </div>
  );
};

const NewsRow = ({ item, active, onClick, onHover3s, onDismiss }) => {
  const heatDot    = item.heat === 'hot' ? 'dot-hot' : item.heat === 'warm' ? 'dot-warm' : 'dot-cool';
  const hoverTimer = useRef(null);

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(() => onHover3s?.(item.id), 3000);
  };
  const handleMouseLeave = () => clearTimeout(hoverTimer.current);

  return (
    <div
      className={`news-row ${active ? 'active' : ''}`}
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
            {item.match >= 0.7 && <span className="match-badge match-badge--strong">◆ {Math.round(item.match*100)}% pertinent</span>}
            {item.match >= 0.5 && item.match < 0.7 && <span className="match-badge">{Math.round(item.match*100)}%</span>}
            {item.match < 0.5 && <span className="match-badge match-badge--weak">hors univers</span>}
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

const ActionPanel = ({ news, onCopy, onGenerate }) => {
  const [copied, setCopied] = useState(false);

  if (!news) return <div className="action-empty">Sélectionne une news</div>;
  if (!news.format) return (
    <div className="action-panel action-panel--weak">
      <div className="action-weak-icon">◇</div>
      <div className="action-weak-title">Pas pertinent pour ton univers</div>
      <div className="action-weak-desc">{news.why}.</div>
      <button className="btn btn-ghost btn-sm" style={{marginTop:14}}
        onClick={() => onGenerate?.(news.id, null)}
      ><AppIcon name="bolt" size={12}/>Forger quand même</button>
    </div>
  );

  const handleCopy = () => {
    navigator.clipboard?.writeText(news.caption);
    onCopy?.(news.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="action-panel">
      <div className="action-head"><span className="action-kicker">FORJE TE SUGGÈRE</span><span className="action-match">◆ {Math.round(news.match*100)}% pertinent</span></div>
      <div className="action-why"><AppIcon name="target" size={12}/><span>{news.why}</span></div>
      <div className="action-recs">
        <div className="action-rec"><div className="action-rec-label">Format recommandé</div><div className="action-rec-value"><AppIcon name="layers" size={14}/>{news.format}</div></div>
        <div className="action-rec"><div className="action-rec-label">Fenêtre de publication</div><div className="action-rec-value"><AppIcon name="clock" size={14}/>{news.timing || '—'}</div></div>
      </div>
      {news.caption && (
        <div className="action-caption-block">
          <div className="action-caption-head">
            <span>Caption prête à copier</span>
            <div className="action-caption-actions">
              <button className="action-mini-btn"><AppIcon name="sparkle" size={11}/>Régénérer</button>
              <button className="action-mini-btn" onClick={handleCopy} style={{ color: copied ? '#22C55E' : undefined }}>
                <AppIcon name="copy" size={11}/>{copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
          </div>
          <div className="action-caption-body">{news.caption}</div>
          <div className="action-caption-foot"><span>{news.caption.length} caractères</span><span className="tag tag-dot tag-success">Score {Math.round(news.match * 10)}/10</span></div>
        </div>
      )}
      <div className="action-cta">
        <button className="btn btn-primary btn-sm" style={{flex:1}}
          onClick={() => onGenerate?.(news.id, news.format)}
        ><AppIcon name="bolt" size={12}/>Forger ce post</button>
      </div>
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

const VeilleBoard = ({ compteId, freshSetup = false, onReset }) => {
  const [boardData, setBoardData]   = useState({ breaking: [], board: [], total: 0 });
  const [loading, setLoading]       = useState(true);
  const [scoring, setScoring]       = useState(false);
  const [selected, setSelected]     = useState(null);
  const [filter, setFilter]         = useState('all');
  const [view, setView]             = useState('board'); // 'board' | 'latest' | 'sources'
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
    try {
      await veilleFetch(`/scoring/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compte_id: compteId }),
      });
      await loadBoard();
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
      if (total === 0) {
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
    return () => clearInterval(iv);
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
      await veilleFetch(`/rss/refresh?compte_id=${compteId}`);
    } catch (err) { console.error('[Refresh]', err.message); }
    finally { setRefreshing(false); }
    // Scoring en background — poll toutes les 4s pendant 3 min
    setScoring(true);
    await loadBoard();
    const pollStart = Date.now();
    const pollIv = setInterval(async () => {
      await loadBoard();
      if (Date.now() - pollStart > 3 * 60 * 1000) {
        clearInterval(pollIv);
        setScoring(false);
      }
    }, 4000);
    setTimeout(() => { clearInterval(pollIv); setScoring(false); }, 3 * 60 * 1000);
  };

  const feed = (boardData.board || []).filter(item => !dismissed.has(item.id)).map(item => {
    const raw = item.news_raw || {};
    return {
      id:        item.id,
      createdAt: raw.published_at || raw.created_at,
      when:      fmtAge(raw.published_at || raw.created_at),
      heat:      item.flag === 'urgent' ? 'hot' : item.flag === 'a_traiter' ? 'warm' : 'cool',
      source:    raw.source || '—',
      cat:       item.format_suggere || null,
      match:     Math.min(1, (item.score_total || 0) / 10),
      score:     item.score_total || 0,
      why:       item.pourquoi_ce_score || '',
      format:    item.format_suggere,
      timing:    item.timing_optimal,
      caption:   item.caption,
      title:     raw.titre || '(sans titre)',
      url:       raw.url,
      hashtags:  item.hashtags || [],
    };
  });

  const breaking = (boardData.breaking || []).slice(0, 1).map(item => {
    const raw = item.news_raw || {};
    const age = item.fenetre_age_minutes || 0;
    const rem = item.fenetre_temps_restant_minutes || 120;
    return {
      title:             raw.titre || '(breaking)',
      source:            `${raw.source || '—'} · il y a ${age} min`,
      matched:           item.hashtags?.length ? item.hashtags : [item.angle].filter(Boolean),
      saturationMinutes: age + rem,
      elapsedMinutes:    age,
    };
  });

  const activeId = selected ?? feed[0]?.id ?? null;
  const active   = feed.find(n => n.id === activeId);
  const filtered = feed.filter(n =>
    filter === 'hot'      ? n.heat === 'hot'  :
    filter === 'relevant' ? n.match >= 0.7    : true
  );

  const refreshLabel = refreshedAt
    ? (() => { const m = Math.round((Date.now() - refreshedAt) / 60000); return m < 1 ? 'maintenant' : `il y a ${m} min`; })()
    : '—';

  if (loading) return (
    <div className="page-body" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, flexDirection:'column', gap:14 }}>
      <div style={{ width:28, height:28, border:'2px solid var(--app-line)', borderTopColor:'var(--app-accent)', borderRadius:'50%', animation:'vb-spin .8s linear infinite' }}/>
      <span style={{ fontSize:13, color:'var(--app-fg-3)' }}>Chargement du board…</span>
      <style>{`@keyframes vb-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div className="sources-page">
      {breaking[0] && view === 'board' && (
        <BreakingBar
          data={breaking[0]}
          onGenerate={(d) => window.__goToGenerate?.({ title: d.title, url: d.url, source: d.source })}
        />
      )}

      {/* ── Onglets Board / Latest ── */}
      <div className="view-tabs">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {compteInfo?.instagram_url && (() => {
            const handle = compteInfo.instagram_url.replace(/\/$/, '').split('/').pop();
            return (
              <img
                src={`https://unavatar.io/instagram/${handle}`}
                alt={compteInfo.nom || handle}
                title={`@${handle}`}
                style={{ width:26, height:26, borderRadius:'50%', objectFit:'cover', border:'1.5px solid var(--app-line)', flexShrink:0 }}
                onError={e => { e.target.style.display='none'; }}
              />
            );
          })()}
        <div className="view-tabs-inner">
          <button className={`view-tab ${view==='board'?'active':''}`} onClick={() => setView('board')}>
            <AppIcon name="bolt" size={12}/> Board
            {feed.filter(n=>n.heat==='hot').length > 0 && (
              <span className="view-tab-hot">{feed.filter(n=>n.heat==='hot').length}</span>
            )}
          </button>
          <button className={`view-tab ${view==='latest'?'active':''}`} onClick={() => { setView('latest'); loadLatestRaw(); }}>
            <AppIcon name="news" size={12}/> Latest
            <span className="view-tab-count">{latestRaw.length + latestTweets.length}</span>
          </button>
          <button className={`view-tab ${view==='sources'?'active':''}`} onClick={() => setView('sources')}>
            <AppIcon name="globe" size={12}/> Sources
            <span className="view-tab-count">{sourcesRss.length}</span>
          </button>
        </div>
        </div>
        <div className="view-tabs-actions">
          {learning && <span style={{ fontSize:12, color:'var(--app-accent)', fontWeight:600 }}>⚡ Apprentissage…</span>}
          <button className="feed-filter-icon" title={refreshing ? 'En cours…' : 'Rafraîchir RSS + scorer'} onClick={runRefresh} disabled={refreshing || scoring} style={{ opacity: (refreshing||scoring)?0.5:1 }}>
            {refreshing ? <span style={{fontSize:10,color:'var(--app-accent)',fontWeight:700}}>…</span> : <AppIcon name="refresh" size={12}/>}
          </button>
          <button className="feed-filter-icon" title={scoring ? 'Scoring…' : 'Rescorer'} onClick={runScoring} disabled={scoring||refreshing} style={{ opacity:(scoring||refreshing)?0.5:1 }}>
            {scoring ? <span style={{fontSize:10,color:'var(--app-accent)',fontWeight:700}}>…</span> : <AppIcon name="bolt" size={12}/>}
          </button>
          <button className="feed-filter-icon" title="Reconfigurer" onClick={onReset}><AppIcon name="settings" size={12}/></button>
        </div>
      </div>

      {/* ── Barre tendances (board uniquement) ── */}
      {view === 'board' && <BarreTendances tendances={tendances} onTrendClick={handleTrendClick}/>}

      {/* ── Vue Latest ── */}
      {view === 'latest' && (
        <div className="latest-wrapper">
          <div className="latest-header">
            <span>{latestRaw.length + latestTweets.length} articles · toutes sources · triés par date de publication</span>
          </div>

          {/* Tweets pinned at top */}
          {latestTweets.length > 0 && (
            <div style={{ borderBottom:'1px solid var(--app-line)' }}>
              <div style={{ padding:'8px 20px 6px', fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--app-fg-3)', display:'flex', alignItems:'center', gap:6 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ color:'var(--app-fg-3)' }}>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Twitter / X <span style={{ fontWeight:400, color:'var(--app-fg-4)', textTransform:'none', letterSpacing:0, fontSize:11 }}>· {latestTweets.length}</span>
              </div>
              {latestTweets.map(item => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="latest-row"
                  style={{ background:'rgba(0,0,0,.015)' }}
                >
                  <div className="latest-row-left">
                    <span className="latest-time">{fmtAge(item.published_at || item.created_at)}</span>
                    <span className="latest-source" style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink:0, opacity:0.7 }}>
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                      {item.source}
                    </span>
                  </div>
                  <div className="latest-row-title">{item.titre}</div>
                </a>
              ))}
            </div>
          )}

          {/* RSS articles */}
          <div className="latest-list">
            {latestRaw.length === 0 && latestTweets.length === 0 ? (
              <div style={{ padding:'40px 24px', textAlign:'center', color:'var(--app-fg-3)', fontSize:13 }}>
                Aucune news — clique ↻ pour rafraîchir.
              </div>
            ) : latestRaw.map(item => (
              <div key={item.id} className="latest-row">
                <div className="latest-row-left">
                  <span className="latest-time">{fmtAge(item.published_at || item.created_at)}</span>
                  <span className="latest-source">{item.source}</span>
                </div>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="latest-row-title latest-row-link">{item.titre}</a>
                <button
                  className="latest-forge-btn"
                  onClick={() => window.__goToGenerate?.({ titre: item.titre, url: item.url, source: item.source })}
                >Forger →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Vue Sources ── */}
      {view === 'sources' && (
        <div style={{ padding:'24px 0', maxWidth:680 }}>
          {/* Add source */}
          <div className="card card-pad" style={{ marginBottom:20, padding:'20px 24px' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--app-fg-2)', marginBottom:4 }}>
              Ajouter une source de veille
            </div>
            <div style={{ fontSize:12, color:'var(--app-fg-3)', marginBottom:14 }}>
              Donne un nom de média — l'IA trouve son flux RSS automatiquement.
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <input
                type="text"
                value={addInput}
                onChange={e => { setAddInput(e.target.value); setAddSourceMsg(null); }}
                onKeyDown={e => e.key === 'Enter' && !addingSource && handleAddSource()}
                placeholder="ex: Le Monde, Wired, The Athletic…"
                disabled={addingSource}
                style={{
                  flex:1, background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
                  borderRadius:'var(--radius)', padding:'9px 12px',
                  color:'var(--app-fg)', fontFamily:'DM Sans, sans-serif', fontSize:13,
                  outline:'none', opacity: addingSource ? 0.6 : 1,
                  transition:'border-color .15s',
                }}
                onFocus={e => e.target.style.borderColor='var(--app-accent)'}
                onBlur={e  => e.target.style.borderColor='var(--app-line)'}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAddSource}
                disabled={addingSource || !addInput.trim()}
                style={{ whiteSpace:'nowrap', minWidth:120 }}
              >
                {addingSource
                  ? <><span style={{ display:'inline-block', width:10, height:10, border:'1.5px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'vb-spin .7s linear infinite', marginRight:6 }}/> Recherche…</>
                  : <><AppIcon name="search" size={12}/>Trouver le RSS</>
                }
              </button>
            </div>
            {addSourceMsg && (
              <div style={{
                marginTop:10, padding:'8px 12px', borderRadius:7, fontSize:12,
                background: addSourceMsg.type === 'ok' ? 'rgba(34,197,94,.08)' : 'rgba(197,48,48,.06)',
                border: `1px solid ${addSourceMsg.type === 'ok' ? 'rgba(34,197,94,.2)' : 'rgba(197,48,48,.15)'}`,
                color: addSourceMsg.type === 'ok' ? '#15803D' : '#C53030',
              }}>
                {addSourceMsg.text}
              </div>
            )}
          </div>

          {/* Sources découvertes par Agent 1 */}
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--app-fg-3)', marginBottom:10 }}>
            Sources actives ({sourcesRss.length})
          </div>
          {sourcesRss.length === 0 ? (
            <div className="card card-pad" style={{ padding:'24px', textAlign:'center', color:'var(--app-fg-3)', fontSize:13 }}>
              Aucune source RSS configurée — ajoute une source ci-dessus ou relance l'analyse de ton compte.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {sourcesRss.map((f, i) => (
                <div key={i} className="card" style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px' }}>
                  <div style={{ width:28, height:28, borderRadius:7, background:'rgba(79,91,213,.08)', display:'grid', placeItems:'center', flexShrink:0 }}>
                    <AppIcon name="globe" size={13} style={{ color:'var(--app-accent)' }}/>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--app-fg-2)', marginBottom:1 }}>{f.source}</div>
                    <div style={{ fontSize:11, color:'var(--app-fg-4)', fontFamily:'JetBrains Mono, monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.url}</div>
                  </div>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-icon btn-sm" title="Ouvrir le feed" style={{ flexShrink:0 }}>
                    <AppIcon name="arrowRight" size={12}/>
                  </a>
                  <button className="btn btn-ghost btn-icon btn-sm" title="Retirer" style={{ flexShrink:0 }} onClick={() => handleRemoveSource(f.url)}>
                    <AppIcon name="trash" size={12}/>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop:20, padding:'12px 16px', background:'var(--app-surface-2)', borderRadius:9, fontSize:12, color:'var(--app-fg-3)', display:'flex', gap:8, alignItems:'flex-start' }}>
            <AppIcon name="bolt" size={12} style={{ marginTop:1, flexShrink:0 }}/>
            <span>En dehors de ces sources, Forje utilise aussi un ensemble de feeds généralistes (Le Monde, BFMTV, BBC, NYT…) et des feeds thématiques détectés automatiquement selon ta niche.</span>
          </div>

          {/* ── Comptes Twitter / X ── */}
          <div style={{ marginTop:32 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ color:'var(--app-fg-2)', flexShrink:0 }}>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--app-fg-3)' }}>
                Comptes Twitter / X ({twitterAccounts.length})
              </div>
            </div>

            {/* Add Twitter account */}
            <div className="card card-pad" style={{ marginBottom:12, padding:'20px 24px' }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--app-fg-2)', marginBottom:4 }}>
                Suivre un compte Twitter
              </div>
              <div style={{ fontSize:12, color:'var(--app-fg-3)', marginBottom:14 }}>
                Colle un @handle ou une URL x.com — les tweets récents entrent dans le board et sont scorés comme les autres actus.
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <input
                  type="text"
                  value={addTwInput}
                  onChange={e => { setAddTwInput(e.target.value); setAddTwMsg(null); }}
                  onKeyDown={e => e.key === 'Enter' && !addingTw && handleAddTwitter()}
                  placeholder="@handle  ou  https://x.com/handle"
                  disabled={addingTw}
                  style={{
                    flex:1, background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
                    borderRadius:'var(--radius)', padding:'9px 12px',
                    color:'var(--app-fg)', fontFamily:'DM Sans, sans-serif', fontSize:13,
                    outline:'none', opacity: addingTw ? 0.6 : 1,
                    transition:'border-color .15s',
                  }}
                  onFocus={e => e.target.style.borderColor='var(--app-accent)'}
                  onBlur={e  => e.target.style.borderColor='var(--app-line)'}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleAddTwitter}
                  disabled={addingTw || !addTwInput.trim()}
                  style={{ whiteSpace:'nowrap', minWidth:110, background:'#000', borderColor:'#000' }}
                >
                  {addingTw
                    ? <><span style={{ display:'inline-block', width:10, height:10, border:'1.5px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'vb-spin .7s linear infinite', marginRight:6 }}/>Ajout…</>
                    : <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink:0 }}>
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        Ajouter
                      </>
                  }
                </button>
              </div>
              {addTwMsg && (
                <div style={{
                  marginTop:10, padding:'8px 12px', borderRadius:7, fontSize:12,
                  background: addTwMsg.type === 'ok' ? 'rgba(34,197,94,.08)' : 'rgba(197,48,48,.06)',
                  border: `1px solid ${addTwMsg.type === 'ok' ? 'rgba(34,197,94,.2)' : 'rgba(197,48,48,.15)'}`,
                  color: addTwMsg.type === 'ok' ? '#15803D' : '#C53030',
                }}>
                  {addTwMsg.text}
                </div>
              )}
            </div>

            {/* Liste des comptes suivis manuellement */}
            {twitterAccounts.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {twitterAccounts.map((handle, i) => (
                  <div key={i} className="card" style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px' }}>
                    <div style={{ width:28, height:28, borderRadius:7, background:'rgba(0,0,0,.06)', display:'grid', placeItems:'center', flexShrink:0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color:'#000' }}>
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--app-fg-2)' }}>@{handle}</div>
                    </div>
                    <a href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-icon btn-sm" title="Voir le profil" style={{ flexShrink:0 }}>
                      <AppIcon name="arrowRight" size={12}/>
                    </a>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Retirer" style={{ flexShrink:0 }} onClick={() => handleRemoveTwitter(handle)}>
                      <AppIcon name="trash" size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Sources curatées par l'IA lors de l'onboarding */}
            {curatedSources.length > 0 && (
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--app-fg-4)', marginBottom:10 }}>
                  Sources détectées par l'IA ({curatedSources.length})
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {curatedSources.map(src => (
                    <div key={src.id} className="card" style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', opacity: src.actif ? 1 : 0.5 }}>
                      <img
                        src={`https://unavatar.io/twitter/${src.handle}`}
                        alt={src.handle}
                        style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover', flexShrink:0, background:'var(--app-surface-2)' }}
                        onError={e => { e.target.style.display='none'; }}
                      />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:13, fontWeight:600, color:'var(--app-fg-2)' }}>@{src.handle}</span>
                          {src.nom && <span style={{ fontSize:11, color:'var(--app-fg-4)' }}>{src.nom}</span>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
                          {src.vitesse && (
                            <span style={{
                              fontSize:10, fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase',
                              padding:'1px 6px', borderRadius:4,
                              background: src.vitesse === 'breaking' ? 'rgba(239,68,68,.1)' : src.vitesse === 'rapide' ? 'rgba(245,158,11,.1)' : 'rgba(99,102,241,.1)',
                              color: src.vitesse === 'breaking' ? '#DC2626' : src.vitesse === 'rapide' ? '#D97706' : '#4F46E5',
                            }}>
                              {src.vitesse}
                            </span>
                          )}
                          {src.type && <span style={{ fontSize:10, color:'var(--app-fg-4)' }}>{src.type}</span>}
                          {src.fiabilite && <span style={{ fontSize:10, color:'var(--app-fg-4)' }}>{'★'.repeat(Math.round(src.fiabilite/2))}</span>}
                        </div>
                      </div>
                      <a href={`https://x.com/${src.handle}`} target="_blank" rel="noopener noreferrer"
                        className="btn btn-ghost btn-icon btn-sm" title="Voir le profil" style={{ flexShrink:0 }}>
                        <AppIcon name="arrowRight" size={12}/>
                      </a>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        title={src.actif ? 'Désactiver' : 'Activer'}
                        style={{ flexShrink:0 }}
                        onClick={async () => {
                          await veilleFetch(`/twitter/curated-sources/${src.id}`, {
                            method:'PATCH', headers:{'Content-Type':'application/json'},
                            body: JSON.stringify({ actif: !src.actif }),
                          });
                          setCuratedSources(cs => cs.map(s => s.id === src.id ? {...s, actif: !s.actif} : s));
                        }}
                      >
                        <AppIcon name={src.actif ? 'eye' : 'eyeOff'} size={12}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Vue Board ── */}
      {view === 'board' && (
        <div className="sources-layout">
          <section className="sources-feed">
            <div className="feed-head">
              <div>
                <h2 className="feed-title-main">Flux temps réel</h2>
                <p className="feed-sub">
                  {feed.length} actus scorées · rafraîchi {refreshLabel}
                </p>
              </div>
              <div className="feed-filters">
                <button className={`feed-filter ${filter==='all'?'active':''}`} onClick={()=>setFilter('all')}>Tout <span className="count-inline">{feed.length}</span></button>
                <button className={`feed-filter ${filter==='hot'?'active':''}`} onClick={()=>setFilter('hot')}><span className="dot dot-hot"/>Hot <span className="count-inline">{feed.filter(n=>n.heat==='hot').length}</span></button>
                <button className={`feed-filter ${filter==='relevant'?'active':''}`} onClick={()=>setFilter('relevant')}>Pertinents <span className="count-inline">{feed.filter(n=>n.match>=0.7).length}</span></button>
              </div>
            </div>
            {feed.length === 0 ? (
              <div style={{ padding:'48px 24px', textAlign:'center', display:'flex', flexDirection:'column', gap:12, alignItems:'center' }}>
                {scoring || refreshing ? (
                  <>
                    <div style={{ width:28, height:28, border:'2px solid var(--app-line)', borderTopColor:'var(--app-accent)', borderRadius:'50%', animation:'vb-spin .8s linear infinite' }}/>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--app-fg-2)' }}>Analyse en cours…</div>
                    <div style={{ fontSize:13, color:'var(--app-fg-3)', maxWidth:300 }}>
                      {refreshing ? 'Récupération des flux RSS…' : 'Claude score les actus pour ton profil — 30 à 60 sec.'}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:28 }}>⚡</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--app-fg-2)' }}>Aucune news scorée</div>
                    <div style={{ fontSize:13, color:'var(--app-fg-3)', maxWidth:280 }}>Lance le scoring pour analyser les dernières actus.</div>
                    <button className="btn btn-primary btn-sm" onClick={runScoring} style={{ marginTop:4 }}>
                      <AppIcon name="bolt" size={12}/>Lancer le scoring
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="feed-list">
                {filtered.map(item => (
                  <NewsRow
                    key={item.id} item={item}
                    active={item.id === activeId}
                    onClick={() => { setSelected(item.id); track(item.id, 'open'); }}
                    onHover3s={(id) => track(id, 'hover', { temps_passe_secondes: 3 })}
                    onDismiss={(id) => { setDismissed(d => new Set([...d, id])); track(id, 'dismiss'); if (activeId===id) setSelected(null); }}
                  />
                ))}
              </div>
            )}
          </section>
          <aside className="sources-action">
            <ActionPanel
              news={active}
              onCopy={(id) => track(id, 'copy')}
              onGenerate={(id, format) => {
                track(id, 'generate', { format_utilise: format });
                if (window.__goToGenerate && active) {
                  window.__goToGenerate({ title: active.title, caption: active.caption, url: active.url, source: active.source });
                }
              }}
            />
          </aside>
        </div>
      )}

      {view === 'board' && <HeatBar topics={HEAT_TOPICS}/>}
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
