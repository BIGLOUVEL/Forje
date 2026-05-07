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
  ctx.fillStyle = badgeColor;
  ctx.beginPath(); ctx.roundRect(60, startY, catW, badgeH, 4); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 19px ' + catFamily;
  ctx.letterSpacing = '2px';
  ctx.fillText(catLabel, 78, startY + 33);
  ctx.letterSpacing = '0px';

  // 7. Title
  ctx.fillStyle = '#ffffff';
  ctx.font = headFont;
  ctx.letterSpacing = headSpacing + 'px';
  var ty = startY + badgeH + gap;
  titleLines.forEach(function(line, i) { ctx.fillText(line, 60, ty + 88 + i * lineH); });
  ctx.letterSpacing = '0px';

  // 8. Subtitle
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = subFont;
  var sy = ty + titleH + gap;
  subLines.forEach(function(line, i) { ctx.fillText(line, 60, sy + 28 + i * 40); });

  return canvas.toDataURL('image/jpeg', 0.92);
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE — hub (Higgsfield-like) + creation (2 variations via tweak)
// ═══════════════════════════════════════════════════════════════════════════
const GenerateScreen = ({ layoutVariant, preset, onPickPreset, onBack, onGoToBoard }) => {
  if (preset) {
    return layoutVariant === 'chat'
      ? <GenerateChat preset={preset} onBack={onBack} onGoToBoard={onGoToBoard}/>
      : <GenerateStudio preset={preset} onBack={onBack} onGoToBoard={onGoToBoard}/>;
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

const GenerateHub = ({ onPick }) => {
  var [text,      setText]      = useState('');
  var [detecting, setDetecting] = useState(false);
  var [err,       setErr]       = useState('');
  var placeholder = HUB_PLACEHOLDERS[Math.floor(Date.now() / 30000) % HUB_PLACEHOLDERS.length];

  var handleDetect = async function() {
    var t = text.trim();
    if (!t || detecting) return;
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
      onPick({ ...preset, prefill: data });
    } catch (e) {
      setErr(e.message);
      setDetecting(false);
    }
  };

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

      <div className="gen-prompt-card">
        <div className="gen-prompt-badge">
          <AppIcon name="sparkle" size={14}/>
          <span>Décris-le avec tes mots — Forje choisit le bon format</span>
        </div>
        <div className="gen-prompt-input">
          <textarea
            value={text}
            onChange={function(e) { setText(e.target.value); setErr(''); }}
            onKeyDown={function(e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleDetect(); }}
            placeholder={placeholder}
            rows={3}
            autoFocus
          />
        </div>
        <div className="gen-prompt-foot">
          <div className="gen-prompt-hints">
            {err
              ? <span style={{ color:'#ef4444' }}>{err}</span>
              : text.length > 0 && text.length < 10
                ? <span style={{ color:'#f59e0b' }}>Continue un peu…</span>
                : <span>{detecting ? 'Analyse en cours...' : 'Forje détecte le format · ⌘↵ pour envoyer'}</span>}
          </div>
          {text.length > 0 && (
            <span style={{ fontSize:11, color: text.length > 500 ? '#ef4444' : 'var(--app-fg-4)', marginRight:8, fontVariantNumeric:'tabular-nums' }}>
              {text.length}
            </span>
          )}
          <button
            className={'btn btn-accent btn-sm' + (!text.trim() || detecting ? ' btn-disabled' : '')}
            onClick={handleDetect}
            disabled={!text.trim() || detecting}
            style={{ display:'flex', alignItems:'center', gap:6 }}>
            {detecting
              ? <><div style={{ width:12, height:12, border:'1.5px solid rgba(255,255,255,.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'vb-spin .7s linear infinite' }}/> Analyse...</>
              : <><AppIcon name="arrowRight" size={13}/> Générer</>}
          </button>
        </div>
      </div>

      <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--app-fg-4)', margin:'24px 0 12px' }}>
        Ou choisissez un format directement
      </div>

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
var _genActive = null; // preset ID of in-flight generation (survives navigation)

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
      {s.imageMode === 'classic' && (
        <div>
          <PhotoDropzone photoData={s.photoData} setPhotoData={s.setPhotoData}
            photoUrl={s.photoUrl} setPhotoUrl={s.setPhotoUrl}/>
          <div className="tool-sub">Sans photo, Forje cherche via Serper</div>
        </div>
      )}
      {s.imageMode === 'ai' && (
        <div>
          <div className="tool-sub" style={{ lineHeight:1.6 }}>
            Gemini génère un visuel cinématique sur-mesure.<br/>
            <span style={{ opacity:.65 }}>Personne réelle → Gemini · Ambiance/Objet → GPT-Image-1</span>
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
      <GenFormInput value={s.topic} onChange={s.setTopic} rows={5}
        placeholder="Decris le sujet — ex : L histoire du tannage vegetal en France..."/>
      <div className="tool-sub">Forje genere 6 slides avec titre, texte et fond degrade editorial</div>
    </ToolSection>
  </>);

  return null;
};
const GenPlaceholder = () => (
  <div className="gen-empty-wrap">
    <div className="gen-empty-post-frame">
      <div className="gen-empty-post-inner">
        <span className="gen-empty-sparkle">✦</span>
      </div>
    </div>
    <div className="gen-empty-text">Remplis le formulaire · Génère</div>
  </div>
);

const LOADER_STEPS = {
  actu:     [[0,'Analyse de l\'actu…'],[5000,'Génération du visuel cinématique…'],[14000,'Rédaction du post…'],[22000,'Caption Instagram…'],[30000,'Finalisation…']],
  citation: [[0,'Composition visuelle…'],[6000,'Mise en forme typographique…'],[12000,'Finalisation…']],
  deepdive: [[0,'Plan éditorial…'],[8000,'Génération des 6 slides…'],[18000,'Finalisation…']],
};
const LOADER_TOTAL = { actu: 36000, citation: 18000, deepdive: 28000 };

const GenLoader = ({ preset }) => {
  const id = preset?.id || 'actu';
  const steps = LOADER_STEPS[id] || LOADER_STEPS.actu;
  const total = LOADER_TOTAL[id] || 36000;
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timers = steps.slice(1).map(([delay,], i) => setTimeout(() => setStepIdx(i + 1), delay));
    const start = Date.now();
    const tick = setInterval(() => setProgress(Math.min((Date.now() - start) / total * 100, 94)), 120);
    return () => { timers.forEach(clearTimeout); clearInterval(tick); };
  }, []);

  return (
    <div className="gen-loader-wrap">
      <div className="gen-loader-card">
        <div className="gen-loader-card-inner">
          <div className="gen-loader-shimmer"/>
          {/* Instagram post skeleton */}
          <div className="gen-loader-skel">
            <div className="gen-skel-img"/>
            <div className="gen-skel-foot">
              <div className="gen-skel-avatar"/>
              <div className="gen-skel-lines">
                <div className="gen-skel-line gen-skel-line--70"/>
                <div className="gen-skel-line gen-skel-line--45"/>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="gen-loader-bar-wrap">
        <div className="gen-loader-bar-fill" style={{ width: progress + '%' }}/>
      </div>
      <div className="gen-loader-info">
        <div className="gen-loader-step" key={stepIdx}>{steps[stepIdx][1]}</div>
        <div className="gen-loader-dots"><span/><span/><span/></div>
      </div>
    </div>
  );
};

const GenerateChat = ({ preset, onBack, onGoToBoard }) => {
  const GEN_KEY     = `forje_gen_result_${preset.id}`;
  const INPUTS_KEY  = `forje_gen_inputs_${preset.id}`;

  const savedResult = (() => { try { return JSON.parse(sessionStorage.getItem(GEN_KEY) || 'null'); } catch(_){ return null; } })();
  const savedInputs = (() => { try { return JSON.parse(sessionStorage.getItem(INPUTS_KEY) || 'null'); } catch(_){ return null; } })();

  const [newsText,    setNewsText]    = useState(preset.prefill?.newsText  || savedInputs?.newsText  || '');
  const [photoUrl,    setPhotoUrl]    = useState('');
  const [photoData,   setPhotoData]   = useState('');
  const [quoteText,   setQuoteText]   = useState(preset.prefill?.quoteText || savedInputs?.quoteText || '');
  const [authorName,  setAuthorName]  = useState(preset.prefill?.authorName|| savedInputs?.authorName|| '');
  const [authorTitle, setAuthorTitle] = useState('');
  const [topic,       setTopic]       = useState(preset.prefill?.topic     || savedInputs?.topic     || '');
  const [imageMode,    setImageMode]    = useState('ai');
  const [styleRefData, setStyleRefData] = useState(null);
  const [generating,   setGenerating]   = useState(_genActive === preset.id);
  const [result,       setResult]       = useState(savedResult);
  const [error,        setError]        = useState(null);
  const [activeSlide,  setActiveSlide]  = useState(0);
  const isMountedRef = useRef(true);
  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

  // Register global callbacks so an in-flight generation can reach THIS mounted instance
  useEffect(() => {
    var alive = true;
    window.__onGenResult = function(data, presetId) {
      if (alive && presetId === preset.id) { setGenerating(false); setResult(data); }
    };
    window.__onGenError = function(msg, presetId) {
      if (alive && presetId === preset.id) { setGenerating(false); setError(msg); }
    };
    return function() { alive = false; };
  }, []);

  const s = { newsText, setNewsText, photoUrl, setPhotoUrl, photoData, setPhotoData, quoteText, setQuoteText,
              authorName, setAuthorName, authorTitle, setAuthorTitle, topic, setTopic,
              imageMode, setImageMode, styleRefData, setStyleRefData };

  const canGenerate = {
    actu:     newsText.trim().length > 10,
    citation: quoteText.trim().length > 3 && authorName.trim().length > 1,
    deepdive: topic.trim().length > 5,
  }[preset.id] || false;

  const handleGenerate = async () => {
    _genActive = preset.id;
    if (isMountedRef.current) { setGenerating(true); setError(null); setResult(null); setActiveSlide(0); }
    sessionStorage.removeItem(GEN_KEY);
    try {
      sessionStorage.setItem(INPUTS_KEY, JSON.stringify({ newsText, quoteText, topic, authorName }));
    } catch(_) {}
    window.__setGenToast?.({ status: 'generating', label: preset.label, presetId: preset.id, preset });
    try {
      const userId   = window.__currentUser?.id;
      const clientId = window.__activeClientId || undefined;
      const ep   = { actu:'/generate/actu', citation:'/generate/citation', deepdive:'/generate/deepdive' }[preset.id];
      const body = {
        actu:     { newsText, photoUrl: photoUrl || undefined, photoData: photoData || undefined, userId, clientId, imageMode, styleRefData: styleRefData || undefined },
        citation: { quoteText, authorName, authorTitle: authorTitle || undefined, userId, clientId },
        deepdive: { topic, userId, clientId },
      }[preset.id];
      const res  = await veilleFetch(ep, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur génération');
      if (data.bgImage) { data.image = await renderActuCanvas(data); }
      try { sessionStorage.setItem(GEN_KEY, JSON.stringify(data)); } catch(_) {}
      window.__setGenToast?.({ status: 'ready', label: preset.label, presetId: preset.id, preset });
      if (isMountedRef.current) {
        setResult(data);
      } else {
        // component navigated away — deliver result to whatever instance is mounted now
        window.__onGenResult?.(data, preset.id);
      }
    } catch (err) {
      window.__setGenToast?.(null);
      if (isMountedRef.current) {
        setError(err.message);
      } else {
        window.__onGenError?.(err.message, preset.id);
      }
    } finally {
      _genActive = null;
      if (isMountedRef.current) setGenerating(false);
    }
  };

  const handleDownload = () => {
    const src  = preset.id === 'deepdive' ? result?.images?.[activeSlide] : result?.image;
    if (!src) return;
    const link = document.createElement('a');
    link.href  = src;
    link.download = `forje-${preset.id}-${Date.now()}.jpg`;
    link.click();
  };

  const previewImages = preset.id === 'deepdive' ? (result?.images || []) : (result?.image ? [result.image] : []);

  // Si résultat déjà là et toast encore visible, on le dismiss
  useEffect(() => { if (result) window.__setGenToast?.(null); }, [result]);

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
          {result && (
            <button className="btn btn-ghost btn-sm" onClick={handleDownload}>
              <AppIcon name="image" size={12}/>Télécharger
            </button>
          )}
        </div>
      </div>

      <div className={`gen-studio-grid${result || generating ? ' gen-studio-grid--studio' : ''}`}>
        {/* LEFT : formulaire */}
        <div className="gen-tools">
          <GenFormFields preset={preset} s={s}/>
          {error && (
            <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, fontSize:12,
              background:'rgba(197,48,48,.06)', border:'1px solid rgba(197,48,48,.15)', color:'#C53030' }}>
              {error}
            </div>
          )}
          <button className="btn-forge" onClick={handleGenerate} disabled={generating || !canGenerate}>
            {generating
              ? <><span style={{ display:'inline-block', width:13, height:13, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'vb-spin .7s linear infinite' }}/> Génération…</>
              : <><AppIcon name="sparkle" size={15}/> Générer</>}
          </button>
        </div>

        {/* RIGHT : preview — s'ouvre au déclenchement de la génération */}
        {(result || generating) && (
        <div className="gen-preview">
          {preset.id === 'deepdive' && previewImages.length > 1 && (
            <div className="gen-preview-head">
              <div className="gen-preview-variants">
                {previewImages.map((_, i) => (
                  <button key={i} className={`gen-variant-btn ${activeSlide===i?'active':''}`} onClick={() => setActiveSlide(i)}>
                    Slide {i+1}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="gen-preview-stage">
            {generating
              ? <GenLoader preset={preset}/>
              : previewImages.length
                ? <img src={previewImages[activeSlide] || previewImages[0]} alt=""/>
                : null}
          </div>
          {result && (
            <div className="gen-captions-scroll">
              {preset.id !== 'deepdive' && result.title && (
                <div className="gen-preview-caption gen-preview-caption--no-border">
                  <div className="caption-head">
                    <span className="caption-label">{result.category} · {result.title}</span>
                  </div>
                  <div className="caption-body" style={{ fontSize:13, color:'var(--app-fg-3)' }}>
                    {result.subtitle}
                  </div>
                </div>
              )}
              {preset.id === 'deepdive' && result.slides && (
                <div className="gen-preview-caption gen-preview-caption--no-border">
                  <div className="caption-head">
                    <span className="caption-label">Slide {activeSlide+1} / {result.slides.length}</span>
                  </div>
                  <div className="caption-body" style={{ fontSize:13, color:'var(--app-fg-3)' }}>
                    <b>{result.slides[activeSlide]?.title}</b><br/>
                    {result.slides[activeSlide]?.body}
                  </div>
                </div>
              )}
              {result.caption && <IgCaption caption={result.caption}/>}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};

const IgCaption = ({ caption }) => {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(caption).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="gen-preview-caption gen-ig-caption">
      <div className="caption-head">
        <span className="caption-label">Caption Instagram</span>
        <button className="btn btn-ghost btn-sm" onClick={copy} style={{ padding:'3px 10px', fontSize:11 }}>
          {copied ? '✓ Copié' : 'Copier'}
        </button>
      </div>
      <div className="caption-ig-body">
        {caption}
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
  var pack = FONT_PACKS.find(function(p) { return p.id === props.graphicStyle; });
  var primaryColor = props.primaryColor;
  var accentColor  = props.accentColor;
  var logoUrl      = props.logoUrl;
  var name         = props.name;

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
          <div style={{ display:'inline-block', padding:'2px 8px',
            background:primaryColor, fontSize:9, fontWeight:700, color:'#fff',
            letterSpacing:1.5, marginBottom:8, textTransform:'uppercase',
            fontFamily:pack.catStyle.fontFamily }}>
            SPORT
          </div>
          <div style={{ ...pack.headStyle, fontSize: Math.round(pack.headStyle.fontSize * .65), marginBottom:6,
            color: isLight ? '#0a0a0a' : pack.headStyle.color }}>
            {name ? name.toUpperCase() : pack.sampleHead}
          </div>
          <div style={{ ...pack.bodyStyle, fontSize: Math.round(pack.bodyStyle.fontSize * 1.3),
            color: isLight ? '#666' : pack.bodyStyle.color }}>
            L'actu en temps reel.
          </div>
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background:accentColor }}/>
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
        <div style={{ display:'inline-block', padding:'2px 8px', borderRadius:3,
          background:primaryColor, fontSize:9, fontWeight:700, color:'#fff',
          letterSpacing:1.5, marginBottom:8, textTransform:'uppercase' }}>
          SPORT
        </div>
        <div style={{ fontSize:22, fontWeight:900, color:'#fff', lineHeight:1.05,
          marginBottom:6, letterSpacing:-0.5, textTransform:'uppercase',
          fontFamily:(props.fontPrimary || 'DM Sans')+',sans-serif' }}>
          {name ? name.toUpperCase().slice(0,12) : 'MON MEDIA'}
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,.6)' }}>L'actu en temps reel.</div>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:accentColor }}/>
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

const BrandScreen = ({ clientId, onSaved }) => {
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
  var [showVeilleNudge, setShowVeilleNudge] = useState(false);
  var [igInput,         setIgInput]         = useState('');
  var [igAnalyzing,     setIgAnalyzing]     = useState(false);
  var [igResult,        setIgResult]        = useState(null);
  var [igErr,           setIgErr]           = useState('');

  // Load from Supabase — réagit au changement de clientId (switch de compte)
  useEffect(function() {
    var sb = window.__supabase; var user = window.__currentUser;
    // Reset du formulaire à chaque changement de compte
    setName(''); setLogoUrl(''); setStyleRefUrl('');
    setPrimaryColor('#6366F1'); setAccentColor('#10B981'); setFontPrimary('DM Sans');
    setMood(''); setToneTags([]); setGraphicStyle(''); setTopics([]);
    setInstaHandle(''); setHashtags([]); setPreferredFormat('4:5');
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
          setMood(d.mood || '');
          setToneTags(d.tone_tags || []);
          var gs = d.graphic_style || '';
          setGraphicStyle(STYLE_TO_PACK[gs] || gs);
          setTopics(d.topics || []);
          setInstaHandle(d.instagram_handle || '');
          setHashtags(d.hashtags || []);
          setPreferredFormat(d.preferred_format || '4:5');
          setStyleRefUrl(d.style_ref_url || '');
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

  // Sync fontPrimary when pack changes
  useEffect(function() {
    var pf = PACK_FONTS[graphicStyle];
    if (pf) setFontPrimary(pf);
  }, [graphicStyle]);

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
      font_primary:     PACK_FONTS[graphicStyle] || fontPrimary,
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
      <div className="page-header" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <h1 className="page-title">Forge ton identite</h1>
          <p className="page-subtitle">
            Tout ce que tu remplis ici sera utilise a chaque generation.
            Plus tu es precis, plus tes posts seront fideles a ta marque.
          </p>
        </div>
        <button onClick={handleSave} disabled={saving || !canSave}
          style={{ all:'unset', flexShrink:0, marginTop:4, cursor: canSave && !saving ? 'pointer' : 'not-allowed',
            padding:'9px 20px', borderRadius:'var(--radius)', fontSize:13, fontWeight:600,
            background: canSave && !saving ? 'var(--app-accent)' : 'var(--app-surface-3)',
            color: canSave && !saving ? '#fff' : 'var(--app-fg-4)',
            display:'flex', alignItems:'center', gap:7, transition:'all .2s',
            boxShadow: canSave && !saving ? '0 2px 8px rgba(99,102,241,.35)' : 'none' }}>
          {saving
            ? React.createElement('span', { style:{display:'flex',alignItems:'center',gap:6} },
                React.createElement('span', { style:{width:12,height:12,border:'2px solid rgba(255,255,255,.3)',
                  borderTopColor:'#fff',borderRadius:'50%',animation:'vb-spin .7s linear infinite'} }),
                'Sauvegarde...')
            : React.createElement('span', { style:{display:'flex',alignItems:'center',gap:6} },
                React.createElement(AppIcon, { name:'check', size:13 }),
                canSave ? 'Enregistrer' : 'Ajoute un nom')
          }
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 260px', gap:40, alignItems:'start' }}>

        <div style={{ maxWidth:640 }}>

          {/* Bloc analyse Instagram */}
          <div style={{ marginBottom:24, padding:'16px 18px', borderRadius:'var(--radius)',
            background:'linear-gradient(135deg, rgba(99,102,241,.07) 0%, rgba(16,185,129,.05) 100%)',
            border:'1px solid rgba(99,102,241,.18)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <AppIcon name="sparkle" size={14} style={{ color:'var(--app-accent)' }}/>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--app-fg)' }}>
                Remplis automatiquement depuis Instagram
              </span>
            </div>
            <p style={{ margin:'0 0 12px', fontSize:12, color:'var(--app-fg-4)', lineHeight:1.5 }}>
              Colle ton URL ou ton @handle — l'IA analyse ton profil et pre-remplit tous les champs.
            </p>
            <div style={{ display:'flex', gap:8 }}>
              <input value={igInput} onChange={function(e){ setIgInput(e.target.value); }}
                onKeyDown={function(e){ if (e.key === 'Enter') analyzeInstagram(); }}
                placeholder="@footmercato ou https://instagram.com/footmercato"
                style={{ flex:1, background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
                  borderRadius:'var(--radius)', padding:'8px 12px', color:'var(--app-fg)',
                  fontFamily:'DM Sans,sans-serif', fontSize:13, outline:'none' }}/>
              <button onClick={analyzeInstagram} disabled={igAnalyzing || !igInput.trim()}
                style={{ all:'unset', cursor: igInput.trim() && !igAnalyzing ? 'pointer' : 'not-allowed',
                  padding:'8px 16px', borderRadius:'var(--radius)', fontSize:13, fontWeight:600,
                  background:'var(--app-accent)', color:'#fff', flexShrink:0,
                  opacity: igInput.trim() && !igAnalyzing ? 1 : 0.5,
                  display:'flex', alignItems:'center', gap:6 }}>
                {igAnalyzing
                  ? React.createElement('span', { style:{display:'flex',alignItems:'center',gap:6} },
                      React.createElement('span', { style:{width:12,height:12,border:'2px solid rgba(255,255,255,.3)',
                        borderTopColor:'#fff',borderRadius:'50%',animation:'vb-spin .7s linear infinite'} }),
                      'Analyse...')
                  : React.createElement('span', { style:{display:'flex',alignItems:'center',gap:6} },
                      React.createElement(AppIcon, { name:'sparkle', size:13 }), 'Analyser')
                }
              </button>
            </div>
            {igErr && (
              <div style={{ marginTop:10, fontSize:12, color:'#ef4444', padding:'6px 10px',
                background:'rgba(239,68,68,.06)', borderRadius:6, border:'1px solid rgba(239,68,68,.15)' }}>
                {igErr}
              </div>
            )}
            {igResult && igResult.suggestions && (
              <div style={{ marginTop:12, padding:'12px 14px', background:'var(--app-surface-2)',
                borderRadius:'var(--radius)', border:'1px solid var(--app-line-3)' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                  {igResult.avatarUrl && (
                    <img src={igResult.avatarUrl} style={{ width:36, height:36, borderRadius:'50%',
                      objectFit:'cover', flexShrink:0 }} onError={function(e){ e.target.style.display='none'; }}/>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--app-fg)' }}>{igResult.name}</div>
                    {igResult.bio && (
                      <div style={{ fontSize:11.5, color:'var(--app-fg-4)', lineHeight:1.4,
                        marginTop:2, overflow:'hidden', display:'-webkit-box',
                        WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                        {igResult.bio}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize:11.5, color:'var(--app-fg-4)', marginBottom:10, lineHeight:1.6 }}>
                  <strong style={{ color:'var(--app-fg-3)' }}>Mood</strong> {igResult.suggestions.mood}
                  {' · '}
                  <strong style={{ color:'var(--app-fg-3)' }}>Pack</strong> {igResult.suggestions.graphic_style}
                  {' · '}
                  <strong style={{ color:'var(--app-fg-3)' }}>Ton</strong> {(igResult.suggestions.tone_tags || []).join(', ')}
                  <br/>
                  <strong style={{ color:'var(--app-fg-3)' }}>Sujets</strong> {(igResult.suggestions.topics || []).join(' · ')}
                  {igResult.suggestions.rationale && (
                    React.createElement(React.Fragment, null,
                      React.createElement('br'),
                      React.createElement('em', null, igResult.suggestions.rationale)
                    )
                  )}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={applyIgSuggestions}
                    style={{ all:'unset', cursor:'pointer', padding:'7px 14px', borderRadius:6,
                      background:'var(--app-accent)', color:'#fff', fontSize:12, fontWeight:600,
                      display:'flex', alignItems:'center', gap:6 }}>
                    <AppIcon name="check" size={12}/>
                    Appliquer les suggestions
                  </button>
                  <button onClick={function(){ setIgResult(null); }}
                    style={{ all:'unset', cursor:'pointer', padding:'7px 12px', borderRadius:6,
                      border:'1px solid var(--app-line)', color:'var(--app-fg-4)', fontSize:12 }}>
                    Ignorer
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Barre de progression */}
          <div style={{ marginBottom:28, padding:'14px 18px', background:'var(--app-surface-2)',
            borderRadius:'var(--radius)', border:'1px solid var(--app-line)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--app-fg)' }}>
                {completedCount} / 7 champs completes
              </span>
              <span style={{ fontSize:12, color: canSave ? '#22c55e' : 'var(--app-fg-4)' }}>
                {completedCount === 7 ? 'Profil complet' : (7 - completedCount) + ' a completer'}
              </span>
            </div>
            <div style={{ height:4, background:'var(--app-line)', borderRadius:2 }}>
              <div style={{ height:'100%', width:(completedCount / 7 * 100) + '%',
                background:'var(--app-accent)', borderRadius:2, transition:'width .3s ease' }}/>
            </div>
          </div>

          {/* 01 Nom */}
          <BrandSect num="01" title="Nom du media"
            desc="Utilise dans les logs, emails et dashboard. Le nom public de ton compte."
            tip="Ex : Footmercato, Raplume, Le Monde...">
            <input value={name} onChange={function(e){ setName(e.target.value); }}
              onBlur={function(){ if (name.trim() && clientId) handleSave(); }}
              placeholder="Raplume, Footmercato, Le Monde..."
              style={inputStyle}/>
          </BrandSect>

          {/* 02 Logo */}
          <BrandSect num="02" title="Logo"
            desc="Place en haut a droite de chaque post genere. Redimensionne a 48px de hauteur automatiquement."
            tip="Utilise la version blanche ou claire sur fond transparent.">
            {logoUrl ? (
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
                background:'var(--app-surface-3)', borderRadius:'var(--radius)',
                border:'1px solid var(--app-line-3)' }}>
                <div style={{ width:52, height:52, borderRadius:8, background:'#14141e',
                  display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
                  <img src={logoUrl} style={{ maxWidth:46, maxHeight:40, objectFit:'contain' }}/>
                </div>
                <div style={{ flex:1, fontSize:12, color:'var(--app-fg-3)' }}>Logo uploade avec succes</div>
                <button onClick={function(){ setLogoUrl(''); }}
                  style={{ all:'unset', cursor:'pointer', fontSize:12, color:'#ef4444',
                    padding:'4px 10px', borderRadius:6, border:'1px solid #ef4444' }}>
                  Supprimer
                </button>
              </div>
            ) : (
              <div onClick={function(){
                  var inp = document.createElement('input');
                  inp.type = 'file'; inp.accept = 'image/png';
                  inp.onchange = function(e){ handleLogoUpload(e.target.files[0]); };
                  inp.click();
                }}
                style={{ border:'2px dashed var(--app-line)', borderRadius:8, padding:'22px 16px',
                  textAlign:'center', cursor:'pointer', transition:'border-color .15s, background .15s',
                  background: logoUploading ? 'var(--app-surface-2)' : 'transparent' }}>
                {logoUploading ? (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                    fontSize:13, color:'var(--app-fg-4)' }}>
                    <div style={{ width:14, height:14, border:'2px solid var(--app-line)',
                      borderTopColor:'var(--app-accent)', borderRadius:'50%', animation:'vb-spin .7s linear infinite' }}/>
                    Upload en cours...
                  </div>
                ) : (
                  <div style={{ fontSize:13, color:'var(--app-fg-4)', lineHeight:1.8 }}>
                    Clique pour uploader ton logo<br/>
                    <span style={{ fontSize:11, opacity:.65 }}>PNG uniquement — fond transparent</span>
                  </div>
                )}
              </div>
            )}
          </BrandSect>

          {/* 03 Référence visuelle */}
          <BrandSect num="03" title="Référence visuelle de style"
            desc="Une image dont l'IA s'inspirera pour l'esthétique de TOUS tes visuels générés. Style, ambiance, composition — pas les objets ni les couleurs forcément."
            tip="Le prompt texte prime toujours. Cette ref influence uniquement l'atmosphère et le traitement visuel.">
            {styleRefUrl ? (
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
                background:'var(--app-surface-3)', borderRadius:'var(--radius)',
                border:'1px solid var(--app-line-3)' }}>
                <img src={styleRefUrl} style={{ width:64, height:64, borderRadius:8,
                  objectFit:'cover', flexShrink:0, border:'1px solid var(--app-line)' }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:'var(--app-fg-3)', marginBottom:3 }}>Référence de style active</div>
                  <div style={{ fontSize:11, color:'var(--app-fg-4)' }}>Influence toutes les générations de visuels</div>
                </div>
                <button onClick={function(){
                    var inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
                    inp.onchange = function(e){ handleStyleRefUpload(e.target.files[0]); }; inp.click();
                  }} style={{ all:'unset', cursor:'pointer', fontSize:12, color:'var(--app-accent)',
                    padding:'4px 10px', borderRadius:6, border:'1px solid var(--app-accent)' }}>
                  Changer
                </button>
                <button onClick={function(){ setStyleRefUrl(''); }}
                  style={{ all:'unset', cursor:'pointer', fontSize:12, color:'#ef4444',
                    padding:'4px 10px', borderRadius:6, border:'1px solid #ef4444' }}>
                  Supprimer
                </button>
              </div>
            ) : (
              <div onClick={function(){
                  var inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
                  inp.onchange = function(e){ handleStyleRefUpload(e.target.files[0]); }; inp.click();
                }}
                style={{ border:'2px dashed var(--app-line)', borderRadius:8, padding:'22px 16px',
                  textAlign:'center', cursor:'pointer', transition:'border-color .15s, background .15s',
                  background: styleRefUploading ? 'var(--app-surface-2)' : 'transparent' }}>
                {styleRefUploading ? (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                    fontSize:13, color:'var(--app-fg-4)' }}>
                    <div style={{ width:14, height:14, border:'2px solid var(--app-line)',
                      borderTopColor:'var(--app-accent)', borderRadius:'50%', animation:'vb-spin .7s linear infinite' }}/>
                    Upload en cours...
                  </div>
                ) : (
                  <div style={{ fontSize:13, color:'var(--app-fg-4)', lineHeight:1.8 }}>
                    Clique pour ajouter une image de référence<br/>
                    <span style={{ fontSize:11, opacity:.65 }}>JPG, PNG, WebP — style/ambiance uniquement</span>
                  </div>
                )}
              </div>
            )}
          </BrandSect>

          {/* 04 Palette */}
          <BrandSect num="04" title="Palette de couleurs"
            desc="Principale = badges, barres de progression, elements structurants. Accent = highlights et details."
            tip="Ces couleurs structurent visuellement tous tes posts.">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              {[
                ['Principale', primaryColor, function(e){ setPrimaryColor(e.target.value); }],
                ['Accent',     accentColor,  function(e){ setAccentColor(e.target.value); }],
              ].map(function(cfg) {
                return (
                  <div key={cfg[0]}>
                    <div style={{ fontSize:11, color:'var(--app-fg-4)', marginBottom:6,
                      textTransform:'uppercase', letterSpacing:.8 }}>{cfg[0]}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                      background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
                      borderRadius:'var(--radius)' }}>
                      <input type="color" value={cfg[1]} onChange={cfg[2]}
                        style={{ width:28, height:28, borderRadius:4, border:'none', padding:0, cursor:'pointer', background:'none' }}/>
                      <span style={{ fontSize:12, color:'var(--app-fg-3)', fontFamily:'JetBrains Mono,monospace' }}>{cfg[1]}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
              background:'var(--app-surface-2)', borderRadius:'var(--radius)', border:'1px solid var(--app-line)' }}>
              <div style={{ padding:'4px 12px', borderRadius:3, background:primaryColor,
                fontSize:11, fontWeight:700, color:'#fff', letterSpacing:1.5,
                textTransform:'uppercase', fontFamily:'DM Sans,sans-serif', flexShrink:0 }}>SPORT</div>
              <div style={{ width:40, height:3, borderRadius:2, background:accentColor, flexShrink:0 }}/>
              <span style={{ fontSize:12, color:'var(--app-fg-4)', fontStyle:'italic' }}>Apercu badge + barre</span>
            </div>
          </BrandSect>

          {/* 04 Pack typographique */}
          <BrandSect num="05" title="Pack typographique"
            desc="Typo + style graphique de tous tes posts. Chaque pack est cale sur les medias qui performent le plus sur Instagram en 2026."
            tip="L'analyse Instagram peut suggerer le bon pack automatiquement.">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:10 }}>
              {FONT_PACKS.map(function(p) {
                return <PackMiniCard key={p.id} pack={p} active={graphicStyle === p.id}
                  onSelect={function(){ setGraphicStyle(p.id); }}/>;
              })}
            </div>
            {graphicStyle && (
              <div style={{ padding:'10px 14px', background:'var(--app-surface-2)',
                border:'1px solid var(--app-line)', borderRadius:'var(--radius)',
                display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontSize:12, color:'var(--app-fg-3)' }}>
                  Police display : <strong style={{ color:'var(--app-fg)',
                    fontFamily: PACK_FONTS[graphicStyle] + ',sans-serif' }}>
                    {PACK_FONTS[graphicStyle]}
                  </strong>
                </div>
                <div style={{ fontSize:11, color:'var(--app-fg-4)', marginLeft:'auto' }}>
                  {FONT_PACKS.find(function(p){ return p.id === graphicStyle; })?.usage}
                </div>
              </div>
            )}
          </BrandSect>

          {/* 05 Mood */}
          <BrandSect num="06" title="Mood editorial"
            desc="L'ambiance visuelle globale. Gemini l'utilise pour definir lumiere, contraste et traitement de chaque visuel."
            tip="Ce mood est l'ame visuelle de chaque image generee.">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {BRAND_MOODS.map(function(m) {
                var active = mood === m.id;
                return (
                  <div key={m.id} onClick={function(){ setMood(m.id); }}
                    style={{ padding:'12px 14px', borderRadius:'var(--radius)',
                      border:'2px solid ' + (active ? 'var(--app-accent)' : 'var(--app-line)'),
                      background: active ? 'rgba(99,102,241,.06)' : 'var(--app-surface-2)',
                      cursor:'pointer', transition:'all .15s' }}>
                    <div style={{ fontWeight:600, fontSize:13,
                      color: active ? 'var(--app-accent)' : 'var(--app-fg)', marginBottom:3 }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize:11.5, color:'var(--app-fg-4)', lineHeight:1.45 }}>{m.desc}</div>
                  </div>
                );
              })}
            </div>
          </BrandSect>

          {/* 06 Ton */}
          <BrandSect num="07" title="Ton editorial"
            desc="3 mots max. Calibrent le ton des titres generes et briefent Gemini sur l'ambiance."
            tip="Selectionne jusqu'a 3 mots. Ils definissent comment ton media parle.">
            <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:8 }}>
              {BRAND_TONES.map(function(t) {
                var active = toneTags.includes(t);
                var maxed  = toneTags.length >= 3 && !active;
                return (
                  <button key={t} onClick={function(){ if (!maxed) toggleTone(t); }}
                    style={{ all:'unset', cursor: maxed ? 'not-allowed' : 'pointer',
                      padding:'5px 12px', borderRadius:20, fontSize:12.5, fontWeight:500,
                      border:'1.5px solid ' + (active ? 'var(--app-accent)' : 'var(--app-line)'),
                      color: active ? 'var(--app-accent)' : maxed ? 'var(--app-fg-4)' : 'var(--app-fg-2)',
                      background: active ? 'rgba(99,102,241,.08)' : 'var(--app-surface-2)',
                      transition:'all .15s', opacity: maxed ? 0.4 : 1 }}>
                    {t}
                  </button>
                );
              })}
            </div>
            {toneTags.length > 0 && (
              <div style={{ fontSize:12, color:'var(--app-fg-4)' }}>
                Selectionne : {toneTags.join(' · ')} ({toneTags.length}/3)
              </div>
            )}
          </BrandSect>

          {/* 07 Sujets */}
          <BrandSect num="08" title="Sujets couverts"
            desc="L'agent de veille score chaque actu selon ces topics. Les actus 85+ declenchent une alerte Actu Chaude."
            tip="Minimum 3 sujets requis. Maximum 10 recommandes. Tape un sujet puis Entree.">
            <BrandTagInput tags={topics} setTags={setTopics}
              placeholder="Football, PSG, Transferts... (Entree pour valider)"
              max={10}/>
            <div style={{ marginTop:6, fontSize:11.5,
              color: topics.length >= 3 ? '#22c55e' : 'var(--app-fg-4)' }}>
              {topics.length}/10 sujets{topics.length < 3 ? ' — minimum 3 requis' : ''}
            </div>
          </BrandSect>

          {/* Options avancees */}
          <div style={{ marginBottom:28 }}>
            <button onClick={function(){ setAdvancedOpen(!advancedOpen); }}
              style={{ all:'unset', cursor:'pointer', display:'flex', alignItems:'center', gap:8,
                fontSize:13, fontWeight:500, color:'var(--app-fg-3)',
                marginBottom: advancedOpen ? 20 : 0 }}>
              <AppIcon name={advancedOpen ? 'chevDown' : 'chevRight'} size={14}/>
              Options avancees
            </button>
            {advancedOpen && (
              <div>
                <BrandSect num="+" title="Compte Instagram"
                  desc="Future integration Meta API. Affiche dans le dashboard.">
                  <input value={instaHandle} onChange={function(e){ setInstaHandle(e.target.value); }}
                    placeholder="@votre_compte" style={inputStyle}/>
                </BrandSect>
                <BrandSect num="+" title="Hashtags habituels"
                  desc="Ajoutes automatiquement dans la caption suggeree.">
                  <BrandTagInput tags={hashtags} setTags={setHashtags}
                    placeholder="#football, #psg... (Entree pour ajouter)"/>
                </BrandSect>
                <BrandSect num="+" title="Format prefere"
                  desc="Format par defaut lors de la generation. Portrait 4:5 = le plus performant sur Instagram.">
                  <div style={{ display:'flex', gap:10 }}>
                    {[['4:5','Portrait 4:5'],['1:1','Carre 1:1'],['9:16','Story 9:16']].map(function(opt) {
                      var active = preferredFormat === opt[0];
                      return (
                        <button key={opt[0]} onClick={function(){ setPreferredFormat(opt[0]); }}
                          style={{ all:'unset', cursor:'pointer', padding:'8px 16px',
                            border:'2px solid ' + (active ? 'var(--app-accent)' : 'var(--app-line)'),
                            borderRadius:'var(--radius)', fontSize:13,
                            fontWeight: active ? 600 : 400,
                            color: active ? 'var(--app-accent)' : 'var(--app-fg-2)',
                            background: active ? 'rgba(99,102,241,.06)' : 'var(--app-surface-2)',
                            transition:'all .15s' }}>
                          {opt[1]}
                        </button>
                      );
                    })}
                  </div>
                </BrandSect>
              </div>
            )}
          </div>

          {saveErr && (
            <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:8, fontSize:12,
              background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.2)', color:'#ef4444' }}>
              {saveErr}
            </div>
          )}
          {saveMsg && (
            <div style={{ marginBottom:14, padding:'12px 16px', borderRadius:8, fontSize:13, lineHeight:1.5,
              background:'rgba(34,197,94,.07)', border:'1px solid rgba(34,197,94,.2)', color:'#16a34a' }}>
              {saveMsg}
            </div>
          )}

          <div style={{ height:8 }}/>
        </div>

        {/* Colonne droite : apercu live */}
        <div style={{ position:'sticky', top:80, display:'flex', flexDirection:'column',
          alignItems:'center', gap:12 }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2,
            color:'var(--app-fg-4)', alignSelf:'flex-start' }}>
            Apercu live
          </div>
          <BrandPostPreview
            name={name}
            primaryColor={primaryColor}
            accentColor={accentColor}
            fontPrimary={fontPrimary}
            mood={mood}
            logoUrl={logoUrl}
            graphicStyle={graphicStyle}
          />
          <div style={{ fontSize:11, color:'var(--app-fg-4)', textAlign:'center', lineHeight:1.5 }}>
            Mise a jour en temps reel<br/>
            <span style={{ opacity:.6 }}>a chaque changement</span>
          </div>
        </div>

      </div>
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

