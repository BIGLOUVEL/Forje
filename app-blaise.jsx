/* global React */
/* Blaise — le directeur artistique IA de Forje Studio.
   Un seul state de conversation partagé entre l'onglet dédié (sidebar Atelier),
   le panneau flottant (partout dans le dashboard) et l'onboarding.
   UI sobre : pas de bulles colorées, pas de gradients, DM Sans, boutons ghost. */
var { useState, useEffect, useRef, useCallback } = React;

// ─── Helpers réseau ──────────────────────────────────────────────────────────
async function blaiseFetch(path, opts) {
  var sb = window.__supabase;
  var sess = await sb.auth.getSession();
  var token = sess.data.session && sess.data.session.access_token;
  return fetch('/api' + path, {
    ...(opts || {}),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...((opts && opts.headers) || {}),
    },
  });
}

// ─── Store partagé (onglet + panneau flottant = même conversation) ──────────
var __blaise = {
  clientId: null,
  thread: [],        // { role, text, attachment, events, images, pending }
  busy: false,
  loaded: false,
  prefill: null,     // texte injecté dans le composer (bouton "Demander à Blaise")
  stage: 1,          // stepper onboarding (1 Nom · 2 Style · 3 Logo · 4 C'est parti)
};
var __blaiseListeners = new Set();
function blaiseEmit() { __blaiseListeners.forEach(function(fn) { fn(); }); }

// Masque les marqueurs techniques dans le texte affiché
function blaiseCleanText(text) {
  return String(text || '')
    .replace(/\n?⟦ref⟧\s*\S+/g, '')
    .replace(/\n?⟦image-jointe⟧\s*\S+/g, '')
    .replace(/\n?⟦posts⟧[^\n]*/g, '')
    .trim();
}

// Extrait la ligne "[chips: A | B | C]" → { text (sans la ligne), chips }
function blaiseParseChips(text) {
  var chips = [];
  var cleaned = String(text || '').replace(/\n?\s*\[chips:([^\]]+)\]\s*/i, function(_, inner) {
    chips = inner.split('|').map(function(s) { return s.trim(); }).filter(Boolean).slice(0, 4);
    return '\n';
  }).trim();
  return { text: cleaned, chips: chips };
}

// ─── Rendu Canvas des posts générés par Blaise (tool generate_post) ─────────
// Le serveur renvoie les FONDS (payload._payload) — le texte est peint ici
// avec la vraie police, comme dans le studio, puis le post en DB est complété.
async function blaiseRenderPost(post) {
  var p = post.payload;
  try {
    var images = [];
    if (post.format === 'deep_dive' && Array.isArray(p.slides) && window.__renderDeepDiveCarousel) {
      images = await window.__renderDeepDiveCarousel(p);
    } else if (post.format === 'citation' && window.__renderCitationCanvas) {
      images = [await window.__renderCitationCanvas(p)];
    } else if (p.bgImage && window.__renderActuCanvas) {
      images = [await window.__renderActuCanvas(p)];
    }
    post.images = images;
    post.rendering = false;
    // Complète le post en DB (image finale) — le serveur l'a créé avec image:null
    var sb = window.__supabase;
    if (sb && post.postId && images[0]) {
      sb.from('generated_posts').update({ image: images[0] }).eq('id', post.postId)
        .then(function() {});
    }
  } catch (e) {
    post.rendering = false;
    post.renderError = true;
  }
  blaiseEmit();
}

// Charge l'image d'un post généré dans un tour passé (rechargement d'historique)
function blaiseLoadPostImage(post) {
  var sb = window.__supabase;
  if (!sb || !post.postId || post.images.length || post.loading) return;
  post.loading = true;
  sb.from('generated_posts').select('image').eq('id', post.postId).maybeSingle()
    .then(function(r) {
      post.loading = false;
      if (r.data && r.data.image) post.images = [r.data.image];
      blaiseEmit();
    });
}

// Transforme les events generate_post d'un message en objets posts affichables
function blaisePostsFromEvents(events) {
  return (events || [])
    .filter(function(e) { return e.tool === 'generate_post' && e.result && e.result.postId; })
    .map(function(e) {
      return {
        postId: e.result.postId,
        format: e.result.format,
        title: e.result.title || '',
        payload: e.result._payload || null,
        images: [],
        rendering: !!e.result._payload,
        loading: false,
      };
    });
}

