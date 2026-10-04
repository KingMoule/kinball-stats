/* faux-google.mjs — faux services Google (SpreadsheetApp, DriveApp, LockService, PropertiesService,
   ContentService, Utilities) en mémoire, qui notent chaque appel. Sert à exécuter Logique.gs et
   Code.gs SOUS NODE, tels quels, sans compte Google : par les tests (tests/local/collecte.test.mjs)
   et par le faux serveur local (collecte/faux-serveur.mjs).
   Toute méthode qui effacerait, viderait, remplacerait ou mettrait à la corbeille est notée
   puis fait échouer l'appel : le script ne doit jamais s'en servir. */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

export const METHODES_INTERDITES = [
  'deleteRow', 'deleteRows', 'deleteColumn', 'deleteColumns', 'deleteSheet', 'clear', 'clearContent', 'clearContents',
  'clearFormats', 'clearNote', 'setValue', 'setValues', 'setFormula', 'setFormulas', 'removeRows', 'setTrashed', 'setContent',
  'setName', 'moveTo', 'makeCopy', 'deleteProperty', 'deleteAllProperties', 'setProperties', 'removeFile', 'removeFolder',
  'getBlob', 'setSharing', 'addEditor', 'addViewer', 'replaceText', 'trashFile', 'remove'
];

/* Enveloppe un objet : chaque méthode appelée est consignée ; une méthode interdite est consignée puis lève une erreur. */
function espion(nom, objet, journal) {
  return new Proxy(objet, {
    get(cible, prop, rec) {
      const v = Reflect.get(cible, prop, rec);
      if (typeof prop === 'symbol') return v;
      if (METHODES_INTERDITES.includes(prop)) {
        return (...args) => { journal.push({ objet: nom, methode: prop, interdite: true, args }); throw new Error('Appel interdit : ' + nom + '.' + prop); };
      }
      if (typeof v !== 'function') return v;
      return (...args) => { journal.push({ objet: nom, methode: prop, args }); return v.apply(cible, args); };
    }
  });
}

/* Crée un « monde » : un contexte vm contenant Logique.gs + Code.gs et les faux services. */
export function creerMonde(opts = {}) {
  const journal = [];
  const etat = {
    maintenant: opts.maintenant || (() => new Date()),
    verrouPris: false,
    avantEcriture: null,     // rappel appelé une fois, juste avant la prochaine écriture (simulation d'un envoi simultané)
    enLecture: null,         // rappel appelé à chaque getValues (pour simuler un envoi simultané)
    feuilles: {},            // nom -> {lignes: [[...]], formats: []}
    fichiers: [],            // {id, nom, contenu, dossier}
    dossiers: [],            // {id, nom}
    proprietes: {},
    prochainId: 1,
    classeurId: 'CLASSEUR_FAUX_1'
  };
  const id = (p) => p + '_' + (etat.prochainId++);

  function creerFeuille(nom) {
    const d = { lignes: [], formats: [] };
    etat.feuilles[nom] = d;
    const feuille = {
      getName: () => nom,
      getLastRow: () => d.lignes.length,
      getMaxRows: () => Math.max(1000, d.lignes.length),
      appendRow: (ligne) => { if (etat.avantEcriture) { const f = etat.avantEcriture; etat.avantEcriture = null; f(); } d.lignes.push(ligne.slice()); return feuille; },
      getRange: (r, c, nr = 1, nc = 1) => espion('plage', {
        getValues: () => {
          if (etat.enLecture) { const f = etat.enLecture; f(); }
          const sortie = [];
          for (let i = 0; i < nr; i++) { const lig = d.lignes[r - 1 + i] || []; const out = []; for (let j = 0; j < nc; j++) out.push(lig[c - 1 + j] === undefined ? '' : lig[c - 1 + j]); sortie.push(out); }
          return sortie;
        },
        setNumberFormat: (f) => { d.formats.push(f); }
      }, journal)
    };
    return espion('feuille:' + nom, feuille, journal);
  }
  const feuillesObj = {};
  const classeur = {
    getId: () => etat.classeurId,
    getSheetByName: (n) => (etat.feuilles[n] ? feuillesObj[n] : null),
    insertSheet: (n) => { feuillesObj[n] = creerFeuille(n); return feuillesObj[n]; }
  };
  const classeurEspion = espion('classeur', classeur, journal);

  const SpreadsheetApp = espion('SpreadsheetApp', {
    getActiveSpreadsheet: () => classeurEspion,
    openById: (i) => { if (i !== etat.classeurId) throw new Error('classeur inconnu'); return classeurEspion; }
  }, journal);

  const dossierObj = (d) => espion('dossier', {
    getId: () => d.id,
    getFilesByName: (nom) => { const l = etat.fichiers.filter(f => f.dossier === d.id && f.nom === nom); let k = 0; return { hasNext: () => k < l.length, next: () => fichierObj(l[k++]) }; },
    createFile: (nom, contenu, mime) => { if (etat.avantEcriture) { const g = etat.avantEcriture; etat.avantEcriture = null; g(); } const f = { id: id('FICHIER'), nom, contenu, mime, dossier: d.id }; etat.fichiers.push(f); return fichierObj(f); }
  }, journal);
  const fichierObj = (f) => espion('fichier', { getId: () => f.id, getName: () => f.nom }, journal);
  const DriveApp = espion('DriveApp', {
    createFolder: (nom) => { const d = { id: id('DOSSIER'), nom }; etat.dossiers.push(d); return dossierObj(d); },
    getFolderById: (i) => { const d = etat.dossiers.find(x => x.id === i); if (!d) throw new Error('dossier inconnu'); return dossierObj(d); }
  }, journal);

  const LockService = espion('LockService', {
    getScriptLock: () => espion('verrou', {
      tryLock: () => { if (etat.verrouPris) return false; etat.verrouPris = true; return true; },
      releaseLock: () => { etat.verrouPris = false; }
    }, journal)
  }, journal);

  const PropertiesService = espion('PropertiesService', {
    getScriptProperties: () => espion('proprietes', {
      getProperty: (k) => (k in etat.proprietes ? etat.proprietes[k] : null),
      setProperty: (k, v) => { etat.proprietes[k] = String(v); }
    }, journal)
  }, journal);

  const ContentService = {
    MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
    createTextOutput: (texte) => { const o = { texte, mime: null, getContent: () => texte, getMimeType: () => o.mime, setMimeType: (m) => { o.mime = m; return o; } }; return o; }
  };

  const ctx = vm.createContext({ SpreadsheetApp, DriveApp, LockService, PropertiesService, ContentService, console, Uint8Array, Uint32Array, Date, JSON, Math, Array, Object, String, Number, RegExp, Error, isFinite });
  // Pas de « module » : on exécute les .gs comme Apps Script (même espace de noms global).
  for (const f of ['Logique.gs', 'Code.gs']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  ctx.maintenant_ = () => etat.maintenant();   // l'heure est pilotée par le monde

  const monde = {
    ctx, etat, journal,
    installer: () => ctx.installer(),
    doGet: () => lire(ctx.doGet({})),
    /* Envoie un corps brut (texte) et rend la réponse JSON décodée. */
    envoyer: (corps) => lire(ctx.doPost({ postData: { contents: corps, type: 'text/plain' } })),
    lignes: (nom) => (etat.feuilles[nom] ? etat.feuilles[nom].lignes.map(l => l.slice()) : null),
    appelsInterdits: () => journal.filter(j => j.interdite)
  };
  function lire(sortie) { return JSON.parse(sortie.getContent()); }
  return monde;
}
