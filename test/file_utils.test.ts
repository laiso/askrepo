import { assertEquals } from "jsr:@std/assert";
import {
  getFilesContent,
  getTrackedFiles,
  isBinaryFile,
} from "../src/file_utils.ts";
import { assertRejects } from "jsr:@std/assert";

Deno.test("test_is_binary_file", async () => {
  const testDir = "./test_binary_dir";
  try {
    await Deno.remove(testDir, { recursive: true });
  } catch (_e) {
    // Ignore if directory does not exist
  }
  await Deno.mkdir(testDir, { recursive: true });

  const textFilePath = `${testDir}/test.txt`;
  const binaryFilePath = `${testDir}/test.png`;

  await Deno.writeTextFile(textFilePath, "This is a test file.");
  const binaryData = new Uint8Array([
    0x89,
    0x50,
    0x4E,
    0x47,
    0x0D,
    0x0A,
    0x1A,
    0x0A,
  ]);
  await Deno.writeFile(binaryFilePath, binaryData);

  const isTextBinary = await isBinaryFile(textFilePath);
  const isBinaryBinary = await isBinaryFile(binaryFilePath);
  assertEquals(isTextBinary, false, "Text file detected as binary");
  assertEquals(isBinaryBinary, true, "Binary file not detected as binary");

  await Deno.remove(testDir, { recursive: true });
});

Deno.test("test_get_tracked_files", async () => {
  const testDir = "./test_tracked_dir";
  try {
    await Deno.remove(testDir, { recursive: true });
  } catch (_e) {
    // Ignore if directory does not exist
  }
  await Deno.mkdir(testDir, { recursive: true });

  const testFilePath = `${testDir}/test.txt`;
  await Deno.writeTextFile(testFilePath, "Test content");
  const gitignorePath = `${testDir}/.gitignore`;
  await Deno.writeTextFile(gitignorePath, "test.txt");

  const files = await getTrackedFiles(testDir);
  assertEquals(
    files.some((f) => f.includes("test.txt")),
    false,
    "test.txt should be excluded by .gitignore",
  );

  await Deno.remove(testDir, { recursive: true });
});

Deno.test("test_get_files_content", async () => {
  const testDir = "./test_content_dir";
  try {
    await Deno.remove(testDir, { recursive: true });
  } catch (_e) {
    // Ignore if directory does not exist
  }
  await Deno.mkdir(testDir, { recursive: true });

  const testFilePath = `${testDir}/test.txt`;
  const testContent = "Hello, World!";
  await Deno.writeTextFile(testFilePath, testContent);
  const content = await getFilesContent(testDir, true);

  const filename = testFilePath.split("/").pop() || "";
  assertEquals(
    content.includes(filename),
    true,
    "Filename not included in content",
  );

  const escapedContent = JSON.stringify(testContent).slice(1, -1);
  assertEquals(
    content.includes(escapedContent),
    true,
    "Test content not found",
  );

  await Deno.remove(testDir, { recursive: true });
});

Deno.test("test_get_single_file_content", async () => {
  const testDir = "./test_single_file_dir";
  try {
    await Deno.remove(testDir, { recursive: true });
  } catch (_e) {
    // Ignore if directory does not exist
  }
  await Deno.mkdir(testDir, { recursive: true });

  const testFilePath = `${testDir}/single_test.txt`;
  const testContent = "Single file test";
  await Deno.writeTextFile(testFilePath, testContent);

  const content = await getFilesContent(testFilePath, true);

  assertEquals(
    content.includes(testFilePath),
    true,
    "Filepath not included in content",
  );

  const escapedContent = JSON.stringify(testContent).slice(1, -1);
  assertEquals(
    content.includes(escapedContent),
    true,
    "Test content not found",
  );

  await Deno.remove(testDir, { recursive: true });
});

