/* global React */
var { useState } = React;

// Traduction des erreurs Supabase → messages FR directs, tutoiement.
var translateAuthError = function(msg, mode) {
  var m = (msg || '').toLowerCase();
  if (m.indexOf('invalid login credentials') !== -1)
    return 'Email ou mot de passe incorrect. Réessaie ou réinitialise-le.';
  if (m.indexOf('email not confirmed') !== -1)
    return 'Ton studio n\'est pas encore activé. Vérifie ta boîte mail.';
  if (m.indexOf('password should be at least') !== -1)
    return 'Ton mot de passe doit faire au moins 6 caractères.';
  if (m.indexOf('unable to validate email') !== -1 || m.indexOf('invalid email') !== -1)
    return 'Cette adresse email n\'est pas valide.';
  if (m.indexOf('rate limit') !== -1 || m.indexOf('too many') !== -1)
    return 'Trop de tentatives. Patiente une minute avant de réessayer.';
  return msg;
};

const AuthScreen = ({ onAuth }) => {
  var [mode, setMode]         = useState('login');
  var [email, setEmail]       = useState('');
  var [password, setPassword] = useState('');
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);
  var [success, setSuccess]   = useState(null);
  var [showPw, setShowPw]     = useState(false);
  var [resetSent, setResetSent] = useState(false);

  var isLogin = mode === 'login';

  var switchMode = function(m) { setMode(m); setError(null); setSuccess(null); setResetSent(false); };

  var handleForgotPassword = async function() {
    if (!email.trim()) { setError('Entre ton adresse email d\'abord.'); return; }
    setLoading(true); setError(null);
    var sb = window.__supabase;
    var result = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/?reset=1',
    });
    setLoading(false);
    if (result.error) { setError(translateAuthError(result.error.message, mode)); }
    else { setResetSent(true); }
  };

  var handleSubmit = async function(e) {
    e.preventDefault();
    setLoading(true); setError(null); setSuccess(null);

    var sb = window.__supabase;
    var result = isLogin
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password });
    var data = result.data; var err = result.error;

    if (err) {
      setError(translateAuthError(err.message, mode));
    } else if (mode === 'signup' && !data.session) {
      // Supabase renvoie identities:[] quand l'email est déjà enregistré
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError('__EXISTING_ACCOUNT__');
      } else {
        setSuccess('Vérifie ta boîte mail pour activer ton studio.');
      }
    } else if (data.user) {
      onAuth(data.user); // → l'app route vers l'onboarding Blaise si non complété
    }
    setLoading(false);
  };

  return (
    <div className="auth-root">
      <div className="auth-page">
        <nav className="auth-nav">
          <button className="auth-brand" onClick={function() { window.__goToLanding?.(); }}>
            <img src="assets/brand/blaise-mark.svg" alt="" className="auth-brand-img" />
            <span className="auth-brand-wordmark">blaise</span>
          </button>
          <div className="auth-nav-right">
            {isLogin
              ? <>Pas encore de compte ?{' '}<button onClick={function(){ switchMode('signup'); }}>Créer mon studio</button></>
              : <>Déjà un compte ?{' '}<button onClick={function(){ switchMode('login'); }}>Se connecter</button></>}
          </div>
        </nav>

        <main className="auth-main">
          <div className="auth-shell">

            {/* ─── Colonne gauche — pitch ─── */}
            <section className="auth-left">
              <h1 className="auth-title">
                {isLogin
                  ? <>Bon retour<br/><span className="accent">dans la forge.</span></>
                  : <>Crée ton<br/><span className="accent">studio.</span></>}
              </h1>

              <p className="auth-sub">
                {isLogin
                  ? <>Ta veille a tourné pendant ton absence.<br/>Tes actus chaudes t'attendent — et Blaise aussi.</>
                  : <>Blaise forge ton identité. La veille surveille ton actu.<br/>Le studio génère posts et stories dans ta charte exacte.</>}
              </p>

              {/* Posts démo = VRAIS posts sortis du pipeline Forje (generated_posts),
                 exportés en assets statiques (pas de fetch DB au runtime).
                 Pour les remplacer : node scripts/_export-auth-posts.js final assets/auth
                 post-demo-1 ← 21a5debb-0f94-4bec-9d8e-c9d97108da6b (Ballon Bleu · SPORT · « BRÉSIL : LE CHAOS TOTAL »)
                 post-demo-2 ← c9eacd99-4961-4a82-94b4-212e4e27811e (FRAME · CULTURE · « DONKEY KONG ÉCRASE TOUT ») */}
              {isLogin ? (
                /* Login : un seul post démo incliné, sans texte (colonne plus courte, voulu) */
                <div className="auth-fan auth-fan--solo">
                  <img className="auth-post auth-post--1" src="assets/auth/post-demo-1.jpg"
                    alt="Post généré pour Ballon Bleu" draggable={false}/>
                </div>
              ) : (
                /* Signup : éventail de 2 posts générés réels (charte de chaque média) */
                <>
                  <div className="auth-fan">
                    <img className="auth-post auth-post--1" src="assets/auth/post-demo-1.jpg"
                      alt="Post généré pour Ballon Bleu" draggable={false}/>
                    <img className="auth-post auth-post--2" src="assets/auth/post-demo-2.jpg"
                      alt="Post généré pour FRAME" draggable={false}/>
                  </div>
                  <p className="auth-fan-caption">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3.5 3.5L13 5"/></svg>
                    Générés en 87 et 92 secondes — dans la charte de chaque média
                  </p>
                </>
              )}

              <div className="auth-stats">
                <div className="auth-stat">
                  <span className="n">90<span className="u"> sec</span></span>
                  <span className="l">Du breaking au post</span>
                </div>
                <div className="auth-stat">
                  <span className="n">4<span className="u"> formats</span></span>
                  <span className="l">Actu · Citation · Deep Dive · Stories</span>
                </div>
                <div className="auth-stat">
                  <span className="n">700</span>
                  <span className="l">Crédits / mois</span>
                </div>
              </div>

              <div className="auth-meta">
                <span className="auth-dotbar" />
                <span>BLAISE STUDIO · CONNEXION SÉCURISÉE</span>
              </div>
            </section>

            {/* ─── Colonne droite — card formulaire ─── */}
            <section className="auth-card">
              <div className="auth-card-head">
                <div className="auth-card-kicker">
                  <span className="bar" />
                  <span>{isLogin ? 'Connexion' : 'Inscription'}</span>
                </div>
                <h2 className="auth-card-title">
                  {isLogin ? 'Entre dans ton studio' : 'Crée ton studio'}
                </h2>
                <p className="auth-card-sub">
                  {isLogin
                    ? 'Retrouve ta marque, ta veille et tes posts.'
                    : '50 crédits offerts pour forger ton identité avec Blaise et générer tes premiers posts. Sans carte bancaire.'}
                </p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit}>
                <div className="auth-field">
                  <label htmlFor="auth-email">Email</label>
                  <div className="auth-field-input">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    <input type="email" id="auth-email" placeholder="toi@tonmedia.fr"
                      value={email} onChange={function(e){ setEmail(e.target.value); }}
                      autoComplete="email" required />
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="auth-password">Mot de passe</label>
                  <div className="auth-field-input">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <input type={showPw ? 'text' : 'password'} id="auth-password" placeholder="••••••••••••"
                      value={password} onChange={function(e){ setPassword(e.target.value); }}
                      autoComplete={isLogin ? 'current-password' : 'new-password'} required />
                    <button type="button" className="auth-eye-toggle" onClick={function(){ setShowPw(!showPw); }} aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                      {showPw
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>}
                    </button>
                  </div>
                </div>

                {isLogin && (
                  <div className="auth-row">
                    <label className="auth-checkbox">
                      <input type="checkbox" defaultChecked />
                      <span>Rester connecté</span>
                    </label>
                    <button type="button" className="auth-forgot" onClick={handleForgotPassword} disabled={loading}>
                      {resetSent ? '✓ Email envoyé !' : 'Mot de passe oublié ?'}
                    </button>
                  </div>
                )}

                {error && error !== '__EXISTING_ACCOUNT__' && (
                  <div className="auth-error">{error}</div>
                )}
                {error === '__EXISTING_ACCOUNT__' && (
                  <div className="auth-error auth-error--action">
                    <span>Cet email a déjà un studio.</span>
                    <button type="button" className="auth-error-cta" onClick={function(){ switchMode('login'); }}>
                      → Se connecter
                    </button>
                  </div>
                )}
                {success && <div className="auth-success">{success}</div>}

                <button type="submit" className="auth-submit" disabled={loading}>
                  <span>{loading ? 'Un instant…' : isLogin ? 'Entrer dans le studio' : 'Créer mon studio'}</span>
                  {!loading && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  )}
                </button>
              </form>

              <div className="auth-card-switch">
                {isLogin
                  ? <>Pas encore de compte ?{' '}<button onClick={function(){ switchMode('signup'); }}>Créer mon studio — 50 crédits offerts</button></>
                  : <>Déjà un compte ?{' '}<button onClick={function(){ switchMode('login'); }}>Se connecter</button></>}
              </div>

              <div className="auth-card-foot">
                <span className="auth-trust">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Chiffré de bout en bout
                </span>
                <span>Besoin d'aide ? <a href="mailto:support@forje.studio">Support</a></span>
              </div>
            </section>

          </div>
        </main>

        <footer className="auth-foot">
          <span>© 2026 blaise studio</span>
          <div className="links">
            <a href="/legal/confidentialite.html">Confidentialité</a>
            <a href="/legal/cgu.html">Conditions</a>
            <a href="mailto:support@forje.studio">Support</a>
          </div>
        </footer>
      </div>
    </div>
  );
};

window.__AuthScreen = AuthScreen;
