import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Blocks,
  Clock3,
  Rocket,
  Cloud,
  Brain,
  type LucideIcon,
} from "lucide-react";

const INSTALL_TABS = ["curl", "npm", "pnpm", "bun", "npx"] as const;
type InstallTab = (typeof INSTALL_TABS)[number];

const INSTALL_COMMANDS: Record<InstallTab, string> = {
  curl: "curl -fsSL https://clawstash.io/install.sh | bash",
  npm: "npm install -g clawstash",
  pnpm: "pnpm add -g clawstash",
  bun: "bun add -g clawstash",
  npx: "npx clawstash setup",
};

// ── Terminal scenes ─────────────────────────────────────────────────────────

interface TermLine {
  text: string;
  delay: number;
  color?: "dim" | "green" | "accent" | "yellow" | "white";
}

const SCENE_SETUP: TermLine[] = [
  { text: "$ clawstash setup", delay: 0, color: "white" },
  { text: "", delay: 300 },
  { text: "  clawstash v0.1.0", delay: 500, color: "dim" },
  { text: "", delay: 700 },
  { text: "  [1/5] OpenClaw detected at ~/.openclaw", delay: 900 },
  { text: "        Config: openclaw.json (12KB)", delay: 1100, color: "dim" },
  { text: "        Workspace: 3 skills, 847 files", delay: 1300, color: "dim" },
  { text: "        Sessions: 23 conversations", delay: 1500, color: "dim" },
  { text: "        Memory: 1 SQLite DB (145MB)", delay: 1700, color: "dim" },
  { text: "", delay: 1900 },
  { text: "  [2/5] Storage: Cloudflare R2", delay: 2100 },
  { text: "  [3/5] Bucket \"my-clawstash\" created", delay: 2500 },
  { text: "  [4/5] Passphrase set (saved to keychain)", delay: 2900 },
  { text: "  [5/5] Schedule: every 60 minutes", delay: 3300 },
  { text: "", delay: 3500 },
  { text: "  \u2713 Backup engine ready", delay: 3700, color: "green" },
  { text: "  \u2713 Repository initialized", delay: 4000, color: "green" },
  { text: "  \u2713 First backup complete", delay: 4400, color: "green" },
  { text: "    847 files, 156.3MB uploaded (4.2s)", delay: 4600, color: "dim" },
  { text: "", delay: 4800 },
  { text: "  Done. Your data is safe. Next backup in 60m.", delay: 5000, color: "white" },
];

const SCENE_BACKUP: TermLine[] = [
  { text: "$ clawstash backup", delay: 0, color: "white" },
  { text: "", delay: 300 },
  { text: "  Scanning ~/.openclaw...", delay: 600, color: "dim" },
  { text: "  5 files changed since last snapshot", delay: 1000 },
  { text: "", delay: 1300 },
  { text: "  \u2713 Snapshot a3f7c2d1", delay: 1600, color: "green" },
  { text: "    Data added: 4.2KB (deduplicated)", delay: 1800, color: "dim" },
  { text: "    Duration: 0.8s", delay: 2000, color: "dim" },
  { text: "  \u2713 Retention policy applied", delay: 2400, color: "green" },
];

const SCENE_RESTORE: TermLine[] = [
  { text: "# oh no, disk died. new machine.", delay: 0, color: "dim" },
  { text: "$ npm install -g clawstash", delay: 800, color: "white" },
  { text: "$ clawstash restore", delay: 1600, color: "white" },
  { text: "", delay: 2000 },
  { text: "  No local config found.", delay: 2300 },
  { text: "  Enter R2 credentials + passphrase...", delay: 2600, color: "dim" },
  { text: "", delay: 3000 },
  { text: "  Found 47 snapshots.", delay: 3300 },
  { text: "  Latest: a3f7c2d1 (2 hours ago)", delay: 3600, color: "dim" },
  { text: "", delay: 3900 },
  { text: "  Restoring a3f7c2d1 to ~/.openclaw...", delay: 4200, color: "yellow" },
  { text: "  847 files, 156.3MB... done (12s)", delay: 5000, color: "green" },
  { text: "", delay: 5400 },
  { text: "  \u2713 OpenClaw data restored.", delay: 5700, color: "green" },
  { text: "  Run: openclaw gateway", delay: 6000, color: "dim" },
  { text: "", delay: 6300 },
  { text: "  # or restore selectively:", delay: 6600, color: "dim" },
  { text: "  # clawstash restore --only workspace", delay: 6900, color: "dim" },
  { text: "  # clawstash restore --at \"3 days ago\"", delay: 7200, color: "dim" },
];

