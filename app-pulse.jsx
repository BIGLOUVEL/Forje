/* global React, AppIcon */
var { useState, useEffect, useRef } = React;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAge(dateStr) {
  if (!dateStr) return '—';
  var ts = dateStr.endsWith('Z') || /[+\-]\d{2}:?\d{2}$/.test(dateStr)
    ? dateStr : dateStr + 'Z';
  var min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1)  return 'maintenant';
  if (min < 60) return min + 'min';
  return Math.floor(min / 60) + 'h' + (min % 60 > 0 ? String(min % 60).padStart(2,'0') : '');
}

function pad(n) { return String(Math.floor(n)).padStart(2,'0'); }
function fmtCountdown(s) { return pad(s / 60) + ':' + pad(s % 60); }

// ═══ PULSE SCREEN ════════════════════════════════════════════════════════════
var PulseScreen = function({ onCreateFromSource }) {
  var [items,     setItems]     = useState([]);
  var [trending,  setTrending]  = useState([]);
  var [selected,  setSelected]  = useState(null);
  var [connected, setConnected] = useState(false);
  var [loading,   setLoading]   = useState(true);
  var [countdown, setCountdown] = useState(180);
  var [lastTs,    setLastTs]    = useState(null);
  var [flashIds,  setFlashIds]  = useState(new Set());
  var timerRef = useRef(null);
  var prevItemsRef = useRef([]);

  useEffect(function() {
    var clientId = window.__activeClientId;
    if (!clientId) { setLoading(false); return; }

    var es = new EventSource('/api/hot/stream?compte_id=' + clientId);

    es.onopen = function() { setConnected(true); };

    es.onmessage = function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.error || !data.items) return;

        // Detect changed rows for flash animation
        var prevIds = new Set(prevItemsRef.current.map(function(i) { return i.id; }));
        var newFlash = new Set();
        data.items.forEach(function(item) {
          if (!prevIds.has(item.id)) newFlash.add(item.id);
        });
        if (newFlash.size > 0) {
          setFlashIds(newFlash);
          setTimeout(function() { setFlashIds(new Set()); }, 1200);
        }
        prevItemsRef.current = data.items;

        setItems(data.items);
        setTrending(data.trending || []);
        setLoading(false);
        setLastTs(data.ts);
        setCountdown(180);

        // Auto-select first if none selected
        setSelected(function(sel) {
          return sel || (data.items[0]?.id ?? null);
        });
      } catch(err) { console.error('[Pulse SSE]', err); }
    };

    es.onerror = function() { setConnected(false); setLoading(false); };

    timerRef.current = setInterval(function() {
      setCountdown(function(c) { return c > 0 ? c - 1 : 0; });
    }, 1000);

    return function() { es.close(); clearInterval(timerRef.current); };
  }, []);

  var activeItem = items.find(function(i) { return i.id === selected; }) || items[0] || null;

  return (
    <div className="pulse-root">

      {/* ── Top bar ── */}
      <div className="pulse-topbar">
        <div className="pulse-topbar-left">
          <span className={`pulse-live-dot ${connected ? 'is-live' : ''}`}/>
          <span className="pulse-live-label">{connected ? 'LIVE' : 'OFFLINE'}</span>
          <span className="pulse-topbar-sep">·</span>
          <span className="pulse-topbar-title">PULSE TERMINAL · Veille temps réel</span>
        </div>

        <div className="pulse-ticker-wrap">
          {trending.length > 0 && (
            <div className="pulse-ticker-track">
              {[...trending, ...trending].map(function(t, i) {
                return (
                  <span key={i} className="pulse-ticker-kw">
                    <span className="pulse-ticker-hash">#</span>{t.kw}
                    <span className="pulse-ticker-vol">{t.count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="pulse-topbar-right">
          <span className="pulse-refresh-icon">↺</span>
          <span className="pulse-refresh-val">{fmtCountdown(countdown)}</span>
          {lastTs && <span className="pulse-topbar-ts">sync {new Date(lastTs).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>}
        </div>
      </div>

      {/* ── 3-col grid ── */}
      <div className="pulse-grid">

        {/* COL 1 — Ranking */}
        <div className="pulse-col pulse-col--rank">
          <div className="pulse-col-head">
            <span className="pulse-col-label">WATCHLIST</span>
            <span className="pulse-col-sub">{items.length} signaux · {fmtCountdown(countdown)}</span>
          </div>

          <div className="pulse-rank-list">
            {loading && [0,1,2,3,4].map(function(i) {
              return <PulseRowSkel key={i} rank={i}/>;
            })}

            {!loading && items.length === 0 && (
              <div className="pulse-empty">
                Aucune actu scorée.<br/>Lance un rafraîchissement depuis Sources & veille.
              </div>
            )}

            {!loading && items.map(function(item, idx) {
              var raw   = item.news_raw || {};
              var buzz  = item.buzz_score || item.score_total || 0;
              var flag  = item.flag || 'faible_priorite';
              var isHot = flag === 'urgent' || item.alerte_breaking;
              var isWarm= flag === 'a_traiter';
              var ageMin= item.age_min || 0;
              var isNew = flashIds.has(item.id);
              var isSel = item.id === selected || (!selected && idx === 0);

              return (
                <div
                  key={item.id || idx}
                  className={'pulse-row' + (isHot?' pulse-row--hot':'') + (isWarm?' pulse-row--warm':'') + (isSel?' pulse-row--selected':'') + (isNew?' pulse-row--flash':'')}
                  onClick={function() { setSelected(item.id); }}
                >
                  <div className="pulse-row-rank">
                    {isHot && <span className="pulse-hot-dot"/>}
                    <span className="pulse-row-num">#{idx+1}</span>
                  </div>

                  <div className="pulse-row-body">
                    <div className="pulse-row-meta">
                      <span className="pulse-row-source">{raw.source || '—'}</span>
                      <span className="pulse-row-age">{fmtAge(raw.published_at || item.created_at)}</span>
                      <span className={'pulse-row-flag pulse-flag--' + flag}>
                        {isHot ? 'URGENT' : isWarm ? 'CHAUD' : ''}
                      </span>
                    </div>
                    <div className="pulse-row-title">{raw.titre || '—'}</div>
                    <div className="pulse-row-bar">
                      <div className="pulse-bar-track">
                        <div className="pulse-bar-fill" style={{ width: Math.min(100, buzz*10)+'%', '--buzz': buzz }}/>
                      </div>
                      <span className={'pulse-row-score' + (isHot?' pulse-score--hot':isWarm?' pulse-score--warm':'')}>
                        {buzz.toFixed(2)}
                        <span className="pulse-score-arrow">{buzz >= 7 ? ' ▲' : buzz >= 4 ? ' →' : ' ▼'}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COL 2 — Article detail */}
        <div className="pulse-col pulse-col--detail">
          <div className="pulse-col-head">
            <span className="pulse-col-label">TRADE TICKET</span>
            {activeItem && <span className="pulse-col-sub">{(activeItem.news_raw || {}).source || ''}</span>}
          </div>

          {!activeItem && (
            <div className="pulse-empty" style={{padding:'60px 24px'}}>
              Sélectionne une actu à gauche
            </div>
          )}

          {activeItem && (
            <PulseDetail
              item={activeItem}
              onForge={function() {
                var raw = activeItem.news_raw || {};
                var recap = [
                  raw.titre || '',
                  'Source : ' + (raw.source || '—') + ' · ' + fmtAge(raw.published_at || activeItem.created_at),
                  raw.description || '',
                  activeItem.pourquoi_ce_score ? 'Contexte : ' + activeItem.pourquoi_ce_score : '',
                  activeItem.angle ? 'Angle : ' + activeItem.angle : '',
                  activeItem.caption ? '\nCaption suggérée :\n' + activeItem.caption : '',
                ].filter(Boolean).join('\n');

                if (window.__goToGenerate) {
                  window.__goToGenerate({ title: raw.titre || '', text: recap, url: raw.url || '', source: raw.source || '' });
                } else if (onCreateFromSource) {
                  onCreateFromSource({ title: raw.titre || '', url: raw.url || '', text: raw.description || '' });
                }
              }}
            />
          )}
        </div>

        {/* COL 3 — Trending */}
        <div className="pulse-col pulse-col--trends">
          <div className="pulse-col-head">
            <span className="pulse-col-label">NICHE · PERF</span>
            <span className="pulse-col-sub">dernière heure</span>
          </div>

          <TrendingPanel trending={trending}/>
        </div>

      </div>
    </div>
  );
};

// ── Article detail ────────────────────────────────────────────────────────────
var PulseDetail = function({ item, onForge }) {
  var raw   = item.news_raw || {};
  var buzz  = item.buzz_score || item.score_total || 0;
  var flag  = item.flag || '';
  var isHot = flag === 'urgent' || item.alerte_breaking;
  var isWarm= flag === 'a_traiter';
  var scoreColor = isHot ? '#ff4d4d' : isWarm ? '#f59e0b' : 'var(--p-fg-3)';

  return (
    <div className="pulse-detail">
      {/* Score + flag */}
      <div className="pulse-detail-score-row">
        <span className="pulse-detail-source">{raw.source || '—'}</span>
        <span className="pulse-detail-age">{fmtAge(raw.published_at || item.created_at)}</span>
        <span className="pulse-detail-score" style={{ color: scoreColor }}>{buzz.toFixed(1)}<span className="pulse-detail-score-denom">/10</span></span>
      </div>

      {/* Titre */}
      <div className="pulse-detail-titre">{raw.titre || '—'}</div>

      {/* Corps */}
      {raw.description && (
        <div className="pulse-detail-body">{raw.description}</div>
      )}

      {/* Analyse */}
      {(item.pourquoi_ce_score || item.angle) && (
        <div className="pulse-analysis">
          {item.pourquoi_ce_score && (
            <div className="pulse-analysis-row">
              <span className="pulse-analysis-lbl">WHY</span>
              <span>{item.pourquoi_ce_score}</span>
            </div>
          )}
          {item.angle && (
            <div className="pulse-analysis-row">
              <span className="pulse-analysis-lbl">ANGLE</span>
              <span>{item.angle}</span>
            </div>
          )}
        </div>
      )}

      {/* Meta */}
      <div className="pulse-detail-meta">
        {item.format_suggere && <span className="pulse-chip">{item.format_suggere}</span>}
        {item.timing_optimal && <span className="pulse-chip">{item.timing_optimal}</span>}
        {raw.url && (
          <a className="pulse-chip pulse-chip--link" href={raw.url} target="_blank" rel="noopener noreferrer">
            ↗ Source
          </a>
        )}
      </div>

      {/* CTA */}
      <button className="pulse-forge-btn" onClick={onForge}>
        <span className="pulse-forge-icon">⚡</span>
        <span>FORGER CE POST</span>
        <span className="pulse-forge-score">{buzz.toFixed(2)}</span>
      </button>
    </div>
  );
};

// ── Trending panel ────────────────────────────────────────────────────────────
var TrendingPanel = function({ trending }) {
  if (!trending.length) {
    return <div className="pulse-empty" style={{padding:'40px 20px'}}>Calcul des tendances…</div>;
  }

  var max = trending[0]?.count || 1;

  return (
    <div className="pulse-trends-list">
      {trending.map(function(t, i) {
        var pct = Math.round((t.count / max) * 100);
        var heat = pct > 80 ? 'hot' : pct > 50 ? 'warm' : 'cool';
        return (
          <div key={i} className={'pulse-trend-row pulse-trend--' + heat}>
            <div className="pulse-trend-left">
              <span className="pulse-trend-rank">#{i+1}</span>
              <span className="pulse-trend-kw">#{t.kw}</span>
            </div>
            <div className="pulse-trend-right">
              <div className="pulse-trend-bar-wrap">
                <div className="pulse-trend-bar" style={{ width: pct + '%' }}/>
              </div>
              <span className="pulse-trend-vol">{t.count}</span>
              <span className="pulse-trend-icon">
                {heat === 'hot' ? '🔥' : heat === 'warm' ? '▲' : '→'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Skeleton row ──────────────────────────────────────────────────────────────
var PulseRowSkel = function({ rank }) {
  return (
    <div className="pulse-row pulse-row--skel" style={{ '--skel-delay': (rank * 80) + 'ms' }}>
      <div className="pulse-row-rank">
        <span className="pulse-row-num">#{rank+1}</span>
      </div>
      <div className="pulse-row-body">
        <div style={{ display:'flex', gap:8, marginBottom:6 }}>
          <div className="p-skel" style={{ width:60, height:10 }}/>
          <div className="p-skel" style={{ width:40, height:10 }}/>
        </div>
        <div className="p-skel" style={{ width:'78%', height:13, marginBottom:8 }}/>
        <div className="p-skel" style={{ width:'100%', height:3 }}/>
      </div>
    </div>
  );
};

Object.assign(window, { PulseScreen });
