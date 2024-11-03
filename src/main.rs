mod file_utils;
mod google_api;

use clap::Parser;
use google_api::parse_google_api_response;
use log::{error, info};
use std::env;
use std::env::current_dir;
use std::path::Path;
use std::process::exit;
use tokio::process::Command;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(index = 1)]
    base_path: Option<String>,

    #[arg(short, long)]
    model: Option<String>,

    #[arg(short, long)]
    api_key: Option<String>,

    #[arg(short, long, default_value = "Explain the code in the files provided")]
    prompt: String,
}

#[tokio::main]
async fn main() {
    env_logger::init();

    let args = Args::parse();

    let path = args
        .base_path
        .unwrap_or_else(|| current_dir().unwrap().to_str().unwrap().to_string());
    let instruction = args.prompt;
    let model = args.model.unwrap_or("gemini-1.5-flash".to_string());
    let api_key = args.api_key.unwrap_or_else(|| {
        env::var("GOOGLE_API_KEY").unwrap_or_else(|_| {
            error!("GOOGLE_API_KEY environment variable not set");
            exit(1);
        })
    });

    if Command::new("git").arg("--version").output().await.is_err() {
        error!("Git is not installed or not found in the execution path.");
        exit(1);
    }

    if !Path::new(&path).exists() {
        error!("Invalid base_path: {}", path);
        exit(1);
    }

    let files_content = match file_utils::get_files_content(&path) {
        Ok(content) => content,
        Err(e) => {
            error!("Failed to get files content: {}", e);
            return;
        }
    };

    let prompt = format!("The following is information read from a list of source codes.\n\nFiles:\n{}\n\nQuestion:\n{}\n\nPlease answer the question by referencing the specific filenames and source code from the files provided above.", files_content, instruction);
    match google_api::get_google_api_data(&api_key, &prompt, &model).await {
        Ok(data) => {
            if let Some(text) = parse_google_api_response(&data) {
                info!("Extracted text:\n{}", text);
                println!("{}", text);
            } else {
                error!("Failed to extract text from Google API response");
                println!("Response body: {:?}", data);
            }
        }
        Err(e) => error!("Error fetching Google API data: {}", e),
    }
}

#[cfg(test)]
#[tokio::test]
async fn test_main() {
    use std::fs;

    use predicates::prelude::predicate;
    use tempfile::tempdir;

    let temp_dir = tempdir().unwrap();
    let file_path = temp_dir.path().join("test_file.rs");
    fs::write(&file_path, "fn main() { println!(\"Hello, world!\"); }").unwrap();

    let mut cmd = assert_cmd::Command::cargo_bin("askrepo").unwrap();
    cmd.arg(file_path.to_str().unwrap())
        .arg("--prompt")
        .arg("What does this code do?")
        .arg("--model")
        .arg("gemini-1.5-flash")
        .arg("--api_key")
        .arg(&env::var("GOOGLE_API_KEY").unwrap());

    cmd.assert()
        .success()
        .stdout(predicate::str::contains("Hello, world!"));
}
