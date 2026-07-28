// Extracts plain text from a .docx (Office Open XML) file using only browser APIs.
// A .docx is a ZIP archive whose body text lives in word/document.xml. The
// platform's file-extraction integration does not support .docx, so we read the
// archive directly in the browser.

const UTF8 = new TextDecoder("utf-8");
const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

function u32(view, offset) {
  return view.getUint32(offset, true);
}
function u16(view, offset) {
  return view.getUint16(offset, true);
}

async function inflate(deflated) {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  writer.write(deflated);
  writer.close();
  const reader = stream.readable.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

function xmlToPlainText(xml) {
  let text = xml
    .replace(/<w:p[ >]/g, "\n<w:p ")
    .replace(/<w:br[ >\/]/g, "\n")
    .replace(/<w:tab[ >\/]/g, "\t");
  text = text.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param {File} file
 * @returns {Promise<string>} the plain-text content of the document
 */
export async function extractDocxText(file) {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Locate the End Of Central Directory record.
  let eocd = -1;
  const minScan = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minScan; i--) {
    if (u32(view, i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("Could not read the DOCX file.");

  const cdOffset = u32(view, eocd + 16);
  const cdEntries = u16(view, eocd + 10);

  let offset = cdOffset;
  let docEntry = null;
  for (let i = 0; i < cdEntries; i++) {
    if (u32(view, offset) !== CENTRAL_SIG) throw new Error("Corrupt DOCX archive.");
    const method = u16(view, offset + 10);
    const compSize = u32(view, offset + 20);
    const uncompSize = u32(view, offset + 24);
    const nameLen = u16(view, offset + 28);
    const extraLen = u16(view, offset + 30);
    const commentLen = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const name = UTF8.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    if (name === "word/document.xml") {
      docEntry = { method, compSize, uncompSize, localOffset };
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  if (!docEntry) throw new Error("No document content found in the DOCX file.");

  const lo = docEntry.localOffset;
  if (u32(view, lo) !== LOCAL_SIG) throw new Error("Corrupt DOCX archive.");
  const lNameLen = u16(view, lo + 26);
  const lExtraLen = u16(view, lo + 28);
  const dataOffset = lo + 30 + lNameLen + lExtraLen;

  let content;
  if (docEntry.method === 0) {
    content = bytes.subarray(dataOffset, dataOffset + docEntry.uncompSize);
  } else {
    content = await inflate(bytes.subarray(dataOffset, dataOffset + docEntry.compSize));
  }

  return xmlToPlainText(UTF8.decode(content));
}