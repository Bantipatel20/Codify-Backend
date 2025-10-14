// routes/problems.js
var express = require('express');
var router = express.Router();
const Problem = require('../models/Problem');
const User = require('../models/Users');

/* GET all problems - Enhanced with filtering and pagination */
router.get('/', async function(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Check if user is admin (you might get this from JWT token or session)
    const isAdmin = req.query.isAdmin === 'true' || req.headers['user-role'] === 'admin';
    
    // Build filter object
    const filter = { isActive: true };
    
    if (req.query.difficulty) {
      filter.difficulty = req.query.difficulty;
    }
    
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    if (req.query.tags) {
      const tags = req.query.tags.split(',').map(tag => tag.trim().toLowerCase());
      filter.tags = { $in: tags };
    }
    
    if (req.query.createdBy) {
      filter.createdBy = req.query.createdBy;
    }

    const [problems, totalCount] = await Promise.all([
      Problem.find(filter)
        .populate('createdBy', 'name email')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Problem.countDocuments(filter)
    ]);

    // Apply test case visibility based on user role
    const processedProblems = problems.map(problem => {
      const problemObj = problem.toObject();
      
      if (isAdmin) {
        // Admins see all test cases with visibility info
        problemObj.visibleTestCases = problem.getVisibleTestCases(true);
        problemObj.sampleTestCases = problem.getSampleTestCases();
      } else {
        // Students see only visible test cases
        problemObj.visibleTestCases = problem.getVisibleTestCases(false);
        problemObj.sampleTestCases = problem.getSampleTestCases();
        delete problemObj.testCases; // Remove full test cases for students
      }
      
      return problemObj;
    });

    res.status(200).json({
      success: true,
      data: processedProblems,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalProblems: totalCount,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (err) {
    console.error('Get problems error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve problems',
      details: err.message
    });
  }
});

/* GET problem by ID with visibility controls */
router.get('/:id', async function(req, res, next) {
  try {
    const problemId = req.params.id;
    
    if (!problemId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid problem ID format' 
      });
    }

    // Check if user is admin
    const isAdmin = req.query.isAdmin === 'true' || req.headers['user-role'] === 'admin';

    const problem = await Problem.findById(problemId)
      .populate('createdBy', 'name email');

    if (!problem) {
      return res.status(404).json({ 
        success: false,
        error: 'Problem not found' 
      });
    }

    const problemObj = problem.toObject();
    
    // Apply visibility controls
    if (isAdmin) {
      // Admins see everything
      problemObj.visibleTestCases = problem.getVisibleTestCases(true);
      problemObj.sampleTestCases = problem.getSampleTestCases();
      problemObj.allTestCasesForExecution = problem.getTestCasesForExecution();
    } else {
      // Students see only visible test cases
      problemObj.visibleTestCases = problem.getVisibleTestCases(false);
      problemObj.sampleTestCases = problem.getSampleTestCases();
      delete problemObj.testCases; // Remove full test cases for students
    }

    res.status(200).json({
      success: true,
      data: problemObj
    });
  } catch (err) {
    console.error('Get problem error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve problem',
      details: err.message
    });
  }
});

/* POST create new problem with test case visibility */
router.post('/', async function(req, res, next) {
  try {
    const {
      title,
      description,
      difficulty,
      testCases,
      testCaseVisibility,
      createdBy,
      tags
    } = req.body;

    // Validate required fields
    if (!title || !description || !testCases || !createdBy) {
      return res.status(400).json({
        success: false,
        error: 'Title, description, test cases, and creator are required'
      });
    }

    // Validate test cases
    if (!Array.isArray(testCases) || testCases.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one test case is required'
      });
    }

    // Validate each test case
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      if (!testCase.input || !testCase.output) {
        return res.status(400).json({
          success: false,
          error: `Test case ${i + 1} must have both input and output`
        });
      }
      
      // Set default visibility if not provided
      if (testCase.isHidden === undefined) {
        testCase.isHidden = false;
      }
      if (testCase.isPublic === undefined) {
        testCase.isPublic = true;
      }
    }

    // Verify creator exists
    const creator = await User.findById(createdBy);
    if (!creator) {
      return res.status(400).json({
        success: false,
        error: 'Creator user not found'
      });
    }

    const problemData = {
      title,
      description,
      difficulty: difficulty || 'Easy',
      testCases,
      testCaseVisibility: testCaseVisibility || {
        showSampleTestCases: true,
        maxVisibleTestCases: 2,
        hideAllTestCases: false
      },
      createdBy,
      tags: tags || []
    };

    const newProblem = new Problem(problemData);
    const savedProblem = await newProblem.save();

    const populatedProblem = await Problem.findById(savedProblem._id)
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Problem created successfully',
      data: populatedProblem
    });
  } catch (err) {
    console.error('Create problem error:', err);
    
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
      error: 'Failed to create problem',
      details: err.message
    });
  }
});

