// server.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());

// Conversation history manager
const conversationHistory = {};
function addMessage(sessionId, role, content) {
  if (!conversationHistory[sessionId]) {
    conversationHistory[sessionId] = [];
  }
  conversationHistory[sessionId].push({ role, content });
}
function getHistory(sessionId) {
  return conversationHistory[sessionId] || [];
}


// Simple GET route
app.get("/", (req, res) => {
  res.send("AI Chatbot backend is running. Use POST /api/chat to talk to the bot.");
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute time window
  max: 5,                    // limit each IP to 5 requests per window
  message: { error: "Too many requests, please try again later." },
  statusCode: 429,           // HTTP status code when limit is exceeded
  standardHeaders: true,     // return rate limit info in headers
  legacyHeaders: false       // disable old headers
});
const SYSTEM_INSTRUCTIONS = `
Reliability Principles:
- Do not fabricate facts, URLs, API endpoints, documentation, statistics, or references.
- If information is unknown, explicitly say it is unknown.
- Clearly distinguish between known information and assumptions.
- Encourage verification when the information is important.
- Do not expose API keys, stack traces, or internal server details.
- Return simple JSON errors to the client, log detailed errors only on the server.
`;

// Chat endpoint
app.post("/api/chat",chatLimiter, async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    // Validate message
    if (typeof message !== "string") {
      return res.status(400).json({ error: "Message must be a string" });
    }

    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    if (trimmedMessage.length > 500) {
      return res.status(400).json({ error: "Message too long (max 500 characters)" });
    }

    // Validate sessionId
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "Session ID is required and must be a string" });
    }

    // Validate API key
    if (!process.env.AI_API_KEY) {
      return res.status(500).json({ error: "Server configuration error" });
    }

    // Add user message to history
    addMessage(sessionId, "user", trimmedMessage);

    // Call Gemini API (unchanged)
   const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${process.env.AI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              { text: SYSTEM_INSTRUCTIONS }, // reliability rules
              ...getHistory(sessionId).map(msg => ({ text: msg.content }))
            ]
          }
        ]
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const aiReply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiReply || aiReply.trim() === "") {
      return res.status(500).json({ error: "AI response invalid" });
    }

    // Save AI reply
    addMessage(sessionId, "assistant", aiReply);

    res.json({ reply: aiReply });

  } 
  catch (error) {
    // ✅ Log useful info for debugging (server side only)
    console.error("Error in /api/chat:", {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });

    // ✅ Send safe, simple JSON error to client
    res.status(500).json({ message: "Unable to process your request" });
  }
});



// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
