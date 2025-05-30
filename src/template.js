// function/template.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the SQL template (with {{conf}}, {{models}}, {{decks}}, {{dconf}})
const TEMPLATE_SQL = fs.readFileSync(
  path.resolve(__dirname, "template.sql"),
  "utf8",
);

/**
 * @param {{
 *   questionFormat?: string,
 *   answerFormat?: string,
 *   css?: string,
 *   noteType?: "basic"|"cloze",
 *   decks?: Array<{ id: number, name: string }>
 * }} options
 */
export default function createTemplate({
  questionFormat = "{{Front}}",
  answerFormat = '{{FrontSide}}\n\n<hr id="answer">\n\n{{Back}}',
  css = `.card {
    font-family: arial;
    font-size: 20px;
    text-align: center;
    color: black;
    background-color: white;
  }`,
  noteType = "basic",
  decks = [],
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const timestamp = Date.now();

  // 1) Build the decks object from the incoming array
  //    {1: {id:1,name:"Foo",…}, 2:{…}, …}
  const decksObj = decks.reduce((o, d) => {
    o[d.id] = {
      id: d.id,
      name: d.name,
      usn: 0,
      collapsed: false,
      newToday: [0, 0],
      revToday: [0, 0],
      lrnToday: [0, 0],
      timeToday: [0, 0],
      dyn: 0,
      extendNew: 10,
      extendRev: 50,
      conf: 1,
    };
    return o;
  }, {});

  // Extract deck IDs
  const deckIds = Object.keys(decksObj).map((k) => Number(k));
  const firstDeckId = decks.length > 0 ? decks[0].id : deckIds[0];

  // 2) Define model IDs and pick active
  const BASIC_MODEL_ID = timestamp;
  const CLOZE_MODEL_ID = timestamp + 1;
  const activeModelId = noteType === "cloze" ? CLOZE_MODEL_ID : BASIC_MODEL_ID;

  // 3) Collection-wide config object
  const conf = {
    nextPos: 1,
    estTimes: true,
    activeDecks: deckIds,
    sortType: "noteFld",
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: firstDeckId,
    newBury: true,
    newSpread: 0,
    dueCounts: true,
    curModel: activeModelId,
    collapseTime: 1200,
  };

  // 4) Per-deck review/new settings
  const dconf = {};
  for (const id of deckIds) {
    dconf[id] = {
      name: decksObj[id].name,
      replayq: true,
      lapse: {
        leechFails: 8,
        minInt: 1,
        delays: [10],
        leechAction: 0,
        mult: 0,
      },
      rev: {
        perDay: 100,
        fuzz: 0.05,
        ivlFct: 1,
        maxIvl: 36500,
        ease4: 1.3,
        bury: true,
        minSpace: 1,
      },
      new: {
        perDay: 20,
        delays: [1, 10],
        separate: true,
        ints: [1, 4, 7],
        initialFactor: 2500,
        bury: true,
        order: 1,
      },
      maxTaken: 60,
      usn: 0,
      timer: 0,
      id,
      mod: now,
      autoplay: true,
    };
  }

  // 5) Define the Basic model
  const basicModel = {
    id: BASIC_MODEL_ID,
    name: "Basic",
    type: 0,
    did: firstDeckId,
    usn: -1,
    mod: now,
    vers: [],
    tags: ["basic"],
    req: [[0, "all", [0]]],
    sortf: 0,
    flds: [
      {
        name: "Front",
        media: [],
        sticky: false,
        rtl: false,
        ord: 0,
        font: "Arial",
        size: 20,
      },
      {
        name: "Back",
        media: [],
        sticky: false,
        rtl: false,
        ord: 1,
        font: "Arial",
        size: 20,
      },
    ],
    tmpls: [
      {
        name: "Card 1",
        ord: 0,
        qfmt: questionFormat,
        bafmt: "",
        afmt: answerFormat,
        bqfmt: "",
        did: null,
        sortf: 0,
      },
    ],
    css,
    latexPre: `\\documentclass[12pt]{article}
\\special{papersize=3in,5in}
\\usepackage[utf8]{inputenc}
\\usepackage{amssymb,amsmath}
\\pagestyle{empty}
\\setlength{\\parindent}{0in}
\\begin{document}
`,
    latexPost: "\\end{document}",
  };

  // 6) Define the Cloze model
  const clozeModel = {
    id: CLOZE_MODEL_ID,
    name: "Cloze",
    type: 1,
    did: firstDeckId,
    sortf: 0,
    usn: -1,
    mod: now,
    vers: [],
    tags: ["cloze"],
    req: [[2, "all", [0]]],
    flds: [
      {
        name: "Text",
        media: [],
        sticky: false,
        rtl: false,
        ord: 0,
        font: "Arial",
        size: 20,
      },
    ],
    tmpls: [
      {
        name: "Cloze",
        ord: 0,
        qfmt: "{{cloze:Text}}",
        bafmt: "",
        afmt: "{{cloze:Text}}",
        bqfmt: "",
        did: null,
        sortf: 0,
      },
    ],
    css,
    latexPre: basicModel.latexPre,
    latexPost: basicModel.latexPost,
  };

  // 7) Merge models into an object
  const models = {
    [basicModel.id]: basicModel,
    [clozeModel.id]: clozeModel,
  };

  // 8) Fill the SQL and return it plus the model IDs

  const sql = TEMPLATE_SQL.replace("{{conf}}", JSON.stringify(conf))
    .replace("{{models}}", JSON.stringify(models))
    .replace("{{decks}}", JSON.stringify(decksObj))
    .replace("{{dconf}}", JSON.stringify(dconf));

  return {
    sql,
    modelIds: {
      basic: BASIC_MODEL_ID,
      cloze: CLOZE_MODEL_ID,
    },
  };
}
