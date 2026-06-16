const { UserDraft } = require('../models');

exports.saveDraft = async (req, res) => {
  try {
    const { id, form_type, summary, payload } = req.body;
    const organization_id = req.user.organization_id;
    const user_id = req.user.id;

    if (!form_type || !payload) {
      return res.status(400).json({ status: 'error', message: 'form_type and payload are required' });
    }

    if (id) {
      // Check if it exists
      const existing = await UserDraft.findOne({
        where: { id, organization_id, user_id }
      });

      if (existing) {
        existing.summary = summary || existing.summary;
        existing.payload = payload;
        existing.form_type = form_type;
        await existing.save();

        return res.status(200).json({
          status: 'success',
          message: 'Draft updated successfully',
          data: existing
        });
      }
    }

    // Create new
    const draft = await UserDraft.create({
      id: id || require('crypto').randomUUID(), // Ensure an ID exists

      user_id,
      organization_id,
      form_type,
      summary,
      payload
    });

    res.status(201).json({
      status: 'success',
      message: 'Draft saved successfully',
      data: draft
    });
  } catch (error) {
    console.error('saveDraft error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to save draft' });
  }
};

exports.getDrafts = async (req, res) => {
  try {
    const organization_id = req.user.organization_id;
    const user_id = req.user.id;
    const { form_type } = req.query;

    const where = { organization_id, user_id };
    if (form_type) {
      where.form_type = form_type;
    }

    const drafts = await UserDraft.findAll({
      where,
      order: [['updated_at', 'DESC']]
    });

    res.status(200).json({
      status: 'success',
      data: drafts
    });
  } catch (error) {
    console.error('getDrafts error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get drafts' });
  }
};

exports.deleteDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const organization_id = req.user.organization_id;
    const user_id = req.user.id;

    const deleted = await UserDraft.destroy({
      where: { id, organization_id, user_id }
    });

    if (!deleted) {
      return res.status(404).json({ status: 'error', message: 'Draft not found' });
    }

    res.status(200).json({
      status: 'success',
      message: 'Draft deleted successfully'
    });
  } catch (error) {
    console.error('deleteDraft error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete draft' });
  }
};
