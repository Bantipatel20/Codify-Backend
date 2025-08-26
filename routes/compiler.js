var express = require('express');
var router = express.Router();
const { exec } = require('child_process'); // Changed to async exec
const { promisify } = require('util');
const fs = require('fs').promises; // Use async fs
const fsSync = require('fs'); // Keep sync version for existence checks
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Promisify exec for async usage
const execAsync = promisify(exec);

// Semaphore for controlling concurrent compilations
class Semaphore {
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

// Create semaphore to limit concurrent compilations (adjust based on your server capacity)
const compilationSemaphore = new Semaphore(20);



/* POST compile and execute code - FULLY ASYNC WITH CONCURRENCY CONTROL */
router.post('/compile', async function(req, res, next) {
  // Acquire semaphore for concurrency control
  await compilationSemaphore.acquire();
  
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

    // Generate unique identifiers
    const uniqueId = uuidv4();
    const tempDir = path.join(__dirname, '../temp');
    
    // Ensure temp directory exists
    await fs.mkdir(tempDir, { recursive: true });

    let filename, command, extension, actualCode = code;
    let uniqueSubDir = null;

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
        
        // Create a unique subdirectory for this compilation
        uniqueSubDir = path.join(tempDir, uniqueId);
        await fs.mkdir(uniqueSubDir, { recursive: true });
        
        // Extract class name from code
        const extractClassName = (javaCode) => {
          const codeWithoutComments = javaCode
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
          
          const publicClassMatch = codeWithoutComments.match(/public\s+class\s+(\w+)/);
          if (publicClassMatch) return publicClassMatch[1];
          
          const anyClassMatch = codeWithoutComments.match(/(?:^|\s)class\s+(\w+)/);
          if (anyClassMatch) return anyClassMatch[1];
          
          return null;
        };
        
        const extractedClassName = extractClassName(code);
        let classNameToUse;
        
        if (extractedClassName) {
          classNameToUse = extractedClassName;
          actualCode = code;
        } else {
          classNameToUse = 'Main';
          actualCode = `public class Main {
    public static void main(String[] args) {
        ${code}
    }
}`;
        }
        
        filename = path.join(uniqueSubDir, `${classNameToUse}.java`);
        command = `cd "${uniqueSubDir}" && javac "${classNameToUse}.java" && java ${classNameToUse}`;
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

    // Write code to file asynchronously
    await fs.writeFile(filename, actualCode, 'utf8');

    // Async cleanup function
    const cleanup = async () => {
      try {
        if (lang.toLowerCase() === 'java' && uniqueSubDir) {
          // For Java, remove the entire unique subdirectory
          await fs.rm(uniqueSubDir, { recursive: true, force: true });
        } else {
          // Remove main file
          if (fsSync.existsSync(filename)) {
            await fs.unlink(filename);
          }
          
          // Clean up compiled files for C/C++
          if (lang.toLowerCase() === 'cpp' || lang.toLowerCase() === 'c++' || lang.toLowerCase() === 'c') {
            const execFile = path.join(tempDir, uniqueId);
            if (fsSync.existsSync(execFile)) {
              await fs.unlink(execFile);
            }
            // Also try with .exe extension for Windows
            if (fsSync.existsSync(`${execFile}.exe`)) {
              await fs.unlink(`${execFile}.exe`);
            }
          }
        }
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    };

    try {
      // Execute asynchronously with timeout
      const options = {
        cwd: tempDir,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 30000, // 30 second timeout
        input: input
      };

      const { stdout, stderr } = await execAsync(command, options);
      const executionTime = Date.now() - startTime;
      
      // Cleanup asynchronously (don't wait for it)
      cleanup().catch(console.error);
      
      // Successful execution with immediate response
      res.status(200).json({
        success: true,
        output: stdout,
        stderr: stderr || '',
        language: lang,
        executionTime: `${executionTime}ms`,
        timestamp: new Date().toISOString()
      });

    } catch (execError) {
      // Cleanup on error
      await cleanup();
      
      const executionTime = Date.now() - startTime;
      
      // Handle different types of errors
      if (execError.code === 'ENOENT') {
        return res.status(500).json({
          error: `Compiler/interpreter for ${lang} not found on system`,
          success: false,
          output: '',
          stderr: execError.message,
          executionTime: `${executionTime}ms`
        });
      }

      if (execError.killed && execError.signal === 'SIGTERM') {
        return res.status(408).json({
          error: 'Code execution timed out',
          success: false,
          output: execError.stdout || '',
          stderr: 'Execution timed out after 30 seconds',
          executionTime: `${executionTime}ms`
        });
      }

      // Extract stdout and stderr from the error
      const stdout = execError.stdout || '';
      const stderr = execError.stderr || execError.message;

      return res.status(200).json({
        success: false,
        output: stdout,
        stderr: stderr,
        error: 'Compilation or runtime error occurred',
        language: lang,
        executionTime: `${executionTime}ms`,
        timestamp: new Date().toISOString()
      });
    }

  } catch (err) {
    console.error('Compilation API error:', err);
    res.status(500).json({
      error: 'Internal server error during code compilation',
      success: false,
      details: err.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    // Always release the semaphore
    compilationSemaphore.release();
  }
});

/* GET supported languages - Enhanced with more details */
router.get('/compile/languages', function(req, res, next) {
  const supportedLanguages = [
    { 
      name: 'Python', 
      key: 'python', 
      extensions: ['.py'],
      version: '3.x',
      description: 'Python programming language'
    },
    { 
      name: 'JavaScript', 
      key: 'javascript', 
      extensions: ['.js'],
      version: 'Node.js',
      description: 'JavaScript runtime environment'
    },
    { 
      name: 'Java', 
      key: 'java', 
      extensions: ['.java'],
      version: 'JDK 11+',
      description: 'Java programming language'
    },
    { 
      name: 'C++', 
      key: 'cpp', 
      extensions: ['.cpp'],
      version: 'GCC',
      description: 'C++ programming language'
    },
    { 
      name: 'C', 
      key: 'c', 
      extensions: ['.c'],
      version: 'GCC',
      description: 'C programming language'
    },
    { 
      name: 'Go', 
      key: 'go', 
      extensions: ['.go'],
      version: '1.x',
      description: 'Go programming language'
    },
    { 
      name: 'Ruby', 
      key: 'ruby', 
      extensions: ['.rb'],
      version: '2.x+',
      description: 'Ruby programming language'
    },
    { 
      name: 'PHP', 
      key: 'php', 
      extensions: ['.php'],
      version: '7.x+',
      description: 'PHP scripting language'
    }
  ];

  res.status(200).json({
    success: true,
    data: {
      languages: supportedLanguages,
      totalLanguages: supportedLanguages.length,
      concurrentCompilationLimit: compilationSemaphore.max,
      currentActiveCompilations: compilationSemaphore.current
    },
    timestamp: new Date().toISOString()
  });
});

/* GET compilation stats endpoint */
router.get('/compile/stats', function(req, res, next) {
  res.status(200).json({
    success: true,
    data: {
      maxConcurrentCompilations: compilationSemaphore.max,
      currentActiveCompilations: compilationSemaphore.current,
      queuedCompilations: compilationSemaphore.queue.length,
      availableSlots: compilationSemaphore.max - compilationSemaphore.current
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;