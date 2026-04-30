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

        // 1. Fetch AI Settings
        const aiSetting = await Setting.findOne({
            where: {
                organization_id: req.user.organization_id,
                category: 'ai'
            }
        });

        if (!aiSetting || !aiSetting.settings_data) {
            return errorResponse(res, 'AI not configured. Please setup API keys in Settings.', 400);
        }

        const { openai_key, claude_key, active_model } = aiSetting.settings_data;
        const apiKey = active_model?.includes('gpt') ? decrypt(openai_key) : decrypt(claude_key);

        if (!apiKey || apiKey.includes('*')) {
            return errorResponse(res, 'Valid API key not found. Please re-save AI settings.', 400);
        }

        // 2. Prepare System Prompt
        const systemPrompt = `You are an inventory management expert. Generate a list of measurement units based on the user's industry or request.
        Return ONLY a JSON array of objects with the following schema:
        [
            { "name": "Unit Full Name", "slug": "SHORT_NAME", "description": "Brief description" }
        ]
        Example: [{ "name": "Kilogram", "slug": "KG", "description": "Standard metric mass unit" }]
        Do not include any text outside the JSON array.`;

        // 3. Call OpenAI (Defaulting to GPT for this helper)
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
            throw new Error(err.error?.message || 'AI Handshake Failed');
        }

        const result = await response.json();
        const content = result.choices[0].message.content;
        
        // Parse the JSON
        let units = [];
        try {
            units = JSON.parse(content.match(/\[.*\]/s)[0]);
        } catch (e) {
            console.error("AI JSON Parse Error:", content);
            throw new Error("AI returned an invalid data structure.");
        }

        return successResponse(res, units, 'AI Units Generated');

    } catch (error) {
        next(error);
    }
};

module.exports = {
    generateUnits
};
