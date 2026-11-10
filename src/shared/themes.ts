/**
 * Theme definitions, shared by the renderer and the main process. The main
 * process needs them to colour the native window frame before the renderer
 * has painted anything.
 *
 * A note on the `*Bright` tokens: they mean "the high emphasis variant that
 * stays legible as text on this theme's surfaces", not "lighter". On a dark
 * theme that is a lighter tint; on a light theme it is a darker one. Every
 * colour here doubles as a low alpha fill (`bg-warn/12`) and as text
 * (`text-warn`), so each one is chosen to read against its own background.
 */

export type ThemeMode = 'dark' | 'light'

export interface TerminalPalette {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface ThemeTokens {
  /** recessed surfaces: inputs, code blocks, title bar, terminal */
  void: string
  /** the window background */
  base: string
  /** panels and tables */
  surface: string
  /** modals and popovers */
  raised: string
  /** chips, inset controls */
  overlay: string
  /** hover state for rows and buttons */
  hover: string

  line: string
  lineStrong: string
  edge: string

  ink: string
  inkDim: string
  inkFaint: string
  inkGhost: string

  /** brand colour: primary buttons, active navigation, focus, selection */
  accent: string
  accentBright: string
  accentDim: string
  /** text and icons sitting on top of a filled accent surface */
  onAccent: string

  /** succeeded, running, connected */
  run: string
  runBright: string
  runDim: string

  info: string
  infoDim: string
  warn: string
  warnDim: string
  danger: string
  dangerDim: string
  root: string
  rootDim: string

