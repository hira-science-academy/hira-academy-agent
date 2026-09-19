export default async function handler(req, res) {
  const SITE = "hiraacademy.com.pk";
  const BASE_URL = "https://hiraacademy.com.pk";
  const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;

  // =========================================================
  // CORS
  // =========================================================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    // =========================================================
    // GEMINI API KEY
    // =========================================================
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing on Vercel."
      });
    }

    // =========================================================
    // READ REQUEST
    // =========================================================
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          error: "Invalid JSON."
        });
      }
    }

    const messages = Array.isArray(body?.messages)
      ? body.messages
      : [];

    const userMessage = [...messages]
      .reverse()
      .find(
        m =>
          m &&
          m.role === "user" &&
          typeof m.content === "string"
      );

    const question = userMessage?.content?.trim();

    if (!question) {
      return res.status(400).json({
        error: "No question provided."
      });
    }

    console.log("======================================");
    console.log("HIRA QUESTION:", question);
    console.log("======================================");

    // =========================================================
    // SIMPLE CACHE
    // =========================================================
    if (!globalThis.hiraCache) {
      globalThis.hiraCache = {
        urls: null,
        timestamp: 0
      };
    }

    // Cache sitemap URLs for 30 minutes
    const CACHE_TIME = 30 * 60 * 1000;

    let urls = globalThis.hiraCache.urls;

    if (
      !urls ||
      Date.now() - globalThis.hiraCache.timestamp > CACHE_TIME
    ) {
      console.log("Downloading sitemap...");

      urls = await getSitemapUrls(SITEMAP_URL, SITE);

      globalThis.hiraCache.urls = urls;
      globalThis.hiraCache.timestamp = Date.now();

      console.log(
        "SITEMAP URL COUNT:",
        urls.length
      );
    }

    if (!urls || !urls.length) {
      return res.status(500).json({
        error: "Could not read the Hira Academy sitemap."
      });
    }

    // =========================================================
    // SEARCH ACTUAL PAGE CONTENT
    // =========================================================
    const candidates = await findRelevantPages(urls, question);

    console.log(
      "RELEVANT PAGE COUNT:",
      candidates.length
    );

    // =========================================================
    // NOTHING FOUND
    // =========================================================
    if (!candidates.length) {
      return res.status(200).json({
        reply: "I couldn't find this information in the current Hira Academy material.",
        sourceUrl: null
      });
    }

    // =========================================================
    // SEND ONLY RELEVANT CONTENT TO GEMINI
    // =========================================================
    const context = candidates
      .map((page, index) => {
        return `
==============================
SOURCE ${index + 1}
==============================

URL:
${page.url}

TITLE:
${page.title}

RELEVANT CONTENT:
${page.content}
`;
      })
      .join("\n");

    const prompt = `
You are the official AI teaching assistant for Hira Science Academy.

You MUST answer ONLY from the Hira Academy website content supplied below.

Do NOT use outside knowledge.

STUDENT QUESTION:
${question}

HIRA ACADEMY MATERIAL:
${context}

RULES:
1. Answer the student's question directly.
2. Keep the answer SHORT (1–4 sentences).
3. Use the information from the most relevant source.
4. If the exact question and answer are present in the supplied content, use that information.
5. Do not invent information or add outside facts.
6. For Mathematics, preserve formulas and mathematical notation.
7. Choose the source page that actually contains the answer.
8. The final source URL MUST be one of the URLs supplied above.
9. Return ONLY this format:

ANSWER:
<short answer>

SOURCE_URL:
<exact URL>

If the supplied Hira Academy content does not contain enough information to answer the question, return:

ANSWER:
I couldn't find this information in the current Hira Academy material.

SOURCE_URL:
NONE
`;

    // =========================================================
    // GEMINI CALL
    // =========================================================
    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 700
          }
        })
      }
    );

    const geminiData = await geminiResponse.json();

    console.log("GEMINI STATUS:", geminiResponse.status);

    if (!geminiResponse.ok) {
      console.error(
        "GEMINI ERROR:",
        JSON.stringify(geminiData, null, 2)
      );

      return res.status(geminiResponse.status).json({
        error: geminiData?.error?.message || "Gemini API error."
      });
    }

    // =========================================================
    // EXTRACT GEMINI TEXT
    // =========================================================
    const raw = geminiData?.candidates?.[0]?.content?.parts
      ?.map(p => p.text || "")
      .join("")
      .trim();

    console.log("GEMINI RAW RESPONSE:", raw);

    if (!raw) {
      return res.status(200).json({
        reply: "I couldn't find this information in the current Hira Academy material.",
        sourceUrl: null
      });
    }

    // =========================================================
    // PARSE ANSWER
    // =========================================================
    let answer = "";
    let sourceUrl = "";

    const answerMatch = raw.match(/ANSWER:\s*([\s\S]*?)(?=\s*SOURCE_URL:)/i);
    const sourceMatch = raw.match(/SOURCE_URL:\s*(\S+)/i);

    if (answerMatch) {
      answer = answerMatch[1].trim();
    }

    if (sourceMatch) {
      sourceUrl = sourceMatch[1].trim().replace(/[)\],.;]+$/, "");
    }

    // =========================================================
    // VALIDATE SOURCE URL
    // =========================================================
    const allowedUrls = new Set(candidates.map(page => page.url));

    if (!allowedUrls.has(sourceUrl)) {
      sourceUrl = candidates[0]?.url || "";
    }

    // =========================================================
    // FALLBACK ANSWER
    // =========================================================
    if (!answer) {
      answer = raw
        .replace(/SOURCE_URL:[\s\S]*$/i, "")
        .replace(/^ANSWER:\s*/i, "")
        .trim();
    }

    // Remove raw URLs echoed inside the answer string
    answer = answer
      .replace(/https?:\/\/hiraacademy\.com\.pk\/\S*/gi, "")
      .trim();

    // =========================================================
    // NOT FOUND
    // =========================================================
    if (
      /couldn't find this information/i.test(answer) ||
      /could not find this information/i.test(answer)
    ) {
      return res.status(200).json({
        reply: "I couldn't find this information in the current Hira Academy material.",
        sourceUrl: null
      });
    }

    // =========================================================
    // FINAL RESPONSE
    // =========================================================
    const reply =
      `${answer}\n\n` +
      `**Source: Hira Academy**\n` +
      `[Open the relevant Hira Academy page](${sourceUrl})`;

    console.log("FINAL SOURCE:", sourceUrl);

    return res.status(200).json({
      reply,
      sourceUrl
    });

  } catch (error) {
    console.error("HIRA CHAT ERROR:", error);

    return res.status(500).json({
      error: error?.message || "Internal Server Error"
    });
  }
}

