import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log, setLogLevel } from "../src/utils/logger.js";

describe("logger", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Reset to default
    setLogLevel("info");
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  describe("log level filtering", () => {
    it("shows info messages at info level", () => {
      setLogLevel("info");
      log.info("test message");
      expect(errorSpy).toHaveBeenCalled();
    });

    it("hides debug messages at info level", () => {
      setLogLevel("info");
      log.debug("debug message");
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("shows debug messages at debug level", () => {
      setLogLevel("debug");
      log.debug("debug message");
      expect(errorSpy).toHaveBeenCalled();
    });

    it("shows warn messages at info level", () => {
      setLogLevel("info");
      log.warn("warning");
      expect(errorSpy).toHaveBeenCalled();
    });

    it("shows error messages at warn level", () => {
      setLogLevel("warn");
      log.error("error msg");
      expect(errorSpy).toHaveBeenCalled();
    });

    it("hides info messages at warn level", () => {
      setLogLevel("warn");
      log.info("should not show");
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("hides info and warn messages at error level", () => {
      setLogLevel("error");
      log.info("hidden");
      log.warn("hidden");
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("shows error messages at error level", () => {
      setLogLevel("error");
      log.error("visible");
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe("log methods", () => {
    it("success uses console.error", () => {
      log.success("done!");
      expect(errorSpy).toHaveBeenCalled();
    });

    it("raw uses console.log", () => {
      log.raw("raw output");
      expect(logSpy).toHaveBeenCalledWith("raw output");
    });

    it("blank outputs empty line to stderr", () => {
      log.blank();
      expect(errorSpy).toHaveBeenCalledWith("");
    });

    it("header outputs bold text", () => {
      log.header("My Section");
      expect(errorSpy).toHaveBeenCalled();
    });

    it("kv outputs key-value pair", () => {
      log.kv("Key", "Value");
      expect(errorSpy).toHaveBeenCalled();
    });

    it("kv accepts status parameter", () => {
      log.kv("Status", "OK", "ok");
      log.kv("Status", "Warning", "warn");
      log.kv("Status", "Error", "error");
      expect(errorSpy).toHaveBeenCalledTimes(3);
    });
  });
});
