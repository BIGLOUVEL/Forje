/* global React */
var { useState } = React;

const AuthScreen = ({ onAuth }) => {
  var [mode, setMode]         = useState('login');
  var [email, setEmail]       = useState('');
  var [password, setPassword] = useState('');
  var [loading, setLoading]   = useState(false);
  var [error, setError]       = useState(null);
  var [success, setSuccess]   = useState(null);

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
    <div className="auth-bg">

      {/* Aurora blobs */}
      <div className="auth-blobs">
        <div className="auth-blob auth-blob-1"/>
        <div className="auth-blob auth-blob-2"/>
        <div className="auth-blob auth-blob-3"/>
      </div>

      {/* Back arrow */}
      <button className="auth-back" onClick={function() { window.__goToLanding?.(); }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 4l-4 4 4 4"/>
        </svg>
        Retour
      </button>

      {/* Card */}
      <div className="auth-card">
        <div className="auth-logo">
          <img src="assets/forje-mark.png" alt="Forje"/>
          <span className="auth-brand">Forje</span>
        </div>

        <div className="auth-head">
          <h1 className="auth-title">
            {mode === 'login' ? 'Bon retour.' : 'Crée ton studio.'}
          </h1>
          <p className="auth-sub">
            {mode === 'login'
              ? 'Connecte-toi à ton studio Instagram.'
              : 'Commence à forger ton identité de marque.'}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Email</label>
            <input type="email" value={email} onChange={function(e){ setEmail(e.target.value); }}
              placeholder="toi@maison.com" required autoComplete="email"/>
          </div>
          <div className="auth-field">
            <label>Mot de passe</label>
            <input type="password" value={password} onChange={function(e){ setPassword(e.target.value); }}
              placeholder="••••••••" required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/>
          </div>

          {error   && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading
              ? 'Un instant…'
              : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        <div className="auth-divider"/>
        <div className="auth-switch">
          {mode === 'login'
            ? <>Pas encore de compte ?{' '}<button onClick={function(){ switchMode('signup'); }}>Créer un compte</button></>
            : <>Déjà un compte ?{' '}<button onClick={function(){ switchMode('login'); }}>Se connecter</button></>}
        </div>
      </div>

    </div>
  );
};

window.__AuthScreen = AuthScreen;
