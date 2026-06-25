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
      input: `User message: ${message}

Output formatting rule:
- When asking the user for missing details, format the details as separate bold lines.
- Use this style:
  Please share:
  **Name**
  **Mobile number**
  **Preferred location**
  **Therapy / concern**
  **Preferred date/time** if available
- If asking for a therapy name, write it as **Therapy name** or bold the exact therapy, for example **Abhyangam Therapy**.
- Use markdown bold for important lead detail labels: **Name**, **Mobile number**, **Number**, **Preferred location**, **Therapy name**, **Therapy / concern**, **Concern**, **Preferred date/time**.
- Do not bold full paragraphs; bold only important words or labels.
- Never ask for email unless the user voluntarily wants to share it.``,
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
