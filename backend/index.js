import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { exec } from "child_process";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Or your frontend domain
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

// Create temp directory if it doesn't exist
const tempDir = path.join(process.cwd(), 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Code execution function
const executeCode = (code, language, callback) => {
  const fileId = uuidv4();
  let fileName, command;

  try {
    switch (language) {
      case 'javascript':
        fileName = `${fileId}.js`;
        fs.writeFileSync(path.join(tempDir, fileName), code);
        command = `node ${path.join(tempDir, fileName)}`;
        break;

      case 'python':
        fileName = `${fileId}.py`;
        fs.writeFileSync(path.join(tempDir, fileName), code);
        command = `python3 ${path.join(tempDir, fileName)}`;
        break;

      case 'java':
        fileName = `${fileId}.java`;
        // Extract class name from code or use default
        const classMatch = code.match(/public\s+class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : 'Main';
        const javaCode = classMatch ? code : `public class Main {\n${code}\n}`;

        fs.writeFileSync(path.join(tempDir, `${className}.java`), javaCode);
        command = `cd ${tempDir} && javac ${className}.java && java ${className}`;
        break;

      case 'cpp':
        fileName = `${fileId}.cpp`;
        fs.writeFileSync(path.join(tempDir, fileName), code);
        const executableName = `${fileId}`;
        command = `cd ${tempDir} && g++ ${fileName} -o ${executableName} && ./${executableName}`;
        break;

      default:
        return callback({ error: 'Unsupported language' });
    }

    // Execute with timeout
    const childProcess = exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
      // Cleanup files
      try {
        if (language === 'java') {
          const classMatch = code.match(/public\s+class\s+(\w+)/);
          const className = classMatch ? classMatch[1] : 'Main';
          fs.unlinkSync(path.join(tempDir, `${className}.java`));
          if (fs.existsSync(path.join(tempDir, `${className}.class`))) {
            fs.unlinkSync(path.join(tempDir, `${className}.class`));
          }
        } else if (language === 'cpp') {
          fs.unlinkSync(path.join(tempDir, fileName));
          if (fs.existsSync(path.join(tempDir, fileId))) {
            fs.unlinkSync(path.join(tempDir, fileId));
          }
        } else {
          fs.unlinkSync(path.join(tempDir, fileName));
        }
      } catch (cleanupError) {
        console.log('Cleanup error:', cleanupError.message);
      }

      if (error) {
        if (error.killed && error.signal === 'SIGTERM') {
          callback({ error: 'Code execution timed out (10 seconds limit)' });
        } else {
          callback({ error: stderr || error.message });
        }
      } else {
        callback({ output: stdout, error: stderr });
      }
    });

  } catch (err) {
    callback({ error: `File system error: ${err.message}` });
  }
};

io.on("connection", (socket) => {
  console.log("User Connected", socket.id);

  let currentRoom = null;
  let currentUser = null;

  // Handle joining a room
  socket.on("join", ({ roomId, userName }) => {
    if (currentRoom) {
      socket.leave(currentRoom);
      rooms.get(currentRoom).delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom).users));
    }

    currentRoom = roomId;
    currentUser = userName;

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Set(),
        code: "// start code here",
        language: "javascript"
      });
    }

    rooms.get(roomId).users.add(userName);

    // Emit the current code and language to the new user
    socket.emit("codeUpdate", rooms.get(roomId).code);
    socket.emit("languageUpdate", rooms.get(roomId).language);

    // Emit the updated user list to the room
    io.to(roomId).emit("userJoined", Array.from(rooms.get(roomId).users));
  });

  // Handle code changes from users
  socket.on("codeChange", ({ roomId, code }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).code = code;
      socket.to(roomId).emit("codeUpdate", code); // Don't emit back to sender
    }
  });

  // Handle user typing indication
  socket.on("typing", ({ roomId, userName }) => {
    socket.to(roomId).emit("userTyping", userName);
  });

  // Handle language change
  socket.on("languageChange", ({ roomId, language }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).language = language;
      io.to(roomId).emit("languageUpdate", language);
    }
  });

  // Handle code execution
  socket.on("runCode", ({ roomId, code, language }) => {
    console.log(`Running ${language} code for room ${roomId}`);

    // Notify all users in the room that code is being executed
    io.to(roomId).emit("codeRunning", { user: currentUser });

    executeCode(code, language, (result) => {
      // Send result to all users in the room
      io.to(roomId).emit("codeResult", {
        user: currentUser,
        output: result.output || '',
        error: result.error || '',
        timestamp: new Date().toLocaleTimeString()
      });
    });
  });

  // Handle leaving a room
  socket.on("leaveRoom", () => {
    if (currentRoom && currentUser) {
      rooms.get(currentRoom).users.delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom).users));

      socket.leave(currentRoom);
      currentRoom = null;
      currentUser = null;
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    if (currentRoom && currentUser) {
      rooms.get(currentRoom).users.delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom).users));
    }
    console.log("User Disconnected");
  });
});

const port = process.env.PORT || 5000;
const __dirname = path.resolve();

app.use(express.static(path.join(__dirname, "/frontend/dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});

server.listen(port, () => {
  console.log(`Server is working on port ${port}`);
});