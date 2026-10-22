// The opening scene: a wheat farm with a little house and cattle, a smiling bearded farmer, and a
// tractor that drives across the whole screen cutting the crop behind its header. Pure SVG; the
// motion is CSS (see the .intro-* rules in styles/index.css), so two copies mounted together stay
// in step, which the split-screen reveal in FarmIntro relies on.
//
// Drawn on a 1600 x 900 canvas and cropped with "slice", so it fills any screen. On a portrait
// phone the middle of the canvas (farmer, field, tractor) is what stays in view.

const ROWS = 6
const ROW_TOP = 548
const ROW_STEP = 40
const ROW_H = 84

// The tractor's cutter edge sits this far in front of its rear wheel.
export const TRACTOR_FRONT = 455
export const TRACTOR_START = -520
export const TRACTOR_END = 1700

function Cow({ x, y, s = 1, flip = false, graze = false }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cx="0" cy="3" rx="66" ry="8" fill="rgba(60,50,20,.16)" />
      <path d="M58 -62 C76 -60 80 -40 73 -20" stroke="#2b2b24" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="-46" y="-30" width="13" height="32" rx="4" fill="#e6dcc6" />
      <rect x="-26" y="-30" width="13" height="32" rx="4" fill="#efe6d2" />
      <rect x="22" y="-30" width="13" height="32" rx="4" fill="#e6dcc6" />
      <rect x="42" y="-30" width="13" height="32" rx="4" fill="#efe6d2" />
      <rect x="-62" y="-80" width="126" height="58" rx="27" fill="#fbf7ee" />
      <ellipse cx="-22" cy="-60" rx="17" ry="12" fill="#2b2b24" />
      <ellipse cx="26" cy="-54" rx="15" ry="11" fill="#2b2b24" />
      <ellipse cx="2" cy="-74" rx="12" ry="6" fill="#2b2b24" />
      <ellipse cx="22" cy="-22" rx="10" ry="7" fill="#f1b6a8" />
      <g className={graze ? 'intro-graze' : undefined} style={{ transformOrigin: '-58px -62px' }}>
        <rect x="-104" y="-80" width="50" height="42" rx="17" fill="#fbf7ee" />
        <rect x="-106" y="-54" width="30" height="18" rx="8" fill="#f1b6a8" />
        <circle cx="-96" cy="-45" r="2.4" fill="#b8786a" />
        <circle cx="-86" cy="-45" r="2.4" fill="#b8786a" />
        <circle cx="-72" cy="-66" r="3.4" fill="#2b2b24" />
        <ellipse cx="-56" cy="-74" rx="13" ry="6" fill="#2b2b24" transform="rotate(25 -56 -74)" />
        <path d="M-78 -80 q-3 -12 7 -15 M-62 -80 q2 -12 -7 -14" stroke="#efe6d2" strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>
    </g>
  )
}

function House() {
  return (
    <g transform="translate(150 332)">
      <ellipse cx="110" cy="200" rx="150" ry="12" fill="rgba(60,50,20,.16)" />
      <rect x="20" y="92" width="180" height="108" fill="#f6e6c3" />
      <rect x="20" y="186" width="180" height="14" fill="#e3cfa0" />
      <rect x="152" y="26" width="24" height="52" fill="#9a4a29" />
      <rect x="148" y="20" width="32" height="10" rx="3" fill="#7d3a20" />
      <g className="intro-smoke" style={{ animationDelay: '0s' }}><circle cx="164" cy="12" r="10" fill="#fff" opacity=".8" /></g>
      <g className="intro-smoke" style={{ animationDelay: '1.3s' }}><circle cx="164" cy="12" r="10" fill="#fff" opacity=".8" /></g>
      <polygon points="0,96 110,8 220,96" fill="#b85a33" />
      <polygon points="0,96 110,8 110,96" fill="#a14d2b" />
      <rect x="94" y="130" width="40" height="70" rx="4" fill="#8a5a2e" />
      <circle cx="125" cy="168" r="3" fill="#f4c542" />
      <rect x="36" y="116" width="42" height="42" rx="3" fill="#cfe4f2" stroke="#8a5a2e" strokeWidth="5" />
      <path d="M57 116 V158 M36 137 H78" stroke="#8a5a2e" strokeWidth="3" />
      <rect x="152" y="116" width="42" height="42" rx="3" fill="#cfe4f2" stroke="#8a5a2e" strokeWidth="5" />
      <path d="M173 116 V158 M152 137 H194" stroke="#8a5a2e" strokeWidth="3" />
    </g>
  )
}

