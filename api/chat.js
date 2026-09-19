export default async function handler(req, res) {
  const SITE = "hiraacademy.com.pk";
  const BASE_URL = "https://hiraacademy.com.pk";
  const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;

  // =========================================================
  // CORS HEADERS
  // =========================================================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // =========================================================
    // READ & PARSE REQUEST
    // =========================================================
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON." });
      }
    }

    const messages = Array.isArray(body?.messages) ? body.messages : [];

    const userMessage = [...messages]
      .reverse()
      .find(m => m && m.role === "user" && typeof m.content === "string");

    const question = userMessage?.content?.trim();

    if (!question) {
      return res.status(400).json({ error: "No question provided." });
    }

    // =========================================================
    // SITEMAP CACHING (30 MIN) — no per-request cost either way
    // =========================================================
    if (!globalThis.hiraCache) {
      globalThis.hiraCache = { urls: null, timestamp: 0 };
    }

    const CACHE_TIME = 30 * 60 * 1000;
    let urls = globalThis.hiraCache.urls;

    if (!urls || Date.now() - globalThis.hiraCache.timestamp > CACHE_TIME) {
      urls = await getSitemapUrls(SITEMAP_URL, SITE);
      globalThis.hiraCache.urls = urls;
      globalThis.hiraCache.timestamp = Date.now();
    }

    if (!urls || !urls.length) {
      return res.status(500).json({
        error: "Could not read the Hira Academy sitemap.",
        reply:
          "I'm having trouble reading the site map right now. Please try again in a moment, or visit " +
          BASE_URL + " directly."
      });
    }

    // =========================================================
    // SCORE URLS BY SLUG — no page downloads, so this is instant
    // and cannot time out, no matter how many pages the site has.
    // =========================================================
    const questionWords = tokenize(question);

    let ranked = urls
      .map(url => ({ url, score: scoreUrl(url, questionWords) }))
      .sort((a, b) => b.score - a.score);

    // Only keep genuine matches
    ranked = ranked.filter(item => item.score > 0).slice(0, 3);

    if (!ranked.length) {
      return res.status(200).json({
        reply:
          "I couldn't find a page for that on Hira Academy yet. " +
          `You can browse all topics here: ${BASE_URL}`,
        sourceUrl: BASE_URL
      });
    }

    // =========================================================
    // GET NICE TITLES FOR THE TOP MATCHES (small, bounded, fast —
    // at most 3 lightweight fetches, each with its own timeout,
    // so a slow/broken page can never hang the whole request)
    // =========================================================
    const withTitles = await Promise.all(
      ranked.map(async item => {
        const title = await fetchTitleSafely(item.url);
        return { url: item.url, title: title || titleFromSlug(item.url) };
      })
    );

    // =========================================================
    // BUILD REPLY — direct links, no AI generation, no API cost
    // =========================================================
    const lines = withTitles.map(
      page => `- [${page.title}](${page.url})`
    );

    const reply =
      withTitles.length === 1
        ? `Here's the page on Hira Academy for that:\n\n${lines[0]}`
        : `Here are the Hira Academy pages that match your question:\n\n${lines.join(
            "\n"
          )}`;

    return res.status(200).json({
      reply,
      sourceUrl: withTitles[0].url
    });
  } catch (error) {
    console.error("HIRA CHAT ERROR:", error);
    return res.status(500).json({
      error: error?.message || "Internal Server Error",
      reply:
        "Something went wrong on my end. Please try again, or visit " +
        "https://hiraacademy.com.pk directly."
    });
  }
}

// =============================================================
// SITEMAP READER
// =============================================================
async function getSitemapUrls(sitemapUrl, allowedHost) {
  try {
    const response = await fetch(sitemapUrl, {
      headers: { "User-Agent": "HiraAcademy-AI/1.0" }
    });

    if (!response.ok) {
      console.error("SITEMAP STATUS:", response.status);
      return [];
    }

    const xml = await response.text();
    const urls = [];
    const matches = xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);

    for (const match of matches) {
      const url = decodeXml(match[1]);
      try {
        const parsed = new URL(url);
        if (
          parsed.hostname === allowedHost ||
          parsed.hostname === `www.${allowedHost}`
        ) {
          urls.push(parsed.href);
        }
      } catch {
        // Skip malformed URLs
      }
    }

    return [...new Set(urls)];
  } catch (error) {
    console.error("SITEMAP ERROR:", error);
    return [];
  }
}

// =============================================================
// FETCH A PAGE'S <title> WITH A HARD TIMEOUT — never blocks the
// response if one page is slow or down.
// =============================================================
async function fetchTitleSafely(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 HiraAcademy-AI/1.0" },
      signal: controller.signal
    });

    if (!response.ok) return null;

    const html = await response.text();
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? decodeXml(match[1]).trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// =============================================================
// FALLBACK TITLE FROM THE URL SLUG (used only if the live title
// fetch fails or times out, so a reply is always returned)
// =============================================================
function titleFromSlug(url) {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").filter(Boolean).pop() || "Hira Academy";
    return last
      .replace(/[-_]+/g, " ")
      .replace(/\.\w+$/, "")
      .replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return "Hira Academy";
  }
}

// =============================================================
// HELPERS
// =============================================================
function tokenize(text) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(/\s+/)
        .filter(word => word.length >= 3 && !STOP_WORDS.has(word))
    )
  ];
}

function scoreUrl(url, words) {
  const lower = url.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (lower.includes(word)) score += 2;
  }
  return score;
}

function decodeXml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

const STOP_WORDS = new Set([
  "what", "when", "where", "which", "who", "why", "how",
  "does", "do", "did", "the", "and", "for", "from", "with",
  "that", "this", "these", "those", "are", "is", "was", "were",
  "can", "could", "would", "should", "will", "about", "into",
  "your", "you", "give", "tell", "explain", "define", "difference",
  "between", "class", "chapter", "question", "answer", "exercise",
  "solve", "find"
]);