const SCENE_STATUS: TermLine[] = [
  { text: "$ clawstash status", delay: 0, color: "white" },
  { text: "", delay: 300 },
  { text: "  OpenClaw dir      ~/.openclaw (847 files)", delay: 600 },
  { text: "  Local size        156.3MB", delay: 800 },
  { text: "  Storage           R2 / my-clawstash", delay: 1000 },
  { text: "", delay: 1200 },
  { text: "  Last backup       12 minutes ago (a3f7c2d1)", delay: 1400, color: "green" },
  { text: "  Total snapshots   47", delay: 1600 },
  { text: "  Repo size         23.4MB", delay: 1800 },
  { text: "", delay: 2000 },
  { text: "  Retention         7 latest, 30 daily, 12 weekly", delay: 2200, color: "dim" },
  { text: "  Auto-backup       every 60 minutes", delay: 2400, color: "green" },
];

type SceneName = "setup" | "backup" | "restore" | "status";

const SCENES: Record<SceneName, { label: string; lines: TermLine[] }> = {
  setup: { label: "setup", lines: SCENE_SETUP },
  backup: { label: "backup", lines: SCENE_BACKUP },
  restore: { label: "restore", lines: SCENE_RESTORE },
  status: { label: "status", lines: SCENE_STATUS },
};

