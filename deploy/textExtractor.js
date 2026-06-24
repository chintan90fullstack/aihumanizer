import mammoth from "mammoth";

// pdf-parse ships its main entry with a debug block that runs on import,
// so we import the library file directly to avoid that side effect.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

/**
 * Extract plain text from an uploaded file buffer based on its mimetype/name.
 * Supports .txt, .md, .docx and .pdf.
 */
export async function extractText(file) {
  const name = (file.originalname || "").toLowerCase();
  const mime = file.mimetype || "";

  if (name.endsWith(".pdf") || mime === "application/pdf") {
    const data = await pdfParse(file.buffer);
    return data.text;
  }

  if (
    name.endsWith(".docx") ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return value;
  }

  if (name.endsWith(".doc")) {
    throw new Error(
      "Legacy .doc files are not supported. Please convert to .docx, .pdf or .txt."
    );
  }

  // Default: treat as plain text (.txt, .md, anything text based)
  return file.buffer.toString("utf-8");
}