/* PUT update problem by ID with visibility controls */
router.put('/:id', async function(req, res, next) {
  try {
    const problemId = req.params.id;
    
    if (!problemId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid problem ID format' 
      });
    }

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ 
        success: false,
        error: 'Problem not found' 
      });
    }

    const updateData = { ...req.body };
    
    // Validate test cases if being updated
    if (updateData.testCases) {
      if (!Array.isArray(updateData.testCases) || updateData.testCases.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one test case is required'
        });
      }

      for (let i = 0; i < updateData.testCases.length; i++) {
        const testCase = updateData.testCases[i];
        if (!testCase.input || !testCase.output) {
          return res.status(400).json({
            success: false,
            error: `Test case ${i + 1} must have both input and output`
          });
        }
        
        // Set default visibility if not provided
        if (testCase.isHidden === undefined) {
          testCase.isHidden = false;
        }
        if (testCase.isPublic === undefined) {
          testCase.isPublic = true;
        }
      }
    }

    const updatedProblem = await Problem.findByIdAndUpdate(
      problemId,
      updateData,
      { 
        new: true, 
        runValidators: true 
      }
    ).populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Problem updated successfully',
      data: updatedProblem
    });
  } catch (err) {
    console.error('Update problem error:', err);
    
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
      error: 'Failed to update problem',
      details: err.message
    });
  }
});

/* PUT toggle test case visibility */
router.put('/:id/testcase/:index/visibility', async function(req, res, next) {
  try {
    const problemId = req.params.id;
    const testCaseIndex = parseInt(req.params.index);
    const { isHidden } = req.body;
    
    if (!problemId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid problem ID format' 
      });
    }

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ 
        success: false,
        error: 'Problem not found' 
      });
    }

    if (testCaseIndex < 0 || testCaseIndex >= problem.testCases.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid test case index'
      });
    }

    await problem.toggleTestCaseVisibility(testCaseIndex, isHidden);

    res.status(200).json({
      success: true,
      message: 'Test case visibility updated successfully',
      data: {
        testCaseIndex,
        isHidden: problem.testCases[testCaseIndex].isHidden,
        isPublic: problem.testCases[testCaseIndex].isPublic
      }
    });
  } catch (err) {
    console.error('Toggle test case visibility error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update test case visibility',
      details: err.message
    });
  }
});

/* PUT update problem visibility settings */
router.put('/:id/visibility-settings', async function(req, res, next) {
  try {
    const problemId = req.params.id;
    const visibilitySettings = req.body;
    
    if (!problemId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid problem ID format' 
      });
    }

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ 
        success: false,
        error: 'Problem not found' 
      });
    }

    await problem.setTestCaseVisibilitySettings(visibilitySettings);

    res.status(200).json({
      success: true,
      message: 'Visibility settings updated successfully',
      data: problem.testCaseVisibility
    });
  } catch (err) {
    console.error('Update visibility settings error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update visibility settings',
      details: err.message
    });
  }
});

/* POST hide all test cases */
router.post('/:id/hide-all-testcases', async function(req, res, next) {
  try {
    const problemId = req.params.id;
    
    if (!problemId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid problem ID format' 
      });
    }

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ 
        success: false,
        error: 'Problem not found' 
      });
    }

    await problem.hideAllTestCases();

    res.status(200).json({
      success: true,
      message: 'All test cases hidden successfully',
      data: {
        hideAllTestCases: true,
        visibleTestCasesCount: 0
      }
    });
  } catch (err) {
    console.error('Hide all test cases error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to hide all test cases',
      details: err.message
    });
  }
});

/* POST show all test cases */
router.post('/:id/show-all-testcases', async function(req, res, next) {
  try {
    const problemId = req.params.id;
    
    if (!problemId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid problem ID format' 
      });
    }

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ 
        success: false,
        error: 'Problem not found' 
      });
    }

    await problem.showAllTestCases();

    res.status(200).json({
      success: true,
      message: 'All test cases shown successfully',
      data: {
        hideAllTestCases: false,
        visibleTestCasesCount: problem.publicTestCasesCount
      }
    });
  } catch (err) {
    console.error('Show all test cases error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to show all test cases',
      details: err.message
    });
  }
});

/* DELETE problem by ID - PERMANENT DELETE */
router.delete('/:id', async function(req, res, next) {
  try {
    const problemId = req.params.id;
    
    if (!problemId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid problem ID format' 
      });
    }

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ 
        success: false,
        error: 'Problem not found' 
      });
    }

    // Permanently delete the problem from database
    const deletedProblem = await Problem.findByIdAndDelete(problemId);

    res.status(200).json({ 
      success: true,
      message: 'Problem permanently deleted from database',
      data: { 
        deletedProblemId: problemId,
        deletedProblem: {
          title: deletedProblem.title,
          difficulty: deletedProblem.difficulty
        }
      }
    });
  } catch (err) {
    console.error('Delete problem error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete problem',
      details: err.message
    });
  }
});

