// index.js
require("dotenv").config();
const express = require("express");
const { generateIPM,generateMultiCriteriaIPM, generateMultiClearingIPM, generateMultiCriteriaIPM2 ,generateMultiCriteriaIPMMassive, generateChargebackIPM, generateSecondPresentmentIPM, generateFeeIPM, generateAddendumIPM } = require("./ipmservice");
const { log, logError } = require("./logger");

const app = express();
app.use(express.json({ limit: "50mb" })); // Pour intercepter le format JSON (jusqu'à 50 Mo)

// ==========================================
// ENDPOINT (Isolé - CARD ALIAS PAN Criteria)
// ==========================================
app.post("/api/v1/clearing/generate", async (req, res) => {
  const { pan, aliasPan } = req.body;
  const requestStartedAt = Date.now();
  const maskedPan = pan ? pan.replace(/.(?=.{4})/g, "*") : pan;

  log(`➡️  [REQUEST] POST /api/v1/clearing/generate | pan=${maskedPan} | aliasPan=${aliasPan}`);

  // Validation basique des entrées
  if (!pan || !aliasPan) {
    log(`⬅️  [RESPONSE] POST /api/v1/clearing/generate | status=400 | error=missing_params`);
    return res.status(400).json({
      success: false,
      error: "Paramètres 'pan' et 'aliasPan' requis dans le corps de la requête."
    });
  }

  try {
    console.log(`🚀 Requête reçue pour le PAN: ${maskedPan}`);
    const fileName = await generateIPM(pan, aliasPan);
    const durationMs = Date.now() - requestStartedAt;

    log(`⬅️  [RESPONSE] POST /api/v1/clearing/generate | status=200 | duration=${durationMs}ms | file=${fileName}`);
    return res.status(200).json({
      success: true,
      message: "Fichier de clearing IPM généré avec succès.",
      file: fileName
    });
  } catch (error) {
    const durationMs = Date.now() - requestStartedAt;
    logError("❌ Erreur service:", error.message);
    log(`⬅️  [RESPONSE] POST /api/v1/clearing/generate | status=500 | duration=${durationMs}ms | error=${error.message}`);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// NOUVEAU ENDPOINT (Isolé - Multi-critères Batch)
// ==========================================
app.post("/api/v1/clearing/generate-reference", async (req, res) => {
  // On s'attend directement à un tableau d'objets comme vous l'avez défini
  const groups = req.body;
  const requestStartedAt = Date.now();
  const totalReferences = Array.isArray(groups) ? groups.reduce((n, g) => n + (g && g.references ? g.references.length : 0), 0) : 0;

  log(`➡️  [REQUEST] POST /api/v1/clearing/generate-reference | groups=${Array.isArray(groups) ? groups.length : "?"} | totalReferences=${totalReferences}`);

  if (!groups || !Array.isArray(groups)) {
    log(`⬅️  [RESPONSE] POST /api/v1/clearing/generate-reference | status=400 | error=invalid_format`);
    return res.status(400).json({ success: false, error: "Format invalide : attend un tableau d'objets." });
  }

  try {
    const fileName = await generateMultiCriteriaIPM(groups);
    const durationMs = Date.now() - requestStartedAt;

    log(`⬅️  [RESPONSE] POST /api/v1/clearing/generate-reference | status=200 | duration=${durationMs}ms | file=${fileName}`);
    return res.status(200).json({ success: true, file: fileName });
  } catch (error) {
    const durationMs = Date.now() - requestStartedAt;
    logError("❌ Erreur service:", error.message);
    log(`⬅️  [RESPONSE] POST /api/v1/clearing/generate-reference | status=500 | duration=${durationMs}ms | error=${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// NOUVEAU ENDPOINT (Isolé - Multi-critères Batch)
// ==========================================
app.post("/api/v2/clearing/generate-reference", async (req, res) => {
  // On s'attend directement à un tableau d'objets comme vous l'avez défini
  const groups = req.body; 

  if (!groups || !Array.isArray(groups)) {
    return res.status(400).json({ success: false, error: "Format invalide : attend un tableau d'objets." });
  }

  try {
    console.log(`🚀 Traitement de ${groups.length} groupes de transactions...`);
    const fileName = await generateMultiCriteriaIPM2(groups);
    
    return res.status(200).json({ success: true, file: fileName });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});


// ==========================================
// MULTI-CLEARING (partial clearing): split each authorization's
// amount across N (default 2) separate IPM files. Returns files:[...]
// Body: [{ pan, references:[...] }]  (optional top-level ?parts=2)
// ==========================================
app.post("/api/v1/clearing/generate-multiclearing", async (req, res) => {
  const groups = req.body;
  const parts = parseInt(req.query.parts, 10) || 2;

  if (!groups || !Array.isArray(groups)) {
    return res.status(400).json({ success: false, error: "Format invalide : attend un tableau d'objets." });
  }

  try {
    console.log(`🚀 Multi-clearing: ${groups.length} groupe(s), ${parts} fichiers...`);
    const files = await generateMultiClearingIPM(groups, parts);
    return res.status(200).json({ success: true, files });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/v3/clearing/generate-massive", async (req, res) => {

  const { groups, numberOfTransactions = 2000000 } = req.body;

  if (!groups || !Array.isArray(groups)) {
    return res.status(400).json({
      success: false,
      error: "Le champ 'groups' doit être un tableau."
    });
  }

  try {

    console.log(`🚀 Génération de ${numberOfTransactions.toLocaleString()} transactions...`);

    const fileName = await generateMultiCriteriaIPMMassive(
      groups,
      numberOfTransactions
    );

    res.json({
      success: true,
      file: fileName
    });

  } catch (e) {

    res.status(500).json({
      success: false,
      error: e.message
    });

  }

});
// ==========================================
// Chargeback (1442) — Body: [{ pan, references:[...], functionCode?, messageReasonCode? }]
// ==========================================
app.post("/api/v1/clearing/generate-chargeback", async (req, res) => {
  const groups = req.body;
  if (!groups || !Array.isArray(groups)) {
    return res.status(400).json({ success: false, error: "Format invalide : attend un tableau d'objets." });
  }
  try {
    const file = await generateChargebackIPM(groups);
    return res.status(200).json({ success: true, file });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Second Presentment (1240-205/282) — Body: [{ pan, references:[...], functionCode? }]
// ==========================================
app.post("/api/v1/clearing/generate-second-presentment", async (req, res) => {
  const groups = req.body;
  if (!groups || !Array.isArray(groups)) {
    return res.status(400).json({ success: false, error: "Format invalide : attend un tableau d'objets." });
  }
  try {
    const file = await generateSecondPresentmentIPM(groups);
    return res.status(200).json({ success: true, file });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Fee Collection (1740) — scaffold (needs mci_csv_to_ipm DE28 columns)
// ==========================================
app.post("/api/v1/clearing/generate-fee", async (req, res) => {
  const groups = req.body;
  if (!groups || !Array.isArray(groups)) {
    return res.status(400).json({ success: false, error: "Format invalide : attend un tableau d'objets." });
  }
  try {
    const file = await generateFeeIPM(groups);
    return res.status(200).json({ success: true, file });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Financial Detail Addendum (1644-696) — scaffold. ?kind=lodging|passenger
// ==========================================
app.post("/api/v1/clearing/generate-addendum", async (req, res) => {
  const groups = req.body;
  const kind = req.query.kind || "generic";
  if (!groups || !Array.isArray(groups)) {
    return res.status(400).json({ success: false, error: "Format invalide : attend un tableau d'objets." });
  }
  try {
    const file = await generateAddendumIPM(groups, kind);
    return res.status(200).json({ success: true, file });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✨ Service de génération IPM actif sur le port ${PORT}`);
});