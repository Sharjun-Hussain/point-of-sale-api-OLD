const axios = require('axios');
const logger = require('../utils/logger');

class ChatwootService {
    constructor(config) {
        let baseUrl = (config.apiUrl || '').trim();
        if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
            baseUrl = `https://${baseUrl}`;
        }
        // Remove trailing slashes to prevent double-slash issues
        this.apiUrl = baseUrl.replace(/\/+$/, '');
        this.apiKey = (config.apiKey || '').trim();
        this.accountId = (config.accountId || '').toString().trim();
        this.inboxId = (config.inboxId || '').toString().trim();
        
        this.client = axios.create({
            baseURL: `${this.apiUrl}/api/v1/accounts/${this.accountId}`,
            headers: {
                'api_access_token': this.apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            // Explicitly set timeout and max redirects
            timeout: 10000,
            maxRedirects: 5
        });
    }

    /**
     * Search for a contact by phone number
     */
    async searchContact(phone) {
        try {
            const response = await this.client.get('/contacts/search', {
                params: { q: phone }
            });
            return response.data.payload[0] || null;
        } catch (error) {
            console.error('Chatwoot searchContact error:', error.message);
            return null;
        }
    }

    /**
     * Create a new contact
     */
    async createContact(contactData) {
        try {
            const response = await this.client.post('/contacts', {
                name: contactData.name,
                phone_number: contactData.phone,
                email: contactData.email,
                custom_attributes: contactData.custom_attributes
            });
            return response.data.payload.contact;
        } catch (error) {
            console.error('Chatwoot createContact error:', error.message);
            throw error;
        }
    }

    /**
     * Find or create a conversation for a contact
     */
    async getOrCreateConversation(contactId) {
        try {
            // Check for existing conversations
            const conversationsResponse = await this.client.get(`/contacts/${contactId}/conversations`);
            const existing = conversationsResponse.data.payload.find(c => c.inbox_id == this.inboxId);
            
            if (existing) return existing;

            // Create new conversation
            const response = await this.client.post('/conversations', {
                contact_id: contactId,
                inbox_id: this.inboxId
            });
            return response.data;
        } catch (error) {
            console.error('Chatwoot getOrCreateConversation error:', error.message);
            throw error;
        }
    }

    /**
     * Send a message to a conversation
     */
    async sendMessage(conversationId, content, messageType = 'outgoing') {
        try {
            const response = await this.client.post(`/conversations/${conversationId}/messages`, {
                content: content,
                message_type: messageType,
                private: false
            });
            return response.data;
        } catch (error) {
            console.error('Chatwoot sendMessage error:', error.message);
            throw error;
        }
    }

    /**
     * Fetch WhatsApp templates from Chatwoot (if available via API)
     * Note: Chatwoot usually fetches these from the provider (Cloud API)
     */
    async getTemplates() {
        const endpoints = [
            `/inboxes/${this.inboxId}/whatsapp_templates`,
            `/inboxes/${this.inboxId}/message_templates`,
            `/inboxes/${this.inboxId}`
        ];

        for (const endpoint of endpoints) {
            try {
                logger.info(`[Chatwoot] Probing templates at: ${endpoint}`);
                const response = await this.client.get(endpoint);
                
                // Case 1: Payload array (Standard for specialized endpoints)
                if (response.data && Array.isArray(response.data.payload) && response.data.payload.length > 0) {
                    logger.info(`[Chatwoot] Found ${response.data.payload.length} templates in payload`);
                    return response.data.payload;
                }
                
                // Case 2: Direct array
                if (Array.isArray(response.data) && response.data.length > 0) {
                    logger.info(`[Chatwoot] Found ${response.data.length} templates in direct array`);
                    return response.data;
                }

                // Case 3: Inside inbox metadata (Root endpoint)
                if (response.data && response.data.whatsapp_templates && Array.isArray(response.data.whatsapp_templates)) {
                    logger.info(`[Chatwoot] Found ${response.data.whatsapp_templates.length} templates in metadata`);
                    return response.data.whatsapp_templates;
                }
            } catch (error) {
                const errorData = error.response ? JSON.stringify(error.response.data) : error.message;
                logger.warn(`[Chatwoot] Endpoint ${endpoint} failed: ${errorData}`);
            }
        }

        logger.info('[Chatwoot] No templates found in any known locations');
        return [];
    }
}

module.exports = ChatwootService;
