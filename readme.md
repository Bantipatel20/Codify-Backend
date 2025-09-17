# Codify Backend

A backend server for code compilation and user management, supporting multiple programming languages and user CRUD operations.

## Project Structure

```
.
├── app.js
├── bin/
│   └── www
├── install-languages.sh
├── models/
│   └── Users.js
├── package.json
├── public/
│   ├── images/
│   ├── javascripts/
│   └── stylesheets/
│       └── style.css
├── routes/
│   ├── index.js
│   └── users.js
└── views/
    ├── error.ejs
    └── index.ejs
```

## Features

- **User Management**: Create, read, update, and delete users (MongoDB).
- **Code Compilation API**: Compile and execute code in Python, JavaScript, Java, C, C++, Go, Ruby, and PHP.
- **RESTful API**: Endpoints for users and code compilation.
- **EJS Views**: Basic web pages for home and error display.
- **Language Installer**: Bash script to install all supported languages and configure environment.

## Setup

### Prerequisites

- Node.js & npm
- MongoDB (running at `mongodb://localhost:27017/codify`)
- Bash (for running the install script)

### Install Dependencies

```sh
npm install
```

### Install Programming Languages

Run the provided script (Ubuntu/Debian):

```sh
chmod +x install-languages.sh
./install-languages.sh
```

### Start the Server

```sh
npm start
```

