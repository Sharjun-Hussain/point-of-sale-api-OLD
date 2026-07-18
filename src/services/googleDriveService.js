const { google } = require('googleapis');
const stream = require('stream');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // e.g., 'http://localhost:5000/api/crm/text-lk/drive/callback' or frontend url

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

/**
 * Generate Google Drive OAuth URL
 */
const getAuthUrl = () => {
    return oauth2Client.generateAuthUrl({
        access_type: 'offline', // Get refresh token
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/drive.file' // Only files created by this app
        ]
    });
};

/**
 * Exchange code for tokens
 */
const getTokens = async (code) => {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
};

/**
 * Get or create a specific folder in Google Drive
 */
const getOrCreateFolder = async (auth, folderName) => {
    const drive = google.drive({ version: 'v3', auth });
    
    // Search for the folder
    const res = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive'
    });

    if (res.data.files.length > 0) {
        return res.data.files[0].id;
    }

    // Create the folder if it doesn't exist
    const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
    };

    const folder = await drive.files.create({
        resource: fileMetadata,
        fields: 'id'
    });

    return folder.data.id;
};

/**
 * Upload a PDF buffer to Google Drive
 */
const uploadPdf = async (refreshToken, pdfBuffer, fileName) => {
    if (!refreshToken) throw new Error("Google Drive is not connected (No refresh token)");

    // Set credentials for this specific upload
    const client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );
    client.setCredentials({ refresh_token: refreshToken });

    const drive = google.drive({ version: 'v3', auth: client });

    // Ensure our designated folder exists
    const folderId = await getOrCreateFolder(client, 'ERP Invoices');

    // Convert Buffer to Stream
    const bufferStream = new stream.PassThrough();
    bufferStream.end(pdfBuffer);

    // Upload the file
    const fileMetadata = {
        name: fileName,
        parents: [folderId]
    };
    
    const media = {
        mimeType: 'application/pdf',
        body: bufferStream
    };

    const file = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink, webContentLink'
    });

    // Make the file publicly accessible (anyone with the link can view)
    await drive.permissions.create({
        fileId: file.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone'
        }
    });

    return file.data;
};

module.exports = {
    getAuthUrl,
    getTokens,
    uploadPdf
};
