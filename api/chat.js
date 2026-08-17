// =========================================================
// HELPER FUNCTIONS (Moved outside handler for efficiency)
// =========================================================
const SITE = "https://hiraacademy.com.pk";

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]*>/g, " ")
    // Preserves alphanumeric, spaces, dots, dashes, and standard math operators
    .replace(/[^\p{L}\p{N}\s.\-+*\/=()^]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function fetchPage(url) {
  try {
    const controller = new AbortController();
    // Reduced timeout to 3s to prevent Vercel 504 timeouts
    const timer = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 Hira-Academy-Assistant",
        Accept: "text/html,application/xhtml+xml"
      }
    });

    clearTimeout(timer);
    if (!response.ok) return null;

    const html = await response.text();
    return {
      url,
      text: htmlToText(html)
    };
  } catch {
    return null;
  }
}

// =========================================================
// API HANDLER
// =========================================================
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is missing on Vercel." });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON." });
      }
    }

    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const userMessage = [...messages].reverse().find(
      m => m && m.role === "user" && typeof m.content === "string"
    );

    const question = userMessage?.content?.trim();
    if (!question) {
      return res.status(400).json({ error: "No question provided." });
    }

    // Sitemap Retrieval
    const sitemapResponse = await fetch(`${SITE}/sitemap.xml`);
    if (!sitemapResponse.ok) {
      return res.status(500).json({ error: "Unable to read Hira Academy sitemap." });
    }

    const sitemapXML = await sitemapResponse.text();
    const sitemapMatches = sitemapXML.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi) || [];

    const urls = sitemapMatches
      .map(x => {
        const m = x.match(/<loc>\s*([^<]+?)\s*<\/loc>/i);
        return m ? m[1].trim() : null;
      })
      .filter(Boolean)
      .filter(url => url.startsWith(SITE))
      .filter(url => !/\.(jpg|jpeg|png|gif|webp|svg|css|js|pdf)$/i.test(url));

    const uniqueUrls = [...new Set(urls)];
    const q = normalize(question);
    const exercise = q.match(/\b(?:exercise|ex)\s*(\d+)\s*[.]\s*(\d+)\b/i);

    const knownConcepts = [
      "right hand grip rule", "right hand grip", "electromagnetic induction",
      "electromagnetism", "coriolis effect", "sea breeze", "land breeze",
      "faraday law", "lenz law", "fleming left hand rule", "fleming right hand rule",
      "transformer", "ac generator", "pn junction", "depletion region",
      "forward bias", "reverse bias"
    ];

    const concepts = knownConcepts.filter(concept => q.includes(concept));

    // Scoring System
    function scoreUrl(url) {
      const u = normalize(url);
      let score = 0;

      if (exercise) {
        if (u.includes(`unit${exercise[1]}-exercise${exercise[2]}`)) score += 1000;
        else if (u.includes(`unit${exercise[1]}`) && u.includes(`exercise${exercise[2]}`)) score += 700;
      }

      concepts.forEach(concept => {
        concept.split(" ").filter(Boolean).forEach(word => {
          if (word.length > 3 && u.includes(word)) score += 30;
        });
      });

      if (/\bmath|mathematics|maths\b/.test(q) && (u.includes("math") || u.includes("mathematics"))) score += 100;
      if (/\bphysics\b/.test(q) && u.includes("physics")) score += 100;
      if (/\bmcqs?|multiple choice\b/.test(q) && u.includes("mcq")) score += 100;
      if (/\bshort questions?|definition|define\b/.test(q) && u.includes("short")) score += 80;

      if (u === SITE || u === `${SITE}/`) score -= 10000;
      return score;
    }

    const rankedUrls = uniqueUrls
      .map(url => ({ url, score: scoreUrl(url) }))
      .sort((a, b) => b.score - a.score);

    // Limit candidate pages to top 4 max to avoid Vercel timeouts
    let candidateUrls = rankedUrls.filter(x => x.score > 0).slice(0, 4).map(x => x.url);

    if (candidateUrls.length === 0) {
      candidateUrls = uniqueUrls.slice(0, 3);
    }

    const pages = await Promise.all(candidateUrls.map(fetchPage));
    const validPages = pages.filter(p => p && p.text && p.text.length > 100);

    const questionWords = q.split(/\s+/).filter(word => word.length >= 4);

    function contentScore(page) {
      const text = normalize(page.text);
      let score = 0;

      if (text.includes(q)) score += 1000;
      concepts.forEach(concept => { if (text.includes(concept)) score += 300; });
      questionWords.forEach(word => { if (text.includes(word)) score += 8; });

      return score;
    }

    const scoredPages = validPages
      .map(page => ({ ...page, score: contentScore(page) }))
      .sort((a, b) => b.score - a.score);

    let bestPage = scoredPages[0];

    if (!bestPage || bestPage.score < 10) {
      return res.status(200).json({
        reply: "I couldn't find this information in the current Hira Academy material."
      });
    }

    // Extract Relevant Snippet Safely
    const sourceText = bestPage.text;
    const lowerSource = sourceText.toLowerCase();
    let position = -1;

    for (const term of [...concepts, question]) {
      const p = lowerSource.indexOf(term.toLowerCase());
      if (p !== -1 && (position === -1 || p < position)) {
        position = p;
      }
    }

    let relevantText = sourceText;
    if (position >= 0) {
      const start = Math.max(0, position - 500);
      const end = Math.min(sourceText.length, position + 4000);
      relevantText = sourceText.substring(start, end);
    } else {
      relevantText = sourceText.substring(0, 4000);
    }

    // Query Gemini 1.5 Flash API
    let answer = "";
    try {
      const geminiResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: `You are the official Hira Academy teaching assistant.
Answer the user's question using ONLY the provided SOURCE CONTENT. If the source does not contain the answer, reply: "I couldn't find this information in the current Hira Academy material." Do not add source citations.`
              }]
            },
            contents: [{
              role: "user",
              parts: [{
                text: `Question: ${question}\n\nSOURCE CONTENT:\n${relevantText}`
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1000
            }
          })
        }
      );

      const data = await geminiResponse.json();

      if (geminiResponse.ok) {
        answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim() || "";
      } else {
        console.error("GEMINI ERROR:", data?.error?.message);
      }
    } catch (error) {
      console.error("GEMINI REQUEST ERROR:", error.message);
    }

    // Fallback if model fails or exceeds quota
    if (!answer) {
      answer = "According to Hira Academy:\n\n" + relevantText.substring(0, 2000);
    }

    // Append source citation
    answer = answer.replace(/\*\*Source:\s*Hira Academy\*\*[\s\S]*$/i, "").trim();
    answer += `\n\n---\n**Source: Hira Academy**\n[Open the original Hira Academy page](${bestPage.url})`;

    return res.status(200).json({
      reply: answer,
      sourceUrl: bestPage.url
    });

  } catch (error) {
    console.error("HIRA CHAT ERROR:", error);
    return res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}
