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
    // REQUEST BODY
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

    // ============================================================
    // HIRA ACADEMY URLS
    // ============================================================
    const SITE = "https://hiraacademy.com.pk";

    const HUBS = {
      physics10:
        `${SITE}/Physics-10th-New-2026.html`,

      physics9:
        `${SITE}/Physics-9th.html`,

      mathematics10:
        `${SITE}/Mathematics-10th-New-2026.html`,

      mathematics9:
        `${SITE}/Mathematics-9th.html`
    };

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
        .replace(/<[^>]+>/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const normalizedQuestion =
      normalize(question);

    // ============================================================
    // CLASS DETECTION
    // ============================================================
    function detectClass(text) {
      const q = normalize(text);

      if (
        /\bclass 10\b/.test(q) ||
        /\b10th\b/.test(q) ||
        /\bgrade 10\b/.test(q)
      ) {
        return 10;
      }

      if (
        /\bclass 9\b/.test(q) ||
        /\b9th\b/.test(q) ||
        /\bgrade 9\b/.test(q)
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

      if (
        q.includes("physics") ||
        q.includes("electromagnet") ||
        q.includes("magnetic") ||
        q.includes("current") ||
        q.includes("voltage") ||
        q.includes("resistance") ||
        q.includes("motor") ||
        q.includes("generator") ||
        q.includes("transformer") ||
        q.includes("diode") ||
        q.includes("semiconductor") ||
        q.includes("radiation") ||
        q.includes("nuclear")
      ) {
        return "physics";
      }

      if (
        q.includes("math") ||
        q.includes("mathematics") ||
        q.includes("algebra") ||
        q.includes("geometry") ||
        q.includes("trigonometry") ||
        q.includes("matrix") ||
        q.includes("polynomial") ||
        q.includes("equation")
      ) {
        return "mathematics";
      }

      return null;
    }

    // ============================================================
    // PHYSICS CHAPTER MAP
    // ============================================================
    const PHYSICS10 = {
      10: {
        title: "Thermal Physics",
        topics: [
          "thermal physics",
          "heat",
          "temperature",
          "thermal expansion",
          "specific heat",
          "heat capacity",
          "latent heat"
        ]
      },

      11: {
        title: "Transfer of Thermal Energy",
        topics: [
          "transfer of thermal energy",
          "conduction",
          "convection",
          "radiation",
          "thermal energy transfer"
        ]
      },

      12: {
        title: "Waves",
        topics: [
          "waves",
          "wavelength",
          "frequency",
          "amplitude",
          "wave speed",
          "wave motion"
        ]
      },

      13: {
        title: "Sound",
        topics: [
          "sound",
          "echo",
          "pitch",
          "loudness",
          "ultrasound",
          "sonar"
        ]
      },

      14: {
        title: "Light",
        topics: [
          "light",
          "reflection",
          "refraction",
          "lens",
          "mirror",
          "critical angle",
          "total internal reflection"
        ]
      },

      15: {
        title: "Electrostatics",
        topics: [
          "electrostatics",
          "electric charge",
          "electric field",
          "electric potential",
          "coulomb",
          "capacitor"
        ]
      },

      16: {
        title: "Electricity",
        topics: [
          "electricity",
          "electric current",
          "current",
          "voltage",
          "potential difference",
          "resistance",
          "ohm law",
          "circuit",
          "electrical power",
          "electrical energy"
        ]
      },

      17: {
        title: "Electromagnetism",
        topics: [
          "electromagnetism",
          "right hand grip rule",
          "right hand grip",
          "right hand rule",
          "magnetic field",
          "magnetic field lines",
          "current carrying conductor",
          "current carrying conductors",
          "solenoid",
          "fleming left hand rule",
          "flemings left hand rule",
          "left hand rule",
          "force on a current carrying conductor",
          "parallel current carrying conductors",
          "dc motor",
          "electric motor",
          "motor",
          "split ring",
          "commutator",
          "relay",
          "earth magnetic field",
          "earths magnetic field"
        ]
      },

      18: {
        title: "Electromagnetic Induction & EM Waves",
        topics: [
          "electromagnetic induction",
          "faraday law",
          "faradays law",
          "henry",
          "induced emf",
          "induced emf",
          "lenz law",
          "lenzs law",
          "ac generator",
          "alternating current generator",
          "transformer",
          "mutual induction",
          "electron beam",
          "cro",
          "electromagnetic waves"
        ]
      },

      19: {
        title: "Electronics",
        topics: [
          "electronics",
          "semiconductor",
          "pn junction",
          "pn junction diode",
          "diode",
          "led",
          "light emitting diode",
          "depletion region",
          "forward bias",
          "reverse bias",
          "analog electronics",
          "digital electronics",
          "adc",
          "boolean logic",
          "and gate",
          "or gate",
          "not gate",
          "nand gate",
          "nor gate",
          "burglar alarm"
        ]
      },

      20: {
        title: "Atomic and Nuclear Physics",
        topics: [
          "atomic physics",
          "nuclear physics",
          "atom",
          "nucleus",
          "radioactivity",
          "radioactive decay",
          "nuclear reaction",
          "nuclear fusion",
          "nuclear fission",
          "radiation"
        ]
      },

      21: {
        title: "Space and Environment",
        topics: [
          "space",
          "environment",
          "solar system",
          "planet",
          "sun",
          "venus",
          "mars",
          "cyclone",
          "background radiation",
          "radiation exposure"
        ]
      }
    };

    // ============================================================
    // CHAPTER DETECTION
    // ============================================================
    function detectChapter(text, subject, grade) {
      const q = normalize(text);

      // Explicit chapter number
      const chapterMatch =
        q.match(/\bchapter\s+(\d{1,2})\b/);

      if (chapterMatch) {
        return Number(chapterMatch[1]);
      }

      // Explicit unit number
      const unitMatch =
        q.match(/\bunit\s+(\d{1,2})\b/);

      if (unitMatch) {
        return Number(unitMatch[1]);
      }

      // Topic detection
      if (
        subject === "physics" &&
        (grade === 10 || grade === null)
      ) {
        let bestChapter = null;
        let bestScore = 0;

        for (const [num, data] of Object.entries(
          PHYSICS10
        )) {
          let score = 0;

          for (const topic of data.topics) {
            const t = normalize(topic);

            if (q.includes(t)) {
              score +=
                t.split(" ").length * 25;
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestChapter = Number(num);
          }
        }

        if (bestScore > 0) {
          return bestChapter;
        }
      }

      return null;
    }

    let grade = detectClass(question);
    let subject = detectSubject(question);
    let chapter = detectChapter(
      question,
      subject,
      grade
    );

    // ============================================================
    // IMPORTANT CONCEPT OVERRIDES
    // ============================================================
    // These make Chapter 17 questions unambiguous.
    // ============================================================
    const overrides = [
      {
        phrases: [
          "right hand grip rule",
          "right hand grip",
          "right hand rule"
        ],
        grade: 10,
        subject: "physics",
        chapter: 17
      },

      {
        phrases: [
          "fleming left hand rule",
          "flemings left hand rule",
          "left hand rule"
        ],
        grade: 10,
        subject: "physics",
        chapter: 17
      },

      {
        phrases: [
          "dc motor",
          "electric motor",
          "split ring",
          "commutator"
        ],
        grade: 10,
        subject: "physics",
        chapter: 17
      },

      {
        phrases: [
          "solenoid",
          "relay",
          "earth magnetic field"
        ],
        grade: 10,
        subject: "physics",
        chapter: 17
      },

      {
        phrases: [
          "faraday law",
          "faradays law",
          "lenz law",
          "lenzs law",
          "induced emf",
          "electromagnetic induction"
        ],
        grade: 10,
        subject: "physics",
        chapter: 18
      },

      {
        phrases: [
          "pn junction",
          "pn junction diode",
          "depletion region",
          "forward bias",
          "reverse bias",
          "nand gate",
          "nor gate"
        ],
        grade: 10,
        subject: "physics",
        chapter: 19
      }
    ];

    for (const item of overrides) {
      if (
        item.phrases.some(
          phrase =>
            normalizedQuestion.includes(
              normalize(phrase)
            )
        )
      ) {
        grade = item.grade;
        subject = item.subject;
        chapter = item.chapter;
        break;
      }
    }

    // ============================================================
    // DEFAULT CLASS
    // ============================================================
    // Your chatbot is mainly for Class 9 & 10.
    // If no class is specified, we don't force a class unless
    // the topic itself clearly identifies one.
    // ============================================================

    // ============================================================
    // FETCH WITH TIMEOUT
    // ============================================================
    async function fetchPage(
      url,
      timeout = 8000
    ) {
      const controller =
        new AbortController();

      const timer = setTimeout(
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
              Accept:
                "text/html,application/xhtml+xml"
            }
          });

        if (!response.ok) {
          return null;
        }

        return await response.text();
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
    // HTML → TEXT
    // ============================================================
    function htmlToText(html) {
      if (!html) return "";

      let text = html;

      text = text
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
        );

      text = text
        .replace(
          /<\/(h1|h2|h3|h4|h5|h6|p|li|div|section|article|tr)>/gi,
          "\n"
        )
        .replace(
          /<br\s*\/?>/gi,
          "\n"
        )
        .replace(
          /<[^>]+>/g,
          " "
        );

      return text
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
    }

    // ============================================================
    // PAGE TITLE
    // ============================================================
    function getTitle(html) {
      const match =
        html?.match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        );

      return match
        ? htmlToText(match[1])
        : "";
    }

    // ============================================================
    // ABSOLUTE URL
    // ============================================================
    function absoluteUrl(href) {
      if (!href) return null;

      href = href.trim();

      if (
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:")
      ) {
        return null;
      }

      try {
        return new URL(
          href,
          SITE
        ).href;
      } catch {
        return null;
      }
    }

    // ============================================================
    // EXTRACT LINKS FROM HTML
    // ============================================================
    function extractLinks(html) {
      const links = [];

      const regex =
        /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

      let match;

      while (
        (match = regex.exec(html)) !== null
      ) {
        const url =
          absoluteUrl(match[1]);

        const text =
          htmlToText(match[2]);

        if (
          url &&
          url.startsWith(SITE)
        ) {
          links.push({
            url,
            text
          });
        }
      }

      return links;
    }

    // ============================================================
    // GET SUBJECT HUB
    // ============================================================
    function getHubUrl() {
      if (
        subject === "physics" &&
        grade === 10
      ) {
        return HUBS.physics10;
      }

      if (
        subject === "physics" &&
        grade === 9
      ) {
        return HUBS.physics9;
      }

      if (
        subject === "mathematics" &&
        grade === 10
      ) {
        return HUBS.mathematics10;
      }

      if (
        subject === "mathematics" &&
        grade === 9
      ) {
        return HUBS.mathematics9;
      }

      // If topic clearly indicates physics
      if (subject === "physics") {
        return HUBS.physics10;
      }

      if (subject === "mathematics") {
        return HUBS.mathematics10;
      }

      return null;
    }

    // ============================================================
    // GET CHAPTER LINKS FROM THE ACTUAL HUB
    // ============================================================
    function extractChapterLinks(
      hubHtml,
      chapterNumber
    ) {
      if (!hubHtml || !chapterNumber) {
        return [];
      }

      const lower =
        hubHtml.toLowerCase();

      const chapterRegex =
        new RegExp(
          `chapter\\s*${chapterNumber}\\s*[\\s\\S]*?(?=chapter\\s*${chapterNumber +
            1}\\s*[–:-]|chapter\\s*${chapterNumber +
            1}\\b|$)`,
          "i"
        );

      const match =
        lower.match(chapterRegex);

      let sectionHtml = match
        ? hubHtml.substring(
            match.index,
            match.index +
              match[0].length
          )
        : "";

      // If regex couldn't isolate the section,
      // use the entire hub and filter links.
      if (!sectionHtml) {
        sectionHtml = hubHtml;
      }

      const links =
        extractLinks(sectionHtml);

      // Remove duplicates
      return [
        ...new Map(
          links.map(link => [
            link.url,
            link
          ])
        ).values()
      ];
    }

    // ============================================================
    // FETCH THE HUB
    // ============================================================
    const hubUrl =
      getHubUrl();

    let hubHtml = null;

    if (hubUrl) {
      hubHtml =
        await fetchPage(
          hubUrl
        );
    }

    // ============================================================
    // FIND CHAPTER LINKS
    // ============================================================
    let chapterLinks = [];

    if (
      hubHtml &&
      chapter
    ) {
      chapterLinks =
        extractChapterLinks(
          hubHtml,
          chapter
        );
    }

    // ============================================================
    // FALLBACK:
    // Search hub links using chapter title
    // ============================================================
    if (
      chapterLinks.length === 0 &&
      hubHtml &&
      chapter &&
      subject === "physics" &&
      grade === 10
    ) {
      const chapterInfo =
        PHYSICS10[chapter];

      if (chapterInfo) {
        const allLinks =
          extractLinks(
            hubHtml
          );

        chapterLinks =
          allLinks.filter(link => {
            const text =
              normalize(
                link.text
              );

            return (
              text.includes(
                `chapter ${chapter}`
              ) ||
              text.includes(
                normalize(
                  chapterInfo.title
                )
              )
            );
          });
      }
    }

    // ============================================================
    // INCLUDE HUB ITSELF
    // ============================================================
    const sourceUrls = [];

    if (hubUrl) {
      sourceUrls.push(
        hubUrl
      );
    }

    for (
      const link of chapterLinks
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

    // Don't fetch huge numbers of unrelated pages.
    const urlsToFetch =
      sourceUrls.slice(
        0,
        12
      );

    // ============================================================
    // FETCH CHAPTER RESOURCES
    // ============================================================
    const fetchedPages = [];

    for (
      const url of urlsToFetch
    ) {
      const html =
        await fetchPage(
          url
        );

      if (!html) {
        continue;
      }

      fetchedPages.push({
        url,
        title:
          getTitle(html),
        text:
          htmlToText(html)
      });
    }

    // ============================================================
    // SCORE CONTENT
    // ============================================================
    const keywords =
      normalizedQuestion
        .split(/\s+/)
        .filter(
          word =>
            word.length >= 3 &&
            ![
              "what",
              "why",
              "how",
              "when",
              "where",
              "which",
              "the",
              "and",
              "for",
              "with",
              "from",
              "about",
              "explain",
              "define",
              "describe",
              "tell",
              "me",
              "is",
              "are",
              "does",
              "do"
            ].includes(word)
        );

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

      // Subject
      if (
        subject === "physics" &&
        (
          title.includes("physics") ||
          text.includes("physics")
        )
      ) {
        score += 50;
      }

      if (
        subject === "mathematics" &&
        (
          title.includes("math") ||
          title.includes("mathematics")
        )
      ) {
        score += 50;
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
        score += 70;
      }

      if (
        grade === 9 &&
        (
          title.includes("9th") ||
          title.includes("class 9") ||
          page.url.includes("9th")
        )
      ) {
        score += 70;
      }

      // Chapter
      if (chapter) {
        if (
          title.includes(
            `chapter ${chapter}`
          ) ||
          title.includes(
            `unit ${chapter}`
          )
        ) {
          score += 200;
        }

        if (
          page.url
            .toLowerCase()
            .includes(
              `chapter${chapter}`
            )
        ) {
          score += 200;
        }

        if (
          page.url
            .toLowerCase()
            .includes(
              `unit${chapter}`
            )
        ) {
          score += 200;
        }
      }

      // Chapter title
      if (
        subject === "physics" &&
        grade === 10 &&
        chapter &&
        PHYSICS10[chapter]
      ) {
        const chapterTitle =
          normalize(
            PHYSICS10[
              chapter
            ].title
          );

        if (
          title.includes(
            chapterTitle
          )
        ) {
          score += 250;
        }

        if (
          text.includes(
            chapterTitle
          )
        ) {
          score += 80;
        }
      }

      // Exact phrase
      if (
        normalizedQuestion.length >= 8 &&
        text.includes(
          normalizedQuestion
        )
      ) {
        score += 500;
      }

      // Keywords
      for (
        const keyword
        of keywords
      ) {
        if (
          title.includes(
            keyword
          )
        ) {
          score += 20;
        }

        if (
          text.includes(
            keyword
          )
        ) {
          score += 5;
        }
      }

      // Strong resource preference
      if (
        /short|exercise|crq|constructed|long|mcq|numerical|notes/i.test(
          page.title
        )
      ) {
        score += 30;
      }

      // Generic definitions page should NOT win
      if (
        page.url
          .toLowerCase()
          .includes(
            "definitions"
          ) &&
        chapter
      ) {
        score -= 150;
      }

      return score;
    }

    const rankedPages =
      fetchedPages
        .map(page => ({
          ...page,
          score:
            scorePage(page)
        }))
        .sort(
          (a, b) =>
            b.score - a.score
        );

    // ============================================================
    // EXTRACT RELEVANT PASSAGES
    // ============================================================
    function relevantText(
      page
    ) {
      const lines =
        page.text
          .split(/\n+/)
          .map(
            line =>
              line.trim()
          )
          .filter(
            line =>
              line.length >= 15
          );

      const scored =
        lines.map(line => {
          const n =
            normalize(line);

          let score = 0;

          if (
            normalizedQuestion.length >= 8 &&
            n.includes(
              normalizedQuestion
            )
          ) {
            score += 1000;
          }

          for (
            const keyword
            of keywords
          ) {
            if (
              n.includes(
                keyword
              )
            ) {
              score += 20;
            }
          }

          // Explicit Chapter 17 topic priority
          if (
            chapter === 17 &&
            subject === "physics"
          ) {
            const topics =
              PHYSICS10[17]
                .topics;

            for (
              const topic
              of topics
            ) {
              if (
                n.includes(
                  normalize(topic)
                )
              ) {
                score += 50;
              }
            }
          }

          return {
            line,
            score
          };
        });

      scored.sort(
        (a, b) =>
          b.score - a.score
      );

      const useful =
        scored
          .filter(
            item =>
              item.score > 0
          )
          .slice(
            0,
            25
          );

      if (
        useful.length
      ) {
        return useful
          .map(
            item =>
              item.line
          )
          .join("\n");
      }

      // If no matching lines,
      // provide the beginning of the page,
      // but ONLY for Hira Academy pages.
      return page.text.substring(
        0,
        7000
      );
    }

    // ============================================================
    // BUILD HIRA ACADEMY SOURCE
    // ============================================================
    let sourceContext = "";

    for (
      const page
      of rankedPages.slice(
        0,
        5
      )
    ) {
      sourceContext += `
==================================================
HIRA ACADEMY PAGE
==================================================

TITLE:
${page.title}

URL:
${page.url}

RELEVANCE SCORE:
${page.score}

CONTENT:
${relevantText(page)}

`;
    }

    // ============================================================
    // CRITICAL SOURCE CHECK
    // ============================================================
    //
    // We require actual Hira Academy source content.
    //
    // If no page was successfully fetched,
    // Gemini is NOT allowed to answer from general knowledge.
    //
    // ============================================================
    if (
      rankedPages.length === 0
    ) {
      return res.status(200).json({
        reply:
          "I couldn't access the relevant Hira Academy material right now. Please try again in a moment."
      });
    }

    // ============================================================
    // CONVERSATION HISTORY
    // ============================================================
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

