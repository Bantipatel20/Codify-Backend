// models/Submission.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TestCaseResultSchema = new Schema({
    testCaseIndex: {
        type: Number,
        required: true
    },
    input: {
        type: String,
        required: true
    },
    expectedOutput: {
        type: String,
        required: true
    },
    actualOutput: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['passed', 'failed', 'error', 'timeout'],
        required: true
    },
    executionTime: {
        type: Number, // in milliseconds
        default: 0
    },
    memoryUsed: {
        type: Number, // in bytes
        default: 0
    },
    errorMessage: {
        type: String,
        default: ''
    }
}, { _id: false });

const SubmissionSchema = new Schema({
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
        default: null // null for standalone problem submissions
    },
    code: {
        type: String,
        required: true,
        maxlength: 50000 // 50KB code limit
    },
    language: {
        type: String,
        required: true,
        enum: ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php']
    },
    status: {
        type: String,
        enum: ['pending', 'running', 'accepted', 'wrong_answer', 'compilation_error', 'runtime_error', 'time_limit_exceeded', 'memory_limit_exceeded'],
        default: 'pending'
    },
    score: {
        type: Number,
        default: 0,
        min: 0
    },
    totalTestCases: {
        type: Number,
        required: true,
        min: 1
    },
    passedTestCases: {
        type: Number,
        default: 0,
        min: 0
    },
    testCaseResults: [TestCaseResultSchema],
    compilationOutput: {
        type: String,
        default: ''
    },
    executionTime: {
        type: Number, // Total execution time in milliseconds
        default: 0
    },
    memoryUsed: {
        type: Number, // Peak memory usage in bytes
        default: 0
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    evaluatedAt: {
        type: Date
    },
    isPublic: {
        type: Boolean,
        default: true
    }
});

// Indexes for better query performance
SubmissionSchema.index({ userId: 1, submittedAt: -1 });
SubmissionSchema.index({ problemId: 1, status: 1 });
SubmissionSchema.index({ contestId: 1, userId: 1 });
SubmissionSchema.index({ status: 1, submittedAt: -1 });

// Virtual for success rate
SubmissionSchema.virtual('successRate').get(function() {
    if (this.totalTestCases === 0) return 0;
    return ((this.passedTestCases / this.totalTestCases) * 100).toFixed(2);
});

// Method to check if submission is accepted
SubmissionSchema.methods.isAccepted = function() {
    return this.status === 'accepted' && this.passedTestCases === this.totalTestCases;
};

// Method to calculate partial score
SubmissionSchema.methods.calculateScore = function(maxScore = 100) {
    if (this.totalTestCases === 0) return 0;
    return Math.floor((this.passedTestCases / this.totalTestCases) * maxScore);
};

SubmissionSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Submission', SubmissionSchema);