/* GET problems by difficulty with visibility */
router.get('/difficulty/:difficulty', async function(req, res, next) {
  try {
    const difficulty = req.params.difficulty;
    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid difficulty. Valid difficulties: ' + validDifficulties.join(', ')
      });
    }

    const isAdmin = req.query.isAdmin === 'true' || req.headers['user-role'] === 'admin';

    const problems = await Problem.find({ 
      difficulty, 
      isActive: true 
    })
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

    // Apply visibility controls
    const processedProblems = problems.map(problem => {
      const problemObj = problem.toObject();
      
      if (isAdmin) {
        problemObj.visibleTestCases = problem.getVisibleTestCases(true);
        problemObj.sampleTestCases = problem.getSampleTestCases();
      } else {
        problemObj.visibleTestCases = problem.getVisibleTestCases(false);
        problemObj.sampleTestCases = problem.getSampleTestCases();
        delete problemObj.testCases;
      }
      
      return problemObj;
    });

    res.status(200).json({
      success: true,
      data: processedProblems,
      count: processedProblems.length
    });
  } catch (err) {
    console.error('Get problems by difficulty error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve problems',
      details: err.message
    });
  }
});

/* GET problems by tags with visibility */
router.get('/tags/:tag', async function(req, res, next) {
  try {
    const tag = req.params.tag.toLowerCase();
    const isAdmin = req.query.isAdmin === 'true' || req.headers['user-role'] === 'admin';

    const problems = await Problem.find({ 
      tags: tag,
      isActive: true 
    })
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

    // Apply visibility controls
    const processedProblems = problems.map(problem => {
      const problemObj = problem.toObject();
      
      if (isAdmin) {
        problemObj.visibleTestCases = problem.getVisibleTestCases(true);
        problemObj.sampleTestCases = problem.getSampleTestCases();
      } else {
        problemObj.visibleTestCases = problem.getVisibleTestCases(false);
        problemObj.sampleTestCases = problem.getSampleTestCases();
        delete problemObj.testCases;
      }
      
      return problemObj;
    });

    res.status(200).json({
      success: true,
      data: processedProblems,
      count: processedProblems.length,
      tag: tag
    });
  } catch (err) {
    console.error('Get problems by tag error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve problems',
      details: err.message
    });
  }
});

/* GET all unique tags */
router.get('/meta/tags', async function(req, res, next) {
  try {
    const tags = await Problem.distinct('tags', { isActive: true });
    
    res.status(200).json({
      success: true,
      data: tags.sort(),
      count: tags.length
    });
  } catch (err) {
    console.error('Get tags error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve tags',
      details: err.message
    });
  }
});

/* GET problem statistics */
router.get('/meta/statistics', async function(req, res, next) {
  try {
    const [
      totalProblems,
      easyCount,
      mediumCount,
      hardCount,
      totalSubmissions,
      successfulSubmissions,
      testCaseStats
    ] = await Promise.all([
      Problem.countDocuments({ isActive: true }),
      Problem.countDocuments({ difficulty: 'Easy', isActive: true }),
      Problem.countDocuments({ difficulty: 'Medium', isActive: true }),
      Problem.countDocuments({ difficulty: 'Hard', isActive: true }),
      Problem.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, total: { $sum: '$totalSubmissions' } } }
      ]),
      Problem.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, total: { $sum: '$successfulSubmissions' } } }
      ]),
      Problem.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalTestCases: { $sum: { $size: '$testCases' } },
            hiddenTestCases: {
              $sum: {
                $size: {
                  $filter: {
                    input: '$testCases',
                    cond: { $eq: ['$$this.isHidden', true] }
                  }
                }
              }
            },
            publicTestCases: {
              $sum: {
                $size: {
                  $filter: {
                    input: '$testCases',
                    cond: { $and: [{ $eq: ['$$this.isPublic', true] }, { $eq: ['$$this.isHidden', false] }] }
                  }
                }
              }
            }
          }
        }
      ])
    ]);

    const totalSubs = totalSubmissions[0]?.total || 0;
    const successfulSubs = successfulSubmissions[0]?.total || 0;
    const testCaseData = testCaseStats[0] || { totalTestCases: 0, hiddenTestCases: 0, publicTestCases: 0 };

    const statistics = {
      totalProblems,
      difficultyDistribution: {
        Easy: easyCount,
        Medium: mediumCount,
        Hard: hardCount
      },
      submissions: {
        total: totalSubs,
        successful: successfulSubs,
        successRate: totalSubs > 0 ? ((successfulSubs / totalSubs) * 100).toFixed(2) : 0
      },
      testCases: {
        total: testCaseData.totalTestCases,
        hidden: testCaseData.hiddenTestCases,
        public: testCaseData.publicTestCases,
        hiddenPercentage: testCaseData.totalTestCases > 0 ? 
          ((testCaseData.hiddenTestCases / testCaseData.totalTestCases) * 100).toFixed(2) : 0
      }
    };

    res.status(200).json({
      success: true,
      data: statistics
    });
  } catch (err) {
    console.error('Get problem statistics error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
      details: err.message
    });
  }
});

