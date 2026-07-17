/* global React */
var { useState, useEffect, useRef } = React;

// ─── Fetch helper ─────────────────────────────────────────────────────────────
async function obFetch(path, opts) {
  var sb = window.__supabase;
  var token = null;
  if (sb) { var sess = await sb.auth.getSession(); token = sess.data?.session?.access_token; }
  var headers = Object.assign({ 'Content-Type': 'application/json' }, opts && opts.headers);
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch('/api' + path, Object.assign({}, opts, { headers }));
}

// ─── Supabase helper ──────────────────────────────────────────────────────────
async function upsertClient(payload) {
  var sb = window.__supabase;
  var user = window.__currentUser;
  if (!sb || !user) throw new Error('Non authentifié');

  var { data: existing } = await sb.from('clients').select('id').eq('user_id', user.id).maybeSingle();
  if (existing) {
    await sb.from('clients').update(payload).eq('id', existing.id);
    return existing.id;
  } else {
    var { data: created } = await sb.from('clients').insert({ ...payload, user_id: user.id }).select('id').single();
    return created.id;
  }
}

// ─── Tags input ───────────────────────────────────────────────────────────────
const ObTagsInput = ({ tags, setTags, placeholder }) => {
  var [input, setInput] = useState('');
  var inputRef = useRef(null);

  var handleKey = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      var val = input.trim().replace(/,$/, '');
      if (val && !tags.includes(val)) setTags([...tags, val]);
      setInput('');
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  return (
    <div className="ob-tags-box" onClick={() => inputRef.current?.focus()}>
      {tags.map(t => (
        <span key={t} className="ob-tag-chip">
          {t}
          <button className="ob-tag-remove" onClick={(e) => { e.stopPropagation(); setTags(tags.filter(x => x !== t)); }}>×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="ob-tag-field"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        placeholder={tags.length === 0 ? placeholder : ''}
      />
    </div>
  );
};

// ─── Background (landing language) ───────────────────────────────────────────
const ObBackground = () => (
  <>
    <div className="ob-bg"/>
    <div className="ob-stars"/>
  </>
);

// ─── Progress bar ─────────────────────────────────────────────────────────────
const ObProgress = ({ step, total }) => {
  var pct = ((step - 1) / (total - 1)) * 100;
  return (
    <div className="ob-progress">
      <div className="ob-progress-fill" style={{ width: pct + '%' }}/>
    </div>
  );
};

// ═══ STEP 1 — Welcome ═════════════════════════════════════════════════════════
const StepWelcome = ({ onNext }) => (
  <div className="ob-step ob-step-enter">
    <div className="ob-logo-mark">
      <img src="assets/forje-logo.png" alt="Forje" style={{ width: 52, height: 52, objectFit: 'contain' }} />
    </div>
    <div className="ob-text-block">
      <h1 className="ob-title">Bienvenue dans<br/><span className="accent">Forje Studio</span></h1>
      <p className="ob-subtitle">Le studio Instagram qui apprend ton style<br/>et publie à l'infini.</p>
    </div>
    <button className="ob-btn-primary" onClick={onNext}>
      Commencer
      <span style={{ opacity: 0.6, fontSize: 13 }}>→</span>
    </button>
  </div>
);

// ═══ STEP 2 — Qualify ════════════════════════════════════════════════════════
const StepQualify = ({ onNext, onBack }) => (
  <div className="ob-step ob-step-enter">

    <div className="ob-text-block">
      <h1 className="ob-title" style={{ fontSize: 38 }}>Où en es-tu<br/>sur Instagram ?</h1>
    </div>
    <div className="ob-qualify-grid">
      <div className="ob-qualify-card" onClick={() => onNext('A')}>
        <span className="ob-qualify-card-marker">A</span>
        <span className="ob-qualify-card-title">J'ai déjà un compte Instagram</span>
        <span className="ob-qualify-card-desc">Posts existants, charte visuelle en place, handle actif.</span>
      </div>
      <div className="ob-qualify-card" onClick={() => onNext('B')}>
        <span className="ob-qualify-card-marker">B</span>
        <span className="ob-qualify-card-title">Je pars de zéro sur Instagram</span>
        <span className="ob-qualify-card-desc">Pas encore de DA ni de présence Instagram — Forje construit tout.</span>
      </div>
    </div>
  </div>
);

// ─── Font picker ──────────────────────────────────────────────────────────────
var TITLE_FONTS = [
  { name: 'Bebas Neue',       sample: 'TITRE CHOC'      },
  { name: 'Oswald',           sample: 'FLASH INFO'       },
  { name: 'Anton',            sample: 'L\'ACTU'          },
  { name: 'Barlow Condensed', sample: 'BREAKING'         },
  { name: 'Playfair Display', sample: 'L\'Édito'         },
  { name: 'Fraunces',         sample: 'Reportage'        },
  { name: 'Space Grotesk',    sample: 'TECH 2025'        },
  { name: 'Syne',             sample: 'ANALYSE'          },
  { name: 'DM Serif Display', sample: 'Grande Enquête'   },
  { name: 'Unbounded',        sample: 'IMPACT'           },
];

var BODY_FONTS = [
  { name: 'DM Sans',          sample: 'Corps de texte lisible'      },
  { name: 'Inter',            sample: 'Texte digital neutre'        },
  { name: 'Montserrat',       sample: 'Description du post'         },
  { name: 'Lato',             sample: 'Lecture journalistique'      },
  { name: 'Source Serif 4',   sample: 'Texte éditorial sérieux'    },
  { name: 'Nunito',           sample: 'Légende accessible'          },
  { name: 'Libre Franklin',   sample: 'Style presse classique'      },
  { name: 'Roboto',           sample: 'Universel et fiable'         },
];

const ObFontPicker = ({ label, labelOpt, fonts, value, onChange, allowUpload, onFileSelect }) => {
  var [customFont, setCustomFont] = useState(null); // { name, sample }
  var fileRef = useRef(null);

  useEffect(() => {
    var families = fonts.map(function(f) { return f.name.replace(/ /g, '+') + ':wght@400;700'; }).join('&family=');
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + families + '&display=swap';
    document.head.appendChild(link);
    return function() { try { document.head.removeChild(link); } catch(_) {} };
  }, []);

  var handleCustomFile = (file) => {
    if (!file) return;
    var name = file.name.replace(/\.[^.]+$/, '').replace(/[-_.]+/g, ' ').trim();
    var objectUrl = URL.createObjectURL(file);
    var style = document.createElement('style');
    style.textContent = "@font-face { font-family: '" + name + "'; src: url('" + objectUrl + "'); }";
    document.head.appendChild(style);
    setCustomFont({ name, sample: name });
    onChange(name);
    if (onFileSelect) onFileSelect(file, name);
  };

  var allFonts = customFont ? [customFont, ...fonts] : fonts;

  return (
    <div className="ob-font-picker">
      <div className="ob-font-picker-label">{label}{labelOpt && <span className="ob-label-opt"> {labelOpt}</span>}</div>
      <div className="ob-font-scroll">
        {allFonts.map(function(f) {
          return (
            <div key={f.name}
              className={'ob-font-card' + (value === f.name ? ' selected' : '')}
              onClick={() => onChange(f.name)}>
              <span className="ob-font-sample" style={{ fontFamily: "'" + f.name + "', serif" }}>{f.sample}</span>
              <span className="ob-font-name">{f.name}</span>
            </div>
          );
        })}
        {allowUpload && (
          <div className="ob-font-card ob-font-import-card" onClick={() => fileRef.current?.click()}>
            <span className="ob-font-import-icon">↑</span>
            <span className="ob-font-name">Importer ma police</span>
          </div>
        )}
      </div>
      {allowUpload && (
        <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) handleCustomFile(e.target.files[0]); e.target.value = ''; }}/>
      )}
    </div>
  );
};