async function blaiseLoad(clientId, force) {
  if (!clientId) return;
  if (!force && __blaise.loaded && __blaise.clientId === clientId) return;
  __blaise.clientId = clientId;
  try {
    var res = await blaiseFetch('/blaise/history?clientId=' + clientId);
    var data = await res.json();
    if (res.ok) {
      __blaise.thread = (data.thread || []).filter(function(m) { return m.text !== '[start]'; })
        .map(function(m) { return { ...m, posts: blaisePostsFromEvents(m.events) }; });
      if (typeof data.onboardingStage === 'number') __blaise.stage = data.onboardingStage;
      __blaise.loaded = true;
      blaiseComputeUnread(clientId);
    }
  } catch (_) {}
  blaiseEmit();
}

// ─── Brief du jour : badge non-lu (onglet sidebar + bouton flottant) ─────────
// Le "lu" est local (localStorage) : dernier created_at de brief vu.
function blaiseLatestBrief() {
  for (var i = __blaise.thread.length - 1; i >= 0; i--) {
    if (__blaise.thread[i].is_daily_brief) return __blaise.thread[i].created_at;
  }
  return null;
}
function blaiseSetUnread(v) {
  if (__blaise.unread === v) return;
  __blaise.unread = v;
  window.__blaiseUnread = v;
  try { window.dispatchEvent(new CustomEvent('blaise-unread', { detail: v })); } catch (_) {}
}
function blaiseComputeUnread(clientId) {
  var latest = blaiseLatestBrief();
  if (!latest) { blaiseSetUnread(false); return; }
  var seen = null;
  try { seen = localStorage.getItem('blaise_brief_seen_' + clientId); } catch (_) {}
  blaiseSetUnread(!seen || new Date(latest) > new Date(seen));
}
function blaiseMarkBriefSeen(clientId) {
  var latest = blaiseLatestBrief();
  if (!latest) return;
  try { localStorage.setItem('blaise_brief_seen_' + clientId, latest); } catch (_) {}
  blaiseSetUnread(false);
}

