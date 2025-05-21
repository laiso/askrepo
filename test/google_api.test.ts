import { assertEquals } from "jsr:@std/assert";
import { getGoogleApiData } from "../src/google_api.ts";

Deno.test("test_get_google_api_data_non_streaming", async () => {
  const apiKey = "test_api_key";
  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" },
  ];
  const model = "test_model";
  const baseUrl = "https://example.org/post";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    _url: URL | RequestInfo,
    _options?: RequestInit,
  ) => {
    const mockResponseData = {
      choices: [
        {
          message: {
            content: "Mocked response content",
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
    for await (
      const chunk of getGoogleApiData(apiKey, messages, model, false, baseUrl)
    ) {
      resultStr += chunk;
    }
    assertEquals(
      resultStr,
      "Mocked response content",
      "Expected response to match the mocked content",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
