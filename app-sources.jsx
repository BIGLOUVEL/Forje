/* global React, AppIcon, Btn */
const { useState: useStateSrc } = React;

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES — real-time news watch board
// ═══════════════════════════════════════════════════════════════════════════

const BREAKING = {
  title: "Hermès annonce la relocalisation de 3 ateliers de maroquinerie en France",
  source: "Les Échos · il y a 14 min",
  matched: ["relocalisation", "maroquinerie française", "savoir-faire"],
  saturationMinutes: 118, // total window
  elapsedMinutes: 14,
};

const FEED = [
  { id:1, when:"il y a 4 min",  heat:"hot", source:"Vogue Business", cat:"Mode",
    title:"Le camel saturé devient la couleur signature de l'AH25",
    match:0.94,
    why:"Aligné avec ta palette (camel Annonay) + ton univers matière",
    format:"Carrousel",
    timing:"Poste dans les 45 prochaines minutes",
    caption:"Ils appellent ça la couleur de la saison. Nous, on l'utilise depuis 44 ans. Annonay, 1981. Même tannage, mêmes bassins. La mode rattrape ceux qui ne l'ont jamais lâchée.",
  },
  { id:2, when:"il y a 9 min", heat:"hot", source:"Le Monde Économie", cat:"Industrie",
    title:"France 2 diffusera un documentaire sur les maroquineries indépendantes",
    match:0.89,
    why:"Tu tournes avec l'émission Artisans de France la semaine prochaine",
    format:"Story + teaser",
    timing:"À programmer pour demain matin · 8h30",
    caption:"On tourne avec eux mercredi. Trois jours dans l'atelier — les mains, le cuir, les silences. Diffusion le 12 novembre.",
  },
  { id:3, when:"il y a 18 min", heat:"warm", source:"The Business of Fashion", cat:"Tendance",
    title:"Le retour du made-in-Roubaix comme argument luxe",
    match:0.82,
    why:"Ta ville, ton héritage — angle identitaire direct",
    format:"Reel",
    timing:"Fenêtre idéale · 18h-20h ce soir",
    caption:"Roubaix a habillé la France pendant 150 ans. Puis plus rien. Aujourd'hui les grandes maisons reviennent. Nous, on n'est jamais parties.",
  },
  { id:4, when:"il y a 27 min", heat:"warm", source:"Numérama", cat:"Tech",
    title:"Google annonce un partenariat IA avec LVMH",
    match:0.31,
    why:"Faible — hors de ton univers éditorial",
    format:null,
  },
  { id:5, when:"il y a 41 min", heat:"cool", source:"L'ADN", cat:"Société",
    title:"Les clients luxe plébiscitent les marques qui « parlent moins »",
    match:0.78,
    why:"Écho direct à ton ton sobre — opportunité de post citation",
    format:"Post citation",
    timing:"Programmer pour jeudi · 08:00",
    caption:"« Ils attendent qu'on se taise pour écouter le cuir. »",
  },
  { id:6, when:"il y a 52 min", heat:"cool", source:"Libération", cat:"Culture",
    title:"Exposition à Roubaix : 100 ans d'artisanat textile",
    match:0.88,
    why:"Ville + savoir-faire — angle fierté locale",
    format:"Story",
    timing:"Jusqu'à vendredi soir",
    caption:"Une expo à 400 mètres de l'atelier. On y va lundi. Photos à venir.",
  },
  { id:7, when:"il y a 1h08", heat:"cool", source:"RTL", cat:"Économie",
    title:"Hausse de 8% des exportations de maroquinerie française au Q3",
    match:0.64,
    why:"Stat utile en appui d'une citation",
    format:null,
  },
];

const HEAT_TOPICS = [
  { name:"Camel saturé",        level:3, delta:"+47%", series:[0.2,0.3,0.25,0.5,0.7,0.85,0.95] },
  { name:"Made-in-Roubaix",     level:3, delta:"+38%", series:[0.1,0.15,0.2,0.4,0.55,0.7,0.82] },
  { name:"Relocalisation",      level:3, delta:"+29%", series:[0.35,0.4,0.5,0.6,0.65,0.75,0.78] },
  { name:"Artisans de France",  level:2, delta:"+18%", series:[0.3,0.4,0.45,0.5,0.55,0.58,0.62] },
  { name:"Tannage végétal",     level:2, delta:"+12%", series:[0.4,0.42,0.45,0.5,0.52,0.55,0.56] },
  { name:"Minimalisme",         level:1, delta:"+5%",  series:[0.5,0.48,0.5,0.51,0.52,0.52,0.53] },
  { name:"Greenwashing",        level:1, delta:"—",    series:[0.4,0.4,0.41,0.4,0.4,0.39,0.4] },
  { name:"Logomania",           level:0, delta:"-8%",  series:[0.6,0.58,0.55,0.52,0.48,0.44,0.4] },
  { name:"Streetwear luxe",     level:0, delta:"-14%", series:[0.7,0.66,0.6,0.55,0.5,0.45,0.42] },
];

