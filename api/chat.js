export default async function handler(req, res) {
  // =========================================================
  // CORS
  // =========================================================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
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
          error: "Invalid JSON payload."
        });
      }
    }

    const messages = Array.isArray(body?.messages)
      ? body.messages
      : [];

    if (!messages.length) {
      return res.status(400).json({
        error: "No messages array provided."
      });
    }

    const userMessages = messages.filter(
      m => m?.role === "user" && typeof m?.content === "string"
    );

    const latestUserMessage =
      userMessages[userMessages.length - 1];

    const question =
      latestUserMessage?.content?.trim();

    if (!question) {
      return res.status(400).json({
        error: "No user question provided."
      });
    }

    const SITE = "https://hiraacademy.com.pk";
    const SITEMAP = `${SITE}/sitemap.xml`;

    // =========================================================
    // NORMALIZE TEXT
    // =========================================================
    function normalize(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, " and ")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/<[^>]*>/g, " ")
        .replace(/[^\p{L}\p{N}.\s-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const normalizedQuestion = normalize(question);

    // =========================================================
    // DETECT FOLLOW-UP
    //
    // Only short contextual questions continue the previous
    // topic. A new independent question gets a fresh search.
    // =========================================================
    function isFollowUp(text) {
      const x = normalize(text);

      return (
        /^(why|why\??|how|how\??|explain|explain it|explain this|what does this mean|what is meant by this|tell me more|more details|continue|solve it|solve this|answer it|give more|give more detail|its meaning|meaning)\s*[?.!]*$/i.test(x)
      );
    }

    const followUp = isFollowUp(question);

    let searchQuery = question;

    if (followUp && userMessages.length >= 2) {
      const previousQuestion =
        userMessages[userMessages.length - 2]?.content || "";

      searchQuery =
        `${previousQuestion} ${question}`;
    }

    // =========================================================
    // CLASS DETECTION
    // =========================================================
    function detectClass(text) {
      const x = normalize(text);

      if (
        /\bclass\s*10\b/.test(x) ||
        /\b10th\b/.test(x) ||
        /\bgrade\s*10\b/.test(x)
      ) {
        return 10;
      }

      if (
        /\bclass\s*9\b/.test(x) ||
        /\b9th\b/.test(x) ||
        /\bgrade\s*9\b/.test(x)
      ) {
        return 9;
      }

      return null;
    }

    // =========================================================
    // SUBJECT DETECTION
    // =========================================================
    function detectSubject(text) {
      const x = normalize(text);

      if (
        /\bmath\b/.test(x) ||
        /\bmaths\b/.test(x) ||
        /\bmathematics\b/.test(x) ||
        /\balgebra\b/.test(x) ||
        /\bmatrix\b/.test(x) ||
        /\bmatrices\b/.test(x) ||
        /\bdeterminant\b/.test(x) ||
        /\bvector\b/.test(x) ||
        /\bvectors\b/.test(x) ||
        /\btrigonometry\b/.test(x) ||
        /\bprobability\b/.test(x) ||
        /\bgeometry\b/.test(x)
      ) {
        return "math";
      }

      if (
        /\bphysics\b/.test(x) ||
        /\belectromagnetism\b/.test(x) ||
        /\belectromagnetic\b/.test(x) ||
        /\bmagnetic\b/.test(x) ||
        /\bmagnetic field\b/.test(x) ||
        /\bsolenoid\b/.test(x) ||
        /\bfleming\b/.test(x) ||
        /\bfaraday\b/.test(x) ||
        /\blenz\b/.test(x) ||
        /\bmotor\b/.test(x) ||
        /\bgenerator\b/.test(x) ||
        /\btransformer\b/.test(x) ||
        /\bdiode\b/.test(x) ||
        /\bsemiconductor\b/.test(x) ||
        /\bradiation\b/.test(x) ||
        /\bnuclear\b/.test(x) ||
        /\bcoriolis\b/.test(x) ||
        /\bforce\b/.test(x) ||
        /\bmagnet\b/.test(x)
      ) {
        return "physics";
      }

      return null;
    }

    // =========================================================
    // EXERCISE DETECTION
    // =========================================================
    function detectExercise(text) {
      const x = normalize(text);

      const match = x.match(
        /\bexercise\s+(\d{1,2})\.(\d{1,2})\b/
      );

      if (!match) return null;

      return {
        unit: Number(match[1]),
        exercise: Number(match[2])
      };
    }

    // =========================================================
    // CHAPTER DETECTION
    // =========================================================
    function detectChapter(text) {
      const x = normalize(text);

      const match = x.match(
        /\bchapter\s+(\d{1,2})\b/
      );

      return match ? Number(match[1]) : null;
    }

    const grade = detectClass(searchQuery);
    const subject = detectSubject(searchQuery);
    const exercise = detectExercise(searchQuery);
    const chapter = detectChapter(searchQuery);

    // =========================================================
    // FETCH WITH TIMEOUT
    // =========================================================
    async function fetchUrl(url, timeoutMs = 8000) {
      const controller = new AbortController();

      const timer = setTimeout(
        () => controller.abort(),
        timeoutMs
      );

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Hira-Academy-AI/1.0",
            "Accept":
              "text/html,application/xhtml+xml,application/xml"
          }
        });

        if (!response.ok) {
          return null;
        }

        return {
          url,
          text: await response.text()
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }

    // =========================================================
    // XML SITEMAP URL EXTRACTION
    // =========================================================
    function extractSitemapUrls(xml) {
      const urls = [];

      const matches =
        String(xml || "").match(
          /<loc>\s*([^<]+)\s*<\/loc>/gi
        ) || [];

      for (const item of matches) {
        const match =
          item.match(
            /<loc>\s*([^<]+)\s*<\/loc>/i
          );

        if (!match) continue;

        const url = match[1].trim();

        if (!url.startsWith(SITE)) continue;

        if (
          /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip)$/i.test(url)
        ) {
          continue;
        }

        urls.push(url);
      }

      return [...new Set(urls)];
    }

    // =========================================================
    // GET SITEMAP
    // =========================================================
    const sitemapResponse =
      await fetchUrl(SITEMAP, 7000);

    let siteUrls = [];

    if (sitemapResponse) {
      siteUrls =
        extractSitemapUrls(
          sitemapResponse.text
        );
    }

    // =========================================================
    // FALLBACK IMPORTANT HUB PAGES
    // =========================================================
    const fallbackPages = [
      `${SITE}/`,
      `${SITE}/Physics-10th-New-2026.html`,
      `${SITE}/Physics-9th.html`,
      `${SITE}/Mathematics-10th-New-2026.html`,
      `${SITE}/Mathematics-9th.html`,
      `${SITE}/9th-class-notes.html`,
      `${SITE}/10th-class-notes.html`
    ];

    siteUrls = [
      ...new Set([
        ...siteUrls,
        ...fallbackPages
      ])
    ];

    // =========================================================
    // SCORE URLS BEFORE FETCHING
    // =========================================================
    function scoreUrl(url) {
      const x = normalize(url);

      let score = 0;

      // -------------------------------------------------------
      // SUBJECT
      // -------------------------------------------------------
      if (subject === "physics") {
        if (x.includes("physics")) score += 250;
      }

      if (subject === "math") {
        if (
          x.includes("math") ||
          x.includes("mathematics")
        ) {
          score += 250;
        }
      }

      // -------------------------------------------------------
      // CLASS
      // -------------------------------------------------------
      if (grade === 10) {
        if (
          x.includes("10th") ||
          x.includes("class-10") ||
          x.includes("class10")
        ) {
          score += 150;
        }
      }

      if (grade === 9) {
        if (
          x.includes("9th") ||
          x.includes("class-9") ||
          x.includes("class9")
        ) {
          score += 150;
        }
      }

      // -------------------------------------------------------
      // EXERCISE
      // -------------------------------------------------------
      if (exercise) {
        const unit = String(exercise.unit);
        const ex = String(exercise.exercise);

        if (x.includes("exercise")) {
          score += 100;
        }

        if (
          x.includes(`unit${unit}`) ||
          x.includes(`unit-${unit}`)
        ) {
          score += 100;
        }

        if (
          x.includes(`exercise${ex}`) ||
          x.includes(`exercise-${ex}`)
        ) {
          score += 250;
        }

        if (
          x.includes(`exercise${unit}.${ex}`) ||
          x.includes(`exercise-${unit}-${ex}`)
        ) {
          score += 800;
        }
      }

      // -------------------------------------------------------
      // CHAPTER
      // -------------------------------------------------------
      if (chapter) {
        if (
          x.includes(`chapter${chapter}`) ||
          x.includes(`chapter-${chapter}`) ||
          x.includes(`chapter_${chapter}`)
        ) {
          score += 500;
        }
      }

      // -------------------------------------------------------
      // QUESTION KEYWORDS
      // -------------------------------------------------------
      const words =
        normalize(searchQuery)
          .split(/\s+/)
          .filter(
            word => word.length >= 4
          );

      for (const word of words) {
        if (x.includes(word)) {
          score += 10;
        }
      }

      return score;
    }

    const rankedUrls =
      siteUrls
        .map(url => ({
          url,
          score: scoreUrl(url)
        }))
        .sort(
          (a, b) => b.score - a.score
        );

    // =========================================================
    // FETCH CANDIDATE PAGES
    // =========================================================
    // Only fetch the most likely pages.
    // This prevents unnecessary requests.
    // =========================================================
    const candidateUrls =
      rankedUrls
        .slice(0, 30)
        .map(x => x.url);

    const fetched =
      (
        await Promise.all(
          candidateUrls.map(
            url => fetchUrl(url, 7000)
          )
        )
      ).filter(Boolean);

    // =========================================================
    // HTML → TEXT
    // =========================================================
    function htmlToText(html) {
      return String(html || "")
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
          /<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|tr)>/gi,
          "\n"
        )
        .replace(
          /<br\s*\/?>/gi,
          "\n"
        )
        .replace(
          /<[^>]+>/g,
          " "
        )
        .replace(
          /&nbsp;/gi,
          " "
        )
        .replace(
          /&amp;/gi,
          "&"
        )
        .replace(
          /&quot;/gi,
          '"'
        )
        .replace(
          /&#39;/gi,
          "'"
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();
    }

    // =========================================================
    // GET TITLE
    // =========================================================
    function getTitle(html) {
      const match =
        String(html || "").match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        );

      return match
        ? htmlToText(match[1])
        : "";
    }

    // =========================================================
    // SCORE PAGE CONTENT
    // =========================================================
    function scorePage(page) {
      const title =
        normalize(
          getTitle(page.text)
        );

      const content =
        normalize(
          htmlToText(page.text)
        );

      const url =
        normalize(page.url);

      let score = 0;

      // -------------------------------------------------------
      // SUBJECT
      // -------------------------------------------------------
      if (subject === "physics") {
        if (
          title.includes("physics") ||
          url.includes("physics")
        ) {
          score += 250;
        }
      }

      if (subject === "math") {
        if (
          title.includes("math") ||
          title.includes("mathematics") ||
          url.includes("math")
        ) {
          score += 250;
        }
      }

      // -------------------------------------------------------
      // CLASS
      // -------------------------------------------------------
      if (grade === 10) {
        if (
          title.includes("10th") ||
          title.includes("class 10") ||
          url.includes("10th")
        ) {
          score += 150;
        }
      }

      if (grade === 9) {
        if (
          title.includes("9th") ||
          title.includes("class 9") ||
          url.includes("9th")
        ) {
          score += 150;
        }
      }

      // -------------------------------------------------------
      // EXERCISE
      // -------------------------------------------------------
      if (exercise) {
        const exact =
          `exercise ${exercise.unit}.${exercise.exercise}`;

        if (title.includes(exact)) {
          score += 1500;
        }

        if (content.includes(exact)) {
          score += 600;
        }

        if (
          url.includes("exercise") &&
          url.includes(
            String(exercise.unit)
          ) &&
          url.includes(
            String(exercise.exercise)
          )
        ) {
          score += 1000;
        }
      }

      // -------------------------------------------------------
      // CHAPTER
      // -------------------------------------------------------
      if (chapter) {
        if (
          title.includes(
            `chapter ${chapter}`
          )
        ) {
          score += 600;
        }

        if (
          content.includes(
            `chapter ${chapter}`
          )
        ) {
          score += 250;
        }
      }

      // -------------------------------------------------------
      // SEARCH TERMS
      // -------------------------------------------------------
      const words =
        normalize(searchQuery)
          .split(/\s+/)
          .filter(
            word =>
              word.length >= 4
          );

      for (const word of words) {
        if (title.includes(word)) {
          score += 60;
        }

        if (content.includes(word)) {
          score += 15;
        }
      }

      return {
        ...page,
        title,
        content,
        score
      };
    }

    const rankedPages =
      fetched
        .map(scorePage)
        .sort(
          (a, b) =>
            b.score - a.score
        );

    // =========================================================
    // BEST MATCH
    // =========================================================
    const bestPage =
      rankedPages[0];

    // =========================================================
    // NO WEBSITE RESULT
    // =========================================================
    if (
      !bestPage ||
      bestPage.score < 20
    ) {
      // =======================================================
      // GEMINI FALLBACK
      // =======================================================
      return await askGeminiWithoutWebsite(
        question,
        messages,
        apiKey,
        res
      );
    }

    // =========================================================
    // BUILD RELEVANT SOURCE CONTEXT
    // =========================================================
    const relevantPages =
      rankedPages
        .filter(
          page =>
            page.score >=
            Math.max(
              20,
              bestPage.score - 120
            )
        )
        .slice(0, 4);

    let sourceContext = "";

    for (const page of relevantPages) {
      sourceContext += `
==================================================
HIRA ACADEMY SOURCE
==================================================

TITLE:
${page.title}

URL:
${page.url}

CONTENT:
${page.content.substring(0, 18000)}

==================================================
`;
    }

    // =========================================================
    // DIRECT ANSWER CHECK
    //
    // If the question looks like a simple definition/fact
    // and the relevant page clearly contains the words,
    // Gemini is still used to format the answer, but ONLY
    // using Hira Academy content.
    //
    // This keeps answers faithful to your website.
    // =========================================================

    const geminiContents =
      messages
        .slice(-8)
        .map(m => ({
          role:
            m.role === "user"
              ? "user"
              : "model",
          parts: [
            {
              text:
                m.content || ""
            }
          ]
        }))
        .filter(
          m =>
            m.parts[0].text.trim()
        );

    // =========================================================
    // GEMINI WITH HIRA SOURCE
    // =========================================================
    const systemInstruction = {
      parts: [
        {
          text: `
You are the official AI teaching assistant for Hira Academy.

Website:
${SITE}

==================================================
MOST IMPORTANT RULE
==================================================

Hira Academy is the PRIMARY and AUTHORITATIVE SOURCE.

Answer the student's question using ONLY the Hira Academy
source material supplied below.

Do NOT replace Hira Academy's current material with old
pretrained knowledge.

Do NOT invent textbook wording.

Do NOT invent chapters, exercises, answers, URLs or facts.

If the source contains the answer, use it.

If the source does NOT contain the answer, clearly say:

"I couldn't find this information in the current Hira Academy material."

==================================================
NEW QUESTION RULE
==================================================

Every independent question gets a fresh website search.

For example:

Student:
exercise 6.2 math 10

Then:

Student:
What is the right hand grip rule?

The second question is a NEW question.

Do NOT continue using Exercise 6.2.

==================================================
FOLLOW-UP RULE
==================================================

Only use previous context when the latest question is
clearly a follow-up, such as:

why?
explain it
explain this
what does this mean?
solve it
give more detail
tell me more

==================================================
SOURCE LINK
==================================================

The backend will add the source link.

Do NOT create a fake URL.

==================================================
ANSWER STYLE
==================================================

For definitions:
Give the definition from Hira Academy.

For short questions:
Give a concise direct answer.

For exercises:
Use the actual Hira Academy exercise material.

For mathematical solutions:
Preserve formulas and mathematical notation.

For Physics:
Use Hira Academy terminology.

Do not add unnecessary outside information.

==================================================
STUDENT QUESTION
==================================================

${question}

==================================================
HIRA ACADEMY SOURCE MATERIAL
==================================================

${sourceContext}
`
        }
      ]
    };

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
            contents: geminiContents,

            generationConfig: {
              temperature: 0.15,
              maxOutputTokens: 1000
            }
          })
        }
      );

    const data =
      await geminiResponse.json();

    if (!geminiResponse.ok) {
      // =======================================================
      // IF GEMINI QUOTA IS EXCEEDED, STILL RETURN WEBSITE
      // CONTENT INSTEAD OF A DEAD CHATBOT.
      // =======================================================
      if (
        data?.error?.message
          ?.toLowerCase()
          .includes("quota")
      ) {
        const fallbackAnswer =
          extractWebsiteAnswer(
            bestPage.content,
            question
          );

        return res.status(200).json({
          reply:
            fallbackAnswer ||
            `I found relevant Hira Academy material, but the AI explanation service is temporarily unavailable.\n\n**Source: Hira Academy**\n[Open the original Hira Academy page](${bestPage.url})`,
          sourceUrl: bestPage.url,
          sourceTitle: bestPage.title,
          quotaExceeded: true
        });
      }

      return res.status(
        geminiResponse.status
      ).json({
        error:
          data?.error?.message ||
          "Gemini API Error"
      });
    }

    let reply =
      data?.candidates?.[0]
        ?.content?.parts
        ?.map(
          part =>
            part.text || ""
        )
        .join("")
        .trim();

    if (!reply) {
      reply =
        "I couldn't find this information in the current Hira Academy material.";
    }

    // =========================================================
    // SOURCE LINK
    // =========================================================
    reply +=
      `\n\n---\n**Source: Hira Academy**  \n[Open the original Hira Academy page](${bestPage.url})`;

    return res.status(200).json({
      reply,
      sourceUrl: bestPage.url,
      sourceTitle: bestPage.title
    });

  } catch (error) {
    console.error(
      "Hira Academy Assistant Error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Internal Server Error"
    });
  }
}


