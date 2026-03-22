require('dotenv').config();
const { User } = require('./src/models');
const bcrypt = require('bcryptjs');

const reset = async () => {
    try {
        const passwordHash = await bcrypt.hash('admin123', 10);
        await User.update({ password: passwordHash }, { where: { email: 'admin@emipos.com' } });
        console.log('Password reset to admin123 for admin@emipos.com');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

reset();
