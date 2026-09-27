import { chatgpt } from "eve/models/openai";
import { defineAgent } from 'eve';
export default defineAgent({
  model: chatgpt("gpt-5.6-luna"),
  defaultTools: false,
  tool: false,
  limits: { maxInputTokensPerSession: 100_000, maxOutputTokensPerSession: 10_000 },
});
