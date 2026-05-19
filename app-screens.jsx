/* global React, AppIcon, Btn */
var { useState, useEffect, useRef } = React;

// ─── Canvas renderer : texte actu avec les vraies Google Fonts ───────────────
async function renderActuCanvas(data) {
  var W = 1080, H = 1350;
  var canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');

  // 1. Draw server background (photo + gradient + accent bar + logo)
  var bg = new Image();
  await new Promise(function(res, rej) { bg.onload = res; bg.onerror = rej; bg.src = data.bgImage; });
  ctx.drawImage(bg, 0, 0, W, H);

  // 2. Resolve pack typography from FONT_PACKS
  var pack = (typeof FONT_PACKS !== 'undefined' && FONT_PACKS.find(function(p) { return p.id === data.packId; })) || null;
  var headFamily  = pack ? pack.displayFont : 'Impact,sans-serif';
  var headWeight  = pack ? (pack.headStyle.fontWeight || 900) : 900;
  var headStyleV  = pack ? (pack.headStyle.fontStyle  || 'normal') : 'normal';
  var headSpacing = pack ? (parseFloat(pack.headStyle.letterSpacing) || 0) : -1;
  var doUppercase = pack ? (pack.headStyle.textTransform === 'uppercase') : true;
  var catFamily   = pack ? pack.catStyle.fontFamily : 'Arial,sans-serif';

  // 3. Load pack font via @font-face injection + document.fonts.load() (plus fiable que FontFace API pour Canvas)
  var PACK_FONT_SRCS = {
    'impact-news':    { family:'Bebas Neue',       url:'/fonts/bebas-neue/bebas-neue-latin-400-normal.woff',              weight:400, style:'normal' },
    'edito-luxe':     { family:'Playfair Display',  url:'/fonts/playfair-display/playfair-display-latin-900-italic.woff',  weight:900, style:'italic' },
    'digital-native': { family:'Space Grotesk',     url:'/fonts/space-grotesk/space-grotesk-latin-700-normal.woff',        weight:700, style:'normal' },
    'minimal-power':  { family:'Syne',              url:'/fonts/syne/syne-latin-800-normal.woff',                          weight:800, style:'normal' },
    'neo-retro':      { family:'DM Serif Display',  url:'/fonts/dm-serif-display/dm-serif-display-latin-400-italic.woff',  weight:400, style:'italic' },
  };
  var fi = PACK_FONT_SRCS[data.packId];
  if (fi) {
    // Injecte @font-face dans le DOM si pas encore présent (1 seule fois par famille)
    var styleId = 'ff-' + data.packId;
    if (!document.getElementById(styleId)) {
      var style = document.createElement('style');
      style.id = styleId;
      style.textContent = '@font-face{font-family:\'' + fi.family + '\';src:url(\'' + fi.url + '\') format(\'woff\');font-weight:' + fi.weight + ';font-style:' + fi.style + ';}';
      document.head.appendChild(style);
    }
    // Attend que la police soit prête pour le Canvas
    try {
      await Promise.race([
        document.fonts.load(fi.style + ' ' + fi.weight + ' 72px \'' + fi.family + '\''),
        new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('font timeout')); }, 4000); }),
      ]);
    } catch(e) { console.warn('[Font]', e.message); }
    headFamily = '\'' + fi.family + '\',' + headFamily;
  }

  // 4. Text-wrap helper (uses ctx.measureText)
  function wrapLines(text, maxW, font) {
    ctx.font = font;
    var words = String(text).split(' ');
    var lines = []; var cur = '';
    words.forEach(function(w) {
      var candidate = cur ? cur + ' ' + w : w;
      if (ctx.measureText(candidate).width > maxW && cur) { lines.push(cur); cur = w; }
      else { cur = candidate; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // 5. Compute layout (badge → title → subtitle stacked from bottom)
  var titleText = doUppercase ? data.title.toUpperCase() : data.title;
  var headFont  = headStyleV + ' ' + headWeight + ' 88px ' + headFamily;
  var titleLines = wrapLines(titleText, W - 120, headFont);
  var lineH = 100;
  var titleH = titleLines.length * lineH;

  var subFont = '400 28px DM Sans,Arial,sans-serif';
  var subLines = wrapLines(data.subtitle, W - 120, subFont);
  var subH = subLines.length * 40;

  var badgeH = 48;
  var gap = 18;
  var totalH = badgeH + gap + titleH + gap + subH;
  var startY = H - 64 - totalH;

  // 6. Badge
  var BADGE_COLORS = { SPORT:'#E11D48', POLITIQUE:'#7C3AED', ECONOMIE:'#0EA5E9', CULTURE:'#F59E0B', TECH:'#10B981', SOCIETE:'#6366F1' };
  var badgeColor = data.primaryColor || BADGE_COLORS[data.category] || '#6366F1';
  var catLabel = data.category.toUpperCase();
  ctx.font = '700 19px ' + catFamily;
  var catW = ctx.measureText(catLabel).width + 36;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 4;
  ctx.fillStyle = badgeColor;
  ctx.beginPath(); ctx.roundRect(60, startY, catW, badgeH, 4); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 19px ' + catFamily;
  ctx.letterSpacing = '2px';
  ctx.fillText(catLabel, 78, startY + 33);
  ctx.letterSpacing = '0px';

  // 7. Title
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = 24; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#ffffff';
  ctx.font = headFont;
  ctx.letterSpacing = headSpacing + 'px';
  var ty = startY + badgeH + gap;
  titleLines.forEach(function(line, i) { ctx.fillText(line, 60, ty + 88 + i * lineH); });
  ctx.letterSpacing = '0px';

  // 8. Subtitle
  ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = subFont;
  var sy = ty + titleH + gap;
  subLines.forEach(function(line, i) { ctx.fillText(line, 60, sy + 28 + i * 40); });

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  return canvas.toDataURL('image/jpeg', 0.92);
}
window.__renderActuCanvas = renderActuCanvas;

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE — hub (Higgsfield-like) + creation (2 variations via tweak)
// ═══════════════════════════════════════════════════════════════════════════
const GenerateScreen = ({ layoutVariant, preset, onPickPreset, onBack, onGoToBoard, brandScore, onGoBrand }) => {
  if (preset) {
    return layoutVariant === 'chat'
      ? <GenerateChat preset={preset} onBack={onBack} onGoToBoard={onGoToBoard} brandScore={brandScore} onGoBrand={onGoBrand}/>
      : <GenerateStudio preset={preset} onBack={onBack} onGoToBoard={onGoToBoard} brandScore={brandScore} onGoBrand={onGoBrand}/>;
  }
  return <GenerateHub onPick={onPickPreset}/>;
};

const PRESETS = [
  { id: 'actu',     label: 'Actualité', desc: 'Du breaking au post en 90 secondes',
    tag: 'Le plus utilisé', icon: 'news',   img: 'assets/actu.webp',      visual: 'actu'  },
  { id: 'citation', label: 'Citation',  desc: 'Une phrase forte, mise en image',
    icon: 'quote',  img: 'assets/citation.webp',  visual: 'quote' },
  { id: 'deepdive', label: 'Deep Dive', desc: 'Carousel 6 slides — le format le plus sauvegardé',
    tag: 'Meilleur reach', icon: 'layers', img: 'assets/deep-dive.webp',  visual: 'bts'   },
];

const HUB_PLACEHOLDERS = [
  '« L\'IA vient de dépasser les médecins sur les diagnostics cancer du sein. On en parle ? »',
  '« Notre nouvelle collection automne arrive jeudi — faut créer l\'élan maintenant. »',
  '« Citation de notre CEO ce matin en conf : "L\'excellence, c\'est la répétition faite belle." »',
  '« Article du Monde sur la relocalisation textile en France — angle parfait pour nous. »',
  '« On vient de recevoir le prix Innovation Durable 2026 — comment on annonce ça ? »',
];

// ─── Format detector state partagé (survit entre re-renders) ─────────────────
var _hubDetectedFormat = null; // { format, label } affiché en temps réel

const GenerateHub = ({ onPick }) => {
  var [text,         setText]        = useState('');
  var [detecting,    setDetecting]   = useState(false);
  var [detectedFmt,  setDetectedFmt] = useState(null);
  var [err,          setErr]         = useState('');
  var [attachments,  setAttachments] = useState([]); // [{name, dataUrl, type}]
  var [dragging,     setDragging]    = useState(false);
  var debounceRef  = useRef(null);
  var taRef        = useRef(null);
  var fileInputRef = useRef(null);
  var placeholder  = HUB_PLACEHOLDERS[Math.floor(Date.now() / 30000) % HUB_PLACEHOLDERS.length];

  useEffect(function() {
    var el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [text]);

  var processFiles = function(files) {
    var allowed = Array.from(files).filter(function(f) {
      return f.type.startsWith('image/') || f.type === 'application/pdf';
    }).slice(0, 4); // max 4 fichiers
    allowed.forEach(function(file) {
      if (file.type.startsWith('image/')) {
        var reader = new FileReader();
        reader.onload = function(e) {
          setAttachments(function(prev) {
            if (prev.some(function(a) { return a.name === file.name; })) return prev;
            return [...prev, { name: file.name, dataUrl: e.target.result, type: 'image' }];
          });
        };
        reader.readAsDataURL(file);
      } else {
        setAttachments(function(prev) {
          if (prev.some(function(a) { return a.name === file.name; })) return prev;
          return [...prev, { name: file.name, dataUrl: null, type: 'file' }];
        });
      }
    });
  };

  var handlePaste = function(e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var imageFound = false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        var file = items[i].getAsFile();
        if (file) { e.preventDefault(); imageFound = true; processFiles([file]); break; }
      }
    }
    return imageFound;
  };

  var handleDragOver = function(e) { e.preventDefault(); e.stopPropagation(); setDragging(true); };
  var handleDragLeave = function(e) { e.preventDefault(); e.stopPropagation(); setDragging(false); };
  var handleDrop = function(e) {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  };
  var removeAttachment = function(i) {
    setAttachments(function(prev) { return prev.filter(function(_, j) { return j !== i; }); });
  };

  // Détection optimiste en tâche de fond dès 60 car (sans spinner, sans bloquer)
  var triggerSilentDetect = function(t) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (t.length < 60) { setDetectedFmt(null); return; }
    debounceRef.current = setTimeout(async function() {
      try {
        var res = await veilleFetch('/generate/detect-format', {
          method: 'POST',
          body: JSON.stringify({ text: t }),
        });
        var data = await res.json();
        if (res.ok && data.format) {
          var preset = PRESETS.find(function(p) { return p.id === data.format; }) || PRESETS[0];
          _hubDetectedFormat = { ...data, preset };
          setDetectedFmt({ id: data.format, label: preset.label });
        }
      } catch (_) { /* silencieux */ }
    }, 900); // 900ms debounce
  };

  var handleDetect = async function() {
    var t = text.trim();
    if (!t || detecting) return;
    var attachedImages = attachments.filter(function(a) { return a.type === 'image'; });

    // Si on a déjà une détection en cache (préchargée), on l'utilise directement
    if (_hubDetectedFormat && _hubDetectedFormat.preset) {
      var cached = _hubDetectedFormat;
      _hubDetectedFormat = null;
      onPick({ ...cached.preset, prefill: { ...cached, attachedImages }, autoStart: true });
      return;
    }

    setDetecting(true); setErr('');
    try {
      var res = await veilleFetch('/generate/detect-format', {
        method: 'POST',
        body: JSON.stringify({ text: t }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      var formatId = data.format || 'actu';
      var preset = PRESETS.find(function(p) { return p.id === formatId; }) || PRESETS[0];
      _hubDetectedFormat = null;
      onPick({ ...preset, prefill: { ...data, attachedImages }, autoStart: true });
    } catch (e) {
      setErr(e.message);
      setDetecting(false);
    }
  };

  var fmtBadgeLabel = detectedFmt
    ? { actu:'Actualité', citation:'Citation', deepdive:'Deep Dive' }[detectedFmt.id] || detectedFmt.label
    : null;

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Que veux-tu raconter ?</h1>
          <p className="page-subtitle">
            Décris ton idée — Forje détecte le bon format et génère le post.
          </p>
        </div>
      </div>

      <div
        className={`aiprompt${text.length > 0 || attachments.length > 0 ? ' aiprompt--active' : ''}${dragging ? ' aiprompt--dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="aiprompt-glow"/>

        {/* Drag overlay */}
        {dragging && (
          <div className="aiprompt-drop-overlay">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Dépose ici
          </div>
        )}

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="aiprompt-attachments">
            {attachments.map(function(att, i) {
              return att.type === 'image'
                ? (
                  <div key={i} className="aiprompt-att-img">
                    <img src={att.dataUrl} alt={att.name}/>
                    <button className="aiprompt-att-remove" onClick={function() { removeAttachment(i); }} title="Supprimer">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div key={i} className="aiprompt-att-file">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                    </svg>
                    <span>{att.name.length > 18 ? att.name.slice(0, 16) + '…' : att.name}</span>
                    <button className="aiprompt-att-remove aiprompt-att-remove--inline" onClick={function() { removeAttachment(i); }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                );
            })}
          </div>
        )}

        <textarea
          ref={taRef}
          className="aiprompt-ta"
          value={text}
          onChange={function(e) {
            var v = e.target.value;
            setText(v); setErr('');
            if (!detecting) triggerSilentDetect(v.trim());
          }}
          onKeyDown={function(e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleDetect(); }}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          autoFocus
        />

        <div className="aiprompt-bar">
          {/* Left: clip button + hint */}
          <div className="aiprompt-left">
            <button
              className="aiprompt-clip"
              onClick={function() { fileInputRef.current && fileInputRef.current.click(); }}
              title="Joindre image ou fichier">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display:'none' }}
              onChange={function(e) { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
            />
            <div className="aiprompt-hint">
              {err
                ? <span className="aiprompt-hint--err">{err}</span>
                : text.length > 0 && text.length < 10
                  ? <span className="aiprompt-hint--warn">Continue un peu…</span>
                  : fmtBadgeLabel && !detecting
                    ? <span className="aiprompt-hint--fmt">
                        <span className="aiprompt-fmt-dot"/>
                        <b>{fmtBadgeLabel}</b>
                        <span className="aiprompt-fmt-rest">détecté · ⌘↵ pour générer</span>
                      </span>
                    : <span className="aiprompt-hint--idle">
                        {detecting ? 'Analyse en cours…' : attachments.length > 0 ? 'Image jointe · ⌘↵ pour envoyer' : '⌘↵ pour envoyer · glisse une image'}
                      </span>}
            </div>
          </div>

          {/* Right: count + send */}
          <div className="aiprompt-right">
            {text.length > 0 && (
              <span className={`aiprompt-count${text.length > 500 ? ' aiprompt-count--over' : ''}`}>{text.length}</span>
            )}
            <button
              className={`aiprompt-send${detecting ? ' aiprompt-send--loading' : !text.trim() ? ' aiprompt-send--empty' : ' aiprompt-send--ready'}`}
              onClick={handleDetect}
              disabled={!text.trim() || detecting}
              title="Générer (⌘↵)">
              {detecting
                ? <span className="gen-bounce-loader--sm"/>
                : <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 13L8 3M8 3L3.5 7.5M8 3L12.5 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>}
            </button>
          </div>
        </div>
      </div>

      <div className="gen-section-divider">Ou choisissez un format directement</div>

      <div className="gen-preset-grid">
        {PRESETS.map(p => (
          <PresetCard key={p.id} preset={p} onPick={() => onPick(p)}/>
        ))}
      </div>
    </div>
  );
};

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
          <div className="pp-quote-mark">"</div>
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

// ─── Génération fonctionnelle (Actu / Citation / Deep Dive) ──────────────
const GEN_API = '/api';
var _genActive       = null; // preset ID of in-flight generation (survives navigation)
var _genStartTime    = null; // epoch ms when generation began (for loader resume)
var _abortController = null; // AbortController for the current in-flight fetch

async function veilleFetch(path, opts) {
  var sb = window.__supabase;
  var token = null;
  if (sb) { var sess = await sb.auth.getSession(); token = sess.data?.session?.access_token; }
  var headers = Object.assign({ 'Content-Type': 'application/json' }, opts && opts.headers);
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(GEN_API + path, Object.assign({}, opts, { headers }));
}

const GenFormInput = ({ value, onChange, placeholder, type, rows }) => {
  var r = rows || 3;
  if (type === 'input') {
    return (
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width:'100%', boxSizing:'border-box', background:'var(--app-surface-2)',
          border:'1px solid var(--app-line)', borderRadius:'var(--radius)', padding:'9px 12px',
          color:'var(--app-fg)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none',
          marginBottom:8 }}
      />
    );
  }
  return (
    <textarea
      className="tool-textarea"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={r}
    />
  );
};

const PhotoDropzone = ({ photoData, setPhotoData, photoUrl, setPhotoUrl }) => {
  var [dragOver, setDragOver] = useState(false);

  var readFile = function(file) {
    if (!file || !file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function(e) { setPhotoData(e.target.result); setPhotoUrl(''); };
    reader.readAsDataURL(file);
  };

  useEffect(function() {
    var onPaste = function(e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          readFile(items[i].getAsFile());
          e.preventDefault();
          break;
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return function() { document.removeEventListener('paste', onPaste); };
  }, []);

  return (
    <div>
      {photoData ? (
        <div style={{ position:'relative', marginBottom:8 }}>
          <img src={photoData} style={{ width:'100%', borderRadius:8, maxHeight:140, objectFit:'cover', display:'block' }}/>
          <button onClick={function() { setPhotoData(''); setPhotoUrl(''); }}
            style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,.65)',
              border:'none', borderRadius:'50%', width:22, height:22, color:'#fff',
              cursor:'pointer', fontSize:14, lineHeight:'22px', textAlign:'center' }}>
            x
          </button>
        </div>
      ) : (
        <div
          onDragOver={function(e) { e.preventDefault(); setDragOver(true); }}
          onDragLeave={function() { setDragOver(false); }}
          onDrop={function(e) { e.preventDefault(); setDragOver(false); readFile(e.dataTransfer.files[0]); }}
          onClick={function() {
            var inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = function(e) { readFile(e.target.files[0]); };
            inp.click();
          }}
          style={{ border:'2px dashed ' + (dragOver ? 'var(--app-accent)' : 'var(--app-line)'),
            borderRadius:8, padding:'18px 12px', textAlign:'center', cursor:'pointer',
            transition:'border-color .15s,background .15s', marginBottom:8,
            background: dragOver ? 'rgba(99,102,241,.05)' : 'transparent' }}
        >
          <div style={{ fontSize:12, color:'var(--app-fg-4)', lineHeight:1.7 }}>
            Glisse une photo ici<br/>
            ou <span style={{ color:'var(--app-accent)' }}>clique pour parcourir</span><br/>
            <span style={{ fontSize:11, opacity:.65 }}>Ctrl+V pour coller depuis le presse-papiers</span>
          </div>
        </div>
      )}
      <input
        value={photoUrl}
        onChange={function(e) { setPhotoUrl(e.target.value); setPhotoData(''); }}
        placeholder="ou colle une URL de photo..."
        style={{ width:'100%', boxSizing:'border-box', background:'var(--app-surface-2)',
          border:'1px solid var(--app-line)', borderRadius:'var(--radius)', padding:'8px 12px',
          color:'var(--app-fg)', fontFamily:'DM Sans,sans-serif', fontSize:12, outline:'none' }}
      />
    </div>
  );
};

// Dropzone légère pour une image de référence de style
const StyleRefDropzone = ({ value, onChange, label = 'Référence de style', hint = 'Influence l\'esthétique uniquement — le prompt prime' }) => {
  var readFile = function(file) {
    if (!file || !file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function(e) { onChange(e.target.result); };
    reader.readAsDataURL(file);
  };
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--app-fg-4)', letterSpacing:'0.08em',
        textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      {value ? (
        <div style={{ position:'relative', display:'inline-block' }}>
          <img src={value} style={{ width:72, height:72, borderRadius:8, objectFit:'cover',
            border:'1px solid var(--app-line)', display:'block' }}/>
          <button onClick={function(){ onChange(null); }}
            style={{ position:'absolute', top:-7, right:-7, background:'var(--app-surface-3)',
              border:'1px solid var(--app-line)', borderRadius:'50%', width:18, height:18, color:'var(--app-fg-3)',
              cursor:'pointer', fontSize:11, lineHeight:'18px', textAlign:'center', padding:0 }}>×</button>
          <div style={{ fontSize:10, color:'var(--app-fg-4)', marginTop:4, maxWidth:72, lineHeight:1.4 }}>{hint}</div>
        </div>
      ) : (
        <div onClick={function(){
          var inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
          inp.onchange = function(e){ readFile(e.target.files[0]); }; inp.click();
        }} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
          border:'1.5px dashed var(--app-line)', borderRadius:8, cursor:'pointer',
          background:'var(--app-surface)', transition:'border-color .15s',
          color:'var(--app-fg-4)', fontSize:12 }}>
          <AppIcon name="image" size={14}/>
          <span>Ajouter une ref de style <span style={{opacity:.55, fontSize:11}}>— {hint}</span></span>
        </div>
      )}
    </div>
  );
};

const GenFormFields = ({ preset, s }) => {
  if (preset.id === 'actu') return (<>
    <ToolSection title="Actu" icon="news">
      <GenFormInput value={s.newsText} onChange={s.setNewsText} rows={2}
        placeholder="Décris l'actu : qui, quoi, pourquoi ça compte..."/>
    </ToolSection>
    <ToolSection title="Visuel" icon="image">
      <div className="vis-mode-toggle">
        <button className={`vis-mode-btn${s.imageMode === 'ai' ? ' active' : ''}`} onClick={() => s.setImageMode('ai')}>
          ✦ IA — Cinématique
        </button>
        <button className={`vis-mode-btn${s.imageMode === 'classic' ? ' active' : ''}`} onClick={() => s.setImageMode('classic')}>
          Photo Google
        </button>
      </div>
      {/* Indicateur de temps estimé selon le mode */}
      <div className="vis-mode-timing">
        {s.imageMode === 'classic'
          ? <><AppIcon name="clock" size={11}/> <span>Rapide · ~15 sec</span></>
          : <><AppIcon name="clock" size={11}/> <span>Qualité max · ~60–90 sec</span></>}
      </div>
      {s.imageMode === 'classic' && (
        <div>
          <PhotoDropzone photoData={s.photoData} setPhotoData={s.setPhotoData}
            photoUrl={s.photoUrl} setPhotoUrl={s.setPhotoUrl}/>
          <div className="tool-sub">Sans photo, Forje cherche via Serper</div>
        </div>
      )}
      {s.imageMode === 'ai' && (
        <div>
          <div className="tool-sub">
            GPT Image-1 génère un visuel cinématique sur-mesure.
          </div>
          <StyleRefDropzone
            value={s.styleRefData}
            onChange={s.setStyleRefData}
            label="Ref de style (cette génération)"
            hint="usage unique — esthétique uniquement"/>
        </div>
      )}
    </ToolSection>
  </>);

  if (preset.id === 'citation') return (<>
    <ToolSection title="Citation" icon="quote">
      <GenFormInput value={s.quoteText} onChange={s.setQuoteText} rows={4}
        placeholder="Colle la citation ici..."/>
    </ToolSection>
    <ToolSection title="Auteur" icon="target">
      <GenFormInput type="input" value={s.authorName} onChange={s.setAuthorName}
        placeholder="Nom de l auteur"/>
      <GenFormInput type="input" value={s.authorTitle} onChange={s.setAuthorTitle}
        placeholder="Titre / fonction (optionnel)"/>
    </ToolSection>
  </>);

  if (preset.id === 'deepdive') return (<>
    <ToolSection title="Sujet du carousel" icon="layers">
      <GenFormInput value={s.topic} onChange={s.setTopic} rows={4}
        placeholder="Ex : Pourquoi les startups françaises échouent avant 3 ans…"/>
    </ToolSection>
    <ToolSection title="Visuels" icon="image">
      <div className="dd-mode-pills">
        {[['none','Typo seul','Rapide'],['serp','Photo web','~10s'],['genai','IA cinéma','~30s, 0.15$'],['hybrid','Hybrid','Recommandé']].map(([val, label, sub]) => (
          <button key={val}
            className={`dd-mode-pill${s.ddImageMode === val ? ' dd-mode-pill--active' : ''}`}
            onClick={() => s.setDdImageMode(val)}>
            <span className="dd-mode-pill-label">{label}</span>
            <span className="dd-mode-pill-sub">{sub}</span>
          </button>
        ))}
      </div>
    </ToolSection>
  </>);

  return null;
};

const LOADER_STEPS = {
  actu:     [[0,'Analyse de l\'actu…'],[5000,'Génération du visuel cinématique…'],[14000,'Rédaction du post…'],[22000,'Caption Instagram…'],[30000,'Finalisation…']],
  citation: [[0,'Composition visuelle…'],[6000,'Mise en forme typographique…'],[12000,'Finalisation…']],
  deepdive: [[0,'Orchestration du contenu…'],[10000,'Génération des 5 slides…'],[20000,'Sourcing des visuels…'],[35000,'Rendu du carousel…'],[48000,'Finalisation…']],
};
const LOADER_TOTAL = { actu: 36000, citation: 18000, deepdive: 60000 };

function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0');
}

const GenLoader = ({ preset, startTime, exiting }) => {
  const id    = preset?.id || 'actu';
  const steps = LOADER_STEPS[id] || LOADER_STEPS.actu;
  const start = startTime || Date.now();
  const elapsed = Date.now() - start;
  const initialStep = steps.reduce((acc, [delay], i) => (elapsed >= delay ? i : acc), 0);
  const [stepIdx,   setStepIdx]  = useState(initialStep);
  const [elapsedMs, setElapsed]  = useState(elapsed);

  useEffect(() => {
    const timers = steps.slice(1).map(([delay], i) => {
      const remaining = delay - (Date.now() - start);
      if (remaining <= 0) return null;
      return setTimeout(() => setStepIdx(i + 1), remaining);
    }).filter(Boolean);
    const tick = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => { timers.forEach(clearTimeout); clearInterval(tick); };
  }, []);

  return (
    <div className={`gen-card-loader${exiting ? ' gen-card-loader--exiting' : ''}`}>
      <button className="gen-card-loader__cancel" onClick={() => window.__cancelGen?.()}>
        Annuler
      </button>
      <div className="gen-speeder-fazers">
        <span/><span/><span/><span/>
      </div>
      <div className="gen-speeder">
        <span>
          <span/><span/><span/><span/>
        </span>
        <div className="gen-speeder-base">
          <span/>
          <div className="gen-speeder-face"/>
        </div>
      </div>
      <div className="gen-card-loader__step" key={stepIdx}>{steps[stepIdx][1]}</div>
      <div className="gen-card-loader__counter">{fmtElapsed(elapsedMs)}</div>
    </div>
  );
};

const GenerateChat = ({ preset, onBack, onGoToBoard, brandScore = 7, onGoBrand }) => {
  const GEN_KEY    = `forje_gen_result_${preset.id}`;
  const FEED_KEY   = `forje_gen_feed_${preset.id}`;
  const INPUTS_KEY = `forje_gen_inputs_${preset.id}`;

  const savedInputs = (() => { try { return JSON.parse(sessionStorage.getItem(INPUTS_KEY) || 'null'); } catch(_){ return null; } })();

  const [newsText,     setNewsText]     = useState(preset.prefill?.newsText   || savedInputs?.newsText   || '');
  const [photoUrl,     setPhotoUrl]     = useState('');
  const [photoData,    setPhotoData]    = useState('');
  const [quoteText,    setQuoteText]    = useState(preset.prefill?.quoteText  || savedInputs?.quoteText  || '');
  const [authorName,   setAuthorName]   = useState(preset.prefill?.authorName || savedInputs?.authorName || '');
  const [authorTitle,  setAuthorTitle]  = useState('');
  const [topic,        setTopic]        = useState(preset.prefill?.topic      || savedInputs?.topic      || '');
  // Mode image : si l'user vient du Hub (autoStart), on préfère 'classic' (plus rapide, ~15s vs ~90s)
  // L'user peut toujours basculer sur 'ai' depuis le formulaire
  const [imageMode,    setImageMode]    = useState(preset.autoStart ? 'classic' : 'ai');
  const [ddImageMode,  setDdImageMode]  = useState('none');
  const [styleRefData, setStyleRefData] = useState(null);
  const [generating,   setGenerating]   = useState(_genActive === preset.id || !!preset.autoStart);
  const [results,      setResults]      = useState([]);
  const [genPhase,     setGenPhase]     = useState('idle'); // idle|generating|exiting
  const [error,        setError]        = useState(null);
  const [activeSlide,  setActiveSlide]  = useState(0);
  const [expandedItem, setExpandedItem] = useState(null);
  const isMountedRef   = useRef(true);
  const loadingIdRef   = useRef(null);
  const autoStartedRef = useRef(false);
  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

  // Charge les posts depuis Supabase au mount
  useEffect(() => {
    const sb = window.__supabase;
    const user = window.__currentUser;
    if (!sb || !user) return;
    sb.from('generated_posts')
      .select('id, preset_id, title, subtitle, caption, category, pack_id, created_at, meta')
      .eq('user_id', user.id)
      .eq('preset_id', preset.id)
      .order('created_at', { ascending: true })
      .limit(20)
      .then(({ data }) => {
        if (!isMountedRef.current) return;
        if (data && data.length) {
          const dbItems = data.map(r => ({
            ...r.meta,
            id: r.id,
            preset_id: r.preset_id,
            title: r.title,
            subtitle: r.subtitle,
            caption: r.caption,
            category: r.category,
            packId: r.pack_id,
          }));
          // Preserve in-flight loading items and freshly-generated posts not yet saved to DB
          setResults(prev => {
            const dbIds = new Set(dbItems.map(r => r.id));
            const inFlight = prev.filter(r => r.loading || !dbIds.has(r.id));
            return [...dbItems, ...inFlight];
          });
        }
        // Si une génération est toujours en vol, restaure le placeholder de chargement
        if (_genActive === preset.id) {
          setGenPhase('generating');
          setResults(prev => {
            if (prev.some(r => r.loading)) return prev;
            return [...prev, { id: 'reload-loading', loading: true, preset_id: preset.id }];
          });
        }
      });
  }, []);

  // Callbacks globaux pour les générations en vol (survive aux navigations)
  useEffect(() => {
    var alive = true;
    window.__onGenResult = function(entry, presetId) {
      if (!alive || presetId !== preset.id) return;
      setResults(prev => {
        const loadingItem = prev.find(r => r.loading);
        if (loadingItem) {
          return prev.map(r => r.loading ? { ...entry, id: loadingItem.id } : r);
        }
        // Pas encore de placeholder (race Supabase load) — on append, Supabase dédupliquera au prochain mount
        return [...prev, entry];
      });
      setGenerating(false);
      setGenPhase('exiting');
      setTimeout(() => { if (alive) setGenPhase('idle'); }, 380);
    };
    window.__onGenError = function(msg, presetId) {
      if (!alive || presetId !== preset.id) return;
      setResults(prev => prev.filter(r => !r.loading));
      setGenerating(false);
      setGenPhase('idle');
      setError(msg);
    };
    return function() { alive = false; };
  }, []);

  const s = { newsText, setNewsText, photoUrl, setPhotoUrl, photoData, setPhotoData, quoteText, setQuoteText,
              authorName, setAuthorName, authorTitle, setAuthorTitle, topic, setTopic,
              imageMode, setImageMode, ddImageMode, setDdImageMode, styleRefData, setStyleRefData };

  const canGenerate = {
    actu:     newsText.trim().length > 10,
    citation: quoteText.trim().length > 3 && authorName.trim().length > 1,
    deepdive: topic.trim().length > 5,
  }[preset.id] || false;

  const handleGenerate = async () => {
    const lId = Date.now();
    loadingIdRef.current = lId;
    _genActive       = preset.id;
    _genStartTime    = Date.now();
    _abortController = new AbortController();
    window.__cancelGen = () => _abortController?.abort();
    if (isMountedRef.current) {
      setGenerating(true);
      setGenPhase('generating');
      setError(null);
      setActiveSlide(0);
      setResults(prev => [...prev, { id: lId, loading: true, preset_id: preset.id }]);
    }
    try { sessionStorage.setItem(INPUTS_KEY, JSON.stringify({ newsText, quoteText, topic, authorName })); } catch(_){}
    window.__setGenToast?.({ status: 'generating', label: preset.label, presetId: preset.id, preset });
    try {
      const userId   = window.__currentUser?.id;
      const clientId = window.__activeClientId || undefined;
      const ep   = { actu:'/generate/actu', citation:'/generate/citation', deepdive:'/generate/deepdive' }[preset.id];
      const body = {
        actu:     { newsText, photoUrl: photoUrl || undefined, photoData: photoData || undefined, userId, clientId, imageMode, styleRefData: styleRefData || undefined },
        citation: { quoteText, authorName, authorTitle: authorTitle || undefined, userId, clientId },
        deepdive: { topic, userId, clientId, imageMode: ddImageMode },
      }[preset.id];
      const res  = await veilleFetch(ep, { method: 'POST', body: JSON.stringify(body), signal: _abortController.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur génération');
      if (data.bgImage) { data.image = await renderActuCanvas(data); }
      window.__setGenToast?.({ status: 'ready', label: preset.label, presetId: preset.id, preset });
      const entry = { ...data, id: lId, preset_id: preset.id };
      // Sauvegarde Supabase — toujours, même si le composant est démonté
      const sb = window.__supabase; const user = window.__currentUser;
      if (sb && user) {
        sb.from('generated_posts').insert({
          user_id:   user.id,
          client_id: window.__activeClientId || null,
          preset_id: preset.id,
          title:     data.title     || null,
          subtitle:  data.subtitle  || null,
          caption:   data.caption   || null,
          image:     data.image     || null,
          category:  data.category  || null,
          pack_id:   data.packId    || null,
          meta:      (({ image: _i, bgImage: _b, ...rest }) => rest)(data),
        }).select('id').single().then(({ data: row }) => {
          if (row && isMountedRef.current) {
            setResults(prev => prev.map(r => r.id === lId ? { ...r, id: row.id } : r));
          }
        });
      }
      if (isMountedRef.current) {
        setResults(prev => prev.map(r => r.id === lId ? entry : r));
        setGenPhase('exiting');
        setTimeout(() => setGenPhase('idle'), 380);
        window.__setGenToast?.(null);
      } else {
        // Composant démonté — signal vers le nouveau composant s'il est déjà remonté
        window.__setGenToast?.(null);
        window.__onGenResult?.(entry, preset.id);
      }
    } catch (err) {
      window.__setGenToast?.(null);
      if (err.name === 'AbortError') {
        // Annulation silencieuse — pas d'affichage d'erreur
        if (isMountedRef.current) {
          setResults(prev => prev.filter(r => r.id !== lId));
          setGenPhase('idle');
        }
      } else if (isMountedRef.current) {
        setResults(prev => prev.filter(r => r.id !== lId));
        setGenPhase('idle');
        setError(err.message);
      } else {
        window.__onGenError?.(err.message, preset.id);
      }
    } finally {
      _genActive       = null;
      _genStartTime    = null;
      _abortController = null;
      window.__cancelGen = null;
      if (isMountedRef.current) setGenerating(false);
    }
  };

  // ─── AutoStart : si l'user vient du Hub avec un texte détecté, on génère immédiatement
  // On utilise une ref pour éviter de lancer 2x en React Strict Mode (double-invoke)
  useEffect(() => {
    if (!preset.autoStart || autoStartedRef.current) return;
    if (!canGenerate) return; // sécurité : les champs doivent être valides
    autoStartedRef.current = true;
    // Petit délai pour laisser le composant se monter entièrement (état + DOM)
    var t = setTimeout(function() {
      if (isMountedRef.current) handleGenerate();
    }, 120);
    return function() { clearTimeout(t); };
  }, [canGenerate]); // déclenche quand canGenerate devient true (après init des states)

  return (
    <div className="gen-studio-body">
      <div className="gen-studio-head">
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { sessionStorage.removeItem(GEN_KEY); onBack(); }}>
            <AppIcon name="chevLeft" size={12}/>Formats
          </button>
          {preset.fromBoard && (
            <button className="btn btn-ghost btn-sm" style={{ color:'var(--app-accent)' }}
              onClick={() => { onGoToBoard?.(); }}>
              <AppIcon name="news" size={12}/>Board
            </button>
          )}
        </div>
        <div className="gen-studio-title-row">
          <AppIcon name={preset.icon} size={14} style={{color:'var(--app-fg-3)'}}/>
          <h1 className="gen-studio-title">{preset.label}</h1>
        </div>
        <div className="gen-studio-actions">
        </div>
      </div>

      <div className="gen-studio-grid gen-studio-grid--studio">
        {/* LEFT : formulaire */}
        <div className="gen-tools">
          {/* Bandeau brand health — affiché si identité incomplète */}
          {brandScore < 4 && (
            <div className="gen-brand-warn-banner">
              <div className="gen-brand-warn-main">
                <AppIcon name="bolt" size={13}/>
                <span>Tes posts seront génériques — ton identité de marque est incomplète ({brandScore}/7 champs)</span>
              </div>
              {onGoBrand && (
                <button className="gen-brand-warn-link" onClick={onGoBrand}>
                  Configurer en 2 min →
                </button>
              )}
            </div>
          )}
          {/* Bandeau "généré depuis le Hub" — affiché seulement en mode autoStart */}
          {preset.autoStart && preset.prefill && (
            <div className="gen-autostart-banner">
              <AppIcon name="bolt" size={12}/>
              <span>Généré depuis ta saisie · modifie les champs et relance si besoin</span>
            </div>
          )}
          <GenFormFields preset={preset} s={s}/>
          {error && (
            <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, fontSize:12,
              background:'rgba(197,48,48,.06)', border:'1px solid rgba(197,48,48,.15)', color:'#C53030' }}>
              {error}
            </div>
          )}
          <button
            className={`btn-forge${!canGenerate ? ' btn-forge--inactive' : ''}`}
            onClick={canGenerate ? handleGenerate : () => setError(
              { actu:'Décris l\'actu (10 caractères min.)', citation:'Remplis la citation et l\'auteur.', deepdive:'Décris le sujet (5 caractères min.).' }[preset.id]
            )}
            disabled={generating}>
            {generating
              ? <><span style={{ display:'inline-block', width:13, height:13, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'vb-spin .7s linear infinite' }}/> Génération…</>
              : <><AppIcon name="sparkle" size={15}/> Générer</>}
          </button>
        </div>

        {/* RIGHT : colonne résultats — loading épinglé au-dessus du scroll */}
        <div className="gen-results-col">
          {results.some(r => r.loading) && (
            <div className="gen-feed-card gen-feed-card--loading">
              <GenLoader preset={preset} startTime={_genStartTime} exiting={genPhase === 'exiting'}/>
            </div>
          )}
          <div className="gen-feed-panel">
            {[...results].filter(r => !r.loading).reverse().map(item =>
              <GenFeedCard key={item.id} item={item} onExpand={setExpandedItem}/>
            )}
          </div>
        </div>
      </div>
      {expandedItem && <GenExpandModal item={expandedItem} onClose={() => setExpandedItem(null)}/>}
    </div>
  );
};

const IgCaption = ({ caption }) => {
  const [text, setText]   = React.useState(caption);
  const [copied, setCopied] = React.useState(false);
  const taRef = React.useRef(null);

  // Auto-resize à chaque frappe
  React.useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [text]);

  const copy  = () => navigator.clipboard.writeText(text).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  });
  const reset = () => { setText(caption); };
  const isDirty = text !== caption;

  return (
    <div className="gen-preview-caption gen-ig-caption">
      <div className="caption-head">
        <span className="caption-label">Caption Instagram</span>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {isDirty && (
            <button className="btn btn-ghost btn-sm" onClick={reset}
              style={{ padding:'3px 8px', fontSize:11, color:'var(--app-fg-3)' }}>
              Réinitialiser
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={copy} style={{ padding:'3px 10px', fontSize:11 }}>
            {copied ? '✓ Copié' : 'Copier'}
          </button>
        </div>
      </div>
      <textarea
        ref={taRef}
        className="caption-ig-body caption-ig-editable"
        value={text}
        onChange={e => setText(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
};

/* ── Carte de résultat dans le feed ──────────────────────────────────── */
function downloadImage(dataUrl) {
  var a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'forje-post.jpg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const GenFeedCard = ({ item, onExpand }) => {
  const src0 = item.preset_id === 'deepdive' ? item.images?.[0] : item.image;
  const [src,     setSrc]     = useState(src0 || null);
  const [caption, setCaption] = useState(item.caption || '');
  const [copied,  setCopied]  = useState(false);
  const taRef = useRef(null);

  // Lazy-load image for historical posts (excluded from initial SELECT for perf)
  useEffect(() => {
    if (src || !item.id || typeof item.id === 'number') return;
    const sb = window.__supabase;
    if (!sb) return;
    sb.from('generated_posts').select('image').eq('id', item.id).single()
      .then(({ data }) => { if (data?.image) setSrc(data.image); });
  }, [item.id]);

  const copy = () => navigator.clipboard.writeText(caption).then(() => {
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  });

  return (
    <div className="gen-feed-card gen-result--entering">
      <div className="gen-feed-thumb" onClick={() => onExpand({ ...item, image: src || item.image })} title="Voir en grand">
        {src ? <img src={src} alt=""/> : <div className="gen-feed-thumb-empty"/>}
        <div className="gen-feed-thumb-expand"><AppIcon name="image" size={13}/></div>
      </div>
      <div className="gen-feed-content">
        {item.title && (
          <div className="gen-feed-meta">
            {item.category && <span className="caption-label" style={{fontSize:11}}>{item.category}</span>}
            <div className="gen-feed-title">{item.title}</div>
            {item.subtitle && <div className="gen-feed-subtitle">{item.subtitle}</div>}
          </div>
        )}
        <div className="gen-feed-caption-wrap">
          <div className="caption-head">
            <span className="caption-label">Caption Instagram</span>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {src && (
                <button className="btn btn-accent btn-sm" onClick={() => downloadImage(src)}
                  style={{ padding:'3px 10px', fontSize:11, display:'flex', alignItems:'center', gap:5 }}>
                  <AppIcon name="arrowUp" size={11}/>
                  Télécharger
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={copy} style={{padding:'3px 10px', fontSize:11}}>
                {copied ? '✓ Copié' : 'Copier'}
              </button>
            </div>
          </div>
          <textarea
            ref={taRef}
            className="caption-ig-body caption-ig-editable"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};

/* ── Modale plein écran d'une carte ──────────────────────────────────── */
const GenExpandModal = ({ item, onClose }) => {
  const images = item.preset_id === 'deepdive' ? (item.images || []) : (item.image ? [item.image] : []);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="gen-expand-overlay" onClick={onClose}>
      <div className="gen-expand-modal" onClick={e => e.stopPropagation()}>
        <button className="gen-expand-close" onClick={onClose}>
          <AppIcon name="x" size={16}/>
        </button>
        <img src={images[slide] || images[0]} alt="" className="gen-expand-img"/>
        {images.length > 1 && (
          <div className="gen-expand-slides">
            {images.map((_, i) => (
              <button key={i} className={`gen-variant-btn${slide===i?' active':''}`} onClick={() => setSlide(i)}>
                Slide {i+1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const GenerateStudio = GenerateChat;

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

const CAL_EVENTS = [];
const DAY_LABELS = ['LUN','MAR','MER','JEU','VEN','SAM','DIM'];
const getWeekDays = (offset = 0) => {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  return DAY_LABELS.map((l, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return { label: l, num: d.getDate(), date: d };
  });
};
const fmtWeekRange = (days) => {
  const start = days[0].date;
  const end = days[6].date;
  const opts = { month:'long' };
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${start.getDate()} – ${end.getDate()} ${start.toLocaleDateString('fr-FR', opts)} ${start.getFullYear()}`
    : `${start.getDate()} ${start.toLocaleDateString('fr-FR', opts)} – ${end.getDate()} ${end.toLocaleDateString('fr-FR', opts)} ${end.getFullYear()}`;
};
const QueueCalendar = () => {
  const [weekOffset, setWeekOffset] = useState(0);
  const WEEK = getWeekDays(weekOffset);
  const todayNum = new Date().getDate();
  const todayOffset = 0;
  return (
  <div className="card cal-card">
    <div className="cal-head">
      <div className="cal-nav">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setWeekOffset(o => o - 1)}><AppIcon name="chevLeft" size={12}/></button>
        <span className="cal-range">{fmtWeekRange(WEEK)}</span>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setWeekOffset(o => o + 1)}><AppIcon name="chevRight" size={12}/></button>
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
      {WEEK.map((d, di) => {
        const isToday = weekOffset === 0 && di === ((new Date().getDay() + 6) % 7);
        return (
          <div key={di} className="cal-day-col">
            <div className="cal-day-head">
              <span className="cal-day-label">{d.label}</span>
              <span className={`cal-day-num ${isToday ? 'today' : ''}`}>{d.num}</span>
            </div>
            {[6,8,10,12,14,16,18,20].map(h => <div key={h} className="cal-slot"/>)}
            {CAL_EVENTS.filter(e => e.day === di).map((e, i) => {
              const top = ((e.hour - 6) / 2) * 64 + 40;
              return (
                <div key={i} className={`cal-event cal-event--${e.type} ${e.status==='draft'?'draft':''}`}
                     style={{top, height: e.dur * 64 - 6}}>
                  <div className="cal-event-time">{e.hour}:00</div>
                  <div className="cal-event-title">{e.title}</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  </div>
  );
};

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
const QueueFeed = () => {
  const [validated, setValidated] = useState(new Set());
  const [preview, setPreview] = useState(null);
  return (
    <div className="queue-feed">
      {preview && (
        <div className="feed-preview-overlay" onClick={() => setPreview(null)}>
          <div className="feed-preview-modal" onClick={e => e.stopPropagation()}>
            <div className={`feed-preview-thumb feed-thumb--${preview.swatch}`}>
              <div className="feed-thumb-inner" style={{transform:'scale(2.5)', transformOrigin:'center'}}>
                {preview.swatch === 'quote' && <div className="feed-thumb-quote">"</div>}
                {preview.swatch === 'bts' && <div className="feed-thumb-label">COULISSES<br/>03</div>}
                {preview.swatch === 'news' && <div className="feed-thumb-chip">• ACTU</div>}
                {preview.swatch === 'product' && <div className="feed-thumb-label">MARGOT<br/>CAMEL</div>}
                {preview.swatch === 'pedago' && <div className="feed-thumb-label">LE MOT<br/>Skiver</div>}
              </div>
            </div>
            <div style={{padding:'20px 24px'}}>
              <div className="feed-title" style={{fontSize:16, marginBottom:8}}>{preview.title}</div>
              <div className="feed-caption" style={{fontSize:13}}>{preview.caption}</div>
            </div>
            <button onClick={() => setPreview(null)} style={{position:'absolute',top:12,right:14,background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--app-fg-3)'}}>×</button>
          </div>
        </div>
      )}
      {FEED_ITEMS.map((it, i) => {
        const isValidated = validated.has(i);
        return (
          <div key={i} className={`feed-row card${isValidated ? ' feed-row--validated' : ''}`}>
            <div className={`feed-thumb feed-thumb--${it.swatch}`}>
              <div className="feed-thumb-inner">
                {it.swatch === 'quote' && <div className="feed-thumb-quote">"</div>}
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
                <span className={`tag tag-dot ${isValidated ? 'tag-success' : it.status==='ready' ? 'tag-success' : 'tag-warn'}`} style={{marginLeft:'auto'}}>
                  {isValidated ? '✓ Validé' : it.status==='ready' ? 'Prêt' : 'Brouillon'}
                </span>
              </div>
              <div className="feed-title">{it.title}</div>
              <div className="feed-caption">{it.caption}</div>
              <div className="feed-actions">
                <Btn variant="ghost" size="sm" icon="eye" onClick={() => setPreview(it)}>Aperçu</Btn>
                <Btn variant="ghost" size="sm" icon="edit">Éditer</Btn>
                {!isValidated
                  ? <Btn variant="accent" size="sm" icon="check" onClick={() => setValidated(v => new Set([...v, i]))}>Valider</Btn>
                  : <Btn variant="ghost" size="sm" icon="check" style={{color:'var(--app-success,#16a34a)'}} onClick={() => setValidated(v => { const n=new Set(v); n.delete(i); return n; })}>Validé ✓</Btn>}
                <Btn variant="ghost" size="sm" icon="more" style={{marginLeft:'auto'}}/>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

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
        Aperçu du feed Instagram — 9 dernières cases
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

// ═════════════════════════════════════════════════════════════════════════// BRAND — Identite Visuelle
// =============================================================================

// 5 font packs bases sur l'analyse des medias Instagram 2026
const FONT_PACKS = [
  {
    id: 'impact-news', name: 'Impact News',
    tags: ['Puissant', 'Direct', 'Urgent'], usage: 'Breaking, Actu, Sport',
    displayFont: "'Bebas Neue',Impact,sans-serif",
    bg: '#ffffff',
    decoType: 'word', decoBg: '#f0f0f0', decoText: 'NOW',
    catStyle:  { fontFamily:"'Barlow Condensed',Arial,sans-serif", fontWeight:600, fontSize:8, letterSpacing:'0.25em', textTransform:'uppercase', color:'#999' },
    headStyle: { fontFamily:"'Bebas Neue',Impact,sans-serif", fontSize:34, fontWeight:400, letterSpacing:'0.02em', textTransform:'uppercase', lineHeight:'0.9', color:'#0a0a0a' },
    subStyle:  { fontFamily:"'Barlow Condensed',Arial,sans-serif", fontWeight:700, fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', color:'#333' },
    bodyStyle: { fontFamily:"Barlow,Arial,sans-serif", fontWeight:300, fontSize:8, color:'#777', lineHeight:'1.6' },
    sampleCat: 'Breaking', sampleHead: 'LA FRANCE EN ALERTE', sampleSub: 'Gouvernement · 14h32', sampleBody: 'Le PM annonce un plan urgence.',
  },
  {
    id: 'edito-luxe', name: 'Edito Luxe',
    tags: ['Elegant', 'Editorial', 'Luxe'], usage: 'Magazine, Culture, Interview',
    displayFont: "'Playfair Display',Georgia,serif",
    bg: '#1a1612',
    decoType: 'char', decoBg: '#2a2418', decoText: 'E',
    catStyle:  { fontFamily:"Jost,Arial,sans-serif", fontWeight:200, fontSize:7, letterSpacing:'0.4em', textTransform:'uppercase', color:'#8a7a60' },
    headStyle: { fontFamily:"'Playfair Display',Georgia,serif", fontSize:28, fontWeight:900, fontStyle:'italic', lineHeight:'1.05', color:'#e8ddc8', letterSpacing:'-0.01em' },
    subStyle:  { fontFamily:"'Cormorant Garamond',Georgia,serif", fontWeight:600, fontSize:10, color:'#a08060', letterSpacing:'0.05em' },
    bodyStyle: { fontFamily:"Jost,Arial,sans-serif", fontWeight:200, fontSize:8, color:'#6a5a48', lineHeight:'1.8' },
    sampleCat: 'Culture — Cinema', sampleHead: "L'art de prendre le temps", sampleSub: 'Rencontre avec Sofia Coppola', sampleBody: 'Une conversation sur la creation.',
  },
  {
    id: 'digital-native', name: 'Digital Native',
    tags: ['Tech', 'Gen Z', 'Nerdy'], usage: 'Tech, IA, Culture Gen Z',
    displayFont: "'Space Grotesk',Arial,sans-serif",
    bg: '#0d0f14',
    decoType: 'grid', decoBg: '#1a1f2e',
    catStyle:  { fontFamily:"'DM Mono','Courier New',monospace", fontSize:7, letterSpacing:'0.2em', textTransform:'lowercase', color:'#4060ff' },
    headStyle: { fontFamily:"'Space Grotesk',Arial,sans-serif", fontSize:30, fontWeight:700, letterSpacing:'-0.03em', lineHeight:'1.0', color:'#e8eeff' },
    subStyle:  { fontFamily:"'DM Sans',Arial,sans-serif", fontWeight:500, fontSize:8, color:'#6080cc', letterSpacing:'0.02em' },
    bodyStyle: { fontFamily:"'DM Mono','Courier New',monospace", fontSize:7, color:'#405888', lineHeight:'1.6' },
    sampleCat: '// Tech — 09:41 AM', sampleHead: "L'IA change tout.", sampleSub: 'OpenAI · Anthropic · 2026', sampleBody: '→ thread complet en story',
  },
  {
    id: 'minimal-power', name: 'Minimal Power',
    tags: ['Premium', 'Silence', 'Autorite'], usage: 'Finance, Economie, Premium',
    displayFont: "Syne,'Arial Black',sans-serif",
    bg: '#f5f4f2',
    decoType: 'line', decoBg: '#ddd',
    catStyle:  { fontFamily:"Outfit,Arial,sans-serif", fontWeight:200, fontSize:7, letterSpacing:'0.5em', textTransform:'uppercase', color:'#bbb' },
    headStyle: { fontFamily:"Syne,'Arial Black',sans-serif", fontSize:34, fontWeight:800, letterSpacing:'-0.04em', lineHeight:'0.9', textTransform:'uppercase', color:'#111' },
    subStyle:  { fontFamily:"Outfit,Arial,sans-serif", fontWeight:600, fontSize:8, letterSpacing:'0.15em', textTransform:'uppercase', color:'#555' },
    bodyStyle: { fontFamily:"Outfit,Arial,sans-serif", fontWeight:200, fontSize:8, color:'#999', lineHeight:'1.9' },
    sampleCat: 'Opinion — Finance', sampleHead: 'BOURSE CRASH 2026', sampleSub: 'Analyse · Bloomberg Markets', sampleBody: 'Quand le silence des marches devient signal.',
  },
  {
    id: 'neo-retro', name: 'Neo-Retro',
    tags: ['Chaleureux', 'Humain', 'Nostalgique'], usage: 'Enquetes, Lifestyle, Slow media',
    displayFont: "'DM Serif Display',Georgia,serif",
    bg: '#1c1410',
    decoType: 'quote', decoBg: '#2a1e14',
    catStyle:  { fontFamily:"Lato,Arial,sans-serif", fontWeight:300, fontSize:7, letterSpacing:'0.35em', textTransform:'uppercase', color:'#c8a87a' },
    headStyle: { fontFamily:"'DM Serif Display',Georgia,serif", fontSize:28, fontStyle:'italic', lineHeight:'1.05', color:'#f0e8d8', fontWeight:400 },
    subStyle:  { fontFamily:"'DM Serif Text',Georgia,serif", fontSize:10, color:'#a08060', letterSpacing:'0.02em', fontWeight:400 },
    bodyStyle: { fontFamily:"Lato,Arial,sans-serif", fontWeight:300, fontSize:8, color:'#6a5848', lineHeight:'1.8' },
    sampleCat: 'Societe — Enquete', sampleHead: 'Vivre autrement, enfin.', sampleSub: 'Le grand retour des communs', sampleBody: 'Des milliers reinventent le collectif.',
  },
];

const PACK_FONTS = {
  'impact-news':    'Bebas Neue',
  'edito-luxe':     'Playfair Display',
  'digital-native': 'Space Grotesk',
  'minimal-power':  'Syne',
  'neo-retro':      'DM Serif Display',
};

const STYLE_TO_PACK = {
  'magazine': 'edito-luxe', 'breaking': 'impact-news', 'sport': 'impact-news',
  'lifestyle': 'neo-retro', 'minimaliste': 'minimal-power',
};

const BRAND_MOODS = [
  { id: 'dramatique', label: 'Dramatique', desc: 'Ambiance sombre et intense. Ombres, contrastes forts, cinematique.' },
  { id: 'energique',  label: 'Energique',  desc: 'Dynamisme et couleurs vibrantes. Cadrage en mouvement.' },
  { id: 'premium',    label: 'Premium',    desc: 'Elegance et sobriete. Lumiere douce, composition epuree.' },
  { id: 'populaire',  label: 'Populaire',  desc: 'Direct et immediatement lisible. Contraste maximal.' },
  { id: 'factuel',    label: 'Factuel',    desc: 'Propre et neutre. Journalistique. Credibilite avant tout.' },
];

const BRAND_TONES = [
  'Direct', 'Percutant', 'Informatif', 'Premium', 'Populaire',
  'Serieux', 'Engage', 'Decale', 'Expert', 'Accessible',
  'Emotionnel', 'Factuel', 'Inspirant', 'Provocateur', 'Pedagogue',
];

// Carte "Brand Kit" — pack personnalisé basé sur font_primary / fontBody du client
const CustomPackCard = function(props) {
  var active = props.active; var onSelect = props.onSelect;
  var fontTitle = props.fontPrimary || 'DM Sans';
  var fontBody  = props.fontBody    || 'DM Sans';
  var accent    = props.accentColor || '#6366F1';
  var primary   = props.primaryColor|| '#111';
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:8, overflow:'hidden',
      transition:'border-color .15s',
      border:'2px solid ' + (active ? accent : 'var(--app-line)'),
      background: active ? 'rgba(99,102,241,.04)' : 'transparent' }}>
      <div style={{ aspectRatio:'4/5', background:'#0a0a12', position:'relative', overflow:'hidden',
        padding:'10px 9px', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
        <div style={{ position:'absolute', top:-6, right:-4, fontSize:68, lineHeight:'1', opacity:.13,
          fontFamily:"'" + fontTitle + "',sans-serif", color:'#fff', pointerEvents:'none', userSelect:'none' }}>
          Aa
        </div>
        <div style={{ fontSize:7, letterSpacing:'0.3em', textTransform:'uppercase', color: accent, fontFamily:'DM Sans,sans-serif', fontWeight:600, position:'relative', zIndex:1 }}>
          Brand Kit
        </div>
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ fontFamily:"'" + fontTitle + "',Impact,sans-serif", fontSize:22, fontWeight:700, lineHeight:'1.0', color:'#fff', marginBottom:4 }}>
            TON TITRE ICI
          </div>
          <div style={{ fontFamily:"'" + fontBody + "',DM Sans,sans-serif", fontSize:8, color:'rgba(255,255,255,.45)', lineHeight:'1.6' }}>
            Corps de texte
          </div>
        </div>
        <div style={{ fontSize:8, color:'rgba(255,255,255,.25)', fontFamily:'DM Sans,sans-serif' }}>{fontTitle}</div>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background: accent }}/>
      </div>
      <div style={{ padding:'8px 10px', background:'var(--app-surface-2)', borderTop:'1px solid var(--app-line)' }}>
        <div style={{ fontWeight:600, fontSize:11, marginBottom:3, color: active ? accent : 'var(--app-fg)' }}>Personnalisé</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginBottom:3 }}>
          {['Brand Kit', 'Sur mesure'].map(function(t) {
            return <span key={t} style={{ fontSize:8, padding:'1px 5px', borderRadius:8, border:'1px solid var(--app-line)', color:'var(--app-fg-4)' }}>{t}</span>;
          })}
        </div>
        <div style={{ fontSize:9, color:'var(--app-fg-4)' }}>{fontTitle} + {fontBody}</div>
      </div>
    </div>
  );
};

// Mini card representing a font pack (used in the picker grid)
const PackMiniCard = function(props) {
  var pack = props.pack; var active = props.active; var onSelect = props.onSelect;
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:8, overflow:'hidden',
      transition:'border-color .15s',
      border:'2px solid ' + (active ? 'var(--app-accent)' : 'var(--app-line)'),
      background: active ? 'rgba(99,102,241,.04)' : 'transparent' }}>
      <div style={{ aspectRatio:'4/5', background:pack.bg, position:'relative', overflow:'hidden',
        padding:'10px 9px', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
        {pack.decoType === 'word' && (
          <div style={{ position:'absolute', top:-4, right:-4, fontSize:72, lineHeight:'1',
            fontFamily:pack.displayFont, color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>
            {pack.decoText}
          </div>
        )}
        {pack.decoType === 'grid' && (
          <div style={{ position:'absolute', inset:0, opacity:.6,
            backgroundImage:'linear-gradient('+pack.decoBg+' 1px,transparent 1px),linear-gradient(90deg,'+pack.decoBg+' 1px,transparent 1px)',
            backgroundSize:'16px 16px' }}/>
        )}
        {pack.decoType === 'quote' && (
          <div style={{ position:'absolute', bottom:-8, right:4, fontSize:52, lineHeight:'1',
            fontFamily:pack.displayFont, color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>"</div>
        )}
        {pack.decoType === 'char' && (
          <div style={{ position:'absolute', top:-4, right:4, fontSize:60, lineHeight:'1',
            fontFamily:pack.displayFont, fontStyle:'italic', color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>
            {pack.decoText}
          </div>
        )}
        {pack.decoType === 'line' && (
          <div style={{ position:'absolute', bottom:20, left:9, right:9, height:1, background:pack.decoBg }}/>
        )}
        <div style={{ ...pack.catStyle, position:'relative', zIndex:1 }}>{pack.sampleCat}</div>
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ ...pack.headStyle }}>{pack.sampleHead}</div>
          <div style={{ height:4 }}/>
          <div style={{ ...pack.subStyle }}>{pack.sampleSub}</div>
        </div>
        <div style={{ ...pack.bodyStyle, position:'relative', zIndex:1 }}>{pack.sampleBody}</div>
      </div>
      <div style={{ padding:'8px 10px', background:'var(--app-surface-2)', borderTop:'1px solid var(--app-line)' }}>
        <div style={{ fontWeight:600, fontSize:11, marginBottom:3,
          color: active ? 'var(--app-accent)' : 'var(--app-fg)' }}>{pack.name}</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginBottom:3 }}>
          {pack.tags.map(function(t) {
            return <span key={t} style={{ fontSize:8, padding:'1px 5px', borderRadius:8,
              border:'1px solid var(--app-line)', color:'var(--app-fg-4)' }}>{t}</span>;
          })}
        </div>
        <div style={{ fontSize:9, color:'var(--app-fg-4)' }}>{pack.usage}</div>
      </div>
    </div>
  );
};

// Live preview panel (right column)
const BrandPostPreview = function(props) {
  var isCustom     = props.graphicStyle === 'custom';
  var pack         = isCustom ? null : FONT_PACKS.find(function(p) { return p.id === props.graphicStyle; });
  var primaryColor = props.primaryColor;
  var accentColor  = props.accentColor;
  var logoUrl      = props.logoUrl;
  var name         = props.name;
  var badgeVisible = props.badgeVisible !== false;
  var barVisible   = props.barVisible !== false;
  var fontTitle    = props.fontPrimary || (pack ? pack.headStyle.fontFamily : 'DM Sans');
  var fontBody     = props.fontSecondary || (pack ? pack.bodyStyle.fontFamily : 'DM Sans');

  if (isCustom) {
    return (
      <div style={{ width:220, aspectRatio:'4/5', borderRadius:12, overflow:'hidden',
        background:'#08080f', position:'relative', boxShadow:'0 20px 60px rgba(0,0,0,.45)', flexShrink:0 }}>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,.85) 100%)' }}/>
        {logoUrl && (
          <img src={logoUrl} alt="" style={{ position:'absolute', top:14, right:14,
            height:40, width:'auto', objectFit:'contain', zIndex:2 }}/>
        )}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'16px 14px', zIndex:1 }}>
          {badgeVisible && (
            <div style={{ display:'inline-block', padding:'2px 8px', borderRadius:3,
              background: accentColor || primaryColor, fontSize:9, fontWeight:700, color:'#fff',
              letterSpacing:1.5, marginBottom:8, textTransform:'uppercase', fontFamily:'DM Sans,sans-serif' }}>
              SPORT
            </div>
          )}
          <div style={{ fontFamily:"'" + fontTitle + "',Impact,sans-serif", fontSize:22, fontWeight:700,
            color:'#fff', lineHeight:1.05, marginBottom:6, textTransform:'uppercase' }}>
            {name ? name.toUpperCase() : 'TON TITRE ICI'}
          </div>
          <div style={{ fontFamily:"'" + fontBody + "',DM Sans,sans-serif", fontSize:10, color:'rgba(255,255,255,.55)', lineHeight:1.5 }}>
            L'actu en temps réel.
          </div>
          {barVisible && (
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background: accentColor || primaryColor }}/>
          )}
        </div>
      </div>
    );
  }

  if (pack) {
    var isLight = pack.bg === '#ffffff' || pack.bg === '#f5f4f2';
    return (
      <div style={{ width:220, aspectRatio:'4/5', borderRadius:12, overflow:'hidden',
        background:pack.bg, position:'relative', boxShadow:'0 20px 60px rgba(0,0,0,.45)', flexShrink:0 }}>
        {pack.decoType === 'word' && (
          <div style={{ position:'absolute', top:-15, right:-10, fontSize:140, lineHeight:'1',
            fontFamily:pack.displayFont, color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>
            {pack.decoText}
          </div>
        )}
        {pack.decoType === 'grid' && (
          <div style={{ position:'absolute', inset:0, opacity:.45,
            backgroundImage:'linear-gradient('+pack.decoBg+' 1px,transparent 1px),linear-gradient(90deg,'+pack.decoBg+' 1px,transparent 1px)',
            backgroundSize:'28px 28px' }}/>
        )}
        {pack.decoType === 'quote' && (
          <div style={{ position:'absolute', bottom:-15, right:8, fontSize:100, lineHeight:'1',
            fontFamily:pack.displayFont, color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>"</div>
        )}
        {pack.decoType === 'char' && (
          <div style={{ position:'absolute', top:-12, right:8, fontSize:100, lineHeight:'1',
            fontFamily:pack.displayFont, fontStyle:'italic', color:pack.decoBg, pointerEvents:'none', userSelect:'none' }}>
            {pack.decoText}
          </div>
        )}
        {pack.decoType === 'line' && (
          <div style={{ position:'absolute', bottom:65, left:16, right:16, height:1, background:pack.decoBg }}/>
        )}
        {!isLight && (
          <div style={{ position:'absolute', inset:0,
            background:'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,.75) 100%)' }}/>
        )}
        {logoUrl && (
          <img src={logoUrl} alt="" style={{ position:'absolute', top:14, right:14, height:22,
            width:'auto', objectFit:'contain', zIndex:2,
            filter: isLight ? 'none' : 'brightness(0) invert(1)' }}/>
        )}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'16px 14px', zIndex:1 }}>
          {badgeVisible && (
            <div style={{ display:'inline-block', padding:'2px 8px',
              background:primaryColor, fontSize:9, fontWeight:700, color:'#fff',
              letterSpacing:1.5, marginBottom:8, textTransform:'uppercase',
              fontFamily:pack.catStyle.fontFamily }}>
              SPORT
            </div>
          )}
          <div style={{ ...pack.headStyle, fontFamily: fontTitle, fontSize: Math.round(pack.headStyle.fontSize * .65), marginBottom:6,
            color: isLight ? '#0a0a0a' : pack.headStyle.color }}>
            {name ? name.toUpperCase() : pack.sampleHead}
          </div>
          <div style={{ ...pack.bodyStyle, fontFamily: fontBody, fontSize: Math.round(pack.bodyStyle.fontSize * 1.3),
            color: isLight ? '#666' : pack.bodyStyle.color }}>
            L'actu en temps reel.
          </div>
          {barVisible && (
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background:accentColor }}/>
          )}
        </div>
      </div>
    );
  }

  var moodBg = {
    dramatique:'linear-gradient(160deg,#08060f,#18102a)',
    energique: 'linear-gradient(160deg,#0d1b2e,#1a0d26)',
    premium:   'linear-gradient(160deg,#060c14,#10161f)',
    populaire: 'linear-gradient(160deg,#0c0c0c,#1c1c1c)',
    factuel:   'linear-gradient(160deg,#0c1018,#161e28)',
  }[props.mood] || 'linear-gradient(160deg,#0f0f16,#1a1a26)';

  return (
    <div style={{ width:220, aspectRatio:'4/5', borderRadius:12, overflow:'hidden',
      background:moodBg, position:'relative', boxShadow:'0 20px 60px rgba(0,0,0,.45)', flexShrink:0 }}>
      <div style={{ position:'absolute', inset:0,
        background:'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,.88) 100%)' }}/>
      {logoUrl && (
        <img src={logoUrl} alt="" style={{ position:'absolute', top:14, right:14,
          height:22, width:'auto', objectFit:'contain', zIndex:2, filter:'brightness(0) invert(1)' }}/>
      )}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'16px 14px', zIndex:1 }}>
        {badgeVisible && (
          <div style={{ display:'inline-block', padding:'2px 8px', borderRadius:3,
            background:primaryColor, fontSize:9, fontWeight:700, color:'#fff',
            letterSpacing:1.5, marginBottom:8, textTransform:'uppercase' }}>
            SPORT
          </div>
        )}
        <div style={{ fontSize:22, fontWeight:900, color:'#fff', lineHeight:1.05,
          marginBottom:6, letterSpacing:-0.5, textTransform:'uppercase',
          fontFamily: fontTitle + ',sans-serif' }}>
          {name ? name.toUpperCase().slice(0,12) : 'MON MEDIA'}
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,.6)', fontFamily: fontBody + ',sans-serif' }}>L'actu en temps reel.</div>
        {barVisible && (
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:accentColor }}/>
        )}
      </div>
    </div>
  );
};

const BrandTagInput = ({ tags, setTags, placeholder, max }) => {
  var [val, setVal] = useState('');
  var handleKey = function(e) {
    if ((e.key === 'Enter' || e.key === ',') && val.trim()) {
      e.preventDefault();
      if (max && tags.length >= max) return;
      var t = val.trim().replace(/,/g, '').trim();
      if (t && !tags.includes(t)) setTags([...tags, t]);
      setVal('');
    }
    if (e.key === 'Backspace' && !val && tags.length) setTags(tags.slice(0, -1));
  };
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'8px 10px',
      background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
      borderRadius:'var(--radius)', minHeight:44, cursor:'text' }}
      onClick={function(e){ e.currentTarget.querySelector('input').focus(); }}>
      {tags.map(function(t, i) {
        return (
          <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:5,
            padding:'3px 9px', background:'var(--app-surface-3)',
            border:'1px solid var(--app-line-3)', borderRadius:20,
            fontSize:12, color:'var(--app-fg-2)' }}>
            {t}
            <button onClick={function(ev){ ev.stopPropagation(); setTags(tags.filter(function(_,j){ return j!==i; })); }}
              style={{ all:'unset', cursor:'pointer', color:'var(--app-fg-4)', lineHeight:1, fontSize:13, padding:'0 2px' }}>
              x
            </button>
          </span>
        );
      })}
      <input value={val} onChange={function(e){ setVal(e.target.value); }} onKeyDown={handleKey}
        placeholder={tags.length === 0 ? placeholder : ''}
        style={{ flex:'1 1 100px', minWidth:80, border:'none', outline:'none',
          background:'transparent', fontSize:13, color:'var(--app-fg)', fontFamily:'DM Sans,sans-serif' }}/>
    </div>
  );
};