// ═══ STEP 3A — Identity (existing account) ═══════════════════════════════════
const MOODS_A = ['Dramatique', 'Énergique', 'Premium', 'Populaire', 'Factuel', 'Brut'];

var SPORT_TOPICS_A = ['Football','Sport','NBA','Tennis','Rugby','Basket','Foot','F1','Cyclisme','Athlétisme'];

function aGraphicStyle(mood, topics) {
  if ((topics || []).some(function(t) { return SPORT_TOPICS_A.includes(t); })) return 'breaking';
  if (mood === 'Premium' || mood === 'Dramatique') return 'magazine';
  if (mood === 'Factuel') return 'minimaliste';
  return 'breaking';
}

function aFontPrimary(gStyle) {
  return ({ breaking:'Bebas Neue', magazine:'Playfair Display', minimaliste:'Syne',
            lifestyle:'DM Serif Display', sport:'Bebas Neue' })[gStyle] || 'Bebas Neue';
}

// Pack typographique par défaut selon le style graphique (titre + corps + id bibliothèque)
function aFontDefaults(gStyle) {
  return ({
    breaking:    { id:'bebas-neue',       title:'Bebas Neue',       body:'Barlow', set:'impact'  },
    magazine:    { id:'playfair-display', title:'Playfair Display', body:'Jost',   set:'premium' },
    minimaliste: { id:'syne',             title:'Syne',             body:'Outfit', set:'premium' },
    lifestyle:   { id:'dm-serif-display', title:'DM Serif Display', body:'Lato',   set:'premium' },
    sport:       { id:'bebas-neue',       title:'Bebas Neue',       body:'Barlow', set:'impact'  },
  })[gStyle] || { id:'bebas-neue', title:'Bebas Neue', body:'Barlow', set:'impact' };
}

function aBrandColors(mood) {
  return ({ Dramatique:['#0F0F0F','#6F42FF','#F5F5F5'], 'Énergique':['#0F0F0F','#C6FF00','#FF3B30'],
            Premium:['#1A1A2E','#6F42FF','#FFD700'],     Populaire:['#0F0F0F','#FF3B30','#FFFFFF'],
            Factuel:['#F5F5F5','#0047FF','#111111'],      Brut:['#0F0F0F','#FF3B30','#FFFFFF'],
  })[mood] || ['#0F0F0F','#0047FF','#FFFFFF'];
}

function aToneTags(mood) {
  return ({ Dramatique:['Direct','Percutant','Expert'],    'Énergique':['Percutant','Emotionnel','Engage'],
            Premium:['Premium','Expert','Inspirant'],      Populaire:['Accessible','Populaire','Direct'],
            Factuel:['Factuel','Informatif','Expert'],     Brut:['Direct','Percutant','Factuel'],
  })[mood] || ['Direct','Informatif','Expert'];
}

