import { getDensity, getTheme, themeVariables, type Theme } from '@shared/themes'
import { api } from './api'

let appliedThemeId: string | null = null
let appliedDensityId: string | null = null

/**
 * Writes a theme's tokens onto the document root. Everything in the app reads
 * colours through those custom properties, so this is the only place that has
 * to know a theme changed.
 */
export function applyTheme(themeId: string | undefined, densityId: string | undefined): Theme {
  const theme = getTheme(themeId)
  const density = getDensity(densityId)

  if (appliedThemeId === theme.id && appliedDensityId === density.id) return theme

  const root = document.documentElement
  const vars = themeVariables(theme, density)

  // a short transition stops a theme switch feeling like a page reload
  root.classList.add('theming')
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)

  // themes that do not override the fonts fall back to the stylesheet defaults
  if (!theme.fontSans) root.style.removeProperty('--font-sans')
  if (!theme.fontMono) root.style.removeProperty('--font-mono')

  root.dataset.theme = theme.id
  root.dataset.mode = theme.mode
  root.dataset.density = density.id

  window.setTimeout(() => root.classList.remove('theming'), 260)

  appliedThemeId = theme.id
  appliedDensityId = density.id

  // the native window frame is drawn by the OS, so the main process has to
  // repaint it separately
  void api.system.setWindowChrome({
    background: theme.tokens.base,
    symbol: theme.tokens.inkFaint,
    mode: theme.mode
  })

  return theme
}

/** The theme a given host resolves to, honouring its override. */
export function resolveThemeId(
  hostTheme: string | undefined,
  defaultTheme: string | undefined
): string {
  return hostTheme || defaultTheme || 'midnight'
}
