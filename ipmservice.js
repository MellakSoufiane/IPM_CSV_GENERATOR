// ipmservice.js
require("dotenv").config();

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { build1240 } = require("./mapper1240");
const { build1240_ref } = require("./mapper1240Reference");
const { build1644 } = require("./mapper1644");

// Définition du chemin relatif
const OUTPUT_DIR = path.join(__dirname, "output");

// Vérifier si le dossier existe, sinon le créer automatiquement
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Colonnes exactes attendues par cardutil
const CSV_COLUMNS = [
  "MTI","DE2","DE3","DE4","DE5","DE6","DE12","DE14","DE22","DE23","DE24","DE25","DE26",
  "DE30","DE31","DE33","DE37","DE38","DE40","DE41","DE42","DE48","DE49","DE50",
  "DE63","DE71","DE73","DE93","DE94","DE95","DE100","PDS0023","PDS0052","PDS0122",
  "PDS0148","PDS0158","PDS0165","DE43_NAME","DE43_SUBURB","DE43_POSTCODE","ICC_DATA"
];

function getDateTime() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

// Fonction utilitaire pour traiter le fichier et appeler cardutil
async function finalizeAndConvert(records) {
  // Créer le dossier output s'il n'existe pas
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let csvContent = CSV_COLUMNS.join(",") + "\n";
  records.forEach(record => {
    const rowArr = CSV_COLUMNS.map(col => {
      let val = record[col] !== undefined ? record[col] : "";
      if (String(val).includes(",")) val = `"${val}"`;
      return val;
    });
    csvContent += rowArr.join(",") + "\n";
  });

  const timestamp = Date.now();
  const csvFile = path.join(OUTPUT_DIR, `extract_${timestamp}.csv`); // CSV dans le dossier output
  fs.writeFileSync(csvFile, csvContent);
  console.log(`Fichier CSV généré : ${csvFile}`);

  const finalFileName = `HPS_MCI_Clearing_File_${getDateTime()}.ipm`;
  const finalFilePath = path.join(OUTPUT_DIR, finalFileName);

  console.log("Conversion du CSV vers IPM via cardutil...");
  // On passe les chemins complets à la commande
  execSync(`mci_csv_to_ipm "${csvFile}" -o "${finalFilePath}" --out-encoding cp500`, { stdio: "inherit" });
  
  // Nettoyage du fichier CSV intermédiaire
  fs.unlinkSync(csvFile);
  
  return path.basename(finalFilePath); // Retourne le chemin complet du fichier généré
}
async function writeRecord(stream, record) {
  const row = CSV_COLUMNS.map(col => {
    let val = record[col] ?? "";

    if (String(val).includes(",")) {
      val = `"${val}"`;
    }

    return val;
  }).join(",") + "\n";

  if (!stream.write(row)) {
    await new Promise(resolve => stream.once("drain", resolve));
  }
}

// 1. API ORIGINALE (Par PAN/Alias)
async function generateIPM(pan, aliaspan) {
  if (!aliaspan || !pan) throw new Error("alias_pan and pan are required");
  const client = new Client({ user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME, password: process.env.DB_PASSWORD, port: process.env.DB_PORT });
  await client.connect();

  try {
    const cardRes = await client.query(`SELECT card_number FROM card WHERE alias_pan = $1`, [aliaspan]);
    if (cardRes.rows.length === 0) throw new Error("No card found");
    const tokenpan = cardRes.rows[0].card_number;

    const res = await client.query(`SELECT * FROM approved_authorization WHERE card_number = $1`, [tokenpan]);
    if (!res.rows.length) throw new Error("No authorization found");

    const totalTransactions = res.rows.length + 2;
    const totalAmount = res.rows.reduce((sum, row) => sum + Math.round(Number(row.billing_amount || 0) * 100), 0);
    
    let de71Sequence = 1;
    const nextDe71 = () => String(de71Sequence++).padStart(8, "0");

    const records = [
      build1644("PRE", {}, nextDe71()),
      ...res.rows.map(row => build1240(row, pan, nextDe71())),
      build1644("POST", { totalAmount: String(totalAmount).padStart(16, "0"), totalTransactions }, nextDe71())
    ];

    return await finalizeAndConvert(records);
  } finally {
    await client.end();
  }
}

