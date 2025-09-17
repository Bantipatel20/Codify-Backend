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
            type: String, // Changed from ObjectId to String to support manual problem IDs
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

// UPDATED: ContestProblemSchema to support manual problems
const ContestProblemSchema = new Schema({
    problemId: {
        type: String, // Changed from ObjectId to String to support manual problem IDs
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
    // NEW: Manual problem data - stores complete problem information for manual problems
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
    department: {
        type: String,
        enum: ['AIML','CSE', 'IT', 'ECE', 'MECH', 'CIVIL', '']
    },
    semester: {
        type: Number,
        min: 1,
        max: 8
    },
    division: {
        type: Number,
        min: 1,
        max: 4
    },
    batch: {
        type: String,
        enum: ['A1', 'B1', 'C1','D1', 'A2', 'B2', 'C2','D2', 'A3', 'B3', 'C3','D3', 'A4', 'B4', 'C4','D4', '']
    }
}, { _id: false });

// Main Contest schema
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
        required: true,
        validate: {
            validator: function(endDate) {
                return endDate > this.startDate;
            },
            message: 'End date must be after start date'
        }
    },
    duration: {
        type: String,
        required: true
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
        enum: ['manual', 'department', 'semester', 'division', 'batch'],
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
    // Analytics and statistics
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
    // Settings
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
            type: Number, // minutes before end
            default: 60
        },
        allowViewProblemsBeforeStart: {
            type: Boolean,
            default: false
        },
        penaltyPerWrongSubmission: {
            type: Number,
            default: 0
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
ContestSchema.index({ 'problems.problemId': 1 }); // NEW: Index for problem lookups

// UPDATED: Pre-save middleware
ContestSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    this.totalPoints = this.problems.reduce((sum, problem) => sum + problem.points, 0);
    
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
        return Math.round(diffHours * 100) / 100; // Round to 2 decimal places
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

// NEW: Virtual to get count of manual problems
ContestSchema.virtual('manualProblemsCount').get(function() {
    return this.problems.filter(p => p.manualProblem && Object.keys(p.manualProblem).length > 0).length;
});

// NEW: Virtual to get count of existing problems
ContestSchema.virtual('existingProblemsCount').get(function() {
    return this.problems.filter(p => !p.problemId.startsWith('manual_')).length;
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

// NEW: Method to get problem by ID (works for both manual and existing problems)
ContestSchema.methods.getProblemById = function(problemId) {
    return this.problems.find(p => p.problemId === problemId);
};

// NEW: Method to check if a problem is manual
ContestSchema.methods.isManualProblem = function(problemId) {
    const problem = this.getProblemById(problemId);
    return problem && (problemId.startsWith('manual_') || (problem.manualProblem && Object.keys(problem.manualProblem).length > 0));
};

// NEW: Method to get manual problems only
ContestSchema.methods.getManualProblems = function() {
    return this.problems.filter(p => this.isManualProblem(p.problemId));
};

// NEW: Method to get existing problems only
ContestSchema.methods.getExistingProblems = function() {
    return this.problems.filter(p => !this.isManualProblem(p.problemId));
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

// NEW: Static method to find contests with manual problems
ContestSchema.statics.findWithManualProblems = function() {
    return this.find({ 
        'problems.manualProblem': { $exists: true, $ne: null },
        isActive: true 
    }).sort({ createdAt: -1 });
};


// Method to get user's best submission for a problem
ContestSchema.methods.getUserBestSubmission = async function(userId, problemId) {
    const Submission = require('./Submission');
    return await Submission.findOne({
        userId,
        problemId,
        contestId: this._id
    }).sort({ score: -1, submittedAt: 1 });
};

// Method to get contest submission statistics
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

ContestSchema.set('toJSON', { virtuals: true });
ContestSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Contest', ContestSchema);
