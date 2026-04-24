/* global React, Icon, Sparkle */
const { useState: useStateH, useEffect: useEffectH } = React;

const HeroObject = ({ variant = 'F' }) => {
  return (
    <div className="hero-stage">
      <Sparkle size={14} style={{ position: 'absolute', top: '10%', left: '12%', opacity: 0.9, zIndex: 3 }} color="#ffe6b0" />
      <Sparkle size={10} style={{ position: 'absolute', top: '22%', right: '8%', opacity: 0.85, zIndex: 3 }} color="#c6d8ff" />
      <Sparkle size={8}  style={{ position: 'absolute', bottom: '18%', left: '20%', opacity: 0.7, zIndex: 3 }} color="#ffb0d4" />
      <Sparkle size={12} style={{ position: 'absolute', bottom: '30%', right: '16%', opacity: 0.85, zIndex: 3 }} color="#ffffff" />

      <div className="rays" />

      <div className="forge-mark-wrap">
        <div className="forge-assembly">
          <img src="assets/forje-mark.png" alt="Forje" className="forge-mark-spin" />
        </div>
        <div className="forge-floor" />
      </div>
    </div>
  );
};

const Hero = ({ tweaks }) => {
  const [demoOpen, setDemoOpen] = useStateH(false);
  return (
    <section className="hero">
      <div>
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          Instagram Engine <span className="sep">·</span> Powered by AI
        </div>

        <h1 className="hero-title">
          {tweaks.headline}<br />
          <span className="accent">{tweaks.headlineAccent}</span>
        </h1>

        <p className="hero-sub">
          Forje apprend l'identité visuelle exacte de votre marque, puis génère
          du contenu Instagram on-brand à l'infini — actus, carousels, citations,
          coulisses. Un designer vous forge. Une IA vous publie.
        </p>

        <div className="hero-cta">
          <a href="Forje App.html" className="btn btn-primary btn-lg" style={{textDecoration:'none'}}>
            Rejoindre le studio <Icon.Arrow />
          </a>
          <button className="btn btn-ghost btn-lg" onClick={() => setDemoOpen(true)}>
            <Icon.Play /> Voir une démo
          </button>
        </div>

        <div className="hero-meta">
          <span>Setup 48h</span>
          <span className="dot" />
          <span>Sans engagement</span>
          <span className="dot" />
          <span>50+ équipes éditoriales</span>
        </div>
      </div>

      <HeroObject variant={tweaks.heroObject} />

      {demoOpen && (
        <div onClick={() => setDemoOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(3,8,24,0.82)', backdropFilter: 'blur(8px)',
          zIndex: 100, display: 'grid', placeItems: 'center', cursor: 'pointer'
        }}>
          <div style={{
            width: 720, height: 420, borderRadius: 20, border: '1px solid rgba(110,160,255,0.3)',
            background: 'linear-gradient(180deg,#0a1440,#05102c)', position: 'relative',
            boxShadow: '0 40px 120px rgba(0,0,0,0.6)'
          }}>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
              color: 'rgba(200,220,255,0.7)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, letterSpacing: 0.04 }}>
              [ démo vidéo — cliquez pour fermer ]
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

Object.assign(window, { Hero, HeroObject });
