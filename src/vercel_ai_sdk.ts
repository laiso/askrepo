import { ChatCompletionCreateParams } from "npm:openai/resources/index.js";
import {
  AnthropicMessages,
  GoogleGenerativeAI,
  MistralClient,
  OpenAI,
  StreamPart,
} from "npm:ai";
import {
  detectProviderFromModel,
  getApiKeyFromProvider,
  ModelProvider,
  PROVIDERS,
} from "./config/models.ts";

interface Message {
  role: string;
  content: string;
}

/**
 * Vercel AI SDKを使用して複数のプロバイダーのAI APIと通信する
 */
export async function* getAIResponse(
  apiKey: string,
  messages: Message[],
  model: string,
  stream: boolean,
  baseUrl?: string,
): AsyncGenerator<string, void, unknown> {
  const provider = detectProviderFromModel(model);
  if (!provider) {
    throw new Error(`Unknown model: ${model}`);
  }

  const actualApiKey = apiKey || getApiKeyFromProvider(provider);

  try {
    switch (provider.name) {
      case PROVIDERS.GOOGLE.name:
        yield* streamGoogleAI(actualApiKey, messages, model, stream, baseUrl);
        break;
      case PROVIDERS.OPENAI.name:
        yield* streamOpenAI(actualApiKey, messages, model, stream, baseUrl);
        break;
      case PROVIDERS.ANTHROPIC.name:
        yield* streamAnthropic(actualApiKey, messages, model, stream);
        break;
      case PROVIDERS.MISTRAL.name:
        yield* streamMistral(actualApiKey, messages, model, stream);
        break;
      default:
        throw new Error(`Provider ${provider.name} is not supported`);
    }
  } catch (e) {
    console.error(`Error calling ${provider.name} API:`, e);
    throw e;
  }
}

/**
 * Google AIと通信するためのジェネレーター関数
 */
async function* streamGoogleAI(
  apiKey: string,
  messages: Message[],
  model: string,
  stream: boolean,
  baseUrl?: string,
): AsyncGenerator<string, void, unknown> {
  const googleAI = new GoogleGenerativeAI(apiKey, {
    baseURL: baseUrl || PROVIDERS.GOOGLE.baseUrl,
  });

  const googleMessages = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  if (stream) {
    const response = await googleAI.chat.completions.create({
      model,
      messages: googleMessages,
      stream: true,
    });

    for await (const chunk of response) {
      if (chunk.choices[0]?.delta?.content) {
        yield chunk.choices[0].delta.content;
      }
    }
  } else {
    const response = await googleAI.chat.completions.create({
      model,
      messages: googleMessages,
    });

    if (response.choices[0]?.message?.content) {
      yield response.choices[0].message.content;
    }
  }
}

/**
 * OpenAIと通信するためのジェネレーター関数
 */
async function* streamOpenAI(
  apiKey: string,
  messages: Message[],
  model: string,
  stream: boolean,
  baseUrl?: string,
): AsyncGenerator<string, void, unknown> {
  const openai = new OpenAI({
    apiKey,
    baseURL: baseUrl || PROVIDERS.OPENAI.baseUrl,
  });

  const openaiMessages = messages.map((msg) => ({
    role: msg.role as ChatCompletionCreateParams.Message["role"],
    content: msg.content,
  }));

  if (stream) {
    const response = await openai.chat.completions.create({
      model,
      messages: openaiMessages,
      stream: true,
    });

    for await (const chunk of response) {
      if (chunk.choices[0]?.delta?.content) {
        yield chunk.choices[0].delta.content;
      }
    }
  } else {
    const response = await openai.chat.completions.create({
      model,
      messages: openaiMessages,
    });

    if (response.choices[0]?.message?.content) {
      yield response.choices[0].message.content;
    }
  }
}

/**
 * Anthropicと通信するためのジェネレーター関数
 */
async function* streamAnthropic(
  apiKey: string,
  messages: Message[],
  model: string,
  stream: boolean,
): AsyncGenerator<string, void, unknown> {
  const anthropic = new AnthropicMessages({
    apiKey,
  });

  const anthropicMessages = messages.map((msg) => ({
    role: msg.role === "system" ? "assistant" : msg.role,
    content: msg.content,
  }));

  if (stream) {
    const response = await anthropic.messages.create({
      model,
      messages: anthropicMessages,
      stream: true,
    });

    for await (const chunk of response) {
      if (chunk.type === "content_block_delta" && chunk.delta?.text) {
        yield chunk.delta.text;
      }
    }
  } else {
    const response = await anthropic.messages.create({
      model,
      messages: anthropicMessages,
    });

    if (response.content[0]?.text) {
      yield response.content[0].text;
    }
  }
}

/**
 * Mistralと通信するためのジェネレーター関数
 */
async function* streamMistral(
  apiKey: string,
  messages: Message[],
  model: string,
  stream: boolean,
): AsyncGenerator<string, void, unknown> {
  const mistral = new MistralClient({
    apiKey,
  });

  const mistralMessages = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  if (stream) {
    const response = await mistral.chat.completions.create({
      model,
      messages: mistralMessages,
      stream: true,
    });

    for await (const chunk of response) {
      if (chunk.choices[0]?.delta?.content) {
        yield chunk.choices[0].delta.content;
      }
    }
  } else {
    const response = await mistral.chat.completions.create({
      model,
      messages: mistralMessages,
    });

    if (response.choices[0]?.message?.content) {
      yield response.choices[0].message.content;
    }
  }
}
