/* global React, Icon */
const { useState: useS, useEffect: useE, useRef: useR } = React;

// ───── 5. Comment ça marche ─────────────────────────────────────────────
const HOW_STEPS = [
  {
    num: '1',
    label: 'FORGE',
    title: 'Ton identité, encodée une fois',
    text: 'Logo, couleurs, police, mood — Forje apprend ta charte exacte à l\'onboarding. Cinq minutes, une seule fois.',
    art: 'identity',
  },
  {
    num: '2',
    label: 'VEILLE',
    title: 'L\'IA surveille tes sujets',
    text: 'Chaque actu de ton univers est scorée de 0 à 100. Au-dessus de 80, tu reçois une alerte : c\'est chaud, c\'est pour toi.',
    art: 'board',
  },
  {
    num: '3',
    label: 'GÉNÈRE',
    title: 'Un clic. Un post dans ta charte.',
    text: 'Actu, citation ou carousel — le post sort dans ton identité exacte. Tu valides, tu ajustes, tu publies.',
    art: 'compose',
  },
];

const StepArt = ({ kind }) => {
  if (kind === 'identity') return (
    <div className="how-art">
      <div className="how-identity">
        <div className="hi-logo">B</div>
        <div className="hi-swatches">
          <span style={{ background: '#1447B8' }} />
          <span style={{ background: '#2E7BE8' }} />
          <span style={{ background: '#EEF4FF' }} />
          <span style={{ background: '#0A1E5E' }} />
        </div>
        <div className="hi-font">Archivo Black · Inter</div>
        <div className="hi-mood">direct · graphique · terrain</div>
      </div>
    </div>
  );
  if (kind === 'board') return (
    <div className="how-art">
      <div className="how-board">
        {[['94', 'Mbappé forfait pour le Clásico', true], ['87', 'Le mercato d\'hiver s\'emballe', true], ['71', 'Les audiences de la Ligue 1 grimpent', false]].map(([s, t, hot], i) => (
          <div key={i} className="hb-row">
            <span className={'hb-score' + (hot ? ' hot' : '')}>{s}</span>
            <span className="hb-title">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="how-art">
      <div className="how-compose">
        <div className="hc-post">
          <div className="hc-band" />
          <div className="hc-title">MBAPPÉ<br />FORFAIT</div>
          <div className="hc-brand">BALLON BLEU</div>
        </div>
        <div className="hc-check">✓ Dans la charte</div>
      </div>
    </div>
  );
};

// Vrais screens de l'app (déposés dans assets/screens/) — fallback sur
// l'art CSS tant que le fichier n'existe pas.
const HOW_SHOTS = {
  identity: { src: 'assets/screens/how-identite.webp',   alt: 'L\'identité de marque encodée dans Forje Studio' },
  board:    { src: 'assets/screens/how-veille.webp',     alt: 'La veille scorée en temps réel dans Forje Studio' },
  compose:  { src: 'assets/screens/how-generation.webp', alt: 'Un post généré dans la charte, dans Forje Studio' },
};

const StepShot = ({ kind }) => {
  const shot = HOW_SHOTS[kind];
  const [ok, setOk] = useS(true);
  if (!shot || !ok) return <StepArt kind={kind} />;
  return (
    <div className="how-shot">
      <img src={shot.src} alt={shot.alt} loading="lazy" onError={() => setOk(false)} />
    </div>
  );
};

const HowItWorks = () => (
  <section className="section" id="how">
    <div className="section-label"><span className="bar" /> Comment ça marche</div>
    <h2>Forge une fois. <span className="accent">Poste pour toujours.</span></h2>

    <div className="how-grid">
      {HOW_STEPS.map((s) => (
        <div key={s.num} className="how-card">
          <div className="how-label"><span className="how-idx">0{s.num}</span>{s.label}</div>
          <h3>{s.title}</h3>
          <p>{s.text}</p>
          <StepShot kind={s.art} />
        </div>
      ))}
    </div>
  </section>
);

// ───── 6. Les 3 formats ─────────────────────────────────────────────────
const FORMATS = [
  {
    name: 'Actu',
    cost: '2 crédits',
    tagline: 'Du breaking au post en 90 secondes',
    video: 'assets/actu-loop.mp4',
    poster: 'assets/actu.webp',
    exampleKey: 'actu',
  },
  {
    name: 'Citation',
    cost: '1 crédit',
    tagline: 'Une déclaration, un visuel, zéro friction',
    video: 'assets/citation-loop.mp4',
    poster: 'assets/citation.webp',
    exampleKey: 'citation',
  },
  {
    name: 'Deep Dive',
    cost: '3–8 crédits',
    tagline: 'Le carousel 7-10 slides le plus sauvegardé d\'Instagram, documenté par une vraie recherche web',
    video: 'assets/deep-dive-loop.mp4',
    poster: 'assets/deep-dive.webp',
    exampleKey: 'deep_dive',
  },
];

const FormatCard = ({ f, example }) => (
  <div className="format-card">
    <div className="format-visual">
      {example ? (
        <img src={example} alt={'Exemple de post ' + f.name + ' généré par Forje'} loading="lazy" />
      ) : (
        /* Image fixe — les vidéos en boucle coûtaient trop cher en fluidité */
        <img src={f.poster} alt={'Format ' + f.name} loading="lazy" />
      )}
    </div>
    <div className="format-head">
      <h3>{f.name}</h3>
      <span className="format-cost">{f.cost}</span>
    </div>
    <p>{f.tagline}</p>
  </div>
);

const Formats = () => {
  // Exemples réels générés avec les presets démo — remplis quand disponibles.
  const [examples, setExamples] = useS({});
  useE(() => {
    fetch('/api/demo/examples')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && d.examples) setExamples(d.examples); })
      .catch(() => {});
  }, []);

  return (
    <section className="section" id="formats">
      <div className="section-label"><span className="bar" /> Formats</div>
      <h2>Trois formats. <span className="accent">Une seule charte : la tienne.</span></h2>
      <div className="formats-grid">
        {FORMATS.map(f => <FormatCard key={f.name} f={f} example={examples[f.exampleKey]} />)}
      </div>
    </section>
  );
};