Your job is to answer students using ONLY the
Hira Academy website material supplied below.

Website:
https://hiraacademy.com.pk/

==================================================
CURRENT RETRIEVAL
==================================================

Detected class:
${grade || "Not specified"}

Detected subject:
${subject || "Not specified"}

Detected chapter:
${
  chapter
    ? `Chapter ${chapter}`
    : "Not specified"
}

==================================================
ABSOLUTE SOURCE RULE
==================================================

You MUST NOT answer from your general knowledge.

You MUST NOT use an old textbook answer from your
pretrained knowledge.

You MUST NOT create a standard curriculum answer
when the Hira Academy material does not contain it.

You MUST answer from the Hira Academy source material
provided below.

If the supplied Hira Academy material contains the
answer, answer directly from that material.

If the supplied Hira Academy material does NOT
contain the answer, respond ONLY:

"I couldn't find this information in the current
Hira Academy material."

Do not add a general-knowledge answer after that.

==================================================
IMPORTANT EXAMPLE
==================================================

Student asks:

"What is the right hand grip rule?"

This is detected as:

Class 10
Physics
Chapter 17
Electromagnetism

The answer must come from the supplied Hira Academy
Chapter 17 material.

Do NOT use a generic Class 9 Physics Definitions
source.

==================================================
ANSWER STYLE
==================================================

