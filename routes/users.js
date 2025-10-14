var express = require('express');
var router = express.Router();
const User = require('../models/Users');

/* GET all users - Enhanced with pagination and filtering */
router.get('/users', async function(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter object
    const filter = {};
    if (req.query.name) {
      filter.name = { $regex: req.query.name, $options: 'i' };
    }
    if (req.query.email) {
      filter.email = { $regex: req.query.email, $options: 'i' };
    }
    if (req.query.department) {
      filter.department = req.query.department;
    }
    if (req.query.semester) {
      filter.semester = parseInt(req.query.semester);
    }
    if (req.query.role) {
      filter.role = req.query.role;
    }
    if (req.query.batch) {
      filter.batch = req.query.batch;
    }
    if (req.query.div) {
      filter.div = req.query.div;
    }

    // Execute queries concurrently
    const [users, totalCount] = await Promise.all([
      User.find(filter)
        .select('-password') // Exclude password from response
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      User.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalUsers: totalCount,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve users',
      details: err.message
    });
  }
});

/* GET a user by ID - Enhanced with better error handling */
router.get('/user/:id', async function(req, res, next) {
  try {
    const userId = req.params.id;
    
    // Validate ObjectId format
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid user ID format' 
      });
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user',
      details: err.message
    });
  }
});

/* DELETE a user by ID - Enhanced with validation */
router.delete('/user/:id', async function(req, res, next) {
  try {
    const userId = req.params.id;
    
    // Validate ObjectId format
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid user ID format' 
      });
    }

    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.status(200).json({ 
      success: true,
      message: 'User deleted successfully',
      data: { deletedUserId: userId }
    });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user',
      details: err.message
    });
  }
});

/* POST a new user - Enhanced with validation */
router.post('/user', async function (req, res, next) {
  try {
    const { username, student_id, name, email, password, department, batch, div, semester, role } = req.body;

    const userRole = role || 'Student'; // Default role to Student

    // ✅ Admin logic
    if (userRole === 'Admin') {
      // Only validate basic fields
      if (!username || !name || !email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username, name, email, and password are required for Admin users'
        });
      }
    } 
    // ✅ Student logic
    else {
      if (!username || !name || !email || !password || !student_id || !department || !batch || !div || !semester) {
        return res.status(400).json({
          success: false,
          error: 'All fields are required for Student users'
        });
      }

      // Validate division (1 or 2)
      const divNum = parseInt(div);
      if (![1, 2].includes(divNum)) {
        return res.status(400).json({ success: false, error: 'Division must be 1 or 2' });
      }

      // Validate batch
      const validBatches = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      if (!validBatches.includes(batch)) {
        return res.status(400).json({ success: false, error: 'Batch must be one of: A1, A2, B1, B2, C1, C2' });
      }

      // Validate semester (1-8)
      const semesterNum = parseInt(semester);
      if (semesterNum < 1 || semesterNum > 8) {
        return res.status(400).json({ success: false, error: 'Semester must be between 1 and 8' });
      }
    }

    // ✅ Check duplicates
    const duplicateCheck = [
      { email: email.toLowerCase() },
      { username: username }
    ];
    if (userRole !== 'Admin' && student_id) duplicateCheck.push({ student_id });

    const existingUser = await User.findOne({ $or: duplicateCheck });
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'User with this email, username, or student ID already exists' });
    }

    // ✅ Build user data
    const userData = {
      username,
      name,
      email: email.toLowerCase(),
      password,
      role: userRole,
      ...(userRole !== 'Admin' && { student_id, department, batch, div: parseInt(div), semester: parseInt(semester) })
    };

    // Save user
    const newUser = new User(userData);
    const savedUser = await newUser.save();

    // Remove password from response
    const userResponse = savedUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: `${userRole} created successfully`,
      data: userResponse
    });

  } catch (err) {
    console.error('Create user error:', err);

    // Duplicate key error
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'User with this email, username, or student ID already exists' });
    }

    // Validation errors
    if (err.name === 'ValidationError') {
      const validationErrors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, error: 'Validation failed', details: validationErrors });
    }

    // Generic error
    res.status(500).json({ success: false, error: 'Failed to create user', details: err.message });
  }
});



