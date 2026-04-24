/* global React, Icon, Sparkle */
const { useState: useS, useEffect: useE, useRef: useR } = React;

// ───── Social Proof ─────────────────────────────────────────────────────
// Original typographic marks — not replicating any real brand's logo.
const ProofMark = ({ kind, name }) => {
  const marks = {
    raplume: <><span className="sq" /> RAPLUME</>,
    foot:    <><span className="dot-sm" /><span style={{fontStyle:'italic'}}>footmercato</span></>,
    sofoot:  <span style={{letterSpacing:'-0.06em'}}>SO/FOOT</span>,
    brut:    <span style={{fontWeight:900,letterSpacing:'0.02em'}}>BRUT.</span>,
    konbini: <span style={{fontWeight:800,textTransform:'uppercase',letterSpacing:'0.04em'}}>konbini</span>,
    equipe:  <span style={{fontStyle:'italic',fontWeight:900}}>L'Équipe</span>,
    trax:    <><span className="ring" /> TRAX</>,
    melty:   <span style={{letterSpacing:'-0.03em'}}>melty°</span>,
  };
  return <div className={"mark"}>{marks[kind]}</div>;
};

const SocialProof = () => (
  <section className="proof">
    <div className="label">Trusted by 50+ editorial teams</div>
    <div className="proof-logos">
      <ProofMark kind="raplume" />
      <ProofMark kind="foot" />
      <ProofMark kind="sofoot" />
      <ProofMark kind="brut" />
      <ProofMark kind="konbini" />
      <ProofMark kind="equipe" />
      <ProofMark kind="trax" />
      <ProofMark kind="melty" />
    </div>
  </section>
);

// ───── Product Demo Carousel ────────────────────────────────────────────
const CLIENTS = [
  {
    logo: <><span style={{width:12,height:12,background:'#fff',display:'inline-block',transform:'rotate(45deg)',marginRight:8}} /> RAPLUME</>,
    name: 'Raplume',
    desc: 'Média football & culture · 2.4M followers',
    stats: [['+34%','engagement'], ['4.2min','setup/post'], ['92','score viral moy.']],
    posts: [
      { bg: 'linear-gradient(160deg,#1a1f6b,#4a1a5e)', hd: 'RAPLUME', title: 'Mbappé casse le record historique', meta: ['ACTU · 14:22', '2.1M'] },
      { bg: 'linear-gradient(160deg,#2a1050,#a0395c)', hd: 'RAPLUME', title: 'Les 5 stats folles de la soirée', meta: ['CAROUSEL · 6p', '987K'] },
      { bg: 'linear-gradient(160deg,#0a1560,#6a3ab5)', hd: 'RAPLUME', title: '« Je ne joue plus pour l\'argent »', meta: ['CITATION', '1.4M'] },
    ],
  },
  {
    logo: <><span style={{width:10,height:10,background:'#fff',borderRadius:'50%',display:'inline-block',marginRight:10}} /><span style={{fontStyle:'italic'}}>footmercato</span></>,
    name: 'Footmercato',
    desc: 'Transferts & marché · 3.1M followers',
    stats: [['90s','post → publication'], ['+52%','reach vs. 2025'], ['84','score viral moy.']],
    posts: [
      { bg: 'linear-gradient(160deg,#0b1540,#2a6ab5)', hd: 'FOOTMERCATO', title: 'Bellingham signe pour 6 ans', meta: ['BREAKING · 09:04', '3.4M'] },
      { bg: 'linear-gradient(160deg,#0a3060,#4090c0)', hd: 'FOOTMERCATO', title: 'Les salaires de l\'été', meta: ['CAROUSEL · 8p', '1.2M'] },
      { bg: 'linear-gradient(160deg,#052040,#2080c0)', hd: 'FOOTMERCATO', title: 'Le mercato en 5 chiffres', meta: ['DIGEST · quotidien', '640K'] },
    ],
  },
  {
    logo: <span style={{letterSpacing:'-0.06em',fontSize:44}}>SO/FOOT</span>,
    name: 'So Foot',
    desc: 'Magazine football premium · 1.1M followers',
    stats: [['6 formats','génération native'], ['+41%','saves/post'], ['88','score viral moy.']],
    posts: [
      { bg: 'linear-gradient(160deg,#1a1a22,#444450)', hd: 'SO FOOT', title: 'Portrait : le dernier romantique du foot', meta: ['COULISSES', '420K'] },
      { bg: 'linear-gradient(160deg,#221a1a,#6b4040)', hd: 'SO FOOT', title: '« Le ballon doit rester un jeu »', meta: ['CITATION', '712K'] },
      { bg: 'linear-gradient(160deg,#1a2228,#407080)', hd: 'SO FOOT', title: 'Top 10 des buts de la décennie', meta: ['CAROUSEL · 10p', '890K'] },
    ],
  },
  {
    logo: <span style={{letterSpacing:'-0.04em',fontSize:36,color:'rgba(200,220,255,0.9)'}}>Votre Média</span>,
    name: 'Votre marque ?',
    desc: 'Forje s\'adapte à chaque identité visuelle',
    stats: [['20 posts','pour entraîner'], ['48h','setup total'], ['∞','générations']],
    posts: [
      { bg: 'linear-gradient(160deg,#20306a,#3a5ec0)', hd: 'VOTRE MÉDIA', title: 'Votre contenu, votre style', meta: ['FORGE', 'custom'] },
      { bg: 'linear-gradient(160deg,#3a2060,#7040b0)', hd: 'VOTRE MÉDIA', title: 'On-brand, à chaque post', meta: ['STUDIO', 'fine-tuned'] },
      { bg: 'linear-gradient(160deg,#602030,#c05070)', hd: 'VOTRE MÉDIA', title: 'Scalable. Infiniment.', meta: ['LIVE', '24/7'] },
    ],
  },
];

