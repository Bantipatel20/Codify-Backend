const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TestCaseSchema = new Schema({
    input: {
        type: String,
        required: true,
        trim: true
    },
    output: {
        type: String,
        required: true,
        trim: true
    }
}, { _id: false }); 

const ProblemSchema = new Schema({
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
        maxlength: 2000
    },
    difficulty: {
        type: String,
        required: true,
        enum: ['Easy', 'Medium', 'Hard'],
        default: 'Easy'
    },
    testCases: {
        type: [TestCaseSchema],
        required: true,
        validate: {
            validator: function(testCases) {
                return testCases && testCases.length > 0;
            },
            message: 'At least one test case is required'
        }
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    tags: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    totalSubmissions: {
        type: Number,
        default: 0
    },
    successfulSubmissions: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

ProblemSchema.index({ difficulty: 1, isActive: 1 });
ProblemSchema.index({ createdBy: 1 });
ProblemSchema.index({ createdAt: -1 });

ProblemSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

ProblemSchema.virtual('successRate').get(function() {
    if (this.totalSubmissions === 0) return 0;
    return ((this.successfulSubmissions / this.totalSubmissions) * 100).toFixed(2);
});

ProblemSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Problem', ProblemSchema);
