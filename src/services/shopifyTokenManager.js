const { Setting } = require('../models');
const logger = require('../utils/logger');

/**
 * ShopifyTokenManager
 * 
 * Shopify Dev Dashboard apps (post-2024) issue tokens that expire every 24 hours.
 * This manager:
 *   1. Stores the current token + its expiry in memory (per org)
 *   2. Automatically refreshes via Client Credentials Grant before expiry
 *   3. Falls back to the manually-entered token if no client_id/secret configured
 * 
 * Token refresh endpoint:
 *   POST https://{shop}.myshopify.com/admin/oauth/access_token
 *   Body: { client_id, client_secret, grant_type: "client_credentials" }
 */

// In-memory cache: organizationId -> { token, expiresAt }
const tokenCache = new Map();

// Token expires in 24h; refresh 30 minutes before expiry to be safe
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;       // 24 hours
const REFRESH_BUFFER_MS = 30 * 60 * 1000;             // 30 minutes early

class ShopifyTokenManager {
    /**
     * Get a valid access token for the given organization.
     * Will auto-refresh if the cached token is near expiry.
     */
    async getValidToken(organizationId) {
        const cached = tokenCache.get(organizationId);
        const now = Date.now();

        // Return cached token if still valid (not within buffer period)
        if (cached && cached.expiresAt - now > REFRESH_BUFFER_MS) {
            return cached.token;
        }

        // Attempt to refresh using client credentials
        const config = await this._loadConfig(organizationId);
        if (!config) return null;

        const { access_token, client_id, client_secret, shop_url } = config;

        // If we have OAuth credentials, refresh programmatically
        if (client_id && client_secret && shop_url) {
            const freshToken = await this._fetchNewToken(shop_url, client_id, client_secret);
            if (freshToken) {
                tokenCache.set(organizationId, {
                    token: freshToken,
                    expiresAt: now + TOKEN_LIFETIME_MS
                });
                // Persist the new token back to settings
                await this._persistToken(organizationId, freshToken, config);
                logger.info(`Shopify: Token refreshed for org ${organizationId}`);
                return freshToken;
            }
        }

        // Fallback: use the stored access_token (may be manually entered)
        if (access_token) {
            tokenCache.set(organizationId, {
                token: access_token,
                expiresAt: now + TOKEN_LIFETIME_MS
            });
            return access_token;
        }

        return null;
    }

    /**
     * Force-refresh the token immediately (called after config save)
     */
    async forceRefresh(organizationId) {
        tokenCache.delete(organizationId);
        return this.getValidToken(organizationId);
    }

    /**
     * Store a newly-obtained token into the cache (called after verify/save)
     */
    cacheToken(organizationId, token) {
        tokenCache.set(organizationId, {
            token,
            expiresAt: Date.now() + TOKEN_LIFETIME_MS
        });
    }

    /**
     * Invalidate the cache for an org (called on config delete/reset)
     */
    invalidate(organizationId) {
        tokenCache.delete(organizationId);
    }

    /**
     * Fetch a fresh access token from Shopify using Client Credentials Grant.
     * POST https://{shop}.myshopify.com/admin/oauth/access_token
     */
    async _fetchNewToken(shop_url, client_id, client_secret) {
        try {
            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const url = `https://${cleanShopUrl}/admin/oauth/access_token`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id,
                    client_secret,
                    grant_type: 'client_credentials'
                }),
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                logger.error(`Shopify token refresh failed (${response.status}): ${JSON.stringify(body)}`);
                return null;
            }

            const data = await response.json();
            if (data.access_token) {
                logger.info(`Shopify: Successfully obtained new access token via Client Credentials Grant`);
                return data.access_token;
            }
            return null;
        } catch (err) {
            logger.error(`Shopify token refresh error: ${err.message}`);
            return null;
        }
    }

    /**
     * Load shopify config from DB settings
     */
    async _loadConfig(organizationId) {
        try {
            const setting = await Setting.findOne({
                where: { organization_id: organizationId, category: 'shopify' }
            });
            return setting?.settings_data || null;
        } catch (err) {
            logger.error(`ShopifyTokenManager: Failed to load config: ${err.message}`);
            return null;
        }
    }

    /**
     * Persist the refreshed token back to the settings DB
     */
    async _persistToken(organizationId, newToken, existingConfig) {
        try {
            await Setting.update(
                {
                    settings_data: {
                        ...existingConfig,
                        access_token: newToken,
                        token_refreshed_at: new Date().toISOString()
                    }
                },
                { where: { organization_id: organizationId, category: 'shopify' } }
            );
        } catch (err) {
            logger.error(`ShopifyTokenManager: Failed to persist token: ${err.message}`);
        }
    }
}

module.exports = new ShopifyTokenManager();
