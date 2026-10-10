#!/bin/bash
# Autotest des hooks garde-lecture.sh et garde-pr.sh : bash .claude/hooks/test-hooks.sh
# Chaque cas envoie au hook l'entrée JSON que Claude Code lui donnerait, et compare le code de sortie (0 passe, 2 refuse).
cd "$(dirname "$0")/../.." || exit 1
D=$(pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
ok=0; ko=0

lire() { # attendu, description, fichier, [limit]
  local json
  if [ -n "$4" ]; then json=$(jq -nc --arg f "$3" --argjson l "$4" '{tool_name:"Read",tool_input:{file_path:$f,limit:$l}}')
  else json=$(jq -nc --arg f "$3" '{tool_name:"Read",tool_input:{file_path:$f}}'); fi
  verifier "$1" "$2" garde-lecture.sh "$json"
}
cmd() { # attendu, hook, description, commande
  verifier "$1" "$3" "$2" "$(jq -nc --arg c "$4" '{tool_name:"Bash",tool_input:{command:$c}}')"
}
verifier() {
  printf '%s' "$4" | "$D/.claude/hooks/$3" >/dev/null 2>&1
  local code=$?
  if [ "$code" = "$1" ]; then ok=$((ok + 1)); else ko=$((ko + 1)); echo "ÉCHEC : $2 (attendu $1, obtenu $code)"; fi
}

# garde-lecture : Read
lire 2 "Read index.html entier"                 "$D/index.html"
lire 0 "Read index.html, limit 200"             "$D/index.html" 200
lire 2 "Read index.html, limit 2000"            "$D/index.html" 2000
lire 0 "Read d'un petit fichier"                "$D/CLAUDE.md"
lire 0 "Read d'un fichier absent"               "$D/n-existe-pas.md"
# garde-lecture : Bash
cmd 2 garde-lecture.sh "cat index.html"                      "cat index.html"
cmd 2 garde-lecture.sh "cat chemin/index.html ;"             "cd $D && cat $D/index.html; echo fin"
cmd 0 garde-lecture.sh "cat index.html | head"               "cat index.html | head -5"
cmd 0 garde-lecture.sh "cat index.html redirigé"             "cat index.html > /dev/null"
cmd 0 garde-lecture.sh "cat d'un petit fichier"              "cat docs/README.md"
cmd 0 garde-lecture.sh "grep dans index.html"                "grep -n undo index.html"

# garde-pr
cmd 2 garde-pr.sh "gh pr create sans base"                   "gh pr create --title x --body y"
cmd 2 garde-pr.sh "gh pr create base autre"                  "gh pr create --base harnais-banc --title x"
cmd 0 garde-pr.sh "gh pr create --base main"                 "gh pr create --base main --title x"
cmd 0 garde-pr.sh "gh pr create -B main"                     "gh pr create -B main --title x"
cmd 0 garde-pr.sh "gh api pulls -f base=main"                "env -u GH_TOKEN gh api repos/KingMoule/kinball-stats/pulls -f title=x -f head=b -f base=main -f body=y"
cmd 2 garde-pr.sh "gh api pulls -f base=autre"               "env -u GH_TOKEN gh api repos/KingMoule/kinball-stats/pulls -f title=x -f head=b -f base=harnais-banc"
cmd 2 garde-pr.sh "gh api pulls sans base"                   "gh api repos/KingMoule/kinball-stats/pulls -f title=x -f head=b"
cmd 0 garde-pr.sh "gh api pulls/5 (lecture)"                 "gh api repos/KingMoule/kinball-stats/pulls/5"
cmd 0 garde-pr.sh "gh api pulls en lecture seule"            "gh api repos/KingMoule/kinball-stats/pulls"
cmd 0 garde-pr.sh "commande sans rapport"                    "git status && echo base=autre"
printf '{"title":"x","head":"b","base":"main","body":"y"}' > "$T/ok.json"
printf '{"title":"x","head":"b","base":"harnais-banc","body":"y"}' > "$T/mauvais.json"
printf '{"title":"x","head":"b","body":"y"}' > "$T/sans.json"
cmd 0 garde-pr.sh "--input avec base main"                   "env -u GH_TOKEN gh api repos/KingMoule/kinball-stats/pulls --input $T/ok.json"
cmd 2 garde-pr.sh "--input avec base autre"                  "env -u GH_TOKEN gh api repos/KingMoule/kinball-stats/pulls --input $T/mauvais.json"
cmd 2 garde-pr.sh "--input sans base"                        "env -u GH_TOKEN gh api repos/KingMoule/kinball-stats/pulls --input $T/sans.json"
cmd 0 garde-pr.sh "JSON en ligne, base main"                 "gh api repos/KingMoule/kinball-stats/pulls --input - <<< '{\"title\":\"x\",\"head\":\"b\",\"base\":\"main\"}'"
cmd 2 garde-pr.sh "JSON en ligne, base autre"                "gh api repos/KingMoule/kinball-stats/pulls --input - <<< '{\"title\":\"x\",\"head\":\"b\",\"base\":\"autre\"}'"

echo "Hooks : $ok réussis, $ko échec(s)."
[ "$ko" = 0 ]
