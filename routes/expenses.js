// hsa-tracker-api/routes/expenses.js
import express from "express";
import { pool } from "../utils/db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Get all expenses for the logged-in user
router.get("/", async (req, res) => {
    console.log("REQ.USER IN GET /expenses:", req.user);
  try {
    const result = await pool.query(
      "SELECT * FROM expenses WHERE user_id = $1 ORDER BY date_paid DESC",
      [req.user]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch expenses:", error);
    res.status(500).json({ message: "Failed to fetch expenses" });
  }
});

// Add a new expense
router.post("/", async (req, res) => {
  const { amount, date_paid, payment_method, description, invoice_image_url } = req.body;

  if (!amount || !date_paid || !payment_method) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const id = uuidv4();
    const query = `
      INSERT INTO expenses (id, user_id, amount, date_paid, payment_method, description, invoice_image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [id, req.user, amount, date_paid, payment_method, description || '', invoice_image_url || null];

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
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.user;
    const { amount, date_paid, payment_method, description, invoice_image_url } = req.body;
  
    try {
      const { rowCount, rows } = await pool.query(
        `UPDATE expenses
         SET amount = $1,
             date_paid = $2,
             payment_method = $3,
             description = $4,
             invoice_image_url = $5
         WHERE id = $6 AND user_id = $7
         RETURNING *`,
        [amount, date_paid, payment_method, description, invoice_image_url, id, userId]
      );
  
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