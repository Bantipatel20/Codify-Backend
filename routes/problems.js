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
        .select('-testCases') // Exclude test cases from list view
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Problem.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: problems,
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

/* GET problem by ID */
router.get('/:id', async function(req, res, next) {
  try {
    const problemId = req.params.id;
    
    if (!problemId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid problem ID format' 
      });
    }

    const problem = await Problem.findById(problemId)
      .populate('createdBy', 'name email');

    if (!problem) {
      return res.status(404).json({ 
        success: false,
        error: 'Problem not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: problem
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

/* POST create new problem */
router.post('/', async function(req, res, next) {
  try {
    const {
      title,
      description,
      difficulty,
      testCases,
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

/* PUT update problem by ID */
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

/* DELETE problem by ID */
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

    // Soft delete by setting isActive to false
    const deletedProblem = await Problem.findByIdAndUpdate(
      problemId,
      { isActive: false },
      { new: true }
    );

    res.status(200).json({ 
      success: true,
      message: 'Problem deleted successfully',
      data: { deletedProblemId: problemId }
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

/* GET problems by difficulty */
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

    const problems = await Problem.find({ 
      difficulty, 
      isActive: true 
    })
    .populate('createdBy', 'name email')
    .select('-testCases')
    .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: problems,
      count: problems.length
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

/* GET problems by tags */
router.get('/tags/:tag', async function(req, res, next) {
  try {
    const tag = req.params.tag.toLowerCase();

    const problems = await Problem.find({ 
      tags: tag,
      isActive: true 
    })
    .populate('createdBy', 'name email')
    .select('-testCases')
    .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: problems,
      count: problems.length,
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
      successfulSubmissions
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
      ])
    ]);

    const totalSubs = totalSubmissions[0]?.total || 0;
    const successfulSubs = successfulSubmissions[0]?.total || 0;

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

/* POST test solution against problem */
router.post('/:id/test', async function(req, res, next) {
  try {
    const problemId = req.params.id;
    const { code, language } = req.body;
    
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

    const problem = await Problem.findById(problemId);
    if (!problem) {
      return res.status(404).json({ 
        success: false,
        error: 'Problem not found' 
      });
    }

    // Here you would integrate with your code compilation service
    // For now, returning a mock response
    const testResults = {
      problemId,
      totalTestCases: problem.testCases.length,
      passedTestCases: 0,
      results: [],
      overallStatus: 'pending'
    };

    // This would be replaced with actual test execution
    for (let i = 0; i < problem.testCases.length; i++) {
      const testCase = problem.testCases[i];
      // Mock result - replace with actual compilation and execution
      const result = {
        testCase: i + 1,
        input: testCase.input,
        expectedOutput: testCase.output,
        actualOutput: 'Mock output', // This would come from code execution
        status: 'passed', // This would be determined by comparing outputs
        executionTime: '100ms'
      };
      
      testResults.results.push(result);
      if (result.status === 'passed') {
        testResults.passedTestCases++;
      }
    }

    testResults.overallStatus = testResults.passedTestCases === testResults.totalTestCases ? 'accepted' : 'failed';

    // Update problem statistics
    problem.totalSubmissions++;
    if (testResults.overallStatus === 'accepted') {
      problem.successfulSubmissions++;
    }
    await problem.save();

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

module.exports = router;