The server runs on [http://localhost:5000](http://localhost:5000) by default.

## API Endpoints

### User Endpoints

- `GET /users`
  - List users with pagination and filtering.
  - Query params: `page`, `limit`, `name`, `email`
  - Returns: user list (without passwords), pagination info.

- `GET /user/:id`
  - Get a user by MongoDB ObjectId.
  - Returns: user data (without password).

- `POST /user`
  - Create a new user.
  - Body: All required user fields except `createdAt`.
  - Returns: created user (without password).
  - Handles duplicate email and validation errors.

- `PUT /user/:id`
  - Update user fields (except password).
  - Body: Fields to update.
  - Returns: updated user (without password).
  - Handles duplicate email and validation errors.

- `DELETE /user/:id`
  - Delete a user by ID.
  - Returns: deleted user ID.

### Code Compilation Endpoints

- `POST /compile`
  - Compile and execute code in supported languages.
  - Body: `{ code: "...", lang: "python|javascript|java|cpp|c|go|ruby|php", input: "..." }`
  - Returns: output, stderr, language, execution time, timestamp.
  - Handles timeouts, compilation/runtime errors, and concurrency limits.

- `GET /compile/languages`
  - Lists supported languages with details (name, key, extensions, version, description).

- `GET /compile/stats`
  - Returns current compilation concurrency stats.

### Pagination & Filtering Example

```
GET /users?page=2&limit=5&name=John&email=gmail
```


### Contest Endpoints:
- POST /api/contests - Create new contest
- POST /api/contests/:id/register - Register participant
- POST /api/contests/:id/status - Update contest status
- GET /api/contests - Get all contests with pagination and filtering
- GET /api/contests/:id - Get contest by ID
- GET /api/contests/:id/leaderboard - Get contest leaderboard
- GET /api/contests/status/:status - Get contests by status
- GET /api/contests/filter/upcoming - Get upcoming contests
- GET /api/contests/filter/active - Get active contests
- GET /api/contests/:id/analytics - Get contest analytics
- PUT /api/contests/:id - Update contest
- DELETE /api/contests/:id - Delete contest (soft delete)


### Problem Endpoints:

- POST /api/problems - Create new problem
- POST /api/problems/:id/test - Test solution against problem
- GET /api/problems - Get all problems with pagination and filtering
- GET /api/problems/:id - Get problem by ID
- GET /api/problems/difficulty/:difficulty - Get problems by difficulty
- GET /api/problems/tags/:tag - Get problems by tag
- GET /api/problems/meta/tags - Get all unique tags
- GET /api/problems/meta/statistics - Get problem statistics
- PUT /api/problems/:id - Update problem
- DELETE /api/problems/:id - Delete problem (soft delete)

## Submission API Endpoints

### Submit Code

- **POST** `/api/submissions/submit`
  - **Body:** `{ userId, problemId, contestId (optional), code, language }`
  - **Returns:** `{ success, message, submissionId, status, totalTestCases }`
  - Queues submission for evaluation and returns immediately.

### Get Submission Status

- **GET** `/api/submissions/submission/:id`
  - **Returns:** Submission details, including test case results and evaluation status.

### Get User Submissions

- **GET** `/api/submissions/user/:userId/submissions?page=1&limit=20&status=accepted&problemId=...&contestId=...`
  - **Returns:** Paginated list of submissions for a user (code omitted for privacy).

### Get Problem Submissions

- **GET** `/api/submissions/problem/:problemId/submissions?page=1&limit=20&status=accepted`
  - **Returns:** Paginated list of public submissions for a problem.

### Get Submission Statistics

- **GET** `/api/submissions/stats/submissions`
  - **Returns:**  
    - `total`: Total submissions  
    - `accepted`: Accepted submissions  
    - `acceptanceRate`: Percentage accepted  
    - `languageDistribution`: Submissions per language  
    - `statusDistribution`: Submissions per status  
    - `activeEvaluations`: Currently running evaluations  
    - `queuedEvaluations`: Submissions waiting in queue

---

See [`models/Submission.js`](models/Submission.js) and [`routes/submissions.js`](routes/submissions.js) for implementation details.




### AutoSave API Endpoints

#### Save Code (Auto-Save)
- **POST** `/api/autosave/save`
  - **Body:** `{ userId, problemId, contestId (optional), code, language, metadata (optional) }`
  - **Returns:** `{ success, message, autoSaveId, lastSavedAt, codeLength }`
  - Creates or updates an auto-save for the user/problem/contest.

#### Get Restore Options
- **GET** `/api/autosave/restore-options/:userId/:problemId?contestId=...`
  - **Returns:**  
    - `hasAutoSave`: Boolean  
    - `hasLatestSubmission`: Boolean  
    - `autoSave`: Latest auto-save info  
    - `latestSubmission`: Latest submission info  
    - `recommendations`: Array of suggestions (e.g., "continue from auto-save", "review last submission", "start fresh")

#### Load Auto-Saved Code
- **GET** `/api/autosave/load/:userId/:problemId?contestId=...`
  - **Returns:** `{ code, language, lastSavedAt, metadata }`
  - Loads the latest active auto-save for the user/problem/contest.

#### Load Latest Submission Code
- **GET** `/api/autosave/submission/:userId/:problemId?contestId=...`
  - **Returns:** `{ code, language, status, score, submittedAt, passedTestCases, totalTestCases }`
  - Loads the code from the user's latest submission for the problem.

#### Clear Auto-Saved Code
- **DELETE** `/api/autosave/clear/:userId/:problemId?contestId=...`
  - **Returns:** `{ success, message }`
  - Marks the auto-save as inactive (soft delete).

#### List User's Auto-Saves
- **GET** `/api/autosave/user/:userId?page=1&limit=20`
  - **Returns:** Paginated list of user's active auto-saves (without full code), with problem and contest titles.

#### Cleanup Old Auto-Saves
- **POST** `/api/autosave/cleanup`
  - **Returns:** `{ success, message, deletedCount }`
  - Removes old/inactive auto-saves (also runs daily via scheduled task).

#### Auto-Save Statistics
- **GET** `/api/autosave/stats/overview`
  - **Returns:**  
    - `total`: Total auto-saves  
    - `active`: Active auto-saves  
    - `recentlyActive`: Auto-saves in last 24h  
    - `languageDistribution`: Array of `{ language, count }`

---

### Scheduled Tasks

- Old/inactive auto-saves are cleaned up daily at 2 AM via a scheduled cron job (`utils/scheduledTasks.js`).

---

See [`models/AutoSave.js`](models/AutoSave.js) and [`routes/autosave.js`](routes/autosave.js) for implementation details.


### Error Handling

- All endpoints return `success: false` and an `error` message on failure.
- Validation and duplicate errors are handled with appropriate HTTP status codes.

---

See [`routes/index.js`](routes/index.js) for implementation details.

## User Model

The `User` schema defines the structure for user documents in MongoDB:

| Field      | Type   | Required | Unique | Description                        |
|------------|--------|----------|--------|------------------------------------|
| username   | String | Yes      | Yes    | Username for login                 |
| student_id | String | Yes      | Yes    | Unique student identifier          |
| name       | String | Yes      | No     | Full name                          |
| email      | String | Yes      | Yes    | User email (must be unique)        |
| password   | String | Yes      | No     | Hashed password                    |
| department | String | Yes      | No     | Department name                    |
| batch      | String | Yes      | No     | Batch/year                         |
| div        | String | Yes      | No     | Division                           |
| createdAt  | Date   | No       | No     | Creation timestamp (auto-set)      |

See [`models/Users.js`](models/Users.js) for implementation details.

## Problem Model

The `Problem` schema defines coding problems for the platform, including metadata, test cases, and statistics.

| Field                  | Type                | Required | Description                                                      |
|------------------------|---------------------|----------|------------------------------------------------------------------|
| title                  | String              | Yes      | Problem title (max 200 chars)                                    |
| description            | String              | Yes      | Detailed problem description (max 2000 chars)                    |
| difficulty             | String (enum)       | Yes      | Difficulty level: `Easy`, `Medium`, or `Hard` (default: `Easy`)  |
| testCases              | Array of objects    | Yes      | List of test cases (`input`, `output` required for each)         |
| createdBy              | ObjectId (User ref) | Yes      | Reference to the user who created the problem                    |
| isActive               | Boolean             | No       | Problem visibility (default: `true`)                             |
| tags                   | Array of String     | No       | Tags for categorization (lowercase, trimmed)                     |
| totalSubmissions       | Number              | No       | Total number of submissions (default: `0`)                       |
| successfulSubmissions  | Number              | No       | Number of successful submissions (default: `0`)                  |
| createdAt              | Date                | No       | Creation timestamp (auto-set)                                    |
| updatedAt              | Date                | No       | Last update timestamp (auto-set)                                 |
| successRate (virtual)  | String              | No       | Percentage of successful submissions (auto-calculated)           |



## Submission Model

The `Submission` schema tracks user code submissions, their evaluation status, and test case results.

| Field              | Type                      | Required | Description                                                      |
|--------------------|---------------------------|----------|------------------------------------------------------------------|
| userId             | ObjectId (User ref)       | Yes      | Reference to the submitting user                                 |
| problemId          | String/ObjectId           | Yes      | Problem ID (can be manual or DB problem)                         |
| contestId          | ObjectId (Contest ref)    | No       | Reference to contest (null for standalone)                       |
| code               | String                    | Yes      | Submitted code (max 50KB)                                        |
| language           | String (enum)             | Yes      | Language: python, javascript, java, cpp, c, go, ruby, php        |
| status             | String (enum)             | No       | Submission status: pending, running, accepted, wrong_answer, etc.|
| score              | Number                    | No       | Score for this submission (default: 0)                           |
| totalTestCases     | Number                    | Yes      | Number of test cases                                             |
| passedTestCases    | Number                    | No       | Number of passed test cases                                      |
| testCaseResults    | Array of objects          | No       | Results for each test case (see below)                           |
| compilationOutput  | String                    | No       | Compilation errors/warnings                                      |
| executionTime      | Number                    | No       | Total execution time (ms)                                        |
| memoryUsed         | Number                    | No       | Peak memory usage (bytes)                                        |
| submittedAt        | Date                      | No       | Submission timestamp                                             |
| evaluatedAt        | Date                      | No       | Evaluation timestamp                                             |
| isPublic           | Boolean                   | No       | Public visibility (default: true)                                |
| successRate (virtual) | String                 | No       | Percentage of passed test cases                                  |

**TestCaseResult Structure:**

| Field           | Type    | Description                                 |
|-----------------|---------|---------------------------------------------|
| testCaseIndex   | Number  | Index of the test case                      |
| input           | String  | Input for the test case                     |
| expectedOutput  | String  | Expected output                             |
| actualOutput    | String  | Actual output from code                     |
| status          | String  | passed, failed, error, timeout              |
| executionTime   | Number  | Execution time (ms)                         |
| memoryUsed      | Number  | Memory used (bytes)                         |
| errorMessage    | String  | Error message if any                        |

**Indexes:**  
- `{ userId, submittedAt }`, `{ problemId, status }`, `{ contestId, userId }`, `{ status, submittedAt }`

**Virtuals & Methods:**  
- `successRate`: Percentage of passed test cases  
- `isAccepted()`: Returns true if all test cases passed  
- `calculateScore(maxScore)`: Calculates partial score

---

### Test Case Structure

Each test case object contains:
- `input`: String (required)
- `output`: String (required)

### Indexes

- By `difficulty` and `isActive`
- By `createdBy`
- By `createdAt` (descending)

### Virtuals

- `successRate`: Returns the percentage of successful submissions.

See [`models/Problem.js`](models/Problem.js)


## Contest Model

The `Contest` schema defines coding contests, including problems, participants, rules, analytics, and settings.

| Field                   | Type                       | Required | Description                                                      |
|-------------------------|----------------------------|----------|------------------------------------------------------------------|
| title                   | String                     | Yes      | Contest title (max 200 chars)                                    |
| description             | String                     | Yes      | Contest description (max 1000 chars)                             |
| startDate               | Date                       | Yes      | Contest start date/time                                          |
| endDate                 | Date                       | Yes      | Contest end date/time (must be after start)                      |
| duration                | String                     | Yes      | Duration (e.g., "2h")                                            |
| status                  | String (enum)              | No       | `Upcoming`, `Active`, `Completed`, `Cancelled` (default: Upcoming)|
| rules                   | String                     | No       | Contest rules (max 2000 chars, default: Standard contest rules)  |
| maxParticipants         | Number                     | Yes      | Maximum allowed participants (default: 100)                      |
| problems                | Array of ContestProblem    | Yes      | Problems in contest (at least one required)                      |
| participants            | Array of ContestParticipant| No       | Registered participants                                          |
| participantSelection    | String (enum)              | No       | Selection mode: manual/department/semester/division/batch        |
| filterCriteria          | Object                     | No       | Criteria for participant filtering                               |
| totalPoints             | Number                     | No       | Total points for all problems                                    |
| createdBy               | ObjectId (User ref)        | Yes      | Reference to contest creator                                     |
| createdAt               | Date                       | No       | Creation timestamp                                               |
| updatedAt               | Date                       | No       | Last update timestamp                                            |
| analytics               | Object                     | No       | Contest statistics (submissions, scores, participation rate)     |
| settings                | Object                     | No       | Contest settings (late submission, leaderboard, freeze, etc.)    |
| isActive                | Boolean                    | No       | Contest visibility (default: true)                               |


## AutoSave Feature

The AutoSave API allows users to automatically save, restore, and manage their in-progress code for problems and contests. This helps prevent code loss and enables smooth recovery of work.

### AutoSave Model

| Field         | Type                | Required | Description                                      |
|---------------|---------------------|----------|--------------------------------------------------|
| userId        | ObjectId (User ref) | Yes      | Reference to the user                            |
| problemId     | String/ObjectId     | Yes      | Problem ID (can be manual or DB problem)         |
| contestId     | ObjectId (Contest)  | No       | Contest ID if code is for a contest problem      |
| code          | String              | Yes      | Auto-saved code                                  |
| language      | String              | Yes      | Programming language (lowercase)                 |
| metadata      | Object              | No       | Additional info (e.g., cursor position, theme)   |
| isActive      | Boolean             | No       | Whether this auto-save is active (default: true) |
| lastSavedAt   | Date                | No       | Last save timestamp (auto-set)                   |

**Indexes:**  
- `{ userId, problemId, contestId, isActive }`  
- `{ lastSavedAt }`

**Virtuals & Methods:**  
- `isRecent()`: Returns true if auto-save is recent (e.g., within 1 hour)
- `cleanupOld()`: Static method to remove old/inactive auto-saves

---


### ContestProblem Structure

- `problemId`: ObjectId (Problem ref), required
- `title`: String, required
- `difficulty`: String (enum), required
- `category`: String, required
- `points`: Number, required
- `order`: Number, optional
- `solvedCount`: Number, optional
- `attemptCount`: Number, optional

### ContestParticipant Structure

- `userId`: ObjectId (User ref), required
- `name`, `email`, `department`, `semester`, `division`, `batch`: required
- `score`, `submissions`: Number, default 0
- `problemsAttempted`: Array of objects (problemId, attempts, solved, score, lastAttemptTime)
- `registrationTime`, `lastActivityTime`: Date

### FilterCriteria Structure

- `department`, `semester`, `division`, `batch`: for filtering participants

### Analytics

- `totalSubmissions`, `successfulSubmissions`, `averageScore`, `participationRate`

### Settings

- `allowLateSubmission`, `showLeaderboard`, `showLeaderboardDuringContest`, `freezeLeaderboard`, `freezeTime`, `allowViewProblemsBeforeStart`, `penaltyPerWrongSubmission`

### Virtuals

- `durationInHours`: Contest duration in hours
- `successRate`: Percentage of successful submissions
- `activeParticipantsCount`: Number of participants with submissions

### Methods

- `isCurrentlyActive()`: Returns true if contest is active and within date range
- `getLeaderboard()`: Returns sorted leaderboard with ranks
- `addParticipant(user)`: Adds a user as participant (with checks)
- Static methods: `findByStatus`, `findUpcoming`, `findActive`

### Indexes

- By `status`, `startDate`, `createdBy`, `participants.userId`, `createdAt`, `startDate`, `endDate`

See [`models/Contest.js`](models/Contest.js)


## File Descriptions

- [`app.js`](app.js): Main Express app, sets up middleware and routes.
- [`bin/www`](bin/www): HTTP server bootstrap.
- [`models/Users.js`](models/Users.js): Mongoose User schema.
- [`routes/index.js`](routes/index.js): Main API routes (users, compile).
- [`routes/users.js`](routes/users.js): Example users route.
- [`views/`](views/): EJS templates for web pages.
- [`public/stylesheets/style.css`](public/stylesheets/style.css): Basic CSS.
- [`install-languages.sh`](install-languages.sh): Installs and configures all supported languages.


## Load Test Results

A load test was performed using `load_test.sh` with 100 concurrent requests to the `/compile` endpoint.

**Summary:**
- **Total requests:** 100
- **Target endpoint:** `http://localhost:5000/compile`
- **Concurrency:** 100

**Status Code Distribution:**
- `200 OK`: 100 requests (all successfully processed)
- `429 Too Many Requests`: 0 requests

**Response Time Statistics:**
- **Average:** 853.2 ms
- **Minimum:** 237 ms
- **Maximum:** 1456 ms

**Requests per second:** 100

**Notes:**
- The server successfully handled all requests without rate limiting, demonstrating improved concurrency handling.
- Raw results are saved to `/tmp/load_test_results.txt`.

---

This demonstrates the backend’s ability to handle high concurrency and process all code compilation requests