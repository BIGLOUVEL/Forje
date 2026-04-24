/* global React, ReactDOM, AppIcon, Sidebar, Topbar, Btn, DashboardScreen, GenerateScreen, QueueScreen, BrandScreen, SourcesScreen */
var { useState, useEffect } = React;

const TWEAKS = /*EDITMODE-BEGIN*/{
  "genLayout": "chat",
  "sidebarDensity": "cozy",
  "defaultQueueView": "calendar"
}/*EDITMODE-END*/;

const App = () => {
  // Read ?screen= on mount
  const initial = (() => {
    const p = new URLSearchParams(location.search).get('screen');
    return p || localStorage.getItem('forje_app_screen') || 'home';
  })();

  const [screen, setScreen] = useState(initial);
  const [preset, setPreset] = useState(null);
  const [tweaks, setTweaks] = useState(TWEAKS);
  const [tweaksOpen, setTweaksOpen] = useState(false);

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
    home:      ['Studio', 'Accueil'],
    generate:  preset ? ['Studio', 'Générer', preset.label] : ['Studio', 'Générer'],
    queue:     ['Studio', 'File de validation'],
    calendar:  ['Studio', 'Calendrier'],
    published: ['Studio', 'Publiés'],
    brand:     ['Atelier', 'Identité de marque'],
    sources:   ['Atelier', 'Sources & veille'],
    settings:  ['Atelier', 'Paramètres'],
  }[screen] || ['Studio'];

  const handleCreateFromSource = (id) => {
    // Pretend to pre-fill from a source and open Generate
    setPreset({ id:'actu', label:'Actualité', icon:'news', visual:'actu', img:'assets/actu.png' });
    setScreen('generate');
  };

  return (
    <>
      <div className="app-bg-texture"/>
      <div className="app-shell">
        <Sidebar current={screen === 'generate' && preset ? 'generate' : screen}
                 onNav={(k) => { setScreen(k); setPreset(null); }}
                 counts={{ queue: 7, sources: 3 }}/>
        <main className="app-main">
          <Topbar breadcrumb={crumbs}/>
          {screen === 'home' && <DashboardScreen onNav={setScreen} onCreateFromSource={handleCreateFromSource}/>}
          {screen === 'generate' && (
            <GenerateScreen
              layoutVariant={tweaks.genLayout}
              preset={preset}
              onPickPreset={setPreset}
              onBack={() => setPreset(null)}/>
          )}
          {screen === 'queue' && <QueueScreen defaultView={tweaks.defaultQueueView}/>}
          {screen === 'calendar' && <QueueScreen defaultView="calendar"/>}
          {screen === 'published' && <QueueScreen defaultView="grid"/>}
          {screen === 'brand' && <BrandScreen/>}
          {screen === 'sources' && <SourcesScreen/>}
          {screen === 'settings' && <PlaceholderScreen title="Paramètres" desc="Comptes connectés, équipe, facturation."/>}
        </main>
      </div>

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
                {['home','generate','queue','brand'].map(s => (
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

const PlaceholderScreen = ({ title, desc }) => (
  <div className="page-body">
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{desc}</p>
      </div>
    </div>
    <div className="card card-pad" style={{padding:64, textAlign:'center', color:'var(--app-fg-4)'}}>
      Écran à designer dans une prochaine itération.
    </div>
  </div>
);

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
