# VidUp — Téléchargeur YouTube, TikTok, Spotify & Deezer (sans filigrane)

Application Next.js **100 % gratuite, sans compte et sans limite** : téléchargement de
vidéos **YouTube** (yt-dlp) et **TikTok sans filigrane**, ainsi que de **playlists
Spotify et Deezer en MP3**. Aucune inscription, aucun tracking de compte : tout est
accessible directement.

## 🎬 Qualités YouTube

- Sélection **à la carte** de tous les flux réellement proposés par YouTube :
  **8K / 5K / 4K / 1440p / 1080p / 720p…**, 60 fps, **HDR**, codecs AV1 / VP9 / H.264,
  débit et taille estimée.
- Extraction **MP3 320 / 256 / 192 / 128 kbit/s**.
- Playlists YouTube en **ZIP** (jusqu'à 25 vidéos, qualité au choix jusqu'à 8K).
- La qualité maximale reste celle de la source : une vidéo uploadée en 1080p ne peut
  pas être téléchargée en 8K.
- La fusion vidéo + audio (4K/8K/HDR) nécessite **ffmpeg** sur le serveur.

## 🎵 Musique Spotify / Deezer

- Récupération de la playlist (titre + artistes + durées) via la page **embed
  publique Spotify** et l'**API publique Deezer** (aucune clé requise).
- Chaque titre est ensuite recherché sur **YouTube** (le meilleur match par durée)
  puis converti en **MP3 320 kbit/s** par yt-dlp + ffmpeg (comme spotdl).
- Téléchargement **titre par titre** ou **toute la playlist en un ZIP MP3**.
- Aucun quota, aucun compte, aucune inscription.

> ℹ️ Spotify et Deezer ne diffusent pas d'audio téléchargeable (DRM) : la piste
> est résolue depuis YouTube. La qualité audio dépend donc de la source YouTube.
>
> ⚠️ Une playlist **privée** ne peut pas être lue. Passez-la en **public**
> (clic droit → Partager → Public) avant de coller son URL. C'est la cause n°1
> des échecs — voir la [FAQ](app/faq/page.tsx).

### ZIP de playlist

L'archive est générée en flux, sans écrire la playlist entière sur disque. Les
titres/vidéos indisponibles sont ignorés et listés dans
`_titres-indisponibles.txt` / `_videos-indisponibles.txt`, l'archive reste valide.
Le format ZIP standard est limité à **4 Go** : pour de très grosses playlists
4K/8K, téléchargez par lots de 5 à 10 vidéos.

## ⚠️ Prérequis système

