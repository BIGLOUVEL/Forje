/* global React, ReactDOM */
var { useState, useEffect, useRef } = React;

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

const Root = () => {
  const [view, setView] = useState('landing');
  const rootEl = document.getElementById('root');

  const navigate = (target) => {
    rootEl.classList.add('fading');
    setTimeout(() => {
      applyCss(target);
      setView(target);
      window.scrollTo(0, 0);
      rootEl.classList.remove('fading');
    }, 220);
  };

  // Expose globalement pour usage éventuel
  useEffect(() => {
    window.__goToApp     = () => navigate('app');
    window.__goToLanding = () => navigate('landing');
  });

  // Intercepte tous les liens internes entre les deux vues
  useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (href === 'Forje App.html') { e.preventDefault(); navigate('app'); }
      if (href === 'Forje Studio.html') { e.preventDefault(); navigate('landing'); }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [view]);

  const Landing = window.__LandingApp;
  const App     = window.__SaasApp;

  if (view === 'app'     && App)     return <App />;
  if (view === 'landing' && Landing) return <Landing />;
  return null;
};

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
