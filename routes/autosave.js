// routes/autosave.js
var express = require('express');
var router = express.Router();
const AutoSave = require('../models/AutoSave');
const Submission = require('../models/Submission');
const Problem = require('../models/Problem');
const Contest = require('../models/Contest');
const User = require('../models/Users');

/* POST auto-save code */
router.post('/save', async function(req, res, next) {
    try {
        const { userId, problemId, contestId, code, language, metadata } = req.body;

        // Validate required fields
        if (!userId || !problemId || !code || !language) {
            return res.status(400).json({
                success: false,
                error: 'userId, problemId, code, and language are required'
            });
        }

        // Validate user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Validate problem/contest exists
        if (contestId) {
            const contest = await Contest.findById(contestId);
            if (!contest) {
                return res.status(404).json({
                    success: false,
                    error: 'Contest not found'
                });
            }

            // Check if user is registered for contest
            const isRegistered = contest.participants.some(p => p.userId.toString() === userId);
            if (!isRegistered) {
                return res.status(403).json({
                    success: false,
                    error: 'User not registered for this contest'
                });
            }

            // Verify problem exists in contest
            const problemExists = contest.problems.some(p => p.problemId === problemId);
            if (!problemExists) {
                return res.status(404).json({
                    success: false,
                    error: 'Problem not found in contest'
                });
            }
        } else {
            // For standalone problems, verify problem exists
            if (problemId.match(/^[0-9a-fA-F]{24}$/)) {
                const problem = await Problem.findById(problemId);
                if (!problem) {
                    return res.status(404).json({
                        success: false,
                        error: 'Problem not found'
                    });
                }
            }
        }

        // Create or update auto-save
        const filter = {
            userId,
            problemId,
            contestId: contestId || null
        };

        const updateData = {
            code,
            language: language.toLowerCase(),
            metadata: metadata || {},
            isActive: true
        };

        const autoSave = await AutoSave.findOneAndUpdate(
            filter,
            updateData,
            { 
                new: true, 
                upsert: true,
                runValidators: true 
            }
        );

        res.status(200).json({
            success: true,
            message: 'Code auto-saved successfully',
            data: {
                autoSaveId: autoSave._id,
                lastSavedAt: autoSave.lastSavedAt,
                codeLength: code.length
            }
        });

    } catch (err) {
        console.error('Auto-save error:', err);
        
        if (err.name === 'ValidationError') {
            const validationErrors = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: validationErrors
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to auto-save code',
            details: err.message
        });
    }
});

