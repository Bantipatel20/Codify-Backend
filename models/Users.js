const mongoose = require('mongoose'); // Corrected 'moongoose' to 'mongoose'
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    name: {
        type: String,
        required: true // Ensure the name is required
    },
    email: {
        type: String,
        required: true,
        unique: true // Ensure email is unique
    },
    password: {
        type: String,
        required: true // Ensure the password is required
    },

    createdAt: {
        type: Date,
        default: Date.now // Automatically set the date when user is created
    }
});

module.exports = mongoose.model('User', UserSchema); // Export the User model
