import { useEffect, useState } from 'react';
import { getThemePreference, setThemePreference, watchTheme, type ThemePreference } from '../theme';
import { Icon, type IconName } from './Icon';

const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

export function ThemeSwitcher() {
  const [preference, setPreference] = useState<ThemePreference>(getThemePreference);

  useEffect(() => watchTheme(setPreference), []);

  return (
    <div className="theme-switcher" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={preference === o.value}
          className={preference === o.value ? 'active' : ''}
          onClick={() => {
            setThemePreference(o.value);
            setPreference(o.value);
          }}
          title={`${o.label} theme`}
        >
          <Icon name={o.icon} size={14} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
