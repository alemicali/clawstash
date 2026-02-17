import { describe, it, expect } from "vitest";
import { categorizeFile } from "../src/core/openclaw.js";

describe("categorizeFile", () => {
  it("categorizes config files", () => {
    expect(categorizeFile("openclaw.json")).toBe("config");
    expect(categorizeFile("openclaw.json5")).toBe("config");
  });

  it("categorizes secrets", () => {
    expect(categorizeFile(".env")).toBe("secrets");
    expect(categorizeFile("credentials/whatsapp.json")).toBe("secrets");
    expect(categorizeFile("credentials/store/paired.json")).toBe("secrets");
    expect(categorizeFile("auth/token.json")).toBe("secrets");
  });

  it("categorizes workspace files", () => {
    expect(categorizeFile("workspace/IDENTITY.md")).toBe("workspace");
    expect(categorizeFile("workspace/MEMORY.md")).toBe("workspace");
    expect(categorizeFile("workspace/memory/2026-02-17.md")).toBe("workspace");
    expect(categorizeFile("workspace/canvas/index.html")).toBe("workspace");
    expect(categorizeFile("workspace-home/AGENTS.md")).toBe("workspace");
  });

  it("categorizes managed skills", () => {
    expect(categorizeFile("skills/web-search/SKILL.md")).toBe("skills");
    expect(categorizeFile("skills/calendar/config.json")).toBe("skills");
  });

  it("categorizes workspace skills as workspace", () => {
    expect(categorizeFile("workspace/skills/my-skill/SKILL.md")).toBe("workspace");
  });

  it("categorizes session files", () => {
    expect(categorizeFile("agents/main/sessions/abc123.jsonl")).toBe("sessions");
    expect(categorizeFile("agents/work/sessions/def456.jsonl")).toBe("sessions");
    expect(categorizeFile("agents/main/sessions/sessions.json")).toBe("sessions");
  });

  it("categorizes memory databases", () => {
    expect(categorizeFile("memory/main.sqlite")).toBe("memory");
  });

  it("categorizes per-agent config", () => {
    expect(categorizeFile("agents/main/agent/models.json")).toBe("agents");
  });

  it("categorizes settings", () => {
    expect(categorizeFile("settings/tts.json")).toBe("settings");
  });

  it("categorizes unknown files as other", () => {
    expect(categorizeFile("some-random-file.txt")).toBe("other");
    expect(categorizeFile("data/something.json")).toBe("other");
    expect(categorizeFile("tools/some-binary")).toBe("other");
  });
});
