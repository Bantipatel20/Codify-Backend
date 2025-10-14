const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true 
    }, 
    student_id: {
        type: String,
        required: function() { return this.role === 'Student'; },
        unique: function() { return this.role === 'Student'; }
    },   
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: function() { return this.role === 'Student'; }
    },
    batch: {
        type: String,
        required: function() { return this.role === 'Student'; }
    },
    div: {
        type: String,
        required: function() { return this.role === 'Student'; }
    },
    semester: {
        type: Number,
        required: function() { return this.role === 'Student'; },
        min: 1,
        max: 8
    },
    role: {
        type: String,
        required: true,
        enum: ['Admin', 'Student'],
        default: 'Student'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', UserSchema);
