import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  // Allow your website domain to communicate with Vercel (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Respond immediately to browser preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;

    const systemInstruction = `You are the official AI teaching assistant for Hira Science Academy, specializing in Punjab Board Class 9 and 10 Physics and Mathematics. 
    Your goal is to help students learn, not just give them the final answers. 
    When a student asks a question, explain the core concept, then actively encourage them to check the academy's official 'solved-exercise', 'notes', and 'MCQ' pages for full breakdowns.`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction
    });

    const formattedHistory = messages.slice(0, -1).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    const latestMessage = messages[messages.length - 1].content;

    const chat = model.startChat({ history: formattedHistory });
    const result = await chat.sendMessage(latestMessage);

    res.status(200).json({ reply: result.response.text() });

  } catch (error) {
    console.error("Agent Error:", error);
    res.status(500).json({ error: 'The academy assistant is currently updating. Please check our notes pages directly.' });
  }
}
