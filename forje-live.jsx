/* global React, Icon */
/* ═══════════════════════════════════════════════════════════════════════
   FORJE LANDING — SECTIONS SIGNATURE
   3. Board de veille en direct   4. L'outil de génération, en vrai
   Les identités affichées/utilisées sont les VRAIS comptes démo (table
   clients, servis par /api/demo/media) — rien d'inventé côté front.
   DA : "fenêtre produit" — densité SaaS, mono pour la donnée, chrome app.
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

// Fallback minimal avant le chargement de /api/demo/media
const MEDIA_FALLBACK = [
  { key: 'ballon_bleu', name: 'Ballon Bleu', palette: [], tone: [], topics: [], placeholder: '' },
  { key: 'frame', name: 'FRAME', palette: [], tone: [], topics: [], placeholder: '' },
];

// ───── Helpers ──────────────────────────────────────────────────────────
// Âge compact pour la colonne du board — style tableur, pas de prose.
const shortAge = (iso) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' h';
  return Math.floor(h / 24) + ' j';
};

const CheckIcon = (p) => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" {...p}>
    <path d="M2 6.2 4.8 9 10 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MediaAvatar = ({ media, size = 52, className }) => (
  media && media.avatar
    ? <img className={className} src={media.avatar} alt={'Logo ' + media.name} style={{ width: size, height: size }} />
    : <span className={(className || '') + ' media-avatar-fallback'} style={{ width: size, height: size }}>{(media?.name || '?')[0]}</span>
);

// Chrome de fenêtre partagé board / démo
const WindowBar = ({ url, right }) => (
  <div className="fs-titlebar">
    <span className="fs-dots"><i /><i /><i /></span>
    <span className="fs-url">{url}</span>
    <span className="fs-spacer" />
    {right}
  </div>
);

// Lazy-load : déclenche onVisible ~400px avant l'entrée dans le viewport.
// Marge horizontale large : dans la transition scroll-horizontal, le panneau
// démo est translaté hors-champ à droite — on veut quand même précharger ses
// données avant qu'il ne glisse dans le cadre.
const useNearViewport = (ref, onVisible) => {
  useEL(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { onVisible(); obs.disconnect(); }
    }, { rootMargin: '400px 1600px' });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
};

// Fetchs partagés
const fetchVeille = async () => {
  const res = await fetch('/api/demo/veille');
  if (!res.ok) return null;
  const data = await res.json();
  return data.profiles || null; // [{key, name, topic, items}]
};
const fetchMedia = async () => {
  const res = await fetch('/api/demo/media');
  if (!res.ok) return null;
  const data = await res.json();
  return data.media && data.media.length ? data.media : null;
};

// ───── 3. BOARD DE VEILLE EN DIRECT ─────────────────────────────────────
const POLL_MS = 20000; // aligné sur le cache serveur de /api/demo/veille

const LiveBoard = () => {
  const sectionRef = useRL(null);
  const [profiles, setProfiles] = useSL(null); // [{key, name, topic, items}]
  const [tab, setTab] = useSL('ballon_bleu');
  const [lastSync, setLastSync] = useSL(null);
  const [entering, setEntering] = useSL(false);   // cascade d'entrée des lignes
  const [discovered, setDiscovered] = useSL(false); // le visiteur a atteint le board
  const [, forceTick] = useSL(0);              // tick 1s → âges & synchro vivent
  const knownIds = useRL(new Set());
  const freshIds = useRL(new Set());
  const started = useRL(false);
  const timersRef = useRL([]);

  // Rejoue la cascade d'entrée (arrivée sur le board, changement d'onglet)
  const playEnter = useCL(() => {
    setEntering(true);
    timersRef.current.push(setTimeout(() => setEntering(false), 2200));
  }, []);

  // La cascade de découverte ne se joue que lorsque le board est RÉELLEMENT
  // sous les yeux du visiteur ET que les données sont là. Les données sont
  // préchargées bien avant l'entrée dans le viewport (useNearViewport) —
  // sans ce verrou, l'animation se jouerait hors-champ.
  const revealed = useRL(false);
  const dataReady = useRL(false);
  const cascadeDone = useRL(false);
  const tryCascade = useCL(() => {
    if (cascadeDone.current || !revealed.current || !dataReady.current) return;
    cascadeDone.current = true;
    setLastSync(Date.now()); // "synchronisé à l'instant" au moment de la découverte
    setDiscovered(true);
    playEnter();
  }, [playEnter]);

  useEL(() => {
    if (!sectionRef.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        revealed.current = true;
        tryCascade();
        obs.disconnect();
      }
    }, { threshold: 0.25 });
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  const refresh = useCL(async () => {
    try {
      const next = await fetchVeille();
      if (!next) return;
      for (const p of next) {
        for (const it of p.items) {
          if (knownIds.current.size && !knownIds.current.has(it.id)) freshIds.current.add(it.id);
          knownIds.current.add(it.id);
        }
      }
      setProfiles(next);
      setLastSync(Date.now());
      if (!dataReady.current) { dataReady.current = true; tryCascade(); }
      setTimeout(() => { freshIds.current.clear(); }, 5000);
    } catch (e) { /* réseau : on garde l'état courant */ }
  }, [tryCascade]);

  const start = useCL(() => {
    if (started.current) return;
    started.current = true;
    refresh();
    timersRef.current.push(setInterval(refresh, POLL_MS));
    timersRef.current.push(setInterval(() => forceTick(n => n + 1), 1000));
    window.__forjeTrack?.('demo_board_viewed');
  }, [refresh]);

  useNearViewport(sectionRef, start);
  useEL(() => () => timersRef.current.forEach(clearInterval), []);

  const forgePost = (item) => {
    window.__forjeTrack?.('demo_board_forge_clicked', { news_id: item.id, preset: tab });
    window.dispatchEvent(new CustomEvent('forje-demo-select', {
      detail: { preset: tab, newsId: item.id, title: item.title },
    }));
    // En mode scroll-horizontal, la démo est à droite du board : on fait glisser
    // le cadre jusqu'à elle. Sinon (fallback empilé), scroll vertical classique.
    if (window.__forjeRevealDemo) window.__forjeRevealDemo();
    else document.getElementById('demo-generate')?.scrollIntoView({ behavior: 'smooth' });
  };

  const list = profiles || MEDIA_FALLBACK.map(m => ({ key: m.key, name: m.name, topic: '', items: [] }));
  const active = list.find(p => p.key === tab) || list[0];
  const syncSec = lastSync ? Math.floor((Date.now() - lastSync) / 1000) : null;
  const syncLabel = syncSec === null ? 'connexion…'
    : syncSec < 2 ? 'synchronisé à l\'instant'
    : syncSec < 60 ? 'synchronisé il y a ' + syncSec + ' s'
    : 'synchronisé il y a ' + Math.floor(syncSec / 60) + ' min';

  return (
    <section className="section section-live" id="demo-live" ref={sectionRef}>
      <div className="section-label"><span className="bar" /> Veille — temps réel</div>
      <h2>Pendant que tu lis cette page, <span className="accent">Forje surveille l'actu.</span></h2>
      <p className="lede">
        Ce board est branché sur la vraie veille de deux comptes démo.
        Chaque actu est scorée de 0 à 100 selon sa pertinence pour le compte.
      </p>

      <div className="fs-window live-window">
        <WindowBar
          url="app.forje.studio/veille"
          right={<span className="fs-live"><span className="fs-live-dot" /> LIVE</span>}
        />

        <div className="lb-toolbar">
          <div className="fs-tabs">
            {list.map(p => (
              <button key={p.key} className={'fs-tab' + (tab === p.key ? ' active' : '')}
                      onClick={() => { setTab(p.key); playEnter(); window.__forjeTrack?.('demo_board_tab', { preset: p.key }); }}>
                {p.name}
              </button>
            ))}
          </div>
          {active.topic && <span className="lb-scope">univers · {active.topic}</span>}
        </div>

        <div className="lb-cols">
          <span>Score</span><span>Actu</span><span>Source</span>
          <span className="ta-r">Il y a</span><span aria-hidden="true" />
        </div>

        <div className={'lb-rows' + (entering ? ' enter' : '') + (discovered ? '' : ' pre')}>
          {!profiles && (
            <div className="lb-loading">
              {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="lb-skeleton" style={{ animationDelay: (i * 0.1) + 's' }} />)}
            </div>
          )}
          {profiles && active.items.length === 0 && (
            <div className="lb-empty">La veille se réchauffe — reviens dans quelques minutes.</div>
          )}
          {active.items.map((item, i) => {
            const hot = item.score >= 80;
            return (
              <div key={item.id}
                   style={{ '--i': i }}
                   className={'lb-row' + (hot ? ' hot' : '') + (freshIds.current.has(item.id) ? ' fresh' : '')}>
                <div className="lb-score">
                  <span className="lb-num">{item.score}</span>
                  <span className="lb-meter"><i style={{ width: item.score + '%' }} /></span>
                </div>
                <div className="lb-title" title={item.title}>{item.title}</div>
                <div className="lb-src" title={item.source}>{item.source}</div>
                <div className="lb-age ta-r">{shortAge(item.published_at)}</div>
                <div className="lb-act">
                  <button className="lb-forge" onClick={() => forgePost(item)}>
                    Forger <Icon.Arrow />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="lb-foot">
          <span>{profiles ? 'sources scannées en continu · scoring automatique' : ' '}</span>
          <span className="lb-sync"><span className="lb-sync-dot" /> {syncLabel}</span>
        </div>
      </div>
    </section>
  );
};

// ───── 4. L'OUTIL, EN VRAI ──────────────────────────────────────────────
// Les 4 étapes affichées pendant la génération — durées estimées réalistes.
const PIPELINE_STEPS = [
  { label: 'Analyse de l\'actu', est: 6000 },
  { label: 'Recherche des photos de référence', est: 8000 },
  { label: 'Génération du visuel', est: 38000 },
  { label: 'Composition dans la charte', est: 10000 },
];

const PipelineProgress = ({ stepIdx, done }) => (
  <div className="dm-pipe">
    {PIPELINE_STEPS.map((s, i) => {
      const state = done || i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'todo';
      return (
        <div key={i} className={'dm-pipe-step ' + state}>
          <span className="dm-pipe-ix">{'0' + (i + 1)}</span>
          <span className="dm-pipe-ico">
            {state === 'done' ? <CheckIcon /> : state === 'active' ? <span className="dm-pipe-spin" /> : null}
          </span>
          <span className="dm-pipe-label">{s.label}</span>
        </div>
      );
    })}
  </div>
);

const fmtChrono = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

const InteractiveDemo = () => {
  const sectionRef = useRL(null);
  const [mediaList, setMediaList] = useSL(MEDIA_FALLBACK);
  const [mediaKey, setMediaKey] = useSL('ballon_bleu');
  const [news, setNews] = useSL({});
  const [prompt, setPrompt] = useSL('');
  const [sourceNewsId, setSourceNewsId] = useSL(null); // renseigné si le texte vient du board
  const [phase, setPhase] = useSL('idle');             // idle | generating | result | limited | busy | error
  const [stepIdx, setStepIdx] = useSL(0);
  const [result, setResult] = useSL(null);
  const [genAt, setGenAt] = useSL(null);
  const [, forceTick] = useSL(0);
  const timers = useRL([]);
  const started = useRL(false);

  const loadData = useCL(async () => {
    try {
      const [profiles, media] = await Promise.all([fetchVeille(), fetchMedia()]);
      if (profiles) {
        const next = {};
        for (const p of profiles) next[p.key] = p.items;
        setNews(next);
      }
      if (media) setMediaList(media);
    } catch (e) { /* silencieux */ }
  }, []);

  useNearViewport(sectionRef, () => {
    if (started.current) return;
    started.current = true;
    loadData();
    window.__forjeTrack?.('demo_section_viewed');
  });

  // Chrono vivant pendant la génération (statut de la colonne Sortie)
  useEL(() => {
    if (phase !== 'generating') return;
    const t = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Pré-sélection depuis le board ("Forger")
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
      if (!started.current) { started.current = true; loadData(); }
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
    setGenAt(Date.now());
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

  const media = mediaList.find(m => m.key === mediaKey) || mediaList[0];
  const boardItems = (news[mediaKey] || []).slice(0, 3);
  const signupCta = (label, event) => (
    <a href="Forje App.html" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}
       onClick={() => window.__forjeTrack?.(event || 'demo_cta_clicked', { preset: mediaKey })}>
      {label} <Icon.Arrow />
    </a>
  );

  const outStatus = phase === 'generating' ? fmtChrono(Date.now() - genAt)
    : phase === 'result' ? '1080 × 1350 · prêt'
    : phase === 'limited' ? 'quota atteint'
    : phase === 'busy' ? 'affluence'
    : phase === 'error' ? 'erreur'
    : 'en attente';

  return (
    <section className="section section-demo" id="demo-generate" ref={sectionRef}>
      <div className="section-label"><span className="bar" /> Démo</div>
      <h2>Essaie. <span className="accent">Là, maintenant, sans compte.</span></h2>
      <p className="lede">
        C'est le vrai outil, branché sur les vrais comptes de deux médias démo.
        Écris une actu — ou prends-en une sur le board — et regarde le post
        sortir dans leur charte.
      </p>

      <div className="fs-window demo-window">
        <WindowBar
          url="app.forje.studio/studio"
          right={<span className="fs-chip">Démo publique · 2 essais</span>}
        />

        <div className="dm-body">
          <div className="dm-left">
            <div className="dm-step"><span className="dm-step-num">01</span>Le média</div>
            <div className="fs-tabs dm-media-tabs">
              {mediaList.map(m => (
                <button key={m.key} className={'fs-tab' + (mediaKey === m.key ? ' active' : '')}
                        onClick={() => selectMedia(m.key)}>
                  <MediaAvatar media={m} size={18} className="dm-tab-avatar" />
                  <span>{m.name}</span>
                </button>
              ))}
            </div>

            <div className="dm-identity">
              <MediaAvatar media={media} size={78} className="dm-id-avatar" />
              <div className="dm-id-main">
                <div className="dm-id-name">{media.name}</div>
                {media.handle && <div className="dm-id-handle">{media.handle}</div>}
              </div>
              <div className="dm-id-spec">
                {media.palette && media.palette.length > 0 && (
                  <span className="dm-id-swatches">
                    {media.palette.slice(0, 4).map((c, i) => <i key={i} style={{ background: c }} />)}
                  </span>
                )}
                {media.font && <span className="dm-id-font">{media.font}</span>}
              </div>
            </div>
            {media.tone && media.tone.length > 0 && (
              <div className="dm-id-tone">charte · {media.tone.join(' · ')}</div>
            )}

            <div className="dm-step"><span className="dm-step-num">02</span>L'actu à forger</div>
            <textarea
              id="demo-prompt"
              className="dm-input"
              rows={3}
              maxLength={300}
              placeholder={media.placeholder || 'Colle une actu, une déclaration, une idée de post…'}
              value={prompt}
              onChange={onPromptChange}
            />

            {boardItems.length > 0 && (
              <div className="dm-sugg">
                <div className="dm-sugg-label">Depuis le board</div>
                {boardItems.map(item => (
                  <button key={item.id}
                          className={'dm-sugg-row' + (sourceNewsId === item.id ? ' active' : '')}
                          onClick={() => pickNews(item)}
                          title={item.title}>
                    <span className="dm-sugg-score">{item.score}</span>
                    <span className="dm-sugg-title">{item.title}</span>
                  </button>
                ))}
              </div>
            )}

            <button className="btn btn-primary btn-lg dm-generate-btn" disabled={!canGenerate} onClick={generate}>
              Générer le post <Icon.Arrow />
            </button>
            <div className="dm-note">Deux essais par visiteur · vrai pipeline, vraie charte</div>
          </div>

          <div className="dm-right">
            <div className="dm-out-head">
              <span className="dm-out-label">Sortie</span>
              <span className={'dm-out-status' + (phase === 'generating' ? ' running' : '')}>{outStatus}</span>
            </div>

            <div className="dm-out-body">
              {phase === 'idle' && (
                <div className="dm-placeholder">
                  <div className="dm-placeholder-frame">
                    <span>Le post de {media.name} apparaîtra ici</span>
                  </div>
                </div>
              )}

              {phase === 'generating' && (
                <div className="dm-generating">
                  <div className="dm-gen-title">Forje compose le post de {media.name}</div>
                  <PipelineProgress stepIdx={stepIdx} done={false} />
                </div>
              )}

              {phase === 'result' && result && (
                <div className="dm-result">
                  <div className="dm-post-wrap">
                    <img className="dm-post" src={result.image} alt={'Post généré avec l\'identité de ' + media.name} />
                  </div>
                  <div className="dm-result-meta">
                    charte {media.name}{result.cached ? ' · cette actu avait déjà été forgée — servie du cache' : ' · généré à l\'instant'}
                  </div>
                  <div className="dm-punchline">
                    Ça, c'était avec l'identité de <strong>{media.name}</strong>.<br />Imagine avec la tienne.
                  </div>
                  {signupCta('Forger mon identité — 50 crédits offerts', 'demo_cta_post_result')}
                  {typeof result.remaining === 'number' && result.remaining > 0 && (
                    <div className="dm-remaining">Il te reste {result.remaining} essai{result.remaining > 1 ? 's' : ''} démo.</div>
                  )}
                </div>
              )}

              {phase === 'limited' && (
                <div className="dm-blocked">
                  <div className="dm-blocked-title">Tu as utilisé tes 2 essais démo.</div>
                  <p>La suite se passe avec ta propre identité — 50 crédits offerts pour la forger.</p>
                  {signupCta('Créer mon compte gratuitement', 'demo_cta_rate_limited')}
                </div>
              )}

              {phase === 'busy' && (
                <div className="dm-blocked">
                  <div className="dm-blocked-title">Forte affluence sur la démo.</div>
                  <p>Crée ton compte pour générer sans attendre — 50 crédits offerts.</p>
                  {signupCta('Créer mon compte gratuitement', 'demo_cta_daily_limit')}
                </div>
              )}

              {phase === 'error' && (
                <div className="dm-blocked">
                  <div className="dm-blocked-title">La forge a raté ce coup-ci.</div>
                  <p>Réessaie dans quelques secondes — ça arrive, même aux meilleures forges.</p>
                  <button className="btn btn-ghost btn-lg" onClick={generate}>Réessayer</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ───── 3+4. TRANSITION SCROLL HORIZONTAL (board → démo) ──────────────────
// Le board occupe le cadre ; en scrollant, la zone se fige (sticky 100vh) et
// la démo glisse depuis la droite pour prendre sa place — au lieu d'être en
// dessous. Vanilla (pas de lib d'anim) : un handler de scroll traduit une
// piste horizontale via translate3d. Fallback : sections empilées si JS off
// ou prefers-reduced-motion (le CSS par défaut, sans .is-pinned).
const LiveDemoScroll = () => {
  const wrapRef = useRL(null);   // réserve la hauteur de scroll
  const frameRef = useRL(null);  // cadre épinglé (position pilotée en JS)
  const trackRef = useRL(null);  // piste horizontale (board | démo)

  useEL(() => {
    const wrap = wrapRef.current;
    const frame = frameRef.current;
    const track = trackRef.current;
    if (!wrap || !frame || !track) return;

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return; // fallback empilé

    wrap.classList.add('is-pinned');

    // Pin vertical : position:sticky NATIF (cf. forje-live.css) — géré par le
    // compositeur, collé au pixel près. Aucun repositionnement JS du cadre :
    // un pin JS retarde d'une frame sur le scroll composité → tremblements.
    // Le JS ne pilote que la GLISSE HORIZONTALE de la piste.
    // ── Mouvement en 3 temps + lissage ──────────────────────────────────
    // Courbe : on TIENT le board (0→12%), on GLISSE en ease-in-out (12→70%),
    // puis PALIER stabilisé sur la démo (70→100%) pour qu'elle soit lisible.
    // La glisse ne suit pas le scroll brut (crans de molette = tremblements) :
    // le scroll fixe une cible, une boucle rAF interpole vers elle → vitesse
    // amortie, trajectoire droite, zéro à-coup.
    const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const slideCurve = (p) => {
      const a = 0.12, b = 0.70;
      if (p <= a) return 0;
      if (p >= b) return 1;
      return easeInOut((p - a) / (b - a));
    };

    let lastW = -1, shift = 1;  // shift = largeur d'un panneau (course horizontale)
    let cur = 0, target = 0;    // translation affichée / cible (px)
    let rafLoop = 0;

    const tick = () => {
      rafLoop = 0;
      const d = target - cur;
      cur = Math.abs(d) < 0.4 ? target : cur + d * 0.11; // amorti ≈ silky
      track.style.transform = 'translate3d(' + (-cur).toFixed(2) + 'px,0,0)';
      wrap.style.setProperty('--ld-p', (shift ? cur / shift : 0).toFixed(4));
      if (cur !== target) rafLoop = requestAnimationFrame(tick);
    };
    const startLoop = () => { if (!rafLoop) rafLoop = requestAnimationFrame(tick); };

    // Au scroll : on ne fait que recalculer la CIBLE horizontale — le pin
    // vertical est entièrement géré par sticky, on n'y touche pas.
    const update = () => {
      const vh = window.innerHeight;
      const rect = wrap.getBoundingClientRect();
      const travel = Math.max(1, wrap.offsetHeight - vh); // course pendant le pin
      const passed = -rect.top;                            // distance scrollée dans le wrap
      const clamped = passed < 0 ? 0 : passed > travel ? travel : passed;

      const w = wrap.clientWidth; // = largeur .page (le cadre fait 100%)
      if (w !== lastW) { lastW = w; wrap.style.setProperty('--ld-w', w + 'px'); }

      shift = Math.max(1, track.scrollWidth - w);
      target = slideCurve(clamped / travel) * shift;
      startLoop();
    };
    const onScroll = update;

    // Amener le cadre jusqu'à la démo (fin de course) — appelé par « Forger ».
    window.__forjeRevealDemo = () => {
      const rect = wrap.getBoundingClientRect();
      const travel = Math.max(1, wrap.offsetHeight - window.innerHeight);
      window.scrollTo({ top: window.scrollY + rect.top + travel, behavior: 'smooth' });
    };

    update();
    // Re-mesures différées : rattrape l'activation tardive du CSS / des polices.
    const rafId = requestAnimationFrame(update);
    const t1 = setTimeout(update, 120);
    const t2 = setTimeout(update, 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('load', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('load', onScroll);
      cancelAnimationFrame(rafId);
      if (rafLoop) cancelAnimationFrame(rafLoop);
      clearTimeout(t1); clearTimeout(t2);
      if (window.__forjeRevealDemo) delete window.__forjeRevealDemo;
    };
  }, []);

  return (
    <div className="ld-scroll" ref={wrapRef}>
      <div className="ld-frame" ref={frameRef}>
        <div className="ld-rail"><i /></div>
        <div className="ld-track" ref={trackRef}>
          <div className="ld-panel" data-screen-label="03 Veille Live"><LiveBoard /></div>
          <div className="ld-panel" data-screen-label="04 Démo Interactive"><InteractiveDemo /></div>
        </div>
        <div className="ld-hint">Continue de scroller <Icon.Arrow /> la démo arrive</div>
      </div>
    </div>
  );
};

Object.assign(window, { LiveBoard, InteractiveDemo, LiveDemoScroll });
