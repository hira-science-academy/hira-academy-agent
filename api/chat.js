export default async function handler(req, res) {
  // ============================================================
  // CORS & HEADERS
  // ============================================================
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
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ============================================================
    // API KEY & ENV VALIDATION
    // ============================================================
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is missing on Vercel." });
    }

    // ============================================================
    // REQUEST BODY PARSING
    // ============================================================
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON payload." });
      }
    }

    const messages = body?.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "No messages array provided." });
    }

    const latestUserMessage = [...messages]
      .reverse()
      .find(m => m && m.role === "user" && typeof m.content === "string");

    const question = latestUserMessage?.content?.trim();
    if (!question) {
      return res.status(400).json({ error: "No user question found." });
    }

    // ============================================================
    // SITE CONFIGURATION
    // ============================================================
    const SITE_URL = "https://hiraacademy.com.pk";
    const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
    const PHYSICS_10_HUB = `${SITE_URL}/Physics-10th-New-2026.html`;
    const MATH_10_HUB = `${SITE_URL}/Mathematics-10th-New-2026.html`;
    const PHYSICS_9_HUB = `${SITE_URL}/Physics-9th.html`;
    const MATH_9_HUB = `${SITE_URL}/Mathematics-9th.html`;

    // ============================================================
    // NORMALIZE TEXT & STOP WORDS
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

    const STOP_WORDS = new Set([
      "what", "why", "how", "when", "where", "which", "who", "does", "do",
      "did", "is", "are", "was", "were", "the", "a", "an", "of", "to", "in",
      "on", "for", "and", "or", "with", "from", "about", "explain", "define",
      "describe", "tell", "me", "give", "please", "can", "you", "according",
      "answer", "question", "class", "grade", "chapter", "unit"
    ]);

    function getKeywords(text) {
      return [
        ...new Set(
          normalize(text)
            .split(" ")
            .filter(word => word.length >= 3 && !STOP_WORDS.has(word))
        )
      ];
    }

    const questionNormalized = normalize(question);
    const questionKeywords = getKeywords(question);

    // ============================================================
    // CLASSIFICATION ROUTINES
    // ============================================================
    function detectClass(text) {
      const q = normalize(text);
      if (/\bclass 10\b/.test(q) || /\b10th\b/.test(q) || /\bgrade 10\b/.test(q)) return 10;
      if (/\bclass 9\b/.test(q) || /\b9th\b/.test(q) || /\bgrade 9\b/.test(q)) return 9;
      return null;
    }

    function detectSubject(text) {
      const q = normalize(text);
      if (
        q.includes("physics") || q.includes("electromagnet") || q.includes("magnetic field") ||
        q.includes("magnetic") || q.includes("electric current") || q.includes("voltage") ||
        q.includes("resistance") || q.includes("transformer") || q.includes("motor") ||
        q.includes("generator") || q.includes("diode") || q.includes("semiconductor")
      ) return "physics";

      if (
        q.includes("math") || q.includes("mathematics") || q.includes("quadratic") ||
        q.includes("matrix") || q.includes("polynomial") || q.includes("trigonometry") || q.includes("equation")
      ) return "mathematics";

      return null;
    }

    const PHYSICS_10_CHAPTERS = {
      10: { title: "Thermal Physics", topics: ["thermal physics", "heat", "temperature", "thermal expansion", "specific heat", "heat capacity", "latent heat"] },
      11: { title: "Transfer of Thermal Energy", topics: ["transfer of thermal energy", "conduction", "convection", "radiation", "thermal energy transfer"] },
      12: { title: "Waves", topics: ["waves", "wave motion", "wavelength", "frequency", "amplitude", "wave speed"] },
      13: { title: "Sound", topics: ["sound", "echo", "pitch", "loudness", "ultrasound", "sonar"] },
      14: { title: "Light", topics: ["light", "reflection", "refraction", "lens", "mirror", "critical angle", "total internal reflection"] },
      15: { title: "Electrostatics", topics: ["electrostatics", "electric charge", "electric field", "potential", "coulomb", "capacitor"] },
      16: { title: "Electricity", topics: ["electricity", "current", "voltage", "potential difference", "resistance", "ohm law", "circuit", "electrical power", "electrical energy"] },
      17: { title: "Electromagnetism", topics: ["electromagnetism", "right hand grip rule", "right hand rule", "right hand grip", "magnetic field", "magnetic field lines", "current carrying conductor", "solenoid", "fleming left hand rule", "left hand rule", "force on a current carrying conductor", "parallel current carrying conductors", "dc motor", "electric motor", "motor", "split ring", "commutator", "relay", "earth magnetic field"] },
      18: { title: "Electromagnetic Induction & EM Waves", topics: ["electromagnetic induction", "faraday law", "lenz law", "induced emf", "ac generator", "transformer", "mutual induction", "cathode ray", "electron beam", "cro", "electromagnetic waves"] },
      19: { title: "Electronics", topics: ["electronics", "semiconductor", "pn junction", "pn junction diode", "diode", "led", "depletion region", "forward bias", "reverse bias", "analog electronics", "digital electronics", "adc", "boolean logic", "and gate", "or gate", "not gate", "nand gate", "nor gate", "burglar alarm"] },
      20: { title: "Atomic and Nuclear Physics", topics: ["atomic physics", "nuclear physics", "atom", "nucleus", "radioactivity", "radioactive decay", "nuclear reaction", "nuclear fusion", "nuclear fission", "radiation"] },
      21: { title: "Space and Environment", topics: ["space", "environment", "solar system", "planet", "sun", "venus", "mars", "cyclone", "radiation exposure", "background radiation"] }
    };

    function detectChapter(text, subject, grade) {
      const q = normalize(text);
      const chMatch = q.match(/\bchapter\s+(\d{1,2})\b/) || q.match(/\bunit\s+(\d{1,2})\b/);
      if (chMatch) return Number(chMatch[1]);

      if (subject === "physics" && (grade === 10 || grade === null)) {
        let bestChapter = null;
        let bestScore = 0;
        for (const [ch, data] of Object.entries(PHYSICS_10_CHAPTERS)) {
          let score = 0;
          for (const topic of data.topics) {
            const normTopic = normalize(topic);
            if (q.includes(normTopic)) {
              score += normTopic.split(" ").length * 20;
            }
          }
          if (score > bestScore) {
            bestScore = score;
            bestChapter = Number(ch);
          }
        }
        if (bestScore > 0) return bestChapter;
      }
      return null;
    }

    let detectedGrade = detectClass(question);
    let detectedSubject = detectSubject(question);
    let detectedChapter = detectChapter(question, detectedSubject, detectedGrade);

    const conceptOverrides = [
      { terms: ["right hand grip rule", "right hand grip", "right hand rule"], grade: 10, subject: "physics", chapter: 17 },
      { terms: ["fleming left hand rule", "left hand rule"], grade: 10, subject: "physics", chapter: 17 },
      { terms: ["dc motor", "electric motor", "split ring commutator", "split ring"], grade: 10, subject: "physics", chapter: 17 },
      { terms: ["faraday law", "lenz law", "induced emf", "electromagnetic induction"], grade: 10, subject: "physics", chapter: 18 },
      { terms: ["pn junction", "pn junction diode", "depletion region", "forward bias", "reverse bias", "nand gate", "nor gate"], grade: 10, subject: "physics", chapter: 19 }
    ];

    for (const override of conceptOverrides) {
      if (override.terms.some(t => questionNormalized.includes(normalize(t)))) {
        detectedGrade = override.grade;
        detectedSubject = override.subject;
        detectedChapter = override.chapter;
        break;
      }
    }

    // ============================================================
    // HTTP FETCH HELPERS
    // ============================================================
    async function fetchWithTimeout(url, timeout = 3500) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        return await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Hira-Academy-Assistant/1.0",
            "Accept": "text/html,application/xml,text/xml,*/*"
          }
        });
      } finally {
        clearTimeout(timer);
      }
    }

    async function getSitemapUrls(sitemapUrl, depth = 0) {
      if (depth > 2) return [];
      try {
        const response = await fetchWithTimeout(sitemapUrl, 3000);
        if (!response.ok) return [];
        const xml = await response.text();
        const locs = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)]
          .map(m => m[1].trim())
          .filter(Boolean);

        if (!locs.length) return [];
        if (xml.toLowerCase().includes("<sitemapindex")) {
          const childResults = await Promise.all(
            locs.slice(0, 5).map(u => getSitemapUrls(u, depth + 1))
          );
          return childResults.flat();
        }
        return locs.filter(u => u.startsWith(SITE_URL));
      } catch {
        return [];
      }
    }

    function extractPageContent(html) {
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, " ").trim() : "";
      let content = html;
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) content = bodyMatch[1];

      content = content
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
        .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
        .replace(/<\/(h1|h2|h3|h4|h5|h6|p|li|div|section|article)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();

      return { title, content };
    }

    async function fetchPage(url) {
      try {
        const response = await fetchWithTimeout(url, 3000);
        if (!response.ok) return null;
        const html = await response.text();
        const extracted = extractPageContent(html);
        if (!extracted.content) return null;
        return { url, title: extracted.title, content: extracted.content };
      } catch {
        return null;
      }
    }

    // Fetch site URLs efficiently (Cap limits to prevent Vercel timeouts)
    let siteUrls = await getSitemapUrls(SITEMAP_URL);
    siteUrls = [...new Set([PHYSICS_10_HUB, MATH_10_HUB, PHYSICS_9_HUB, MATH_9_HUB, ...siteUrls])].slice(0, 30);

    async function fetchPagesInBatches(urls, batchSize = 10) {
      const results = [];
      for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(fetchPage));
        results.push(...batchResults.filter(Boolean));
        if (results.length >= 15) break;
      }
      return results;
    }

    const pages = await fetchPagesInBatches(siteUrls, 10);

    // ============================================================
    // SCORING & CONTEXT SELECTION
    // ============================================================
    function scorePage(page) {
      const title = normalize(page.title);
      const content = normalize(page.content);
      const url = normalize(page.url);
      let score = 0;

      if (detectedGrade === 10) {
        if (url.includes("10th") || title.includes("10th class")) score += 100;
        if (url.includes("9th") || title.includes("9th class")) score -= 80;
      } else if (detectedGrade === 9) {
        if (url.includes("9th") || title.includes("9th class")) score += 100;
        if (url.includes("10th") || title.includes("10th class")) score -= 80;
      }

      if (detectedSubject === "physics") {
        if (url.includes("physics")) score += 80;
        if (url.includes("math") || url.includes("mathematics")) score -= 100;
      } else if (detectedSubject === "mathematics") {
        if (url.includes("math") || url.includes("mathematics")) score += 80;
        if (url.includes("physics")) score -= 100;
      }

      if (detectedChapter && detectedSubject === "physics" && detectedGrade === 10) {
        const chText = `chapter ${detectedChapter}`;
        if (url.includes(`chapter${detectedChapter}`) || url.includes(`chapter-${detectedChapter}`)) score += 300;
        if (title.includes(chText)) score += 300;
        if (content.includes(chText)) score += 150;
      }

      for (const keyword of questionKeywords) {
        if (title.includes(keyword)) score += 20;
        if (content.includes(keyword)) score += 5;
      }

      return score;
    }

    const rankedPages = pages
      .map(page => ({ ...page, score: scorePage(page) }))
      .sort((a, b) => b.score - a.score);

    function extractRelevantContent(page) {
      const lines = page.content.split(/\n+/).map(l => l.trim()).filter(l => l.length > 15);
      const scoredLines = lines.map(line => {
        const n = normalize(line);
        let score = 0;
        if (questionNormalized.length >= 8 && n.includes(questionNormalized)) score += 100;
        for (const kw of questionKeywords) {
          if (n.includes(kw)) score += 10;
        }
        return { line, score };
      });

      scoredLines.sort((a, b) => b.score - a.score);
      const selected = scoredLines.filter(item => item.score > 0).slice(0, 8).map(item => item.line);
      return selected.length > 0 ? selected.join("\n") : page.content.substring(0, 1500);
    }

    // Selecting top 3 matched sources
    const relevantPages = rankedPages
      .filter(page => page.score > 0)
      .slice(0, 3);

    const contextText = relevantPages.length > 0
      ? relevantPages.map(p => `SOURCE (${p.url}):\n${extractRelevantContent(p)}`).join("\n\n---\n\n")
      : "No explicit context match found on site. Use general academic knowledge aligned with Punjab/Matric curriculum.";

    // ============================================================
    // CALL GEMINI API
    // ============================================================
    const systemInstruction = `You are the official AI Academic Assistant for Hira Academy (${SITE_URL}).
Answer questions accurately based on the Matriculation (Class 9 & 10) curriculum.
Use the provided website context where applicable to provide structured, clear answers.`;

    const geminiPayload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Context from Hira Academy:\n${contextText}\n\nUser Question: ${question}`
            }
          ]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      }
    };

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload)
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      return res.status(geminiResponse.status).json({ error: "Gemini API error", details: errText });
    }

    const geminiData = await geminiResponse.json();
    const answer = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to generate response.";

    return res.status(200).json({
      answer,
      meta: {
        detectedGrade,
        detectedSubject,
        detectedChapter,
        sourcesUsed: relevantPages.map(p => p.url)
      }
    });

  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: "Internal server error.", details: error.message });
  }
}
