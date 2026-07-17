/* global React, ReactDOM, AppIcon, Sidebar, Topbar, Btn, GenerateScreen, QueueScreen, BrandScreen, SourcesScreen, OnboardingShell */
var { useState, useEffect, useRef } = React;

const TWEAKS = /*EDITMODE-BEGIN*/{
  "genLayout": "chat",
  "sidebarDensity": "cozy",
  "defaultQueueView": "calendar"
}/*EDITMODE-END*/;

// ─── Célébration post-paiement (retour Stripe ?checkout=success) ───────────
// Attend que le webhook ait activé l'abonnement, puis compteur 0 → solde.
const CheckoutCelebration = ({ onActivated, onDone }) => {
  const [target,  setTarget]  = useState(null); // solde final (webhook passé)
  const [display, setDisplay] = useState(0);
  const [leaving, setLeaving] = useState(false);

  // Poll léger : le webhook Stripe peut mettre 1-2 s à créditer le compte
  useEffect(() => {
    let stopped = false, tries = 0;
    const sb = window.__supabase, user = window.__currentUser;
    if (!sb || !user) { setTarget(0); return; }
    const tick = async () => {
      if (stopped) return;
      tries++;
      const { data } = await sb.from('clients')
        .select('id, credits, subscription_status')
        .eq('user_id', user.id).order('created_at');
      const saved = localStorage.getItem('forje_active_client_' + user.id);
      const c = (data || []).find(x => x.id === saved) || (data || [])[0];
      if (c && (c.subscription_status === 'active' || tries >= 8)) {
        setTarget(c.credits ?? 0);
        onActivated?.();
      } else {
        setTimeout(tick, 1200);
      }
    };
    tick();
    return () => { stopped = true; };
  }, []);

  // Compteur ease-out ~1,1 s, pause, puis sortie
  useEffect(() => {
    if (target === null) return;
    const dur = 1100, t0 = performance.now();
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const toLeave = setTimeout(() => setLeaving(true), dur + 1500);
    const toDone  = setTimeout(onDone, dur + 1500 + 320);
    return () => { cancelAnimationFrame(raf); clearTimeout(toLeave); clearTimeout(toDone); };
  }, [target]);

  return (
    <div className={'checkout-cheer' + (leaving ? ' checkout-cheer--out' : '')} onClick={onDone}>
      <div className="checkout-cheer-card" onClick={e => e.stopPropagation()}>
        <div className="checkout-cheer-badge">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff"
               strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path className="checkout-cheer-check" d="M4 12.5 9.5 18 20 6.5"/>
          </svg>
        </div>
        <div className="checkout-cheer-title">Paiement confirmé</div>
        <div className="checkout-cheer-sub">Ton abonnement Forje Studio est actif.</div>
        <div className={'checkout-cheer-count' + (target !== null && display === target ? ' checkout-cheer-count--done' : '')}>
          <span className={'checkout-cheer-num' + (target === null ? ' checkout-cheer-num--wait' : '')}>
            {target === null ? '· · ·' : display}
          </span>
          <span className="checkout-cheer-unit">crédits</span>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  // Read ?screen= on mount
  const initial = (() => {
    const p = new URLSearchParams(location.search).get('screen');
    const saved = localStorage.getItem('forje_app_screen');
    return p || (saved && saved !== 'home' ? saved : 'generate');
  })();

  const [screen, setScreen] = useState(initial);
  const [preset, setPreset] = useState(null);
  const [tweaks, setTweaks] = useState(TWEAKS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [clients, setClients] = useState([]);
  const [activeClientId, setActiveClientId] = useState(null);
  const [brandScore, setBrandScore] = useState(0);
  const [prefs, setPrefs] = useState({});
  const [genToast, setGenToast] = useState(null); // { status:'generating'|'ready', label, presetId }
  const presetRef = useRef(null); // keeps last active preset alive across screen changes

  // Retour de Stripe Checkout (?checkout=success) → célébration, puis URL nettoyée
  const [celebrate, setCelebrate] = useState(() => {
    try { return new URLSearchParams(location.search).get('checkout') === 'success'; }
    catch (_) { return false; }
  });
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (!p.has('checkout')) return;
    p.delete('checkout');
    const qs = p.toString();
    history.replaceState({}, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }, []);

  // Onboarding state
  const [showOnboarding,      setShowOnboarding]      = useState(false);
  const [obStep,              setObStep]              = useState(1);
  const [obProfileType,       setObProfileType]       = useState(null);
  const [obClientId,          setObClientId]          = useState(null);

  // PP de l'utilisateur : concept user-level stocké sur les lignes clients —
  // on prend la première renseignée, peu importe le compte actif.
  const userAvatar = (list) => (list.find(c => c.avatar_url) || {}).avatar_url || null;

  const computeBrandScore = (c) => {
    if (!c) return 0;
    return [c.name, c.logo_url, c.graphic_style, c.tone_tags?.length > 0, c.mood, c.topics?.length > 0, c.instagram_handle]
      .filter(Boolean).length;
  };

  const loadClients = (onDone) => {
    const sb = window.__supabase;
    const user = window.__currentUser;
    if (!sb || !user) return;
    sb.from('clients').select('id, name, instagram_handle, logo_url, plan, credits, subscription_status, credits_unlimited, avatar_url, graphic_style, tone_tags, mood, topics, onboarding_completed, onboarding_step, profile_type, preferences')
      .eq('user_id', user.id).order('created_at')
      .then(({ data }) => {
        const list = data || [];
        setClients(list);
        if (list[0]) setProfile({ plan: list[0].plan, credits: list[0].credits, subscription_status: list[0].subscription_status, credits_unlimited: list[0].credits_unlimited, avatar_url: userAvatar(list) });
        if (onDone) onDone(list);
      });
  };

  useEffect(() => {
    const user = window.__currentUser;
    if (!user) return;
    loadClients((list) => {
      const saved = localStorage.getItem('forje_active_client_' + user.id);
      const activeClient = list.find(c => c.id === saved) || list[0] || null;
      const active = activeClient?.id || null;
      setActiveClientId(active);
      window.__activeClientId = active;
      setBrandScore(computeBrandScore(activeClient));
      setPrefs(activeClient?.preferences || {});

      // Onboarding check — new user or incomplete onboarding
      const firstClient = list[0] || null;
      if (!firstClient || !firstClient.onboarding_completed) {
        setObStep(firstClient?.onboarding_step || 1);
        setObProfileType(firstClient?.profile_type || null);
        setObClientId(firstClient?.id || null);
        setShowOnboarding(true);
        return;
      }
    });

    // Prefill venant du board (clic "Générer post" sur une news)
    const raw = localStorage.getItem('forje_gen_prefill');
    if (raw) {
      localStorage.removeItem('forje_gen_prefill');
      try {
        const { newsText } = JSON.parse(raw);
        setPreset({ id:'actu', label:'Actualité', icon:'news', visual:'actu', img:'assets/actu.webp', prefill: { newsText } });
        setScreen('generate');
      } catch (_) {}
    }

    window.__goToGenerate = (article) => {
      // article.format + article.prefill (nouveau flux ForgeButton) OU fallback actu (anciens appels)
      const PMAP = {
        actu:     { id:'actu',     label:'Actualité', icon:'news',   visual:'actu',  img:'assets/actu.webp' },
        citation: { id:'citation', label:'Citation',  icon:'quote',  visual:'quote', img:'assets/citation.webp' },
        deepdive: { id:'deepdive', label:'Deep Dive', icon:'layers', visual:'bts',   img:'assets/deep-dive.webp' },
      };
      const fmt  = article.format === 'citation' ? 'citation'
                 : (article.format === 'deepdive' || article.format === 'deep_dive') ? 'deepdive'
                 : 'actu';
      const base = PMAP[fmt];
      let prefill = article.prefill;
      if (!prefill) {
        const title = article.title || article.titre || '';
        const recap = article.text || article.caption || '';
        prefill = { newsText: recap || title };
      }
      setPreset({ ...base, prefill, fromBoard: true });
      setScreen('generate');
    };
    window.__setGenToast = (toast) => setGenToast(toast);
    window.__goToScreen  = (s) => { setScreen(s === 'home' ? 'generate' : s); setPreset(null); };
    // Mise à jour du solde de crédits après une génération (le serveur renvoie creditsLeft)
    window.__applyCredits = (n) => { if (typeof n === 'number') setProfile(p => ({ ...(p || {}), credits: n })); };
  }, []);

  const handleSelectClient = (id) => {
    const c = clients.find(cc => cc.id === id);
    setActiveClientId(id);
    window.__activeClientId = id;
    const user = window.__currentUser;
    if (user) localStorage.setItem('forje_active_client_' + user.id, id);
    setBrandScore(computeBrandScore(c));
    setPrefs(c?.preferences || {});
  };

  const handlePrefsChange = async (newPrefs) => {
    setPrefs(newPrefs);
    const sb = window.__supabase;
    const clientId = window.__activeClientId;
    if (!sb || !clientId) return;
    await sb.from('clients').update({ preferences: newPrefs }).eq('id', clientId);
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, preferences: newPrefs } : c));
  };

  const handleNewClient = () => {
    if (clients.length >= 5) return;
    setActiveClientId(null);
    window.__activeClientId = null;
    setScreen('brand');
  };

  // Recharge la liste clients (sidebar, avatars…) depuis n'importe quel écran —
  // utilisé après un changement de logo pour que le sidebar reflète la DB.
  useEffect(() => { window.__reloadClients = loadClients; });

  const handleClientSaved = (savedId) => {
    setActiveClientId(savedId);
    window.__activeClientId = savedId;
    const user = window.__currentUser;
    if (user) localStorage.setItem('forje_active_client_' + user.id, savedId);
    loadClients();
  };

  const handleClientDeleted = () => {
    const user = window.__currentUser;
    loadClients((list) => {
      if (!list.length) {
        setShowOnboarding(true);
        setObStep(1);
        setObProfileType(null);
        setObClientId(null);
        return;
      }
      const newActive = list[0]?.id || null;
      setActiveClientId(newActive);
      window.__activeClientId = newActive;
      if (user && newActive) localStorage.setItem('forje_active_client_' + user.id, newActive);
      else if (user) localStorage.removeItem('forje_active_client_' + user.id);
      setBrandScore(computeBrandScore(list[0] || null));
      if (list[0]) setProfile({ plan: list[0].plan, credits: list[0].credits, subscription_status: list[0].subscription_status, credits_unlimited: list[0].credits_unlimited, avatar_url: userAvatar(list) });
      setScreen('generate');
    });
  };

  const handleOnboardingComplete = (clientId) => {
    setShowOnboarding(false);
    setObClientId(clientId);
    setActiveClientId(clientId);
    window.__activeClientId = clientId;
    const user = window.__currentUser;
    if (user) localStorage.setItem('forje_active_client_' + user.id, clientId);
    loadClients((list) => {
      const c = list.find(x => x.id === clientId) || list[0] || null;
      setBrandScore(computeBrandScore(c));
      if (c) setProfile({ plan: c.plan, credits: c.credits, subscription_status: c.subscription_status, credits_unlimited: c.credits_unlimited, avatar_url: userAvatar(list) });
    });
    setScreen('generate');
  };

  useEffect(() => { if (preset) presetRef.current = preset; }, [preset]);

  useEffect(() => {
    localStorage.setItem('forje_app_screen', screen);
    if (screen !== 'generate') setPreset(null);
  }, [screen]);

  // Tweak mode wiring
  useEffect(() => {
    const onMsg = (e) => {
      if (!e?.data) return;
      if (e.data.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({type:'__edit_mode_available'}, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const updateTweak = (k, v) => {
    setTweaks(t => {
      const nt = {...t, [k]: v};
      window.parent.postMessage({type:'__edit_mode_set_keys', edits: {[k]: v}}, '*');
      return nt;
    });
  };

  // Breadcrumb & actions per screen
  const crumbs = {
    generate:  preset ? ['Studio', 'Générer', preset.label] : ['Studio', 'Générer'],
    queue:     ['Studio', 'File de validation'],
    calendar:  ['Studio', 'Calendrier'],
    published: ['Studio', 'Publiés'],
    blaise:    ['Atelier', 'Blaise'],
    brand:     ['Atelier', 'Identité de marque'],
    sources:   ['Atelier', 'Sources & veille'],
    settings:  ['Atelier', 'Paramètres'],
  }[screen] || ['Studio'];

  const handleCreateFromSource = (source) => {
    var newsText = '';
    if (source && typeof source === 'object') {
      newsText = [source.title, source.text].filter(Boolean).join('\n\n');
    }
    setPreset({ id:'actu', label:'Actualité', icon:'news', visual:'actu', img:'assets/actu.webp',
                prefill: newsText ? { newsText } : undefined });
    setScreen('generate');
  };

  // Show onboarding instead of regular app
  if (showOnboarding) {
    return (
      <OnboardingShell
        onComplete={handleOnboardingComplete}
        initialStep={obStep}
        initialProfileType={obProfileType}
        existingClientId={obClientId}
      />
    );
  }

  return (
    <>
      <div className="app-bg-texture"/>
      <div className="app-shell">
        <Sidebar current={screen === 'generate' && preset ? 'generate' : screen}
                 onNav={(k) => { setScreen(k); setPreset(null); }}
                 counts={{ queue: 7, sources: 3 }}
                 profile={profile}
                 authUser={window.__currentUser}
                 clients={clients}
                 activeClientId={activeClientId}
                 brandScore={brandScore}
                 prefs={prefs}
                 onSelectClient={handleSelectClient}
                 onNewClient={handleNewClient}/>
        <main className="app-main">
          <Topbar breadcrumb={crumbs}/>
          {screen === 'generate' && (
            <GenerateScreen
              layoutVariant={tweaks.genLayout}
              preset={preset}
              onPickPreset={setPreset}
              onBack={() => setPreset(null)}
              onGoToBoard={() => { setPreset(null); setScreen('sources'); }}
              brandScore={brandScore}
              onGoBrand={() => { setPreset(null); setScreen('brand'); }}/>
          )}
          {screen === 'queue' && <QueueScreen defaultView={tweaks.defaultQueueView}/>}
          {screen === 'calendar' && <QueueScreen defaultView="calendar"/>}
          {screen === 'published' && <QueueScreen defaultView="grid"/>}
          {screen === 'blaise' && <BlaiseScreen clientId={activeClientId} onNav={(k) => { setScreen(k); setPreset(null); }}/>}
          {screen === 'brand' && <BrandScreen clientId={activeClientId} onSaved={handleClientSaved} onDeleted={handleClientDeleted}/>}
          {screen === 'sources' && <SourcesScreen authUser={window.__currentUser}/>}
          {screen === 'settings' && <SettingsScreen prefs={prefs} onPrefsChange={handlePrefsChange}/>}
        </main>
      </div>

      {/* Blaise flottant — même conversation que l'onglet, accessible partout */}
      <BlaiseFloating
        clientId={activeClientId}
        hidden={screen === 'blaise'}
        onNav={(k) => { setScreen(k); setPreset(null); }}/>

      {celebrate && (
        <CheckoutCelebration
          onActivated={loadClients}
          onDone={() => setCelebrate(false)}
        />
      )}

      {genToast && (
        <div
          key={genToast.status}
          className={`gen-toast gen-toast--${genToast.status}`}
          onClick={() => {
            const p = genToast.preset || presetRef.current;
            if (p) setPreset(p);
            setScreen('generate');
            if (genToast.status === 'ready') setGenToast(null);
          }}
          style={{ cursor: 'pointer' }}
        >
          <div className="gen-toast-icon">
            {genToast.status === 'generating'
              ? <span className="gen-bounce-loader--sm" style={{ color: 'var(--app-accent)' }}/>
              : <span style={{fontSize:14}}>⚡</span>}
          </div>
          <div className="gen-toast-body">
            <span className="gen-toast-label">
              {genToast.status === 'generating'
                ? `Génération en cours — ${genToast.label}`
                : `Post prêt — ${genToast.label}`}
            </span>
            <span className="gen-toast-action">
              {genToast.status === 'generating' ? 'Revenir voir →' : 'Voir le résultat →'}
            </span>
          </div>
          {genToast.status === 'generating' && (
            <button className="gen-toast-cancel" onClick={(e) => { e.stopPropagation(); window.__cancelGen?.(); setGenToast(null); }}>
              Annuler
            </button>
          )}
          <button className="gen-toast-close" onClick={(e) => { e.stopPropagation(); setGenToast(null); }}>×</button>
        </div>
      )}

      {tweaksOpen && (
        <div className="tweaks-panel">
          <div className="tweaks-head">
            <span>Tweaks</span>
            <button className="tweaks-close" onClick={() => setTweaksOpen(false)}>×</button>
          </div>
          <div className="tweaks-body">
            <TweakGroup label="Écran de génération">
              <TweakRadio name="genLayout" value={tweaks.genLayout} onChange={v => updateTweak('genLayout', v)}
                options={[['chat','Chat + preview'],['studio','Studio + panneau d\'outils']]}/>
            </TweakGroup>
            <TweakGroup label="Vue par défaut de la file">
              <TweakRadio name="defaultQueueView" value={tweaks.defaultQueueView} onChange={v => updateTweak('defaultQueueView', v)}
                options={[['calendar','Calendrier'],['feed','Feed'],['grid','Grille IG']]}/>
            </TweakGroup>
            <TweakGroup label="Navigation de test">
              <div className="tweak-quick-nav">
                {['generate','queue','brand','sources'].map(s => (
                  <button key={s} className={`tweak-nav-btn ${screen===s?'active':''}`}
                          onClick={() => { setScreen(s); setPreset(null); }}>{s}</button>
                ))}
              </div>
            </TweakGroup>
          </div>
        </div>
      )}
    </>
  );
};

const TweakGroup = ({ label, children }) => (
  <div className="tweak-group">
    <div className="tweak-group-label">{label}</div>
    {children}
  </div>
);
const TweakRadio = ({ name, value, onChange, options }) => (
  <div className="tweak-radio">
    {options.map(([v, l]) => (
      <button key={v} className={`tweak-radio-opt ${value===v?'active':''}`} onClick={()=>onChange(v)}>{l}</button>
    ))}
  </div>
);

window.__SaasApp = App;
if (!window.__forjeUnified) ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
