/* global React, ReactDOM, Icon, Streaks, Hero, SocialProof, DemoCarousel, HowItWorks, Features, Pricing, Closing, Foot, TweaksPanel */
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

  // starfield density
  useEffect_(() => {
    document.querySelectorAll('.stars, .stars-2, .stars-sparkle').forEach((n, i) => {
      n.style.opacity = String([0.9,0.55,1][i] * tweaks.starfieldDensity);
    });
  }, [tweaks.starfieldDensity]);

  // rotation speed — no-op (hero is static now)

  return (
    <div style={{ filter: `hue-rotate(${tweaks.hueShift}deg)` }}>
      <div className="page-bg">
        <div className="aurora">
          <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
          <div className="blob b4" /><div className="blob b5" />
        </div>
        <div className="stars" />
        <div className="stars-2" />
        <div className="stars-sparkle" />
        <Streaks />
      </div>
      <Pillars />
      <div className="horizon" />
      <div className="cursor-halo" />

      <div className="page">
        <nav className="nav" data-screen-label="nav">
          <div className="brand-mark">
            <span className="brand-wordmark">Forje</span>
            <span className="brand-suffix">Studio</span>
          </div>
          <div className="nav-links">
            <a href="#">Produit</a>
            <a href="#">Clients</a>
            <a href="#">Processus</a>
            <a href="#">Tarifs</a>
            <a href="#">Manifeste</a>
          </div>
          <div className="nav-right">
            <a href="Forje App.html" style={{ color: 'rgba(210,225,255,0.82)', textDecoration:'none', fontSize:14, fontWeight:500 }}>Log in</a>
            <a href="Forje App.html" className="btn btn-primary" style={{textDecoration:'none'}}>Rejoindre <Icon.Arrow /></a>
          </div>
        </nav>

        <div data-screen-label="01 Hero"><Hero tweaks={tweaks} /></div>
        <div data-screen-label="02 Social Proof"><SocialProof /></div>
        <div data-screen-label="03 Product Demo"><DemoCarousel /></div>
        <div data-screen-label="04 How It Works"><HowItWorks /></div>
        <div data-screen-label="05 Features"><Features /></div>
        <div data-screen-label="06 Pricing"><Pricing /></div>
        <div data-screen-label="07 Closing"><Closing /></div>
        <Foot />
      </div>

      <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} visible={tweaksOn} />
    </div>
  );
};

window.__LandingApp = App;
if (!window.__forjeUnified) ReactDOM.createRoot(document.getElementById('root')).render(<App />);
