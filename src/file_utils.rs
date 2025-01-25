use ignore::WalkBuilder;
use memchr::memchr;
use serde_json::json;
use std::cmp::min;
use std::{fs, io};

const MAX_SCAN_SIZE: usize = 1024;
const MAGIC_NUMBERS: &[&[u8]] = &[
    b"\xFF\xD8\xFF",      // JPEG
    b"\x89PNG\r\n\x1A\n", // PNG
    b"GIF87a",            // GIF
    b"GIF89a",            // GIF
];

fn is_binary_file_by_extension(file: &str) -> bool {
    let binary_extensions = ["jpg", "jpeg", "png", "gif", "bmp", "exe", "dll"];
    file.split('.')
        .last()
        .map(|extension| binary_extensions.contains(&extension.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_binary_file_by_content(file: &str) -> bool {
    let data = match fs::read(file) {
        Ok(data) => data,
        Err(_) => return false,
    };
    let scan_size = min(data.len(), MAX_SCAN_SIZE);
    let has_zero_bytes = memchr(0x00, &data[..scan_size]).is_some();

    has_zero_bytes || MAGIC_NUMBERS.iter().any(|magic| data.starts_with(magic))
}

pub fn is_binary_file(file: &str) -> bool {
    is_binary_file_by_extension(file) || is_binary_file_by_content(file)
}

pub fn get_tracked_files(base_path: &str) -> io::Result<Vec<String>> {
    let walker = WalkBuilder::new(base_path)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .build();

    let mut files = Vec::new();
    for result in walker {
        match result {
            Ok(entry) => {
                if entry.file_type().map_or(false, |ft| ft.is_file()) {
                    if let Some(path) = entry.path().to_str() {
                        files.push(path.to_string());
                    }
                }
            }
            Err(err) => {
                eprintln!("Error walking directory: {}", err);
            }
        }
    }
    Ok(files)
}

pub fn get_files_content(base_path: &str) -> Result<String, Box<dyn std::error::Error>> {
    let files = get_tracked_files(base_path)?;
    let mut result = Vec::new();

    for file in files {
        if is_binary_file(&file) {
            continue;
        }

        match fs::read_to_string(&file) {
            Ok(content) => {
                let escaped_content = json!(content).to_string();
                let double_escaped_content = json!(escaped_content).to_string();
                let trimmed_content = &double_escaped_content[1..double_escaped_content.len() - 1];
                result.push(format!("{}\t{}", file, trimmed_content));
            }
            Err(err) => {
                eprintln!("Error reading file {}: {}", file, err);
                continue;
            }
        }
    }

    if result.is_empty() {
        return Err("No readable files found".into());
    }

    Ok(result.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    fn setup_test_dir(dir_name: &str) -> std::io::Result<()> {
        let _ = fs::remove_dir_all(dir_name);
        fs::create_dir_all(dir_name)
    }

    fn cleanup_test_dir(dir_name: &str) {
        let _ = fs::remove_dir_all(dir_name);
    }

    #[test]
    fn test_is_binary_file() {
        let test_dir = "test_binary_dir";
        setup_test_dir(test_dir).expect("Failed to create test directory");

        let text_file_path = format!("{}/test.txt", test_dir);
        let binary_file_path = format!("{}/test.png", test_dir);

        let mut text_file = File::create(&text_file_path).expect("Unable to create test file");
        writeln!(text_file, "This is a test file.").expect("Unable to write to test file");

        let mut binary_file = File::create(&binary_file_path).expect("Unable to create test file");
        binary_file
            .write_all(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
            .expect("Unable to write to test file");

        assert!(!is_binary_file(&text_file_path));
        assert!(is_binary_file(&binary_file_path));

        cleanup_test_dir(test_dir);
    }

    #[test]
    fn test_get_tracked_files() {
        let test_dir = "test_tracked_dir";
        setup_test_dir(test_dir).expect("Failed to create test directory");

        let test_file_path = format!("{}/test.txt", test_dir);
        fs::write(&test_file_path, "Test content").expect("Failed to write test file");

        let result = get_tracked_files(test_dir);
        assert!(result.is_ok());
        let files = result.unwrap();
        assert!(!files.is_empty());

        assert!(files.iter().any(|f| f.contains("test.txt")));

        cleanup_test_dir(test_dir);
    }

    #[test]
    fn test_get_files_content() {
        let test_dir = "test_content_dir";
        setup_test_dir(test_dir).expect("Failed to create test directory");
        
        let test_file_path = format!("{}/test.txt", test_dir);
        let test_content = "Hello, World!";
        fs::write(&test_file_path, test_content).expect("Failed to write test file");

        let result = get_files_content(test_dir);
        assert!(result.is_ok());
        
        let content = result.unwrap();
        assert!(content.contains(&test_file_path));
        assert!(content.contains(test_content));

        cleanup_test_dir(test_dir);
    }
}