// =============================================================
// GEMINI FALLBACK WHEN WEBSITE SEARCH FINDS NOTHING
// =============================================================
async function askGeminiWithoutWebsite(
  question,
  messages,
  apiKey,
  res
) {
  const contents =
    messages
      .slice(-8)
      .map(m => ({
        role:
          m.role === "user"
            ? "user"
            : "model",
        parts: [
          {
            text:
              m.content || ""
          }
        ]
      }))
      .filter(
        m =>
          m.parts[0].text.trim()
      );

  const systemInstruction = {
    parts: [
      {
        text: `
You are the Hira Academy Assistant.

The Hira Academy website search did not find enough
material to answer this question.

Do not pretend the answer came from Hira Academy.

If you can answer using general educational knowledge,
give a concise answer.

Clearly state that the answer was not found in the
current Hira Academy material.

Do not invent a Hira Academy source URL.

Student question:

${question}
`
      }
    ]
  };

  try {
    const response =
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
            contents,

            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 700
            }
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      if (
        data?.error?.message
          ?.toLowerCase()
          .includes("quota")
      ) {
        return res.status(200).json({
          reply:
            "Hira Academy does not currently contain enough material for this question, and the AI explanation service has temporarily reached its usage limit.",
          quotaExceeded: true
        });
      }

      return res.status(
        response.status
      ).json({
        error:
          data?.error?.message ||
          "Gemini API Error"
      });
    }

    const reply =
      data?.candidates?.[0]
        ?.content?.parts
        ?.map(
          part =>
            part.text || ""
        )
        .join("")
        .trim();

    return res.status(200).json({
      reply:
        reply ||
        "I couldn't find this information in the current Hira Academy material."
    });

  } catch (error) {
    console.error(
      "Gemini fallback error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to connect to the AI service."
    });
  }
}


