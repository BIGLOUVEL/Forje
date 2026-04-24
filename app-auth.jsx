/* global React */
var { useState } = React;

const AuthScreen = ({ onAuth }) => {
  const [mode, setMode]         = useState('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(null);

  const switchMode = (m) => { setMode(m); setError(null); setSuccess(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null); setSuccess(null);

    const sb = window.__supabase;
    const { data, error: err } = mode === 'login'
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password });

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
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="toi@maison.com" required autoComplete="email"/>
          </div>
          <div className="auth-field">
            <label>Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
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

        <div className="auth-switch">
          {mode === 'login'
            ? <>Pas encore de compte ?{' '}<button onClick={() => switchMode('signup')}>Créer un compte</button></>
            : <>Déjà un compte ?{' '}<button onClick={() => switchMode('login')}>Se connecter</button></>}
        </div>
      </div>
    </div>
  );
};

window.__AuthScreen = AuthScreen;
