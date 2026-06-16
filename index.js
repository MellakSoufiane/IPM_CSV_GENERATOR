// index.js
require("dotenv").config();
const express = require("express");
const { generateIPM,generateMultiCriteriaIPM } = require("./ipmservice");

const app = express();
app.use(express.json()); // Pour intercepter le format JSON

// ==========================================
// ENDPOINT (Isolé - CARD ALIAS PAN Criteria)
// ==========================================
app.post("/api/v1/clearing/generate", async (req, res) => {
  const { pan, aliasPan } = req.body;

  // Validation basique des entrées
  if (!pan || !aliasPan) {
    return res.status(400).json({ 
      success: false, 
      error: "Paramètres 'pan' et 'aliasPan' requis dans le corps de la requête." 
    });
  }

  try {
    console.log(`🚀 Requête reçue pour le PAN: ${pan.replace(/.(?=.{4})/g, "*")}`);
    const fileName = await generateIPM(pan, aliasPan);
    
    return res.status(200).json({
      success: true,
      message: "Fichier de clearing IPM généré avec succès.",
      file: fileName
    });
  } catch (error) {
    console.error("❌ Erreur service:", error.message);
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

  if (!groups || !Array.isArray(groups)) {
    return res.status(400).json({ success: false, error: "Format invalide : attend un tableau d'objets." });
  }

  try {
    console.log(`🚀 Traitement de ${groups.length} groupes de transactions...`);
    const fileName = await generateMultiCriteriaIPM(groups);
    
    return res.status(200).json({ success: true, file: fileName });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✨ Service de génération IPM actif sur le port ${PORT}`);
});