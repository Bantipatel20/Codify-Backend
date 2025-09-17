// utils/scheduledTasks.js
const cron = require('node-cron');
const AutoSave = require('../models/AutoSave');

// Run cleanup every day at 2 AM
cron.schedule('0 2 * * *', async () => {
    try {
        console.log('Starting auto-save cleanup...');
        const result = await AutoSave.cleanupOld();
        console.log(`Auto-save cleanup completed. Deleted ${result.deletedCount} old records.`);
    } catch (error) {
        console.error('Auto-save cleanup failed:', error);
    }
});

module.exports = { /* export any needed functions */ };
