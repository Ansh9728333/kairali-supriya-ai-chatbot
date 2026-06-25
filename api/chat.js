import OpenAI from "openai";

const PROMPT_ID = "pmpt_6a3a2855a1e88190a5d9e64984715e6e09aada6e70b6a566";
const PROMPT_VERSION = "4";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        message: "Kairali Supriya API is live. Use POST to chat.",
        promptVersion: PROMPT_VERSION,
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey || !apiKey.startsWith("sk-")) {
      return res.status(500).json({
        error: "OPENAI_API_KEY missing or invalid in Vercel Environment Variables.",
      });
    }

    const { message, previousResponseId } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const openai = new OpenAI({ apiKey });

    const formattedInput = `User message: ${message}

Output formatting rule:
- Use markdown bold only for these lead labels: **Name**, **Mobile number**, **Number**.
- If asking for name and mobile, format like this:
  Please share:
  **Name**
  **Mobile number**
- Do not bold or special-format Preferred location, Therapy / concern, Concern, Therapy name, or Preferred date/time.
- Ask those other details in normal plain text only.
- Do not bold full paragraphs.
- Never ask for email unless the user voluntarily wants to share it.`;

    const payload = {
      prompt: {
        id: PROMPT_ID,
        version: PROMPT_VERSION,
      },
      input: formattedInput,
      store: true,
    };

    if (previousResponseId) {
      payload.previous_response_id = previousResponseId;
    }

    const vectorStoreIds = (process.env.KAIRALI_VECTOR_STORE_ID || "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.startsWith("vs_"));

    if (vectorStoreIds.length > 0) {
      payload.tools = [
        {
          type: "file_search",
          vector_store_ids: vectorStoreIds,
        },
      ];
    }

    const response = await openai.responses.create(payload);

    return res.status(200).json({
      reply: response.output_text || "Sorry, reply generate nahi ho paya.",
      responseId: response.id,
    });
  } catch (error) {
    console.error("Kairali API error:", error);

    return res.status(500).json({
      error: "OpenAI response generate nahi ho paya",
      details: error?.message || "Unknown server error",
    });
  }
}
