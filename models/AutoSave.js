// models/AutoSave.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AutoSaveSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    problemId: {
        type: String, // Can be ObjectId for existing problems or string for manual problems
        required: true
    },
    contestId: {
        type: Schema.Types.ObjectId,
        ref: 'Contest',
        default: null // null for standalone problems
    },
    code: {
        type: String,
        required: true,
        maxlength: 100000 // 100KB limit for auto-save
    },
    language: {
        type: String,
        required: true,
        enum: ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php']
    },
    lastSavedAt: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    metadata: {
        cursorPosition: {
            line: { type: Number, default: 0 },
            column: { type: Number, default: 0 }
        },
        scrollPosition: {
            type: Number,
            default: 0
        },
        theme: {
            type: String,
            default: 'dark'
        }
    }
});

// Compound index for efficient queries
AutoSaveSchema.index({ userId: 1, problemId: 1, contestId: 1 }, { unique: true });
AutoSaveSchema.index({ userId: 1, lastSavedAt: -1 });
AutoSaveSchema.index({ lastSavedAt: 1 }); // For cleanup of old auto-saves

// Pre-save middleware to update lastSavedAt
AutoSaveSchema.pre('save', function(next) {
    this.lastSavedAt = new Date();
    next();
});

// Method to check if auto-save is recent (within last 5 minutes)
AutoSaveSchema.methods.isRecent = function() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.lastSavedAt > fiveMinutesAgo;
};

// Static method to cleanup old auto-saves (older than 7 days)
AutoSaveSchema.statics.cleanupOld = async function() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.deleteMany({ lastSavedAt: { $lt: sevenDaysAgo } });
};

module.exports = mongoose.model('AutoSave', AutoSaveSchema);
