export default async function handler(req, res) {
  // =========================================================
  // CORS
  // =========================================================
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
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing on Vercel."
      });
    }

    // =========================================================
    // BODY
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

    const messages = body?.messages || [];

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "No messages array provided."
      });
    }

    const userMessages = messages.filter(
      m => m?.role === "user" && typeof m?.content === "string"
    );

    const latestMessage =
      userMessages[userMessages.length - 1];

    const question =
      latestMessage?.content?.trim();

    if (!question) {
      return res.status(400).json({
        error: "No user question found."
      });
    }

    const SITE = "https://hiraacademy.com.pk";

    // =========================================================
    // NORMALIZE
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

    const q = normalize(question);

    // =========================================================
    // FOLLOW-UP DETECTION
    //
    // Previous conversation is used ONLY for short follow-ups.
    // A completely new question gets a completely new search.
    // =========================================================
    function isFollowUp(text) {
      const x = normalize(text);

      return (
        /^(why|how|explain|explain it|what does this mean|what about this|tell me more|more|continue|solve it|solve this|answer this|give answer|define it|its meaning|meaning)\s*[?.!]*$/i.test(x)
      );
    }

    const followUp = isFollowUp(question);

    // =========================================================
    // CONTEXT
    // =========================================================
    let contextText = "";

    if (followUp) {
      contextText = messages
        .slice(-6)
        .map(m => m?.content || "")
        .join(" ");
    } else {
      // IMPORTANT:
      // Do NOT use old exercise/topic context for a new question.
      contextText = question;
    }

    const searchText = normalize(contextText);

    // =========================================================
    // DETECT CLASS
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

      // Mathematics
      if (
        /\bmath\b/.test(x) ||
        /\bmaths\b/.test(x) ||
        /\bmathematics\b/.test(x) ||
        /\balgebra\b/.test(x) ||
        /\bquadratic\b/.test(x) ||
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

      // Physics
      if (
        /\bphysics\b/.test(x) ||
        /\belectromagnetism\b/.test(x) ||
        /\belectromagnetic\b/.test(x) ||
        /\bmagnetic\b/.test(x) ||
        /\bmagnetic field\b/.test(x) ||
        /\bcurrent\b/.test(x) ||
        /\bvoltage\b/.test(x) ||
        /\bresistance\b/.test(x) ||
        /\bsolenoid\b/.test(x) ||
        /\bmotor\b/.test(x) ||
        /\bgenerator\b/.test(x) ||
        /\btransformer\b/.test(x) ||
        /\bdiode\b/.test(x) ||
        /\bsemiconductor\b/.test(x) ||
        /\bradiation\b/.test(x) ||
        /\bnuclear\b/.test(x) ||
        /\bcoriolis\b/.test(x) ||
        /\bforce\b/.test(x) ||
        /\bfield\b/.test(x) ||
        /\bfaraday\b/.test(x) ||
        /\blenz\b/.test(x) ||
        /\bfleming\b/.test(x)
      ) {
        return "physics";
      }

      return null;
    }

    // =========================================================
    // EXERCISE
    // =========================================================
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

    // =========================================================
    // CHAPTER
    // =========================================================
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
      detectClass(searchText);

    const subject =
      detectSubject(searchText);

    const exercise =
      detectExercise(searchText);

    const chapter =
      detectChapter(searchText);

    // =========================================================
    // HUBS
    // =========================================================
    const hubs = {
      math9:
        `${SITE}/Mathematics-9th.html`,

      math10:
        `${SITE}/Mathematics-10th-New-2026.html`,

      physics9:
        `${SITE}/Physics-9th.html`,

      physics10:
        `${SITE}/Physics-10th-New-2026.html`
    };

    let hubUrls = [];

    if (subject === "math" && grade === 10) {
      hubUrls = [hubs.math10];
    }

    else if (subject === "math" && grade === 9) {
      hubUrls = [hubs.math9];
    }

    else if (subject === "physics" && grade === 10) {
      hubUrls = [hubs.physics10];
    }

    else if (subject === "physics" && grade === 9) {
      hubUrls = [hubs.physics9];
    }

    else if (subject === "math") {
      hubUrls = [
        hubs.math10,
        hubs.math9
      ];
    }

    else if (subject === "physics") {
      hubUrls = [
        hubs.physics10,
        hubs.physics9
      ];
    }

    else {
      // No subject detected:
      // search ALL major academic hubs.
      hubUrls = [
        hubs.math10,
        hubs.math9,
        hubs.physics10,
        hubs.physics9
      ];
    }

    // =========================================================
    // FETCH PAGE
    // =========================================================
    async function fetchPage(url) {
      const controller =
        new AbortController();

      const timeout =
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
                "Hira-Academy-Assistant/1.0",
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

      } catch (error) {
        console.error(
          "Fetch failed:",
          url,
          error.message
        );

        return null;

      } finally {
        clearTimeout(timeout);
      }
    }

    // =========================================================
    // HTML TEXT
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
    // TITLE
    // =========================================================
    function getTitle(html) {
      const match =
        html.match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        );

      return match
        ? htmlToText(match[1])
        : "";
    }

    // =========================================================
    // LINKS
    // =========================================================
    function extractLinks(html) {
      const links = [];

      const regex =
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

      let match;

      while (
        (match = regex.exec(html))
      ) {
        try {
          const url =
            new URL(
              match[1],
              SITE
            );

          if (
            url.origin !==
            new URL(SITE).origin
          ) {
            continue;
          }

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
            text: htmlToText(match[2])
          });

        } catch {
          // ignore
        }
      }

      return [
        ...new Map(
          links.map(
            x => [x.url, x]
          )
        ).values()
      ];
    }

    // =========================================================
    // FETCH HUBS
    // =========================================================
    const hubPages =
      (
        await Promise.all(
          hubUrls.map(fetchPage)
        )
      ).filter(Boolean);

    // =========================================================
    // COLLECT LINKS
    // =========================================================
    let links = [];

    for (
      const page of hubPages
    ) {
      links.push(
        ...extractLinks(
          page.html
        )
      );
    }

    links = [
      ...new Map(
        links.map(
          x => [x.url, x]
        )
      ).values()
    ];

    // =========================================================
    // SCORE LINKS
    // =========================================================
    function scoreLink(link) {
      const text =
        normalize(link.text);

      const url =
        normalize(link.url);

      let score = 0;

      // Exact exercise
      if (exercise) {
        const target =
          `exercise ${exercise.unit}.${exercise.exercise}`;

        if (
          text.includes(target)
        ) {
          score += 1000;
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
          score += 900;
        }
      }

      // Chapter
      if (chapter) {
        if (
          text.includes(
            `chapter ${chapter}`
          )
        ) {
          score += 300;
        }

        if (
          url.includes(
            `chapter${chapter}`
          ) ||
          url.includes(
            `chapter-${chapter}`
          )
        ) {
          score += 300;
        }
      }

      // Question words
      const words =
        q.split(/\s+/)
          .filter(
            word =>
              word.length >= 4
          );

      for (
        const word of words
      ) {
        if (
          text.includes(word)
        ) {
          score += 25;
        }

        if (
          url.includes(word)
        ) {
          score += 15;
        }
      }

      // Resource relevance
      if (
        /short|question|exercise|crq|long|numerical|mcq|definition|formula|chapter|solution|notes/.test(
          text
        )
      ) {
        score += 40;
      }

      return score;
    }

    links = links
      .map(link => ({
        ...link,
        score: scoreLink(link)
      }))
      .sort(
        (a, b) =>
          b.score - a.score
      );

    // =========================================================
    // FETCH TOP RESOURCE PAGES
    // =========================================================
    const topLinks =
      links.slice(0, 25);

    const resourcePages =
      (
        await Promise.all(
          topLinks.map(
            link =>
              fetchPage(
                link.url
              )
          )
        )
      ).filter(Boolean);

    // =========================================================
    // COMBINE HUB + RESOURCE PAGES
    // =========================================================
    const pages = [
      ...hubPages,
      ...resourcePages
    ];

    const uniquePages = [
      ...new Map(
        pages.map(
          page => [
            page.url,
            page
          ]
        )
      ).values()
    ];

    // =========================================================
    // SCORE ACTUAL PAGES
    // =========================================================
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

      // Exact exercise
      if (exercise) {
        const target =
          `exercise ${exercise.unit}.${exercise.exercise}`;

        if (
          title.includes(target)
        ) {
          score += 1500;
        }

        if (
          text.includes(target)
        ) {
          score += 500;
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
          score += 1500;
        }
      }

      // Exact topic/question words
      const words =
        q.split(/\s+/)
          .filter(
            word =>
              word.length >= 4
          );

      for (
        const word of words
      ) {
        if (
          title.includes(word)
        ) {
          score += 40;
        }

        if (
          text.includes(word)
        ) {
          score += 10;
        }
      }

      // Subject
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

      // Grade
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

      // Chapter
      if (chapter) {
        if (
          title.includes(
            `chapter ${chapter}`
          )
        ) {
          score += 400;
        }
      }

      return {
        ...page,
        score,
        title,
        text
      };
    }

    const rankedPages =
      uniquePages
        .map(scorePage)
        .sort(
          (a, b) =>
            b.score - a.score
        );

    const bestPage =
      rankedPages[0];

    // =========================================================
    // NO MATCH
    // =========================================================
    if (
      !bestPage ||
      bestPage.score < 15
    ) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material."
      });
    }

    // =========================================================
    // SOURCE CONTEXT
    // =========================================================
    const sourcePages =
      rankedPages
        .filter(
          page =>
            page.score >=
            Math.max(
              15,
              bestPage.score - 100
            )
        )
        .slice(0, 4);

    let sourceContext = "";

    for (
      const page of sourcePages
    ) {
      sourceContext += `
==============================
HIRA ACADEMY SOURCE
==============================

TITLE:
${page.title}

URL:
${page.url}

CONTENT:
${page.text.substring(
        0,
        16000
      )}

==============================
`;
    }

    // =========================================================
    // GEMINI CONTENTS
    // =========================================================
    const contents =
      messages
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
    // SYSTEM INSTRUCTION
    // =========================================================
    const systemInstruction = {
      parts: [
        {
          text: `
You are the official Hira Academy Assistant.

Website:
${SITE}

IMPORTANT:

Answer ONLY from the Hira Academy source material
provided below.

Do NOT use old pretrained knowledge to replace
Hira Academy material.

Do NOT invent answers.

Do NOT make up textbook content.

If the answer is not present in the supplied
Hira Academy source, say:

"I couldn't find this information in the current Hira Academy material."

==================================================
NEW QUESTION RULE
==================================================

A new independent question MUST be treated as a new
search topic.

Do NOT carry the previous exercise, chapter or subject
into a new independent question.

Example:

User:
exercise 6.2 math 10

Then:

User:
What is the right hand grip rule?

The second question is a NEW question.

It must NOT use Exercise 6.2.

It should use Hira Academy Physics material.

==================================================
FOLLOW-UP RULE
==================================================

Only maintain the previous topic when the user clearly
asks a follow-up such as:

why?
explain it
explain this
what does this mean?
solve it
give more detail
what about this?

==================================================
ANSWER STYLE
==================================================

Use Hira Academy terminology and wording as closely as
possible.

For definitions, give the definition from Hira Academy.

For short questions, answer directly.

For exercises, use the actual Hira Academy exercise page.

For numerical problems, use the Hira Academy method and
answer when available.

Do not add unrelated general knowledge.

Do not cite another website.

==================================================
CURRENT QUESTION
==================================================

${question}

==================================================
SOURCE MATERIAL
==================================================

${sourceContext}
`
        }
      ]
    };

    // =========================================================
    // GEMINI
    // =========================================================
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
            contents,

            generationConfig: {
              maxOutputTokens: 1200
            }
          })
        }
      );

    const data =
      await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error(
        "Gemini API Error:",
        data
      );

      return res.status(
        geminiResponse.status
      ).json({
        error:
          data.error?.message ||
          "Gemini API Error"
      });
    }

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
