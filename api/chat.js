import OpenAI from "openai";

const PROMPT_ID = "pmpt_6a3a2855a1e88190a5d9e64984715e6e09aada6e70b6a566";
const PROMPT_VERSION = "5";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeMobile(raw) {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(-10);
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  return "";
}

function isLikelyName(value) {
  const name = cleanText(value).replace(/\s+/g, " ");
  if (!name || name.length < 2 || name.length > 40) return false;
  if (/\d/.test(name)) return false;
  const badWords = [
    "book", "appointment", "therapy", "abhyangam", "massage", "pain", "back",
    "knee", "neck", "stress", "anxiety", "hello", "hi", "namaste", "mobile",
    "number", "phone", "location", "delhi", "gurgaon", "noida", "jaipur", "chandigarh"
  ];
  const lower = name.toLowerCase();
  return !badWords.some((word) => lower.includes(word));
}

function extractLeadFromText(text) {
  const message = cleanText(text);
  const lower = message.toLowerCase();
  const result = {};

  const phoneMatch = message.match(/(?:\+?91[\s-]?)?[6-9]\d{9}\b/);
  if (phoneMatch) {
    const mobile = normalizeMobile(phoneMatch[0]);
    if (mobile) result.mobile = mobile;
  }

  const namePatterns = [
    /(?:my name is|name is|this is|i am|i'm)\s+([a-zA-Z][a-zA-Z .]{1,40})/i,
    /(?:mera naam|mera name|naam)\s+([a-zA-Z][a-zA-Z .]{1,40})/i,
    /(?:name)\s*[:\-]\s*([a-zA-Z][a-zA-Z .]{1,40})/i
  ];

  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match && isLikelyName(match[1])) {
      result.name = cleanText(match[1]).replace(/[,.|]+$/g, "");
      break;
    }
  }

  if (!result.name && result.mobile && phoneMatch) {
    const beforeNumber = message.split(phoneMatch[0])[0].replace(/[,|:-]/g, " ").trim();
    const possibleName = beforeNumber.split(/\s+/).slice(-3).join(" ");
    if (isLikelyName(possibleName)) result.name = possibleName;
  }

  const locations = [
    "Delhi", "Gurgaon", "Gurugram", "Noida", "Jaipur", "Chandigarh",
    "Mehrauli", "Siri Fort", "Kirti Nagar"
  ];
  for (const loc of locations) {
    if (lower.includes(loc.toLowerCase())) {
      result.preferred_location = loc;
      break;
    }
  }

  const concernMap = [
    ["back pain", "Back pain"],
    ["backpain", "Back pain"],
    ["knee pain", "Knee pain"],
    ["joint pain", "Joint pain"],
    ["neck pain", "Neck pain"],
    ["stress", "Stress"],
    ["anxiety", "Anxiety"],
    ["insomnia", "Insomnia"],
    ["digestion", "Digestion issue"],
    ["panchakarma", "Panchakarma"],
    ["abhyangam", "Abhyangam Therapy"],
    ["massage", "Massage / Therapy"],
    ["therapy", "Therapy inquiry"],
    ["appointment", "Appointment inquiry"],
    ["consultation", "Doctor consultation"]
  ];

  for (const [needle, label] of concernMap) {
    if (lower.includes(needle)) {
      result.concern_therapy = label;
      break;
    }
  }

  const dateTimeMatch = message.match(/\b(today|tomorrow|morning|afternoon|evening|night|\d{1,2}[:.]\d{2}\s?(?:am|pm)?|\d{1,2}\s?(?:am|pm))\b/i);
  if (dateTimeMatch) result.preferred_datetime = dateTimeMatch[0];

  return result;
}

function mergeLeadState(base = {}, patch = {}) {
  const merged = { ...base };
  const fields = [
    "name",
    "mobile",
    "email",
    "preferred_location",
    "concern_therapy",
    "preferred_datetime",
    "country",
    "source"
  ];
  for (const field of fields) {
    if (!merged[field] && patch[field]) merged[field] = patch[field];
  }
  return merged;
}

function getVerifiedQuickFacts(message) {
  const lower = String(message || "").toLowerCase();
  const asksOffer = lower.includes("offer") || lower.includes("discount") || lower.includes("coupon") || lower.includes("off25");
  const asksAbhyangam = lower.includes("abhyangam") || lower.includes("abhayngam") || lower.includes("abhyanga") || lower.includes("abhayangam");
  const asksPrice = lower.includes("price") || lower.includes("rate") || lower.includes("cost") || lower.includes("charge") || lower.includes("charges") || lower.includes("pricing");

  if (!asksOffer && !asksPrice && !asksAbhyangam) return "";

  return `
Verified customer-facing facts available for pricing/offer queries:
- Current limited-time website offer: Book online and get a 25% discount on Abhyangam. Coupon code: OFF25.
- Ayurvedic Doctor Consultation: ₹1200.
- Abhyangam Treatment 1: ₹2300.
- Abhyangam Treatment 2: ₹3200.
Customer-facing response rules:
- If the user asks about offer/discount/coupon, mention the 25% Abhyangam offer and coupon OFF25.
- If the user asks Abhyangam price, mention Abhyangam Treatment 1 ₹2300 and Abhyangam Treatment 2 ₹3200.
- Mention that final applicability, centre availability, and final slot confirmation will be confirmed by the Kairali team.
- Do not say "uploaded content", "vector store", "knowledge base", or "not available in my current knowledge base".
- Do not force Name/Mobile for a simple price/offer query. Give the information first, then only a soft optional CTA.`;
}

