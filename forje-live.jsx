/* global React, Icon, Sparkle */
/* ═══════════════════════════════════════════════════════════════════════
   FORJE LANDING — SECTIONS SIGNATURE
   3. Board de veille LIVE   4. Démo de génération INTERACTIVE
   Données lazy-loadées à l'approche du viewport ; funnel tracké.
   ═══════════════════════════════════════════════════════════════════════ */
const { useState: useSL, useEffect: useEL, useRef: useRL, useCallback: useCL } = React;

// ───── Analytics funnel ─────────────────────────────────────────────────
window.__forjeTrack = (event, props) => {
  try {
    const body = JSON.stringify({ event, props: props || {} });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/demo/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/demo/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch (e) { /* le tracking ne casse jamais la page */ }
};

// ───── Presets démo (miroir des configs serveur routes/demo.js) ─────────
const DEMO_PRESETS = [
  {
    key: 'ballon_bleu',
    name: 'Ballon Bleu',
    emoji: '⚽',
    topic: 'football',
    handle: '@ballonbleu',
    palette: ['#0A1E5E', '#1447B8', '#2E7BE8', '#EEF4FF'],
    font: 'Archivo Black',
    mood: 'direct · graphique · terrain',
    logoLetter: 'B',
    logoBg: 'linear-gradient(140deg, #1447B8, #2E7BE8)',
    samples: [
      { bg: 'linear-gradient(165deg, #0A1E5E, #1447B8 70%, #2E7BE8)', title: 'Le Clásico en 5 chiffres' },
      { bg: 'linear-gradient(165deg, #081A4E, #0E2F86)', title: '« On jouera pour gagner »' },
    ],
  },
  {
    key: 'frame',
    name: 'Frame',
    emoji: '📰',
    topic: 'médias & culture',
    handle: '@frame.media',
    palette: ['#0D0B09', '#2A1D0C', '#C8943A', '#F5EEDC'],
    font: 'Playfair Display',
    mood: 'éditorial · contrasté · précis',
    logoLetter: 'F',
    logoBg: 'linear-gradient(140deg, #2A1D0C, #C8943A)',
    samples: [
      { bg: 'linear-gradient(165deg, #0D0B09, #2A1D0C 70%, #4A3210)', title: 'Le streaming rebat les cartes' },
      { bg: 'linear-gradient(165deg, #14100A, #3A2A10)', title: '« L\'info mérite mieux »' },
    ],
  },
];
const presetByKey = (k) => DEMO_PRESETS.find(p => p.key === k) || DEMO_PRESETS[0];

// ───── Helpers ──────────────────────────────────────────────────────────
const relTime = (iso) => {
  const s = Math.max(5, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'il y a ' + s + ' s';
  const m = Math.floor(s / 60);
  if (m < 60) return 'il y a ' + m + ' min';
  const h = Math.floor(m / 60);
  if (h < 24) return 'il y a ' + h + ' h';
  return 'il y a ' + Math.floor(h / 24) + ' j';
};

// Lazy-load : déclenche onVisible ~400px avant l'entrée dans le viewport.
const useNearViewport = (ref, onVisible) => {
  useEL(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { onVisible(); obs.disconnect(); }
    }, { rootMargin: '400px 0px' });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
};

// ───── 3. BOARD DE VEILLE LIVE ──────────────────────────────────────────
const LiveBoard = () => {
  const sectionRef = useRL(null);
  const [profiles, setProfiles] = useSL(null);   // { ballon_bleu: [...], frame: [...] }
  const [tab, setTab] = useSL('ballon_bleu');
  const [, forceTick] = useSL(0);                 // re-render → timestamps relatifs à jour
  const knownIds = useRL(new Set());
  const freshIds = useRL(new Set());
  const started = useRL(false);

  const fetchBoard = useCL(async () => {
    try {
      const res = await fetch('/api/demo/veille');
      if (!res.ok) return;
      const data = await res.json();
      const next = {};
      for (const p of data.profiles || []) {
        next[p.key] = p.items || [];
        for (const it of p.items || []) {
          if (knownIds.current.size && !knownIds.current.has(it.id)) freshIds.current.add(it.id);
          knownIds.current.add(it.id);
        }
      }
      setProfiles(next);
      // l'animation d'entrée ne joue qu'une fois par actu
      setTimeout(() => { freshIds.current.clear(); }, 4000);
    } catch (e) { /* réseau : on garde l'état courant */ }
  }, []);

  const timersRef = useRL([]);
  const start = useCL(() => {
    if (started.current) return;
    started.current = true;
    fetchBoard();
    timersRef.current.push(setInterval(fetchBoard, 30000));
    timersRef.current.push(setInterval(() => forceTick(n => n + 1), 20000));
    window.__forjeTrack?.('demo_board_viewed');
  }, [fetchBoard]);

  useNearViewport(sectionRef, start);
  useEL(() => () => timersRef.current.forEach(clearInterval), []);

  const forgePost = (item) => {
    window.__forjeTrack?.('demo_board_forge_clicked', { news_id: item.id, preset: tab });
    window.dispatchEvent(new CustomEvent('forje-demo-select', { detail: { preset: tab, newsId: item.id } }));
    document.getElementById('demo-generate')?.scrollIntoView({ behavior: 'smooth' });
  };

  const activePreset = presetByKey(tab);
  const items = profiles?.[tab] || [];

  return (
    <section className="section section-live" id="demo-live" ref={sectionRef}>
      <div className="section-label"><span className="bar" /> Veille · En direct</div>
      <h2>Pendant que tu lis cette page,<br /><span className="accent">Forje surveille l'actu.</span></h2>
      <p className="lede">
        Ce board est branché sur la vraie veille de deux comptes démo.
        Chaque actu est scorée de 0 à 100 selon sa pertinence pour le compte.
      </p>

      <div className="live-board">
        <div className="live-head">
          <div className="live-badge">
            <span className="live-dot" /> EN DIRECT — La veille de {activePreset.name} ({activePreset.topic})
          </div>
          <div className="live-tabs">
            {DEMO_PRESETS.map(p => (
              <button key={p.key} className={'live-tab' + (tab === p.key ? ' active' : '')}
                      onClick={() => { setTab(p.key); window.__forjeTrack?.('demo_board_tab', { preset: p.key }); }}>
                {p.name} {p.emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="live-rows">
          {!profiles && (
            <div className="live-loading">
              {[0, 1, 2, 3].map(i => <div key={i} className="live-skeleton" style={{ animationDelay: (i * 0.12) + 's' }} />)}
            </div>
          )}
          {profiles && items.length === 0 && (
            <div className="live-empty">La veille se réchauffe — reviens dans quelques minutes.</div>
          )}
          {items.map(item => (
            <div key={item.id} className={'live-row' + (freshIds.current.has(item.id) ? ' fresh' : '')}>
              <div className={'live-score' + (item.score >= 80 ? ' hot' : '')}>
                <span className="ls-dot" />{item.score}
              </div>
              <div className="live-main">
                <div className="live-title">{item.title}</div>
                <div className="live-meta">{item.source}</div>
              </div>
              <div className="live-right">
                <span className="live-time">{relTime(item.published_at)}</span>
                {item.score >= 80 && (
                  <button className="live-forge" onClick={() => forgePost(item)}>
                    ⚡ Forger ce post <Icon.Arrow />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ───── 4. DÉMO INTERACTIVE ──────────────────────────────────────────────
// Les 4 étapes affichées pendant la génération — durées estimées réalistes.
const PIPELINE_STEPS = [
  { label: 'Claude analyse l\'actu…', est: 4000 },
  { label: 'Recherche de la photo…', est: 5000 },
  { label: 'Génération du visuel…', est: 13000 },
  { label: 'Composition dans la charte…', est: 7000 },
];

const PresetCard = ({ p, selected, onSelect }) => (
  <button className={'preset-card' + (selected ? ' selected' : '')} onClick={onSelect}>
    <div className="preset-id">
      <div className="preset-logo" style={{ background: p.logoBg }}>{p.logoLetter}</div>
      <div>
        <div className="preset-name">{p.emoji} {p.name}</div>
        <div className="preset-handle">{p.handle}</div>
      </div>
    </div>
    <div className="preset-swatches">
      {p.palette.map((c, i) => <span key={i} style={{ background: c }} />)}
    </div>
    <div className="preset-font">{p.font} · {p.mood}</div>
    <div className="preset-samples">
      {p.samples.map((s, i) => (
        <div key={i} className="preset-sample" style={{ background: s.bg }}>
          <span>{s.title}</span>
        </div>
      ))}
    </div>
    <div className="preset-check">{selected ? '✓ Identité sélectionnée' : 'Choisir ce style'}</div>
  </button>
);

const PipelineProgress = ({ stepIdx, done }) => (
  <div className="pipeline">
    {PIPELINE_STEPS.map((s, i) => {
      const state = done || i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'todo';
      return (
        <div key={i} className={'pipe-step ' + state}>
          <span className="pipe-ico">
            {state === 'done' ? '✓' : state === 'active' ? <span className="pipe-spin" /> : '○'}
          </span>
          <span className="pipe-label">{s.label}</span>
        </div>
      );
    })}
  </div>
);

const InteractiveDemo = () => {
  const sectionRef = useRL(null);
  const [presetKey, setPresetKey] = useSL(null);
  const [news, setNews] = useSL({});             // par preset : items du board (score ≥ 60)
  const [newsId, setNewsId] = useSL(null);
  const [phase, setPhase] = useSL('idle');       // idle | generating | result | limited | busy | error
  const [stepIdx, setStepIdx] = useSL(0);
  const [result, setResult] = useSL(null);       // { image_url, cached, remaining }
  const timers = useRL([]);
  const started = useRL(false);

  const loadNews = useCL(async () => {
    try {
      const res = await fetch('/api/demo/veille');
      if (!res.ok) return;
      const data = await res.json();
      const next = {};
      for (const p of data.profiles || []) next[p.key] = (p.items || []).slice(0, 5);
      setNews(next);
    } catch (e) { /* silencieux */ }
  }, []);

  useNearViewport(sectionRef, () => {
    if (started.current) return;
    started.current = true;
    loadNews();
    window.__forjeTrack?.('demo_section_viewed');
  });

  // Pré-sélection depuis le board ("Forger ce post")
  useEL(() => {
    const handler = (e) => {
      const { preset, newsId: id } = e.detail || {};
      if (preset) selectPreset(preset, true);
      if (id) { setNewsId(id); window.__forjeTrack?.('demo_news_selected', { news_id: id, from: 'board' }); }
      if (!started.current) { started.current = true; loadNews(); }
    };
    window.addEventListener('forje-demo-select', handler);
    return () => window.removeEventListener('forje-demo-select', handler);
  }, []);

  const selectPreset = (key, silent) => {
    setPresetKey(key);
    setNewsId(null);
    if (phase === 'result' || phase === 'error') setPhase('idle');
    if (!silent) window.__forjeTrack?.('demo_preset_selected', { preset: key });
  };

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // L'attente DEVIENT la démo : les étapes avancent sur les durées estimées,
  // et se terminent en accéléré dès que l'API répond.
  const playPipeline = () => {
    setStepIdx(0);
    let acc = 0;
    PIPELINE_STEPS.forEach((s, i) => {
      if (i === 0) return;
      acc += PIPELINE_STEPS[i - 1].est;
      timers.current.push(setTimeout(() => setStepIdx(i), acc));
    });
  };

  const finishPipeline = (payload) => {
    clearTimers();
    // accélère la fin des étapes restantes avant de révéler le post
    setStepIdx(PIPELINE_STEPS.length - 1);
    timers.current.push(setTimeout(() => {
      setResult(payload);
      setPhase('result');
      window.__forjeTrack?.('demo_post_displayed', { preset: presetKey, cached: !!payload.cached });
    }, payload.cached ? 900 : 600));
  };

  const generate = async () => {
    if (!presetKey || !newsId || phase === 'generating') return;
    setPhase('generating');
    setResult(null);
    window.__forjeTrack?.('demo_generate_started', { preset: presetKey, news_id: newsId });
    playPipeline();
    try {
      const res = await fetch('/api/demo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: presetKey, news_id: newsId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.bgImage) {
        // Rendu final identique à l'app : fond serveur + texte composé sur
        // Canvas avec la vraie police du preset (window.__renderActuCanvas).
        let image = data.bgImage;
        try {
          if (window.__renderActuCanvas) image = await window.__renderActuCanvas(data);
        } catch (e) { console.warn('[Demo] rendu canvas:', e.message); }
        return finishPipeline({ image, cached: data.cached, remaining: data.remaining });
      }
      clearTimers();
      if (res.status === 429) { setPhase('limited'); window.__forjeTrack?.('demo_rate_limited'); }
      else if (res.status === 503) { setPhase('busy'); window.__forjeTrack?.('demo_daily_limit'); }
      else setPhase('error');
    } catch (e) {
      clearTimers();
      setPhase('error');
    }
  };

  useEL(() => clearTimers, []);

  const preset = presetKey ? presetByKey(presetKey) : null;
  const items = presetKey ? (news[presetKey] || []) : [];
  const signupCta = (label, event) => (
    <a href="Forje App.html" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}
       onClick={() => window.__forjeTrack?.(event || 'demo_cta_clicked', { preset: presetKey })}>
      {label} <Icon.Arrow />
    </a>
  );

  return (
    <section className="section section-demo" id="demo-generate" ref={sectionRef}>
      <div className="section-label"><span className="bar" /> Démo · Sans compte</div>
      <h2>Essaie. <span className="accent">Là, maintenant, sans compte.</span></h2>
      <p className="lede">
        Choisis une identité, choisis une actu du board — Forje génère un vrai post,
        avec le vrai pipeline. Deux essais par visiteur.
      </p>

      <div className="demo-shell">
        <div className="demo-left">
          <div className="demo-step-title"><span className="demo-step-num">1</span> Choisis un style</div>
          <div className="preset-grid">
            {DEMO_PRESETS.map(p => (
              <PresetCard key={p.key} p={p} selected={presetKey === p.key} onSelect={() => selectPreset(p.key)} />
            ))}
          </div>

          <div className={'demo-news' + (presetKey ? '' : ' disabled')}>
            <div className="demo-step-title"><span className="demo-step-num">2</span> Choisis une actu</div>
            {!presetKey && <div className="demo-hint">Sélectionne d'abord un style au-dessus.</div>}
            {presetKey && items.length === 0 && <div className="demo-hint">Chargement des actus du board…</div>}
            {presetKey && items.map(item => (
              <label key={item.id} className={'news-option' + (newsId === item.id ? ' selected' : '')}>
                <input type="radio" name="demo-news" checked={newsId === item.id}
                       onChange={() => { setNewsId(item.id); window.__forjeTrack?.('demo_news_selected', { news_id: item.id }); }} />
                <span className="news-radio" />
                <span className="news-title">{item.title}</span>
                <span className={'news-score' + (item.score >= 80 ? ' hot' : '')}>{item.score}</span>
              </label>
            ))}
          </div>

          <button className="btn btn-primary btn-lg demo-generate-btn"
                  disabled={!presetKey || !newsId || phase === 'generating'}
                  onClick={generate}>
            ⚡ Générer mon post
          </button>
        </div>

        <div className="demo-right">
          {phase === 'idle' && (
            <div className="demo-placeholder">
              <div className="demo-placeholder-frame">
                <Sparkle size={12} style={{ position: 'absolute', top: 18, right: 22, opacity: 0.7 }} color="#c6d8ff" />
                <span>Ton post apparaîtra ici</span>
              </div>
            </div>
          )}

          {phase === 'generating' && (
            <div className="demo-generating">
              <div className="demo-gen-title">Forje travaille — regarde le pipeline.</div>
              <PipelineProgress stepIdx={stepIdx} done={false} />
            </div>
          )}

          {phase === 'result' && result && (
            <div className="demo-result">
              <div className="demo-post-wrap">
                <img className="demo-post" src={result.image} alt={'Post généré avec l\'identité de ' + preset.name} />
              </div>
              {result.cached && <div className="demo-cached-note">Servi depuis la forge — cette actu avait déjà été générée.</div>}
              <div className="demo-punchline">
                Ça, c'était avec l'identité de <strong>{preset.name}</strong>.<br />Imagine avec la tienne.
              </div>
              {signupCta('Forger mon identité — 50 crédits offerts', 'demo_cta_post_result')}
              {typeof result.remaining === 'number' && result.remaining > 0 && (
                <div className="demo-remaining">Il te reste {result.remaining} essai{result.remaining > 1 ? 's' : ''} démo.</div>
              )}
            </div>
          )}

          {phase === 'limited' && (
            <div className="demo-blocked">
              <div className="demo-blocked-title">Tu as utilisé tes 2 essais démo.</div>
              <p>La suite se passe avec ta propre identité — 50 crédits offerts pour la forger.</p>
              {signupCta('Créer mon compte gratuitement', 'demo_cta_rate_limited')}
            </div>
          )}

          {phase === 'busy' && (
            <div className="demo-blocked">
              <div className="demo-blocked-title">Forte affluence sur la démo.</div>
              <p>Crée ton compte pour générer sans attendre — 50 crédits offerts.</p>
              {signupCta('Créer mon compte gratuitement', 'demo_cta_daily_limit')}
            </div>
          )}

          {phase === 'error' && (
            <div className="demo-blocked">
              <div className="demo-blocked-title">La forge a raté ce coup-ci.</div>
              <p>Réessaie dans quelques secondes — ça arrive, même aux meilleures forges.</p>
              <button className="btn btn-ghost btn-lg" onClick={generate}>Réessayer</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

Object.assign(window, { LiveBoard, InteractiveDemo });
