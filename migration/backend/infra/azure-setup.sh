#!/usr/bin/env bash
#
# One-time Azure provisioning for the BQE backend.
#
# Creates a Container Apps environment and a Container App sized to stay
# inside Azure's monthly free grant (180,000 vCPU-seconds, 360,000 GiB-seconds
# and 2,000,000 requests per subscription). The app scales to zero when idle,
# so an hour with no visitors costs nothing at all.
#
# Safe to re-run: every step checks before it creates.
#
# Prerequisites:
#   az login
#   az account set --subscription "<your subscription>"
#
# Usage:
#   ./infra/azure-setup.sh
#
set -euo pipefail

# --------------------------------------------------------------------------- #
# settings — override any of these from the environment
LOCATION="${LOCATION:-westeurope}"
RESOURCE_GROUP="${RESOURCE_GROUP:-bqe-rg}"
ENVIRONMENT="${ENVIRONMENT:-bqe-env}"
APP_NAME="${APP_NAME:-bqe-backend}"
GITHUB_REPO="${GITHUB_REPO:-SchwarzRene/bqe-backend}"

# Which browsers may call the API. Set this to the Cloudflare Pages domain
# once it exists; it can be changed later without redeploying the image.
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://bqe-frontend.pages.dev}"

# Until the first GitHub Actions run pushes a real image, the app runs
# Microsoft's hello-world container so that the resource exists and the
# deploy workflow has something to update.
PLACEHOLDER_IMAGE="mcr.microsoft.com/k8se/quickstart:latest"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# --------------------------------------------------------------------------- #
say "Checking the Azure CLI and the containerapp extension"
command -v az >/dev/null || { echo "az not found: https://aka.ms/azure-cli"; exit 1; }
az extension add --name containerapp --upgrade --only-show-errors >/dev/null
az provider register --namespace Microsoft.App --wait --only-show-errors
az provider register --namespace Microsoft.OperationalInsights --wait --only-show-errors

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
echo "subscription: $SUBSCRIPTION_ID"

# --------------------------------------------------------------------------- #
say "Resource group: $RESOURCE_GROUP"
if ! az group show --name "$RESOURCE_GROUP" --only-show-errors >/dev/null 2>&1; then
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
  echo "created"
else
  echo "already exists"
fi

# --------------------------------------------------------------------------- #
say "Container Apps environment: $ENVIRONMENT"
if ! az containerapp env show --name "$ENVIRONMENT" --resource-group "$RESOURCE_GROUP" \
      --only-show-errors >/dev/null 2>&1; then
  # The Consumption-only environment is the one covered by the free grant.
  az containerapp env create \
    --name "$ENVIRONMENT" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none
  echo "created"
else
  echo "already exists"
fi

# --------------------------------------------------------------------------- #
say "Container App: $APP_NAME"
if ! az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
      --only-show-errors >/dev/null 2>&1; then
  az containerapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT" \
    --image "$PLACEHOLDER_IMAGE" \
    --target-port 8080 \
    --ingress external \
    --cpu 0.25 --memory 0.5Gi \
    --min-replicas 0 \
    --max-replicas 3 \
    --env-vars "APP_ENV=production" "ALLOWED_ORIGINS=$ALLOWED_ORIGINS" \
    --output none
  echo "created with the placeholder image — the next push to main replaces it"
else
  echo "already exists (leaving the running image alone)"
fi

# --------------------------------------------------------------------------- #
# Scale to zero is what keeps this free, and one request per replica per
# second is enough headroom for a page that fetches a few hundred quotes.
say "Applying the scale rule"
az containerapp update \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --min-replicas 0 \
  --max-replicas 3 \
  --scale-rule-name http-rule \
  --scale-rule-type http \
  --scale-rule-http-concurrency 50 \
  --output none

FQDN="$(az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
        --query properties.configuration.ingress.fqdn -o tsv)"

cat <<SUMMARY

--------------------------------------------------------------------------
Done. The backend will live at:

    https://$FQDN

Set these in GitHub -> bqe-backend -> Settings -> Secrets and variables ->
Actions -> Variables:

    AZURE_RESOURCE_GROUP   $RESOURCE_GROUP
    AZURE_CONTAINER_APP    $APP_NAME

Next: run ./infra/github-oidc.sh to let GitHub Actions deploy without
storing an Azure password.
--------------------------------------------------------------------------
SUMMARY
