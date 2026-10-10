#!/bin/bash
# Hook PreToolUse (Bash) : protège le banc d'essai.
#  - refuse pkill / killall visant le banc (run.mjs) : ils tuent aussi le shell de l'agent ; on tue par PID ;
#  - refuse le lancement de tests/run.mjs quand un autre passage tourne déjà (machine à 2 cœurs : un seul banc).
# Toute autre commande passe (code 0). Refus : code 2, raison sur la sortie d'erreur (montrée à l'agent).
entree=$(cat)
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$entree" | jq -r '.tool_input.command // empty' 2>/dev/null)
else
  cmd=$(printf '%s' "$entree" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String((JSON.parse(s).tool_input||{}).command||""))}catch{}})' 2>/dev/null)
fi
[ -z "$cmd" ] && exit 0

# 1. pkill / killall dont les arguments visent run.mjs (jusqu'au prochain ; & | ou fin de ligne)
if printf '%s\n' "$cmd" | grep -qE '(^|[^[:alnum:]_-])(pkill|killall)([[:space:]][^;&|]*)?(run\.mjs|tests/run)'; then
  echo "Refusé (garde-banc) : pkill/killall sur le banc tue aussi votre propre shell. Trouvez le PID (pgrep -af 'tests/run.mjs') et tuez-le par PID : kill <pid>." >&2
  exit 2
fi

# 2. lancement du banc (node [options] [chemin/]tests/run.mjs, ou node run.mjs depuis tests/) alors qu'un passage tourne déjà
lance=$(printf '%s\n' "$cmd" | grep -oE '(^|[^[:alnum:]_])node[[:space:]]+(-[^[:space:]]+[[:space:]]+)*([^[:space:];&|]*/)?run\.mjs([[:space:];&|)]|$)' | grep -vE '[[:space:]](--check|-c)[[:space:]]')
if [ -n "$lance" ]; then
  actifs=$(pgrep -f '^([^ ]*/)?node [^ ]*run\.mjs' 2>/dev/null | tr '\n' ' ')
  if [ -n "$actifs" ]; then
    echo "Refusé (garde-banc) : un passage du banc tourne déjà (PID $actifs). Un seul banc à la fois sur cette machine : attendez-le avec « node tests/attendre.mjs »." >&2
    exit 2
  fi
fi
exit 0
