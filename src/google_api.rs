use reqwest::Client;
use std::error::Error;

pub async fn get_google_api_data(
    api_key: &str,
    query: &str,
    model: &str,
) -> Result<String, Box<dyn Error>> {
    let client = Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );
    let body = format!(
        r#"
    {{
        "contents": [{{
            "parts": [{{"text": "{}"}}]
        }}]
    }}
    "#,
        query
    );
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await?;

    let text = res.text().await?;
    Ok(text)
}

pub fn parse_google_api_response(data: &str) -> Option<String> {
    let parsed_data: serde_json::Value = serde_json::from_str(data).expect("Failed to parse JSON");
    parsed_data["candidates"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|candidate| candidate["content"]["parts"].as_array())
        .and_then(|arr| arr.first())
        .and_then(|part| part["text"].as_str())
        .map(|text| text.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::runtime::Runtime;

    #[test]
    fn test_parse_google_api_response() {
        let json_data = r#"
        {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "This is a test response"}
                        ]
                    }
                }
            ]
        }
        "#;
        let result = parse_google_api_response(json_data);
        assert_eq!(result, Some("This is a test response".to_string()));
    }

    #[test]
    fn test_parse_google_api_response_empty() {
        let json_data = r#"
        {
            "candidates": []
        }
        "#;
        let result = parse_google_api_response(json_data);
        assert_eq!(result, None);
    }

    #[test]
    fn test_get_google_api_data() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let api_key = "test_api_key";
            let query = "test_query";
            let model = "test_model";
            let result = get_google_api_data(api_key, query, model).await;
            assert!(result.is_ok());
        });
    }
}
