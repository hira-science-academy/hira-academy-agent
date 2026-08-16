export default async function handler(req, res) {
  // ============================================================
  // CORS
  // ============================================================
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Content-Type"
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

    const question = latestUserMessage?.content?.trim();

    if (!question) {
      return res.status(400).json({
        error: "No user question found."
      });
    }

    // ============================================================
    // HIRA ACADEMY
    // ============================================================
    const SITE_URL = "https://hiraacademy.com.pk";

    const SITEMAP_URL =
      `${SITE_URL}/sitemap.xml`;

    const PHYSICS_10_HUB =
      `${SITE_URL}/Physics-10th-New-2026.html`;

    const MATH_10_HUB =
      `${SITE_URL}/Mathematics-10th-New-2026.html`;

    const PHYSICS_9_HUB =
      `${SITE_URL}/Physics-9th.html`;

    const MATH_9_HUB =
      `${SITE_URL}/Mathematics-9th.html`;

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
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/<[^>]+>/g, " ")
        .replace(/[^a-z0-9\s\-]/g, " ")
        .replace(/[-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // ============================================================
    // STOP WORDS
    // ============================================================
    const STOP_WORDS = new Set([
      "what",
      "why",
      "how",
      "when",
      "where",
      "which",
      "who",
      "does",
      "do",
      "did",
      "is",
      "are",
      "was",
      "were",
      "the",
      "a",
      "an",
      "of",
      "to",
      "in",
      "on",
      "for",
      "and",
      "or",
      "with",
      "from",
      "about",
      "explain",
      "define",
      "describe",
      "tell",
      "me",
      "give",
      "please",
      "can",
      "you",
      "according",
      "answer",
      "question",
      "class",
      "grade",
      "chapter",
      "unit"
    ]);

    function getKeywords(text) {
      return [
        ...new Set(
          normalize(text)
            .split(" ")
            .filter(
              word =>
                word.length >= 3 &&
                !STOP_WORDS.has(word)
            )
        )
      ];
    }

    const questionNormalized =
      normalize(question);

    const questionKeywords =
      getKeywords(question);

    // ============================================================
    // SUBJECT + CLASS DETECTION
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

    function detectSubject(text) {
      const q = normalize(text);

      if (
        q.includes("physics") ||
        q.includes("electromagnet") ||
        q.includes("magnetic field") ||
        q.includes("magnetic") ||
        q.includes("electric current") ||
        q.includes("voltage") ||
        q.includes("resistance") ||
        q.includes("transformer") ||
        q.includes("motor") ||
        q.includes("generator") ||
        q.includes("diode") ||
        q.includes("semiconductor")
      ) {
        return "physics";
      }

      if (
        q.includes("math") ||
        q.includes("mathematics") ||
        q.includes("quadratic") ||
        q.includes("matrix") ||
        q.includes("polynomial") ||
        q.includes("trigonometry") ||
        q.includes("equation")
      ) {
        return "mathematics";
      }

      return null;
    }

    // ============================================================
    // CHAPTER TOPIC MAP
    // ============================================================
    // This is the important part.
    // It lets the chatbot understand a concept even if the
    // URL does not contain the exact concept name.
    // ============================================================

    const PHYSICS_10_CHAPTERS = {
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
          "wave motion",
          "wavelength",
          "frequency",
          "amplitude",
          "wave speed"
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
          "potential",
          "coulomb",
          "capacitor"
        ]
      },

      16: {
        title: "Electricity",
        topics: [
          "electricity",
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

        // VERY IMPORTANT:
        // These concepts belong to Chapter 17.
        topics: [
          "electromagnetism",
          "right hand grip rule",
          "right hand rule",
          "right hand grip",
          "magnetic field",
          "magnetic field lines",
          "current carrying conductor",
          "current carrying conductors",
          "solenoid",
          "fleming left hand rule",
          "fleming's left hand rule",
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
          "induced e.m.f",
          "lenz law",
          "lenz's law",
          "ac generator",
          "alternating current generator",
          "transformer",
          "mutual induction",
          "cathode ray",
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
          "radiation exposure",
          "background radiation"
        ]
      }
    };

    // ============================================================
    // DETECT CHAPTER FROM USER QUESTION
    // ============================================================
    function detectChapter(text, subject, grade) {
      const q = normalize(text);

      // Explicit chapter
      const chapterMatch =
        q.match(/\bchapter\s+(\d{1,2})\b/);

      if (chapterMatch) {
        return Number(chapterMatch[1]);
      }

      // Explicit unit
      const unitMatch =
        q.match(/\bunit\s+(\d{1,2})\b/);

      if (unitMatch) {
        return Number(unitMatch[1]);
      }

      // Topic-based detection
      if (
        subject === "physics" &&
        (grade === 10 || grade === null)
      ) {
        let bestChapter = null;
        let bestScore = 0;

        for (
          const [chapter, data]
          of Object.entries(
            PHYSICS_10_CHAPTERS
          )
        ) {
          let score = 0;

          for (
            const topic
            of data.topics
          ) {
            const normalizedTopic =
              normalize(topic);

            if (
              q.includes(normalizedTopic)
            ) {
              // Longer phrases receive much
              // stronger priority.
              score +=
                normalizedTopic.split(" ")
                  .length * 20;
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestChapter =
              Number(chapter);
          }
        }

        if (bestScore > 0) {
          return bestChapter;
        }
      }

      return null;
    }

    let detectedGrade =
      detectClass(question);

    let detectedSubject =
      detectSubject(question);

    let detectedChapter =
      detectChapter(
        question,
        detectedSubject,
        detectedGrade
      );

    // ============================================================
    // SPECIAL CONCEPT OVERRIDES
    // ============================================================
    // These prevent generic pages such as "Definitions"
    // from beating the actual chapter.
    // ============================================================

    const conceptOverrides = [
      {
        terms: [
          "right hand grip rule",
          "right hand grip",
          "right hand rule"
        ],
        grade: 10,
        subject: "physics",
        chapter: 17
      },

      {
        terms: [
          "fleming left hand rule",
          "fleming's left hand rule",
          "left hand rule"
        ],
        grade: 10,
        subject: "physics",
        chapter: 17
      },

      {
        terms: [
          "dc motor",
          "electric motor",
          "split ring commutator",
          "split ring"
        ],
        grade: 10,
        subject: "physics",
        chapter: 17
      },

      {
        terms: [
          "faraday law",
          "faradays law",
          "lenz law",
          "lenz's law",
          "induced emf",
          "electromagnetic induction"
        ],
        grade: 10,
        subject: "physics",
        chapter: 18
      },

      {
        terms: [
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

    for (
      const override
      of conceptOverrides
    ) {
      const matched =
        override.terms.some(term =>
          questionNormalized.includes(
            normalize(term)
          )
        );

      if (matched) {
        detectedGrade =
          override.grade;

        detectedSubject =
          override.subject;

        detectedChapter =
          override.chapter;

        break;
      }
    }

    // ============================================================
    // FETCH TIMEOUT
    // ============================================================
    async function fetchWithTimeout(
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
        return await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Hira-Academy-Assistant/1.0",
            "Accept":
              "text/html,application/xml,text/xml,*/*"
          }
        });
      } finally {
        clearTimeout(timer);
      }
    }

    // ============================================================
    // FETCH SITEMAP
    // ============================================================
    async function getSitemapUrls(
      sitemapUrl,
      depth = 0
    ) {
      if (depth > 2) {
        return [];
      }

      try {
        const response =
          await fetchWithTimeout(
            sitemapUrl,
            7000
          );

        if (!response.ok) {
          return [];
        }

        const xml =
          await response.text();

        const locs = [
          ...xml.matchAll(
            /<loc>\s*([\s\S]*?)\s*<\/loc>/gi
          )
        ]
          .map(
            match =>
              match[1].trim()
          )
          .filter(Boolean);

        if (!locs.length) {
          return [];
        }

        // Sitemap index
        if (
          xml
            .toLowerCase()
            .includes("<sitemapindex")
        ) {
          const childResults =
            await Promise.all(
              locs
                .slice(0, 10)
                .map(url =>
                  getSitemapUrls(
                    url,
                    depth + 1
                  )
                )
            );

          return childResults.flat();
        }

        return locs.filter(url =>
          url.startsWith(SITE_URL)
        );
      } catch (error) {
        console.error(
          "Sitemap error:",
          error.message
        );

        return [];
      }
    }

    // ============================================================
    // EXTRACT TEXT FROM HTML
    // ============================================================
    function extractPageContent(html) {
      const titleMatch =
        html.match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        );

      const title =
        titleMatch
          ? titleMatch[1]
              .replace(
                /<[^>]+>/g,
                " "
              )
              .trim()
          : "";

      let content =
        html;

      const bodyMatch =
        html.match(
          /<body[^>]*>([\s\S]*?)<\/body>/i
        );

      if (bodyMatch) {
        content =
          bodyMatch[1];
      }

      content =
        content
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
            /<nav\b[^>]*>[\s\S]*?<\/nav>/gi,
            " "
          )
          .replace(
            /<footer\b[^>]*>[\s\S]*?<\/footer>/gi,
            " "
          );

      // Preserve headings and paragraphs
      content =
        content
          .replace(
            /<\/(h1|h2|h3|h4|h5|h6|p|li|div|section|article)>/gi,
            "\n"
          )
          .replace(
            /<[^>]+>/g,
            " "
          );

      content =
        content
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

      return {
        title,
        content
      };
    }

    // ============================================================
    // FETCH PAGE
    // ============================================================
    async function fetchPage(url) {
      try {
        const response =
          await fetchWithTimeout(
            url,
            7000
          );

        if (!response.ok) {
          return null;
        }

        const html =
          await response.text();

        const extracted =
          extractPageContent(html);

        if (
          !extracted.content
        ) {
          return null;
        }

        return {
          url,
          title:
            extracted.title,
          content:
            extracted.content
        };
      } catch {
        return null;
      }
    }

    // ============================================================
    // GET SITE URLS
    // ============================================================
    let siteUrls =
      await getSitemapUrls(
        SITEMAP_URL
      );

    siteUrls = [
      ...new Set(
        siteUrls.filter(url =>
          url.startsWith(
            SITE_URL
          )
        )
      )
    ];

    // ============================================================
    // IMPORTANT:
    // Always include the main subject hubs even if sitemap
    // has a temporary indexing/cache issue.
    // ============================================================
    siteUrls = [
      PHYSICS_10_HUB,
      MATH_10_HUB,
      PHYSICS_9_HUB,
      MATH_9_HUB,
      ...siteUrls
    ];

    siteUrls = [
      ...new Set(siteUrls)
    ];

    // ============================================================
    // LIMIT
    // ============================================================
    siteUrls =
      siteUrls.slice(
        0,
        120
      );

    // ============================================================
    // FETCH IN BATCHES
    // ============================================================
    async function fetchPagesInBatches(
      urls,
      batchSize = 10
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
            batch.map(fetchPage)
          );

        results.push(
          ...batchResults.filter(
            Boolean
          )
        );

        if (
          results.length >= 80
        ) {
          break;
        }
      }

      return results;
    }

    const pages =
      await fetchPagesInBatches(
        siteUrls,
        10
      );

    // ============================================================
    // PAGE SCORING
    // ============================================================
    function scorePage(page) {
      const title =
        normalize(page.title);

      const content =
        normalize(page.content);

      const url =
        normalize(page.url);

      let score = 0;

      // ----------------------------------------------------------
      // MASSIVE PRIORITY FOR DETECTED CLASS
      // ----------------------------------------------------------
      if (
        detectedGrade === 10
      ) {
        if (
          url.includes(
            "10th"
          ) ||
          url.includes(
            "10th-class"
          ) ||
          title.includes(
            "10th class"
          ) ||
          title.includes(
            "class 10"
          )
        ) {
          score += 100;
        }

        if (
          url.includes(
            "9th"
          ) ||
          title.includes(
            "9th class"
          ) ||
          title.includes(
            "class 9"
          )
        ) {
          score -= 80;
        }
      }

      if (
        detectedGrade === 9
      ) {
        if (
          url.includes(
            "9th"
          ) ||
          title.includes(
            "9th class"
          ) ||
          title.includes(
            "class 9"
          )
        ) {
          score += 100;
        }

        if (
          url.includes(
            "10th"
          ) ||
          title.includes(
            "10th class"
          ) ||
          title.includes(
            "class 10"
          )
        ) {
          score -= 80;
        }
      }

      // ----------------------------------------------------------
      // SUBJECT PRIORITY
      // ----------------------------------------------------------
      if (
        detectedSubject ===
        "physics"
      ) {
        if (
          url.includes(
            "physics"
          )
        ) {
          score += 80;
        }

        if (
          title.includes(
            "physics"
          )
        ) {
          score += 50;
        }

        if (
          content.includes(
            "physics"
          )
        ) {
          score += 15;
        }

        // Strongly penalize mathematics
        if (
          url.includes(
            "math"
          ) ||
          url.includes(
            "mathematics"
          )
        ) {
          score -= 100;
        }
      }

      if (
        detectedSubject ===
        "mathematics"
      ) {
        if (
          url.includes(
            "math"
          ) ||
          url.includes(
            "mathematics"
          )
        ) {
          score += 80;
        }

        if (
          title.includes(
            "math"
          ) ||
          title.includes(
            "mathematics"
          )
        ) {
          score += 50;
        }

        if (
          url.includes(
            "physics"
          )
        ) {
          score -= 100;
        }
      }

      // ----------------------------------------------------------
      // 2026 PRIORITY
      // ----------------------------------------------------------
      if (
        url.includes(
          "2026"
        ) ||
        title.includes(
          "2026"
        )
      ) {
        score += 25;
      }

      // ----------------------------------------------------------
      // CHAPTER PRIORITY
      // ----------------------------------------------------------
      if (
        detectedChapter &&
        detectedSubject ===
          "physics" &&
        detectedGrade === 10
      ) {
        const chapter =
          detectedChapter;

        const chapterText =
          `chapter ${chapter}`;

        // URL
        if (
          url.includes(
            `chapter${chapter}`
          ) ||
          url.includes(
            `chapter-${chapter}`
          ) ||
          url.includes(
            `chapter_${chapter}`
          )
        ) {
          score += 300;
        }

        // Title
        if (
          title.includes(
            chapterText
          )
        ) {
          score += 300;
        }

        // Content
        if (
          content.includes(
            chapterText
          )
        ) {
          score += 150;
        }

        // ------------------------------------------------------
        // CHAPTER TITLE
        // ------------------------------------------------------
        const chapterInfo =
          PHYSICS_10_CHAPTERS[
            chapter
          ];

        if (chapterInfo) {
          const chapterTitle =
            normalize(
              chapterInfo.title
            );

          if (
            title.includes(
              chapterTitle
            )
          ) {
            score += 250;
          }

          if (
            content.includes(
              chapterTitle
            )
          ) {
            score += 100;
          }
        }
      }

      // ----------------------------------------------------------
      // EXACT PHRASE
      // ----------------------------------------------------------
      if (
        questionNormalized.length >=
        8 &&
        content.includes(
          questionNormalized
        )
      ) {
        score += 250;
      }

      // ----------------------------------------------------------
      // TOPIC MATCHING
      // ----------------------------------------------------------
      for (
        const keyword
        of questionKeywords
      ) {
        if (
          title.includes(
            keyword
          )
        ) {
          score += 20;
        }

        if (
          content.includes(
            keyword
          )
        ) {
          score += 5;
        }
      }

      // ----------------------------------------------------------
      // EXACT DETECTED CHAPTER TOPIC
      // ----------------------------------------------------------
      if (
        detectedChapter &&
        detectedSubject ===
          "physics" &&
        detectedGrade === 10
      ) {
        const info =
          PHYSICS_10_CHAPTERS[
            detectedChapter
          ];

        if (info) {
          for (
            const topic
            of info.topics
          ) {
            const normalizedTopic =
              normalize(topic);

            if (
              questionNormalized.includes(
                normalizedTopic
              )
            ) {
              if (
                content.includes(
                  normalizedTopic
                )
              ) {
                score += 200;
              }
            }
          }
        }
      }

      // ----------------------------------------------------------
      // PENALIZE GENERIC RESOURCE PAGES WHEN A CHAPTER IS KNOWN
      // ----------------------------------------------------------
      if (
        detectedChapter
      ) {
        if (
          url.includes(
            "definitions"
          )
        ) {
          score -= 100;
        }

        if (
          url.includes(
            "formula"
          )
        ) {
          score -= 60;
        }

        if (
          url.includes(
            "past-paper"
          )
        ) {
          score -= 40;
        }

        if (
          url.includes(
            "guess"
          )
        ) {
          score -= 40;
        }
      }

      return score;
    }

    // ============================================================
    // RANK PAGES
    // ============================================================
    const rankedPages =
      pages
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
    // EXTRACT RELEVANT CONTENT
    // ============================================================
    function extractRelevantContent(
      page
    ) {
      const lines =
        page.content
          .split(/\n+/)
          .map(
            line =>
              line.trim()
          )
          .filter(
            line =>
              line.length > 15
          );

      const scoredLines =
        lines.map(line => {
          const n =
            normalize(line);

          let score = 0;

          // Exact question
          if (
            questionNormalized.length >=
              8 &&
            n.includes(
              questionNormalized
            )
          ) {
            score += 100;
          }

          // Topic keywords
          for (
            const keyword
            of questionKeywords
          ) {
            if (
              n.includes(
                keyword
              )
            ) {
              score += 10;
            }
          }

          // Chapter title
          if (
            detectedChapter &&
            detectedSubject ===
              "physics" &&
            detectedGrade === 10
          ) {
            const chapterInfo =
              PHYSICS_10_CHAPTERS[
                detectedChapter
              ];

            if (
              chapterInfo &&
              n.includes(
                normalize(
                  chapterInfo.title
                )
              )
            ) {
              score += 30;
            }
          }

          return {
            line,
            score
          };
        });

      scoredLines.sort(
        (a, b) =>
          b.score - a.score
      );

      const selected =
        scoredLines
          .filter(
            item =>
              item.score > 0
          )
          .slice(
            0,
            12
          )
          .map(
            item =>
              item.line
          );

      if (
        selected.length > 0
      ) {
        return selected.join(
          "\n"
        );
      }

      return page.content.substring(
        0,
        5000
      );
    }

    // ============================================================
    // SELECT SOURCES
    // ============================================================
    const relevantPages =
      rankedPages
        .filter(
          page =>
            page.score > 0
        )
        .slice(
          0,
          6
        );

    // ============================================================
    // BUILD CONTEXT
    // ============================================================
    let sourceContext =
      "";

    for (
      const page
      of relevantPages
    ) {
      sourceContext += `

==================================================
HIRA ACADEMY SOURCE
==================================================
TITLE:
${page.title}

URL:
${page.url}

RELEVANCE SCORE:
${page.score}

CONTENT:
${extractRelevantContent(
        page
      )}

`;
    }

    // Keep context manageable
    sourceContext =
      sourceContext.substring(
        0,
        50000
      );

    // ============================================================
    // DEBUG INFORMATION
    // ============================================================
    console.log(
      "HIRA CHAT QUESTION:",
      question
    );

    console.log(
      "DETECTED GRADE:",
      detectedGrade
    );

    console.log(
      "DETECTED SUBJECT:",
      detectedSubject
    );

    console.log(
      "DETECTED CHAPTER:",
      detectedChapter
    );

    console.log(
      "TOP SOURCES:",
      rankedPages
        .slice(0, 5)
        .map(page => ({
          title:
            page.title,
          url:
            page.url,
          score:
            page.score
        }))
    );

    // ============================================================
    // NO SOURCE FOUND
    // ============================================================
    if (
      relevantPages.length === 0
    ) {
      sourceContext = `
No relevant Hira Academy page was found.

Do not claim that Hira Academy provided
the answer.
`;
    }

    // ============================================================
    // CONVERSATION
    // ============================================================
    const contents =
      messages
        .map(message => ({
          role:
            message.role === "user"
              ? "user"
              : "model",

          parts: [
            {
              text:
                message.content ||
                ""
            }
          ]
        }))
        .filter(
          message =>
            message.parts[0].text
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

Your primary purpose is to answer students using
the CURRENT content from:

https://hiraacademy.com.pk/

==================================================
SOURCE PRIORITY
==================================================

1. Hira Academy source material supplied below
2. Current Hira Academy chapter/resource content
3. General knowledge ONLY when Hira Academy does
   not contain the requested information

Never replace current Hira Academy content with
old textbook material when a current Hira Academy
source is available.

==================================================
CLASS / SUBJECT / CHAPTER
==================================================

The retrieval system has detected:

Class:
${detectedGrade || "Not specified"}

Subject:
${detectedSubject || "Not specified"}

Chapter:
${
  detectedChapter
    ? `Chapter ${detectedChapter}`
    : "Not specified"
}

Use this information as a retrieval priority.

If the question is about the Right-Hand Grip Rule,
treat it as Class 10 Physics Chapter 17
(Electromagnetism) when the question does not specify
another class.

==================================================
VERY IMPORTANT
==================================================

For a question such as:

"What is the right hand grip rule?"

the correct Hira Academy source should be the
Class 10 Physics / Chapter 17 Electromagnetism
material, NOT a generic Class 9 Physics Definitions
page.

The same principle applies to other chapter-specific
concepts.

==================================================
ANSWER FROM SOURCE
==================================================

When the supplied Hira Academy source contains the
answer:

- Answer directly from it.
- Preserve Hira Academy terminology.
- Stay close to the source wording.
- Do not unnecessarily add outside information.
- Do not invent textbook statements.
- Do not contradict the supplied source.

For exam questions, keep the answer concise and
exam-oriented.

==================================================
SOURCE HONESTY
==================================================

If the relevant information is not found in the
supplied Hira Academy material, say:

"I couldn't find this information in the current
Hira Academy material."

Do NOT pretend that a source contains information
when it does not.

==================================================
SOURCE LABEL
==================================================

If you use Hira Academy material, finish with:

Source: Hira Academy
[URL of the actual page used]

Only provide URLs that appear in the supplied sources.

==================================================
CURRENT HIRA ACADEMY MATERIAL
==================================================

${sourceContext}
`
        }
      ]
    };

    // ============================================================
    // GEMINI 3.6 FLASH
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
            contents
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
        "Gemini API Error:",
        data
      );

      return res
        .status(
          response.status
        )
        .json({
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
        .candidates?.[0]
        ?.content?.parts
        ?.map(
          part =>
            part.text || ""
        )
        .join("")
        .trim();

    return res.status(200).json({
      reply:
        reply ||
        "No response returned from Gemini."
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
