// routes/reimbursements.js
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../utils/db.js";

const router = express.Router();

// Helper: recompute reimbursement summary for an expense and update the expenses table.
// Only non-deleted reimbursement rows are considered.
const recomputeExpenseReimbursementSummary = async (expenseId, userId) => {
  // Ensure the expense exists and belongs to the user
  const expenseResult = await pool.query(
    `
      SELECT id, amount
      FROM expenses
      WHERE id = $1
        AND user_id = $2
    `,
    [expenseId, userId]
  );

  if (expenseResult.rowCount === 0) {
    return null;
  }

  const expense = expenseResult.rows[0];

  // Total reimbursed so far (excluding soft-deleted rows)
  const totalResult = await pool.query(
    `
      SELECT COALESCE(SUM(amount), 0) AS total_reimbursed
      FROM expense_reimbursements
      WHERE expense_id = $1
        AND user_id = $2
        AND (is_deleted = FALSE OR is_deleted IS NULL)
    `,
    [expenseId, userId]
  );

  const totalReimbursed = Number(totalResult.rows[0].total_reimbursed) || 0;
  const expenseAmount = Number(expense.amount);

  let summaryReimbursedAt = null;
  let summaryMethod = null;
  let summaryNotes = null;

  if (totalReimbursed > 0) {
    // Use the most recent reimbursement as the summary
    const lastResult = await pool.query(
      `
        SELECT reimbursed_at, method, notes
        FROM expense_reimbursements
        WHERE expense_id = $1
          AND user_id = $2
          AND (is_deleted = FALSE OR is_deleted IS NULL)
        ORDER BY reimbursed_at DESC
        LIMIT 1
      `,
      [expenseId, userId]
    );

    if (lastResult.rowCount > 0) {
      const last = lastResult.rows[0];
      summaryReimbursedAt = last.reimbursed_at;
      summaryMethod = last.method;
      summaryNotes = last.notes;
    }
  }

  const fullyReimbursed = totalReimbursed >= expenseAmount && expenseAmount > 0;

  const expenseUpdate = await pool.query(
    `
      UPDATE expenses
      SET is_reimbursed = $3,
          reimbursed_at = $4,
          reimbursement_method = $5,
          reimbursement_notes = $6
      WHERE id = $1
        AND user_id = $2
      RETURNING *
    `,
    [
      expenseId,
      userId,
      fullyReimbursed,
      summaryReimbursedAt,
      summaryMethod,
      summaryNotes,
    ]
  );

  return {
    expense: expenseUpdate.rows[0],
    expenseAmount,
    totalReimbursed,
  };
};

