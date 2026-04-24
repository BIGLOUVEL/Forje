/* global React, AppIcon, Btn */
var { useState } = React;

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE — hub (Higgsfield-like) + creation (2 variations via tweak)
// ═══════════════════════════════════════════════════════════════════════════
const GenerateScreen = ({ layoutVariant, preset, onPickPreset, onBack }) => {
  if (preset) {
    return layoutVariant === 'chat'
      ? <GenerateChat preset={preset} onBack={onBack}/>
      : <GenerateStudio preset={preset} onBack={onBack}/>;
  }
  return <GenerateHub onPick={onPickPreset}/>;
};

const PRESETS = [
  { id: 'actu',     label: 'Actualité', desc: 'Du breaking au post en 90 secondes',
    tag: 'Le plus utilisé', icon: 'news',   img: 'assets/actu.png',      visual: 'actu'  },
  { id: 'citation', label: 'Citation',  desc: 'Une phrase forte, mise en image',
    icon: 'quote',  img: 'assets/citation.png',  visual: 'quote' },
  { id: 'deepdive', label: 'Deep Dive', desc: 'Carousel 6 slides — le format le plus sauvegardé',
    tag: 'Meilleur reach', icon: 'layers', img: 'assets/deep-dive.png',  visual: 'bts'   },
];

const GenerateHub = ({ onPick }) => (
  <div className="page-body">
    <div className="page-header">
      <div>
        <h1 className="page-title">Que veux-tu raconter ?</h1>
        <p className="page-subtitle">
          Choisis un format. Forje s'occupe du reste — rédaction, visuel, ton de voix.
        </p>
      </div>
      <div className="page-header-actions">
        <Btn variant="ghost" icon="clock">Historique</Btn>
      </div>
    </div>

    <div className="gen-preset-grid">
      {PRESETS.map(p => (
        <PresetCard key={p.id} preset={p} onPick={() => onPick(p)}/>
      ))}
    </div>

    <div className="gen-prompt-card">
      <div className="gen-prompt-badge">
        <AppIcon name="sparkle" size={14}/>
        <span>Ou décris-le avec tes mots — Forje choisira le bon format</span>
      </div>
      <div className="gen-prompt-input">
        <textarea
          placeholder="« On a reçu une livraison de cuir camel de Annonay — le même que notre père utilisait dans les années 80. Faut en parler. »"
          rows={2}
        />
      </div>
      <div className="gen-prompt-foot">
        <div className="gen-prompt-hints">
          <span>Forje devinera le bon format</span>
        </div>
        <Btn variant="primary" size="sm" icon="arrowRight">Générer</Btn>
      </div>
    </div>

    <div className="gen-recent">
      <div className="gen-section-label">
        <span>Reprendre où tu t'étais arrêtée</span>
      </div>
      <div className="gen-recent-row">
        <RecentCard type="Citation" when="il y a 12 min" title="« Un geste qui ne change pas depuis 1987. »" swatch="quote"/>
        <RecentCard type="Actu" when="hier · 18:04" title="Relocalisation de la maroquinerie — angle Roubaix" swatch="news"/>
        <RecentCard type="Deep Dive" when="hier · 14:22" title="L'art du tannage végétal en 6 slides" swatch="bts"/>
      </div>
    </div>
  </div>
);

const PresetCard = ({ preset, onPick }) => (
  <button className="preset-card" onClick={onPick}>
    {preset.tag && <span className="preset-tag">{preset.tag}</span>}
    <img className="preset-card-img" src={preset.img} alt={preset.label} draggable="false"/>
    <div className="preset-card-overlay">
      <div className="preset-card-label">{preset.label}</div>
      <div className="preset-card-desc">{preset.desc}</div>
    </div>
    <div className="preset-card-arrow">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M2.5 6.5h8M7.5 3l3.5 3.5L7.5 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  </button>
);