// =============================================================
// BASIC WEBSITE ANSWER EXTRACTION
// Used if Gemini quota is exhausted.
// =============================================================
function extractWebsiteAnswer(
  content,
  question
) {
  const text =
    String(content || "")
      .replace(/\s+/g, " ")
      .trim();

  if (!text) return null;

  const q =
    String(question || "")
      .toLowerCase()
      .trim();

  // -----------------------------------------------------------
  // Try to find definition/answer sentences containing
  // important words from the question.
  // -----------------------------------------------------------
  const stopWords = new Set([
    "what",
    "is",
    "are",
    "the",
    "a",
    "an",
    "of",
    "in",
    "on",
    "for",
    "to",
    "and",
    "does",
    "do",
    "why",
    "how",
    "define",
    "explain",
    "this",
    "that",
    "rule"
  ]);

  const words =
    q
      .split(/\s+/)
      .filter(
        word =>
          word.length >= 4 &&
          !stopWords.has(word)
      );

  if (!words.length) {
    return null;
  }

  const sentences =
    text
      .split(
        /(?<=[.!?])\s+/
      );

  const matches =
    sentences.filter(sentence => {
      const s =
        sentence.toLowerCase();

      let count = 0;

      for (const word of words) {
        if (s.includes(word)) {
          count++;
        }
      }

      return count >=
        Math.min(
          2,
          words.length
        );
    });

  if (!matches.length) {
    return null;
  }

  return (
    "**According to Hira Academy:**\n\n" +
    matches
      .slice(0, 3)
      .join(" ")
  );
}
