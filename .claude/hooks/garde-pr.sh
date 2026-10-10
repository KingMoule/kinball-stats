#!/bin/bash
# Hook PreToolUse (Bash) : toute PR s'ouvre avec base: main (D80). La PR #4, ouverte sur une autre branche, a été
# fusionnée là et le site n'a pas reçu la vague 5.
#  - « gh pr create » sans --base main (ou -B main) : refusé ;
#  - « gh api …/pulls » qui crée une PR (--input, -f, -F, --field, -X POST) : la base doit être « main », lue dans la
#    commande (base=…, "base": "…") ou dans le fichier donné à --input ; introuvable ou autre que main : refusé ;
#  - tout « gh api » touchant à « pulls » avec une base autre que main : refusé.
# Toute autre commande passe (code 0). Refus : code 2, raison sur la sortie d'erreur (montrée à l'agent).
entree=$(cat)
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$entree" | jq -r '.tool_input.command // empty' 2>/dev/null)
else
  cmd=$(printf '%s' "$entree" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String((JSON.parse(s).tool_input||{}).command||""))}catch{}})' 2>/dev/null)
fi
[ -z "$cmd" ] && exit 0

refus() { echo "Refusé (garde-pr) : $1 Toute PR s'ouvre avec base: main (décision D80) ; sinon elle est fusionnée dans la branche de travail et pas dans main." >&2; exit 2; }

# 1. gh pr create
if printf '%s\n' "$cmd" | grep -qE '(^|[^[:alnum:]_-])gh[[:space:]]+pr[[:space:]]+create'; then
  printf '%s\n' "$cmd" | grep -qE '(--base|-B)([[:space:]]+|=)main([[:space:]]|$)' || refus "« gh pr create » sans --base main."
  exit 0
fi

# 2. gh api …/pulls
if printf '%s\n' "$cmd" | grep -qE '(^|[^[:alnum:]_-])gh[[:space:]]+api[^|;&]*pulls'; then
  # base donnée dans la commande : base=xxx (champ -f) ou "base": "xxx" (JSON en ligne)
  bases=$( { printf '%s\n' "$cmd" | grep -oE '(^|[[:space:]"'"'"'])base=[^[:space:]"'"'"']+' | sed -E 's/.*base=//'
             printf '%s\n' "$cmd" | grep -oE '"base"[[:space:]]*:[[:space:]]*"[^"]+"' | sed -E 's/.*:[[:space:]]*"//; s/"$//'; } )
  # base donnée dans un fichier --input
  entree_fichier=$(printf '%s\n' "$cmd" | grep -oE '\-\-input[[:space:]=]+[^[:space:];&|]+' | head -1 | sed -E 's/--input[[:space:]=]+//; s/^["'"'"']//; s/["'"'"']$//')
  if [ -n "$entree_fichier" ] && [ -f "$entree_fichier" ]; then
    if command -v jq >/dev/null 2>&1; then f=$(jq -r '.base // empty' "$entree_fichier" 2>/dev/null)
    else f=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).base||""))}catch{}' "$entree_fichier" 2>/dev/null); fi
    [ -n "$f" ] && bases=$(printf '%s\n%s' "$bases" "$f")
  fi
  bases=$(printf '%s\n' "$bases" | sed '/^$/d')
  if [ -n "$bases" ] && printf '%s\n' "$bases" | grep -qvx 'main'; then
    refus "base « $(printf '%s\n' "$bases" | grep -vx 'main' | head -1) » au lieu de main."
  fi
  # création d'une PR (écriture sur /pulls, sans numéro) : la base doit avoir été trouvée
  if printf '%s\n' "$cmd" | grep -qE 'pulls([[:space:]]|$|["'"'"'])' && printf '%s\n' "$cmd" | grep -qE '(--input|[[:space:]]-f[[:space:]]|[[:space:]]-F[[:space:]]|--field|--raw-field|-X[[:space:]]+POST|--method[[:space:]]+POST)'; then
    [ -n "$bases" ] || refus "la base de la PR n'est pas lisible dans la commande (ajoute -f base=main, ou un fichier --input avec \"base\": \"main\")."
  fi
fi
exit 0
