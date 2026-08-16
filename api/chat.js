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
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const API_KEY = process.env.GEMINI_API_KEY;
    const SITE = "https://hiraacademy.com.pk";

    // =======================================================
    // GEMINI KEY
    // =======================================================
    if (!API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing on Vercel."
      });
    }

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

    const latestUserMessage =
      [...messages]
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

    console.log("HIRA QUESTION:", question);

    // =======================================================
    // NORMALIZE
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
        .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const normalizedQuestion =
      normalize(question);

    // =======================================================
    // STOP WORDS
    // =======================================================
    const STOP_WORDS = new Set([
      "what",
      "whats",
      "what's",
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
              word =>
                word.length >= 3 &&
                !STOP_WORDS.has(word)
            )
        )
      ];
    }

    const questionWords =
      importantWords(question);

    // =======================================================
    // EXACT IMPORTANT CONCEPTS
    // =======================================================
    const CONCEPTS = [
      {
        name: "right hand grip rule",
        phrases: [
          "right hand grip rule",
          "right-hand grip rule",
          "right hand grip",
          "right-hand grip"
        ]
      },
      {
        name: "coriolis effect",
        phrases: [
          "coriolis effect",
          "coriolis force"
        ]
      },
      {
        name: "fleming left hand rule",
        phrases: [
          "fleming's left hand rule",
          "fleming left hand rule",
          "left hand rule"
        ]
      },
      {
        name: "electromagnetic induction",
        phrases: [
          "electromagnetic induction"
        ]
      },
      {
        name: "faraday law",
        phrases: [
          "faraday's law",
          "faraday law"
        ]
      },
      {
        name: "lenz law",
        phrases: [
          "lenz's law",
          "lenz law"
        ]
      },
      {
        name: "magnetic field",
        phrases: [
          "magnetic field"
        ]
      },
      {
        name: "electric motor",
        phrases: [
          "electric motor",
          "dc motor"
        ]
      },
      {
        name: "ac generator",
        phrases: [
          "ac generator",
          "alternating current generator"
        ]
      },
      {
        name: "transformer",
        phrases: [
          "transformer"
        ]
      },
      {
        name: "pn junction diode",
        phrases: [
          "pn junction diode",
          "pn junction",
          "junction diode"
        ]
      },
      {
        name: "depletion region",
        phrases: [
          "depletion region"
        ]
      },
      {
        name: "forward bias",
        phrases: [
          "forward bias"
        ]
      },
      {
        name: "reverse bias",
        phrases: [
          "reverse bias"
        ]
      }
    ];

    function detectConcept(text) {
      for (const concept of CONCEPTS) {
        for (const phrase of concept.phrases) {
          if (
            normalize(text).includes(
              normalize(phrase)
            )
          ) {
            return concept;
          }
        }
      }

      return null;
    }

    const detectedConcept =
      detectConcept(question);

    // =======================================================
    // DETECT CLASS
    // =======================================================
    function detectClass(text) {
      const q = normalize(text);

      if (
        /\b10th\b/.test(q) ||
        /\bclass 10\b/.test(q) ||
        /\bgrade 10\b/.test(q) ||
        /\btenth class\b/.test(q)
      ) {
        return 10;
      }

      if (
        /\b9th\b/.test(q) ||
        /\bclass 9\b/.test(q) ||
        /\bgrade 9\b/.test(q) ||
        /\bninth class\b/.test(q)
      ) {
        return 9;
      }

      return null;
    }

    const grade =
      detectClass(question);

    // =======================================================
    // DETECT SUBJECT
    // =======================================================
    function detectSubject(text) {
      const q = normalize(text);

      if (
        /\bmath\b/.test(q) ||
        /\bmaths\b/.test(q) ||
        /\bmathematics\b/.test(q) ||
        /\bvector\b/.test(q) ||
        /\bvectors\b/.test(q) ||
        /\balgebra\b/.test(q) ||
        /\btrigonometry\b/.test(q)
      ) {
        return "math";
      }

      if (
        /\bphysics\b/.test(q) ||
        /\bmagnetic\b/.test(q) ||
        /\bmagnetism\b/.test(q) ||
        /\bsolenoid\b/.test(q) ||
        /\bfleming\b/.test(q) ||
        /\bfaraday\b/.test(q) ||
        /\blenz\b/.test(q) ||
        /\bmotor\b/.test(q) ||
        /\bgenerator\b/.test(q) ||
        /\btransformer\b/.test(q) ||
        /\bsemiconductor\b/.test(q) ||
        /\bdiode\b/.test(q) ||
        /\bcoriolis\b/.test(q)
      ) {
        return "physics";
      }

      return null;
    }

    const subject =
      detectSubject(question);

    // =======================================================
    // EXERCISE DETECTION
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
    // CHAPTER DETECTION
    // =======================================================
    function detectChapter(text) {
      const match =
        normalize(text).match(
          /\bchapter\s+(\d+)\b/
        );

      return match
        ? Number(match[1])
        : null;
    }

    const chapter =
      detectChapter(question);

    // =======================================================
    // FETCH WITH TIMEOUT
    // =======================================================
    async function fetchURL(
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
                "Hira-Academy-Assistant/2.0",
              "Accept":
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
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }

    // =======================================================
    // SITEMAP
    // =======================================================
    function extractSitemapURLs(xml) {
      const urls = [];

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

        urls.push(url);
      }

      return [
        ...new Set(urls)
      ];
    }

    const sitemap =
      await fetchURL(
        `${SITE}/sitemap.xml`,
        7000
      );

    let siteURLs =
      sitemap
        ? extractSitemapURLs(
            sitemap.html
          )
        : [];

    // =======================================================
    // IMPORTANT FALLBACK URLS
    // =======================================================
    siteURLs = [
      ...new Set([
        ...siteURLs,

        `${SITE}/`,
        `${SITE}/9th-class-notes.html`,
        `${SITE}/10th-class-notes.html`,
        `${SITE}/Physics-9th.html`,
        `${SITE}/Physics-10th.html`,
        `${SITE}/Mathematics-9th.html`,
        `${SITE}/Mathematics-10th-New-2026.html`,
        `${SITE}/Mathematics-10th.html`,
        `${SITE}/Physics-9th-Definitions.html`
      ])
    ];

    // =======================================================
    // URL PRIORITY
    // =======================================================
    function urlScore(url) {
      const u =
        normalize(url);

      let score = 0;

      if (
        subject === "physics" &&
        u.includes("physics")
      ) {
        score += 50;
      }

      if (
        subject === "math" &&
        (
          u.includes("math") ||
          u.includes("mathematics")
        )
      ) {
        score += 50;
      }

      if (
        grade === 9 &&
        u.includes("9th")
      ) {
        score += 30;
      }

      if (
        grade === 10 &&
        u.includes("10th")
      ) {
        score += 30;
      }

      // Exercise gets VERY high priority
      if (exercise) {
        const exerciseNumber =
          `${exercise.unit}.${exercise.exercise}`;

        if (
          u.includes("exercise") &&
          u.includes(
            exerciseNumber
          )
        ) {
          score += 500;
        }

        if (
          u.includes(
            `unit${exercise.unit}`
          ) ||
          u.includes(
            `unit-${exercise.unit}`
          )
        ) {
          score += 100;
        }

        if (
          u.includes(
            String(
              exercise.exercise
            )
          )
        ) {
          score += 50;
        }
      }

      if (chapter) {
        if (
          u.includes(
            `chapter${chapter}`
          ) ||
          u.includes(
            `chapter-${chapter}`
          )
        ) {
          score += 100;
        }
      }

      return score;
    }

    // =======================================================
    // FETCH MORE RELEVANT PAGES FIRST
    // =======================================================
    const prioritizedURLs =
      siteURLs
        .map(url => ({
          url,
          score: urlScore(url)
        }))
        .sort(
          (a, b) =>
            b.score - a.score
        );

    // Don't fetch every page.
    const URLsToFetch =
      prioritizedURLs
        .slice(0, 60)
        .map(x => x.url);

    console.log(
      "PAGES TO SEARCH:",
      URLsToFetch.length
    );

    // =======================================================
    // FETCH PAGES
    // =======================================================
    const fetchedPages = [];

    // Fetch in small batches to avoid
    // hammering your website.
    for (
      let i = 0;
      i < URLsToFetch.length;
      i += 10
    ) {
      const batch =
        URLsToFetch.slice(
          i,
          i + 10
        );

      const results =
        await Promise.all(
          batch.map(
            url =>
              fetchURL(
                url,
                6000
              )
          )
        );

      for (const result of results) {
        if (result) {
          fetchedPages.push(
            result
          );
        }
      }
    }

    // =======================================================
    // HTML → TEXT
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

    function getHeadings(html) {
      const matches =
        String(html || "").match(
          /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi
        ) || [];

      return matches
        .map(
          x =>
            normalize(
              htmlToText(x)
            )
        )
        .join(" ");
    }

    // =======================================================
    // GET RELEVANT EXCERPT
    // =======================================================
    function getExcerpt(
      text,
      terms,
      concept
    ) {
      const lower =
        text.toLowerCase();

      let position = -1;

      // Exact concept first
      if (concept) {
        for (
          const phrase
          of concept.phrases
        ) {
          const p =
            lower.indexOf(
              normalize(
                phrase
              )
            );

          if (p !== -1) {
            position = p;
            break;
          }
        }
      }

      // Exact question
      if (
        position === -1 &&
        normalizedQuestion.length > 8
      ) {
        position =
          lower.indexOf(
            normalizedQuestion
          );
      }

      // Important word
      if (position === -1) {
        for (
          const word
          of terms
        ) {
          const p =
            lower.indexOf(word);

          if (p !== -1) {
            position = p;
            break;
          }
        }
      }

      if (position === -1) {
        return text.substring(
          0,
          10000
        );
      }

      return text.substring(
        Math.max(
          0,
          position - 2500
        ),
        Math.min(
          text.length,
          position + 10000
        )
      );
    }

    // =======================================================
    // SCORE PAGE
    // =======================================================
    function scorePage(page) {
      const text =
        normalize(
          htmlToText(
            page.html
          )
        );

      const title =
        normalize(
          getTitle(
            page.html
          )
        );

      const headings =
        normalize(
          getHeadings(
            page.html
          )
        );

      const url =
        normalize(
          page.url
        );

      let score = 0;

      // -------------------------------------------------------
      // EXACT CONCEPT
      // -------------------------------------------------------
      if (detectedConcept) {
        let found = false;

        for (
          const phrase
          of detectedConcept.phrases
        ) {
          const p =
            normalize(
              phrase
            );

          if (
            text.includes(p)
          ) {
            score += 2000;
            found = true;
          }

          if (
            title.includes(p)
          ) {
            score += 1000;
            found = true;
          }

          if (
            headings.includes(p)
          ) {
            score += 1200;
            found = true;
          }
        }

        // A page without the exact concept
        // is heavily penalized.
        if (!found) {
          score -= 1500;
        }
      }

      // -------------------------------------------------------
      // EXACT QUESTION
      // -------------------------------------------------------
      if (
        normalizedQuestion.length >= 10 &&
        text.includes(
          normalizedQuestion
        )
      ) {
        score += 1500;
      }

      // -------------------------------------------------------
      // SUBJECT
      // -------------------------------------------------------
      if (
        subject === "physics"
      ) {
        if (
          title.includes(
            "physics"
          )
        ) {
          score += 100;
        }

        if (
          url.includes(
            "physics"
          )
        ) {
          score += 50;
        }
      }

      if (
        subject === "math"
      ) {
        if (
          title.includes(
            "math"
          ) ||
          title.includes(
            "mathematics"
          )
        ) {
          score += 100;
        }

        if (
          url.includes(
            "math"
          ) ||
          url.includes(
            "mathematics"
          )
        ) {
          score += 50;
        }
      }

      // -------------------------------------------------------
      // CLASS
      // -------------------------------------------------------
      if (
        grade === 9
      ) {
        if (
          title.includes(
            "9th"
          )
        ) {
          score += 80;
        }

        if (
          url.includes(
            "9th"
          )
        ) {
          score += 40;
        }
      }

      if (
        grade === 10
      ) {
        if (
          title.includes(
            "10th"
          )
        ) {
          score += 80;
        }

        if (
          url.includes(
            "10th"
          )
        ) {
          score += 40;
        }
      }

      // -------------------------------------------------------
      // IMPORTANT WORDS
      // -------------------------------------------------------
      let matchedWords = 0;

      for (
        const word
        of questionWords
      ) {
        if (
          text.includes(word)
        ) {
          matchedWords++;
          score += 15;
        }

        if (
          title.includes(word)
        ) {
          score += 40;
        }

        if (
          headings.includes(word)
        ) {
          score += 60;
        }
      }

      // -------------------------------------------------------
      // PROXIMITY
      // -------------------------------------------------------
      const positions = [];

      for (
        const word
        of questionWords
      ) {
        let start = 0;

        while (true) {
          const p =
            text.indexOf(
              word,
              start
            );

          if (p === -1) break;

          positions.push(p);

          start =
            p + word.length;

          if (
            positions.length > 100
          ) {
            break;
          }
        }
      }

      if (
        positions.length >= 2
      ) {
        positions.sort(
          (a, b) => a - b
        );

        for (
          let i = 1;
          i < positions.length;
          i++
        ) {
          const distance =
            positions[i] -
            positions[i - 1];

          if (
            distance < 150
          ) {
            score += 100;
          } else if (
            distance < 400
          ) {
            score += 60;
          } else if (
            distance < 1000
          ) {
            score += 20;
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
          text.includes(
            exerciseText
          )
        ) {
          score += 1000;
        }

        if (
          title.includes(
            exerciseText
          )
        ) {
          score += 1500;
        }

        if (
          url.includes(
            "exercise"
          ) &&
          url.includes(
            String(
              exercise.exercise
            )
          )
        ) {
          score += 800;
        }
      }

      return {
        url: page.url,
        title: getTitle(
          page.html
        ),
        text,
        score,
        matchedWords
      };
    }

    // =======================================================
    // RANK
    // =======================================================
    const ranked =
      fetchedPages
        .map(scorePage)
        .sort(
          (a, b) =>
            b.score - a.score
        );

    console.log(
      "SEARCH RESULTS:",
      ranked
        .slice(0, 10)
        .map(x => ({
          score: x.score,
          title: x.title,
          url: x.url
        }))
    );

    const best =
      ranked[0];

    // =======================================================
    // STRICT VALIDATION
    // =======================================================
    let validSource = false;

    if (best) {
      if (
        detectedConcept
      ) {
        validSource =
          detectedConcept.phrases.some(
            phrase =>
              best.text.includes(
                normalize(
                  phrase
                )
              )
          ) ||
          detectedConcept.phrases.some(
            phrase =>
              normalize(
                best.title
              ).includes(
                normalize(
                  phrase
                )
              )
          );
      } else {
        validSource =
          best.matchedWords >= 2 &&
          best.score >= 100;
      }
    }

    // =======================================================
    // NOT FOUND
    //
    // IMPORTANT:
    // No Gemini call here.
    // This saves quota.
    // =======================================================
    if (
      !best ||
      !validSource
    ) {
      console.log(
        "NO RELIABLE HIRA SOURCE FOUND"
      );

      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material."
      });
    }

    // =======================================================
    // SOURCE EXCERPT
    // =======================================================
    const excerpt =
      getExcerpt(
        best.text,
        questionWords,
        detectedConcept
      );

    console.log(
      "SELECTED SOURCE:",
      best.url
    );

    // =======================================================
    // IMPORTANT:
    // SIMPLE FACTUAL ANSWERS CAN BE RETURNED DIRECTLY
    // WITHOUT GEMINI.
    // =======================================================
    const simpleQuestion =
      /^(what|what is|what are|define|definition of|who|where|when)\b/i.test(
        question.trim()
      );

    // For exact concepts, give Gemini a chance to explain,
    // but if Gemini quota is unavailable we can still provide
    // the actual Hira source excerpt.
    // =======================================================

    // =======================================================
    // GEMINI REQUEST
    // =======================================================
    let geminiResponse = null;

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
                API_KEY
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [
                  {
                    text: `
You are the official Hira Academy teaching assistant.

WEBSITE:
${SITE}

IMPORTANT:
The following content was retrieved directly from the
Hira Academy website.

SOURCE TITLE:
${best.title}

SOURCE URL:
${best.url}

SOURCE CONTENT:
${excerpt}

============================================================
RULES
============================================================

1. Use the supplied Hira Academy content as your primary
   and authoritative source.

2. Do NOT replace it with old textbook knowledge.

3. Do NOT invent information.

4. Do NOT claim that Hira Academy says something unless
   the supplied content supports it.

5. Keep the answer concise and suitable for Class 9/10
   Punjab Board / PECTAA students.

6. Preserve formulas and terminology.

7. If the supplied material does not answer the question,
   say:
   "I couldn't find this information in the current Hira
   Academy material."

8. Do not mention the internal search system.

9. Do not create or recommend another Hira Academy page.

10. Answer the user's CURRENT question, not an earlier
    question in the conversation.

11. Do not confuse different subjects or chapters.

============================================================
SOURCE
============================================================

The final response will automatically include the exact
Hira Academy source link.
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
                maxOutputTokens: 900
              }
            })
          }
        );
    } catch (error) {
      console.error(
        "Gemini request failed:",
        error
      );
    }

    // =======================================================
    // GEMINI FAILED / QUOTA
    //
    // IMPORTANT:
    // Return actual Hira Academy material instead of
    // saying the source is unavailable.
    // =======================================================
    if (
      !geminiResponse ||
      !geminiResponse.ok
    ) {
      console.log(
        "GEMINI UNAVAILABLE - RETURNING HIRA SOURCE"
      );

      const fallback =
        excerpt.length > 2500
          ? excerpt.substring(
              0,
              2500
            ) + "..."
          : excerpt;

      return res.status(200).json({
        reply:
          `According to Hira Academy:\n\n${fallback}\n\n---\n**Source: Hira Academy**\n[Open the original Hira Academy page](${best.url})`,
        sourceUrl: best.url,
        sourceTitle: best.title
      });
    }

    // =======================================================
    // READ GEMINI
    // =======================================================
    const data =
      await geminiResponse.json();

    let answer =
      data?.candidates?.[0]
        ?.content?.parts
        ?.map(
          p => p.text || ""
        )
        .join("")
        .trim();

    if (!answer) {
      const fallback =
        excerpt.length > 2500
          ? excerpt.substring(
              0,
              2500
            ) + "..."
          : excerpt;

      answer =
        `According to Hira Academy:\n\n${fallback}`;
    }

    // =======================================================
    // SOURCE LINK
    // =======================================================
    answer +=
      `\n\n---\n**Source: Hira Academy**\n[Open the original Hira Academy page](${best.url})`;

    return res.status(200).json({
      reply: answer,
      sourceUrl: best.url,
      sourceTitle: best.title
    });

  } catch (error) {
    console.error(
      "Hira Academy API ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Internal Server Error"
    });
  }
}
