/**
 * WEB SEARCH ROUTE — SearxNG preferred, DuckDuckGo scraper fallback
 * ==================================================================
 * POST /web/search { query: string }
 *   → { results: [{ title, url, snippet }] }
 *
 * POST /web/fetch  { url: string }
 *   → { markdown: string }
 *
 * SearxNG probe: GET http://127.0.0.1:8888/search?q=test&format=json
 * Fallback: scrape DuckDuckGo HTML with cheerio
 */

import { Router } from "express";
import { thoughtLog } from "../lib/thought-log.js";

const router = Router();

const SEARXNG_BASE   = "http://127.0.0.1:8888";
const SEARXNG_TIMEOUT = 4000;
const FETCH_TIMEOUT   = 10_000;

export interface WebResult {
  title:   string;
  url:     string;
  snippet: string;
}

// ── SearxNG probe ─────────────────────────────────────────────────────────────

async function searxNgAvailable(): Promise<boolean> {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), SEARXNG_TIMEOUT);
  try {
    const res = await fetch(
      `${SEARXNG_BASE}/search?q=test&format=json&categories=general`,
      { signal: ctrl.signal },
    );
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// ── SearxNG search ────────────────────────────────────────────────────────────

async function searchViaSearxNg(query: string): Promise<WebResult[]> {
  const url = `${SEARXNG_BASE}/search?q=${encodeURIComponent(query)}&format=json&categories=general`;
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), SEARXNG_TIMEOUT);
  try {
    const res  = await fetch(url, { signal: ctrl.signal });
    const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
    return (data.results ?? []).slice(0, 10).map(r => ({
      title:   r.title   ?? "",
      url:     r.url     ?? "",
      snippet: r.content ?? "",
    }));
  } finally {
    clearTimeout(t);
  }
}

// ── DuckDuckGo scraper fallback ───────────────────────────────────────────────

async function searchViaDuckDuckGo(query: string): Promise<WebResult[]> {
  // Use DDG HTML endpoint — no JS required
  const url  = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);

  try {
    const res  = await fetch(url, {
      signal:  ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LocalAI/1.0)" },
    });
    const html = await res.text();

    // Parse with cheerio (lazy import)
    const { load } = await import("cheerio");
    const $ = load(html);
    const results: WebResult[] = [];

    $(".result__body").each((_i, el) => {
      const titleEl   = $(el).find(".result__a");
      const snippetEl = $(el).find(".result__snippet");
      const hrefRaw   = titleEl.attr("href") ?? "";

      // DDG wraps URLs — extract from uddg param
      let href = hrefRaw;
      try {
        const u = new URL(hrefRaw, "https://duckduckgo.com");
        href    = u.searchParams.get("uddg") ?? hrefRaw;
      } catch { /* keep raw */ }

      const title   = titleEl.text().trim();
      const snippet = snippetEl.text().trim();
      if (title && href) {
        results.push({ title, url: href, snippet });
      }
    });

    return results.slice(0, 10);
  } finally {
    clearTimeout(t);
  }
}

// ── URL → Markdown ─────────────────────────────────────────────────────────────

async function fetchAsMarkdown(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);

  try {
    const res  = await fetch(url, {
      signal:  ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LocalAI/1.0)" },
    });
    const html = await res.text();

    const { load } = await import("cheerio");
    const $ = load(html);

    // Strip nav/footer/script/style noise
    $("script, style, nav, footer, header, aside, noscript, iframe, [aria-hidden='true']").remove();

    // Try to get main article content
    const mainEl = $("main, article, [role='main'], .content, #content").first();
    const bodyText = (mainEl.length ? mainEl : $("body")).text();

    // Collapse whitespace
    const markdown = bodyText
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .slice(0, 20_000); // cap at 20k chars

    return markdown;
  } finally {
    clearTimeout(t);
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /web/search
router.post("/web/search", async (req, res) => {
  const body  = typeof req.body === "object" && req.body !== null ? req.body : {};
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return res.status(400).json({ success: false, error: "query required" });

  try {
    const useSearxNg = await searxNgAvailable();
    const results = useSearxNg
      ? await searchViaSearxNg(query)
      : await searchViaDuckDuckGo(query);

    thoughtLog.publish({
      category: "web",
      title:    "Web Search",
      message:  `"${query}" via ${useSearxNg ? "SearxNG" : "DuckDuckGo"} → ${results.length} results`,
      metadata: { query, resultCount: results.length, backend: useSearxNg ? "searxng" : "duckduckgo" },
    });

    return res.json({ success: true, results, backend: useSearxNg ? "searxng" : "duckduckgo" });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /web/fetch
router.post("/web/fetch", async (req, res) => {
  const body = typeof req.body === "object" && req.body !== null ? req.body : {};
  const url  = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) return res.status(400).json({ success: false, error: "url required" });

  try {
    const markdown = await fetchAsMarkdown(url);
    return res.json({ success: true, markdown, url });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
