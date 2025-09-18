// routes/submissions.js
var express = require('express');
var router = express.Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const Submission = require('../models/Submission');
const Problem = require('../models/Problem');
const Contest = require('../models/Contest');
const User = require('../models/Users');        

const execAsync = promisify(exec);

// Enhanced Semaphore for controlling concurrent submissions
class SubmissionSemaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.current < this.max) {
        this.current++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      this.current++;
      const resolve = this.queue.shift();
      resolve();
    }
  }
}

const submissionSemaphore = new SubmissionSemaphore(10); // Allow 10 concurrent submissions

/* GET all submissions - Admin endpoint for tracking */
router.get('/', async function(req, res, next) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const skip = (page - 1) * limit;

        // Build filter object
        const filter = {};
        
        if (req.query.userId) {
            filter.userId = req.query.userId;
        }
        
        if (req.query.problemId) {
            filter.problemId = req.query.problemId;
        }
        
        if (req.query.contestId) {
            filter.contestId = req.query.contestId;
        }
        
        if (req.query.status && req.query.status !== 'All') {
            filter.status = req.query.status.toLowerCase().replace(' ', '_');
        }
        
        if (req.query.language && req.query.language !== 'All') {
            filter.language = req.query.language.toLowerCase();
        }
        
        // Date filtering
        if (req.query.startDate || req.query.endDate) {
            filter.submittedAt = {};
            if (req.query.startDate) {
                filter.submittedAt.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                filter.submittedAt.$lte = new Date(req.query.endDate);
            }
        }

        console.log('Fetching submissions with filter:', filter);

        const [submissions, totalCount] = await Promise.all([
            Submission.find(filter)
                .populate('userId', 'name username email')
                .populate('contestId', 'title')
                .select('-code -testCaseResults') // Exclude large fields for list view
                .skip(skip)
                .limit(limit)
                .sort({ submittedAt: -1 })
                .lean(),
            Submission.countDocuments(filter)
        ]);

        console.log(`Found ${submissions.length} submissions out of ${totalCount} total`);

        res.status(200).json({
            success: true,
            data: submissions,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalSubmissions: totalCount,
                hasNextPage: page < Math.ceil(totalCount / limit),
                hasPrevPage: page > 1,
                limit: limit
            }
        });
        
    } catch (err) {
        console.error('Get all submissions error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve submissions',
            details: err.message
        });
    }
});