// Libellé du séparateur : "Brief du jour — mardi 12 août"
function blaiseBriefLabel(createdAt) {
  var d = createdAt ? new Date(createdAt) : new Date();
  return 'Brief du jour — ' + d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

async function blaiseSend(clientId, text, mode, image) {
  if (!clientId || __blaise.busy) return;
  __blaise.busy = true;
  if (text !== '[start]') {
    __blaise.thread = __blaise.thread.concat([{
      role: 'user', text: blaiseCleanText(text),
      attachment: image ? image.preview : null,
      events: [], images: [], pending: false,
    }]);
  }
  blaiseEmit();
  try {
    var res = await blaiseFetch('/blaise', {
      method: 'POST',
      body: JSON.stringify({
        clientId: clientId, message: text, mode: mode || 'studio',
        imageB64: image ? image.b64 : undefined,
        imageMime: image ? image.mime : undefined,
      }),
    });
    var data = await res.json();
    if (res.ok) {
      var posts = blaisePostsFromEvents(data.events);
      __blaise.thread = __blaise.thread.concat([{
        role: 'assistant', text: blaiseCleanText(data.reply),
        events: data.events || [], images: data.images || [], posts: posts, pending: false,
      }]);
      if (typeof data.onboardingStage === 'number') __blaise.stage = data.onboardingStage;
      // Posts générés ce tour : rendu Canvas (texte + vraie police) en asynchrone
      posts.forEach(function(p) { if (p.payload) blaiseRenderPost(p); });
      if (typeof data.creditsLeft === 'number' && window.__applyCredits) window.__applyCredits(data.creditsLeft);
      var applied = (data.events || []).some(function(e) {
        return (e.tool === 'update_brand_identity' || e.tool === 'save_strategy') && e.result && !e.result.error;
      });
      if (applied && window.__reloadClients) window.__reloadClients();
    } else {
      __blaise.thread = __blaise.thread.concat([{
        role: 'assistant', text: data.error || 'Petit souci de mon côté — réessaie dans un instant.',
        events: [], images: [], pending: false, error: true,
      }]);
    }
  } catch (_) {
    __blaise.thread = __blaise.thread.concat([{
      role: 'assistant', text: 'Connexion perdue — réessaie dans un instant.',
      events: [], images: [], pending: false, error: true,
    }]);
  }
  __blaise.busy = false;
  blaiseEmit();
}

function useBlaise(clientId) {
  var forceRender = useState(0)[1];
  useEffect(function() {
    var fn = function() { forceRender(function(n) { return n + 1; }); };
    __blaiseListeners.add(fn);
    return function() { __blaiseListeners.delete(fn); };
  }, []);
  useEffect(function() {
    if (clientId && clientId !== __blaise.clientId) {
      __blaise.thread = []; __blaise.loaded = false;
    }
    blaiseLoad(clientId);
  }, [clientId]);
  return __blaise;
}

// ─── Lightbox média (unique : fil, panneau flottant, onboarding) ─────────────
// images: [url…] · startIndex · actions: [{ icon, label, cost, onClick }]
// Fermeture : clic hors image, Échap, croix. Carousel : ← → + compteur.
var MediaLightbox = function({ images, startIndex, actions, onClose }) {
  var [idx, setIdx] = useState(startIndex || 0);
  var many = images.length > 1;

  var prev = useCallback(function() { setIdx(function(i) { return (i - 1 + images.length) % images.length; }); }, [images.length]);
  var next = useCallback(function() { setIdx(function(i) { return (i + 1) % images.length; }); }, [images.length]);

  useEffect(function() {
    var onKey = function(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && many) prev();
      else if (e.key === 'ArrowRight' && many) next();
    };
    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
  }, [onClose, prev, next, many]);

  var download = function() {
    var a = document.createElement('a');
    a.href = images[idx];
    a.download = 'blaise-' + (idx + 1) + '.png';
    a.click();
  };

  return (
    <div className="blaise-lightbox" onClick={onClose}>
      <button className="blaise-lightbox-close" onClick={onClose} title="Fermer (Échap)">
        <AppIcon name="x" size={18}/>
      </button>
      {many && (
        <button className="blaise-lightbox-nav blaise-lightbox-nav--prev"
                onClick={function(e) { e.stopPropagation(); prev(); }} title="Précédent">‹</button>
      )}
      <img className="blaise-lightbox-img" src={images[idx]} alt=""
           onClick={function(e) { e.stopPropagation(); }}/>
      {many && (
        <button className="blaise-lightbox-nav blaise-lightbox-nav--next"
                onClick={function(e) { e.stopPropagation(); next(); }} title="Suivant">›</button>
      )}
      <div className="blaise-lightbox-bar" onClick={function(e) { e.stopPropagation(); }}>
        {many && <span className="blaise-lightbox-counter">{idx + 1}/{images.length}</span>}
        {(actions || []).map(function(a, i) {
          return (
            <button key={i} className="btn btn-ghost btn-sm" onClick={function() { onClose(); a.onClick(images[idx]); }}>
              {a.icon && <AppIcon name={a.icon} size={13}/>} {a.label}
              {a.cost && <span className="blaise-cost">{a.cost}</span>}
            </button>
          );
        })}
        <button className="btn btn-ghost btn-sm" onClick={download}>
          <AppIcon name="download" size={13}/> Télécharger
        </button>
      </div>
    </div>
  );
};
window.MediaLightbox = MediaLightbox;

// ─── Sous-composants du fil ──────────────────────────────────────────────────

// Planche logo générée : vignette compacte (≤340px), clic → lightbox avec les
// mêmes 3 actions. Les boutons restent aussi sous la vignette.
var BlaiseImage = function({ url, onValidate, onRetouch, onOther, onImgLoad }) {
  var [zoom, setZoom] = useState(false);
  var actions = [
    { icon: 'check',   label: 'On prend celui-là',      onClick: onValidate },
    { icon: 'edit',    label: 'Retouche',  cost: '1 cr', onClick: onRetouch },
    { icon: 'refresh', label: 'Autre direction', cost: '2 cr', onClick: onOther },
  ];
  return (
    <div className="blaise-image-block">
      <img className="blaise-image blaise-thumb" src={url} alt="Proposition de Blaise" loading="lazy"
           onLoad={onImgLoad} onClick={function() { setZoom(true); }}/>
      <div className="blaise-image-actions">
        <button className="btn btn-ghost btn-sm" onClick={function() { onValidate(url); }}>
          <AppIcon name="check" size={13}/> On prend celui-là
        </button>
        <button className="btn btn-ghost btn-sm" onClick={function() { onRetouch(url); }}>
          <AppIcon name="edit" size={13}/> Demander une retouche
          <span className="blaise-cost">1 cr</span>
        </button>
        <button className="btn btn-ghost btn-sm" onClick={function() { onOther(url); }}>
          <AppIcon name="refresh" size={13}/> Autre direction
          <span className="blaise-cost">2 cr</span>
        </button>
      </div>
      {zoom && <MediaLightbox images={[url]} actions={actions} onClose={function() { setZoom(false); }}/>}
    </div>
  );
};

