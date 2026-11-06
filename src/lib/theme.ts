import type { AppSettings, ThemeChoice } from '../types'

/** The theme choice shown in Settings and the command palette. */
export function themeChoice(settings: Pick<AppSettings, 'theme' | 'paper'>): ThemeChoice {
  return settings.theme === 'light' && settings.paper ? 'paper' : settings.theme
}

/** The settings a theme choice is stored as. */
export function themeSettings(choice: ThemeChoice): Pick<AppSettings, 'theme' | 'paper'> {
  return choice === 'paper' ? { theme: 'light', paper: true } : { theme: choice, paper: false }
}
