// routes/contests.js
var express = require('express');
var router = express.Router();
const Contest = require('../models/Contest');
const Problem = require('../models/Problem');
const User = require('../models/Users');

/* GET all contests - Enhanced with filtering and pagination */
router.get('/', async function(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter object
    const filter = { isActive: true };
    
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    if (req.query.createdBy) {
      filter.createdBy = req.query.createdBy;
    }
    
    if (req.query.startDate && req.query.endDate) {
      filter.startDate = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    // Get contests without populating problems first
    const [contests, totalCount] = await Promise.all([
      Contest.find(filter)
        .populate('createdBy', 'name email')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Contest.countDocuments(filter)
    ]);

    // Manually populate existing problems only
    for (let contest of contests) {
      const existingProblemIds = contest.problems
        .filter(p => !p.problemId.startsWith('manual_'))
        .map(p => p.problemId);
      
      if (existingProblemIds.length > 0) {
        const existingProblems = await Problem.find({ 
          _id: { $in: existingProblemIds } 
        }).select('title difficulty');
        
        // Map existing problems back to contest problems
        contest.problems.forEach(contestProblem => {
          if (!contestProblem.problemId.startsWith('manual_')) {
            const dbProblem = existingProblems.find(p => p._id.toString() === contestProblem.problemId);
            if (dbProblem) {
              contestProblem.populatedProblem = dbProblem;
            }
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      data: contests,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalContests: totalCount,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (err) {
    console.error('Get contests error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve contests',
      details: err.message
    });
  }
});

/* GET contest by ID */
router.get('/:id', async function(req, res, next) {
  try {
    const contestId = req.params.id;
    
    if (!contestId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid contest ID format' 
      });
    }

    const contest = await Contest.findById(contestId)
      .populate('createdBy', 'name email');

    if (!contest) {
      return res.status(404).json({ 
        success: false,
        error: 'Contest not found' 
      });
    }

    // Manually populate existing problems only
    const existingProblemIds = contest.problems
      .filter(p => !p.problemId.startsWith('manual_'))
      .map(p => p.problemId);
    
    if (existingProblemIds.length > 0) {
      const existingProblems = await Problem.find({ 
        _id: { $in: existingProblemIds } 
      }).select('title description difficulty tags');
      
      // Map existing problems back to contest problems
      contest.problems.forEach(contestProblem => {
        if (!contestProblem.problemId.startsWith('manual_')) {
          const dbProblem = existingProblems.find(p => p._id.toString() === contestProblem.problemId);
          if (dbProblem) {
            contestProblem.populatedProblem = dbProblem;
          }
        }
      });
    }

    res.status(200).json({
      success: true,
      data: contest
    });
  } catch (err) {
    console.error('Get contest error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve contest',
      details: err.message
    });
  }
});

/* POST create new contest - UPDATED to handle manual problems */
router.post('/', async function(req, res, next) {
  try {
    const {
      title,
      description,
      startDate,
      endDate,
      duration,
      rules,
      maxParticipants,
      problems,
      createdBy,
      participantSelection,
      filterCriteria,
      settings
    } = req.body;

    console.log('📥 Received contest creation request:', {
      title,
      problemsCount: problems?.length,
      problems: problems?.map(p => ({ id: p.problemId, title: p.title, hasManual: !!p.manualProblem }))
    });

    // Validate required fields
    if (!title || !description || !startDate || !endDate || !duration || !createdBy) {
      return res.status(400).json({
        success: false,
        error: 'Title, description, start date, end date, duration, and creator are required'
      });
    }

    // Validate problems array
    if (!problems || !Array.isArray(problems) || problems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one problem is required'
      });
    }

    // Separate manual problems from existing problems
    const manualProblems = problems.filter(p => p.problemId && p.problemId.startsWith('manual_'));
    const existingProblemIds = problems
      .filter(p => p.problemId && !p.problemId.startsWith('manual_'))
      .map(p => p.problemId);

    console.log('🔍 Problem analysis:', {
      manualProblemsCount: manualProblems.length,
      existingProblemsCount: existingProblemIds.length,
      manualProblemIds: manualProblems.map(p => p.problemId),
      existingProblemIds: existingProblemIds
    });

    // Verify existing problems exist (skip manual ones)
    let existingProblems = [];
    if (existingProblemIds.length > 0) {
      try {
        existingProblems = await Problem.find({ 
          _id: { $in: existingProblemIds }, 
          isActive: true 
        });

        if (existingProblems.length !== existingProblemIds.length) {
          const foundIds = existingProblems.map(p => p._id.toString());
          const missingIds = existingProblemIds.filter(id => !foundIds.includes(id));
          return res.status(400).json({
            success: false,
            error: `One or more existing problems do not exist or are inactive. Missing: ${missingIds.join(', ')}`
          });
        }
      } catch (problemError) {
        console.error('Error validating existing problems:', problemError);
        return res.status(400).json({
          success: false,
          error: 'Invalid problem ID format in existing problems',
          details: problemError.message
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

    // Create contest data with proper problem handling
    const contestData = {
      title,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      duration,
      rules,
      maxParticipants: maxParticipants || 100,
      problems: problems.map((p, index) => {
        const problemData = {
          problemId: p.problemId, // Keep original ID (even for manual problems)
          title: p.title,
          difficulty: p.difficulty,
          category: p.category || 'General',
          points: p.points,
          order: p.order || index + 1,
          solvedCount: 0,
          attemptCount: 0
        };

        // Add manual problem data if it exists
        if (p.manualProblem) {
          problemData.manualProblem = {
            description: p.manualProblem.description,
            inputFormat: p.manualProblem.inputFormat,
            outputFormat: p.manualProblem.outputFormat,
            constraints: p.manualProblem.constraints,
            sampleInput: p.manualProblem.sampleInput,
            sampleOutput: p.manualProblem.sampleOutput,
            explanation: p.manualProblem.explanation,
            testCases: p.manualProblem.testCases || []
          };
        }

        return problemData;
      }),
      createdBy,
      participantSelection: participantSelection || 'manual',
      filterCriteria: filterCriteria || {},
      settings: settings || {}
    };

    console.log('💾 Creating contest with data:', {
      title: contestData.title,
      problemsCount: contestData.problems.length,
      manualProblemsInData: contestData.problems.filter(p => p.manualProblem).length,
      problemIds: contestData.problems.map(p => p.problemId)
    });

    const newContest = new Contest(contestData);
    const savedContest = await newContest.save();

    console.log('✅ Contest created successfully:', savedContest._id);

    // Return the contest without trying to populate manual problems
    const responseContest = await Contest.findById(savedContest._id)
      .populate('createdBy', 'name email');

    // Manually add existing problem details if any
    const responseExistingProblemIds = responseContest.problems
      .filter(p => !p.problemId.startsWith('manual_'))
      .map(p => p.problemId);
    
    if (responseExistingProblemIds.length > 0) {
      const responseExistingProblems = await Problem.find({ 
        _id: { $in: responseExistingProblemIds } 
      }).select('title difficulty');
      
      responseContest.problems.forEach(contestProblem => {
        if (!contestProblem.problemId.startsWith('manual_')) {
          const dbProblem = responseExistingProblems.find(p => p._id.toString() === contestProblem.problemId);
          if (dbProblem) {
            contestProblem.populatedProblem = dbProblem;
          }
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Contest created successfully',
      data: responseContest
    });
  } catch (err) {
    console.error('❌ Create contest error:', err);
    
    if (err.name === 'ValidationError') {
      const validationErrors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
    }

    if (err.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid data format in request',
        details: `Cast error: ${err.message}`
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create contest',
      details: err.message
    });
  }
});

/* PUT update contest by ID - UPDATED to handle manual problems */
router.put('/:id', async function(req, res, next) {
  try {
    const contestId = req.params.id;
    
    if (!contestId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid contest ID format' 
      });
    }

    const contest = await Contest.findById(contestId);
    if (!contest) {
      return res.status(404).json({ 
        success: false,
        error: 'Contest not found' 
      });
    }

    // Don't allow updates to active or completed contests
    if (contest.status === 'Active' || contest.status === 'Completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update active or completed contests'
      });
    }

    const updateData = { ...req.body };
    delete updateData.participants; // Don't allow direct participant updates
    delete updateData.analytics; // Don't allow direct analytics updates

    // If problems are being updated, validate existing ones (skip manual)
    if (updateData.problems) {
      const existingProblemIds = updateData.problems
        .filter(p => p.problemId && !p.problemId.startsWith('manual_'))
        .map(p => p.problemId);

      if (existingProblemIds.length > 0) {
        const existingProblems = await Problem.find({ 
          _id: { $in: existingProblemIds }, 
          isActive: true 
        });

        if (existingProblems.length !== existingProblemIds.length) {
          return res.status(400).json({
            success: false,
            error: 'One or more existing problems do not exist or are inactive'
          });
        }
      }
    }

    const updatedContest = await Contest.findByIdAndUpdate(
      contestId,
      updateData,
      { 
        new: true, 
        runValidators: true 
      }
    )
    .populate('createdBy', 'name email');

    // Manually populate existing problems
    const existingProblemIds = updatedContest.problems
      .filter(p => !p.problemId.startsWith('manual_'))
      .map(p => p.problemId);
    
    if (existingProblemIds.length > 0) {
      const existingProblems = await Problem.find({ 
        _id: { $in: existingProblemIds } 
      }).select('title difficulty');
      
      updatedContest.problems.forEach(contestProblem => {
        if (!contestProblem.problemId.startsWith('manual_')) {
          const dbProblem = existingProblems.find(p => p._id.toString() === contestProblem.problemId);
          if (dbProblem) {
            contestProblem.populatedProblem = dbProblem;
          }
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Contest updated successfully',
      data: updatedContest
    });
  } catch (err) {
    console.error('Update contest error:', err);
    
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
      error: 'Failed to update contest',
      details: err.message
    });
  }
});

/* DELETE contest by ID */
router.delete('/:id', async function(req, res, next) {
  try {
    const contestId = req.params.id;
    
    if (!contestId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid contest ID format' 
      });
    }

    const contest = await Contest.findById(contestId);
    if (!contest) {
      return res.status(404).json({ 
        success: false,
        error: 'Contest not found' 
      });
    }

    // Don't allow deletion of active contests
    if (contest.status === 'Active') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete active contests'
      });
    }

    // Soft delete by setting isActive to false
    const deletedContest = await Contest.findByIdAndUpdate(
      contestId,
      { isActive: false },
      { new: true }
    );

    res.status(200).json({ 
      success: true,
      message: 'Contest deleted successfully',
      data: { deletedContestId: contestId }
    });
  } catch (err) {
    console.error('Delete contest error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete contest',
      details: err.message
    });
  }
});

