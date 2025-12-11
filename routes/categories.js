// hsa-tracker-api/routes/categories.js
import express from "express";
import { pool } from "../utils/db.js";

const router = express.Router();

// GET /api/categories - list global, active categories
router.get("/", async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT id, name, display_order, created_at
        FROM expense_categories
        ORDER BY display_order NULLS LAST, name
      `
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

export default router;