// =============================================================
// SITEMAP READER
// =============================================================
async function getSitemapUrls(sitemapUrl, allowedHost) {
  try {
    const response = await fetch(sitemapUrl, {
      headers: {
        "User-Agent": "HiraAcademy-AI/1.0"
      }
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
        // Ignore bad URL
      }
    }

    return [...new Set(urls)];
  } catch (error) {
    console.error("SITEMAP ERROR:", error);
    return [];
  }
}

// =============================================================
// SEARCH PAGE CONTENT
// =============================================================
async function findRelevantPages(urls, question) {
  const questionWords = tokenize(question);

  const urlCandidates = urls
    .map(url => ({
      url,
      score: scoreUrl(url, questionWords)
    }))
    .sort((a, b) => b.score - a.score);

  const pagesToFetch = urlCandidates.slice(
    0,
    Math.min(30, urlCandidates.length)
  );

  const results = [];

  for (let i = 0; i < pagesToFetch.length; i += 6) {
    const batch = pagesToFetch.slice(i, i + 6);

    const batchResults = await Promise.all(
      batch.map(item =>
        fetchAndScorePage(item.url, questionWords, question)
      )
    );

    for (const result of batchResults) {
      if (result && result.score > 0) {
        results.push(result);
      }
    }

    const strong = results.filter(page => page.score >= 12);
    if (strong.length >= 6) {
      break;
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

// =============================================================
// DOWNLOAD + SCORE ONE PAGE
// =============================================================
async function fetchAndScorePage(url, questionWords, originalQuestion) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 HiraAcademy-AI/1.0"
      }
    });

    if (!response.ok) return null;

    const html = await response.text();
    if (!html) return null;

    const title = extractTitle(html);
    const text = htmlToText(html);

    if (text.length < 50) return null;

    const relevantContent = extractRelevantContent(
      text,
      questionWords,
      originalQuestion
    );

    const contentScore = scoreContent(text, questionWords, originalQuestion);
    const titleScore = scoreText(title, questionWords);
    const urlScore = scoreUrl(url, questionWords);

    const totalScore = contentScore * 3 + titleScore * 2 + urlScore;

    if (totalScore <= 0) return null;

    return {
      url,
      title: title || "Hira Academy",
      content: relevantContent,
      score: totalScore
    };
  } catch (error) {
    console.error("PAGE FETCH ERROR:", url, error.message);
    return null;
  }
}

