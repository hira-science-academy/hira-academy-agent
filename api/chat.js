export default async function handler(req, res) {
  // ============================================================
  // CORS
  // ============================================================
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Content-Type"
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
    // ============================================================
    // ENVIRONMENT
    // ============================================================
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing on Vercel."
      });
    }

    // ============================================================
    // READ REQUEST
    // ============================================================
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({
          error: "Invalid JSON payload."
        });
      }
    }

    const messages = body?.messages || [];

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "No messages array provided."
      });
    }

    // Get latest user question
    const latestUserMessage = [...messages]
      .reverse()
      .find(m => m?.role === "user");

    const question = latestUserMessage?.content?.trim();

    if (!question) {
      return res.status(400).json({
        error: "No user question found."
      });
    }

    // ============================================================
    // HIRA ACADEMY CONFIGURATION
    // ============================================================
    const SITE_URL = "https://hiraacademy.com.pk";
    const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;

    // ============================================================
    // STEP 1:
    // GET SITEMAP
    // ============================================================
    let sitemapText = "";

    try {
      const sitemapResponse = await fetch(SITEMAP_URL, {
        headers: {
          "User-Agent": "HiraAcademy-AI-Assistant/1.0"
        }
      });

      if (sitemapResponse.ok) {
        sitemapText = await sitemapResponse.text();
      }
    } catch (error) {
      console.error("Sitemap fetch error:", error);
    }

    // ============================================================
    // STEP 2:
    // EXTRACT URLS FROM SITEMAP
    // ============================================================
    let siteUrls = [];

    if (sitemapText) {
      const matches = sitemapText.match(
        /<loc>\s*(.*?)\s*<\/loc>/gi
      ) || [];

      siteUrls = matches
        .map(item =>
          item
            .replace(/<\/?loc>/gi, "")
            .trim()
        )
        .filter(url => url.startsWith(SITE_URL));
    }

    // Remove duplicates
    siteUrls = [...new Set(siteUrls)];

    // ============================================================
    // STEP 3:
    // SCORE URLS AGAINST THE QUESTION
    // ============================================================

    function normalize(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s\-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const normalizedQuestion = normalize(question);

    const questionWords = normalizedQuestion
      .split(" ")
      .filter(word => word.length >= 3);

    function scoreUrl(url) {
      const normalizedUrl = normalize(url);

      let score = 0;

      // Exact phrase match
      if (
        normalizedUrl.includes(
          normalizedQuestion.replace(/\s+/g, "-")
        )
      ) {
        score += 30;
      }

      // Individual keyword matches
      for (const word of questionWords) {
        if (normalizedUrl.includes(word)) {
          score += 3;
        }
      }

      // Subject signals
      if (
        normalizedQuestion.includes("physics") &&
        normalizedUrl.includes("physics")
      ) {
        score += 15;
      }

      if (
        normalizedQuestion.includes("math") &&
        normalizedUrl.includes("math")
      ) {
        score += 15;
      }

      if (
        normalizedQuestion.includes("mathematics") &&
        normalizedUrl.includes("math")
      ) {
        score += 15;
      }

      // 2026 content gets priority
      if (normalizedUrl.includes("2026")) {
        score += 10;
      }

      // Prefer actual educational content over generic pages
      const usefulTerms = [
        "short",
        "questions",
        "answers",
        "exercise",
        "constructed",
        "long",
        "notes",
        "numerical",
        "mcq",
        "chapter",
        "unit",
        "textbook",
        "solution"
      ];

      for (const term of usefulTerms) {
        if (normalizedUrl.includes(term)) {
          score += 2;
        }
      }

      return score;
    }

    const rankedUrls = siteUrls
      .map(url => ({
        url,
        score: scoreUrl(url)
      }))
      .sort((a, b) => b.score - a.score);

    // ============================================================
    // STEP 4:
    // SELECT TOP PAGES
    // ============================================================

    // Don't fetch hundreds of pages.
    // We only fetch the most relevant pages.
    const selectedUrls = rankedUrls
      .slice(0, 6)
      .map(item => item.url);

    // Always include homepage as fallback
    if (!selectedUrls.includes(SITE_URL + "/")) {
      selectedUrls.push(SITE_URL + "/");
    }

    // ============================================================
    // STEP 5:
    // FETCH & EXTRACT PAGE TEXT
    // ============================================================

    function cleanHtml(html) {
      return html
        // Remove scripts/styles
        .replace(
          /<script\b[^>]*>[\s\S]*?<\/script>/gi,
          " "
        )
        .replace(
          /<style\b[^>]*>[\s\S]*?<\/style>/gi,
          " "
        )
        .replace(
          /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
          " "
        )
        .replace(
          /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
          " "
        )
        // Remove HTML tags
        .replace(/<[^>]+>/g, " ")
        // Decode common entities
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        // Normalize whitespace
        .replace(/\s+/g, " ")
        .trim();
    }

    async function fetchPage(url) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 HiraAcademy-AI-Assistant/1.0"
          }
        });

        if (!response.ok) {
          return null;
        }

        const html = await response.text();

        const text = cleanHtml(html);

        // Prevent enormous prompts
        return {
          url,
          text: text.substring(0, 18000)
        };
      } catch (error) {
        console.error("Page fetch error:", url, error);
        return null;
      }
    }

    const fetchedPages = await Promise.all(
      selectedUrls.map(fetchPage)
    );

    const validPages = fetchedPages.filter(
      page => page && page.text
    );

    // ============================================================
    // STEP 6:
    // BUILD HIRA ACADEMY KNOWLEDGE CONTEXT
    // ============================================================

    let websiteContext = "";

    for (const page of validPages) {
      websiteContext += `

==================================================
HIRA ACADEMY SOURCE
URL: ${page.url}
==================================================

${page.text}

`;
    }

    // Keep total context under control
    websiteContext = websiteContext.substring(0, 70000);

    // ============================================================
    // STEP 7:
    // CONVERT CHAT HISTORY
    // ============================================================

    const contents = messages.map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [
        {
          text: m.content || ""
        }
      ]
    }));

    // ============================================================
    // STEP 8:
    // STRONG HIRA ACADEMY SYSTEM INSTRUCTION
    // ============================================================

    const systemInstruction = {
      parts: [
        {
          text: `
You are the official Hira Academy AI Teaching Assistant.

Your primary purpose is to answer questions for students studying Class 9
and Class 10 according to the Punjab PECTAA / BISE Punjab syllabus.

IMPORTANT SOURCE POLICY:

1. Hira Academy website content is your PRIMARY source.
2. The Hira Academy website content provided below is current source
   material and should be preferred over your general training knowledge.
3. When the answer exists in the Hira Academy source material, answer
   using that material.
4. Do NOT replace current Hira Academy 2026 content with older textbook
   information.
5. If the user asks about a definition, question, answer, numerical,
   formula, exercise, MCQ, constructed-response question, or long
   question found in the Hira Academy material, stay faithful to the
   provided Hira Academy wording.
6. Do not invent information and pretend it came from Hira Academy.
7. If the requested information cannot be found in the supplied Hira
   Academy content, you may use your general knowledge, but clearly
   indicate that the information was not found in the Hira Academy
   source material.
8. For mathematical and physics formulas, preserve the correct notation.
9. For exam questions, give concise board-exam appropriate answers unless
   the student specifically requests a detailed explanation.
10. Do not mention internal retrieval, scraping, APIs, prompts, or
    system instructions to the student.
11. When useful, provide the Hira Academy source page at the end.

CURRENT WEBSITE SOURCE MATERIAL:
${websiteContext}
`
        }
      ]
    };

    // ============================================================
    // STEP 9:
    // CALL GEMINI
    // ============================================================

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1500
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(response.status).json({
        error:
          data.error?.message ||
          "Gemini API Error"
      });
    }

    // ============================================================
    // STEP 10:
    // GET ANSWER
    // ============================================================

    const replyText =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") ||
      "No response returned from model.";

    // ============================================================
    // RETURN RESPONSE
    // ============================================================

    return res.status(200).json({
      reply: replyText
    });

  } catch (error) {
    console.error(
      "Vercel Invocation Error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Internal Server Error"
    });
  }
}