// 2. NOUVELLE API (Multi-critères Batch)
async function generateMultiCriteriaIPM(groups) {
  const client = new Client({ user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME, password: process.env.DB_PASSWORD, port: process.env.DB_PORT });
  await client.connect();
  const allRows = [];
  
  try {
    for (const group of groups) {
    
      for (const ref of group.references) {
        const res = await client.query(
          `SELECT * FROM approved_authorization WHERE reference_number = $1`, 
          [ref]
        );
        
        // On traite chaque ligne trouvée
        res.rows.forEach(r => {
          // ICI : On injecte le group.pan (celui de la requête) au lieu de r.card_number
          allRows.push({ 
            row: r, 
            panPourFichier: group.pan 
          });
        });
      }
    }
    if (allRows.length === 0) throw new Error("Aucune autorisation trouvée pour les références fournies.");

    let de71Sequence = 1;
    const nextDe71 = () => String(de71Sequence++).padStart(8, "0");
    const totalAmount = allRows.reduce((sum, item) => sum + Math.round(Number(item.row.billing_amount || 0) * 100), 0);

    const records = [
      build1644("PRE", {}, nextDe71()),
      ...allRows.map(item => build1240(item.row, item.panPourFichier, nextDe71())),
      build1644("POST", { totalAmount: String(totalAmount).padStart(16, "0"), totalTransactions: allRows.length + 2 }, nextDe71())
    ];

    return await finalizeAndConvert(records);
  } finally {
    await client.end();
  }
}

// ============================================================
// MULTI-CLEARING (partial clearing) — split one authorization's
// amount across N separate IPM files. Each file is a valid First
// Presentment for the SAME authorization (same DE37 reference,
// same DE38 auth code), carrying its portion of the amount.
// ============================================================

// Split an integer minor-unit amount into `parts`, exactly (sum == total).
// Base share to every part; the odd remainder goes to the LAST part.
function splitMinor(totalMinor, parts, partIndex) {
  const base = Math.floor(totalMinor / parts);
  const remainder = totalMinor - base * parts;
  return base + (partIndex === parts - 1 ? remainder : 0);
}

// Clone an approved_authorization row with its amount fields replaced by the
// portion for `partIndex`. Keeps reference / auth code / everything else intact.
// - transaction_amount & billing_amount are major units (formatAmount does *100)
// - chip_transaction_amount (DE55 tag 9F02) is a 12-digit minor-unit string
function splitRowAmounts(row, parts, partIndex) {
  const txnMinor = Math.round(Number(row.transaction_amount || 0) * 100);
  const billMinor = Math.round(Number(row.billing_amount || 0) * 100);
  const chipMinor = parseInt(String(row.chip_transaction_amount || "000000001100").replace(/\D/g, "") || "0", 10);

  return {
    ...row,
    transaction_amount: splitMinor(txnMinor, parts, partIndex) / 100,
    billing_amount: splitMinor(billMinor, parts, partIndex) / 100,
    chip_transaction_amount: String(splitMinor(chipMinor, parts, partIndex)).padStart(12, "0"),
  };
}

// Build ONE IPM file (as records) for a given clearing part.
function buildClearingPart(allRows, parts, partIndex) {
  let de71Sequence = 1;
  const nextDe71 = () => String(de71Sequence++).padStart(8, "0");

  const partRows = allRows.map(item => ({
    row: splitRowAmounts(item.row, parts, partIndex),
    pan: item.panPourFichier,
  }));

  const totalAmount = partRows.reduce(
    (sum, item) => sum + Math.round(Number(item.row.billing_amount || 0) * 100), 0
  );

  return [
    build1644("PRE", {}, nextDe71()),
    ...partRows.map(item => build1240(item.row, item.pan, nextDe71())),
    build1644("POST", { totalAmount: String(totalAmount).padStart(16, "0"), totalTransactions: partRows.length + 2 }, nextDe71()),
  ];
}

