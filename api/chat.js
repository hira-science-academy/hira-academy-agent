export default async function handler(req, res) {
  const SITE = "hiraacademy.com.pk";

  // =========================
  // CORS
  // =========================
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
    // =========================
    // GEMINI API KEY
    // =========================
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing on Vercel."
      });
    }

    // =========================
    // REQUEST BODY
    // =========================
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
        error: "No question provided."
      });
    }

    console.log("HIRA QUESTION:", question);

    // =========================
    // GEMINI SYSTEM INSTRUCTION
    // =========================
    const systemInstruction = `
You are the official Hira Academy AI Assistant.

Your job is to answer students' questions using the CURRENT content
available on the official Hira Academy website:

https://hiraacademy.com.pk/

VERY IMPORTANT RULES:

1. SEARCH THE OFFICIAL HIRA ACADEMY WEBSITE FIRST.

2. Your website restriction is:
   site:hiraacademy.com.pk

3. The student may ask about ANY SUBJECT available on Hira Academy.
   This includes Mathematics, Physics, Chemistry, Biology,
   Pakistan Studies, Islamiat and other Class 9/10 educational
   material available on the website.

4. Find the MOST SPECIFIC Hira Academy page that contains the
   answer.

5. Do NOT choose the homepage simply because it is from
   Hira Academy.

6. Do NOT use an unrelated Hira Academy page.

7. If an exact question exists on a Hira Academy page, use that
   question and answer.

8. If the question is about an exercise, prefer the exact
   exercise page.

9. If it is a short question, prefer the relevant Short Questions
   page.

10. If it is a CRQ, prefer the Constructed Response page.

11. If it is a long/comprehensive question, prefer the Long Questions
    page.

12. If it is an MCQ, prefer the relevant MCQ page.

13. If the question is a general concept, use the relevant chapter
    page or definitions page.

14. ANSWERS MUST BE SHORT.
    Normally answer in 1-4 sentences.

15. Do NOT give a long lecture or unnecessary background.

16. Do NOT invent information.

17. Do NOT combine unrelated Hira Academy pages.

18. Do NOT use old model knowledge when the answer can be found
    on Hira Academy.

19. For Mathematics, preserve formulas and mathematical notation.

20. For Physics and other subjects, remain faithful to the wording
    and information on the Hira Academy page.

21. After answering, provide the EXACT Hira Academy page used
    for the answer.

22. The source format must be:

**Source: Hira Academy**
[Open the relevant Hira Academy page](ACTUAL_PAGE_URL)

23. ACTUAL_PAGE_URL must be the page that contains the relevant
    information. NEVER invent a URL.

24. If the answer genuinely cannot be found anywhere on
    hiraacademy.com.pk, say:

"I couldn't find this information in the current Hira Academy material."

25. If Hira Academy contains the answer, DO NOT say that you
    couldn't find it.

26. Never provide sources from another website.

27. Answer the student's question directly. Do not describe your
    search process.

STUDENT QUESTION:
${question}
`;

    // =========================
    // GEMINI + GOOGLE SEARCH
    // =========================
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: systemInstruction
              }
            ]
          },

          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `
Search the official Hira Academy website for the answer.

Search restriction:
site:${SITE}

Student question:
${question}

Find the most relevant Hira Academy page and answer briefly.
`
                }
              ]
            }
          ],

          // Enable Google Search grounding
          tools: [
            {
              google_search: {}
            }
          ],

          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 900
          }
        })
      }
    );

    const data = await response.json();

    console.log(
      "GEMINI STATUS:",
      response.status
    );

    // =========================
    // GEMINI ERROR
    // =========================
    if (!response.ok) {
      console.error(
        "GEMINI ERROR:",
        data
      );

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini API error."
      });
    }

    // =========================
    // GET MODEL ANSWER
    // =========================
    let reply =
      data?.candidates?.[0]
        ?.content
        ?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!reply) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material."
      });
    }

    // =========================
    // CLEAN DUPLICATE SOURCE
    // =========================
    reply = reply
      .replace(
        /\*\*Source:\s*Hira Academy\*\*[\s\S]*$/i,
        ""
      )
      .trim();

    // Remove accidental Hira links generated in body
    reply = reply.replace(
      /https?:\/\/hiraacademy\.com\.pk\/[^\s)]+/gi,
      ""
    );

    // =========================
    // EXTRACT SEARCH SOURCES
    // =========================
    const groundingChunks =
      data?.candidates?.[0]
        ?.groundingMetadata
        ?.groundingChunks || [];

    const hiraSources = [];

    for (const chunk of groundingChunks) {
      const uri =
        chunk?.web?.uri;

      if (
        uri &&
        uri.includes("hiraacademy.com.pk")
      ) {
        hiraSources.push(uri);
      }
    }

    const uniqueSources = [
      ...new Set(hiraSources)
    ];

    // =========================
    // FIND BEST SOURCE
    // =========================
    let sourceUrl =
      uniqueSources[0] || null;

    // Prefer a specific page over homepage
    const specificSource =
      uniqueSources.find(url => {
        try {
          const parsed = new URL(url);

          return (
            parsed.pathname !== "/" &&
            parsed.pathname.length > 1
          );
        } catch {
          return false;
        }
      });

    if (specificSource) {
      sourceUrl = specificSource;
    }

    // =========================
    // SOURCE RESPONSE
    // =========================
    if (sourceUrl) {
      reply +=
        `\n\n---\n**Source: Hira Academy**\n[Open the relevant Hira Academy page](${sourceUrl})`;
    } else {
      reply +=
        `\n\n---\n**Source: Hira Academy**\n[Visit Hira Academy](https://hiraacademy.com.pk/)`;
    }

    // =========================
    // FINAL RESPONSE
    // =========================
    return res.status(200).json({
      reply,
      sourceUrl
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