/* POST test solution against problem with proper test case handling */
router.post('/:id/test', async function(req, res, next) {
  try {
    const problemId = req.params.id;
    const { code, language, userId } = req.body;
    
    if (!problemId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid problem ID format' 
      });
    }

    if (!code || !language) {
      return res.status(400).json({
        success: false,
        error: 'Code and language are required'
      });
    }

    const validLanguages = ['python', 'javascript', 'java', 'cpp', 'c', 'go', 'ruby', 'php'];
    if (!validLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid language. Valid languages: ' + validLanguages.join(', ')
      });
    }

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ 
        success: false,
        error: 'Problem not found' 
      });
    }

    // Get all test cases for execution (including hidden ones)
    const allTestCases = problem.getTestCasesForExecution();
    
    // Get visible test cases for response (what user can see)
    const isAdmin = req.headers['user-role'] === 'admin';
    const visibleTestCases = problem.getVisibleTestCases(isAdmin);

    // Here you would integrate with your code compilation service
    // For now, returning a mock response
    const testResults = {
      problemId,
      totalTestCases: allTestCases.length,
      visibleTestCases: visibleTestCases.length,
      passedTestCases: 0,
      results: [],
      visibleResults: [],
      overallStatus: 'pending',
      language,
      executionTime: 0,
      memoryUsed: 0
    };

    // Execute against all test cases (including hidden ones)
    for (let i = 0; i < allTestCases.length; i++) {
      const testCase = allTestCases[i];
      // Mock result - replace with actual compilation and execution
      const result = {
        testCase: i + 1,
        input: testCase.input,
        expectedOutput: testCase.output,
        actualOutput: 'Mock output', // This would come from code execution
        status: Math.random() > 0.3 ? 'passed' : 'failed', // Mock random results
        executionTime: Math.floor(Math.random() * 200) + 50, // Mock execution time
        memoryUsed: Math.floor(Math.random() * 1000) + 500, // Mock memory usage
        isHidden: testCase.isHidden,
        isPublic: testCase.isPublic
      };
      
      testResults.results.push(result);
      testResults.executionTime += result.executionTime;
      testResults.memoryUsed = Math.max(testResults.memoryUsed, result.memoryUsed);
      
      if (result.status === 'passed') {
        testResults.passedTestCases++;
      }
    }

    // Filter results for response based on visibility
    if (isAdmin) {
      // Admins see all results
      testResults.visibleResults = testResults.results;
    } else {
      // Students see only results from visible test cases
      testResults.visibleResults = testResults.results.filter(result => 
        !result.isHidden && result.isPublic
      );
      
      // Remove sensitive information from hidden test cases
      testResults.visibleResults = testResults.visibleResults.map(result => ({
        testCase: result.testCase,
        status: result.status,
        executionTime: result.executionTime,
        memoryUsed: result.memoryUsed,
        // Only show input/output for visible test cases
        ...(result.isPublic && !result.isHidden ? {
          input: result.input,
          expectedOutput: result.expectedOutput,
          actualOutput: result.actualOutput
        } : {})
      }));
    }

    // Determine overall status
    testResults.overallStatus = testResults.passedTestCases === testResults.totalTestCases ? 'accepted' : 'failed';

    // Update problem statistics
    problem.totalSubmissions++;
    if (testResults.overallStatus === 'accepted') {
      problem.successfulSubmissions++;
    }
    await problem.save();

    // Remove full results from response for students
    if (!isAdmin) {
      delete testResults.results;
    }

    res.status(200).json({
      success: true,
      data: testResults
    });
  } catch (err) {
    console.error('Test solution error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to test solution',
      details: err.message
    });
  }
});

/* GET problem sample test cases only */
router.get('/:id/samples', async function(req, res, next) {
  try {
    const problemId = req.params.id;
    
    if (!problemId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid problem ID format' 
      });
    }

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ 
        success: false,
        error: 'Problem not found' 
      });
    }

    const sampleTestCases = problem.getSampleTestCases();

    res.status(200).json({
      success: true,
      data: {
        problemId,
        title: problem.title,
        sampleTestCases,
        count: sampleTestCases.length
      }
    });
  } catch (err) {
    console.error('Get sample test cases error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sample test cases',
      details: err.message
    });
  }
});

module.exports = router;
