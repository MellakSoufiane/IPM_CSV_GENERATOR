// mapper1644.js

// Fonction utilitaire pour obtenir la date au format AAMMJJ
function formatDateToYYMMDD() {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function build1644(type, trailerData = {}, de71) {
  const today = formatDateToYYMMDD(); // La fonction est maintenant reconnue

  const base = {
    MTI: "1644",
    DE71: de71,
  };

  if (type === "PRE") {
    const pds0105Value = `002${today}0000001862200001`;
    const pds0122Value = "T";
    
    // Concaténation format IPM : Tag(4) + Longueur(3) + Valeur
    const pds0105String = `0105${String(pds0105Value.length).padStart(3, "0")}${pds0105Value}`;
    const pds0122String = `0122${String(pds0122Value.length).padStart(3, "0")}${pds0122Value}`;

    return {
      ...base,
      DE24: "697",
      DE48: pds0105String + pds0122String, // Envoi direct dans la colonne DE48
      PDS0122: "T" // Remplissage de la colonne spécifique si requise
    };
  }

  // POST
  const totAmt = String(trailerData.totalAmount || 0).padStart(16, "0");
  const totTx = String(trailerData.totalTransactions || 0).padStart(8, "0");
  
  const pds0301String = `0301${String(totAmt.length).padStart(3, "0")}${totAmt}`;
  const pds0306String = `0306${String(totTx.length).padStart(3, "0")}${totTx}`;

  return {
    ...base,
    DE24: "695",
    DE48: pds0301String + pds0306String,
    PDS0301: totAmt,
    PDS0306: totTx
  };
}

module.exports = { build1644 };