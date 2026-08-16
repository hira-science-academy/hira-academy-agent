export default async function handler(req, res) {
  // =========================================================
  // CORS
  // =========================================================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const API_KEY = process.env.GEMINI_API_KEY;
    const SITE = "https://hiraacademy.com.pk";

    if (!API_KEY) {
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

    const latestUser = [...messages]
      .reverse()
      .find(
        m =>
          m &&
          m.role === "user" &&
          typeof m.content === "string"
      );

    const question = latestUser?.content?.trim();

    if (!question) {
      return res.status(400).json({
        error: "No user question provided."
      });
    }

    console.log("QUESTION:", question);

    // =======================================================
    // NORMALIZATION
    // =======================================================
    function normalize(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/<[^>]*>/g, " ")
        .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const nq = normalize(question);

    // =======================================================
    // STOP WORDS
    // =======================================================
    const STOP_WORDS = new Set([
      "what",
      "what's",
      "whats",
      "is",
      "are",
      "was",
      "were",
      "the",
      "a",
      "an",
      "of",
      "in",
      "on",
      "at",
      "for",
      "to",
      "from",
      "and",
      "or",
      "but",
      "why",
      "how",
      "does",
      "do",
      "did",
      "can",
      "could",
      "would",
      "should",
      "will",
      "please",
      "tell",
      "me",
      "about",
      "explain",
      "define",
      "definition",
      "describe",
      "give",
      "show",
      "find",
      "according",
      "according-to",
      "hira",
      "academy",
      "science",
      "class",
      "grade",
      "9th",
      "10th",
      "ninth",
      "tenth"
    ]);

    function importantWords(text) {
      return [
        ...new Set(
          normalize(text)
            .split(/\s+/)
            .filter(
              w =>
                w.length >= 3 &&
                !STOP_WORDS.has(w)
            )
        )
      ];
    }

    const questionWords =
      importantWords(question);

    // =======================================================
    // CONCEPT DATABASE
    //
    // This prevents "right hand grip rule" from being
    // confused with a general Physics page.
    // =======================================================
    const CONCEPTS = [
      {
        key: "right hand grip rule",
        phrases: [
          "right hand grip rule",
          "right-hand grip rule",
          "right hand grip",
          "right-hand grip"
        ]
      },

      {
        key: "coriolis effect",
        phrases: [
          "coriolis effect",
          "coriolis force"
        ]
      },

      {
        key: "electromagnetic induction",
        phrases: [
          "electromagnetic induction"
        ]
      },

      {
        key: "faraday law",
        phrases: [
          "faraday's law",
          "faraday law"
        ]
      },

      {
        key: "lenz law",
        phrases: [
          "lenz's law",
          "lenz law"
        ]
      },

      {
        key: "fleming left hand rule",
        phrases: [
          "fleming's left hand rule",
          "fleming left hand rule"
        ]
      },

      {
        key: "magnetic field",
        phrases: [
          "magnetic field"
        ]
      },

      {
        key: "electric motor",
        phrases: [
          "electric motor",
          "dc motor"
        ]
      },

      {
        key: "ac generator",
        phrases: [
          "ac generator",
          "alternating current generator"
        ]
      },

      {
        key: "transformer",
        phrases: [
          "transformer"
        ]
      },

      {
        key: "pn junction diode",
        phrases: [
          "pn junction diode",
          "pn junction",
          "junction diode"
        ]
      },

      {
        key: "depletion region",
        phrases: [
          "depletion region"
        ]
      },

      {
        key: "forward bias",
        phrases: [
          "forward bias"
        ]
      },

      {
        key: "reverse bias",
        phrases: [
          "reverse bias"
        ]
      }
    ];

    function findConcept(text) {
      const n = normalize(text);

      return (
        CONCEPTS.find(concept =>
          concept.phrases.some(
            phrase =>
              n.includes(
                normalize(phrase)
              )
          )
        ) || null
      );
    }

    const concept =
      findConcept(question);

    // =======================================================
    // CLASS / SUBJECT
    // =======================================================
    function detectGrade(text) {
      const n = normalize(text);

      if (
        n.includes("10th") ||
        n.includes("class 10") ||
        n.includes("grade 10") ||
        n.includes("tenth class")
      ) {
        return 10;
      }

      if (
        n.includes("9th") ||
        n.includes("class 9") ||
        n.includes("grade 9") ||
        n.includes("ninth class")
      ) {
        return 9;
      }

      return null;
    }

    function detectSubject(text) {
      const n = normalize(text);

      if (
        /\b(math|maths|mathematics|vector|vectors|algebra|trigonometry)\b/.test(n)
      ) {
        return "math";
      }

      if (
        /\b(physics|magnetic|magnetism|solenoid|fleming|faraday|lenz|motor|generator|transformer|semiconductor|diode|coriolis)\b/.test(n)
      ) {
        return "physics";
      }

      return null;
    }

    const grade = detectGrade(question);
    const subject = detectSubject(question);

    // =======================================================
    // EXERCISE
    // =======================================================
    function detectExercise(text) {
      const match =
        normalize(text).match(
          /\bexercise\s+(\d+)\.(\d+)\b/
        );

      if (!match) return null;

      return {
        unit: Number(match[1]),
        exercise: Number(match[2])
      };
    }

    const exercise =
      detectExercise(question);

    // =======================================================
    // FETCH
    // =======================================================
    async function fetchURL(url) {
      const controller =
        new AbortController();

      const timer =
        setTimeout(
          () => controller.abort(),
          7000
        );

      try {
        const response =
          await fetch(url, {
            signal: controller.signal,
            headers: {
              "User-Agent":
                "Hira-Academy-Assistant/3.0"
            }
          });

        if (!response.ok) {
          return null;
        }

        return {
          url,
          html: await response.text()
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
    const sitemap =
      await fetchURL(
        `${SITE}/sitemap.xml`
      );

    function getSitemapURLs(xml) {
      const result = [];

      const matches =
        String(xml || "").match(
          /<loc>\s*([^<]+?)\s*<\/loc>/gi
        ) || [];

      for (const item of matches) {
        const m =
          item.match(
            /<loc>\s*([^<]+?)\s*<\/loc>/i
          );

        if (!m) continue;

        const url = m[1].trim();

        if (!url.startsWith(SITE)) {
          continue;
        }

        if (
          /\.(jpg|jpeg|png|gif|webp|svg|pdf|css|js|zip)$/i.test(
            url
          )
        ) {
          continue;
        }

        result.push(url);
      }

      return [...new Set(result)];
    }

    let urls =
      sitemap
        ? getSitemapURLs(
            sitemap.html
          )
        : [];

    // =======================================================
    // FALLBACK PAGES
    // =======================================================
    urls.push(
      `${SITE}/`,
      `${SITE}/Physics-9th-Definitions.html`,
      `${SITE}/Physics-9th.html`,
      `${SITE}/Physics-10th-New-2026.html`,
      `${SITE}/Mathematics-10th-New-2026.html`,
      `${SITE}/Mathematics-10th.html`,
      `${SITE}/9th-class-notes.html`,
      `${SITE}/10th-class-notes.html`
    );

    urls = [
      ...new Set(urls)
    ];

    // =======================================================
    // URL PRIORITY
    // =======================================================
    function urlScore(url) {
      const u = normalize(url);

      let score = 0;

      if (
        subject === "physics" &&
        u.includes("physics")
      ) {
        score += 100;
      }

      if (
        subject === "math" &&
        (u.includes("math") ||
          u.includes("mathematics"))
      ) {
        score += 100;
      }

      if (
        grade === 9 &&
        u.includes("9th")
      ) {
        score += 60;
      }

      if (
        grade === 10 &&
        u.includes("10th")
      ) {
        score += 60;
      }

      // Exact concept in URL
      if (concept) {
        for (const phrase of concept.phrases) {
          const clean =
            normalize(phrase)
              .replace(/\s+/g, "-");

          if (u.includes(clean)) {
            score += 1000;
          }
        }
      }

      // Exercise
      if (exercise) {
        const ex =
          `${exercise.unit}.${exercise.exercise}`;

        if (
          u.includes("exercise") &&
          u.includes(ex)
        ) {
          score += 2000;
        }

        if (
          u.includes(
            `unit${exercise.unit}`
          )
        ) {
          score += 200;
        }
      }

      return score;
    }

    urls.sort(
      (a, b) =>
        urlScore(b) -
        urlScore(a)
    );

    // Search first 70 relevant pages.
    const pagesToFetch =
      urls.slice(0, 70);

    console.log(
      "SEARCHING:",
      pagesToFetch.length,
      "PAGES"
    );

    // =======================================================
    // FETCH IN BATCHES
    // =======================================================
    const pages = [];

    for (
      let i = 0;
      i < pagesToFetch.length;
      i += 10
    ) {
      const batch =
        pagesToFetch.slice(
          i,
          i + 10
        );

      const results =
        await Promise.all(
          batch.map(
            url => fetchURL(url)
          )
        );

      for (const result of results) {
        if (result) {
          pages.push(result);
        }
      }
    }

    // =======================================================
    // HTML → CLEAN TEXT
    // =======================================================
    function htmlToText(html) {
      return String(html || "")
        .replace(
          /<script\b[^>]*>[\s\S]*?<\/script>/gi,
          "\n"
        )
        .replace(
          /<style\b[^>]*>[\s\S]*?<\/style>/gi,
          "\n"
        )
        .replace(
          /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
          "\n"
        )
        .replace(
          /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
          "\n"
        )
        .replace(
          /<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|tr|td|th)>/gi,
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
          /[ \t]+/g,
          " "
        )
        .replace(
          /\n\s*\n+/g,
          "\n"
        )
        .trim();
    }

    function getTitle(html) {
      const m =
        String(html || "").match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        );

      return m
        ? htmlToText(m[1])
        : "";
    }

    // =======================================================
    // CREATE SEARCHABLE BLOCKS
    //
    // THIS IS THE IMPORTANT FIX.
    //
    // Instead of treating the whole page as one answer,
    // split it into small blocks around headings/paragraphs.
    // =======================================================
    function createBlocks(html) {
      const cleaned =
        String(html || "")
          .replace(
            /<script\b[^>]*>[\s\S]*?<\/script>/gi,
            ""
          )
          .replace(
            /<style\b[^>]*>[\s\S]*?<\/style>/gi,
            ""
          )
          .replace(
            /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
            ""
          );

      const parts =
        cleaned.match(
          /<(h1|h2|h3|h4|h5|h6|p|li|td|th|div)[^>]*>[\s\S]*?<\/\1>/gi
        ) || [];

      const blocks = [];

      for (const part of parts) {
        const text =
          htmlToText(part);

        if (
          text &&
          text.length >= 3
        ) {
          blocks.push(text);
        }
      }

      // Fallback if page uses unusual markup
      if (!blocks.length) {
        const text =
          htmlToText(html);

        return text
          .split(/\n+/)
          .filter(
            x => x.trim()
          );
      }

      return blocks;
    }

    // =======================================================
    // SCORE BLOCK
    // =======================================================
    function scoreBlock(block) {
      const b =
        normalize(block);

      let score = 0;

      // Exact concept
      if (concept) {
        for (const phrase of concept.phrases) {
          const p =
            normalize(phrase);

          if (b.includes(p)) {
            score += 1000;
          }
        }
      }

      // Exact question
      if (
        nq.length > 8 &&
        b.includes(nq)
      ) {
        score += 1500;
      }

      // Question words
      let matches = 0;

      for (const word of questionWords) {
        if (b.includes(word)) {
          matches++;
          score += 20;
        }
      }

      if (matches >= 2) {
        score += 100;
      }

      // Definition wording
      if (
        /^(definition|what is|what are|rule|law|principle|the)\b/i.test(
          block.trim()
        )
      ) {
        score += 30;
      }

      return {
        text: block,
        score,
        matches
      };
    }

    // =======================================================
    // SCORE PAGES
    // =======================================================
    const rankedPages =
      pages
        .map(page => {
          const blocks =
            createBlocks(
              page.html
            );

          const rankedBlocks =
            blocks
              .map(scoreBlock)
              .sort(
                (a, b) =>
                  b.score -
                  a.score
              );

          const top =
            rankedBlocks[0];

          let pageScore =
            urlScore(page.url);

          if (top) {
            pageScore +=
              top.score;
          }

          // Count exact concept occurrences
          if (concept) {
            const fullText =
              normalize(
                htmlToText(
                  page.html
                )
              );

            for (
              const phrase
              of concept.phrases
            ) {
              if (
                fullText.includes(
                  normalize(
                    phrase
                  )
                )
              ) {
                pageScore += 500;
              }
            }
          }

          return {
            page,
            blocks,
            rankedBlocks,
            score: pageScore
          };
        })
        .sort(
          (a, b) =>
            b.score -
            a.score
        );

    // =======================================================
    // FIND BEST PAGE
    // =======================================================
    let bestPage =
      rankedPages[0];

    // =======================================================
    // STRICT CONCEPT VALIDATION
    // =======================================================
    if (concept) {
      const validPages =
        rankedPages.filter(item => {
          const fullText =
            normalize(
              htmlToText(
                item.page.html
              )
            );

          return concept.phrases.some(
            phrase =>
              fullText.includes(
                normalize(
                  phrase
                )
              )
          );
        });

      if (!validPages.length) {
        console.log(
          "CONCEPT NOT FOUND:",
          concept.key
        );

        return res.status(200).json({
          reply:
            "I couldn't find this information in the current Hira Academy material."
        });
      }

      bestPage =
        validPages[0];
    }

    if (!bestPage) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material."
      });
    }

    // =======================================================
    // SELECT BEST BLOCKS
    // =======================================================
    const rankedBlocks =
      bestPage.rankedBlocks;

    if (!rankedBlocks.length) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material."
      });
    }

    // Take ONLY highly relevant blocks.
    let selectedBlocks =
      rankedBlocks
        .filter(
          b =>
            b.score >=
            Math.max(
              40,
              rankedBlocks[0].score * 0.35
            )
        )
        .slice(0, 5);

    // If concept exists, require concept-bearing
    // blocks where possible.
    if (concept) {
      const conceptBlocks =
        rankedBlocks.filter(
          b =>
            concept.phrases.some(
              phrase =>
                normalize(
                  b.text
                ).includes(
                  normalize(
                    phrase
                  )
                )
            )
        );

      if (conceptBlocks.length) {
        selectedBlocks =
          conceptBlocks.slice(
            0,
            5
          );
      }
    }

    const sourceText =
      selectedBlocks
        .map(b => b.text)
        .join("\n\n")
        .substring(
          0,
          7000
        );

    console.log(
      "SELECTED PAGE:",
      bestPage.page.url
    );

    console.log(
      "SELECTED TEXT:",
      sourceText.substring(
        0,
        1000
      )
    );

    // =======================================================
    // GEMINI
    // =======================================================
    let geminiOK = false;
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
                API_KEY
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [
                  {
                    text: `
You are the official Hira Academy teaching assistant.

Use ONLY the Hira Academy source material supplied below.

Do not use unrelated general knowledge.

Do not combine information from unrelated chapters.

Do not invent facts.

Answer the user's exact current question.

If the source does not answer the question, say:
"I couldn't find this information in the current Hira Academy material."

Keep answers concise and appropriate for Class 9 and Class 10 Punjab Board / PECTAA students.

If the source contains a definition, rule, formula, or direct answer, prefer that wording and do not unnecessarily expand it.

SOURCE:
${sourceText}
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
                maxOutputTokens: 700
              }
            })
          }
        );

      if (response.ok) {
        const data =
          await response.json();

        answer =
          data?.candidates?.[0]
            ?.content?.parts
            ?.map(
              p => p.text || ""
            )
            .join("")
            .trim() || "";

        if (answer) {
          geminiOK = true;
        }
      } else {
        console.log(
          "GEMINI STATUS:",
          response.status
        );
      }
    } catch (error) {
      console.error(
        "GEMINI ERROR:",
        error.message
      );
    }

    // =======================================================
    // FALLBACK WHEN GEMINI QUOTA IS EXCEEDED
    // =======================================================
    if (!geminiOK) {
      answer =
        `According to Hira Academy:\n\n${sourceText}`;
    }

    // =======================================================
    // SOURCE
    // =======================================================
    answer +=
      `\n\n---\n**Source: Hira Academy**\n[Open the original Hira Academy page](${bestPage.page.url})`;

    return res.status(200).json({
      reply: answer,
      sourceUrl: bestPage.page.url,
      sourceTitle:
        getTitle(
          bestPage.page.html
        )
    });

  } catch (error) {
    console.error(
      "API ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Internal Server Error"
    });
  }
}
