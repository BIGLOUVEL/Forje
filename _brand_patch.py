import re

with open('c:/Users/marti/OneDrive/Bureau/CODE/forje/app-screens.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

brand_start = content.index('// BRAND')
oa_start    = content.rindex('Object.assign')
before      = content[:brand_start - len('// ')]
after       = content[oa_start:]

new_section = r"""BRAND — Identite Visuelle
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

const BrandScreen = () => {
  var [name,            setName]            = useState('');
  var [logoUrl,         setLogoUrl]         = useState('');
  var [logoUploading,   setLogoUploading]   = useState(false);
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
  var [igInput,         setIgInput]         = useState('');
  var [igAnalyzing,     setIgAnalyzing]     = useState(false);
  var [igResult,        setIgResult]        = useState(null);
  var [igErr,           setIgErr]           = useState('');

  // Load from Supabase
  useEffect(function() {
    var sb = window.__supabase; var user = window.__currentUser;
    if (!sb || !user) { setLoading(false); return; }
    sb.from('clients').select('*').eq('user_id', user.id).maybeSingle()
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
          // Map old style values to pack IDs
          var gs = d.graphic_style || '';
          setGraphicStyle(STYLE_TO_PACK[gs] || gs);
          setTopics(d.topics || []);
          setInstaHandle(d.instagram_handle || '');
          setHashtags(d.hashtags || []);
          setPreferredFormat(d.preferred_format || '4:5');
        }
        setLoading(false);
      });
  }, []);

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
    var path = user.id + '/logo.png';
    sb.storage.from('brand-assets').upload(path, file, { upsert:true, contentType:'image/png' })
      .then(function(res) {
        if (res.error) { setSaveErr('Upload echoue : ' + res.error.message); }
        else {
          var pub = sb.storage.from('brand-assets').getPublicUrl(path);
          setLogoUrl(pub.data.publicUrl + '?t=' + Date.now());
        }
        setLogoUploading(false);
      });
  };

  var analyzeInstagram = function() {
    if (!igInput.trim()) return;
    setIgAnalyzing(true); setIgErr(''); setIgResult(null);
    fetch('/api/brand/analyze-instagram', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
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

  var canSave = completedCount === 7;

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
    sb.from('clients').upsert({
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
    }, { onConflict:'user_id' })
      .then(function(res) {
        if (res.error) { setSaveErr(res.error.message); }
        else {
          setSaveMsg('Identite forgee. Chaque post genere sera maintenant fidele a la charte de ' + (name || 'ton media') + '.');
          setTimeout(function() { setSaveMsg(''); }, 6000);
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Forge ton identite</h1>
          <p className="page-subtitle">
            Tout ce que tu remplis ici sera utilise a chaque generation.
            Plus tu es precis, plus tes posts seront fideles a ta marque.
          </p>
        </div>
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
                {canSave ? 'Pret a sauvegarder' : (7 - completedCount) + ' restant(s)'}
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

          {/* 03 Palette */}
          <BrandSect num="03" title="Palette de couleurs"
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
          <BrandSect num="04" title="Pack typographique"
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
          <BrandSect num="05" title="Mood editorial"
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
          <BrandSect num="06" title="Ton editorial"
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
          <BrandSect num="07" title="Sujets couverts"
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

          <button onClick={handleSave} disabled={saving || !canSave}
            style={{ width:'100%', padding:'14px', borderRadius:'var(--radius)', border:'none',
              cursor: canSave && !saving ? 'pointer' : 'not-allowed',
              background: canSave && !saving ? 'var(--app-accent)' : 'var(--app-surface-3)',
              color: canSave && !saving ? '#fff' : 'var(--app-fg-4)',
              fontSize:15, fontWeight:600, fontFamily:'DM Sans,sans-serif',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              transition:'all .2s' }}>
            {saving
              ? React.createElement('span', { style:{display:'flex',alignItems:'center',gap:8} },
                  React.createElement('span', { style:{width:14,height:14,border:'2px solid rgba(255,255,255,.3)',
                    borderTopColor:'#fff',borderRadius:'50%',animation:'vb-spin .7s linear infinite'} }),
                  'Sauvegarde...')
              : React.createElement('span', { style:{display:'flex',alignItems:'center',gap:8} },
                  React.createElement(AppIcon, { name:'check', size:16 }),
                  canSave ? "Forger l'identite" : completedCount + '/7 requis')
            }
          </button>
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

"""

new_content = before + '// ' + new_section + after

with open('c:/Users/marti/OneDrive/Bureau/CODE/forje/app-screens.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done. Lines:', new_content.count('\n'))