/* GET submission statistics - Enhanced version */
router.get('/stats/overview', async function(req, res, next) {
    try {
        const [
            totalSubmissions,
            acceptedSubmissions,
            todaySubmissions,
            languageStats,
            statusStats
        ] = await Promise.all([
            Submission.countDocuments(),
            Submission.countDocuments({ status: 'accepted' }),
            Submission.countDocuments({
                submittedAt: {
                    $gte: new Date(new Date().setHours(0, 0, 0, 0))
                }
            }),
            Submission.aggregate([
                { $group: { _id: '$language', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Submission.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        ]);

        const successRate = totalSubmissions > 0 ? 
            ((acceptedSubmissions / totalSubmissions) * 100).toFixed(2) : 0;

        const statistics = {
            totalSubmissions,
            acceptedSubmissions,
            todaySubmissions,
            successRate: parseFloat(successRate),
            languageStats,
            statusStats,
            activeEvaluations: submissionSemaphore.current || 0,
            queuedEvaluations: submissionSemaphore.queue?.length || 0
        };

        res.status(200).json({
            success: true,
            data: statistics
        });
    } catch (err) {
        console.error('Get submission statistics error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve statistics',
            details: err.message
        });
    }
});

/* POST submit code for evaluation */
router.post('/submit', async function(req, res, next) {
    let submission = null;
    
    try {
        const { userId, problemId, contestId, code, language } = req.body;

        // Validate required fields
        if (!userId || !problemId || !code || !language) {
            return res.status(400).json({
                success: false,
                error: 'userId, problemId, code, and language are required'
            });
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get problem details (either from Problem collection or Contest)
        let problemData = null;
        let testCases = [];
        let maxScore = 100;

        if (contestId) {
            // Contest submission
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

            // Check if contest is active
            if (!contest.isCurrentlyActive()) {
                return res.status(400).json({
                    success: false,
                    error: 'Contest is not currently active'
                });
            }

            // Find problem in contest
            problemData = contest.problems.find(p => p.problemId === problemId);
            if (!problemData) {
                return res.status(404).json({
                    success: false,
                    error: 'Problem not found in contest'
                });
            }

            maxScore = problemData.points;

            // Get test cases
            if (contest.isManualProblem(problemId)) {
                testCases = problemData.manualProblem.testCases || [];
            } else {
                const dbProblem = await Problem.findById(problemId);
                if (!dbProblem) {
                    return res.status(404).json({
                        success: false,
                        error: 'Referenced problem not found'
                    });
                }
                testCases = dbProblem.testCases;
            }
        } else {
            // Standalone problem submission
            problemData = await Problem.findById(problemId);
            if (!problemData) {
                return res.status(404).json({
                    success: false,
                    error: 'Problem not found'
                });
            }
            testCases = problemData.testCases;
        }

        if (!testCases || testCases.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No test cases found for this problem'
            });
        }

        // Create submission record
        submission = new Submission({
            userId,
            problemId,
            contestId: contestId || null,
            code,
            language: language.toLowerCase(),
            totalTestCases: testCases.length,
            status: 'pending'
        });

        await submission.save();

        // Return submission ID immediately for tracking
        res.status(202).json({
            success: true,
            message: 'Submission received and queued for evaluation',
            submissionId: submission._id,
            status: 'pending',
            totalTestCases: testCases.length
        });

        // Process submission asynchronously
        processSubmissionAsync(submission._id, testCases, maxScore, contestId);

    } catch (err) {
        console.error('Submit code error:', err);
        
        if (submission) {
            submission.status = 'runtime_error';
            submission.evaluatedAt = new Date();
            await submission.save().catch(console.error);
        }

        res.status(500).json({
            success: false,
            error: 'Failed to process submission',
            details: err.message
        });
    }
});

/* Async function to process submission */
async function processSubmissionAsync(submissionId, testCases, maxScore, contestId) {
    await submissionSemaphore.acquire();
    
    try {
        const submission = await Submission.findById(submissionId);
        if (!submission) {
            console.error('Submission not found:', submissionId);
            return;
        }

        submission.status = 'running';
        await submission.save();

        const startTime = Date.now();
        const results = await runTestCases(submission.code, submission.language, testCases);
        const totalTime = Date.now() - startTime;

        // Process results
        let passedCount = 0;
        let hasCompilationError = false;
        let hasRuntimeError = false;
        let hasTimeoutError = false;

        const testCaseResults = results.map((result, index) => {
            if (result.status === 'passed') passedCount++;
            if (result.status === 'error' && result.errorType === 'compilation') hasCompilationError = true;
            if (result.status === 'error' && result.errorType === 'runtime') hasRuntimeError = true;
            if (result.status === 'timeout') hasTimeoutError = true;

            return {
                testCaseIndex: index,
                input: testCases[index].input || testCases[index].expectedInput,
                expectedOutput: testCases[index].output || testCases[index].expectedOutput,
                actualOutput: result.output || '',
                status: result.status,
                executionTime: result.executionTime || 0,
                memoryUsed: result.memoryUsed || 0,
                errorMessage: result.error || ''
            };
        });

        // Determine final status
        let finalStatus = 'wrong_answer';
        if (hasCompilationError) {
            finalStatus = 'compilation_error';
        } else if (hasRuntimeError) {
            finalStatus = 'runtime_error';
        } else if (hasTimeoutError) {
            finalStatus = 'time_limit_exceeded';
        } else if (passedCount === testCases.length) {
            finalStatus = 'accepted';
        }

        // Calculate score
        const score = Math.floor((passedCount / testCases.length) * maxScore);

        // Update submission
        submission.status = finalStatus;
        submission.passedTestCases = passedCount;
        submission.testCaseResults = testCaseResults;
        submission.score = score;
        submission.executionTime = totalTime;
        submission.evaluatedAt = new Date();
        
        if (hasCompilationError && results[0]?.compilationError) {
            submission.compilationOutput = results[0].compilationError;
        }

        await submission.save();

        // Update problem/contest statistics
        await updateStatistics(submission, contestId);

        console.log(`Submission ${submissionId} processed: ${finalStatus}, Score: ${score}/${maxScore}`);

    } catch (error) {
        console.error('Error processing submission:', submissionId, error);
        
        try {
            const submission = await Submission.findById(submissionId);
            if (submission) {
                submission.status = 'runtime_error';
                submission.evaluatedAt = new Date();
                await submission.save();
            }
        } catch (updateError) {
            console.error('Error updating failed submission:', updateError);
        }
    } finally {
        submissionSemaphore.release();
    }
}

/* Function to run test cases */
async function runTestCases(code, language, testCases) {
    const results = [];
    const uniqueId = uuidv4();
    const tempDir = path.join(__dirname, '../temp');
    
    await fs.mkdir(tempDir, { recursive: true });

    let filename, compileCommand, runCommand, extension;
    let needsCompilation = false;
    let uniqueSubDir = null;

    // Language-specific setup
    switch (language.toLowerCase()) {
        case 'python':
            extension = '.py';
            filename = path.join(tempDir, `${uniqueId}${extension}`);
            runCommand = `python3 "${filename}"`;
            break;
            
        case 'javascript':
        case 'js':
            extension = '.js';
            filename = path.join(tempDir, `${uniqueId}${extension}`);
            runCommand = `node "${filename}"`;
            break;
            
        case 'java':
            extension = '.java';
            uniqueSubDir = path.join(tempDir, uniqueId);
            await fs.mkdir(uniqueSubDir, { recursive: true });
            
            const className = extractJavaClassName(code) || 'Main';
            filename = path.join(uniqueSubDir, `${className}.java`);
            compileCommand = `cd "${uniqueSubDir}" && javac "${className}.java"`;
            runCommand = `cd "${uniqueSubDir}" && java ${className}`;
            needsCompilation = true;
            break;
            
        case 'cpp':
        case 'c++':
            extension = '.cpp';
            filename = path.join(tempDir, `${uniqueId}${extension}`);
            const cppExecutable = path.join(tempDir, uniqueId);
            compileCommand = `g++ "${filename}" -o "${cppExecutable}"`;
            runCommand = `"${cppExecutable}"`;
            needsCompilation = true;
            break;
            
        case 'c':
            extension = '.c';
            filename = path.join(tempDir, `${uniqueId}${extension}`);
            const cExecutable = path.join(tempDir, uniqueId);
            compileCommand = `gcc "${filename}" -o "${cExecutable}"`;
            runCommand = `"${cExecutable}"`;
            needsCompilation = true;
            break;
            
        default:
            throw new Error(`Unsupported language: ${language}`);
    }

    try {
        // Write code to file
        await fs.writeFile(filename, code, 'utf8');

        // Compile if needed
        if (needsCompilation) {
            try {
                const compileResult = await execAsync(compileCommand, {
                    timeout: 30000, // 30 second compile timeout
                    maxBuffer: 1024 * 1024 * 5 // 5MB buffer
                });
                
                if (compileResult.stderr && compileResult.stderr.trim()) {
                    console.log('Compilation warnings:', compileResult.stderr);
                }
            } catch (compileError) {
                // Compilation failed
                return testCases.map(() => ({
                    status: 'error',
                    errorType: 'compilation',
                    error: compileError.stderr || compileError.message,
                    compilationError: compileError.stderr || compileError.message,
                    output: '',
                    executionTime: 0
                }));
            }
        }

        // Run test cases
        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            const input = testCase.input || testCase.expectedInput || '';
            const expectedOutput = (testCase.output || testCase.expectedOutput || '').trim();

            try {
                const startTime = Date.now();
                const result = await execAsync(runCommand, {
                    input: input,
                    timeout: 10000, // 10 second timeout per test case
                    maxBuffer: 1024 * 1024 * 2, // 2MB output buffer
                    encoding: 'utf8'
                });
                const executionTime = Date.now() - startTime;

                const actualOutput = (result.stdout || '').trim();
                const status = actualOutput === expectedOutput ? 'passed' : 'failed';

                results.push({
                    status: status,
                    output: actualOutput,
                    executionTime: executionTime,
                    memoryUsed: 0, // Memory tracking would require additional tools
                    error: result.stderr || ''
                });

            } catch (execError) {
                const executionTime = Date.now() - Date.now();
                
                let status = 'error';
                let errorType = 'runtime';
                
                if (execError.killed && execError.signal === 'SIGTERM') {
                    status = 'timeout';
                    errorType = 'timeout';
                }

                results.push({
                    status: status,
                    errorType: errorType,
                    output: execError.stdout || '',
                    executionTime: executionTime,
                    memoryUsed: 0,
                    error: execError.stderr || execError.message
                });
            }
        }

    } finally {
        // Cleanup
        try {
            if (uniqueSubDir) {
                await fs.rm(uniqueSubDir, { recursive: true, force: true });
            } else {
                if (fsSync.existsSync(filename)) {
                    await fs.unlink(filename);
                }
                
                // Clean up compiled files
                if (needsCompilation && (language === 'cpp' || language === 'c')) {
                    const execFile = path.join(tempDir, uniqueId);
                    if (fsSync.existsSync(execFile)) {
                        await fs.unlink(execFile);
                    }
                    if (fsSync.existsSync(`${execFile}.exe`)) {
                        await fs.unlink(`${execFile}.exe`);
                    }
                }
            }
        } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError);
        }
    }

    return results;
}