function Tree({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="2" rx="46" ry="8" fill="rgba(60,50,20,.14)" />
      <rect x="-9" y="-70" width="18" height="72" rx="5" fill="#7a5530" />
      <circle cx="0" cy="-104" r="48" fill="#5f8a3c" />
      <circle cx="-30" cy="-84" r="32" fill="#6b9a45" />
      <circle cx="32" cy="-86" r="30" fill="#557f35" />
    </g>
  )
}

function Fence() {
  const posts = []
  for (let x = -20; x < 1640; x += 72) posts.push(x)
  return (
    <g>
      <rect x="-20" y="514" width="1660" height="7" fill="#9a7a45" />
      <rect x="-20" y="530" width="1660" height="7" fill="#9a7a45" />
      {posts.map((x) => (
        <rect key={x} x={x} y="502" width="10" height="44" rx="2" fill="#7d5f33" />
      ))}
    </g>
  )
}

function Farmer() {
  return (
    <g transform="translate(700 886) scale(.8)">
      <ellipse cx="0" cy="2" rx="84" ry="13" fill="rgba(40,50,20,.22)" />
      <g className="intro-breathe">
        {/* boots and legs */}
        <rect x="-52" y="-30" width="44" height="30" rx="10" fill="#5b3a1e" />
        <rect x="8" y="-30" width="44" height="30" rx="10" fill="#5b3a1e" />
        <rect x="-48" y="-138" width="40" height="116" rx="8" fill="#3f6fa3" />
        <rect x="8" y="-138" width="40" height="116" rx="8" fill="#3f6fa3" />
        {/* shirt, then the overalls bib on top of it */}
        <rect x="-66" y="-262" width="132" height="148" rx="26" fill="#c9563a" />
        <path d="M-66 -200 H66 M-66 -160 H66" stroke="#b34630" strokeWidth="4" />
        <path d="M-30 -262 V-114 M30 -262 V-114" stroke="#b34630" strokeWidth="4" />
        <rect x="-44" y="-216" width="88" height="104" rx="10" fill="#3f6fa3" />
        <rect x="-38" y="-262" width="14" height="52" rx="5" fill="#3f6fa3" />
        <rect x="24" y="-262" width="14" height="52" rx="5" fill="#3f6fa3" />
        <circle cx="-31" cy="-206" r="5.5" fill="#f4c542" />
        <circle cx="31" cy="-206" r="5.5" fill="#f4c542" />
        <rect x="-22" y="-182" width="44" height="34" rx="6" fill="#345d8c" />
        {/* left arm hangs */}
        <g transform="translate(-66 -244)">
          <path d="M0 0 L-14 94" stroke="#c9563a" strokeWidth="30" strokeLinecap="round" />
          <circle cx="-15" cy="106" r="17" fill="#f1c49b" />
        </g>
        {/* right arm waves hello */}
        <g transform="translate(66 -244)">
          <g className="intro-wave">
            <path d="M0 0 L0 94" stroke="#c9563a" strokeWidth="30" strokeLinecap="round" />
            <circle cx="0" cy="108" r="18" fill="#f1c49b" />
          </g>
        </g>
        {/* head */}
        <rect x="-14" y="-286" width="28" height="30" fill="#e8b08a" />
        <circle cx="-60" cy="-312" r="13" fill="#f1c49b" />
        <circle cx="60" cy="-312" r="13" fill="#f1c49b" />
        <circle cx="0" cy="-312" r="62" fill="#f6cfa9" />
        <circle cx="-36" cy="-304" r="12" fill="#ef9a8a" opacity=".55" />
        <circle cx="36" cy="-304" r="12" fill="#ef9a8a" opacity=".55" />
        {/* big beard, moustache and a wide smile */}
        <path d="M-62 -318 C-70 -250 -36 -208 0 -204 C36 -208 70 -250 62 -318 C46 -292 -46 -292 -62 -318 Z" fill="#6b4a2b" />
        <path d="M-50 -258 C-40 -226 -16 -214 0 -214 C16 -214 40 -226 50 -258" stroke="#7d5a37" strokeWidth="6" fill="none" strokeLinecap="round" />
        <ellipse cx="-20" cy="-290" rx="27" ry="12" fill="#6b4a2b" transform="rotate(10 -20 -290)" />
        <ellipse cx="20" cy="-290" rx="27" ry="12" fill="#6b4a2b" transform="rotate(-10 20 -290)" />
        <path d="M-24 -272 Q0 -240 24 -272 Z" fill="#fff" stroke="#3a2a1a" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M-14 -262 Q0 -250 14 -262" stroke="#e9d9bd" strokeWidth="3" fill="none" />
        <circle cx="0" cy="-306" r="11" fill="#e8b08a" />
        <g className="intro-blink">
          <circle cx="-24" cy="-330" r="7.5" fill="#2b2b24" />
          <circle cx="24" cy="-330" r="7.5" fill="#2b2b24" />
          <circle cx="-22" cy="-332" r="2.4" fill="#fff" />
          <circle cx="26" cy="-332" r="2.4" fill="#fff" />
        </g>
        <path d="M-38 -346 Q-24 -354 -10 -346 M10 -346 Q24 -354 38 -346" stroke="#5a3d22" strokeWidth="5" fill="none" strokeLinecap="round" />
        {/* straw hat */}
        <ellipse cx="0" cy="-366" rx="112" ry="20" fill="#e3b44d" />
        <path d="M-58 -368 C-58 -430 58 -430 58 -368 Z" fill="#f0c861" />
        <rect x="-58" y="-384" width="116" height="14" fill="#b85a33" />
        <ellipse cx="0" cy="-364" rx="112" ry="20" fill="none" stroke="#cf9c34" strokeWidth="3" />
      </g>
    </g>
  )
}

