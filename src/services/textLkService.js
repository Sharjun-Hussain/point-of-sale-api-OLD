const { Setting, Organization } = require('../models');
const logger = require('../utils/logger');
const { decrypt } = require('../utils/security');

class TextLkService {
    constructor() {
        this.baseUrl = 'https://app.text.lk/api/v3';
    }

    /**
     * Get full config including credentials
     */
    async _getFullConfig(organizationId) {
        const setting = await Setting.findOne({
            where: {
                organization_id: organizationId,
                category: 'textlk_crm',
                branch_id: null
            }
        });

        if (!setting) return null;

        let rawData = setting.settings_data;
        if (typeof rawData === 'string') {
            try {
                rawData = JSON.parse(rawData);
            } catch (e) {
                logger.error(`Text.lk: Failed to parse settings_data: ${e.message}`);
                return null;
            }
        }

        const config = { ...rawData };
        if (config.apiKey) config.apiKey = decrypt(config.apiKey);

        return config;
    }

    /**
     * Verify connection to Text.lk API
     */
    async verifyConnection(config) {
        try {
            const { apiKey } = config;
            if (!apiKey) throw new Error('API Key is required');

            // Using the GET contacts endpoint as a connectivity check
            const response = await fetch(`${this.baseUrl}/contacts?limit=1`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(10000)
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || data.status === 'error' || data.message === 'Unauthenticated.') {
                return {
                    success: false,
                    error: data.message || 'Unauthorized'
                };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Send SMS
     */
    async sendSms(organizationId, payload) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config || !config.enabled) return null;

            const response = await fetch(`${this.baseUrl}/sms/send`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    recipient: payload.recipient,
                    sender_id: config.senderId || payload.sender_id,
                    message: payload.message,
                    template_id: payload.template_id // Optional
                }),
                signal: AbortSignal.timeout(15000)
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to send SMS');
            }

            return data;
        } catch (error) {
            logger.error(`Text.lk Send SMS Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get Contacts
     */
    async getContacts(organizationId, page = 1, limit = 50) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Text.lk not configured');

            const response = await fetch(`${this.baseUrl}/contacts?page=${page}&limit=${limit}`, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to fetch contacts');

            return data;
        } catch (error) {
            logger.error(`Text.lk Get Contacts Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get Contact Groups
     */
    async getGroups(organizationId) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Text.lk not configured');

            const response = await fetch(`${this.baseUrl}/contacts`, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to fetch groups');

            return data;
        } catch (error) {
            logger.error(`Text.lk Get Groups Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a Contact Group
     */
    async createGroup(organizationId, name) {
        try {
            const config = await this._getFullConfig(organizationId);
            const response = await fetch(`${this.baseUrl}/contacts`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ name }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to create group');
            return data;
        } catch (error) {
            logger.error(`Text.lk Create Group Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update a Contact Group
     */
    async updateGroup(organizationId, uid, name) {
        try {
            const config = await this._getFullConfig(organizationId);
            const response = await fetch(`${this.baseUrl}/contacts/${uid}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ name }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to update group');
            return data;
        } catch (error) {
            logger.error(`Text.lk Update Group Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create/Sync a Contact
     */
    async createContact(organizationId, contact) {
        try {
            const config = await this._getFullConfig(organizationId);
            const response = await fetch(`${this.baseUrl}/contacts/initialize`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    first_name: contact.first_name,
                    last_name: contact.last_name,
                    phone: contact.phone,
                    group_id: contact.group_id
                }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to create contact');
            return data;
        } catch (error) {
            logger.error(`Text.lk Create Contact Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Send Bulk Campaign
     */
    async sendCampaign(organizationId, payload) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config || !config.enabled) throw new Error('Text.lk not configured or disabled');

            const response = await fetch(`${this.baseUrl}/sms/campaign`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    contact_list_id: payload.contact_list_id,
                    sender_id: config.senderId || payload.sender_id,
                    type: 'plain',
                    message: payload.message,
                    dlt_template_id: payload.dlt_template_id,
                    schedule_time: payload.schedule_time
                }),
                signal: AbortSignal.timeout(20000)
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to send campaign');
            return data;
        } catch (error) {
            logger.error(`Text.lk Send Campaign Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get Balance
     */
    async getBalance(organizationId) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Text.lk not configured');

            const response = await fetch(`${this.baseUrl}/balance`, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to fetch balance');

            return data;
        } catch (error) {
            logger.error(`Text.lk Get Balance Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get SMS Logs
     */
    async getSmsLogs(organizationId, page = 1, limit = 100) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Text.lk not configured');

            const response = await fetch(`${this.baseUrl}/sms?page=${page}&limit=${limit}`, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to fetch SMS logs');

            return data;
        } catch (error) {
            logger.error(`Text.lk Get SMS Logs Error: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new TextLkService();