Deno.test("test_get_multiple_paths_content", async () => {
  const testDir1 = "./test_multi_dir1";
  const testDir2 = "./test_multi_dir2";

  for (const dir of [testDir1, testDir2]) {
    try {
      await Deno.remove(dir, { recursive: true });
    } catch (_e) {
      // Ignore if directory does not exist
    }
    await Deno.mkdir(dir, { recursive: true });
  }

  const file1 = `${testDir1}/file1.txt`;
  const file2 = `${testDir2}/file2.txt`;
  await Deno.writeTextFile(file1, "Content 1");
  await Deno.writeTextFile(file2, "Content 2");

  const content = await getFilesContent([file1, file2], true);

  assertEquals(
    content.includes(file1),
    true,
    "First file path not included in content",
  );
  assertEquals(
    content.includes(file2),
    true,
    "Second file path not included in content",
  );
  assertEquals(
    content.includes("Content 1"),
    true,
    "First file content not found",
  );
  assertEquals(
    content.includes("Content 2"),
    true,
    "Second file content not found",
  );

  for (const dir of [testDir1, testDir2]) {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("getFilesContent: throws for invalid path", async () => {
  const invalidPath = "./non_existent_path_and_not_a_glob";
  await assertRejects(
    async () => {
      await getFilesContent(invalidPath, false);
    },
    Error,
    `Invalid path, or no files found for: "${invalidPath}". Please ensure the path exists, is accessible, and matches files if it's a glob.`,
  );
});

Deno.test("getFilesContent: throws for glob matching no files", async () => {
  const globPattern = "./non_existent_*.log";
  await assertRejects(
    async () => {
      await getFilesContent(globPattern, false);
    },
    Error,
    `Invalid path, or no files found for: "${globPattern}". Please ensure the path exists, is accessible, and matches files if it's a glob.`,
  );
});

Deno.test("getFilesContent: throws for empty directory", async () => {
  const emptyDir = "./test_empty_dir_getFilesContent";
  await Deno.mkdir(emptyDir, { recursive: true });
  try {
    await assertRejects(
      async () => {
        await getFilesContent(emptyDir, false);
      },
      Error,
      "No files found in the specified paths after processing all inputs.",
      // This error message might vary slightly if the directory itself is considered "found" but contains no files.
      // The core idea is that it should reject.
    );
  } finally {
    await Deno.remove(emptyDir, { recursive: true });
  }
});

Deno.test("getFilesContent: throws for directory with only .gitignored files", async () => {
  const ignoredDir = "./test_ignored_dir_getFilesContent";
  await Deno.mkdir(ignoredDir, { recursive: true });
  await Deno.writeTextFile(`${ignoredDir}/ignored.txt`, "content");
  await Deno.writeTextFile(`${ignoredDir}/.gitignore`, "*.txt");

  try {
    await assertRejects(
      async () => {
        await getFilesContent(ignoredDir, false);
      },
      Error,
      "No files found in the specified paths after processing all inputs.",
    );
  } finally {
    await Deno.remove(ignoredDir, { recursive: true });
  }
});

Deno.test("getFilesContent: throws for directory with only binary files", async () => {
  const binaryDir = "./test_binary_only_dir_getFilesContent";
  await Deno.mkdir(binaryDir, { recursive: true });
  const binaryData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG magic number
  await Deno.writeFile(`${binaryDir}/image.png`, binaryData);

  try {
    await assertRejects(
      async () => {
        await getFilesContent(binaryDir, false);
      },
      Error,
      "No readable (non-binary, non-ignored) files found after processing the provided paths.",
    );
  } finally {
    await Deno.remove(binaryDir, { recursive: true });
  }
});

Deno.test("getFilesContent: throws with mixed valid and invalid paths (invalid first)", async () => {
  const validDir = "./test_valid_dir_mixed_getFilesContent";
  await Deno.mkdir(validDir, { recursive: true });
  await Deno.writeTextFile(`${validDir}/file.txt`, "content");
  const invalidPath = "./non_existent_path_mixed";

  try {
    await assertRejects(
      async () => {
        await getFilesContent([invalidPath, validDir], false);
      },
      Error,
      `Invalid path, or no files found for: "${invalidPath}". Please ensure the path exists, is accessible, and matches files if it's a glob.`,
    );
  } finally {
    await Deno.remove(validDir, { recursive: true });
  }
});

Deno.test("getFilesContent: processes valid path if invalid path is not fatal for the whole operation (valid first)", async () => {
  // This test assumes that if one path in an array is invalid, the function throws for that path
  // and doesn't proceed. If the design were to collect all errors, this test would change.
  // Based on current resolveFilePaths, it throws on the first invalid path.
  const validFile = "./test_valid_file_mixed_getFilesContent.txt";
  await Deno.writeTextFile(validFile, "valid content");
  const invalidPath = "./non_existent_path_mixed_2";

  try {
    // Test with valid path first
    const content = await getFilesContent([validFile], false); // Should not throw
    assertEquals(content.includes("valid content"), true);

    // Then test the mix that should fail
    await assertRejects(
      async () => {
        await getFilesContent([validFile, invalidPath], false);
      },
      Error,
      `Invalid path, or no files found for: "${invalidPath}". Please ensure the path exists, is accessible, and matches files if it's a glob.`,
    );
  } finally {
    await Deno.remove(validFile, { recursive: false });
  }
});

Deno.test("getFilesContent: glob pattern matching specific files", async () => {
  const globDir = "./test_glob_dir_getFilesContent";
  await Deno.mkdir(globDir, { recursive: true });
  await Deno.writeTextFile(`${globDir}/file1.txt`, "glob content 1");
  await Deno.writeTextFile(`${globDir}/file2.md`, "glob content 2");
  await Deno.writeTextFile(`${globDir}/file3.txt`, "glob content 3");

  try {
    const content = await getFilesContent(`${globDir}/*.txt`, false);
    assertEquals(content.includes("glob content 1"), true, "glob1 missing");
    assertEquals(content.includes("glob content 3"), true, "glob3 missing");
    assertEquals(content.includes("glob content 2"), false, "md file included by txt glob");
  } finally {
    await Deno.remove(globDir, { recursive: true });
  }
});
