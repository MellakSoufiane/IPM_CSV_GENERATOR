// index.js
require("dotenv").config();
const express = require("express");
const { generateIPM } = require("./ipmservice");

const app = express();
app.use(express.json()); // Pour intercepter le format JSON

// Endpoint pour déclencher la génération du clearing
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✨ Service de génération IPM actif sur le port ${PORT}`);
});