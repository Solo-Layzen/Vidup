export type FaqItem = { question: string; answer: string };

export const FAQ: FaqItem[] = [
  {
    question: "Ma playlist Spotify ou Deezer ne se télécharge pas, que faire ?",
    answer:
      "La cause n°1 est une playlist non publique. Une playlist privée, une playlist collaborative fermée ou un contenu réservé ne sont pas lisibles sans connexion. Vérifiez-le en ouvrant le lien dans une fenêtre de navigation privée : si Spotify/Deezer vous demande de vous connecter, la playlist n'est pas publique. Passez-la en public (clic droit sur la playlist → Partager → Public), puis recollez l'URL complète (open.spotify.com/playlist/… ou deezer.com/playlist/…). Évitez aussi les liens raccourcis : ouvrez-les d'abord dans votre navigateur et copiez l'URL finale. Si Deezer est bloqué, désactivez VPN/Cloudflare WARP.",
  },
  {
    question: "Le ZIP de la playlist est « cassé » / impossible à décompresser",
    answer:
      "Ce bug est corrigé : chaque fichier de l'archive pointait vers la première entrée, ce qui faisait apparaître des entrées qui se chevauchent. Supprimez l'ancien ZIP et relancez le téléchargement. Utilisez 7-Zip ou WinRAR (plus tolérants que l'explorateur Windows) et ne coupez pas le téléchargement en cours de route. Si un titre échoue, il est simplement ignoré et listé dans le fichier _titres-indisponibles.txt : l'archive reste valide.",
  },
  {
    question: "Comment télécharger une vidéo YouTube en 4K, 5K ou 8K ?",
    answer:
      "Collez l'URL puis cliquez sur « Choisir le format ». La liste affiche toutes les variantes réellement proposées par YouTube : 8K/4K, 60 fps, HDR, codecs AV1/VP9/H.264, débit et taille estimée. Sélectionnez celle qui vous intéresse. La fusion vidéo + audio nécessite ffmpeg sur le serveur. Une vidéo uploadée en 1080p ne pourra jamais être téléchargée en 8K : la qualité maximale est celle de la source.",
  },
  {
    question: "La 4K/8K échoue ou retombe en 720p, pourquoi ?",
    answer:
      "Trois causes fréquentes : ffmpeg est absent ou trop ancien (la fusion vidéo+audio échoue), yt-dlp est obsolète (YouTube change régulièrement), ou YouTube exige une connexion pour les formats supérieurs à 1080p. Mettez à jour yt-dlp et ffmpeg, puis réessayez. En dernier recours, configurez YTDLP_COOKIES avec un fichier de cookies YouTube.",
  },
  {
    question: "Comment obtenir un MP3 en 320 kbit/s ?",
    answer:
      "Pour une vidéo YouTube, choisissez la qualité audio (320, 256, 192 ou 128 kbit/s) puis cliquez sur « Extraire en MP3 ». Pour Spotify/Deezer, le MP3 est généré en 320 kbit/s. Attention : la qualité réelle dépend de la source ; un MP3 320 recréé depuis un flux YouTube à 128 kbit/s ne gagne pas en qualité.",
  },
  {
    question: "Erreur « vérification anti-robot » ou « trop de requêtes » (429)",
    answer:
      "YouTube limite les IP partagées (hébergeurs, VPN). Réessayez quelques minutes plus tard, désactivez le VPN, ou fournissez un fichier de cookies via la variable YTDLP_COOKIES. En production, un petit serveur dédié avec une IP propre fonctionne bien mieux qu'un hébergement mutualisé.",
  },
  {
    question: "Deezer est inaccessible depuis ce réseau",
    answer:
      "Deezer bloque certaines IP de datacenter et certains VPN (Cloudflare WARP notamment). Désactivez le VPN/WARP puis réessayez. Le serveur tente automatiquement un relais de secours (DEEZER_PROXY) ; vous pouvez aussi utiliser Spotify pour la même playlist.",
  },
  {
    question: "Un titre de la playlist est introuvable",
    answer:
      "Le titre est recherché sur YouTube (meilleur match par artiste, titre et durée). Certains morceaux rares, exclusivités de plateforme ou contenus bloqués ne sont pas trouvables. Le ZIP reste valide : les titres manquants sont listés dans _titres-indisponibles.txt. Vous pouvez aussi télécharger les autres titres individuellement.",
  },
  {
    question: "Le site peut-il fonctionner sur InfinityFree ?",
    answer:
      "InfinityFree propose PHP 8.4 et MySQL, mais pas Node.js, ni l'exécution de binaires comme yt-dlp et ffmpeg. L'interface peut y être hébergée en version statique (npm run build:static → dossier out/ à uploader dans htdocs), mais l'API de téléchargement doit tourner sur un serveur Node : un PC perso (Ubuntu + Tailscale Funnel, gratuit et sans carte), Render, un VPS ou Docker. Sans ce serveur, l'interface s'affiche mais les téléchargements ne peuvent pas fonctionner. Voir la section « Déploiement InfinityFree » du README.",
  },
  {
    question: "Je n'ai pas de carte bancaire, comment héberger l'API gratuitement ?",
    answer:
      "La plupart des hébergeurs cloud (Render, Railway, Fly.io…) demandent une carte pour vérifier le compte. La solution sans carte : faire tourner l'API sur un PC chez soi et l'exposer avec Tailscale Funnel (gratuit), qui fournit une URL HTTPS fixe du type https://mon-pc.tailXXXX.ts.net. Il suffit d'installer Docker sur un PC Ubuntu, de lancer docker compose up -d --build, puis sudo tailscale funnel 3000. Le PC doit rester allumé pendant les téléchargements. Avantage : pas de mise en veille, 4K/8K possibles et une meilleure acceptation par YouTube.",
  },
  {
    question: "Pourquoi le premier téléchargement met-il 30 à 60 secondes ?",
    answer:
      "L'API peut être hébergée sur un service gratuit (Render) qui s'endort après une quinzaine de minutes sans activité. La première requête le réveille : elle peut prendre 30 à 60 secondes, les suivantes sont normales. Le plan gratuit limite aussi la mémoire (512 Mo) et le CPU : les vidéos 1080p passent, mais les fusions 4K/8K HDR peuvent échouer. Dans ce cas, choisissez une qualité inférieure, téléchargez par lots, ou passez l'API sur un plan payant/VPS.",
  },
  {
    question: "Pourquoi le téléchargement est-il lent ?",
    answer:
      "Le serveur télécharge d'abord le média avec yt-dlp, le convertit avec ffmpeg, puis vous l'envoie. Pour une playlist, les titres sont traités l'un après l'autre afin de ne pas saturer le serveur. La vitesse dépend donc de YouTube, du serveur et de votre connexion. Les archives ZIP sont au format standard (limite de 4 Go) : pour une très grosse playlist en 4K/8K, téléchargez par lots de 5 ou 10, ou vidéo par vidéo.",
  },
  {
    question: "Est-ce légal et que faites-vous de mes données ?",
    answer:
      "Utilisez VidUp uniquement pour des contenus dont vous détenez les droits ou qui sont libres de droits. Aucun compte, aucun mot de passe et aucune donnée personnelle ne sont stockés. Les URL ne sont pas conservées après le traitement. Le téléchargement de contenus protégés sans autorisation peut enfreindre les conditions des plateformes et la loi.",
  },
];
