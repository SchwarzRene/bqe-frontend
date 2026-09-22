#!/usr/bin/env bash
#
# Split schwarzrene.github.io into bqe-frontend and bqe-backend.
#
# Builds both repositories in a work directory and, with --push, pushes them
# to GitHub. Nothing in the current repository is modified, and nothing is
# pushed unless you ask for it.
#
#   ./migration/split.sh              # build them, print what to inspect
#   ./migration/split.sh --push       # build them and push to GitHub
#   ./migration/split.sh --work /tmp/x --push
#
# The two GitHub repositories must already exist and be empty:
#   https://github.com/new  ->  bqe-frontend  (public, no README, no .gitignore)
#   https://github.com/new  ->  bqe-backend   (public, no README, no .gitignore)
#
set -euo pipefail

GITHUB_OWNER="${GITHUB_OWNER:-SchwarzRene}"
# The branch that holds the webpage/ + automation/ layout. Defaults to the
# branch you are on, because that restructure may not be on main yet.
SOURCE_BRANCH="${SOURCE_BRANCH:-}"
WORK="${WORK:-../bqe-split}"
PUSH=0

while [ $# -gt 0 ]; do
  case "$1" in
    --push)  PUSH=1; shift ;;
    --work)  WORK="$2"; shift 2 ;;
    --owner) GITHUB_OWNER="$2"; shift 2 ;;
    --branch) SOURCE_BRANCH="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
: "${SOURCE_BRANCH:=$(git rev-parse --abbrev-ref HEAD)}"
MIGRATION="$REPO_ROOT/migration"
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

[ -d "$MIGRATION/backend" ] || { echo "run this from inside the repository" >&2; exit 1; }

mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"
say "Work directory: $WORK"
echo "source branch: $SOURCE_BRANCH"

for name in bqe-frontend bqe-backend; do
  if [ -e "$WORK/$name" ]; then
    echo "$WORK/$name already exists — remove it first, or pass --work elsewhere" >&2
    exit 1
  fi
done

# --------------------------------------------------------------------------- #
# bqe-frontend — the site, with its history
#
# The whole history is carried over rather than starting fresh: it is the
# record of how these pages were built, and `git log` on a stylesheet is worth
# more than a tidy first commit.
say "Building bqe-frontend"
git clone --quiet --branch "$SOURCE_BRANCH" "$REPO_ROOT" "$WORK/bqe-frontend"
cd "$WORK/bqe-frontend"

# webpage/ becomes the repository root. git mv keeps the rename in history, so
# `git log --follow` still works on every file that moved.
# A branch without webpage/ is the pre-restructure layout, and moving
# nothing would produce a frontend repo that looks fine and is wrong.
if [ ! -d webpage ]; then
  echo "error: '$SOURCE_BRANCH' has no webpage/ directory." >&2
  echo "       That layout lives on the branch that introduced it; pass" >&2
  echo "       --branch <name>, or merge it into main first." >&2
  exit 1
fi

say "  moving webpage/ to the root"
for entry in webpage/* webpage/.[!.]*; do
  [ -e "$entry" ] || continue
  git mv "$entry" "$(basename "$entry")"
done
rmdir webpage 2>/dev/null || true

say "  removing what moved to bqe-backend"
git rm -r --quiet automation
git rm -r --quiet .github/workflows
git rm --quiet --ignore-unmatch .gitignore
# The scaffolding that produced these two repositories has no place inside
# either of them.
git rm -r --quiet --ignore-unmatch migration

say "  applying the new files"
mkdir -p .github/workflows docs
cp -R "$MIGRATION/frontend/." .

say "  rewriting the README for the new layout"
python3 "$MIGRATION/patch_frontend_readme.py" README.md

git add -A
git -c user.name="${GIT_AUTHOR_NAME:-SchwarzRene}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-123473580+SchwarzRene@users.noreply.github.com}" \
    commit --quiet -m "Split out the frontend: site at the root, Cloudflare Pages deploy

webpage/ becomes the repository root, so Cloudflare Pages can publish it
directly and the absolute paths in every page resolve without a subfolder.

The GitHub Pages workflow is replaced by a Cloudflare deploy that runs on
every push to main and gives each pull request a preview URL. The Python
fetchers and the live-quotes proxy move to bqe-backend; the JSON they
produce is still committed here, which is what keeps 46 MB of price data
on a CDN instead of in front of a container."

echo "  $(git rev-list --count HEAD) commits, $(du -sh --exclude=.git . | cut -f1) of content"

# --------------------------------------------------------------------------- #
# bqe-backend — a new project, so a fresh history
say "Building bqe-backend"
mkdir -p "$WORK/bqe-backend"
cp -R "$MIGRATION/backend/." "$WORK/bqe-backend/"
cd "$WORK/bqe-backend"

git init --quiet --initial-branch=main
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-SchwarzRene}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-123473580+SchwarzRene@users.noreply.github.com}" \
    commit --quiet -m "The BQE backend: quotes API, market-data automation, Azure deploy

A FastAPI service deployed to Azure Container Apps on every push to main.

/api/quotes/{symbol} replaces the Cloudflare Worker the Stack page used to
call: Yahoo sends no CORS headers, so the browser needs something server-side
to relay them. Prices are scaled by the adjclose ratio so the live series
lines up with the committed snapshot.

The two scheduled market-data jobs move here as well. They still commit their
JSON into bqe-frontend, whose own deploy then publishes it.

Sized for the Container Apps free grant: 0.25 vCPU, scale to zero when idle.
Deploys authenticate to Azure with workload identity federation, so no Azure
password is stored anywhere."

echo "  $(find . -path ./.git -prune -o -type f -print | wc -l) files"

# --------------------------------------------------------------------------- #
say "Built"
cat <<INSPECT
  $WORK/bqe-frontend
  $WORK/bqe-backend

Worth a look before pushing:
  (cd $WORK/bqe-frontend && git log --oneline -3 && ls)
  (cd $WORK/bqe-backend  && ls && cat README.md)
INSPECT

if [ "$PUSH" -ne 1 ]; then
  cat <<NEXT

Nothing was pushed. When the repositories exist on GitHub and are empty:

    ./migration/split.sh --push --work $WORK

(or push by hand from each directory)
NEXT
  exit 0
fi

# --------------------------------------------------------------------------- #
push_repo() {
  local dir="$1" name="$2"
  say "Pushing $name"
  cd "$dir"
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/$GITHUB_OWNER/$name.git"

  local delay=2
  for attempt in 1 2 3 4 5; do
    if git push -u origin main; then
      echo "  pushed"
      return 0
    fi
    if [ "$attempt" -eq 5 ]; then
      echo "  push failed after 5 attempts" >&2
      return 1
    fi
    echo "  push failed, retrying in ${delay}s (attempt $attempt)"
    sleep "$delay"
    delay=$((delay * 2))
  done
}

push_repo "$WORK/bqe-frontend" "bqe-frontend"
push_repo "$WORK/bqe-backend" "bqe-backend"

cat <<DONE

--------------------------------------------------------------------------
Both pushed.

  https://github.com/$GITHUB_OWNER/bqe-frontend
  https://github.com/$GITHUB_OWNER/bqe-backend

Neither will deploy yet — each needs its secrets first:
  frontend: docs/DEPLOYMENT.md
  backend:  README.md and docs/SECRETS.md
--------------------------------------------------------------------------
DONE
