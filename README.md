# askrepo - Source code reading with LLM

This program reads the content of Git-managed text files in a specified directory, sends it to the Google Gemini API, and provides answers to questions based on the specified prompt.

```bash
❯ askrepo --help
Usage: askrepo [OPTIONS] [BASE_PATH]

Arguments:
  [BASE_PATH]

Options:
  -p, --prompt <PROMPT>    [default: "Explain the code in the files provided"]
  -m, --model <MODEL>　　 [default: "gemini-1.5-flash"]
  -a, --api-key <API_KEY>
  -h, --help               Print help
  -V, --version            Print version
```

```bash
❯ askrepo --prompt "What is the purpose of this code?" --model "gemini-1.5-flash" ./src

This code, primarily found in `src/main.rs`, is designed to **extract information from source code files and provide answers to questions about them using a Google AI model**. It leverages the `google_api` module (`src/google_api.rs`) to interact with the Google Generative Language API.

Here's a breakdown of its functionality:

1. **`src/file_utils.rs`:** This module handles file processing.
    - `is_binary_file`:  Determines if a file is binary based on its extension and magic numbers (lines 10-25).
    - `get_git_tracked_files`: Lists all files tracked by Git within a given directory (lines 27-40).
    - `get_files_content`: Reads content of text files (non-binary), escapes special characters, and formats it for use in the query (lines 42-58).

2. **`src/google_api.rs`:** This module handles interaction with the Google AI API.
    - `get_google_api_data`: Sends a request to the API with the provided query, model name, and API key (lines 4-25).
    - `parse_google_api_response`: Parses the JSON response from the API, extracting the generated text (lines 27-36).

3. **`src/main.rs`:** This module orchestrates the entire process.
    - It parses command-line arguments:
        - `base_path`: The directory containing the source code files.
        - `model`: The Google AI model to use (defaults to "gemini-1.5-flash").
        - `api_key`: The Google API key for authentication.
        - `prompt`: The question to ask about the source code (defaults to "Explain the code in the files provided").
    - It calls `file_utils::get_files_content` to get the formatted content of text files within the `base_path`.
    - It constructs the prompt by combining the file information, the question, and the extracted source code content.
    - It calls `google_api::get_google_api_data` to send the prompt to the Google AI model.
    - Finally, it parses the response and prints the generated text.

**In essence, this code acts as a question-answering tool for source code by using a Google AI model to analyze and provide answers based on the provided source code files.**
```

## Installation

Gemini API key is required to run this program. You can get it from

https://aistudio.google.com/app/apikey

```bash
export GOOGLE_API_KEY="YOUR_API_KEY"

cargo build --release
./target/release/askrepo --prompt "What is the purpose of this code?" ../your-repo/src
```

## Run Tests

```bash
cargo test
```

## Implementation Details

### Retrieving Git-managed files:

Gets a list of Git-managed files in the specified directory.

### Text file determination:

1. The file contains null bytes or matches known binary file magic numbers.
2. Determines whether a file is a text file. If the file contains null bytes or matches known binary file magic numbers, it is considered a binary file.

### Getting file contents:

Reads the contents of Git-managed text files and combines them in CSV format.

### Comment generation:

Uses Google's generative AI model to generate comments based on the specified prompt. The generated comments are returned as an asynchronous generator.

### Command Line Interface:

When the script is executed directly, it retrieves the prompt and path from command line arguments, generates comments, and outputs them to the console.
