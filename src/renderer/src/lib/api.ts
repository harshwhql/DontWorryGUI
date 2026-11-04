import type { DwgApi } from '../../../preload'

declare global {
  interface Window {
    dwg: DwgApi
  }
}

/**
 * The bridge is injected by the preload script. It is missing only when the
 * renderer is opened outside the desktop shell (for example the Vite dev URL in
 * a plain browser), so fail loudly rather than hanging on a spinner.
 */
export const bridgeAvailable = typeof window !== 'undefined' && Boolean(window.dwg)

export const api = window.dwg

export type { DwgApi }