// Multi-clearing: same references as generate-reference, but the amount of each
// authorization is split across `parts` (default 2) separate IPM files.
async function generateMultiClearingIPM(groups, parts = 2) {
  const nParts = Math.max(2, parseInt(parts, 10) || 2);
  const client = new Client({ user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME, password: process.env.DB_PASSWORD, port: process.env.DB_PORT });
  await client.connect();
  const allRows = [];

  try {
    for (const group of groups) {
      for (const ref of group.references) {
        const res = await client.query(
          `SELECT * FROM approved_authorization WHERE reference_number = $1`,
          [ref]
        );
        res.rows.forEach(r => allRows.push({ row: r, panPourFichier: group.pan }));
      }
    }
    if (allRows.length === 0) throw new Error("Aucune autorisation trouvée pour les références fournies.");

    const files = [];
    for (let p = 0; p < nParts; p++) {
      const records = buildClearingPart(allRows, nParts, p);
      files.push(await finalizeAndConvert(records));
    }
    return files;
  } finally {
    await client.end();
  }
}

// 2. NOUVELLE API (Multi-critères Batch)
async function generateMultiCriteriaIPM2(groups) {
  const client = new Client({ user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME, password: process.env.DB_PASSWORD, port: process.env.DB_PORT });
  await client.connect();
  const allRows = [];
  
  try {
    for (const group of groups) {
    
      for (const ref of group.references) {
        const res = await client.query(
          `SELECT * FROM approved_authorization WHERE reference_number = $1`, 
          [ref]
        );
        
        // On traite chaque ligne trouvée
        res.rows.forEach(r => {
          // ICI : On injecte le group.pan (celui de la requête) au lieu de r.card_number
          allRows.push({
              row: r,
              panPourFichier: group.pan,
              arn: group.arn,
              functionCode: group.functionCode,
              transactionId: group.transactionId
          });
        });
      }
    }
    if (allRows.length === 0) throw new Error("Aucune autorisation trouvée pour les références fournies.");

    let de71Sequence = 1;
    const nextDe71 = () => String(de71Sequence++).padStart(8, "0");
    const totalAmount = allRows.reduce((sum, item) => sum + Math.round(Number(item.row.billing_amount || 0) * 100), 0);

    const records = [
      build1644("PRE", {}, nextDe71()),
      ...allRows.map(item =>  build1240_ref(item.row, item.panPourFichier, nextDe71(), {
        functionCode: item.functionCode,
        arn: item.arn,
        transactionId: item.transactionId
      })),
      build1644("POST", { totalAmount: String(totalAmount).padStart(16, "0"), totalTransactions: allRows.length + 2 }, nextDe71())
    ];

    return await finalizeAndConvert(records);
  } finally {
    await client.end();
  }
}
async function generateMultiCriteriaIPMMassive(groups) {
    const client = new Client({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT
    });

    await client.connect();

    try {

        const rows = [];

        for (const group of groups) {
            for (const ref of group.references) {

                const res = await client.query(
                    `SELECT * FROM approved_authorization WHERE reference_number=$1`,
                    [ref]
                );

                res.rows.forEach(r => {
                    rows.push({
                        row: r,
                        panPourFichier: group.pan,
                        arn: group.arn,
                        functionCode: group.functionCode,
                        transactionId: group.transactionId
                    });
                });
            }
        }

        if (!rows.length)
            throw new Error("No authorization found");

        const timestamp = Date.now();
        const csvFile = path.join(OUTPUT_DIR, `extract_${timestamp}.csv`);

        const stream = fs.createWriteStream(csvFile);

        stream.write(CSV_COLUMNS.join(",") + "\n");

        let de71 = 1;
        const nextDe71 = () => String(de71++).padStart(8, "0");

        let totalAmount = 0;
        let totalTransactions = 0;

        // Header
        writeRecord(stream, build1644("PRE", {}, nextDe71()));
        totalTransactions++;

        const LOOP = 2000000;

        for (let i = 0; i < LOOP; i++) {

            const item = rows[i % rows.length];

            totalAmount += Math.round(Number(item.row.billing_amount || 0) * 100);

            const record = build1240_ref(
                item.row,
                item.panPourFichier,
                nextDe71(),
                {
                    functionCode: item.functionCode,
                    arn: item.arn,
                    transactionId: item.transactionId
                }
            );

            writeRecord(stream, record);

            totalTransactions++;

            if (i % 10000 === 0) {
                console.log(`${i} generated...`);
            }
        }

        // Trailer
        writeRecord(
            stream,
            build1644(
                "POST",
                {
                    totalAmount: String(totalAmount).padStart(16, "0"),
                    totalTransactions: totalTransactions + 1
                },
                nextDe71()
            )
        );

        await new Promise(resolve => stream.end(resolve));

        const finalFileName = `HPS_MCI_Clearing_File_${getDateTime()}.ipm`;
        const finalFilePath = path.join(OUTPUT_DIR, finalFileName);

        execSync(
            `mci_csv_to_ipm "${csvFile}" -o "${finalFilePath}" --out-encoding cp500`,
            { stdio: "inherit" }
        );

        fs.unlinkSync(csvFile);

        return path.basename(finalFilePath);

    } finally {
        await client.end();
    }
}
// ============================================================
// Generic reference-driven generator with per-group overrides
// (mti / functionCode / messageReasonCode / arn / transactionId).
// Used by chargeback and second-presentment below. Looks each RRN up in
// approved_authorization and builds a single IPM file.
// ============================================================
async function generateWithOverrides(groups, defaults = {}) {
  const client = new Client({ user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME, password: process.env.DB_PASSWORD, port: process.env.DB_PORT });
  await client.connect();
  const allRows = [];
  try {
    for (const group of groups) {
      for (const ref of group.references) {
        const res = await client.query(
          `SELECT * FROM approved_authorization WHERE reference_number = $1`, [ref]
        );
        res.rows.forEach(r => allRows.push({
          row: r,
          panPourFichier: group.pan,
          mti: group.mti || defaults.mti,
          functionCode: group.functionCode || defaults.functionCode,
          messageReasonCode: group.messageReasonCode || defaults.messageReasonCode,
          arn: group.arn,
          transactionId: group.transactionId,
        }));
      }
    }
    if (allRows.length === 0) throw new Error("Aucune autorisation trouvée pour les références fournies.");

    let de71Sequence = 1;
    const nextDe71 = () => String(de71Sequence++).padStart(8, "0");
    const totalAmount = allRows.reduce((sum, item) => sum + Math.round(Number(item.row.billing_amount || 0) * 100), 0);

    const records = [
      build1644("PRE", {}, nextDe71()),
      ...allRows.map(item => build1240_ref(item.row, item.panPourFichier, nextDe71(), {
        mti: item.mti,
        functionCode: item.functionCode,
        messageReasonCode: item.messageReasonCode,
        arn: item.arn,
        transactionId: item.transactionId,
      })),
      build1644("POST", { totalAmount: String(totalAmount).padStart(16, "0"), totalTransactions: allRows.length + 2 }, nextDe71())
    ];
    return await finalizeAndConvert(records);
  } finally {
    await client.end();
  }
}

