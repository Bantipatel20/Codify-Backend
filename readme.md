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
- `200 OK`: 50 requests (successfully processed)
- `429 Too Many Requests`: 50 requests (rate/concurrency limit reached)

**Response Time Statistics:**
- **Average:** 624.73 ms
- **Minimum:** 250 ms
- **Maximum:** 895 ms

**Requests per second:** 100

**Notes:**
- The server handled 50% of requests successfully and rate-limited the rest, indicating effective concurrency control.
- Raw results are saved to `/tmp/load_test_results.txt`.

---

This demonstrates the backend’s ability to handle high concurrency and enforce rate limits on code