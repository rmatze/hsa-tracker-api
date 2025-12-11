// hsa-tracker-api/routes/expenses.js
import express from "express";
import { pool } from "../utils/db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Helper: ensure a category exists and is not archived (global categories)
const validateCategoryExists = async (categoryId) => {
  if (!categoryId) {
    return false;
  }

  const { rowCount } = await pool.query(
    `
      SELECT 1
      FROM expense_categories
      WHERE id = $1
    `,
    [categoryId]
  );

  return rowCount > 0;
};

// Get all expenses for the logged-in user
// status query param controls archived filtering:
//   - status=active   (default) → only non-archived
//   - status=archived → only archived
//   - status=all      → both
router.get("/", async (req, res) => {
  const userId = req.user;
  const { categoryId, status } = req.query;
  const normalizedStatus = (status || "active").toLowerCase();

  try {
    let query = `
      SELECT
        e.*,
        c.name AS category_name
      FROM expenses e
      LEFT JOIN expense_categories c
        ON e.category_id = c.id
      WHERE e.user_id = $1
        AND ($2::uuid IS NULL OR e.category_id = $2)
    `;

    const values = [userId, categoryId || null];

    if (normalizedStatus === "archived") {
      query += `
        AND e.is_archived = TRUE
      `;
    } else if (normalizedStatus === "all") {
      // no extra filter
    } else {
      // default: active
      query += `
        AND (e.is_archived = FALSE OR e.is_archived IS NULL)
      `;
    }

    query += `
      ORDER BY e.date_paid DESC
    `;

    const result = await pool.query(query, values);

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch expenses:", error);
    res.status(500).json({ message: "Failed to fetch expenses" });
  }
});

// Add a new expense
router.post("/", async (req, res) => {
  const userId = req.user;
  const {
    amount,
    date_paid,
    payment_method,
    description,
    category_id,
  } = req.body;

  if (!amount || !date_paid || !payment_method) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    if (category_id) {
      const isValidCategory = await validateCategoryExists(category_id);
      if (!isValidCategory) {
        return res.status(400).json({ message: "Invalid category_id" });
      }
    }

    const id = uuidv4();
    const query = `
      INSERT INTO expenses (
        id,
        user_id,
        amount,
        date_paid,
        payment_method,
        description,
        category_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
      id,
      userId,
      amount,
      date_paid,
      payment_method,
      description || "",
      category_id || null,
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Failed to add expense:", error);
    res.status(500).json({ message: "Failed to add expense" });
  }
});

// Soft-delete (archive) an expense
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user;

  try {
    const { rowCount } = await pool.query(
      `
        UPDATE expenses
        SET is_archived = TRUE
        WHERE id = $1
          AND user_id = $2
          AND (is_archived = FALSE OR is_archived IS NULL)
      `,
      [id, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: "Expense not found, not authorized, or already archived." });
    }

    res.json({ message: "Expense archived successfully." });
  } catch (err) {
    console.error("Error archiving expense:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update an expense
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user;
  const {
    amount,
    date_paid,
    payment_method,
    description,
    category_id,
  } = req.body;

  try {
    if (category_id) {
      const isValidCategory = await validateCategoryExists(category_id);
      if (!isValidCategory) {
        return res.status(400).json({ message: "Invalid category_id" });
      }
    }

    let query;
    let values;

    // If category_id is omitted in the body, don't change the existing category
    if (typeof category_id === "undefined") {
      query = `
        UPDATE expenses
        SET amount = $1,
            date_paid = $2,
            payment_method = $3,
            description = $4
        WHERE id = $5 AND user_id = $6
        RETURNING *
      `;
      values = [amount, date_paid, payment_method, description, id, userId];
    } else {
      query = `
        UPDATE expenses
        SET amount = $1,
            date_paid = $2,
            payment_method = $3,
            description = $4,
            category_id = $5
        WHERE id = $6 AND user_id = $7
        RETURNING *
      `;
      values = [
        amount,
        date_paid,
        payment_method,
        description,
        category_id || null,
        id,
        userId,
      ];
    }

    const { rowCount, rows } = await pool.query(query, values);

    if (rowCount === 0) {
      return res.status(404).json({ message: "Expense not found or not authorized." });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Error updating expense:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;