const SettingsScreen = function() {
  var [tab, setTab] = useState('compte');
  var [notifEmail, setNotifEmail] = useState(true);
  var [notifPush,  setNotifPush]  = useState(false);
  var [autoScore,  setAutoScore]  = useState(true);
  var [confirmDel, setConfirmDel] = useState(false);
  var [profile, setProfile] = useState(null);

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
                  right={<SettingsToggle checked={notifEmail} onChange={setNotifEmail}/>}
                />
                <SettingsRow
                  label="Notifications push"
                  sub="Alertes en temps réel sur les articles très scorés."
                  right={<SettingsToggle checked={notifPush} onChange={setNotifPush}/>}
                />
                <SettingsRow
                  label="Score automatique des articles"
                  sub="Forje évalue chaque article entrant selon votre ligne éditoriale."
                  right={<SettingsToggle checked={autoScore} onChange={setAutoScore}/>}
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
                    <select style={{ background:'var(--app-surface-2)', border:'1px solid var(--app-line)',
                      borderRadius:'var(--radius-sm)', padding:'5px 10px', color:'var(--app-fg)',
                      fontSize:12, fontFamily:'inherit', cursor:'pointer', outline:'none' }}>
                      <option>Actualité</option>
                      <option>Citation</option>
                      <option>Deep Dive</option>
                    </select>
                  }
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
