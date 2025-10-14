// models/Problem.js
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
    },
    isHidden: {
        type: Boolean,
        default: false
    },
    isPublic: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
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
    testCaseVisibility: {
        showSampleTestCases: {
            type: Boolean,
            default: true
        },
        maxVisibleTestCases: {
            type: Number,
            default: 2,
            min: 0
        },
        hideAllTestCases: {
            type: Boolean,
            default: false
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

// Indexes
ProblemSchema.index({ difficulty: 1, isActive: 1 });
ProblemSchema.index({ createdBy: 1 });
ProblemSchema.index({ createdAt: -1 });
ProblemSchema.index({ 'testCases.isHidden': 1 });

// Pre-save middleware
ProblemSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Ensure at least one test case is public if not hiding all test cases
    if (!this.testCaseVisibility.hideAllTestCases) {
        const publicTestCases = this.testCases.filter(tc => tc.isPublic && !tc.isHidden);
        if (publicTestCases.length === 0 && this.testCases.length > 0) {
            // Make the first test case public
            this.testCases[0].isPublic = true;
            this.testCases[0].isHidden = false;
        }
    }
    
    next();
});

// Virtual properties
ProblemSchema.virtual('successRate').get(function() {
    if (this.totalSubmissions === 0) return 0;
    return ((this.successfulSubmissions / this.totalSubmissions) * 100).toFixed(2);
});

ProblemSchema.virtual('publicTestCases').get(function() {
    if (this.testCaseVisibility.hideAllTestCases) {
        return [];
    }
    
    const publicCases = this.testCases.filter(tc => tc.isPublic && !tc.isHidden);
    const maxVisible = this.testCaseVisibility.maxVisibleTestCases;
    
    return maxVisible > 0 ? publicCases.slice(0, maxVisible) : publicCases;
});

ProblemSchema.virtual('hiddenTestCases').get(function() {
    return this.testCases.filter(tc => tc.isHidden || !tc.isPublic);
});

ProblemSchema.virtual('sampleTestCases').get(function() {
    if (!this.testCaseVisibility.showSampleTestCases) {
        return [];
    }
    
    // Return first 2 public test cases as samples
    const publicCases = this.testCases.filter(tc => tc.isPublic && !tc.isHidden);
    return publicCases.slice(0, 2);
});

ProblemSchema.virtual('totalTestCasesCount').get(function() {
    return this.testCases.length;
});

ProblemSchema.virtual('publicTestCasesCount').get(function() {
    return this.testCases.filter(tc => tc.isPublic && !tc.isHidden).length;
});

ProblemSchema.virtual('hiddenTestCasesCount').get(function() {
    return this.testCases.filter(tc => tc.isHidden || !tc.isPublic).length;
});

// Instance methods
ProblemSchema.methods.getVisibleTestCases = function(isAdmin = false) {
    if (isAdmin) {
        return this.testCases; // Admins can see all test cases
    }
    
    if (this.testCaseVisibility.hideAllTestCases) {
        return []; // Hide all test cases from students
    }
    
    const publicCases = this.testCases.filter(tc => tc.isPublic && !tc.isHidden);
    const maxVisible = this.testCaseVisibility.maxVisibleTestCases;
    
    return maxVisible > 0 ? publicCases.slice(0, maxVisible) : publicCases;
};

ProblemSchema.methods.getTestCasesForExecution = function() {
    // Return all test cases for code execution (both visible and hidden)
    return this.testCases;
};

ProblemSchema.methods.getSampleTestCases = function() {
    if (!this.testCaseVisibility.showSampleTestCases) {
        return [];
    }
    
    const publicCases = this.testCases.filter(tc => tc.isPublic && !tc.isHidden);
    return publicCases.slice(0, 2); // First 2 as samples
};

ProblemSchema.methods.toggleTestCaseVisibility = function(testCaseIndex, makeHidden = true) {
    if (testCaseIndex >= 0 && testCaseIndex < this.testCases.length) {
        this.testCases[testCaseIndex].isHidden = makeHidden;
        this.testCases[testCaseIndex].isPublic = !makeHidden;
        return this.save();
    }
    throw new Error('Invalid test case index');
};

ProblemSchema.methods.setTestCaseVisibilitySettings = function(settings) {
    this.testCaseVisibility = {
        ...this.testCaseVisibility,
        ...settings
    };
    return this.save();
};

ProblemSchema.methods.hideAllTestCases = function() {
    this.testCaseVisibility.hideAllTestCases = true;
    return this.save();
};

ProblemSchema.methods.showAllTestCases = function() {
    this.testCaseVisibility.hideAllTestCases = false;
    this.testCases.forEach(tc => {
        tc.isHidden = false;
        tc.isPublic = true;
    });
    return this.save();
};

// Static methods
ProblemSchema.statics.findWithVisibleTestCases = function(userId = null, isAdmin = false) {
    return this.find({ isActive: true }).then(problems => {
        return problems.map(problem => {
            const problemObj = problem.toObject();
            problemObj.visibleTestCases = problem.getVisibleTestCases(isAdmin);
            problemObj.sampleTestCases = problem.getSampleTestCases();
            
            // Remove all test cases from the response, only show visible ones
            delete problemObj.testCases;
            
            return problemObj;
        });
    });
};

ProblemSchema.statics.findByIdWithVisibility = function(problemId, isAdmin = false) {
    return this.findById(problemId).then(problem => {
        if (!problem) return null;
        
        const problemObj = problem.toObject();
        problemObj.visibleTestCases = problem.getVisibleTestCases(isAdmin);
        problemObj.sampleTestCases = problem.getSampleTestCases();
        
        if (!isAdmin) {
            // Remove hidden test cases from response for non-admin users
            delete problemObj.testCases;
        }
        
        return problemObj;
    });
};

ProblemSchema.set('toJSON', { 
    virtuals: true,
    transform: function(doc, ret, options) {
        // If this is not an admin request, filter out hidden test cases
        if (options && options.hideTestCases) {
            ret.visibleTestCases = doc.getVisibleTestCases(false);
            ret.sampleTestCases = doc.getSampleTestCases();
            delete ret.testCases;
        }
        return ret;
    }
});

ProblemSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Problem', ProblemSchema);