const SourcesScreen = () => {
  const [selected, setSelected] = useStateSrc(FEED[0].id);
  const [filter, setFilter] = useStateSrc('all');
  const active = FEED.find(n => n.id === selected);

  const filtered = FEED.filter(n => {
    if (filter === 'hot') return n.heat === 'hot';
    if (filter === 'relevant') return n.match >= 0.7;
    return true;
  });

  return (
    <div className="sources-page">
      {/* ─── ZONE 1: BREAKING BAR ─────────────────────────────────── */}
      <BreakingBar data={BREAKING}/>

      <div className="sources-layout">
        {/* ─── ZONE 2: REAL-TIME FEED ──────────────────────────── */}
        <section className="sources-feed">
          <div className="feed-head">
            <div>
              <h2 className="feed-title-main">Flux temps réel</h2>
              <p className="feed-sub">Actus filtrées dans ton univers — maroquinerie, artisanat, mode durable, Nord</p>
            </div>
            <div className="feed-filters">
              <button className={`feed-filter ${filter==='all'?'active':''}`} onClick={()=>setFilter('all')}>
                Tout <span className="count-inline">{FEED.length}</span>
              </button>
              <button className={`feed-filter ${filter==='hot'?'active':''}`} onClick={()=>setFilter('hot')}>
                <span className="dot dot-hot"/>Hot <span className="count-inline">{FEED.filter(n=>n.heat==='hot').length}</span>
              </button>
              <button className={`feed-filter ${filter==='relevant'?'active':''}`} onClick={()=>setFilter('relevant')}>
                Pertinents <span className="count-inline">{FEED.filter(n=>n.match>=0.7).length}</span>
              </button>
              <button className="feed-filter-icon" title="Sources"><AppIcon name="globe" size={12}/></button>
              <button className="feed-filter-icon" title="Filtres"><AppIcon name="filter" size={12}/></button>
            </div>
          </div>

          <div className="feed-list">
            {filtered.map(item => (
              <NewsRow key={item.id}
                       item={item}
                       active={item.id === selected}
                       onClick={() => setSelected(item.id)}/>
            ))}
          </div>
        </section>

        {/* ─── ZONE 3: ACTION PANEL ────────────────────────────── */}
        <aside className="sources-action">
          <ActionPanel news={active}/>
        </aside>
      </div>

      {/* ─── ZONE 4: HEAT BAR ─────────────────────────────────── */}
      <HeatBar topics={HEAT_TOPICS}/>
    </div>
  );
};

// ─── ZONE 1 ──────────────────────────────────────────────────────────────
const BreakingBar = ({ data }) => {
  const pct = (data.elapsedMinutes / data.saturationMinutes) * 100;
  const remaining = data.saturationMinutes - data.elapsedMinutes;
  const hours = Math.floor(remaining / 60);
  const mins = remaining % 60;

  return (
    <div className="breaking-bar">
      <div className="breaking-pulse-layer"/>
      <div className="breaking-main">
        <div className="breaking-badge">
          <span className="breaking-dot"/>
          <span>BREAKING</span>
        </div>
        <div className="breaking-content">
          <div className="breaking-title">{data.title}</div>
          <div className="breaking-meta">
            <span>{data.source}</span>
            <span className="breaking-sep">·</span>
            <span className="breaking-match">
              Match dans ton univers :
              {" "}{data.matched.map((t,i) => <span key={i} className="match-chip">{t}</span>)}
            </span>
          </div>
        </div>
        <div className="breaking-timer">
          <div className="timer-head">
            <AppIcon name="clock" size={12}/>
            <span>Trending depuis <b>{data.elapsedMinutes} min</b></span>
          </div>
          <div className="timer-bar">
            <div className="timer-bar-fill" style={{width: `${pct}%`}}/>
            <div className="timer-markers">
              <span>0</span>
              <span>saturation · {Math.round(data.saturationMinutes/60)}h</span>
            </div>
          </div>
          <div className="timer-footer">
            <span className="timer-remaining">~{hours}h{mins.toString().padStart(2,'0')} restant</span>
            <span className="timer-advice">avant saturation du sujet</span>
          </div>
        </div>
        <div className="breaking-actions">
          <Btn variant="ghost" size="sm" icon="eye">Voir</Btn>
          <Btn variant="primary" size="sm" icon="bolt">Générer maintenant</Btn>
        </div>
      </div>
    </div>
  );
};