- **Node.js ≥ 18.17**
- **yt-dlp** (binaire système) : `winget install yt-dlp` ou [yt-dlp.org](https://github.com/yt-dlp/yt-dlp/releases)
- **ffmpeg** (fusion audio/vidéo 4K/8K + extraction MP3) : `winget install Gyan.FFmpeg`

> ⚠️ **Déploiement** : yt-dlp a besoin d'un accès système (spawn de processus).
> **Pas de Vercel serverless seul, pas d'hébergement PHP mutualisé.** Utiliser
> un **PC perso (Ubuntu + Tailscale Funnel)**, **Render**, **Railway**, un
> **VPS** ou **Docker**.

## Installation locale

```bash
npm.cmd install
Copy-Item .env.example .env   # puis remplir les variables
npm.cmd run dev                # http://localhost:3000
```

### Vérifier que yt-dlp et ffmpeg fonctionnent

```bash
yt-dlp --version
ffmpeg -version
```

## Variables d'environnement

| Variable | Description |
|---|---|
| `YTDLP_PATH` | Chemin du binaire yt-dlp (défaut `yt-dlp`) |
| `FFMPEG_PATH` | Dossier contenant `ffmpeg`/`ffprobe` (défaut : dans le PATH) |
| `YTDLP_COOKIES` | Optionnel : fichier de cookies YouTube (format Netscape) |
| `DEEZER_PROXY` | Relais de secours si l'API Deezer est bloquée (défaut `https://r.jina.ai/`, `off` pour désactiver) |
| `NEXT_PUBLIC_API_BASE` | **Front statique uniquement** : URL du serveur Node qui exécute l'API (vide en local) |

> 💡 Si `FFMPEG_PATH` est vide ou invalide, ffmpeg est cherché automatiquement
> dans le `PATH`. Sur Windows avec winget, le dossier
> `%LOCALAPPDATA%\Microsoft\WinGet\Links` contient `ffmpeg.exe` et reste valable
> après les mises à jour.

## Dépannage des téléchargements

| Symptôme | Cause probable | Solution |
|---|---|---|
| Playlist Spotify/Deezer vide ou « introuvable » | playlist privée | La passer en **public**, puis recoller l'URL complète |
| Le ZIP ne s'ouvre pas / est « cassé » | ancien fichier généré avant le correctif | Supprimer l'ancien ZIP et re-télécharger ; utiliser 7-Zip/WinRAR |
| « Le fichier n'a pas pu être créé » / échec de fusion | ffmpeg introuvable | Vérifier `ffmpeg -version` et `FFMPEG_PATH` |
| 4K/8K indisponible ou retombe en 720p | pas de flux > 1080p sans compte, ou yt-dlp/ffmpeg obsolète | Mettre à jour yt-dlp et ffmpeg ; définir `YTDLP_COOKIES` |
| « yt-dlp n'est pas installé » | binaire absent du PATH | Renseigner `YTDLP_PATH` ou installer yt-dlp |
| « vérification anti-robot » | YouTube limite l'IP | Réessayer plus tard ou définir `YTDLP_COOKIES` |
| Deezer « inaccessible depuis ce réseau » | VPN / Cloudflare WARP bloqué par Deezer | Désactiver le VPN/WARP, ou vérifier `DEEZER_PROXY` |
| TikTok « refuse le téléchargement depuis ce réseau » | CDN TikTok bloqué par le VPN / Cloudflare WARP | Désactiver le VPN/WARP puis réessayer |
| Vidéo privée / bloquée | contenu non accessible | Utiliser un contenu public |

## Déploiement sur un serveur Node (Railway / Render / VPS)

### Docker (recommandé)
```bash
docker compose up --build
```
Le `Dockerfile` installe automatiquement yt-dlp et ffmpeg.

## 🏠 Héberger l'API chez soi — Ubuntu + Tailscale Funnel (gratuit, sans carte)

C'est la solution sans carte bancaire : l'API tourne sur ton PC Ubuntu (celui de
Nextcloud) et devient accessible publiquement via **Tailscale Funnel**, avec une
**URL fixe** et HTTPS. Aucun port à ouvrir sur la box, aucune carte bancaire.

Avantages : pas de limite de durée, pas de mise en veille, 4K/8K possibles,
IP résidentielle (YouTube bloque moins), yt-dlp déjà à jour.
Contrainte : **le PC doit rester allumé** (ce qui est déjà le cas pour Nextcloud).

### 1. Installer Docker sur l'Ubuntu

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker          # ou se déconnecter/reconnecter
docker --version
```

### 2. Récupérer le projet

Le dépôt GitHub est privé. Le plus simple : GitHub → dépôt **Vidup** →
**Settings** → **General** → tout en bas **Change visibility** → **Public**
(le projet ne contient aucun secret, `.env` est ignoré). Puis :

```bash
sudo apt install -y git
git clone https://github.com/Solo-Layzen/Vidup.git
cd Vidup
```

*(Dépôt privé : `git clone https://<TOKEN>@github.com/Solo-Layzen/Vidup.git` avec
un token GitHub `repo`.)*

### 3. Lancer l'API

```bash
docker compose up -d --build      # 5 à 10 min la première fois
docker compose ps                 # le service doit être "healthy"
curl http://127.0.0.1:3000/api/health
```

Attendu : `"ok":true` avec les versions de `ytdlp` et `ffmpeg` (le `Dockerfile`
les installe). L'API n'écoute que sur `127.0.0.1` : rien n'est exposé pour
l'instant.

### 4. Exposer l'API avec Tailscale Funnel

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale funnel 3000
```

Au premier lancement, Tailscale affiche un lien : ouvre-le et active **Funnel**
+ **HTTPS certificates** dans la console d'administration Tailscale. Relance
ensuite la commande. Elle affiche l'URL publique, du type :

```
https://mon-pc.tailXXXX.ts.net
```

Teste-la **depuis ton téléphone en 4G** :
`https://mon-pc.tailXXXX.ts.net/api/health` → `"ok":true`.

