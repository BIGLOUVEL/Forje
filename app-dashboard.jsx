/* global React, AppIcon, Btn */
var { useState, useEffect, useRef, useCallback } = React;

// ─── Time helper ───────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins  = Math.floor(diff / 60000);
  var hours = Math.floor(mins / 60);
  var days  = Math.floor(hours / 24);
  if (mins < 2)   return 'à l\'instant';
  if (mins < 60)  return 'il y a ' + mins + ' min';
  if (hours < 24) return 'il y a ' + hours + 'h';
  return 'il y a ' + days + ' j';
}

// ─── Fetch helper (uses Supabase token if available) ──────────────────────
async function apiFetch(path) {
  var sb = window.__supabase;
  var token = null;
  if (sb) { var sess = await sb.auth.getSession(); token = sess.data?.session?.access_token; }
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch('/api' + path, { headers });
}

const formatDateFr = () => {
  const now = new Date();
  const days = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  return `${days[now.getDay()]} · ${now.getDate()} ${months[now.getMonth()]} · ${h}:${m}`;
};

// ═══ DASHBOARD / HOME ══════════════════════════════════════════════════════
const DashboardScreen = ({ onNav, onCreateFromSource, authUser }) => {
  const fullName = authUser?.user_metadata?.full_name;
  const email = authUser?.email || '';
  const firstName = fullName
    ? fullName.split(' ')[0]
    : email.split('@')[0] || null;
  const greeting = firstName
    ? `Bonjour ${firstName.charAt(0).toUpperCase() + firstName.slice(1)}.`
    : 'Bonjour.';

  // news state now managed by HotFeedWidget via SSE

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <div className="page-hello-row">
            <span className="page-hello-hour">{formatDateFr()}</span>
          </div>
          <h1 className="page-title">{greeting}</h1>
          <p className="page-subtitle">
            7 posts attendent ton œil, 3 actus dans ton univers pourraient devenir des publications.
          </p>
        </div>
        <div className="page-header-actions">
          <Btn variant="ghost" icon="calendar">Voir le calendrier</Btn>
          <Btn variant="primary" icon="sparkle" onClick={() => onNav('generate')}>Générer un post</Btn>
        </div>
      </div>

      <HotFeedWidget onCreateFromSource={onCreateFromSource}/>

      {/* KPI strip */}
      <div className="dash-kpis">
        <KpiCard label="Publiés ce mois" value="18" delta="+4" kind="positive" sub="vs. septembre"/>
        <KpiCard label="En attente de validation" value="7" sub="dont 2 programmés demain" accent/>
        <KpiCard label="Engagement moyen" value="6.4%" delta="+1.2 pt" kind="positive" sub="14 derniers posts"/>
        <KpiCard label="Cohérence de marque" value="94" sub="score Forje" chromatic/>
      </div>

      <div className="dash-grid">
        {/* LEFT — main column */}
        <div className="dash-main">
          {/* Queue preview placeholder — hot feed moved to top banner */}

          {/* Queue preview */}
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">À valider avant demain 18h</div>
                <div className="card-subtitle">File de validation · 7 posts en attente</div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => onNav('queue')}>Tout voir →</Btn>
            </div>
            <div className="queue-preview">
              <QueuePreviewItem
                when="Mardi · 08:00"
                type="Citation"
                title="« L'excellence, c'est la répétition faite belle. »"
                swatch="quote"
                status="draft"
              />
              <QueuePreviewItem
                when="Mardi · 19:30"
                type="Coulisses"
                title="Séance de piquage — Noémie sur la machine n°3"
                swatch="bts"
                status="ready"
              />
              <QueuePreviewItem
                when="Mercredi · 10:00"
                type="Actu"
                title="Notre atelier accueille l'émission Artisans de France"
                swatch="news"
                status="draft"
              />
              <QueuePreviewItem
                when="Mercredi · 18:00"
                type="Produit"
                title="Le sac Margot — édition camel, en ligne jeudi"
                swatch="product"
                status="ready"
              />
            </div>
          </section>
        </div>

        {/* RIGHT — sidebar column */}
        <div className="dash-side">
          {/* Cadence */}
          <section className="card card-pad">
            <div className="side-section-title">
              <AppIcon name="target" size={14}/>
              Cadence de la semaine
            </div>
            <div className="cadence-days">
              {[
                ['L',2,2],['M',1,1],['Me',1,2],['J',0,1],['V',1,1],['S',0,0],['D',1,1]
              ].map(([d,done,plan],i) => (
                <div key={i} className="cadence-day">
                  <div className="cadence-bar">
                    {[...Array(Math.max(plan,1))].map((_,j) => (
                      <div key={j} className={`cadence-pip ${j < done ? 'done' : j < plan ? 'plan' : ''}`}/>
                    ))}
                  </div>
                  <div className="cadence-label">{d}</div>
                </div>
              ))}
            </div>
            <div className="cadence-foot">
              <span className="cadence-stat"><b>6</b> posts programmés / 7 prévus</span>
            </div>
          </section>


          {/* Brand health */}
          <section className="card card-pad">
            <div className="side-section-title">
              <AppIcon name="palette" size={14}/>
              Santé de marque
            </div>
            <div className="brand-health">
              <HealthRow label="Ton de voix" score={96} desc="Très cohérent"/>
              <HealthRow label="Palette visuelle" score={91} desc="Camel + ivoire dominants"/>
              <HealthRow label="Rythme de parole" score={88} desc="7.2 posts / semaine"/>
              <HealthRow label="Diversité de format" score={72} desc="Plus de coulisses ?" warn/>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

