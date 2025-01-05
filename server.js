const express = require("express");
const path = require("path");
const socketIO = require("socket.io");

const app = express();
const server = require("http").createServer(app);
const io = socketIO(server);

// Store active users and their information
const activeUsers = new Map();
// Store chat history (in a real application, this would be in a database)
const messageHistory = [];
const MAX_HISTORY = 100; // Keep last 100 messages

// Middleware configuration
app.use(express.static(path.join(__dirname, "/public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper function to store messages
function storeMessage(type, data) {
    const messageData = {
        type,
        ...data,
        timestamp: new Date().toISOString()
    };
    messageHistory.push(messageData);
    if (messageHistory.length > MAX_HISTORY) {
        messageHistory.shift(); // Remove oldest message
    }
    return messageData;
}

io.on("connection", function(socket) {
    // Handle new user joining the chat
    socket.on("newuser", function(username) {
        // Store user information with online status
        activeUsers.set(socket.id, {
            username,
            lastActive: new Date(),
            isTyping: false,
            status: 'online'
        });

        // Send message history to new user
        socket.emit("history", messageHistory);

        // Send current active users list
        io.emit("activeUsers", Array.from(activeUsers.values()).map(user => ({
            username: user.username,
            status: user.status
        })));

        // Store and broadcast join message
        const joinMessage = storeMessage("join", {
            username,
            message: `${username} has joined the chat`
        });
        socket.broadcast.emit("update", joinMessage);
    });

    // Handle user disconnection
    socket.on("disconnect", function() {
        const user = activeUsers.get(socket.id);
        if (user) {
            user.status = 'offline';
            // Store and broadcast leave message
            const leaveMessage = storeMessage("leave", {
                username: user.username,
                message: `${user.username} has left the chat`
            });
            socket.broadcast.emit("update", leaveMessage);
            activeUsers.delete(socket.id);
            
            // Update active users list
            io.emit("activeUsers", Array.from(activeUsers.values()).map(user => ({
                username: user.username,
                status: user.status
            })));
        }
    });

    // Handle chat messages
    socket.on("chat", function({ username, message }) {
        const messageData = storeMessage("message", { username, message });
        socket.broadcast.emit("chat", messageData);
    });

    // Handle user status change
    socket.on("statusChange", function(status) {
        const user = activeUsers.get(socket.id);
        if (user) {
            user.status = status;
            activeUsers.set(socket.id, user);
            io.emit("activeUsers", Array.from(activeUsers.values()).map(user => ({
                username: user.username,
                status: user.status
            })));
        }
    });
});

// Server initialization
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});