/* POST register participant to contest */
router.post('/:id/register', async function(req, res, next) {
  try {
    const contestId = req.params.id;
    const { userId } = req.body;
    
    if (!contestId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid contest ID format' 
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const contest = await Contest.findById(contestId);
    if (!contest) {
      return res.status(404).json({ 
        success: false,
        error: 'Contest not found' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if contest is still accepting registrations
    if (contest.status === 'Completed' || contest.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Contest is not accepting registrations'
      });
    }

    await contest.addParticipant(user);

    res.status(200).json({
      success: true,
      message: 'User registered successfully',
      data: {
        contestId,
        userId,
        participantCount: contest.participants.length
      }
    });
  } catch (err) {
    console.error('Register participant error:', err);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/* GET contest leaderboard */
router.get('/:id/leaderboard', async function(req, res, next) {
  try {
    const contestId = req.params.id;
    
    if (!contestId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid contest ID format' 
      });
    }

    const contest = await Contest.findById(contestId);
    if (!contest) {
      return res.status(404).json({ 
        success: false,
        error: 'Contest not found' 
      });
    }

    // Check if leaderboard should be shown
    if (!contest.settings.showLeaderboard || 
        (!contest.settings.showLeaderboardDuringContest && contest.status === 'Active')) {
      return res.status(403).json({
        success: false,
        error: 'Leaderboard is not available'
      });
    }

    const leaderboard = contest.getLeaderboard();

    res.status(200).json({
      success: true,
      data: {
        contestId,
        contestTitle: contest.title,
        leaderboard,
        totalParticipants: contest.participants.length,
        activeParticipants: contest.activeParticipantsCount,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Get leaderboard error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve leaderboard',
      details: err.message
    });
  }
});

/* GET contests by status */
router.get('/status/:status', async function(req, res, next) {
  try {
    const status = req.params.status;
    const validStatuses = ['Upcoming', 'Active', 'Completed', 'Cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Valid statuses: ' + validStatuses.join(', ')
      });
    }

    const contests = await Contest.findByStatus(status)
      .populate('createdBy', 'name email');

    // Manually populate existing problems for each contest
    for (let contest of contests) {
      const existingProblemIds = contest.problems
        .filter(p => !p.problemId.startsWith('manual_'))
        .map(p => p.problemId);
      
      if (existingProblemIds.length > 0) {
        const existingProblems = await Problem.find({ 
          _id: { $in: existingProblemIds } 
        }).select('title difficulty');
        
        contest.problems.forEach(contestProblem => {
          if (!contestProblem.problemId.startsWith('manual_')) {
            const dbProblem = existingProblems.find(p => p._id.toString() === contestProblem.problemId);
            if (dbProblem) {
              contestProblem.populatedProblem = dbProblem;
            }
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      data: contests,
      count: contests.length
    });
  } catch (err) {
    console.error('Get contests by status error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve contests',
      details: err.message
    });
  }
});

/* GET upcoming contests */
router.get('/filter/upcoming', async function(req, res, next) {
  try {
    const contests = await Contest.findUpcoming()
      .populate('createdBy', 'name email');

    // Manually populate existing problems for each contest
    for (let contest of contests) {
      const existingProblemIds = contest.problems
        .filter(p => !p.problemId.startsWith('manual_'))
        .map(p => p.problemId);
      
      if (existingProblemIds.length > 0) {
        const existingProblems = await Problem.find({ 
          _id: { $in: existingProblemIds } 
        }).select('title difficulty');
        
        contest.problems.forEach(contestProblem => {
          if (!contestProblem.problemId.startsWith('manual_')) {
            const dbProblem = existingProblems.find(p => p._id.toString() === contestProblem.problemId);
            if (dbProblem) {
              contestProblem.populatedProblem = dbProblem;
            }
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      data: contests,
      count: contests.length
    });
  } catch (err) {
    console.error('Get upcoming contests error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve upcoming contests',
      details: err.message
    });
  }
});

/* GET active contests */
router.get('/filter/active', async function(req, res, next) {
  try {
    const contests = await Contest.findActive()
      .populate('createdBy', 'name email');

    // Manually populate existing problems for each contest
    for (let contest of contests) {
      const existingProblemIds = contest.problems
        .filter(p => !p.problemId.startsWith('manual_'))
        .map(p => p.problemId);
      
      if (existingProblemIds.length > 0) {
        const existingProblems = await Problem.find({ 
          _id: { $in: existingProblemIds } 
        }).select('title difficulty');
        
        contest.problems.forEach(contestProblem => {
          if (!contestProblem.problemId.startsWith('manual_')) {
            const dbProblem = existingProblems.find(p => p._id.toString() === contestProblem.problemId);
            if (dbProblem) {
              contestProblem.populatedProblem = dbProblem;
            }
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      data: contests,
      count: contests.length
    });
  } catch (err) {
    console.error('Get active contests error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve active contests',
      details: err.message
    });
  }
});

/* POST update contest status */
router.post('/:id/status', async function(req, res, next) {
  try {
    const contestId = req.params.id;
    const { status } = req.body;
    
    if (!contestId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid contest ID format' 
      });
    }

    const validStatuses = ['Upcoming', 'Active', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Valid statuses: ' + validStatuses.join(', ')
      });
    }

    const contest = await Contest.findById(contestId);
    if (!contest) {
      return res.status(404).json({ 
        success: false,
        error: 'Contest not found' 
      });
    }

    contest.status = status;
    await contest.save();

    res.status(200).json({
      success: true,
      message: 'Contest status updated successfully',
      data: {
        contestId,
        newStatus: status
      }
    });
  } catch (err) {
    console.error('Update contest status error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update contest status',
      details: err.message
    });
  }
});

/* GET contest analytics */
router.get('/:id/analytics', async function(req, res, next) {
  try {
    const contestId = req.params.id;
    
    if (!contestId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid contest ID format' 
      });
    }

    const contest = await Contest.findById(contestId);

    if (!contest) {
      return res.status(404).json({ 
        success: false,
        error: 'Contest not found' 
      });
    }

    // Manually populate existing problems
    const existingProblemIds = contest.problems
      .filter(p => !p.problemId.startsWith('manual_'))
      .map(p => p.problemId);
    
    if (existingProblemIds.length > 0) {
      const existingProblems = await Problem.find({ 
        _id: { $in: existingProblemIds } 
      }).select('title difficulty');
      
      contest.problems.forEach(contestProblem => {
        if (!contestProblem.problemId.startsWith('manual_')) {
          const dbProblem = existingProblems.find(p => p._id.toString() === contestProblem.problemId);
          if (dbProblem) {
            contestProblem.populatedProblem = dbProblem;
          }
        }
      });
    }

    const analytics = {
      basic: {
        totalParticipants: contest.participants.length,
        activeParticipants: contest.activeParticipantsCount,
        totalProblems: contest.problems.length,
        totalPoints: contest.totalPoints,
        averageScore: contest.analytics.averageScore,
        participationRate: contest.analytics.participationRate
      },
      submissions: {
        total: contest.analytics.totalSubmissions,
        successful: contest.analytics.successfulSubmissions,
        successRate: contest.successRate
      },
      problems: contest.problems.map(p => ({
        title: p.title,
        difficulty: p.difficulty,
        points: p.points,
        solvedCount: p.solvedCount,
        attemptCount: p.attemptCount,
        successRate: p.attemptCount > 0 ? ((p.solvedCount / p.attemptCount) * 100).toFixed(2) : 0,
        isManual: !!p.manualProblem
      })),
      departmentWise: {},
      semesterWise: {}
    };

    // Calculate department-wise and semester-wise statistics
    contest.participants.forEach(participant => {
      // Department-wise
      if (!analytics.departmentWise[participant.department]) {
        analytics.departmentWise[participant.department] = {
          count: 0,
          totalScore: 0,
          averageScore: 0
        };
      }
      analytics.departmentWise[participant.department].count++;
      analytics.departmentWise[participant.department].totalScore += participant.score;
      
      // Semester-wise
      if (!analytics.semesterWise[participant.semester]) {
        analytics.semesterWise[participant.semester] = {
          count: 0,
          totalScore: 0,
          averageScore: 0
        };
      }
      analytics.semesterWise[participant.semester].count++;
      analytics.semesterWise[participant.semester].totalScore += participant.score;
    });

    // Calculate averages
    Object.keys(analytics.departmentWise).forEach(dept => {
      const deptData = analytics.departmentWise[dept];
      deptData.averageScore = deptData.count > 0 ? (deptData.totalScore / deptData.count).toFixed(2) : 0;
    });

    Object.keys(analytics.semesterWise).forEach(sem => {
      const semData = analytics.semesterWise[sem];
      semData.averageScore = semData.count > 0 ? (semData.totalScore / semData.count).toFixed(2) : 0;
    });

    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (err) {
    console.error('Get contest analytics error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve contest analytics',
      details: err.message
    });
  }
});

module.exports = router;
