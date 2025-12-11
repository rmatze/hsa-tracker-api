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
router.get("/", async (req, res) => {
  const userId = req.user;
  const { categoryId } = req.query;

  try {
    const result = await pool.query(
      `
        SELECT
          e.*,
          c.name AS category_name
        FROM expenses e
        LEFT JOIN expense_categories c
          ON e.category_id = c.id
        WHERE e.user_id = $1
          AND ($2::uuid IS NULL OR e.category_id = $2)
        ORDER BY e.date_paid DESC
      `,
      [userId, categoryId || null]
    );

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
    invoice_image_url,
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
        invoice_image_url,
        category_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const values = [
      id,
      userId,
      amount,
      date_paid,
      payment_method,
      description || "",
      invoice_image_url || null,
      category_id || null,
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Failed to add expense:", error);
    res.status(500).json({ message: "Failed to add expense" });
  }
});

// Delete an expense
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.user; // or req.user.uid if that's how it's defined
  
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM expenses WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
  
      if (rowCount === 0) {
        return res.status(404).json({ message: "Expense not found or not authorized." });
      }
  
      res.json({ message: "Expense deleted successfully." });
    } catch (err) {
      console.error("Error deleting expense:", err);
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
    invoice_image_url,
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
            description = $4,
            invoice_image_url = $5
        WHERE id = $6 AND user_id = $7
        RETURNING *
      `;
      values = [amount, date_paid, payment_method, description, invoice_image_url, id, userId];
    } else {
      query = `
        UPDATE expenses
        SET amount = $1,
            date_paid = $2,
            payment_method = $3,
            description = $4,
            invoice_image_url = $5,
            category_id = $6
        WHERE id = $7 AND user_id = $8
        RETURNING *
      `;
      values = [
        amount,
        date_paid,
        payment_method,
        description,
        invoice_image_url,
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