// ═══ HOT FEED WIDGET — Trading-style live news ═════════════════════════════

const HotFeedWidget = ({ onCreateFromSource }) => {
  var [items, setItems]           = useState([]);
  var [trending, setTrending]     = useState([]);
  var [loading, setLoading]       = useState(true);
  var [countdown, setCountdown]   = useState(180);
  var [animKey, setAnimKey]       = useState(0);
  var [connected, setConnected]   = useState(false);
  var timerRef = useRef(null);

  useEffect(function() {
    var clientId = window.__activeClientId;
    if (!clientId) { setLoading(false); return; }

    var es = new EventSource('/api/hot/stream?compte_id=' + clientId);

    es.onopen = function() { setConnected(true); };

    es.onmessage = function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.error || !data.items) return;
        setItems(data.items);
        setTrending(data.trending || []);
        setLoading(false);
        setCountdown(180);
        setAnimKey(function(k) { return k + 1; });
      } catch {}
    };

    es.onerror = function() {
      setConnected(false);
      setLoading(false);
    };

    timerRef.current = setInterval(function() {
      setCountdown(function(c) { return c > 0 ? c - 1 : 0; });
    }, 1000);

    return function() { es.close(); clearInterval(timerRef.current); };
  }, []);

  var mins = String(Math.floor(countdown / 60)).padStart(2, '0');
  var secs = String(countdown % 60).padStart(2, '0');

  return (
    <div className="hot-feed">
      {/* ── Status bar ── */}
      <div className="hot-status-bar">
        <div className="hot-live-dot">
          <span className={`hot-dot ${connected ? 'hot-dot--live' : 'hot-dot--off'}`}/>
          <span className="hot-live-label">{connected ? 'LIVE' : 'CONNECTING'}</span>
        </div>

        <div className="hot-ticker-wrap">
          {trending.length > 0 && (
            <div className="hot-ticker-track">
              {[...trending, ...trending].map(function(t, i) {
                return (
                  <span key={i} className="hot-ticker-kw">
                    <span className="hot-ticker-hash">#</span>{t.kw}
                    <span className="hot-ticker-count">{t.count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="hot-countdown">
          <span className="hot-countdown-icon">↺</span>
          <span className="hot-countdown-val">{mins}:{secs}</span>
        </div>
      </div>

      {/* ── Cards ── */}
      <div className="hot-cards" key={animKey}>
        {loading && [0,1,2,3,4].map(function(i) { return <HotCardSkeleton key={i} rank={i}/>; })}

        {!loading && items.length === 0 && (
          <div className="hot-empty">
            Veille en cours — les actus chaudes apparaîtront ici automatiquement.
          </div>
        )}

        {!loading && items.map(function(item, i) {
          var raw    = item.news_raw || {};
          var titre  = raw.titre || raw.title || '';
          var desc   = raw.description || '';
          var source = raw.source || 'Veille';
          var buzz   = item.buzz_score || item.score_total || 0;
          var ageMin = item.age_min || 0;
          var flag   = item.flag || 'faible_priorite';
          var fenetre = item.fenetre_code_couleur || '⚫';
          var isUrgent = flag === 'urgent' || (item.alerte_breaking);
          var isWarm   = flag === 'a_traiter';
          var angle  = item.angle || item.pourquoi_ce_score || '';

          return (
            <HotCard
              key={item.id || i}
              rank={i}
              buzz={buzz}
              flag={flag}
              source={source}
              titre={titre}
              blurb={desc ? desc.slice(0, 100) + (desc.length > 100 ? '…' : '') : ''}
              ageMin={ageMin}
              fenetre={fenetre}
              angle={angle}
              isUrgent={isUrgent}
              isWarm={isWarm}
              alerte={item.alerte_breaking}
              format={item.format_suggere}
              onCreate={function() {
                onCreateFromSource({ title: titre, url: raw.url || '', text: desc });
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

const HotCard = ({ rank, buzz, flag, source, titre, blurb, ageMin, fenetre, angle, isUrgent, isWarm, alerte, format, onCreate }) => {
  var pct = Math.min(100, Math.round((buzz / 10) * 100));
  var ageLabel = ageMin < 60 ? ageMin + ' min' : Math.floor(ageMin / 60) + 'h' + (ageMin % 60 > 0 ? String(ageMin % 60).padStart(2,'0') : '');

  var cardClass = 'hot-card'
    + (isUrgent ? ' hot-card--urgent' : '')
    + (isWarm   ? ' hot-card--warm'   : '');

  return (
    <div className={cardClass} style={{ '--anim-delay': (rank * 60) + 'ms' }}>
      <div className="hot-card-rank">
        {isUrgent && <span className="hot-rank-pulse"/>}
        <span className="hot-rank-num">#{rank + 1}</span>
      </div>

      <div className="hot-card-body">
        <div className="hot-card-meta">
          <span className="hot-card-source">{source}</span>
          <span className={`hot-card-flag hot-flag--${flag}`}>
            {flag === 'urgent' ? 'URGENT' : flag === 'a_traiter' ? 'À TRAITER' : 'VEILLE'}
          </span>
          {format && <span className="hot-card-format">{format}</span>}
        </div>

        <div className="hot-card-titre">{titre}</div>

        {angle && (
          <div className="hot-card-angle">→ {angle}</div>
        )}

        <div className="hot-card-score-row">
          <div className="hot-score-bar-wrap">
            <div className="hot-score-bar" style={{ '--pct': pct + '%' }}/>
          </div>
          <span className="hot-score-val">{buzz.toFixed(1)}</span>
          <span className="hot-card-age">{fenetre} {ageLabel}</span>
        </div>
      </div>

      <button className="hot-card-cta" onClick={onCreate}>
        Transformer →
      </button>
    </div>
  );
};

const HotCardSkeleton = ({ rank }) => (
  <div className="hot-card hot-card--skeleton" style={{ '--anim-delay': (rank * 60) + 'ms' }}>
    <div className="hot-card-rank">
      <span className="hot-rank-num">#{rank + 1}</span>
    </div>
    <div className="hot-card-body">
      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        <div className="skeleton" style={{ width:70, height:11, borderRadius:3 }}/>
        <div className="skeleton" style={{ width:55, height:11, borderRadius:3 }}/>
      </div>
      <div className="skeleton" style={{ width:'75%', height:14, borderRadius:4, marginBottom:6 }}/>
      <div className="skeleton" style={{ width:'50%', height:11, borderRadius:3, marginBottom:10 }}/>
      <div className="skeleton" style={{ width:'100%', height:4, borderRadius:2 }}/>
    </div>
  </div>
);

// ─── Subcomponents ─────────────────────────────────────────────────────────
const KpiCard = ({ label, value, delta, kind, sub, accent, chromatic }) => (
  <div className={`kpi-card ${accent ? 'kpi-accent' : ''} ${chromatic ? 'kpi-chromatic' : ''}`}>
    <div className="kpi-label">{label}</div>
    <div className="kpi-value-row">
      <div className="kpi-value">{value}</div>
      {delta && (
        <span className={`kpi-delta ${kind === 'positive' ? 'pos' : 'neg'}`}>
          <AppIcon name="arrowUp" size={10}/> {delta}
        </span>
      )}
    </div>
    <div className="kpi-sub">{sub}</div>
  </div>
);

const SkeletonNewsRow = () => (
  <div className="news-row" style={{ gap:8 }}>
    <div className="news-row-meta" style={{ display:'flex', gap:8, marginBottom:8 }}>
      <div className="skeleton" style={{ width:80, height:12, borderRadius:4 }}/>
      <div className="skeleton" style={{ width:50, height:12, borderRadius:4 }}/>
      <div className="skeleton" style={{ width:60, height:12, borderRadius:4 }}/>
    </div>
    <div className="skeleton" style={{ width:'70%', height:14, borderRadius:4, marginBottom:6 }}/>
    <div className="skeleton" style={{ width:'90%', height:11, borderRadius:4, marginBottom:4 }}/>
    <div className="skeleton" style={{ width:'60%', height:11, borderRadius:4, marginBottom:12 }}/>
    <div style={{ display:'flex', gap:8 }}>
      <div className="skeleton" style={{ width:120, height:28, borderRadius:6 }}/>
      <div className="skeleton" style={{ width:90, height:28, borderRadius:6 }}/>
    </div>
  </div>
);

const NewsRow = ({ source, time, topic, headline, blurb, angle, onCreate }) => (
  <div className="news-row">
    <div className="news-row-meta">
      <span className="news-source">{source}</span>
      <span className="news-time">{time}</span>
      <span className="tag news-topic">{topic}</span>
    </div>
    <div className="news-headline">{headline}</div>
    <div className="news-blurb">{blurb}</div>
    <div className="news-angle">
      <AppIcon name="bolt" size={12}/>
      <span><b>Angle Forje</b> — {angle}</span>
    </div>
    <div className="news-actions">
      <Btn variant="accent" size="sm" icon="sparkle" onClick={onCreate}>Transformer en post</Btn>
      <Btn variant="ghost" size="sm" icon="archive">Garder pour plus tard</Btn>
      <Btn variant="ghost" size="sm" icon="trash">Pas pour nous</Btn>
    </div>
  </div>
);

const QueuePreviewItem = ({ when, type, title, swatch, status }) => (
  <div className="queue-preview-row">
    <div className={`queue-swatch queue-swatch--${swatch}`}>
      <AppIcon name={swatch === 'quote' ? 'quote' : swatch === 'bts' ? 'image' : swatch === 'news' ? 'news' : 'layers'} size={14}/>
    </div>
    <div className="queue-preview-meta">
      <div className="queue-preview-when">{when} · <span className="queue-preview-type">{type}</span></div>
      <div className="queue-preview-title">{title}</div>
    </div>
    <span className={`tag tag-dot ${status === 'ready' ? 'tag-success' : 'tag-warn'}`}>
      {status === 'ready' ? 'Prêt' : 'Brouillon'}
    </span>
    <Btn variant="ghost" size="sm">Ouvrir</Btn>
  </div>
);

const HealthRow = ({ label, score, desc, warn }) => (
  <div className="health-row">
    <div className="health-row-top">
      <span className="health-label">{label}</span>
      <span className={`health-score ${warn ? 'warn' : ''}`}>{score}</span>
    </div>
    <div className="health-bar"><div className={`health-fill ${warn ? 'warn' : ''}`} style={{width: `${score}%`}}/></div>
    <div className="health-desc">{desc}</div>
  </div>
);

Object.assign(window, { DashboardScreen });