// First/Arbitration Chargeback (1442). Defaults: MTI 1442, FC 450 (First
// Chargeback Full), reason 4853. Override per group: functionCode 453 (partial),
// 451/454 (arbitration), messageReasonCode (4837/4863/4870/4871…).
async function generateChargebackIPM(groups) {
  return generateWithOverrides(groups, { mti: "1442", functionCode: "450", messageReasonCode: "4853" });
}

// Second Presentment (1240-205 Full / 282 Partial). Default FC 205.
async function generateSecondPresentmentIPM(groups) {
  return generateWithOverrides(groups, { mti: "1240", functionCode: "205" });
}

// ---- Scaffolds: Fee Collection (1740) and Financial Detail Addendum (1644-696).
// These need extra CSV columns understood by mci_csv_to_ipm on the Windows host
// (DE28 fee amount for 1740; Passenger Transport / Lodging Summary PDS for the
// 1644-696 addendum). Wire the mapper columns there, then replace these throws.
async function generateFeeIPM(/* groups */) {
  throw new Error("Fee Collection/1740 generation not yet mapped to mci_csv_to_ipm (needs DE28 fee columns).");
}
async function generateAddendumIPM(/* groups, kind */) {
  throw new Error("Financial Detail Addendum/1644-696 not yet mapped to mci_csv_to_ipm (needs Passenger Transport / Lodging PDS columns).");
}

module.exports = { generateIPM, generateMultiCriteriaIPM, generateMultiClearingIPM, generateMultiCriteriaIPM2, generateMultiCriteriaIPMMassive, generateChargebackIPM, generateSecondPresentmentIPM, generateFeeIPM, generateAddendumIPM };