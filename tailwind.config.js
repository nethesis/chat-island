/**
 * Same design tokens as phone-island (names, values, dark variants), with the
 * ci- prefix so the island never restyles its host page. Preflight is off for
 * the same reason.
 */
export default {
  prefix: 'ci-',
  content: ['./src/**/*.{ts,tsx}', './dev/index.html'],
  darkMode: ['class', '.dark'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: { sans: ['Poppins', 'Inter', 'system-ui', 'sans-serif'] },
      colors: {
        primaryNeutral: '#111827', primaryNeutralDark: '#F9FAFB',
        primaryInvert: '#F9FAFB', primaryInvertDark: '#111827',
        secondaryNeutral: '#374151', secondaryNeutralDark: '#E5E7EB',
        tertiaryNeutral: '#4b5563', tertiaryNeutralDark: '#D1D5DB',
        surfaceBackground: '#F9FAFB', surfaceBackgroundDark: '#030712',
        elevationL2: '#F3F4F6', elevationL2Dark: '#1F2937',
        phoneIslandActive: '#374151', phoneIslandActiveDark: '#D1D5DB',
        phoneIslandHover: '#1F2937', phoneIslandHoverDark: '#F9FAFB',
        phoneIslandCall: '#15803D', phoneIslandCallDark: '#22C55E',
        phoneIslandCallHover: '#166534', phoneIslandCallHoverDark: '#86EFAC',
        phoneIslandClose: '#B91C1C', phoneIslandCloseDark: '#EF4444',
        phoneIslandCloseHover: '#991B1B', phoneIslandCloseHoverDark: '#FCA5A5',
        iconWhite: '#FFFFFF', iconWhiteDark: '#FFFFFF',
        iconPrimaryNeutral: '#111827', iconPrimaryNeutralDark: '#F9FAFB',
        iconSecondary: '#4338CA', iconSecondaryDark: '#6366F1',
      },
    },
  },
  plugins: [],
}
