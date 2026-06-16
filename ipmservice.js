// ipmservice.js
require("dotenv").config();

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { build1240 } = require("./mapper1240");
const { build1644 } = require("./mapper1644");

// Chemin vers le dossier de sortie
const OUTPUT_DIR = "C:\\Users\\Public\\CBA\\IPM_CSV_GENERATOR\\output";

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
  
  return finalFilePath; // Retourne le chemin complet du fichier généré
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

module.exports = { generateIPM, generateMultiCriteriaIPM };