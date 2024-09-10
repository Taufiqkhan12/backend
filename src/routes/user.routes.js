import { Router } from "express";
import {
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  updateAvatarImage,
  updateCoverImage,
  updatePassword,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
  upload.fields([
    { name: "avatar", maxCount: 1 },
    {
      name: "coverImage",
      maxCount: 1,
    },
  ]),
  registerUser
);

router.route("/login").post(loginUser);

// Secured Routes

router.route("/logout").post(verifyJwt, logoutUser);
router.route("/refresh-token").post(verifyJwt, refreshAccessToken);
router.route("/update-password").post(verifyJwt, updatePassword);
router
  .route("/update-avatar")
  .patch(verifyJwt, upload.single("avatar"), updateAvatarImage);
router
  .route("/update-coverimage")
  .patch(verifyJwt, upload.single("coverImage"), updateCoverImage);

export default router;