/* GET restoration options when entering a problem */
router.get('/restore-options/:userId/:problemId', async function(req, res, next) {
    try {
        const { userId, problemId } = req.params;
        const { contestId } = req.query;

        // Validate user ID format
        if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID format'
            });
        }

        // Validate user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const options = {
            hasAutoSave: false,
            hasLatestSubmission: false,
            autoSave: null,
            latestSubmission: null,
            recommendations: []
        };

        // Check for auto-saved code
        const autoSaveFilter = {
            userId,
            problemId,
            contestId: contestId || null,
            isActive: true
        };

        const autoSave = await AutoSave.findOne(autoSaveFilter)
            .sort({ lastSavedAt: -1 });

        if (autoSave) {
            options.hasAutoSave = true;
            options.autoSave = {
                id: autoSave._id,
                language: autoSave.language,
                codeLength: autoSave.code.length,
                lastSavedAt: autoSave.lastSavedAt,
                isRecent: autoSave.isRecent(),
                metadata: autoSave.metadata
            };

            if (autoSave.isRecent()) {
                options.recommendations.push({
                    type: 'auto_save',
                    priority: 1,
                    message: 'You have recent auto-saved code for this problem'
                });
            } else {
                options.recommendations.push({
                    type: 'auto_save',
                    priority: 3,
                    message: 'You have auto-saved code for this problem (older)'
                });
            }
        }

        // Check for latest submission
        const submissionFilter = {
            userId,
            problemId
        };

        if (contestId) {
            submissionFilter.contestId = contestId;
        }

        const latestSubmission = await Submission.findOne(submissionFilter)
            .sort({ submittedAt: -1 })
            .select('language status score passedTestCases totalTestCases submittedAt');

        if (latestSubmission) {
            options.hasLatestSubmission = true;
            options.latestSubmission = {
                id: latestSubmission._id,
                language: latestSubmission.language,
                status: latestSubmission.status,
                score: latestSubmission.score,
                passedTestCases: latestSubmission.passedTestCases,
                totalTestCases: latestSubmission.totalTestCases,
                submittedAt: latestSubmission.submittedAt,
                successRate: latestSubmission.successRate
            };

            // Add recommendation based on submission status
            if (latestSubmission.status === 'accepted') {
                options.recommendations.push({
                    type: 'latest_submission',
                    priority: 2,
                    message: 'Your latest submission was accepted! You can continue from there'
                });
            } else if (latestSubmission.passedTestCases > 0) {
                options.recommendations.push({
                    type: 'latest_submission',
                    priority: 2,
                    message: `Your latest submission passed ${latestSubmission.passedTestCases}/${latestSubmission.totalTestCases} test cases`
                });
            } else {
                options.recommendations.push({
                    type: 'latest_submission',
                    priority: 4,
                    message: 'You can review your latest submission'
                });
            }
        }

        // Sort recommendations by priority
        options.recommendations.sort((a, b) => a.priority - b.priority);

        // Add general recommendation if no specific options
        if (!options.hasAutoSave && !options.hasLatestSubmission) {
            options.recommendations.push({
                type: 'fresh_start',
                priority: 5,
                message: 'Start fresh with this problem'
            });
        }

        res.status(200).json({
            success: true,
            data: options
        });

    } catch (err) {
        console.error('Get restore options error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to get restore options',
            details: err.message
        });
    }
});

/* GET auto-saved code */
router.get('/load/:userId/:problemId', async function(req, res, next) {
    try {
        const { userId, problemId } = req.params;
        const { contestId } = req.query;

        // Validate user ID format
        if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID format'
            });
        }

        const filter = {
            userId,
            problemId,
            contestId: contestId || null,
            isActive: true
        };

        const autoSave = await AutoSave.findOne(filter)
            .sort({ lastSavedAt: -1 });

        if (!autoSave) {
            return res.status(404).json({
                success: false,
                error: 'No auto-saved code found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                code: autoSave.code,
                language: autoSave.language,
                lastSavedAt: autoSave.lastSavedAt,
                metadata: autoSave.metadata
            }
        });

    } catch (err) {
        console.error('Load auto-save error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to load auto-saved code',
            details: err.message
        });
    }
});

/* GET latest submission code */
router.get('/submission/:userId/:problemId', async function(req, res, next) {
    try {
        const { userId, problemId } = req.params;
        const { contestId } = req.query;

        // Validate user ID format
        if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID format'
            });
        }

        const filter = {
            userId,
            problemId
        };

        if (contestId) {
            filter.contestId = contestId;
        }

        const latestSubmission = await Submission.findOne(filter)
            .sort({ submittedAt: -1 });

        if (!latestSubmission) {
            return res.status(404).json({
                success: false,
                error: 'No previous submission found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                code: latestSubmission.code,
                language: latestSubmission.language,
                status: latestSubmission.status,
                score: latestSubmission.score,
                submittedAt: latestSubmission.submittedAt,
                passedTestCases: latestSubmission.passedTestCases,
                totalTestCases: latestSubmission.totalTestCases
            }
        });

    } catch (err) {
        console.error('Load submission error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to load latest submission',
            details: err.message
        });
    }
});

