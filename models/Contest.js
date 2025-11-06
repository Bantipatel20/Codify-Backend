// models/Contest.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ContestParticipantSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: true
    },
    semester: {
        type: Number,
        required: true
    },
    division: {
        type: Number,
        required: true
    },
    batch: {
        type: String,
        required: true
    },
    score: {
        type: Number,
        default: 0,
        min: 0
    },
    submissions: {
        type: Number,
        default: 0,
        min: 0
    },
    problemsAttempted: [{
        problemId: {
            type: String,
            required: true
        },
        attempts: {
            type: Number,
            default: 0
        },
        solved: {
            type: Boolean,
            default: false
        },
        score: {
            type: Number,
            default: 0
        },
        lastAttemptTime: {
            type: Date
        }
    }],
    registrationTime: {
        type: Date,
        default: Date.now
    },
    lastActivityTime: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const ContestProblemSchema = new Schema({
    problemId: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    difficulty: {
        type: String,
        enum: ['Easy', 'Medium', 'Hard'],
        required: true
    },
    category: {
        type: String,
        required: true
    },
    points: {
        type: Number,
        required: true,
        min: 0
    },
    order: {
        type: Number,
        default: 0
    },
    solvedCount: {
        type: Number,
        default: 0
    },
    attemptCount: {
        type: Number,
        default: 0
    },
    manualProblem: {
        description: {
            type: String
        },
        inputFormat: {
            type: String
        },
        outputFormat: {
            type: String
        },
        constraints: {
            type: String
        },
        sampleInput: {
            type: String
        },
        sampleOutput: {
            type: String
        },
        explanation: {
            type: String
        },
        testCases: [{
            input: {
                type: String,
                required: true
            },
            expectedOutput: {
                type: String,
                required: true
            },
            isHidden: {
                type: Boolean,
                default: false
            }
        }]
    }
}, { _id: false });

const FilterCriteriaSchema = new Schema({
    department: [{
        type: String,
        enum: ['AIML', 'CSE', 'IT', 'ECE', 'MECH', 'CIVIL']
    }],
    semester: [{
        type: Number,
        min: 1,
        max: 8
    }],
    division: [{
        type: Number,
        min: 1,
        max: 2
    }],
    batch: [{
        type: String,
        enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
    }],
    semesterType: {
        type: String,
        enum: ['all', 'even', 'odd'],
        default: 'all'
    }
}, { _id: false });

const ContestSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
        // Date validation removed - Allow any end date
        // validate: {
        //     validator: function(endDate) {
        //         return endDate > this.startDate;
        //     },
        //     message: 'End date must be after start date'
        // }
    },
    duration: {
        type: String,
        required: true
    },
    // Language configuration for the contest
    language: {
        type: String,
        required: true,
        enum: ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php'],
        default: 'cpp'
    },
    // Alternative: Support multiple languages for the contest
    allowedLanguages: [{
        type: String,
        enum: ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php']
    }],
    // Language-specific settings
    languageSettings: {
        timeLimit: {
            type: Number, // in seconds
            default: 30,
            min: 1,
            max: 300
        },
        memoryLimit: {
            type: Number, // in MB
            default: 256,
            min: 64,
            max: 1024
        },
        compilerVersion: {
            type: String,
            default: 'latest'
        },
        compilerFlags: {
            type: String,
            default: ''
        }
    },
    status: {
        type: String,
        enum: ['Upcoming', 'Active', 'Completed', 'Cancelled'],
        default: 'Upcoming'
    },
    rules: {
        type: String,
        maxlength: 2000,
        default: 'Standard contest rules apply'
    },
    maxParticipants: {
        type: Number,
        required: true,
        min: 1,
        default: 100
    },
    problems: {
        type: [ContestProblemSchema],
        required: true,
        validate: {
            validator: function(problems) {
                return problems && problems.length > 0;
            },
            message: 'At least one problem is required'
        }
    },
    participants: {
        type: [ContestParticipantSchema],
        default: []
    },
    participantSelection: {
        type: String,
        enum: ['manual', 'automatic'],
        default: 'manual'
    },
    filterCriteria: {
        type: FilterCriteriaSchema,
        default: {}
    },
    totalPoints: {
        type: Number,
        default: 0,
        min: 0
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    analytics: {
        totalSubmissions: {
            type: Number,
            default: 0
        },
        successfulSubmissions: {
            type: Number,
            default: 0
        },
        averageScore: {
            type: Number,
            default: 0
        },
        participationRate: {
            type: Number,
            default: 0
        }
    },
    settings: {
        allowLateSubmission: {
            type: Boolean,
            default: false
        },
        showLeaderboard: {
            type: Boolean,
            default: true
        },
        showLeaderboardDuringContest: {
            type: Boolean,
            default: true
        },
        freezeLeaderboard: {
            type: Boolean,
            default: false
        },
        freezeTime: {
            type: Number,
            default: 60
        },
        allowViewProblemsBeforeStart: {
            type: Boolean,
            default: false
        },
        penaltyPerWrongSubmission: {
            type: Number,
            default: 0
        },
        // Language-specific contest settings
        allowLanguageSwitching: {
            type: Boolean,
            default: false
        },
        defaultLanguage: {
            type: String,
            enum: ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php'],
            default: 'cpp'
        }
    },
    isActive: {
        type: Boolean,
        default: true
    }
});

