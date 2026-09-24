// record.js
// TQR4 fixed-width record builder (804 chars per record)

// key, start (1-based), length, type (n = numeric, a = alpha, ans = alphanumeric+special)
const FIELDS = [
  { key: 'fileId',                    start: 1,   len: 25,  type: 'n' },
  { key: 'messageNumber',             start: 26,  len: 8,   type: 'n' },
  { key: 'claimId',                   start: 34,  len: 19,  type: 'n' },
  { key: 'eventId',                   start: 53,  len: 19,  type: 'n' },
  { key: 'cycleId',                   start: 72,  len: 10,  type: 'n' },
  { key: 'arn',                       start: 82,  len: 23,  type: 'n' },
  { key: 'mti',                       start: 105, len: 4,   type: 'n' },
  { key: 'pan',                       start: 109, len: 19,  type: 'n', variable: true },
  { key: 'processingCode',            start: 128, len: 6,   type: 'n' },
  { key: 'functionCode',              start: 134, len: 3,   type: 'n' },
  { key: 'messageReasonCode',         start: 137, len: 4,   type: 'n' },
  { key: 'amountTransaction',         start: 141, len: 12,  type: 'n' },
  { key: 'amountReconciliation',      start: 153, len: 12,  type: 'n' },
  { key: 'amountCardholderBilling',   start: 165, len: 12,  type: 'n' },
  { key: 'transactionCurrency',       start: 177, len: 3,   type: 'n' },
  { key: 'reconciliationCurrency',    start: 180, len: 3,   type: 'n' },
  { key: 'cardholderBillingCurrency', start: 183, len: 3,   type: 'n' },
  { key: 'currencyExponent49',        start: 186, len: 4,   type: 'n' },
  { key: 'currencyExponent50',        start: 190, len: 4,   type: 'n' },
  { key: 'currencyExponent51',        start: 194, len: 4,   type: 'n' },
  { key: 'rrn',                       start: 198, len: 12,  type: 'ans' },
  { key: 'mcc',                       start: 210, len: 4,   type: 'n' },
  { key: 'cardAcceptorId',            start: 214, len: 15,  type: 'ans' },
  { key: 'cardAcceptorName',          start: 229, len: 22,  type: 'ans' },
  { key: 'transactionDateTime',       start: 251, len: 12,  type: 'n' },
  { key: 'originatorInstId',          start: 263, len: 11,  type: 'n', variable: true },
  { key: 'destinationInstId',         start: 274, len: 11,  type: 'n', variable: true },
  { key: 'transactionStatus',         start: 285, len: 7,   type: 'a' },
  { key: 'reasonForRejection',        start: 292, len: 512, type: 'ans', variable: true },
  { key: 'reversalFlag',              start: 804, len: 1,   type: 'a' },
];

const RECORD_LENGTH = 804;

const OVERRIDABLE = new Set([
  'arn', 'mti', 'processingCode', 'functionCode', 'messageReasonCode',
  'amountTransaction', 'amountReconciliation', 'amountCardholderBilling',
  'transactionCurrency', 'rrn', 'mcc',
]);

// Default values (from the shared list). Anything not sent in the payload uses these.
const DEFAULTS = {
  fileId: '9062509250000001906700009',
  messageNumber: '00002036',
  claimId: '0000000200232391653',
  eventId: '0000000300232391656',
  cycleId: '9001524731',
  arn: '02301206188239580221895',
  mti: '1442',
  pan: '5367635001038156',
  processingCode: '000000',
  functionCode: '453',
  messageReasonCode: '4834',
  amountTransaction: '000000002100',
  amountReconciliation: '000000000100',
  amountCardholderBilling: '000000000100',
  transactionCurrency: '036',
  reconciliationCurrency: '036',
  cardholderBillingCurrency: '036',
  currencyExponent49: '0362',
  currencyExponent50: '0362',
  currencyExponent51: '0362',
  rrn: '            ',
  mcc: '4722',
  cardAcceptorId: 'Merchant termin',
  cardAcceptorName: 'AUS Purchase',
  transactionDateTime: '260615094707',
  originatorInstId: '00000035083',
  destinationInstId: '00000999674',
  transactionStatus: 'SUCCESS',
  reasonForRejection: '',
  reversalFlag: '',
};

const VALID_KEYS = new Set(FIELDS.map((f) => f.key));

function format(field, raw) {
  const v = raw === undefined || raw === null ? '' : String(raw);
  if (v.length > field.len) {
    throw new Error(`Field "${field.key}" too long: ${v.length} > ${field.len} ("${v}")`);
  }
  if (field.type === 'n') {
    if (v !== '' && !/^\d+$/.test(v)) {
      throw new Error(`Field "${field.key}" must be numeric, got "${v}"`);
    }
    // Numeric fixed: right-justified, zero-filled.
    // Numeric variable (PAN, institution IDs): left-justified, space-filled.
    return field.variable ? v.padEnd(field.len, ' ') : v.padStart(field.len, '0');
  }
  if (field.type === 'a' && v !== '' && !/^[A-Za-z ]+$/.test(v)) {
    throw new Error(`Field "${field.key}" must be alphabetic, got "${v}"`);
  }
  // Alpha / alphanumeric: left-justified, space-filled
  return v.padEnd(field.len, ' ');
}

function buildRecord(row) {
  let line = '';
  for (const f of FIELDS) {
    if (line.length !== f.start - 1) {
      throw new Error(`Position mismatch at "${f.key}": expected start ${f.start}, got ${line.length + 1}`);
    }
    line += format(f, row[f.key]);
  }
  if (line.length !== RECORD_LENGTH) {
    throw new Error(`Record length ${line.length}, expected ${RECORD_LENGTH}`);
  }
  return line;
}

module.exports = { FIELDS, RECORD_LENGTH, DEFAULTS, VALID_KEYS, buildRecord };