// ─── ZONE 2: News row ────────────────────────────────────────────────────
const NewsRow = ({ item, active, onClick }) => {
  const heatDot = item.heat === 'hot' ? 'dot-hot' : item.heat === 'warm' ? 'dot-warm' : 'dot-cool';
  return (
    <button className={`news-row ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="news-row-time">
        <span className={`dot ${heatDot}`}/>
        <span className="news-when">{item.when}</span>
      </div>
      <div className="news-row-body">
        <div className="news-row-top">
          <span className="news-source">{item.source}</span>
          <span className="news-sep">·</span>
          <span className="news-cat">{item.cat}</span>
          {item.match >= 0.7 && (
            <span className="match-badge match-badge--strong">
              ◆ {Math.round(item.match*100)}% pertinent
            </span>
          )}
          {item.match < 0.7 && item.match >= 0.5 && (
            <span className="match-badge">{Math.round(item.match*100)}%</span>
          )}
          {item.match < 0.5 && (
            <span className="match-badge match-badge--weak">hors univers</span>
          )}
        </div>
        <div className="news-row-title">{item.title}</div>
      </div>
      {active && <div className="news-row-indicator"/>}
    </button>
  );
};

// ─── ZONE 3: Action panel ────────────────────────────────────────────────
const ActionPanel = ({ news }) => {
  if (!news) {
    return <div className="action-empty">Sélectionne une news</div>;
  }

  if (!news.format) {
    return (
      <div className="action-panel action-panel--weak">
        <div className="action-weak-icon">◇</div>
        <div className="action-weak-title">Pas pertinent pour ton univers</div>
        <div className="action-weak-desc">
          {news.why}. Forje n'a pas généré d'angle — trop loin de ta voix et de tes valeurs.
        </div>
        <button className="btn btn-ghost btn-sm" style={{marginTop: 14}}>
          <AppIcon name="bolt" size={12}/>
          Forcer une génération
        </button>
      </div>
    );
  }

  return (
    <div className="action-panel">
      <div className="action-head">
        <span className="action-kicker">FORJE TE SUGGÈRE</span>
        <span className="action-match">◆ {Math.round(news.match*100)}% pertinent</span>
      </div>

      <div className="action-why">
        <AppIcon name="target" size={12}/>
        <span>{news.why}</span>
      </div>

      <div className="action-recs">
        <div className="action-rec">
          <div className="action-rec-label">Format recommandé</div>
          <div className="action-rec-value">
            <AppIcon name="layers" size={14}/>
            {news.format}
          </div>
        </div>
        <div className="action-rec">
          <div className="action-rec-label">Fenêtre de publication</div>
          <div className="action-rec-value">
            <AppIcon name="clock" size={14}/>
            {news.timing}
          </div>
        </div>
      </div>

      <div className="action-caption-block">
        <div className="action-caption-head">
          <span>Caption prête à copier</span>
          <div className="action-caption-actions">
            <button className="action-mini-btn"><AppIcon name="sparkle" size={11}/>Régénérer</button>
            <button className="action-mini-btn"><AppIcon name="copy" size={11}/>Copier</button>
          </div>
        </div>
        <div className="action-caption-body">{news.caption}</div>
        <div className="action-caption-foot">
          <span>{news.caption.length} caractères</span>
          <span className="tag tag-dot tag-success">ton 94%</span>
        </div>
      </div>

      <div className="action-cta">
        <button className="btn btn-accent btn-sm" style={{flex:1}}>
          <AppIcon name="edit" size={12}/>Peaufiner
        </button>
        <button className="btn btn-primary btn-sm" style={{flex:1}}>
          <AppIcon name="send" size={12}/>Publier dans 45 min
        </button>
      </div>
    </div>
  );
};

// ─── ZONE 4: Heat bar ────────────────────────────────────────────────────
const HeatBar = ({ topics }) => (
  <section className="heat-bar">
    <div className="heat-head">
      <div className="heat-title-row">
        <AppIcon name="flame" size={14}/>
        <h3 className="heat-title">Chaleur des sujets · ton univers</h3>
      </div>
      <div className="heat-meta">
        <span>Dernières 24h</span>
        <span className="heat-sep">·</span>
        <span>Rafraîchi il y a 2 min</span>
      </div>
    </div>
    <div className="heat-grid">
      {topics.map((t, i) => (
        <div key={i} className={`heat-cell heat-cell--l${t.level}`}>
          <div className="heat-cell-row">
            <span className="heat-name">{t.name}</span>
            <span className="heat-flames">
              {t.level === 3 && '🔥🔥🔥'}
              {t.level === 2 && '🔥🔥'}
              {t.level === 1 && '🔥'}
              {t.level === 0 && <span className="heat-cold">—</span>}
            </span>
          </div>
          <div className="heat-cell-foot">
            <Sparkline series={t.series} level={t.level}/>
            <span className={`heat-delta heat-delta--l${t.level}`}>{t.delta}</span>
          </div>
        </div>
      ))}
    </div>
  </section>
);

const Sparkline = ({ series, level }) => {
  const w = 60, h = 16;
  const step = w / (series.length - 1);
  const pts = series.map((v, i) => `${i*step},${h - v*h}`).join(' ');
  const color = level === 3 ? '#FF6B4A' : level === 2 ? '#FFB061' : level === 1 ? '#FFE066' : '#9AA6D0';
  return (
    <svg width={w} height={h} className="heat-spark">
      <polyline fill="none" stroke={color} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" points={pts}/>
    </svg>
  );
};

Object.assign(window, { SourcesScreen });