> Cette URL ne change pas après un redémarrage. `tailscale funnel status`
> permet de vérifier que le tunnel est actif.

### 5. Brancher le site InfinityFree

Sur **Windows**, reconstruis le front avec cette URL :

```powershell
$env:NEXT_PUBLIC_API_BASE="https://mon-pc.tailXXXX.ts.net"
npm.cmd run build:static
```

Puis upload le contenu de `out/` dans `htdocs` sur InfinityFree.

### 6. Garder le service en route

- Docker redémarre l'API tout seul (`restart: unless-stopped`) et Tailscale
  démarre avec le système. Après un reboot : `docker compose ps` puis
  `tailscale funnel status`.
- Empêcher la mise en veille du PC :
  ```bash
  sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
  ```
- Mettre à jour yt-dlp quand YouTube change (une fois par mois, ou en cas
  d'erreur « format indisponible ») :
  ```bash
  cd ~/Vidup && docker compose build --no-cache && docker compose up -d
  ```

> ⚠️ L'API est publique : n'importe qui ayant l'URL peut télécharger (limite
> technique de 20 requêtes/min/IP). Pour un usage strictement personnel, tu
> peux remplacer `tailscale funnel` par `tailscale serve` (accessible uniquement
> depuis tes appareils Tailscale), mais le site InfinityFree ne pourra alors
> plus l'appeler.

## 🚀 Déployer l'API sur Render (pas à pas)

Render est la solution gratuite la plus simple pour héberger l'API Node qui
exécute `yt-dlp` + `ffmpeg`. Le fichier `render.yaml` est déjà prêt : il crée un
service Docker, branche le health check sur `/api/health` et déclare les
variables d'environnement.

### 1. Mettre le projet sur GitHub

