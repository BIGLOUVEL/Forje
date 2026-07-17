/* global React, ReactDOM, Icon, Streaks, Hero, DemoCarousel, HowItWorks, Features, Pricing, Closing, Foot, TweaksPanel */
const { useState: useState_, useEffect: useEffect_ } = React;

const App = () => {
  const [tweaks, setTweaks] = useState_(window.TWEAKS);
  const [tweaksOn, setTweaksOn] = useState_(false);

  // mouse-follow halo + scrolled nav
  useEffect_(() => {
    const onMove = (e) => {
      document.body.style.setProperty('--mx', e.clientX + 'px');
      document.body.style.setProperty('--my', e.clientY + 'px');
    };
    const onScroll = () => {
      document.body.classList.toggle('scrolled', window.scrollY > 20);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('scroll', onScroll); };
  }, []);

  useEffect_(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode')   setTweaksOn(true);
      if (e.data.type === '__deactivate_edit_mode') setTweaksOn(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  // apply hue shift to CSS vars for chromatic
  useEffect_(() => {
    const root = document.documentElement;
    root.style.setProperty('filter', '');
    const stars = document.querySelectorAll('.streak, .eyebrow-dot, .step-node .inner, .slab::before, .lock-cta');
    // simpler: apply hue-rotate to the page-bg streaks + .forge-rotator + gradient text via wrapping
    document.querySelectorAll('.chromatic-rotate').forEach(n => n.style.filter = `hue-rotate(${tweaks.hueShift}deg)`);
  }, [tweaks.hueShift]);

  // starfield supprimé — le réglage starfieldDensity du panneau tweaks est sans effet

  // rotation speed — no-op (hero is static now)

  // ATTENTION : ce filter est STRUCTUREL, même à 0deg. Il fait de ce wrapper
  // un bloc conteneur pour .page-bg / .horizon / .cursor-halo (position:fixed)
  // → leur inset:0 s'étire sur TOUTE la page (dégradé sombre en haut qui
  // défile) au lieu d'un fond 100vh figé au viewport. Ne pas le conditionner.
  return (
    <div style={{ filter: `hue-rotate(${tweaks.hueShift}deg)` }}>
      <div className="page-bg">
        <div className="aurora">
          <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
          <div className="blob b4" /><div className="blob b5" />
        </div>
      </div>
      <div className="horizon" />
      <div className="cursor-halo" />

      <div className="page">
        <nav className="nav" data-screen-label="nav">
          <div className="brand-mark">
            <img src="assets/brand/blaise-mark.svg" alt="" className="brand-mark-img" style={{ borderRadius: 0 }} />
            <span className="brand-wordmark">blaise</span>
          </div>
          <div className="nav-links">
            <a href="#demo-live">Démo</a>
            <a href="#how">Comment ça marche</a>
            <a href="#formats">Formats</a>
            <a href="#pricing">Tarifs</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="nav-right">
            <a href="Forje App.html" style={{ color: 'var(--fg-dim)', textDecoration:'none', fontSize:14, fontWeight:500 }}>Se connecter</a>
            <a href="Forje App.html" className="btn btn-primary" style={{textDecoration:'none'}}>Rejoindre <Icon.Arrow /></a>
          </div>
        </nav>

        <div data-screen-label="01 Hero"><Hero /></div>
        <LiveDemoScroll />
        <div data-screen-label="05 How It Works"><HowItWorks /></div>
        <div data-screen-label="06 Formats"><Formats /></div>
        <div data-screen-label="06bis Deep Dive du jour"><DeepDiveShowcase /></div>
        <div data-screen-label="07 Pricing"><Pricing /></div>
        <div data-screen-label="08 FAQ"><Faq /></div>
        <div data-screen-label="09 Closing"><Closing /></div>
        <Foot />
      </div>

      <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} visible={tweaksOn} />
    </div>
  );
};

window.__LandingApp = App;
if (!window.__forjeUnified) ReactDOM.createRoot(document.getElementById('root')).render(<App />);
