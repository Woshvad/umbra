import type { Config } from 'tailwindcss'

// BINDING comp theme — transcribed verbatim from 03-UI-SPEC.md (lines 66-145),
// itself transcribed from `Umbra design/Umbra.dc.html`. Do NOT alter values:
// the design comp is the pixel-exact source of truth (CLAUDE.md rule 2).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper:  '#F4F1EA',
        ink:    '#0A0A0A',
        lime:   '#D6FB3C',
        red:    '#E2231A',   // signal/destructive
        redact: '#262626',
        buy:    '#2B3AF2',
        sell:   '#FF3D9A',
        flame:  '#FF6A1A',   // declared; Theatre/Agent only
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'monospace'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // exact px from comp → rem at 16px base
        '9':   ['9px',   '1'],     // micro labels / tags / REDACTED line
        '10':  ['10px',  '1.2'],   // uppercase field labels
        '11':  ['11px',  '1.2'],   // nav label, mono small
        '12':  ['12px',  '1.4'],   // mono data small, spine caption
        '13':  ['13px',  '1.6'],   // body paragraph, status value, nav label
        '14':  ['14px',  '1'],     // column code, order values
        '30':  ['30px',  '1'],     // wordmark UMBRA
        '78':  ['78px',  '.94'],   // Privacy headline
        '108': ['108px', '.85'],   // venue-spine sealed count numeral
        // Phase-6 large numerals (UI-SPEC Typography, lines 76-101). The existing
        // '30' (wordmark) stays byte-unchanged; the reveal-label 30px lives at '30b'.
        '15':  ['15px',  '1.7'],   // agent rationale (typed) + DvP leg party
        '18':  ['18px',  '1'],     // balance numeral + COMPUTING label
        '22':  ['22px',  '1'],     // agent proposal value
        '34':  ['34px',  '1'],     // reveal sub-stat
        '40':  ['40px',  '1'],     // holdings numeral
        '44':  ['44px',  '1'],     // desk big input numeral
        '54':  ['54px',  '.96'],   // view headline (Desk/Agent/Settlement)
        '56':  ['56px',  '.98'],   // Theatre headline
        '84':  ['84px',  '1'],     // countdown ring seconds
        '120': ['120px', '.9'],    // price-reveal hero numeral — the money shot
        '30b': ['30px',  '1'],     // reveal "CLEARS AT" label
      },
      letterSpacing: {
        tightest: '-.04em',  // 108px count
        tighter:  '-.025em', // 78px headline
        tight:    '-.02em',  // wordmark
        normal:   '0',
        wide:     '.06em',
        wider:    '.1em',
        widest:   '.16em',
        ultra:    '.22em',
        mega:     '.28em',   // SEALED ORDERS caption
        rail:     '.5em',    // rotated SEALED rail
      },
      spacing: {
        // comp uses an irregular set; expose the literals it actually uses
        '11': '11px', '14': '14px', '18': '18px', '22': '22px',
        '26': '26px', '30': '30px', '34': '34px', '42': '42px',
        '48': '48px', '64': '64px',
      },
      borderColor: { DEFAULT: '#0A0A0A' }, // every border in the comp is 1px solid ink
      backgroundImage: {
        // redaction stripe — the privacy motif (comp lines 108/114/120/187/196)
        redact: 'repeating-linear-gradient(90deg,#0A0A0A 0 5px,#262626 5px 7px)',
        // seal-wipe overlay variant (comp line 196)
        'redact-wipe': 'repeating-linear-gradient(90deg,#0A0A0A 0 6px,#1c1c1c 6px 9px)',
      },
      keyframes: {
        umbraWipe:  { from: { clipPath: 'inset(0 100% 0 0)' }, to: { clipPath: 'inset(0 0 0 0)' } },
        umbraSlam:  { '0%': { transform: 'scale(.92)' }, '55%': { transform: 'scale(1.05)' }, '100%': { transform: 'scale(1)' } },
        umbraStamp: { '0%': { transform: 'rotate(-13deg) scale(1.7)', opacity: '0' }, '55%': { transform: 'rotate(-4deg) scale(.94)', opacity: '1' }, '100%': { transform: 'rotate(-4deg) scale(1)' } },
        umbraDraw:  { from: { strokeDashoffset: '640' }, to: { strokeDashoffset: '0' } },
        umbraFade:  { from: { opacity: '0' }, to: { opacity: '1' } },
        umbraRise:  { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        umbraCaret: { '0%,49%': { opacity: '1' }, '50%,100%': { opacity: '0' } },
        umbraPulse: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
        // Phase-6 ADD: settlement leg draw-on (UI-SPEC line 262). `--len` is the
        // per-leg stroke length set inline if an SVG-stroke leg path is chosen.
        umbraLeg:   { from: { strokeDashoffset: 'var(--len)' }, to: { strokeDashoffset: '0' } },
      },
      animation: {
        'umbra-wipe':  'umbraWipe .3s ease forwards',
        'umbra-slam':  'umbraSlam .42s cubic-bezier(.2,.8,.25,1)',
        'umbra-stamp': 'umbraStamp .22s cubic-bezier(.2,.7,.3,1)',
        'umbra-rise':  'umbraRise .4s ease',
        'umbra-fade':  'umbraFade .4s ease',
        // Phase-6 ADD: the umbraDraw/umbraPulse/umbraCaret keyframes existed with NO
        // alias — these make `animate-umbra-draw`/`-pulse`/`-caret` live utility classes
        // that Plans 03/04 consume via className (without these they are dead no-ops).
        'umbra-draw':  'umbraDraw 1s ease forwards',
        'umbra-pulse': 'umbraPulse 1s infinite',
        'umbra-caret': 'umbraCaret .9s steps(1) infinite',
        'umbra-leg':   'umbraLeg .8s linear forwards',
      },
    },
  },
  plugins: [],
} satisfies Config