async function saveLeadToGoogleSheet({ leadState, sessionId, userMessage, assistantReply }) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) return { attempted: false, saved: false, reason: "GOOGLE_SHEETS_WEBHOOK_URL missing" };

  const payload = {
    secret: process.env.GOOGLE_SHEETS_WEBHOOK_SECRET || "",
    session_id: sessionId || "",
    name: leadState.name || "",
    mobile: leadState.mobile || "",
    email: leadState.email || "",
    country: leadState.country || "",
    source: leadState.source || "Website Chatbot",
    concern_therapy: leadState.concern_therapy || "",
    preferred_location: leadState.preferred_location || "",
    preferred_datetime: leadState.preferred_datetime || "",
    last_user_message: userMessage || "",
    last_assistant_reply: assistantReply || "",
    lead_stage: leadState.name && leadState.mobile ? "Name+Mobile Captured" : "Open",
    raw_payload: JSON.stringify(leadState || {})
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    return {
      attempted: true,
      saved: response.ok,
      status: response.status,
      response: text.slice(0, 500)
    };
  } catch (error) {
    console.error("Google Sheet save error:", error);
    return {
      attempted: true,
      saved: false,
      reason: error?.message || "Google Sheet webhook failed"
    };
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        message: "Kairali Supriya API is live. Use POST to chat.",
        promptVersion: PROMPT_VERSION,
        googleSheetEnabled: Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL),
        vectorStoreEnabled: Boolean(process.env.KAIRALI_VECTOR_STORE_ID)
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

    const { message, previousResponseId, leadState: clientLeadState, sessionId } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const extractedLead = extractLeadFromText(message);
    let leadState = mergeLeadState(clientLeadState || {}, extractedLead);
    if (!leadState.source) leadState.source = "Website Chatbot";

    const openai = new OpenAI({ apiKey });
    const verifiedQuickFacts = getVerifiedQuickFacts(message);

    const formattedInput = `User message: ${message}

Known lead details collected so far:
Name: ${leadState.name || ""}
Mobile number: ${leadState.mobile || ""}
Preferred location: ${leadState.preferred_location || ""}
Concern/Therapy: ${leadState.concern_therapy || ""}
Preferred date/time: ${leadState.preferred_datetime || ""}

${verifiedQuickFacts}

Output formatting rule:
- Keep every reply short, clean, and customer-friendly.
- When answering therapy, treatment, offer, price, or service questions, use this structure:
  **Service / Therapy Name** is a short 1-line explanation.
  - **Duration:** mention duration only if verified
  - **Price:** mention price only if verified
  - **Offer:** mention offer only if verified
- Use markdown bold for important useful words such as therapy name, service name, duration label, price label, offer label, **Name**, and **Mobile number**.
- Use 2-4 bullets maximum.
- Do not force the user to share details for simple price, offer, or details questions.
- If user asks "more details", give 2-4 short bullets only.
- After answering, use a soft optional CTA only: "If you would like our team to guide you further, you may share your **Name** and **Mobile number**."
- Do not repeat the same lead capture request again and again.
- Ask for **Name** and **Mobile number** only when the user clearly wants booking, callback, appointment, or team assistance.
- Never ask for email unless the user voluntarily wants to share it.
- Never show file citation markers or internal source IDs such as [turn1file4], 【...】, uploaded content, vector store, or knowledge base.`;

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
    const assistantReply = response.output_text || "Sorry, reply generate nahi ho paya.";

    let sheetResult = { attempted: false, saved: false };
    if (leadState.name && leadState.mobile) {
      sheetResult = await saveLeadToGoogleSheet({
        leadState,
        sessionId,
        userMessage: message,
        assistantReply
      });
    }

    return res.status(200).json({
      reply: assistantReply,
      responseId: response.id,
      leadState,
      sheetSaved: Boolean(sheetResult.saved),
      sheetResult
    });
  } catch (error) {
    console.error("Kairali API error:", error);
    return res.status(500).json({
      error: "OpenAI response generate nahi ho paya",
      details: error?.message || "Unknown server error",
    });
  }
}