// Indexes for better query performance
ContestSchema.index({ status: 1, startDate: 1 });
ContestSchema.index({ createdBy: 1 });
ContestSchema.index({ 'participants.userId': 1 });
ContestSchema.index({ createdAt: -1 });
ContestSchema.index({ startDate: 1, endDate: 1 });
ContestSchema.index({ 'problems.problemId': 1 });
ContestSchema.index({ language: 1 }); // Index for language filtering
ContestSchema.index({ allowedLanguages: 1 }); // Index for multi-language contests

// Pre-save middleware
ContestSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    this.totalPoints = this.problems.reduce((sum, problem) => sum + problem.points, 0);
    
    // Set default allowed languages if not specified
    if (!this.allowedLanguages || this.allowedLanguages.length === 0) {
        this.allowedLanguages = [this.language];
    }
    
    // Ensure the main language is in allowed languages
    if (this.language && !this.allowedLanguages.includes(this.language)) {
        this.allowedLanguages.push(this.language);
    }
    
    if (this.participants.length > 0) {
        const totalScore = this.participants.reduce((sum, p) => sum + p.score, 0);
        this.analytics.averageScore = totalScore / this.participants.length;
        this.analytics.participationRate = (this.participants.length / this.maxParticipants) * 100;
    }
    
    next();
});

// Virtual properties
ContestSchema.virtual('durationInHours').get(function() {
    if (this.startDate && this.endDate) {
        const diffHours = Math.abs(this.endDate - this.startDate) / 36e5;
        return Math.round(diffHours * 100) / 100;
    }
    return 0;
});

ContestSchema.virtual('successRate').get(function() {
    if (this.analytics.totalSubmissions === 0) return 0;
    return ((this.analytics.successfulSubmissions / this.analytics.totalSubmissions) * 100).toFixed(2);
});

ContestSchema.virtual('activeParticipantsCount').get(function() {
    return this.participants.filter(p => p.submissions > 0).length;
});

ContestSchema.virtual('manualProblemsCount').get(function() {
    return this.problems.filter(p => p.manualProblem && Object.keys(p.manualProblem).length > 0).length;
});

ContestSchema.virtual('existingProblemsCount').get(function() {
    return this.problems.filter(p => !p.problemId.startsWith('manual_')).length;
});

ContestSchema.virtual('isMultiLanguage').get(function() {
    return this.allowedLanguages && this.allowedLanguages.length > 1;
});

// Instance methods
ContestSchema.methods.isCurrentlyActive = function() {
    const now = new Date();
    return this.status === 'Active' && now >= this.startDate && now <= this.endDate;
};

ContestSchema.methods.getLeaderboard = function() {
    return this.participants
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.submissions !== b.submissions) return a.submissions - b.submissions;
            return new Date(a.lastActivityTime) - new Date(b.lastActivityTime);
        })
        .map((participant, index) => ({
            ...participant.toObject(),
            rank: index + 1
        }));
};

