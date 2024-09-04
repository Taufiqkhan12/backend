import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiErrors.js";
import { User } from "../models/user.model.js";
import {
  uploadOnCloudinary,
  deleteImageFromCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import fs from "fs";
import { url } from "inspector";

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating referesh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  //check wheter all fields is filled or not
  // check if user is already exists or not if already present throw error
  // check for images, check for avatar
  // upload them to cloudinary, avatar
  // create user object - create entry in db
  // remove password and refresh token field from response
  // check for user creation
  // return res

  const { fullname, username, email, password } = req.body;

  if (
    [fullname, username, email, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All field are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  // // if (existedUser) {
  // // }

  // const avatarLocalPath = req.files?.avatar[0]?.path;
  // // console.log(avatarLocalPath);
  // // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  // let coverImageLocalPath;
  // if (
  //   req.files &&
  //   Array.isArray(req.files.coverImage) &&
  //   req.files.coverImage.length > 0
  // ) {
  //   coverImageLocalPath = req.files.coverImage[0].path;
  // }

  let avatarLocalPath, coverImageLocalPath;

  if (
    req.files?.avatar &&
    Array.isArray(req.files.avatar) &&
    req.files.avatar.length > 0
  ) {
    avatarLocalPath = req.files.avatar[0].path;
  }

  if (
    req.files?.coverImage &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (existedUser) {
    // Check if avatar file exists on the server and delete it
    if (avatarLocalPath && fs.existsSync(avatarLocalPath)) {
      fs.unlinkSync(avatarLocalPath);
    }

    // Check if cover image file exists on the server and delete it
    if (coverImageLocalPath && fs.existsSync(coverImageLocalPath)) {
      fs.unlinkSync(coverImageLocalPath);
    }

    throw new ApiError(409, "User with email or username already exists");
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  const user = await User.create({
    fullname,
    avatar: { url: avatar.url, publicId: avatar.public_id },
    coverImage: {
      url: coverImage?.url || "",
      publicId: coverImage?.public_id || "",
    },
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User Created Successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // get user login details
  // check if field is empty
  // check if user exist or not
  // if not exists throw error
  // if user exists match the password
  // while logging in generate a access token
  // also generate the refresh token
  // send cookie
  // redirect to mainpage

  const { username, email, password } = req.body;

  if (!email && !username) {
    throw new ApiError(400, "username or email is required");
  }

  const userExist = await User.findOne({
    $or: [{ username, email }],
  });

  if (!userExist) {
    throw new ApiError(
      404,
      "User with this email or username does not exist's"
    );
  }

  const isPasswordValid = await userExist.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    userExist._id
  );

  const loggedInUser = await User.findById(userExist._id).select(
    "-password -refreshToekn"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User Logged in Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: { refreshToken: 1 },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out Successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { newRefreshToken, accessToken } =
      await generateAccessAndRefreshToken(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            newRefreshToken,
          },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const updatePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = User.findById(req.user?._id);

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid Password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password Updated Successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const currentUser = req.user;
  if (!currentUser) {
    throw new ApiError(502, "Failed to get user");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, currentUser, "Current user fetched Successfully")
    );
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullname, email } = req.body;

  if (!fullname || !email) {
    throw new ApiError(400, "All fields must be filled");
  }

  const user = User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: { fullname, email },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User details updated sucessfully"));
});

const updateAvatarImage = asyncHandler(async (req, res) => {
  try {
    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
      throw new ApiError(400, "Avatar file is missing");
    }

    const updatedAvatar = await uploadOnCloudinary(avatarLocalPath);

    if (!updatedAvatar.url && !updatedAvatar.public_id) {
      throw new ApiError(500, "Error while updating file");
    }

    const user = await User.findById(req.user?._id).select("-password ");

    const deletedOldFile = await deleteImageFromCloudinary(
      user.avatar.publicId
    );

    if (!deletedOldFile) {
      throw new ApiError(500, "Error while updating file");
    }

    user.avatar = {
      url: updatedAvatar.url,
      publicId: updatedAvatar.public_id,
    };

    await user.save();

    return res
      .status(200)
      .json(new ApiResponse(200, user, "Avatar updated sucessfully"));
  } catch (error) {
    throw new ApiError(500, "Error:", error);
  }
});

const updateCoverImage = asyncHandler(async (req, res) => {
  try {
    const coverImageLocalPath = req.file?.path;

    if (!coverImageLocalPath) {
      throw new ApiError(400, "CoverImage file is missing");
    }

    const updatedCoverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!updatedCoverImage.url || !updatedCoverImage.public_id) {
      throw new ApiError(500, "Error while updating file");
    }

    const user = await User.findById(req.user?._id).select("-password");

    const deletedOldFile = await deleteImageFromCloudinary(
      user.coverImage?.publicId
    );

    if (!deletedOldFile) {
      throw new ApiError(500, "Error while deleting old cover image file");
    }

    user.coverImage = {
      url: updatedCoverImage.url,
      publicId: updatedCoverImage.public_id,
    };

    await user.save();

    return res
      .status(200)
      .json(new ApiResponse(200, user, "CoverImage updated sucessfully"));
  } catch (error) {
    throw new ApiError(500, "Error:", error.message);
  }
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  updatePassword,
  getCurrentUser,
  updateAccountDetails,
  updateAvatarImage,
  updateCoverImage,
};
