mod file_utils;
mod google_api;

use clap::Parser;
use log::{error, info};
use std::env;
use std::env::current_dir;
use std::path::Path;
use std::process::exit;
use tokio::process::Command;
use serde_json;
use futures_util::StreamExt;
use std::io::Write;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(index = 1)]
    base_path: Option<String>,

    #[arg(short, long, default_value = "gemini-1.5-flash")]
    model: Option<String>,

    #[arg(short, long)]
    api_key: Option<String>,

    #[arg(short, long, default_value = "Explain the code in the files provided")]
    prompt: String,

    #[arg(short = 'u', long, default_value = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions")]
    base_url: String,

    #[arg(long, default_value = "true")]
    stream: bool,
}

#[tokio::main]
async fn main() {
    env_logger::init();

    let args = Args::parse();

    let path = match args.base_path {
        Some(p) => p,
        None => match current_dir() {
            Ok(dir) => match dir.to_str() {
                Some(s) => s.to_string(),
                None => {
                    error!("Failed to convert current directory to string");
                    exit(1);
                }
            },
            Err(_) => {
                error!("Failed to get current directory");
                exit(1);
            }
        },
    };
    let instruction = args.prompt;
    let model = args.model.unwrap();
    let api_key = args.api_key.unwrap_or_else(|| {
        env::var("GOOGLE_API_KEY").unwrap_or_else(|_| {
            error!("GOOGLE_API_KEY environment variable not set");
            exit(1);
        })
    });
    let base_url = args.base_url;

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

    let prompt = format!(
        "The following is information read from a list of source codes.\n\nFiles:\n{}\n\nQuestion:\n{}\n\nPlease answer the question by referencing the specific filenames and source code from the files provided above.",
        files_content, instruction
    );

    let messages = vec![serde_json::json!({
        "role": "user",
        "content": prompt
    })];
    match google_api::get_google_api_data(&api_key, messages, &model, args.stream, &base_url).await {
        Ok(mut stream) => {
            while let Some(text) = stream.next().await {
                info!("Extracted text:\n{}", text);
                print!("{}", text);
                std::io::stdout().flush().unwrap();
            }
        }
        Err(e) => error!("Error fetching API data: {}", e),
    }
}