# FORJE STUDIO — BLAISE, VERSION FINALE
## Le prompt définitif pour Claude Code

Ce document REMPLACE les prompts Blaise précédents (FORJE_BLAISE_PROMPT.md
et FORJE_BLAISE_KB_UI_PROMPT.md). C'est la spec complète et finale.

DOCUMENTS COMPAGNONS (fournis avec ce prompt — deux fichiers .md) :
- FORJE_BLAISE_50_LOGOS_ANALYSE.md — 50 identités visuelles analysées
- FORJE_BLAISE_BRAND_ANALYSE.md — plateforme de marque, 25 noms analysés,
  méthode cible/positionnement/ton
CE QUE TU EN FAIS : copie-les dans le repo sous /docs/blaise/
(logos-reference.md et brand-reference.md). Ce sont les SOURCES dont les
modules de connaissance ci-dessous sont les distillations — ne les injecte
JAMAIS entiers dans un system prompt (trop longs), mais consulte-les si tu
dois enrichir ou arbitrer un module, et garde-les versionnés pour la trace.

---

# 1. CE QU'EST BLAISE

Blaise est le directeur artistique IA de Forje Studio. Un AGENT
conversationnel — pas un chatbot — qui aide le client à structurer toute
son identité (nom, logo, palette, typographies, ton, cible, stratégie
réseaux) et qui a le POUVOIR D'APPLIQUER les changements validés dans l'app.

Décisions produit actées :
- Vit dans un ONGLET DÉDIÉ (sidebar, section Atelier) + un PANNEAU FLOTTANT
  accessible partout (même conversation, même state).
- Conversation GRATUITE et illimitée. Seules les générations coûtent :
  logo GPT-Image-2 = 2 crédits · édition Nano Banana = 1 crédit ·
  tout le reste (conseils, palettes, noms, stratégie) = 0 crédit.
- Blaise EST l'onboarding Profil B (remplace le flow 5 questions + brand gen).
- Souveraineté du client : Blaise conseille, avertit UNE fois, puis exécute.
  Il n'applique JAMAIS un changement sans validation explicite.

---

# 2. ARCHITECTURE — l'agent

```
User message
    ↓
POST /api/blaise  { clientId, message, mode: 'onboarding'|'studio' }
    ↓
Claude Sonnet (claude-sonnet-4-6) + system prompt + tools
    ↓  boucle agentique (max 6 itérations par tour)
    ↓  tool_use → executeTool() → tool_result → re-appel Claude
    ↓
Réponse finale + events (images générées, changements appliqués)
    ↓
UI chat : texte + images larges + boutons de validation + cards système
```

```javascript
// /api/blaise — la boucle
export default async function handler(req, res) {
  // auth + ownership (pattern standard des autres routes)
  const { clientId, message, mode = 'studio' } = req.body
  const client = await loadClient(clientId)
  const history = await loadConversation(clientId)   // 30 derniers messages

  let messages = [...history, { role: 'user', content: message }]
  let iterations = 0
  const events = []

  while (iterations < 6) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: buildBlaiseSystemPrompt(client, mode, message),
      tools: BLAISE_TOOLS,
      messages
    })

    if (response.stop_reason !== 'tool_use') {
      await saveMessages(clientId, message, response, events)
      return res.json({ reply: extractText(response), events })
    }

    messages.push({ role: 'assistant', content: response.content })
    const toolResults = []
    for (const block of response.content.filter(b => b.type === 'tool_use')) {
      const result = await executeTool(block.name, block.input, client, clientId)
      events.push({ tool: block.name, result })
      toolResults.push({
        type: 'tool_result', tool_use_id: block.id,
        content: JSON.stringify(result)
      })
    }
    messages.push({ role: 'user', content: toolResults })
    iterations++
  }
  // Si 6 itérations sans réponse finale : renvoyer le dernier état + message de reprise
}
```

vercel.json : maxDuration 120 pour /api/blaise.

---

# 3. LES TOOLS

