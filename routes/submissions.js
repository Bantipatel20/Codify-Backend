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
            const validLanguages = ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php'];
            if (validLanguages.includes(req.query.language.toLowerCase())) {
                filter.language = req.query.language.toLowerCase();
            }
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

        // Check if code should be included in response
        const includeCode = req.query.includeCode === 'true';
        const projection = includeCode ? { testCaseResults: 0 } : { code: 0, testCaseResults: 0 }; // Exclude code by default

        const [submissions, totalCount] = await Promise.all([
            Submission.find(filter)
                .select(projection) // Apply projection
                .populate('userId', 'name username email')
                .populate('contestId', 'title')
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

/* POST submit code with pre-calculated results from frontend */
router.post('/submit-with-results', async function(req, res, next) {
    try {
        const { 
            userId, 
            problemId, 
            contestId, 
            code, 
            language,
            status,
            score,
            passedTestCases,
            totalTestCases,
            testCaseResults,
            executionTime,
            memoryUsed
        } = req.body;

        console.log('📥 Received submission with pre-calculated results:', {
            userId,
            problemId,
            status,
            score,
            passedTestCases,
            totalTestCases
        });

        // Validate required fields
        if (!userId || !problemId || !code || !language || status === undefined) {
            return res.status(400).json({
                success: false,
                error: 'userId, problemId, code, language, and status are required'
            });
        }

        // Validate language
        const validLanguages = ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php'];
        if (!validLanguages.includes(language.toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid language. Valid languages: ' + validLanguages.join(', ')
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

        // Format test case results to match schema requirements
        const formattedTestCaseResults = (testCaseResults || []).map((result, index) => ({
            testCaseIndex: result.testCaseIndex !== undefined ? result.testCaseIndex : index,
            input: result.input || '',
            expectedOutput: result.expectedOutput || '',
            actualOutput: result.actualOutput || '',
            status: result.status || 'error',
            executionTime: result.executionTime || 0,
            memoryUsed: result.memoryUsed || 0,
            errorMessage: result.errorMessage || ''
        }));

        // Create submission with pre-calculated results
        const submission = new Submission({
            userId,
            problemId,
            contestId: contestId || null,
            code,
            language: language.toLowerCase(),
            status: status,
            score: score || 0,
            passedTestCases: passedTestCases || 0,
            totalTestCases: totalTestCases || 0,
            testCaseResults: formattedTestCaseResults,
            executionTime: executionTime || 0,
            memoryUsed: memoryUsed || 0,
            evaluatedAt: new Date()
        });

        await submission.save();

        // Update statistics
        await updateStatistics(submission, contestId);

        console.log(`✅ Submission ${submission._id} saved: ${status}, Score: ${score}/${totalTestCases}`);

        res.status(200).json({
            success: true,
            message: 'Submission saved successfully',
            submissionId: submission._id,
            status: submission.status,
            data: {
                submissionId: submission._id,
                status: submission.status,
                score: submission.score,
                passedTestCases: submission.passedTestCases,
                totalTestCases: submission.totalTestCases
            }
        });

    } catch (err) {
        console.error('❌ Submit with results error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to save submission',
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

        // Validate language
        const validLanguages = ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php'];
        if (!validLanguages.includes(language.toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid language. Valid languages: ' + validLanguages.join(', ')
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

            // Check if contest language is allowed
            if (!contest.isLanguageAllowed(language.toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    error: `Language ${language} is not allowed in this contest. Allowed languages: ${contest.allowedLanguages.join(', ')}`
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

            // Contest active check removed - Allow submissions at any time
            // if (!contest.isCurrentlyActive()) {
            //     return res.status(400).json({
            //         success: false,
            //         error: 'Contest is not currently active'
            //     });
            // }

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
                testCases = dbProblem.getTestCasesForExecution(); // Get all test cases including hidden
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
            testCases = problemData.getTestCasesForExecution(); // Get all test cases including hidden
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
        let hasMemoryError = false;

        const testCaseResults = results.map((result, index) => {
            if (result.status === 'passed') passedCount++;
            if (result.status === 'error' && result.errorType === 'compilation') hasCompilationError = true;
            if (result.status === 'error' && result.errorType === 'runtime') hasRuntimeError = true;
            if (result.status === 'timeout') hasTimeoutError = true;
            if (result.status === 'memory_exceeded') hasMemoryError = true;

            return {
                testCaseIndex: index,
                input: testCases[index].input || '',
                expectedOutput: testCases[index].output || '',
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
        } else if (hasMemoryError) {
            finalStatus = 'memory_limit_exceeded';
        } else if (passedCount === testCases.length) {
            finalStatus = 'accepted';
        }

        // Calculate score and memory usage
        const score = Math.floor((passedCount / testCases.length) * maxScore);
        const maxMemoryUsed = Math.max(...testCaseResults.map(r => r.memoryUsed));

        // Update submission
        submission.status = finalStatus;
        submission.passedTestCases = passedCount;
        submission.testCaseResults = testCaseResults;
        submission.score = score;
        submission.executionTime = totalTime;
        submission.memoryUsed = maxMemoryUsed;
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
            extension = '.cpp';
            filename = path.join(tempDir, `${uniqueId}${extension}`);
            const cppExecutable = path.join(tempDir, uniqueId);
            // Add -O0 for faster compilation, add .exe for Windows
            if (process.platform === 'win32') {
                compileCommand = `g++ -O0 "${filename}" -o "${cppExecutable}.exe"`;
                runCommand = `"${cppExecutable}.exe"`;
            } else {
                compileCommand = `g++ -O0 "${filename}" -o "${cppExecutable}"`;
                runCommand = `"${cppExecutable}"`;
            }
            needsCompilation = true;
            break;
            
        case 'c':
            extension = '.c';
            filename = path.join(tempDir, `${uniqueId}${extension}`);
            const cExecutable = path.join(tempDir, uniqueId);
            // Add -O0 for faster compilation, add .exe for Windows
            if (process.platform === 'win32') {
                compileCommand = `gcc -O0 "${filename}" -o "${cExecutable}.exe"`;
                runCommand = `"${cExecutable}.exe"`;
            } else {
                compileCommand = `gcc -O0 "${filename}" -o "${cExecutable}"`;
                runCommand = `"${cExecutable}"`;
            }
            needsCompilation = true;
            break;

        case 'go':
            extension = '.go';
            filename = path.join(tempDir, `${uniqueId}${extension}`);
            runCommand = `go run "${filename}"`;
            break;

        case 'ruby':
            extension = '.rb';
            filename = path.join(tempDir, `${uniqueId}${extension}`);
            runCommand = `ruby "${filename}"`;
            break;

        case 'php':
            extension = '.php';
            filename = path.join(tempDir, `${uniqueId}${extension}`);
            runCommand = `php "${filename}"`;
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
                    timeout: 60000, // 60 second compile timeout for Windows
                    maxBuffer: 1024 * 1024 * 5, // 5MB buffer
                    shell: true
                });
                
                if (compileResult.stderr && compileResult.stderr.trim()) {
                    console.log('Compilation warnings:', compileResult.stderr);
                }
            } catch (compileError) {
                // Compilation failed
                console.log('Compilation error:', compileError.message);
                return testCases.map(() => ({
                    status: 'error',
                    errorType: 'compilation',
                    error: compileError.stderr || compileError.message,
                    compilationError: compileError.stderr || compileError.message,
                    output: '',
                    executionTime: 0,
                    memoryUsed: 0
                }));
            }
        }

        // Run test cases
        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            const input = testCase.input || '';
            const expectedOutput = (testCase.output || '').trim();

            try {
                const startTime = Date.now();
                
                // Write input to temp file for stdin redirection
                let inputFile = null;
                let finalCommand = runCommand;
                
                if (input && input.trim()) {
                    inputFile = path.join(tempDir, `${uniqueId}_input_${i}.txt`);
                    await fs.writeFile(inputFile, input, 'utf8');
                    finalCommand = `${runCommand} < "${inputFile}"`;
                }
                
                const result = await execAsync(finalCommand, {
                    timeout: 10000, // 10 second timeout per test case
                    maxBuffer: 1024 * 1024 * 2, // 2MB output buffer
                    encoding: 'utf8',
                    shell: true
                });
                
                // Clean up input file
                if (inputFile) {
                    fs.unlink(inputFile).catch(() => {});
                }
                
                const executionTime = Date.now() - startTime;

                const actualOutput = (result.stdout || '').trim();
                const status = actualOutput === expectedOutput ? 'passed' : 'failed';

                results.push({
                    status: status,
                    output: actualOutput,
                    executionTime: executionTime,
                    memoryUsed: Math.floor(Math.random() * 1000) + 500, // Mock memory usage
                    error: result.stderr || ''
                });

            } catch (execError) {
                const executionTime = Date.now() - startTime;
                
                // Clean up input file on error
                if (inputFile) {
                    fs.unlink(inputFile).catch(() => {});
                }
                
                let status = 'error';
                let errorType = 'runtime';
                
                if (execError.killed && (execError.signal === 'SIGTERM' || execError.signal === 'SIGKILL')) {
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

        // Filter test case results based on user role and problem visibility
        const isAdmin = req.headers['user-role'] === 'admin';
        let responseData = submission.toObject();

        if (!isAdmin && submission.contestId) {
            // For contest submissions, filter test case results based on problem visibility
            const contest = await Contest.findById(submission.contestId);
            if (contest) {
                const problem = contest.problems.find(p => p.problemId === submission.problemId);
                if (problem && contest.isManualProblem(submission.problemId)) {
                    // For manual problems, show limited test case results
                    responseData.testCaseResults = responseData.testCaseResults.map((result, index) => ({
                        testCaseIndex: result.testCaseIndex,
                        status: result.status,
                        executionTime: result.executionTime,
                        memoryUsed: result.memoryUsed,
                        // Only show input/output for visible test cases
                        ...(index < 2 ? {
                            input: result.input,
                            expectedOutput: result.expectedOutput,
                            actualOutput: result.actualOutput
                        } : {})
                    }));
                }
            }
        } else if (!isAdmin && !submission.contestId) {
            // For standalone problems, check problem visibility settings
            const problem = await Problem.findById(submission.problemId);
            if (problem) {
                const visibleTestCases = problem.getVisibleTestCases(false);
                responseData.testCaseResults = responseData.testCaseResults.filter((result, index) => 
                    index < visibleTestCases.length
                );
            }
        }

        res.status(200).json({
            success: true,
            data: responseData
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
            const validLanguages = ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php'];
            if (validLanguages.includes(req.query.language.toLowerCase())) {
                filter.language = req.query.language.toLowerCase();
            }
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

        if (req.query.language) {
            const validLanguages = ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php'];
            if (validLanguages.includes(req.query.language.toLowerCase())) {
                filter.language = req.query.language.toLowerCase();
            }
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

        if (req.query.language) {
            const validLanguages = ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php'];
            if (validLanguages.includes(req.query.language.toLowerCase())) {
                filter.language = req.query.language.toLowerCase();
            }
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
