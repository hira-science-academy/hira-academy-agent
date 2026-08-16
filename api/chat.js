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
    // GEMINI API KEY
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
      } catch {
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

    // Find latest user question
    const latestUserMessage = [...messages]
      .reverse()
      .find(
        message =>
          message &&
          message.role === "user" &&
          typeof message.content === "string"
      );

    const question = latestUserMessage?.content?.trim();

    if (!question) {
      return res.status(400).json({
        error: "No user question found."
      });
    }

    // ============================================================
    // HIRA ACADEMY SETTINGS
    // ============================================================
    const SITE_URL = "https://hiraacademy.com.pk";
    const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;

    // ============================================================
    // TEXT NORMALIZATION
    // ============================================================
    function normalize(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, " and ")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/<[^>]+>/g, " ")
        .replace(/[^a-z0-9\s\-]/g, " ")
        .replace(/[-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // ============================================================
    // REMOVE COMMON STOP WORDS
    // ============================================================
    const STOP_WORDS = new Set([
      "what",
      "why",
      "how",
      "when",
      "where",
      "which",
      "who",
      "does",
      "do",
      "did",
      "is",
      "are",
      "was",
      "were",
      "the",
      "a",
      "an",
      "of",
      "to",
      "in",
      "on",
      "for",
      "and",
      "or",
      "with",
      "from",
      "about",
      "explain",
      "define",
      "describe",
      "tell",
      "me",
      "give",
      "please",
      "can",
      "you",
      "according",
      "answer",
      "question"
    ]);

    function getKeywords(text) {
      return [...new Set(
        normalize(text)
          .split(" ")
          .filter(word => word.length >= 3 && !STOP_WORDS.has(word))
      )];
    }

    const questionNormalized = normalize(question);
    const questionKeywords = getKeywords(question);

    // ============================================================
    // FETCH WITH TIMEOUT
    // ============================================================
    async function fetchWithTimeout(url, timeout = 7000) {
      const controller = new AbortController();

      const timer = setTimeout(() => {
        controller.abort();
      }, timeout);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 Hira-Academy-Assistant/1.0",
            "Accept":
              "text/html,application/xml,text/xml,*/*"
          }
        });

        return response;
      } finally {
        clearTimeout(timer);
      }
    }

    // ============================================================
    // FETCH SITEMAP
    // Supports:
    // 1. Normal urlset sitemap
    // 2. Sitemap index
    // ============================================================
    async function getSitemapUrls(sitemapUrl, depth = 0) {
      if (depth > 2) {
        return [];
      }

      try {
        const response = await fetchWithTimeout(
          sitemapUrl,
          7000
        );

        if (!response.ok) {
          console.error(
            "Sitemap failed:",
            sitemapUrl,
            response.status
          );

          return [];
        }

        const xml = await response.text();

        const locs = [
          ...xml.matchAll(
            /<loc>\s*([\s\S]*?)\s*<\/loc>/gi
          )
        ]
          .map(match => match[1].trim())
          .filter(Boolean);

        if (!locs.length) {
          return [];
        }

        // Sitemap index
        if (
          xml.toLowerCase().includes("<sitemapindex")
        ) {
          const childSitemaps = locs.slice(0, 10);

          const childResults =
            await Promise.all(
              childSitemaps.map(child =>
                getSitemapUrls(child, depth + 1)
              )
            );

          return childResults.flat();
        }

        // Normal URL sitemap
        return locs.filter(url =>
          url.startsWith(SITE_URL)
        );

      } catch (error) {
        console.error(
          "Sitemap error:",
          sitemapUrl,
          error.message
        );

        return [];
      }
    }

    // ============================================================
    // GET ALL HIRA ACADEMY URLs
    // ============================================================
    let siteUrls = await getSitemapUrls(
      SITEMAP_URL
    );

    siteUrls = [
      ...new Set(
        siteUrls.filter(url =>
          url.startsWith(SITE_URL)
        )
      )
    ];

    // Don't let an accidentally huge sitemap overload the API
    siteUrls = siteUrls.slice(0, 100);

    // ============================================================
    // FETCH HTML AND EXTRACT REAL PAGE CONTENT
    // ============================================================
    function extractPageContent(html) {
      // Title
      const titleMatch = html.match(
        /<title[^>]*>([\s\S]*?)<\/title>/i
      );

      const title = titleMatch
        ? titleMatch[1]
            .replace(/<[^>]+>/g, " ")
            .trim()
        : "";

      // Description
      const descriptionMatch =
        html.match(
          /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
        ) ||
        html.match(
          /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i
        );

      const description =
        descriptionMatch
          ? descriptionMatch[1]
          : "";

      // Prefer body content
      let content = html;

      const bodyMatch = html.match(
        /<body[^>]*>([\s\S]*?)<\/body>/i
      );

      if (bodyMatch) {
        content = bodyMatch[1];
      }

      // Remove things that aren't educational content
      content = content
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
        .replace(
          /<nav\b[^>]*>[\s\S]*?<\/nav>/gi,
          " "
        )
        .replace(
          /<footer\b[^>]*>[\s\S]*?<\/footer>/gi,
          " "
        )
        .replace(
          /<header\b[^>]*>[\s\S]*?<\/header>/gi,
          " "
        );

      // Keep headings separated
      content = content
        .replace(
          /<\/(h1|h2|h3|h4|h5|h6)>/gi,
          "\n"
        )
        .replace(
          /<\/(p|li|div|section|article|tr)>/gi,
          "\n"
        );

      // Remove HTML
      content = content.replace(
        /<[^>]+>/g,
        " "
      );

      // Decode entities
      content = content
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");

      // Normalize whitespace
      content = content
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();

      return {
        title,
        description,
        content
      };
    }

    // ============================================================
    // FETCH PAGE
    // ============================================================
    async function fetchPage(url) {
      try {
        const response = await fetchWithTimeout(
          url,
          7000
        );

        if (!response.ok) {
          return null;
        }

        const html = await response.text();

        const extracted =
          extractPageContent(html);

        if (!extracted.content) {
          return null;
        }

        return {
          url,
          title: extracted.title,
          description: extracted.description,
          content: extracted.content
        };

      } catch (error) {
        console.error(
          "Page fetch failed:",
          url,
          error.message
        );

        return null;
      }
    }

    // ============================================================
    // FETCH PAGES IN BATCHES
    // ============================================================
    async function fetchPagesInBatches(
      urls,
      batchSize = 10
    ) {
      const results = [];

      for (
        let i = 0;
        i < urls.length;
        i += batchSize
      ) {
        const batch = urls.slice(
          i,
          i + batchSize
        );

        const batchResults =
          await Promise.all(
            batch.map(fetchPage)
          );

        results.push(
          ...batchResults.filter(Boolean)
        );

        // Don't fetch unnecessarily many pages
        if (results.length >= 60) {
          break;
        }
      }

      return results;
    }

    // ============================================================
    // FETCH SITE CONTENT
    // ============================================================
    const pages = await fetchPagesInBatches(
      siteUrls,
      10
    );

    // ============================================================
    // SCORE ACTUAL PAGE CONTENT
    // ============================================================
    function scorePage(page) {
      const titleNormalized =
        normalize(page.title);

      const descriptionNormalized =
        normalize(page.description);

      const contentNormalized =
        normalize(page.content);

      const urlNormalized =
        normalize(page.url);

      let score = 0;

      // ----------------------------------------------------------
      // EXACT QUESTION PHRASE
      // ----------------------------------------------------------
      if (
        questionNormalized.length >= 8 &&
        contentNormalized.includes(
          questionNormalized
        )
      ) {
        score += 100;
      }

      // ----------------------------------------------------------
      // QUESTION PHRASE WITHOUT STOP WORDS
      // Example:
      // "right hand grip rule"
      // ----------------------------------------------------------
      const importantPhrase =
        questionKeywords.join(" ");

      if (
        importantPhrase.length >= 8 &&
        contentNormalized.includes(
          importantPhrase
        )
      ) {
        score += 80;
      }

      // ----------------------------------------------------------
      // INDIVIDUAL KEYWORD MATCHES
      // ----------------------------------------------------------
      for (const keyword of questionKeywords) {
        if (
          titleNormalized.includes(keyword)
        ) {
          score += 15;
        }

        if (
          descriptionNormalized.includes(keyword)
        ) {
          score += 8;
        }

        if (
          contentNormalized.includes(keyword)
        ) {
          score += 5;
        }

        if (
          urlNormalized.includes(keyword)
        ) {
          score += 3;
        }
      }

      // ----------------------------------------------------------
      // SUBJECT DETECTION
      // ----------------------------------------------------------
      if (
        questionNormalized.includes("physics")
      ) {
        if (
          contentNormalized.includes("physics")
        ) {
          score += 20;
        }

        if (
          urlNormalized.includes("physics")
        ) {
          score += 10;
        }
      }

      if (
        questionNormalized.includes("math") ||
        questionNormalized.includes("mathematics")
      ) {
        if (
          contentNormalized.includes("mathematics") ||
          contentNormalized.includes("mathematics")
        ) {
          score += 20;
        }

        if (
          urlNormalized.includes("math")
        ) {
          score += 10;
        }
      }

      // ----------------------------------------------------------
      // 2026 PRIORITY
      // ----------------------------------------------------------
      if (
        titleNormalized.includes("2026") ||
        urlNormalized.includes("2026") ||
        contentNormalized.includes("2026")
      ) {
        score += 10;
      }

      // ----------------------------------------------------------
      // CHAPTER / UNIT DETECTION
      // ----------------------------------------------------------
      const chapterMatch =
        questionNormalized.match(
          /chapter\s+(\d+)/
        );

      const unitMatch =
        questionNormalized.match(
          /unit\s+(\d+)/
        );

      if (chapterMatch) {
        const chapterNumber =
          chapterMatch[1];

        if (
          contentNormalized.includes(
            `chapter ${chapterNumber}`
          ) ||
          urlNormalized.includes(
            `chapter${chapterNumber}`
          ) ||
          urlNormalized.includes(
            `chapter ${chapterNumber}`
          )
        ) {
          score += 50;
        }
      }

      if (unitMatch) {
        const unitNumber =
          unitMatch[1];

        if (
          contentNormalized.includes(
            `unit ${unitNumber}`
          ) ||
          urlNormalized.includes(
            `unit${unitNumber}`
          ) ||
          urlNormalized.includes(
            `unit ${unitNumber}`
          )
        ) {
          score += 50;
        }
      }

      // ----------------------------------------------------------
      // EDUCATIONAL PAGE BONUS
      // ----------------------------------------------------------
      const educationalTerms = [
        "short questions",
        "constructed response",
        "comprehensive questions",
        "exercise",
        "numerical problems",
        "mcqs",
        "multiple choice",
        "notes",
        "textbook",
        "chapter",
        "unit",
        "answer",
        "solution"
      ];

      for (const term of educationalTerms) {
        if (
          contentNormalized.includes(term)
        ) {
          score += 1;
        }
      }

      return score;
    }

    // ============================================================
    // RANK PAGES
    // ============================================================
    const rankedPages = pages
      .map(page => ({
        ...page,
        score: scorePage(page)
      }))
      .sort(
        (a, b) => b.score - a.score
      );

    // ============================================================
    // EXTRACT RELEVANT SNIPPETS
    // ============================================================
    function extractRelevantSnippets(
      page,
      maxSnippets = 5
    ) {
      const text = page.content;

      // Keep line structure from extracted page
      const lines = text
        .split(/\n+/)
        .map(line => line.trim())
        .filter(line => line.length > 20);

      const normalizedLines =
        lines.map(line => ({
          original: line,
          normalized: normalize(line)
        }));

      const matched = [];

      for (
        const line of normalizedLines
      ) {
        let lineScore = 0;

        for (
          const keyword of questionKeywords
        ) {
          if (
            line.normalized.includes(keyword)
          ) {
            lineScore += 1;
          }
        }

        if (
          line.normalized.includes(
            questionNormalized
          )
        ) {
          lineScore += 20;
        }

        if (lineScore > 0) {
          matched.push({
            line: line.original,
            score: lineScore
          });
        }
      }

      matched.sort(
        (a, b) => b.score - a.score
      );

      return matched
        .slice(0, maxSnippets)
        .map(item => item.line);
    }

    // ============================================================
    // SELECT BEST PAGES
    // ============================================================
    const relevantPages =
      rankedPages
        .filter(page => page.score > 0)
        .slice(0, 8);

    // ============================================================
    // BUILD SOURCE CONTEXT
    // ============================================================
    let sourceContext = "";

    for (
      const page of relevantPages
    ) {
      const snippets =
        extractRelevantSnippets(
          page,
          6
        );

      // Use snippets when available.
      // Otherwise use first part of content.
      let usefulContent =
        snippets.length > 0
          ? snippets.join("\n")
          : page.content.substring(
              0,
              5000
            );

      // Limit each page
      usefulContent =
        usefulContent.substring(
          0,
          7000
        );

      sourceContext += `

==================================================
HIRA ACADEMY SOURCE
==================================================
TITLE: ${page.title}
URL: ${page.url}
RELEVANCE SCORE: ${page.score}

CONTENT:
${usefulContent}

`;
    }

    // ============================================================
    // IF NO RELEVANT SOURCE FOUND
    // ============================================================
    const hasRelevantSource =
      relevantPages.length > 0 &&
      relevantPages[0].score >= 5;

    if (!hasRelevantSource) {
      sourceContext = `
No sufficiently relevant Hira Academy page was found
for this exact question.

Do NOT pretend that a Hira Academy source was found.
`;
    }

    // Keep context safely bounded
    sourceContext =
      sourceContext.substring(
        0,
        45000
      );

    // ============================================================
    // BUILD GEMINI CONVERSATION
    // ============================================================
    const contents = messages
      .map(message => ({
        role:
          message.role === "user"
            ? "user"
            : "model",
        parts: [
          {
            text:
              message.content || ""
          }
        ]
      }))
      // Gemini should not receive an empty conversation
      .filter(
        message =>
          message.parts[0].text.trim()
            .length > 0
      );

    // ============================================================
    // SYSTEM INSTRUCTION
    // ============================================================
    const systemInstruction = {
      parts: [
        {
          text: `
You are the official Hira Academy Assistant.

You help students studying Class 9 and Class 10,
especially Punjab PECTAA / BISE Punjab Physics
and Mathematics.

==================================================
MOST IMPORTANT RULE
==================================================

Hira Academy website content is the PRIMARY source.

When relevant Hira Academy content is provided below,
answer from that content.

Do NOT replace Hira Academy's current material with
old textbook knowledge or unrelated general knowledge.

==================================================
SOURCE ACCURACY
==================================================

- Use the supplied Hira Academy content as the factual
  source for academic answers.
- Do not invent statements and attribute them to Hira Academy.
- Do not say that something is from Hira Academy unless
  it is present in the supplied source.
- If the relevant information is not found in the supplied
  Hira Academy sources, say:

  "I couldn't find this information in the current
   Hira Academy material."

- You may then give a general explanation only when it is
  clearly identified as general information, not Hira
  Academy source material.

==================================================
EXAM CONTENT
==================================================

For questions about:
- Short Questions
- Comprehensive Questions
- Constructed Response Questions
- MCQs
- Numerical Problems
- Definitions
- Formulas
- Exercises
- Chapter questions
- Unit questions

stay as close as possible to the Hira Academy source
wording and terminology.

Do not unnecessarily rewrite textbook answers.

==================================================
CURRENT CONTENT
==================================================

Prefer 2026 Hira Academy material when it is available.

If an older and newer Hira Academy source conflict,
prefer the newer/current 2026 material.

==================================================
ANSWER STYLE
==================================================

For a simple question:
Give a direct, concise answer.

For an exam question:
Give the answer in appropriate board-exam style.

For a definition:
Give the definition directly.

For a formula:
Show the formula clearly.

For a "why" question:
Give the reason directly.

Do not give unnecessary long explanations unless the
student asks for detail.

==================================================
SOURCE
==================================================

When a Hira Academy page was actually used, add:

Source: Hira Academy
[page URL]

at the end of the answer.

Do not add a source URL that was not supplied below.

==================================================
CURRENT HIRA ACADEMY SOURCE MATERIAL
==================================================

${sourceContext}
`
        }
      ]
    };

    // ============================================================
    // GEMINI API
    // ============================================================
    const geminiResponse =
      await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "x-goog-api-key":
              apiKey
          },
          body: JSON.stringify({
            systemInstruction,
            contents
          })
        }
      );

    const data =
      await geminiResponse.json();

    // ============================================================
    // GEMINI ERROR
    // ============================================================
    if (!geminiResponse.ok) {
      console.error(
        "Gemini API Error:",
        data
      );

      return res
        .status(geminiResponse.status)
        .json({
          error:
            data.error?.message ||
            "Gemini API Error"
        });
    }

    // ============================================================
    // EXTRACT RESPONSE
    // ============================================================
    const replyText =
      data.candidates?.[0]
        ?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim() ||
      "No response returned from Gemini.";

    // ============================================================
    // RETURN
    // ============================================================
    return res.status(200).json({
      reply: replyText
    });

  } catch (error) {
    console.error(
      "Hira Academy chatbot error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Internal Server Error"
    });
  }
}
