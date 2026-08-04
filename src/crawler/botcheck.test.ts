import { describe, it, expect } from "vitest";
import { CHALLENGE_TITLE, CHALLENGE_SELECTOR } from "./browser";

/**
 * `waitForBotCheck` only pauses when an interstitial is actually recognised, so the
 * recogniser is what decides whether the option does anything at all — and, just as
 * importantly, that it never mistakes a real page for a challenge and burns a minute on it.
 */
describe("bot-check interstitial detection", () => {
  const interstitials = [
    "Just a moment...",
    "just a moment…",
    "Checking your browser before accessing example.com",
    "Attention Required! | Cloudflare",
    "Verifying you are human",
    "Verify that you are human",
    "One more step",
    "DDoS-Guard",
    "Security check",
  ];
  it.each(interstitials)("recognises %j as an interstitial", (title) => {
    expect(CHALLENGE_TITLE.test(title)).toBe(true);
  });

  const realPages = [
    "Best 3000 Watt Generators — Power Supply Zone",
    "Home | Example",
    "Casino reviews and bonuses",
    "Contact us",
    "Human Resources — About",
    "Check out our security products",
  ];
  it.each(realPages)("leaves %j alone", (title) => {
    expect(CHALLENGE_TITLE.test(title)).toBe(false);
  });

  it("matches the known challenge containers", () => {
    for (const sel of [
      "#challenge-form",
      "#cf-challenge-running",
      ".cf-browser-verification",
      "[data-translate='checking_browser']",
    ]) {
      expect(CHALLENGE_SELECTOR).toContain(sel);
    }
  });
});
