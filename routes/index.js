var express = require('express');
var router = express.Router();
const User = require('../models/Users');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/* GET all users */
router.get('/users', async function(req, res, next) {
  try {
    const users = await User.find();
    res.status(200).json(users); // Respond with all users as JSON
  } catch (err) {
    next(err);
  }
});

/* GET a user by ID */
router.get('/user/:id', async function(req, res, next) {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json(user); // Respond with user data as JSON
  } catch (err) {
    next(err);
  }
});

/* DELETE a user by ID */
router.delete('/user/:id', async function(req, res, next) {
  try {
    const userId = req.params.id;
    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/* POST a new user */
router.post('/user', async function(req, res, next) {
  try {
    const newUser = new User(req.body);
    await newUser.save();
    res.status(201).json(newUser); // Respond with created user
  } catch (err) {
    next(err);
  }
});

/* PUT update user by ID */
router.put('/user/:id', async function(req, res, next) {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json(updatedUser);
  } catch (err) {
    next(err);
  }
});



/* POST compile and execute code - IMMEDIATE OUTPUT */
router.post('/compile', async function(req, res, next) {
  try {
    const { code, lang, input = '' } = req.body;
    const startTime = Date.now();

    // Validate required fields
    if (!code || !lang) {
      return res.status(400).json({ 
        error: 'Code and language are required',
        success: false 
      });
    }

    // Generate unique filename
    const uniqueId = uuidv4();
    const tempDir = path.join(__dirname, '../temp');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    let filename, command, extension;

    // Configure language-specific settings
    switch (lang.toLowerCase()) {
      case 'python':
      case 'py':
        extension = '.py';
        filename = path.join(tempDir, `${uniqueId}${extension}`);
        command = `python3 "${filename}"`;
        break;
      
      case 'javascript':
      case 'js':
      case 'node':
        extension = '.js';
        filename = path.join(tempDir, `${uniqueId}${extension}`);
        command = `node "${filename}"`;
        break;
      
      case 'java':
        extension = '.java';
        filename = path.join(tempDir, `${uniqueId}${extension}`);
        command = `cd "${tempDir}" && javac "${filename}" && java ${uniqueId}`;
        break;
      
      case 'cpp':
      case 'c++':
        extension = '.cpp';
        filename = path.join(tempDir, `${uniqueId}${extension}`);
        const executablePath = path.join(tempDir, uniqueId);
        command = `g++ "${filename}" -o "${executablePath}" && "${executablePath}"`;
        break;
      
      case 'c':
        extension = '.c';
        filename = path.join(tempDir, `${uniqueId}${extension}`);
        const cExecutablePath = path.join(tempDir, uniqueId);
        command = `gcc "${filename}" -o "${cExecutablePath}" && "${cExecutablePath}"`;
        break;
      
      case 'go':
        extension = '.go';
        filename = path.join(tempDir, `${uniqueId}${extension}`);
        command = `go run "${filename}"`;
        break;
      
      case 'ruby':
      case 'rb':
        extension = '.rb';
        filename = path.join(tempDir, `${uniqueId}${extension}`);
        command = `ruby "${filename}"`;
        break;
      
      case 'php':
        extension = '.php';
        filename = path.join(tempDir, `${uniqueId}${extension}`);
        command = `php "${filename}"`;
        break;
      
      default:
        return res.status(400).json({ 
          error: 'Unsupported language. Supported languages: python, javascript, java, cpp, c, go, ruby, php',
          success: false 
        });
    }

    // Write code to file
    fs.writeFileSync(filename, code);

    // Cleanup function
    const cleanup = () => {
      try {
        if (fs.existsSync(filename)) {
          fs.unlinkSync(filename);
        }
        
        // Clean up compiled files for Java and C/C++
        if (lang.toLowerCase() === 'java') {
          const classFile = path.join(tempDir, `${uniqueId}.class`);
          if (fs.existsSync(classFile)) {
            fs.unlinkSync(classFile);
          }
        }
        
        if (lang.toLowerCase() === 'cpp' || lang.toLowerCase() === 'c++' || lang.toLowerCase() === 'c') {
          const execFile = path.join(tempDir, uniqueId);
          if (fs.existsSync(execFile)) {
            fs.unlinkSync(execFile);
          }
          // Also try with .exe extension for Windows
          if (fs.existsSync(`${execFile}.exe`)) {
            fs.unlinkSync(`${execFile}.exe`);
          }
        }
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    };

    try {
      // Execute synchronously for immediate output
      const options = {
        cwd: tempDir,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        input: input
      };

      const output = execSync(command, options);
      const executionTime = Date.now() - startTime;
      
      cleanup();
      
      // Successful execution with immediate response
      res.status(200).json({
        success: true,
        output: output.toString(),
        stderr: '',
        language: lang,
        executionTime: `${executionTime}ms`
      });

    } catch (execError) {
      cleanup();
      
      // Handle different types of errors
      if (execError.code === 'ENOENT') {
        return res.status(500).json({
          error: `Compiler/interpreter for ${lang} not found on system`,
          success: false,
          output: '',
          stderr: execError.message
        });
      }

      // Extract stdout and stderr from the error
      const stdout = execError.stdout ? execError.stdout.toString() : '';
      const stderr = execError.stderr ? execError.stderr.toString() : execError.message;
      const executionTime = Date.now() - startTime;

      return res.status(200).json({
        success: false,
        output: stdout,
        stderr: stderr,
        error: 'Compilation or runtime error occurred',
        language: lang,
        executionTime: `${executionTime}ms`
      });
    }

  } catch (err) {
    console.error('Compilation API error:', err);
    res.status(500).json({
      error: 'Internal server error during code compilation',
      success: false,
      details: err.message
    });
  }
});

/* GET supported languages */
router.get('/compile/languages', function(req, res, next) {
  const supportedLanguages = [
    { name: 'Python', key: 'python', extensions: ['.py'] },
    { name: 'JavaScript', key: 'javascript', extensions: ['.js'] },
    { name: 'Java', key: 'java', extensions: ['.java'] },
    { name: 'C++', key: 'cpp', extensions: ['.cpp'] },
    { name: 'C', key: 'c', extensions: ['.c'] },
    { name: 'Go', key: 'go', extensions: ['.go'] },
    { name: 'Ruby', key: 'ruby', extensions: ['.rb'] },
    { name: 'PHP', key: 'php', extensions: ['.php'] }
  ];

  res.status(200).json({
    success: true,
    languages: supportedLanguages
  });
});


module.exports = router;
