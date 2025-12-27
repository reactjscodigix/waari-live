require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const db = require("./db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);

console.log('🔍 Loaded from .env:');
console.log('DB_HOST =', JSON.stringify(process.env.DB_HOST));
console.log('DB_PORT =', JSON.stringify(process.env.DB_PORT));
console.log('DB_USER =', JSON.stringify(process.env.DB_USER));
console.log('DB_PASS =', JSON.stringify(process.env.DB_PASS)); // temporarily ok for debug
console.log('DB_NAME =', JSON.stringify(process.env.DB_NAME));

// ✅ Socket.io with CORS
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ✅ Middleware
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
// Serve static uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/pdfs", express.static(path.join(__dirname, "src/public/pdfs")));

// ✅ JWT Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET || "supersecret", (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = decoded;
    next();
  });
};

// ✅ Role Middleware
const requireRole = (roleId) => (req, res, next) => {
  if (req.user.roleId !== roleId) {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
};

// ===== Default Test Route =====
app.get("/", (req, res) => {
  res.send("Hello from Node.js + Socket.io + MySQL");
});

// ===== MySQL Test Route =====
// app.get('/api/users', (req, res) => {
//   db.query('SELECT * FROM users', (err, results) => {
//     if (err) return res.status(500).json({ error: err.message });
//     res.json(results);
//   });
// });

// ===== Login API (Secure with bcrypt) =====
// app.post('/api/login', (req, res) => {
//   const { email, password } = req.body;
//   if (!email || !password) {
//     return res.status(400).json({ error: 'Email and password are required' });
//   }

//   const query = 'SELECT * FROM users WHERE email = ?';
//   db.query(query, [email], async (err, results) => {
//     if (err) return res.status(500).json({ error: err.message });

//     const user = results[0];
//     if (!user) {
//       return res.status(401).json({ error: 'Invalid email or password' });
//     }

//     const match = await bcrypt.compare(password, user.password);
//     if (!match) {
//       return res.status(401).json({ error: 'Invalid email or password' });
//     }

//     const token = jwt.sign(
//       { id: user.id, email: user.email, roleId: user.roleId },
//       process.env.JWT_SECRET || 'supersecret'
//     );

//     res.json({
//       message: 'Login successful',
//       token,
//       permissions: user.permissions ? JSON.parse(user.permissions) : [],
//       roleId: user.roleId || null,
//       userId: user.id
//     });
//   });
// });

// ===== Protected Route Example =====
// app.get('/api/admin/dashboard', verifyToken, requireRole(1), (req, res) => {
//   res.json({ message: 'Welcome Admin', user: req.user });
// });

// ===== Operation Routes =====
const authRoutes = require("./src/routes/AuthRoute");
const userRoute = require("./src/routes/user.routes");
app.use("/api", userRoute);
app.use("/api", authRoutes);
const operationRoutes = require("./src/routes/operationRoutes");
app.use("/api/operations", operationRoutes);

const roleRoutes = require("./src/routes/roleRoutes");
app.use("/api/role", roleRoutes);
const userRoutes = require("./src/routes/userRoute");
app.use("/api/user", userRoutes);
const billRoutes = require("./src/routes/billRoute");
app.use("/api/billing", billRoutes);

const groupTourRoutes = require("./src/routes/groupTourRoute");
app.use("/api", groupTourRoutes);
const GTourRoute = require("./src/routes/GTourRoute");
app.use("/api", GTourRoute);
const roleRoute = require("./src/routes/roleRoute");
app.use("/api", roleRoute);

const adminRoutes = require("./src/routes/admin");
app.use("/api", adminRoutes);
const AddTourRoutes = require("./src/routes/AddTour");
app.use("/api", AddTourRoutes);
const enqueriesRoutes = require("./src/routes/EnqueriesRoutes");
app.use("/api", enqueriesRoutes);
const aiRoutes = require("./src/routes/aiRoutes");
app.use("/api/ai", aiRoutes);

// PDF Routes
const pdfRoutes = require("./src/routes/pdfRoutes");
app.use("/api", pdfRoutes);
const couponRoutes = require("./src/routes/coupon");
app.use("/api", couponRoutes);

// const cityListRoutes = require("./src/routes/cityList");
// app.use("/api/city-list", cityListRoutes.cityList)
// const groupTourRoutes = require("./src/routes/groupTourRoute");
// app.use("/api/group-tour", groupTourRoutes);
//  const adminRoutes = require("./src/routes/admin");
// // const couponRoute = require("./src/routes/coupon");
// app.use("/admin", adminRoutes);
// app.use("/coupons", couponRoute);

// ===== Socket.io Connection with Auth =====
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Unauthorized"));

  jwt.verify(token, process.env.JWT_SECRET || "supersecret", (err, decoded) => {
    if (err) return next(new Error("Invalid token"));
    socket.user = decoded;
    next();
  });
});

io.on("connection", (socket) => {
  console.log("🟢 A user connected:", socket.user?.email || "Unknown");
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected");
  });
});

// ===== Serve Frontend in Production =====
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "client", "dist")));
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
  });
}

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

