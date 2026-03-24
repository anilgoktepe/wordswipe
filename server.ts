import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

app.post("/api/sentence-analysis", async (req, res) => {
  try {
    const { sentence, targetWord } = req.body;

    const prompt = `
You are an English teacher.

Analyze this sentence:
"${sentence}"

Target word: "${targetWord}"

Return JSON:
{
  "isValid": boolean,
  "feedback": "short Turkish explanation",
  "corrected": "corrected sentence",
  "better": "more natural version"
}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const text = completion.choices[0].message.content;

    res.json(JSON.parse(text!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI error" });
  }
});

const PORT = process.env.PORT || 8787;

app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});