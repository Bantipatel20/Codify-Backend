const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Judge0 API config
const JUDGE0_API_URL = 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_API_HEADERS = {
  'Content-Type': 'application/json',
  'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
  'X-RapidAPI-Key': 'b5aeb7cb84mshd850137f2a2e47bp192d2fjsn64906d3777f6' // 🔐 Replace with your key
};

// Delay utility
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =============================
// 🟢 API: /api/run
// =============================
app.post('/api/run', async (req, res) => {
  const { code, testCase } = req.body;

  try {
    const stdin = `${testCase.nums.length}\n${testCase.nums.join(' ')}\n${testCase.target}`;

    // Step 1: Create submission
    const submissionRes = await axios.post(`${JUDGE0_API_URL}/submissions?base64_encoded=false&wait=false`, {
      source_code: code,
      language_id: 54, // ✅ C++ (GCC 9.2.0)
      stdin
    }, {
      headers: JUDGE0_API_HEADERS
    });

    const token = submissionRes.data.token;

    // Step 2: Poll until done
    let result = null;
    for (let i = 0; i < 10; i++) {
      await delay(1000); // Wait 1 second
      const resPoll = await axios.get(`${JUDGE0_API_URL}/submissions/${token}?base64_encoded=false`, {
        headers: JUDGE0_API_HEADERS
      });
      if (resPoll.data.status.id >= 3) {
        result = resPoll.data;
        break;
      }
    }

    if (!result) {
      return res.status(408).json({ error: 'Timeout while waiting for Judge0 response.' });
    }

    // Step 3: Handle result
    if (result.stderr) {
      return res.status(400).json({ error: result.stderr });
    } else if (result.compile_output) {
      return res.status(400).json({ error: result.compile_output });
    }

    return res.json({ output: result.stdout });
  } catch (err) {
    console.error('Execution error:', err.message);
    return res.status(500).json({ error: 'Internal server error while running code.' });
  }
});

// =============================
// ✅ API: /api/submit
// =============================
app.post('/api/submit', (req, res) => {
  const { code, problemId } = req.body;
  console.log(`Code submitted for problem ${problemId}:`);
  console.log(code);
  res.json({ status: 'Submission received successfully!' });
});

// =============================
// 🟢 Start Server
// =============================
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
