// exporter.js
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import initSqlJs from "sql.js";
import JSZip from "jszip";
import sha1 from "sha1";
import { v4 as uuidv4 } from "uuid";
import createTemplate from "./template.js";
import fs from "fs";

/**
 * @param {{ decks: { id: number, name: string }[],
 *            cards: Array<{ deckId: number, front?: string, back?: string, text?: string }>,
 *            noteType?: "basic"|"cloze" }}
 */
export async function generateApkg({ decks = [], cards = [] }) {
  // 1. Locate the WASM file shipped in dist/
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const wasmPath = path.resolve(
    __dirname,
    "../node_modules/sql.js/dist/sql-wasm.wasm",
  );
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`❌ sql-wasm.wasm not found at ${wasmPath}`);
  }

  // 2. Initialize SQL.js with our WASM
  const SQL = await initSqlJs({
    locateFile: () => pathToFileURL(wasmPath).href,
  });

  // 3. Build a fresh in-memory DB and seed it with the Anki schema + decks
  const db = new SQL.Database();
  // createTemplate must now accept your decks array and interpolate it into {{decks}}
  const { sql, modelIds } = createTemplate({
    noteType: cards[0]?.noteType || "basic",
    decks,
  });
  db.exec(sql);

  // 4. Prepare ID counters
  let nextNoteId = Date.now();
  let nextCardId = nextNoteId * 10;

  // Helper: compute the Anki checksum for sorting
  function computeCsum(sfld) {
    const hash = sha1(sfld);
    return parseInt(hash.slice(0, 8), 16);
  }

  const modTime = Math.floor(Date.now() / 1000);
  const usn = 0;
  const tags = "";

  // 5. Insert every card (and its note) into the DB
  for (const card of cards) {
    // 5a. Note row
    const type = card.noteType || "basic";
    const nid = nextNoteId++;
    const guid = uuidv4().replace(/-/g, "");
    const mid = modelIds[type];

    let flds, sfld;
    if (type === "cloze") {
      flds = card.text;
      sfld = card.text;
    } else {
      flds = `${card.front}\u001F${card.back}`;
      sfld = card.front;
    }
    const csum = computeCsum(sfld);

    db.run(
      `INSERT INTO notes
         (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nid, guid, mid, modTime, usn, tags, flds, sfld, csum, 0, ""],
    );

    // 5b. Card row
    const cid = nextCardId++;
    const did = card.deckId;
    db.run(
      `INSERT INTO cards
         (id, nid, did, ord, mod, usn, type, queue,
          due, ivl, factor, reps, lapses, left,
          odue, odid, flags, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cid,
        nid,
        did,
        0, // ord
        modTime,
        usn,
        0, // type
        0, // queue
        0, // due
        0, // ivl
        0, // factor
        0, // reps
        0, // lapses
        0, // left
        0, // odue
        0, // odid
        0, // flags
        "", // data
      ],
    );
  }

  // 6. Export the SQLite file & wrap in a ZIP
  const collectionBinary = db.export();
  const zip = new JSZip();
  zip.file("collection.anki2", new Uint8Array(collectionBinary));

  // 7. Return a Promise<Buffer> suitable for S3 upload or HTTP response
  return zip.generateAsync({ type: "nodebuffer" });
}
