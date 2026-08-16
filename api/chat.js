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
    // API KEY
    // ============================================================
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing on Vercel."
      });
    }

    // ============================================================
    // BODY
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

    // ============================================================
    // GET COMPLETE CONVERSATION TEXT
    // ============================================================
    const conversationText = messages
      .map(m => m?.content || "")
      .join(" ");

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
    // NORMALIZE
    // ============================================================
    function normalize(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, " and ")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/<[^>]+>/g, " ")
        .replace(/[^a-z0-9.\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const normalizedQuestion =
      normalize(question);

    const normalizedConversation =
      normalize(conversationText);

    // ============================================================
    // CLASS DETECTION
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
    // SUBJECT DETECTION
    // ============================================================
    function detectSubject(text) {
      const q = normalize(text);

      // MATHEMATICS
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
        /\bcomplex number\b/.test(q) ||
        /\bcomplex numbers\b/.test(q) ||
        /\bgeometry\b/.test(q) ||
        /\bcircle\b/.test(q) ||
        /\btangent\b/.test(q)
      ) {
        return "mathematics";
      }

      // PHYSICS
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
        /\blight\b/.test(q)
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

      const match =
        q.match(
          /\bexercise\s+(\d{1,2})\.(\d{1,2})\b/
        );

      if (match) {
        return {
          unit: Number(match[1]),
          exercise: Number(match[2])
        };
      }

      // Also support "6.2 class 10"
      const simple =
        q.match(
          /\b(\d{1,2})\.(\d{1,2})\b/
        );

      if (
        simple &&
        (
          q.includes("solve") ||
          q.includes("exercise") ||
          q.includes("question") ||
          q.includes("class")
        )
      ) {
        return {
          unit: Number(simple[1]),
          exercise: Number(simple[2])
        };
      }

      return null;
    }

    // ============================================================
    // PHYSICS CHAPTER TOPICS
    // ============================================================
    const PHYSICS10 = {
      10: [
        "thermal physics",
        "heat",
        "temperature",
        "thermal expansion",
        "specific heat",
        "latent heat"
      ],

      11: [
        "transfer of thermal energy",
        "conduction",
        "convection"
      ],

      12: [
        "waves",
        "wavelength",
        "frequency",
        "amplitude"
      ],

      13: [
        "sound",
        "echo",
        "pitch",
        "ultrasound",
        "sonar"
      ],

      14: [
        "light",
        "reflection",
        "refraction",
        "lens",
        "mirror",
        "critical angle"
      ],

      15: [
        "electrostatics",
        "electric charge",
        "electric field",
        "electric potential",
        "capacitor"
      ],

      16: [
        "electricity",
        "electric current",
        "voltage",
        "potential difference",
        "resistance",
        "ohm law",
        "electrical power"
      ],

      17: [
        "electromagnetism",
        "right hand grip rule",
        "right hand grip",
        "magnetic field",
        "magnetic field lines",
        "current carrying conductor",
        "solenoid",
        "fleming left hand rule",
        "left hand rule",
        "dc motor",
        "electric motor",
        "split ring",
        "commutator",
        "relay",
        "earth magnetic field"
      ],

      18: [
        "electromagnetic induction",
        "faraday law",
        "induced emf",
        "lenz law",
        "ac generator",
        "transformer",
        "electron beam",
        "cro"
      ],

      19: [
        "semiconductor",
        "pn junction",
        "diode",
        "led",
        "depletion region",
        "forward bias",
        "reverse bias",
        "analog electronics",
        "digital electronics",
        "and gate",
        "or gate",
        "not gate",
        "nand gate",
        "nor gate"
      ],

      20: [
        "atomic physics",
        "nuclear physics",
        "atom",
        "nucleus",
        "radioactivity",
        "radioactive decay",
        "nuclear fusion",
        "nuclear fission"
      ],

      21: [
        "space",
        "environment",
        "solar system",
        "planet",
        "sun",
        "venus",
        "mars",
        "cyclone",
        "background radiation"
      ]
    };

    // ============================================================
    // CHAPTER DETECTION
    // ============================================================
    function detectChapter(text, subject) {
      const q = normalize(text);

      const explicit =
        q.match(
          /\bchapter\s+(\d{1,2})\b/
        );

      if (explicit) {
        return Number(explicit[1]);
      }

      const unit =
        q.match(
          /\bunit\s+(\d{1,2})\b/
        );

      if (
        unit &&
        subject === "physics"
      ) {
        return Number(unit[1]);
      }

      if (
        subject === "physics"
      ) {
        let best = null;
        let bestScore = 0;

        for (
          const [chapter, topics]
          of Object.entries(PHYSICS10)
        ) {
          let score = 0;

          for (
            const topic
            of topics
          ) {
            if (
              q.includes(
                normalize(topic)
              )
            ) {
              score +=
                normalize(topic)
                  .split(" ")
                  .length;
            }
          }

          if (
            score > bestScore
          ) {
            bestScore = score;
            best = Number(chapter);
          }
        }

        return best;
      }

      return null;
    }

    // ============================================================
    // IMPORTANT: USE CONVERSATION HISTORY
    // ============================================================
    //
    // This fixes:
    //
    // User: "exercise 6.2 class 10"
    // User: "why?"
    //
    // "why?" inherits Class 10 + Mathematics + Exercise 6.2.
    //
    // ============================================================

    let grade =
      detectClass(
        normalizedQuestion
      );

    if (!grade) {
      grade =
        detectClass(
          normalizedConversation
        );
    }

    let subject =
      detectSubject(
        normalizedQuestion
      );

    if (!subject) {
      subject =
        detectSubject(
          normalizedConversation
        );
    }

    let exercise =
      detectExercise(
        normalizedQuestion
      );

    if (!exercise) {
      exercise =
        detectExercise(
          normalizedConversation
        );
    }

    let chapter =
      detectChapter(
        normalizedQuestion,
        subject
      );

    if (!chapter) {
      chapter =
        detectChapter(
          normalizedConversation,
          subject
        );
    }

    // ============================================================
    // EXERCISE => MATHEMATICS
    // ============================================================
    //
    // For Class 10:
    //
    // "exercise 6.2 class 10"
    //
    // is a Mathematics query when no physics topic
    // is present.
    //
    // ============================================================

    if (
      exercise &&
      !subject
    ) {
      subject =
        "mathematics";
    }

    if (
      exercise &&
      !grade
    ) {
      grade = 10;
    }

    // ============================================================
    // EXPLICIT PHYSICS OVERRIDES
    // ============================================================
    const physics17 = [
      "right hand grip rule",
      "right hand grip",
      "fleming left hand rule",
      "left hand rule",
      "solenoid",
      "dc motor",
      "electric motor",
      "split ring",
      "commutator",
      "relay"
    ];

    if (
      physics17.some(
        x =>
          normalizedConversation.includes(
            normalize(x)
          )
      )
    ) {
      grade = 10;
      subject = "physics";
      chapter = 17;
    }

    // ============================================================
    // HUB URLS
    // ============================================================
    const hubs = {
      physics9:
        `${SITE}/Physics-9th.html`,

      physics10:
        `${SITE}/Physics-10th-New-2026.html`,

      mathematics9:
        `${SITE}/Mathematics-9th.html`,

      mathematics10:
        `${SITE}/Mathematics-10th-New-2026.html`
    };

    let hubUrl = null;

    if (
      subject === "physics" &&
      grade === 10
    ) {
      hubUrl =
        hubs.physics10;
    }

    if (
      subject === "physics" &&
      grade === 9
    ) {
      hubUrl =
        hubs.physics9;
    }

    if (
      subject === "mathematics" &&
      grade === 10
    ) {
      hubUrl =
        hubs.mathematics10;
    }

    if (
      subject === "mathematics" &&
      grade === 9
    ) {
      hubUrl =
        hubs.mathematics9;
    }

    // ============================================================
    // FETCH PAGE
    // ============================================================
    async function fetchPage(
      url,
      timeout = 10000
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
          await fetch(
            url,
            {
              signal:
                controller.signal,
              headers: {
                "User-Agent":
                  "Hira-Academy-Assistant/1.0",
                Accept:
                  "text/html,application/xhtml+xml"
              }
            }
          );

        if (!response.ok) {
          console.error(
            "HTTP",
            response.status,
            url
          );
          return null;
        }

        return await response.text();

      } catch (error) {
        console.error(
          "Fetch failed:",
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
    // EXTRACT LINKS
    // ============================================================
    function extractLinks(html) {
      const links = [];

      const regex =
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

      let match;

      while (
        (match =
          regex.exec(html)) !== null
      ) {
        try {
          const url =
            new URL(
              match[1],
              SITE
            ).href;

          if (
            !url.startsWith(SITE)
          ) {
            continue;
          }

          links.push({
            url,
            text:
              htmlToText(
                match[2]
              )
          });

        } catch {
          // Ignore invalid links
        }
      }

      return [
        ...new Map(
          links.map(
            x => [
              x.url,
              x
            ]
          )
        ).values()
      ];
    }

    // ============================================================
    // FETCH HUB
    // ============================================================
    let hubHtml = null;

    if (hubUrl) {
      hubHtml =
        await fetchPage(
          hubUrl
        );
    }

    // ============================================================
    // FIND EXACT EXERCISE LINK
    // ============================================================
    let targetLinks = [];

    if (
      hubHtml &&
      exercise
    ) {
      const allLinks =
        extractLinks(
          hubHtml
        );

      const exerciseText =
        `exercise ${exercise.unit}.${exercise.exercise}`;

      targetLinks =
        allLinks.filter(
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
                exerciseText
              ) ||
              (
                url.includes(
                  `exercise${exercise.unit}`
                ) &&
                url.includes(
                  `${exercise.unit}.${exercise.exercise}`
                )
              ) ||
              (
                url.includes(
                  `unit${exercise.unit}`
                ) &&
                url.includes(
                  `exercise${exercise.exercise}`
                )
              )
            );
          }
        );

      // A simpler and more reliable check:
      if (
        targetLinks.length === 0
      ) {
        targetLinks =
          allLinks.filter(
            link => {
              const text =
                normalize(
                  link.text
                );

              return (
                text.includes(
                  `exercise ${exercise.unit}.${exercise.exercise}`
                ) ||
                text.includes(
                  `exercise ${exercise.unit} ${exercise.exercise}`
                )
              );
            }
          );
      }
    }

    // ============================================================
    // FIND CHAPTER RESOURCE LINKS
    // ============================================================
    if (
      hubHtml &&
      chapter &&
      !exercise
    ) {
      const allLinks =
        extractLinks(
          hubHtml
        );

      const chapterText =
        `chapter ${chapter}`;

      targetLinks =
        allLinks.filter(
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
                chapterText
              ) ||
              url.includes(
                `chapter${chapter}`
              ) ||
              url.includes(
                `chapter-${chapter}`
              ) ||
              url.includes(
                `unit${chapter}`
              )
            );
          }
        );
    }

    // ============================================================
    // SOURCE URLS
    // ============================================================
    const sourceUrls = [];

    // Exact exercise pages first
    for (
      const link of targetLinks
    ) {
      if (
        !sourceUrls.includes(
          link.url
        )
      ) {
        sourceUrls.push(
          link.url
        );
      }
    }

    // Hub second
    if (
      hubUrl &&
      !sourceUrls.includes(
        hubUrl
      )
    ) {
      sourceUrls.push(
        hubUrl
      );
    }

    // ============================================================
    // FETCH SOURCE PAGES
    // ============================================================
    const pages = [];

    for (
      const url of sourceUrls.slice(
        0,
        8
      )
    ) {
      const html =
        await fetchPage(
          url
        );

      if (!html) {
        continue;
      }

      const titleMatch =
        html.match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        );

      pages.push({
        url,
        title:
          titleMatch
            ? htmlToText(
                titleMatch[1]
              )
            : "",
        text:
          htmlToText(
            html
          )
      });
    }

    // ============================================================
    // IMPORTANT: NO SOURCE = NO ANSWER
    // ============================================================
    if (
      pages.length === 0
    ) {
      return res.status(200).json({
        reply:
          "I couldn't access the relevant Hira Academy material right now. Please try again in a moment."
      });
    }

    // ============================================================
    // SCORE PAGES
    // ============================================================
    function scorePage(page) {
      const title =
        normalize(
          page.title
        );

      const text =
        normalize(
          page.text
        );

      let score = 0;

      // Exact exercise
      if (
        exercise
      ) {
        const e =
          `exercise ${exercise.unit}.${exercise.exercise}`;

        if (
          title.includes(e)
        ) {
          score += 1000;
        }

        if (
          text.includes(e)
        ) {
          score += 300;
        }

        if (
          page.url
            .toLowerCase()
            .includes(
              `exercise-${exercise.unit}-${exercise.exercise}`
            )
        ) {
          score += 1000;
        }

        if (
          page.url
            .toLowerCase()
            .includes(
              `exercise${exercise.unit}`
            )
        ) {
          score += 300;
        }
      }

      // Subject
      if (
        subject === "mathematics" &&
        (
          title.includes("math") ||
          title.includes("mathematics")
        )
      ) {
        score += 200;
      }

      if (
        subject === "physics" &&
        title.includes("physics")
      ) {
        score += 200;
      }

      // Class
      if (
        grade === 10 &&
        (
          title.includes("10th") ||
          title.includes("class 10") ||
          page.url.includes("10th")
        )
      ) {
        score += 150;
      }

      if (
        grade === 9 &&
        (
          title.includes("9th") ||
          title.includes("class 9") ||
          page.url.includes("9th")
        )
      ) {
        score += 150;
      }

      // Chapter
      if (
        chapter
      ) {
        if (
          title.includes(
            `chapter ${chapter}`
          )
        ) {
          score += 300;
        }

        if (
          page.url
            .toLowerCase()
            .includes(
              `chapter${chapter}`
            )
        ) {
          score += 300;
        }
      }

      // Exact current question
      if (
        normalizedQuestion.length > 7 &&
        text.includes(
          normalizedQuestion
        )
      ) {
        score += 1000;
      }

      return score;
    }

    const rankedPages =
      pages
        .map(
          page => ({
            ...page,
            score:
              scorePage(
                page
              )
          })
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        );

    // ============================================================
    // BUILD SOURCE CONTEXT
    // ============================================================
    let sourceContext = "";

    for (
      const page
      of rankedPages.slice(
        0,
        4
      )
    ) {
      sourceContext += `
==================================================
HIRA ACADEMY SOURCE
==================================================

TITLE:
${page.title}

URL:
${page.url}

CONTENT:
${page.text.substring(
        0,
        12000
      )}

==================================================
`;
    }

    // ============================================================
    // GEMINI CONVERSATION
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
https://hiraacademy.com.pk/

