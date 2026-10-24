import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../src/design-tokens.css", import.meta.url), "utf8");
const tokens = Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map(match => [match[1]!, match[2]!.toUpperCase()]));
function luminance(hex: string) {
  const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
test("academic palette is centralized and status/body text meets WCAG AA contrast", () => {
  assert.equal(tokens["--color-primary"], "#172B4D");
  assert.equal(tokens["--color-accent"], "#71339B");
  assert.equal(tokens["--color-teal"], "#168C88");
  assert.equal(tokens["--color-background"], "#F4F7FB");
  for (const [foreground, background] of [
    ["text", "card"], ["muted", "card"], ["primary", "background"],
    ["accent", "soft-purple"], ["success", "success-soft"],
    ["warning", "warning-soft"], ["danger", "danger-soft"],
  ]) {
    const a = luminance(tokens[`--color-${foreground}`]!);
    const b = luminance(tokens[`--color-${background}`]!);
    assert((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, foreground);
  }
  for (const file of ["index.css", "admin.css", "components/admin-actions.css"]) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert(!/#[\da-f]{3,8}\b/i.test(source), `${file}: colors must use tokens`);
  }
});