const StepIdentityA = ({ onNext, onBack }) => {
  var [name,      setName]      = useState('');
  var [logoUrl,   setLogoUrl]   = useState('');
  var [logoFile,  setLogoFile]  = useState(null);
  var [handle,    setHandle]    = useState('');
  var [mood,      setMood]      = useState('');
  var [topics,    setTopics]    = useState([]);
  var [saving,        setSaving]        = useState(false);
  var [error,         setError]         = useState(null);
  var fileRef = useRef(null);

  var canSubmit = name.trim() && mood && topics.length >= 2 && !saving;

  var handleFileChange = (file) => {
    if (!file) return;
    setLogoFile(file);
    var reader = new FileReader();
    reader.onload = (ev) => setLogoUrl(ev.target.result);
    reader.readAsDataURL(file);
  };

  var handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      var sb = window.__supabase;
      var user = window.__currentUser;
      if (!sb || !user) throw new Error('Non authentifié');

      var finalLogoUrl = null;
      if (logoFile) {
        var ext  = logoFile.name.split('.').pop();
        var path = 'logos/' + user.id + '/' + Date.now() + '.' + ext;
        var { error: uploadErr } = await sb.storage.from('brand-assets').upload(path, logoFile, { upsert: true });
        if (!uploadErr) {
          var { data: urlData } = sb.storage.from('brand-assets').getPublicUrl(path);
          finalLogoUrl = urlData.publicUrl;
        }
      }

      var gs = aGraphicStyle(mood, topics);
      var ft = aFontDefaults(gs); // pack typographique par défaut (Impact News, etc.)
      var clientId = await upsertClient({
        name:             name.trim(),
        logo_url:         finalLogoUrl || null,
        logo_badge_url:   finalLogoUrl || null, // variante badge = logo importé tel quel
        logo_style:       'badge',
        instagram_handle: handle.trim() || null,
        mood:             mood,
        topics:           topics,
        graphic_style:    gs,
        // Pack typographique imposé selon le profil — modifiable ensuite dans l'Identité.
        font_primary:     ft.title,
        font_id:          ft.id,
        font_set:         ft.set,
        font_is_custom:   false,
        font_body:        ft.body,
        brand_colors:     aBrandColors(mood),
        tone_tags:        aToneTags(mood),
        profile_type:     'A',
        onboarding_step:  4,
        onboarding_completed: false,
      });
      onNext(clientId);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="ob-step ob-step-enter" style={{ maxWidth: 560 }}>
  
      <div className="ob-text-block">
        <h1 className="ob-title" style={{ fontSize: 36 }}>Ton identité de marque</h1>
        <p className="ob-subtitle" style={{ fontSize: 14 }}>Ces informations fondent ton studio — elles s'affinent au fil du temps.</p>
      </div>

      <div className="ob-form">
        <div className="ob-field">
          <label className="ob-label">Nom du média</label>
          <input className="ob-input" value={name} onChange={e => setName(e.target.value)}
            placeholder="Raplume, Footmercato, Le Monde..."/>
        </div>

        <div className="ob-field">
          <label className="ob-label">Logo <span className="ob-label-opt">(PNG fond transparent)</span></label>
          <div
            className="ob-upload-zone"
            onClick={() => fileRef.current?.click()}
            onDrop={(e) => { e.preventDefault(); handleFileChange(e.dataTransfer.files[0]); }}
            onDragOver={(e) => e.preventDefault()}
          >
            {logoUrl
              ? <img src={logoUrl} className="ob-logo-preview" alt="Logo"/>
              : <>
                  <span className="ob-upload-arrow">↑</span>
                  <span className="ob-upload-label">Glisse ton logo ou clique pour uploader</span>
                  <span className="ob-upload-hint">PNG fond transparent — recommandé</span>
                </>
            }
          </div>
          <input ref={fileRef} type="file" accept=".png,image/png" style={{ display: 'none' }}
            onChange={(e) => handleFileChange(e.target.files[0])}/>
        </div>

        <div className="ob-field">
          <label className="ob-label">Handle Instagram <span className="ob-label-opt">(optionnel)</span></label>
          <input className="ob-input" value={handle} onChange={e => setHandle(e.target.value)} placeholder="@ton_compte"/>
        </div>

        <div className="ob-field">
          <label className="ob-label">Mood éditorial</label>
          <div className="ob-mood-row">
            {MOODS_A.map(m => (
              <button key={m}
                className={'ob-mood-pill' + (mood === m ? ' selected' : '')}
                onClick={() => setMood(m)}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="ob-field">
          <label className="ob-label">Sujets couverts <span className="ob-label-opt">(min. 2 — Entrée pour valider)</span></label>
          <ObTagsInput tags={topics} setTags={setTopics} placeholder="Football, PSG, Transferts..."/>
        </div>

        {/* Police imposée à la création : set Impact (Anton). Modifiable ensuite dans l'Identité de marque. */}

        {error && <p className="ob-error">{error}</p>}

        <button className="ob-btn-primary" onClick={handleSubmit} disabled={!canSubmit}
          style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Création en cours...' : 'Créer mon studio →'}
        </button>
      </div>
    </div>
  );
};

// ═══ STEP 3B — Brand gen (from scratch) ══════════════════════════════════════
const StepIdentityB = ({ onNext, onBack, existingClientId }) => {
  var [sub,        setSub]        = useState(0);
  var [name,       setName]       = useState('');
  var [topics,     setTopics]     = useState([]);
  var [firstName,  setFirstName]  = useState('');
  var [userPrompt, setUserPrompt] = useState('');
  var [refImage,   setRefImage]   = useState(null);
  var [kits,       setKits]       = useState([]);
  var [selected,   setSelected]   = useState(null);
  var [brandImg,   setBrandImg]   = useState(null);
  var [config,     setConfig]     = useState(null);

  var [logoUrl,    setLogoUrl]    = useState(null);
  var [clientId,   setClientId]   = useState(existingClientId || null);
  var [loading,    setLoading]    = useState(false);
  var [confirming, setConfirming] = useState(false);
  var [relogoing,  setRelogoing]  = useState(false);
  var [downloading4k, setDownloading4k] = useState(false);
  var [show4kModal, setShow4kModal] = useState(false);
  var [error,      setError]      = useState('');
  var [animKey,    setAnimKey]    = useState(0);
  var [zoomedKit,  setZoomedKit]  = useState(null);
  var [fontTitle,  setFontTitle]  = useState('');
  var [fontBody,   setFontBody]   = useState('DM Sans');
  var refFileRef = useRef(null);

  var advance = (next) => { setAnimKey(k => k + 1); setSub(next); };

  useEffect(() => {
    var backs = {
      0: onBack,
      1: () => advance(0),
      2: () => advance(1),
      3: () => advance(2),
      4: () => {},          // génération en cours — back bloqué (évite goTo(2) du shell)
      5: () => advance(3),
      6: () => {},          // confirm en cours — back bloqué
      7: () => advance(5),  // résultat → retour au carousel
    };
    window.__obBack = backs[sub] !== undefined ? backs[sub] : onBack;
    return () => { window.__obBack = null; };
  }, [sub, onBack]);

  // Forge un logo dédié, cohérent avec le brand kit (le kit sert de référence
  // visuelle à la génération) — badge + version détourée dérivés côté serveur.
  var relogo = async (kitImg) => {
    var img = kitImg || brandImg;
    if (!clientId || !img || relogoing) return;
    setRelogoing(true);
    try {
      var res = await obFetch('/generate/brand-identity/relogo', {
        method: 'POST',
        body: JSON.stringify({ clientId, imageUrl: img })
      });
      var data = await res.json();
      if (res.ok && data.logoUrl) {
        setLogoUrl(data.logoUrl);
        // Persiste dans l'état confirmé pour survivre au refresh
        try {
          var saved = JSON.parse(localStorage.getItem('forje_confirmed_' + clientId) || 'null');
          if (saved) { saved.logoUrl = data.logoUrl; localStorage.setItem('forje_confirmed_' + clientId, JSON.stringify(saved)); }
        } catch(_) {}
      }
    } catch(_) {}
    setRelogoing(false);
  };

  var downloadLogo4k = async () => {
    if (!clientId || !logoUrl || downloading4k) return;
    setDownloading4k(true);
    try {
      var res = await obFetch('/generate/brand-identity/logo-export?clientId=' + clientId);
      if (!res.ok) throw new Error('Export échoué');
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'logo-4k.png';
      a.click();
      URL.revokeObjectURL(url);
      setShow4kModal(true);
    } catch(e) { console.error('[logo-export]', e); }
    setDownloading4k(false);
  };

  useEffect(() => {
    var font = config?.font_primary;
    if (!font) return;
    var id = 'gf-ob-' + font.replace(/\s+/g, '-');
    if (!document.getElementById(id)) {
      var link = document.createElement('link');
      link.id = id; link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=' + font.replace(/\s+/g, '+') + ':wght@400;700;900&display=swap';
      document.head.appendChild(link);
    }
  }, [config?.font_primary]);

  // Restore state on refresh
  useEffect(() => {
    if (!existingClientId) return;

    // 1a. Etat confirmé (sub 7) — priorité maximale : retour depuis WOW
    try {
      var confirmed = localStorage.getItem('forje_confirmed_' + existingClientId);
      if (confirmed) {
        var p = JSON.parse(confirmed);
        setBrandImg(p.brandImg); setConfig(p.config); setLogoUrl(p.logoUrl || null);
        if (p.fontTitle) setFontTitle(p.fontTitle);
        else if (p.config?.font_primary) setFontTitle(p.config.font_primary);
        setSub(7);
        return;
      }
    } catch(_) {}

    // 1b. localStorage kits draft — instantané, avant même que supabase réponde
    try {
      var local = localStorage.getItem('forje_kits_draft_' + existingClientId);
      if (local) {
        var parsed = JSON.parse(local);
        if (parsed?.length) { setKits(parsed); setSelected(0); setSub(5); }
      }
    } catch(_) {}

    // 2. DB — source de vérité, met à jour si différent
    var sb = window.__supabase;
    if (!sb) return;
    sb.from('clients')
      .select('name, topics, brand_kits_draft')
      .eq('id', existingClientId)
      .single()
      .then(({ data: c }) => {
        if (!c) return;
        if (c.name) setName(c.name);
        if (c.topics?.length) setTopics(c.topics);
        if (c.brand_kits_draft?.length) {
          setKits(c.brand_kits_draft);
          setSelected(0);
          setSub(5);
          try { localStorage.setItem('forje_kits_draft_' + existingClientId, JSON.stringify(c.brand_kits_draft)); } catch(_) {}
        }
      });
  }, [existingClientId]);

  var handleRefImage = (file) => {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = (ev) => setRefImage(ev.target.result.split(',')[1]);
    reader.readAsDataURL(file);
  };

  var generateBrand = async () => {
    setSub(4); setLoading(true); setError(''); setKits([]); setSelected(null);
    try {
      var sb = window.__supabase;
      var ensuredId = clientId;
      if (!ensuredId) {
        ensuredId = await upsertClient({ name: name.trim(), topics, profile_type: 'B', onboarding_step: 3, onboarding_completed: false });
        setClientId(ensuredId);
        window.__activeClientId = ensuredId;
      }
      if (firstName.trim() && sb) {
        sb.auth.updateUser({ data: { full_name: firstName.trim() } }); // fire-and-forget — évite le refresh de session avant obFetch
      }
      var res = await obFetch('/generate/brand-identity', {
        method: 'POST',
        body: JSON.stringify({ clientId: ensuredId, name, topics, userPrompt, refImageB64: refImage })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur génération');
      var kitsData = data.kits || [];
      setKits(kitsData);
      setSelected(0);
      setSub(5);
      // Persist kits — localStorage instantané + DB
      if (kitsData.length) {
        try { localStorage.setItem('forje_kits_draft_' + ensuredId, JSON.stringify(kitsData)); } catch(_) {}
        if (sb) await sb.from('clients').update({ brand_kits_draft: kitsData, onboarding_step: 3 }).eq('id', ensuredId);
      }
    } catch (err) {
      setError(err.message || 'Erreur');
      setSub(3);
    } finally {
      setLoading(false);
    }
  };

  var confirmSelection = async () => {
    if (selected === null || !kits[selected]) return;
    setConfirming(true); setSub(6); setError('');
    try {
      var res = await obFetch('/generate/brand-identity/confirm', {
        method: 'POST',
        body: JSON.stringify({ clientId, name, topics, selectedKit: kits[selected] })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setBrandImg(data.imageUrl); setConfig(data.config); setLogoUrl(data.logoUrl || null);
      if (data.config?.font_primary) setFontTitle(data.config.font_primary);
      setSub(7);
      try {
        localStorage.setItem('forje_confirmed_' + clientId, JSON.stringify({
          brandImg: data.imageUrl, config: data.config,
          logoUrl: data.logoUrl || null, fontTitle: data.config?.font_primary || ''
        }));
        localStorage.removeItem('forje_kits_draft_' + clientId);
      } catch(_) {}
      // Pas de logo uploadé par l'utilisateur → forge automatique d'un logo
      // cohérent avec le kit choisi (s'affiche dans la tuile Logo dès qu'il est prêt)
      if (!data.logoUrl) relogo(data.imageUrl);
    } catch (err) {
      setError(err.message); setSub(5);
    } finally {
      setConfirming(false);
    }
  };

  // Q0 — Prénom
  if (sub === 0) return (
    <div key={animKey} className="ob-step ob-step-enter">
  
      <div className="ob-question-wrap">
        <span className="ob-eyebrow"><span className="ob-eyebrow-dot"/>01 — 04</span>
        <h1 className="ob-question-title">Quel est<br/>ton prénom ?</h1>
        <input className="ob-input" value={firstName} onChange={e => setFirstName(e.target.value)}
          placeholder="Ton prénom..." style={{ textAlign:'center', fontSize:17, maxWidth:300 }} autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && firstName.trim()) advance(1); }}/>
        <button className="ob-btn-primary" onClick={() => advance(1)} disabled={!firstName.trim()}>Suivant →</button>
      </div>
    </div>
  );

  // Q1 — Nom du média
  if (sub === 1) return (
    <div key={animKey} className="ob-step ob-step-enter">

      <div className="ob-question-wrap">
        <span className="ob-eyebrow"><span className="ob-eyebrow-dot"/>02 — 04</span>
        <h1 className="ob-question-title">Quel est le nom<br/>de ton média ?</h1>
        <input className="ob-input" value={name} onChange={e => setName(e.target.value)}
          placeholder="Nom de ton média..." style={{ textAlign:'center', fontSize:17, maxWidth:400 }} autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) advance(2); }}/>
        <button className="ob-btn-primary" onClick={() => advance(2)} disabled={!name.trim()}>Suivant →</button>
      </div>
    </div>
  );

  // Q2 — Sujets
  if (sub === 2) return (
    <div key={animKey} className="ob-step ob-step-enter">

      <div className="ob-question-wrap">
        <span className="ob-eyebrow"><span className="ob-eyebrow-dot"/>03 — 04</span>
        <h1 className="ob-question-title">Tu couvres quoi ?</h1>
        <p className="ob-subtitle">Football, Tech, Politique, Culture... Entrée pour valider.</p>
        <div style={{ width:'100%' }}><ObTagsInput tags={topics} setTags={setTopics} placeholder="Tape un sujet..."/></div>
        <button className="ob-btn-primary" onClick={() => advance(3)} disabled={topics.length === 0}>Suivant →</button>
      </div>
    </div>
  );

  // Q3 — Vision libre + image de référence
  if (sub === 3) return (
    <div key={animKey} className="ob-step ob-step-enter">

      <div className="ob-question-wrap" style={{ maxWidth:560 }}>
        <span className="ob-eyebrow"><span className="ob-eyebrow-dot"/>04 — 04</span>
        <h1 className="ob-question-title">Ta vision,<br/>tes références</h1>
        <p className="ob-subtitle" style={{ fontSize:13 }}>Décris ce que tu veux — ambiance, inspirations, couleurs. Ajoute une image si tu en as une.</p>
        <textarea className="ob-vision-textarea" value={userPrompt} onChange={e => setUserPrompt(e.target.value)} rows={4} autoFocus
          placeholder="Ex: Je veux quelque chose comme L'Équipe mais plus moderne. Rouge et noir, typographie très grande. Proche de The Athletic dans l'esprit..."/>
        <div className="ob-ref-upload" onClick={() => refFileRef.current?.click()}>
          {refImage
            ? <span className="ob-ref-uploaded">Image de référence ajoutée — cliquer pour changer</span>
            : <><span style={{ fontSize:14, opacity:0.5 }}>↑</span><span className="ob-upload-label">Ajouter une image de référence (optionnel)</span></>
          }
        </div>
        <input ref={refFileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => handleRefImage(e.target.files[0])}/>
        {error && <p className="ob-error">{error}</p>}
        <button className="ob-btn-primary" onClick={generateBrand} disabled={loading}>Générer 3 identités →</button>
      </div>
    </div>
  );

  // Chargement (génération 3 kits)
  if (sub === 4) return (
    <div key="loading" className="ob-step ob-step-enter">
      <div className="ob-loading-wrap">
        <div className="ob-forge-mark"><img src="assets/forje-logo.png" alt="Forje"/></div>
        <div className="ob-loading-line"/>
        <p className="ob-loading-text">
          Forge en cours...<br/>
          <span className="ob-loading-detail">3 univers en construction — 2 à 3 minutes</span>
        </p>
      </div>
    </div>
  );

  // Picker — carousel Pokémon-style
  if (sub === 5) return (
    <div key="picker" className="ob-step ob-step-enter" style={{ maxWidth:'none', width:'100%' }}>
      <div className="ob-picker-wrap">
        <h2 className="ob-picker-title">3 univers pour <span className="accent">{name}</span></h2>
        <p className="ob-subtitle" style={{ fontSize:13, marginBottom:24 }}>Navigue et choisis celui qui te parle</p>
        <div className="ob-kit-carousel">
          <button className="ob-carousel-arrow ob-carousel-arrow--left"
            onClick={() => setSelected((selected + kits.length - 1) % kits.length)}>←</button>
          <div className="ob-kit-carousel-track">
            {kits.map((kit, i) => {
              var n = kits.length;
              var pos = i === selected ? 'center' : i === (selected + 1) % n ? 'right' : 'left';
              return (
                <div key={i}
                  className={'ob-kit-card ob-kit-card--' + pos}
                  onClick={() => { if (pos !== 'center') setSelected(i); }}>
                  <div className="ob-kit-card-num">{i + 1}</div>
                  {pos === 'center' && (
                    <button className="ob-kit-zoom-btn" onClick={(e) => { e.stopPropagation(); setZoomedKit(i); }} title="Voir en grand">⤢</button>
                  )}
                  <img src={kit.imageUrl} alt={'Identité ' + (i + 1)} className="ob-kit-card-img"
                    style={pos === 'center' ? { cursor:'zoom-in' } : {}}
                    onClick={pos === 'center' ? (e) => { e.stopPropagation(); setZoomedKit(i); } : undefined}/>
                  {kit.config && (
                    <div className="ob-kit-card-footer">
                      <div className="ob-kit-card-swatches">
                        {(kit.config.brand_colors || []).slice(0, 4).map((c, ci) => (
                          <div key={ci} style={{ width:14, height:14, borderRadius:3, background:c, flexShrink:0 }}/>
                        ))}
                      </div>
                      <span className="ob-kit-card-font">{kit.config.font_primary}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button className="ob-carousel-arrow ob-carousel-arrow--right"
            onClick={() => setSelected((selected + 1) % kits.length)}>→</button>
        </div>
        {error && <p className="ob-error" style={{ textAlign:'center' }}>{error}</p>}
        <div className="ob-kit-picker-actions">
          <button className="ob-btn-secondary" onClick={() => advance(3)}>← Retour</button>
          <button className="ob-btn-secondary" onClick={generateBrand} disabled={loading}>↻ Régénérer</button>
          <button className="ob-btn-primary" onClick={confirmSelection} disabled={confirming}>
            {confirming ? 'En cours...' : 'Forger avec cet univers →'}
          </button>
        </div>
      </div>

      {zoomedKit !== null && kits[zoomedKit] && (
        <div className="ob-lightbox" onClick={() => setZoomedKit(null)}>
          <img src={kits[zoomedKit].imageUrl} alt="Identité de marque" className="ob-lightbox-img" onClick={e => e.stopPropagation()}/>
          <button className="ob-lightbox-close" onClick={() => setZoomedKit(null)}>×</button>
        </div>
      )}
    </div>
  );

  // Extraction (après sélection)
  if (sub === 6) return (
    <div key="confirming" className="ob-step ob-step-enter">
      <div className="ob-loading-wrap">
        <div className="ob-forge-mark"><img src="assets/forje-logo.png" alt="Forje"/></div>
        <div className="ob-loading-line"/>
        <p className="ob-loading-text">
          Forge de ton identité...<br/>
          <span className="ob-loading-detail">Couleurs exactes, police — le logo se forge juste après</span>
        </p>
      </div>
    </div>
  );

  // Résultat final
  if (sub === 7) {
    return (
      <div key="result" className="ob-kit-result ob-step-enter">
        <div className="ob-bento">

          {/* Image tile — spans 2 rows */}
          <div className="ob-bt ob-bt--img">
            {brandImg && <img src={brandImg} alt="Identité de marque" className="ob-bt-kit-img"/>}
            {brandImg && (
              <button className="ob-bt-relogo" onClick={() => relogo()} disabled={relogoing}>
                {relogoing ? 'Forge en cours...' : '↻ Reforger le logo'}
              </button>
            )}
          </div>

          {/* Logo tile */}
          <div className="ob-bt ob-bt--logo" style={{ justifyContent:'center' }}>
            <span className="ob-bt__label">Logo</span>
            {logoUrl ? (
              <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minHeight:0 }}>
                <img src={logoUrl} alt="Logo" style={{ maxHeight:52, maxWidth:'100%', objectFit:'contain', borderRadius:6, background:'rgba(255,255,255,.05)', padding:4 }}/>
                <button className="ob-relogo-btn" onClick={() => relogo()} disabled={relogoing} title="Reforger" style={{ flexShrink:0 }}>
                  {relogoing ? '…' : '↻'}
                </button>
                <button className="ob-dl4k-btn" onClick={downloadLogo4k} disabled={downloading4k} title="Télécharger en 4K" style={{ flexShrink:0 }}>
                  {downloading4k ? '…' : '⬇'}
                </button>
              </div>
            ) : (
              <span style={{ fontSize:11, color:'rgba(150,180,255,.35)', fontStyle:'italic', flex:1 }}>
                {relogoing ? 'Forge du logo en cours…' : 'En attente'}
              </span>
            )}
          </div>

          {/* Modal 4K */}
          {show4kModal && (
            <div className="ob-modal-overlay" onClick={() => setShow4kModal(false)}>
              <div className="ob-modal ob-modal--4k" onClick={e => e.stopPropagation()}>
                <div className="ob-modal__icon">🎉</div>
                <h3 className="ob-modal__title">Logo téléchargé en 4K !</h3>
                <p className="ob-modal__body">
                  Ce fichier PNG (2048×2048) est prêt à être utilisé comme <strong>photo de profil Instagram</strong>.
                  Ouvre ta galerie photo sur ton téléphone et mets-le directement en PP.
                </p>
                <button className="ob-modal__close" onClick={() => setShow4kModal(false)}>Parfait ✓</button>
              </div>
            </div>
          )}

          {/* Palette tile */}
          <div className="ob-bt ob-bt--palette">
            <span className="ob-bt__label">Palette</span>
            {config ? (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {(config.brand_colors || []).map((hex, i) => (
                  <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:hex, border:'1px solid rgba(255,255,255,.1)', boxShadow:'0 2px 8px rgba(0,0,0,.25)', flexShrink:0 }}/>
                    <span style={{ fontSize:8, color:'rgba(150,190,255,.5)', fontFamily:'JetBrains Mono,monospace', letterSpacing:'-.02em' }}>{hex}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize:11, color:'rgba(150,180,255,.35)', fontStyle:'italic' }}>—</span>
            )}
          </div>

          {/* Ton éditorial tile */}
          <div className="ob-bt ob-bt--tone">
            <span className="ob-bt__label">Ton éditorial</span>
            {config?.tone_tags?.length > 0 ? (
              <div className="ob-kit-tags">
                {config.tone_tags.map(t => <span key={t} className="ob-kit-tag">{t}</span>)}
              </div>
            ) : (
              <span style={{ fontSize:11, color:'rgba(150,180,255,.35)', fontStyle:'italic' }}>—</span>
            )}
          </div>

          {/* Tagline tile */}
          <div className="ob-bt ob-bt--tagline">
            <span className="ob-bt__label">Tagline</span>
            {config?.tagline ? (
              <span className="ob-kit-tagline">"{config.tagline}"</span>
            ) : (
              <span style={{ fontSize:11, color:'rgba(150,180,255,.35)', fontStyle:'italic' }}>—</span>
            )}
          </div>

          {/* Typographie tile — pack par défaut imposé, modifiable dans l'Identité */}
          <div className="ob-bt ob-bt--fh">
            <span className="ob-bt__label">Typographie</span>
            <div style={{ fontFamily:"'" + (config?.font_primary || 'Bebas Neue') + "',Impact,sans-serif", fontSize:26, color:'#fff', lineHeight:1, marginTop:2 }}>
              {(config?.font_primary || 'Bebas Neue')}
            </div>
            <span style={{ fontSize:10, color:'rgba(150,190,255,.55)', marginTop:4 }}>Pack par défaut — modifiable ensuite</span>
          </div>

          {/* Note tile */}
          <div className="ob-bt ob-bt--fb" style={{ justifyContent:'center' }}>
            <span style={{ fontSize:11, color:'rgba(150,190,255,.55)', lineHeight:1.5 }}>
              Tu pourras changer de police à tout moment dans <strong style={{ color:'rgba(200,220,255,.85)' }}>Identité de marque</strong>.
            </span>
          </div>

          {/* Actions tile */}
          <div className="ob-bt ob-bt--act">
            {error && <p className="ob-error" style={{ margin:0, flex:1, fontSize:12 }}>{error}</p>}
            <button className="ob-btn-secondary" onClick={() => { setSelected(null); setSub(5); }}>← Changer</button>
            <button className="ob-btn-primary" onClick={() => { onNext(clientId); }}>Entrer dans le studio →</button>
          </div>

        </div>
      </div>
    );
  }

  return null;
};

// ═══ STEP 4 — WOW ════════════════════════════════════════════════════════════
const StepWow = ({ clientId, onComplete, onBack }) => {
  var [text,     setText]     = useState('');
  var [phase,    setPhase]    = useState('idle');
  var [postImg,  setPostImg]  = useState(null);
  var [errorMsg, setErrorMsg] = useState('');

  var canGenerate = text.trim().length > 5;

  var handleGenerate = async () => {
    if (!canGenerate) return;
    setPhase('loading');
    setErrorMsg('');
    try {
      var userId = window.__currentUser?.id;
      var res = await obFetch('/generate/actu', {
        method: 'POST',
        body: JSON.stringify({ newsText: text, userId: userId, clientId: clientId, imageMode: 'ai' })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur génération');

      var image;
      if (data.bgImage && typeof window.__renderActuCanvas === 'function') {
        image = await window.__renderActuCanvas(data);
      } else if (data.image) {
        image = data.image;
      } else {
        throw new Error("Le post n'a pas pu être généré — réessaie");
      }
      setPostImg(image);
      setPhase('result');
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    }
  };

  var handleComplete = async () => {
    var sb = window.__supabase;
    var user = window.__currentUser;
    if (sb && user && clientId) {
      await sb.from('clients').update({ onboarding_completed: true, onboarding_step: 5 }).eq('id', clientId);
    }
    onComplete(clientId);
  };

  var handleRegenerate = () => {
    setPhase('idle');
    setPostImg(null);
    setErrorMsg('');
  };

  if (phase === 'result' && postImg) return (
    <div className="ob-wow-root" style={{ gap: 28 }}>
      <div className="ob-post-frame ob-post-entering">
        <img src={postImg} alt="Ton premier post"/>
      </div>
      <div className="ob-actions">
        <button className="ob-btn-secondary" onClick={handleRegenerate}>Régénérer</button>
        <button className="ob-btn-primary"   onClick={handleComplete}>Entrer dans le studio →</button>
      </div>
    </div>
  );

  if (phase === 'loading') return (
    <div className="ob-wow-root">
      <div className="ob-loading-wrap">
        <div className="ob-forge-mark"><img src="assets/forje-logo.png" alt="Forje"/></div>
        <div className="ob-loading-line"/>
        <p className="ob-loading-text">
          Ton premier post se forge...<br/>
          <span className="ob-loading-detail">15 à 30 secondes</span>
        </p>
      </div>
    </div>
  );

  return (
    <div className="ob-wow-root">
  
      <h1 className="ob-wow-title">Ton premier post<br/>en 30 secondes.</h1>
      <textarea
        className="ob-wow-textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Colle une actu, une info, une idée de post..."
        rows={3}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleGenerate(); }}
        autoFocus
      />
      {phase === 'error' && <p className="ob-error">{errorMsg}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <button className="ob-btn-primary" onClick={handleGenerate} disabled={!canGenerate}>
          Générer →
        </button>
        <span className="ob-wow-hint">⌘ + Entrée pour générer</span>
      </div>
    </div>
  );
};

// ═══ ONBOARDING SHELL ════════════════════════════════════════════════════════
const OnboardingShell = ({ onComplete, initialStep, initialProfileType, existingClientId }) => {
  var [step,        setStep]        = useState(initialStep || 1);
  var [profileType, setProfileType] = useState(initialProfileType || null);
  var [clientId,    setClientId]    = useState(existingClientId || null);
  var [animKey,     setAnimKey]     = useState(0);

  var goTo = (next) => { setAnimKey(k => k + 1); setStep(next); };

  var handleQualify = (type) => {
    setProfileType(type);
    var sb = window.__supabase;
    var user = window.__currentUser;
    if (sb && user) {
      sb.from('clients').select('id').eq('user_id', user.id).maybeSingle().then(({ data: c }) => {
        if (c) sb.from('clients').update({ profile_type: type, onboarding_step: 3 }).eq('id', c.id);
      });
    }
    goTo(3);
  };

  var handleIdentityDone = (id) => {
    setClientId(id);
    window.__activeClientId = id;
    goTo(4);
  };

  var totalSteps = 4;

  var handleBack = step === 2 ? () => goTo(1)
    : step === 3 ? () => { if (typeof window.__obBack === 'function') window.__obBack(); else goTo(2); }
    : step === 4 ? () => goTo(3)
    : null;

  return (
    <div className="onboarding-root">
      <ObBackground/>
      {step > 1 && <ObProgress step={step} total={totalSteps}/>}
      {step > 1 && (
        <div className="ob-step-counter">{step - 1} / {totalSteps - 1}</div>
      )}
      {step > 1 && handleBack && (
        <button className="ob-back-btn" onClick={handleBack}>← Retour</button>
      )}
      <div className="ob-content">
        <div key={animKey} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          {step === 1 && <StepWelcome onNext={() => goTo(2)}/>}
          {step === 2 && <StepQualify onNext={handleQualify}/>}
          {step === 3 && profileType === 'A' && <StepIdentityA onNext={handleIdentityDone}/>}
          {/* Profil B : Blaise EST l'onboarding — conversation plein écran qui
              remplace l'ancien flow 5 questions + brand gen (StepIdentityB). */}
          {step === 3 && profileType === 'B' && <BlaiseOnboarding onNext={handleIdentityDone} existingClientId={clientId}/>}
          {step === 4 && <StepWow clientId={clientId} onComplete={onComplete}/>}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { OnboardingShell });
