use memchr::memchr;
use serde_json::json;
use std::cmp::min;
use std::path::Path;
use std::{env, fs};
use std::process::Command;
use std::str;

const MAX_SCAN_SIZE: usize = 1024;
const MAGIC_NUMBERS: &[&[u8]] = &[
    b"\xFF\xD8\xFF",      // JPEG
    b"\x89PNG\r\n\x1A\n", // PNG
    b"GIF87a",            // GIF
    b"GIF89a",            // GIF
];

pub fn is_binary_file(file: &str) -> bool {
    let binary_extensions = ["jpg", "jpeg", "png", "gif", "bmp", "exe", "dll"];
    if let Some(extension) = file.split('.').last() {
        if binary_extensions.contains(&extension.to_lowercase().as_str()) {
            return true;
        }
    }

    let data = fs::read(file).expect("Unable to read file");
    let scan_size = min(data.len(), MAX_SCAN_SIZE);
    let has_zero_bytes = memchr(0x00, &data[..scan_size]).is_some();

    has_zero_bytes || MAGIC_NUMBERS.iter().any(|magic| data.starts_with(magic))
}

pub fn get_git_tracked_files(base_path: &str) -> Vec<String> {
    let path = Path::new(base_path);
    let absolute_path = fs::canonicalize(path).expect("Unable to get absolute path");
    let dir = if absolute_path.is_file() {
        absolute_path.parent().expect("Unable to get parent directory")
    } else {
        &absolute_path
    };

    env::set_current_dir(dir).expect("Unable to change directory");
    let output = Command::new("git")
        .arg("ls-files")
        .arg(absolute_path)
        .output()
        .expect("Failed to execute git ls-files");

    if !output.status.success() {
        eprintln!(
            "Git command failed. Please ensure Git is installed and the command can be executed."
        );
    }

    let stdout = str::from_utf8(&output.stdout).expect("Invalid UTF-8 sequence");
    stdout.lines().map(|line| line.to_string()).collect()
}

pub fn get_files_content(base_path: &str) -> Result<String, Box<dyn std::error::Error>> {
    let files = get_git_tracked_files(base_path);
    let mut result = Vec::new();

    for file in files {
        if is_binary_file(&file) {
            continue;
        }

        let content = fs::read_to_string(&file)?;
        let escaped_content = json!(content).to_string();
        let double_escaped_content = json!(escaped_content).to_string();
        let trimmed_content = &double_escaped_content[1..double_escaped_content.len() - 1];
        result.push(format!("{}\t{}", file, trimmed_content));
    }

    Ok(result.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    
    #[test]
    fn test_is_binary_file() {
        let text_file_path = "test.txt";
        let binary_file_path = "test.png";

        // Create a text file
        let mut text_file = File::create(text_file_path).expect("Unable to create test file");
        writeln!(text_file, "This is a test file.").expect("Unable to write to test file");

        // Create a binary file
        let mut binary_file = File::create(binary_file_path).expect("Unable to create test file");
        binary_file.write_all(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
            .expect("Unable to write to test file");

        assert!(!is_binary_file(text_file_path));
        assert!(is_binary_file(binary_file_path));

        // Clean up
        fs::remove_file(text_file_path).expect("Unable to delete test file");
        fs::remove_file(binary_file_path).expect("Unable to delete test file");
    }

    #[test]
    fn test_get_git_tracked_files() {
        let base_path = ".";
        let files = get_git_tracked_files(base_path);
        assert!(files.len() > 0);
    }

    #[test]
    fn test_get_files_content() {
        let base_path = ".";
        let result = get_files_content(base_path);
        assert!(result.is_ok());
    }
}