// POST /api/reimbursements - create a reimbursement record (supports partial reimbursements)
router.post("/", async (req, res) => {
  const userId = req.user;
  const {
    expense_id,
    amount,
    method,
    notes,
    reimbursed_at,
  } = req.body;

  if (!expense_id || !amount) {
    return res.status(400).json({ message: "expense_id and amount are required" });
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "amount must be a positive number" });
  }

  try {
    // 1. Ensure the expense exists and belongs to the user
    const expenseResult = await pool.query(
      `
        SELECT id, amount
        FROM expenses
        WHERE id = $1
          AND user_id = $2
      `,
      [expense_id, userId]
    );

    if (expenseResult.rowCount === 0) {
      return res.status(404).json({ message: "Expense not found or not authorized." });
    }

    const expense = expenseResult.rows[0];

    // 2. Compute current reimbursed total (excluding soft-deleted rows)
    const totalResult = await pool.query(
      `
        SELECT COALESCE(SUM(amount), 0) AS total_reimbursed
        FROM expense_reimbursements
        WHERE expense_id = $1
          AND user_id = $2
          AND (is_deleted = FALSE OR is_deleted IS NULL)
      `,
      [expense_id, userId]
    );

    const currentTotal = Number(totalResult.rows[0].total_reimbursed) || 0;
    const newTotal = currentTotal + numericAmount;

    if (newTotal > Number(expense.amount)) {
      return res.status(400).json({
        message: "Reimbursement amount exceeds original expense amount",
        expenseAmount: expense.amount,
        currentTotal,
        attemptedAmount: numericAmount,
        resultingTotal: newTotal,
      });
    }

    // 3. Insert reimbursement record
    const id = uuidv4();
    const effectiveDate = reimbursed_at ? new Date(reimbursed_at) : new Date();

    const reimbursementInsert = await pool.query(
      `
        INSERT INTO expense_reimbursements (
          id,
          expense_id,
          user_id,
          amount,
          reimbursed_at,
          method,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [id, expense_id, userId, numericAmount, effectiveDate, method || null, notes || null]
    );

    const reimbursement = reimbursementInsert.rows[0];
    const summary = await recomputeExpenseReimbursementSummary(expense_id, userId);

    if (!summary) {
      // This should be extremely rare (expense deleted in between), but handle gracefully
      return res.status(201).json({ reimbursement });
    }

    const { expense: updatedExpense, expenseAmount, totalReimbursed } = summary;

    res.status(201).json({
      reimbursement,
      expense: updatedExpense,
      totals: {
        expenseAmount,
        totalReimbursed,
        remaining: expenseAmount - totalReimbursed,
        isFullyReimbursed: updatedExpense.is_reimbursed,
      },
    });
  } catch (error) {
    console.error("Failed to create reimbursement:", error);
    res.status(500).json({ message: "Failed to create reimbursement" });
  }
});

// GET /api/reimbursements/:expenseId - list reimbursements for a specific expense
router.get("/:expenseId", async (req, res) => {
  const userId = req.user;
  const { expenseId } = req.params;

  try {
    const { rows } = await pool.query(
      `
        SELECT id, amount, reimbursed_at, method, notes
        FROM expense_reimbursements
        WHERE expense_id = $1
          AND user_id = $2
          AND (is_deleted = FALSE OR is_deleted IS NULL)
        ORDER BY reimbursed_at ASC
      `,
      [expenseId, userId]
    );

    res.json(rows);
  } catch (error) {
    console.error("Failed to fetch reimbursements:", error);
    res.status(500).json({ message: "Failed to fetch reimbursements" });
  }
});

// DELETE /api/reimbursements/:id - soft-delete a specific reimbursement and recompute summary
router.delete("/:id", async (req, res) => {
  const userId = req.user;
  const { id } = req.params;

  try {
    // 1. Find the reimbursement to get its expense_id
    const reimbursementResult = await pool.query(
      `
        SELECT expense_id
        FROM expense_reimbursements
        WHERE id = $1
          AND user_id = $2
      `,
      [id, userId]
    );

    if (reimbursementResult.rowCount === 0) {
      return res.status(404).json({ message: "Reimbursement not found or not authorized." });
    }

    const { expense_id } = reimbursementResult.rows[0];

    // 2. Soft-delete the reimbursement record
    await pool.query(
      `
        UPDATE expense_reimbursements
        SET is_deleted = TRUE
        WHERE id = $1
          AND user_id = $2
          AND (is_deleted = FALSE OR is_deleted IS NULL)
      `,
      [id, userId]
    );

    // 3. Recompute summary for the expense
    const summary = await recomputeExpenseReimbursementSummary(expense_id, userId);

    res.json({
      message: "Reimbursement deleted successfully.",
      expense: summary ? summary.expense : null,
      totals: summary
        ? {
            expenseAmount: summary.expenseAmount,
            totalReimbursed: summary.totalReimbursed,
            remaining: summary.expenseAmount - summary.totalReimbursed,
            isFullyReimbursed: summary.expense.is_reimbursed,
          }
        : null,
    });
  } catch (error) {
    console.error("Failed to delete reimbursement:", error);
    res.status(500).json({ message: "Failed to delete reimbursement" });
  }
});

// GET /api/reimbursements/summary - overall reimbursement summary (optionally filtered by date range)
// Query params:
//   - from (optional): start date (YYYY-MM-DD)
//   - to   (optional): end date (YYYY-MM-DD)
router.get("/summary/overall", async (req, res) => {
  const userId = req.user;
  const { from, to } = req.query;

  try {
    // 1. Get all eligible expenses for user in date range
    const expensesResult = await pool.query(
      `
        SELECT
          e.id,
          e.amount,
          e.date_paid,
          e.category_id
        FROM expenses e
        WHERE e.user_id = $1
          AND (e.is_archived = FALSE OR e.is_archived IS NULL)
          AND ($2::date IS NULL OR e.date_paid >= $2)
          AND ($3::date IS NULL OR e.date_paid <= $3)
      `,
      [userId, from || null, to || null]
    );

    const expenses = expensesResult.rows;

    if (expenses.length === 0) {
      return res.json({
        totalEligible: 0,
        totalReimbursed: 0,
        remaining: 0,
        byCategory: [],
      });
    }

    const expenseIds = expenses.map((e) => e.id);

    // 2. Get reimbursements for those expenses
    const reimbursementsResult = await pool.query(
      `
        SELECT expense_id, SUM(amount) AS total_reimbursed
        FROM expense_reimbursements
        WHERE user_id = $1
          AND (is_deleted = FALSE OR is_deleted IS NULL)
          AND expense_id = ANY($2::uuid[])
        GROUP BY expense_id
      `,
      [userId, expenseIds]
    );

    const reimbursedByExpense = new Map();
    for (const row of reimbursementsResult.rows) {
      reimbursedByExpense.set(row.expense_id, Number(row.total_reimbursed));
    }

    // 3. Aggregate totals and by-category breakdown in JS
    let totalEligible = 0;
    let totalReimbursed = 0;
    const categoryMap = new Map(); // key: category_id (or null), value: { eligible, reimbursed }

    for (const e of expenses) {
      const amount = Number(e.amount);
      const reimbursed = reimbursedByExpense.get(e.id) || 0;
      const remaining = amount - reimbursed;

      totalEligible += amount;
      totalReimbursed += reimbursed;

      const catKey = e.category_id || null;
      if (!categoryMap.has(catKey)) {
        categoryMap.set(catKey, { eligible: 0, reimbursed: 0 });
      }
      const agg = categoryMap.get(catKey);
      agg.eligible += amount;
      agg.reimbursed += reimbursed;
    }

    const remainingTotal = totalEligible - totalReimbursed;

    // 4. Attach category names
    const categoryIds = [...categoryMap.keys()].filter((id) => id !== null);
    let categoriesById = new Map();

    if (categoryIds.length > 0) {
      const categoriesResult = await pool.query(
        `
          SELECT id, name
          FROM expense_categories
          WHERE id = ANY($1::uuid[])
        `,
        [categoryIds]
      );

      categoriesById = new Map(
        categoriesResult.rows.map((c) => [c.id, c.name])
      );
    }

    const byCategory = [];
    for (const [categoryId, agg] of categoryMap.entries()) {
      const eligible = agg.eligible;
      const reimbursed = agg.reimbursed;
      const remaining = eligible - reimbursed;

      byCategory.push({
        categoryId,
        categoryName: categoryId ? categoriesById.get(categoryId) || "Unknown" : "Uncategorized",
        totalEligible: eligible,
        totalReimbursed: reimbursed,
        remaining,
      });
    }

    res.json({
      totalEligible,
      totalReimbursed,
      remaining: remainingTotal,
      byCategory,
    });
  } catch (error) {
    console.error("Failed to fetch reimbursement summary:", error);
    res.status(500).json({ message: "Failed to fetch reimbursement summary" });
  }
});

export default router;


