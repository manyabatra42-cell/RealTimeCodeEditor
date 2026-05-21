import { useEffect, useState } from "react";
import io from "socket.io-client";
import Editor from "@monaco-editor/react";
import "./App.css";

// const socket = io("https://realtimecodeseditor.onrender.com");

// const socket = io("https://realtimecode-backend.up.railway.app");
const socket = io("https://realtimecodeeditor-production-c891.up.railway.app");



const App = () => {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("// start code here");
  const [copySuccess, setCopySuccess] = useState("");
  const [users, setUsers] = useState([]);
  const [typing, setTyping] = useState("");
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [runningUser, setRunningUser] = useState("");

  // Default code templates for each language
  const defaultCode = {
    javascript: `// JavaScript
console.log("Hello, World!");

// Example function
function greet(name) {
    return \`Hello, \${name}!\`;
}

console.log(greet("JavaScript"));

// Try different examples:
// 1. Variables and data types
let number = 42;
let text = "Learning JavaScript";
let isActive = true;
console.log("Number:", number, "Text:", text, "Active:", isActive);

// 2. Arrays and loops
let fruits = ["apple", "banana", "orange"];
for (let fruit of fruits) {
    console.log("Fruit:", fruit);
}`,

    python: `# Python
print("Hello, World!")

# Example function
def greet(name):
    return f"Hello, {name}!"

print(greet("Python"))

# Try different examples:
# 1. Variables and data types
number = 42
text = "Learning Python"
is_active = True
print(f"Number: {number}, Text: {text}, Active: {is_active}")

# 2. Lists and loops
fruits = ["apple", "banana", "orange"]
for fruit in fruits:
    print(f"Fruit: {fruit}")

# 3. Simple calculation
def calculate_area(radius):
    return 3.14159 * radius * radius

radius = 5
area = calculate_area(radius)
print(f"Area of circle with radius {radius}: {area}")`,

    java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        // Example method
        System.out.println(greet("Java"));
        
        // Try different examples:
        // 1. Variables and data types
        int number = 42;
        String text = "Learning Java";
        boolean isActive = true;
        System.out.println("Number: " + number + ", Text: " + text + ", Active: " + isActive);
        
        // 2. Arrays and loops
        String[] fruits = {"apple", "banana", "orange"};
        for (String fruit : fruits) {
            System.out.println("Fruit: " + fruit);
        }
        
        // 3. Simple calculation
        double radius = 5.0;
        double area = calculateArea(radius);
        System.out.println("Area of circle with radius " + radius + ": " + area);
    }
    
    public static String greet(String name) {
        return "Hello, " + name + "!";
    }
    
    public static double calculateArea(double radius) {
        return 3.14159 * radius * radius;
    }
}`,

    cpp: `#include <iostream>
#include <string>
#include <vector>
using namespace std;

// Example function
string greet(string name) {
    return "Hello, " + name + "!";
}

// Calculate area function
double calculateArea(double radius) {
    return 3.14159 * radius * radius;
}

