import { useContext } from "react";
import { OptionsContext } from "../context/OptionsContext";
import { THEMES } from "../components/themeOptions";
import "../styles/settings.css";

export default function Settings() {
  const { options, setOptions } = useContext(OptionsContext);

  return (
    <main className="account-themes color-bg scrollbar-minimal">
      <div className="account-themes__content">
        <h1>Themes</h1>
        <p>Choose how CertChamps looks for you.</p>
        <div className="account-themes__grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`account-themes__choice ${options.theme === theme.id ? "is-selected" : ""}`}
              aria-pressed={options.theme === theme.id}
              onClick={() => setOptions((current: typeof options) => ({ ...current, theme: theme.id }))}
            >
              <span className="account-themes__swatch" aria-hidden>
                <span className={theme.bg}>
                  <i className={theme.accent} /><i className={theme.primary} /><i className={theme.sub} />
                </span>
              </span>
              <span className="account-themes__name">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
