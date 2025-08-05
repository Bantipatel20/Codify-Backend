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

- `GET /users` — List all users
- `GET /user/:id` — Get user by ID
- `POST /user` — Create a new user
- `PUT /user/:id` — Update user by ID
- `DELETE /user/:id` — Delete user by ID

### Code Compilation

- `POST /compile`
  - Body: `{ code: "...", lang: "python|javascript|java|cpp|c|go|ruby|php", input: "..." }`
  - Returns: Output, errors, execution time, etc.

- `GET /compile/languages`
  - Lists supported languages

## File Descriptions

- [`app.js`](app.js): Main Express app, sets up middleware and routes.
- [`bin/www`](bin/www): HTTP server bootstrap.
- [`models/Users.js`](models/Users.js): Mongoose User schema.
- [`routes/index.js`](routes/index.js): Main API routes (users, compile).
- [`routes/users.js`](routes/users.js): Example users route.
- [`views/`](views/): EJS templates for web pages.
- [`public/stylesheets/style.css`](public/stylesheets/style.css): Basic CSS.
- [`install-languages.sh`](install-languages.sh): Installs and configures all supported languages.