  /** modal backdrop, always darker than the page whatever the mode */
  scrim: string
  gridLine: string
  scrollbar: string
  scrollbarHover: string
  shadowInset: string
  shadowDrop: string
}

export interface Theme {
  id: string
  label: string
  mode: ThemeMode
  description: string
  /** shown as the swatch in the picker */
  swatch: [string, string, string]
  fontSans?: string
  fontMono?: string
  tokens: ThemeTokens
  terminal: TerminalPalette
}

const UBUNTU_SANS = "'Ubuntu', 'Ubuntu Sans', 'Inter Variable', system-ui, sans-serif"
const UBUNTU_MONO = "'Ubuntu Mono', 'Ubuntu Sans Mono', 'JetBrains Mono Variable', monospace"

/* ---------------------------------------------------------------- */

const midnight: Theme = {
  id: 'midnight',
  label: 'Midnight',
  mode: 'dark',
  description: 'The default. Deep navy with a green run colour.',
  swatch: ['#080b14', '#16203a', '#34d399'],
  tokens: {
    void: '#05070d',
    base: '#080b14',
    surface: '#0c111d',
    raised: '#111829',
    overlay: '#16203a',
    hover: '#1b2740',
    line: '#1b2438',
    lineStrong: '#243150',
    edge: '#2a3754',
    ink: '#e9eef9',
    inkDim: '#9aa8c2',
    inkFaint: '#64718d',
    inkGhost: '#45506a',
    accent: '#10b981',
    accentBright: '#34d399',
    accentDim: '#064e3b',
    onAccent: '#05070d',
    run: '#10b981',
    runBright: '#34d399',
    runDim: '#064e3b',
    info: '#60a5fa',
    infoDim: '#1e3a5f',
    warn: '#fbbf24',
    warnDim: '#4a3407',
    danger: '#fb7185',
    dangerDim: '#4c1127',
    root: '#c084fc',
    rootDim: '#3b1a5c',
    scrim: 'rgb(2 4 9 / 0.72)',
    gridLine: 'rgb(255 255 255 / 0.022)',
    scrollbar: '#243049',
    scrollbarHover: '#33415f',
    shadowInset: 'rgb(255 255 255 / 0.03)',
    shadowDrop: 'rgb(0 0 0 / 0.8)'
  },
  terminal: {
    background: '#05070d',
    foreground: '#e9eef9',
    cursor: '#34d399',
    selectionBackground: '#1e3a5f',
    black: '#0c111d',
    red: '#fb7185',
    green: '#34d399',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#cbd5e1',
    brightBlack: '#64718d',
    brightRed: '#fda4af',
    brightGreen: '#6ee7b7',
    brightYellow: '#fcd34d',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#f8fafc'
  }
}

const yaruDark: Theme = {
  id: 'yaru-dark',
  label: 'Yaru Dark',
  mode: 'dark',
  description: 'Ubuntu, in the dark. Aubergine greys and Ubuntu orange.',
  swatch: ['#1f1a1c', '#3d3337', '#e95420'],
  fontSans: UBUNTU_SANS,
  fontMono: UBUNTU_MONO,
  tokens: {
    void: '#171214',
    base: '#1f1a1c',
    surface: '#272022',
    raised: '#2f2729',
    overlay: '#3a3034',
    hover: '#453a3e',
    line: '#372e31',
    lineStrong: '#473c40',
    edge: '#554850',
    ink: '#f7f2f3',
    inkDim: '#c6b9bd',
    inkFaint: '#9b8d92',
    inkGhost: '#71656a',
    accent: '#e95420',
    accentBright: '#f4835c',
    accentDim: '#5a2210',
    onAccent: '#1a1214',
    run: '#26a269',
    runBright: '#3fd995',
    runDim: '#0c3a25',
    info: '#62a0ea',
    infoDim: '#17365c',
    warn: '#f5c211',
    warnDim: '#4a3a06',
    danger: '#ff7b63',
    dangerDim: '#521b14',
    root: '#cf86d8',
    rootDim: '#43164a',
    scrim: 'rgb(12 8 10 / 0.72)',
    gridLine: 'rgb(255 255 255 / 0.025)',
    scrollbar: '#4a3f43',
    scrollbarHover: '#5e5054',
    shadowInset: 'rgb(255 255 255 / 0.04)',
    shadowDrop: 'rgb(0 0 0 / 0.75)'
  },
  terminal: {
    background: '#2c001e',
    foreground: '#f7f2f3',
    cursor: '#e95420',
    selectionBackground: '#5e2750',
    black: '#2e3436',
    red: '#cc0000',
    green: '#4e9a06',
    yellow: '#c4a000',
    blue: '#3465a4',
    magenta: '#75507b',
    cyan: '#06989a',
    white: '#d3d7cf',
    brightBlack: '#555753',
    brightRed: '#ef2929',
    brightGreen: '#8ae234',
    brightYellow: '#fce94f',
    brightBlue: '#729fcf',
    brightMagenta: '#ad7fa8',
    brightCyan: '#34e2e2',
    brightWhite: '#eeeeec'
  }
}

const yaruLight: Theme = {
  id: 'yaru-light',
  label: 'Yaru Light',
  mode: 'light',
  description: 'Ubuntu in daylight. Paper white panels, Ubuntu orange.',
  swatch: ['#fafafa', '#ebe8e6', '#d44414'],
  fontSans: UBUNTU_SANS,
  fontMono: UBUNTU_MONO,
  tokens: {
    void: '#efecea',
    base: '#faf9f8',
    surface: '#ffffff',
    raised: '#ffffff',
    overlay: '#f2efed',
    hover: '#e8e4e1',
    line: '#ddd7d3',
    lineStrong: '#c9c1bc',
    edge: '#b4aaa4',
    ink: '#1b1718',
    inkDim: '#4d4548',
    inkFaint: '#746a6e',
    inkGhost: '#9d9398',
    accent: '#d44414',
    accentBright: '#a8330c',
    accentDim: '#fbe6dd',
    onAccent: '#ffffff',
    run: '#1a7f4f',
    runBright: '#13663e',
    runDim: '#dcf2e7',
    info: '#1c63b8',
    infoDim: '#dbe8f8',
    warn: '#946100',
    warnDim: '#f8eed2',
    danger: '#c01c28',
    dangerDim: '#fadfe1',
    root: '#8b2fa0',
    rootDim: '#f2dff7',
    scrim: 'rgb(40 30 34 / 0.45)',
    gridLine: 'rgb(0 0 0 / 0.035)',
    scrollbar: '#c6bdb8',
    scrollbarHover: '#aaa09a',
    shadowInset: 'rgb(255 255 255 / 0.9)',
    shadowDrop: 'rgb(60 45 50 / 0.18)'
  },
  terminal: {
    background: '#fdfdfc',
    foreground: '#1b1718',
    cursor: '#d44414',
    selectionBackground: '#f6d3c4',
    black: '#2e3436',
    red: '#c01c28',
    green: '#1a7f4f',
    yellow: '#946100',
    blue: '#1c63b8',
    magenta: '#8b2fa0',
    cyan: '#0a7986',
    white: '#5e5c64',
    brightBlack: '#746a6e',
    brightRed: '#a51d2d',
    brightGreen: '#13663e',
    brightYellow: '#7a5000',
    brightBlue: '#154f94',
    brightMagenta: '#6f2481',
    brightCyan: '#076672',
    brightWhite: '#1b1718'
  }
}

const fedora: Theme = {
  id: 'fedora',
  label: 'Fedora',
  mode: 'dark',
  description: 'Cool slate greys with Fedora blue.',
  swatch: ['#15191e', '#242c36', '#3c6eb4'],
  tokens: {
    void: '#0f1317',
    base: '#15191e',
    surface: '#1b2026',
    raised: '#21272f',
    overlay: '#283039',
    hover: '#313b46',
    line: '#262e37',
    lineStrong: '#344050',
    edge: '#415062',
    ink: '#eef2f6',
    inkDim: '#a7b4c2',
    inkFaint: '#74828f',
    inkGhost: '#525e6a',
    accent: '#3c6eb4',
    accentBright: '#6ba4e8',
    accentDim: '#17304f',
    onAccent: '#f5f9ff',
    run: '#2ec27e',
    runBright: '#57e3a4',
    runDim: '#0e3d29',
    info: '#51a2da',
    infoDim: '#17344d',
    warn: '#e5a50a',
    warnDim: '#453206',
    danger: '#f66151',
    dangerDim: '#4d1812',
    root: '#a88bfa',
    rootDim: '#2e2355',
    scrim: 'rgb(6 9 12 / 0.72)',
    gridLine: 'rgb(255 255 255 / 0.022)',
    scrollbar: '#2f3a46',
    scrollbarHover: '#41505f',
    shadowInset: 'rgb(255 255 255 / 0.035)',
    shadowDrop: 'rgb(0 0 0 / 0.78)'
  },
  terminal: {
    background: '#0f1317',
    foreground: '#eef2f6',
    cursor: '#6ba4e8',
    selectionBackground: '#294172',
    black: '#1b2026',
    red: '#f66151',
    green: '#57e3a4',
    yellow: '#e5a50a',
    blue: '#6ba4e8',
    magenta: '#a88bfa',
    cyan: '#4fd2dd',
    white: '#c3ccd6',
    brightBlack: '#74828f',
    brightRed: '#ff8a7a',
    brightGreen: '#7df0bc',
    brightYellow: '#f7c948',
    brightBlue: '#9ac5f5',
    brightMagenta: '#c6b2fd',
    brightCyan: '#86e6ee',
    brightWhite: '#f7fafd'
  }
}

const debian: Theme = {
  id: 'debian',
  label: 'Debian',
  mode: 'dark',
  description: 'Warm charcoal with Debian crimson.',
  swatch: ['#191416', '#2b2126', '#d70a53'],
  tokens: {
    void: '#130f11',
    base: '#191416',
    surface: '#201a1d',
    raised: '#272025',
    overlay: '#2f262c',
    hover: '#3a2f36',
    line: '#2c2429',
    lineStrong: '#3b3038',
    edge: '#4b3d47',
    ink: '#f6eff2',
    inkDim: '#c2b3ba',
    inkFaint: '#8e8088',
    inkGhost: '#675c63',
    accent: '#d70a53',
    accentBright: '#ff5f8f',
    accentDim: '#4d0a21',
    onAccent: '#fff0f4',
    run: '#2ec27e',
    runBright: '#52dd9b',
    runDim: '#0d3b27',
    info: '#6aa5e9',
    infoDim: '#1a3352',
    warn: '#edb413',
    warnDim: '#473507',
    danger: '#ff6b6b',
    dangerDim: '#4f1717',
    root: '#bb79e0',
    rootDim: '#3a2150',
    scrim: 'rgb(9 6 8 / 0.72)',
    gridLine: 'rgb(255 255 255 / 0.022)',
    scrollbar: '#3d323a',
    scrollbarHover: '#51434c',
    shadowInset: 'rgb(255 255 255 / 0.035)',
    shadowDrop: 'rgb(0 0 0 / 0.78)'
  },
  terminal: {
    background: '#130f11',
    foreground: '#f6eff2',
    cursor: '#ff5f8f',
    selectionBackground: '#4d0a21',
    black: '#201a1d',
    red: '#ff6b6b',
    green: '#52dd9b',
    yellow: '#edb413',
    blue: '#6aa5e9',
    magenta: '#bb79e0',
    cyan: '#4bd6d6',
    white: '#c9bcc3',
    brightBlack: '#8e8088',
    brightRed: '#ff9b9b',
    brightGreen: '#82ecba',
    brightYellow: '#f7cd4e',
    brightBlue: '#9ac4f2',
    brightMagenta: '#d3a3ec',
    brightCyan: '#84e7e7',
    brightWhite: '#fdf7f9'
  }
}

const graphiteLight: Theme = {
  id: 'graphite-light',
  label: 'Graphite Light',
  mode: 'light',
  description: 'Neutral light with the default green run colour.',
  swatch: ['#f7f8fa', '#e8eaef', '#0f9d63'],
  tokens: {
    void: '#eceef2',
    base: '#f7f8fa',
    surface: '#ffffff',
    raised: '#ffffff',
    overlay: '#eef0f4',
    hover: '#e4e7ed',
    line: '#dcdfe6',
    lineStrong: '#c6cbd4',
    edge: '#aab1bd',
    ink: '#11151c',
    inkDim: '#464e5a',
    inkFaint: '#6b7482',
    inkGhost: '#98a0ad',
    accent: '#0a7a4c',
    accentBright: '#08603c',
    accentDim: '#d8f3e7',
    onAccent: '#ffffff',
    run: '#0f9d63',
    runBright: '#0a7a4c',
    runDim: '#d8f3e7',
    info: '#1c63b8',
    infoDim: '#dce8f8',
    warn: '#8a5a00',
    warnDim: '#f8efd6',
    danger: '#c0243a',
    dangerDim: '#fadee2',
    root: '#7a35b8',
    rootDim: '#eee0fa',
    scrim: 'rgb(20 26 36 / 0.45)',
    gridLine: 'rgb(0 0 0 / 0.032)',
    scrollbar: '#c2c8d2',
    scrollbarHover: '#a5adba',
    shadowInset: 'rgb(255 255 255 / 0.9)',
    shadowDrop: 'rgb(20 26 36 / 0.16)'
  },
  terminal: {
    background: '#fcfdfe',
    foreground: '#11151c',
    cursor: '#0f9d63',
    selectionBackground: '#cbe8db',
    black: '#11151c',
    red: '#c0243a',
    green: '#0f9d63',
    yellow: '#8a5a00',
    blue: '#1c63b8',
    magenta: '#7a35b8',
    cyan: '#0a7986',
    white: '#5a6472',
    brightBlack: '#6b7482',
    brightRed: '#9b1b2d',
    brightGreen: '#0a7a4c',
    brightYellow: '#6e4700',
    brightBlue: '#154f94',
    brightMagenta: '#602a90',
    brightCyan: '#076672',
    brightWhite: '#11151c'
  }
}

export const THEMES: Theme[] = [midnight, yaruDark, yaruLight, fedora, debian, graphiteLight]

export const DEFAULT_THEME_ID = midnight.id

export function getTheme(id: string | undefined): Theme {
  return THEMES.find((theme) => theme.id === id) ?? midnight
}

/* ---------------------------------------------------------------- */

export type Density = 'compact' | 'comfortable' | 'spacious'

export interface DensitySpec {
  id: Density
  label: string
  /** virtualised table row height, in px */
  rowHeight: number
  /** base font size for the app shell, in px */
  fontSize: number
  description: string
}

export const DENSITIES: DensitySpec[] = [
  {
    id: 'compact',
    label: 'Compact',
    rowHeight: 25,
    fontSize: 12,
    description: 'More rows on screen. Best on a large display.'
  },
  {
    id: 'comfortable',
    label: 'Comfortable',
    rowHeight: 30,
    fontSize: 13,
    description: 'The default.'
  },
  {
    id: 'spacious',
    label: 'Spacious',
    rowHeight: 36,
    fontSize: 14,
    description: 'Larger text and taller rows.'
  }
]

export function getDensity(id: string | undefined): DensitySpec {
  return DENSITIES.find((density) => density.id === id) ?? DENSITIES[1]
}

/** CSS custom property name for a token, matching the Tailwind theme block. */
const TOKEN_VARS: Record<keyof ThemeTokens, string> = {
  void: '--color-void',
  base: '--color-base',
  surface: '--color-surface',
  raised: '--color-raised',
  overlay: '--color-overlay',
  hover: '--color-hover',
  line: '--color-line',
  lineStrong: '--color-line-strong',
  edge: '--color-edge',
  ink: '--color-ink',
  inkDim: '--color-ink-dim',
  inkFaint: '--color-ink-faint',
  inkGhost: '--color-ink-ghost',
  accent: '--color-accent',
  accentBright: '--color-accent-bright',
  accentDim: '--color-accent-dim',
  onAccent: '--color-on-accent',
  run: '--color-run',
  runBright: '--color-run-bright',
  runDim: '--color-run-dim',
  info: '--color-info',
  infoDim: '--color-info-dim',
  warn: '--color-warn',
  warnDim: '--color-warn-dim',
  danger: '--color-danger',
  dangerDim: '--color-danger-dim',
  root: '--color-root',
  rootDim: '--color-root-dim',
  scrim: '--color-scrim',
  gridLine: '--grid-line',
  scrollbar: '--scrollbar-thumb',
  scrollbarHover: '--scrollbar-thumb-hover',
  shadowInset: '--shadow-inset',
  shadowDrop: '--shadow-drop'
}

/** Flat map of CSS custom properties for a theme, ready to apply to an element. */
export function themeVariables(theme: Theme, density: DensitySpec): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, cssName] of Object.entries(TOKEN_VARS)) {
    vars[cssName] = theme.tokens[key as keyof ThemeTokens]
  }
  if (theme.fontSans) vars['--font-sans'] = theme.fontSans
  if (theme.fontMono) vars['--font-mono'] = theme.fontMono
  vars['--row-h'] = `${density.rowHeight}px`
  vars['--app-font-size'] = `${density.fontSize}px`
  return vars
}
