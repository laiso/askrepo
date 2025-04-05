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

export async function* getGoogleApiData(
  apiKey: string,
  messages: GoogleApiMessage[],
  model: string,
  stream: boolean,
  baseUrl: string,
): AsyncGenerator<string, void, unknown> {
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

  if (stream) {
    if (!response.body) {
      throw new Error("No response body available");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let partial = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      partial += decoder.decode(value, { stream: true });
      const lines = partial.split("\n");
      partial = lines.pop()!; // Save incomplete final line
      for (const line of lines) {
        if (line.trim() !== "") {
          const content = processSingleLine(line.trim());
          if (content !== "") {
            yield content;
          }
        }
      }
    }
    if (partial) {
      const content = processSingleLine(partial.trim());
      if (content !== "") yield content;
    }
  } else {
    const json = await response.json();
    const message = json.choices?.[0]?.message || null;
    if (message && message.content) {
      yield message.content;
    }
  }
}

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
  } catch (e) {
    console.error("Error parsing JSON: ", e);
    return jsonStr;
  }
}
