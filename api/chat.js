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

  const SITE = "https://hiraacademy.com.pk";
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  try {
    // =======================================================
    // READ REQUEST
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
        error: "No user question provided."
      });
    }

    console.log("HIRA QUESTION:", question);

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
        .replace(/&#x27;/gi, "'")
        .replace(/<[^>]*>/g, " ")
        .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function slug(text) {
      return normalize(text)
        .replace(/['’]/g, "")
        .replace(/\s+/g, "-");
    }

    function cleanHTML(html) {
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
        );
    }

    function htmlToText(html) {
      return cleanHTML(html)
        .replace(
          /<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|tr|td|th)>/gi,
          "\n"
        )
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
    }

    function getTitle(html) {
      const m = String(html || "").match(
        /<title[^>]*>([\s\S]*?)<\/title>/i
      );

      return m ? htmlToText(m[1]) : "";
    }

    async function fetchPage(url, timeout = 8000) {
      const controller = new AbortController();

      const timer = setTimeout(
        () => controller.abort(),
        timeout
      );

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Hira-Academy-Assistant/Final",
            Accept:
              "text/html,application/xhtml+xml"
          }
        });

        if (!response.ok) {
          return null;
        }

        return {
          url,
          html: await response.text()
        };
      } catch (error) {
        console.log(
          "FETCH FAILED:",
          url,
          error.message
        );
        return null;
      } finally {
        clearTimeout(timer);
      }
    }

    // =======================================================
    // GET SITEMAP URLS
    // =======================================================
    async function getSitemapURLs() {
      const sitemap =
        await fetchPage(
          `${SITE}/sitemap.xml`,
          8000
        );

      if (!sitemap) {
        return [];
      }

      const urls = [];

      const matches =
        sitemap.html.match(
          /<loc>\s*([^<]+?)\s*<\/loc>/gi
        ) || [];

      for (const item of matches) {
        const m = item.match(
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

        urls.push(url);
      }

      return [...new Set(urls)];
    }

    const sitemapURLs =
      await getSitemapURLs();

    console.log(
      "SITEMAP URLS:",
      sitemapURLs.length
    );

    // =======================================================
    // DETECT EXERCISE
    // =======================================================
    const exerciseMatch =
      normalize(question).match(
        /\b(?:exercise|ex)\s*(\d+)\.(\d+)\b/i
      );

    const exercise =
      exerciseMatch
        ? {
            unit: exerciseMatch[1],
            number: exerciseMatch[2]
          }
        : null;

    // =======================================================
    // DETECT CHAPTER
    // =======================================================
    const chapterMatch =
      normalize(question).match(
        /\bchapter\s*(\d+)\b/i
      );

    const chapter =
      chapterMatch
        ? chapterMatch[1]
        : null;

    // =======================================================
    // DETECT CLASS
    // =======================================================
    const q = normalize(question);

    let grade = null;

    if (
      /\b10th\b/.test(q) ||
      /\bclass 10\b/.test(q) ||
      /\btenth\b/.test(q)
    ) {
      grade = 10;
    } else if (
      /\b9th\b/.test(q) ||
      /\bclass 9\b/.test(q) ||
      /\bninth\b/.test(q)
    ) {
      grade = 9;
    }

    // =======================================================
    // DETECT SUBJECT
    // =======================================================
    let subject = null;

    if (
      /\b(math|maths|mathematics|vector|vectors|algebra|trigonometry)\b/.test(
        q
      )
    ) {
      subject = "math";
    }

    if (
      /\b(physics|magnetic|magnetism|electromagnetism|electromagnetic|motor|generator|transformer|diode|semiconductor|faraday|lenz|fleming|coriolis)\b/.test(
        q
      )
    ) {
      subject = "physics";
    }

    // =======================================================
    // KNOWN EXACT CONCEPTS
    // =======================================================
    const conceptMap = [
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
          "pn junction"
        ]
      }
    ];

    const concept =
      conceptMap.find(c =>
        c.phrases.some(p =>
          q.includes(normalize(p))
        )
      ) || null;

    // =======================================================
    // EXACT URL SEARCH
    //
    // THIS IS THE MOST IMPORTANT PART.
    // =======================================================
    function findExactExerciseURL() {
      if (!exercise) return null;

      const u =
        sitemapURLs.find(url => {
          const n = normalize(url);

          const unit =
            exercise.unit;

          const ex =
            exercise.number;

          return (
            n.includes("exercise") &&
            (
              n.includes(
                `unit${unit}`
              ) ||
              n.includes(
                `unit-${unit}`
              )
            ) &&
            (
              n.includes(
                `exercise${ex}`
              ) ||
              n.includes(
                `exercise-${ex}`
              ) ||
                n.includes(
                  `exercise ${ex}`
                )
            )
          );
        });

      if (u) return u;

      // More flexible exact match
      return (
        sitemapURLs.find(url => {
          const n = normalize(url);

          return (
            n.includes(
              `unit${exercise.unit}`
            ) &&
            n.includes(
              `exercise${exercise.number}`
            )
          );
        }) || null
      );
    }

    function findChapterURL() {
      if (!chapter) return null;

      const candidates =
        sitemapURLs.filter(url => {
          const n = normalize(url);

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

      if (!candidates.length) {
        return null;
      }

      if (subject === "physics") {
        const physics =
          candidates.find(url =>
            normalize(url).includes(
              "physics"
            )
          );

        if (physics) return physics;
      }

      return candidates[0];
    }

    function findConceptURLs() {
      if (!concept) return [];

      const results = [];

      for (const url of sitemapURLs) {
        const n = normalize(url);

        for (const phrase of concept.phrases) {
          const words =
            normalize(phrase)
              .split(/\s+/)
              .filter(Boolean);

          const matched =
            words.filter(word =>
              n.includes(word)
            ).length;

          if (
            matched === words.length
          ) {
            results.push(url);
            break;
          }
        }
      }

      return [
        ...new Set(results)
      ];
    }

    // =======================================================
    // SELECT SOURCE URL
    //
    // Priority:
    // 1. Exact exercise
    // 2. Exact chapter
    // 3. Exact concept
    // 4. Subject/class pages
    // =======================================================
    let sourceURL = null;

    if (exercise) {
      sourceURL =
        findExactExerciseURL();

      console.log(
        "EXERCISE URL:",
        sourceURL
      );
    }

    if (!sourceURL && chapter) {
      sourceURL =
        findChapterURL();

      console.log(
        "CHAPTER URL:",
        sourceURL
      );
    }

    if (!sourceURL && concept) {
      const conceptURLs =
        findConceptURLs();

      // Prefer correct subject/class
      const filtered =
        conceptURLs.filter(url => {
          const n =
            normalize(url);

          if (
            subject === "physics" &&
            !n.includes("physics")
          ) {
            return false;
          }

          if (
            grade === 9 &&
            !n.includes("9th")
          ) {
            return false;
          }

          if (
            grade === 10 &&
            !n.includes("10th")
          ) {
            return false;
          }

          return true;
        });

      sourceURL =
        filtered[0] ||
        conceptURLs[0] ||
        null;

      console.log(
        "CONCEPT URL:",
        sourceURL
      );
    }

    // =======================================================
    // IF EXACT URL WAS NOT FOUND, DO BROAD SEARCH
    // =======================================================
    if (!sourceURL) {
      const candidates =
        sitemapURLs.filter(url => {
          const n =
            normalize(url);

          if (
            subject === "physics" &&
            !n.includes("physics")
          ) {
            return false;
          }

          if (
            subject === "math" &&
            !(
              n.includes("math") ||
              n.includes("mathematics")
            )
          ) {
            return false;
          }

          if (
            grade === 9 &&
            !n.includes("9th")
          ) {
            return false;
          }

          if (
            grade === 10 &&
            !n.includes("10th")
          ) {
            return false;
          }

          return true;
        });

      sourceURL =
        candidates[0] || null;
    }

    // =======================================================
    // NO URL FOUND
    // =======================================================
    if (!sourceURL) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material."
      });
    }

    // =======================================================
    // FETCH EXACT SOURCE PAGE
    // =======================================================
    const sourcePage =
      await fetchPage(
        sourceURL,
        10000
      );

    if (!sourcePage) {
      return res.status(200).json({
        reply:
          `I found the relevant Hira Academy page, but I couldn't read it right now.\n\n**Source: Hira Academy**\n[Open the original Hira Academy page](${sourceURL})`
      });
    }

    const fullText =
      htmlToText(
        sourcePage.html
      );

    // =======================================================
    // EXTRACT RELEVANT CONTENT
    // =======================================================
    function findBestText(text) {
      const normalizedText =
        normalize(text);

      let positions = [];

      // ---------------------------------------------
      // Exact concept
      // ---------------------------------------------
      if (concept) {
        for (const phrase of concept.phrases) {
          const p =
            normalizedText.indexOf(
              normalize(phrase)
            );

          if (p !== -1) {
            positions.push(p);
          }
        }
      }

      // ---------------------------------------------
      // Exercise
      // ---------------------------------------------
      if (exercise) {
        const patterns = [
          `exercise ${exercise.unit}.${exercise.number}`,
          `exercise ${exercise.unit} ${exercise.number}`,
          `exercise ${exercise.number}`
        ];

        for (const pattern of patterns) {
          const p =
            normalizedText.indexOf(
              pattern
            );

          if (p !== -1) {
            positions.push(p);
          }
        }
      }

      // ---------------------------------------------
      // Chapter
      // ---------------------------------------------
      if (chapter) {
        const patterns = [
          `chapter ${chapter}`,
          `chapter${chapter}`
        ];

        for (const pattern of patterns) {
          const p =
            normalizedText.indexOf(
              pattern
            );

          if (p !== -1) {
            positions.push(p);
          }
        }
      }

      // ---------------------------------------------
      // Important question words
      // ---------------------------------------------
      const stopWords =
        new Set([
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
          "why",
          "how",
          "does",
          "do",
          "did",
          "can",
          "could",
          "would",
          "please",
          "tell",
          "me",
          "about",
          "explain",
          "define",
          "definition",
          "according",
          "hira",
          "academy"
        ]);

      const words =
        q.split(/\s+/)
          .filter(
            word =>
              word.length >= 3 &&
              !stopWords.has(word)
          );

      for (const word of words) {
        const p =
          normalizedText.indexOf(
            word
          );

        if (p !== -1) {
          positions.push(p);
        }
      }

      if (!positions.length) {
        return text.substring(
          0,
          5000
        );
      }

      const position =
        Math.min(...positions);

      // ---------------------------------------------
      // IMPORTANT:
      // only return a small local window.
      // ---------------------------------------------
      const start =
        Math.max(
          0,
          position - 1200
        );

      const end =
        Math.min(
          text.length,
          position + 5000
        );

      return text
        .substring(
          start,
          end
        )
        .trim();
    }

    let relevantText =
      findBestText(
        fullText
      );

    // Do not send enormous pages to Gemini.
    relevantText =
      relevantText.substring(
        0,
        8000
      );

    console.log(
      "SOURCE:",
      sourceURL
    );

    console.log(
      "SOURCE TEXT LENGTH:",
      relevantText.length
    );

    // =======================================================
    // SPECIAL CHECK:
    // CONCEPT MUST ACTUALLY EXIST ON THIS PAGE
    // =======================================================
    if (concept) {
      const pageNormalized =
        normalize(fullText);

      const conceptExists =
        concept.phrases.some(
          phrase =>
            pageNormalized.includes(
              normalize(phrase)
            )
        );

      if (!conceptExists) {
        // If concept wasn't found on the selected page,
        // search other exact concept URLs.
        const alternatives =
          findConceptURLs();

        for (const altURL of alternatives) {
          if (
            altURL === sourceURL
          ) {
            continue;
          }

          const altPage =
            await fetchPage(
              altURL,
              8000
            );

          if (!altPage) {
            continue;
          }

          const altText =
            htmlToText(
              altPage.html
            );

          const altNormalized =
            normalize(altText);

          const exists =
            concept.phrases.some(
              phrase =>
                altNormalized.includes(
                  normalize(phrase)
                )
            );

          if (exists) {
            sourceURL =
              altURL;

            relevantText =
              findBestText(
                altText
              ).substring(
                0,
                8000
              );

            break;
          }
        }
      }
    }

    // =======================================================
    // GEMINI
    // =======================================================
    let answer = "";

    if (GEMINI_KEY) {
      try {
        const gemini =
          await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
                "x-goog-api-key":
                  GEMINI_KEY
              },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [
                    {
                      text: `
You are the official Hira Academy teaching assistant.

Your ONLY knowledge source for this answer is the Hira Academy material supplied below.

Do not use old textbook information.
Do not use unrelated Hira Academy pages.
Do not invent an answer.
Do not mix chapters.
Answer only the user's current question.

If the supplied material directly contains the answer, use it faithfully.

For a definition/rule/law:
- give the direct definition first
- keep it short
- do not add unnecessary general knowledge

For an exercise:
- answer the requested exercise/question using the supplied material
- preserve formulas and mathematical notation
- do not invent questions that are not present

For a chapter request:
- summarize only the supplied chapter material

If the supplied material genuinely does not answer the question, say:
"I couldn't find this information in the current Hira Academy material."

SOURCE PAGE:
${sourceURL}

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
                  maxOutputTokens: 1000
                }
              })
            }
          );

        if (gemini.ok) {
          const data =
            await gemini.json();

          answer =
            data?.candidates?.[0]
              ?.content?.parts
              ?.map(
                p => p.text || ""
              )
              .join("")
              .trim() || "";
        } else {
          console.log(
            "GEMINI ERROR STATUS:",
            gemini.status
          );
        }
      } catch (error) {
        console.log(
          "GEMINI ERROR:",
          error.message
        );
      }
    }

    // =======================================================
    // GEMINI FALLBACK
    // =======================================================
    if (!answer) {
      answer =
        `According to Hira Academy:\n\n${relevantText}`;
    }

    // =======================================================
    // SOURCE LINK
    // =======================================================
    answer +=
      `\n\n---\n**Source: Hira Academy**\n[Open the original Hira Academy page](${sourceURL})`;

    return res.status(200).json({
      reply: answer,
      sourceUrl: sourceURL,
      sourceTitle:
        getTitle(
          sourcePage.html
        )
    });

  } catch (error) {
    console.error(
      "HIRA API ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Internal Server Error"
    });
  }
}