// ───── 6bis. Vitrine Deep Dive — carousel pré-forgé du jour ─────────────
// PAS de génération live (60-120s) : le cron forge un carousel par profil
// démo chaque matin sur la meilleure actu du board (/api/demo/deepdive).
// Les slides sont rendues ici avec les vraies polices (Canvas client),
// exactement comme dans l'app. Chargement à l'approche de la section.
const DeepDiveShowcase = () => {
  const [carousels, setCarousels] = useS(null);   // { key: { name, topic, slides… } }
  const [activeKey, setActiveKey] = useS(null);
  const [rendered, setRendered]   = useS({});     // key → [dataUrl]
  const [slideIdx, setSlideIdx]   = useS(0);
  const hostRef  = useR(null);
  const trackRef = useR(null);
  const fetchedRef = useR(false);

  // Fetch lazy : payload ~1-2 Mo, on ne le charge qu'à l'approche du viewport
  useE(() => {
    const el = hostRef.current;
    if (!el || !('IntersectionObserver' in window)) { load(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); load(); }
    }, { rootMargin: '900px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const load = async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    try {
      const res = await fetch('/api/demo/deepdive');
      if (!res.ok) return;                          // pas encore forgé → section masquée
      const data = await res.json();
      const keys = Object.keys(data.carousels || {});
      if (!keys.length) return;
      setCarousels(data.carousels);
      setActiveKey(keys[0]);
    } catch (_) {}
  };

  // Rendu Canvas (vraies polices) du carousel actif — une seule fois par profil
  useE(() => {
    if (!carousels || !activeKey || rendered[activeKey]) return;
    let dead = false;
    (async () => {
      try {
        const imgs = await window.__renderDeepDiveCarousel(carousels[activeKey]);
        if (!dead) setRendered(prev => ({ ...prev, [activeKey]: imgs }));
      } catch (e) { console.warn('[DeepDive vitrine] rendu:', e.message); }
    })();
    return () => { dead = true; };
  }, [carousels, activeKey]);

  // Suivi de la slide visible (dots)
  const onScroll = () => {
    const t = trackRef.current;
    if (!t || !t.firstChild) return;
    const w = t.firstChild.offsetWidth + 14;
    setSlideIdx(Math.round(t.scrollLeft / w));
  };
  const goTo = (i) => {
    const t = trackRef.current;
    if (!t || !t.firstChild) return;
    t.scrollTo({ left: i * (t.firstChild.offsetWidth + 14), behavior: 'smooth' });
  };

  if (!carousels) return <div ref={hostRef} />;    // sentinelle invisible pour l'IO

  const active = carousels[activeKey];
  const imgs   = rendered[activeKey] || [];
  const keys   = Object.keys(carousels);

  return (
    <section className="section ddshow" ref={hostRef} id="deepdive">
      <div className="section-label"><span className="bar" /> Le format signature</div>
      <h2>Un deep dive complet. <span className="accent">Forgé ce matin.</span></h2>
      <p className="ddshow-sub">
        {active.total || imgs.length} slides sur « {active.topic} » — carousel généré
        automatiquement depuis le board de veille, dans la charte de {active.name}. Swipe.
      </p>

      {keys.length > 1 && (
        <div className="ddshow-tabs">
          {keys.map(k => (
            <button key={k}
              className={'ddshow-tab' + (k === activeKey ? ' active' : '')}
              onClick={() => { setActiveKey(k); setSlideIdx(0); }}>
              {carousels[k].name}
            </button>
          ))}
        </div>
      )}

      <div className="ddshow-track" ref={trackRef} onScroll={onScroll}>
        {imgs.length
          ? imgs.map((src, i) => (
              <div className="ddshow-slide" key={i}>
                <img src={src} alt={'Slide ' + (i + 1) + ' du deep dive ' + active.name} draggable={false}/>
              </div>
            ))
          : (active.slides || []).map((_, i) => <div className="ddshow-slide ddshow-slide--ghost" key={i}/>)}
      </div>

      <div className="ddshow-dots">
        {(imgs.length ? imgs : active.slides || []).map((_, i) => (
          <button key={i} className={'ddshow-dot' + (i === slideIdx ? ' active' : '')}
            aria-label={'Slide ' + (i + 1)} onClick={() => goTo(i)}/>
        ))}
      </div>
    </section>
  );
};

