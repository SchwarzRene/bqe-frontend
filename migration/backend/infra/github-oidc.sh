#!/usr/bin/env bash
#
# Let GitHub Actions deploy to Azure without storing an Azure password.
#
# Instead of a client secret that sits in GitHub until someone rotates it,
# this sets up workload identity federation: GitHub mints a short-lived token
# for each workflow run, Azure verifies it came from this repository on this
# branch, and hands back an access token that expires in minutes. There is no
# long-lived credential anywhere, so there is none to leak.
#
# Prerequisites:
#   az login          (as someone who can create app registrations and
#                      assign roles on the subscription)
#
# Usage:
#   ./infra/github-oidc.sh
#
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-bqe-rg}"
APP_REGISTRATION="${APP_REGISTRATION:-bqe-backend-deploy}"
GITHUB_ORG="${GITHUB_ORG:-SchwarzRene}"
GITHUB_REPO="${GITHUB_REPO:-bqe-backend}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"

# --------------------------------------------------------------------------- #
say "App registration: $APP_REGISTRATION"
CLIENT_ID="$(az ad app list --display-name "$APP_REGISTRATION" --query "[0].appId" -o tsv)"
if [ -z "$CLIENT_ID" ]; then
  CLIENT_ID="$(az ad app create --display-name "$APP_REGISTRATION" --query appId -o tsv)"
  echo "created $CLIENT_ID"
else
  echo "already exists: $CLIENT_ID"
fi

if [ -z "$(az ad sp list --filter "appId eq '$CLIENT_ID'" --query "[0].id" -o tsv)" ]; then
  az ad sp create --id "$CLIENT_ID" --output none
  echo "service principal created"
fi

# --------------------------------------------------------------------------- #
# One federated credential per trusted context. The deploy workflow runs on
# main and in the "production" environment; nothing else can use this identity.
say "Federated credentials"
add_credential() {
  local name="$1" subject="$2"
  if az ad app federated-credential list --id "$CLIENT_ID" \
       --query "[?name=='$name'] | [0].name" -o tsv | grep -q .; then
    echo "  $name: already exists"
    return
  fi
  az ad app federated-credential create --id "$CLIENT_ID" --parameters "{
    \"name\": \"$name\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"$subject\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" --output none
  echo "  $name: created"
}

add_credential "main-branch" "repo:${GITHUB_ORG}/${GITHUB_REPO}:ref:refs/heads/main"
add_credential "production-env" "repo:${GITHUB_ORG}/${GITHUB_REPO}:environment:production"

# --------------------------------------------------------------------------- #
# Contributor on the resource group only — not on the whole subscription.
# The deploy job updates one Container App; it has no business anywhere else.
say "Role assignment (Contributor, scoped to $RESOURCE_GROUP)"
SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"
if az role assignment list --assignee "$CLIENT_ID" --scope "$SCOPE" \
     --query "[?roleDefinitionName=='Contributor'] | [0].id" -o tsv | grep -q .; then
  echo "already assigned"
else
  az role assignment create \
    --assignee "$CLIENT_ID" \
    --role Contributor \
    --scope "$SCOPE" \
    --output none
  echo "assigned"
fi

cat <<SUMMARY

--------------------------------------------------------------------------
Add these three as GitHub *secrets* in bqe-backend
(Settings -> Secrets and variables -> Actions -> New repository secret):

    AZURE_CLIENT_ID         $CLIENT_ID
    AZURE_TENANT_ID         $TENANT_ID
    AZURE_SUBSCRIPTION_ID   $SUBSCRIPTION_ID

None of the three is a password. They identify the account; the proof of
identity is the short-lived token GitHub mints for each run. They are still
kept as secrets so the subscription layout is not public.
--------------------------------------------------------------------------
SUMMARY
