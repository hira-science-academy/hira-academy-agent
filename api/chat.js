import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;

    const systemInstruction = `You are the official AI teaching assistant for Hira Science Academy, specializing in Punjab Board Class 9 and 10 Physics and Mathematics. 
    Your goal is to help students learn, not just give them the final answers. 
    When a student asks a question, explain the core concept, then actively encourage them to check the academy's official 'solved-exercise', 'notes', and 'MCQ' pages for full breakdowns.`;

    const formattedHistory = messages.slice(0, -1).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));
    
    const latestMessage = messages[messages.length - 1].content;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [...formattedHistory, { role: 'user', parts: [{ text: latestMessage }] }],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    res.status(200).json({ reply: response.text });

  } catch (error) {
    console.error("Agent Error:", error);
    res.status(500).json({ error: 'The academy assistant is currently updating. Please check our notes pages directly.' });
  }
}
