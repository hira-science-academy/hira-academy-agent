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
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing on Vercel."
      });
    }

    // =======================================================
    // REQUEST
    // =======================================================
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
      m =>
        m &&
        m.role === "user" &&
        typeof m.content === "string" &&
        m.content.trim()
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

    // =======================================================
    // TEXT NORMALIZATION
    // =======================================================
    function normalize(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, " and ")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/<[^>]*>/g, " ")
        .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // =======================================================
    // DETECT WHETHER THIS IS A NEW QUESTION
    // =======================================================
    function isShortFollowUp(text) {
      const x = normalize(text);

      return (
        /^(why|how|explain|explain this|explain it|what does this mean|what is meant by this|tell me more|more details|more detail|continue|solve it|solve this|answer it|give more|give more detail|meaning)\??$/.test(x)
      );
    }

    const isFollowUp =
      isShortFollowUp(question);

    // =======================================================
    // SEARCH QUERY
    //
    // IMPORTANT:
    // An independent question gets a fresh search.
    // =======================================================
    let searchQuestion = question;

    if (
      isFollowUp &&
      userMessages.length >= 2
    ) {
      searchQuestion =
        `${userMessages[userMessages.length - 2].content} ${question}`;
    }

    // =======================================================
    // CLASS
    // =======================================================
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

    // =======================================================
    // SUBJECT
    // =======================================================
    function detectSubject(text) {
      const x = normalize(text);

      if (
        /\bmath\b/.test(x) ||
        /\bmaths\b/.test(x) ||
        /\bmathematics\b/.test(x) ||
        /\balgebra\b/.test(x) ||
        /\bmatrix\b/.test(x) ||
        /\bmatrices\b/.test(x) ||
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

    // =======================================================
    // EXERCISE
    // =======================================================
    function detectExercise(text) {
      const x = normalize(text);

      const match =
        x.match(
          /\bexercise\s+(\d{1,2})\.(\d{1,2})\b/
        );

      if (!match) {
        return null;
      }

      return {
        unit: Number(match[1]),
        exercise: Number(match[2])
      };
    }

    // =======================================================
    // CHAPTER
    // =======================================================
    function detectChapter(text) {
      const x = normalize(text);

      const match =
        x.match(
          /\bchapter\s+(\d{1,2})\b/
        );

      return match
        ? Number(match[1])
        : null;
    }

    const grade =
      detectClass(searchQuestion);

    const subject =
      detectSubject(searchQuestion);

    const exercise =
      detectExercise(searchQuestion);

    const chapter =
      detectChapter(searchQuestion);

    // =======================================================
    // IMPORTANT SEARCH WORDS
    // =======================================================
    const STOP_WORDS = new Set([
      "what",
      "what's",
      "whats",
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
      "or",
      "does",
      "do",
      "why",
      "how",
      "can",
      "could",
      "would",
      "should",
      "please",
      "tell",
      "me",
      "about",
      "explain",
      "define",
      "definition",
      "give",
      "show",
      "find",
      "class",
      "grade",
      "10th",
      "9th",
      "math",
      "maths",
      "mathematics",
      "physics",
      "chapter",
      "exercise"
    ]);

    function getSearchTerms(text) {
      return [
        ...new Set(
          normalize(text)
            .split(/\s+/)
            .map(x => x.trim())
            .filter(
              x =>
                x.length >= 3 &&
                !STOP_WORDS.has(x)
            )
        )
      ];
    }

    const searchTerms =
      getSearchTerms(searchQuestion);

    // =======================================================
    // FETCH WITH TIMEOUT
    // =======================================================
    async function fetchUrl(
      url,
      timeout = 7000
    ) {
      const controller =
        new AbortController();

      const timer =
        setTimeout(
          () => controller.abort(),
          timeout
        );

      try {
        const response =
          await fetch(url, {
            signal: controller.signal,
            headers: {
              "User-Agent":
                "Hira-Academy-Assistant/1.0",
              "Accept":
                "text/html,application/xhtml+xml,application/xml"
            }
          });

        if (!response.ok) {
          return null;
        }

        const text =
          await response.text();

        return {
          url,
          text
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }

    // =======================================================
    // SITEMAP
    // =======================================================
    function extractUrlsFromSitemap(xml) {
      const result = [];

      const matches =
        String(xml || "").match(
          /<loc>\s*([^<]+?)\s*<\/loc>/gi
        ) || [];

      for (const item of matches) {
        const match =
          item.match(
            /<loc>\s*([^<]+?)\s*<\/loc>/i
          );

        if (!match) continue;

        const url =
          match[1].trim();

        if (!url.startsWith(SITE)) {
          continue;
        }

        if (
          /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js)$/i.test(
            url
          )
        ) {
          continue;
        }

        result.push(url);
      }

      return [
        ...new Set(result)
      ];
    }

    const sitemap =
      await fetchUrl(
        SITEMAP,
        7000
      );

    let siteUrls = sitemap
      ? extractUrlsFromSitemap(
          sitemap.text
        )
      : [];

    // =======================================================
    // FALLBACK PAGES
    // =======================================================
    const fallbackPages = [
      `${SITE}/`,
      `${SITE}/9th-class-notes.html`,
      `${SITE}/10th-class-notes.html`,
      `${SITE}/Physics-9th.html`,
      `${SITE}/Physics-10th.html`,
      `${SITE}/Mathematics-9th.html`,
      `${SITE}/Mathematics-10th-New-2026.html`,
      `${SITE}/Mathematics-10th.html`
    ];

    siteUrls = [
      ...new Set([
        ...siteUrls,
        ...fallbackPages
      ])
    ];

    // =======================================================
    // URL PRE-FILTER
    //
    // This is ONLY used to reduce the number of pages fetched.
    // It does NOT decide the final answer.
    // =======================================================
    function urlLooksRelevant(url) {
      const x =
        normalize(url);

      let points = 0;

      if (subject === "physics") {
        if (x.includes("physics")) {
          points += 5;
        }
      }

      if (subject === "math") {
        if (
          x.includes("math") ||
          x.includes("mathematics")
        ) {
          points += 5;
        }
      }

      if (grade === 10) {
        if (
          x.includes("10th") ||
          x.includes("class-10") ||
          x.includes("class10")
        ) {
          points += 3;
        }
      }

      if (grade === 9) {
        if (
          x.includes("9th") ||
          x.includes("class-9") ||
          x.includes("class9")
        ) {
          points += 3;
        }
      }

      if (exercise) {
        if (
          x.includes("exercise") &&
          x.includes(
            String(exercise.exercise)
          )
        ) {
          points += 8;
        }

        if (
          x.includes(
            `unit${exercise.unit}`
          ) ||
          x.includes(
            `unit-${exercise.unit}`
          )
        ) {
          points += 5;
        }
      }

      if (chapter) {
        if (
          x.includes(
            `chapter${chapter}`
          ) ||
          x.includes(
            `chapter-${chapter}`
          )
        ) {
          points += 7;
        }
      }

      for (const term of searchTerms) {
        if (x.includes(term)) {
          points += 1;
        }
      }

      return points;
    }

    const prefiltered =
      siteUrls
        .map(url => ({
          url,
          points:
            urlLooksRelevant(url)
        }))
        .sort(
          (a, b) =>
            b.points - a.points
        );

    // Fetch enough pages to find actual content.
    const urlsToFetch =
      prefiltered
        .slice(0, 50)
        .map(x => x.url);

    const fetchedPages =
      (
        await Promise.all(
          urlsToFetch.map(
            url =>
              fetchUrl(
                url,
                6500
              )
          )
        )
      ).filter(Boolean);

    // =======================================================
    // HTML → CLEAN TEXT
    // =======================================================
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
          /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
          " "
        )
        .replace(
          /<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|tr|td|blockquote)>/gi,
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
          /&#x27;/gi,
          "'"
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();
    }

    function getTitle(html) {
      const match =
        String(html || "").match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        );

      return match
        ? htmlToText(match[1])
        : "";
    }

    // =======================================================
    // CONTENT MATCHING
    //
    // THIS IS THE IMPORTANT PART.
    //
    // The actual page text gets searched.
    // =======================================================
    function scoreContent(page) {
      const content =
        normalize(
          htmlToText(page.text)
        );

      const title =
        normalize(
          getTitle(page.text)
        );

      const url =
        normalize(page.url);

      let score = 0;

      // -------------------------------------------------------
      // SUBJECT
      // -------------------------------------------------------
      if (subject === "physics") {
        if (
          content.includes("physics") ||
          title.includes("physics") ||
          url.includes("physics")
        ) {
          score += 30;
        }
      }

      if (subject === "math") {
        if (
          content.includes("mathematics") ||
          content.includes("mathematics") ||
          title.includes("math") ||
          title.includes("mathematics") ||
          url.includes("math")
        ) {
          score += 30;
        }
      }

      // -------------------------------------------------------
      // CLASS
      // -------------------------------------------------------
      if (grade === 10) {
        if (
          content.includes("class 10") ||
          content.includes("10th class") ||
          title.includes("10th") ||
          url.includes("10th")
        ) {
          score += 20;
        }
      }

      if (grade === 9) {
        if (
          content.includes("class 9") ||
          content.includes("9th class") ||
          title.includes("9th") ||
          url.includes("9th")
        ) {
          score += 20;
        }
      }

      // -------------------------------------------------------
      // EXACT PHRASE MATCH
      // -------------------------------------------------------
      const exactPhrase =
        normalize(searchQuestion);

      if (
        exactPhrase.length >= 6 &&
        content.includes(exactPhrase)
      ) {
        score += 500;
      }

      // -------------------------------------------------------
      // SEARCH TERMS
      // -------------------------------------------------------
      let matchedTerms = 0;

      for (const term of searchTerms) {
        if (
          content.includes(term)
        ) {
          matchedTerms++;
          score += 20;
        }

        if (
          title.includes(term)
        ) {
          score += 40;
        }
      }

      // -------------------------------------------------------
      // PHRASE COMBINATIONS
      // -------------------------------------------------------
      for (
        let i = 0;
        i < searchTerms.length;
        i++
      ) {
        for (
          let j = i + 1;
          j < searchTerms.length;
          j++
        ) {
          const phrase =
            `${searchTerms[i]} ${searchTerms[j]}`;

          if (
            content.includes(phrase)
          ) {
            score += 70;
          }
        }
      }

      // -------------------------------------------------------
      // EXERCISE
      // -------------------------------------------------------
      if (exercise) {
        const exerciseText =
          `exercise ${exercise.unit}.${exercise.exercise}`;

        if (
          content.includes(
            exerciseText
          )
        ) {
          score += 500;
        }

        if (
          title.includes(
            exerciseText
          )
        ) {
          score += 800;
        }

        if (
          url.includes("exercise") &&
          url.includes(
            String(exercise.exercise)
          )
        ) {
          score += 200;
        }
      }

      // -------------------------------------------------------
      // CHAPTER
      // -------------------------------------------------------
      if (chapter) {
        if (
          content.includes(
            `chapter ${chapter}`
          )
        ) {
          score += 250;
        }

        if (
          title.includes(
            `chapter ${chapter}`
          )
        ) {
          score += 500;
        }
      }

      // -------------------------------------------------------
      // SPECIAL HIGH-VALUE PHYSICS TERMS
      // -------------------------------------------------------
      const physicsTerms = [
        "right hand grip rule",
        "right-hand grip rule",
        "fleming left hand rule",
        "fleming's left hand rule",
        "solenoid",
        "magnetic field",
        "dc motor",
        "relay",
        "earth magnetic field",
        "electromagnetic induction",
        "faraday law",
        "lenz law",
        "transformer",
        "ac generator",
        "coriolis effect"
      ];

      for (
        const term of physicsTerms
      ) {
        if (
          normalize(searchQuestion)
            .includes(term)
        ) {
          if (
            content.includes(term)
          ) {
            score += 350;
          }
        }
      }

      return {
        url: page.url,
        title: getTitle(page.text),
        content,
        score,
        matchedTerms
      };
    }

    const rankedPages =
      fetchedPages
        .map(scoreContent)
        .sort(
          (a, b) =>
            b.score - a.score
        );

    // =======================================================
    // IMPORTANT:
    // SHOW TOP MATCHES IN SERVER LOG
    // This helps you debug Vercel.
    // =======================================================
    console.log(
      "HIRA SEARCH:",
      searchQuestion
    );

    console.log(
      "TOP PAGES:",
      rankedPages
        .slice(0, 5)
        .map(p => ({
          title: p.title,
          url: p.url,
          score: p.score
        }))
    );

    const bestPage =
      rankedPages[0];

    // =======================================================
    // NO GOOD MATCH
    // =======================================================
    if (
      !bestPage ||
      bestPage.score < 40
    ) {
      return await geminiFallback(
        question,
        messages,
        apiKey,
        res
      );
    }

    // =======================================================
    // GET RELEVANT SECTION AROUND MATCHED TERMS
    // =======================================================
    function extractRelevantText(
      content,
      question
    ) {
      const clean =
        String(content || "");

      const lower =
        clean.toLowerCase();

      const terms =
        getSearchTerms(question)
          .filter(
            x => x.length >= 4
          );

      let bestPosition = -1;

      for (
        const term of terms
      ) {
        const pos =
          lower.indexOf(term);

        if (
          pos !== -1 &&
          (
            bestPosition === -1 ||
            pos < bestPosition
          )
        ) {
          bestPosition = pos;
        }
      }

      if (
        bestPosition === -1
      ) {
        return clean.substring(
          0,
          10000
        );
      }

      const start =
        Math.max(
          0,
          bestPosition - 3000
        );

      const end =
        Math.min(
          clean.length,
          bestPosition + 9000
        );

      return clean.substring(
        start,
        end
      );
    }

    const relevantText =
      extractRelevantText(
        bestPage.content,
        searchQuestion
      );

    // =======================================================
    // DIRECT WEBSITE ANSWER
    //
    // If Gemini is unavailable, the chatbot can STILL answer
    // from the actual Hira Academy page.
    // =======================================================
    function directWebsiteAnswer(
      text,
      question
    ) {
      const sentences =
        text.split(
          /(?<=[.!?])\s+/
        );

      const terms =
        getSearchTerms(
          question
        );

      const candidates =
        sentences
          .map(sentence => {
            const lower =
              sentence.toLowerCase();

            let matches = 0;

            for (
              const term of terms
            ) {
              if (
                lower.includes(term)
              ) {
                matches++;
              }
            }

            return {
              sentence,
              matches
            };
          })
          .filter(
            x => x.matches > 0
          )
          .sort(
            (a, b) =>
              b.matches -
              a.matches
          )
          .slice(0, 4);

      if (!candidates.length) {
        return null;
      }

      return candidates
        .map(x => x.sentence)
        .join(" ");
    }

    // =======================================================
    // SEND ONLY RELEVANT HIRA CONTENT TO GEMINI
    // =======================================================
    const sourceBlock = `
HIRA ACADEMY SOURCE

Title:
${bestPage.title}

URL:
${bestPage.url}

Relevant content:
${relevantText}
`;

    const recentMessages =
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
                String(
                  m.content || ""
                )
            }
          ]
        }));

    const systemInstruction = {
      parts: [
        {
          text: `
You are the official Hira Academy AI teaching assistant.

Hira Academy website:
${SITE}

========================================================
SOURCE POLICY
========================================================

The Hira Academy material below is the PRIMARY source.

Use it as the source of truth.

Do NOT replace it with old information from your training.

Do NOT invent information.

Do NOT invent textbook wording.

Do NOT invent exercise questions.

Do NOT invent URLs.

If the supplied Hira Academy material does not contain
the answer, say:

"I couldn't find this information in the current Hira Academy material."

========================================================
NEW QUESTION RULE
========================================================

Every independent question must be treated as a NEW search.

Example:

Student:
exercise 6.2 math 10

Then:

Student:
What is the right hand grip rule?

The second question is independent.

DO NOT answer the second question from Exercise 6.2.

========================================================
FOLLOW-UP RULE
========================================================

Only use previous conversation context when the latest
question is clearly a follow-up such as:

why?
how?
explain it
explain this
what does this mean?
tell me more
solve it
give more detail

========================================================
ANSWER STYLE
========================================================

For a definition:
Give the definition from Hira Academy.

For a short question:
Give a concise answer.

For an exercise:
Use the actual Hira Academy exercise material.

For Mathematics:
Preserve formulas and mathematical notation.

For Physics:
Use Hira Academy terminology.

Do not add unnecessary outside information.

========================================================
SOURCE
========================================================

${sourceBlock}

========================================================
CURRENT QUESTION
========================================================

${question}
`
        }
      ]
    };

    // =======================================================
    // GEMINI CALL
    // =======================================================
    let geminiResponse;

    try {
      geminiResponse =
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
              contents:
                recentMessages,

              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1000
              }
            })
          }
        );
    } catch (error) {
      console.error(
        "Gemini connection error:",
        error
      );

      geminiResponse = null;
    }

    // =======================================================
    // GEMINI FAILED / QUOTA
    //
    // DO NOT RETURN AN UNRELATED PAGE.
    // Return the actual best Hira Academy source.
    // =======================================================
    if (
      !geminiResponse ||
      !geminiResponse.ok
    ) {
      const direct =
        directWebsiteAnswer(
          relevantText,
          question
        );

      if (direct) {
        return res.status(200).json({
          reply:
            `**According to Hira Academy:**\n\n${direct}\n\n---\n**Source: Hira Academy**  \n[Open the original Hira Academy page](${bestPage.url})`,
          sourceUrl:
            bestPage.url,
          sourceTitle:
            bestPage.title,
          websiteFirst: true
        });
      }

      return res.status(200).json({
        reply:
          `I found relevant Hira Academy material, but the AI explanation service is temporarily unavailable.\n\n**Source: Hira Academy**  \n[Open the original Hira Academy page](${bestPage.url})`,
        sourceUrl:
          bestPage.url,
        sourceTitle:
          bestPage.title,
        websiteFirst: true
      });
    }

    const data =
      await geminiResponse.json();

    let reply =
      data?.candidates?.[0]
        ?.content?.parts
        ?.map(
          p => p.text || ""
        )
        .join("")
        .trim();

    if (!reply) {
      reply =
        directWebsiteAnswer(
          relevantText,
          question
        ) ||
        "I couldn't find this information in the current Hira Academy material.";
    }

    // =======================================================
    // SOURCE
    // =======================================================
    reply +=
      `\n\n---\n**Source: Hira Academy**  \n[Open the original Hira Academy page](${bestPage.url})`;

    return res.status(200).json({
      reply,
      sourceUrl:
        bestPage.url,
      sourceTitle:
        bestPage.title,
      websiteFirst: true
    });

  } catch (error) {
    console.error(
      "Hira Academy API Error:",
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
// GEMINI FALLBACK
// Used only when the website search genuinely finds nothing.
// =============================================================
async function geminiFallback(
  question,
  messages,
  apiKey,
  res
) {
  const contents =
    messages
      .slice(-6)
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
        x =>
          x.parts[0].text.trim()
      );

  const systemInstruction = {
    parts: [
      {
        text: `
You are the Hira Academy Assistant.

The Hira Academy website search did not find sufficient
material for this question.

Do NOT claim that your general knowledge answer came from
Hira Academy.

Clearly say that the information was not found in the
current Hira Academy material.

If you provide a general educational explanation, label it
as general information.

Do not invent a Hira Academy source URL.

Question:
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
              maxOutputTokens: 600
            }
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material, and the AI service is temporarily unavailable.",
        websiteFirst: true
      });
    }

    const reply =
      data?.candidates?.[0]
        ?.content?.parts
        ?.map(
          p => p.text || ""
        )
        .join("")
        .trim();

    return res.status(200).json({
      reply:
        reply ||
        "I couldn't find this information in the current Hira Academy material."
    });

  } catch {
    return res.status(200).json({
      reply:
        "I couldn't find this information in the current Hira Academy material, and the AI service is temporarily unavailable."
    });
  }
}