// ───── 7. Pricing ───────────────────────────────────────────────────────
const Pricing = () => (
  <section className="section" id="pricing">
    <div className="section-label"><span className="bar" /> Tarifs</div>
    <h2>Un prix. <span className="accent">Tout inclus.</span></h2>

    <div className="pricing-solo">
      <div className="price-card featured">
        <div className="price-kind">FORJE STUDIO</div>
        <div className="price-amount">
          <span className="num">69 €</span>
          <span className="per">/ mois</span>
        </div>
        <div className="price-sub">700 crédits · tout inclus · sans engagement</div>
        <div className="price-mix">≈ 350 actus, ou 700 citations, ou un mix des trois formats.</div>
        <ul className="price-list">
          <li><span className="tick">✓</span>Veille en temps réel sur tes sujets, scorée de 0 à 100</li>
          <li><span className="tick">✓</span>Actu (2 cr) · Citation (1 cr) · Deep Dive 7-10 slides (3-8 cr)</li>
          <li><span className="tick">✓</span>Ta charte exacte : logo, couleurs, police, mood</li>
          <li><span className="tick">✓</span>Éditeur post par post — texte, image, slides</li>
          <li><span className="tick">✓</span>Résiliable à tout moment depuis ton espace</li>
        </ul>
        <a href="Forje App.html" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}
           onClick={() => window.__forjeTrack?.('landing_cta_pricing')}>
          Commencer avec 50 crédits offerts <Icon.Arrow />
        </a>
        <div className="price-compare">Un designer freelance : 30-50 € le visuel. Forje : ~0,10 €.</div>
      </div>
    </div>
  </section>
);

