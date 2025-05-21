/**
 * Represents a single message in a conversation with the Google API.
 */
interface GoogleApiMessage {
  /** The role of the message sender (e.g., "user", "system", "assistant"). */
  role: string;
  /** The text content of the message. */
  content: string;
}

/**
 * Represents the structure of a (streaming) response chunk from the Google API.
 * This is particularly relevant for parsing server-sent events.
 */
interface GoogleApiResponse {
  /** A unique identifier for the response chunk. */
  id: string;
  /** The type of object, typically related to chat completions. */
  object: string;
  /**
   * An array of choices, usually containing one choice for streaming responses.
   * Each choice represents a possible continuation or part of the response.
   */
  choices: Array<{
    /** The index of the choice in the list of choices. */
    index: number;
    /**
     * The delta, representing the incremental change in the response.
     * For streaming, this often contains a piece of the content.
     */
    delta: {
      /** The actual text content of the response chunk. Present if the chunk contains content. */
      content?: string;
      /** Contains refusal information if the request was refused. */
      refusal?: string | Record<string, unknown>;
      /** The role associated with this part of the response, if applicable. */
      role?: string;
    };
    /**
     * The reason why the API finished generating the response for this choice.
     * Null if the response is still ongoing, "stop" if completed, or other reasons.
     */
    finish_reason: string | null;
  }>;
}

/**
 * Defines the options required to make a request to the Google API.
 */
interface GoogleApiOptions {
  /** The API key for authentication. */
  apiKey: string;
  /** An array of `GoogleApiMessage` objects representing the conversation history. */
  messages: GoogleApiMessage[];
  /** The specific model to use for the API request. */
  model: string;
  /** Whether to stream the response or receive it all at once. */
  stream: boolean;
  /** The base URL of the Google API endpoint. */
  baseUrl: string;
}

/**
 * Asynchronously fetches data from the Google API, either as a stream or a single response,
 * and yields the processed content chunks.
 * This function orchestrates the API call and the subsequent processing of the response.
 *
 * @param apiKey The API key for the Google API.
 * @param messages An array of messages forming the conversation history.
 * @param model The model to be used for the API request.
 * @param stream If true, the response will be processed as a stream; otherwise, as a single JSON object.
 * @param baseUrl The base URL for the Google API.
 * @returns An asynchronous generator that yields strings, where each string is a chunk of content from the API response.
 * @throws An error if the API request fails or if response processing encounters an issue.
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
 * Performs the actual HTTP POST request to the Google API.
 * It constructs the request body and headers, including the API key for authorization.
 *
 * @param options The `GoogleApiOptions` containing all necessary parameters for the API call.
 * @returns A promise that resolves to the raw `Response` object from the fetch call.
 * @throws An error if the API returns a non-ok HTTP status (e.g., 4xx or 5xx errors),
 *         including any details provided in the API error response.
 */
async function fetchFromGoogleApi(
  options: GoogleApiOptions,
): Promise<Response> {
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
 * Processes a streaming HTTP response from the Google API.
 * It reads the response body chunk by chunk, decodes it, and splits it into lines.
 * Each line is then processed individually to extract content.
 * Incomplete lines at the end of chunks are buffered and prepended to the next chunk.
 *
 * @param response The raw HTTP `Response` object obtained from `fetchFromGoogleApi`.
 * @returns An asynchronous generator that yields processed content strings from the stream.
 * @throws An error if the response body is not available or if an error occurs during stream processing.
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
 * Processes a non-streaming HTTP response from the Google API.
 * It expects the response to be a single JSON object, parses it,
 * and extracts the message content from the first choice.
 *
 * @param response The raw HTTP `Response` object obtained from `fetchFromGoogleApi`.
 * @returns An asynchronous generator that yields a single string: the complete message content,
 *          or nothing if the content cannot be extracted.
 * @throws An error if parsing the JSON response fails or if the response structure is unexpected.
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
 * Processes a single line of data from a Google API stream, typically formatted as a Server-Sent Event (SSE).
 * It handles special SSE messages like "data: [DONE]" and extracts content from "data: " lines.
 * Other lines are returned as is, though typically these are not expected in Google API streams.
 *
 * @param line A single line of text from the API's streaming response.
 * @returns The extracted content string if the line is a data event,
 *          an empty string for the "[DONE]" message or empty lines,
 *          or the original line if it's not a recognized SSE format.
 */
function processSingleLine(line: string): string {
  if (line === "" || line === "data: [DONE]") {
    return ""; // End of stream signal or empty line
  }
  if (line.startsWith("data: ")) {
    // Extract JSON string from "data: <json_string>"
    const jsonStr = line.substring("data: ".length).trim();
    return extractContentFromJsonString(jsonStr);
  }
  // Return the line itself if it's not in the "data: " format (unexpected for typical Google API streams)
  return line;
}

/**
 * Parses a JSON string (expected to conform to `GoogleApiResponse`) and extracts the content.
 * This is typically used for individual chunks in a streaming response.
 *
 * @param jsonStr The JSON string to parse, usually from a "data: " line in an SSE stream.
 * @returns The extracted content string from `choices[0].delta.content`,
 *          or an empty string if parsing fails, the structure is unexpected,
 *          or if `finish_reason` is "stop".
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
    return ""; // Return empty string on error
  }
}
