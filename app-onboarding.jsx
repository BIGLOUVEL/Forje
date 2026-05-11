/* global React */
var { useState, useEffect, useRef } = React;

// ─── Fetch helper (same auth pattern as app-screens) ─────────────────────────
async function obFetch(path, opts) {
  var sb = window.__supabase;
  var token = null;
  if (sb) { var sess = await sb.auth.getSession(); token = sess.data?.session?.access_token; }
  var headers = Object.assign({ 'Content-Type': 'application/json' }, opts && opts.headers);
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch('/api' + path, Object.assign({}, opts, { headers }));
}

// ─── Supabase helper: upsert client record ────────────────────────────────────
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
    <div className="ob-logo-mark">F</div>
    <div className="ob-text-block">
      <h1 className="ob-title">Bienvenue dans<br/>Forje Studio</h1>
      <p className="ob-subtitle">Le studio Instagram qui apprend ton style<br/>et génère tes posts à l'infini.</p>
    </div>
    <div className="ob-text-block">
      <button className="ob-btn-primary" onClick={onNext}>Commencer →</button>
      <span className="ob-duration">5 minutes pour ton premier post</span>
    </div>
  </div>
);

// ═══ STEP 2 — Qualify ════════════════════════════════════════════════════════
const StepQualify = ({ onNext }) => (
  <div className="ob-step ob-step-enter">
    <div className="ob-text-block">
      <h1 className="ob-title" style={{ fontSize: 26 }}>Où en es-tu<br/>sur Instagram ?</h1>
    </div>
    <div className="ob-qualify-grid">
      <div className="ob-qualify-card" onClick={() => onNext('A')}>
        <span className="ob-qualify-card-icon">✓</span>
        <span className="ob-qualify-card-title">J'ai déjà un compte Instagram</span>
        <span className="ob-qualify-card-desc">J'ai des posts existants et une charte visuelle</span>
      </div>
      <div className="ob-qualify-card" onClick={() => onNext('B')}>
        <span className="ob-qualify-card-icon">✗</span>
        <span className="ob-qualify-card-title">Je pars de zéro sur Instagram</span>
        <span className="ob-qualify-card-desc">Je n'ai pas encore de DA ni de présence Instagram</span>
      </div>
    </div>
  </div>
);

// ═══ STEP 3A — Identity A (existing account) ═════════════════════════════════
const MOODS_A = [
  { label: 'Dramatique', icon: '🎭' },
  { label: 'Énergique',  icon: '⚡' },
  { label: 'Premium',    icon: '✨' },
  { label: 'Populaire',  icon: '🔥' },
  { label: 'Factuel',    icon: '📊' },
];