function App() {
  const [installTab, setInstallTab] = useState<InstallTab>("curl");
  const [copied, setCopied] = useState(false);
  const [scene, setScene] = useState<SceneName>("setup");
  const [visibleLines, setVisibleLines] = useState(0);

  const currentLines = SCENES[scene].lines;

  const playScene = useCallback((name: SceneName) => {
    setScene(name);
    setVisibleLines(0);
  }, []);

  useEffect(() => {
    const lines = SCENES[scene].lines;
    const timers = lines.map((l, i) =>
      setTimeout(() => setVisibleLines(i + 1), l.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [scene]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(INSTALL_COMMANDS[installTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const colorClass = (c?: string) => {
    if (c === "dim") return "t-dim";
    if (c === "green") return "t-grn";
    if (c === "accent") return "t-acc";
    if (c === "yellow") return "t-ylw";
    if (c === "white") return "t-wht";
    return "";
  };

  return (
    <>
      <style>{`
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg: #0c0c0e;
  --bg2: #121215;
  --bg3: #18181c;
  --brd: #232329;
  --brd2: #2e2e36;
  --tx: #d4d4dc;
  --tx2: #7a7a88;
  --tx3: #4a4a56;
  --acc: #e05a40;
  --acc2: #ff6b4a;
  --grn: #3dd68c;
  --ylw: #f5c542;
  --mono: "JetBrains Mono", "Fira Code", monospace;
  --body: "DM Sans", system-ui, sans-serif;
  --head: "Space Grotesk", var(--body);
}

html { -webkit-font-smoothing: antialiased; }
body { font-family: var(--body); background: var(--bg); color: var(--tx); line-height: 1.6; overflow-x: hidden; }
a { color: var(--acc); text-decoration: none; }
a:hover { color: var(--acc2); }

/* noise */
.nz { position: fixed; inset: 0; pointer-events: none; z-index: 9999; opacity: 0.02;
  background: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px;
}

/* nav */
nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; padding: 1rem 2rem;
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(12,12,14,0.88); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--brd);
}
.n-logo { display: flex; align-items: center; }
.n-logo img { display: block; }
.n-links { display: flex; gap: 1.5rem; align-items: center; list-style: none; }
.n-links a { font-size: 0.82rem; color: var(--tx2); transition: color 0.15s; }
.n-links a:hover { color: var(--tx); }
.n-gh { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.75rem;
  border: 1px solid var(--brd); border-radius: 6px; font-size: 0.78rem; color: var(--tx2); transition: all 0.15s; }
.n-gh:hover { border-color: var(--brd2); color: var(--tx); }

/* hero */
.hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 7rem 2rem 3rem; position: relative; }
.hero::before { content: ""; position: absolute; top: -15%; left: 50%; transform: translateX(-50%);
  width: 700px; height: 700px;
  background: radial-gradient(circle, rgba(224,90,64,0.05) 0%, transparent 65%);
  pointer-events: none; }

.pill { display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.3rem 0.85rem; border: 1px solid var(--brd); border-radius: 100px;
  font-family: var(--mono); font-size: 0.72rem; color: var(--tx2);
  margin-bottom: 1.75rem; animation: fd 0.5s ease both; }
.pill-dot { width: 5px; height: 5px; background: var(--grn); border-radius: 50%; animation: pls 2s infinite; }

h1 { font-family: var(--head); font-size: clamp(2.5rem, 6.5vw, 5rem); font-weight: 700;
  line-height: 1.08; letter-spacing: -0.04em; text-align: center; max-width: 720px;
  animation: fd 0.5s ease 0.08s both; }
h1 em { font-style: normal; color: var(--acc); }

.sub { margin-top: 1.25rem; font-size: 1.05rem; color: var(--tx2); text-align: center;
  max-width: 480px; line-height: 1.7; animation: fd 0.5s ease 0.16s both; }

.acts { margin-top: 2rem; display: flex; gap: 0.75rem; animation: fd 0.5s ease 0.24s both; }

.btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.65rem 1.4rem;
  font-family: var(--mono); font-size: 0.82rem; font-weight: 500;
  border-radius: 7px; cursor: pointer; transition: all 0.15s; text-decoration: none; border: none; }
.btn-r { background: var(--acc); color: #fff; }
.btn-r:hover { background: var(--acc2); color: #fff; transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(224,90,64,0.2); }
.btn-o { background: transparent; color: var(--tx2); border: 1px solid var(--brd); }
.btn-o:hover { border-color: var(--brd2); color: var(--tx); }

/* terminal */
.tw { margin-top: 3rem; width: 100%; max-width: 660px; animation: fd 0.6s ease 0.4s both; }
.term { background: var(--bg2); border: 1px solid var(--brd); border-radius: 10px;
  overflow: hidden; box-shadow: 0 16px 48px rgba(0,0,0,0.35); }
.term-bar { display: flex; align-items: center; gap: 6px; padding: 0.7rem 1rem;
  background: var(--bg3); border-bottom: 1px solid var(--brd); }
.term-d { width: 10px; height: 10px; border-radius: 50%; }

.term-tabs { display: flex; gap: 0; margin-left: auto; }
.term-tab { background: none; border: none; font-family: var(--mono); font-size: 0.68rem;
  padding: 0.25rem 0.6rem; color: var(--tx3); cursor: pointer; border-radius: 4px;
  transition: all 0.15s; }
.term-tab:hover { color: var(--tx2); }
.term-tab[data-on="true"] { color: var(--acc); background: rgba(224,90,64,0.08); }

.term-body { padding: 1rem 1.25rem; font-family: var(--mono); font-size: 0.76rem;
  line-height: 1.75; min-height: 320px; }

.tl { opacity: 0; animation: ti 0.25s ease forwards; white-space: pre; }
.t-dim { color: var(--tx3); }
.t-grn { color: var(--grn); }
.t-acc { color: var(--acc); }
.t-ylw { color: var(--ylw); }
.t-wht { color: var(--tx); }
.cur { display: inline-block; width: 7px; height: 14px; background: var(--acc);
  margin-left: 2px; vertical-align: middle; animation: bk 1s step-end infinite; }

/* install */
.inst { padding: 5rem 2rem; display: flex; flex-direction: column; align-items: center; }
h2 { font-family: var(--head); font-size: clamp(1.6rem, 3.5vw, 2.4rem); font-weight: 700;
  letter-spacing: -0.03em; text-align: center; margin-bottom: 0.5rem; }
.ssub { color: var(--tx2); text-align: center; max-width: 440px; margin-bottom: 2.5rem; font-size: 0.95rem; }

.icard { width: 100%; max-width: 560px; background: var(--bg2); border: 1px solid var(--brd);
  border-radius: 10px; overflow: hidden; }
.itabs { display: flex; border-bottom: 1px solid var(--brd); }
.itab { flex: 1; padding: 0.6rem; text-align: center; font-family: var(--mono);
  font-size: 0.75rem; color: var(--tx3); background: none; border: none; cursor: pointer;
  transition: all 0.15s; border-bottom: 2px solid transparent; }
.itab:hover { color: var(--tx2); }
.itab[data-on="true"] { color: var(--acc); border-bottom-color: var(--acc); }
.icmd { display: flex; align-items: center; justify-content: space-between;
  padding: 1.1rem 1.25rem; font-family: var(--mono); font-size: 0.82rem; }
.icmd code { color: var(--tx); user-select: all; }
.cpb { background: none; border: 1px solid var(--brd); color: var(--tx3);
  padding: 0.25rem 0.6rem; border-radius: 4px; font-family: var(--mono);
  font-size: 0.68rem; cursor: pointer; transition: all 0.15s; }
.cpb:hover { border-color: var(--brd2); color: var(--tx2); }

.plats { margin-top: 1.25rem; display: flex; gap: 1.75rem; flex-wrap: wrap; justify-content: center; }
.plat { font-size: 0.78rem; color: var(--tx3); display: flex; align-items: center; gap: 0.45rem; }
.plat svg { width: 15px; height: 15px; fill: var(--tx3); flex-shrink: 0; }

/* features */
.feats { padding: 3rem 2rem 5rem; display: flex; flex-direction: column; align-items: center; }
.fg { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1px; width: 100%; max-width: 860px; background: var(--brd);
  border: 1px solid var(--brd); border-radius: 10px; overflow: hidden; }
.fc { background: var(--bg2); padding: 1.75rem; position: relative; transition: all 0.25s ease;
  overflow: hidden; }
.fc::before { content: ""; position: absolute; inset: 0; opacity: 0;
  background: radial-gradient(ellipse at 30% 0%, rgba(224,90,64,0.06) 0%, transparent 70%);
  transition: opacity 0.3s ease; }
.fc:hover { background: var(--bg3); }
.fc:hover::before { opacity: 1; }
.fc:hover .fc-icon { border-color: var(--acc); box-shadow: 0 0 16px rgba(224,90,64,0.15); }
.fc:hover .fc-icon svg { color: var(--acc2); }
.fc-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
  border-radius: 9px; border: 1px solid var(--brd2); background: var(--bg3);
  margin-bottom: 0.85rem; transition: all 0.3s ease; }
.fc-icon svg { width: 18px; height: 18px; color: var(--tx2); transition: color 0.3s ease;
  stroke-width: 1.75; }
.fc-t { font-family: var(--head); font-weight: 600; font-size: 0.95rem; margin-bottom: 0.4rem;
  position: relative; }
.fc-d { font-size: 0.82rem; color: var(--tx2); line-height: 1.6; position: relative; }

/* footer */
footer { padding: 2.5rem 2rem; border-top: 1px solid var(--brd); text-align: center; }
.ftr { max-width: 600px; margin: 0 auto; font-size: 0.78rem; color: var(--tx3); line-height: 1.8; }
.ftr a { color: var(--tx2); transition: color 0.15s; }
.ftr a:hover { color: var(--tx); }
.fl { display: flex; gap: 1.25rem; justify-content: center; margin-bottom: 0.75rem; }

@keyframes fd { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ti { from { opacity: 0; transform: translateX(-3px); } to { opacity: 1; transform: translateX(0); } }
@keyframes bk { 50% { opacity: 0; } }
@keyframes pls { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

@media (max-width: 640px) {
  nav { padding: 0.75rem 1rem; }
  .n-links { display: none; }
  .hero { padding: 5.5rem 1.25rem 2.5rem; }
  .acts { flex-direction: column; width: 100%; }
  .acts .btn { width: 100%; justify-content: center; }
  .tw { max-width: 100%; }
  .fg { grid-template-columns: 1fr; }
  .term-tabs { display: none; }
}
      `}</style>

      <div className="nz" />

      {/* nav */}
      <nav>
        <a href="/" className="n-logo">
          <img src="/logo.png" alt="Clawstash" style={{ height: "28px", width: "auto" }} />
        </a>
        <ul className="n-links">
          <li><a href="#install">Install</a></li>
          <li><a href="#features">Why</a></li>
          <li>
            <a href="https://github.com/alemicali/clawstash" target="_blank" rel="noopener" className="n-gh">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              Star on GitHub
            </a>
          </li>
        </ul>
      </nav>

      {/* hero */}
      <section className="hero">
        <div className="pill">
          <span className="pill-dot" />
          Secure your lobster
        </div>

        <h1>
          Your OpenClaw data<br />
          deserves a <em>backup</em>
        </h1>

        <p className="sub">
          Encrypted incremental backups for ~/.openclaw.
          Two minutes to set up, then it runs by itself.
        </p>

        <div className="acts">
          <a href="#install" className="btn btn-r">Install</a>
          <a href="https://github.com/alemicali/clawstash" target="_blank" rel="noopener" className="btn btn-o">
            Source code
          </a>
        </div>

        {/* interactive terminal */}
        <div className="tw">
          <div className="term">
            <div className="term-bar">
              <div className="term-d" style={{ background: "#ff5f57" }} />
              <div className="term-d" style={{ background: "#febc2e" }} />
              <div className="term-d" style={{ background: "#28c840" }} />
              <div className="term-tabs">
                {(Object.keys(SCENES) as SceneName[]).map((s) => (
                  <button
                    key={s}
                    className="term-tab"
                    data-on={s === scene}
                    onClick={() => playScene(s)}
                  >
                    {SCENES[s].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="term-body">
              {currentLines.slice(0, visibleLines).map((line, i) => (
                <div key={`${scene}-${i}`} className="tl">
                  {line.text === "" ? (
                    "\u00A0"
                  ) : (
                    <span className={colorClass(line.color)}>
                      {line.text}
                    </span>
                  )}
                  {i === visibleLines - 1 && i === 0 && line.text.startsWith("$") && (
                    <span className="cur" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* install */}
      <section className="inst" id="install">
        <h2>Get it</h2>
        <p className="ssub">
          Requires Node 18+. Then run <code style={{ fontFamily: "var(--mono)", color: "var(--tx)" }}>clawstash setup</code>.
        </p>
        <div className="icard">
          <div className="itabs">
            {INSTALL_TABS.map((tab) => (
              <button key={tab} className="itab" data-on={tab === installTab}
                onClick={() => { setInstallTab(tab); setCopied(false); }}>
                {tab}
              </button>
            ))}
          </div>
          <div className="icmd">
            <code>$ {INSTALL_COMMANDS[installTab]}</code>
            <button className="cpb" onClick={handleCopy}>
              {copied ? "copied!" : "copy"}
            </button>
          </div>
        </div>
        <div className="plats">
          <span className="plat">
            <svg viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11"/></svg>
            macOS
          </span>
          <span className="plat">
            <svg viewBox="0 0 24 24"><path d="M12.504 0c-.155 0-.311.002-.465.014-.958.086-1.86.404-2.633.924-.65.48-1.093 1.092-1.27 1.744-.141.527-.155 1.072-.051 1.592.166.827.566 1.553 1.088 2.063-.066.095-.124.193-.179.293-.144.257-.247.533-.294.834-.064.317-.067.66-.018.993.079.527.297 1.036.609 1.474.053.072.108.142.165.21a.86.86 0 0 0-.025.025c-.163.171-.288.374-.371.607-.093.247-.14.504-.134.777.006.29.067.58.179.85.118.279.279.523.478.735.142.147.3.271.473.375.027.015.054.028.081.043-.008.018-.013.035-.021.053-.065.143-.098.3-.095.46.004.163.043.314.113.45.088.171.212.31.356.424a1.2 1.2 0 0 0 .326.19 1.16 1.16 0 0 0-.156.062c-.25.117-.441.307-.566.56-.072.145-.106.297-.1.465.005.15.04.292.096.412.099.226.254.408.448.558.158.119.323.21.498.271.024.01.048.022.073.03-.054.078-.09.163-.11.254-.036.157-.02.319.038.47.073.188.203.33.38.425.183.098.38.159.583.185a3.19 3.19 0 0 0 .75.011c.174-.016.35-.043.524-.08a6.91 6.91 0 0 0 1.086-.327c.259-.1.49-.214.702-.342a1.89 1.89 0 0 0 .15-.098c.049.01.098.02.148.029.226.043.46.07.706.073.266.002.546-.028.82-.1.351-.094.702-.248 1.01-.474.216-.157.411-.349.59-.591a1.6 1.6 0 0 0 .105-.148c.162.042.338.059.522.049.291-.017.59-.098.862-.256.274-.157.517-.38.71-.665.134-.198.231-.41.295-.633.048-.167.068-.339.059-.516-.008-.152-.037-.297-.087-.44-.071-.197-.179-.376-.323-.536a1.63 1.63 0 0 0-.23-.215c.004-.012.012-.025.016-.037.103-.293.102-.595.017-.86-.065-.2-.169-.383-.312-.535-.142-.152-.3-.271-.473-.373.009-.024.022-.046.03-.07.124-.391.09-.788-.069-1.09-.112-.21-.27-.389-.46-.52.044-.125.072-.258.083-.399.015-.175.004-.353-.032-.528-.047-.234-.133-.435-.24-.621-.111-.182-.247-.332-.394-.458a3.11 3.11 0 0 0-.305-.219c.092-.284.145-.582.153-.883.008-.378-.048-.76-.181-1.098-.159-.406-.384-.749-.67-1.044a4.73 4.73 0 0 0-1.2-.895A5.97 5.97 0 0 0 14.108.21a6.25 6.25 0 0 0-1.604-.21z"/></svg>
            Linux
          </span>
          <span className="plat">
            <svg viewBox="0 0 24 24"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
            Windows (WSL2)
          </span>
        </div>
      </section>

      {/* features */}
      <section className="feats" id="features">
        <h2>Why clawstash</h2>
        <p className="ssub">
          OpenClaw can run your whole life. If you lose ~/.openclaw, you lose everything.
          Don't.
        </p>
        <div className="fg">
          {([
            {
              icon: ShieldCheck, t: "Encrypted at rest",
              d: "AES-256 encryption. Your storage provider sees only opaque blobs. Passphrase never leaves your machine.",
            },
            {
              icon: Blocks, t: "Block-level dedup",
              d: "Content-defined chunking. Change 1 byte in a 200MB SQLite? Upload ~4KB. Not the whole file.",
            },
            {
              icon: Clock3, t: "Point-in-time restore",
              d: "Every backup is a snapshot. Restore from any point. Go back 3 days, or pick a timestamp.",
            },
            {
              icon: Rocket, t: "Set up once, forget",
              d: "Background daemon via launchd/systemd. Retention policies prune automatically. You do nothing.",
            },
            {
              icon: Cloud, t: "Any S3 storage",
              d: "R2, S3, Backblaze B2, MinIO. Use what you have. R2 free tier is plenty for most setups.",
            },
            {
              icon: Brain, t: "Knows OpenClaw",
              d: "Understands config, credentials, workspace, sessions, memory. Selective restore per category.",
            },
          ] as { icon: LucideIcon; t: string; d: string }[]).map((f) => (
            <div key={f.t} className="fc">
              <div className="fc-icon"><f.icon /></div>
              <div className="fc-t">{f.t}</div>
              <div className="fc-d">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer>
        <div className="ftr">
          <div className="fl">
            <a href="https://github.com/alemicali/clawstash" target="_blank" rel="noopener">GitHub</a>
            <a href="https://github.com/alemicali/clawstash/issues" target="_blank" rel="noopener">Issues</a>
            <a href="https://openclaw.ai" target="_blank" rel="noopener">OpenClaw</a>
          </div>
          <p>MIT license {"\u00B7"} community project {"\u00B7"} not affiliated with OpenClaw</p>
          <p style={{ marginTop: "0.5rem" }}>Development sponsored by <a href="https://lumea.dev" target="_blank" rel="noopener">Lumea</a></p>
        </div>
      </footer>
    </>
  );
}

export default App;
