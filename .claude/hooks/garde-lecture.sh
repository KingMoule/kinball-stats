#!/bin/bash
# Hook PreToolUse (Read, Bash) : empêche de lire en entier un gros fichier (index.html : environ 95 000 tokens, relus
# à chaque tour de la session). Pour trouver du code : node outils/carte.mjs <regex>, puis Read avec offset et limit.
#  - Read d'un fichier de plus de 150 Ko sans « limit » (ou avec un limit de plus de 800 lignes) : refusé ;
#  - Bash « cat index.html » dont la sortie n'est ni redirigée ni filtrée : refusé.
# Toute autre commande passe (code 0). Refus : code 2, raison sur la sortie d'erreur (montrée à l'agent).
entree=$(cat)
if command -v jq >/dev/null 2>&1; then
  champs=$(printf '%s' "$entree" | jq -r '[.tool_name // "", .tool_input.file_path // "", (.tool_input.limit // "" | tostring), .tool_input.command // ""] | join("\u001f")' 2>/dev/null)
else
  champs=$(printf '%s' "$entree" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s),t=j.tool_input||{};process.stdout.write([j.tool_name||"",t.file_path||"",String(t.limit===undefined?"":t.limit),t.command||""].join("\x1f"))}catch{}})' 2>/dev/null)
fi
IFS=$'\x1f' read -r outil fichier limite cmd <<<"$champs"

SEUIL=150000   # octets
MAXLIGNES=800

if [ "$outil" = "Read" ] && [ -n "$fichier" ] && [ -f "$fichier" ]; then
  taille=$(stat -c %s "$fichier" 2>/dev/null || echo 0)
  if [ "$taille" -gt "$SEUIL" ]; then
    if [ -z "$limite" ] || ! [[ "$limite" =~ ^[0-9]+$ ]] || [ "$limite" -gt "$MAXLIGNES" ]; then
      echo "Refusé (garde-lecture) : $(basename "$fichier") pèse $((taille / 1000)) Ko (environ $((taille / 3700)) mille tokens) : le lire en entier coûte cher à chaque tour. Trouve l'endroit avec « node outils/carte.mjs <regex> », puis Read avec offset et limit (au plus $MAXLIGNES lignes)." >&2
      exit 2
    fi
  fi
fi

if [ "$outil" = "Bash" ] && [ -n "$cmd" ]; then
  if printf '%s\n' "$cmd" | grep -qE '(^|[;&|(][[:space:]]*)(cat|bat)[[:space:]]+([^|;&<>]*[[:space:]/])?index\.html[[:space:]]*($|;|&&|\))'; then
    echo "Refusé (garde-lecture) : « cat index.html » renvoie environ 95 000 tokens. Utilise « node outils/carte.mjs <regex> » pour situer la fonction, puis Read avec offset et limit, ou grep." >&2
    exit 2
  fi
fi
exit 0