function Wheel({ r, rimR, speed }) {
  const spokes = [0, 60, 120]
  return (
    <g className="intro-spin" style={{ animationDuration: speed }}>
      <circle r={r} fill="#2b2b24" />
      <circle r={r - 9} fill="#3a3a30" />
      <circle r={rimR} fill="#d9962b" />
      {spokes.map((a) => (
        <rect key={a} x={-rimR + 4} y="-3" width={(rimR - 4) * 2} height="6" rx="3" fill="#b87a1d" transform={`rotate(${a})`} />
      ))}
      <circle r="9" fill="#7d5a1d" />
    </g>
  )
}

function Tractor() {
  return (
    <g transform="translate(0 800)">
      <g className="intro-drive">
        <g className="intro-bob">
          {/* cutter header out front */}
          <rect x="262" y="-76" width="96" height="16" rx="5" fill="#6b6b5a" />
          <path d="M338 -96 L458 -78 V-14 H338 Z" fill="#f4c542" />
          <path d="M338 -96 L458 -78 V-66 L338 -80 Z" fill="#e3b030" />
          <rect x="344" y="-20" width="114" height="18" rx="3" fill="#d9d9cc" />
          {Array.from({ length: 11 }, (_, i) => (
            <path key={i} d={`M${348 + i * 10} -2 l5 7 l5 -7 Z`} fill="#b8b8aa" />
          ))}
          {/* reel */}
          <g transform="translate(396 -92)">
            <g className="intro-reel">
              <circle r="9" fill="#6b6b5a" />
              {[0, 90, 180, 270].map((a) => (
                <g key={a} transform={`rotate(${a})`}>
                  <rect x="-3" y="-44" width="6" height="44" fill="#6b6b5a" />
                  <rect x="-9" y="-50" width="18" height="12" rx="4" fill="#f08a3c" />
                </g>
              ))}
            </g>
          </g>
          {/* body */}
          <rect x="108" y="-128" width="162" height="64" rx="12" fill="#c9453a" />
          <rect x="108" y="-128" width="162" height="14" rx="7" fill="#b13a30" />
          <rect x="252" y="-120" width="12" height="52" rx="4" fill="#8f2c25" />
          <rect x="217" y="-176" width="11" height="52" rx="4" fill="#4a4a40" />
          <g transform="translate(222 -182)">
            <g className="intro-smoke" style={{ animationDelay: '0s' }}><circle r="9" fill="#9a9a8c" opacity=".7" /></g>
            <g className="intro-smoke" style={{ animationDelay: '.9s' }}><circle r="9" fill="#9a9a8c" opacity=".7" /></g>
          </g>
          {/* cab with the driver */}
          <rect x="18" y="-226" width="116" height="106" rx="14" fill="#c9453a" />
          <rect x="30" y="-212" width="92" height="76" rx="8" fill="#cfe4f2" stroke="#2b2b24" strokeWidth="4" />
          <circle cx="76" cy="-168" r="17" fill="#f6cfa9" />
          <path d="M60 -158 C60 -140 92 -140 92 -158 C84 -150 68 -150 60 -158 Z" fill="#6b4a2b" />
          <circle cx="70" cy="-172" r="2.6" fill="#2b2b24" />
          <circle cx="83" cy="-172" r="2.6" fill="#2b2b24" />
          <ellipse cx="76" cy="-184" rx="26" ry="5" fill="#e3b44d" />
          <path d="M62 -185 C62 -202 90 -202 90 -185 Z" fill="#f0c861" />
          <rect x="8" y="-240" width="136" height="18" rx="9" fill="#9a4a29" />
          {/* wheels */}
          <g transform="translate(66 -70)"><Wheel r="70" rimR="40" speed="1.1s" /></g>
          <g transform="translate(300 -42)"><Wheel r="42" rimR="24" speed="0.68s" /></g>
          {/* chaff flying off the cutter */}
          {[0, 0.35, 0.7, 1.05].map((d, i) => (
            <g key={d} transform={`translate(${430 + i * 6} -30)`}>
              <g className="intro-chaff" style={{ animationDelay: `${d}s` }}><circle r="4" fill="#e3b44d" /></g>
            </g>
          ))}
        </g>
      </g>
    </g>
  )
}