// Tiny stylized preview of each format (SVG-driven, chromatic world)
const PresetPreview = ({ kind }) => {
  switch (kind) {
    case 'actu':
      return (
        <div className="pp pp-actu">
          <div className="pp-chip">• EN DIRECT</div>
          <div className="pp-lede">La relocalisation de la maroquinerie française atteint un cap historique.</div>
          <div className="pp-meta">Les Échos</div>
        </div>
      );
    case 'quote':
      return (
        <div className="pp pp-quote">
          <div className="pp-quote-mark">“</div>
          <div className="pp-quote-text">L'excellence, c'est la répétition faite belle.</div>
        </div>
      );
    case 'bts':
      return (
        <div className="pp pp-bts">
          <div className="pp-bts-grain"/>
          <div className="pp-bts-label">COULISSES · 03</div>
        </div>
      );
    case 'product':
      return (
        <div className="pp pp-product">
          <div className="pp-product-tag">ÉDITION · CAMEL</div>
          <div className="pp-product-name">MARGOT</div>
          <div className="pp-product-line"/>
        </div>
      );
    case 'portrait':
      return (
        <div className="pp pp-portrait">
          <div className="pp-portrait-circle"/>
          <div className="pp-portrait-name">Noémie · atelier</div>
        </div>
      );
    case 'pedago':
      return (
        <div className="pp pp-pedago">
          <div className="pp-pedago-title">LE MOT</div>
          <div className="pp-pedago-word">Skiver</div>
          <div className="pp-pedago-def">Amincir le cuir à l'endroit d'un pli.</div>
        </div>
      );
    case 'season':
      return (
        <div className="pp pp-season">
          <div className="pp-season-label">AH · 25</div>
          <div className="pp-season-name">camel<br/>saturé</div>
        </div>
      );
    case 'testi':
      return (
        <div className="pp pp-testi">
          <div className="pp-testi-quote">« Je l'ai depuis 4 ans, elle vieillit mieux que moi. »</div>
          <div className="pp-testi-sig">— Élise M.</div>
        </div>
      );
    default: return null;
  }
};

const RecentCard = ({ type, when, title, swatch }) => (
  <div className="recent-card">
    <div className={`queue-swatch queue-swatch--${swatch}`} style={{width:32, height:32}}>
      <AppIcon name={swatch === 'quote' ? 'quote' : swatch === 'news' ? 'news' : 'image'} size={12}/>
    </div>
    <div style={{flex:1, minWidth:0}}>
      <div className="recent-type">{type} · <span className="recent-when">{when}</span></div>
      <div className="recent-title">{title}</div>
    </div>
    <AppIcon name="chevRight" size={14} style={{color:'var(--app-fg-4)'}}/>
  </div>
);

