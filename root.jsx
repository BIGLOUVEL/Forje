/* global React, ReactDOM */
var { useState, useEffect } = React;

const LANDING_CSS = ['css-l1', 'css-l2', 'css-l3'];
const APP_CSS     = ['css-a1', 'css-a2', 'css-a3', 'css-a4'];

const applyCss = (view) => {
  LANDING_CSS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.media = view === 'landing' ? '' : 'none';
  });
  APP_CSS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.media = view === 'app' ? '' : 'none';
  });
};

const disableAllCss = () => {
  [...LANDING_CSS, ...APP_CSS].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.media = 'none';
  });
};

const getInitialView = () => {
  try {
    var raw = localStorage.getItem('sb-tmsbtjczvjdwzfkoprwq-auth-token');
    if (raw && JSON.parse(raw).access_token) return 'app';
  } catch(e) {}
  return 'landing';
};

const Root = () => {
  const [view, setView]               = useState(getInitialView);
  const [user, setUser]               = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const rootEl = document.getElementById('root');

  // Auth — vérif session au montage + écoute des changements
  useEffect(() => {
    const sb = window.__supabase;
    if (!sb) { setAuthChecked(true); return; }

    sb.auth.getSession().then(({ data: { session } }) => {
      window.__currentUser = session?.user ?? null;
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      window.__currentUser = session?.user ?? null;
      setUser(session?.user ?? null);
      if (!session?.user) setView('landing');
    });

    return () => subscription.unsubscribe();
  }, []);

  // CSS + body class — synchronisés avec l'état auth + vue
  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      if (view === 'auth') disableAllCss();
      else applyCss('landing');
      document.body.classList.remove('app-mode');
      return;
    }
    applyCss(view);
    document.body.classList.toggle('app-mode', view === 'app');
  }, [authChecked, user, view]);

  // Helpers globaux
  useEffect(() => {
    const navigate = (target) => {
      rootEl.classList.add('fading');
      setTimeout(() => {
        applyCss(target);
        if (target === 'app') document.body.classList.add('app-mode');
        else                  document.body.classList.remove('app-mode');
        setView(target);
        window.scrollTo(0, 0);
        rootEl.classList.remove('fading');
      }, 220);
    };
    window.__goToApp     = () => user ? navigate('app') : navigate('auth');
    window.__goToLanding = () => navigate('landing');
    window.__signOut     = async () => {
      applyCss('landing');                       // landing CSS immédiat — pas de flash
      document.body.classList.remove('app-mode');
      await window.__supabase?.auth.signOut();   // onAuthStateChange fait setUser(null)
    };
  });

  // Interception des liens internes
  useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (href === 'Forje App.html')    { e.preventDefault(); window.__goToApp?.(); }
      if (href === 'Forje Studio.html') { e.preventDefault(); window.__goToLanding?.(); }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (!authChecked) return null;

  const Auth    = window.__AuthScreen;
  const Landing = window.__LandingApp;
  const App     = window.__SaasApp;

  if (!user) {
    if (view === 'auth') {
      return Auth
        ? <Auth onAuth={u => { applyCss('app'); setUser(u); setView('app'); }}/>
        : null;
    }
    // landing par défaut pour les visiteurs non-connectés
    return Landing ? <Landing /> : null;
  }

  if (view === 'app'     && App)     return <App />;
  if (view === 'landing' && Landing) return <Landing />;
  return null;
};

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