// =============================================================
// TOKENIZE
// =============================================================
function tokenize(text) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(/\s+/)
        .filter(
          word => word.length >= 3 && !STOP_WORDS.has(word)
        )
    )
  ];
}

// =============================================================
// CONTENT SCORING
// =============================================================
function scoreContent(text, words, question) {
  const lower = text.toLowerCase();
  let score = 0;

  const normalizedQuestion = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

  if (
    normalizedQuestion.length >= 10 &&
    lower.includes(normalizedQuestion)
  ) {
    score += 30;
  }

  for (const word of words) {
    const occurrences = countOccurrences(lower, word);
    if (occurrences > 0) {
      score += Math.min(occurrences * 2, 10);
    }
  }

  if (lower.includes(question.toLowerCase().trim())) {
    score += 20;
  }

  return score;
}

// =============================================================
// GENERIC TEXT SCORE
// =============================================================
function scoreText(text, words) {
  const lower = text.toLowerCase();
  let score = 0;

  for (const word of words) {
    if (lower.includes(word)) {
      score += 2;
    }
  }

  return score;
}

// =============================================================
// URL SCORE
// =============================================================
function scoreUrl(url, words) {
  const lower = url.toLowerCase();
  let score = 0;

  for (const word of words) {
    if (lower.includes(word)) {
      score += 2;
    }
  }

  return score;
}

// =============================================================
// EXTRACT RELEVANT CONTENT
// =============================================================
function extractRelevantContent(text, words, question) {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 20);

  const scored = sentences.map(sentence => ({
    sentence,
    score:
      scoreText(sentence, words) +
      (sentence.toLowerCase().includes(question.toLowerCase()) ? 30 : 0)
  }));

  scored.sort((a, b) => b.score - a.score);

  const selected = scored
    .filter(item => item.score > 0)
    .slice(0, 18)
    .map(item => item.sentence);

  if (selected.length) {
    return selected.join("\n");
  }

  return text.slice(0, 6000);
}

// =============================================================
// HTML → TEXT
// =============================================================
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// =============================================================
// EXTRACT TITLE
// =============================================================
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]) : "";
}

// =============================================================
// XML DECODE
// =============================================================
function decodeXml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// =============================================================
// COUNT OCCURRENCES
// =============================================================
function countOccurrences(text, word) {
  if (!word) return 0;
  let count = 0;
  let position = 0;

  while ((position = text.indexOf(word, position)) !== -1) {
    count++;
    position += word.length;
  }

  return count;
}

// =============================================================
// STOP WORDS
// =============================================================
const STOP_WORDS = new Set([
  "what", "when", "where", "which", "who", "why", "how",
  "does", "do", "did", "the", "and", "for", "from", "with",
  "that", "this", "these", "those", "are", "is", "was", "were",
  "can", "could", "would", "should", "will", "about", "into",
  "your", "you", "give", "tell", "explain", "define", "difference",
  "between", "class", "chapter", "question", "answer", "exercise",
  "solve", "find"
]);
