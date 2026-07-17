// lib/blaise/knowledge/logos.js
// Module de connaissance Blaise — logos de médias Instagram.
// Distillé de docs/blaise/logos-reference.md (50 identités analysées).

const LOGO_KB = `
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
`;

module.exports = { LOGO_KB };
