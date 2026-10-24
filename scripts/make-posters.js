// Generates the demo poster art (SVG, 1200x600) for the sample events: `node scripts/make-posters.js`
import { writeFileSync, mkdirSync } from "node:fs";

const INK = "#14120F", PAPER = "#FBF6EC";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const S = `stroke="${INK}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"`;
const motifs = {
  code: (a) => `<text x="960" y="330" font-size="190" font-family="Courier New,monospace" font-weight="900" text-anchor="middle" fill="${a}" ${S}>{ }</text><path d="M880 390h160" ${S}/>`,
  mic: (a) => `<rect x="925" y="140" width="70" height="140" rx="35" fill="${a}" ${S}/><path d="M895 240q0 90 65 90t65-90M960 330v60M920 392h80M850 210q-22 30 0 60M1070 210q22 30 0 60" fill="none" ${S}/>`,
  doc: (a) => `<rect x="870" y="120" width="170" height="220" fill="#fff" ${S}/><path d="M900 170h110M900 215h110M900 260h70" ${S}/><circle cx="1030" cy="340" r="48" fill="${a}" ${S}/><path d="M1008 340l16 16 28-32" fill="none" ${S}/>`,
  design: (a) => `<circle cx="915" cy="210" r="72" fill="${a}" ${S}/><rect x="950" y="230" width="130" height="130" fill="#fff" ${S}/><path d="M890 400l55-100 55 100z" fill="${a}" ${S}/>`,
  bars: (a) => `<rect x="870" y="290" width="56" height="100" fill="#fff" ${S}/><rect x="945" y="230" width="56" height="160" fill="${a}" ${S}/><rect x="1020" y="160" width="56" height="230" fill="#fff" ${S}/><path d="M870 250l90-70 40 30 80-80" fill="none" ${S}/>`,
  dice: (a) => `<rect x="850" y="130" width="200" height="200" rx="30" fill="#fff" ${S}/><g fill="${INK}"><circle cx="895" cy="175" r="16"/><circle cx="1005" cy="175" r="16"/><circle cx="950" cy="230" r="16"/><circle cx="895" cy="285" r="16"/><circle cx="1005" cy="285" r="16"/></g><rect x="1010" y="300" width="100" height="100" rx="20" fill="${a}" ${S}/><circle cx="1045" cy="335" r="11" fill="${INK}"/><circle cx="1075" cy="365" r="11" fill="${INK}"/>`,
  cloud: (a) => `<path d="M860 350a52 52 0 0 1 10-102a85 85 0 0 1 160 10a48 48 0 0 1-8 92z" fill="${a}" ${S}/><text x="950" y="330" font-size="84" font-family="Courier New,monospace" font-weight="900" text-anchor="middle" fill="${PAPER}" ${S}>&lt;/&gt;</text>`,
  lock: (a) => `<rect x="880" y="230" width="160" height="150" rx="14" fill="${a}" ${S}/><path d="M910 230v-40a50 50 0 0 1 100 0v40" fill="none" ${S}/><circle cx="960" cy="300" r="16" fill="#fff" ${S}/><path d="M960 316v34" ${S}/>`,
  chain: (a) => `<rect x="850" y="200" width="140" height="84" rx="42" fill="none" ${S}/><rect x="930" y="200" width="140" height="84" rx="42" fill="${a}" ${S}/><path d="M880 340h180M880 385h110" ${S}/>`,
  chip: (a) => `<rect x="880" y="160" width="160" height="160" rx="16" fill="${a}" ${S}/><path d="M920 120v40M960 120v40M1000 120v40M920 320v40M960 320v40M1000 320v40M840 200h40M840 240h40M840 280h40M1040 200h40M1040 240h40M1040 280h40" ${S}/><text x="960" y="262" font-size="64" font-family="Arial,sans-serif" font-weight="900" text-anchor="middle" fill="${PAPER}" ${S}>AI</text>`,
  globe: (a) => `<circle cx="960" cy="260" r="135" fill="${a}" ${S}/><ellipse cx="960" cy="260" rx="60" ry="135" fill="none" ${S}/><path d="M825 260h270M960 125v270M845 190h230M845 330h230" fill="none" ${S}/>`,
};
const P = [
  { bg: "#FFB627", a: "#F4452E", k: "GDG BHOPAL PRESENTS", l: ["BUILD NIGHT", "SHIP IT"], tag: "HACKATHON", sub: "4 hours \u00b7 1 idea \u00b7 live demo", m: "code" },
  { bg: "#FF9FC2", a: "#FFB627", k: "KAHANI COLLECTIVE", l: ["OPEN MIC", "& CHAI"], tag: "MEETUP", sub: "Poetry \u00b7 music \u00b7 stories", m: "mic" },
  { bg: "#8FD6B0", a: "#2FA37A", k: "PLACEMENT CELL", l: ["RESUME", "CLINIC"], tag: "WORKSHOP", sub: "1-on-1 reviews for freshers", m: "doc" },
  { bg: "#C4B0FF", a: "#7A5CFF", k: "PIXEL PALS", l: ["UI DESIGN", "JAM"], tag: "WORKSHOP", sub: "Redesign a real app in 3 hours", m: "design" },
  { bg: "#8EC9F0", a: "#2F8FD6", k: "INCUBATE BPL", l: ["STARTUP", "PITCH SUMMIT"], tag: "SUMMIT", sub: "5 founders \u00b7 5 minutes each", m: "bars" },
  { bg: "#FFC9A0", a: "#F4452E", k: "ROLL & RALLY", l: ["BOARD GAMES", "MEETUP"], tag: "MEETUP", sub: "Beginners welcome", m: "dice" },
  { bg: "#C9E86B", a: "#2FA37A", k: "CLOUDNEST", l: ["BHOPAL DEV", "CONFERENCE"], tag: "CONFERENCE", sub: "Talks \u00b7 hiring \u00b7 networking", m: "cloud" },
  { bg: "#FF8A73", a: "#FFB627", k: "MANIT CODING CLUB", l: ["HACK FOR", "GOOD 24H"], tag: "HACKATHON", sub: "24 hours to help your city", m: "globe" },
  { bg: "#A9E5F0", a: "#7A5CFF", k: "SECOPS CLUB", l: ["CYBERSHIELD", "CTF"], tag: "HACKATHON", sub: "Capture the flag \u00b7 online", m: "lock" },
  { bg: "#FDE68A", a: "#F4452E", k: "BUIDL GUILD", l: ["WEB3 BUILD", "WEEKEND"], tag: "HACKATHON", sub: "48 hours \u00b7 online \u00b7 $5,000 prizes", m: "chain" },
  { bg: "#B9E6D6", a: "#2F8FD6", k: "CHAINWORKS", l: ["BENGALURU", "BLOCKCHAIN"], tag: "SUMMIT", sub: "Founders \u00b7 builders \u00b7 investors", m: "chain" },
  { bg: "#FFB3A7", a: "#2FA37A", k: "ORCHID LABS", l: ["SINGAPORE", "AI WEEK"], tag: "CONFERENCE", sub: "In person and online", m: "chip" },
  { bg: "#C4E3FF", a: "#F4452E", k: "DTU SECURITY CELL", l: ["DELHI CYBER", "WORKSHOP"], tag: "WORKSHOP", sub: "Hands-on ethical hacking", m: "lock" },
];
const F = 'font-family="Arial,Helvetica,sans-serif"', G = 'font-family="Georgia,serif"';
mkdirSync("posters", { recursive: true });
P.forEach((p, i) => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600"><rect width="1200" height="600" fill="${p.bg}"/>
<path d="M0 150H1200M0 300H1200M0 450H1200M200 0V600M400 0V600M600 0V600M800 0V600M1000 0V600" stroke="${INK}" stroke-opacity=".08" stroke-width="2"/>
<rect x="792" y="92" width="360" height="360" fill="${INK}"/><rect x="780" y="80" width="360" height="360" fill="${PAPER}" ${S}/>${motifs[p.m](p.a)}
<text x="64" y="104" ${F} font-size="26" font-weight="700" letter-spacing="3" fill="${INK}">${esc(p.k)}</text>
<text x="64" y="210" ${G} font-size="76" font-weight="900" fill="${INK}">${esc(p.l[0])}</text><text x="64" y="300" ${G} font-size="76" font-weight="900" fill="${INK}">${esc(p.l[1])}</text>
<text x="64" y="378" ${F} font-size="30" fill="${INK}">${esc(p.sub)}</text>
<rect x="64" y="410" width="270" height="58" fill="${INK}"/><text x="199" y="450" ${F} font-size="28" font-weight="700" letter-spacing="2" text-anchor="middle" fill="${PAPER}">${p.tag}</text>
<rect x="24" y="520" width="1152" height="56" fill="${INK}"/><text x="600" y="557" ${F} font-size="24" font-weight="700" letter-spacing="5" text-anchor="middle" fill="${PAPER}">REGISTER ON NUKKAD \u00b7 FREE ENTRY</text>
<rect x="24" y="24" width="1152" height="552" fill="none" ${S}/></svg>`;
  writeFileSync(`posters/${i + 1}.svg`, svg);
});
console.log(`${P.length} posters written`);
