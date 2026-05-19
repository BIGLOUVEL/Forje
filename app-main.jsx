/* global React, ReactDOM, AppIcon, Sidebar, Topbar, Btn, GenerateScreen, QueueScreen, BrandScreen, SourcesScreen, OnboardingShell, PulseScreen */
var { useState, useEffect, useRef } = React;

const TWEAKS = /*EDITMODE-BEGIN*/{
  "genLayout": "chat",
  "sidebarDensity": "cozy",
  "defaultQueueView": "calendar"
}/*EDITMODE-END*/;

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

  // Onboarding state
  const [showOnboarding,      setShowOnboarding]      = useState(false);
  const [obStep,              setObStep]              = useState(1);
  const [obProfileType,       setObProfileType]       = useState(null);
  const [obClientId,          setObClientId]          = useState(null);

  const computeBrandScore = (c) => {
    if (!c) return 0;
    return [c.name, c.logo_url, c.graphic_style, c.tone_tags?.length > 0, c.mood, c.topics?.length > 0, c.instagram_handle]
      .filter(Boolean).length;
  };

  const loadClients = (onDone) => {
    const sb = window.__supabase;
    const user = window.__currentUser;
    if (!sb || !user) return;
    sb.from('clients').select('id, name, instagram_handle, logo_url, plan, credits, graphic_style, tone_tags, mood, topics, onboarding_completed, onboarding_step, profile_type, preferences')
      .eq('user_id', user.id).order('created_at')
      .then(({ data }) => {
        const list = data || [];
        setClients(list);
        if (list[0]) setProfile({ plan: list[0].plan, credits: list[0].credits });
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
      const title   = article.title || article.titre || '';
      const recap   = article.text || article.caption || '';
      const newsText = recap ? recap : title;
      setPreset({ id:'actu', label:'Actualité', icon:'news', visual:'actu', img:'assets/actu.webp', prefill: { newsText }, fromBoard: true });
      setScreen('generate');
    };
    window.__setGenToast = (toast) => setGenToast(toast);
    window.__goToScreen  = (s) => { setScreen(s === 'home' ? 'generate' : s); setPreset(null); };
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
      if (list[0]) setProfile({ plan: list[0].plan, credits: list[0].credits });
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
      if (c) setProfile({ plan: c.plan, credits: c.credits });
    });
    setScreen('generate');
  };

  useEffect(() => { if (preset) presetRef.current = preset; }, [preset]);

  // Redirect away from Pulse if trader mode is disabled
  useEffect(() => {
    if (screen === 'pulse' && !prefs.pulseMode) setScreen('generate');
  }, [prefs.pulseMode]);

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
          {screen === 'brand' && <BrandScreen clientId={activeClientId} onSaved={handleClientSaved} onDeleted={handleClientDeleted}/>}
          {screen === 'sources' && <SourcesScreen authUser={window.__currentUser}/>}
          {screen === 'pulse'   && <PulseScreen onCreateFromSource={(a) => { window.__goToGenerate?.(a); }}/>}
          {screen === 'settings' && <SettingsScreen prefs={prefs} onPrefsChange={handlePrefsChange}/>}
        </main>
      </div>

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
