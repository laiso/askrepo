import { assertEquals } from "jsr:@std/assert";
import { getAIResponse } from "../src/vercel_ai_sdk.ts";

Deno.test("test_vercel_ai_sdk_openai", async () => {
  const apiKey = "test_api_key";
  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" },
  ];
  const model = "gpt-3.5-turbo";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    _url: URL | RequestInfo,
    _options?: RequestInit,
  ) => {
    const mockResponseData = {
      choices: [
        {
          message: {
            content: "Mocked OpenAI response",
          },
        },
      ],
    };

    await new Promise((resolve) => setTimeout(resolve, 0));

    return new Response(JSON.stringify(mockResponseData), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  };

  try {
    let resultStr = "";
    for await (const chunk of getAIResponse(apiKey, messages, model, false)) {
      resultStr += chunk;
    }
    assertEquals(
      resultStr,
      "Mocked OpenAI response",
      "Expected response to match the mocked content",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("test_vercel_ai_sdk_google", async () => {
  const apiKey = "test_api_key";
  const messages = [
    { role: "user", content: "Hello!" },
  ];
  const model = "gemini-2.0-flash";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    _url: URL | RequestInfo,
    _options?: RequestInit,
  ) => {
    const mockResponseData = {
      choices: [
        {
          message: {
            content: "Mocked Google AI response",
          },
        },
      ],
    };

    await new Promise((resolve) => setTimeout(resolve, 0));

    return new Response(JSON.stringify(mockResponseData), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  };

  try {
    let resultStr = "";
    for await (const chunk of getAIResponse(apiKey, messages, model, false)) {
      resultStr += chunk;
    }
    assertEquals(
      resultStr,
      "Mocked Google AI response",
      "Expected response to match the mocked content",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
