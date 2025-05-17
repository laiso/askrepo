interface GoogleApiMessage {
  role: string;
  content: string;
}

interface GoogleApiResponse {
  id: string;
  object: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      refusal?: string | Record<string, unknown>;
      role?: string;
    };
    finish_reason: string | null;
  }>;
}

interface GoogleApiOptions {
  apiKey: string;
  messages: GoogleApiMessage[];
  model: string;
  stream: boolean;
  baseUrl: string;
}

/**
 * Process Google API response to extract content
 * @param data API response data
 * @returns Extracted content
 */
export function parseGoogleApiResponse(data: string): string {
  let result = "";
  const lines = data.split("\n");
  for (let line of lines) {
    line = line.trim();
    if (line === "" || line === "data: [DONE]") {
      continue;
    }
    if (line.startsWith("data: ")) {
      const jsonStr = line.substring("data: ".length).trim();
      const content = extractContentFromJsonString(jsonStr);
      if (content !== "") {
        result += content;
      }
    } else {
      result += line;
    }
  }
  return result;
}

/**
 * Generator method to fetch data from Google API
 */
export async function* getGoogleApiData(
  apiKey: string,
  messages: GoogleApiMessage[],
  model: string,
  stream: boolean,
  baseUrl: string,
): AsyncGenerator<string, void, unknown> {
  const options: GoogleApiOptions = {
    apiKey,
    messages,
    model,
    stream,
    baseUrl,
  };

  const response = await fetchFromGoogleApi(options);

  if (stream) {
    yield* processStreamResponse(response);
  } else {
    yield* processNonStreamResponse(response);
  }
}

/**
 * Fetch data from Google API
 */
async function fetchFromGoogleApi(options: GoogleApiOptions): Promise<Response> {
  const { apiKey, messages, model, stream, baseUrl } = options;
  
  const body = {
    model,
    messages,
    stream,
  };

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorDetails = "";
    try {
      const errorResponse = await response.json();
      errorDetails = JSON.stringify(errorResponse);
    } catch {
      errorDetails = await response.text();
    }
    throw new Error(
      `Google API error: ${response.status} ${response.statusText}${
        errorDetails ? ` - ${errorDetails}` : ""
      }`,
    );
  }

  return response;
}

/**
 * Process streaming response
 */
async function* processStreamResponse(
  response: Response,
): AsyncGenerator<string, void, unknown> {
  if (!response.body) {
    throw new Error("No response body available");
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Save incomplete final line
      
      for (const line of lines) {
        if (line.trim() !== "") {
          const content = processSingleLine(line.trim());
          if (content !== "") {
            yield content;
          }
        }
      }
    }
    
    // Process any remaining buffer
    if (buffer) {
      const content = processSingleLine(buffer.trim());
      if (content !== "") yield content;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Error processing stream response: ${errorMessage}`);
  }
}

/**
 * Process non-streaming response
 */
async function* processNonStreamResponse(
  response: Response,
): AsyncGenerator<string, void, unknown> {
  try {
    const json = await response.json();
    const message = json.choices?.[0]?.message || null;
    if (message && message.content) {
      yield message.content;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Error processing non-stream response: ${errorMessage}`);
  }
}

/**
 * Process a single line of stream data
 */
function processSingleLine(line: string): string {
  if (line === "" || line === "data: [DONE]") {
    return "";
  }
  if (line.startsWith("data: ")) {
    const jsonStr = line.substring("data: ".length).trim();
    return extractContentFromJsonString(jsonStr);
  }
  return line;
}

/**
 * Extract content from JSON string
 */
function extractContentFromJsonString(jsonStr: string): string {
  try {
    const v: GoogleApiResponse = JSON.parse(jsonStr);
    if (Array.isArray(v.choices) && v.choices.length > 0) {
      const choice = v.choices[0];
      const delta = choice.delta;
      if (choice.finish_reason === "stop") return "";
      if (delta && typeof delta === "object" && delta.content) {
        return delta.content;
      }
    }
    return "";
  } catch (error: unknown) {
    console.error("Error parsing JSON: ", error);
    return "";  // Return empty string on error
  }
}
