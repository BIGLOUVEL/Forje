/* global React */
const { useState: useSt, useEffect: useEf } = React;

const TweaksPanel = ({ tweaks, setTweaks, visible }) => {
  if (!visible) return null;
  const update = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    try {
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
    } catch (e) {}
  };

  return (
    <div className="tweaks-panel">
      <h4>Tweaks</h4>

      <div className="tweak-row">
        <label>Chromatic hue shift · {tweaks.hueShift}°</label>
        <input type="range" min={-180} max={180} step={10} value={tweaks.hueShift}
               onChange={e => update('hueShift', Number(e.target.value))} />
      </div>

      <div className="tweak-row">
        <label>Starfield density · {tweaks.starfieldDensity.toFixed(2)}</label>
        <input type="range" min={0.2} max={1.8} step={0.1} value={tweaks.starfieldDensity}
               onChange={e => update('starfieldDensity', Number(e.target.value))} />
      </div>

      <div className="tweak-row">
        <label>Headline</label>
        <input type="text" value={tweaks.headline}
               onChange={e => update('headline', e.target.value)} />
      </div>

      <div className="tweak-row">
        <label>Headline accent (chromatic)</label>
        <input type="text" value={tweaks.headlineAccent}
               onChange={e => update('headlineAccent', e.target.value)} />
      </div>
    </div>
  );
};

window.TweaksPanel = TweaksPanel;
