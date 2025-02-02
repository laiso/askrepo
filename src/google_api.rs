use reqwest::Client;
use std::error::Error;
use serde_json::{json, Value};
use futures_util::StreamExt;
use tokio::sync::mpsc;
use tokio_stream;

pub async fn get_google_api_data(
    api_key: &str,
    messages: Vec<Value>,
    model: &str,
    stream: bool,
    base_url: &str,
) -> Result<impl futures_util::Stream<Item = String>, Box<dyn Error>> {
    let client = Client::builder()
        .http1_title_case_headers()
        .build()
        .unwrap();
    let body = json!({
        "model": model,
        "messages": messages,
        "stream": stream
    });

    let request = client
        .post(base_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body);

    if stream {
        let response = request.send().await?;
        let byte_stream = response.bytes_stream();
        let (tx, rx) = mpsc::channel(100);

        tokio::spawn(async move {
            let mut stream = byte_stream;
            while let Some(chunk) = stream.next().await {
                match chunk {
                    Ok(c) => {
                        if let Ok(s) = String::from_utf8(c.to_vec()) {
                            let content = parse_google_api_response(&s);
                            if !content.is_empty() {
                                let _ = tx.send(content).await;
                            }
                        } else {
                            log::error!("Failed to parse chunk as UTF-8");
                        }
                    }
                    Err(e) => {
                        log::error!("Error receiving chunk: {}", e);
                        break;
                    },
                }
            }
        });

        Ok(tokio_stream::wrappers::ReceiverStream::new(rx))
    } else {
        let res = request.send().await?;
        let text = res.text().await?;
        let (tx, rx) = mpsc::channel(1);
        let _ = tx.send(text).await;
        Ok(tokio_stream::wrappers::ReceiverStream::new(rx))
    }
}

pub fn parse_google_api_response(data: &str) -> String {
    let mut result = String::new();
    
    // Split the input into lines and process each line
    for line in data.lines() {
        let line = line.trim();
            
        // Skip empty lines
        if line.is_empty() {
            continue;
        }
        
        // Check for DONE signal
        if line == "data: [DONE]" {
            continue;
        }
        
        // Process lines starting with "data: "
        if line.starts_with("data: ") {
            if let Some(json_str) = line.strip_prefix("data: ").map(|s| s.trim()) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                    if let Some(choice) = v["choices"].get(0) {
                        let delta = &choice["delta"];

                        if choice["finish_reason"] == "stop" {
                            continue;
                        }

                        if let Some(delta_obj) = delta.as_object() {
                            if let Some(content) = delta_obj.get("content").and_then(|c| c.as_str()) {
                                if !content.is_empty() {
                                    result.push_str(content);
                                }
                            }

                            if let Some(refusal) = delta_obj.get("refusal") {
                                if !refusal.is_null() {
                                    result.push_str(&format!("[refusal: {:?}]", refusal));
                                }
                            }

                            if let Some(role) = delta_obj.get("role").and_then(|r| r.as_str()) {
                                result.push_str(&format!("[role: {}]", role));
                            }
                        }
                    }
                }
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::runtime::Runtime;

    #[test]
    fn test_parse_google_api_response() {
        let response = r#"data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"こんにちは"},"finish_reason":null}]}"#;
        let result = parse_google_api_response(response);
        assert_eq!(result, "こんにちは");
    }

    #[test]
    fn test_parse_google_api_response_raw() {
        let response = "This is a raw response";
        let result = parse_google_api_response(response);
        assert_eq!(result, "This is a raw response");
    }

    #[test]
    fn test_parse_google_api_response_empty() {
        let json_data = "";
        let result = parse_google_api_response(json_data);
        assert_eq!(result, "");
    }

    #[test]
    fn test_parse_google_api_response_multiple_chunks() {
        let response = r#"data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"He"},"finish_reason":null}]}
data: {"id":"chatcmpl-2","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"ll"},"finish_reason":null}]}
data: {"id":"chatcmpl-3","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"o"},"finish_reason":null}]}
data: {"id":"chatcmpl-4","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
data: [DONE]"#;
        let result = parse_google_api_response(response);
        assert_eq!(result, "Hello");
    }

    #[test]
    fn test_get_google_api_data() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let api_key = "test_api_key";
            let messages = vec![
                json!({
                    "role": "system",
                    "content": "You are a helpful assistant."
                }),
                json!({
                    "role": "user",
                    "content": "Hello!"
                })
            ];
            let model = "test_model";
            let result = get_google_api_data(api_key, messages, model, false, "https://api.openai.com/v1/chat/completions").await;
            assert!(result.is_ok());
        });
    }
}
