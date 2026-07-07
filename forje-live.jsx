/* global React, Icon */
/* ═══════════════════════════════════════════════════════════════════════
   FORJE LANDING — SECTIONS SIGNATURE
   3. Board de veille en direct   4. L'outil de génération, en vrai
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

// ───── Médias démo (miroir des configs serveur routes/demo.js) ──────────
const DEMO_MEDIA = [
  {
    key: 'ballon_bleu',
    name: 'Ballon Bleu',
    handle: '@ballonbleu',
    domain: 'Football',
    followers: '42 000 abonnés',
    avatar: 'assets/demo/ballon-bleu-logo.png',
    description: 'Média foot indépendant — l\'actu traitée à chaud, côté terrain et vestiaire. Ligue 1, mercato, sélections.',
    palette: ['#0A1E5E', '#1447B8', '#2E7BE8', '#EEF4FF'],
    font: 'Archivo Black',
    tone: 'direct · graphique · terrain',
    placeholder: 'Mbappé forfait pour le Clásico, blessure à l\'entraînement ce matin…',
  },
  {
    key: 'frame',
    name: 'Frame',
    handle: '@frame.media',
    domain: 'Médias & culture',
    followers: '38 000 abonnés',
    avatar: 'assets/demo/frame-logo.png',
    description: 'Décrypte comment les images et les plateformes façonnent la culture. Cinéma, streaming, presse, création.',
    palette: ['#0D0B09', '#2A1D0C', '#C8943A', '#F5EEDC'],
    font: 'Playfair Display',
    tone: 'éditorial · contrasté · précis',
    placeholder: 'Netflix ouvre sa plateforme aux vidéos de BuzzFeed et Condé Nast…',
  },
];
const mediaByKey = (k) => DEMO_MEDIA.find(m => m.key === k) || DEMO_MEDIA[0];

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

const CheckIcon = (p) => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" {...p}>
    <path d="M2 6.2 4.8 9 10 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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

// Fetch partagé du board (utilisé par les deux sections)
const fetchVeille = async () => {
  const res = await fetch('/api/demo/veille');
  if (!res.ok) return null;
  const data = await res.json();
  const next = {};
  for (const p of data.profiles || []) next[p.key] = p.items || [];
  return next;
};

// ───── 3. BOARD DE VEILLE EN DIRECT ─────────────────────────────────────
const LiveBoard = () => {
  const sectionRef = useRL(null);
  const [profiles, setProfiles] = useSL(null);
  const [tab, setTab] = useSL('ballon_bleu');
  const [, forceTick] = useSL(0);
  const knownIds = useRL(new Set());
  const freshIds = useRL(new Set());
  const started = useRL(false);
  const timersRef = useRL([]);

  const refresh = useCL(async () => {
    try {
      const next = await fetchVeille();
      if (!next) return;
      for (const items of Object.values(next)) {
        for (const it of items) {
          if (knownIds.current.size && !knownIds.current.has(it.id)) freshIds.current.add(it.id);
          knownIds.current.add(it.id);
        }
      }
      setProfiles(next);
      setTimeout(() => { freshIds.current.clear(); }, 4000);
    } catch (e) { /* réseau : on garde l'état courant */ }
  }, []);

  const start = useCL(() => {
    if (started.current) return;
    started.current = true;
    refresh();
    timersRef.current.push(setInterval(refresh, 30000));
    timersRef.current.push(setInterval(() => forceTick(n => n + 1), 20000));
    window.__forjeTrack?.('demo_board_viewed');
  }, [refresh]);

  useNearViewport(sectionRef, start);
  useEL(() => () => timersRef.current.forEach(clearInterval), []);

  const forgePost = (item) => {
    window.__forjeTrack?.('demo_board_forge_clicked', { news_id: item.id, preset: tab });
    window.dispatchEvent(new CustomEvent('forje-demo-select', {
      detail: { preset: tab, newsId: item.id, title: item.title },
    }));
    document.getElementById('demo-generate')?.scrollIntoView({ behavior: 'smooth' });
  };

  const media = mediaByKey(tab);
  const items = profiles?.[tab] || [];

  return (
    <section className="section section-live" id="demo-live" ref={sectionRef}>
      <div className="section-label"><span className="bar" /> Veille</div>
      <h2>Pendant que tu lis cette page,<br /><span className="accent">Forje surveille l'actu.</span></h2>
      <p className="lede">
        Ce board est branché sur la vraie veille de deux comptes démo.
        Chaque actu est scorée de 0 à 100 selon sa pertinence pour le compte.
      </p>

      <div className="live-board">
        <div className="live-head">
          <div className="live-status">
            <span className="live-dot" />
            <span className="live-status-label">En direct</span>
            <span className="live-status-sep">·</span>
            <span>La veille de {media.name} — {media.domain.toLowerCase()}</span>
          </div>
          <div className="live-tabs">
            {DEMO_MEDIA.map(m => (
              <button key={m.key} className={'live-tab' + (tab === m.key ? ' active' : '')}
                      onClick={() => { setTab(m.key); window.__forjeTrack?.('demo_board_tab', { preset: m.key }); }}>
                {m.name}
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
              <div className={'live-score' + (item.score >= 80 ? ' hot' : '')}>{item.score}</div>
              <div className="live-main">
                <div className="live-title">{item.title}</div>
                <div className="live-meta">{item.source} · {relTime(item.published_at)}</div>
              </div>
              {item.score >= 80 && (
                <button className="live-forge" onClick={() => forgePost(item)}>
                  Forger ce post <Icon.Arrow />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ───── 4. L'OUTIL, EN VRAI ──────────────────────────────────────────────
// Les 4 étapes affichées pendant la génération — durées estimées réalistes.
const PIPELINE_STEPS = [
  { label: 'Analyse de l\'actu', est: 4000 },
  { label: 'Recherche de la photo', est: 5000 },
  { label: 'Génération du visuel', est: 13000 },
  { label: 'Composition dans la charte', est: 7000 },
];

const PipelineProgress = ({ stepIdx, done }) => (
  <div className="pipeline">
    {PIPELINE_STEPS.map((s, i) => {
      const state = done || i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'todo';
      return (
        <div key={i} className={'pipe-step ' + state}>
          <span className="pipe-ico">
            {state === 'done' ? <CheckIcon /> : state === 'active' ? <span className="pipe-spin" /> : null}
          </span>
          <span className="pipe-label">{s.label}</span>
        </div>
      );
    })}
  </div>
);

const InteractiveDemo = () => {
  const sectionRef = useRL(null);
  const [mediaKey, setMediaKey] = useSL('ballon_bleu');
  const [news, setNews] = useSL({});
  const [prompt, setPrompt] = useSL('');
  const [sourceNewsId, setSourceNewsId] = useSL(null); // renseigné si le texte vient du board
  const [phase, setPhase] = useSL('idle');             // idle | generating | result | limited | busy | error
  const [stepIdx, setStepIdx] = useSL(0);
  const [result, setResult] = useSL(null);
  const timers = useRL([]);
  const started = useRL(false);

  const loadNews = useCL(async () => {
    try {
      const next = await fetchVeille();
      if (next) setNews(next);
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
      const { preset, newsId: id, title } = e.detail || {};
      if (preset) selectMedia(preset, true);
      if (id) {
        setSourceNewsId(id);
        setPrompt(title || '');
        window.__forjeTrack?.('demo_news_selected', { news_id: id, from: 'board' });
      }
      if (phase === 'result' || phase === 'error') setPhase('idle');
      if (!started.current) { started.current = true; loadNews(); }
    };
    window.addEventListener('forje-demo-select', handler);
    return () => window.removeEventListener('forje-demo-select', handler);
  }, [phase]);

  const selectMedia = (key, silent) => {
    setMediaKey(key);
    setSourceNewsId(null);
    setPrompt('');
    if (phase === 'result' || phase === 'error') setPhase('idle');
    if (!silent) window.__forjeTrack?.('demo_preset_selected', { preset: key });
  };

  const pickNews = (item) => {
    setPrompt(item.title);
    setSourceNewsId(item.id);
    window.__forjeTrack?.('demo_news_selected', { news_id: item.id });
  };

  const onPromptChange = (e) => {
    setPrompt(e.target.value);
    setSourceNewsId(null); // texte modifié → génération sur prompt libre
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
    setStepIdx(PIPELINE_STEPS.length - 1);
    timers.current.push(setTimeout(() => {
      setResult(payload);
      setPhase('result');
      window.__forjeTrack?.('demo_post_displayed', { preset: mediaKey, cached: !!payload.cached });
    }, payload.cached ? 900 : 600));
  };

  const canGenerate = prompt.trim().length >= 10 && phase !== 'generating';

  const generate = async () => {
    if (!canGenerate) return;
    setPhase('generating');
    setResult(null);
    window.__forjeTrack?.('demo_generate_started', { preset: mediaKey, from: sourceNewsId ? 'board' : 'prompt' });
    if (!sourceNewsId) window.__forjeTrack?.('demo_prompt_used', { preset: mediaKey });
    playPipeline();
    try {
      const body = sourceNewsId
        ? { preset: mediaKey, news_id: sourceNewsId }
        : { preset: mediaKey, prompt: prompt.trim() };
      const res = await fetch('/api/demo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.bgImage) {
        // Rendu final identique à l'app : fond serveur + texte composé sur
        // Canvas avec la vraie police du média (window.__renderActuCanvas).
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

  const media = mediaByKey(mediaKey);
  const boardItems = (news[mediaKey] || []).slice(0, 3);
  const signupCta = (label, event) => (
    <a href="Forje App.html" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}
       onClick={() => window.__forjeTrack?.(event || 'demo_cta_clicked', { preset: mediaKey })}>
      {label} <Icon.Arrow />
    </a>
  );

  return (
    <section className="section section-demo" id="demo-generate" ref={sectionRef}>
      <div className="section-label"><span className="bar" /> Démo</div>
      <h2>Essaie. <span className="accent">Là, maintenant, sans compte.</span></h2>
      <p className="lede">
        C'est l'outil de l'app, branché sur deux médias démo. Écris une actu — ou
        prends-en une sur le board — et regarde le post sortir dans leur charte.
      </p>

      <div className="demo-shell">
        <div className="demo-left">
          <div className="media-tabs">
            {DEMO_MEDIA.map(m => (
              <button key={m.key} className={'media-tab' + (mediaKey === m.key ? ' active' : '')}
                      onClick={() => selectMedia(m.key)}>
                <img src={m.avatar} alt="" />
                <span>{m.name}</span>
              </button>
            ))}
          </div>

          <div className="media-card">
            <div className="media-id">
              <img className="media-avatar" src={media.avatar} alt={'Logo ' + media.name} />
              <div>
                <div className="media-name">{media.name}</div>
                <div className="media-handle">{media.handle}</div>
              </div>
              <div className="media-facts">
                <span className="media-domain">{media.domain}</span>
                <span className="media-followers">{media.followers}</span>
              </div>
            </div>
            <p className="media-desc">{media.description}</p>
            <div className="media-identity">
              <div className="media-swatches">
                {media.palette.map((c, i) => <span key={i} style={{ background: c }} />)}
              </div>
              <span className="media-font">{media.font}</span>
              <span className="media-tone">{media.tone}</span>
            </div>
          </div>

          <div className="prompt-block">
            <label className="prompt-label" htmlFor="demo-prompt">L'actu à forger</label>
            <textarea
              id="demo-prompt"
              className="prompt-input"
              rows={3}
              maxLength={300}
              placeholder={media.placeholder}
              value={prompt}
              onChange={onPromptChange}
            />
            {boardItems.length > 0 && (
              <div className="prompt-suggestions">
                <span className="prompt-suggestions-label">Sur le board :</span>
                {boardItems.map(item => (
                  <button key={item.id}
                          className={'prompt-chip' + (sourceNewsId === item.id ? ' active' : '')}
                          onClick={() => pickNews(item)}
                          title={item.title}>
                    {item.title.length > 48 ? item.title.slice(0, 48) + '…' : item.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="btn btn-primary btn-lg demo-generate-btn" disabled={!canGenerate} onClick={generate}>
            Générer le post <Icon.Arrow />
          </button>
          <div className="demo-note">Deux essais par visiteur · vrai pipeline, vraie charte</div>
        </div>

        <div className="demo-right">
          {phase === 'idle' && (
            <div className="demo-placeholder">
              <div className="demo-placeholder-frame">
                <span>Le post de {media.name} apparaîtra ici</span>
              </div>
            </div>
          )}

          {phase === 'generating' && (
            <div className="demo-generating">
              <div className="demo-gen-title">Forje compose le post de {media.name}</div>
              <PipelineProgress stepIdx={stepIdx} done={false} />
            </div>
          )}

          {phase === 'result' && result && (
            <div className="demo-result">
              <div className="demo-post-wrap">
                <img className="demo-post" src={result.image} alt={'Post généré avec l\'identité de ' + media.name} />
              </div>
              {result.cached && <div className="demo-cached-note">Cette actu avait déjà été forgée — servie depuis le cache.</div>}
              <div className="demo-punchline">
                Ça, c'était avec l'identité de <strong>{media.name}</strong>.<br />Imagine avec la tienne.
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
