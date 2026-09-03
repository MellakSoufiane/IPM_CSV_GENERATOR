function formatAmount(val) {
  if (val === null || val === undefined || val === "") return "000000000000";
  const minor = Math.round(Number(val) * 100);
  return String(minor).padStart(12, "0");
}

function build1740({
  feeAmount = 11.26,
  pan = "",
  de71 = 282034,
  messageNumber,
  de31 = "013275",
  de33 = "035083",
  de37 = "000000000000",
  de38 = "260816",
  de49 = "840",
  de50 = "036",
  de93 = "035083",
  de94 = "013275",
  de48 = "001500726081600137017667000000000000000148008840203620158031DMC1010401  26081701    NNNNNNN015906735083      0620670011190071            1AP00000002M26081701260817010165001M01910012",
  pds0158 = "DMC1010401  26081701    NNNNNNN",
  iccData = "",
  de43Name = "",
  de43Suburb = "",
  de43Postcode = "",
} = {}) {
  const finalDe71 = String(messageNumber ?? de71).padStart(6, "0");

  return {
    MTI: "1740",
    DE2: pan,
    DE3: "190000",
    DE4: formatAmount(feeAmount),
    DE5: "",
    DE6: "",
    DE12: "",
    DE14: "",
    DE22: "",
    DE23: "",
    DE24: "783",
    DE25: "7800",
    DE26: "",
    DE30: "",
    DE31: de31,
    DE33: de33,
    DE37: de37,
    DE38: de38,
    DE40: "",
    DE41: "",
    DE42: "",
    DE48: de48,
    DE49: de49,
    DE50: de50,
    DE63: "",
    DE71: finalDe71,
    DE73: "",
    DE93: de93,
    DE94: de94,
    DE95: "",
    DE100: "",
    PDS0023: "",
    PDS0052: "",
    PDS0122: "",
    PDS0148: "",
    PDS0158: pds0158,
    PDS0165: "",
    DE43_NAME: de43Name,
    DE43_SUBURB: de43Suburb,
    DE43_POSTCODE: de43Postcode,
    ICC_DATA: iccData,
  };
}

module.exports = { build1740 };
