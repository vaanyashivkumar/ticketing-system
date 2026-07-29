import type { Config } from 'tailwindcss';

/**
 * Tailwind theme = the phase-2 Design System (docs/phase-2-design-system.md, Appendix B).
 * Every value resolves through a CSS custom property declared in src/styles/tokens.css,
 * so light/dark and future rebrands are a token change, never a class rewrite.
 * Utilities reference token NAMES; never hardcode raw colour/spacing values in components.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', ':root[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          elevated: 'var(--color-surface-elevated)',
          sunken: 'var(--color-surface-sunken)',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          active: 'var(--color-primary-active)',
          on: 'var(--color-on-primary)',
          // `text-primary-text` for primary-coloured TEXT. `primary` is a FILL, tuned to carry
          // white on top of it; used as a foreground on a dark surface it fails AA (A11Y-001).
          // Mirrors the error/success/warning/info pairing that already exists below.
          text: 'var(--color-primary-text)',
        },
        secondary: 'var(--color-secondary)',
        // `text` is accent-as-TEXT; DEFAULT is accent-as-FILL. See the primary note above.
        accent: { DEFAULT: 'var(--color-accent)', tint: 'var(--color-accent-tint)', text: 'var(--color-accent-text)' },
        selected: { bg: 'var(--color-selected-bg)', border: 'var(--color-selected-border)' },
        border: { DEFAULT: 'var(--color-border)', strong: 'var(--color-border-strong)' },
        scrim: 'var(--color-scrim)',
        text: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
        focus: 'var(--color-focus-ring)',
        row: {
          hover: 'var(--color-row-hover)',
          active: 'var(--color-row-active)',
          alt: 'var(--color-row-alt)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          text: 'var(--color-success-text)',
          bg: 'var(--color-success-bg)',
          active: 'var(--color-success-active)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          text: 'var(--color-warning-text)',
          bg: 'var(--color-warning-bg)',
          active: 'var(--color-warning-active)',
        },
        error: {
          DEFAULT: 'var(--color-error)',
          text: 'var(--color-error-text)',
          bg: 'var(--color-error-bg)',
          active: 'var(--color-error-active)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          text: 'var(--color-info-text)',
          bg: 'var(--color-info-bg)',
          active: 'var(--color-info-active)',
        },
      },
      fontFamily: { sans: 'var(--font-sans)', serif: 'var(--font-serif)', mono: 'var(--font-mono)' },
      fontSize: {
        /**
         * EDITORIAL SCALE — for the sign-in page and the few surfaces that are read rather than
         * worked through. Deliberately separate from the product scale below, which starts at
         * `display` (30px) and is tuned for density.
         *
         * Tracking tightens as size grows, which is how type is actually set: spacing that looks
         * right at 14px looks loose at 56px, because apparent letterspacing scales with the
         * glyphs. Line height moves the other way for the same reason — 1.05 at display size
         * against 1.5 at body.
         */
        'editorial-xl': ['clamp(2.5rem, 5vw, 3.5rem)', { lineHeight: '1.05', letterSpacing: '-0.035em', fontWeight: '400' }],
        'editorial-lg': ['clamp(2rem, 4vw, 2.75rem)', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '400' }],
        'editorial-md': ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '400' }],
        /** Standfirst — the paragraph under an editorial headline. Larger and softer than body. */
        lede: ['1.0625rem', { lineHeight: '1.6', letterSpacing: '-0.005em', fontWeight: '400' }],
        display: ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        h1: ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.01em', fontWeight: '600' }],
        h2: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em', fontWeight: '600' }],
        h3: ['1.125rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        h4: ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        'body-lg': ['1rem', { lineHeight: '1.5rem', fontWeight: '400' }],
        body: ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        'body-medium': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '500' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.125rem', fontWeight: '400' }],
        label: ['0.8125rem', { lineHeight: '1rem', fontWeight: '500' }],
        'label-sm': ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        table: ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '400' }],
        overline: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.04em', fontWeight: '600' }],
      },
      spacing: {
        '0.5': 'var(--space-0-5)',
        1: 'var(--space-1)',
        '1.5': 'var(--space-1-5)',
        2: 'var(--space-2)',
        '2.5': 'var(--space-2-5)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        e1: 'var(--elevation-e1)',
        e2: 'var(--elevation-e2)',
        e3: 'var(--elevation-e3)',
        hairline: 'var(--elevation-hairline)',
      },
      zIndex: {
        base: '0',
        sticky: '200',
        chrome: '300',
        dropdown: '1000',
        backdrop: '1200',
        modal: '1350',
        toast: '1400',
        tooltip: '1500',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        out: 'var(--ease-out)',
        in: 'var(--ease-in)',
        'in-out': 'var(--ease-in-out)',
      },
      /**
       * The duration scale was defined in tokens.css and NEVER mapped here — so `duration-fast`,
       * `duration-base` and `duration-slow` were not valid Tailwind classes at all. They have been
       * used ~13 times since P11 and did nothing: every one silently fell back to Tailwind's
       * default 150ms. Found only by measuring the running app (`transitionDuration: 0.15s` on a
       * drawer declared `duration-slow`), never by reading the code — the class name, the token
       * file and the rendered value all disagreed in silence.
       */
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
    },
  },
  plugins: [],
};

export default config;