// ─── Variant A: Chat-like (prompt + preview) ─────────────────────────────
const GenerateChat = ({ preset, onBack }) => {
  const [activeVariant, setActiveVariant] = useState(0);
  return (
    <div className="gen-studio-body">
      <div className="gen-studio-head">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <AppIcon name="chevLeft" size={12}/>Formats
        </button>
        <div className="gen-studio-title-row">
          <AppIcon name={preset.icon} size={14} style={{color:'var(--app-fg-3)'}}/>
          <h1 className="gen-studio-title">{preset.label}</h1>
        </div>
        <div className="gen-studio-actions">
          <Btn variant="ghost" icon="clock">Historique</Btn>
          <Btn variant="accent" icon="calendar">Programmer</Btn>
          <Btn variant="primary" icon="send">Valider</Btn>
        </div>
      </div>

      <div className="gen-studio-grid">
        {/* LEFT: chat */}
        <div className="gen-chat">
          <div className="gen-chat-messages">
            <GenMsg who="forje">
              Je t'aide sur une <b>{preset.label.toLowerCase()}</b>. Raconte-moi le contexte — ce qui s'est passé, qui est impliqué, pourquoi ça compte pour la maison.
            </GenMsg>
            <GenMsg who="user">
              On a reçu une livraison de cuir camel de Annonay, le même que notre père utilisait dans les années 80. Je veux que ce soit pas nostalgique — plutôt “on n'a jamais arrêté, et voilà pourquoi”.
            </GenMsg>
            <GenMsg who="forje">
              Bien. J'ai généré trois angles différents. Regarde à droite — je garde ton ton (sobre, direct, sans pathos).
            </GenMsg>
            <GenMsg who="forje" system>
              <AppIcon name="bolt" size={12}/> <span><b>Détecté :</b> camel saturé est le ton dominant de AH25 chez Hermès & Loro Piana. Ça ajoute un écho utile.</span>
            </GenMsg>
          </div>
          <div className="gen-chat-composer">
            <textarea placeholder="Affine le ton, demande une variante, ajoute un détail…" rows={2}/>
            <div className="gen-chat-composer-foot">
              <div className="gen-chat-chips">
                <button className="chat-chip">Plus court</button>
                <button className="chat-chip">Ton plus sec</button>
                <button className="chat-chip">Ajoute un CTA</button>
                <button className="chat-chip">+ vignette atelier</button>
              </div>
              <button className="btn btn-primary btn-icon btn-sm"><AppIcon name="arrowRight" size={13}/></button>
            </div>
          </div>
        </div>

        {/* RIGHT: post preview */}
        <div className="gen-preview">
          <div className="gen-preview-head">
            <div className="gen-preview-variants">
              {[0,1,2].map(i => (
                <button key={i}
                        className={`gen-variant-btn ${activeVariant===i?'active':''}`}
                        onClick={() => setActiveVariant(i)}>
                  Variante {i+1}
                </button>
              ))}
              <button className="gen-variant-btn gen-variant-add">
                <AppIcon name="plus" size={11}/> Nouvelle
              </button>
            </div>
            <div className="gen-preview-device">
              <AppIcon name="grid" size={13}/>
              <span>Feed Instagram</span>
            </div>
          </div>

          <div className="gen-preview-stage">
            <PostPreviewCard variant={activeVariant} preset={preset}/>
          </div>

          <div className="gen-preview-caption">
            <div className="caption-head">
              <span className="caption-label">Légende</span>
              <div className="caption-actions">
                <Btn variant="ghost" size="sm" icon="copy">Copier</Btn>
                <Btn variant="ghost" size="sm" icon="sparkle">Régénérer</Btn>
              </div>
            </div>
            <div className="caption-body">
              {activeVariant === 0 && (<>
                Depuis 1981, nos sacs passent par Annonay.<br/><br/>
                Pas parce que c'est une tradition. Parce qu'on n'a pas trouvé mieux. Le tannage végétal long — dix semaines — donne ce cuir qui vieillit sans se défaire. Le même camel que notre père commandait. La même maison. Les mêmes bassins.<br/><br/>
                Les tendances vont et viennent. Cette livraison, elle, on l'attendait.
              </>)}
              {activeVariant === 1 && (<>
                Camel AH25.<br/><br/>
                Tout le monde en parle. Nous, on l'utilise depuis 44 ans. Même cuir, même tannerie à Annonay, même bassins végétaux. Pas une tendance — une décision qu'on n'a jamais eu besoin de reprendre.
              </>)}
              {activeVariant === 2 && (<>
                Ce cuir, c'est celui de mon père.<br/><br/>
                Annonay, 1981. Il a signé avec cette tannerie la première année de la maison. On n'a jamais changé. Pas par sentiment — par constat : le tannage végétal long qu'ils font tient mieux, vieillit mieux, et sent ce qu'un sac doit sentir.<br/><br/>
                La livraison de la semaine est la 518ème. Camel saturé. Prêt pour l'atelier.
              </>)}
            </div>
            <div className="caption-meta">
              <span>287 caractères · ~48 secondes de lecture</span>
              <span className="tag tag-accent">Ton de voix : 94% cohérent</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Variant B: Studio-like (tools panel + big preview) ──────────────────
const GenerateStudio = ({ preset, onBack }) => {
  const [activeVariant, setActiveVariant] = useState(0);
  return (
    <div className="gen-studio-body">
      <div className="gen-studio-head">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <AppIcon name="chevLeft" size={12}/>Formats
        </button>
        <div className="gen-studio-title-row">
          <AppIcon name={preset.icon} size={14} style={{color:'var(--app-fg-3)'}}/>
          <h1 className="gen-studio-title">{preset.label}</h1>
          <span className="tag">Brouillon auto-sauvegardé</span>
        </div>
        <div className="gen-studio-actions">
          <Btn variant="ghost" icon="eye">Aperçu</Btn>
          <Btn variant="accent" icon="calendar">Programmer</Btn>
          <Btn variant="primary" icon="send">Valider</Btn>
        </div>
      </div>

      <div className="gen-studio-grid gen-studio-grid--studio">
        {/* LEFT: tool stack */}
        <div className="gen-tools">
          <ToolSection title="Sujet" icon="target">
            <textarea className="tool-textarea"
              defaultValue="Nouvelle livraison cuir camel Annonay — 44 ans avec cette tannerie. Angle : fidélité silencieuse, pas nostalgie."
              rows={3}/>
          </ToolSection>

          <ToolSection title="Ton" icon="mic">
            <div className="tool-pills">
              <Pill active>Sobre</Pill>
              <Pill active>Direct</Pill>
              <Pill>Chaleureux</Pill>
              <Pill>Affirmatif</Pill>
              <Pill>Espiègle</Pill>
            </div>
            <div className="tool-sub">Issu de ton identité de marque</div>
          </ToolSection>

          <ToolSection title="Longueur" icon="layers">
            <div className="tool-slider">
              <div className="slider-track"><div className="slider-fill" style={{width:'55%'}}/><div className="slider-thumb" style={{left:'55%'}}/></div>
              <div className="slider-labels">
                <span>Bref</span><span style={{color:'var(--app-fg)', fontWeight:600}}>Moyen</span><span>Long</span>
              </div>
            </div>
          </ToolSection>

          <ToolSection title="Visuel" icon="image">
            <div className="tool-visuals">
              <VisualOption active kind="typo" label="Typographique"/>
              <VisualOption kind="photo" label="Photo atelier"/>
              <VisualOption kind="texture" label="Texture cuir"/>
              <VisualOption kind="carousel" label="Carrousel"/>
            </div>
          </ToolSection>

          <ToolSection title="Call to action" icon="link">
            <select className="tool-select">
              <option>Aucun — laisser parler</option>
              <option>Lien profil</option>
              <option>Visite atelier</option>
              <option>Nouveauté (fiche produit)</option>
            </select>
          </ToolSection>

          <button className="btn btn-accent btn-lg" style={{width:'100%', marginTop:8}}>
            <AppIcon name="sparkle" size={14}/>
            Régénérer avec ces réglages
          </button>
        </div>

        {/* RIGHT: preview */}
        <div className="gen-preview">
          <div className="gen-preview-head">
            <div className="gen-preview-variants">
              {[0,1,2].map(i => (
                <button key={i}
                        className={`gen-variant-btn ${activeVariant===i?'active':''}`}
                        onClick={() => setActiveVariant(i)}>
                  Variante {i+1}
                </button>
              ))}
              <button className="gen-variant-btn gen-variant-add"><AppIcon name="plus" size={11}/> Nouvelle</button>
            </div>
            <div className="gen-preview-device">
              <AppIcon name="grid" size={13}/>
              <span>Feed Instagram</span>
            </div>
          </div>
          <div className="gen-preview-stage">
            <PostPreviewCard variant={activeVariant} preset={preset}/>
          </div>
          <div className="gen-preview-caption">
            <div className="caption-head">
              <span className="caption-label">Légende générée</span>
              <div className="caption-actions">
                <Btn variant="ghost" size="sm" icon="copy">Copier</Btn>
                <Btn variant="ghost" size="sm" icon="edit">Éditer</Btn>
              </div>
            </div>
            <div className="caption-body">
              {activeVariant === 0 && <>Depuis 1981, nos sacs passent par Annonay. Pas parce que c'est une tradition. Parce qu'on n'a pas trouvé mieux. Le tannage végétal long — dix semaines — donne ce cuir qui vieillit sans se défaire.</>}
              {activeVariant === 1 && <>Camel AH25. Tout le monde en parle. Nous, on l'utilise depuis 44 ans.</>}
              {activeVariant === 2 && <>Ce cuir, c'est celui de mon père. Annonay, 1981. Il a signé avec cette tannerie la première année de la maison.</>}
            </div>
            <div className="caption-meta">
              <span>287 caractères</span>
              <span className="tag tag-accent">Ton 94%</span>
              <span className="tag tag-dot tag-success">Palette conforme</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolSection = ({ title, icon, children }) => (
  <div className="tool-section">
    <div className="tool-section-head">
      <AppIcon name={icon} size={12}/>
      <span>{title}</span>
    </div>
    {children}
  </div>
);
const Pill = ({ active, children }) => (
  <button className={`tool-pill ${active ? 'active' : ''}`}>{children}</button>
);
const VisualOption = ({ kind, label, active }) => (
  <button className={`visual-option visual-option--${kind} ${active?'active':''}`}>
    <div className="visual-option-thumb"/>
    <span>{label}</span>
  </button>
);

const GenMsg = ({ who, system, children }) => (
  <div className={`gen-msg gen-msg--${who} ${system ? 'gen-msg--system' : ''}`}>
    {who === 'forje' && !system && <div className="gen-msg-avatar"/>}
    <div className="gen-msg-bubble">{children}</div>
  </div>
);

// Post preview — 3 variations, all 1:1
const PostPreviewCard = ({ variant, preset }) => {
  if (preset.visual === 'actu' || variant === 0) {
    return (
      <div className="post-preview post-preview--typo-camel">
        <div className="post-preview-kicker">DEPUIS 1981</div>
        <div className="post-preview-headline">
          Annonay<br/>toujours.
        </div>
        <div className="post-preview-sig">Forje · maison Tessier</div>
      </div>
    );
  }
  if (variant === 1) {
    return (
      <div className="post-preview post-preview--photo">
        <div className="post-preview-photo-layer"/>
        <div className="post-preview-photo-label">
          <div className="small-kicker">LIVRAISON 518</div>
          <div className="headline-photo">Camel<br/>saturé.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="post-preview post-preview--split">
      <div className="split-left">
        <div className="post-preview-kicker">AH · 25</div>
        <div className="split-headline">44 ans<br/>d'une&nbsp;seule<br/><span>tannerie.</span></div>
        <div className="split-foot">Maison Tessier · depuis 1981</div>
      </div>
      <div className="split-right">
        <div className="split-swatch"/>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE — 3 toggleable views
// ═══════════════════════════════════════════════════════════════════════════
const QueueScreen = ({ defaultView = 'calendar' }) => {
  const [view, setView] = useState(defaultView);
  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">File de validation</h1>
          <p className="page-subtitle">7 posts programmés cette semaine · 2 à valider avant 18h</p>
        </div>
        <div className="page-header-actions">
          <div className="view-toggle">
            <button className={`view-btn ${view==='calendar'?'active':''}`} onClick={()=>setView('calendar')}>
              <AppIcon name="calendar" size={13}/> Calendrier
            </button>
            <button className={`view-btn ${view==='feed'?'active':''}`} onClick={()=>setView('feed')}>
              <AppIcon name="list" size={13}/> Feed
            </button>
            <button className={`view-btn ${view==='grid'?'active':''}`} onClick={()=>setView('grid')}>
              <AppIcon name="grid" size={13}/> Grille
            </button>
          </div>
          <Btn variant="primary" icon="plus">Nouveau post</Btn>
        </div>
      </div>

      {view === 'calendar' && <QueueCalendar/>}
      {view === 'feed' && <QueueFeed/>}
      {view === 'grid' && <QueueGrid/>}
    </div>
  );
};

const WEEK = ['LUN 14','MAR 15','MER 16','JEU 17','VEN 18','SAM 19','DIM 20'];
const CAL_EVENTS = [
  { day:0, hour:8,  dur:1, type:'quote',   title:'« L\'excellence… »', status:'ready' },
  { day:1, hour:8,  dur:1, type:'product', title:'Sac Margot camel',   status:'ready' },
  { day:1, hour:19, dur:1, type:'bts',     title:'Piquage · Noémie',    status:'ready' },
  { day:2, hour:10, dur:1, type:'news',    title:'Émission Artisans',   status:'draft' },
  { day:2, hour:18, dur:1, type:'product', title:'Margot · lancement',  status:'ready' },
  { day:3, hour:12, dur:1, type:'pedago',  title:'Le mot · skiver',     status:'draft' },
  { day:4, hour:17, dur:1, type:'quote',   title:'« Trois générations »', status:'ready' },
];
const QueueCalendar = () => (
  <div className="card cal-card">
    <div className="cal-head">
      <div className="cal-nav">
        <button className="btn btn-ghost btn-icon btn-sm"><AppIcon name="chevLeft" size={12}/></button>
        <span className="cal-range">14 – 20 octobre 2025</span>
        <button className="btn btn-ghost btn-icon btn-sm"><AppIcon name="chevRight" size={12}/></button>
      </div>
      <div className="cal-legend">
        <span className="cal-legend-item"><i className="cal-swatch cal-swatch--quote"/>Citation</span>
        <span className="cal-legend-item"><i className="cal-swatch cal-swatch--bts"/>Coulisses</span>
        <span className="cal-legend-item"><i className="cal-swatch cal-swatch--product"/>Produit</span>
        <span className="cal-legend-item"><i className="cal-swatch cal-swatch--news"/>Actu</span>
        <span className="cal-legend-item"><i className="cal-swatch cal-swatch--pedago"/>Pédago</span>
      </div>
    </div>
    <div className="cal-grid">
      <div className="cal-hours-col">
        <div className="cal-day-head"></div>
        {[6,8,10,12,14,16,18,20].map(h => (
          <div key={h} className="cal-hour">{h}:00</div>
        ))}
      </div>
      {WEEK.map((d, di) => (
        <div key={di} className="cal-day-col">
          <div className="cal-day-head">
            <span className="cal-day-label">{d.split(' ')[0]}</span>
            <span className={`cal-day-num ${di===0?'today':''}`}>{d.split(' ')[1]}</span>
          </div>
          {[6,8,10,12,14,16,18,20].map(h => <div key={h} className="cal-slot"/>)}
          {CAL_EVENTS.filter(e => e.day === di).map((e, i) => {
            const top = ((e.hour - 6) / 2) * 64 + 40; // 40 is head
            return (
              <div key={i} className={`cal-event cal-event--${e.type} ${e.status==='draft'?'draft':''}`}
                   style={{top, height: e.dur * 64 - 6}}>
                <div className="cal-event-time">{e.hour}:00</div>
                <div className="cal-event-title">{e.title}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  </div>
);

const FEED_ITEMS = [
  { when:'Mardi 15 oct · 08:00', type:'Citation', swatch:'quote', status:'ready',
    title:'« L\'excellence, c\'est la répétition faite belle. »',
    caption:'Un geste, répété chaque jour depuis 1981. Pas un rituel — une discipline.' },
  { when:'Mardi 15 oct · 19:30', type:'Coulisses', swatch:'bts', status:'ready',
    title:'Piquage main · machine n°3',
    caption:'Noémie a rejoint l\'atelier il y a trois ans. Elle pique le cuir comme son grand-père montait les meubles.' },
  { when:'Mercredi 16 oct · 10:00', type:'Actu', swatch:'news', status:'draft',
    title:'L\'émission Artisans de France dans nos murs',
    caption:'Tournage toute la journée dans l\'atelier. Diffusion le 12 novembre sur France 2.' },
  { when:'Mercredi 16 oct · 18:00', type:'Produit', swatch:'product', status:'ready',
    title:'Margot · édition camel · en ligne',
    caption:'Le Margot revient en camel saturé — tannage Annonay, 44 pièces, numérotées.' },
  { when:'Jeudi 17 oct · 12:00', type:'Pédagogie', swatch:'pedago', status:'draft',
    title:'Le mot du métier : skiver',
    caption:'Amincir le cuir à l\'endroit d\'un pli. Pour qu\'il tombe, pas qu\'il se casse.' },
];
const QueueFeed = () => (
  <div className="queue-feed">
    {FEED_ITEMS.map((it, i) => (
      <div key={i} className="feed-row card">
        <div className={`feed-thumb feed-thumb--${it.swatch}`}>
          <div className="feed-thumb-inner">
            {it.swatch === 'quote' && <div className="feed-thumb-quote">“</div>}
            {it.swatch === 'bts' && <div className="feed-thumb-label">COULISSES<br/>03</div>}
            {it.swatch === 'news' && <div className="feed-thumb-chip">• ACTU</div>}
            {it.swatch === 'product' && <div className="feed-thumb-label">MARGOT<br/>CAMEL</div>}
            {it.swatch === 'pedago' && <div className="feed-thumb-label">LE MOT<br/>Skiver</div>}
          </div>
        </div>
        <div className="feed-meta">
          <div className="feed-meta-top">
            <span className="feed-when">{it.when}</span>
            <span className="feed-dot">·</span>
            <span className="feed-type">{it.type}</span>
            <span className={`tag tag-dot ${it.status==='ready'?'tag-success':'tag-warn'}`} style={{marginLeft:'auto'}}>
              {it.status==='ready'?'Prêt':'Brouillon'}
            </span>
          </div>
          <div className="feed-title">{it.title}</div>
          <div className="feed-caption">{it.caption}</div>
          <div className="feed-actions">
            <Btn variant="ghost" size="sm" icon="eye">Aperçu</Btn>
            <Btn variant="ghost" size="sm" icon="edit">Éditer</Btn>
            <Btn variant="accent" size="sm" icon="check">Valider</Btn>
            <Btn variant="ghost" size="sm" icon="more" style={{marginLeft:'auto'}}></Btn>
          </div>
        </div>
      </div>
    ))}
  </div>
);

const GRID_ITEMS = [
  { kind:'quote',   label:'« L\'excellence… »',      status:'done' },
  { kind:'bts',     label:'Piquage · Noémie',         status:'done' },
  { kind:'news',    label:'Artisans de France',       status:'done' },
  { kind:'product', label:'Margot camel',             status:'planned' },
  { kind:'pedago',  label:'Skiver',                   status:'planned' },
  { kind:'quote',   label:'« Trois générations »',    status:'planned' },
  { kind:'product', label:'Sac Louise',               status:'published' },
  { kind:'bts',     label:'Tannerie Annonay',         status:'published' },
  { kind:'quote',   label:'« Le temps est matière »', status:'published' },
];
const QueueGrid = () => (
  <div className="queue-grid-wrap">
    <div className="queue-grid-legend">
      <span><i className="legend-dot legend-dot--planned"/>Programmé</span>
      <span><i className="legend-dot legend-dot--done"/>À publier cette semaine</span>
      <span><i className="legend-dot legend-dot--published"/>Publié</span>
      <span style={{marginLeft:'auto', color:'var(--app-fg-4)', fontSize:11}}>
        Aperçu du feed @maison.tessier — 9 dernières cases
      </span>
    </div>
    <div className="ig-grid">
      {GRID_ITEMS.map((it, i) => (
        <div key={i} className={`ig-cell ig-cell--${it.kind} ig-cell--${it.status}`}>
          <PresetPreview kind={it.kind === 'quote' ? 'quote' : it.kind === 'bts' ? 'bts' : it.kind === 'news' ? 'actu' : it.kind === 'product' ? 'product' : 'pedago'}/>
          <div className="ig-cell-foot">
            <span className={`ig-cell-status ig-cell-status--${it.status}`}>
              {it.status === 'done' && '◆ Cette semaine'}
              {it.status === 'planned' && '◇ Programmé'}
              {it.status === 'published' && '✓ Publié · 1.2k'}
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// BRAND — identité visuelle
// ═══════════════════════════════════════════════════════════════════════════
const BrandScreen = () => (
  <div className="page-body">
    <div className="page-header">
      <div>
        <h1 className="page-title">Identité de la maison</h1>
        <p className="page-subtitle">Ce que Forje a appris de toi. Tout ici influence chaque post généré.</p>
      </div>
      <div className="page-header-actions">
        <Btn variant="ghost" icon="eye">Prévisualiser un post</Btn>
        <Btn variant="primary" icon="check">Enregistrer</Btn>
      </div>
    </div>

    <div className="brand-grid">
      {/* Identity card */}
      <section className="card card-pad brand-identity-card">
        <div className="brand-card-head">
          <span className="tag">01 · Fondations</span>
          <div className="side-section-title" style={{marginBottom:0}}>
            <AppIcon name="pin" size={14}/> Qui tu es
          </div>
        </div>
        <div className="brand-field">
          <label>Nom de la maison</label>
          <div className="brand-input">Maison Tessier</div>
        </div>
        <div className="brand-field">
          <label>Tagline</label>
          <div className="brand-input">Maroquinerie à Roubaix, depuis 1981.</div>
        </div>
        <div className="brand-field">
          <label>Mission en une phrase</label>
          <div className="brand-textarea">Faire des sacs qui vieillissent mieux que nous, avec les mêmes mains et les mêmes cuirs depuis trois générations.</div>
        </div>
        <div className="brand-field">
          <label>Valeurs (3 max — ordonnées)</label>
          <div className="brand-chips">
            <span className="brand-chip">1. Durée</span>
            <span className="brand-chip">2. Geste</span>
            <span className="brand-chip">3. Mesure</span>
          </div>
        </div>
      </section>

      {/* Voice */}
      <section className="card card-pad brand-voice-card">
        <div className="brand-card-head">
          <span className="tag">02 · Voix</span>
          <div className="side-section-title" style={{marginBottom:0}}>
            <AppIcon name="mic" size={14}/> Comment tu parles
          </div>
        </div>
        <div className="voice-sliders">
          <VoiceSlider label="Sobre" opposite="Ornementé" value={0.18}/>
          <VoiceSlider label="Direct" opposite="Allusif" value={0.25}/>
          <VoiceSlider label="Chaleureux" opposite="Distant" value={0.62}/>
          <VoiceSlider label="Affirmatif" opposite="Interrogatif" value={0.72}/>
          <VoiceSlider label="Contemporain" opposite="Classique" value={0.4}/>
        </div>
        <div className="brand-voice-samples">
          <div className="voice-sample">
            <span className="voice-sample-tick voice-sample-tick--yes">✓ On dit</span>
            <span>« Dix semaines de tannage. »</span>
          </div>
          <div className="voice-sample">
            <span className="voice-sample-tick voice-sample-tick--no">✗ On dit pas</span>
            <span>« Une expérience sensorielle inoubliable. »</span>
          </div>
        </div>
      </section>

      {/* Palette */}
      <section className="card card-pad brand-palette-card">
        <div className="brand-card-head">
          <span className="tag">03 · Palette</span>
          <div className="side-section-title" style={{marginBottom:0}}>
            <AppIcon name="palette" size={14}/> Couleurs de la maison
          </div>
        </div>
        <div className="palette-row">
          <Swatch color="#B47E3F" name="Camel Annonay" role="Primaire"/>
          <Swatch color="#F2E8D5" name="Ivoire atelier" role="Secondaire"/>
          <Swatch color="#2A1F18" name="Brun cuir sombre" role="Texte"/>
          <Swatch color="#7A5030" name="Noisette" role="Accent"/>
          <Swatch color="#EDE4CF" name="Papier kraft" role="Fond"/>
        </div>
        <div className="palette-preview">
          <div className="palette-preview-label">Sur un post</div>
          <div className="palette-preview-stage">
            <div className="post-preview post-preview--typo-camel" style={{width: 180, height: 180, padding: 14}}>
              <div className="post-preview-kicker" style={{fontSize:9}}>DEPUIS 1981</div>
              <div className="post-preview-headline" style={{fontSize:28}}>Annonay<br/>toujours.</div>
              <div className="post-preview-sig" style={{fontSize:9}}>Maison Tessier</div>
            </div>
          </div>
        </div>
      </section>

      {/* Typography */}
      <section className="card card-pad brand-type-card">
        <div className="brand-card-head">
          <span className="tag">04 · Typographie</span>
          <div className="side-section-title" style={{marginBottom:0}}>
            <AppIcon name="layers" size={14}/> Lettrage
          </div>
        </div>
        <div className="type-row">
          <div className="type-preview" style={{fontFamily:'Fraunces, serif', fontStyle:'italic'}}>Aa</div>
          <div className="type-meta">
            <div className="type-name">Fraunces <span>italique</span></div>
            <div className="type-desc">Titres, citations, emphase</div>
          </div>
        </div>
        <div className="type-row">
          <div className="type-preview" style={{fontFamily:'DM Sans, sans-serif', fontWeight:500}}>Aa</div>
          <div className="type-meta">
            <div className="type-name">DM Sans</div>
            <div className="type-desc">Corps, légendes, interface</div>
          </div>
        </div>
      </section>

      {/* Do's / Don'ts */}
      <section className="card card-pad brand-rules-card" style={{gridColumn:'1 / -1'}}>
        <div className="brand-card-head">
          <span className="tag">05 · Garde-fous</span>
          <div className="side-section-title" style={{marginBottom:0}}>
            <AppIcon name="target" size={14}/> Ce qu'on fait, ce qu'on ne fait pas
          </div>
        </div>
        <div className="rules-grid">
          <div className="rules-col rules-col--do">
            <div className="rules-col-head">On fait</div>
            <ul>
              <li>Parler des mains, du temps, des matières</li>
              <li>Écrire court, phrases nominales, pas d'emphase inutile</li>
              <li>Montrer l'atelier — grain, poussière, imperfection</li>
              <li>Citer les fournisseurs par leur nom</li>
            </ul>
          </div>
          <div className="rules-col rules-col--dont">
            <div className="rules-col-head">On ne fait pas</div>
            <ul>
              <li>Superlatifs, « exceptionnel », « ultime »</li>
              <li>Emoji (sauf exception explicite)</li>
              <li>Hashtags en masse</li>
              <li>Photos léchées, studio blanc, lifestyle génériques</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  </div>
);

const VoiceSlider = ({ label, opposite, value }) => (
  <div className="voice-slider">
    <div className="voice-slider-labels">
      <span className="voice-side voice-side--left">{label}</span>
      <span className="voice-side voice-side--right">{opposite}</span>
    </div>
    <div className="slider-track">
      <div className="slider-fill" style={{width: `${value*100}%`}}/>
      <div className="slider-thumb" style={{left: `${value*100}%`}}/>
    </div>
  </div>
);
const Swatch = ({ color, name, role }) => (
  <div className="swatch">
    <div className="swatch-chip" style={{background: color}}/>
    <div className="swatch-meta">
      <div className="swatch-name">{name}</div>
      <div className="swatch-role">{role} · <span style={{fontVariant:'small-caps', letterSpacing:'0.05em'}}>{color}</span></div>
    </div>
  </div>
);

Object.assign(window, { GenerateScreen, QueueScreen, BrandScreen });
