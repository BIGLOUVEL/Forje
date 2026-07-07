/* global React, Icon */
const { useState: useStateH, useEffect: useEffectH } = React;

// ───── Posts flottants autour du mockup dashboard ─────────────────────────
// Mini-posts stylisés Ballon Bleu / Frame — mêmes codes que les vrais presets démo.
const FLOAT_POSTS = [
  {
    cls: 'fp-1',
    bg: 'linear-gradient(165deg, #0A1E5E 0%, #1447B8 68%, #2E7BE8 100%)',
    brand: 'BALLON BLEU',
    title: 'Mbappé forfait pour le Clásico',
    tag: 'ACTU · 2 crédits',
  },
  {
    cls: 'fp-2',
    bg: 'linear-gradient(165deg, #0D0B09 0%, #2A1D0C 62%, #4A3210 100%)',
    brand: 'FRAME',
    title: '« La lumière, c\'est la vérité »',
    tag: 'CITATION · 1 crédit',
  },
  {
    cls: 'fp-3',
    bg: 'linear-gradient(165deg, #081A4E 0%, #0E2F86 100%)',
    brand: 'BALLON BLEU',
    title: 'Mercato d\'hiver : ce qui change',
    tag: 'DEEP DIVE · 7 slides',
  },
];

const Hero = () => {
  const scrollToDemo = (e) => {
    e.preventDefault();
    document.getElementById('demo-live')?.scrollIntoView({ behavior: 'smooth' });
    window.__forjeTrack?.('landing_cta_voir_demo');
  };

  return (
    <section className="hero hero-v2">
      <div className="hero-text-col">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          Studio Instagram <span className="sep">·</span> Propulsé par l'IA
        </div>

        <h1 className="hero-title">
          Forge ton identité une fois.<br />
          <span className="accent">Poste pour toujours.</span>
        </h1>

        <p className="hero-sub">
          Le studio IA qui surveille l'actu et génère tes posts Instagram
          dans ta charte exacte. Du breaking au post publié : 90 secondes.
        </p>

        <div className="hero-cta">
          <a href="Forje App.html" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}
             onClick={() => window.__forjeTrack?.('landing_cta_hero_essayer')}>
            Essayer gratuitement <Icon.Arrow />
          </a>
          <a href="#demo-live" className="btn btn-ghost btn-lg" style={{ textDecoration: 'none' }} onClick={scrollToDemo}>
            Voir la démo <span className="cta-down">↓</span>
          </a>
        </div>

        <div className="hero-meta">
          <span>50 crédits offerts</span>
          <span className="dot" />
          <span>Sans engagement</span>
          <span className="dot" />
          <span>Sans carte bancaire</span>
        </div>
      </div>

      <div className="hero-visual-col">
        <div className="hero-mockup-stage">
          <div className="hero-mockup">
            <div className="hero-mockup-chrome">
              <span /><span /><span />
              <div className="hero-mockup-url">app.forje.studio</div>
            </div>
            <img src="assets/demo/dashboard-4k.webp" alt="Dashboard Forje Studio — veille en temps réel" loading="eager" />
          </div>

          {FLOAT_POSTS.map((p) => (
            <div key={p.cls} className={'float-post ' + p.cls} style={{ '--fp-bg': p.bg }}>
              <div className="fp-head"><span className="fp-av" />{p.brand}</div>
              <div className="fp-title">{p.title}</div>
              <div className="fp-tag">{p.tag}</div>
            </div>
          ))}

          <div className="hero-mockup-floor" />
        </div>
      </div>
    </section>
  );
};

Object.assign(window, { Hero });
