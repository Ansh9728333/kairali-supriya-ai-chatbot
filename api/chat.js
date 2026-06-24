import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT_ID = "pmpt_6a3a2855a1e88190a5d9e64984715e6e09aada6e70b6a566";
const PROMPT_VERSION = "4";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY missing in Vercel Environment Variables." });

    const { message, previousResponseId } = req.body || {};
    if (!message || typeof message !== "string") return res.status(400).json({ error: "message is required" });

    const payload = {
      prompt: { id: PROMPT_ID, version: PROMPT_VERSION },
      input: message,
      store: true
    };

    if (previousResponseId) payload.previous_response_id = previousResponseId;

    const vectorStoreIds = (process.env.KAIRALI_VECTOR_STORE_ID || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (vectorStoreIds.length > 0) {
      payload.tools = [
        {
          type: "file_search",
          vector_store_ids: vectorStoreIds,
        },
      ];
    }

    const response = await openai.responses.create(payload);
    return res.status(200).json({ reply: response.output_text, responseId: response.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "OpenAI response generate nahi ho paya", details: error.message });
  }
}