Your answers MUST be based ONLY on the Hira Academy
source material supplied below.

==================================================
DETECTED CONTEXT
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

==================================================
STRICT SOURCE RULE
==================================================

Hira Academy material has absolute priority.

DO NOT answer from your pretrained knowledge.

DO NOT use an old textbook answer.

DO NOT invent an answer.

DO NOT add outside information.

If the answer is present in the Hira Academy material,
answer from that material.

If the answer is NOT present in the supplied Hira
Academy material, respond exactly:

"I couldn't find this information in the current Hira Academy material."

Do not provide a general knowledge answer afterward.

==================================================
CONVERSATION CONTEXT
==================================================

The student may ask follow-up questions such as:

"why?"
"how?"
"explain it"
"solve it"
"what about this?"
"give another example"

Use the previous conversation to understand what
"it", "this", "that", or "why" refers to.

Do NOT require the student to repeat the topic.

==================================================
ANSWER STYLE
==================================================

For a definition:
Give the relevant Hira Academy definition.

For a short question:
Give the corresponding Hira Academy answer.

For an exercise:
Use the exact Hira Academy exercise page supplied.

For a numerical:
Use the Hira Academy solution and preserve formulas,
working and final answer.

For a follow-up:
Answer the follow-up using the same Hira Academy
source/context.

Do not unnecessarily expand the answer.

Do not combine unrelated pages.

Preserve Hira Academy terminology and wording as much
as possible.

==================================================
SOURCE
==================================================

When an answer is found, finish with:

Source: Hira Academy
URL: [actual source URL]

Use the URL of the Hira Academy page from which the
answer was obtained.

==================================================
HIRA ACADEMY MATERIAL
==================================================

${sourceContext}
`
        }
      ]
    };

    // ============================================================
    // GEMINI
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
              maxOutputTokens: 1000
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
    // RESPONSE
    // ============================================================
    const reply =
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

    return res.status(200).json({
      reply
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
