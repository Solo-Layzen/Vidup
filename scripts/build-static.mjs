import { spawn } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import * as path from "node:path";

/**
 * Build « front statique » pour InfinityFree / hébergement PHP :
 * génère le dossier `out/` (HTML/CSS/JS) à uploader dans `htdocs`.
 *
 * ⚠️ L'API de téléchargement (yt-dlp + ffmpeg) ne peut PAS tourner sur
 * InfinityFree. Définissez NEXT_PUBLIC_API_BASE avec l'URL de votre serveur
 * Node avant de lancer ce script :
 *
 *   $env:NEXT_PUBLIC_API_BASE="https://mon-api.exemple.com"
 *   npm run build:static
 */
if (!process.env.NEXT_PUBLIC_API_BASE) {
  console.warn(
    "\n⚠️  NEXT_PUBLIC_API_BASE n'est pas défini : le site statique appellera /api/... sur son propre domaine.\n" +
      "   Sur InfinityFree, les téléchargements échoueront. Définissez cette variable avec l'URL de votre serveur Node.\n"
  );
}

process.env.STATIC_EXPORT = "1";

const API_DIR = path.join(process.cwd(), "app", "api");
// Dossier « privé » (préfixe _) : Next.js ignore son contenu lors du routing.
const API_PARKED = path.join(process.cwd(), "app", "_api_statique_desactive");

/**
 * `output: "export"` refuse les Route Handlers dynamiques (`force-dynamic`).
 * L'export statique n'a de toute façon pas besoin de l'API : elle reste sur
 * Render. On met donc `app/api` de côté le temps du build, puis on le remet
 * en place — même si le build échoue.
 */
function parkApi() {
  if (existsSync(API_DIR)) {
    if (existsSync(API_PARKED)) throw new Error(`Le dossier ${API_PARKED} existe déjà.`);
    renameSync(API_DIR, API_PARKED);
    return true;
  }
  return false;
}

function restoreApi() {
  if (existsSync(API_PARKED) && !existsSync(API_DIR)) {
    renameSync(API_PARKED, API_DIR);
  }
}

// Nettoyage d'une exécution précédente interrompue.
if (existsSync(API_PARKED) && !existsSync(API_DIR)) restoreApi();

let parked = false;
try {
  parked = parkApi();
} catch (err) {
  console.error(`\n❌ Impossible de déplacer app/api : ${err.message}`);
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ["./node_modules/next/dist/bin/next", "build"],
  { stdio: "inherit", env: process.env }
);

const finish = (code) => {
  if (parked) {
    try {
      restoreApi();
    } catch (err) {
      console.error(`\n❌ Impossible de restaurer app/api : ${err.message}`);
      console.error(`   Le dossier est dans : ${API_PARKED}`);
    }
  }
  if (code === 0) {
    console.log("\n✅ Export statique prêt : dossier `out/` → à uploader dans `htdocs` sur InfinityFree.");
  }
  process.exit(code ?? 1);
};

child.on("error", (err) => {
  console.error(err.message);
  finish(1);
});
child.on("close", (code) => finish(code ?? 1));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (parked) {
      try {
        restoreApi();
      } catch {
        // ignore
      }
    }
    process.exit(1);
  });
}
