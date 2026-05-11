/* global React, AppIcon, Btn */
var { useState, useEffect } = React;

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

  const [news, setNews]               = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);

  useEffect(() => {
    var clientId = window.__activeClientId;
    if (!clientId) {
      setNewsLoading(false);
      return;
    }
    apiFetch('/scoring/board?compte_id=' + clientId + '&limit=5')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        // board = scored news (non-breaking), breaking = alertes
        var items = [].concat(data.breaking || [], data.board || []);
        setNews(items.slice(0, 5));
        setNewsLoading(false);
      })
      .catch(function() { setNewsLoading(false); });
  }, []);

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
          {/* Actus → Post */}
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Dans ton univers, aujourd'hui</div>
                <div className="card-subtitle">3 actus que ta veille a repérées — clique pour transformer en post</div>
              </div>
              <Btn variant="ghost" size="sm" icon="settings">Sources</Btn>
            </div>
            <div className="news-list">
              {newsLoading && (
                <>
                  <SkeletonNewsRow/>
                  <SkeletonNewsRow/>
                  <SkeletonNewsRow/>
                </>
              )}
              {!newsLoading && news.length === 0 && (
                <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--app-fg-4)', fontSize:13 }}>
                  Aucune actu aujourd'hui — tes sources sont en cours de veille.
                </div>
              )}
              {!newsLoading && news.map(function(item, i) {
                var raw = item.news_raw || {};
                var titre    = raw.titre || raw.title || '';
                var desc     = raw.description || '';
                var blurb    = desc ? desc.slice(0, 150) + (desc.length > 150 ? '…' : '') : titre.slice(0, 120) + '…';
                var source   = raw.source || 'Veille';
                var dateStr  = raw.published_at || item.created_at || '';
                var angle    = item.angle || '';
                return (
                  <NewsRow
                    key={item.id || i}
                    source={source}
                    time={timeAgo(dateStr)}
                    topic={item.flag === 'urgent' ? 'Urgent' : item.format_suggere || 'Actu'}
                    headline={titre}
                    blurb={blurb}
                    angle={angle}
                    onCreate={() => onCreateFromSource({ title: titre, url: raw.url || '', text: desc })}
                  />
                );
              })}
            </div>
          </section>

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

          {/* Best performing */}
          <section className="card">
            <div className="card-header" style={{padding:'14px 18px'}}>
              <div className="card-title" style={{fontSize:13}}>Meilleur post — 14 derniers jours</div>
            </div>
            <div className="best-post">
              <div className="best-post-visual best-post-visual--camel">
                <div className="best-post-visual-label">“Trois générations de cuir.”</div>
              </div>
              <div className="best-post-stats">
                <div className="best-stat"><AppIcon name="heart" size={12}/><b>1 284</b> likes</div>
                <div className="best-stat"><AppIcon name="eye" size={12}/><b>18.2k</b> vues</div>
                <div className="best-stat"><AppIcon name="trend" size={12}/><b>+312%</b> vs moyenne</div>
              </div>
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
