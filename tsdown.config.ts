import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli/index.ts", "src/index.ts"],
  format: "esm",
  target: "node18",
  dts: true,
  clean: true,
  sourcemap: true,
});