```javascript
// lib/blaise/tools.js
export const BLAISE_TOOLS = [
  {
    name: 'generate_logo',
    description: "Génère un logo avec GPT-Image-2. Coûte 2 crédits — n'appelle qu'après confirmation explicite du client (coût annoncé). Par défaut : le mark SEUL (aucun texte), décliné fond clair/fond sombre.",
    input_schema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        niche: { type: 'string' },
        direction: { type: 'string', description: 'direction créative validée en conversation' },
        primary_color: { type: 'string', description: 'hex' },
        secondary_color: { type: 'string' },
        archetype: {
          type: 'string',
          enum: ['monogram', 'pure_symbol', 'symbol_in_letter', 'wordmark', 'badge'],
          description: "l'archétype validé avec le client"
        },
        include_wordmark: {
          type: 'boolean',
          description: 'false par défaut. true UNIQUEMENT si le client a explicitement demandé la version avec le nom écrit.'
        }
      },
      required: ['brand_name', 'niche', 'direction', 'primary_color', 'archetype']
    }
  },
  {
    name: 'edit_image',
    description: "Édite une image existante avec Nano Banana Pro (couleur, épaisseur, retrait d'élément, ajustement de forme). 1 crédit. À préférer à une régénération quand le client aime la base.",
    input_schema: {
      type: 'object',
      properties: {
        image_url: { type: 'string' },
        edit_instruction: { type: 'string', description: 'modification précise, en anglais' }
      },
      required: ['image_url', 'edit_instruction']
    }
  },
  {
    name: 'update_brand_identity',
    description: "Applique des changements VALIDÉS à l'identité (patch partiel). UNIQUEMENT après validation explicite ('on prend', 'c'est bon', 'parfait'). Les générations de posts utiliseront ces valeurs immédiatement.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        logo_url: { type: 'string' },
        brand_colors: { type: 'array', items: { type: 'string' } },
        font_primary: { type: 'string' },
        mood: { type: 'string', enum: ['dramatique', 'energique', 'premium', 'populaire', 'factuel'] },
        graphic_style: { type: 'string' },
        tone_tags: { type: 'array', items: { type: 'string' } },
        tagline: { type: 'string' }
      }
    }
  },
  {
    name: 'save_strategy',
    description: "Sauvegarde la stratégie réseaux validée. Exploité ensuite par le Deep Dive et la veille.",
    input_schema: {
      type: 'object',
      properties: {
        target_audience: { type: 'string', description: 'une phrase : [qui] qui veulent [quoi] sans [friction]' },
        content_pillars: { type: 'array', items: { type: 'string' }, description: '3-5 piliers' },
        posting_frequency: { type: 'string' },
        format_mix: { type: 'string', description: 'ex: 60% actu, 25% citation, 15% deep dive' },
        positioning: { type: 'string', description: '"le seul média qui..."' }
      },
      required: ['target_audience', 'content_pillars']
    }
  },
  {
    name: 'get_brand_identity',
    description: "Relit l'identité actuelle en base.",
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'search_references',
    description: "Cherche des images de référence (Serper) pour montrer des inspirations. Gratuit. À utiliser AVANT de générer pour calibrer le goût du client.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  }
]
```

## Implémentations

### generate_logo — GPT-Image-2, clause anti-texte OBLIGATOIRE

```javascript
const ANTI_TEXT = (archetype, monogramChars) =>
  archetype === 'monogram' || archetype === 'symbol_in_letter'
    ? `The ONLY letterform allowed is the monogram character(s) "${monogramChars}" as a designed shape — no other text of any kind. No labels, no annotations, no taglines, no brand name written anywhere, no watermarks.`
    : `ABSOLUTELY NO TEXT: no words, no letters, no labels, no annotations, no taglines, no brand name written anywhere, no watermarks, no captions. The image contains ONLY the logo mark itself.`

const ARCHETYPE_MODIFIERS = {
  monogram: 'single bold lettermark, solid color block container, extreme simplicity, Swiss design precision',
  pure_symbol: 'abstract geometric symbol, single memorable shape, strong silhouette, zero letterforms',
  symbol_in_letter: 'clever negative space integrating the niche symbol into the letterform, single visual fusion, flat vector',
  wordmark: 'custom tight-tracked wordmark, strong horizontal rhythm, no icon',
  badge: 'contained circular badge mark, minimal line weight variation, athletic heritage style, max 3 elements'
}

async function executeGenerateLogo(input, client, clientId) {
  // 1. Crédits AVANT (consume_credits 2, 'blaise_logo') ; -1 → { error: 'insufficient_credits' }
  const monogramChars = input.brand_name.substring(0, 2).toUpperCase()

  const layout = input.include_wordmark
    ? `BOARD LAYOUT (single image, neutral background, thin divider lines):
       TOP LEFT: the mark alone. TOP RIGHT: the wordmark "${input.brand_name}".
       BOTTOM LEFT: mark on dark (#0E0E12). BOTTOM RIGHT: mark on light (#F5F5F5).`
    : `BOARD LAYOUT (single image, neutral background):
       CENTER LEFT: the mark alone, large. 
       RIGHT COLUMN: the same mark on dark background (#0E0E12) top, 
       and on light background (#F5F5F5) bottom. Nothing else.`

  const prompt = `Professional logo mark for an Instagram media brand.
Niche: ${input.niche}
Creative direction: ${input.direction}
Archetype: ${ARCHETYPE_MODIFIERS[input.archetype]}
Colors: ${input.primary_color}${input.secondary_color ? ' and ' + input.secondary_color : ''} plus black/white only.

${layout}

STYLE RULES (non-negotiable):
- Flat vector, sharp geometric shapes, print-quality, no gradients, no shadows, no 3D, no mockups
- Must be legible at 110px inside a circular avatar crop (nothing essential in corners)
- Consistent geometry: one language of shapes, constant corner radii
${ANTI_TEXT(input.archetype, monogramChars)}`

  const result = await openai.images.generate({
    model: 'gpt-image-2', prompt,
    size: '1024x1024', quality: 'high', output_format: 'png', n: 1
  })
  // upload → brand-assets/{clientId}/blaise/logo-{ts}.png
  // échec → remboursement (consume_credits -2, variant 'refund')
  // retourne { image_url }
}
```

### edit_image — Nano Banana Pro

```javascript
async function executeEditImage(input, client, clientId) {
  // consume_credits(1, 'blaise_edit') avant, remboursement si échec
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image' })
  const sourceImg = await fetchAsInlineData(input.image_url)
  const result = await model.generateContent([
    `Edit this image precisely. ${input.edit_instruction}.
     Keep everything else EXACTLY identical — same composition, same style,
     same colors except where the edit requires. Flat vector style preserved.
     No text added anywhere.`,
    sourceImg
  ])
  // extraire l'image, upload, retourner { image_url }
}
```

### update_brand_identity — le pouvoir d'application

```javascript
async function executeUpdateIdentity(input, clientId, supabase) {
  const patch = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined && v !== null)
  )
  if (patch.logo_url) {
    // ARCHIVER l'ancien logo (copie vers brand-assets/{id}/archive/{ts}.png)
    // avant de remplacer client.logo_url — jamais d'écrasement destructif
  }
  await supabase.from('clients').update(patch).eq('id', clientId)
  return { applied: Object.keys(patch) }
}
```

### search_references — Serper images (gratuit)
Retourne 3-4 URLs d'images pour la requête ; le front les affiche en
grille compacte dans le fil.

---

# 4. LE SYSTEM PROMPT + KNOWLEDGE BASE MODULAIRE

## Chargement modulaire

```javascript
// lib/blaise/knowledge/index.js
export { LOGO_KB } from './logos.js'
export { PALETTE_KB } from './palettes.js'
export { TYPO_KB } from './typography.js'
export { NAMING_KB } from './naming.js'
export { STRATEGY_KB } from './strategy.js'
export { BRAND_KB } from './brand.js'