/* PUT update user by ID - Enhanced with validation */
router.put('/user/:id', async function(req, res, next) {
  try {
    const userId = req.params.id;
    
    // Validate ObjectId format
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid user ID format' 
      });
    }

    const updateData = { ...req.body };

    // Validate division if being updated
    if (updateData.div && ![1, 2].includes(parseInt(updateData.div))) {
      return res.status(400).json({
        success: false,
        error: 'Division must be 1 or 2'
      });
    }

    // Validate batch if being updated
    if (updateData.batch) {
      const validBatches = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      if (!validBatches.includes(updateData.batch)) {
        return res.status(400).json({
          success: false,
          error: 'Batch must be one of: A1, A2, B1, B2, C1, C2'
        });
      }
    }

    // Validate semester if being updated
    if (updateData.semester) {
      const semesterNum = parseInt(updateData.semester);
      if (semesterNum < 1 || semesterNum > 8) {
        return res.status(400).json({
          success: false,
          error: 'Semester must be between 1 and 8'
        });
      }
      updateData.semester = semesterNum;
    }

    // Validate role if being updated
    if (updateData.role && !['Admin', 'Student'].includes(updateData.role)) {
      return res.status(400).json({
        success: false,
        error: 'Role must be either Admin or Student'
      });
    }

    // Convert div to number if provided
    if (updateData.div) {
      updateData.div = parseInt(updateData.div);
    }

    // If email is being updated, check for duplicates
    if (updateData.email) {
      updateData.email = updateData.email.toLowerCase();
      const existingUser = await User.findOne({ 
        email: updateData.email,
        _id: { $ne: userId }
      });
      
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'User with this email already exists'
        });
      }
    }

    // If username is being updated, check for duplicates
    if (updateData.username) {
      const existingUser = await User.findOne({ 
        username: updateData.username,
        _id: { $ne: userId }
      });
      
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Username already exists'
        });
      }
    }

    // If student_id is being updated, check for duplicates
    if (updateData.student_id) {
      const existingUser = await User.findOne({ 
        student_id: updateData.student_id,
        _id: { $ne: userId }
      });
      
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Student ID already exists'
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { 
        new: true, 
        runValidators: true,
        select: '-password'
      }
    );

    if (!updatedUser) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (err) {
    console.error('Update user error:', err);
    
    // Handle duplicate key error
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Username, email, or student ID already exists'
      });
    }
    
    // Handle validation errors
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
      error: 'Failed to update user',
      details: err.message
    });
  }
});

/* POST login - Enhanced authentication with role support */
router.post('/login', async function(req, res, next) {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    // Find user by username
    const user = await User.findOne({ username: username });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    // Check if password matches
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    // Return success with user data including role from database
    res.status(200).json({
      success: true,
      role: user.role.toLowerCase(), // Convert to lowercase for consistency
      username: user.username,
      name: user.name,
      userId: user._id.toString(),
      department: user.department,
      semester: user.semester,
      batch: user.batch,
      division: user.div
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

/* GET dropdown data endpoints */
router.get('/meta/departments', async function(req, res, next) {
  try {
    const departments = await User.distinct('department');
    res.status(200).json({
      success: true,
      data: departments.filter(dept => dept && dept.trim() !== '').sort()
    });
  } catch (err) {
    console.error('Get departments error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve departments',
      details: err.message
    });
  }
});

router.get('/meta/batches', async function(req, res, next) {
  try {
    const batches = await User.distinct('batch');
    res.status(200).json({
      success: true,
      data: batches.filter(batch => batch && batch.trim() !== '').sort()
    });
  } catch (err) {
    console.error('Get batches error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve batches',
      details: err.message
    });
  }
});

router.get('/meta/divisions', async function(req, res, next) {
  try {
    const divisions = await User.distinct('div');
    res.status(200).json({
      success: true,
      data: divisions.filter(div => div !== null && div !== undefined).sort()
    });
  } catch (err) {
    console.error('Get divisions error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve divisions',
      details: err.message
    });
  }
});

/* GET roles endpoint */
router.get('/meta/roles', async function(req, res, next) {
  try {
    const roles = await User.distinct('role');
    res.status(200).json({
      success: true,
      data: roles.filter(role => role && role.trim() !== '').sort()
    });
  } catch (err) {
    console.error('Get roles error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve roles',
      details: err.message
    });
  }
});

/* GET semesters endpoint */
router.get('/meta/semesters', async function(req, res, next) {
  try {
    const semesters = await User.distinct('semester');
    res.status(200).json({
      success: true,
      data: semesters.filter(sem => sem !== null && sem !== undefined).sort((a, b) => a - b)
    });
  } catch (err) {
    console.error('Get semesters error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve semesters',
      details: err.message
    });
  }
});

module.exports = router;