ContestSchema.methods.addParticipant = function(user) {
    const existingParticipant = this.participants.find(p => p.userId.toString() === user._id.toString());
    if (existingParticipant) {
        throw new Error('User is already registered for this contest');
    }
    
    if (this.participants.length >= this.maxParticipants) {
        throw new Error('Contest is full');
    }
    
    this.participants.push({
        userId: user._id,
        name: user.name,
        email: user.email,
        department: user.department,
        semester: user.semester || 1,
        division: user.division || 1,
        batch: user.batch || 'A1'
    });
    
    return this.save();
};

ContestSchema.methods.getProblemById = function(problemId) {
    return this.problems.find(p => p.problemId === problemId);
};

ContestSchema.methods.isManualProblem = function(problemId) {
    const problem = this.getProblemById(problemId);
    return problem && (problemId.startsWith('manual_') || (problem.manualProblem && Object.keys(problem.manualProblem).length > 0));
};

ContestSchema.methods.getManualProblems = function() {
    return this.problems.filter(p => this.isManualProblem(p.problemId));
};

ContestSchema.methods.getExistingProblems = function() {
    return this.problems.filter(p => !this.isManualProblem(p.problemId));
};

// Language-related methods
ContestSchema.methods.isLanguageAllowed = function(language) {
    return this.allowedLanguages.includes(language);
};

ContestSchema.methods.getLanguageConfig = function(language) {
    if (!this.isLanguageAllowed(language)) {
        throw new Error(`Language ${language} is not allowed in this contest`);
    }
    
    return {
        language: language,
        timeLimit: this.languageSettings.timeLimit,
        memoryLimit: this.languageSettings.memoryLimit,
        compilerVersion: this.languageSettings.compilerVersion,
        compilerFlags: this.languageSettings.compilerFlags
    };
};

ContestSchema.methods.updateLanguageSettings = function(settings) {
    this.languageSettings = { ...this.languageSettings, ...settings };
    return this.save();
};

// Static methods
ContestSchema.statics.findByStatus = function(status) {
    return this.find({ status, isActive: true }).sort({ startDate: -1 });
};

ContestSchema.statics.findUpcoming = function() {
    return this.find({ 
        status: 'Upcoming', 
        startDate: { $gt: new Date() },
        isActive: true 
    }).sort({ startDate: 1 });
};

ContestSchema.statics.findActive = function() {
    const now = new Date();
    return this.find({ 
        status: 'Active',
        startDate: { $lte: now },
        endDate: { $gte: now },
        isActive: true 
    }).sort({ startDate: 1 });
};

ContestSchema.statics.findWithManualProblems = function() {
    return this.find({ 
        'problems.manualProblem': { $exists: true, $ne: null },
        isActive: true 
    }).sort({ createdAt: -1 });
};

// Language-related static methods
ContestSchema.statics.findByLanguage = function(language) {
    return this.find({
        $or: [
            { language: language },
            { allowedLanguages: language }
        ],
        isActive: true
    }).sort({ createdAt: -1 });
};

ContestSchema.statics.findMultiLanguage = function() {
    return this.find({
        'allowedLanguages.1': { $exists: true }, // Has at least 2 languages
        isActive: true
    }).sort({ createdAt: -1 });
};

ContestSchema.methods.getUserBestSubmission = async function(userId, problemId) {
    const Submission = require('./Submission');
    return await Submission.findOne({
        userId,
        problemId,
        contestId: this._id
    }).sort({ score: -1, submittedAt: 1 });
};

ContestSchema.methods.getSubmissionStats = async function() {
    const Submission = require('./Submission');
    
    const stats = await Submission.aggregate([
        { $match: { contestId: this._id } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                avgScore: { $avg: '$score' }
            }
        }
    ]);
    
    return stats;
};

ContestSchema.methods.getLanguageStats = async function() {
    const Submission = require('./Submission');
    
    const languageStats = await Submission.aggregate([
        { $match: { contestId: this._id } },
        {
            $group: {
                _id: '$language',
                count: { $sum: 1 },
                avgScore: { $avg: '$score' },
                successRate: {
                    $avg: {
                        $cond: [{ $eq: ['$status', 'Accepted'] }, 1, 0]
                    }
                }
            }
        },
        { $sort: { count: -1 } }
    ]);
    
    return languageStats;
};

ContestSchema.set('toJSON', { virtuals: true });
ContestSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Contest', ContestSchema);