export default function IntroScene({ className = '' }) {
  const rows = Array.from({ length: ROWS }, (_, i) => i)
  const stubbleWidth = TRACTOR_END + TRACTOR_FRONT - (TRACTOR_START + TRACTOR_FRONT)
  return (
    <svg
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="intro-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfdcee" />
          <stop offset="1" stopColor="#f3eed8" />
        </linearGradient>
        {['A', 'B'].map((k, n) => (
          <pattern key={k} id={`intro-wheat${k}`} width="22" height={ROW_H} patternUnits="userSpaceOnUse" patternTransform={`translate(${n * 11} 0)`}>
            <path d={`M11 ${ROW_H} V24`} stroke="#bf9230" strokeWidth="2.2" />
            <path d="M11 62 q-9 -4 -10 -14 M11 54 q9 -4 10 -14" stroke="#7f9a4a" strokeWidth="2" fill="none" />
            <g fill="#e8b94f" stroke="#bf9230" strokeWidth=".8">
              <ellipse cx="11" cy="12" rx="3.2" ry="7" />
              <ellipse cx="6.5" cy="22" rx="3" ry="6.5" transform="rotate(-24 6.5 22)" />
              <ellipse cx="15.5" cy="22" rx="3" ry="6.5" transform="rotate(24 15.5 22)" />
              <ellipse cx="6.5" cy="33" rx="3" ry="6.5" transform="rotate(-24 6.5 33)" />
              <ellipse cx="15.5" cy="33" rx="3" ry="6.5" transform="rotate(24 15.5 33)" />
            </g>
          </pattern>
        ))}
        <pattern id="intro-stubble" width="14" height="40" patternUnits="userSpaceOnUse">
          <rect width="14" height="40" fill="#d3b97c" />
          <path d="M3 40 v-9 M10 40 v-7" stroke="#a98a4d" strokeWidth="2" strokeLinecap="round" />
          <path d="M0 39 H14" stroke="#bda064" strokeWidth="2" />
        </pattern>
      </defs>

      {/* sky, sun, clouds, hills */}
      <rect width="1600" height="560" fill="url(#intro-sky)" />
      <circle cx="1240" cy="150" r="92" fill="#fbecc0" opacity=".6" />
      <circle cx="1240" cy="150" r="58" fill="#f4c542" />
      <g className="intro-cloud" style={{ animationDuration: '60s' }}>
        <g fill="#fff" opacity=".92"><ellipse cx="300" cy="130" rx="86" ry="26" /><ellipse cx="350" cy="108" rx="52" ry="30" /><ellipse cx="258" cy="112" rx="44" ry="24" /></g>
      </g>
      <g className="intro-cloud" style={{ animationDuration: '80s', animationDelay: '-30s' }}>
        <g fill="#fff" opacity=".88"><ellipse cx="820" cy="200" rx="100" ry="28" /><ellipse cx="880" cy="176" rx="60" ry="32" /></g>
      </g>
      <path d="M0 430 C200 360 380 420 560 380 C760 335 900 420 1100 375 C1300 335 1460 400 1600 360 V600 H0 Z" fill="#bcd39a" />
      <path d="M0 478 C260 424 420 474 700 444 C980 412 1200 474 1600 432 V600 H0 Z" fill="#a8c87e" />

      {/* pasture */}
      <rect y="480" width="1600" height="420" fill="#a0c46a" />
      <House />
      <Tree x="64" y="528" s=".85" />
      <Tree x="520" y="520" s=".7" />
      <Tree x="1120" y="518" s=".62" />
      <Cow x="1150" y="522" s=".9" graze />
      <Cow x="1300" y="532" s="1" flip />
      <Cow x="1450" y="520" s=".84" graze />
      <Fence />

      {/* the standing crop: many rows, swaying */}
      <rect y={ROW_TOP - 8} width="1600" height="300" fill="#b28a52" />
      {rows.map((i) => (
        <g key={i} transform={`translate(0 ${ROW_TOP + i * ROW_STEP + ROW_H})`}>
          <g className="intro-sway" style={{ animationDelay: `${-i * 0.45}s` }}>
            <rect x="-40" y={-ROW_H + 40} width="1700" height="46" fill={i % 2 ? '#d4ac52' : '#dcb458'} />
            <rect x="-40" y={-ROW_H} width="1700" height={ROW_H} fill={`url(#intro-wheat${i % 2 ? 'B' : 'A'})`} />
          </g>
        </g>
      ))}

      {/* the cut field: grows behind the cutter as the tractor passes */}
      <g transform={`translate(${TRACTOR_START + TRACTOR_FRONT} 0)`}>
        <g className="intro-cut">
          <rect x="0" y={ROW_TOP - 14} width={stubbleWidth} height="300" fill="url(#intro-stubble)" />
        </g>
      </g>

      <Tractor />

      {/* foreground grass and the farmer */}
      <path d="M0 842 C260 820 520 850 800 834 C1080 818 1340 848 1600 830 V900 H0 Z" fill="#8fb35f" />
      <path d="M0 872 C300 856 560 882 840 868 C1120 854 1380 878 1600 866 V900 H0 Z" fill="#7da74f" />
      <Farmer />
    </svg>
  )
}
