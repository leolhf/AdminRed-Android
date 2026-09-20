/**
 * keys.js — Constantes de storage centralizadas.
 * Debe cargar antes de cualquier módulo que use localStorage/IndexedDB.
 */
const STORAGE_KEYS = {
  DATA: 'adminred:data',        // blob principal (respaldo en localStorage)
  CONFIG: 'adminred:config',
  THEME: 'adminred:theme',
  PIN: 'adminred:pin',
  VERSION: 'adminred:version',
  FILE_ENCRYPTED: 'adminred:encrypted',
  RECIBO_COUNTER: 'adminred:recibo-counter',
  MES_ACTUAL: 'adminred:mes-actual',
  WA_TEMPLATES: 'adminred:wa-templates'
};

const IDB = {
  NAME: 'adminred-db',
  VERSION: 1,
  STORE_FILE: 'file-handle'   // guarda el handle del archivo (File System Access API)
};

const ENCRYPTION = {
  ALGO: 'AES-GCM',
  KEY_LEN: 256,
  IV_LEN: 12,
  SALT_LEN: 16,
  ITERATIONS: 600000,    // v5.11.2: OWASP 2025 recomienda >=600.000 para SHA-256
  PIN_ITERATIONS: 600000 // iteraciones para el hash del PIN (PBKDF2)
};
