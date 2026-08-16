export default async function handler(req, res) {
  // ============================================================
  // CORS
  // ============================================================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,POST"
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
    // READ REQUEST BODY
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
        error: "No user question found."
      });
    }

    const SITE = "https://hiraacademy.com.pk";

    // ============================================================
    // NORMALIZE TEXT
    // ============================================================
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

    const normalizedQuestion =
      normalize(question);

    // ============================================================
    // COMPLETE CONVERSATION
    // ============================================================
    const conversationText = messages
      .map(m => m?.content || "")
      .join(" ");

    const normalizedConversation =
      normalize(conversationText);

    // ============================================================
    // DETECT CLASS
    // ============================================================
    function detectClass(text) {
      const q = normalize(text);

      if (
        /\bclass\s*10\b/.test(q) ||
        /\b10th\b/.test(q) ||
        /\bgrade\s*10\b/.test(q)
      ) {
        return 10;
      }

      if (
        /\bclass\s*9\b/.test(q) ||
        /\b9th\b/.test(q) ||
        /\bgrade\s*9\b/.test(q)
      ) {
        return 9;
      }

      return null;
    }

    // ============================================================
    // DETECT SUBJECT
    // ============================================================
    function detectSubject(text) {
      const q = normalize(text);

      if (
        /\bmath\b/.test(q) ||
        /\bmaths\b/.test(q) ||
        /\bmathematics\b/.test(q) ||
        /\balgebra\b/.test(q) ||
        /\bquadratic\b/.test(q) ||
        /\bmatrix\b/.test(q) ||
        /\bmatrices\b/.test(q) ||
        /\bdeterminant\b/.test(q) ||
        /\bvector\b/.test(q) ||
        /\bvectors\b/.test(q) ||
        /\btrigonometry\b/.test(q) ||
        /\bprobability\b/.test(q) ||
        /\bgeometry\b/.test(q) ||
        /\bcircle\b/.test(q) ||
        /\btangent\b/.test(q)
      ) {
        return "mathematics";
      }

      if (
        /\bphysics\b/.test(q) ||
        /\belectromagnetism\b/.test(q) ||
        /\bmagnetic\b/.test(q) ||
        /\bmagnetic field\b/.test(q) ||
        /\bcurrent\b/.test(q) ||
        /\bvoltage\b/.test(q) ||
        /\bresistance\b/.test(q) ||
        /\bsolenoid\b/.test(q) ||
        /\bmotor\b/.test(q) ||
        /\bgenerator\b/.test(q) ||
        /\btransformer\b/.test(q) ||
        /\bdiode\b/.test(q) ||
        /\bsemiconductor\b/.test(q) ||
        /\bradiation\b/.test(q) ||
        /\bnuclear\b/.test(q) ||
        /\bwave\b/.test(q) ||
        /\bsound\b/.test(q) ||
        /\blight\b/.test(q) ||
        /\bheat\b/.test(q) ||
        /\btemperature\b/.test(q)
      ) {
        return "physics";
      }

      return null;
    }

    // ============================================================
    // DETECT EXERCISE
    // ============================================================
    function detectExercise(text) {
      const q = normalize(text);

      let match = q.match(
        /\bexercise\s+(\d{1,2})\.(\d{1,2})\b/
      );

      if (match) {
        return {
          unit: Number(match[1]),
          exercise: Number(match[2])
        };
      }

      match = q.match(
        /\b(?:ex|exercise)\s*(\d{1,2})\.(\d{1,2})\b/
      );

      if (match) {
        return {
          unit: Number(match[1]),
          exercise: Number(match[2])
        };
      }

      return null;
    }

    // ============================================================
    // DETECT CHAPTER
    // ============================================================
    function detectChapter(text) {
      const q = normalize(text);

      const match = q.match(
        /\bchapter\s+(\d{1,2})\b/
      );

      if (match) {
        return Number(match[1]);
      }

      return null;
    }

    // ============================================================
    // DETECT CONTEXT
    // ============================================================
    let grade =
      detectClass(normalizedQuestion);

    if (!grade) {
      grade =
        detectClass(normalizedConversation);
    }

    let subject =
      detectSubject(normalizedQuestion);

    if (!subject) {
      subject =
        detectSubject(normalizedConversation);
    }

    let exercise =
      detectExercise(normalizedQuestion);

    if (!exercise) {
      exercise =
        detectExercise(normalizedConversation);
    }

    let chapter =
      detectChapter(normalizedQuestion);

    if (!chapter) {
      chapter =
        detectChapter(normalizedConversation);
    }

    // ============================================================
    // EXERCISE WITHOUT SUBJECT
    //
    // Example:
    // "exercise 6.2 class 10"
    //
    // If it does not explicitly say Math/Physics,
    // use Mathematics for Class 9/10 exercises.
    // ============================================================
    if (exercise && !subject) {
      subject = "mathematics";
    }

    if (exercise && !grade) {
      grade = 10;
    }

    // ============================================================
    // HUB URLS
    // ============================================================
    const HUBS = {
      mathematics9:
        `${SITE}/Mathematics-9th.html`,

      mathematics10:
        `${SITE}/Mathematics-10th-New-2026.html`,

      physics9:
        `${SITE}/Physics-9th.html`,

      physics10:
        `${SITE}/Physics-10th-New-2026.html`
    };

    // ============================================================
    // SELECT HUBS
    // ============================================================
    let selectedHubs = [];

    if (subject === "mathematics" && grade === 10) {
      selectedHubs = [HUBS.mathematics10];
    }

    else if (subject === "mathematics" && grade === 9) {
      selectedHubs = [HUBS.mathematics9];
    }

    else if (subject === "physics" && grade === 10) {
      selectedHubs = [HUBS.physics10];
    }

    else if (subject === "physics" && grade === 9) {
      selectedHubs = [HUBS.physics9];
    }

    else if (subject === "mathematics") {
      selectedHubs = [
        HUBS.mathematics10,
        HUBS.mathematics9
      ];
    }

    else if (subject === "physics") {
      selectedHubs = [
        HUBS.physics10,
        HUBS.physics9
      ];
    }

    else {
      // Unknown subject:
      // Search all four main academic hubs.
      selectedHubs = [
        HUBS.mathematics10,
        HUBS.mathematics9,
        HUBS.physics10,
        HUBS.physics9
      ];
    }

    // ============================================================
    // FETCH WITH TIMEOUT
    // ============================================================
    async function fetchPage(url, timeout = 6000) {
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
                "text/html,application/xhtml+xml"
            }
          });

        if (!response.ok) {
          return null;
        }

        const html =
          await response.text();

        return {
          url,
          html
        };

      } catch (error) {
        console.error(
          "Fetch error:",
          url,
          error.message
        );

        return null;

      } finally {
        clearTimeout(timer);
      }
    }

    // ============================================================
    // HTML TO TEXT
    // ============================================================
    function htmlToText(html) {
      if (!html) return "";

      return html
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
          /&lt;/gi,
          "<"
        )
        .replace(
          /&gt;/gi,
          ">"
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

    // ============================================================
    // PAGE TITLE
    // ============================================================
    function getTitle(html) {
      const match =
        html.match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        );

      return match
        ? htmlToText(match[1])
        : "";
    }

    // ============================================================
    // EXTRACT INTERNAL LINKS
    // ============================================================
    function extractLinks(html) {
      const links = [];

      const regex =
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

      let match;

      while (
        (match = regex.exec(html)) !== null
      ) {
        try {
          const href =
            match[1].trim();

          if (
            !href ||
            href.startsWith("#") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:")
          ) {
            continue;
          }

          const url =
            new URL(
              href,
              SITE
            );

          if (
            url.origin !==
            new URL(SITE).origin
          ) {
            continue;
          }

          // Skip obvious non-HTML files.
          const pathname =
            url.pathname.toLowerCase();

          if (
            /\.(pdf|jpg|jpeg|png|gif|webp|svg|zip)$/i.test(
              pathname
            )
          ) {
            continue;
          }

          links.push({
            url: url.href.split("#")[0],
            text: htmlToText(
              match[2]
            )
          });

        } catch {
          // Ignore invalid URLs.
        }
      }

      return [
        ...new Map(
          links.map(
            item => [
              item.url,
              item
            ]
          )
        ).values()
      ];
    }

    // ============================================================
    // FETCH ALL HUBS
    // ============================================================
    const hubResults =
      await Promise.all(
        selectedHubs.map(
          url =>
            fetchPage(
              url
            )
        )
      );

    const validHubs =
      hubResults.filter(
        Boolean
      );

    // ============================================================
    // DISCOVER LINKS FROM HUBS
    // ============================================================
    let discoveredLinks = [];

    for (
      const hub of validHubs
    ) {
      discoveredLinks.push(
        ...extractLinks(
          hub.html
        )
      );
    }

    discoveredLinks = [
      ...new Map(
        discoveredLinks.map(
          item => [
            item.url,
            item
          ]
        )
      ).values()
    ];

    // ============================================================
    // EXACT EXERCISE SEARCH
    //
    // This is the important part for:
    //
    // exercise 6.2 math 10
    //
    // It finds the actual link on your Math hub.
    // ============================================================
    let exactExerciseLinks = [];

    if (exercise) {
      const target =
        `exercise ${exercise.unit}.${exercise.exercise}`;

      exactExerciseLinks =
        discoveredLinks.filter(
          link => {
            const text =
              normalize(
                link.text
              );

            const url =
              normalize(
                link.url
              );

            return (
              text.includes(
                target
              ) ||
              text.includes(
                `exercise ${exercise.unit} ${exercise.exercise}`
              ) ||
              (
                url.includes(
                  `exercise`
                ) &&
                url.includes(
                  `${exercise.unit}`
                ) &&
                url.includes(
                  `${exercise.exercise}`
                )
              )
            );
          }
        );
    }

    // ============================================================
    // PRIORITY URLS
    // ============================================================
    let priorityUrls = [];

    // Exact exercise pages first.
    for (
      const link
      of exactExerciseLinks
    ) {
      priorityUrls.push(
        link.url
      );
    }

    // Then chapter/resource links.
    for (
      const link
      of discoveredLinks
    ) {
      if (
        priorityUrls.length >= 20
      ) {
        break;
      }

      const text =
        normalize(
          link.text
        );

      const url =
        normalize(
          link.url
        );

      let useful = false;

      if (chapter) {
        if (
          text.includes(
            `chapter ${chapter}`
          ) ||
          url.includes(
            `chapter${chapter}`
          ) ||
          url.includes(
            `chapter-${chapter}`
          )
        ) {
          useful = true;
        }
      }

      // Useful academic pages.
      if (
        /short|exercise|question|crq|long|numerical|mcq|definition|formula|chapter|solution|notes/.test(
          text
        )
      ) {
        useful = true;
      }

      if (
        useful &&
        !priorityUrls.includes(
          link.url
        )
      ) {
        priorityUrls.push(
          link.url
        );
      }
    }

    // Add general discovered pages.
    for (
      const link
      of discoveredLinks
    ) {
      if (
        priorityUrls.length >= 60
      ) {
        break;
      }

      if (
        !priorityUrls.includes(
          link.url
        )
      ) {
        priorityUrls.push(
          link.url
        );
      }
    }

    // ============================================================
    // FETCH DISCOVERED PAGES
    //
    // We limit concurrency to avoid overloading your website.
    // ============================================================
    async function fetchInBatches(
      urls,
      batchSize = 8
    ) {
      const results = [];

      for (
        let i = 0;
        i < urls.length;
        i += batchSize
      ) {
        const batch =
          urls.slice(
            i,
            i + batchSize
          );

        const batchResults =
          await Promise.all(
            batch.map(
              url =>
                fetchPage(
                  url,
                  5000
                )
            )
          );

        results.push(
          ...batchResults.filter(
            Boolean
          )
        );

        // Stop after enough pages have been collected.
        if (
          results.length >= 50
        ) {
          break;
        }
      }

      return results;
    }

    const discoveredPages =
      await fetchInBatches(
        priorityUrls,
        8
      );

    // ============================================================
    // COMBINE HUBS + DISCOVERED PAGES
    // ============================================================
    const allPages = [
      ...validHubs,
      ...discoveredPages
    ];

    const uniquePages = [
      ...new Map(
        allPages.map(
          page => [
            page.url,
            page
          ]
        )
      ).values()
    ];

    // ============================================================
    // SCORE PAGE
    // ============================================================
    function scorePage(page) {
      const title =
        normalize(
          getTitle(
            page.html
          )
        );

      const text =
        normalize(
          htmlToText(
            page.html
          )
        );

      const url =
        normalize(
          page.url
        );

      let score = 0;

      // ----------------------------------------------------------
      // Exact exercise
      // ----------------------------------------------------------
      if (exercise) {
        const target =
          `exercise ${exercise.unit}.${exercise.exercise}`;

        if (
          title.includes(
            target
          )
        ) {
          score += 1000;
        }

        if (
          text.includes(
            target
          )
        ) {
          score += 400;
        }

        if (
          url.includes(
            `exercise`
          ) &&
          url.includes(
            `${exercise.unit}`
          ) &&
          url.includes(
            `${exercise.exercise}`
          )
        ) {
          score += 1000;
        }
      }

      // ----------------------------------------------------------
      // Exact question words
      // ----------------------------------------------------------
      const questionWords =
        normalizedQuestion
          .split(/\s+/)
          .filter(
            word =>
              word.length >= 4
          )
          .slice(0, 12);

      for (
        const word
        of questionWords
      ) {
        if (
          title.includes(
            word
          )
        ) {
          score += 20;
        }

        if (
          text.includes(
            word
          )
        ) {
          score += 5;
        }
      }

      // ----------------------------------------------------------
      // Subject
      // ----------------------------------------------------------
      if (
        subject === "mathematics"
      ) {
        if (
          title.includes("math") ||
          title.includes("mathematics") ||
          url.includes("math")
        ) {
          score += 150;
        }
      }

      if (
        subject === "physics"
      ) {
        if (
          title.includes("physics") ||
          url.includes("physics")
        ) {
          score += 150;
        }
      }

      // ----------------------------------------------------------
      // Class
      // ----------------------------------------------------------
      if (grade === 10) {
        if (
          title.includes("10th") ||
          title.includes("class 10") ||
          url.includes("10th")
        ) {
          score += 100;
        }
      }

      if (grade === 9) {
        if (
          title.includes("9th") ||
          title.includes("class 9") ||
          url.includes("9th")
        ) {
          score += 100;
        }
      }

      // ----------------------------------------------------------
      // Chapter
      // ----------------------------------------------------------
      if (chapter) {
        if (
          title.includes(
            `chapter ${chapter}`
          )
        ) {
          score += 250;
        }

        if (
          url.includes(
            `chapter${chapter}`
          ) ||
          url.includes(
            `chapter-${chapter}`
          )
        ) {
          score += 250;
        }
      }

      return {
        score,
        title,
        text
      };
    }

    // ============================================================
    // RANK PAGES
    // ============================================================
    const rankedPages =
      uniquePages
        .map(page => {
          const result =
            scorePage(
              page
            );

          return {
            ...page,
            ...result
          };
        })
        .sort(
          (a, b) =>
            b.score -
            a.score
        );

    // ============================================================
    // REQUIRE A REAL MATCH
    // ============================================================
    const bestPage =
      rankedPages[0];

    if (
      !bestPage ||
      bestPage.score < 10
    ) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material."
      });
    }

    // ============================================================
    // BUILD RELEVANT SOURCE CONTENT
    //
    // Use the best pages, not random site content.
    // ============================================================
    const sourcePages =
      rankedPages
        .filter(
          page =>
            page.score >=
            Math.max(
              10,
              bestPage.score - 80
            )
        )
        .slice(0, 5);

    let sourceContext = "";

    for (
      const page
      of sourcePages
    ) {
      sourceContext += `
==================================================
SOURCE PAGE
==================================================

TITLE:
${page.title}

URL:
${page.url}

CONTENT:
${page.text.substring(
        0,
        18000
      )}

==================================================
`;
    }

    // ============================================================
    // GEMINI CONTENTS
    // ============================================================
    const contents =
      messages
        .map(
          m => ({
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
          })
        )
        .filter(
          m =>
            m.parts[0].text
              .trim()
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

Website:
${SITE}

Your job is to answer students using the CURRENT Hira
Academy website material supplied below.

==================================================
IMPORTANT RULE
==================================================

The Hira Academy source material is the authority.

DO NOT answer from old knowledge.

DO NOT use your pretrained knowledge to replace missing
Hira Academy content.

DO NOT invent information.

DO NOT make up textbook answers.

If the requested information is not contained in the
supplied Hira Academy material, say:

"I couldn't find this information in the current Hira Academy material."

Do not then provide a general knowledge answer.

==================================================
CONVERSATION CONTEXT
==================================================

Use the previous conversation.

For example:

Student:
"exercise 6.2 class 10"

Student:
"why?"

The second question refers to Exercise 6.2.

Likewise:

Student:
"What is the right hand grip rule?"

Student:
"explain it"

The second question refers to the Right-Hand Grip Rule.

Never lose the context unnecessarily.

==================================================
ANSWER STYLE
==================================================

Use the wording and terminology of Hira Academy as
closely as possible.

For a definition:
Give the relevant Hira Academy definition.

For a short question:
Give the Hira Academy answer directly.

For an exercise:
Use the actual Hira Academy exercise/solution page.

For a numerical:
Use the Hira Academy method, formulas, working and answer
when present.

For a follow-up:
Continue from the previous question using the same source.

Do not add unrelated information.

Do not cite another website.

Do not mention that you are using a web crawler.

==================================================
CURRENT CONTEXT
==================================================

Class:
${grade || "Not specified"}

Subject:
${subject || "Not specified"}

Chapter:
${chapter || "Not specified"}

Exercise:
${
  exercise
    ? `${exercise.unit}.${exercise.exercise}`
    : "Not specified"
}

Student's latest question:
${question}

==================================================
SOURCE MATERIAL
==================================================

${sourceContext}

==================================================
FINAL SOURCE RULE
==================================================

The answer must be supported by the source material above.

Do not create a source URL yourself.

The backend will add the actual source link.
`
        }
      ]
    };

    // ============================================================
    // GEMINI API
    // ============================================================
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
              temperature: 0,
              maxOutputTokens: 1200
            }
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "Gemini API Error:",
        data
      );

      return res.status(
        response.status
      ).json({
        error:
          data.error?.message ||
          "Gemini API Error"
      });
    }

    // ============================================================
    // GET GEMINI ANSWER
    // ============================================================
    let reply =
      data
        ?.candidates?.[0]
        ?.content
        ?.parts
        ?.map(
          p => p.text || ""
        )
        .join("")
        .trim();

    if (!reply) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material."
      });
    }

    // ============================================================
    // ADD REAL SOURCE LINK
    //
    // This is NOT generated by Gemini.
    // It comes directly from the page we actually fetched.
    // ============================================================
    reply +=
      `\n\n---\n**Source: Hira Academy**  \n[Open the original Hira Academy page](${bestPage.url})`;

    // ============================================================
    // RETURN
    // ============================================================
    return res.status(200).json({
      reply,
      sourceUrl: bestPage.url,
      sourceTitle: bestPage.title
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
