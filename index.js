import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import expenseRoutes from "./routes/expenses.js";
import uploadRoutes from "./routes/upload.js";
import authMiddleware from "./middleware/auth.js";
import connectDB from "./utils/db.js";
import { firebaseApp } from "./utils/firebase.js";

console.log("✅ Server booting up...");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to DB
connectDB();

app.use((req, res, next) => {
  console.log("🌐 Incoming request:", req.method, req.originalUrl);
  next();
});

app.use((req, res, next) => {
  console.log("🔍 Middleware hit:", req.method, req.path);
  next();
});

// Routes
app.use("/api/expenses", authMiddleware, expenseRoutes);
app.use("/api/upload", authMiddleware, uploadRoutes);

// Root route
app.get("/", (req, res) => {
  res.send("HSA Tracker API with Firebase Auth is running...");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});