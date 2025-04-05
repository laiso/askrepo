import { assertEquals } from "jsr:@std/assert";
import {
  getFilesContent,
  getTrackedFiles,
  isBinaryFile,
} from "../src/file_utils.ts";

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
