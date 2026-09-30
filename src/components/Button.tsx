import type { ComponentPropsWithRef, ReactNode } from 'react'

/** The phone-island button, verbatim classes with the ci- prefix, so the two islands look alike. */
type Variant = 'default' | 'green' | 'red' | 'neutral' | 'transparent' | 'small' | 'call'

const base =
  'ci-flex ci-content-center ci-items-center ci-justify-center ci-tracking-wide ci-duration-200 ci-transform ci-outline-none focus:ci-ring-2 focus:ci-z-20 focus:ci-ring-offset-2 disabled:ci-opacity-40 disabled:ci-cursor-not-allowed ci-border ci-border-transparent focus:ci-ring-offset-white dark:focus:ci-ring-offset-black ci-text-sm ci-leading-4 ci-transition-colors ci-shrink-0 ci-font-light'

const variants: Record<Variant, string> = {
  default:
    'ci-bg-phoneIslandActive dark:ci-bg-phoneIslandActiveDark hover:ci-bg-gray-500 dark:hover:ci-bg-gray-50 focus:ci-ring-emerald-500 dark:focus:ci-ring-emerald-300 ci-text-primaryInvert dark:ci-text-primaryInvertDark ci-h-12 ci-w-12 ci-rounded-full',
  green:
    'ci-bg-phoneIslandCall dark:ci-bg-phoneIslandCallDark hover:ci-bg-phoneIslandCallHover dark:hover:ci-bg-phoneIslandCallHoverDark focus:ci-ring-green-500 ci-text-white dark:ci-text-gray-950 ci-h-12 ci-w-12 ci-rounded-full',
  red: 'ci-bg-phoneIslandClose dark:ci-bg-phoneIslandCloseDark hover:ci-bg-phoneIslandCloseHover dark:hover:ci-bg-phoneIslandCloseHoverDark focus:ci-ring-emerald-500 ci-text-white dark:ci-text-gray-950 ci-h-12 ci-w-12 ci-rounded-full',
  neutral:
    'ci-bg-transparent enabled:hover:ci-bg-gray-500 enabled:hover:ci-border-gray-500 ci-border ci-border-gray-700 focus:ci-ring-0 ci-text-secondaryNeutral dark:ci-text-secondaryNeutralDark ci-h-12 ci-w-12 ci-rounded-full',
  transparent:
    'ci-bg-transparent dark:enabled:hover:ci-bg-gray-700/30 enabled:hover:ci-bg-gray-300/70 focus:ci-ring-gray-400 dark:focus:ci-ring-gray-500 ci-text-secondaryNeutral dark:ci-text-secondaryNeutralDark ci-h-12 ci-w-12 ci-rounded-full',
  call: 'ci-bg-phoneIslandCall dark:ci-bg-phoneIslandCallDark hover:ci-bg-phoneIslandCallHover dark:hover:ci-bg-phoneIslandCallHoverDark focus:ci-ring-green-500 ci-text-white dark:ci-text-gray-950 ci-h-8 ci-w-8 ci-rounded-full',
  small:
    'ci-bg-transparent dark:hover:ci-bg-gray-600 hover:ci-bg-gray-300 focus:ci-ring-gray-400 dark:focus:ci-ring-gray-500 ci-text-gray-700 dark:ci-text-white ci-h-8 ci-w-8 ci-rounded',
}

export function Button({ variant, className = '', children, ...props }: ComponentPropsWithRef<'button'> & { variant: Variant; children: ReactNode }) {
  // Icon buttons: the tooltip is also what a screen reader announces.
  return (
    <button type="button" aria-label={props['aria-label'] ?? props.title} className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export const Icon = {
  chat: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  bell: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  clip: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
  send: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>,
  phone: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
  mic: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" /></svg>,
  camera: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>,
  trash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>,
  minus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>,
  close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>,
  smile: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>,
  react: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 11A8.5 8.5 0 1 1 13 3.5" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01M19 2v6M16 5h6" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>,
}