const ClientCard = ({ c }) => (
  <div className="client-card">
    <div className="client-left">
      <div>
        <div className="client-logo-slot">
          <div className="client-logo">{c.logo}</div>
        </div>
        <div className="client-name">{c.name}</div>
        <div className="client-desc">{c.desc}</div>
        <div className="client-tag">
          <span className="check">✓</span> Modèle entraîné
        </div>
      </div>
      <div className="client-stats">
        {c.stats.map(([n, l], i) => (
          <div key={i} className="client-stat">
            <div className="n">{n}</div>
            <div className="l">{l}</div>
          </div>
        ))}
      </div>
    </div>
    <div className="client-right">
      <div className="thumbs">
        {c.posts.map((p, i) => (
          <div key={i} className={"thumb t"+(i+1)} style={{ '--thumb-bg': p.bg }}>
            <div className="thumb-inner">
              <div className="hd"><span className="av" /><span className="txt">{p.hd}</span></div>
              <div className="title">{p.title}</div>
              <div className="meta"><span>{p.meta[0]}</span><span>❤ {p.meta[1]}</span></div>
            </div>
          </div>
        ))}
      </div>
      <button className="lock-cta">
        Tester le modèle <span className="arr"><Icon.Arrow /></span>
      </button>
    </div>
  </div>
);

const DemoCarousel = () => {
  const [i, setI] = useS(0);
  const max = CLIENTS.length - 1;
  return (
    <section className="section">
      <div className="demo-head">
        <div>
          <div className="section-label"><span className="bar" /> Clients · Studio</div>
          <h2>Des marques réelles. <br /><span className="accent">Leur style, forgé.</span></h2>
          <p className="lede">
            Chaque client entre dans Forje avec une identité vide et en ressort avec un modèle IA entraîné
            sur 20 posts sur mesure. Voici ce que le studio génère pour eux, tous les jours.
          </p>
        </div>
        <div className="demo-nav">
          <button className="nav-btn" onClick={() => setI(Math.max(0, i-1))} disabled={i === 0}><Icon.ChevL /></button>
          <button className="nav-btn" onClick={() => setI(Math.min(max, i+1))} disabled={i === max}><Icon.ChevR /></button>
        </div>
      </div>

      <div className="carousel-wrap">
        <div className="carousel-track" style={{ transform: `translateX(calc(${-i} * (1296px + 24px)))` }}>
          {CLIENTS.map((c, idx) => <ClientCard key={idx} c={c} />)}
        </div>
      </div>

      <div className="dots">
        {CLIENTS.map((_, idx) => (
          <div key={idx} className={"dot" + (idx === i ? " active" : "")} onClick={() => setI(idx)} />
        ))}
      </div>
    </section>
  );
};

// ───── How It Works ─────────────────────────────────────────────────────
const HowItWorks = () => (
  <section className="section">
    <div className="section-label"><span className="bar" /> Processus</div>
    <h2>De l'identité zéro à la <span className="accent">génération infinie</span>.</h2>
    <p className="lede">Trois phases. Une fois. Pour toujours.</p>

    <div className="steps">
      <div className="step">
        <div className="step-node"><div className="inner" /></div>
        <div className="step-icon" style={{color:'#c6d8ff'}}><Icon.Hammer /></div>
        <div className="step-num">PHASE 01 · LA FORGE</div>
        <h3>Le designer forge ton identité</h3>
        <p>Notre directeur artistique partenaire crée 20 posts Instagram sur mesure,
           conçus pour entraîner l'IA sur ton style visuel exact — palette, typographie,
           composition, ton éditorial. Ces posts deviennent aussi tes premiers contenus publiables.</p>
      </div>
      <div className="step">
        <div className="step-node"><div className="inner" /></div>
        <div className="step-icon" style={{color:'#c6d8ff'}}><Icon.Cpu /></div>
        <div className="step-num">PHASE 02 · FINE-TUNING</div>
        <h3>L'IA apprend en 20 minutes</h3>
        <p>On entraîne un modèle LoRA dédié sur tes posts. Le modèle apprend
           à reproduire ton style exact — et reste dans notre infrastructure.
           C'est ton modèle, personnel et non duplicable.</p>
      </div>
      <div className="step">
        <div className="step-node"><div className="inner" /></div>
        <div className="step-icon" style={{color:'#c6d8ff'}}><Icon.Infinity /></div>
        <div className="step-num">PHASE 03 · LE STUDIO</div>
        <h3>Tu génères à l'infini</h3>
        <p>Posts actu, carousels, citations, coulisses — dans ton style exact, à chaque fois.
           Le système apprend de chaque post publié et s'améliore continuellement.</p>
      </div>
    </div>
  </section>
);