const StepIdentityA = ({ onNext }) => {
  var [name,     setName]     = useState('');
  var [logoUrl,  setLogoUrl]  = useState('');
  var [logoFile, setLogoFile] = useState(null);
  var [handle,   setHandle]   = useState('');
  var [mood,     setMood]     = useState('');
  var [topics,   setTopics]   = useState([]);
  var [saving,   setSaving]   = useState(false);
  var [error,    setError]    = useState(null);
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

      var clientId = await upsertClient({
        name:             name.trim(),
        logo_url:         finalLogoUrl || null,
        instagram_handle: handle.trim() || null,
        mood:             mood,
        topics:           topics,
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
        <h1 className="ob-title" style={{ fontSize: 26 }}>Ton identité de marque</h1>
        <p className="ob-subtitle">On va forger ton studio en quelques secondes.</p>
      </div>

      <div className="ob-form">
        <div className="ob-field">
          <label className="ob-label">Nom du média</label>
          <input className="ob-input" value={name} onChange={e => setName(e.target.value)}
            placeholder="Raplume, Footmercato, Le Monde..."/>
        </div>

        <div className="ob-field">
          <label className="ob-label">Logo <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(PNG fond transparent)</span></label>
          <div
            className="ob-upload-zone"
            onClick={() => fileRef.current?.click()}
            onDrop={(e) => { e.preventDefault(); handleFileChange(e.dataTransfer.files[0]); }}
            onDragOver={(e) => e.preventDefault()}
          >
            {logoUrl
              ? <img src={logoUrl} className="ob-logo-preview" alt="Logo"/>
              : <>
                  <span className="ob-upload-icon">↑</span>
                  <span className="ob-upload-label">Glisse ton logo ici ou clique pour uploader</span>
                  <span className="ob-upload-hint">PNG fond transparent recommandé</span>
                </>
            }
          </div>
          <input ref={fileRef} type="file" accept=".png,image/png" style={{ display: 'none' }}
            onChange={(e) => handleFileChange(e.target.files[0])}/>
        </div>

        <div className="ob-field">
          <label className="ob-label">Handle Instagram <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(optionnel)</span></label>
          <input className="ob-input" value={handle} onChange={e => setHandle(e.target.value)} placeholder="@ton_compte"/>
        </div>

        <div className="ob-field">
          <label className="ob-label">Mood éditorial</label>
          <div className="ob-mood-row">
            {MOODS_A.map(m => (
              <button key={m.label}
                className={'ob-mood-pill' + (mood === m.label ? ' selected' : '')}
                onClick={() => setMood(m.label)}>
                <span>{m.icon}</span> {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ob-field">
          <label className="ob-label">Sujets couverts <span style={{ opacity: 0.5, textTransform: 'none', letterSpacing: 0 }}>(min. 2, Entrée pour valider)</span></label>
          <ObTagsInput tags={topics} setTags={setTopics} placeholder="Football, PSG, Transferts..."/>
        </div>

        {error && <p className="ob-error">{error}</p>}

        <button className="ob-btn-primary" onClick={handleSubmit} disabled={!canSubmit}
          style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Création en cours...' : 'Créer mon identité →'}
        </button>
      </div>
    </div>
  );
};

// ═══ STEP 3B — Identity B (brand gen from scratch) ═══════════════════════════
var STYLE_WORDS = ['Dynamique','Sérieux','Élégant','Percutant','Moderne','Brut','Premium','Populaire','Énergique','Sobre','Audacieux','Minimaliste'];

const StepIdentityB = ({ onNext }) => {
  var [sub,        setSub]        = useState(0);
  var [name,       setName]       = useState('');
  var [topics,     setTopics]     = useState([]);
  var [styles,     setStyles]     = useState([]);
  var [universe,   setUniverse]   = useState('');
  var [typo,       setTypo]       = useState('');
  var [brandImg,   setBrandImg]   = useState(null);
  var [loading,    setLoading]    = useState(false);
  var [saving,     setSaving]     = useState(false);
  var [error,      setError]      = useState('');
  var [animKey,    setAnimKey]    = useState(0);

  var toggleStyle = (w) => {
    setStyles(prev => prev.includes(w) ? prev.filter(x => x !== w) : prev.length < 3 ? [...prev, w] : prev);
  };

  var advance = (next) => {
    setAnimKey(k => k + 1);
    setSub(next);
  };

  var generateBrand = async () => {
    setSub(5);
    setLoading(true);
    setError('');
    try {
      var res = await obFetch('/generate/brand-identity', {
        method: 'POST',
        body: JSON.stringify({ name, topics, styleWords: styles, colorUniverse: universe, typographyFeel: typo })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur génération');
      setBrandImg(data.imageUrl || data.image || null);
      setSub(6);
    } catch (err) {
      setError(err.message || 'Erreur');
      setSub(4);
    } finally {
      setLoading(false);
    }
  };

  var handleValidate = async () => {
    setSaving(true);
    setError('');
    try {
      var colors = universe === 'dark' ? ['#0A0A1A', '#FFFFFF'] : ['#F5F5F0', '#0F1528'];
      var font   = typo === 'punchy' ? 'Bebas Neue' : 'DM Sans';
      var clientId = await upsertClient({
        name:          name.trim(),
        mood:          styles[0] || '',
        topics:        topics,
        brand_colors:  colors,
        font_primary:  font,
        profile_type:  'B',
        onboarding_step: 4,
        onboarding_completed: false,
      });
      onNext(clientId);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  // Q0 — Name
  if (sub === 0) return (
    <div key={animKey} className="ob-step ob-step-enter">
      <div className="ob-question-wrap">
        <span className="ob-question-num">Question 1 / 5</span>
        <h1 className="ob-question-title">Quel est le nom<br/>de ton média ?</h1>
        <input className="ob-input" value={name} onChange={e => setName(e.target.value)}
          placeholder="Nom de ton média..." style={{ textAlign: 'center', fontSize: 17 }} autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) advance(1); }}/>
        <button className="ob-btn-primary" onClick={() => advance(1)} disabled={!name.trim()}>Suivant →</button>
      </div>
    </div>
  );

  // Q1 — Topics
  if (sub === 1) return (
    <div key={animKey} className="ob-step ob-step-enter">
      <div className="ob-question-wrap">
        <span className="ob-question-num">Question 2 / 5</span>
        <h1 className="ob-question-title">Tu couvres quoi ?</h1>
        <p className="ob-subtitle">Exemples : Football, Tech, Politique, Culture...</p>
        <div style={{ width: '100%' }}>
          <ObTagsInput tags={topics} setTags={setTopics} placeholder="Tape et appuie sur Entrée..."/>
        </div>
        <button className="ob-btn-primary" onClick={() => advance(2)} disabled={topics.length === 0}>Suivant →</button>
      </div>
    </div>
  );

  // Q2 — Style words
  if (sub === 2) return (
    <div key={animKey} className="ob-step ob-step-enter">
      <div className="ob-question-wrap">
        <span className="ob-question-num">Question 3 / 5</span>
        <h1 className="ob-question-title">3 mots qui décrivent<br/>le style que tu veux</h1>
        <div className="ob-pill-grid">
          {STYLE_WORDS.map(w => (
            <button key={w} className={'ob-pill' + (styles.includes(w) ? ' selected' : '')} onClick={() => toggleStyle(w)}>{w}</button>
          ))}
        </div>
        <p className="ob-subtitle">{styles.length}/3 sélectionnés</p>
        <button className="ob-btn-primary" onClick={() => advance(3)} disabled={styles.length !== 3}>Suivant →</button>
      </div>
    </div>
  );

  // Q3 — Universe
  if (sub === 3) return (
    <div key={animKey} className="ob-step ob-step-enter">
      <div className="ob-question-wrap">
        <span className="ob-question-num">Question 4 / 5</span>
        <h1 className="ob-question-title">Univers clair ou sombre ?</h1>
        <div className="ob-two-cards">
          <div className={'ob-choice-card dark-bg' + (universe === 'dark' ? ' selected' : '')} onClick={() => setUniverse('dark')}>
            <span className="ob-choice-card-emoji">🌑</span>
            <span className="ob-choice-card-label">Fond sombre</span>
            <span className="ob-choice-card-sub">Texte blanc</span>
          </div>
          <div className={'ob-choice-card light-bg' + (universe === 'light' ? ' selected' : '')} onClick={() => setUniverse('light')}>
            <span className="ob-choice-card-emoji">☀️</span>
            <span className="ob-choice-card-label" style={{ color: '#0F1528' }}>Fond clair</span>
            <span className="ob-choice-card-sub" style={{ color: '#0F1528' }}>Texte sombre</span>
          </div>
        </div>
        <button className="ob-btn-primary" onClick={() => advance(4)} disabled={!universe}>Suivant →</button>
      </div>
    </div>
  );

  // Q4 — Typography
  if (sub === 4) return (
    <div key={animKey} className="ob-step ob-step-enter">
      <div className="ob-question-wrap">
        <span className="ob-question-num">Question 5 / 5</span>
        <h1 className="ob-question-title">Police punchy ou élégante ?</h1>
        <div className="ob-two-cards">
          <div className={'ob-choice-card dark-bg' + (typo === 'punchy' ? ' selected' : '')} onClick={() => setTypo('punchy')}>
            <span className="ob-choice-card-label" style={{ fontFamily: 'Impact,Arial,sans-serif', textTransform: 'uppercase', letterSpacing: 2, fontSize: 22 }}>BEBAS NEUE</span>
            <span className="ob-choice-card-sub">Impact maximal</span>
          </div>
          <div className={'ob-choice-card dark-bg' + (typo === 'elegant' ? ' selected' : '')} onClick={() => setTypo('elegant')}>
            <span className="ob-choice-card-label" style={{ fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>DM Sans</span>
            <span className="ob-choice-card-sub">Propre et lisible</span>
          </div>
        </div>
        {error && <p className="ob-error">{error}</p>}
        <button className="ob-btn-primary" onClick={generateBrand} disabled={!typo || loading}>
          Générer mon identité →
        </button>
      </div>
    </div>
  );

  // Loading
  if (sub === 5) return (
    <div key="loading" className="ob-step ob-step-enter">
      <div className="ob-loading-wrap">
        <div className="ob-spinner"/>
        <p className="ob-loading-text">GPT-Image crée ton identité visuelle...<br/><span style={{ fontSize: 12, opacity: 0.6 }}>Ça prend ~20 secondes</span></p>
      </div>
    </div>
  );

  // Result
  if (sub === 6) return (
    <div key="result" className="ob-step ob-step-enter" style={{ gap: 24 }}>
      <h1 className="ob-title" style={{ fontSize: 22 }}>Ton identité visuelle ✓</h1>
      {brandImg && (
        <div className="ob-brand-img-wrap"><img src={brandImg} alt="Identité générée"/></div>
      )}
      {error && <p className="ob-error">{error}</p>}
      <div className="ob-actions">
        <button className="ob-btn-secondary" onClick={generateBrand} disabled={loading}>↻ Régénérer</button>
        <button className="ob-btn-primary"   onClick={handleValidate} disabled={saving || loading}>
          {saving ? 'Validation...' : "C'est parfait ✓"}
        </button>
      </div>
    </div>
  );

  return null;
};

// ═══ STEP 4 — WOW (the critical moment) ══════════════════════════════════════
const StepWow = ({ clientId, onComplete }) => {
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
        body: JSON.stringify({ newsText: text, userId: userId, clientId: clientId, imageMode: 'classic' })
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
        <button className="ob-btn-secondary" onClick={handleRegenerate}>↻ Régénérer</button>
        <button className="ob-btn-primary"   onClick={handleComplete}>C'est parfait, j'entre dans le studio ✓</button>
      </div>
    </div>
  );

  if (phase === 'loading') return (
    <div className="ob-wow-root">
      <div className="ob-loading-wrap">
        <div className="ob-spinner"/>
        <p className="ob-loading-text">
          Forje génère ton premier post...<br/>
          <span style={{ fontSize: 12, opacity: 0.5 }}>15 à 30 secondes</span>
        </p>
      </div>
    </div>
  );

  return (
    <div className="ob-wow-root">
      <h1 className="ob-wow-title">Génère ton premier post.</h1>
      <textarea
        className="ob-wow-textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Tape une idée d'actu, d'info, de citation..."
        rows={3}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleGenerate(); }}
        autoFocus
      />
      {phase === 'error' && <p className="ob-error">{errorMsg} — réessaie</p>}
      <button className="ob-btn-primary" onClick={handleGenerate} disabled={!canGenerate}>
        Générer →
      </button>
    </div>
  );
};

// ═══ ONBOARDING SHELL — orchestrateur ════════════════════════════════════════
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

  return (
    <div className="onboarding-root">
      {step > 1 && <ObProgress step={step} total={4}/>}
      <div key={animKey} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        {step === 1 && <StepWelcome onNext={() => goTo(2)}/>}
        {step === 2 && <StepQualify onNext={handleQualify}/>}
        {step === 3 && profileType === 'A' && <StepIdentityA onNext={handleIdentityDone}/>}
        {step === 3 && profileType === 'B' && <StepIdentityB onNext={handleIdentityDone}/>}
        {step === 4 && <StepWow clientId={clientId} onComplete={onComplete}/>}
      </div>
    </div>
  );
};

// ═══ ONBOARDING COMPLETION BANNER (dashboard) ═════════════════════════════════
const OnboardingBanner = ({ clientId }) => {
  var [fields,    setFields]    = useState(null);
  var [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    var sb = window.__supabase;
    if (!sb) return;
    sb.from('clients')
      .select('name, logo_url, brand_colors, font_primary, mood, graphic_style, tone_tags, topics, instagram_handle')
      .eq('id', clientId).single()
      .then(({ data }) => {
        if (!data) return;
        var checks = [
          !!data.name,
          !!data.logo_url,
          !!(data.brand_colors?.length),
          !!data.font_primary,
          !!data.mood,
          !!data.graphic_style,
          !!(data.tone_tags?.length),
          !!(data.topics?.length),
          !!data.instagram_handle,
        ];
        var filled = checks.filter(Boolean).length;
        var total  = checks.length;
        if (filled >= total) {
          sb.from('clients').update({ onboarding_completed: true }).eq('id', clientId);
          setDismissed(true);
        } else {
          setFields({ filled, total });
        }
      });
  }, [clientId]);

  if (dismissed || !fields) return null;

  var pct = Math.round((fields.filled / fields.total) * 100);

  return (
    <div className="ob-completion-banner" onClick={() => window.__goToScreen?.('brand')}>
      <span className="ob-banner-emoji">🎯</span>
      <div className="ob-banner-body">
        <div className="ob-banner-title">Complète ton identité pour des posts encore meilleurs</div>
        <div className="ob-banner-track">
          <div className="ob-banner-fill" style={{ width: pct + '%' }}/>
        </div>
        <div className="ob-banner-sub">{fields.filled}/{fields.total} champs complétés</div>
      </div>
      <span className="ob-banner-cta">Continuer →</span>
    </div>
  );
};

Object.assign(window, { OnboardingShell, OnboardingBanner });