// Références Serper : grille compacte de vignettes
var BlaiseRefs = function({ refs }) {
  if (!refs || !refs.length) return null;
  return (
    <div className="blaise-refs">
      {refs.slice(0, 4).map(function(r, i) {
        return <img key={i} className="blaise-ref-thumb" src={r.image_url} alt={r.title || 'Référence'} loading="lazy"/>;
      })}
    </div>
  );
};

// Card système discrète quand un changement est appliqué
var BlaiseSystemCard = function({ event, onNav }) {
  var t = event.tool, r = event.result || {};
  if (r.error) return null;
  if (t === 'update_brand_identity' && (r.applied || []).length) {
    var withLogo = (r.applied || []).indexOf('logo_url') !== -1;
    return (
      <div className="blaise-system-card">
        <AppIcon name="check" size={13}/>
        <span>{withLogo ? 'Logo mis à jour dans ton identité' : 'Identité mise à jour'}</span>
        {onNav && <button className="blaise-system-link" onClick={function() { onNav('brand'); }}>Voir l'identité →</button>}
      </div>
    );
  }
  if (t === 'save_strategy' && r.saved) {
    return (
      <div className="blaise-system-card">
        <AppIcon name="check" size={13}/>
        <span>Stratégie réseaux enregistrée</span>
      </div>
    );
  }
  if (t === 'save_editorial_rule' && r.saved) {
    return (
      <div className="blaise-system-card">
        <AppIcon name="check" size={13}/>
        <span>Règle mémorisée : {r.rule}</span>
        {onNav && <button className="blaise-system-link" onClick={function() { onNav('brand'); }}>Voir mes règles →</button>}
      </div>
    );
  }
  if (t === 'schedule_post' && r.scheduled) {
    var d = new Date(r.scheduled_at);
    var when = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) +
               ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return (
      <div className="blaise-system-card">
        <AppIcon name="calendar" size={13}/>
        <span>Planifié {when}</span>
        {onNav && <button className="blaise-system-link" onClick={function() { onNav('calendar'); }}>Voir le calendrier →</button>}
      </div>
    );
  }
  return null;
};