/* DELETE auto-saved code */
router.delete('/clear/:userId/:problemId', async function(req, res, next) {
    try {
        const { userId, problemId } = req.params;
        const { contestId } = req.query;

        // Validate user ID format
        if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID format'
            });
        }

        const filter = {
            userId,
            problemId,
            contestId: contestId || null
        };

        const result = await AutoSave.findOneAndUpdate(
            filter,
            { isActive: false },
            { new: true }
        );

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'No auto-saved code found to clear'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Auto-saved code cleared successfully'
        });

    } catch (err) {
        console.error('Clear auto-save error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to clear auto-saved code',
            details: err.message
        });
    }
});

/* GET user's all auto-saves */
router.get('/user/:userId', async function(req, res, next) {
    try {
        const userId = req.params.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Validate user ID format
        if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID format'
            });
        }

        const filter = { userId, isActive: true };

        const [autoSaves, totalCount] = await Promise.all([
            AutoSave.find(filter)
                .populate('contestId', 'title')
                .select('-code') // Don't include full code in list view
                .skip(skip)
                .limit(limit)
                .sort({ lastSavedAt: -1 }),
            AutoSave.countDocuments(filter)
        ]);

        // Add problem titles for context
        const enrichedAutoSaves = await Promise.all(
            autoSaves.map(async (autoSave) => {
                const autoSaveObj = autoSave.toObject();
                
                // Try to get problem title
                if (autoSave.problemId.match(/^[0-9a-fA-F]{24}$/)) {
                    try {
                        const problem = await Problem.findById(autoSave.problemId).select('title');
                        if (problem) {
                            autoSaveObj.problemTitle = problem.title;
                        }
                    } catch (e) {
                        // Problem might be from contest, ignore error
                    }
                }

                // If no problem title found and there's a contest, try to get it from contest
                if (!autoSaveObj.problemTitle && autoSave.contestId) {
                    try {
                        const contest = await Contest.findById(autoSave.contestId);
                        if (contest) {
                            const contestProblem = contest.problems.find(p => p.problemId === autoSave.problemId);
                            if (contestProblem) {
                                autoSaveObj.problemTitle = contestProblem.title;
                            }
                        }
                    } catch (e) {
                        // Ignore error
                    }
                }

                autoSaveObj.codeLength = autoSave.code ? autoSave.code.length : 0;
                return autoSaveObj;
            })
        );

        res.status(200).json({
            success: true,
            data: enrichedAutoSaves,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalAutoSaves: totalCount,
                hasNextPage: page < Math.ceil(totalCount / limit),
                hasPrevPage: page > 1
            }
        });

    } catch (err) {
        console.error('Get user auto-saves error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve auto-saves',
            details: err.message
        });
    }
});

/* POST cleanup old auto-saves */
router.post('/cleanup', async function(req, res, next) {
    try {
        const result = await AutoSave.cleanupOld();
        
        res.status(200).json({
            success: true,
            message: 'Cleanup completed successfully',
            deletedCount: result.deletedCount
        });

    } catch (err) {
        console.error('Cleanup auto-saves error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to cleanup old auto-saves',
            details: err.message
        });
    }
});

/* GET auto-save statistics */
router.get('/stats/overview', async function(req, res, next) {
    try {
        const [
            totalAutoSaves,
            activeAutoSaves,
            recentAutoSaves,
            languageStats
        ] = await Promise.all([
            AutoSave.countDocuments(),
            AutoSave.countDocuments({ isActive: true }),
            AutoSave.countDocuments({ 
                isActive: true,
                lastSavedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
            }),
            AutoSave.aggregate([
                { $match: { isActive: true } },
                { $group: { _id: '$language', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        ]);

        const statistics = {
            total: totalAutoSaves,
            active: activeAutoSaves,
            recentlyActive: recentAutoSaves,
            languageDistribution: languageStats
        };

        res.status(200).json({
            success: true,
            data: statistics
        });

    } catch (err) {
        console.error('Get auto-save statistics error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve auto-save statistics',
            details: err.message
        });
    }
});

module.exports = router;
