const { Setting, Unit } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { decrypt } = require('../utils/security');

/**
 * AI Assistant for generating inventory entities
 */
const generateUnits = async (req, res, next) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return errorResponse(res, 'Neural prompt is required', 400);

        // 1. Fetch AI Settings & Organization Context
        const [aiSetting, organization] = await Promise.all([
            Setting.findOne({
                where: {
                    organization_id: req.user.organization_id,
                    category: 'ai'
                }
            }),
            require('../models').Organization.findByPk(req.user.organization_id)
        ]);

        if (!aiSetting || !aiSetting.settings_data) {
            return errorResponse(res, 'AI not configured. Please setup API keys in Settings.', 400);
        }

        // === DEFENSIVE PARSING ===
        let rawData = aiSetting.settings_data;
        if (typeof rawData === 'string') {
            try {
                rawData = JSON.parse(rawData);
            } catch (e) {
                console.error('[AI] JSON Parse failed, attempting fallback...');
                // If it's a string that looks like a JSON object but fails raw parse
                rawData = {};
            }
        }
        // ==========================

        console.log('[AI DEBUG] active_model:', rawData?.active_model);
        console.log('[AI DEBUG] openai_key prefix:', rawData?.openai_key ? rawData.openai_key.substring(0, 12) : 'EMPTY');
        console.log('[AI DEBUG] claude_key prefix:', rawData?.claude_key ? rawData.claude_key.substring(0, 12) : 'EMPTY');

        const { openai_key, claude_key, active_model } = rawData || {};
        
        // SELF-HEALING: Determine which key to use based on model or availability
        let rawKey = '';
        const isOpenAI = active_model?.toLowerCase().includes('gpt');
        const isClaude = active_model?.toLowerCase().includes('claude');

        if (isOpenAI) {
            rawKey = openai_key;
        } else if (isClaude) {
            rawKey = claude_key;
        } else {
            rawKey = openai_key || claude_key;
        }

        if (!rawKey) {
            return errorResponse(res, 'No API key found in settings. Please add your API key in Settings > AI Intelligence.', 400);
        }

        // DECRYPT: Get the plaintext key
        let apiKey = '';
        try {
            apiKey = decrypt(rawKey);
        } catch (decryptErr) {
            console.error('[AI] Decryption error:', decryptErr.message);
        }

        // Validate: A real OpenAI key starts with 'sk-', Anthropic with 'sk-ant-'
        const isValidKey = apiKey && (apiKey.startsWith('sk-') || apiKey.startsWith('sk-ant-'));
        if (!isValidKey) {
            const debugInfo = rawKey ? `[${rawKey.substring(0, 7)}...]` : '[EMPTY]';
            return errorResponse(res, `Neural link rejected: Could not decrypt API key ${debugInfo}. Please re-enter your API key in Settings > AI Intelligence and save again.`, 400);
        }

        // 2. Prepare Context-Aware System Prompt
        const orgInfo = organization ? `The organization is "${organization.name}" operating in the ${organization.industry || 'Retail'} industry.` : '';
        const systemPrompt = `You are an expert AI consultant for Inzeedo POS, a high-premium point-of-sale system. 
        ${orgInfo}
        Your task is to generate professional measurement units based on the user's requirements.
        Units must follow industrial standards (e.g., metric, imperial, or industry-specific packaging protocols).
        
        Return ONLY a JSON array of objects with the following schema:
        [
            { "name": "Full Name", "short_name": "CODE" }
        ]
        Example: [{ "name": "Kilogram", "short_name": "KG" }]
        Do not include any conversational text or markdown code blocks. Just the raw JSON array.`;

        // 3. Dispatch to appropriate AI Provider
        let content = '';
        if (isClaude) {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: active_model,
                    max_tokens: 1024,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: prompt }]
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || 'Claude Handshake Failed');
            }

            const result = await response.json();
            content = result.content[0].text;
        } else {
            // Default to OpenAI
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: active_model || 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || 'OpenAI Handshake Failed');
            }

            const result = await response.json();
            content = result.choices[0].message.content;
        }
        
        // Parse the JSON
        let rawUnits = [];
        try {
            rawUnits = JSON.parse(content.match(/\[.*\]/s)[0]);
        } catch (e) {
            console.error("AI JSON Parse Error:", content);
            throw new Error("AI returned an invalid data structure.");
        }

        // SELF-CORRECTING MAPPING: Ensure AI fields match DB exactly
        const units = rawUnits.map(u => ({
            name: u.name,
            short_name: u.short_name || u.slug || u.short_code || u.code || 'UNIT',
            is_active: true
        }));

        return successResponse(res, units, 'AI Units Generated');

    } catch (error) {
        next(error);
    }
};

module.exports = {
    generateUnits
};
