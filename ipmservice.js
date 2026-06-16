// ipmservice.js
require("dotenv").config();

const { Client } = require("pg");
const fs = require("fs");
const { execSync } = require("child_process");

const { build1240 } = require("./mapper1240");
const { build1644 } = require("./mapper1644");

// Colonnes exactes attendues par cardutil
const CSV_COLUMNS = [
  "MTI","DE2","DE3","DE4","DE12","DE14","DE22","DE23","DE24","DE25","DE26",
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

async function generateIPM(pan, aliaspan) {
  if (!aliaspan || !pan) throw new Error("alias_pan and pan are required");

  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
  });

  await client.connect();

  try {
    const cardRes = await client.query(
      `SELECT card_number FROM card WHERE alias_pan = $1`, [aliaspan]
    );

    if (cardRes.rows.length === 0) throw new Error("No card found");
    const tokenpan = cardRes.rows[0].card_number;

    const res = await client.query(
      `SELECT * FROM approved_authorization WHERE card_number = $1`, [tokenpan]
    );
    const rows = res.rows;
    if (!rows.length) throw new Error("No authorization found");

    const totalTransactions = rows.length + 2;
    const totalAmountMinorUnits = rows.reduce((sum, row) => sum + Math.round(Number(row.billing_amount || 0) * 100), 0);
    const formattedTotal = String(totalAmountMinorUnits).padStart(16, "0");

    let de71Sequence = 1;
    const nextDe71 = () => String(de71Sequence++).padStart(8, "0");

    // 1. Construction du tableau d'objets plats
    const records = [
      build1644("PRE", {}, nextDe71()),
      ...rows.map(row => build1240(row, pan, nextDe71())),
      build1644("POST", { totalAmount: formattedTotal, totalTransactions }, nextDe71())
    ];

    // 2. Conversion en format CSV
    let csvContent = CSV_COLUMNS.join(",") + "\n";
    
    records.forEach(record => {
      const rowArr = CSV_COLUMNS.map(col => {
        let val = record[col] !== undefined ? record[col] : "";
        // Sécuriser les champs contenant des virgules
        if (String(val).includes(",")) val = `"${val}"`; 
        return val;
      });
      csvContent += rowArr.join(",") + "\n";
    });

    const timestamp = Date.now();
    const csvFile = `extract_${timestamp}.csv`;
    fs.writeFileSync(csvFile, csvContent);
    console.log(`Fichier CSV généré : ${csvFile}`);

    // 3. Appel de cardutil pour générer l'IPM EBCDIC
    const finalFile = `HPS_MCI_Clearing_File_${getDateTime()}.ipm`;

    console.log("Conversion du CSV vers IPM via cardutil...");
    execSync(
      `mci_csv_to_ipm ${csvFile} -o ${finalFile} --out-encoding cp500`,
      { stdio: "inherit" }
    );

    // Nettoyage du fichier CSV intermédiaire
    fs.unlinkSync(csvFile);

    return finalFile;

  } finally {
    await client.end();
  }
}

module.exports = { generateIPM };