For a simple definition:
- Give the definition from Hira Academy.
- Keep it concise.

For a short question:
- Give the Hira Academy answer.
- Do not add unnecessary outside information.

For a detailed question:
- Use the relevant Hira Academy material.
- Preserve important terminology and formulas.

If the source uses a particular wording, stay close
to that wording.

==================================================
SOURCE
==================================================

When answering from Hira Academy material, end with:

Source: Hira Academy
[actual Hira Academy URL]

Use the actual URL supplied in the source.

==================================================
DO NOT FABRICATE
==================================================

Never claim that Hira Academy says something unless
that information appears in the supplied source.

Never invent a source URL.

Never cite a generic page if a more relevant
chapter/resource page is supplied.

==================================================
HIRA ACADEMY MATERIAL
==================================================

${sourceContext}
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
              temperature: 0.1,
              maxOutputTokens: 700
            }
          })
        }
      );

    const data =
      await response.json();

    // ============================================================
    // GEMINI ERROR
    // ============================================================
    if (!response.ok) {
      console.error(
        "Gemini error:",
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
    // GET ANSWER
    // ============================================================
    const reply =
      data
        ?.candidates?.[0]
        ?.content?.parts
        ?.map(
          part =>
            part.text || ""
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
    // RETURN
    // ============================================================
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