Render déploie depuis un dépôt Git (aucun dépôt n'existe encore dans ce dossier) :

```powershell
cd "C:\Users\vmatt\Documents\Documents\Mes Sites\Youtube"
git init
git add .
git commit -m "VidUp - API de telechargement"
# Créer un dépôt vide "vidup" sur github.com, puis :
git remote add origin https://github.com/<votre-compte>/vidup.git
git branch -M main
git push -u origin main
```

`.env` est ignoré par Git : aucun secret n'est publié.

### 2. Créer le service sur Render

1. Créer un compte sur [render.com](https://render.com) (connexion GitHub).
2. **New +** → **Blueprint**.
3. Sélectionner le dépôt `vidup` → Render détecte `render.yaml` → **Apply**.
4. Attendre la fin du build (5 à 10 min : installation de ffmpeg + yt-dlp +
   `npm run build`).
5. Récupérer l'URL HTTPS affichée en haut du service, du type
   `https://vidup-api.onrender.com`.

> Si le nom `vidup-api` est déjà pris, Render ajoute un suffixe
> (`vidup-api-xxxx.onrender.com`) : utilisez l'URL réellement affichée, pas
> celle du `render.yaml`.

> Le plan gratuit suffit pour tester. Il s'endort après ~15 min sans trafic :
> la première requête suivante peut mettre **30 à 60 s** à répondre.

### 3. Vérifier que l'API fonctionne

```powershell
Invoke-RestMethod https://vidup-api.onrender.com/api/health
```

Réponse attendue (`ok: true`) :

```json
{
  "ok": true,
  "service": "vidup-api",
  "uptime": 42,
  "tools": { "ytdlp": "2026.11.15", "ffmpeg": "7.1" }
}
```

Si `ok` vaut `false` ou que le statut est **503**, `yt-dlp` ou `ffmpeg` n'a pas
été trouvé : vérifiez que le service utilise bien le `Dockerfile` (runtime
**Docker**, pas Node) et consultez les logs Render.

Test de téléchargement (doit renvoyer du JSON, pas une erreur CORS/réseau) :

```powershell
Invoke-RestMethod -Method Post https://vidup-api.onrender.com/api/youtube `
  -ContentType "application/json" `
  -Body '{"action":"info","url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

### 4. Brancher le front InfinityFree sur cette API

```powershell
$env:NEXT_PUBLIC_API_BASE="https://vidup-api.onrender.com"
npm.cmd run build:static
```

Puis uploader **le contenu** de `out/` dans `htdocs` (pas le dossier `out`
lui-même). L'URL de l'API est figée au moment du build : après tout changement
d'URL Render, relancez `npm.cmd run build:static`.

### 5. Variables d'environnement Render

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` (déjà dans `render.yaml`) |
| `DEEZER_PROXY` | `https://r.jina.ai/` (relais Deezer) |
| `YTDLP_COOKIES` | **optionnel** : chemin d'un fichier de cookies YouTube |

Pour `YTDLP_COOKIES`, créer un **Secret File** dans Render
(*Environment → Secret Files*, chemin `/etc/secrets/cookies.txt`) et définir
`YTDLP_COOKIES=/etc/secrets/cookies.txt`. Sans cookies, YouTube peut demander
une vérification anti-robot depuis les IP de datacenter.

### Limites du plan gratuit Render

- **512 Mo de RAM / 0,1 CPU** : le 1080p passe, mais une fusion **4K/8K HDR**
  peut dépasser le temps ou la mémoire disponibles → erreur 502/timeout.
  Pour du 4K/8K fiable, passer au plan payant (2 Go+) ou utiliser un VPS.
- Le service **s'endort** après ~15 min : prévenir l'utilisateur du premier
  chargement lent (le health check se réveille en ~50 s).
- 750 heures d'exécution par mois (largement suffisant pour un usage normal).
- Pas de disque persistant : les fichiers temporaires sont supprimés après
  chaque téléchargement (comportement voulu).

## 🌐 Déploiement InfinityFree (front statique)

**InfinityFree ne peut pas exécuter l'API de téléchargement.** Son offre gratuite
fournit PHP 8.4 + MySQL, mais **pas de Node.js**, et interdit l'exécution de
binaires comme `yt-dlp` et `ffmpeg`. Il est donc impossible d'y faire tourner le
téléchargeur seul.

La solution qui fonctionne réellement :

1. **Héberger l'API sur un serveur Node** — deux options :
   - **PC perso Ubuntu + Tailscale Funnel** (gratuit, sans carte) : voir
     « Héberger l'API chez soi » ci-dessus ;
   - **Render** (carte bancaire demandée pour vérifier le compte) : voir
     « Déployer l'API sur Render ».
   Noter l'URL HTTPS obtenue, par exemple `https://mon-pc.tailXXXX.ts.net`.
2. **Construire le front statique** en indiquant cette URL :
   ```powershell
   $env:NEXT_PUBLIC_API_BASE="https://vidup-api.onrender.com"
   npm.cmd run build:static
   ```
   Le script met automatiquement `app/api` de côté pendant l'export (un site
   statique ne peut pas exécuter les routes API) puis le restaure.
3. **Uploader le contenu du dossier `out/`** dans `htdocs` via le gestionnaire de
   fichiers InfinityFree ou par FTP.
4. C'est tout : l'interface (accueil, FAQ, sélecteur 4K/8K) est servie par
   InfinityFree, et les téléchargements sont exécutés par le serveur Node.

Le middleware ajoute automatiquement les en-têtes **CORS** sur `/api/*` pour
autoriser les appels depuis le domaine InfinityFree.

> Sans serveur Node, le site s'affiche sur InfinityFree mais les téléchargements
> échouent : aucun hébergement PHP gratuit ne permet de lancer yt-dlp/ffmpeg.

## FAQ

La FAQ complète est disponible sur `/faq` et en bas de la page d'accueil :
playlist publique, archive ZIP, 4K/8K/HDR, MP3 320, anti-robot, Deezer/VPN,
InfinityFree, légalité. Source : `lib/faq.ts`.

## Remarques de production

- Le **rate limiting est en mémoire** (mono-instance, 20 req/min/IP). Pour du
  multi-instance, remplacez `lib/rate-limit.ts` par une solution Redis.
- Le scraping TikTok peut être bloqué par TikTok ; en cas d'échec, un message
  clair invite à réessayer plus tard.
- Les téléchargements passent par des fichiers temporaires : prévoir de l'espace
  disque sur le serveur.

## Sécurité et conformité
- Aucun compte utilisateur, aucun mot de passe et aucune donnée personnelle stockée.
- Tous les secrets passent par l'environnement (`.env` non versionné).
- Avertissement légal affiché dans le pied de page : usage réservé aux contenus
  dont l'utilisateur détient les droits ou libres de droits.
