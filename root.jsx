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

const Root = () => {
  const [view, setView]               = useState('app');
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
    });

    return () => subscription.unsubscribe();
  }, []);

  // CSS — synchronisé avec l'état auth + vue (filet de sécurité)
  useEffect(() => {
    if (!authChecked) return;
    if (!user) { disableAllCss(); return; }
    applyCss(view);
  }, [authChecked, user, view]);

  // Helpers globaux
  useEffect(() => {
    const navigate = (target) => {
      rootEl.classList.add('fading');
      setTimeout(() => {
        applyCss(target);   // CSS swap synchrone dans la transition
        setView(target);
        window.scrollTo(0, 0);
        rootEl.classList.remove('fading');
      }, 220);
    };
    window.__goToApp     = () => navigate('app');
    window.__goToLanding = () => navigate('landing');
    window.__signOut     = async () => {
      disableAllCss();                          // immédiat — pas de flash
      await window.__supabase?.auth.signOut();  // onAuthStateChange fait setUser(null)
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
    return Auth
      ? <Auth onAuth={u => { applyCss('app'); setUser(u); setView('app'); }}/>
      : null;
  }

  if (view === 'app'     && App)     return <App />;
  if (view === 'landing' && Landing) return <Landing />;
  return null;
};

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