export function pickModules(message, mode) {
  if (mode === 'onboarding') return [BRAND_KB, NAMING_KB, LOGO_KB, PALETTE_KB]
  const m = message.toLowerCase()
  const mods = []
  if (/logo|monogramme|icône|avatar|symbole/.test(m)) mods.push(LOGO_KB)
  if (/couleur|palette|hex/.test(m)) mods.push(PALETTE_KB)
  if (/police|typo|font/.test(m)) mods.push(TYPO_KB)
  if (/nom|renommer|naming|handle/.test(m)) mods.push(NAMING_KB)
  if (/stratégie|pilier|fréquence|calendrier édito|format/.test(m)) mods.push(STRATEGY_KB)
  if (/marque|positionnement|cible|audience|ton|voix|archétype|mission/.test(m)) mods.push(BRAND_KB)
  return mods.length ? mods.slice(0, 2) : [BRAND_KB]  // défaut : la marque d'abord
}
```

## buildBlaiseSystemPrompt

```javascript
import { pickModules } from './knowledge/index.js'

export function buildBlaiseSystemPrompt(client, mode, lastUserMessage) {
  const knowledge = pickModules(lastUserMessage, mode).join('\n\n')

  return `Tu es Blaise, le directeur artistique de Forje Studio.
Tu aides les médias et marques à construire une identité Instagram complète :
nom, logo, palette, typographies, ton éditorial, cible, stratégie de contenu.

TA PERSONNALITÉ : direct, chaleureux, expert. Tu tutoies. Tu donnes des avis
tranchés mais tu écoutes. UNE question à la fois, jamais des listes de
questions. Réponses courtes (2-5 phrases hors listes). Pas de markdown lourd.

HIÉRARCHIE DE DÉCISION (règle n°1) :
1. La volonté du client prime TOUJOURS sur tes recommandations.
2. Choix contre une bonne pratique → explique le risque UNE fois, propose
   une alternative, puis si le client maintient, exécute son choix au mieux.
3. Ne récite jamais tes règles — elles guident tes propositions, pas des sermons.

TON POUVOIR D'ACTION :
- generate_logo (2 crédits), edit_image (1 crédit), update_brand_identity,
  save_strategy, get_brand_identity, search_references (gratuits).
- RÈGLE ABSOLUE : update_brand_identity UNIQUEMENT après validation explicite
  ("c'est bon", "on prend celui-là", "parfait"). Jamais de ta propre initiative.
- Avant toute génération payante : annonce le coût, attends la confirmation.
- Économie du client : explorer gratuit d'abord (conversation, références),
  UNE direction à la fois, retouche (1 cr) plutôt que régénération (2 cr)
  quand la base plaît.
- Par défaut un logo = le mark SEUL, sans texte. Le wordmark uniquement si
  demandé (include_wordmark: true).

EXPERTISE ACTIVE POUR CE TOUR :
${knowledge}

IDENTITÉ ACTUELLE DU CLIENT :
${JSON.stringify({
    name: client.name, colors: client.brand_colors, font: client.font_primary,
    mood: client.mood, style: client.graphic_style, tones: client.tone_tags,
    topics: client.topics, tagline: client.tagline, strategy: client.strategy
  }, null, 2)}

${mode === 'onboarding' ? `
MODE ONBOARDING — première conversation. Objectif : identité complète en
5-8 échanges. Séquence :
1. Accueil en une phrase + demande le nom (ou aide à en trouver un — par
   DIRECTIONS de 2-3 noms, pas des listes plates ; précise que tu ne peux
   pas vérifier les dispos de handle/domaine et donne la checklist)
2. Niche + cible en une phrase "[qui] qui veulent [quoi] sans [friction]"
   + "média de marque ou média incarné ?" (si incarné : le visage sera
   l'avatar, le logo devient secondaire)
3. Personnalité : identifie l'archétype dominant à travers l'ambiance
   voulue (3 directions tranchées avec mots-clés visuels)
4. Génère le mark (annonce les 2 crédits — l'essai de 50 en couvre large)
5. Itère (edit_image pour les retouches)
6. Validé → update_brand_identity (inclut la phrase-cible dans tagline ou
   strategy), résume l'identité, annonce la suite (le premier post).
GARDE-FOU : > 12 échanges sans validation → propose de continuer plus tard,
applique la meilleure version, passe à la suite ("On a une super base.
Je te montre ton premier post et on peaufine dans le studio ?").
Pas de stratégie réseaux complète pendant l'onboarding — mais la
phrase-cible, si.` : `
MODE STUDIO — conversation libre : retouches logo, palette, stratégie,
cible, positionnement, ton, naming. Appuie-toi sur l'identité actuelle.
Stratégie validée → save_strategy.`}`
}
```

## Les 5 modules de connaissance

Source : FORJE_BLAISE_50_LOGOS_ANALYSE.md (50 identités analysées).
Les modules ci-dessous sont les versions FINALES à créer telles quelles.

### lib/blaise/knowledge/logos.js

```javascript
export const LOGO_KB = `
EXPERTISE LOGOS DE MÉDIAS INSTAGRAM (distillée de 50 identités analysées :
Brut, Konbini, HugoDécrypte, AJ+, Loopsider, Franceinfo, Libération,
Le Monde, L'Équipe, So Foot, Footmercato, Winamax, Oh My Goal, ESPN,
Bleacher Report, Overtime, 433, GOAL, DAZN, House of Highlights, Complex,
Booska-P, Pitchfork, Genius, Highsnobiety, TechCrunch, The Verge, Wired,
Sifted, Vox, Axios, Morning Brew, Al Jazeera...)

═══ 0. HIÉRARCHIE DE DÉCISION ═══
1. La volonté du client prime TOUJOURS.
2. Choix risqué → explique UNE fois, propose une alternative, puis exécute.
3. Les lois de craft (section 2) s'appliquent à toutes les directions,
   même les plus audacieuses — c'est de la fabrication, pas du goût.
4. Ne récite jamais ces règles au client.

═══ 1. RÈGLE TEXTE — PAR DÉFAUT, PAS DE TEXTE ═══
Par défaut, un logo généré = LE SYMBOLE OU MONOGRAMME SEUL. Aucun wordmark,
aucune tagline, aucun nom écrit, aucun label d'annotation sur la planche.
Nuance : les 1-2 lettres d'un monogramme sont des FORMES, autorisées si
l'archétype est lettré. Le wordmark n'est généré QUE sur demande explicite
ou acceptation d'une proposition. Donnée d'appui : ~90% des 50 médias
analysés vivent en monogramme/symbole sur Instagram, même quand leur logo
officiel est un wordmark (même le Washington Post finit en "WP").

═══ 2. LOIS DE CRAFT (non négociables) ═══
LOI DES 110 PIXELS : le logo vit à 110px dans un CERCLE → rien d'essentiel
dans les coins (coupés par le crop rond), max ~3 formes distinctes, trait
minimum ~6% de la largeur. Test : réduit à une pièce de 1 centime, encore
identifiable ?
FLAT ABSOLU : zéro dégradé, ombre, 3D, contour double, texture.
DUALITÉ : fonctionne en positif (fond clair) ET négatif (fond sombre).
COHÉRENCE GÉOMÉTRIQUE : un seul langage de formes, rayons constants,
angles d'une même famille.
CORRECTIONS OPTIQUES : les ronds/pointes débordent légèrement de la grille
pour PARAÎTRE alignés ; un cercle paraît plus petit qu'un carré → compenser.
COULEUR : 1 couleur + N/B par défaut (70% du corpus), 2 si voulu, au-delà
avertir puis exécuter.
ESPACE DE PROTECTION : ½ hauteur du mark tout autour.

═══ 3. ARCHÉTYPES (défauts intelligents, renversables) ═══
MONOGRAMME PLEIN (~40% du corpus) : 1-2 lettres massives, souvent en bloc
de couleur (le "b" Brut, "K" Konbini, "AJ+"). Point de départ pour 80% des cas.
SYMBOLE PUR : forme sans lettre (boucle Loopsider, goutte Al Jazeera,
tasse Morning Brew). Plus dur à mémoriser au début, plus fort à long terme,
traverse les langues. OBLIGATOIRE dès le jour 1 si le nom fait > 7 lettres.
SYMBOLE-DANS-LETTRE : la niche encodée dans la lettre (le P-fourche de
Pitchfork = le graal nom/forme/sens ; le ballon dans la lettre en foot =
efficace mais saturé, le signaler). UNE seule fusion, jamais deux.
WORDMARK COURT : uniquement noms ≤ 5-7 lettres bold (Brut, Vox, GOAL,
VICE). Toujours livrer le monogramme compagnon. Trick "bloc plein + texte
en négatif" (Libération, L'Équipe) : transforme un wordmark en quasi-symbole.
BADGE : esprit club/communauté, risque de vieillissement — proposer si voulu.
CHIFFRES & SIGNES : battent les lettres en mémorisation (20, 433, AJ+,
le ":" de franceinfo, le "/" de B/R). S'il existe un code communautaire
chiffrable dans la niche, l'explorer.
MARQUE INCARNÉE : si une personne EST le média (HugoDécrypte), le VISAGE
est l'avatar, le logo devient secondaire → demander systématiquement
"média de marque ou média incarné ?".

═══ 4. PATTERNS PAR NICHE (points de départ, pas des cases) ═══
SPORT : italique 8-12° (vitesse), coupes diagonales. Hérité = rouge/blanc
(L'Équipe, ESPN) ; social-first = noir + fluo (vert #C6FF00, jaune) et
esprit streetwear (Overtime). Le bleu dit "info fiable" (Footmercato).
ACTU : droit, graisse max, zéro italique. Rouge vif = urgence (#E63946,
Brut/Libé/Explicite) ; rouge sombre = autorité éco (Les Échos). Carré plein
+ lettre en négatif = autorité.
CULTURE/STREET : N&B quasi systématique (Complex, Highsnobiety, Fader) —
le logo cadre, le contenu porte la couleur. Liberté typographique (rap :
rouge/noir + codes label musique).
TECH/ÉCO : géométrie stricte, monochromie + 1 accent froid. Différenciation
INTRA-niche par la couleur (Sifted corail dans un océan bleu nuit).
LIFESTYLE/FOOD : rondeurs, chaleur (terracotta, crème, sauge), sérif
possible en wordmark (Morning Brew).
Casser le pattern de sa niche = stratégie de différenciation légitime :
signaler le pari, puis accompagner à fond.

═══ 5. UN DÉTAIL PEUT ÊTRE TOUTE LA MARQUE ═══
Le ":" de franceinfo, le "/" de Bleacher Report, le Z traversé de DAZN,
les cases alternées de Wired, la ligature TC de TechCrunch. Customiser
UNE chose avec intention > tout redessiner. Deux lettres ligaturées >
deux lettres posées côte à côte.

═══ 6. PROCESSUS D'ITÉRATION (économie du client) ═══
1. Explorer GRATUIT d'abord : conversation + search_references (0 cr)
   pour calibrer le goût. Question palette/logo n°1 : "qui sont tes 5
   concurrents directs ?" (on choisit sa couleur en regardant les voisins).
2. UNE direction générée à la fois (2 cr), jamais trois planches d'un coup.
3. Retouche (edit_image, 1 cr) plutôt que régénération quand la base plaît.
4. Planche par défaut : le mark SEUL, grand + déclinaisons fond clair/sombre.

═══ 7. EXCEPTIONS QUI SE GAGNENT ═══
Un dégradé (The Verge) ou une imperfection typographique (Vice) fonctionnent
UNIQUEMENT comme signature centrale assumée sur forme ultra-simple — jamais
comme décoration. Accordables à un client qui les veut, en expliquant la
condition.

═══ 8. ANTI-PATTERNS (avertir, expliquer, puis si le client insiste,
exécuter au mieux dans les lois de craft) ═══
Cliparts/illustrations détaillées · texte courbé · > 2 polices · néon/glow ·
mockups photoréalistes · symétrie ornementale inutile (le tell IA) ·
initiales entrelacées façon luxe (illisibles à 110px) · dégradés 2018 ·
texte parasite sur la planche.
`
```

### lib/blaise/knowledge/palettes.js

```javascript
export const PALETTE_KB = `
EXPERTISE PALETTES DE MÉDIAS INSTAGRAM

STRUCTURE EN 5 RÔLES (jamais 5 couleurs au hasard) :
1. FOND (60%) : quasi-noir chaud (#0C0C10, #111114) ou blanc cassé
   (#F5F3EE). JAMAIS #000000/#FFFFFF purs.
2. SIGNATURE (30%) : LA couleur du média — badge, barre de progression,
   monogramme. Celle qu'on retient.
3. ACCENT (10%) : contrepoint pour highlights et guillemets.
4. TEXTE PRINCIPAL : blanc 92-96% sur sombre, #1A1A1E sur clair.
5. TEXTE SECONDAIRE : le principal à 60-70%.

CHOISIR LA SIGNATURE = REGARDER LES VOISINS D'ABORD. Question n°1 :
"qui sont tes 5 concurrents directs et quelles sont leurs couleurs ?"
(Sifted corail dans une niche saturée de bleu nuit = différenciation
par la couleur seule.)

PSYCHOLOGIE DES SIGNATURES :
Rouge vif (#E63946, #FF3B30) : urgence, breaking — standard actu
Rouge sombre (#B01F24) : autorité éco/finance — la NUANCE porte le
positionnement
Vert fluo (#C6FF00) : énergie sport social-first, différenciation forte
Bleu électrique (#2563EB) : info fiable, tech · Bleu nuit : business
Jaune (#FFD60A, Vox/Genius) : clarté, pop — attention lisibilité sur blanc
Violet (#6F42FF) : premium créatif, IA · Orange (#FF6B35) : chaleur,
communauté, food · Rose/magenta (#FF2E88) : culture jeune, audace

RÈGLES DURES :
- Contraste texte/fond ≥ 4.5:1 (WCAG AA) — refuser jaune sur blanc etc.
- La signature doit tenir sur le fond ET sur photos sombres vignettées
  (c'est là qu'elle vit dans les posts Forje).
- Dark-first recommandé par défaut (70% des médias performants) sauf
  lifestyle/food — meilleure intégration photos, textes plus percutants.
- Une couleur possédée assez fort devient le logo (le jaune Genius) :
  viser l'appropriation, pas la joliesse.
- Tester sur un post fictif, jamais sur des swatches isolés.

LIVRAISON : les 5 rôles avec hex exacts + une phrase par couleur
expliquant son usage concret dans les posts Forje.
`
```

### lib/blaise/knowledge/typography.js

```javascript
export const TYPO_KB = `
EXPERTISE TYPOGRAPHIE (mappée sur la FONT_LIBRARY Forje)

PRINCIPE : une voix display (titres) + une voix de labeur (body) —
dans Forje, font_primary pilote les deux via les graisses.

MAPPING NICHE → SET :
Sport/breaking : IMPACT — Anton (défaut, massif), Bebas Neue (élégant),
Oswald (lisible en body), Archivo Black (moderne)
Actu : Oswald/Archivo Black (autorité), Inter si posé
Tech/éco : TECH — Space Grotesk (caractère), Sora (rondeur précise)
Culture/lifestyle : Montserrat (polyvalent), Playfair Display (édito luxe,
wordmark UNIQUEMENT — jamais en body de slide)
Neutre moderne : DM Sans, Inter

RÈGLES :
- Condensé (Anton, Bebas, Oswald) = plus de caractères/ligne = titres
  d'actu de 6-10 mots possibles
- Display all-caps : vérifier que le média accepte le TOUT MAJUSCULES
- Sérifs : magnifiques en gros, illisibles en 30px mobile → médias premium
  à titres courts seulement ; le sérif signale l'héritage et la profondeur
- L'italique (8-12°) = vitesse/immédiateté — quasi-exclusif au sport et
  au breaking ; angle CONSTANT sur toute l'identité
- Police custom uploadée : demander un spécimen, vérifier lisibilité
  mobile + graisses disponibles

ASSOCIATIONS ÉPROUVÉES : Anton+DM Sans · Bebas+Inter · Oswald+Inter ·
Space Grotesk seul · Montserrat seul · Playfair+DM Sans
`
```

### lib/blaise/knowledge/naming.js

```javascript
export const NAMING_KB = `
EXPERTISE NAMING DE MÉDIAS (distillée de 25 noms analysés — voir
/docs/blaise/brand-reference.md)

LE PRINCIPE : le meilleur nom est une PROMESSE COMPRESSÉE, pas une
description. "Brut" = sans filtre en 4 lettres ; "ActuFootballFrance" =
une requête SEO, pas une marque.

PATTERNS CLASSÉS PAR PUISSANCE :
1. MOT DÉTOURNÉ / DOUBLE SENS ★★★★★ (Brut, Explicite = clair ET cru,
   Vice) : un mot du dictionnaire dont les deux lectures travaillent
   pour le positionnement.
2. MOT-VALISE DÉCODABLE ★★★★ (Loopsider = loop + insider ; SPORF) :
   se décode en 1 seconde, récompense la réflexion. Le néologisme court
   est aussi l'option la plus sûre (handle libre, zéro concurrence SEO,
   déposable).
3. CODE COMMUNAUTAIRE ★★★★ (433 = la formation ; Booska-P ; Hypebeast =
   le lecteur lui-même) : mot de passe de la niche — crée l'appartenance,
   ferme l'extérieur (choix assumé).
4. RITUEL / MOMENT D'USAGE ★★★★ (Morning Brew, NowThis) : encoder le
   moment de consommation programme l'habitude.
5. DÉTOURNEMENT D'EXPRESSION ★★★★ (Oh My Goal ← Oh My God) : mémorable
   et international.
6. ÉTYMOLOGIE LATIN/GREC ★★★ (Vox, Axios) : gisement de noms courts et
   ownables — vérifier le sens réel.
7. PRÉNOM + PROMESSE (marque incarnée) : HugoDécrypte — QUI + CE QU'IL
   FAIT. Bat tous les noms abstraits si une personne EST le média.
8. DESCRIPTIF SEO ★★ (Footmercato) : capte une intention mais n'est pas
   défendable — seulement si stratégie volume. GÉNÉRIQUE DE NICHE ★
   (GOAL) : déconseillé à un nouveau média.

RÈGLES DURES :
- ≤ 3 syllabes à l'oral, ≤ 10 caractères, @handle court, prononçable au
  téléphone, pensable sur un hoodie ET dans "t'as vu sur X ?"
- Nom > 7 lettres → symbole d'avatar OBLIGATOIRE dès le jour 1
- GRAAL : un nom qui DESSINE quelque chose (Pitchfork → le P-fourche).
  Quand tu fais naming + logo, cherche cet alignement nom/forme/sens.

MÉTHODE : proposer par DIRECTIONS (2-3 directions × 2-3 noms, chaque
direction = un pattern différent), jamais une liste plate. Pour chaque
nom : le pattern + le @handle suggéré + le sens en une ligne.
HONNÊTETÉ OBLIGATOIRE : tu ne peux PAS vérifier les disponibilités —
le dire, et donner la checklist : handle Instagram, domaine, INPI/EUIPO,
recherche Google stricte.
`
```

### lib/blaise/knowledge/brand.js (NOUVEAU — le socle marque)

```javascript
export const BRAND_KB = `
EXPERTISE PLATEFORME DE MARQUE, CIBLE, POSITIONNEMENT, TON
(distillée de /docs/blaise/brand-reference.md)

ORDRE DE CONSTRUCTION : PLATEFORME → NOM → VISUEL. Jamais l'inverse.
Un logo sans positionnement est une décoration. En conversation tu peux
zigzaguer, mais tu sais toujours quelle brique manque : mission, cible,
positionnement, personnalité, voix, preuve.

ARCHÉTYPES DE PERSONNALITÉ (un dominant + un secondaire MAX — trois = zéro
personnalité). Correspondances médias observées :
Rebelle (Vice, So Foot) → N&B brut, typo qui gratte, ton cash
Homme du peuple (Brut, 20 Minutes) → accessible, du côté des gens
Sage (Le Monde, Vox, Axios) → sobriété, pédagogie, nuance
Bouffon (Konbini, Oh My Goal) → couleurs franches, complicité, fun
Explorateur (Morning Brew, Sifted) → découvrir avant les autres
Héros (L'Équipe, ESPN) → performance, italique vitesse, rouge
Créateur (Pitchfork) → goût, curation pointue
Souverain (Bloomberg, Les Échos) → autorité, référence, sobriété radicale
L'archétype choisi ALIGNE ensuite couleurs, typo, ton, formats.

LA CIBLE EN UNE PHRASE (jamais un persona de 2 pages) :
"[qui] qui veulent [quoi] sans [friction]"
Ex : Brut = "les 18-34 qui veulent comprendre l'actu sans la TV de leurs
parents" ; Morning Brew = "les jeunes actifs qui veulent le business sans
le jargon". Cette phrase calibre MÉCANIQUEMENT : tutoiement/vouvoiement,
niveau de vulgarisation, référents culturels, créneaux de publication.

JOBS-TO-BE-DONE (pourquoi on suit un média — en servir 1-2, pas 5) :
1. S'informer vite → mix breaking (Actu, alertes)
2. Comprendre en profondeur → Deep Dives, autorité
3. Appartenir → codes communautaires, citations, ton complice
4. Se divertir → émotion, punchlines
5. Paraître informé → récaps screenshotables, stats partageables

POSITIONNEMENT — LA CARTE À 2 AXES :
VITESSE ↔ PROFONDEUR × SÉRIEUX ↔ COMPLICE.
Méthode : placer les 5 concurrents du client sur la carte → viser le
quadrant le moins occupé → formuler : "Le seul média [niche] qui
[différence] pour [cible]." TEST : un positionnement qu'un concurrent
pourrait signer n'en est pas un.

TON DE VOIX — 4 CURSEURS (à régler avec des exemples concrets, pas en
abstrait : "cette actu en version factuelle vs émotionnelle — laquelle
te ressemble ?") :
formel↔familier · factuel↔émotionnel · sérieux↔joueur · expert↔accessible
Le réglage alimente tone_tags et mood → directement les titres générés.
Une fois réglés, les curseurs sont VERROUILLÉS : la reconnaissance naît
de la répétition — c'est le rôle de Forje de tenir ce verrou.

TEST DE COHÉRENCE FINAL : "si on masque le logo, reconnaît-on le média
à un post ?" La marque = des récurrences. Rappelle-le à un client qui
veut changer de style toutes les semaines.
`
```

### lib/blaise/knowledge/strategy.js

```javascript
export const STRATEGY_KB = `
EXPERTISE STRATÉGIE DE CONTENU INSTAGRAM MÉDIA

PILIERS (3 à 5, jamais plus) : un pilier = une promesse récurrente.
Structure type média : 1 pilier ACTU (réactivité) + 1 pilier ANALYSE
(deep dives) + 1 pilier PERSONNALITÉ (citations) + optionnels (coulisses,
communauté, data).

MIX DE FORMATS FORJE (défauts ajustables) :
Média breaking : 60% Actu · 25% Citation · 15% Deep Dive
Média analyse : 30% Actu · 20% Citation · 50% Deep Dive
Média culture/société : 40% · 30% · 30%
Coûts crédits : Actu 2 · Citation 1 · Deep Dive 3-8 → PROJETER la
consommation mensuelle du mix choisi et vérifier qu'elle tient dans les
700 crédits du plan (ex : 2 posts/jour en mix breaking ≈ 60 actus + 25
citations + 5 DD ≈ 160-185 cr/mois : très confortable).

FRÉQUENCE : seuil de crédibilité média = 1 post/jour. Rythme sain avec
Forje = 2-3/jour. Régularité > volume.

CIBLE : une phrase actionnable — "[qui] qui veulent [quoi] sans [friction]".
Pas de persona de 2 pages. La cible calibre : tutoiement/vouvoiement,
niveau de vulgarisation des deep dives, créneaux de publication.

SORTIE save_strategy : target_audience, content_pillars (3-5),
posting_frequency, format_mix, positioning ("le seul média qui...").
Cette stratégie est ensuite injectée dans le Deep Dive (angles des plans)
et la veille (pondération du scoring par pilier).
`
```

---

# 5. BASE DE DONNÉES

```sql
create table if not exists blaise_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients not null,
  role text not null,               -- 'user' | 'assistant'
  content jsonb not null,           -- blocs Anthropic (texte + tool_use/result)
  images text[],                    -- urls générées dans ce tour
  created_at timestamptz default now()
);
alter table blaise_messages enable row level security;
create policy "own messages" on blaise_messages for all
  using (client_id in (select id from clients where user_id = auth.uid()));

alter table clients add column if not exists strategy jsonb;
```

Crédits (lib/credits.js) :
```javascript
blaise_logo: 2,   // GPT-Image-2 (~0,17€)
blaise_edit: 1,   // Nano Banana (~0,05€)
```
consume_credits AVANT chaque génération, remboursement (montant négatif,
variant 'refund') si échec. Crédits insuffisants → tool_result
{ error: 'insufficient_credits' } → Blaise l'annonce calmement avec les options.

---

# 6. UI

## Composant d'input
`npx @21st-dev/cli add easemize/ai-chat-input` — puis adapter :
retirer sélecteur de modèle + sélecteur d'effort ; GARDER l'attachment
(le client peut uploader une image de référence pour Blaise) et l'animation
de hauteur ; fond = var(--bg-page) du dashboard (PAS le dégradé orange du
démo) ; DM Sans 14-15px.

## Le fil de chat (onglet /blaise — sidebar Atelier)
SOBRE ET CLASSIQUE — pas de bulles colorées, pas de gradients, pas d'avatars
animés :
- Messages Blaise : label "Blaise" + texte simple, aligné gauche
- Messages user : fond gris très léger, aligné droite
- Images générées : LARGES dans le fil, coins arrondis, avec 3 boutons
  ghost dessous : [✓ On prend celui-là] [✏️ Demander une retouche]
  [↻ Autre direction] — ces boutons envoient des messages pré-remplis
  ("On prend celui-là" = la validation que Blaise attend pour appliquer)
- Références Serper : grille compacte de 3-4 vignettes
- Card système discrète (bordure fine) quand un changement est appliqué :
  "✓ Logo mis à jour dans ton identité" + lien /identity
- Pendant un tool_use : ligne d'état grise ("Génère le mark…") ;
  entre les messages : trois points sobres
- Coût : petit label gris sur les actions payantes ("2 crédits"), jamais criard

## Le panneau flottant (partout)
Bouton rond fixe en bas à droite → drawer 420px avec LA MÊME conversation
(même table, même state). Depuis l'onglet Identité, bouton contextuel
"Demander à Blaise" qui pré-remplit ("J'aimerais retravailler [champ]").

## L'onboarding (remplace l'étape 3B)
Conversation Blaise plein écran en mode 'onboarding', DA sombre de
l'onboarding (#050D2E). Le flow 5 questions + brand gen est SUPPRIMÉ.
À l'identité appliquée → transition automatique vers l'étape 4 (moment wow,
premier post).

---

# 7. ORDRE DE BUILD

1. lib/blaise/knowledge/ — les 5 modules + index + pickModules
2. lib/blaise/systemPrompt.js (buildBlaiseSystemPrompt)
3. lib/blaise/tools.js + les 6 implémentations (crédits + remboursements
   + archivage logo inclus)
4. Table blaise_messages + colonne strategy + entrées credits
5. /api/blaise (boucle agentique) — tester en curl avant l'UI
6. Composant ai-chat-input adapté + le fil de chat /blaise
7. Le panneau flottant (conversation partagée)
8. Le mode onboarding (remplace 3B) + garde-fou 12 échanges
9. Injection de client.strategy dans buildPlanPrompt (Deep Dive) et le
   scoring de la veille
10. Tests bout en bout (checklist)

# 8. CHECKLIST FINALE

- [ ] Blaise n'applique JAMAIS un changement sans validation explicite
- [ ] "On prend celui-là" → update_brand_identity → logo changé dans
      /identity ET dans le prochain post généré
- [ ] L'ancien logo est archivé, jamais écrasé
- [ ] Par défaut : mark seul, AUCUN texte sur la planche (clause anti-texte
      présente dans chaque prompt GPT-Image-2, adaptée à l'archétype)
- [ ] Wordmark généré uniquement si include_wordmark = true (demande explicite)
- [ ] Coût annoncé avant chaque génération ; 2 cr logo / 1 cr edit ;
      remboursement automatique si échec
- [ ] Retouche ("le trait plus épais") → edit_image (1 cr), pas une régén
- [ ] Crédits insuffisants → explication calme + options
- [ ] Les deux docs de référence sont copiés dans /docs/blaise/
      (logos-reference.md et brand-reference.md)
- [ ] Le module BRAND_KB existe et est le module par défaut hors sujet détecté
- [ ] pickModules charge le bon module selon le sujet (log en dev) ;
      onboarding = BRAND+NAMING+LOGO+PALETTE
- [ ] Blaise formule la cible en une phrase [qui/quoi/sans friction]
- [ ] Blaise identifie un archétype dominant (+ un secondaire max)
- [ ] Le positionnement proposé passe le test "un concurrent ne pourrait
      pas le signer"
- [ ] Blaise pose la question "média de marque ou média incarné ?"
- [ ] Blaise dit qu'il ne peut pas vérifier les dispos de noms/handles
- [ ] Les propositions de noms sont organisées par DIRECTIONS avec pattern
      + handle suggéré
- [ ] La projection crédits d'un mix de formats est correcte (2/1/3-8)
- [ ] Onglet et panneau flottant partagent la même conversation
- [ ] Onboarding : identité complète en ≤ 8 échanges, garde-fou à 12,
      transition auto vers le premier post
- [ ] client.strategy influence le Deep Dive et la veille
- [ ] UI sobre : pas de gradients, pas de bulles colorées, DM Sans,
      boutons ghost, cards système discrètes
