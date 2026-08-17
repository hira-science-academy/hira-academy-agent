export default async function handler(req, res) {
  const SITE = "https://hiraacademy.com.pk";

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
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing on Vercel."
      });
    }

    // =======================================================
    // BODY
    // =======================================================

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

    const question =
      userMessage?.content?.trim();

    if (!question) {
      return res.status(400).json({
        error: "No question provided."
      });
    }

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
        .replace(/<[^>]*>/g, " ")
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
        const controller =
          new AbortController();

        const timer = setTimeout(
          () => controller.abort(),
          9000
        );

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 Hira-Academy-Assistant",
            Accept:
              "text/html,application/xhtml+xml"
          }
        });

        clearTimeout(timer);

        if (!response.ok) {
          return null;
        }

        const html = await response.text();

        return {
          url,
          text: htmlToText(html)
        };
      } catch {
        return null;
      }
    }

    // =======================================================
    // SITEMAP
    // =======================================================

    const sitemapResponse =
      await fetch(`${SITE}/sitemap.xml`);

    if (!sitemapResponse.ok) {
      return res.status(500).json({
        error: "Unable to read Hira Academy sitemap."
      });
    }

    const sitemapXML =
      await sitemapResponse.text();

    const sitemapMatches =
      sitemapXML.match(
        /<loc>\s*([^<]+?)\s*<\/loc>/gi
      ) || [];

    const urls = sitemapMatches
      .map(x => {
        const m =
          x.match(
            /<loc>\s*([^<]+?)\s*<\/loc>/i
          );

        return m ? m[1].trim() : null;
      })
      .filter(Boolean)
      .filter(url =>
        url.startsWith(SITE)
      )
      .filter(url =>
        !/\.(jpg|jpeg|png|gif|webp|svg|css|js)$/i.test(
          url
        )
      );

    const uniqueUrls =
      [...new Set(urls)];

    // =======================================================
    // QUESTION NORMALIZATION
    // =======================================================

    const q = normalize(question);

    // =======================================================
    // EXACT EXERCISE DETECTION
    // =======================================================

    const exercise =
      q.match(
        /\b(?:exercise|ex)\s*(\d+)\s*[.]\s*(\d+)\b/i
      );

    // =======================================================
    // IMPORTANT CONCEPT WORDS
    // =======================================================

    const concepts = [];

    const knownConcepts = [
      "right hand grip rule",
      "right hand grip",
      "electromagnetic induction",
      "electromagnetism",
      "coriolis effect",
      "sea breeze",
      "land breeze",
      "sea breezes",
      "land breezes",
      "faraday law",
      "faraday's law",
      "lenz law",
      "fleming left hand rule",
      "fleming right hand rule",
      "transformer",
      "ac generator",
      "pn junction",
      "depletion region",
      "forward bias",
      "reverse bias"
    ];

    for (const concept of knownConcepts) {
      if (q.includes(concept)) {
        concepts.push(concept);
      }
    }

    // =======================================================
    // SCORE SITEMAP URLS
    //
    // We don't select only one guessed page.
    // We select several likely pages and then inspect
    // their ACTUAL CONTENT.
    // =======================================================

    function scoreUrl(url) {
      const u = normalize(url);
      let score = 0;

      // Exact exercise
      if (exercise) {
        const unit = exercise[1];
        const ex = exercise[2];

        if (
          u.includes(
            `unit${unit}-exercise${ex}`
          )
        ) {
          score += 1000;
        }

        if (
          u.includes(
            `unit${unit}`
          ) &&
          u.includes(
            `exercise${ex}`
          )
        ) {
          score += 700;
        }
      }

      // Concept in filename
      for (const concept of concepts) {
        const words =
          concept
            .split(" ")
            .filter(Boolean);

        for (const word of words) {
          if (
            word.length > 3 &&
            u.includes(word)
          ) {
            score += 30;
          }
        }
      }

      // Subject
      if (
        /\bmath|mathematics|maths\b/.test(q)
      ) {
        if (
          u.includes("math") ||
          u.includes("mathematics")
        ) {
          score += 100;
        }
      }

      if (
        /\bphysics\b/.test(q)
      ) {
        if (
          u.includes("physics")
        ) {
          score += 100;
        }
      }

      // Question type
      if (
        /\bmcq|mcqs|multiple choice\b/.test(q)
      ) {
        if (u.includes("mcq")) {
          score += 100;
        }
      }

      if (
        /\bshort question|short questions|definition|define\b/.test(q)
      ) {
        if (u.includes("short")) {
          score += 80;
        }
      }

      if (
        /\bcrq|crqs|constructed response\b/.test(q)
      ) {
        if (u.includes("constructed")) {
          score += 80;
        }
      }

      if (
        /\blong question|long questions|comprehensive\b/.test(q)
      ) {
        if (u.includes("long")) {
          score += 80;
        }
      }

      // Avoid generic hubs
      if (
        u === SITE ||
        u === `${SITE}/`
      ) {
        score -= 10000;
      }

      if (
        u.includes("home")
      ) {
        score -= 100;
      }

      return score;
    }

    const rankedUrls =
      uniqueUrls
        .map(url => ({
          url,
          score: scoreUrl(url)
        }))
        .sort(
          (a, b) =>
            b.score - a.score
        );

    // =======================================================
    // CHOOSE PAGES TO ACTUALLY READ
    // =======================================================

    let candidateUrls =
      rankedUrls
        .filter(x => x.score > 0)
        .slice(0, 12)
        .map(x => x.url);

    // If exact exercise was found,
    // make absolutely sure it is first.
    if (exercise) {
      const unit = exercise[1];
      const ex = exercise[2];

      const exact =
        uniqueUrls.find(url =>
          normalize(url).includes(
            `unit${unit}-exercise${ex}`
          )
        );

      if (exact) {
        candidateUrls = [
          exact,
          ...candidateUrls.filter(
            u => u !== exact
          )
        ];
      }
    }

    // =======================================================
    // IF URL NAME IS NOT ENOUGH,
    // SEARCH A BROADER SET OF RELEVANT PAGES.
    // =======================================================

    if (
      candidateUrls.length < 3
    ) {
      const broader =
        uniqueUrls.filter(url => {
          const u =
            normalize(url);

          if (
            /\bmath|mathematics|maths\b/.test(q)
          ) {
            return (
              u.includes("math") ||
              u.includes("mathematics")
            );
          }

          if (
            /\bphysics\b/.test(q)
          ) {
            return u.includes(
              "physics"
            );
          }

          return true;
        });

      candidateUrls = [
        ...new Set([
          ...candidateUrls,
          ...broader.slice(0, 10)
        ])
      ].slice(0, 12);
    }

    // =======================================================
    // FETCH CANDIDATE PAGES
    // =======================================================

    const pages =
      await Promise.all(
        candidateUrls.map(fetchPage)
      );

    const validPages =
      pages.filter(
        p =>
          p &&
          p.text &&
          p.text.length > 100
      );

    // =======================================================
    // SEARCH ACTUAL PAGE CONTENT
    // =======================================================

    const questionWords =
      q
        .split(/\s+/)
        .filter(word =>
          word.length >= 4
        );

    function contentScore(page) {
      const text =
        normalize(page.text);

      let score = 0;

      // Exact question
      if (
        text.includes(q)
      ) {
        score += 1000;
      }

      // Exact concepts
      for (const concept of concepts) {
        if (
          text.includes(
            concept
          )
        ) {
          score += 300;
        }
      }

      // Individual question words
      for (const word of questionWords) {
        if (
          text.includes(word)
        ) {
          score += 8;
        }
      }

      // Exercise exact match
      if (exercise) {
        const unit =
          exercise[1];

        const ex =
          exercise[2];

        if (
          text.includes(
            `exercise ${unit}.${ex}`
          )
        ) {
          score += 700;
        }

        if (
          text.includes(
            `exercise ${unit} ${ex}`
          )
        ) {
          score += 500;
        }
      }

      return score;
    }

    const scoredPages =
      validPages
        .map(page => ({
          ...page,
          score:
            contentScore(page)
        }))
        .sort(
          (a, b) =>
            b.score - a.score
        );

    // =======================================================
    // IMPORTANT:
    // USE THE BEST ACTUAL CONTENT PAGE
    // =======================================================

    let bestPage =
      scoredPages[0];

    // =======================================================
    // FALLBACK: IF NOTHING MATCHES, SEARCH MORE PHYSICS
    // OR MATH PAGES.
    // =======================================================

    if (
      !bestPage ||
      bestPage.score < 15
    ) {
      const fallbackUrls =
        uniqueUrls
          .filter(url => {
            const u =
              normalize(url);

            if (
              /\bphysics\b/.test(q)
            ) {
              return u.includes(
                "physics"
              );
            }

            if (
              /\bmath|mathematics|maths\b/.test(q)
            ) {
              return (
                u.includes("math") ||
                u.includes("mathematics")
              );
            }

            return false;
          })
          .slice(0, 20);

      const fallbackPages =
        await Promise.all(
          fallbackUrls.map(
            fetchPage
          )
        );

      const fallbackValid =
        fallbackPages
          .filter(
            p =>
              p &&
              p.text
          )
          .map(page => ({
            ...page,
            score:
              contentScore(page)
          }))
          .sort(
            (a, b) =>
              b.score - a.score
          );

      if (
        fallbackValid[0] &&
        (
          !bestPage ||
          fallbackValid[0].score >
            bestPage.score
        )
      ) {
        bestPage =
          fallbackValid[0];
      }
    }

    // =======================================================
    // NOTHING FOUND
    // =======================================================

    if (
      !bestPage ||
      bestPage.score < 15
    ) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material."
      });
    }

    // =======================================================
    // EXTRACT RELEVANT CONTENT
    // =======================================================

    const sourceText =
      bestPage.text;

    const normalizedSource =
      normalize(sourceText);

    let relevantText =
      sourceText;

    // Find concept/question position
    let position = -1;

    const searchTerms = [
      ...concepts,
      q
    ];

    for (const term of searchTerms) {
      const p =
        normalizedSource.indexOf(
          normalize(term)
        );

      if (
        p !== -1 &&
        (
          position === -1 ||
          p < position
        )
      ) {
        position = p;
      }
    }

    if (position >= 0) {
      const start =
        Math.max(
          0,
          position - 1800
        );

      const end =
        Math.min(
          sourceText.length,
          position + 10000
        );

      relevantText =
        sourceText.substring(
          start,
          end
        );
    }

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
              systemInstruction: {
                parts: [
                  {
                    text: `
You are the official Hira Academy teaching assistant.

The user's question is:

${question}

You MUST answer using the Hira Academy SOURCE CONTENT below.

RULES:

1. Use the supplied Hira Academy source as the primary and controlling source.
2. Do not invent information.
3. Do not mix information from unrelated Hira Academy pages.
4. Do not answer from old/general model knowledge if the Hira Academy source contains the relevant information.
5. If the source clearly contains the answer, answer it directly.
6. If the source contains the exact question and answer, preserve the wording as closely as possible.
7. For mathematics, preserve formulas and mathematical notation.
8. For physics, keep the answer concise and faithful to the source.
9. If the source does NOT support the answer, say:
"I couldn't find this information in the current Hira Academy material."
10. Do not generate a different Hira Academy URL.
11. Do not add a Source section. The server will add it.

SOURCE PAGE:
${bestPage.url}

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
                maxOutputTokens: 1200
              }
            })
          }
        );

      const data =
        await geminiResponse.json();

      if (geminiResponse.ok) {
        answer =
          data?.candidates?.[0]
            ?.content?.parts
            ?.map(
              part =>
                part.text || ""
            )
            .join("")
            .trim() || "";
      } else {
        console.log(
          "GEMINI ERROR:",
          data?.error?.message
        );
      }
    } catch (error) {
      console.log(
        "GEMINI REQUEST ERROR:",
        error.message
      );
    }

    // =======================================================
    // FALLBACK WHEN GEMINI QUOTA IS EXCEEDED
    // =======================================================

    if (!answer) {
      answer =
        "According to Hira Academy:\n\n" +
        relevantText.substring(
          0,
          5000
        );
    }

    // =======================================================
    // REMOVE ANY SOURCE SECTION GENERATED BY MODEL
    // =======================================================

    answer =
      answer
        .replace(
          /\*\*Source:\s*Hira Academy\*\*[\s\S]*$/i,
          ""
        )
        .trim();

    // =======================================================
    // ADD ONLY THE ACTUAL SOURCE PAGE
    // =======================================================

    answer +=
      `\n\n---\n**Source: Hira Academy**\n[Open the original Hira Academy page](${bestPage.url})`;

    // =======================================================
    // RESPONSE
    // =======================================================

    return res.status(200).json({
      reply: answer,
      sourceUrl: bestPage.url
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
