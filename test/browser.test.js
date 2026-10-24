// Real-browser checks. Skipped automatically when Playwright is not installed (the app itself has no dependencies).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { createEventStore } from "../server/events.js";

let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch { /* not installed */ }
const skip = chromium ? false : "playwright not installed";

async function withPage(t, opts, fn) {
  const store = createEventStore(path.join(await mkdtemp(path.join(tmpdir(), "nk-e2e-")), "events.json"));
  const app = createApp({ analyzeFn: async () => ({ isEvent: true, source: "model" }), store });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); app.closeAllConnections?.(); app.close(); });
  const ctx = await browser.newContext({ acceptDownloads: true, ...opts }), page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${app.address().port}/`);
  await fn(page, errors, ctx);
  assert.deepEqual(errors, [], "no script errors");
}
const openCard = (page, title) => page.locator("li.card", { hasText: title }).getByRole("button", { name: /View details/ }).click();

test("calendar: stays on the page, downloads a real .ics, Google link is an explicit new tab", { skip }, async (t) => {
  for (const opts of [{}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
    await withPage(t, opts, async (page, _e, ctx) => {
      const urlBefore = page.url(), popups = [];
      ctx.on("page", (p) => popups.push(p.url()));
      await openCard(page, "Hack for Good 24h");
      const trigger = page.getByRole("button", { name: "Add to calendar" });
      assert.equal(await trigger.getAttribute("aria-expanded"), "false");
      await trigger.click();
      assert.equal(await trigger.getAttribute("aria-expanded"), "true");
      assert.deepEqual(popups, [], "opening the menu opens nothing");
      assert.equal(page.url(), urlBefore);
      const google = page.getByRole("link", { name: /Google Calendar/ });
      assert.equal(await google.getAttribute("target"), "_blank");
      assert.match(await google.getAttribute("rel"), /noopener/);
      assert.match(await google.getAttribute("href"), /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Download calendar file/ }).click()]);
      assert.equal(download.suggestedFilename(), "hack-for-good-24h.ics");
      const text = await (await import("node:fs/promises")).readFile(await download.path(), "utf8");
      assert.match(text, /BEGIN:VCALENDAR[\s\S]*SUMMARY:Hack for Good 24h/);
      assert.equal(page.url(), urlBefore, "page did not navigate");
      assert.equal(await page.locator("#dlg").evaluate((d) => d.open), true, "dialog still open");
      assert.deepEqual(popups, []);
    });
  }
});

test("event page: key facts, tabs with keyboard support, and every tab has content", { skip }, async (t) => {
  await withPage(t, {}, async (page) => {
    await openCard(page, "Hack for Good 24h");
    const facts = await page.locator(".kf").innerText();
    assert.match(facts, /REGISTER BY[\s\S]*FEE[\s\S]*per team[\s\S]*TEAM SIZE[\s\S]*2 to 4 members/i);
    const tabs = page.getByRole("tab");
    assert.equal(await tabs.count(), 6);
    assert.equal(await page.getByRole("tab", { selected: true }).innerText(), "Details");
    await page.getByRole("tab", { name: "Details" }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("tab", { selected: true }).innerText(), "Dates & deadlines");
    assert.match(await page.getByRole("tabpanel").innerText(), /Registration opens[\s\S]*Registration closes[\s\S]*Event day/);
    const cal = page.getByRole("tabpanel").locator("table.cal");
    assert.ok(await cal.count() >= 1, "month calendar is shown");
    assert.ok(await cal.locator("td.mark").count() >= 4, "dates are marked");
    assert.match(await cal.locator("td.mark").first().getAttribute("aria-label"), /\d{4}: Registration opens/);
    await page.keyboard.press("End");
    assert.match(await page.getByRole("tabpanel").innerText(), /riya|Riya|Email|Phone/);
    assert.equal(await page.getByRole("tabpanel").getByRole("link", { name: /\+91/ }).getAttribute("href"), "tel:+919876543210");
    await page.getByRole("tab", { name: "Prizes & fees" }).click();
    assert.match(await page.getByRole("tabpanel").innerText(), /Winner[\s\S]*25,000/);
    await page.getByRole("tab", { name: "Rules & eligibility" }).click();
    assert.equal(await page.getByRole("tabpanel").locator("ul.bullets li").count(), 4);
    await page.getByRole("tab", { name: "FAQs" }).click();
    assert.equal(await page.getByRole("tabpanel").locator("details.faq").count(), 3);
  });
});

test("posting: new fields are written, validated and shown on the published event page", { skip }, async (t) => {
  await withPage(t, {}, async (page) => {
    await page.goto(page.url() + "#host");
    const f = page.locator("#hostForm");
    await f.locator("[name=title]").fill("Prompt Sprint"); await f.locator("[name=host]").fill("AI Club");
    await f.locator("[name=type]").selectOption("hackathon"); await f.locator("[name=hostType]").selectOption("college");
    await f.locator("#hInterests label", { hasText: "AI & ML" }).click();
    await f.locator("[name=desc]").fill("A one day prompt engineering sprint for students who like building with AI.");
    await f.locator("[name=mode][value=online]").check({ force: true });
    const d = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString("en-CA");
    await f.locator("[name=date]").fill(d(10)); await f.locator("[name=regStart]").fill(d(1)); await f.locator("[name=regDeadline]").fill(d(6));
    await f.locator("[name=tlLabel]").first().fill("Idea round"); await f.locator("[name=tlDate]").first().fill(d(8));
    await f.locator("[name=price]").fill("150"); await f.locator("[name=feeUnit]").selectOption("team");
    await f.locator("[name=pzPlace]").first().fill("Winner"); await f.locator("[name=pzReward]").first().fill("Rs 10,000");
    await f.locator("[name=eligibility]").fill("Open to all college students.");
    await f.locator("[name=rules]").fill("Be original.\nNo plagiarism.");
    await f.locator("[name=contactEmail]").fill("club@example.org"); await f.locator("[name=contactPhone]").fill("98765");
    await f.getByRole("button", { name: "Publish event" }).click();
    assert.match(await page.locator("[data-err=contactPhone]").innerText(), /7 to 15 digits/);
    assert.equal(await f.locator("[name=contactPhone]").getAttribute("aria-invalid"), "true");
    await f.locator("[name=contactPhone]").fill("+91 98765 43210");
    await f.getByRole("button", { name: "Publish event" }).click();
    await page.locator("#kit").waitFor({ state: "visible" });
    await page.goto(page.url().split("#")[0] + "#discover");
    await page.locator("#q").fill("Prompt Sprint");
    await openCard(page, "Prompt Sprint");
    assert.match(await page.locator(".kf").innerText(), /₹150 per team/);
    await page.getByRole("tab", { name: "Dates & deadlines" }).click();
    assert.match(await page.getByRole("tabpanel").innerText(), /Idea round/);
    await page.getByRole("tab", { name: "Rules & eligibility" }).click();
    assert.match(await page.getByRole("tabpanel").innerText(), /Open to all college students[\s\S]*Be original[\s\S]*No plagiarism/);
  });
});