// ───── Features ─────────────────────────────────────────────────────────
const FeedArt = () => (
  <div className="feature-art art-feed">
    <div className="feed-row">
      <div>
        <div className="t">Mbappé blessé : forfait pour le match de ce soir</div>
        <div className="src">afp.fr · il y a 2 min</div>
      </div>
      <div className="score-pill hot">92 · HOT</div>
    </div>
    <div className="feed-row">
      <div>
        <div className="t">Transfert record en Ligue 1 — 85M€</div>
        <div className="src">rmcsport.fr · il y a 8 min</div>
      </div>
      <div className="score-pill hot">88 · HOT</div>
    </div>
    <div className="feed-row">
      <div>
        <div className="t">Le PSG annonce un nouveau sponsor maillot</div>
        <div className="src">lequipe.fr · il y a 14 min</div>
      </div>
      <div className="score-pill">72</div>
    </div>
    <div className="feed-row">
      <div>
        <div className="t">Coupe du monde 2030 : le calendrier officiel</div>
        <div className="src">fifa.com · il y a 22 min</div>
      </div>
      <div className="score-pill">64</div>
    </div>
  </div>
);

const GenArt = () => {
  const tiles = [
    { t: 'ACTU',      g: 'linear-gradient(140deg,#1a1f6b,#4a1a5e)' },
    { t: 'CAROUSEL',  g: 'linear-gradient(140deg,#2a1050,#a0395c)' },
    { t: 'DIGEST',    g: 'linear-gradient(140deg,#0a1560,#6a3ab5)' },
    { t: 'CITATION',  g: 'linear-gradient(140deg,#0b1540,#2a6ab5)' },
    { t: 'COULISSES', g: 'linear-gradient(140deg,#1a2228,#407080)' },
    { t: 'TREND',     g: 'linear-gradient(140deg,#602030,#c05070)' },
  ];
  return (
    <div className="feature-art art-gen">
      {tiles.map((t, i) => (
        <div key={i} className="gen-tile" style={{ '--tile': t.g }}>
          <div className="lbl"><span>{t.t}</span><span>✓</span></div>
        </div>
      ))}
    </div>
  );
};

const MemArt = () => (
  <div className="feature-art art-mem">
    <div className="mem-chart">
      <svg viewBox="0 0 300 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chrom" x1="0" x2="1">
            <stop offset="0" stopColor="#6A5BFF" />
            <stop offset="0.3" stopColor="#3EC7FF" />
            <stop offset="0.6" stopColor="#F5F0CB" />
            <stop offset="1" stopColor="#FF9ED3" />
          </linearGradient>
          <linearGradient id="chromFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3EC7FF" stopOpacity="0.3" />
            <stop offset="1" stopColor="#3EC7FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,80 C40,76 60,72 90,62 C120,52 140,50 170,38 C200,26 230,24 260,16 C280,12 295,10 300,8 L300,100 L0,100 Z"
              fill="url(#chromFill)" />
        <path d="M0,80 C40,76 60,72 90,62 C120,52 140,50 170,38 C200,26 230,24 260,16 C280,12 295,10 300,8"
              stroke="url(#chrom)" strokeWidth="2" fill="none" />
        {[[30,76],[90,62],[170,38],[260,16]].map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="#fff" />
        ))}
      </svg>
    </div>
    <div className="mem-legend">
      <span>SEMAINE 1</span>
      <span>MOIS 1</span>
      <span>MOIS 2</span>
      <span>MOIS 3+</span>
    </div>
    <div style={{ marginTop: 14, color: 'rgba(210,225,255,0.9)', fontSize: 13, fontWeight: 500 }}>
      Score de pertinence du modèle <span style={{color:'#F5F0CB'}}>+287%</span>
    </div>
  </div>
);