// Post généré par Blaise (tool generate_post) : slides/image en large + card
// système avec lien vers l'éditeur du studio.
var BlaisePostCard = function({ post, onNav, onImgLoad }) {
  useEffect(function() { blaiseLoadPostImage(post); }, []);
  var [zoom, setZoom] = useState(null); // index de slide ouvert en lightbox
  var label = { actu: 'Actu', citation: 'Citation', deep_dive: 'Deep Dive' }[post.format] || 'Post';
  var actions = onNav ? [{ icon: 'edit', label: "Ouvrir dans l'éditeur", onClick: function() { onNav('generate'); } }] : [];
  return (
    <div className="blaise-post-block">
      {post.rendering && (
        <div className="blaise-post-rendering">
          <div className="blaise-typing"><span/><span/><span/></div>
          <span>Mise en page du {label.toLowerCase()}…</span>
        </div>
      )}
      {post.images.length > 1 ? (
        <>
          <div className="blaise-post-slides">
            {post.images.map(function(img, i) {
              return <img key={i} className="blaise-post-mini" src={img} alt={'Slide ' + (i + 1)} loading="lazy"
                          onLoad={onImgLoad} onClick={function() { setZoom(i); }}/>;
            })}
          </div>
          <div className="blaise-post-count">{post.images.length} slides</div>
        </>
      ) : post.images[0] ? (
        <img className="blaise-post-thumb" src={post.images[0]} alt={post.title || 'Post généré'} loading="lazy"
             onLoad={onImgLoad} onClick={function() { setZoom(0); }}/>
      ) : null}
      <div className="blaise-system-card">
        <AppIcon name="check" size={13}/>
        <span>{label} généré{post.format === 'citation' ? 'e' : ''}{post.title ? ' — ' + post.title : ''}</span>
        {onNav && <button className="blaise-system-link" onClick={function() { onNav('generate'); }}>Ouvrir dans l'éditeur →</button>}
      </div>
      {zoom != null && (
        <MediaLightbox images={post.images} startIndex={zoom} actions={actions}
                       onClose={function() { setZoom(null); }}/>
      )}
    </div>
  );
};

// Un message du fil
var BlaiseMsg = function({ msg, mode, isLast, busy, onNav, onValidate, onRetouch, onOther, onChip, onImgLoad }) {
  if (msg.role === 'user') {
    return (
      <div className="blaise-msg blaise-msg--user">
        {msg.attachment && <img className="blaise-attachment" src={msg.attachment} alt="Image jointe"/>}
        <div className="blaise-msg-text">{msg.text}</div>
      </div>
    );
  }
  var parsed = blaiseParseChips(msg.text);
  var refsEvents = (msg.events || []).filter(function(e) { return e.tool === 'search_references' && e.result && e.result.references; });
  return (
    <div className={'blaise-msg blaise-msg--blaise' + (msg.error ? ' blaise-msg--error' : '')}>
      <div className="blaise-msg-label">Blaise</div>
      {parsed.text && <div className="blaise-msg-text">{parsed.text}</div>}
      {refsEvents.map(function(e, i) { return <BlaiseRefs key={'r' + i} refs={e.result.references}/>; })}
      {(msg.images || []).map(function(url, i) {
        return <BlaiseImage key={'i' + i} url={url} onValidate={onValidate} onRetouch={onRetouch} onOther={onOther} onImgLoad={onImgLoad}/>;
      })}
      {(msg.posts || []).map(function(p, i) { return <BlaisePostCard key={'p' + i} post={p} onNav={onNav} onImgLoad={onImgLoad}/>; })}
      {(msg.events || []).map(function(e, i) { return <BlaiseSystemCard key={'e' + i} event={e} onNav={onNav}/>; })}
      {isLast && !busy && parsed.chips.length > 0 && (
        <div className="blaise-chips">
          {parsed.chips.map(function(c, i) {
            return (
              <button key={i} className="blaise-chip" onClick={function() { onChip(c); }}>{c}</button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Commandes slash — raccourcis vers des messages, zéro logique serveur ───
var BLAISE_SLASH = [
  { cmd: '/idées',    arg: null,      hint: 'Idées de posts (veille + recherche)', msg: function() { return 'Propose-moi des idées de posts'; } },
  { cmd: '/actu',     arg: '[sujet]', hint: 'Designer une actu sur un sujet',      msg: function(a) { return 'Design-moi un post actu sur : ' + a; } },
  { cmd: '/citation', arg: '[qui]',   hint: 'Trouver une citation forte',          msg: function(a) { return 'Trouve-moi une citation forte de : ' + a; } },
  { cmd: '/deepdive', arg: '[sujet]', hint: 'Structurer un deep dive',             msg: function(a) { return 'Designe-moi la structure d\'un deep dive sur : ' + a; } },
  { cmd: '/logo',     arg: null,      hint: 'Retravailler le logo',                msg: function() { return 'On retravaille mon logo'; } },
  { cmd: '/palette',  arg: null,      hint: 'Revoir la palette',                   msg: function() { return 'On revoit ma palette'; } },
  { cmd: '/semaine',  arg: null,      hint: 'Préparer la semaine (batch)',         msg: function() { return 'Prépare-moi la semaine'; } },
  { cmd: '/règles',   arg: null,      hint: 'Lister mes règles éditoriales',       msg: function() { return 'Liste mes règles éditoriales actives'; } },
];

// Normalise pour le filtre (é→e) — /regles matche /règles
function blaiseSlashNorm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Si le texte envoyé commence par une commande, le convertit en message complet
function blaiseSlashResolve(text) {
  var m = String(text).match(/^(\/\S+)\s*([\s\S]*)$/);
  if (!m) return text;
  var found = BLAISE_SLASH.find(function(c) { return blaiseSlashNorm(c.cmd) === blaiseSlashNorm(m[1]); });
  if (!found) return text;
  var arg = m[2].trim();
  if (found.arg && !arg) return text; // /actu sans sujet → envoyé tel quel, Blaise demandera
  return found.msg(arg);
}

// ─── Composer (input) ────────────────────────────────────────────────────────
var BlaiseComposer = function({ clientId, mode, disabled }) {
  var [text, setText] = useState('');
  var [image, setImage] = useState(null); // { b64, mime, preview }
  var [slashIdx, setSlashIdx] = useState(0);
  var taRef = useRef(null);
  var fileRef = useRef(null);

  // Menu slash : visible tant que le texte est "/quelquechose" sans espace final
  var slashMatches = [];
  if (/^\/\S*$/.test(text)) {
    var q = blaiseSlashNorm(text);
    slashMatches = BLAISE_SLASH.filter(function(c) { return blaiseSlashNorm(c.cmd).indexOf(q) === 0; });
  }
  var pickSlash = function(c) {
    if (c.arg) {
      setText(c.cmd + ' ');
      if (taRef.current) taRef.current.focus();
    } else {
      setText(c.msg(''));
      if (taRef.current) taRef.current.focus();
    }
    setSlashIdx(0);
  };

  // Prefill injecté par les boutons contextuels ("Demander une retouche"…)
  useEffect(function() {
    var fn = function() {
      if (__blaise.prefill != null) {
        setText(__blaise.prefill);
        __blaise.prefill = null;
        if (taRef.current) { taRef.current.focus(); }
      }
    };
    __blaiseListeners.add(fn);
    return function() { __blaiseListeners.delete(fn); };
  }, []);

  var autosize = function() {
    var ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  };
  useEffect(autosize, [text]);

  var send = function() {
    var t = blaiseSlashResolve(text.trim());
    if (!t || __blaise.busy || disabled) return;
    setText('');
    var img = image; setImage(null);
    blaiseSend(clientId, t, mode, img);
  };

  var onPickFile = function(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !/^image\//.test(file.type)) return;
    var reader = new FileReader();
    reader.onload = function() {
      setImage({ b64: String(reader.result).split(',')[1], mime: file.type, preview: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="blaise-composer">
      {slashMatches.length > 0 && (
        <div className="blaise-slash-menu">
          {slashMatches.map(function(c, i) {
            return (
              <button key={c.cmd}
                className={'blaise-slash-item' + (i === slashIdx ? ' is-active' : '')}
                onMouseEnter={function() { setSlashIdx(i); }}
                onClick={function() { pickSlash(c); }}>
                <span className="blaise-slash-cmd">{c.cmd}{c.arg ? ' ' + c.arg : ''}</span>
                <span className="blaise-slash-hint">{c.hint}</span>
              </button>
            );
          })}
        </div>
      )}
      {image && (
        <div className="blaise-composer-attachment">
          <img src={image.preview} alt="Pièce jointe"/>
          <button className="blaise-attachment-remove" onClick={function() { setImage(null); }} title="Retirer">
            <AppIcon name="x" size={11}/>
          </button>
        </div>
      )}
      <div className="blaise-composer-row">
        <button className="blaise-composer-attach" title="Joindre une image de référence"
                onClick={function() { fileRef.current && fileRef.current.click(); }}>
          <AppIcon name="image" size={15}/>
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickFile}/>
        <textarea
          ref={taRef}
          className="blaise-composer-input"
          placeholder="Parle identité, logo, palette, stratégie…"
          rows={1}
          value={text}
          disabled={disabled}
          onChange={function(e) { setText(e.target.value); }}
          onKeyDown={function(e) {
            if (slashMatches.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(function(i) { return (i + 1) % slashMatches.length; }); return; }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashIdx(function(i) { return (i - 1 + slashMatches.length) % slashMatches.length; }); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSlash(slashMatches[slashIdx] || slashMatches[0]); return; }
              if (e.key === 'Escape') { setText(''); return; }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button className="blaise-composer-send" onClick={send}
                disabled={!text.trim() || __blaise.busy || disabled} title="Envoyer">
          <AppIcon name="arrowUp" size={15}/>
        </button>
      </div>
    </div>
  );
};

// Indicateur d'attente avec étapes temporisées : un tour simple répond en
// quelques secondes ; au-delà, un tool tourne (recherche, logo, post) — on
// affiche des repères de progression (comme la démo landing) plutôt que
// trois points muets pendant 2 minutes.
var BlaiseTypingSteps = function() {
  var [elapsed, setElapsed] = useState(0);
  useEffect(function() {
    var t = setInterval(function() { setElapsed(function(e) { return e + 1; }); }, 1000);
    return function() { clearInterval(t); };
  }, []);
  var label = null;
  if (elapsed >= 90)      label = 'Assemblage des slides — encore quelques instants…';
  else if (elapsed >= 45) label = 'Génération en cours (un deep dive prend 1 à 2 min)…';
  else if (elapsed >= 18) label = 'Génération en cours…';
  else if (elapsed >= 7)  label = 'Blaise vérifie et prépare…';
  return (
    <div className="blaise-msg blaise-msg--blaise">
      <div className="blaise-msg-label">Blaise</div>
      <div className="blaise-typing-row">
        <div className="blaise-typing"><span/><span/><span/></div>
        {label && <span className="blaise-typing-label">{label}</span>}
      </div>
    </div>
  );
};

// ─── Le fil complet (partagé : onglet, panneau, onboarding) ─────────────────
var BlaiseThread = function({ clientId, mode, onNav, emptyHint }) {
  var state = useBlaise(clientId);
  var scrollRef = useRef(null);

  var scrollBottom = useCallback(function() {
    var el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(scrollBottom, [state.thread.length, state.busy]);

  // Le fil est visible → le brief du jour est considéré lu
  useEffect(function() {
    if (clientId && state.loaded) blaiseMarkBriefSeen(clientId);
  }, [clientId, state.loaded, state.thread.length]);

  var onValidate = function(url) {
    blaiseSend(clientId, 'On prend celui-là.\n⟦ref⟧ ' + url, mode);
  };
  var onRetouch = function(url) {
    __blaise.prefill = 'Retouche sur cette version : ';
    blaiseEmit();
  };
  var onOther = function(url) {
    __blaise.prefill = 'Pars sur une autre direction : ';
    blaiseEmit();
  };
  var onChip = function(text) {
    blaiseSend(clientId, text, mode);
  };

  return (
    <div className="blaise-thread">
      <div className="blaise-messages" ref={scrollRef}>
        {!state.thread.length && !state.busy && (
          <div className="blaise-empty">
            <div className="blaise-empty-title">Blaise, ton directeur artistique</div>
            <div className="blaise-empty-sub">
              {emptyHint || 'Nom, logo, palette, ton, stratégie réseaux — la conversation est gratuite, seules les générations coûtent des crédits (logo 2 cr, retouche 1 cr).'}
            </div>
          </div>
        )}
        {state.thread.map(function(msg, i) {
          return (
            <React.Fragment key={i}>
              {msg.is_daily_brief && (
                <div className="blaise-brief-sep">
                  <span>{blaiseBriefLabel(msg.created_at)}</span>
                </div>
              )}
              <BlaiseMsg msg={msg} mode={mode} onNav={onNav}
                         isLast={i === state.thread.length - 1} busy={state.busy}
                         onValidate={onValidate} onRetouch={onRetouch} onOther={onOther}
                         onChip={onChip} onImgLoad={scrollBottom}/>
            </React.Fragment>
          );
        })}
        {state.busy && <BlaiseTypingSteps/>}
      </div>
      <BlaiseComposer clientId={clientId} mode={mode} disabled={!clientId}/>
    </div>
  );
};

// ─── Écran dédié (onglet sidebar Atelier) ────────────────────────────────────
var BlaiseScreen = function({ clientId, onNav }) {
  return (
    <div className="blaise-screen">
      {!clientId ? (
        <div className="blaise-empty" style={{ margin: 'auto' }}>
          <div className="blaise-empty-title">Crée d'abord ton compte média</div>
          <div className="blaise-empty-sub">Blaise a besoin d'un média à habiller — passe par Identité de marque.</div>
        </div>
      ) : (
        <BlaiseThread clientId={clientId} mode="studio" onNav={onNav}/>
      )}
    </div>
  );
};

// ─── Panneau flottant (accessible partout, même conversation) ────────────────
var BlaiseFloating = function({ clientId, onNav, hidden }) {
  var [open, setOpen] = useState(false);
  // Charge l'historique même fermé → le badge "brief du jour non lu" vit ici
  var state = useBlaise(clientId);

  useEffect(function() {
    // Bouton contextuel "Demander à Blaise" (ex : depuis l'onglet Identité)
    window.__openBlaise = function(prefill) {
      if (prefill) { __blaise.prefill = prefill; }
      setOpen(true);
      setTimeout(blaiseEmit, 60); // le composer monte, puis consomme le prefill
    };
    return function() { window.__openBlaise = null; };
  }, []);

  if (hidden || !clientId) return null;

  return (
    <>
      {!open && (
        <button className="blaise-fab" onClick={function() { setOpen(true); }} title="Parler à Blaise">
          <AppIcon name="quote" size={18}/>
          {state.unread && <span className="blaise-unread-dot"/>}
        </button>
      )}
      {open && (
        <>
          <div className="blaise-drawer-backdrop" onClick={function() { setOpen(false); }}/>
          <div className="blaise-drawer">
            <div className="blaise-drawer-head">
              <span className="blaise-drawer-title">Blaise</span>
              <span className="blaise-drawer-sub">directeur artistique</span>
              <button className="blaise-drawer-expand" title="Ouvrir en grand"
                      onClick={function() { setOpen(false); onNav && onNav('blaise'); }}>
                <AppIcon name="arrowRight" size={13}/>
              </button>
              <button className="blaise-drawer-close" onClick={function() { setOpen(false); }} title="Fermer">
                <AppIcon name="x" size={14}/>
              </button>
            </div>
            <BlaiseThread clientId={clientId} mode="studio" onNav={onNav}/>
          </div>
        </>
      )}
    </>
  );
};

// Stepper onboarding — 4 étapes nommées, le stage vient du SERVEUR
// (onboardingStage dans chaque réponse /api/blaise), jamais déduit côté front.
var BLAISE_OB_STEPS = ['Nom', 'Style', 'Logo', "C'est parti"];
var BlaiseStepper = function({ stage }) {
  return (
    <div className="blaise-stepper" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={stage}>
      {BLAISE_OB_STEPS.map(function(label, i) {
        var n = i + 1;
        var cls = n < stage ? ' is-done' : n === stage ? ' is-current' : '';
        return (
          <React.Fragment key={label}>
            {i > 0 && <div className={'blaise-stepper-line' + (n <= stage ? ' is-done' : '')}/>}
            <div className={'blaise-stepper-step' + cls}>
              <span className="blaise-stepper-dot">{n < stage ? <AppIcon name="check" size={9}/> : null}</span>
              <span className="blaise-stepper-label">{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── Onboarding — Blaise EST l'onboarding Profil B ───────────────────────────
var BlaiseOnboarding = function({ onNext, existingClientId }) {
  var [clientId, setClientId] = useState(existingClientId || null);
  var [done, setDone] = useState(false);
  var startedRef = useRef(false);
  var state = useBlaise(clientId);

  // S'assure qu'une ligne client existe (le trigger signup en crée une, mais on
  // couvre le cas contraire), puis marque le profil B en cours.
  useEffect(function() {
    if (clientId) return;
    var sb = window.__supabase;
    var user = window.__currentUser;
    if (!sb || !user) return;
    sb.from('clients').select('id').eq('user_id', user.id).maybeSingle().then(function(r) {
      if (r.data) { setClientId(r.data.id); return; }
      sb.from('clients').insert({ user_id: user.id, profile_type: 'B', onboarding_step: 3 })
        .select('id').single().then(function(r2) { if (r2.data) setClientId(r2.data.id); });
    });
  }, [clientId]);

  // Blaise parle en premier : amorce silencieuse quand le fil est vide
  useEffect(function() {
    if (!clientId || !state.loaded || startedRef.current) return;
    if (!state.thread.length && !state.busy) {
      startedRef.current = true;
      blaiseSend(clientId, '[start]', 'onboarding');
    }
  }, [clientId, state.loaded, state.thread.length, state.busy]);

  // Identité appliquée → transition automatique vers l'étape 4 (premier post)
  useEffect(function() {
    if (done || !clientId) return;
    var applied = state.thread.some(function(m) {
      return (m.events || []).some(function(e) {
        return e.tool === 'update_brand_identity' && e.result && !e.result.error;
      });
    });
    if (applied) {
      setDone(true);
      var sb = window.__supabase;
      if (sb) sb.from('clients').update({ onboarding_step: 4 }).eq('id', clientId);
      setTimeout(function() { onNext(clientId); }, 2600);
    }
  }, [state.thread, done, clientId]);

  return (
    <div className="blaise-ob">
      <div className="blaise-ob-head">
        <div className="ob-eyebrow">Ton directeur artistique</div>
        <h1 className="blaise-ob-title">Construis ton identité avec Blaise</h1>
      </div>
      <BlaiseStepper stage={done ? 4 : state.stage}/>
      <div className="blaise-ob-thread">
        <BlaiseThread clientId={clientId} mode="onboarding"
          emptyHint="Blaise arrive…"/>
      </div>
      {done && (
        <div className="blaise-ob-done">
          <AppIcon name="check" size={14}/>
          Identité appliquée — on passe à ton premier post…
        </div>
      )}
    </div>
  );
};

Object.assign(window, { BlaiseScreen, BlaiseFloating, BlaiseOnboarding });
