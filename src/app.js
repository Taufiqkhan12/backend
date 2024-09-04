import express, { urlencoded } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
  })
);

app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "20kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// routes import

import userRoute from "./routes/user.routes.js";

// routes declaration
app.use("/api/v1/users", userRoute);

app.use((err, req, res, next) => {
  // Log the error for debugging purposes
  console.error(err.stack);

  // Send a structured JSON response
  res.status(err.statusCode || 500).json({
    success: err.success,
    statusCode: err.statusCode || 500,
    message: err.message,
    errors: err.errors || [],
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

export { app };
