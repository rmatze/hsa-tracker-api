// hsa-tracker-api/middleware/auth.js
import { firebaseAdmin } from "../utils/firebase.js";

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  console.log("🔐 Incoming auth header:", req.headers.authorization);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid authorization header." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
    req.user = decodedToken.uid;
    next();
  } catch (error) {
    console.error("Firebase auth error:", error);
    res.status(401).json({ message: "Unauthorized: Invalid token." });
  }
};

export default authMiddleware;
