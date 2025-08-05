const mongoose = require('mongoose'); // Corrected 'moongoose' to 'mongoose'
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    username: {
        type: String,
        required: true, // Ensure the name is required
        unique: true 
    }, 
    student_id: {
        type: String,
        required: true,
        unique: true // Ensure email is unique
    },   
    name: {
        type: String,
        required: true,
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
    department: {
        type: String,
        required: true // Ensure the password is required
    },
    batch: {
        type: String,
        required: true // Ensure the password is required
    },
    div: {
        type: String,
        required: true // Ensure the password is required
    },
    createdAt: {
        type: Date,
        default: Date.now // Automatically set the date when user is created
    }
});

module.exports = mongoose.model('User', UserSchema); // Export the User model
