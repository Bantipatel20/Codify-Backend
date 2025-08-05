var express = require('express');
var router = express.Router();
const User = require('../models/users');

/* GET all users. */
router.get('/users', async function(req, res, next) {
  try {
    const users = await User.find(); // Retrieve all users from the database
    res.render('users', { users }); // Render the users view with the users data
  } catch (err) {
    next(err); // Pass any errors to the error handler
  }
});

/* DELETE a user by ID. */
router.delete('/user/:id', async function(req, res, next) {
  try {
    const userId = req.params.id;
    await User.findByIdAndDelete(userId); // Delete the user by ID
    res.status(204).send(); // Send a No Content response
  } catch (err) {
    next(err); // Pass any errors to the error handler
  }
});

/* POST a new user. */
router.post('/user', async function(req, res, next) {
  try {
    const newUser = new User(req.body); // Create a new user instance with the request body
    await newUser.save(); // Save the new user to the database
    res.status(201).redirect('/users'); // Redirect to the users page after creation
  } catch (err) {
    next(err); // Pass any errors to the error handler
  }
});

module.exports = router;
