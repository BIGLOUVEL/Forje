/* global React */
var { useState } = React;

const AuthScreen = ({ onAuth }) => {
  var [mode, setMode]         = useState('login');
  var [email, setEmail]       = useState('');
  var [password, setPassword] = useState('');
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);
  var [success, setSuccess]   = useState(null);
  var [showPw, setShowPw]     = useState(false);

  var switchMode = function(m) { setMode(m); setError(null); setSuccess(null); };

  var handleSubmit = async function(e) {
    e.preventDefault();
    setLoading(true); setError(null); setSuccess(null);

    var sb = window.__supabase;
    var result = mode === 'login'
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password });
    var data = result.data; var err = result.error;

    if (err) {
      setError(err.message);
    } else if (mode === 'signup' && !data.session) {
      setSuccess('Vérifie ta boîte mail pour confirmer ton compte.');
    } else if (data.user) {
      onAuth(data.user);
    }
    setLoading(false);
  };

  return (
    <>
      <div className="auth-page-bg" />
      <div className="auth-stars" />
      <div className="auth-stars-2" />
      <div className="auth-stars-sparkle" />
      <div className="auth-streak auth-streak-1" />
      <div className="auth-streak auth-streak-2" />

      <div className="auth-page">
        <nav className="auth-nav">
          <button className="auth-brand" onClick={function() { window.__goToLanding?.(); }}>
            <span className="auth-brand-wordmark">Forje</span>
            <span className="auth-brand-suffix">studio</span>
          </button>
          <div className="auth-nav-right">
            {mode === 'login'
              ? <>Pas encore de compte ?{' '}<button onClick={function(){ switchMode('signup'); }}>Créer un compte</button></>
              : <>Déjà un compte ?{' '}<button onClick={function(){ switchMode('login'); }}>Se connecter</button></>}
          </div>
        </nav>

        <main className="auth-main">
          <div className="login-shell">

            <section className="auth-left">
              <span className="auth-eyebrow">
                <span className="auth-eyebrow-dot" />
                <span>Forge ta marque. Poste pour toujours.</span>
              </span>

              <h1 className="auth-left-title">
                {mode === 'login'
                  ? <><br style={{display:'none'}}/>Bon retour<br/><span className="accent">dans la forge.</span></>
                  : <>Crée ton<br/><span className="accent">studio.</span></>}
              </h1>

              <p className="auth-left-sub">
                {mode === 'login'
                  ? 'Reprenez là où votre marque s\'est arrêtée. Vos sources, votre voix, votre calendrier — tout vous attend.'
                  : 'Décrivez votre marque une fois. Forje apprend votre voix et publie à votre place, chaque jour.'}
              </p>

              <div className="auth-quote-card">
                <span className="auth-quote-mark">"</span>
                <p className="auth-quote-text">
                  Forje a transformé notre veille en posts qui sonnent comme nous.
                  Chaque jour. Sans y penser.
                </p>
                <div className="auth-quote-attr">
                  <div className="auth-quote-avatar"><span>LM</span></div>
                  <div className="auth-quote-who">
                    <span className="n">Léa Marchetti</span>
                    <span className="r">Head of Brand · Studio Lumen</span>
                  </div>
                </div>
              </div>

              <div className="auth-stats">
                <div className="auth-stat">
                  <span className="n"><span className="accent">2 400+</span></span>
                  <span className="l">Marques forgées</span>
                </div>
                <div className="auth-stat">
                  <span className="n">98<span style={{fontSize:'18px',opacity:.7}}>%</span></span>
                  <span className="l">Voix conservée</span>
                </div>
                <div className="auth-stat">
                  <span className="n">6×</span>
                  <span className="l">Plus rapide</span>
                </div>
              </div>

              <div className="auth-left-meta">
                <span className="auth-dotbar" />
                <span>FORJE_STUDIO / v2.6 / SECURE_LOGIN</span>
              </div>
            </section>

            <section className="auth-card">
              <div className="auth-card-head">
                <div className="auth-card-kicker">
                  <span className="bar" />
                  <span>{mode === 'login' ? 'Connexion' : 'Inscription'}</span>
                </div>
                <h2 className="auth-card-title">
                  {mode === 'login' ? 'Entrez dans votre studio' : 'Créez votre studio'}
                </h2>
                <p className="auth-card-sub">
                  {mode === 'login'
                    ? 'Authentifiez-vous pour accéder à vos marques, sources et publications.'
                    : 'Créez votre compte et commencez à forger votre identité de marque.'}
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
                    <input type="email" id="auth-email" placeholder="vous@studio.com"
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
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
                    <button type="button" className="auth-eye-toggle" onClick={function(){ setShowPw(!showPw); }} aria-label="Afficher le mot de passe">
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

                {mode === 'login' && (
                  <div className="auth-row">
                    <label className="auth-checkbox">
                      <input type="checkbox" defaultChecked />
                      <span>Rester connecté</span>
                    </label>
                    <button type="button" className="auth-forgot">Mot de passe oublié ?</button>
                  </div>
                )}

                {error   && <div className="auth-error">{error}</div>}
                {success && <div className="auth-success">{success}</div>}

                <button type="submit" className="auth-submit" disabled={loading}>
                  <span>{loading ? 'Un instant…' : mode === 'login' ? 'Entrer dans le studio' : 'Créer mon studio'}</span>
                  {!loading && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  )}
                </button>
              </form>

              <div className="auth-card-foot">
                <span className="auth-trust">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  CHIFFRÉ DE BOUT EN BOUT
                </span>
                <span>Besoin d'aide ? <a href="mailto:support@forje.studio">Support</a></span>
              </div>
            </section>

          </div>
        </main>

        <footer className="auth-foot">
          <span>© 2026 FORJE STUDIO</span>
          <div className="links">
            <a href="#">CONFIDENTIALITÉ</a>
            <a href="#">CONDITIONS</a>
            <a href="#">STATUT</a>
          </div>
        </footer>
      </div>
    </>
  );
};

window.__AuthScreen = AuthScreen;
