import { assertEquals } from "jsr:@std/assert";
import { getGoogleApiData, parseGoogleApiResponse } from "../src/google_api.ts";

Deno.test("test_parse_google_api_response", () => {
  const response =
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"こんにちは"},"finish_reason":null}]}';
  const result = parseGoogleApiResponse(response);
  assertEquals(result, "こんにちは", "Failed to extract content from response");
});

Deno.test("test_parse_google_api_response_raw", () => {
  const response = "This is a raw response";
  const result = parseGoogleApiResponse(response);
  assertEquals(
    result,
    "This is a raw response",
    "Failed to handle raw response",
  );
});

Deno.test("test_parse_google_api_response_empty", () => {
  const jsonData = "";
  const result = parseGoogleApiResponse(jsonData);
  assertEquals(result, "", "Failed to handle empty response");
});

Deno.test("test_parse_google_api_response_multiple_chunks", () => {
  const response =
    `data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"He"},"finish_reason":null}]}
  data: {"id":"chatcmpl-2","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"ll"},"finish_reason":null}]}
  data: {"id":"chatcmpl-3","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"o"},"finish_reason":null}]}
  data: {"id":"chatcmpl-4","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
  data: [DONE]`;
  const result = parseGoogleApiResponse(response);
  assertEquals(result, "Hello", "Failed to handle multiple chunks");
});

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
