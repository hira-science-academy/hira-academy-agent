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

    const userMessages = messages.filter(
      m =>
        m &&
        m.role === "user" &&
        typeof m.content === "string" &&
        m.content.trim()
    );

    const latest =
      userMessages[userMessages.length - 1];

    const question =
      latest?.content?.trim();

    if (!question) {
      return res.status(400).json({
        error: "No user question provided."
      });
    }

    const SITE = "https://hiraacademy.com.pk";
    const SITEMAP = `${SITE}/sitemap.xml`;

    // =======================================================
    // NORMALIZE TEXT
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

    // =======================================================
    // REMOVE COMMON QUESTION WORDS
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
      "hira",
      "academy",
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

    // =======================================================
    // SPECIAL CONCEPT PHRASES
    //
    // These prevent generic words from beating an exact topic.
    // =======================================================
    const CONCEPTS = [
      [
        "right hand grip rule",
        [
          "right hand grip rule",
          "right-hand grip rule",
          "right hand grip",
          "right-hand grip"
        ]
      ],
      [
        "coriolis effect",
        [
          "coriolis effect",
          "coriolis force"
        ]
      ],
      [
        "fleming left hand rule",
        [
          "fleming's left hand rule",
          "fleming left hand rule",
          "left hand rule"
        ]
      ],
      [
        "electromagnetic induction",
        [
          "electromagnetic induction"
        ]
      ],
      [
        "faraday law",
        [
          "faraday's law",
          "faraday law"
        ]
      ],
      [
        "lenz law",
        [
          "lenz's law",
          "lenz law"
        ]
      ],
      [
        "magnetic field",
        [
          "magnetic field"
        ]
      ],
      [
        "electric motor",
        [
          "electric motor",
          "dc motor"
        ]
      ],
      [
        "ac generator",
        [
          "ac generator",
          "alternating current generator"
        ]
      ],
      [
        "right hand rule",
        [
          "right hand rule",
          "right-hand rule"
        ]
      ]
    ];

    function detectConcept(text) {
      const q = normalize(text);

      for (const [name, phrases] of CONCEPTS) {
        for (const phrase of phrases) {
          if (q.includes(normalize(phrase))) {
            return {
              name,
              phrases: phrases.map(normalize)
            };
          }
        }
      }

      return null;
    }

    const concept = detectConcept(question);

    // =======================================================
    // CLASS
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

    // =======================================================
    // SUBJECT
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

    // =======================================================
    // EXERCISE
    // =======================================================
    function detectExercise(text) {
      const q = normalize(text);

      const match =
        q.match(/\bexercise\s+(\d+)\.(\d+)\b/);

      if (!match) return null;

      return {
        unit: Number(match[1]),
        exercise: Number(match[2])
      };
    }

    // =======================================================
    // CHAPTER
    // =======================================================
    function detectChapter(text) {
      const q = normalize(text);

      const match =
        q.match(/\bchapter\s+(\d+)\b/);

      return match
        ? Number(match[1])
        : null;
    }

    const grade = detectClass(question);
    const subject = detectSubject(question);
    const exercise = detectExercise(question);
    const chapter = detectChapter(question);

    const words = importantWords(question);

    // =======================================================
    // FETCH WITH TIMEOUT
    // =======================================================
    async function fetchPage(url, timeout = 7000) {
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
              "Hira-Academy-Assistant/1.0",
            "Accept":
              "text/html,application/xhtml+xml"
          }
        });

        if (!response.ok) return null;

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
    function getSitemapUrls(xml) {
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

        const url = match[1].trim();

        if (!url.startsWith(SITE)) continue;

        if (
          /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js)$/i.test(
            url
          )
        ) {
          continue;
        }

        urls.push(url);
      }

      return [...new Set(urls)];
    }

    const sitemapPage =
      await fetchPage(SITEMAP, 7000);

    let siteUrls = sitemapPage
      ? getSitemapUrls(sitemapPage.html)
      : [];

    // =======================================================
    // FALLBACK IMPORTANT PAGES
    // =======================================================
    siteUrls = [
      ...new Set([
        ...siteUrls,

        `${SITE}/`,
        `${SITE}/9th-class-notes.html`,
        `${SITE}/10th-class-notes.html`,
        `${SITE}/Physics-9th.html`,
        `${SITE}/Physics-10th.html`,
        `${SITE}/Mathematics-9th.html`,
        `${SITE}/Mathematics-10th-New-2026.html`,
        `${SITE}/Mathematics-10th.html`
      ])
    ];

    // =======================================================
    // URL FILTER
    //
    // IMPORTANT:
    // This only decides which pages to DOWNLOAD.
    // It does NOT decide which page is the answer.
    // =======================================================
    function urlPriority(url) {
      const u = normalize(url);
      let score = 0;

      if (subject === "physics" && u.includes("physics")) {
        score += 20;
      }

      if (
        subject === "math" &&
        (u.includes("math") || u.includes("mathematics"))
      ) {
        score += 20;
      }

      if (
        grade === 10 &&
        (
          u.includes("10th") ||
          u.includes("class-10") ||
          u.includes("class10")
        )
      ) {
        score += 10;
      }

      if (
        grade === 9 &&
        (
          u.includes("9th") ||
          u.includes("class-9") ||
          u.includes("class9")
        )
      ) {
        score += 10;
      }

      if (exercise) {
        if (
          u.includes("exercise") &&
          u.includes(String(exercise.exercise))
        ) {
          score += 30;
        }

        if (
          u.includes(`unit${exercise.unit}`) ||
          u.includes(`unit-${exercise.unit}`)
        ) {
          score += 20;
        }
      }

      if (chapter) {
        if (
          u.includes(`chapter${chapter}`) ||
          u.includes(`chapter-${chapter}`)
        ) {
          score += 20;
        }
      }

      return score;
    }

    const candidateUrls =
      siteUrls
        .map(url => ({
          url,
          score: urlPriority(url)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 80)
        .map(x => x.url);

    // =======================================================
    // FETCH CANDIDATE PAGES
    // =======================================================
    const pages = (
      await Promise.all(
        candidateUrls.map(
          url => fetchPage(url, 6000)
        )
      )
    ).filter(Boolean);

    // =======================================================
    // HTML TO TEXT
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
          /<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|tr|td|th|blockquote)>/gi,
          "\n"
        )
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/\s+/g, " ")
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
    // EXTRACT HEADINGS
    // =======================================================
    function getHeadings(html) {
      const headings = [];

      const matches =
        String(html || "").match(
          /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi
        ) || [];

      for (const item of matches) {
        const text = normalize(
          htmlToText(item)
        );

        if (text) headings.push(text);
      }

      return headings.join(" ");
    }

    // =======================================================
    // FIND WORD POSITIONS
    // =======================================================
    function wordPositions(text, word) {
      const positions = [];
      let start = 0;

      while (true) {
        const pos =
          text.indexOf(word, start);

        if (pos === -1) break;

        positions.push(pos);
        start = pos + word.length;

        if (positions.length >= 20) break;
      }

      return positions;
    }

    // =======================================================
    // PROXIMITY SCORE
    //
    // If important words occur near each other, that is a
    // much stronger signal than merely occurring somewhere.
    // =======================================================
    function proximityScore(text, terms) {
      if (!terms.length) return 0;

      const positions = [];

      for (const term of terms) {
        const found =
          wordPositions(text, term);

        for (const pos of found) {
          positions.push({
            term,
            pos
          });
        }
      }

      if (positions.length < 2) return 0;

      let best = 0;

      for (const a of positions) {
        for (const b of positions) {
          if (a.term === b.term) continue;

          const distance =
            Math.abs(a.pos - b.pos);

          if (distance <= 150) {
            best = Math.max(best, 100);
          } else if (distance <= 300) {
            best = Math.max(best, 70);
          } else if (distance <= 600) {
            best = Math.max(best, 40);
          } else if (distance <= 1200) {
            best = Math.max(best, 20);
          }
        }
      }

      return best;
    }

    // =======================================================
    // SCORE A PAGE
    // =======================================================
    function scorePage(page) {
      const text =
        normalize(
          htmlToText(page.html)
        );

      const title =
        normalize(
          getTitle(page.html)
        );

      const headings =
        normalize(
          getHeadings(page.html)
        );

      const url =
        normalize(page.url);

      let score = 0;

      // -------------------------------------------------------
      // 1. EXACT CONCEPT = VERY STRONG
      // -------------------------------------------------------
      if (concept) {
        let exactFound = false;

        for (const phrase of concept.phrases) {
          if (text.includes(phrase)) {
            score += 1000;
            exactFound = true;
          }

          if (title.includes(phrase)) {
            score += 500;
            exactFound = true;
          }

          if (headings.includes(phrase)) {
            score += 700;
            exactFound = true;
          }
        }

        // CRITICAL:
        // If the question is an exact known concept and this
        // page does NOT contain the concept, do not allow
        // generic "physics" words to make it win.
        if (!exactFound) {
          score -= 500;
        }
      }

      // -------------------------------------------------------
      // 2. EXACT QUESTION PHRASE
      // -------------------------------------------------------
      const normalizedQuestion =
        normalize(question);

      if (
        normalizedQuestion.length >= 8 &&
        text.includes(normalizedQuestion)
      ) {
        score += 900;
      }

      // -------------------------------------------------------
      // 3. SUBJECT
      // -------------------------------------------------------
      if (subject === "physics") {
        if (title.includes("physics")) score += 30;
        if (url.includes("physics")) score += 20;
      }

      if (subject === "math") {
        if (
          title.includes("math") ||
          title.includes("mathematics")
        ) {
          score += 30;
        }

        if (
          url.includes("math") ||
          url.includes("mathematics")
        ) {
          score += 20;
        }
      }

      // -------------------------------------------------------
      // 4. CLASS
      // -------------------------------------------------------
      if (grade === 10) {
        if (
          title.includes("10th") ||
          title.includes("class 10")
        ) {
          score += 30;
        }

        if (url.includes("10th")) {
          score += 20;
        }
      }

      if (grade === 9) {
        if (
          title.includes("9th") ||
          title.includes("class 9")
        ) {
          score += 30;
        }

        if (url.includes("9th")) {
          score += 20;
        }
      }

      // -------------------------------------------------------
      // 5. INDIVIDUAL IMPORTANT WORDS
      // -------------------------------------------------------
      let matched = 0;

      for (const word of words) {
        if (text.includes(word)) {
          matched++;
          score += 8;
        }

        if (title.includes(word)) {
          score += 25;
        }

        if (headings.includes(word)) {
          score += 35;
        }
      }

      // -------------------------------------------------------
      // 6. PROXIMITY
      // -------------------------------------------------------
      score += proximityScore(
        text,
        words
      );

      // -------------------------------------------------------
      // 7. EXERCISE
      // -------------------------------------------------------
      if (exercise) {
        const exercisePhrase =
          `exercise ${exercise.unit}.${exercise.exercise}`;

        if (
          text.includes(exercisePhrase)
        ) {
          score += 700;
        }

        if (
          title.includes(exercisePhrase)
        ) {
          score += 900;
        }

        if (
          url.includes("exercise") &&
          url.includes(
            String(exercise.exercise)
          )
        ) {
          score += 300;
        }
      }

      // -------------------------------------------------------
      // 8. CHAPTER
      // -------------------------------------------------------
      if (chapter) {
        const chapterPhrase =
          `chapter ${chapter}`;

        if (
          text.includes(chapterPhrase)
        ) {
          score += 300;
        }

        if (
          title.includes(chapterPhrase)
        ) {
          score += 500;
        }
      }

      return {
        url: page.url,
        title: getTitle(page.html),
        text,
        score,
        matched
      };
    }

    const ranked =
      pages
        .map(scorePage)
        .sort(
          (a, b) => b.score - a.score
        );

    // =======================================================
    // DEBUG LOG
    // =======================================================
    console.log(
      "QUESTION:",
      question
    );

    console.log(
      "CONCEPT:",
      concept?.name || "none"
    );

    console.log(
      "TOP SEARCH RESULTS:",
      ranked.slice(0, 10).map(p => ({
        score: p.score,
        title: p.title,
        url: p.url
      }))
    );

    const best = ranked[0];

    // =======================================================
    // STRICT SOURCE VALIDATION
    //
    // NEVER attach a random Hira page as the source.
    // =======================================================
    let sourceIsValid = false;

    if (best) {
      if (concept) {
        sourceIsValid =
          concept.phrases.some(
            phrase =>
              best.text.includes(phrase)
          ) ||
          concept.phrases.some(
            phrase =>
              normalize(best.title).includes(
                phrase
              )
          );
      } else {
        const matchedImportantWords =
          words.filter(
            word =>
              best.text.includes(word)
          ).length;

        // Need meaningful matching.
        sourceIsValid =
          best.score >= 80 &&
          (
            matchedImportantWords >= 2 ||
            best.score >= 500
          );
      }
    }

    // =======================================================
    // NO GENUINE SOURCE FOUND
    // =======================================================
    if (!best || !sourceIsValid) {
      return await noSourceResponse(
        question,
        messages,
        API_KEY,
        res
      );
    }

    // =======================================================
    // EXTRACT RELEVANT CONTENT
    // =======================================================
    function extractRelevantSection(
      text,
      terms,
      concept
    ) {
      const lower = text.toLowerCase();

      let position = -1;

      // First preference: exact concept
      if (concept) {
        for (const phrase of concept.phrases) {
          const p =
            lower.indexOf(phrase);

          if (p !== -1) {
            position = p;
            break;
          }
        }
      }

      // Second preference: important word
      if (position === -1) {
        for (const term of terms) {
          const p =
            lower.indexOf(term);

          if (p !== -1) {
            position = p;
            break;
          }
        }
      }

      if (position === -1) {
        return text.substring(0, 8000);
      }

      const start =
        Math.max(
          0,
          position - 2500
        );

      const end =
        Math.min(
          text.length,
          position + 8000
        );

      return text.substring(
        start,
        end
      );
    }

    const relevant =
      extractRelevantSection(
        best.text,
        words,
        concept
      );

    // =======================================================
    // GEMINI
    // =======================================================
    const systemInstruction = {
      parts: [
        {
          text: `
You are the official Hira Academy Assistant.

Website:
${SITE}

The following content was found by SEARCHING THE ACTUAL
Hira Academy webpage.

SOURCE TITLE:
${best.title}

SOURCE URL:
${best.url}

SOURCE CONTENT:
${relevant}

============================================================
STRICT RULES
============================================================

1. The source above is the primary source.

2. Answer using the supplied Hira Academy content.

3. Do NOT use an old answer from your training when the
   Hira Academy source provides the information.

4. Do NOT invent information.

5. Do NOT claim that a page contains something unless it
   is actually supported by the supplied source content.

6. Do NOT use a different Hira Academy page as a substitute.

7. If the supplied source does not answer the question,
   say:

   "I couldn't find this information in the current Hira
   Academy material."

8. Keep answers appropriate for Class 9 and Class 10
   Punjab Board / PECTAA students.

9. For Mathematics, preserve formulas and mathematical
   notation.

10. For Physics, use the terminology found in the source.

11. Do not add unnecessary information.

============================================================
IMPORTANT NEW-QUESTION RULE
============================================================

Treat every independent user question as a NEW question.

For example:

User:
exercise 6.2 math 10

Then:

User:
What is the right hand grip rule?

The second question is NOT about Exercise 6.2.

Search/source selection has already been performed for the
new question. Answer the new question from its own source.

============================================================
FOLLOW-UP RULE
============================================================

Only use previous conversation context if the latest
message is clearly a follow-up such as:

why?
how?
explain it
explain this
what does this mean?
tell me more
solve this
give more detail

============================================================
SOURCE LINK
============================================================

At the end of the answer, provide ONLY this source:

${best.url}

Do not provide links to unrelated Hira Academy pages.
`
        }
      ]
    };

    const recent =
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
              systemInstruction,
              contents: recent,
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
    }

    // =======================================================
    // GEMINI QUOTA / ERROR
    //
    // IMPORTANT:
    // Do NOT invent an answer.
    // Return source information instead.
    // =======================================================
    if (
      !geminiResponse ||
      !geminiResponse.ok
    ) {
      return res.status(200).json({
        reply:
          `I found the relevant Hira Academy material, but the AI explanation service is temporarily unavailable.\n\n**Source: Hira Academy**  \n[Open the original Hira Academy page](${best.url})`,
        sourceUrl: best.url,
        sourceTitle: best.title
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
        "I couldn't generate an answer from the current Hira Academy material.";
    }

    // =======================================================
    // SOURCE LINK
    // =======================================================
    reply +=
      `\n\n---\n**Source: Hira Academy**  \n[Open the original Hira Academy page](${best.url})`;

    return res.status(200).json({
      reply,
      sourceUrl: best.url,
      sourceTitle: best.title
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
// NO SOURCE FOUND
// =============================================================
async function noSourceResponse(
  question,
  messages,
  apiKey,
  res
) {
  // Do NOT give Gemini the ability to invent a Hira Academy
  // source. We tell it that the website search found nothing.

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
The Hira Academy website search did not find a reliable
Hira Academy page containing the requested information.

Question:
${question}

Do NOT invent a Hira Academy source.

Do NOT give a random Hira Academy URL.

Answer exactly:

"I couldn't find this information in the current Hira
Academy material."

You may add one short sentence asking the student to provide
the chapter or exercise if appropriate.
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
              temperature: 0,
              maxOutputTokens: 200
            }
          })
        }
      );

    if (response.ok) {
      const data =
        await response.json();

      const reply =
        data?.candidates?.[0]
          ?.content?.parts
          ?.map(
            p => p.text || ""
          )
          .join("")
          .trim();

      if (reply) {
        return res.status(200).json({
          reply
        });
      }
    }
  } catch (error) {
    console.error(
      "No-source Gemini error:",
      error
    );
  }

  return res.status(200).json({
    reply:
      "I couldn't find this information in the current Hira Academy material."
  });
}