/* Helper function to extract Java class name */
function extractJavaClassName(code) {
    const codeWithoutComments = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    
    const publicClassMatch = codeWithoutComments.match(/public\s+class\s+(\w+)/);
    if (publicClassMatch) return publicClassMatch[1];
    
    const anyClassMatch = codeWithoutComments.match(/(?:^|\s)class\s+(\w+)/);
    if (anyClassMatch) return anyClassMatch[1];
    
    return null;
}

/* Update statistics after submission */
async function updateStatistics(submission, contestId) {
    try {
        // Update problem statistics (for standalone problems)
        if (!contestId && submission.problemId.match(/^[0-9a-fA-F]{24}$/)) {
            const problem = await Problem.findById(submission.problemId);
            if (problem) {
                problem.totalSubmissions++;
                if (submission.status === 'accepted') {
                    problem.successfulSubmissions++;
                }
                await problem.save();
            }
        }

        // Update contest statistics
        if (contestId) {
            const contest = await Contest.findById(contestId);
            if (contest) {
                // Update contest analytics
                contest.analytics.totalSubmissions++;
                if (submission.status === 'accepted') {
                    contest.analytics.successfulSubmissions++;
                }

                // Update participant data
                const participantIndex = contest.participants.findIndex(
                    p => p.userId.toString() === submission.userId.toString()
                );

                if (participantIndex !== -1) {
                    const participant = contest.participants[participantIndex];
                    participant.submissions++;
                    participant.lastActivityTime = new Date();

                    // Update problem attempt data
                    let problemAttempt = participant.problemsAttempted.find(
                        p => p.problemId === submission.problemId
                    );

                    if (!problemAttempt) {
                        problemAttempt = {
                            problemId: submission.problemId,
                            attempts: 0,
                            solved: false,
                            score: 0,
                            lastAttemptTime: new Date()
                        };
                        participant.problemsAttempted.push(problemAttempt);
                    }

                    problemAttempt.attempts++;
                    problemAttempt.lastAttemptTime = new Date();

                    // Update score if this is the best submission
                    if (submission.score > problemAttempt.score) {
                        const oldScore = problemAttempt.score;
                        problemAttempt.score = submission.score;
                        participant.score = participant.score - oldScore + submission.score;

                        if (submission.status === 'accepted') {
                            problemAttempt.solved = true;
                        }
                    }
                }

                // Update problem statistics in contest
                const contestProblem = contest.problems.find(p => p.problemId === submission.problemId);
                if (contestProblem) {
                    contestProblem.attemptCount++;
                    if (submission.status === 'accepted') {
                        contestProblem.solvedCount++;
                    }
                }

                await contest.save();
            }
        }
    } catch (error) {
        console.error('Error updating statistics:', error);
    }
}

