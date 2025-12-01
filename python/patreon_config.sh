# AxeBench Patreon Configuration
# ================================
# This file configures the Patreon integration for licensing.
# 
# SETUP INSTRUCTIONS:
# 1. Go to https://www.patreon.com/portal/registration/register-clients
# 2. Create a new client (application)
# 3. Set the redirect URI to: http://localhost:5000/auth/patreon/callback
# 4. Copy your Client ID and Client Secret below
# 5. Get your Campaign ID from your Patreon creator dashboard URL
#    (e.g., https://www.patreon.com/api/oauth2/v2/campaigns/12345678)
# 6. Set the minimum pledge amount (in cents, e.g., 500 = $5.00)
#
# You can set these values either:
# - As environment variables (recommended for production)
# - By editing licensing.py directly
#
# ENVIRONMENT VARIABLES:
# export PATREON_CLIENT_ID="your_client_id"
# export PATREON_CLIENT_SECRET="your_client_secret"
# export PATREON_CAMPAIGN_ID="your_campaign_id"
# export PATREON_MIN_PLEDGE="500"
# export PATREON_REDIRECT_URI="http://localhost:5000/auth/patreon/callback"

# For convenience, you can source this file after filling in the values:
# source patreon_config.sh

export PATREON_CLIENT_ID="YOUR_CLIENT_ID_HERE"
export PATREON_CLIENT_SECRET="YOUR_CLIENT_SECRET_HERE"
export PATREON_CAMPAIGN_ID="YOUR_CAMPAIGN_ID_HERE"
export PATREON_MIN_PLEDGE="500"
export PATREON_REDIRECT_URI="http://localhost:5000/auth/patreon/callback"

# Note: If these are not configured, AxeBench will run without the 
# Patreon banner (no nag screen, no patron features).
