import { generateApkg } from "./exporter.js";

const buffer = await generateApkg({
  cards: allNotes,
  noteType: allNotes[0].noteType || "basic",
  decks,
});

return buffer;