/* GET submission status */
router.get('/submission/:id', async function(req, res, next) {
    try {
        const submissionId = req.params.id;
        
        if (!submissionId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid submission ID format'
            });
        }

        const submission = await Submission.findById(submissionId)
            .populate('userId', 'name username email')
            .populate('contestId', 'title');

        if (!submission) {
            return res.status(404).json({
                success: false,
                error: 'Submission not found'
            });
        }

        res.status(200).json({
            success: true,
            data: submission
        });
    } catch (err) {
        console.error('Get submission error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve submission',
            details: err.message
        });
    }
});

/* GET user submissions - Frontend compatible endpoint */
router.get('/user/:userId', async function(req, res, next) {
    try {
        const userId = req.params.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const skip = (page - 1) * limit;

        if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID format'
            });
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const filter = { userId };
        
        // Apply filters from query params
        if (req.query.status && req.query.status !== 'All') {
            filter.status = req.query.status.toLowerCase().replace(' ', '_');
        }
        
        if (req.query.language && req.query.language !== 'All') {
            filter.language = req.query.language.toLowerCase();
        }

        const [submissions, totalCount] = await Promise.all([
            Submission.find(filter)
                .populate('contestId', 'title')
                .skip(skip)
                .limit(limit)
                .sort({ submittedAt: -1 })
                .lean(),
            Submission.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            data: submissions,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalSubmissions: totalCount,
                hasNextPage: page < Math.ceil(totalCount / limit),
                hasPrevPage: page > 1
            }
        });
        
    } catch (err) {
        console.error('Get user submissions error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve user submissions',
            details: err.message
        });
    }
});

