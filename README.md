# askrepo - Source code reading with LLM

This program reads the content of Git-managed text files in a specified
directory, sends it to the Google Gemini API, and provides answers to questions
based on the specified prompt. It supports streaming responses for real-time
feedback.

## Usage

```bash
❯ askrepo --help
Usage: askrepo [options] [base_path]

Arguments:
  base_path                  Directory containing source code files

Options:
  -p, --prompt <TEXT>        Question to ask about the source code [default: "Explain the code in the files provided"]
  -m, --model <TEXT>         AI model to use [default: "gemini-2.0-flash"]
  -a, --api-key <TEXT>       API key
  -u, --base-url <TEXT>      API endpoint URL [default: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"]
  -r, --provider <TEXT>      AI provider to use (google, openai, anthropic, mistral) [default: "google"]
  --stream                   Enable/disable streaming mode [default: true]
  -v, --verbose              Enable verbose output
  -h, --help                 Show help
```

## Installation

### Using Deno

#### Run directly without installation

```bash
# Run directly using Deno
export GOOGLE_API_KEY="YOUR_API_KEY"
deno run -A jsr:@laiso/askrepo --prompt "What is this code doing?"  ../your-repo/src
```

#### Install globally

```bash
# Install globally using Deno
deno install -A --global jsr:@laiso/askrepo

# Make sure $HOME/.deno/bin is in your PATH
export PATH="$HOME/.deno/bin:$PATH"

# Then run the command
export GOOGLE_API_KEY="YOUR_API_KEY"
askrepo --prompt "What is the purpose of this code?" ../your-repo/src
```

### Gemini API Key

A Gemini API key is required to run this program. You can get it from:

https://aistudio.google.com/app/apikey

## Examples

### Using Google Gemini API (default)

```bash
export GOOGLE_API_KEY="YOUR_API_KEY"
askrepo --prompt "What is the purpose of this code?" ../your-repo/src

# Using short options
askrepo -p "What is the purpose of this code?" -m "gemini-2.0-flash" ../your-repo/src
```

### Using OpenAI API

```bash
export OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
askrepo --prompt "What is the purpose of this code?" \
  --model "gpt-4o" \
  --provider "openai" \
  ../your-repo/src

# Using short options
askrepo -p "What is the purpose of this code?" \
  -m "gpt-4o" \
  -r "openai" \
  ../your-repo/src
```

### Using Anthropic API
```bash
export ANTHROPIC_API_KEY="YOUR_ANTHROPIC_API_KEY"
askrepo --prompt "What is the purpose of this code?" \
  --model "claude-3-sonnet" \
  --provider "anthropic" \
  ../your-repo/src
```

### Using Mistral API
```bash
export MISTRAL_API_KEY="YOUR_MISTRAL_API_KEY"
askrepo --prompt "What is the purpose of this code?" \
  --model "mistral-large" \
  --provider "mistral" \
  ../your-repo/src
```

## Development

```bash
# Run the project in development mode
deno run -A mod.ts --prompt "Find bugs in this code" ./src
```

## Run Tests

```bash
# Run tests
deno test
```

## Implementation Details

### Git-managed File Tracking

The tool uses the `.gitignore` parser to determine which files to include:

- Scans directories recursively while respecting `.gitignore` rules at each
  level
- Skips binary files, hidden files, and `node_modules` directories
- Caches `.gitignore` rules to optimize performance

### Binary File Detection

Files are identified as binary through two complementary methods:

1. **Extension-based detection**: Checks if the file extension matches known
   binary formats (jpg, png, etc.)
2. **Content-based detection**:
   - Looks for null bytes in the first 1024 bytes
   - Identifies binary file signatures (magic numbers) for common formats like
     JPEG, PNG, and GIF

### File Content Processing

- Reads text content from all non-binary tracked files
- Double-escapes content to ensure proper JSON formatting
- Combines file content into a tab-separated format with filename references

### LLM Integration

- Constructs a structured prompt that includes:
  - File paths and their contents
  - The user's question
  - Instructions for the model to reference specific files in its response
- Supports both Google's Generative AI models (Gemini) and OpenAI-compatible
  APIs

### Streaming Response Handling

- Uses Deno's native fetch API with streaming support
- Processes chunk-based responses in real-time
- Parses SSE (Server-Sent Events) data format from the API
- Handles both streamed and non-streamed responses

### Command Line Interface

- Built on Deno's standard library for parsing arguments
- Provides sensible defaults for all options
- Auto-detects API keys from environment variables
- Supports both standard and shorthand options
- Returns helpful error messages for invalid inputs

## Features

- Streaming support for real-time AI responses
- Flexible API endpoint configuration
- Improved response parsing for different formats
- Support for both streaming and non-streaming modes
- Default to the latest Gemini model (gemini-2.0-flash), but can be configured
  to use other models
- Support for multiple AI providers through Vercel AI SDK:
  - Google Gemini
  - OpenAI
  - Anthropic Claude
  - Mistral AI
