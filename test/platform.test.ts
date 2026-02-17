import { describe, it, expect } from "vitest";
import { getResticAssetName } from "../src/utils/platform.js";

describe("getResticAssetName", () => {
  it("produces a valid asset name string", () => {
    const name = getResticAssetName("0.17.3");
    expect(name).toMatch(/^restic_0\.17\.3_/);
    expect(name).toMatch(/\.(bz2|zip)$/);
  });
});