/* GET user submissions */
router.get('/user/:userId/submissions', async function(req, res, next) {
    try {
        const userId = req.params.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID format'
            });
        }

        const filter = { userId };
        
        if (req.query.status) {
            filter.status = req.query.status;
        }
        
        if (req.query.problemId) {
            filter.problemId = req.query.problemId;
        }
        
        if (req.query.contestId) {
            filter.contestId = req.query.contestId;
        }

        const [submissions, totalCount] = await Promise.all([
            Submission.find(filter)
                .populate('contestId', 'title')
                .select('-code') // Don't include code in list view
                .skip(skip)
                .limit(limit)
                .sort({ submittedAt: -1 }),
            Submission.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            data: submissions,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalSubmissions: totalCount,
                hasNextPage: page < Math.ceil(totalCount / limit),
                hasPrevPage: page > 1
            }
        });
    } catch (err) {
        console.error('Get user submissions error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve submissions',
            details: err.message
        });
    }
});

/* GET problem submissions */
router.get('/problem/:problemId/submissions', async function(req, res, next) {
    try {
        const problemId = req.params.problemId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const filter = { problemId, isPublic: true };
        
        if (req.query.status) {
            filter.status = req.query.status;
        }

        const [submissions, totalCount] = await Promise.all([
            Submission.find(filter)
                .populate('userId', 'name username')
                .populate('contestId', 'title')
                .select('-code -testCaseResults') // Don't include sensitive data
                .skip(skip)
                .limit(limit)
                .sort({ submittedAt: -1 }),
            Submission.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            data: submissions,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                totalSubmissions: totalCount,
                hasNextPage: page < Math.ceil(totalCount / limit),
                hasPrevPage: page > 1
            }
        });
    } catch (err) {
        console.error('Get problem submissions error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve submissions',
            details: err.message
        });
    }
});

/* GET submission statistics */
router.get('/stats/submissions', async function(req, res, next) {
    try {
        const [
            totalSubmissions,
            acceptedSubmissions,
            languageStats,
            statusStats
        ] = await Promise.all([
            Submission.countDocuments(),
            Submission.countDocuments({ status: 'accepted' }),
            Submission.aggregate([
                { $group: { _id: '$language', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Submission.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        ]);

        const statistics = {
            total: totalSubmissions,
            accepted: acceptedSubmissions,
            acceptanceRate: totalSubmissions > 0 ? ((acceptedSubmissions / totalSubmissions) * 100).toFixed(2) : 0,
            languageDistribution: languageStats,
            statusDistribution: statusStats,
            activeEvaluations: submissionSemaphore.current,
            queuedEvaluations: submissionSemaphore.queue.length
        };

        res.status(200).json({
            success: true,
            data: statistics
        });
    } catch (err) {
        console.error('Get submission statistics error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve statistics',
            details: err.message
        });
    }
});

module.exports = router;