const BrandSect = ({ num, title, desc, tip, children }) => (
  <div style={{ marginBottom:28 }}>
    <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:4 }}>
      <span style={{ fontSize:10, fontWeight:700, color:'var(--app-accent)',
        letterSpacing:1.5, textTransform:'uppercase', flexShrink:0 }}>{num}</span>
      <h3 style={{ margin:0, fontSize:14, fontWeight:600, color:'var(--app-fg)' }}>{title}</h3>
    </div>
    {desc && <p style={{ margin:'0 0 10px', fontSize:12.5, color:'var(--app-fg-4)', lineHeight:1.5 }}>{desc}</p>}
    {children}
    {tip && (
      <p style={{ margin:'8px 0 0', fontSize:11.5, color:'var(--app-fg-4)', fontStyle:'italic',
        padding:'6px 10px 6px 12px', background:'var(--app-surface-2)', borderRadius:6,
        borderLeft:'2px solid var(--app-accent)', lineHeight:1.5 }}>
        {tip}
      </p>
    )}
  </div>
);

const BrandScreen = ({ clientId, onSaved, onDeleted }) => {
  var [name,            setName]            = useState('');
  var [logoUrl,         setLogoUrl]         = useState('');
  var [logoUploading,   setLogoUploading]   = useState(false);
  var [styleRefUrl,     setStyleRefUrl]     = useState('');
  var [styleRefUploading, setStyleRefUploading] = useState(false);
  var [primaryColor,    setPrimaryColor]    = useState('#6366F1');
  var [accentColor,     setAccentColor]     = useState('#10B981');
  var [fontPrimary,     setFontPrimary]     = useState('DM Sans');
  var [mood,            setMood]            = useState('');
  var [toneTags,        setToneTags]        = useState([]);
  var [graphicStyle,    setGraphicStyle]    = useState('');
  var [topics,          setTopics]          = useState([]);
  var [instaHandle,     setInstaHandle]     = useState('');
  var [hashtags,        setHashtags]        = useState([]);
  var [preferredFormat, setPreferredFormat] = useState('4:5');
  var [advancedOpen,    setAdvancedOpen]    = useState(false);
  var [loading,         setLoading]         = useState(true);
  var [saving,          setSaving]          = useState(false);
  var [saveMsg,         setSaveMsg]         = useState('');
  var [saveErr,         setSaveErr]         = useState('');
  var [showVeilleNudge,   setShowVeilleNudge]   = useState(false);
  var [igInput,           setIgInput]           = useState('');
  var [igAnalyzing,       setIgAnalyzing]       = useState(false);
  var [igResult,          setIgResult]          = useState(null);
  var [igErr,             setIgErr]             = useState('');
  var [fontSecondary,     setFontSecondary]     = useState('');
  var [badgeVisible,      setBadgeVisible]      = useState(true);
  var [barVisible,        setBarVisible]        = useState(true);
  var [confirmingDelete,  setConfirmingDelete]  = useState(false);
  var [deleting,          setDeleting]          = useState(false);
  var [brandKitUrl,       setBrandKitUrl]       = useState('');
  var [relogoing,         setRelogoing]         = useState(false);

  // Load from Supabase — réagit au changement de clientId (switch de compte)
  useEffect(function() {
    var sb = window.__supabase; var user = window.__currentUser;
    // Reset du formulaire à chaque changement de compte
    setName(''); setLogoUrl(''); setStyleRefUrl('');
    setPrimaryColor('#6366F1'); setAccentColor('#10B981'); setFontPrimary('DM Sans'); setFontSecondary('');
    setMood(''); setToneTags([]); setGraphicStyle(''); setTopics([]);
    setInstaHandle(''); setHashtags([]); setPreferredFormat('4:5');
    setBadgeVisible(true); setBarVisible(true);
    setSaveMsg(''); setSaveErr(''); setIgInput(''); setIgResult(null); setIgErr('');

    if (!sb || !user) { setLoading(false); return; }
    if (!clientId) { setLoading(false); return; } // nouveau compte — formulaire vide

    setLoading(true);
    sb.from('clients').select('*').eq('id', clientId).eq('user_id', user.id).maybeSingle()
      .then(function(res) {
        var d = res.data;
        if (d) {
          setName(d.name || '');
          setLogoUrl(d.logo_url || '');
          if (d.brand_colors && d.brand_colors[0]) setPrimaryColor(d.brand_colors[0]);
          if (d.brand_colors && d.brand_colors[1]) setAccentColor(d.brand_colors[1]);
          setFontPrimary(d.font_primary || 'DM Sans');
          setFontSecondary(d.font_secondary || '');
          setMood(d.mood || '');
          setToneTags(d.tone_tags || []);
          var gs = d.graphic_style || '';
          var resolvedGs = STYLE_TO_PACK[gs] || gs;
          if (!resolvedGs && d.font_primary) resolvedGs = 'custom';
          setGraphicStyle(resolvedGs);
          setTopics(d.topics || []);
          setInstaHandle(d.instagram_handle || '');
          setHashtags(d.hashtags || []);
          setPreferredFormat(d.preferred_format || '4:5');
          setStyleRefUrl(d.style_ref_url || '');
          setBadgeVisible(d.badge_visible !== false);
          setBarVisible(d.bar_visible !== false);
          setBrandKitUrl(d.brand_kit_url || '');
        }
        setLoading(false);
      });
  }, [clientId]);

  // Load all pack fonts once at mount
  useEffect(function() {
    var id = 'gf-packs';
    if (document.getElementById(id)) return;
    var link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&family=Barlow+Condensed:wght@600;700&family=Barlow:wght@300&family=Playfair+Display:ital,wght@1,900&family=Cormorant+Garamond:wght@600&family=Jost:wght@200;300&family=Space+Grotesk:wght@700&family=DM+Sans:wght@300;500&family=DM+Mono:wght@400&family=Syne:wght@800&family=Outfit:wght@200;600&family=DM+Serif+Display:ital@1&family=DM+Serif+Text:wght@400&family=Lato:wght@300&display=swap';
    document.head.appendChild(link);
  }, []);

  // Inject bento CSS once
  useEffect(function() {
    var id = 'brand-bento-css';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = [
      '.brand-bento{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}',
      '.bento-tile{background:var(--app-surface-2);border:1px solid var(--app-line);border-radius:14px;padding:18px 20px;transition:border-color .18s,box-shadow .18s;position:relative;overflow:hidden;box-sizing:border-box;}',
      '.bento-tile:hover{border-color:rgba(99,102,241,.3);box-shadow:0 0 0 1px rgba(99,102,241,.08),0 4px 24px rgba(0,0,0,.18);}',
      '.bento-tile--wide{grid-column:span 2;}',
      '.bento-tile--full{grid-column:span 3;}',
      '.bento-tile-lbl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--app-fg-4);margin-bottom:14px;display:flex;align-items:center;gap:6px;}',
      '.bento-color-block{height:48px;border-radius:9px;cursor:pointer;transition:transform .15s;margin-bottom:7px;}',
      '.bento-color-block:hover{transform:scaleY(1.04);}',
    ].join('');
    document.head.appendChild(s);
  }, []);

  var loadCustomFont = function(name) {
    if (!name || !name.trim()) return;
    var key = 'gf-custom-' + name.trim().toLowerCase().replace(/\s+/g, '-');
    if (document.getElementById(key)) return;
    var link = document.createElement('link');
    link.id = key; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + name.trim().replace(/\s+/g, '+') + ':ital,wght@0,400;0,700;1,400&display=swap';
    document.head.appendChild(link);
  };

  var handleRelogo = async function() {
    if (!brandKitUrl || !clientId || relogoing) return;
    setRelogoing(true); setSaveErr('');
    try {
      var sb = window.__supabase;
      var token = null;
      if (sb) { var sess = await sb.auth.getSession(); token = sess.data?.session?.access_token; }
      var res = await fetch('/api/generate/brand-identity/relogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) },
        body: JSON.stringify({ clientId, imageUrl: brandKitUrl }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      if (data.logoUrl) setLogoUrl(data.logoUrl);
    } catch(e) {
      setSaveErr('Relogo échoué : ' + e.message);
    }
    setRelogoing(false);
  };

  var handleLogoUpload = function(file) {
    if (!file) return;
    if (file.type !== 'image/png') { setSaveErr('Logo : PNG uniquement (fond transparent requis)'); return; }
    var sb = window.__supabase; var user = window.__currentUser;
    if (!sb || !user) return;
    setLogoUploading(true); setSaveErr('');
    var folder = clientId ? user.id + '/' + clientId : user.id + '/draft';
    var path = folder + '/logo.png';
    sb.storage.from('brand-assets').upload(path, file, { upsert:true, contentType:'image/png' })
      .then(function(res) {
        if (res.error) { setSaveErr('Upload echoué : ' + res.error.message); setLogoUploading(false); return; }
        var pub = sb.storage.from('brand-assets').getPublicUrl(path);
        var url = pub.data.publicUrl + '?t=' + Date.now();
        setLogoUrl(url);
        if (clientId) {
          sb.from('clients').update({ logo_url: url }).eq('id', clientId).eq('user_id', user.id)
            .then(function(r) { if (r.error) setSaveErr('Logo sauvegardé localement, erreur DB : ' + r.error.message); });
        }
        setLogoUploading(false);
      });
  };

  var handleStyleRefUpload = function(file) {
    if (!file || !file.type.startsWith('image/')) return;
    var sb = window.__supabase; var user = window.__currentUser;
    if (!sb || !user) return;
    setStyleRefUploading(true); setSaveErr('');
    var ext = file.type === 'image/png' ? 'png' : 'jpg';
    var folder = clientId ? user.id + '/' + clientId : user.id + '/draft';
    var path = folder + '/style-ref.' + ext;
    sb.storage.from('brand-assets').upload(path, file, { upsert:true, contentType:file.type })
      .then(function(res) {
        if (res.error) { setSaveErr('Upload echoué : ' + res.error.message); setStyleRefUploading(false); return; }
        var pub = sb.storage.from('brand-assets').getPublicUrl(path);
        var url = pub.data.publicUrl + '?t=' + Date.now();
        setStyleRefUrl(url);
        if (clientId) {
          sb.from('clients').update({ style_ref_url: url }).eq('id', clientId).eq('user_id', user.id)
            .then(function(r) { if (r.error) setSaveErr('Style ref sauvegardé localement, erreur DB : ' + r.error.message); });
        }
        setStyleRefUploading(false);
      });
  };

  var analyzeInstagram = function() {
    if (!igInput.trim()) return;
    setIgAnalyzing(true); setIgErr(''); setIgResult(null);
    veilleFetch('/brand/analyze-instagram', {
      method: 'POST',
      body: JSON.stringify({ handle: igInput.trim() }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) { setIgErr(data.error); }
        else { setIgResult(data); }
        setIgAnalyzing(false);
      })
      .catch(function(e) { setIgErr(e.message); setIgAnalyzing(false); });
  };

  var applyIgSuggestions = function() {
    if (!igResult || !igResult.suggestions) return;
    var s = igResult.suggestions;
    if (s.name) setName(s.name);
    if (s.mood) setMood(s.mood);
    // Map graphic_style to pack ID
    var packId = STYLE_TO_PACK[s.graphic_style] || s.graphic_style;
    if (packId && PACK_FONTS[packId]) setGraphicStyle(packId);
    if (s.tone_tags && s.tone_tags.length) setToneTags(s.tone_tags.slice(0, 3));
    if (s.topics && s.topics.length) setTopics(s.topics);
    if (igResult.handle) setInstaHandle('@' + igResult.handle);
    setIgResult(null);
  };

  var completedCount = [
    name.trim().length > 0,
    logoUrl.length > 0,
    !!(primaryColor && accentColor),
    !!graphicStyle,
    !!mood,
    toneTags.length > 0,
    topics.length >= 3,
  ].filter(Boolean).length;

  var canSave = name.trim().length > 0;

  var toggleTone = function(t) {
    if (toneTags.includes(t)) {
      setToneTags(toneTags.filter(function(x) { return x !== t; }));
    } else if (toneTags.length < 3) {
      setToneTags([...toneTags, t]);
    }
  };

  var handleSave = function() {
    var sb = window.__supabase; var user = window.__currentUser;
    if (!sb || !user) return;
    setSaving(true); setSaveErr(''); setSaveMsg('');
    var row = {
      user_id:          user.id,
      name:             name,
      logo_url:         logoUrl,
      brand_colors:     [primaryColor, accentColor],
      font_primary:     fontPrimary,
      font_secondary:   fontSecondary || null,
      badge_visible:    badgeVisible,
      bar_visible:      barVisible,
      mood:             mood,
      tone_tags:        toneTags,
      graphic_style:    graphicStyle,
      topics:           topics,
      instagram_handle: instaHandle,
      hashtags:         hashtags,
      preferred_format: preferredFormat,
      style_ref_url:    styleRefUrl || null,
    };
    var query = clientId
      ? sb.from('clients').update(row).eq('id', clientId).eq('user_id', user.id).select('id').maybeSingle()
      : sb.from('clients').insert(row).select('id').maybeSingle();
    var isNew = !clientId;
    query.then(function(res) {
      if (res.error) { setSaveErr(res.error.message); }
      else {
        setSaveMsg('Identite forgee. Chaque post genere sera maintenant fidele a la charte de ' + (name || 'ton media') + '.');
        setTimeout(function() { setSaveMsg(''); }, 6000);
        if (isNew) setShowVeilleNudge(true);
        if (onSaved && res.data) onSaved(res.data.id);
      }
      setSaving(false);
    });
  };

  var handleDelete = function() {
    if (!clientId) return;
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    var sb = window.__supabase; var user = window.__currentUser;
    if (!sb || !user) return;
    setDeleting(true);
    sb.from('clients').delete().eq('id', clientId).eq('user_id', user.id)
      .then(function(res) {
        setDeleting(false);
        setConfirmingDelete(false);
        if (res.error) { setSaveErr('Suppression échouée : ' + res.error.message); return; }
        if (onDeleted) onDeleted();
      });
  };

  var inputStyle = {
    width:'100%', boxSizing:'border-box', background:'var(--app-surface-2)',
    border:'1px solid var(--app-line)', borderRadius:'var(--radius)', padding:'9px 12px',
    color:'var(--app-fg)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none',
  };

  if (loading) return (
    <div className="page-body" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300 }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, color:'var(--app-fg-4)' }}>
        <div style={{ width:24, height:24, border:'2px solid var(--app-line)',
          borderTopColor:'var(--app-accent)', borderRadius:'50%', animation:'vb-spin .8s linear infinite' }}/>
        <span style={{ fontSize:13 }}>Chargement de ton identite...</span>
      </div>
    </div>
  );

  return (
    <div className="page-body" style={{ paddingBottom:60 }}>
      {showVeilleNudge && (
        <div className="veille-nudge-overlay">
          <div className="veille-nudge-modal">
            <div className="veille-nudge-icon">⚡</div>
            <h2 className="veille-nudge-title">Identité forgée !</h2>
            <p className="veille-nudge-desc">
              Étape 1 sur 2 terminée. Active maintenant ta veille — Forje va surveiller les actus de ton univers en temps réel.
            </p>
            <div className="veille-nudge-steps">
              <span className="veille-nudge-step veille-nudge-step--done">① Identité de marque ✓</span>
              <span className="veille-nudge-step veille-nudge-step--active">② Sources & veille</span>
            </div>
            <div className="veille-nudge-actions">
              <button className="btn btn-primary" style={{flex:1}}
                onClick={() => { setShowVeilleNudge(false); window.__goToScreen?.('sources'); }}>
                Configurer ma veille →
              </button>
              <button className="btn btn-ghost" onClick={() => setShowVeilleNudge(false)}>
                Plus tard
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Page header ── */}
      <div className="page-header" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <h1 className="page-title">Forge ton identite</h1>
          <p className="page-subtitle">Tout ce que tu remplis ici sera utilise a chaque generation.</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0, marginTop:4 }}>
          {/* Progress pill */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 14px',
            borderRadius:20, background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
            fontSize:12, color:'var(--app-fg-3)' }}>
            <div style={{ width:36, height:3.5, background:'var(--app-line)', borderRadius:2, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', left:0, top:0, height:'100%',
                width:(completedCount / 7 * 100) + '%',
                background: completedCount === 7 ? '#22c55e' : 'var(--app-accent)',
                borderRadius:2, transition:'width .3s ease' }}/>
            </div>
            <span style={{ fontVariantNumeric:'tabular-nums' }}>
              {completedCount}<span style={{ opacity:.45 }}>/7</span>
            </span>
          </div>
          {clientId && (
            <Btn
              variant="ghost"
              disabled={deleting}
              onClick={confirmingDelete ? handleDelete : () => setConfirmingDelete(true)}
              onBlur={() => setTimeout(() => setConfirmingDelete(false), 200)}
              style={confirmingDelete ? { borderColor:'var(--app-danger)', color:'var(--app-danger)', background:'rgba(209,69,69,.07)' } : {}}>
              {deleting ? 'Suppression...' : confirmingDelete ? 'Confirmer ?' : 'Supprimer'}
            </Btn>
          )}
          <Btn
            variant="primary"
            disabled={saving || !canSave}
            onClick={handleSave}
            icon={saving ? null : 'check'}>
            {saving
              ? React.createElement('span', { style:{display:'flex',alignItems:'center',gap:6} },
                  React.createElement('span', { style:{width:12,height:12,border:'2px solid rgba(255,255,255,.3)',
                    borderTopColor:'#fff',borderRadius:'50%',animation:'vb-spin .7s linear infinite'} }),
                  'Sauvegarde...')
              : (canSave ? 'Enregistrer' : 'Ajoute un nom')
            }
          </Btn>
        </div>
      </div>

      {/* ── Outer: bento grid + live preview ── */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 240px', gap:24, alignItems:'start' }}>

        {/* ── BENTO GRID ── */}
        <div className="brand-bento">

          {/* TILE 1 — Identité + IG auto — full width */}
          <div className="bento-tile bento-tile--full">
            <div className="bento-tile-lbl"><AppIcon name="sparkle" size={11}/>Identite du media</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr minmax(0,290px)', gap:20, alignItems:'start' }}>
              <div>
                <div style={{ fontSize:10.5, color:'var(--app-fg-4)', marginBottom:6, letterSpacing:'.08em', textTransform:'uppercase' }}>Nom public</div>
                <input value={name} onChange={function(e){ setName(e.target.value); }}
                  onBlur={function(){ if (name.trim() && clientId) handleSave(); }}
                  placeholder="Raplume, Footmercato, Le Monde..."
                  style={{ width:'100%', boxSizing:'border-box',
                    background:'transparent', border:'none',
                    borderBottom:'1.5px solid var(--app-line-2)',
                    padding:'4px 0 10px', color:'var(--app-fg)',
                    fontFamily:'DM Sans,sans-serif', fontSize:22, fontWeight:600,
                    outline:'none', letterSpacing:'-0.01em' }}/>
              </div>
              <div>
                <div style={{ fontSize:10.5, color:'var(--app-fg-4)', marginBottom:6, letterSpacing:'.08em', textTransform:'uppercase' }}>Auto-remplir depuis Instagram</div>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={igInput} onChange={function(e){ setIgInput(e.target.value); }}
                    onKeyDown={function(e){ if (e.key === 'Enter') analyzeInstagram(); }}
                    placeholder="@compte ou URL Instagram"
                    style={{ flex:1, background:'var(--app-surface-3)', border:'1px solid var(--app-line)',
                      borderRadius:8, padding:'7px 10px', color:'var(--app-fg)',
                      fontFamily:'DM Sans,sans-serif', fontSize:12.5, outline:'none' }}/>
                  <button onClick={analyzeInstagram} disabled={igAnalyzing || !igInput.trim()}
                    className="btn btn-primary btn-sm" style={{ flexShrink:0 }}>
                    {igAnalyzing
                      ? <span style={{width:11,height:11,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'vb-spin .7s linear infinite',display:'inline-block'}}/>
                      : <AppIcon name="sparkle" size={12}/>
                    }
                    {igAnalyzing ? 'Analyse...' : 'Analyser'}
                  </button>
                </div>
                {igErr && <div style={{ marginTop:6, fontSize:11.5, color:'#ef4444' }}>{igErr}</div>}
              </div>
            </div>
            {igResult && igResult.suggestions && (
              <div style={{ marginTop:14, padding:'12px 14px', background:'rgba(99,102,241,.06)', borderRadius:10, border:'1px solid rgba(99,102,241,.18)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  {igResult.avatarUrl && (
                    <img src={igResult.avatarUrl} style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} onError={function(e){ e.target.style.display='none'; }}/>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:600, color:'var(--app-fg)' }}>{igResult.name}</div>
                    {igResult.bio && <div style={{ fontSize:11, color:'var(--app-fg-4)', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{igResult.bio}</div>}
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <Btn variant="primary" size="sm" icon="check" onClick={applyIgSuggestions}>Appliquer</Btn>
                    <Btn variant="ghost" size="sm" onClick={function(){ setIgResult(null); }}>Ignorer</Btn>
                  </div>
                </div>
                <div style={{ fontSize:11, color:'var(--app-fg-4)', lineHeight:1.6 }}>
                  Mood: <strong style={{ color:'var(--app-fg-3)' }}>{igResult.suggestions.mood}</strong>
                  {' · '}Pack: <strong style={{ color:'var(--app-fg-3)' }}>{igResult.suggestions.graphic_style}</strong>
                  {' · '}Ton: <strong style={{ color:'var(--app-fg-3)' }}>{(igResult.suggestions.tone_tags||[]).join(', ')}</strong>
                  {igResult.suggestions.rationale && (<><br/><em style={{ opacity:.7 }}>{igResult.suggestions.rationale}</em></>)}
                </div>
              </div>
            )}
          </div>

          {/* TILE 2 — Logo */}
          <div className="bento-tile" style={{ display:'flex', flexDirection:'column', minHeight:200 }}>
            <div className="bento-tile-lbl"><AppIcon name="image" size={11}/>Logo</div>
            {logoUrl ? (
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ flex:1, background:'#0a0a15', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', padding:16, minHeight:100, border:'1px solid rgba(255,255,255,.06)' }}>
                  <img src={logoUrl} style={{ maxWidth:'100%', maxHeight:80, objectFit:'contain' }}/>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {brandKitUrl && (
                    <Btn variant="ghost" size="sm" disabled={relogoing} onClick={handleRelogo} style={{ flex:1, justifyContent:'center' }}>
                      {relogoing ? '↻ ...' : '↻ Brand kit'}
                    </Btn>
                  )}
                  <Btn variant="ghost" size="sm" onClick={function(){ setLogoUrl(''); }} style={{ flex:1, justifyContent:'center', color:'#ef4444', borderColor:'rgba(239,68,68,.35)' }}>Supprimer</Btn>
                </div>
              </div>
            ) : (
              <div onClick={function(){ var inp=document.createElement('input'); inp.type='file'; inp.accept='image/png'; inp.onchange=function(e){ handleLogoUpload(e.target.files[0]); }; inp.click(); }}
                style={{ flex:1, border:'1.5px dashed var(--app-line)', borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', padding:16, background: logoUploading ? 'var(--app-surface-3)' : 'transparent', minHeight:120 }}>
                {logoUploading
                  ? <div style={{width:18,height:18,border:'2px solid var(--app-line)',borderTopColor:'var(--app-accent)',borderRadius:'50%',animation:'vb-spin .7s linear infinite'}}/>
                  : <><div style={{width:36,height:36,borderRadius:9,background:'var(--app-surface-3)',display:'flex',alignItems:'center',justifyContent:'center'}}><AppIcon name="image" size={17}/></div><div style={{fontSize:12,color:'var(--app-fg-4)',lineHeight:1.6,textAlign:'center'}}>Glisse ou clique<br/><span style={{fontSize:10,opacity:.6}}>PNG transparent</span></div></>
                }
              </div>
            )}
          </div>

          {/* TILE 3 — Référence visuelle */}
          <div className="bento-tile" style={{ display:'flex', flexDirection:'column', minHeight:200 }}>
            <div className="bento-tile-lbl"><AppIcon name="layers" size={11}/>Style de reference</div>
            {styleRefUrl ? (
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ flex:1, position:'relative', borderRadius:10, overflow:'hidden', minHeight:100 }}>
                  <img src={styleRefUrl} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', minHeight:100 }}/>
                  <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,.5) 0%, transparent 55%)' }}/>
                  <div style={{ position:'absolute', bottom:8, left:10, fontSize:10, color:'rgba(255,255,255,.7)', fontWeight:500 }}>Ref active</div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <Btn variant="ghost" size="sm" onClick={function(){ var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.onchange=function(e){ handleStyleRefUpload(e.target.files[0]); }; inp.click(); }} style={{ flex:1, justifyContent:'center', color:'var(--app-accent)', borderColor:'rgba(99,102,241,.35)' }}>Changer</Btn>
                  <Btn variant="ghost" size="sm" onClick={function(){ setStyleRefUrl(''); }} style={{ color:'#ef4444', borderColor:'rgba(239,68,68,.35)' }}>×</Btn>
                </div>
              </div>
            ) : (
              <div onClick={function(){ var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.onchange=function(e){ handleStyleRefUpload(e.target.files[0]); }; inp.click(); }}
                style={{ flex:1, border:'1.5px dashed var(--app-line)', borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', padding:16, background: styleRefUploading ? 'var(--app-surface-3)' : 'transparent', minHeight:120 }}>
                {styleRefUploading
                  ? <div style={{width:18,height:18,border:'2px solid var(--app-line)',borderTopColor:'var(--app-accent)',borderRadius:'50%',animation:'vb-spin .7s linear infinite'}}/>
                  : <><div style={{width:36,height:36,borderRadius:9,background:'var(--app-surface-3)',display:'flex',alignItems:'center',justifyContent:'center'}}><AppIcon name="layers" size={17}/></div><div style={{fontSize:12,color:'var(--app-fg-4)',lineHeight:1.6,textAlign:'center'}}>Ref visuelle IA<br/><span style={{fontSize:10,opacity:.6}}>JPG, PNG, WebP</span></div></>
                }
              </div>
            )}
          </div>

          {/* TILE 4 — Palette */}
          <div className="bento-tile" style={{ display:'flex', flexDirection:'column' }}>
            <div className="bento-tile-lbl"><AppIcon name="palette" size={11}/>Palette</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10, flex:1 }}>
              {[
                ['Principale', primaryColor, function(e){ setPrimaryColor(e.target.value); }],
                ['Accent',     accentColor,  function(e){ setAccentColor(e.target.value); }],
              ].map(function(cfg) {
                return (
                  <label key={cfg[0]} style={{ display:'block', cursor:'pointer', position:'relative' }}>
                    <div style={{ fontSize:10, color:'var(--app-fg-4)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.08em' }}>{cfg[0]}</div>
                    <div className="bento-color-block" style={{ background:cfg[1], boxShadow:'0 2px 10px ' + cfg[1] + '44' }}/>
                    <input type="color" value={cfg[1]} onChange={cfg[2]} style={{ position:'absolute', opacity:0, width:1, height:1, top:0, left:0, pointerEvents:'none' }}/>
                    <div style={{ fontSize:11.5, color:'var(--app-fg-3)', fontFamily:'JetBrains Mono,monospace', display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:-2 }}>
                      <span>{cfg[1]}</span><AppIcon name="edit" size={11}/>
                    </div>
                  </label>
                );
              })}
              <div style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 10px', background:'var(--app-surface-3)', borderRadius:8, marginTop:'auto' }}>
                {badgeVisible && <div style={{ padding:'3px 8px', borderRadius:3, background:primaryColor, fontSize:9, fontWeight:700, color:'#fff', letterSpacing:1.2, textTransform:'uppercase', flexShrink:0 }}>SPORT</div>}
                {barVisible && <div style={{ width:24, height:2.5, borderRadius:2, background:accentColor, flexShrink:0 }}/>}
                {!badgeVisible && !barVisible && <span style={{ fontSize:10, color:'var(--app-fg-4)', fontStyle:'italic', flex:1 }}>Aucun element</span>}
                <div style={{ marginLeft:'auto', display:'flex', gap:10 }}>
                  {[['Badge', badgeVisible, setBadgeVisible],['Barre', barVisible, setBarVisible]].map(function(t) {
                    return (<label key={t[0]} style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', fontSize:11, color:'var(--app-fg-4)', userSelect:'none' }}><input type="checkbox" checked={t[1]} onChange={function(e){ t[2](e.target.checked); }} style={{ accentColor:'var(--app-accent)', cursor:'pointer' }}/>{t[0]}</label>);
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* TILE 5 — Pack typographique (wide 2-col) */}
          <div className="bento-tile bento-tile--wide">
            <div className="bento-tile-lbl"><AppIcon name="grid" size={11}/>Pack typographique</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, marginBottom:12 }}>
              <CustomPackCard active={graphicStyle === 'custom'} fontPrimary={fontPrimary} fontBody={fontSecondary || 'DM Sans'} primaryColor={primaryColor} accentColor={accentColor} onSelect={function(){ setGraphicStyle('custom'); }}/>
              {FONT_PACKS.map(function(p) {
                return (<PackMiniCard key={p.id} pack={p} active={graphicStyle === p.id} onSelect={function(){ setGraphicStyle(p.id); setFontPrimary(PACK_FONTS[p.id] || fontPrimary); }}/>);
              })}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, paddingTop:12, borderTop:'1px solid var(--app-line)' }}>
              {[
                ['Titre / Display', fontPrimary, setFontPrimary, 'Bebas Neue, Playfair Display...'],
                ['Corps / Body',    fontSecondary, setFontSecondary, 'DM Sans, Lato...'],
              ].map(function(cfg) {
                return (
                  <div key={cfg[0]}>
                    <div style={{ fontSize:10, color:'var(--app-fg-4)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.08em' }}>{cfg[0]}</div>
                    <input value={cfg[1]} onChange={function(e){ cfg[2](e.target.value); }}
                      onBlur={function(){ loadCustomFont(cfg[1]); }}
                      onKeyDown={function(e){ if (e.key === 'Enter') loadCustomFont(cfg[1]); }}
                      placeholder={cfg[3]}
                      style={{ width:'100%', boxSizing:'border-box', background:'var(--app-surface-3)', border:'1px solid var(--app-line)', borderRadius:7, padding:'7px 10px', color:'var(--app-fg)', fontFamily:'DM Sans,sans-serif', fontSize:12.5, outline:'none' }}/>
                    {cfg[1] && (
                      <div style={{ marginTop:5, fontSize: cfg[0].startsWith('Titre') ? 17 : 12, fontFamily: cfg[1] + ',sans-serif', color:'var(--app-fg-3)', padding:'5px 8px', background:'var(--app-surface-3)', borderRadius:6, lineHeight:1.4 }}>
                        {cfg[0].startsWith('Titre') ? 'TITRE EXEMPLE' : 'Corps de texte'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* TILE 6 — Mood éditorial */}
          <div className="bento-tile">
            <div className="bento-tile-lbl"><AppIcon name="bolt" size={11}/>Mood editorial</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {BRAND_MOODS.map(function(m) {
                var active = mood === m.id;
                return (
                  <div key={m.id} onClick={function(){ setMood(m.id); }}
                    style={{ padding:'9px 12px', borderRadius:9, border:'1.5px solid ' + (active ? 'var(--app-accent)' : 'var(--app-line)'), background: active ? 'rgba(99,102,241,.07)' : 'var(--app-surface-3)', cursor:'pointer', transition:'all .15s', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontWeight: active ? 600 : 400, fontSize:13, color: active ? 'var(--app-accent)' : 'var(--app-fg-2)' }}>{m.label}</span>
                    {active && <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--app-accent)', flexShrink:0 }}/>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* TILE 7 — Ton éditorial (wide 2-col) */}
          <div className="bento-tile bento-tile--wide">
            <div className="bento-tile-lbl" style={{ justifyContent:'space-between' }}>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}><AppIcon name="quote" size={11}/>Ton editorial</span>
              <span style={{ fontSize:11, color: toneTags.length >= 3 ? 'var(--app-accent)' : 'var(--app-fg-4)', letterSpacing:'.05em', textTransform:'lowercase', fontWeight:500 }}>{toneTags.length}/3 selectionnes</span>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {BRAND_TONES.map(function(t) {
                var active = toneTags.includes(t);
                var maxed = toneTags.length >= 3 && !active;
                return (
                  <button key={t} onClick={function(){ if (!maxed) toggleTone(t); }}
                    style={{ all:'unset', cursor: maxed ? 'not-allowed' : 'pointer', padding:'5px 13px', borderRadius:20, fontSize:12.5, fontWeight: active ? 600 : 400, border:'1.5px solid ' + (active ? 'var(--app-accent)' : 'var(--app-line)'), color: active ? 'var(--app-accent)' : maxed ? 'var(--app-fg-4)' : 'var(--app-fg-2)', background: active ? 'rgba(99,102,241,.08)' : 'var(--app-surface-3)', transition:'all .15s', opacity: maxed ? 0.35 : 1 }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TILE 8 — Sujets couverts */}
          <div className="bento-tile">
            <div className="bento-tile-lbl" style={{ justifyContent:'space-between' }}>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}><AppIcon name="target" size={11}/>Sujets couverts</span>
              <span style={{ fontSize:11, color: topics.length >= 3 ? '#22c55e' : 'var(--app-fg-4)', letterSpacing:'.05em', textTransform:'lowercase', fontWeight:500 }}>{topics.length}/10{topics.length < 3 ? ' — min 3' : ''}</span>
            </div>
            <BrandTagInput tags={topics} setTags={setTopics} placeholder="Football, PSG, Transferts..." max={10}/>
          </div>

          {/* TILE 9 — Options avancées (full width) */}
          <div className="bento-tile bento-tile--full">
            <button onClick={function(){ setAdvancedOpen(!advancedOpen); }}
              style={{ all:'unset', cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:500, color:'var(--app-fg-3)', marginBottom: advancedOpen ? 16 : 0, width:'100%' }}>
              <AppIcon name={advancedOpen ? 'chevDown' : 'chevRight'} size={14}/>Options avancees
            </button>
            {advancedOpen && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, paddingTop:4 }}>
                <div>
                  <div style={{ fontSize:10.5, color:'var(--app-fg-4)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.08em' }}>Compte Instagram</div>
                  <input value={instaHandle} onChange={function(e){ setInstaHandle(e.target.value); }} placeholder="@votre_compte" style={{ width:'100%', boxSizing:'border-box', background:'var(--app-surface-3)', border:'1px solid var(--app-line)', borderRadius:7, padding:'8px 10px', color:'var(--app-fg)', fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none' }}/>
                </div>
                <div>
                  <div style={{ fontSize:10.5, color:'var(--app-fg-4)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.08em' }}>Hashtags habituels</div>
                  <BrandTagInput tags={hashtags} setTags={setHashtags} placeholder="#football..."/>
                </div>
                <div>
                  <div style={{ fontSize:10.5, color:'var(--app-fg-4)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.08em' }}>Format prefere</div>
                  <div style={{ display:'flex', gap:6 }}>
                    {[['4:5','Portrait'],['1:1','Carré'],['9:16','Story']].map(function(opt) {
                      var active = preferredFormat === opt[0];
                      return (
                        <button key={opt[0]} onClick={function(){ setPreferredFormat(opt[0]); }}
                          style={{ all:'unset', flex:1, cursor:'pointer', padding:'7px 6px', textAlign:'center', border:'1.5px solid ' + (active ? 'var(--app-accent)' : 'var(--app-line)'), borderRadius:7, fontSize:11, fontWeight: active ? 600 : 400, color: active ? 'var(--app-accent)' : 'var(--app-fg-2)', background: active ? 'rgba(99,102,241,.06)' : 'var(--app-surface-3)', transition:'all .15s', lineHeight:1.5 }}>
                          {opt[1]}<br/><span style={{ opacity:.6, fontSize:10 }}>{opt[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── Live Preview (sticky right col) ── */}
        <div style={{ position:'sticky', top:80, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2, color:'var(--app-fg-4)', alignSelf:'flex-start' }}>Apercu live</div>
          <BrandPostPreview name={name} primaryColor={primaryColor} accentColor={accentColor} fontPrimary={fontPrimary} fontSecondary={fontSecondary} mood={mood} logoUrl={logoUrl} graphicStyle={graphicStyle} badgeVisible={badgeVisible} barVisible={barVisible}/>
          <div style={{ fontSize:11, color:'var(--app-fg-4)', textAlign:'center', lineHeight:1.5 }}>Mise a jour en temps reel<br/><span style={{ opacity:.6 }}>a chaque changement</span></div>
        </div>

      </div>

      {saveErr && (
        <div style={{ marginTop:14, padding:'10px 14px', borderRadius:8, fontSize:12, background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.2)', color:'#ef4444' }}>{saveErr}</div>
      )}
      {saveMsg && (
        <div style={{ marginTop:14, padding:'12px 16px', borderRadius:8, fontSize:13, lineHeight:1.5, background:'rgba(34,197,94,.07)', border:'1px solid rgba(34,197,94,.2)', color:'#16a34a' }}>{saveMsg}</div>
      )}

    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

const SettingsToggle = function({ checked, onChange }) {
  return (
    <button
      className="settings-toggle"
      onClick={function() { onChange(!checked); }}
      style={{ background: checked ? 'var(--app-accent)' : 'var(--app-line-3)' }}
    >
      <span className="settings-toggle-knob" style={{ left: checked ? 18 : 2 }}/>
    </button>
  );
};

const SettingsSection = function({ title, sub, children }) {
  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <div className="settings-section-title">{title}</div>
        {sub && <div className="settings-section-sub">{sub}</div>}
      </div>
      <div className="settings-section-body">{children}</div>
    </div>
  );
};

const SettingsRow = function({ label, sub, right, danger }) {
  return (
    <div className={'settings-row' + (danger ? ' settings-row--danger' : '')}>
      <div className="settings-row-l">
        <div className="settings-row-label">{label}</div>
        {sub && <div className="settings-row-sub">{sub}</div>}
      </div>
      {right && <div className="settings-row-r">{right}</div>}
    </div>
  );
};

const SettingsScreen = function({ prefs = {}, onPrefsChange }) {
  var [tab, setTab] = useState('compte');
  var [notifEmail, setNotifEmail] = useState(prefs.notifEmail !== undefined ? prefs.notifEmail : true);
  var [notifPush,  setNotifPush]  = useState(prefs.notifPush  !== undefined ? prefs.notifPush  : false);
  var [autoScore,  setAutoScore]  = useState(prefs.autoScore  !== undefined ? prefs.autoScore  : true);
  var [pulseMode,  setPulseMode]  = useState(prefs.pulseMode  !== undefined ? prefs.pulseMode  : false);
  var [defFormat,  setDefFormat]  = useState(prefs.defaultFormat || 'Actualité');
  var [confirmDel, setConfirmDel] = useState(false);
  var [profile, setProfile] = useState(null);

  var savePref = function(key, val) {
    if (onPrefsChange) onPrefsChange(Object.assign({}, prefs, { [key]: val }));
  };

  var user = window.__currentUser;
  var sb   = window.__supabase;
  var email = user?.email || '';
  var fullName = user?.user_metadata?.full_name || '';
  var displayName = fullName || email.split('@')[0] || 'Utilisateur';
  var initials = (fullName
    ? fullName.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2)
    : displayName.slice(0,2)).toUpperCase();

  useEffect(function() {
    if (!sb || !user) return;
    sb.from('clients').select('plan,credits').eq('user_id', user.id).maybeSingle()
      .then(function({ data }) { if (data) setProfile(data); });
  }, []);

  var plan = profile?.plan || 'free';
  var credits = profile?.credits ?? 0;
  var creditsMax = plan === 'pro' ? 150 : plan === 'starter' ? 80 : 30;
  var creditsPct = Math.min(100, Math.round(credits / creditsMax * 100));
  var planLabel = { pro:'Pro', starter:'Starter', free:'Free' }[plan] || 'Free';

  var NAV = [
    { id:'compte',      icon:'target',   label:'Mon compte'     },
    { id:'plan',        icon:'bolt',     label:'Plan & crédits' },
    { id:'connexions',  icon:'link',     label:'Connexions'     },
    { id:'preferences', icon:'settings', label:'Préférences'    },
  ];

  var handleSignOut = async function() {
    if (!sb) return;
    await sb.auth.signOut();
    window.location.reload();
  };

  var handlePwdReset = async function() {
    if (!sb || !email) return;
    await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    alert('Email de réinitialisation envoyé à ' + email);
  };

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Paramètres</h1>
          <p className="page-subtitle">Compte, plan, connexions et préférences.</p>
        </div>
      </div>

      <div className="settings-layout">

        {/* ── Left nav ── */}
        <nav className="settings-nav">
          {NAV.map(function(item) {
            return (
              <button key={item.id}
                className={'settings-nav-item' + (tab === item.id ? ' active' : '')}
                onClick={function(){ setTab(item.id); }}>
                <AppIcon name={item.icon} size={13}/>
                {item.label}
              </button>
            );
          })}
          <div className="settings-nav-divider"/>
          <button className="settings-nav-item settings-nav-item--danger" onClick={handleSignOut}>
            <AppIcon name="logout" size={13}/>
            Déconnexion
          </button>
        </nav>

        {/* ── Content ── */}
        <div className="settings-content">

          {/* ────────── MON COMPTE ────────── */}
          {tab === 'compte' && (
            <div>
              <div className="settings-avatar-card">
                <div className="settings-avatar">{initials}</div>
                <div>
                  <div style={{ fontFamily:"'Fraunces',serif", fontSize:20, fontWeight:600,
                    letterSpacing:'-0.03em', color:'var(--app-fg)', lineHeight:1.15 }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize:12, color:'var(--app-fg-4)', marginTop:3 }}>{email}</div>
                  <div style={{ marginTop:8, display:'flex', gap:6 }}>
                    <span className="settings-tag settings-tag--accent">{planLabel}</span>
                    <span className="settings-tag settings-tag--neutral">{credits} / {creditsMax} crédits</span>
                  </div>
                </div>
              </div>

              <SettingsSection title="Informations du compte" sub="Vos données d'authentification Forje Studio.">
                <SettingsRow
                  label="Adresse email"
                  sub={email}
                  right={<span className="settings-tag">Vérifiée</span>}
                />
                <SettingsRow
                  label="Mot de passe"
                  sub="Réinitialisez votre mot de passe par email."
                  right={
                    <button className="btn btn-ghost btn-sm" onClick={handlePwdReset}>
                      Réinitialiser
                    </button>
                  }
                />
                <SettingsRow
                  label="Identifiant compte"
                  sub="Référence interne — ne peut pas être modifié."
                  right={
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11,
                      color:'var(--app-fg-4)', background:'var(--app-surface-2)',
                      padding:'3px 8px', borderRadius:4, border:'1px solid var(--app-line)' }}>
                      {user?.id ? user.id.slice(0,12) + '…' : '—'}
                    </span>
                  }
                />
              </SettingsSection>

              <SettingsSection title="Zone de danger"
                sub="Ces actions sont irréversibles. Procédez avec précaution.">
                <SettingsRow danger
                  label="Supprimer mon compte"
                  sub="Efface définitivement vos posts, votre identité de marque et toutes vos données."
                  right={
                    !confirmDel
                      ? <button className="btn btn-sm"
                          style={{ color:'var(--app-danger)', border:'1px solid rgba(209,69,69,.25)',
                            background:'transparent', fontFamily:'inherit' }}
                          onClick={function(){ setConfirmDel(true); }}>
                          Supprimer
                        </button>
                      : <div style={{ display:'flex', gap:7, alignItems:'center' }}>
                          <span style={{ fontSize:12, color:'var(--app-fg-4)' }}>Confirmer ?</span>
                          <button className="btn btn-sm"
                            style={{ background:'var(--app-danger)', color:'#fff', border:'none', fontFamily:'inherit' }}>
                            Oui, supprimer
                          </button>
                          <button className="btn btn-ghost btn-sm"
                            onClick={function(){ setConfirmDel(false); }}>
                            Annuler
                          </button>
                        </div>
                  }
                />
              </SettingsSection>
            </div>
          )}

          {/* ────────── PLAN & CRÉDITS ────────── */}
          {tab === 'plan' && (
            <div>
              <div className="settings-plan-hero">
                <div className="settings-plan-tier">
                  <AppIcon name="bolt" size={11}/>
                  {planLabel}
                </div>
                <div style={{ fontFamily:"'Fraunces',serif", fontSize:26, fontWeight:600,
                  letterSpacing:'-0.04em', lineHeight:1.1, color:'var(--app-fg)' }}>
                  {plan === 'free' ? 'Forfait gratuit' : plan === 'starter' ? 'Forfait Starter' : 'Forfait Pro'}
                </div>
                <div style={{ fontSize:13, color:'var(--app-fg-3)', marginTop:6 }}>
                  {plan === 'free'
                    ? '30 créations / mois · 1 identité de marque · Qualité standard'
                    : plan === 'starter'
                    ? '80 créations / mois · 3 identités · Génération IA incluse'
                    : 'Illimité · 10 identités · IA premium · Équipe jusqu\'à 5'}
                </div>
                {plan === 'free' && (
                  <button className="btn btn-primary" style={{ marginTop:20, width:'fit-content' }}>
                    <AppIcon name="bolt" size={13}/>
                    Passer à Pro — 29 €/mois
                  </button>
                )}
              </div>

              <SettingsSection title="Utilisation ce mois-ci"
                sub="Les crédits se réinitialisent le 1er de chaque mois.">
                <SettingsRow
                  label="Créations utilisées"
                  sub={creditsMax - credits + ' restantes ce mois'}
                  right={
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div className="settings-credits-bar">
                        <div className="settings-credits-fill" style={{ width: creditsPct + '%' }}/>
                      </div>
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--app-fg-2)',
                        fontVariantNumeric:'tabular-nums', minWidth:42, textAlign:'right' }}>
                        {credits} / {creditsMax}
                      </span>
                    </div>
                  }
                />
              </SettingsSection>

              <SettingsSection title="Comparer les offres">
                {[
                  { id:'free',    name:'Free',    price:'0 €',  features:['30 créations / mois','1 identité de marque','Actu · Citation · Deep Dive','Export JPEG'] },
                  { id:'starter', name:'Starter', price:'12 €', features:['80 créations / mois','3 identités de marque','Génération IA cinématique','Planification Instagram'] },
                  { id:'pro',     name:'Pro',     price:'29 €', features:['Illimité','10 identités de marque','IA image premium','Équipe jusqu\'à 5 membres','API access'] },
                ].map(function(p) {
                  var isCurrent = plan === p.id;
                  return (
                    <div key={p.id} className={'settings-plan-compare-row' + (isCurrent ? ' spc--current' : '')}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <span style={{ fontSize:13.5, fontWeight:600, color: isCurrent ? 'var(--app-accent)' : 'var(--app-fg)' }}>
                          {p.name}
                        </span>
                        {isCurrent && <span className="settings-tag settings-tag--accent">Actuel</span>}
                      </div>
                      <div style={{ display:'flex', gap:24, alignItems:'flex-end' }}>
                        <div style={{ flex:1 }}>
                          {p.features.map(function(f, i) {
                            return (
                              <div key={i} style={{ display:'flex', alignItems:'center', gap:6,
                                fontSize:12, color:'var(--app-fg-3)', lineHeight:1.9 }}>
                                <span style={{ color:'var(--app-accent)', opacity: isCurrent ? 1 : .5, fontSize:10 }}>◆</span>
                                {f}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontFamily:"'Fraunces',serif", fontSize:20, fontWeight:600,
                            letterSpacing:'-0.03em', lineHeight:1 }}>
                            {p.price}
                            <span style={{ fontSize:11, fontWeight:400, color:'var(--app-fg-4)' }}>/mois</span>
                          </div>
                          {!isCurrent && (
                            <button className="btn btn-ghost btn-sm" style={{ marginTop:8 }}>
                              Choisir
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </SettingsSection>
            </div>
          )}

          {/* ────────── CONNEXIONS ────────── */}
          {tab === 'connexions' && (
            <div>
              <SettingsSection title="Réseaux sociaux"
                sub="Connectez vos comptes pour publier directement depuis Forje Studio.">
                {[
                  { name:'Instagram', emoji:'📸', color:'#E1306C', bg:'rgba(225,48,108,.1)', status:'disconnected', live:true },
                  { name:'LinkedIn',  emoji:'💼', color:'#0A66C2', bg:'rgba(10,102,194,.08)', status:'soon', live:false },
                  { name:'X · Twitter',emoji:'𝕏', color:'#000', bg:'rgba(0,0,0,.06)', status:'soon', live:false },
                  { name:'Buffer',    emoji:'🗓', color:'#4A90D9', bg:'rgba(74,144,217,.1)', status:'soon', live:false },
                ].map(function(conn) {
                  return (
                    <div key={conn.name} className="settings-conn-row">
                      <div className="settings-conn-icon"
                        style={{ background: conn.live ? conn.bg : 'var(--app-surface-2)' }}>
                        <span style={{ fontSize:17, opacity: conn.live ? 1 : .45 }}>{conn.emoji}</span>
                      </div>
                      <div className="settings-conn-info">
                        <div className="settings-conn-name"
                          style={{ color: conn.live ? 'var(--app-fg)' : 'var(--app-fg-4)' }}>
                          {conn.name}
                        </div>
                        <div className={'settings-conn-status' + (conn.status === 'connected' ? ' connected' : '')}>
                          {conn.status === 'connected' ? '● Connecté' : conn.status === 'soon' ? 'Bientôt disponible' : 'Non connecté'}
                        </div>
                      </div>
                      {conn.live
                        ? <button className="btn btn-ghost btn-sm">
                            {conn.status === 'connected' ? 'Déconnecter' : 'Connecter'}
                          </button>
                        : <span className="settings-tag settings-tag--neutral" style={{ opacity:.6, fontSize:10 }}>
                            Bientôt
                          </span>}
                    </div>
                  );
                })}
              </SettingsSection>

              <SettingsSection title="Intégrations"
                sub="Outils tiers pour planifier et analyser vos publications.">
                {[
                  { name:'Later', emoji:'🕐', status:'soon' },
                  { name:'Hootsuite', emoji:'🦉', status:'soon' },
                  { name:'Make / Zapier', emoji:'⚡', status:'soon' },
                ].map(function(tool) {
                  return (
                    <div key={tool.name} className="settings-conn-row">
                      <div className="settings-conn-icon" style={{ background:'var(--app-surface-2)' }}>
                        <span style={{ fontSize:17, opacity:.4 }}>{tool.emoji}</span>
                      </div>
                      <div className="settings-conn-info">
                        <div className="settings-conn-name" style={{ color:'var(--app-fg-4)' }}>{tool.name}</div>
                        <div className="settings-conn-status">Bientôt disponible</div>
                      </div>
                      <span className="settings-tag settings-tag--neutral" style={{ opacity:.6, fontSize:10 }}>Bientôt</span>
                    </div>
                  );
                })}
              </SettingsSection>
            </div>
          )}

          {/* ────────── PRÉFÉRENCES ────────── */}
          {tab === 'preferences' && (
            <div>
              <SettingsSection title="Notifications"
                sub="Choisissez comment Forje vous tient informé.">
                <SettingsRow
                  label="Résumé quotidien par email"
                  sub="Un brief des meilleures actus à 8h chaque matin."
                  right={<SettingsToggle checked={notifEmail} onChange={function(v){ setNotifEmail(v); savePref('notifEmail', v); }}/>}
                />
                <SettingsRow
                  label="Notifications push"
                  sub="Alertes en temps réel sur les articles très scorés."
                  right={<SettingsToggle checked={notifPush} onChange={function(v){ setNotifPush(v); savePref('notifPush', v); }}/>}
                />
                <SettingsRow
                  label="Score automatique des articles"
                  sub="Forje évalue chaque article entrant selon votre ligne éditoriale."
                  right={<SettingsToggle checked={autoScore} onChange={function(v){ setAutoScore(v); savePref('autoScore', v); }}/>}
                />
              </SettingsSection>

              <SettingsSection title="Interface"
                sub="Personnalisez votre expérience Forje Studio.">
                <SettingsRow
                  label="Langue"
                  sub="Langue de l'interface utilisateur."
                  right={
                    <select style={{ background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
                      borderRadius:'var(--radius-sm)', padding:'5px 10px', color:'var(--app-fg)',
                      fontSize:12, fontFamily:'inherit', cursor:'pointer', outline:'none' }}>
                      <option>🇫🇷  Français</option>
                      <option>🇬🇧  English</option>
                    </select>
                  }
                />
                <SettingsRow
                  label="Format de post par défaut"
                  sub="Affiché en premier sur l'écran Générer."
                  right={
                    <select
                      value={defFormat}
                      onChange={function(e){ setDefFormat(e.target.value); savePref('defaultFormat', e.target.value); }}
                      style={{ background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
                        borderRadius:'var(--radius-sm)', padding:'5px 10px', color:'var(--app-fg)',
                        fontSize:12, fontFamily:'inherit', cursor:'pointer', outline:'none' }}>
                      <option>Actualité</option>
                      <option>Citation</option>
                      <option>Deep Dive</option>
                    </select>
                  }
                />
                <SettingsRow
                  label="Mode Trader · Pulse"
                  sub="Active un terminal veille style Bloomberg dans la navigation."
                  right={<SettingsToggle checked={pulseMode} onChange={function(v){ setPulseMode(v); savePref('pulseMode', v); }}/>}
                />
              </SettingsSection>

              <SettingsSection title="Données & Confidentialité"
                sub="Contrôlez comment Forje utilise vos données.">
                <SettingsRow
                  label="Améliorer Forje avec mes données"
                  sub="Vos posts et interactions servent à entraîner les modèles de personnalisation."
                  right={<SettingsToggle checked={true} onChange={function(){}}/>}
                />
                <SettingsRow
                  label="Politique de confidentialité"
                  sub="Consultez la politique complète sur forje.studio/privacy."
                  right={
                    <button className="btn btn-ghost btn-sm">
                      <AppIcon name="arrowRight" size={12}/>
                      Lire
                    </button>
                  }
                />
              </SettingsSection>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

Object.assign(window, { GenerateScreen, QueueScreen, BrandScreen, SettingsScreen });