const Features = () => (
  <section className="section">
    <div className="section-label"><span className="bar" /> Capacités</div>
    <h2>Le studio complet, <br /><span className="accent">un seul abonnement.</span></h2>

    <div className="features">
      <div className="feature">
        <FeedArt />
        <div className="feature-tag">Veille Actu</div>
        <h3>Du breaking au post publié : 90 secondes.</h3>
        <p>Agent IA qui surveille des dizaines de sources en temps réel et score chaque histoire
           selon sa pertinence pour TON compte. Les actus à 85+ déclenchent une alerte « Actu Chaude ».</p>
      </div>
      <div className="feature">
        <GenArt />
        <div className="feature-tag">Génération brand-native</div>
        <h3>6 formats. Ton style. Zéro écart.</h3>
        <p>Actu, carousel explicatif, digest quotidien, citation, coulisses, trend injection —
           chaque post est généré dans ton identité visuelle exacte, et jamais ailleurs.</p>
      </div>
      <div className="feature">
        <MemArt />
        <div className="feature-tag">Mémoire éditoriale</div>
        <h3>Après 3 mois, Forje connaît ton compte mieux que ton CM.</h3>
        <p>Le système apprend de chaque post publié — formats, horaires, hooks, angles.
           Chaque génération suivante est plus précise que la précédente.</p>
      </div>
    </div>
  </section>
);

// ───── Pricing ──────────────────────────────────────────────────────────
const Pricing = () => (
  <section className="section">
    <div className="section-label"><span className="bar" /> Tarifs</div>
    <h2>Une forge. <span className="accent">Un studio.</span></h2>
    <p className="lede">Un investissement unique pour construire le modèle. Un abonnement pour l'exploiter.</p>

    <div className="pricing-grid">
      <div className="price-card">
        <div className="price-kind">ONE-TIME · SETUP</div>
        <div className="price-name">La Forge</div>
        <div className="price-amount">
          <span className="num">800 – 1 500 €</span>
          <span className="per">paiement unique</span>
        </div>
        <div className="price-sub">Création complète de l'identité visuelle et du modèle IA personnel.</div>
        <ul className="price-list">
          <li><span className="tick">✓</span>Direction artistique partenaire dédiée</li>
          <li><span className="tick">✓</span>20 posts Instagram conçus sur mesure</li>
          <li><span className="tick">✓</span>Fine-tuning d'un modèle LoRA personnel</li>
          <li><span className="tick">✓</span>20 posts prêts à publier dès J+2</li>
          <li><span className="tick">✓</span>Setup complet en 48 heures</li>
        </ul>
        <button className="btn btn-ghost btn-lg">Parler à un designer</button>
      </div>

      <div className="price-card featured">
        <div className="price-kind">SUBSCRIPTION · STUDIO</div>
        <div className="price-name">Le <span className="accent">Studio</span></div>
        <div className="price-amount">
          <span className="num">150 €</span>
          <span className="per">/ mois — à partir de</span>
        </div>
        <div className="price-sub">Accès illimité au studio de génération une fois ton modèle forgé.</div>
        <ul className="price-list">
          <li><span className="tick">✓</span>Génération illimitée dans ton style exact</li>
          <li><span className="tick">✓</span>Veille actu en temps réel + alertes « Hot »</li>
          <li><span className="tick">✓</span>Score viral prédictif avant publication</li>
          <li><span className="tick">✓</span>Mémoire éditoriale évolutive</li>
          <li><span className="tick">✓</span>Calendrier et programmation intégrés</li>
        </ul>
        <a href="Forje App.html" className="btn btn-primary btn-lg" style={{textDecoration:'none'}}>Rejoindre le studio <Icon.Arrow /></a>
      </div>
    </div>
  </section>
);

// ───── Closing CTA ──────────────────────────────────────────────────────
const Closing = () => (
  <section className="closing">
    <h2>Your brand.<br /><span className="accent">Forged in AI.</span></h2>
    <p>Rejoignez les 50+ équipes éditoriales qui génèrent leur contenu Instagram
       dans leur identité visuelle exacte — chaque jour, à l'infini.</p>
    <a href="Forje App.html" className="btn btn-primary btn-lg" style={{textDecoration:'none'}}>Rejoindre le studio <Icon.Arrow /></a>
    <div className="meta">SETUP 48H · SANS ENGAGEMENT · RÉSILIABLE À TOUT MOMENT</div>
  </section>
);

// ───── Footer ───────────────────────────────────────────────────────────
const Foot = () => (
  <footer className="foot">
    <div>© 2026 Forje Studio · forje.studio · Forged in Paris, rendered everywhere.</div>
    <div className="links">
      <a href="#">Mentions</a>
      <a href="#">Confidentialité</a>
      <a href="#">Contact</a>
      <a href="#">X / Twitter</a>
    </div>
  </footer>
);

Object.assign(window, { SocialProof, DemoCarousel, HowItWorks, Features, Pricing, Closing, Foot });