int main() {
    cout << "Hello, World!" << endl;
    cout << greet("C++") << endl;
    
    // Try different examples:
    // 1. Variables and data types
    int number = 42;
    string text = "Learning C++";
    bool isActive = true;
    cout << "Number: " << number << ", Text: " << text << ", Active: " << isActive << endl;
    
    // 2. Vectors and loops
    vector<string> fruits = {"apple", "banana", "orange"};
    for (const string& fruit : fruits) {
        cout << "Fruit: " << fruit << endl;
    }
    
    // 3. Simple calculation
    double radius = 5.0;
    double area = calculateArea(radius);
    cout << "Area of circle with radius " << radius << ": " << area << endl;
    
    return 0;
}`
  };

  useEffect(() => {
    socket.on("userJoined", (users) => {
      setUsers(users);
    });

    socket.on("codeUpdate", (newCode) => {
      setCode(newCode);
    });

    socket.on("userTyping", (user) => {
      setTyping(`${user.slice(0, 8)}... is Typing`);
      setTimeout(() => setTyping(""), 2000);
    });

    socket.on("languageUpdate", (newLanguage) => {
      setLanguage(newLanguage);
    });

    socket.on("codeRunning", ({ user }) => {
      setIsRunning(true);
      setRunningUser(user);
      setOutput("🚀 Running code...");
    });

    socket.on("codeResult", ({ user, output, error, timestamp }) => {
      setIsRunning(false);
      setRunningUser("");

      let result = `[${timestamp}] Code executed by ${user}:\n`;
      result += "─".repeat(50) + "\n";

      if (error) {
        result += `❌ ERROR:\n${error}`;
      } else if (output) {
        result += `✅ OUTPUT:\n${output}`;
      } else {
        result += `✅ Code executed successfully (no output)`;
      }

      result += "\n" + "─".repeat(50);
      setOutput(result);
    });

    return () => {
      socket.off("userJoined");
      socket.off("codeUpdate");
      socket.off("userTyping");
      socket.off("languageUpdate");
      socket.off("codeRunning");
      socket.off("codeResult");
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      socket.emit("leaveRoom");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const joinRoom = () => {
    if (roomId && userName) {
      socket.emit("join", { roomId, userName });
      setJoined(true);
    }
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom");
    setJoined(false);
    setRoomId("");
    setUserName("");
    setCode("// start code here");
    setLanguage("javascript");
    setOutput("");
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopySuccess("Copied!");
    setTimeout(() => setCopySuccess(""), 2000);
  };

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    socket.emit("codeChange", { roomId, code: newCode });
    socket.emit("typing", { roomId, userName });
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);

    // Set default code for the selected language
    const newCode = defaultCode[newLanguage];
    setCode(newCode);

    socket.emit("languageChange", { roomId, language: newLanguage });
    socket.emit("codeChange", { roomId, code: newCode });
  };

  const runCode = () => {
    if (!code.trim()) {
      setOutput("❌ Error: No code to run!");
      return;
    }

    socket.emit("runCode", { roomId, code, language });
  };

  const clearOutput = () => {
    setOutput("");
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      joinRoom();
    }
  };

  if (!joined) {
    return (
      <>
        <div className="project-info">
          <h1>RealTimeCodeEditor</h1>
        </div>
        <div className="join-container">
          <div className="join-form">
            <h1>Join Code Room</h1>
            <input
              type="text"
              placeholder="Room Id"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <input
              type="text"
              placeholder="Your Name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <button onClick={joinRoom} disabled={!roomId || !userName}>
              Join Room
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="editor-container">
      <div className="sidebar">
        <div>
          <div className="room-info">
            <h2>Code Room: {roomId}</h2>
            <button onClick={copyRoomId} className="copy-button">
              Copy Id
            </button>
            {copySuccess && <span className="copy-success">{copySuccess}</span>}
          </div>

          <h3>Users in Room ({users.length}):</h3>
          <ul>
            {users.map((user, index) => (
              <li key={index} title={user}>
                {user.length > 12 ? `${user.slice(0, 12)}...` : user}
              </li>
            ))}
          </ul>
          <p className="typing-indicator">{typing}</p>

          <select
            className="language-selector"
            value={language}
            onChange={handleLanguageChange}
          >
            <option value="javascript">JavaScript (Node.js)</option>
            <option value="python">Python 3</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
          </select>

          {/* Run Code Section */}
          <div className="run-section">
            <div className="run-buttons">
              <button
                onClick={runCode}
                disabled={isRunning}
                className={`run-button ${isRunning ? 'running' : ''}`}
                title={isRunning ? 'Code is running...' : 'Run the current code'}
              >
                {isRunning ? '⏳ Running...' : '▶ Run Code'}
              </button>
              <button
                onClick={clearOutput}
                className="clear-button"
                title="Clear output"
              >
                🗑️ Clear
              </button>
            </div>

            {/* Output Section */}
            <div className="output-section">
              <h3>Output:</h3>
              <div className="output-container">
                {isRunning && (
                  <div className="running-indicator">
                    🚀 {runningUser} is running code...
                  </div>
                )}
                <pre className={output ? '' : 'output-empty'}>
                  {output || "No output yet. Click 'Run Code' to execute your program."}
                </pre>
              </div>
            </div>
          </div>
        </div>

        <button className="leave-button" onClick={leaveRoom}>
          Leave Room
        </button>
      </div>

      <div className="editor-wrapper">
        <div className="editor-status">
          <span>📝 Editing in {language}</span>
          <span style={{ float: 'right' }}>
            👥 {users.length} user{users.length !== 1 ? 's' : ''} connected
          </span>
        </div>

        <Editor
          height={"calc(100vh - 140px)"}
          defaultLanguage={language}
          language={language}
          value={code}
          onChange={handleCodeChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            lineNumbers: 'on',
            roundedSelection: false,
            scrollbar: {
              vertical: 'visible',
              horizontal: 'visible'
            },
            suggest: {
              showKeywords: true,
              showSnippets: true
            }
          }}
        />
      </div>
    </div>
  );
};

export default App;