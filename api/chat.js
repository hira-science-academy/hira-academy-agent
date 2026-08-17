export default async function handler(req, res) {
  // =========================================================
  // HIRA ACADEMY AI ASSISTANT
  // =========================================================

  const SITE = "https://hiraacademy.com.pk";

  // ---------------------------------------------------------
  // CORS
  // ---------------------------------------------------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
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
    // =======================================================
    // API KEY
    // =======================================================

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing on Vercel."
      });
    }

    // =======================================================
    // READ BODY
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

    const latestUserMessage = [...messages]
      .reverse()
      .find(
        m =>
          m &&
          m.role === "user" &&
          typeof m.content === "string"
      );

    const question =
      latestUserMessage?.content?.trim();

    if (!question) {
      return res.status(400).json({
        error: "No user question provided."
      });
    }

    console.log("HIRA USER QUESTION:", question);

    // =======================================================
    // HELPERS
    // =======================================================

    function normalize(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/<[^>]+>/g, " ")
        .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

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
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
    }

    async function fetchText(url, timeout = 10000) {
      const controller =
        new AbortController();

      const timer = setTimeout(
        () => controller.abort(),
        timeout
      );

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 Hira-Academy-AI-Assistant",
            Accept:
              "text/html,application/xhtml+xml,text/plain"
          }
        });

        if (!response.ok) {
          console.log(
            "FETCH STATUS:",
            response.status,
            url
          );
          return null;
        }

        return await response.text();
      } catch (error) {
        console.log(
          "FETCH ERROR:",
          url,
          error.message
        );
        return null;
      } finally {
        clearTimeout(timer);
      }
    }

    // =======================================================
    // GET SITEMAP
    // =======================================================

    async function getSitemapUrls() {
      const xml = await fetchText(
        `${SITE}/sitemap.xml`
      );

      if (!xml) return [];

      const urls = [];

      const matches =
        xml.match(
          /<loc>\s*([^<]+?)\s*<\/loc>/gi
        ) || [];

      for (const item of matches) {
        const match =
          item.match(
            /<loc>\s*([^<]+?)\s*<\/loc>/i
          );

        if (!match) continue;

        const url = match[1].trim();

        if (!url.startsWith(SITE)) {
          continue;
        }

        if (
          /\.(jpg|jpeg|png|gif|webp|svg|css|js|zip)$/i.test(
            url
          )
        ) {
          continue;
        }

        urls.push(url);
      }

      return [...new Set(urls)];
    }

    const sitemapUrls =
      await getSitemapUrls();

    console.log(
      "SITEMAP COUNT:",
      sitemapUrls.length
    );

    // =======================================================
    // QUESTION ANALYSIS
    // =======================================================

    const q = normalize(question);

    const isMath =
      /\b(math|maths|mathematics|vector|vectors|algebra|trigonometry)\b/
        .test(q);

    const isPhysics =
      /\b(physics|magnetism|magnetic|electromagnetism|electromagnetic|motor|generator|transformer|diode|semiconductor|faraday|lenz|fleming|coriolis)\b/
        .test(q);

    const isExercise =
      /\b(exercise|ex)\s*\d+\s*[.]\s*\d+\b/i.test(
        q
      );

    const exerciseMatch =
      q.match(
        /\b(?:exercise|ex)\s*(\d+)\s*[.]\s*(\d+)\b/i
      );

    const exerciseUnit =
      exerciseMatch
        ? exerciseMatch[1]
        : null;

    const exerciseNumber =
      exerciseMatch
        ? exerciseMatch[2]
        : null;

    const chapterMatch =
      q.match(
        /\bchapter\s*(\d+)\b/i
      );

    const chapterNumber =
      chapterMatch
        ? chapterMatch[1]
        : null;

    const asksMCQ =
      /\b(mcq|mcqs|multiple choice)\b/.test(q);

    const asksCRQ =
      /\b(crq|crqs|constructed response)\b/.test(
        q
      );

    const asksLong =
      /\b(long question|long questions|comprehensive question|comprehensive questions)\b/.test(
        q
      );

    const asksShort =
      /\b(short question|short questions|short answer|definition|define)\b/.test(
        q
      );

    // =======================================================
    // EXACT EXERCISE URL
    //
    // THIS IS THE MOST IMPORTANT FIX.
    // =======================================================

    function findExerciseUrl() {
      if (
        !exerciseUnit ||
        !exerciseNumber
      ) {
        return null;
      }

      const unit =
        exerciseUnit;

      const ex =
        exerciseNumber;

      // Exact filename patterns used by Hira Academy
      const exactPatterns = [
        `unit${unit}-exercise${ex}`,
        `unit${unit}-exercise-${ex}`,
        `unit-${unit}-exercise${ex}`,
        `unit-${unit}-exercise-${ex}`
      ];

      // First: exact filename matching
      for (const url of sitemapUrls) {
        const filename =
          url
            .split("/")
            .pop()
            .toLowerCase();

        for (const pattern of exactPatterns) {
          if (
            filename.startsWith(pattern)
          ) {
            return url;
          }
        }
      }

      // Second: normalized URL matching
      for (const url of sitemapUrls) {
        const n =
          normalize(url);

        if (
          n.includes(
            `unit${unit}`
          ) &&
          n.includes(
            `exercise${ex}`
          )
        ) {
          return url;
        }
      }

      return null;
    }

    // =======================================================
    // FIND CHAPTER MAIN PAGE
    // =======================================================

    function findChapterMainUrl() {
      if (!chapterNumber) {
        return null;
      }

      const chapter =
        chapterNumber;

      let candidates =
        sitemapUrls.filter(url => {
          const n =
            normalize(url);

          return (
            n.includes(
              `chapter-${chapter}`
            ) ||
            n.includes(
              `chapter${chapter}`
            ) ||
            n.includes(
              `chapter ${chapter}`
            )
          );
        });

      if (isPhysics) {
        candidates =
          candidates.filter(url =>
            normalize(url).includes(
              "physics"
            )
          );
      }

      if (isMath) {
        candidates =
          candidates.filter(url =>
            /math|mathematics/.test(
              normalize(url)
            )
          );
      }

      // Prefer main chapter page,
      // not MCQ/short/CRQ pages.
      const main =
        candidates.find(url => {
          const n =
            normalize(url);

          return (
            !n.includes("mcq") &&
            !n.includes("short") &&
            !n.includes("constructed") &&
            !n.includes("long") &&
            !n.includes("numerical")
          );
        });

      return (
        main ||
        candidates[0] ||
        null
      );
    }

    // =======================================================
    // FIND SPECIALIZED CHAPTER PAGE
    // =======================================================

    function findSpecialChapterUrl() {
      if (!chapterNumber) {
        return null;
      }

      const chapter =
        chapterNumber;

      let candidates =
        sitemapUrls.filter(url => {
          const n =
            normalize(url);

          return (
            n.includes(
              `chapter${chapter}`
            ) ||
            n.includes(
              `chapter-${chapter}`
            ) ||
            n.includes(
              `chapter ${chapter}`
            )
          );
        });

      if (isPhysics) {
        candidates =
          candidates.filter(url =>
            normalize(url).includes(
              "physics"
            )
          );
      }

      if (isMath) {
        candidates =
          candidates.filter(url =>
            /math|mathematics/.test(
              normalize(url)
            )
          );
      }

      // Question-type priority
      if (asksMCQ) {
        const page =
          candidates.find(url =>
            normalize(url).includes(
              "mcq"
            )
          );

        if (page) return page;
      }

      if (asksCRQ) {
        const page =
          candidates.find(url =>
            normalize(url).includes(
              "constructed"
            )
          );

        if (page) return page;
      }

      if (asksLong) {
        const page =
          candidates.find(url =>
            normalize(url).includes(
              "long"
            )
          );

        if (page) return page;
      }

      if (asksShort) {
        const exerciseShort =
          candidates.find(url =>
            normalize(url).includes(
              "exercise-short"
            )
          );

        if (exerciseShort) {
          return exerciseShort;
        }

        const short =
          candidates.find(url =>
            normalize(url).includes(
              "short"
            )
          );

        if (short) return short;
      }

      return findChapterMainUrl();
    }

    // =======================================================
    // KNOWN CONCEPT → CHAPTER
    // =======================================================

    let conceptChapter =
      null;

    if (
      q.includes(
        "right hand grip rule"
      ) ||
      q.includes(
        "right hand grip"
      ) ||
      q.includes(
        "right-hand grip rule"
      )
    ) {
      conceptChapter = "17";
    }

    if (
      q.includes(
        "electromagnetic induction"
      ) ||
      q.includes(
        "faraday"
      ) ||
      q.includes(
        "lenz"
      ) ||
      q.includes(
        "ac generator"
      ) ||
      q.includes(
        "transformer"
      )
    ) {
      conceptChapter = "18";
    }

    if (
      q.includes(
        "coriolis effect"
      )
    ) {
      // Coriolis is not automatically assumed
      // to be in Hira Academy.
      conceptChapter = null;
    }

    // =======================================================
    // FIND CONCEPT PAGE
    // =======================================================

    function findConceptUrl() {
      if (!conceptChapter) {
        return null;
      }

      const chapter =
        conceptChapter;

      let candidates =
        sitemapUrls.filter(url => {
          const n =
            normalize(url);

          return (
            n.includes(
              `chapter${chapter}`
            ) ||
            n.includes(
              `chapter-${chapter}`
            )
          );
        });

      if (isPhysics || conceptChapter === "17" || conceptChapter === "18") {
        candidates =
          candidates.filter(url =>
            normalize(url).includes(
              "physics"
            )
          );
      }

      // For definitions/rules, short-question pages
      // are more useful than the homepage.
      const short =
        candidates.find(url =>
          normalize(url).includes(
            "short"
          )
        );

      if (short) return short;

      // Then main chapter page
      const main =
        candidates.find(url => {
          const n =
            normalize(url);

          return (
            !n.includes("mcq") &&
            !n.includes("short") &&
            !n.includes("constructed") &&
            !n.includes("long")
          );
        });

      return (
        main ||
        candidates[0] ||
        null
      );
    }

    // =======================================================
    // SELECT SOURCE
    //
    // STRICT PRIORITY
    // =======================================================

    let sourceUrl = null;

    // 1. Exercise request
    if (isExercise) {
      sourceUrl =
        findExerciseUrl();

      console.log(
        "EXACT EXERCISE SOURCE:",
        sourceUrl
      );
    }

    // 2. Explicit chapter + question type
    if (
      !sourceUrl &&
      chapterNumber
    ) {
      sourceUrl =
        findSpecialChapterUrl();

      console.log(
        "CHAPTER SOURCE:",
        sourceUrl
      );
    }

    // 3. Known concept
    if (!sourceUrl) {
      sourceUrl =
        findConceptUrl();

      console.log(
        "CONCEPT SOURCE:",
        sourceUrl
      );
    }

    // =======================================================
    // DO NOT USE HOMEPAGE AS SOURCE
    // =======================================================

    if (
      sourceUrl === SITE ||
      sourceUrl === `${SITE}/` ||
      !sourceUrl
    ) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material."
      });
    }

    // =======================================================
    // FETCH SOURCE PAGE
    // =======================================================

    const html =
      await fetchText(
        sourceUrl,
        12000
      );

    if (!html) {
      return res.status(200).json({
        reply:
          `I found the relevant Hira Academy page, but I could not read it right now.\n\n**Source: Hira Academy**\n[Open the original Hira Academy page](${sourceUrl})`
      });
    }

    const pageText =
      htmlToText(html);

    if (!pageText) {
      return res.status(200).json({
        reply:
          `I found the relevant Hira Academy page, but it contains no readable text.\n\n**Source: Hira Academy**\n[Open the original Hira Academy page](${sourceUrl})`
      });
    }

    console.log(
      "SOURCE TEXT:",
      pageText.length
    );

    // =======================================================
    // FIND RELEVANT SECTION
    // =======================================================

    function getRelevantSection(text) {
      const normalized =
        normalize(text);

      const searchTerms = [];

      // Exact exercise
      if (
        exerciseUnit &&
        exerciseNumber
      ) {
        searchTerms.push(
          `exercise ${exerciseUnit}.${exerciseNumber}`
        );

        searchTerms.push(
          `exercise ${exerciseUnit} ${exerciseNumber}`
        );
      }

      // Exact concepts
      if (
        q.includes(
          "right hand grip"
        )
      ) {
        searchTerms.push(
          "right hand grip rule"
        );

        searchTerms.push(
          "right-hand grip rule"
        );
      }

      if (
        q.includes(
          "electromagnetic induction"
        )
      ) {
        searchTerms.push(
          "electromagnetic induction"
        );
      }

      if (
        q.includes("faraday")
      ) {
        searchTerms.push(
          "faraday"
        );
      }

      if (
        q.includes("lenz")
      ) {
        searchTerms.push(
          "lenz"
        );
      }

      if (
        q.includes("coriolis")
      ) {
        searchTerms.push(
          "coriolis"
        );
      }

      // Search for exact phrase
      let bestPosition = -1;

      for (const term of searchTerms) {
        const pos =
          normalized.indexOf(
            normalize(term)
          );

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
        // For an exact exercise page,
        // the page itself is relevant.
        if (isExercise) {
          return text.substring(
            0,
            14000
          );
        }

        return text.substring(
          0,
          9000
        );
      }

      // Get enough surrounding material
      const start =
        Math.max(
          0,
          bestPosition - 1500
        );

      const end =
        Math.min(
          text.length,
          bestPosition + 9000
        );

      return text.substring(
        start,
        end
      );
    }

    let relevantText =
      getRelevantSection(
        pageText
      );

    // Gemini input safety
    relevantText =
      relevantText.substring(
        0,
        14000
      );

    // =======================================================
    // GEMINI
    // =======================================================

    let answer = "";

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
              systemInstruction: {
                parts: [
                  {
                    text: `
You are the official Hira Academy teaching assistant.

IMPORTANT RULES:

1. The Hira Academy SOURCE CONTENT below is your only source.
2. Do NOT use your old/general knowledge when the source does not support an answer.
3. Do NOT mix information from other chapters.
4. Do NOT mention or cite any Hira Academy page other than the SOURCE PAGE.
5. Do NOT invent questions, exercise numbers, answers, formulas, or explanations.
6. Answer the user's exact question.
7. For mathematics, preserve the supplied mathematical wording and formulas.
8. For physics definitions/rules, give a concise textbook-faithful answer.
9. If the source genuinely does not contain the answer, say exactly:
"I couldn't find this information in the current Hira Academy material."
10. Do not output a source link yourself. The API will add the source link.

SOURCE PAGE:
${sourceUrl}

SOURCE CONTENT:
${relevantText}
`
                  }
                ]
              },

              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: question
                    }
                  ]
                }
              ],

              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1400
              }
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        console.log(
          "GEMINI STATUS:",
          response.status,
          data?.error?.message
        );

        // Don't expose Gemini errors
        // to the student.
        answer = "";
      } else {
        answer =
          data?.candidates?.[0]
            ?.content?.parts
            ?.map(
              p => p.text || ""
            )
            .join("")
            .trim() || "";
      }
    } catch (error) {
      console.log(
        "GEMINI ERROR:",
        error.message
      );

      answer = "";
    }

    // =======================================================
    // FALLBACK IF GEMINI QUOTA IS EXCEEDED
    // =======================================================

    if (!answer) {
      answer =
        `According to the Hira Academy material:\n\n${relevantText}`;
    }

    // =======================================================
    // REMOVE BAD/UNRELATED SOURCE LINKS GENERATED BY MODEL
    // =======================================================

    answer =
      answer.replace(
        /\*\*Source:\s*Hira Academy\*\*[\s\S]*$/i,
        ""
      )
      .trim();

    answer =
      answer.replace(
        /https?:\/\/hiraacademy\.com\.pk\/[^\s)]+/gi,
        ""
      )
      .trim();

    // =======================================================
    // FINAL SOURCE
    // =======================================================

    answer +=
      `\n\n---\n**Source: Hira Academy**\n[Open the original Hira Academy page](${sourceUrl})`;

    // =======================================================
    // RESPONSE
    // =======================================================

    return res.status(200).json({
      reply: answer,
      sourceUrl: sourceUrl
    });

  } catch (error) {
    console.error(
      "HIRA CHAT ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Internal Server Error"
    });
  }
}
