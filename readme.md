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