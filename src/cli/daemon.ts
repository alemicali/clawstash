import { writeFile, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { log } from "../utils/logger.js";
import { getServiceManager, getClawstashDir } from "../utils/platform.js";
import { ensureDir, pathExists } from "../utils/fs.js";
import { requireConfig } from "../core/config.js";

const execFileAsync = promisify(execFile);

const LAUNCHD_LABEL = "dev.clawstash.backup";
const SYSTEMD_SERVICE = "clawstash-backup";

/**
 * Resolve the absolute path to the clawstash binary.
 * Prefers the globally installed `clawstash` in PATH (survives nvm switches),
 * falls back to process.argv[1] (the current script).
 */
async function resolveClawstashBin(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("which", ["clawstash"]);
    const bin = stdout.trim();
    if (bin) return bin;
  } catch {
    // not in PATH
  }
  // Fallback: use the current script path
  return process.argv[1] ?? "clawstash";
}

function getLaunchdPlistPath(): string {
  const home = process.env.HOME ?? "";
  return join(home, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

function getSystemdServicePath(): string {
  const home = process.env.HOME ?? "";
  return join(home, ".config", "systemd", "user", `${SYSTEMD_SERVICE}.service`);
}

function getSystemdTimerPath(): string {
  const home = process.env.HOME ?? "";
  return join(home, ".config", "systemd", "user", `${SYSTEMD_SERVICE}.timer`);
}

function buildLaunchdPlist(intervalMinutes: number, clawstashBin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${clawstashBin}</string>
    <string>backup</string>
  </array>
  <key>StartInterval</key>
  <integer>${intervalMinutes * 60}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${getClawstashDir()}/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>${getClawstashDir()}/daemon.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
</dict>
</plist>`;
}

function buildSystemdService(clawstashBin: string): string {
  return `[Unit]
Description=clawstash backup for OpenClaw
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${clawstashBin} backup
Environment=PATH=/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target`;
}

function buildSystemdTimer(intervalMinutes: number): string {
  return `[Unit]
Description=clawstash backup timer

[Timer]
OnBootSec=5min
OnUnitActiveSec=${intervalMinutes}min
Persistent=true

[Install]
WantedBy=timers.target`;
}

export async function daemonInstall(): Promise<void> {
  const config = await requireConfig();
  const sm = getServiceManager();
  const interval = config.daemon.intervalMinutes;
  const clawstashBin = await resolveClawstashBin();

  log.debug(`Daemon will use binary: ${clawstashBin}`);

  if (sm === "launchd") {
    const plistPath = getLaunchdPlistPath();
    await ensureDir(join(plistPath, ".."));
    await writeFile(plistPath, buildLaunchdPlist(interval, clawstashBin), "utf-8");

    try {
      await execFileAsync("launchctl", ["unload", plistPath]).catch(() => {});
      await execFileAsync("launchctl", ["load", plistPath]);
      log.success(`Installed launchd service (every ${interval} min)`);
      log.info(`Plist: ${plistPath}`);
    } catch (err) {
      log.error(`Failed to load launchd plist: ${err}`);
    }
  } else if (sm === "systemd") {
    const servicePath = getSystemdServicePath();
    const timerPath = getSystemdTimerPath();
    await ensureDir(join(servicePath, ".."));

    await writeFile(servicePath, buildSystemdService(clawstashBin), "utf-8");
    await writeFile(timerPath, buildSystemdTimer(interval), "utf-8");

    try {
      await execFileAsync("systemctl", ["--user", "daemon-reload"]);
      await execFileAsync("systemctl", ["--user", "enable", "--now", `${SYSTEMD_SERVICE}.timer`]);
      log.success(`Installed systemd timer (every ${interval} min)`);
      log.info(`Service: ${servicePath}`);
      log.info(`Timer: ${timerPath}`);
    } catch (err) {
      log.error(`Failed to enable systemd timer: ${err}`);
    }
  } else {
    log.error("Unsupported platform. Only macOS (launchd) and Linux (systemd) are supported.");
  }
}

export async function daemonUninstall(): Promise<void> {
  const sm = getServiceManager();

  if (sm === "launchd") {
    const plistPath = getLaunchdPlistPath();
    try {
      await execFileAsync("launchctl", ["unload", plistPath]).catch(() => {});
      await unlink(plistPath).catch(() => {});
      log.success("Removed launchd service");
    } catch {
      log.warn("Service may not have been installed");
    }
  } else if (sm === "systemd") {
    try {
      await execFileAsync("systemctl", ["--user", "disable", "--now", `${SYSTEMD_SERVICE}.timer`]).catch(() => {});
      await unlink(getSystemdServicePath()).catch(() => {});
      await unlink(getSystemdTimerPath()).catch(() => {});
      await execFileAsync("systemctl", ["--user", "daemon-reload"]);
      log.success("Removed systemd timer and service");
    } catch {
      log.warn("Service may not have been installed");
    }
  } else {
    log.error("Unsupported platform.");
  }
}

export async function daemonStatus(): Promise<void> {
  const sm = getServiceManager();

  if (sm === "launchd") {
    const plistPath = getLaunchdPlistPath();
    if (!(await pathExists(plistPath))) {
      log.kv("Daemon", "Not installed", "warn");
      return;
    }
    try {
      const { stdout } = await execFileAsync("launchctl", ["list", LAUNCHD_LABEL]);
      log.kv("Daemon", "Installed (launchd)", "ok");
      log.info(stdout.trim());
    } catch {
      log.kv("Daemon", "Installed but not running", "warn");
    }
  } else if (sm === "systemd") {
    try {
      const { stdout } = await execFileAsync("systemctl", [
        "--user",
        "status",
        `${SYSTEMD_SERVICE}.timer`,
        "--no-pager",
      ]);
      log.kv("Daemon", "Installed (systemd)", "ok");
      log.info(stdout.trim());
    } catch {
      log.kv("Daemon", "Not installed or inactive", "warn");
    }
  } else {
    log.error("Unsupported platform.");
  }
}
