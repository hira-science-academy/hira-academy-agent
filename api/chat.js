```javascript
export default async function handler(req, res) {
  const SITE = "hiraacademy.com.pk";
  const HOME = "https://hiraacademy.com.pk/";

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
    // API KEY
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
        message =>
          message &&
          message.role === "user" &&
          typeof message.content === "string"
      );

    const question = latestUserMessage?.content?.trim();

    if (!question) {
      return res.status(400).json({
        error: "No question provided."
      });
    }

    console.log("=================================");
    console.log("HIRA ACADEMY QUESTION:");
    console.log(question);
    console.log("=================================");

    // =========================
    // PROMPT
    // =========================
    const prompt = `
You are the official AI assistant of Hira Science Academy.

WEBSITE:
https://${SITE}/

STUDENT QUESTION:
${question}

YOUR TASK:

Find the answer ONLY from the official Hira Academy website.

MANDATORY SEARCH:

Search Google for:

site:${SITE} ${question}

You MUST search the Hira Academy website before answering.

IMPORTANT:

- Use ONLY pages from ${SITE}.
- Do NOT use other educational websites.
- Do NOT answer from general model knowledge if the answer can be
  found on Hira Academy.
- Find the page that actually contains information relevant to
  the student's question.
- Do not select the homepage unless the homepage itself contains
  the answer.
- Do not select an unrelated chapter page.
- Prefer the most specific page.

PAGE PRIORITY:

1. Exact question / answer page
2. Exercise page
3. Short Questions page
4. CRQs page
5. Long Questions page
6. MCQs page
7. Relevant chapter page
8. Definitions page
9. Other relevant Hira Academy page

ANSWER STYLE:

- Give the answer first.
- Keep it SHORT.
- Normally 1–4 sentences.
- Do not give unnecessary explanation.
- Preserve formulas and important scientific terms.
- For exam questions, give an exam-friendly answer.
- Do not invent information.
- Do not combine unrelated pages.

SOURCE:

You MUST identify the exact Hira Academy page that supports
your answer.

Return your answer in EXACTLY this format:

ANSWER:
<short answer>

SOURCE_URL:
<exact Hira Academy URL>

If the information genuinely cannot be found anywhere on
${SITE}, return:

ANSWER:
I couldn't find this information in the current Hira Academy material.

SOURCE_URL:
NONE
`;

    // =========================
    // GEMINI REQUEST
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
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],

          tools: [
            {
              google_search: {}
            }
          ],

          generationConfig: {
            maxOutputTokens: 800
          }
        })
      }
    );

    const data = await response.json();

    console.log("GEMINI STATUS:", response.status);

    // =========================
    // GEMINI ERROR
    // =========================
    if (!response.ok) {
      console.error(
        "GEMINI ERROR:",
        JSON.stringify(data, null, 2)
      );

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini API error."
      });
    }

    // =========================
    // GET TEXT
    // =========================
    const rawReply =
      data?.candidates?.[0]
        ?.content
        ?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    console.log("GEMINI RAW RESPONSE:");
    console.log(rawReply);

    if (!rawReply) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material."
      });
    }

    // =========================
    // EXTRACT ANSWER
    // =========================
    let answer = "";
    let sourceUrl = "";

    const answerMatch = rawReply.match(
      /ANSWER:\s*([\s\S]*?)(?=\n\s*SOURCE_URL:)/i
    );

    const sourceMatch = rawReply.match(
      /SOURCE_URL:\s*(\S+)/i
    );

    if (answerMatch) {
      answer = answerMatch[1].trim();
    }

    if (sourceMatch) {
      sourceUrl = sourceMatch[1].trim();
    }

    // =========================
    // CLEAN SOURCE URL
    // =========================
    sourceUrl = sourceUrl
      .replace(/[)\],.;]+$/, "")
      .trim();

    // =========================
    // VALIDATE SOURCE
    // =========================
    let validSource = false;

    if (sourceUrl && sourceUrl !== "NONE") {
      try {
        const parsed = new URL(sourceUrl);

        validSource =
          parsed.protocol === "https:" &&
          (
            parsed.hostname === SITE ||
            parsed.hostname === `www.${SITE}`
          );
      } catch {
        validSource = false;
      }
    }

    // =========================
    // FALLBACK TO GROUNDING
    // =========================
    if (!validSource) {
      const groundingChunks =
        data?.candidates?.[0]
          ?.groundingMetadata
          ?.groundingChunks || [];

      for (const chunk of groundingChunks) {
        const uri = chunk?.web?.uri;

        if (!uri) continue;

        try {
          const parsed = new URL(uri);

          if (
            parsed.hostname === SITE ||
            parsed.hostname === `www.${SITE}`
          ) {
            sourceUrl = uri;
            validSource = true;
            break;
          }
        } catch {
          // Ignore invalid URLs
        }
      }
    }

    // =========================
    // IF ANSWER IS MISSING
    // =========================
    if (!answer) {
      answer = rawReply
        .replace(/SOURCE_URL:[\s\S]*$/i, "")
        .replace(/^ANSWER:\s*/i, "")
        .trim();
    }

    // =========================
    // REMOVE ANY URL FROM ANSWER
    // =========================
    answer = answer.replace(
      /https?:\/\/(?:www\.)?hiraacademy\.com\.pk\/\S*/gi,
      ""
    ).trim();

    // =========================
    // WEBSITE NOT FOUND
    // =========================
    const notFound =
      /couldn't find this information/i.test(answer) ||
      /could not find this information/i.test(answer);

    if (notFound && !validSource) {
      return res.status(200).json({
        reply:
          "I couldn't find this information in the current Hira Academy material.",
        sourceUrl: null
      });
    }

    // =========================
    // FINAL SOURCE
    // =========================
    if (!validSource) {
      console.warn(
        "NO VALID HIRA SOURCE FOUND"
      );

      return res.status(200).json({
        reply:
          answer ||
          "I couldn't find this information in the current Hira Academy material.",
        sourceUrl: null
      });
    }

    // =========================
    // FINAL RESPONSE
    // =========================
    const reply =
      `${answer}\n\n` +
      `**Source: Hira Academy**\n` +
      `[Open the relevant Hira Academy page](${sourceUrl})`;

    console.log("FINAL SOURCE:", sourceUrl);

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
        error?.message ||
        "Internal Server Error"
    });
  }
}
```