// ───── 8. FAQ ───────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'Est-ce que les posts ressemblent vraiment à ma charte ?',
    a: 'Oui — c\'est tout le principe. À l\'onboarding, Forje encode ton logo, tes couleurs, ta police et ton mood. Chaque post est composé dans cette charte, pas "inspiré de". Teste la démo plus haut : les deux identités preset sortent des posts fidèles à leur charte, la tienne fonctionnera pareil.',
  },
  {
    q: 'D\'où viennent les photos ?',
    a: 'De la recherche d\'images Google (via Serper). Tu valides chaque photo avant génération, et tu peux uploader tes propres visuels — photos AFP incluses si tu as les droits.',
  },
  {
    q: 'Je peux modifier un post généré ?',
    a: 'Oui. Chaque post s\'ouvre dans l\'éditeur : tu modifies le texte, changes l\'image, réorganises les slides d\'un carousel. Rien ne part sans ta validation.',
  },
  {
    q: 'C\'est quoi un crédit ?',
    a: 'L\'unité de génération. Citation : 1 crédit. Actu : 2 crédits. Deep Dive : 3 crédits (léger) à 8 crédits (recherche web complète). Ton abonnement en inclut 700 par mois — environ 350 actus, ou 700 citations, ou un mix.',
  },
  {
    q: 'Je peux annuler quand ?',
    a: 'À tout moment, en deux clics, depuis le portail Stripe dans ton espace. Pas d\'engagement, pas de préavis.',
  },
  {
    q: 'Vous publiez directement sur Instagram ?',
    a: 'Bientôt. Aujourd\'hui, tu exportes chaque post en un clic (image 4K ou ZIP du carousel) et tu publies depuis ton outil habituel.',
  },
];

const FaqItem = ({ item, open, onToggle }) => (
  <div className={'faq-item' + (open ? ' open' : '')}>
    <button className="faq-q" onClick={onToggle} aria-expanded={open}>
      <span>{item.q}</span>
      <span className="faq-chev">{open ? '−' : '+'}</span>
    </button>
    <div className="faq-a" style={{ maxHeight: open ? 240 : 0 }}>
      <p>{item.a}</p>
    </div>
  </div>
);

const Faq = () => {
  const [openIdx, setOpenIdx] = useS(0);
  return (
    <section className="section section-faq" id="faq">
      <div className="section-label"><span className="bar" /> FAQ</div>
      <h2>Les questions <span className="accent">qu'on nous pose vraiment.</span></h2>
      <div className="faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <FaqItem key={i} item={item} open={openIdx === i} onToggle={() => setOpenIdx(openIdx === i ? -1 : i)} />
        ))}
      </div>
    </section>
  );
};

// ───── 9. CTA final ─────────────────────────────────────────────────────
const Closing = () => (
  <section className="closing">
    <h2>Ton prochain post est<br /><span className="accent">déjà dans la forge.</span></h2>
    <a href="Forje App.html" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}
       onClick={() => window.__forjeTrack?.('landing_cta_final')}>
      Essayer gratuitement — 50 crédits offerts <Icon.Arrow />
    </a>
    <div className="meta">SANS ENGAGEMENT · SANS CARTE BANCAIRE · RÉSILIABLE À TOUT MOMENT</div>
  </section>
);

// ───── Footer ───────────────────────────────────────────────────────────
const Foot = () => (
  <footer className="foot">
    <div className="foot-brand">
      <img src="assets/brand/blaise-mark.svg" alt="Blaise" className="foot-logo" style={{ borderRadius: 0 }} />
      <span>© 2026 blaise studio</span>
    </div>
    <div className="links">
      <a href="#pricing">Tarifs</a>
      <a href="#faq">FAQ</a>
      <a href="mailto:contact@forje.studio">Contact</a>
      <a href="/legal/cgu.html">CGU</a>
      <a href="/legal/confidentialite.html">Confidentialité</a>
      <a href="/legal/mentions-legales.html">Mentions légales</a>
    </div>
  </footer>
);

Object.assign(window, { HowItWorks, Formats, DeepDiveShowcase, Pricing, Faq, Closing, Foot });
