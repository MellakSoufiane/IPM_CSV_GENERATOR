// mapper1240.js

function pad(val, len) {
  return (val ?? "").toString().padEnd(len, " ");
}

function formatAmount(val) {
  if (val === null || val === undefined) return "000000000000";
  return String(Math.round(Number(val) * 100)).padStart(12, "0");
}

function formatDatetime(date) {
  if (!date) return "0000-00-00 00:00:00";
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

// Construction de la chaîne TLV (Tag-Length-Value) pour la DE55
function buildEMV(tags) {
  let iccData = "";
  for (const [tag, value] of Object.entries(tags)) {
    if (!value) continue;
    // Calcul de la longueur en octets (hex), paddée sur 2 caractères
    const lenHex = (value.length / 2).toString(16).padStart(2, "0");
    iccData += `${tag}${lenHex}${value}`.toLowerCase();
  }
  return iccData;
}

// Fonction utilitaire pour formater correctement les PDS dans la DE48
function buildPDSString(tag, value) {
  if (!value) return "";
  const len = String(value.length).padStart(3, "0");
  return `${tag}${len}${value}`;
}

let acquirerSequenceNumber = 23958022189;

function build1240(row, inputPan, de71) {
  const now = new Date();
  const yearDigit = String(now.getFullYear()).slice(-1);
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = String(Math.floor((now - startOfYear) / 86400000)).padStart(3, "0");
  const seq = String(acquirerSequenceNumber++);
  const chk = String(Math.floor(Math.random() * 10));

  // Préparation des tags EMV
  const emvTags = {
    "82": "5C00",
    "84": "A0000000041010",
    "95": "0000000000",
    "9A": "260615", // YYMMDD
    "9C": "00",
    "5F2A": "0036",
    "5F34": "00",
    "9F02": row.chip_transaction_amount || "000000001100",
    "9F03": "000000000000",
    "9F10": row.chip_issuer_application_data || "0110250000044000DAC10000000000000000",
    "9F1A": "0840",
    "9F1E": "3132333435363738",
    "9F26": row.chip_application_cryptogram || "C7489033388962B5",
    "9F27": "80",
    "9F33": "FFFFFF",
    "9F34": "000000",
    "9F35": "00",
    "9F36": "042C",
    "9F37": row.chip_unpredictable_number || "72993948"
  };

  // Construction de la chaîne DE48 complète (Format: Tag + Longueur + Valeur)
  let de48FullString = "";
  de48FullString += buildPDSString("0023", "CT2");
  de48FullString += buildPDSString("0148", "0362");
  de48FullString += buildPDSString("0158", "DMC       75");
  de48FullString += buildPDSString("0165", "M");
  de48FullString += buildPDSString("0170", "0328005556666      8005556666      "); 
  de48FullString += buildPDSString("0189", "2TL011 2345556789 MN087 Creditville  NZL");

  return {
    MTI: "1240",
    DE2: inputPan || "5367635001039824",
    DE3: (row.processing_code || "000000").toString().padEnd(6, "0"),
    DE4: formatAmount(row.transaction_amount),
    DE12: formatDatetime(row.transaction_local_date),
    DE14: "2512", // YYMM formaté
    DE22: (row.pos_data || "000000000000").slice(0, 12),
    DE23: "001",
    DE24: "200",
    DE25: "1401",
    DE26: row.card_acceptor_activity || "5542",
    DE30: "000000010000000000000000",
    DE31: `0230120${yearDigit}${dayOfYear}${seq}${chk}`, // Concaténation des sous-éléments
    DE33: row.acquirer_institution_code || "002108",
    DE37: row.reference_number || "000000000000",
    DE38: row.authorization_code || "030160",
    DE40: "100",
    DE41: row.card_acceptor_term_id || "03350022",
    DE42: pad(row.card_acceptor_id, 15),
    
    // Découpage direct de la DE43 pour les colonnes CSV
    DE43_NAME: "BP CONNECT RIVERSIDE",
    DE43_SUBURB: "WHANGAREI",
    DE43_POSTCODE: "0112",
    
    DE48: de48FullString, // On injecte la chaîne concaténée ici
    DE49: row.transaction_currency || "036",
    DE50: "036",
    DE63: " " + (row.transaction_id || "MCC6100AA0601  "),
    DE71: de71,
    DE73: row.reason_code || "010101",
    DE93: "035083",
    DE94: "00000002108",
    DE95: "",
    DE100: "",
    
    // Aplatissement des PDS
    PDS0023: "CT2",
    PDS0052: "",
    PDS0122: "",
    PDS0148: "0362",
    PDS0158: "DMC       75",
    PDS0165: "M",
    
    // Génération finale du string EMV hexadécimal
    ICC_DATA: buildEMV(emvTags)
  };
}

module.exports = { build1240 };